import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
test('home-screen app has scoped standalone metadata and no wallet data caching',async()=>{
 const manifest=JSON.parse(await readFile(new URL('./pwa/manifest.webmanifest',import.meta.url),'utf8'));
 assert.equal(manifest.display,'standalone');assert.equal(manifest.start_url,'./');assert.equal(manifest.scope,'./');assert.ok(manifest.icons.some(i=>i.sizes==='512x512'));
 const sw=await readFile(new URL('./pwa/sw.js',import.meta.url),'utf8');assert.match(sw,/url.origin !== self.location.origin/);assert.match(sw,/request.method !== 'GET'/);
});
