import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import htmlPartials from './build/html-partials.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(root, 'src');
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(srcDir, p), 'utf8'));

// Toda página .html em src/ vira uma entrada do build
const pages = Object.fromEntries(
  fs
    .readdirSync(srcDir)
    .filter((f) => f.endsWith('.html'))
    .map((f) => [path.basename(f, '.html'), path.join(srcDir, f)]),
);

export default defineConfig({
  root: srcDir,
  // './' funciona em qualquer pasta; no deploy na Vercel usamos '/' (VITE_BASE=/), exigido pela página 404 em URLs profundas
  base: process.env.VITE_BASE ?? './',
  publicDir: path.join(root, 'public'),
  envDir: root, // os .env* ficam na raiz do projeto (o `root` do Vite é src/)
  plugins: [
    htmlPartials({
      srcDir,
      imgDir: path.join(root, 'public', 'img'),
      site: readJson('data/site.json'),
      assets: readJson('data/assets.json'),
    }),
  ],
  server: {
    // `npm run dev:live` + `npm run mock-api`: /api vai para o servidor de referência
    proxy: { '/api': 'http://localhost:8787' },
  },
  build: {
    outDir: path.join(root, 'dist'),
    emptyOutDir: true,
    rollupOptions: { input: pages },
  },
});
