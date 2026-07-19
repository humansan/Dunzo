// Vercel Function entry. This file is committed so Vercel detects the function
// (detection reads the source tree, not build output). It re-exports the Express
// app from a PRE-BUNDLED single file that `npm run build:api` (esbuild) emits at
// build time. The bundle is imported with an explicit .js extension so Node's
// ESM loader resolves it under "type": "module" - importing the multi-file
// `server/` tree directly fails at runtime with ERR_MODULE_NOT_FOUND because
// extensionless relative ESM imports aren't resolvable on Vercel.
// @ts-ignore - server/app.bundle.js is generated at build time, absent in source.
export { default } from '../server/app.bundle.js';
