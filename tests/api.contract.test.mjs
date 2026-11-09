// Teste de contrato do cliente (src/js/api.js) contra o servidor de referência, por HTTP real.
// Uso: npm run test:api   (só Node + esbuild, que já vem com o Vite)
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const P=path.join(path.dirname(fileURLToPath(import.meta.url)),'..')+'/';
const TMP=fs.mkdtempSync(path.join(os.tmpdir(),'tl-api-'));
const imp=(f)=>import(pathToFileURL(f).href); // import() por caminho absoluto, também no Windows
const { createServer } = await imp(P+'scripts/mock-server.mjs');
const server=createServer(); await new Promise(r=>server.listen(0,'127.0.0.1',r)); const port=server.address().port;
const base=`http://127.0.0.1:${port}`;
const build=(mode,baseUrl,out)=>execSync(`"${P}node_modules/.bin/esbuild" ${P}src/js/api.js --bundle --format=esm --platform=node --outfile=${out} --log-level=error --define:import.meta.env='${JSON.stringify({VITE_API_MODE:mode,VITE_API_BASE_URL:baseUrl,DEV:false,PROD:true})}'`);
build('live',`${base}/api`,TMP+'/api-live.mjs'); build('live','http://127.0.0.1:1/api',TMP+'/api-dead.mjs'); build('live',`${base}/api`,TMP+'/api-live2.mjs');
const api=await imp(TMP+'/api-live.mjs'); const dead=await imp(TMP+'/api-dead.mjs');
let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++};
const reset=()=>fetch(base+'/__reset',{method:'POST'});
const reg=(over={})=>({identity:{gamertag:'Vivi_99',department:'game_design'},squad:{path:'join',squadId:'ironforge'},games:{enlisted:['cs2','lol']},stake:{amount:25},completed:[1,2,3],...over});
const raw=(method,path,body,headers={})=>fetch(base+path,{method,headers:{'Content-Type':'application/json',...headers},body:body?JSON.stringify(body):undefined}).then(async r=>({status:r.status,body:await r.json().catch(()=>null),headers:r.headers}));
const err=async p=>{try{await p;return null}catch(e){return e}};
const submit=(r,c=true)=>api.submitRegistration(r,{payrollConsent:c});

// ---- DTOs
{const d=api.toRegistrationDto(reg(),{payrollConsent:true});
 ok(JSON.stringify(d)===JSON.stringify({seasonId:'autumn-split',gamertag:'Vivi_99',department:'game_design',squad:{path:'join',squadId:'ironforge'},games:['cs2','lol'],stake:{amountCents:2500,payrollConsent:true}}),'DTO: inscrição em centavos inteiros, com o aceite, sem campos internos (completed, updatedAt)');
 ok(api.toRegistrationDto(reg({squad:{path:'agent',squadId:'pixel'}})).squad.squadId===null,'DTO: squadId só vai em "join"');
 ok(api.toRegistrationDto(reg({stake:{amount:12.1}})).stake.amountCents===1210,'DTO: 12.10 -> 1210 centavos (sem erro de ponto flutuante)');
 const e=(()=>{try{api.toRegistrationDto({identity:null})}catch(e){return e}})();ok(e instanceof api.ApiError&&e.kind==='validation'&&e.fields.gamertag&&e.fields['stake.amountCents'],'DTO: cadastro incompleto vira ApiError 422 local (sem chamar a rede)');
 const m=api.toMatchResultDto({bestOf:3,maps:[{n:1,a:13,b:9}],mvp:'',notes:undefined});ok(m.maps[0].number===1&&m.mvp===null&&m.notes===''&&!('winsA' in m),'DTO: partida sem winsA/winsB, mvp vazio -> null');
 ok(!('mvp' in api.toPoolRulesDto({shares:{first:50,second:30,third:15,mvp:5},fairPlayRules:1,guildBadge:0}).shares),'DTO: pote não envia o MVP (calculado no servidor)');}

