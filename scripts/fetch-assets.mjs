// Baixa as imagens listadas em src/data/assets.json para public/img/.
// Rode uma vez (npm run assets:fetch) numa máquina com acesso à internet e versione a pasta public/img.
// Enquanto um arquivo não existir, o build usa a URL remota do manifesto (com aviso).
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await fs.readFile(path.join(root, 'src/data/assets.json'), 'utf8'));
const outDir = path.join(root, 'public/img');
await fs.mkdir(outDir, { recursive: true });

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/avif': 'avif' };
const existing = new Set(await fs.readdir(outDir));
let ok = 0, skipped = 0, failed = 0;

for (const [slug, { url }] of Object.entries(manifest)) {
  if ([...existing].some((f) => f.startsWith(`${slug}.`))) { skipped++; continue; }
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = (res.headers.get('content-type') || '').split(';')[0].trim();
    const ext = EXT[type];
    if (!ext) throw new Error(`tipo inesperado: ${type || 'desconhecido'}`);
    await fs.writeFile(path.join(outDir, `${slug}.${ext}`), Buffer.from(await res.arrayBuffer()));
    ok++;
    console.log(`✔ ${slug}.${ext}`);
  } catch (err) {
    failed++;
    console.error(`✘ ${slug}: ${err.message}`);
  }
}
console.log(`\nBaixadas: ${ok} | já existiam: ${skipped} | falhas: ${failed}`);
process.exitCode = failed ? 1 : 0;
