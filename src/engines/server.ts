/* The composition root of the engines in a server (the connector, cloud/mcp: its pack checks run synchronously, so every engine is in
   hand from the start — nothing is fetched there). One IIFE script that puts the library on globalThis.NoemaCore.engines, where
   engine/packcheck.js and the connector read it (tools/esbuild_engines.mjs buildServer). */
import { nodeEngines } from './node.ts';

const g = globalThis as { NoemaCore?: object };
g.NoemaCore = Object.assign(g.NoemaCore ?? {}, { engines: nodeEngines() });
