// Tests du noyau : node tests/core.test.js
'use strict';
const assert = require('assert');
const path = require('path');
const www = path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'www', 'js');
const Nmea = require(path.join(www, 'nmea.js'));
global.Nmea = Nmea;
const Drivers = require(path.join(www, 'drivers.js'));
const Survey = require(path.join(www, 'survey.js'));

let passed = 0;
function test(name, fn) { fn(); passed++; console.log('ok -', name); }

test('checksum valide (trame de référence)', () => {
  assert.ok(Nmea.checksumOk('$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47'));
  assert.ok(!Nmea.checksumOk('$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*48'));
});

test('GGA décodée', () => {
  const g = Nmea.parseSentence('$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47');
  assert.strictEqual(g.type, 'GGA');
  assert.ok(Math.abs(g.lat - (48 + 7.038 / 60)) < 1e-12);
  assert.ok(Math.abs(g.lon - (11 + 31 / 60)) < 1e-12);
  assert.strictEqual(g.quality, 1);
  assert.strictEqual(g.sats, 8);
  assert.ok(Math.abs(g.hEll - 592.3) < 1e-9);
});

test('hémisphères ouest et sud', () => {
  assert.ok(Math.abs(Nmea.dmToDeg('07112.5', 'W') + (71 + 12.5 / 60)) < 1e-12);
  assert.ok(Math.abs(Nmea.dmToDeg('4649.0', 'S') + (46 + 49 / 60)) < 1e-12);
});

test('GST décodée', () => {
  const s = Nmea.withChecksum('GPGST,172814.0,0.006,0.023,0.020,273.6,0.023,0.020,0.031');
  const g = Nmea.parseSentence(s);
  assert.strictEqual(g.type, 'GST');
  assert.strictEqual(g.sigmaLat, 0.023);
  assert.strictEqual(g.sigmaAlt, 0.031);
});

test('flux mélangé avec du binaire et trames coupées', () => {
  const got = [];
  const st = new Nmea.NmeaStream(s => got.push(s.type));
  const a = Nmea.withChecksum('GNGGA,120000.00,4648.74,N,07112.52,W,4,20,0.6,75.0,M,-29.5,M,1.0,0000');
  const b = Nmea.withChecksum('GNGST,120000.00,0.01,0.01,0.01,0,0.01,0.01,0.02');
  const bytes = Buffer.concat([Buffer.from([0xd3, 0x00, 0x13, 0x3e, 0x00]), Buffer.from(a + '\r\n' + b.slice(0, 10))]);
  st.pushBytes(bytes);
  st.pushBytes(Buffer.from(b.slice(10) + '\r\n$GPGGA,garbage*00\r\n'));
  assert.deepStrictEqual(got, ['GGA', 'GST']);
  assert.strictEqual(st.stats.bad, 1);
});

test('simulateur : trames valides, flottant puis fixe', () => {
  const sim = new Drivers.Simulator(() => {}, { floatSec: 2 });
  sim.t0 = 0;
  const types = [];
  const st = new Nmea.NmeaStream(s => { if (s.type === 'GGA') types.push(s.quality); });
  st.pushText(sim.epoch(500));
  st.pushText(sim.epoch(3000));
  assert.deepStrictEqual(types, [5, 4]);
  assert.strictEqual(st.stats.bad, 0);
});

function runRecorder(opts, floatSec, durationMs) {
  const sim = new Drivers.Simulator(() => {}, { floatSec });
  sim.t0 = 0;
  const rec = new Survey.Recorder(opts);
  let gst = null;
  const st = new Nmea.NmeaStream(s => {
    if (s.type === 'GST') { gst = s; rec.feedGst(s); }
    if (s.type === 'GGA') rec.feed(s, gst, now);
  });
  var now = 0;
  for (now = 0; now <= durationMs && !rec.done; now += 200) st.pushText(sim.epoch(now));
  return rec;
}

test('moyenne en RTK fixe : point accepté, hauteur de canne soustraite', () => {
  const rec = runRecorder({ durationSec: 5, requireFixed: true }, 0, 10000);
  const r = rec.result(2.0, 0.1);
  assert.ok(r.ok, JSON.stringify(r.reasons));
  assert.ok(r.n >= 24);
  assert.ok(Math.abs(r.lat - 46.8123456) * 111132 < 0.01);
  assert.ok(Math.abs(r.hEll - (75.0 - 29.5 - 2.1)) < 0.02, 'hEll ' + r.hEll);
});

test('flottant seulement : époques rejetées et point refusé', () => {
  const rec = runRecorder({ durationSec: 3, requireFixed: true }, 99, 10000);
  const r = rec.result(2, 0);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.n, 0);
  assert.ok(r.rejected > 10);
});

test('flottant accepté si exigence levée, mais précision insuffisante', () => {
  const rec = runRecorder({ durationSec: 3, requireFixed: false }, 99, 10000);
  const r = rec.result(2, 0);
  assert.strictEqual(r.ok, false);
  assert.ok(r.reasons.some(x => x.indexOf('Précision H') === 0));
});

