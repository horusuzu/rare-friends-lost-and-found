import { parseAbi } from 'viem';
import { GENESIS_CONTRACT } from './identity.js';
import { decodeGenerationSprites, type GenerationSpriteClient, type GenerationSprites } from './generation-sprites.js';
const ABI = parseAbi(['function tokenURI(uint256) view returns (string)']);
/** Decode only the official numeric pixel metadata; never insert token SVG/HTML. */
export function decodeGenesisArtwork(tokenId: bigint, uri: string): GenerationSprites {
  const prefix = 'data:application/json;base64,';
  if (!uri.startsWith(prefix) || uri.length > 100_000) throw new Error('Unsupported Genesis metadata.');
  const { properties } = JSON.parse(atob(uri.slice(prefix.length)));
  if (!properties || properties.bit_order !== 'bit(y*8+x)=white' || properties.border_pixels !== 1 ||
      typeof properties.pixels !== 'string' || !/^0x[0-9a-fA-F]{16}$/.test(properties.pixels)) throw new Error('Unsupported Genesis pixels.');
  const pixels = BigInt(properties.pixels);
  let bitmap = 0n;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (!(pixels & (1n << BigInt(Math.floor(y / 2) * 8 + Math.floor(x / 2))))) bitmap |= 1n << BigInt(y * 16 + x);
  }
  return { ...decodeGenerationSprites(tokenId, 0, 0, Array<bigint>(64).fill(bitmap)),
    collection: 'genesis', familyName: 'Genesis', cacheKey: `4663:${GENESIS_CONTRACT.toLowerCase()}:${tokenId}` };
}
export async function readGenesisArtwork(client: GenerationSpriteClient, tokenId: bigint) {
  if (tokenId < 1n || tokenId >= 1n << 256n) throw new RangeError('Invalid Genesis ID.');
  if (await client.getChainId() !== 4663) throw new Error('Genesis artwork requires chain 4663.');
  return decodeGenesisArtwork(tokenId, await client.readContract({ address: GENESIS_CONTRACT, abi: ABI, functionName: 'tokenURI', args: [tokenId] }));
}
