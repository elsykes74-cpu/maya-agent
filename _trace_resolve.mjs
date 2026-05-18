
import { build } from 'esbuild';
import fs from 'fs';

(async () => {
  try {
    const res = await build({
      entryPoints: ['_resolve_mod.mjs'],
      bundle: true,
      format: 'esm',
      outfile: '/dev/null',
      write: false,
      platform: 'node',
      logLevel: 'info',
    });
    console.log(JSON.stringify(res, null, 2));
  } catch(e) {
    console.error(e.message);
  }
})();
