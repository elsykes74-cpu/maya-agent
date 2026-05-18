#!/usr/bin/env node
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname2 = dirname(fileURLToPath(import.meta.url));
const bootFile = resolve(__dirname2, 'dist', 'boot.js');

async function main() {
  console.log('[startup] node version:', process.version);
  console.log('[startup] cwd:', process.cwd());
  console.log('[startup] boot file:', bootFile);

  const exists = existsSync(bootFile);
  console.log('[startup] dist/boot.js exists:', exists);
  if (!exists) {
    try { console.log('[startup] dist contents:', readdirSync(dirname(bootFile))); }
    catch (e) { console.log('[startup] dist dir error:', e.message); }
    console.error('[startup] FATAL: dist/boot.js not found');
    process.exit(1);
  }

  // ESM check — exception at parse time won't be caught, so this proves dist is loadable
  try {
    const { default: app } = await import(`file://${bootFile}`);
    console.log('[startup] boot import OK — app type:', typeof app);
  } catch (err) {
    console.error('[startup] IMPORT FAILED:', err);
    process.exit(1);
  }
}

main();
