// Garante que o build de produção NÃO publica o backend de referência nem os fixtures (dados de exemplo).
// Uso: npm run test:build   (faz um build real em pasta temporária, ~3 s)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const P = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-dist-'));
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

const warn = console.warn; console.warn = () => {}; // avisos de "imagem ainda remota" não interessam aqui
await build({ configFile: path.join(P, 'vite.config.js'), logLevel: 'silent', build: { outDir: out, emptyOutDir: true } });
console.warn = warn;

const js = fs.readdirSync(path.join(out, 'assets')).filter((f) => f.endsWith('.js'));
const all = js.map((f) => fs.readFileSync(path.join(out, 'assets', f), 'utf8')).join('\n');

// marcadores que só existem no backend de referência e nos fixtures (src/data/mock/*.json)
const fixtureText = fs.readFileSync(path.join(P, 'src/data/mock/team.json'), 'utf8') + fs.readFileSync(path.join(P, 'src/data/mock/pool.json'), 'utf8') + fs.readFileSync(path.join(P, 'src/data/mock/events.json'), 'utf8') + fs.readFileSync(path.join(P, 'src/data/mock/dashboard.json'), 'utf8');
// (códigos de erro como captain_locked existem de propósito no cliente; aqui só vale o que é exclusivo do mock)
const markers = ['dev_dan', 'tanya_ui', 'marcus_fx', 'alex_design', 'createBackend', 'KNOWN_MATCHES', 'Only match officials can publish results', 'Rocket League 3v3 Lunch Cup', 'Casual Smash Brawl', 'Product & Ops Div.', 'Voice #Arena-1', 'Game Design Guild', 'This event does not take RSVPs'];
ok(markers.every((m) => fixtureText.includes(m) || fs.readFileSync(path.join(P, 'src/js/mock/backend.js'), 'utf8').includes(m)), 'controle positivo: os marcadores existem nos fontes do mock');
ok(!markers.some((m) => all.includes(m)), 'dist: nenhum marcador do mock/fixtures nos JS publicados');
ok(!js.some((f) => /^(backend|team-[\w-]+|pool)-/.test(f) && fs.readFileSync(path.join(out, 'assets', f), 'utf8').includes('"members"')), 'dist: sem chunk de fixtures (time/pote)');
ok(!all.includes('modo MOCK'), 'dist: o aviso do modo mock não vai para produção');
ok(/"live"/.test(all) || /VITE_API_MODE/.test(all) === false, 'dist: cliente da API em modo live');
ok(all.includes('/api'), 'dist: base da API "/api" embutida');

fs.rmSync(out, { recursive: true, force: true });
console.log(fails ? `\n${fails} FALHAS` : '\nO BUILD DE PRODUÇÃO NÃO CONTÉM O MOCK');
process.exit(fails ? 1 : 0);
