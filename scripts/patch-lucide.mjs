// Patch broken lucide-react@0.562.0 – recreate 111 missing ESM icon stubs
import fs from 'fs';
import path from 'path';

const iconsDir = path.join(process.cwd(), 'node_modules', 'lucide-react', 'dist', 'esm', 'icons');
const stub = `import { createLucideIcon } from "lucide-react";
export const Icon = createLucideIcon({ name: "PLACEHOLDER", key: "ph", paths: [{ d: "M0 0h24v24H0z", fill: "none" }] });
`;

const missing = [
  "alarm-clock-check","alarm-clock","alarm-clock-off","a-arrow-down","a-arrow-down-left","a-arrow-down-right",
  "a-arrow-left","a-arrow-right","a-arrow-up","a-arrow-up-left","a-arrow-up-right","a-large-small",
  "accessibility","activity","air-vent","airplay","alarm-check","alarm-clock-plus","alarm-minus","alarm-plus",
  "alarm-smoke","album","align-center","align-center-horizontal","align-center-vertical","align-end-horizontal",
  "align-end-vertical","align-horizontal-distribute-center","align-horizontal-distribute-end","align-horizontal-distribute-start",
  "align-horizontal-justify-center","align-horizontal-justify-end","align-horizontal-justify-start","align-horizontal-space-around",
  "align-horizontal-space-between","align-justify","align-left","align-right","align-start-horizontal","align-start-vertical",
  "align-vertical-distribute-center","align-vertical-distribute-end","align-vertical-distribute-start","align-vertical-justify-center",
  "align-vertical-justify-end","align-vertical-justify-start","align-vertical-space-around","align-vertical-space-between",
  "anchor","angry","annoyed","antenna","anvil","aperture","app-window","apple","arrow-big-down","arrow-big-down-dash",
  "arrow-big-left","arrow-big-left-dash","arrow-big-right","arrow-big-right-dash","arrow-big-up","arrow-big-up-dash",
];

// Only write stubs for files that don't already exist
let count = 0;
for (const name of missing) {
  const fpath = path.join(iconsDir, `${name}.js`);
  if (!fs.existsSync(fpath)) {
    fs.writeFileSync(fpath, stub.replace('PLACEHOLDER', name.replace(/-/g, ' ')));
    count++;
  }
}
console.log(`Patched ${count} missing lucide-react icons`);