test('nom de point suivant et export CSV', () => {
  assert.strictEqual(Survey.nextPointName('P009'), 'P010');
  assert.strictEqual(Survey.nextPointName('BORNE'), 'BORNE1');
  const csv = Survey.toCsv([{ leve: 'L1', nom: 'P1', code: 'BO, fer', lat: 46.1, lon: -71.2, hEll: 45.1234567, n: 25 }]);
  const lines = csv.trim().split('\r\n');
  assert.strictEqual(lines.length, 2);
  assert.ok(lines[1].indexOf('"BO, fer"') > 0);
  assert.ok(lines[1].indexOf('46.100000000') > 0);
  assert.ok(lines[1].indexOf('45.1235') > 0);
});



// ---------- Projection MTM (référence : PROJ / pyproj, EPSG 2948-2950) ----------
const Proj = require(path.join(www, 'proj.js'));
const ref = require('./mtm_reference.json');

test('MTM 6-7-8 : écart max < 1 mm avec PROJ (120 points au Québec)', () => {
  let max = 0;
  for (const [z, lat, lon, e, n] of ref.slice(0, -1)) {
    const p = Proj.mtm(z).forward(lat, lon);
    max = Math.max(max, Math.abs(p.e - e), Math.abs(p.n - n));
  }
  assert.ok(max < 0.001, 'écart max ' + max);
});

test('MTM 7 : point d’essai identique à Emlid Flow (199607,532 / 5200299,201)', () => {
  const [z, lat, lon, e, n] = ref[ref.length - 1];
  const p = Proj.mtm(z).forward(lat, lon);
  assert.ok(Math.abs(p.e - e) < 0.002 && Math.abs(p.n - n) < 0.002, JSON.stringify(p));
});

test('MTM aller-retour (inverse) < 0,1 mm', () => {
  let max = 0;
  for (const [z, lat, lon] of ref) {
    const t = Proj.mtm(z), p = t.forward(lat, lon), g = t.inverse(p.e, p.n);
    max = Math.max(max, Math.abs(g.lat - lat) * 111000, Math.abs(g.lon - lon) * 78000);
  }
  assert.ok(max < 0.0001, 'écart ' + max);
});

test('zone MTM suggérée selon la longitude', () => {
  assert.strictEqual(Proj.mtmZoneFor(-71.88), 7);
  assert.strictEqual(Proj.mtmZoneFor(-73.6), 8);
  assert.strictEqual(Proj.mtmZoneFor(-67.0), 6);
});

test('altitude CGVD28 : séparation fixe et grille (interpolation bilinéaire)', () => {
  const r = Proj.convert(46.93384537, -71.88153520, 172.596, { hz: '2949', vt: '10588-sep', sep: -28.192 });
  assert.ok(Math.abs(r.z - 200.788) < 1e-9, String(r.z));
  // grille fictive 2 x 2 : N = -28 au sud, -29 au nord
  const vals = new Int32Array([-28000, -28000, -29000, -29000]);
  Proj.registerGrid({ name: 'HT2_2002v70', lat0: 46, lon0: -72, dlat: 1, dlon: 1, rows: 2, cols: 2, scale: 0.001, values: vals });
  const g = Proj.convert(46.5, -71.5, 100, { hz: 'geo', vt: '10588-2002' });
  assert.ok(Math.abs(g.N + 28.5) < 1e-9 && Math.abs(g.z - 128.5) < 1e-9, JSON.stringify(g));
  const out = Proj.convert(48, -71.5, 100, { hz: 'geo', vt: '10588-2002' });
  assert.strictEqual(out.z, null);
});

test('NAD83 original : refusé tant que la grille de conversion n\u2019est pas chargée', () => {
  const r = Proj.convert(46.9, -71.9, 100, { hz: '32187', vt: 'ellips' });
  assert.strictEqual(r.e, null);
  assert.ok(/NA83SCRS/.test(r.warn));
});
test('flottant puis fixe : la durée part du premier fixe, le flottant est exclu de la moyenne', () => {
  // 3 s de flottant (dispersion 15 cm), puis RTK fixe ; mesure de 3 s
  const rec = runRecorder({ durationSec: 3, requireFixed: true }, 3, 20000);
  const r = rec.result(0, 0);
  assert.ok(rec.done);
  assert.ok(r.ok, JSON.stringify(r.reasons));
  assert.ok(r.rejected >= 14 && r.rejected <= 16, 'rejetées ' + r.rejected);
  assert.ok(r.n >= 15 && r.n <= 17, 'acceptées ' + r.n);
  assert.ok(r.spreadH < 0.02, 'dispersion ' + r.spreadH);
});

