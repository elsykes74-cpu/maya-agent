Step-by-step, do the following:

1. Read `package.json`. In the `"scripts"` object:
   - Change `"build"` from:
     `"vite build && esbuild api/boot.ts --platform=node --bundle --format=esm --outdir=dist --banner:js=\"import { createRequire } from 'module';const require = createRequire(import.meta.url);\""`
     to:
     `"vite build && esbuild api/boot.ts --platform=node --bundle --format=esm --outdir=api --banner:js=\"import { createRequire } from 'module';const require = createRequire(import.meta.url);\""`
   - Change `"start"` from `"node dist/boot.js"` to `"node api/boot.js"`.
   Save the file.

2. Read `api/index.ts`. Replace the import line:
   - From: `import app from "../dist/boot.js";`
   - To:   `import app from "./boot.js";`
   Save the file.

3. Read `vercel.json`. Remove the entire `"functions"` block (the one with `"includeFiles": "dist/**"`). Keep the other keys (`version`, `buildCommand`, `outputDirectory`, `rewrites`). Ensure the `rewrites` array remains unchanged. Save the file.

4. Run: `git add -A`

5. Commit: `git commit -m "fix: correct Vercel function import and build output for ESM"`

6. Check current branch: `git branch --show-current`. Then push: `git push origin <current_branch>` (replace `<current_branch>` with the actual branch name you just got).

7. Print a summary of the changes and the files modified. Also indicate the branch pushed to.

Do not ask any questions; just execute these steps and report the output of each command, especially the push result.
