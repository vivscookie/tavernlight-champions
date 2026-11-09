// Regras de negócio do backend de referência (capacidade do time, capitão, pote que fecha no total...).
// Uso: npm run test:backend
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const P=path.join(path.dirname(fileURLToPath(import.meta.url)),'..')+'/';
const {createBackend}=await import(pathToFileURL(P+'src/js/mock/backend.js').href);
const j=f=>JSON.parse(fs.readFileSync(P+f,'utf8'));
const be=createBackend({team:j('src/data/mock/team.json'),pool:j('src/data/mock/pool.json')});
let fails=0;const ok=(c,m,extra='')=>{console.log((c?'PASS ':'FAIL ')+m+(c?'':' '+extra));if(!c)fails++};
const call=(m,u,b,h={})=>be.handle(m,u,b===undefined?undefined:JSON.stringify(b),h);
const valid=()=>{}; // validação de schema (Ajv + openapi.yaml) é opcional e fica fora das dependências do projeto

valid('Team',call('GET','/api/teams/mine').body,'GET /teams/mine');
valid('Pool',call('GET','/api/seasons/autumn-split/pool').body,'GET /seasons/{id}/pool');
const pool=call('GET','/api/seasons/autumn-split/pool').body;
ok(pool.payouts.reduce((t,p)=>t+p.amountCents,0)===pool.totalCents,'payouts fecham exatamente em totalCents ('+pool.payouts.map(p=>p.amountCents)+' = '+pool.totalCents+')');
ok(pool.payouts[3].place==='4-8'&&pool.payouts[3].eachCents*5<=pool.payouts[3].amountCents,'4–8: eachCents é o piso da divisão');
const m=call('PATCH','/api/teams/mine/members/m_2',{status:'sub'});ok(m.status===200,'PATCH status 200');valid('Member',m.body,'PATCH /members/{id}');
const d=call('POST','/api/teams/mine/invites/inv_in_1/decision',{decision:'accept'},{'idempotency-key':'a1'});ok(d.status===200&&d.body.status==='accepted','POST decision accept 200');valid('Member',d.body.member,'member devolvido pelo accept');
const d2=call('POST','/api/teams/mine/invites/inv_in_2/decision',{decision:'accept'},{'idempotency-key':'a2'});ok(d2.status===200,'2º accept ainda cabe (6+1+1 = 8)');
// time cheio: nenhum convite sobrou; recarrega o backend para testar squad_full
const be2=createBackend({team:{...j('src/data/mock/team.json'),capacity:6},pool:j('src/data/mock/pool.json')});
const full=be2.handle('POST','/api/teams/mine/invites/inv_in_1/decision',JSON.stringify({decision:'accept'}),{'idempotency-key':'f1'});
ok(full.status===409&&full.body.error.code==='squad_full','capacidade cheia -> 409 squad_full');
ok(call('DELETE','/api/teams/mine/members/m_1').body?.error?.code==='captain_locked'&&call('PATCH','/api/teams/mine/members/m_1',{status:'sub'}).body.error.code==='captain_locked','capitão: não rebaixa nem remove (409 captain_locked)');
ok(call('DELETE','/api/teams/mine/members/m_3').status===204&&call('GET','/api/teams/mine').body.members.every(x=>x.id!=='m_3'),'DELETE membro 204 e some do GET');
ok(call('DELETE','/api/teams/mine/invites/inv_out_1').status===204&&call('DELETE','/api/teams/mine/invites/inv_out_1').status===404,'revogar convite: 204 e depois 404');
ok(call('PATCH','/api/teams/mine/members/m_2',{status:'sub'},{'x-mock-role':'viewer'}).status===403,'papel viewer -> 403 em mutações do time');
ok(call('PATCH','/api/teams/mine/members/m_2',{status:'x'}).body.error.fields.status,'status inválido -> 422 em fields.status');
// pote muda com a inscrição
const before=call('GET','/api/seasons/autumn-split/pool').body.totalCents;
const r=call('POST','/api/registrations',{seasonId:'autumn-split',gamertag:'Pote_01',department:'game_design',squad:{path:'agent'},games:[],stake:{amountCents:2500,payrollConsent:true}},{'idempotency-key':'r1'});
const after=call('GET','/api/seasons/autumn-split/pool').body;
ok(r.status===201&&after.totalCents===before+2500&&after.ledger[0].handle==='Pote_01'&&after.ledger[0].amountCents===2500,'inscrição com stake soma ao pote e vira o 1º lançamento do ledger');
valid('Pool',after,'GET pool após a inscrição');
call('PUT','/api/pool/rules',{seasonId:'autumn-split',shares:{first:60,second:20,third:10},fairPlayRules:false,guildBadge:true});
const p2=call('GET','/api/seasons/autumn-split/pool').body;
ok(p2.rules.shares.mvp===10&&p2.payouts[0].sharePct===60&&p2.payouts[3].sharePct===10&&p2.payouts.reduce((t,p)=>t+p.amountCents,0)===p2.totalCents,'mudar as regras muda os prêmios (60/20/10/10) e continua fechando no total');
ok(call('GET','/api/seasons/xxx/pool').status===404,'temporada inexistente -> 404');

