/** Standalone FriendSDK entry: public artwork reads require no wallet. */
import { createPublicClient, http } from "viem";
import { createGenerationSpriteReader, GENERATION_SPRITE_MANIFEST } from "./generation-sprites.js";

export * from "./generation-sprites.js";
export * from "./genesis-art.js";
import { readGenesisArtwork } from "./genesis-art.js";

export function createFriendReader() {
  return createGenerationSpriteReader(createPublicClient({
    transport: http(GENERATION_SPRITE_MANIFEST.rpcUrl, {
      batch: { wait: 50, batchSize: 50 }, retryCount: 3, retryDelay: 1_000, timeout: 12_000,
    }),
  }));
}

export function createGenesisReader() {
  const client = createPublicClient({transport: http(GENERATION_SPRITE_MANIFEST.rpcUrl, {batch: {wait: 50}, retryCount: 3, timeout: 12_000})});
  return {read: (id: bigint) => readGenesisArtwork(client, id)};
}
