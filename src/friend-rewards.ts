import { isAddress, parseAbi, zeroAddress, type Address } from 'viem';
import { readGenerationEligibility, readGenesisEligibility, type GenerationIdentityClient } from './identity.js';
import { GENERATION_SPRITE_MANIFEST } from './generation-sprites.js';
import type { FriendRewardsSnapshot, NFTRewardAmounts } from './game.js';

// Official deployment/ABI: https://rarefriends.com/api/protocol/config
// Cross-checked https://rarefriends.com/docs/contracts on 2026-09-21.
export const REWARDS_DEPLOYMENT = Object.freeze({
 genesis:'0x116EaA62241751E0c98dA43d458600c6C17cD361' as Address,
 manager:'0xD4A35e11318E3679168d409184B788bcF9F283Ac' as Address,
 rf:'0x0779369854d3EcdEA927206718FFD7730C67B71f' as Address,
 weth:'0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73' as Address,
});
const NFT_ABI = parseAbi(['function ownerOf(uint256) view returns (address)','function tokenBoundAccount(uint256) view returns (address)','function activationManager() view returns (address)']);
const MANAGER_ABI = parseAbi(['function positions(address,uint256) view returns (uint8 tier,uint256 weight)','function retired() view returns (bool)','function earned(address,address,uint256) view returns (uint256)','function rf() view returns (address)','function weth() view returns (address)']);
const TOKEN_ABI = parseAbi(['function balanceOf(address) view returns (uint256)']);
const same = (a:string,b:string) => a.toLowerCase()===b.toLowerCase();
/** Trusted host only. A save, image, or simulated balance never supplies these amounts. */
export async function readFriendRewards(client:GenerationIdentityClient, options:{friendId:bigint;account:Address;walletAddress:Address;genesisId?:bigint;collection?:'genesis'|'generations'}):Promise<FriendRewardsSnapshot> {
 const isGenesis=options.collection==='genesis';
 const identity=await (isGenesis?readGenesisEligibility:readGenerationEligibility)(client,options.friendId,options.account);
 if(!identity.eligible)throw new Error('The selected Friend is no longer eligible.');
 const blockNumber=identity.blockNumber;
 const own = await readAmounts(client, isGenesis?REWARDS_DEPLOYMENT.genesis:GENERATION_SPRITE_MANIFEST.generations, options.friendId, blockNumber, options.walletAddress);
 let genesis: FriendRewardsSnapshot['genesis'];
 if(!isGenesis && options.genesisId !== undefined) {
  if(options.genesisId<1n || options.genesisId >= 1n<<256n)throw new Error('Invalid Genesis ID.');
  const owner=await client.readContract({address:REWARDS_DEPLOYMENT.genesis,abi:NFT_ABI,functionName:'ownerOf',args:[options.genesisId],blockNumber});
  if(same(owner,options.account)) genesis={...await readAmounts(client,REWARDS_DEPLOYMENT.genesis,options.genesisId,blockNumber),tokenId:options.genesisId};
 }
 return {...own,friendId:options.friendId,...(isGenesis?{collection:"genesis" as const}:{}),...(genesis?{genesis}: {})};
}
async function readAmounts(client:GenerationIdentityClient,collection:Address,tokenId:bigint,blockNumber:bigint,expectedWallet?:Address):Promise<NFTRewardAmounts> {
 const [wallet,manager]=await Promise.all([
  client.readContract({address:collection,abi:NFT_ABI,functionName:'tokenBoundAccount',args:[tokenId],blockNumber}),
  client.readContract({address:collection,abi:NFT_ABI,functionName:'activationManager',blockNumber}),
 ]);
 if(!isAddress(wallet)||same(wallet,zeroAddress)||(expectedWallet!==undefined&&!same(wallet,expectedWallet))||!same(manager,REWARDS_DEPLOYMENT.manager))throw new Error('Reward deployment or canonical wallet changed.');
 const {rf,weth}=REWARDS_DEPLOYMENT;
 const [position,retired,managerRF,managerWETH,claimableRF,claimableWETH,walletRF,walletWETH]=await Promise.all([
  client.readContract({address:manager,abi:MANAGER_ABI,functionName:'positions',args:[collection,tokenId],blockNumber}),
  client.readContract({address:manager,abi:MANAGER_ABI,functionName:'retired',blockNumber}),
  client.readContract({address:manager,abi:MANAGER_ABI,functionName:'rf',blockNumber}),
  client.readContract({address:manager,abi:MANAGER_ABI,functionName:'weth',blockNumber}),
  client.readContract({address:manager,abi:MANAGER_ABI,functionName:'earned',args:[rf,collection,tokenId],blockNumber}),
  client.readContract({address:manager,abi:MANAGER_ABI,functionName:'earned',args:[weth,collection,tokenId],blockNumber}),
  client.readContract({address:rf,abi:TOKEN_ABI,functionName:'balanceOf',args:[wallet],blockNumber}),
  client.readContract({address:weth,abi:TOKEN_ABI,functionName:'balanceOf',args:[wallet],blockNumber}),
 ]);
 if(retired||!same(managerRF,rf)||!same(managerWETH,weth))throw new Error('Reward deployment changed.');
 return {walletAddress:wallet,blockNumber,checkedAt:Date.now(),active:position[1]>0n,claimableRF,claimableWETH,walletRF,walletWETH};
}