// ---- escalações e próxima partida: derivadas do servidor, sempre consistentes com o roster
{
  const be3=createBackend({team:j('src/data/mock/team.json'),pool:j('src/data/mock/pool.json')},{now:()=>Date.parse('2026-10-25T17:00:00Z')});
  const c3=(m,u,b,h={})=>be3.handle(m,u,b===undefined?undefined:JSON.stringify(b),h);
  const t0=c3('GET','/api/teams/mine').body;
  ok(t0.nextMatch.startsAt==='2026-10-25T19:30:00.000Z'&&t0.nextMatch.checkIn.locksAt==='2026-10-25T19:15:00.000Z','próxima partida: horários absolutos (início +150 min, check-in fecha 15 min antes)');
  ok(t0.nextMatch.checkIn.confirmed===5&&t0.nextMatch.checkIn.required===5,'check-in: 5 / 5 derivado dos slots travados do CS2');
  ok(t0.disciplines.length===3&&t0.disciplines[0].slots.every(x=>x.status==='locked'&&x.handle)&&t0.disciplines[2].kind==='solo','escalações: CS2 (5 travados), LoL e Smash (solo)');
  ok(t0.disciplines[0].slots.map(x=>x.memberId).join()==='m_1,m_2,m_3,m_4,m_5','escalações referenciam membros por id');
  // aceitar candidatura não mexe nas escalações
  c3('POST','/api/teams/mine/invites/inv_in_1/decision',{decision:'accept'},{'idempotency-key':'x1'});
  const t1=c3('GET','/api/teams/mine').body;
  ok(JSON.stringify(t1.disciplines)===JSON.stringify(t0.disciplines)&&t1.nextMatch.checkIn.confirmed===5,'aceitar candidatura NÃO altera escalações nem check-in');
  // trocar titular/reserva não mexe nas escalações (reservas podem estar escalados: sub_sam joga LoL)
  c3('PATCH','/api/teams/mine/members/m_6',{status:'starter'});
  ok(c3('GET','/api/teams/mine').body.disciplines[1].slots[1].handle==='sub_sam','trocar status não tira ninguém da escalação');
  // remover alguém vaga todos os slots dele
  c3('DELETE','/api/teams/mine/members/m_3');
  const t2=c3('GET','/api/teams/mine').body;
  const open=(d)=>d.slots.filter(x=>x.status==='open').map(x=>x.position);
  ok(open(t2.disciplines[0]).join()==='3'&&open(t2.disciplines[1]).join()==='Support','remover lead_be vaga o slot 3 do CS2 e o Support do LoL');
  ok(t2.disciplines[0].slots[2].memberId===null&&t2.disciplines[0].slots[2].handle===null&&t2.disciplines[0].slots[2].detail===null,'slot vago não carrega handle nem detalhe antigos');
  ok(t2.nextMatch.checkIn.confirmed===4&&t2.nextMatch.checkIn.required===5,'check-in recalculado: 4 / 5');
  // jogador em mais de uma escalação: vaga em todas e solo
  c3('DELETE','/api/teams/mine/members/m_2');
  const t3=c3('GET','/api/teams/mine').body;
  ok(t3.disciplines[0].slots[1].status==='open'&&t3.disciplines[1].slots[3].status==='open'&&t3.disciplines[2].lead===null&&t3.disciplines[2].backup.handle==='pixel_art','remover dev_dan vaga CS2 (Anchor), LoL (ADC) e o lead do Smash; o backup continua');
  ok(t3.nextMatch.checkIn.confirmed===3,'check-in: 3 / 5');
  // sem partida marcada
  const be4=createBackend({team:{...j('src/data/mock/team.json'),nextMatch:null},pool:j('src/data/mock/pool.json')});
  ok(be4.handle('GET','/api/teams/mine').body.nextMatch===null,'sem partida marcada: nextMatch é null');
  // reset restaura
  be3.reset();ok(c3('GET','/api/teams/mine').body.nextMatch.checkIn.confirmed===5,'reset restaura as escalações');
}


