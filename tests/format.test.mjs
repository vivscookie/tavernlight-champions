// Testes unitários dos formatadores e do contador (sem DOM). Uso: npm run test:format
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const P = path.join(path.dirname(fileURLToPath(import.meta.url)), '..') + '/';
const F = await import(pathToFileURL(P + 'src/js/ui/format.js').href);
const C = await import(pathToFileURL(P + 'src/js/ui/countdown.js').href);
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const eq = (a, b, m) => ok(a === b, `${m}${a === b ? '' : `  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`}`);

// dinheiro (centavos inteiros)
eq(F.formatMoney(142500), '$1,425.00', 'formatMoney(142500)');
eq(F.formatMoney(2850), '$28.50', 'formatMoney(2850)');
eq(F.formatMoneyInt(285000), '$2,850', 'formatMoneyInt');
eq(F.formatMoneyDec(285005), '.05', 'formatMoneyDec preenche zero à esquerda');
// tempo relativo
const now = Date.parse('2026-10-25T12:00:00Z');
const ago = (min) => new Date(now - min * 60000).toISOString();
eq(F.timeAgoShort(ago(0), now), 'just now', 'timeAgoShort: agora');
eq(F.timeAgoShort(ago(14), now), '14m ago', 'timeAgoShort: minutos');
eq(F.timeAgoShort(ago(180), now), '3h ago', 'timeAgoShort: horas');
eq(F.timeAgoShort(ago(3000), now), '2d ago', 'timeAgoShort: dias');
eq(F.timeAgoLong(ago(1080), now), '18 hours ago', 'timeAgoLong: plural');
eq(F.timeAgoLong(ago(60), now), '1 hour ago', 'timeAgoLong: singular');
eq(F.timeLeft(new Date(now + 6 * 3600000).toISOString(), now), '6h', 'timeLeft: horas');
eq(F.timeLeft(new Date(now + 45 * 60000).toISOString(), now), '45m', 'timeLeft: minutos');
eq(F.timeLeft(ago(5), now), 'expired', 'timeLeft: vencido');
// iniciais e pipes
eq(F.initials('alex_design'), 'AD', 'initials: duas palavras');
eq(F.initials('vivi#0001'), 'VI', 'initials: uma palavra');
eq(F.initials('###'), '?', 'initials: sem letras');
eq(F.PIPES.signed(24), '+24', 'signed positivo'); eq(F.PIPES.signed(-3), '-3', 'signed negativo');
eq(F.PIPES.signedPct(18.5), '+18.5%', 'signedPct'); eq(F.PIPES.rank(2), '#2', 'rank'); eq(F.PIPES.bullet('X'), '• X', 'bullet');
eq(F.gameIcon('cs2'), 'target', 'gameIcon conhecido'); eq(F.gameIcon('zzz'), 'sports_esports', 'gameIcon desconhecido tem fallback');
// segurança: URLs de imagem vindas da API
eq(F.safeImageUrl('https://cdn.example.com/a.png'), 'https://cdn.example.com/a.png', 'safeImageUrl aceita https');
eq(F.safeImageUrl('/img/a.png'), '/img/a.png', 'safeImageUrl aceita caminho relativo');
for (const bad of ['javascript:alert(1)', 'data:text/html;base64,AAAA', '//evil.example/x.png', 'vbscript:x', 'file:///etc/passwd', '', null, undefined, 42]) {
  eq(F.safeImageUrl(bad), null, `safeImageUrl recusa ${JSON.stringify(bad)}`);
}
// horário de partida (hora local de quem roda o teste, então montamos as datas em hora local)
const at = (h, m, dayOffset = 0) => new Date(2026, 9, 25 + dayOffset, h, m).toISOString();
const base = new Date(2026, 9, 25, 9, 0);
ok(/^Tonight at \d\d:\d\d /.test(F.kickoffLabel(at(19, 30), base)), 'kickoffLabel: hoje à noite -> "Tonight at …"');
ok(/^Today at \d\d:\d\d /.test(F.kickoffLabel(at(14, 0), base)), 'kickoffLabel: hoje de dia -> "Today at …"');
ok(/^Tomorrow at 10:05 /.test(F.kickoffLabel(at(10, 5, 1), base)), 'kickoffLabel: amanhã');
ok(/^[A-Z][a-z]{2}, Oct 28 at /.test(F.kickoffLabel(at(10, 5, 3), base)), 'kickoffLabel: depois de amanhã usa dia da semana e data');
ok(/^19:30 \S+$/.test(F.clockTime(at(19, 30))), 'clockTime: HH:MM + fuso');
ok(/^Yesterday \d\d:\d\d$/.test(F.dayTime(at(16, 42, -1), base)) && /^Today \d\d:\d\d$/.test(F.dayTime(at(8, 0), base)), 'dayTime: Yesterday / Today');
// contador
eq(C.formatCountdown(8670), '02h : 24m : 30s', 'formatCountdown');
eq(C.formatCountdown(59), '00h : 00m : 59s', 'formatCountdown: só segundos');
eq(C.formatCountdown(360000), '100h : 00m : 00s', 'formatCountdown: mais de 99 h não quebra');
{ const el = { textContent: '' }; let t = 1000; const stop = C.startCountdown(el, new Date(5000).toISOString(), { now: () => t, doneText: 'Locked' });
  eq(el.textContent, '00h : 00m : 04s', 'startCountdown: mostra o restante já na primeira chamada');
  stop(); }
{ const el = { textContent: '' }; C.startCountdown(el, new Date(1000).toISOString(), { now: () => 5000, doneText: 'Locked' });
  eq(el.textContent, 'Locked', 'startCountdown: alvo no passado mostra o texto final e não deixa timer ligado'); }


