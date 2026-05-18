#!/usr/bin/env node
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const LOG = '/tmp/startup-debug.log';
const distBoot = join(dirname(fileURLToPath(import.meta.url)), 'dist', 'boot.js');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { writeFileSync(LOG, line + '\n', { append: true }); } catch {}
}

async function main() {
  mkdirSync('/tmp', { recursive: true });
  try { writeFileSync(LOG, ''); } catch {}
  log('start: node=' + process.version);

  // Check file exists
  const bootExists = existsSync(distBoot);
  log('dist/boot.js exists: ' + bootExists);
  if (!bootExists) {
    try {
      const d = readdirSync(dirname(distBoot));
      log('dist contents: ' + JSON.stringify(d));
    } catch(e) { log('dist readdir error: ' + e.message); }
    process.exit(1);
  }

  // Check file size
  let size = 0;
  try {
    const buf = readFileSync(distBoot);
    size = buf.length;
    log('dist/boot.js size: ' + size + ' bytes');
    log('contains __dirname: ' + buf.includes('__dirname'));
    log('contains serve(): ' + buf.includes('serve('));
  } catch(e) {
    log('dist read error: ' + e.message);
  }

  // Load — wrap the entire import in process.on('uncaughtException')
  process.on('uncaughtException', (err) => {
    log('fatal uncaught: ' + (err && err.stack || err).substring(0, 500));
    writeFileSync('/tmp/startup-crash.log', (err && err.stack || String(err)).substring(0, 500));
    process.exit(1);
  });
  process.on('unhandledRejection', (r) => {
    log('fatal rejection: ' + (r && r.stack || String(r)).substring(0, 500));
    writeFileSync('/tmp/startup-crash.log', (r && r.stack || String(r)).substring(0, 500));
    process.exit(1);
  });

  log('importing boot.js...');
  try {
    // Force NODE_ENV=production to hit the isProduction branch
    await import('file://' + distBoot);
    log('import succeeded');
    writeFileSync('/tmp/startup-ok.log', 'import_ok');
  } catch(err) {
    log('import FAILED: ' + (err.stack || String(err)).substring(0, 500));
    writeFileSync('/tmp/startup-crash.log', (err.stack || String(err)).substring(0, 1000));
    process.exit(1);
  }
}
main();