// ---- calendário: status derivado do relógio, filtros por fatos, RSVP
{
  let clock=Date.parse('2026-10-25T17:00:00Z');
  const be7=createBackend({team:j('src/data/mock/team.json'),pool:j('src/data/mock/pool.json'),events:j('src/data/mock/events.json')},{now:()=>clock});
  const c7=(m,u,b)=>be7.handle(m,u,b===undefined?undefined:JSON.stringify(b),{});
  const list=()=>c7('GET','/api/seasons/autumn-split/events').body.events;
  const byId=id=>list().find(e=>e.id===id);
  const e0=list();
  ok(e0.length===4&&e0.map(e=>e.id).join()==='evt_cup_ko,evt_smash_casual,evt_valorant_showdown,evt_rocket_lunch','eventos: 4 em ordem cronológica');
  ok(e0.map(e=>e.status).join()==='live_soon,scheduled,scheduled,scheduled','status: o cup começa em 150 min (<= 180) -> live_soon; os demais scheduled');
  ok(e0.filter(e=>e.participating).length===2&&e0.filter(e=>['live','live_soon'].includes(e.status)).length===1&&e0.filter(e=>e.prize!==null).length===2,'fatos reproduzem os filtros do protótipo: mine=2, live=1, prizes=2');
  ok(e0[0].prize.kind==='cash'&&e0[0].prize.amountCents===45000&&e0[2].prize.kind==='bragging','prêmios: cash em centavos / bragging');
  ok(e0[3].registrationClosesAt&&Date.parse(e0[3].registrationClosesAt)<Date.parse(e0[3].startsAt),'inscrição do Rocket League fecha antes do início');
  ok(e0[0].matchId===c7('GET','/api/teams/mine').body.nextMatch.id&&e0[0].startsAt===c7('GET','/api/teams/mine').body.nextMatch.startsAt,'consistência: o evento do cup e a próxima partida do time têm o MESMO id e horário');
  // RSVP
  const r=c7('PUT','/api/events/evt_smash_casual/rsvp',{going:false});
  ok(r.status===200&&r.body.participating===false&&r.body.action.going===false&&byId('evt_smash_casual').participating===false,'RSVP cancelado: devolve o evento e "participa" cai junto (persistido)');
  ok(c7('PUT','/api/events/evt_smash_casual/rsvp',{going:true}).body.participating===true,'RSVP de novo: volta a participar');
  ok(c7('PUT','/api/events/evt_smash_casual/rsvp',{going:'yes'}).body.error.fields.going,'RSVP com valor não booleano -> 422 em fields.going');
  ok(c7('PUT','/api/events/evt_cup_ko/rsvp',{going:true}).body.error.code==='rsvp_not_available','RSVP em evento de transmissão -> 409 rsvp_not_available');
  ok(c7('PUT','/api/events/nao_existe/rsvp',{going:true}).status===404,'RSVP em evento inexistente -> 404');
  ok(c7('GET','/api/seasons/xxx/events').status===404,'temporada inexistente -> 404');
  // o relógio anda: o cup começa, o Smash também; RSVP fecha; evento encerrado some
  clock=Date.parse('2026-10-26T19:30:00Z');
  ok(byId('evt_smash_casual').status==='live'&&c7('PUT','/api/events/evt_smash_casual/rsvp',{going:false}).body.error.code==='rsvp_closed','Smash em andamento -> status live e RSVP fecha (409 rsvp_closed)');
  ok(!list().some(e=>e.id==='evt_cup_ko'),'cup encerrado (passou de endsAt) sai da lista');
  ok(c7('PUT','/api/events/evt_cup_ko/rsvp',{going:true}).status===404,'evento encerrado -> 404');
  clock=Date.parse('2026-10-25T17:00:00Z'); be7.reset();
  ok(list().length===4&&byId('evt_smash_casual').participating===true,'reset restaura o calendário');
  const be8=createBackend({team:j('src/data/mock/team.json'),pool:j('src/data/mock/pool.json')});
  ok(be8.handle('GET','/api/seasons/autumn-split/events').body.events.length===0,'sem fixture de eventos: lista vazia (não quebra)');
}


