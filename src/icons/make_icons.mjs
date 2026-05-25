// Renders icon.svg at each required size using a headless browser (Playwright),
// producing pixel-perfect PNGs that match what Chrome actually displays.
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const dir = dirname(fileURLToPath(import.meta.url));
const svgPath = resolve(dir, 'icon.svg');
const svgContent = readFileSync(svgPath, 'utf8');

const SIZES = [128, 48, 16];

const browser = await chromium.launch();
const page = await browser.newPage();

for (const size of SIZES) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<!DOCTYPE html>
<html><head><style>
  * { margin: 0; padding: 0; }
  body { width: ${size}px; height: ${size}px; overflow: hidden; background: transparent; }
  img { width: ${size}px; height: ${size}px; display: block; }
</style></head>
<body><img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgContent)}"></body>
</html>`);

  const out = resolve(dir, `icon${size}.png`);
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: size, height: size }, omitBackground: true });
  console.log(`icon${size}.png`);
}

await browser.close();
