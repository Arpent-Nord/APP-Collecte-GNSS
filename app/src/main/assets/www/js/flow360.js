/* Collecte GNSS — Arpent-Nord
 * flow360.js : export des points au format « CSV personnalisé » d'Emlid Flow 360 (42 colonnes, mêmes noms et
 * même ordre que l'export de Flow 360), pour importer nos levés dans Flow 360 tant qu'Emlid n'offre pas d'API.
 * Conventions relevées sur un export réel (261015SIMRC163.csv) :
 *   - le Pcode va dans Description (« 296 1.1 »), Code reste vide ;
 *   - Origin = Global (point mesuré) ou Local (point inscrit, calculé ou importé) ;
 *   - Antenna height = canne + décalage du récepteur, en m ; Baseline en mètres ;
 *   - dates « 2026-10-15 13:20:49.6 UTC-05:00 » (heure locale de la tablette).
 * Calcul pur, sans DOM : testé dans tests/core.test.js.
 */
(function (root) {
  'use strict';

  var COLUMNS = ['Name', 'Code', 'Code description', 'Control code', 'Easting', 'Northing', 'Elevation', 'Description',
    'Longitude', 'Latitude', 'Ellipsoidal height', 'Origin', 'Tilt angle', 'Easting RMS', 'Northing RMS', 'Elevation RMS',
    'Lateral RMS', 'Antenna height', 'Antenna height units', 'Solution status', 'Averaging start', 'Averaging end', 'Samples',
    'PDOP', 'GDOP', 'Base easting', 'Base northing', 'Base elevation', 'Base longitude', 'Base latitude',
    'Base ellipsoidal height', 'Baseline', 'Mount point', 'CS name', 'GPS Satellites', 'GLONASS Satellites',
    'Galileo Satellites', 'BeiDou Satellites', 'QZSS Satellites', 'Device type', 'Device serial number', 'Author'];

  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function fx(v, d) { return isNum(v) ? v.toFixed(d) : ''; }
  function cell(v) {
    if (v === null || v === undefined) return '';
    var s = String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  /* Statut de solution à la Flow : FIX, FLOAT, DGPS, SINGLE. */
  function solution(p) {
    var q = p.quality;
    if (q === 4) return 'FIX';
    if (q === 5) return 'FLOAT';
    if (q === 2 || q === 3) return 'DGPS';
    if (q === 1) return 'SINGLE';
    var l = String(p.qualityLabel || '').toLowerCase();
    if (/fix/.test(l)) return 'FIX';
    if (/flott|float/.test(l)) return 'FLOAT';
    if (/dgps|pps/.test(l)) return 'DGPS';
    if (/autonome|single/.test(l)) return 'SINGLE';
    return '';
  }

  /* « 2026-10-15 13:20:49.6 UTC-05:00 » ; offMin = décalage local en minutes (Est l'hiver : -300). */
  function flowDate(iso, offMin) {
    if (!iso) return '';
    var t = Date.parse(iso); if (isNaN(t)) return '';
    if (!isNum(offMin)) offMin = -new Date(t).getTimezoneOffset();
    var d = new Date(t + offMin * 60000), z = function (n, k) { n = String(n); while (n.length < (k || 2)) n = '0' + n; return n; };
    var a = Math.abs(offMin);
    return d.getUTCFullYear() + '-' + z(d.getUTCMonth() + 1) + '-' + z(d.getUTCDate()) + ' ' + z(d.getUTCHours()) + ':' +
      z(d.getUTCMinutes()) + ':' + z(d.getUTCSeconds()) + '.' + Math.floor(d.getUTCMilliseconds() / 100) +
      ' UTC' + (offMin < 0 ? '-' : '+') + z(Math.floor(a / 60)) + ':' + z(a % 60);
  }

  /* Identifiants Proj du travail tirés des systèmes notés au point (« EPSG:2949 », « EPSG:10588 (HT2_2010v70) »). */
  function jobOfPoint(p) {
    var m = /EPSG:(\d+)/.exec(p.systeme || ''), hz = m ? m[1] : 'geo', a = String(p.systemeAlti || ''), vt = 'ellips';
    if (/HT2_2010/.test(a)) vt = '10588-2010'; else if (/HT2_2002/.test(a)) vt = '10588-2002';
    else if (/10588/.test(a)) vt = '10588-sep';
    return { hz: hz, vt: vt, sep: isNum(p.sep) && vt === '10588-sep' ? p.sep : NaN };
  }

  /* Nom du système à la Flow : « NAD83(CSRS) / MTM zone 7 + CGVD28 height ». */
  function csName(p) {
    var m = /EPSG:(\d+)/.exec(p.systeme || ''), e = m ? +m[1] : null, s;
    if (e >= 2948 && e <= 2950) s = 'NAD83(CSRS) / MTM zone ' + (e - 2942);
    else if (e >= 32186 && e <= 32188) s = 'NAD83 / MTM zone ' + (e - 32180);
    else s = 'NAD83(CSRS)';
    if (/10588/.test(p.systemeAlti || '')) s += ' + CGVD28 height' + (/HT2_2002/.test(p.systemeAlti) ? ' (HT2_2002v70)' : '');
    return s;
  }

  /* ECEF -> géographiques (GRS80), itératif. */
  function ecefToGeo(x, y, z) {
    var A = 6378137.0, f = 1 / 298.257222101, e2 = f * (2 - f), r = 180 / Math.PI;
    var p = Math.sqrt(x * x + y * y), lon = Math.atan2(y, x), lat = Math.atan2(z, p * (1 - e2)), h = 0, N;
    for (var i = 0; i < 8; i++) {
      var sl = Math.sin(lat); N = A / Math.sqrt(1 - e2 * sl * sl);
      h = p / Math.cos(lat) - N;
      lat = Math.atan2(z, p * (1 - e2 * N / (N + h)));
    }
    return { lat: lat * r, lon: lon * r, h: h };
  }

  function mountOf(p) { var m = /^NTRIP\s+(\S+)/.exec(p.corrSrc || ''); return m ? m[1] : ''; }

  /* Une ligne Flow 360. opts : offMin, author, convert (Proj.convert, pour la base en plan). */
  function row(p, opts) {
    opts = opts || {};
    var mesure = !p.type || p.type === 'mesure';
    var pole = isNum(p.pole) ? p.pole : 0, apc = isNum(p.apc) ? p.apc : 0;
    var lat = isNum(p.sigmaH) ? p.sigmaH : null;
    var b = null, bp = null;
    if (mesure && p.baseEcef && isNum(p.baseEcef.x)) {
      b = ecefToGeo(p.baseEcef.x, p.baseEcef.y, p.baseEcef.z);
      if (opts.convert) { try { bp = opts.convert(b.lat, b.lon, b.h, jobOfPoint(p)); } catch (e) { bp = null; } }
    }
    var v = {
      'Name': p.nom, 'Code': '', 'Code description': '', 'Control code': '',
      'Easting': fx(p.est, 3), 'Northing': fx(p.nord, 3), 'Elevation': fx(p.alt, 3),
      'Description': p.code || '',
      'Longitude': fx(p.lon, 9), 'Latitude': fx(p.lat, 9), 'Ellipsoidal height': fx(p.hEll, 3),
      'Origin': mesure ? 'Global' : 'Local', 'Tilt angle': '',
      // RMS : la précision H retenue (la plus pessimiste) répartie également sur Est et Nord.
      'Easting RMS': mesure && lat !== null ? (lat / Math.SQRT2).toFixed(3) : '',
      'Northing RMS': mesure && lat !== null ? (lat / Math.SQRT2).toFixed(3) : '',
      'Elevation RMS': mesure ? fx(p.sigmaV, 3) : '',
      'Lateral RMS': mesure && lat !== null ? lat.toFixed(3) : '',
      'Antenna height': mesure ? (pole + apc).toFixed(3) : '', 'Antenna height units': mesure ? 'm' : '',
      'Solution status': mesure ? solution(p) : '',
      'Averaging start': mesure ? flowDate(p.start, opts.offMin) : '', 'Averaging end': mesure ? flowDate(p.end, opts.offMin) : '',
      'Samples': mesure && isNum(p.n) ? String(p.n) : '',
      'PDOP': mesure ? fx(p.pdop, 1) : '', 'GDOP': '',
      'Base easting': bp ? fx(bp.e, 3) : '', 'Base northing': bp ? fx(bp.n, 3) : '', 'Base elevation': bp ? fx(bp.z, 3) : '',
      'Base longitude': b ? b.lon.toFixed(9) : '', 'Base latitude': b ? b.lat.toFixed(9) : '', 'Base ellipsoidal height': b ? b.h.toFixed(3) : '',
      'Baseline': mesure && isNum(p.baseKm) ? (p.baseKm * 1000).toFixed(3) : '',
      'Mount point': mesure ? mountOf(p) : '',
      'CS name': csName(p),
      'GPS Satellites': '', 'GLONASS Satellites': '', 'Galileo Satellites': '', 'BeiDou Satellites': '', 'QZSS Satellites': '',
      'Device type': mesure ? (p.recepteur || '') : '', 'Device serial number': '',
      'Author': opts.author || ''
    };
    return COLUMNS.map(function (c) { return cell(v[c]); }).join(',');
  }

  function toCsv(points, opts) {
    var lines = [COLUMNS.join(',')];
    (points || []).forEach(function (p) { lines.push(row(p, opts)); });
    return lines.join('\r\n') + '\r\n';
  }

  var api = { COLUMNS: COLUMNS, toCsv: toCsv, row: row, flowDate: flowDate, csName: csName, solution: solution, ecefToGeo: ecefToGeo, jobOfPoint: jobOfPoint };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Flow360 = api;
})(typeof window !== 'undefined' ? window : globalThis);