test('GST d\u2019une autre époque ignorée ; GST de la même époque utilisée (avant ou après la GGA)', () => {
  const t = { h: 10, m: 0, s: 1.0 }, t0 = { h: 10, m: 0, s: 0.8 };
  const gga = { lat: 46, lon: -71, hEll: 100, alt: 128, geoidSep: -28, quality: 4, time: t };
  const rec = new Survey.Recorder({ durationSec: 99, requireFixed: true });
  rec.feed(gga, { time: t0, sigmaLat: 0.5, sigmaLon: 0.5, sigmaAlt: 0.5 }, 1000);
  assert.strictEqual(rec.samples[0].sLat, null);
  rec.feedGst({ time: t, sigmaLat: 0.01, sigmaLon: 0.01, sigmaAlt: 0.02 });
  assert.strictEqual(rec.samples[0].sLat, 0.01);
  rec.feed(Object.assign({}, gga, { time: { h: 10, m: 0, s: 1.2 } }), { time: { h: 10, m: 0, s: 1.2 }, sigmaLat: 0.011, sigmaLon: 0.01, sigmaAlt: 0.02 }, 1200);
  assert.strictEqual(rec.samples[1].sLat, 0.011);
});

test('CSV : colonnes Est, Nord, Altitude et systèmes', () => {
  const csv = Survey.toCsv([{ nom: 'P1', est: 199607.5321, nord: 5200299.2009, alt: 200.7884, systeme: 'EPSG:2949', systemeAlti: 'EPSG:10588', sep: -28.192 }]);
  const [h, l] = csv.trim().split('\r\n');
  assert.ok(h.startsWith('Leve,Point,Code,Est,Nord,Altitude,Systeme_plan,Systeme_alti'));
  assert.ok(l.indexOf('199607.532,5200299.201,200.788,EPSG:2949,EPSG:10588') > 0, l);
});

// ---------- Références officielles et grille réelle ----------
test('MTM : exemples officiels du Guide MRNF 2010 (LPOC zone 7, VALD et Kuujjuarapik zone 9) < 1 mm', () => {
  const d = (D, M, S) => D + M / 60 + S / 3600;
  const pts = [[d(47, 20, 28.98074), -d(70, 0, 30.79594), 7, 5244792.642, 341934.891],
    [d(47, 20, 28.98054), -d(70, 0, 30.79542), 7, 5244792.636, 341934.902],
    [d(48, 5, 49.37144), -d(77, 33, 50.98064), 9, 5329233.350, 225544.054],
    [d(55, 16, 42.06215), -d(77, 44, 43.54252), 9, 6128312.159, 225662.684]];
  for (const [lat, lon, z, N, E] of pts) {
    const p = Proj.mtm(z).forward(lat, lon);
    assert.ok(Math.abs(p.n - N) < 0.001 && Math.abs(p.e - E) < 0.001, z + ' ' + (p.n - N) + ' ' + (p.e - E));
  }
});

test('grille HT2_2010v70 réelle : identique à PROJ < 1 mm (150 points au Québec), point d\u2019essai N = -28,169', () => {
  const vm = require('vm'), fs = require('fs');
  const ctx = { window: { Proj }, atob: (b) => Buffer.from(b, 'base64').toString('binary') };
  vm.runInNewContext(fs.readFileSync(path.join(www, '..', 'grids', 'ht2_2010v70.js'), 'utf8'), ctx);
  assert.ok(Proj.hasGrid('HT2_2010v70'));
  let max = 0;
  for (const [lat, lon, N] of require('./ht2_2010v70_reference.json')) max = Math.max(max, Math.abs(Proj.gridValue('HT2_2010v70', lat, lon) - N));
  assert.ok(max < 0.001, 'écart max ' + max);
  const r = Proj.convert(46.93384537, -71.88153520, 172.596, { hz: '2949', vt: '10588-2010' });
  assert.ok(Math.abs(r.N + 28.169) < 0.0005 && Math.abs(r.z - 200.765) < 0.001, JSON.stringify([r.N, r.z]));
});

function loadGrid(file) {
  const vm = require('vm'), fs = require('fs');
  const ctx = { window: { Proj }, atob: (b) => Buffer.from(b, 'base64').toString('binary') };
  vm.runInNewContext(fs.readFileSync(path.join(www, '..', 'grids', file), 'utf8'), ctx);
}

test('grille HT2_2002v70 réelle : identique à PROJ < 1 mm ; point d\u2019essai N = -28,192 (comme Emlid Flow)', () => {
  loadGrid('ht2_2002v70.js');
  let max = 0;
  for (const [lat, lon, N] of require('./ht2_2002v70_reference.json')) max = Math.max(max, Math.abs(Proj.gridValue('HT2_2002v70', lat, lon) - N));
  assert.ok(max < 0.001, 'écart max ' + max);
  const r = Proj.convert(46.93384537, -71.88153520, 172.596, { hz: '2949', vt: '10588-2002' });
  assert.ok(Math.abs(r.z - 200.788) < 0.001, 'altitude ' + r.z + ' (Flow : 200,788)');
});

