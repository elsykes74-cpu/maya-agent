#!/usr/bin/env node
// [startup] Phase 1 — verify PROJECT FILES, not boot.js
import { readdirSync, existsSync, readFileSync, realpathSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname2 = dirname(fileURLToPath(import.meta.url));
const projectRoot = __dirname2;
const bootFile = resolve(__dirname2, 'dist', 'boot.js');

async function main() {
  try {
    // Phase 1: Check project files only
    for (const [label, rel] of [
      ['package.json', 'package.json'],
      ['Dockerfile', 'Dockerfile'],
      ['dist/boot.js', 'dist/boot.js'],
    ]) {
      const p = resolve(projectRoot, rel);
      const ok = existsSync(p);
      console.log(`[files] ${label} exists: ${ok}`);
      if (ok && rel !== 'dist/boot.js') {
        try {
          const stats = readdirSync(dirname(p));
          console.log(`[files]   ${label} size: ${stats.length} entries`);
        } catch {}
      }
      if (ok && rel === 'dist/boot.js') {
        try {
          const st = readFileSync(p);
          const sz = st.length;
          console.log(`[files]   dist/boot.js size: ${sz} bytes`);
          // Check for Promise.resolve().then() or \"use strict\"
          const txt = st.toString('utf8');
          console.log(`[files]   contains __dirname: ${txt.includes('__dirname')}`);
          console.log(`[files]   contains serve: ${txt.includes('serve(')}`);
        } catch(e) {
          console.log(`[files]   dist/boot.js read error: ${e.message}`);
        }
      }
    }
  } catch(e) {
    console.error('[startup] files check failed:', e.message);
  }
}

main();
