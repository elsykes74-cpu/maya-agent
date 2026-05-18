
import { importAssertions } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';

try {
  const mod = await import('@contracts/constants');
  console.log('OK', Object.keys(mod));
} catch(e) {
  console.error('ERR', e.message);
}