test('grille NTv2 NA83SCRS (14 sous-grilles) : aller et retour identiques à PROJ < 1 mm (201 points)', () => {
  loadGrid('na83scrs.js');
  let maxF = 0, maxI = 0;
  for (const p of require('./na83scrs_reference.json')) {
    const f = Proj.nad83ToCsrs(p.lat, p.lon), i = Proj.csrsToNad83(p.lat, p.lon);
    maxF = Math.max(maxF, Math.abs(f.lat - p.fwd[0]) * 111000, Math.abs(f.lon - p.fwd[1]) * 76000);
    maxI = Math.max(maxI, Math.abs(i.lat - p.inv[0]) * 111000, Math.abs(i.lon - p.inv[1]) * 76000);
  }
  assert.ok(maxF < 0.001 && maxI < 0.001, 'écarts ' + maxF + ' / ' + maxI);
});

test('NAD83 / MTM 7 (EPSG 32187) au point d\u2019essai : identique à PROJ < 1 mm', () => {
  const ref = require('./na83_mtm7_point.json');
  const r = Proj.convert(46.93384537, -71.88153520, 172.596, { hz: '32187', vt: 'ellips' });
  assert.ok(Math.abs(r.e - ref.e) < 0.001 && Math.abs(r.n - ref.n) < 0.001, JSON.stringify([r.e, r.n, ref]));
});

test('table des sources NTRIP : décodage STR et tri (réseau, constellations, distance)', () => {
  const Ntrip = require(path.join(www, 'ntrip.js'));
  const lines = [
    'STR;RTCM3_ViRS;ViRS;RTCM 3.1;1004(1),1012(1);2;GPS+GLO;SmartNet;CAN;46.67;-72.03;1;0;sNTRIP;none;B;N;5000;',
    'STR;MSM_iMAX;iMAX;RTCM 3.2;1077(1),1087(1),1097(1),1127(1);2;GPS+GLO+GAL+BDS;SmartNet;CAN;0.00;0.00;1;1;sNTRIP;none;B;N;5000;',
    'STR;QCSTN;Station;RTCM 3.2;1077(1);2;GPS;SmartNet;CAN;46.95;-71.90;0;0;sNTRIP;none;B;N;5000;'
  ];
  const l = Ntrip.mountList(lines.map((x) => ({ name: x.split(';')[1], info: x })), { lat: 46.9338, lon: -71.8813 });
  assert.deepStrictEqual(l.map((m) => m.name), ['MSM_iMAX', 'RTCM3_ViRS', 'QCSTN']);
  assert.ok(l[0].network && l[0].galileo && l[0].beidou && l[0].msm && /réseau/.test(l[0].label));
  assert.ok(l[1].network && l[1].distKm === null && /position requise/.test(l[1].label), l[1].label);
  assert.ok(Math.abs(l[2].distKm - 2.1) < 0.5 && /base à 2 km/.test(l[2].label), l[2].label);
});

test('ligne de base : station 3601 (message 1005) à 31,7 km du trépied, comme Emlid Flow', () => {
  const Ntrip = require(path.join(www, 'ntrip.js'));
  const km = Ntrip.baselineKm(46.93376176, -71.88125931, 172.466 + 0.145, 1352930.0368, -4170769.2850, 4616433.5744);
  assert.ok(Math.abs(km - 31.718) < 0.01, 'ligne de base ' + km + ' km (Flow : 31,718)');
});

test('radio : base inscrite en MTM 7 à 1 km du mobile -> ligne de base 1,000 km', () => {
  const Ntrip = require(path.join(www, 'ntrip.js'));
  const m7 = Proj.mtm(7), lat = 46.93376176, lon = -71.88125931, h = 172.6;
  const p = m7.forward(lat, lon);
  const g = m7.inverse(p.e + 1000, p.n); // base 1 km à l'est (comme radioBase() dans app.js)
  const b = Ntrip.geoToEcef(g.lat, g.lon, h);
  const km = Ntrip.baselineKm(lat, lon, h, b.x, b.y, b.z);
  assert.ok(Math.abs(km - 1.0) < 0.002, 'ligne de base ' + km + ' km');
});

test('CSV : source et âge des corrections en fin de ligne ; nom de base avec virgule protégé', () => {
  const cols = Survey.CSV_COLUMNS.map((c) => c[1]);
  assert.deepStrictEqual(cols.slice(-8), ['Note', 'Source_corrections', 'Age_corr_max_s', 'Description_code', 'Type_point', 'Formule', 'Leve_origine', 'Point_origine']);
  assert.strictEqual(cols.indexOf('Station_base'), 18); // ordre historique conservé
  const csv = Survey.toCsv([{ nom: 'P1', baseId: 'BASE 1, repère', corrSrc: 'Radio (recepteur)', ageMax: 1.23 }]);
  const row = csv.split('\r\n')[1];
  assert.ok(row.includes('"BASE 1, repère"'), row);
  assert.ok(row.endsWith(',Radio (recepteur),1.2,,,,,'), row);
});