// ---- painel (herói do index): uma partida só, em todos os lugares
{
  const fx=()=>({team:j('src/data/mock/team.json'),pool:j('src/data/mock/pool.json'),events:j('src/data/mock/events.json'),dashboard:j('src/data/mock/dashboard.json')});
  const be9=createBackend(fx());const c9=(m,u,b,h={})=>be9.handle(m,u,b===undefined?undefined:JSON.stringify(b),h);
  const dash=()=>c9('GET','/api/me/dashboard').body, team=()=>c9('GET','/api/teams/mine').body;
  const d0=dash();
  ok(d0.user.displayName==='Vivs'&&d0.user.handle==='vivi#0001'&&d0.season.name==='Autumn Split 2026'&&d0.standing.rank===4&&d0.standing.total===31&&d0.prizeShare.amountCents===5000,'painel: perfil, temporada, posição #4 / 31 e prêmio em centavos');
  const nm=d0.nextMatch, tn=team().nextMatch, ev=c9('GET','/api/seasons/autumn-split/events').body.events.find(e=>e.matchId);
  ok(nm.id===tn.id&&nm.id===ev.matchId&&nm.startsAt===tn.startsAt&&nm.startsAt===ev.startsAt,'UMA partida: painel, time e calendário têm o mesmo id e o mesmo horário');
  ok(JSON.stringify(nm.checkIn)===JSON.stringify(tn.checkIn)&&nm.mapPool.join()==='Mirage,Inferno,Anubis'&&nm.stage==='Knockout'&&nm.format==='5v5'&&nm.voice.label==='Voice #Arena-1','painel: o check-in é idêntico ao do time; mapas, fase, formato e voz vêm dos dados');
  ok(nm.team.name===team().name&&nm.team.record.wins===team().stats.wins&&nm.team.record.losses===team().stats.losses&&nm.team.seed===team().stats.standing,'"Your Team" é o time do usuário: nome, 12-3 e seed #2 saem de GET /teams/mine (acaba a contradição do protótipo)');
  ok(nm.opponent.name==='Ravencrest Syndicate'&&nm.opponent.seed===1&&nm.opponent.record.wins===12&&nm.opponent.record.losses===2&&nm.opponent.name!==nm.team.name,'adversário: Ravencrest Syndicate, seed #1, 12-2');
  // o check-in muda junto nos dois endpoints
  c9('DELETE','/api/teams/mine/members/m_3');
  ok(dash().nextMatch.checkIn.confirmed===4&&team().nextMatch.checkIn.confirmed===4,'remover um titular escalado: o painel também mostra 4 / 5 (mesmo cálculo)');
  c9('DELETE','/api/teams/mine/members/m_2');ok(dash().nextMatch.checkIn.confirmed===3,'segunda saída: 3 / 5 no painel');
  // sem partida e sem painel
  const none=createBackend({...fx(),team:{...j('src/data/mock/team.json'),nextMatch:null}});
  ok(none.handle('GET','/api/me/dashboard').body.nextMatch===null&&none.handle('GET','/api/me/dashboard').body.user.displayName==='Vivs','sem partida marcada: painel devolve nextMatch null e o resto continua');
  ok(createBackend({team:j('src/data/mock/team.json'),pool:j('src/data/mock/pool.json')}).handle('GET','/api/me/dashboard').status===404,'sem fixture do painel: 404 (não inventa dados)');
  be9.reset();ok(dash().nextMatch.checkIn.confirmed===5,'reset restaura o painel');
}

console.log(fails?`\n${fails} FALHAS`:'\nTODAS AS REGRAS DO BACKEND DE REFERÊNCIA PASSARAM');process.exit(fails?1:0);
