#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const bootFile = path.resolve(__dirname, 'dist', 'boot.js');

async function main() {
  console.log('[startup] node version:', process.version);
  console.log('[startup] cwd:', process.cwd());
  console.log('[startup] boot file:', bootFile);

  try {
    const exists = fs.existsSync(bootFile);
    console.log('[startup] dist/boot.js exists:', exists);
    if (!exists) {
      try {
        const files = fs.readdirSync(path.dirname(bootFile));
        console.log('[startup] dist contents:', files);
      } catch (e) {
        console.log('[startup] dist dir not readable:', e.message);
      }
      console.error('[startup] FATAL: dist/boot.js not found');
      process.exit(1);
    }

    // Load the ESM boot.ts as a validation step (it will boot the server)
    console.log('[startup] importing dist/boot.js...');
    const { default: app } = await import(`file://${bootFile}`);
    console.log('[startup] boot import succeeded - app:', typeof app);
  } catch (err) {
    console.error('[startup] FATAL:', err);
    process.exit(1);
  }
}

main();