test('pilote Leica (NMEA) disponible et décodeur fonctionnel', () => {
  const d = Drivers.byId('leica-nmea');
  assert.ok(d && d.brand === 'Leica' && /Captivate/.test(d.setup));
  const got = [];
  const dec = d.createDecoder((e) => got.push(e));
  dec.pushText(Nmea.withChecksum('GNGGA,123519,4807.038,N,01131.000,E,4,08,0.9,545.4,M,46.9,M,1.0,0001') + '\r\n');
  const gga = got.find((e) => e.type === 'GGA');
  assert.ok(gga && gga.quality === 4 && gga.ageCorr === 1.0, JSON.stringify(got));
});

const Codes = require(path.join(www, 'codes.js'));

test('Pcodes : liste publique chargée ; recherche par numéro, abréviation et mot', () => {
  assert.ok(Codes.count() >= 400);
  assert.strictEqual(Codes.search('4')[0].code, '4');               // numéro exact d'abord
  assert.ok(Codes.search('40').every((c, i, l) => i === 0 || !(c.code.startsWith('40') && !l[i - 1].code.startsWith('40'))));
  const clu = Codes.search('clu');
  assert.strictEqual(clu[0].aph, 'CLU');                              // abréviation exacte en tête
  assert.ok(Codes.search('controle photo').length >= 3);              // mots, sans accents
  assert.strictEqual(Codes.byCode('1').aph, 'CPV');
});

test('Pcodes : description « Pcode String.Contrôle » décomposée et recomposée', () => {
  assert.deepStrictEqual(Codes.parseDesc('526 1.1'), { base: '526', str: '1', ctl: '.1', extra: '' });
  assert.deepStrictEqual(Codes.parseDesc('526 1.2_2.1'), { base: '526', str: '1', ctl: '.2', extra: '_2.1' });
  assert.deepStrictEqual(Codes.parseDesc('526 1_2PD_1.00'), { base: '526', str: '1', ctl: '', extra: '_2PD_1.00' });
  assert.deepStrictEqual(Codes.parseDesc('4'), { base: '4', str: '', ctl: '', extra: '' });
  assert.strictEqual(Codes.compose('526', '1', '.1'), '526 1.1');
  assert.strictEqual(Codes.compose('526', '', '.1'), '526');
  assert.strictEqual(Codes.compose('231', '1', '.6', '_3C'), '231 1.6_3C');
  assert.ok(Codes.commands().some((c) => c.code === '2PD') && Codes.CONTROLS.length === 8);
});

test('nom du levé AAMMJJSECT#NATSS : composition et vérification (NDA-001)', () => {
  const d = new Date(2026, 10, 2);
  const n = Codes.leveName({ date: d, sect: 'a005', type: '1', nat: 'exc', ss: '12' });
  assert.strictEqual(n, '261102A0051EXC12');
  assert.ok(Codes.validateLeve(n, '12').ok);
  assert.ok(!Codes.validateLeve(n, '07').ok);                         // pas votre code
  assert.ok(/16 caractères/.test(Codes.validateLeve('261102A0051EXC1').errors[0]));
  assert.ok(Codes.validateLeve('261102A0051ZZZ12').errors.some((e) => /Nature/.test(e)));
  assert.ok(Codes.validateLeve('261102A0059EXC12').errors.some((e) => /Type/.test(e)));
});

test('numéro de point AJJJSS001 : jour de l\u2019année et prochain numéro libre', () => {
  const d = new Date(2026, 10, 2);                                    // 2 novembre 2026 = jour 306
  assert.strictEqual(Codes.dayOfYear(d), 306);
  const pre = Codes.pointPrefix(d, '7');
  assert.strictEqual(pre, '630607');
  assert.strictEqual(Codes.nextPointNumber(pre, []), '630607001');
  assert.strictEqual(Codes.nextPointNumber(pre, ['630607001', '630607004', '630512009', 'P1']), '630607005');
  assert.strictEqual(Codes.pointPrefix(new Date(2030, 0, 5), '12', '9'), '900512'); // année en 0 : A fourni
});

test('reference.json : arpenteurs et natures retenus, rien d\u2019autre ; retour à la copie publique', () => {
  const kept = Codes.loadReference({ version: '2026-10-26', arpenteurs: [{ ss: 7, nom: 'Test', entite: 'AN', actif: true }],
    nat: [{ code: 'EXC', description: 'Déblai' }, { code: 'xx', description: 'mauvais' }], sharepoint: { AN: 'https://exemple' } });
  assert.deepStrictEqual(kept, { version: '2026-10-26', arpenteurs: [{ ss: '07', nom: 'Test', actif: true }], nat: [{ code: 'EXC', description: 'Déblai' }] });
  Codes.applyReference(kept);
  assert.strictEqual(Codes.arpenteur('7').nom, 'Test');
  assert.strictEqual(Codes.nat().length, 1);
  Codes.applyReference(null);
  assert.ok(Codes.nat().length >= 40 && Codes.arpenteurs().length === 0);
  assert.throws(() => Codes.loadReference({ autre: 1 }), /reference\.json/);
});

