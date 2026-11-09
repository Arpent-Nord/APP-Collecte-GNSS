/* Collecte GNSS — Arpent-Nord
 * cogo.js : calculs d'arpentage dans le plan du système de travail (Est, Nord, Z).
 * Raccourcis repris de Menarp (Roger Perreault, Développement Darp) : 1 Enregistre, 2 Liste, 3 Loc Az (création de points),
 * 4 Inverse, 7 Superficie, 15 Prolonge ligne. Fonctions pures, sans interface : testées par tests/core.test.js.
 *
 * Conventions : azimut compté du nord, sens horaire, de 0 à 360°. Distances en mètres.
 * Les distances « grille » sont celles du plan MTM ; les distances « sol » tiennent compte du facteur d'échelle
 * de la projection et du facteur d'altitude (facteur combiné).
 */
(function (root) {
  'use strict';
  var RAD = Math.PI / 180;

  // ---------- Angles ----------
  function norm360(a) { a = a % 360; return a < 0 ? a + 360 : a; }

  /* Lecture d'un angle. Formats :
   *  - 'dms'  : DD.MMSS (ex. 45.1230 = 45°12'30", 45.123045 = 45°12'30,45")  — convention des calculatrices d'arpentage
   *  - 'deg'  : degrés décimaux (ex. 45.208333)
   *  - 'gon'  : grades, 400 au cercle (ex. 50.2315)
   *  Accepte aussi 45°12'30", 45 12 30, la virgule décimale et un signe. Retourne des degrés décimaux, ou NaN. */
  function parseAngle(txt, mode) {
    var s = String(txt == null ? '' : txt).trim().replace(',', '.');
    if (!s) return NaN;
    var neg = /^-/.test(s); if (neg) s = s.slice(1);
    var m = /^(\d+(?:\.\d+)?)\s*[°d ]\s*(\d+(?:\.\d+)?)?\s*['m ]?\s*(\d+(?:\.\d+)?)?\s*(?:"|''|s)?$/.exec(s);
    var v;
    if (m && /[°d' ]/.test(s)) v = +m[1] + (m[2] ? +m[2] / 60 : 0) + (m[3] ? +m[3] / 3600 : 0);
    else if (/^\d+(\.\d*)?$/.test(s)) {
      if (mode === 'deg') v = +s;
      else if (mode === 'gon') v = +s * 0.9;
      else {
        var p = s.split('.'), d = +p[0], f = (p[1] || '') + '0000';
        var mm = +f.slice(0, 2), ss = +(f.slice(2, 4) + '.' + f.slice(4).replace(/0+$/, '') || 0);
        if (mm >= 60 || ss >= 60) return NaN;
        v = d + mm / 60 + ss / 3600;
      }
    } else return NaN;
    return neg ? -v : v;
  }
  /* 45.208333 -> 45°12'30" (secondes à 'dec' décimales) */
  function formatDMS(deg, dec) {
    dec = dec === undefined ? 0 : dec;
    var neg = deg < 0; deg = Math.abs(deg);
    var tot = Math.round(deg * 3600 * Math.pow(10, dec)) / Math.pow(10, dec);
    var d = Math.floor(tot / 3600), m = Math.floor((tot - d * 3600) / 60), s = tot - d * 3600 - m * 60;
    var ss = s.toFixed(dec); if (s < 10) ss = '0' + ss;
    return (neg ? '-' : '') + d + '°' + (m < 10 ? '0' : '') + m + '′' + ss + '″';
  }
  /* 45.208333 -> "45.1230" (format DD.MMSS) */
  function formatDDMMSS(deg, dec) {
    dec = dec === undefined ? 0 : dec;
    var neg = deg < 0; deg = Math.abs(deg);
    var tot = Math.round(deg * 3600 * Math.pow(10, dec)) / Math.pow(10, dec);
    var d = Math.floor(tot / 3600), m = Math.floor((tot - d * 3600) / 60), s = tot - d * 3600 - m * 60;
    var ss = s.toFixed(dec).replace('.', ''); if (s < 10) ss = '0' + ss;
    return (neg ? '-' : '') + d + '.' + (m < 10 ? '0' : '') + m + ss;
  }

  /* Affichage selon le format choisi : 'dms' -> 45°12′30.0″, 'deg' -> 45.208333°, 'gon' -> 50.2315 gon. */
  function formatAngle(deg, mode, dec) {
    if (mode === 'deg') return deg.toFixed(dec === undefined ? 6 : dec) + '°';
    if (mode === 'gon') return (deg / 0.9).toFixed(dec === undefined ? 4 : dec) + ' gon';
    return formatDMS(deg, dec === undefined ? 1 : dec);
  }

  // ---------- Base ----------
  function azimuth(a, b) { return norm360(Math.atan2(b.e - a.e, b.n - a.n) / RAD); }
  function hdist(a, b) { return Math.hypot(b.e - a.e, b.n - a.n); }
  function polar(a, az, d) { return { e: a.e + d * Math.sin(az * RAD), n: a.n + d * Math.cos(az * RAD) }; }
  function hasZ(p) { return p && p.z !== null && p.z !== undefined && !isNaN(p.z); }

  /* Inverse A -> B : azimut, distance horizontale, dénivelé, pente, distance inclinée, azimut inverse. */
  function inverse(a, b) {
    var d = hdist(a, b), dz = hasZ(a) && hasZ(b) ? b.z - a.z : null;
    return {
      az: azimuth(a, b), azBack: norm360(azimuth(a, b) + 180), dist: d, de: b.e - a.e, dn: b.n - a.n, dz: dz,
      slopePct: dz !== null && d > 0 ? dz / d * 100 : null,
      ratio: dz !== null && dz !== 0 ? Math.abs(d / dz) : null,
      slopeDist: dz !== null ? Math.hypot(d, dz) : null
    };
  }
  /* Inverse d'une suite : 'chain' = 1-2, 2-3, 3-4… ; 'radial' = 1-2, 1-3, 1-4… */
  function inverseSeries(pts, mode) {
    var out = [];
    for (var i = 1; i < pts.length; i++) {
      var a = mode === 'radial' ? pts[0] : pts[i - 1], b = pts[i];
      var r = inverse(a, b); r.from = a.name; r.to = b.name; out.push(r);
    }
    var tot = 0; out.forEach(function (r) { tot += r.dist; });
    return { legs: out, total: tot };
  }

  // ---------- Création de points (3 Loc Az et variantes) ----------
  /* Azimut + distance (+ dénivelé ou pente). */
  function locAz(a, az, d, opt) {
    opt = opt || {};
    var p = polar(a, az, d);
    p.z = zFrom(a, d, opt);
    return p;
  }
  function zFrom(a, d, opt) {
    if (!hasZ(a)) return opt.z !== undefined ? opt.z : null;
    if (opt.dz !== undefined && opt.dz !== null && !isNaN(opt.dz)) return a.z + opt.dz;
    if (opt.slopePct !== undefined && opt.slopePct !== null && !isNaN(opt.slopePct)) return a.z + d * opt.slopePct / 100;
    return opt.keepZ ? a.z : null;
  }
  /* Angle + distance à partir d'une station et d'une référence arrière (angle mesuré à droite, sens horaire). */
  function locAngle(station, back, angle, d, opt) {
    var az = norm360(azimuth(station, back) + angle);
    var p = locAz(station, az, d, opt); p.az = az;
    return p;
  }
  /* Intersection de deux azimuts. null si parallèles. */
  function intersectAzAz(a, azA, b, azB) {
    var ua = { e: Math.sin(azA * RAD), n: Math.cos(azA * RAD) }, ub = { e: Math.sin(azB * RAD), n: Math.cos(azB * RAD) };
    var den = ua.e * ub.n - ua.n * ub.e;
    if (Math.abs(den) < 1e-12) return null;
    var t = ((b.e - a.e) * ub.n - (b.n - a.n) * ub.e) / den;
    return { e: a.e + t * ua.e, n: a.n + t * ua.n, t: t };
  }
  /* Intersection de deux distances : deux solutions, gauche et droite de A -> B. */
  function intersectDistDist(a, ra, b, rb) {
    var d = hdist(a, b);
    if (d === 0 || d > ra + rb + 1e-9 || d < Math.abs(ra - rb) - 1e-9) return null;
    var x = (ra * ra - rb * rb + d * d) / (2 * d), h = Math.sqrt(Math.max(0, ra * ra - x * x));
    var ue = (b.e - a.e) / d, un = (b.n - a.n) / d;
    var m = { e: a.e + x * ue, n: a.n + x * un };
    // gauche de A->B : rotation de +90° dans le sens antihoraire (vers l'ouest quand on va au nord)
    return { left: { e: m.e - h * un, n: m.n + h * ue }, right: { e: m.e + h * un, n: m.n - h * ue } };
  }
  /* Intersection azimut (depuis A) et distance (depuis B) : 0, 1 ou 2 solutions, triées le long de l'azimut. */
  function intersectAzDist(a, azA, b, rb) {
    var u = { e: Math.sin(azA * RAD), n: Math.cos(azA * RAD) };
    var fe = a.e - b.e, fn = a.n - b.n;
    var bq = 2 * (fe * u.e + fn * u.n), c = fe * fe + fn * fn - rb * rb, disc = bq * bq - 4 * c;
    if (disc < -1e-9) return [];
    var s = Math.sqrt(Math.max(0, disc)), t1 = (-bq - s) / 2, t2 = (-bq + s) / 2;
    var sols = [{ e: a.e + t1 * u.e, n: a.n + t1 * u.n, t: t1 }];
    if (s > 1e-9) sols.push({ e: a.e + t2 * u.e, n: a.n + t2 * u.n, t: t2 });
    return sols;
  }

  // ---------- Lignes ----------
  /* Position d'un point par rapport à la ligne A -> B : chaînage (pm, depuis A) et écart (déport, + à droite). */
  function stationOffset(a, b, p) {
    var d = hdist(a, b); if (d === 0) return null;
    var ue = (b.e - a.e) / d, un = (b.n - a.n) / d, de = p.e - a.e, dn = p.n - a.n;
    var ch = de * ue + dn * un, off = de * un - dn * ue;
    var zLine = hasZ(a) && hasZ(b) ? a.z + (b.z - a.z) * ch / d : null;
    return { chainage: ch, offset: off, dz: zLine !== null && hasZ(p) ? p.z - zLine : null, length: d };
  }
  /* 15 Prolonge ligne (2PD) : point à une distance le long de A -> B (négative = avant A), avec déport (+ à droite). */
  function alongLine(a, b, dist, offset) {
    var d = hdist(a, b); if (d === 0) return null;
    var ue = (b.e - a.e) / d, un = (b.n - a.n) / d; offset = offset || 0;
    var z = hasZ(a) && hasZ(b) ? a.z + (b.z - a.z) * dist / d : null;
    return { e: a.e + dist * ue + offset * un, n: a.n + dist * un - offset * ue, z: z };
  }
  /* Pied de la perpendiculaire de P sur A-B (3PP). */
  function perpendicular(a, b, p) {
    var so = stationOffset(a, b, p); if (!so) return null;
    var f = alongLine(a, b, so.chainage, 0); f.chainage = so.chainage; f.offset = so.offset;
    return f;
  }

  // ---------- 7 Superficie ----------
  /* Polygone fermé automatiquement. Superficie (formule de l'arpenteur), périmètre. */
  function area(pts) {
    if (pts.length < 3) return null;
    var s = 0, per = 0;
    for (var i = 0; i < pts.length; i++) {
      var a = pts[i], b = pts[(i + 1) % pts.length];
      s += a.e * b.n - b.e * a.n; per += hdist(a, b);
    }
    var A = Math.abs(s) / 2;
    return { area: A, perimeter: per, hectares: A / 10000, sqft: A / 0.09290304, acres: A / 4046.8564224, clockwise: s < 0 };
  }

  // ---------- Facteurs grille / sol (MTM) ----------
  var A_GRS80 = 6378137, F_GRS80 = 1 / 298.257222101, E2 = F_GRS80 * (2 - F_GRS80);
  function meanRadius(latDeg) {
    var s = Math.sin(latDeg * RAD), w = 1 - E2 * s * s;
    var M = A_GRS80 * (1 - E2) / Math.pow(w, 1.5), N = A_GRS80 / Math.sqrt(w);
    return Math.sqrt(M * N);
  }
  /* Facteur d'échelle de la projection MTM au point (k0 = 0,9999, X0 = 304 800 m). */
  function mtmScale(e, latDeg) {
    var R = meanRadius(latDeg), x = (e - 304800) / 0.9999;
    return 0.9999 * (1 + x * x / (2 * R * R) + x * x * x * x / (24 * R * R * R * R));
  }
  /* Facteur d'altitude : rayon / (rayon + hauteur ellipsoïdale). */
  function elevationFactor(hEll, latDeg) { var R = meanRadius(latDeg); return R / (R + (hEll || 0)); }
  /* Facteur combiné : distance grille = distance sol × facteur. */
  function combinedFactor(e, latDeg, hEll) { return mtmScale(e, latDeg) * elevationFactor(hEll, latDeg); }
  /* Facteur du secteur de travail (comme Menarp) : moyenne des facteurs d'échelle des points × facteur de
   * l'altitude moyenne. pts : [{ e, lat, hEll }] ; les points sans hauteur ne comptent pas dans la moyenne d'altitude. */
  function sectorFactor(pts) {
    var ks = 0, nk = 0, hs = 0, nh = 0, lat = 0;
    pts.forEach(function (p) {
      if (p.e === null || p.e === undefined || p.lat === null || p.lat === undefined) return;
      ks += mtmScale(p.e, p.lat); lat += p.lat; nk++;
      if (p.hEll !== null && p.hEll !== undefined && !isNaN(p.hEll)) { hs += p.hEll; nh++; }
    });
    if (!nk) return null;
    var k = ks / nk, h = nh ? hs / nh : 0, ef = elevationFactor(h, lat / nk);
    return { k: k, hMean: h, ef: ef, cf: k * ef, n: nk, nh: nh };
  }

  // ---------- Séquences de points ----------
  /* « 1-5, 8, 10 » ou « P1, P2 » -> liste de noms ; les plages numériques sont développées (même longueur de zéros). */
  function parseSequence(txt) {
    var out = [];
    String(txt || '').split(/[,;\s]+/).filter(Boolean).forEach(function (tok) {
      var m = /^(\D*)(\d+)-(\D*)(\d+)$/.exec(tok);
      if (m && (m[1] === m[3] || !m[3])) {
        var a = +m[2], b = +m[4], w = m[2].length, step = a <= b ? 1 : -1;
        if (Math.abs(b - a) > 5000) { out.push(tok); return; }
        for (var i = a; step > 0 ? i <= b : i >= b; i += step) {
          var s = String(i); while (s.length < w) s = '0' + s; out.push(m[1] + s);
        }
      } else out.push(tok);
    });
    return out;
  }

  var COMMANDS = [
    { n: 1, id: 'enregistre', label: 'Enregistre', desc: 'Inscrire un point, importer un fichier de points' },
    { n: 2, id: 'liste', label: 'Liste', desc: 'Lister, filtrer, comparer à une ligne, exporter' },
    { n: 3, id: 'locaz', label: 'Loc Az', desc: 'Créer un point : azimut, angle, intersections' },
    { n: 4, id: 'inverse', label: 'Inverse', desc: 'Entre 2 points, en suite ou en rayonnement' },
    { n: 7, id: 'superficie', label: 'Superficie', desc: 'Superficie et périmètre d’un polygone' },
    { n: 15, id: 'prolonge', label: 'Prolonge ligne', desc: 'Point sur une ligne (2PD), perpendiculaire (3PP)' }
  ];

  var api = {
    parseAngle: parseAngle, formatDMS: formatDMS, formatAngle: formatAngle, sectorFactor: sectorFactor, formatDDMMSS: formatDDMMSS, norm360: norm360,
    azimuth: azimuth, hdist: hdist, inverse: inverse, inverseSeries: inverseSeries,
    locAz: locAz, locAngle: locAngle, intersectAzAz: intersectAzAz, intersectDistDist: intersectDistDist, intersectAzDist: intersectAzDist,
    stationOffset: stationOffset, alongLine: alongLine, perpendicular: perpendicular, area: area,
    mtmScale: mtmScale, elevationFactor: elevationFactor, combinedFactor: combinedFactor, parseSequence: parseSequence,
    COMMANDS: COMMANDS
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Cogo = api;
})(typeof window !== 'undefined' ? window : globalThis);