await reset();
// ---- disponibilidade
ok((await api.checkGamertagAvailability('Vivi_99')).available===true,'GET availability: nome livre');
ok((await api.checkGamertagAvailability('ADMIN')).available===false,'GET availability: reservado (sem diferenciar maiúsculas)');
{const e=await err(api.checkGamertagAvailability('a b'));ok(e?.status===422&&e.fields.name,'GET availability: nome inválido -> 422 com fields.name');}

// ---- inscrição
const r1=await submit(reg());
ok(r1.status==='confirmed'&&/^reg_/.test(r1.id),'POST /registrations: 201 confirmada ('+r1.id+')');
ok((await api.checkGamertagAvailability('vivi_99')).available===false,'após inscrever, o nome some da disponibilidade');
{const e=await err(submit(reg()));ok(e?.kind==='conflict'&&e.code==='already_registered'&&api.describeError(e)==="You're already registered for this season.",'POST repetido (nova tentativa deliberada) -> 409 already_registered com mensagem amigável');}
{const e=await err(submit(reg({identity:{gamertag:'admin',department:'game_design'}})));ok(e?.code==='gamertag_taken'&&/just taken/.test(api.describeError(e)),'nome reservado no POST -> 409 gamertag_taken');}
{const e=await err(submit(reg({identity:{gamertag:'Novo_1',department:'x'},stake:{amount:600},games:{enlisted:['cs2','cs2','zzz']},squad:{path:'join',squadId:null}})));
 ok(e?.status===422&&e.kind==='validation'&&['department','stake.amountCents','games','squad.squadId'].every(k=>e.fields[k]),'POST inválido -> 422 com fields por caminho ('+Object.keys(e.fields)+')');
 ok(/^Check the data: /.test(api.describeError(e)),'describeError(422) mostra o primeiro campo: "'+api.describeError(e)+'"');}
// idempotência (cabeçalhos reais)
{const body={seasonId:'autumn-split',gamertag:'Idem_1',department:'game_design',squad:{path:'agent'},games:[],stake:{amountCents:0,payrollConsent:false}};
 const a=await raw('POST','/api/registrations',body,{'Idempotency-Key':'k1'});const b=await raw('POST','/api/registrations',body,{'Idempotency-Key':'k1'});
 ok(a.status===201&&b.status===201&&a.body.id===b.body.id&&b.headers.get('idempotent-replay')==='true','servidor: mesma Idempotency-Key + mesmo corpo repete a resposta original (Idempotent-Replay)');
 const c=await raw('POST','/api/registrations',{...body,gamertag:'Idem_2'},{'Idempotency-Key':'k1'});ok(c.status===422&&c.body.error.code==='idempotency_key_reuse','servidor: mesma chave com corpo diferente -> 422 idempotency_key_reuse');
 const d=await raw('POST','/api/registrations',body);ok(d.status===422&&d.body.error.fields['Idempotency-Key'],'servidor: POST sem Idempotency-Key -> 422');}


// ---- consentimento do desconto em folha
{await reset();
 const e=await err(submit(reg({identity:{gamertag:'Sem_Aceite',department:'game_design'}}),false));ok(e?.status===422&&e.fields['stake.payrollConsent'],'consentimento: valor > 0 sem aceite -> 422 em stake.payrollConsent');
 const e2=await err(api.submitRegistration(reg({identity:{gamertag:'Sem_Aceite',department:'game_design'}})));ok(e2?.fields['stake.payrollConsent'],'consentimento: sem informar o aceite o padrão é NÃO aceito (422)');
 const okFree=await submit(reg({identity:{gamertag:'Gratis_1',department:'game_design'},stake:{amount:0}}),false);ok(okFree.status==='confirmed','consentimento: tier $0 não exige aceite (201)');
 const okPaid=await submit(reg({identity:{gamertag:'Pago_1',department:'game_design'}}),true);ok(okPaid.status==='confirmed','consentimento: valor > 0 com aceite -> 201');
 await reset();}

