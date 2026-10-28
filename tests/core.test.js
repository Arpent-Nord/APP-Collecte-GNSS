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
    if (s.type === 'GST') gst = s;
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

console.log(`\n${passed} tests réussis`);
