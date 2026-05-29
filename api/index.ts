// Thin Vercel entry point.
//
// @vercel/node re-bundles api/boot.ts from source and fails to resolve the
// TypeScript path aliases (@db/schema, @db/relations, etc.), producing
// ERR_MODULE_NOT_FOUND on every request.
//
// This shim instead imports the pre-built esbuild bundle (dist/boot.js) where
// all aliases are already resolved, and re-exports the Hono app so Vercel can
// call app.fetch(request) for each incoming request.
//
// vercel.json points /api/* here via "functions": { "api/index.ts": { "includeFiles": "dist/**" } }
// and the dist/** files are included in the Lambda package via includeFiles.

// @ts-ignore — dist/boot.js is esbuild output, not a TS source file
import app from "./boot.js";

export default app;