// ---- partida
const maps=(...p)=>p.map(([a,b],i)=>({n:i+1,a,b}));
{const e=await err(api.publishMatchResult({matchId:'14',bestOf:3,maps:maps([13,9]),mvp:'',notes:''}));ok(e?.status===422&&e.code==='series_not_decided','POST result: série não decidida -> 422 series_not_decided');}
{const e=await err(api.publishMatchResult({matchId:'14',bestOf:3,maps:maps([13,9],[9,9]),mvp:'',notes:''}));ok(e?.status===422&&/tied/.test(e.fields['maps[1]']),'POST result: mapa empatado -> 422 em maps[1]');}
{const e=await err(api.publishMatchResult({matchId:'14',bestOf:3,maps:maps([13,9],[13,2],[13,1]),mvp:'',notes:''}));ok(e?.status===422&&/already decided|decided on map 2/.test(e.fields['maps[2]']),'POST result: mapa 3 depois de série decidida -> 422');}
{const e=await err(api.publishMatchResult({matchId:'14',bestOf:3,maps:maps([13,9],[7,13]),mvp:'x'.repeat(41),notes:'n'.repeat(501)}));ok(e?.fields.mvp&&e.fields.notes,'POST result: mvp>40 e notes>500 -> 422');}
{const e=await err(api.publishMatchResult({matchId:'999',bestOf:3,maps:maps([13,9],[13,8]),mvp:'',notes:''}));ok(e?.status===404&&e.code==='not_found','POST result: partida inexistente -> 404');}
const pub=await api.publishMatchResult({matchId:'14',bestOf:3,maps:maps([13,9],[7,13],[13,8]),mvp:'dev_dan',notes:'ok'});
ok(pub.status==='published'&&pub.winsA===2&&pub.winsB===1,'POST result: 201, placar recalculado pelo servidor (2–1)');
{const e=await err(api.publishMatchResult({matchId:'14',bestOf:3,maps:maps([13,9],[13,8]),mvp:'',notes:''}));ok(e?.kind==='conflict'&&e.code==='already_published'&&/already published/.test(api.describeError(e)),'POST result repetido -> 409 already_published');}
{const r=await raw('POST','/api/matches/15/result',{bestOf:3,maps:[{number:1,teamA:13,teamB:9},{number:2,teamA:13,teamB:8}]},{'Idempotency-Key':'v1','X-Mock-Role':'viewer'});ok(r.status===403&&r.body.error.code==='forbidden','servidor: papel viewer -> 403 forbidden');}

// ---- pote
{const r=await api.savePoolRules({shares:{first:50,second:30,third:15},fairPlayRules:true,guildBadge:false});ok(r.shares.mvp===5&&r.guildBadge===false,'PUT /pool/rules: 200, MVP = 5 calculado pelo servidor');}
{const e=await err(api.savePoolRules({shares:{first:70,second:40,third:25},fairPlayRules:true,guildBadge:true}));ok(e?.status===422&&e.fields.shares&&/exceed 95/.test(e.fields.shares),'PUT /pool/rules: soma > 95 -> 422');}
{const e=await err(api.savePoolRules({shares:{first:80,second:30,third:15},fairPlayRules:true,guildBadge:true}));ok(e?.fields['shares.first'],'PUT /pool/rules: first fora da faixa -> 422 em shares.first');}


