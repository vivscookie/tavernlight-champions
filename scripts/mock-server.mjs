// Servidor HTTP do backend de REFERÊNCIA (src/js/mock/backend.js): em memória, sem autenticação real.
// Serve para desenvolver contra HTTP de verdade e como especificação executável (docs/api-contract.md).
//
//   npm run mock-api            → http://localhost:8787  (o Vite faz proxy de /api com `npm run dev:live`)
//   POST /__reset               → limpa o estado (usado nos testes)
//   GET  /api/__hang            → nunca responde (teste de timeout)
//   Cabeçalho X-Mock-Role: viewer → simula usuário sem permissão (403)
import http from 'node:http';
import fs from 'node:fs';
import { createBackend } from '../src/js/mock/backend.js';

const readJson = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), 'utf8'));
const fixtures = {
  team: readJson('../src/data/mock/team.json'),
  pool: readJson('../src/data/mock/pool.json'),
  events: readJson('../src/data/mock/events.json'),
  dashboard: readJson('../src/data/mock/dashboard.json'),
};

export function createServer() {
  const backend = createBackend(fixtures);
  return http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const send = ({ status, body, replay }) => {
        const headers = { ...(replay ? { 'Idempotent-Replay': 'true' } : {}) };
        if (status === 204) { res.writeHead(204, headers); return res.end(); }
        res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
        res.end(JSON.stringify(body));
      };
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'POST' && url.pathname === '/__reset') { backend.reset(); return send({ status: 204 }); }
      if (url.pathname === '/api/__hang') return;
      const raw = Buffer.concat(chunks).toString('utf8') || undefined;
      send(backend.handle(req.method, req.url, raw, req.headers));
    });
  });
}

// Execução direta: `node scripts/mock-server.mjs`
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 8787);
  createServer().listen(port, () => console.log(`[mock-api] http://localhost:${port}/api  (contrato: docs/api-contract.md)`));
}
