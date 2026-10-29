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

console.log(`\n${passed} tests réussis`);