// calendário: chip de dia, dia da semana, prêmio compacto, URLs
{ const base=new Date(2026,9,25,9,0); const at=(d,h=10)=>new Date(2026,9,d,h,0).toISOString();
  const t=F.dayChip(at(25,19),base);ok(t.label==='TODAY'&&t.number==='25'&&t.isToday===true,'dayChip: hoje -> TODAY + número do dia');
  const n=F.dayChip(at(28),base);ok(/^[A-Z]{3}$/.test(n.label)&&n.label==='WED'&&n.number==='28'&&n.isToday===false,'dayChip: outro dia -> dia da semana abreviado calculado da data (28/10/2026 é WED)');
  eq(F.dayChip(at(15),base).label,'THU','dayChip: 15/10/2026 é THU (o protótipo dizia FRI)');
  eq(F.weekdayLong(at(31)),'Saturday','weekdayLong'); }
eq(F.formatMoneyCompact(45000),'$450','formatMoneyCompact: valor redondo sem centavos');
eq(F.formatMoneyCompact(45050),'$450.50','formatMoneyCompact: com centavos');
eq(F.safeUrl('https://discord.com/x'),'https://discord.com/x','safeUrl aceita https');
for (const bad of ['javascript:alert(1)',' javascript:alert(1)','JaVaScRiPt:alert(1)','data:text/html,x','//evil.example','\\\\evil.example']) eq(F.safeUrl(bad),null,`safeUrl recusa ${JSON.stringify(bad)}`);
eq(F.safeImageUrl,F.safeUrl,'safeImageUrl continua existindo como alias');


// herói: formato compacto, kickoffShort e pipes novos
eq(C.formatCountdownCompact(9652),'02h 40m 52s','formatCountdownCompact');
eq(C.formatCountdownCompact(5),'00h 00m 05s','formatCountdownCompact: só segundos');
ok(/^[A-Z][a-z]{2} \d\d:\d\d \S+$/.test(F.kickoffShort(new Date(2026,9,25,19,30).toISOString())),'kickoffShort: "Sun 19:30 <fuso>"');
eq(F.PIPES.moneyCompact(5000),'$50','pipe moneyCompact: $50'); eq(F.PIPES.moneyCompact(5050),'$50.50','pipe moneyCompact: $50.50');
eq(F.PIPES.seed(2),'#2 Seed','pipe seed');
{ const el={textContent:''};let t=0;const stop=C.startCountdown(el,new Date(9652000).toISOString(),{now:()=>t,format:C.formatCountdownCompact});
  eq(el.textContent,'02h 40m 52s','startCountdown com format compacto'); stop(); }
{ const el={textContent:''};C.startCountdown(el,new Date(1000).toISOString(),{now:()=>9000,format:C.formatCountdownCompact,doneText:'Live now'});
  eq(el.textContent,'Live now','startCountdown: doneText configurável'); }

console.log(fails ? `\n${fails} FALHAS` : '\nTODOS OS TESTES DE FORMATAÇÃO PASSARAM');
process.exit(fails ? 1 : 0);
