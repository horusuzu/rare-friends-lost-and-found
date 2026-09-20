import { isAddress, parseAbi, zeroAddress, type Address } from 'viem';
import { readGenerationEligibility, type GenerationIdentityClient } from './identity.js';
import { GENERATION_SPRITE_MANIFEST } from './generation-sprites.js';
import type { FriendRewardsSnapshot } from './game.js';

// Official deployment/ABI: https://rarefriends.com/api/protocol/config
// Cross-checked https://rarefriends.com/docs/contracts on 2026-09-21.
export const REWARDS_DEPLOYMENT = Object.freeze({
 manager:'0xD4A35e11318E3679168d409184B788bcF9F283Ac' as Address,
 rf:'0x0779369854d3EcdEA927206718FFD7730C67B71f' as Address,
 weth:'0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73' as Address,
});
const NFT_ABI = parseAbi(['function tokenBoundAccount(uint256) view returns (address)','function activationManager() view returns (address)']);
const MANAGER_ABI = parseAbi(['function positions(address,uint256) view returns (uint8 tier,uint256 weight)','function retired() view returns (bool)','function earned(address,address,uint256) view returns (uint256)','function rf() view returns (address)','function weth() view returns (address)']);
const TOKEN_ABI = parseAbi(['function balanceOf(address) view returns (uint256)']);
const same = (a:string,b:string) => a.toLowerCase()===b.toLowerCase();
/** Trusted host only. A save, image, or simulated balance never supplies these amounts. */
export async function readFriendRewards(client:GenerationIdentityClient, options:{friendId:bigint;account:Address;walletAddress:Address}):Promise<FriendRewardsSnapshot> {
 const identity=await readGenerationEligibility(client,options.friendId,options.account);
 if(!identity.eligible)throw new Error('The selected Friend is no longer eligible.');
 const blockNumber=identity.blockNumber,collection=GENERATION_SPRITE_MANIFEST.generations;
 const [wallet,manager]=await Promise.all([
  client.readContract({address:collection,abi:NFT_ABI,functionName:'tokenBoundAccount',args:[options.friendId],blockNumber}),
  client.readContract({address:collection,abi:NFT_ABI,functionName:'activationManager',blockNumber}),
 ]);
 if(!isAddress(wallet)||same(wallet,zeroAddress)||!same(wallet,options.walletAddress)||!same(manager,REWARDS_DEPLOYMENT.manager))throw new Error('Reward deployment or canonical wallet changed.');
 const {rf,weth}=REWARDS_DEPLOYMENT;
 const [position,retired,managerRF,managerWETH,claimableRF,claimableWETH,walletRF,walletWETH]=await Promise.all([
  client.readContract({address:manager,abi:MANAGER_ABI,functionName:'positions',args:[collection,options.friendId],blockNumber}),
  client.readContract({address:manager,abi:MANAGER_ABI,functionName:'retired',blockNumber}),
  client.readContract({address:manager,abi:MANAGER_ABI,functionName:'rf',blockNumber}),
  client.readContract({address:manager,abi:MANAGER_ABI,functionName:'weth',blockNumber}),
  client.readContract({address:manager,abi:MANAGER_ABI,functionName:'earned',args:[rf,collection,options.friendId],blockNumber}),
  client.readContract({address:manager,abi:MANAGER_ABI,functionName:'earned',args:[weth,collection,options.friendId],blockNumber}),
  client.readContract({address:rf,abi:TOKEN_ABI,functionName:'balanceOf',args:[wallet],blockNumber}),
  client.readContract({address:weth,abi:TOKEN_ABI,functionName:'balanceOf',args:[wallet],blockNumber}),
 ]);
 if(retired||!same(managerRF,rf)||!same(managerWETH,weth))throw new Error('Reward deployment changed.');
 return {friendId:options.friendId,walletAddress:wallet,blockNumber,checkedAt:Date.now(),active:position[1]>0n,claimableRF,claimableWETH,walletRF,walletWETH};
}