// ---- retry reaproveita a Idempotency-Key; sucesso gera chave nova; CSRF só em escrita
{const http=await import('node:http');const seen=[];let n=0;
 const srv=http.createServer((q,s)=>{let b='';q.on('data',c=>b+=c);q.on('end',()=>{seen.push({m:q.method,key:q.headers['idempotency-key'],csrf:q.headers['x-csrf-token']});n++;
   if(q.url.includes('/gamertags')){s.writeHead(200,{'Content-Type':'application/json'});return s.end('{"name":"a","available":true}')}
   if(n===2){s.writeHead(503,{'Content-Type':'application/json'});return s.end('{"error":{"code":"internal_error","message":"boom"}}')}
   s.writeHead(201,{'Content-Type':'application/json'});s.end('{"id":"reg_x","status":"confirmed","createdAt":"2026-01-01T00:00:00Z"}')})});
 await new Promise(r=>srv.listen(0,'127.0.0.1',r));
 build('live',`http://127.0.0.1:${srv.address().port}/api`,TMP+'/api-retry.mjs');
 globalThis.document={querySelector:s=>s.includes('csrf-token')?{content:'tok-123'}:null};
 const a=await imp(TMP+'/api-retry.mjs');
 await a.checkGamertagAvailability('abc');                       // n=1 (GET)
 const e1=await err(a.submitRegistration(reg()));                // n=2 -> 503
 const r2=await a.submitRegistration(reg());                     // n=3 -> 201 (retry do MESMO envio)
 const r3=await a.submitRegistration(reg());                     // n=4 -> 201 (novo envio)
 const posts=seen.filter(x=>x.m==='POST');
 ok(e1?.kind==='server'&&r2.id==='reg_x','retry: 503 na 1ª tentativa, 201 na 2ª');
 ok(posts[0].key&&posts[0].key===posts[1].key,'retry: a nova tentativa do MESMO envio reaproveita a Idempotency-Key ('+posts[0].key?.slice(0,8)+'…)');
 ok(posts[2].key&&posts[2].key!==posts[1].key,'depois do sucesso, o próximo envio usa chave nova');
 ok(posts.every(p=>p.csrf==='tok-123')&&seen[0].csrf===undefined,'CSRF: X-CSRF-Token em POST/PUT (lido do <meta>) e ausente no GET');
 delete globalThis.document;srv.close();}

// ---- rede / timeout / resposta que não é JSON
{const e=await err(dead.checkGamertagAvailability('abc'));ok(e?.kind==='network'&&e.code==='network_error'&&e.status===0&&/Can't reach the server/.test(dead.describeError(e)),'rede fora do ar -> ApiError network_error (mensagem amigável)');}
{const t0=Date.now();const e=await err(api.request('GET','/__hang',{timeoutMs:300}));ok(e?.code==='timeout'&&Date.now()-t0<1500&&/too long/.test(api.describeError(e)),'timeout: aborta a requisição ('+(Date.now()-t0)+' ms) -> code timeout');}
{const html=http=>0; const srv=(await import('node:http')).createServer((q,s)=>{s.writeHead(502,{'Content-Type':'text/html'});s.end('<h1>Bad gateway</h1>')});await new Promise(r=>srv.listen(0,'127.0.0.1',r));
 build('live',`http://127.0.0.1:${srv.address().port}/api`,TMP+'/api-502.mjs');const a502=await imp(TMP+'/api-502.mjs');
 const e=await err(a502.checkGamertagAvailability('abc'));ok(e?.status===502&&e.kind==='server'&&e.code==='http_502'&&/our side/.test(a502.describeError(e)),'proxy devolve HTML 502 -> ApiError server (sem quebrar o parse)');srv.close();}
{const E=api.ApiError;ok(api.describeError(new E('x',{status:429,code:'rate_limited',retryAfter:30}))==='Too many attempts. Try again in 30 s.'&&api.describeError(new E('x',{status:401,code:'unauthenticated'}))==='Your session expired. Sign in again to continue.'&&api.describeError(new Error('qualquer'),'fallback')==='fallback','describeError: 429 com Retry-After, 401 e erro desconhecido usa o fallback');}

console.log(fails?`\n${fails} FALHAS`:'\nTODOS OS TESTES DA API PASSARAM');server.close();process.exit(fails?1:0);
