/* Collecte GNSS — Arpent-Nord
 * proj.js : systèmes de coordonnées du travail.
 *  - Projection Mercator transverse (série de Krüger, précision sous le millimètre) : MTM zones 6, 7, 8.
 *  - Systèmes : NAD83(SCRS) EPSG 2948/2949/2950, NAD83 EPSG 32186/32187/32188.
 *  - Altitudes : CGVD28 (HTv2.0), EPSG 10588, par grille HT2_2002v70 ou par séparation fixe du chantier.
 * Les positions reçues du récepteur sont dans le système des corrections (SmartNet : NAD83(SCRS)).
 */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- GRS80 (NAD83 et NAD83(SCRS))
  var A_GRS80 = 6378137.0, F_GRS80 = 1 / 298.257222101;

  function TransverseMercator(lon0, k0, x0, y0, a, f) {
    a = a || A_GRS80; f = f || F_GRS80;
    var n = f / (2 - f), n2 = n * n, n3 = n2 * n, n4 = n3 * n;
    this.lon0 = lon0 * Math.PI / 180; this.k0 = k0; this.x0 = x0; this.y0 = y0;
    this.A = a / (1 + n) * (1 + n2 / 4 + n4 / 64);
    this.e2n = 2 * Math.sqrt(n) / (1 + n);
    this.alpha = [n / 2 - 2 * n2 / 3 + 5 * n3 / 16 + 41 * n4 / 180,
      13 * n2 / 48 - 3 * n3 / 5 + 557 * n4 / 1440,
      61 * n3 / 240 - 103 * n4 / 140,
      49561 * n4 / 161280];
    this.beta = [n / 2 - 2 * n2 / 3 + 37 * n3 / 96 - n4 / 360,
      n2 / 48 + n3 / 15 - 437 * n4 / 1440,
      17 * n3 / 480 - 37 * n4 / 840,
      4397 * n4 / 161280];
    this.delta = [2 * n - 2 * n2 / 3 - 2 * n3 + 116 * n4 / 45,
      7 * n2 / 3 - 8 * n3 / 5 - 227 * n4 / 45,
      56 * n3 / 15 - 136 * n4 / 35,
      4279 * n4 / 630];
  }
  function atanh(x) { return 0.5 * Math.log((1 + x) / (1 - x)); }
  function sinh(x) { return (Math.exp(x) - Math.exp(-x)) / 2; }
  function cosh(x) { return (Math.exp(x) + Math.exp(-x)) / 2; }

  /* (lat, lon) en degrés -> {e, n} en mètres */
  TransverseMercator.prototype.forward = function (lat, lon) {
    var phi = lat * Math.PI / 180, lam = lon * Math.PI / 180 - this.lon0;
    var s = Math.sin(phi);
    var t = sinh(atanh(s) - this.e2n * atanh(this.e2n * s));
    var xi = Math.atan2(t, Math.cos(lam));
    var eta = atanh(Math.sin(lam) / Math.sqrt(1 + t * t));
    var X = eta, Y = xi;
    for (var j = 1; j <= 4; j++) {
      var a = this.alpha[j - 1];
      X += a * Math.cos(2 * j * xi) * sinh(2 * j * eta);
      Y += a * Math.sin(2 * j * xi) * cosh(2 * j * eta);
    }
    return { e: this.x0 + this.k0 * this.A * X, n: this.y0 + this.k0 * this.A * Y };
  };

  /* {e, n} en mètres -> {lat, lon} en degrés (servira à l'implantation) */
  TransverseMercator.prototype.inverse = function (e, n) {
    var xi = (n - this.y0) / (this.k0 * this.A), eta = (e - this.x0) / (this.k0 * this.A);
    var xp = xi, ep = eta;
    for (var j = 1; j <= 4; j++) {
      var b = this.beta[j - 1];
      xp -= b * Math.sin(2 * j * xi) * cosh(2 * j * eta);
      ep -= b * Math.cos(2 * j * xi) * sinh(2 * j * eta);
    }
    var chi = Math.asin(Math.sin(xp) / cosh(ep));
    var phi = chi;
    for (j = 1; j <= 4; j++) phi += this.delta[j - 1] * Math.sin(2 * j * chi);
    var lam = this.lon0 + Math.atan2(sinh(ep), Math.cos(xp));
    return { lat: phi * 180 / Math.PI, lon: lam * 180 / Math.PI };
  };

  function mtm(zone) { return new TransverseMercator(-(49.5 + 3 * zone), 0.9999, 304800, 0); }
  function mtmZoneFor(lon) { return Math.round((-lon - 49.5) / 3); }

  // ---------------------------------------------------------------- Systèmes offerts
  var HORIZONTAL = [
    { id: 'geo', epsg: null, label: 'Géographiques seulement (lat., long.)', zone: null, datum: 'SCRS' },
    { id: '2948', epsg: 2948, label: 'NAD83(SCRS) / MTM 6 — EPSG 2948', zone: 6, datum: 'SCRS' },
    { id: '2949', epsg: 2949, label: 'NAD83(SCRS) / MTM 7 — EPSG 2949', zone: 7, datum: 'SCRS' },
    { id: '2950', epsg: 2950, label: 'NAD83(SCRS) / MTM 8 — EPSG 2950', zone: 8, datum: 'SCRS' },
    { id: '32186', epsg: 32186, label: 'NAD83 / MTM 6 — EPSG 32186', zone: 6, datum: 'NAD83', grid: 'NA83SCRS' },
    { id: '32187', epsg: 32187, label: 'NAD83 / MTM 7 — EPSG 32187', zone: 7, datum: 'NAD83', grid: 'NA83SCRS' },
    { id: '32188', epsg: 32188, label: 'NAD83 / MTM 8 — EPSG 32188', zone: 8, datum: 'NAD83', grid: 'NA83SCRS' }
  ];
  var VERTICAL = [
    { id: 'ellips', label: 'Hauteur ellipsoïdale seulement' },
    { id: '10588-2010', epsg: 10588, label: 'CGVD28 (HTv2.0) — modèle HT2_2010v70 — EPSG 10588', grid: 'HT2_2010v70' },
    { id: '10588-2002', epsg: 10588, label: 'CGVD28 (HTv2.0) — modèle HT2_2002v70 — EPSG 10588', grid: 'HT2_2002v70' },
    { id: '10588-sep', epsg: 10588, label: 'CGVD28 (HTv2.0) — séparation fixe du chantier' }
  ];

  // ---------------------------------------------------------------- Grilles (ajoutées plus tard en fichiers grids/*.js)
  var GRIDS = {};
  /* Grille d'ondulation : { name, lat0, lon0 (coin sud-ouest), dlat, dlon (degrés), rows, cols,
   *   scale (m par unité), values : tableau (rangées du sud au nord) } */
  function b64bytes(b64) {
    if (typeof atob === 'function') {
      var bin = atob(b64), out = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  /* values : tableau, ou chaîne base64 d'entiers « little-endian » (type 'int16' ou 'int32'). */
  function decodeInts(b64, size) {
    var b = b64bytes(b64), dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    var n = b.length / size, arr = new Int32Array(n);
    for (var i = 0; i < n; i++) arr[i] = size === 2 ? dv.getInt16(2 * i, true) : dv.getInt32(4 * i, true);
    return arr;
  }
  function registerGrid(g) {
    if (g && g.type === 'ntv2') {
      g.subgrids.forEach(function (sg) {
        if (typeof sg.dlat === 'string') { sg.dlat = decodeInts(sg.dlat, 2); sg.dlon = decodeInts(sg.dlon, 2); }
      });
      GRIDS[g.name] = g;
      return;
    }
    if (g && typeof g.values === 'string') {
      var b = b64bytes(g.values), dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
      var size = g.type === 'int16' ? 2 : 4, n = b.length / size, arr = new Int32Array(n);
      for (var i = 0; i < n; i++) arr[i] = size === 2 ? dv.getInt16(2 * i, true) : dv.getInt32(4 * i, true);
      g.values = arr;
    }
    GRIDS[g.name] = g;
  }
  function hasGrid(name) { return !!GRIDS[name]; }

  /* Interpolation bilinéaire ; null hors de la grille. */
  function gridValue(name, lat, lon) {
    var g = GRIDS[name];
    if (!g) return null;
    var fr = (lat - g.lat0) / g.dlat, fc = (lon - g.lon0) / g.dlon;
    var r = Math.floor(fr), c = Math.floor(fc);
    if (r < 0 || c < 0 || r >= g.rows - 1 || c >= g.cols - 1) return null;
    var dr = fr - r, dc = fc - c, v = g.values, w = g.cols;
    var v00 = v[r * w + c], v01 = v[r * w + c + 1], v10 = v[(r + 1) * w + c], v11 = v[(r + 1) * w + c + 1];
    if (g.nodata !== undefined && (v00 === g.nodata || v01 === g.nodata || v10 === g.nodata || v11 === g.nodata)) return null;
    return (((v00 * (1 - dc) + v01 * dc) * (1 - dr) + (v10 * (1 - dc) + v11 * dc) * dr) + (g.offset || 0)) * g.scale;
  }

  // ---------------------------------------------------------------- NTv2 (NAD83 <-> NAD83(SCRS))
  /* Décalages NTv2 au point (lat, lon en degrés) : { dlat, dlon } en secondes, dlon positif vers l'ouest.
   * On descend dans la sous-grille la plus fine qui contient le point (comme PROJ). */
  function ntv2Shift(name, lat, lon) {
    var g = GRIDS[name];
    if (!g) return null;
    var y = lat * 3600, x = -lon * 3600;
    function inside(sg) { return y >= sg.sLat && y <= sg.nLat && x >= sg.eLon && x <= sg.wLon; }
    var cur = null, i;
    for (i = 0; i < g.subgrids.length; i++) if (g.subgrids[i].parent === 'NONE' && inside(g.subgrids[i])) { cur = g.subgrids[i]; break; }
    if (!cur) return null;
    for (var found = true; found;) {
      found = false;
      for (i = 0; i < g.subgrids.length; i++) {
        var sg = g.subgrids[i];
        if (sg.parent === cur.name && inside(sg)) { cur = sg; found = true; break; }
      }
    }
    var fc = (x - cur.eLon) / cur.lonInc, fr = (y - cur.sLat) / cur.latInc;
    var c = Math.min(Math.floor(fc), cur.cols - 2), r = Math.min(Math.floor(fr), cur.rows - 2);
    var dc = fc - c, dr = fr - r, w = cur.cols, k = r * w + c;
    function bil(a) { return ((a[k] * (1 - dc) + a[k + 1] * dc) * (1 - dr) + (a[k + w] * (1 - dc) + a[k + w + 1] * dc) * dr) * g.scale; }
    return { dlat: bil(cur.dlat), dlon: bil(cur.dlon), sub: cur.name };
  }
  /* NAD83 (1986) -> NAD83(SCRS) */
  function nad83ToCsrs(lat, lon) {
    var s = ntv2Shift('NA83SCRS', lat, lon);
    return s ? { lat: lat + s.dlat / 3600, lon: lon - s.dlon / 3600, sub: s.sub } : null;
  }
  /* NAD83(SCRS) -> NAD83 (1986) : inverse par itérations (comme PROJ). */
  function csrsToNad83(lat, lon) {
    var la = lat, lo = lon, s = null;
    for (var i = 0; i < 6; i++) {
      s = ntv2Shift('NA83SCRS', la, lo);
      if (!s) return null;
      la = lat - s.dlat / 3600; lo = lon + s.dlon / 3600;
    }
    return { lat: la, lon: lo, sub: s.sub };
  }

  function horizontalById(id) { for (var i = 0; i < HORIZONTAL.length; i++) if (HORIZONTAL[i].id === id) return HORIZONTAL[i]; return HORIZONTAL[0]; }
  function verticalById(id) { for (var i = 0; i < VERTICAL.length; i++) if (VERTICAL[i].id === id) return VERTICAL[i]; return VERTICAL[0]; }
  function available(sys) { return !sys.grid || hasGrid(sys.grid); }

  /* Convertit une position (lat, lon, hEll en NAD83(SCRS)) selon le travail.
   * job : { hz: id, vt: id, sep: séparation fixe (N, m, négative au Québec) }
   * Retour : { e, n, z, zSource, hzLabel, vtLabel, warn } */
  function convert(lat, lon, hEll, job) {
    var hz = horizontalById(job.hz), vt = verticalById(job.vt);
    var out = { e: null, n: null, z: null, N: null, hz: hz, vt: vt, warn: '' };
    if (hz.zone && available(hz)) {
      var la = lat, lo = lon, ok = true;
      if (hz.datum === 'NAD83') {
        var c83 = csrsToNad83(lat, lon);
        if (c83) { la = c83.lat; lo = c83.lon; } else { ok = false; out.warn = 'Hors de la grille NA83SCRS'; }
      }
      if (ok) {
        var p = mtm(hz.zone).forward(la, lo);
        out.e = p.e; out.n = p.n;
      }
      var zGood = mtmZoneFor(lon);
      if (zGood !== hz.zone) out.warn = 'Position en zone MTM ' + zGood + ', travail en zone ' + hz.zone;
    } else if (hz.zone) {
      out.warn = 'Grille ' + hz.grid + ' non installée : coordonnées planes non calculées';
    }
    if (hEll !== null && hEll !== undefined) {
      if (vt.grid) {
        var N = gridValue(vt.grid, lat, lon);
        if (N !== null) { out.N = N; out.z = hEll - N; }
        else out.warn = (out.warn ? out.warn + ' · ' : '') + (hasGrid(vt.grid) ? 'Hors de la grille ' + vt.grid : 'Grille ' + vt.grid + ' non installée');
      } else if (vt.id === '10588-sep' && job.sep !== null && job.sep !== undefined && !isNaN(job.sep)) {
        out.N = job.sep; out.z = hEll - job.sep;
      }
    }
    return out;
  }

  var api = {
    TransverseMercator: TransverseMercator, mtm: mtm, mtmZoneFor: mtmZoneFor,
    HORIZONTAL: HORIZONTAL, VERTICAL: VERTICAL, horizontalById: horizontalById, verticalById: verticalById,
    available: available, registerGrid: registerGrid, hasGrid: hasGrid, gridValue: gridValue, convert: convert,
    ntv2Shift: ntv2Shift, nad83ToCsrs: nad83ToCsrs, csrsToNad83: csrsToNad83
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Proj = api;
  if (root.PENDING_GRIDS) root.PENDING_GRIDS.forEach(registerGrid);
})(typeof window !== 'undefined' ? window : globalThis);
