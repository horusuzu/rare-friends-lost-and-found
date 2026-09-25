/**
 * Test-only fixture for the host's read-only reward reader (never imported by the game). It answers the reward RPC
 * reads (activation manager, position, claimable RF / WETH, wallet balances) with a claimable RF that grows with the
 * wall clock, so successive readRewards snapshots rise like the real chain. Other reads fall through to the SDK fixture.
 */
import { decodeFunctionData, encodeFunctionResult, parseAbi } from 'viem';
import { REWARDS_DEPLOYMENT as D } from '../../dist/friend-rewards.js';

export const RF = 10n ** 18n;
const RPC = 'https://rpc.mainnet.chain.robinhood.com/**';
const abi = parseAbi([
  'function ownerOf(uint256) view returns (address)', 'function activationManager() view returns (address)', 'function tokenBoundAccount(uint256) view returns (address)',
  'function positions(address,uint256) view returns (uint8,uint256)', 'function retired() view returns (bool)', 'function rf() view returns (address)',
  'function weth() view returns (address)', 'function earned(address,address,uint256) view returns (uint256)', 'function balanceOf(address) view returns (uint256)',
]);
const REWARD_READS = new Set(['activationManager', 'positions', 'retired', 'rf', 'weth', 'earned']);
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

/**
 * Route reward reads. `state` is live: set `inactive` (not activated: position weight 0) or `failed` (RPC errors) at any
 * time, or change `base` / `perSecond`. Claimable RF = base + perSecond × seconds since the route was installed.
 */
export async function routeRewards(page, { owner, friendWallet = '0x3333333333333333333333333333333333333333', genesisWallet = '0x4444444444444444444444444444444444444444',
  base = 38n * RF + RF / 2n, perSecond = RF / 2n } = {}) {
  const t0 = Date.now();
  const state = { base, perSecond, weth: 187n * 10n ** 14n, inactive: false, failed: false, reads: 0 };
  const earned = () => state.base + state.perSecond * BigInt(Date.now() - t0) / 1000n;
  await page.route(RPC, async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    const raw = route.request().postDataJSON(), requests = Array.isArray(raw) ? raw : [raw];
    let decoded;
    try { decoded = requests.map(r => { if (r.method !== 'eth_call') throw new Error('not a call'); return decodeFunctionData({ abi, data: r.params[0].data }); }); }
    catch { return route.fallback(); }
    const token = r => same(r.params[0].to, D.rf) || same(r.params[0].to, D.weth);
    if (!decoded.some((d, i) => REWARD_READS.has(d.functionName) || (d.functionName === 'balanceOf' && token(requests[i])))) return route.fallback();
    if (decoded.some(d => d.functionName === 'earned')) state.reads++;
    const answer = (r, { functionName: f, args }) => {
      if (state.failed) return { jsonrpc: '2.0', id: r.id, error: { code: -32000, message: 'Fixture unavailable' } };
      const genesis = same(r.params[0].to, D.genesis);
      const values = {
        ownerOf: owner, activationManager: D.manager, tokenBoundAccount: genesis ? genesisWallet : friendWallet,
        positions: [0, state.inactive ? 0n : 100n], retired: false, rf: D.rf, weth: D.weth,
        earned: same(args?.[0], D.rf) ? (state.inactive ? 0n : earned()) : (state.inactive ? 0n : state.weth),
        balanceOf: same(r.params[0].to, D.rf) ? 2n * RF : 2n * 10n ** 15n,
      };
      return { jsonrpc: '2.0', id: r.id, result: encodeFunctionResult({ abi, functionName: f, result: values[f] }) };
    };
    const response = requests.map((r, i) => answer(r, decoded[i]));
    await route.fulfill({ json: Array.isArray(raw) ? response : response[0], headers: { 'access-control-allow-origin': '*' } });
  });
  return state;
}