test('NDA-001 V03 : exemples officiels (605957001, 260804LOT41UTI63), plages NNN, SS 00, secteur par défaut', () => {
  assert.strictEqual(Codes.pointPrefix(new Date(2026, 1, 28), '57') + '001', '605957001');   // 10.3
  assert.ok(Codes.validateLeve('260804LOT41UTI63').ok);                                      // 10.2
  assert.ok(Codes.validateLeve('260804LOT41UTI00').errors.some((e) => /00/.test(e)));       // section 9 : 01 à 99
  const pre = '630657', jour = ['630657001', '630657002', '630657200'];
  assert.strictEqual(Codes.nextPointNumber(pre, jour, Codes.pointRange('1')), '630657003'); // levé : 001 à 199
  assert.strictEqual(Codes.nextPointNumber(pre, jour, Codes.pointRange('2')), '630657201'); // implantation : 200 à 400
  assert.strictEqual(Codes.nextPointNumber(pre, ['630657001'], Codes.pointRange('2')), '630657200');
  assert.strictEqual(Codes.nextPointNumber(pre, ['630657199'], Codes.pointRange('1')), '630657200'); // plage pleine
  assert.strictEqual(Codes.defaultSector('AN-26-005'), 'A005');                              // 5.3
  assert.strictEqual(Codes.defaultSector('MA-26-552'), 'M552');
  assert.strictEqual(Codes.defaultSector('MA-26-0495'), 'M495');
  assert.strictEqual(Codes.defaultSector('CANP'), null);
  const nat = Codes.nat().map((n) => n.code);                                                // section 8
  assert.ok(!nat.includes('TQC') && !nat.includes('TEX') && ['SIG', 'MON', 'DEC', 'ROC', 'GRF', 'GRS'].every((c) => nat.includes(c)));
});

const Cogo = require(path.join(www, 'cogo.js'));
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ' ' + a + ' ≠ ' + b);

test('COGO angles : DD.MMSS, degrés décimaux, D°M\'S", affichage', () => {
  near(Cogo.parseAngle('45.1230'), 45 + 12 / 60 + 30 / 3600, 1e-12);
  near(Cogo.parseAngle('45.123045'), 45 + 12 / 60 + 30.45 / 3600, 1e-12);
  near(Cogo.parseAngle('45.1'), 45 + 10 / 60, 1e-12);                // 45°10'
  near(Cogo.parseAngle('45,5', 'deg'), 45.5, 1e-12);
  near(Cogo.parseAngle('45°12\'30"'), 45 + 12 / 60 + 30 / 3600, 1e-12);
  near(Cogo.parseAngle('45 12 30'), 45 + 12 / 60 + 30 / 3600, 1e-12);
  assert.ok(isNaN(Cogo.parseAngle('45.6100')));                     // 61 minutes : refusé
  assert.strictEqual(Cogo.formatDMS(45 + 12 / 60 + 30 / 3600), '45°12′30″');
  assert.strictEqual(Cogo.formatDMS(359.99999999), '360°00′00″');
  assert.strictEqual(Cogo.formatDDMMSS(45 + 12 / 60 + 30.45 / 3600, 2), '45.123045');
});

test('4 Inverse : azimut, distance, dénivelé, pente ; suite et rayonnement', () => {
  const r = Cogo.inverse({ e: 1000, n: 1000, z: 100 }, { e: 1100, n: 1100, z: 102 });
  near(r.az, 45, 1e-12); near(r.dist, 141.4213562, 1e-6); near(r.dz, 2, 1e-12); near(r.slopePct, 1.41421356, 1e-6);
  near(r.azBack, 225, 1e-12);
  near(Cogo.inverse({ e: 0, n: 0 }, { e: -10, n: -10 }).az, 225, 1e-12);
  near(Cogo.inverse({ e: 0, n: 0 }, { e: -10, n: 0 }).az, 270, 1e-12);
  const pts = [{ name: '1', e: 0, n: 0 }, { name: '2', e: 0, n: 10 }, { name: '3', e: 10, n: 10 }, { name: '4', e: 10, n: 0 }];
  const ch = Cogo.inverseSeries(pts, 'chain'), ra = Cogo.inverseSeries(pts, 'radial');
  near(ch.total, 30, 1e-9); assert.deepStrictEqual(ch.legs.map((l) => l.from + '-' + l.to), ['1-2', '2-3', '3-4']);
  assert.deepStrictEqual(ra.legs.map((l) => l.from + '-' + l.to), ['1-2', '1-3', '1-4']); near(ra.legs[1].dist, Math.sqrt(200), 1e-9);
});

