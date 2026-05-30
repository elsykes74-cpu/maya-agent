// Vercel serverless entry — uses the pre-built esbuild bundle so Vercel's
// own TypeScript compiler never needs to resolve @db/* path aliases.
import app from '../dist/boot.js'
export default app.fetch