test('3 Loc Az : azimut-distance, angle-distance, intersections (aller-retour avec l’inverse)', () => {
  const a = { e: 250000, n: 5180000, z: 50 };
  const p = Cogo.locAz(a, Cogo.parseAngle('123.4521'), 87.654, { dz: -1.25 });
  const r = Cogo.inverse(a, p);
  near(r.az, Cogo.parseAngle('123.4521'), 1e-9); near(r.dist, 87.654, 1e-9); near(p.z, 48.75, 1e-12);
  // angle à droite de 90° depuis une référence arrière au nord : azimut 90°
  const q = Cogo.locAngle({ e: 0, n: 0 }, { e: 0, n: 50 }, 90, 10);
  near(q.e, 10, 1e-9); near(q.n, 0, 1e-9); near(q.az, 90, 1e-12);
  // azimut-azimut
  const x = Cogo.intersectAzAz({ e: 0, n: 0 }, 45, { e: 10, n: 0 }, 315);
  near(x.e, 5, 1e-9); near(x.n, 5, 1e-9);
  assert.strictEqual(Cogo.intersectAzAz({ e: 0, n: 0 }, 10, { e: 5, n: 0 }, 190), null); // parallèles
  // distance-distance : gauche / droite de A -> B
  const dd = Cogo.intersectDistDist({ e: 0, n: 0 }, 5, { e: 8, n: 0 }, 5);
  near(dd.left.e, 4, 1e-9); near(dd.left.n, 3, 1e-9); near(dd.right.n, -3, 1e-9);
  assert.strictEqual(Cogo.intersectDistDist({ e: 0, n: 0 }, 1, { e: 10, n: 0 }, 1), null);
  // azimut-distance : deux solutions le long de l'azimut
  const ad = Cogo.intersectAzDist({ e: 0, n: 0 }, 90, { e: 10, n: 3 }, 5);
  assert.strictEqual(ad.length, 2); near(ad[0].e, 6, 1e-9); near(ad[1].e, 14, 1e-9);
});

test('15 Prolonge ligne (2PD), perpendiculaire (3PP), chaînage-écart d’un point à une ligne', () => {
  const a = { e: 0, n: 0, z: 10 }, b = { e: 0, n: 100, z: 20 };
  const p = Cogo.alongLine(a, b, 120, 2);                       // prolongé au-delà de B, 2 m à droite (est)
  near(p.e, 2, 1e-9); near(p.n, 120, 1e-9); near(p.z, 22, 1e-9);
  const so = Cogo.stationOffset(a, b, { e: -3, n: 40, z: 15 });
  near(so.chainage, 40, 1e-9); near(so.offset, -3, 1e-9); near(so.dz, 1, 1e-9);  // gauche = négatif
  const f = Cogo.perpendicular(a, b, { e: 7, n: 55 });
  near(f.e, 0, 1e-9); near(f.n, 55, 1e-9); near(f.offset, 7, 1e-9);
});

test('commandes de description 2P, 2PD, 2D, 3PP, 4P, 3C, RECT (règles de Validation de levé)', () => {
  const A = { e: 0, n: 0, z: 10 }, B = { e: 0, n: 100, z: 20 };
  const m = Cogo.midpoint(A, B); near(m.n, 50, 1e-12); near(m.z, 15, 1e-12);
  const p1 = Cogo.pointAtDistance(A, B, 1, 1, 0); near(p1.n, 1, 1e-12); near(p1.z, 10.1, 1e-12);
  const p2 = Cogo.pointAtDistance(A, B, 1, 2, 0); near(p2.n, 101, 1e-12); near(p2.z, 20.1, 1e-12);
  const p3 = Cogo.pointAtDistance(A, B, -2, 2, 0.5); near(p3.n, 98, 1e-12); near(p3.e, 0.5, 1e-12);
  const D = Cogo.twoDistances({ e: 0, n: 0 }, { e: 0, n: 8 }, 5, 5);
  near(D.e, 3, 1e-9); near(D.n, 4, 1e-9);
  near(Cogo.twoDistances({ e: 0, n: 0 }, { e: 0, n: 8 }, -5, 5).e, -3, 1e-9);
  assert.strictEqual(Cogo.twoDistances({ e: 0, n: 0 }, { e: 0, n: 8 }, 1, 1), null);
  const f = Cogo.perpendicular(A, B, { e: 4, n: 30 }); near(f.n, 30, 1e-12); near(f.z, 13, 1e-12);
  const x = Cogo.intersectLines({ e: 0, n: 0 }, { e: 10, n: 10 }, { e: 0, n: 10 }, { e: 10, n: 0 });
  near(x.e, 5, 1e-12); near(x.n, 5, 1e-12);
  assert.strictEqual(Cogo.intersectLines({ e: 0, n: 0 }, { e: 1, n: 1 }, { e: 0, n: 1 }, { e: 1, n: 2 }), null);
  const c = Cogo.circleCenter({ e: 5, n: 0 }, { e: 0, n: 5 }, { e: -5, n: 0 }); near(c.e, 0, 1e-12); near(c.n, 0, 1e-12); near(c.r, 5, 1e-12);
  assert.strictEqual(Cogo.circleCenter({ e: 0, n: 0 }, { e: 1, n: 1 }, { e: 2, n: 2 }), null);
  const r = Cogo.rectCorner({ e: 0, n: 10, z: 1 }, { e: 0, n: 0, z: 2 }, { e: 20, n: 0, z: 4 });
  near(r.e, 20, 1e-12); near(r.n, 10, 1e-12); near(r.z, 3, 1e-12);
});

test('7 Superficie : carré, triangle, unités, sens de parcours indifférent', () => {
  const sq = Cogo.area([{ e: 0, n: 0 }, { e: 0, n: 100 }, { e: 100, n: 100 }, { e: 100, n: 0 }]);
  near(sq.area, 10000, 1e-9); near(sq.hectares, 1, 1e-12); near(sq.perimeter, 400, 1e-9); near(sq.sqft, 107639.104, 1e-3);
  assert.ok(sq.clockwise);
  near(Cogo.area([{ e: 0, n: 0 }, { e: 4, n: 0 }, { e: 0, n: 3 }]).area, 6, 1e-12);
  assert.strictEqual(Cogo.area([{ e: 0, n: 0 }, { e: 1, n: 1 }]), null);
});

test('facteur d’échelle MTM identique à PROJ (< 0,05 ppm) ; facteur d’altitude', () => {
  // [Est MTM 7, latitude, facteur PROJ (pyproj, EPSG:2949)]
  [[199628.3750, 46.93376176, 1.000035906465], [93795.5932, 45.5, 1.000447267507],
   [409263.9739, 48.0, 1.000034050275], [304800.0, 47.0, 0.999899999989]].forEach(([e, lat, k]) =>
    near(Cogo.mtmScale(e, lat), k, 5e-8, 'k à E=' + e));
  near(Cogo.elevationFactor(0, 47), 1, 1e-15);
  near((1 - Cogo.elevationFactor(200, 47)) * 1e6, 31.4, 0.2);          // 200 m : environ 31 ppm
});

test('COGO grades et degrés décimaux : saisie et affichage ; angle négatif = antihoraire', () => {
  near(Cogo.parseAngle('50.2315', 'gon'), 50.2315 * 0.9, 1e-12);
  near(Cogo.parseAngle('100', 'gon'), 90, 1e-12);
  assert.strictEqual(Cogo.formatAngle(90, 'gon'), '100.0000 gon');
  assert.strictEqual(Cogo.formatAngle(45.2083333, 'deg', 4), '45.2083°');
  assert.strictEqual(Cogo.formatAngle(45 + 12 / 60 + 30 / 3600, 'dms'), '45°12′30.0″');
  near(Cogo.parseAngle('-30.0000'), -30, 1e-12);
  const q = Cogo.locAngle({ e: 0, n: 0 }, { e: 0, n: 50 }, Cogo.parseAngle('-90'), 10);   // antihoraire : vers l'ouest
  near(q.e, -10, 1e-9); near(q.az, 270, 1e-12);
});

test('facteur combiné du secteur (Menarp) : moyenne des échelles × facteur de l’altitude moyenne', () => {
  const pts = [{ e: 199628.375, lat: 46.93376176, hEll: 172.6 }, { e: 199728.375, lat: 46.9346, hEll: 174.6 }, { e: 199528.375, lat: 46.933, hEll: null }];
  const s = Cogo.sectorFactor(pts);
  near(s.k, (Cogo.mtmScale(199628.375, 46.93376176) + Cogo.mtmScale(199728.375, 46.9346) + Cogo.mtmScale(199528.375, 46.933)) / 3, 1e-15);
  near(s.hMean, 173.6, 1e-9); assert.strictEqual(s.n, 3); assert.strictEqual(s.nh, 2);
  near(s.cf, s.k * Cogo.elevationFactor(173.6, (46.93376176 + 46.9346 + 46.933) / 3), 1e-15);
  near((s.cf - 1) * 1e6, 8.7, 0.3);                                   // environ +9 ppm au point d'essai (MTM 7, h ≈ 174 m)
  assert.strictEqual(Cogo.sectorFactor([]), null);
});

test('séquences de points : plages, liste, zéros conservés', () => {
  assert.deepStrictEqual(Cogo.parseSequence('1-3, 8'), ['1', '2', '3', '8']);
  assert.deepStrictEqual(Cogo.parseSequence('630663001-630663003'), ['630663001', '630663002', '630663003']);
  assert.deepStrictEqual(Cogo.parseSequence('P1-P3'), ['P1', 'P2', 'P3']);
  assert.deepStrictEqual(Cogo.parseSequence('5-3'), ['5', '4', '3']);
  assert.deepStrictEqual(Cogo.parseSequence('B1 CENT'), ['B1', 'CENT']);
});

console.log(`\n${passed} tests réussis`);
