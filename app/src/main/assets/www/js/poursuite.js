/* Collecte GNSS — Arpent-Nord
 * poursuite.js : propose la ligne (string) que l'opérateur est en train de rejoindre.
 * Chaque ligne ouverte attend son prochain point dans le prolongement de ses derniers points
 * (droite : 2 derniers points ; courbe en cours : cercle des 3 derniers). Selon la position du récepteur,
 * on mesure l'écart de côté (lat) et l'avance le long du prolongement (along), puis on classe les lignes.
 * Calcul pur, sans dépendance : une vingtaine de lignes par seconde ne coûte presque rien.
 */
(function (root) {
  'use strict';
  var MAXD = 150;          // m : au-delà, une ligne n'est pas proposée
  var HYST = 0.3;          // m : marge avant de changer de suggestion (évite le va-et-vient)
  var AMBIG = 0.25;        // m : deux lignes plus proches que ça au pointage = ambigu

  function norm(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a <= -Math.PI) a += 2 * Math.PI; return a; }
  function circle3(a, b, c) {
    var d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
    if (Math.abs(d) < 1e-9) return null;
    var a2 = a[0] * a[0] + a[1] * a[1], b2 = b[0] * b[0] + b[1] * b[1], c2 = c[0] * c[0] + c[1] * c[1];
    var x = (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d;
    var y = (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d;
    return { x: x, y: y, r: Math.hypot(a[0] - x, a[1] - y) };
  }
  /* c = { key, pts: [[e, n], …] (dernier point à la fin), curve: bool } ; me = [e, n]. */
  function evalOne(c, me) {
    var n = c.pts.length, last = c.pts[n - 1];
    var r = { key: c.key, d: Math.hypot(me[0] - last[0], me[1] - last[1]), lat: null, along: null, mode: 'point' };
    if (n >= 3 && c.curve) {
      var C = circle3(c.pts[n - 3], c.pts[n - 2], last);
      if (C && C.r < 5000) {
        var a1 = Math.atan2(c.pts[n - 2][1] - C.y, c.pts[n - 2][0] - C.x), a2 = Math.atan2(last[1] - C.y, last[0] - C.x), am = Math.atan2(me[1] - C.y, me[0] - C.x);
        var sens = norm(a2 - a1) >= 0 ? 1 : -1;
        r.lat = Math.abs(Math.hypot(me[0] - C.x, me[1] - C.y) - C.r); r.along = norm(am - a2) * sens * C.r; r.mode = 'courbe';
      }
    }
    if (r.mode === 'point' && n >= 2) {
      var dx = last[0] - c.pts[n - 2][0], dy = last[1] - c.pts[n - 2][1], l = Math.hypot(dx, dy);
      if (l > 1e-6) {
        var ux = dx / l, uy = dy / l, vx = me[0] - last[0], vy = me[1] - last[1];
        r.along = vx * ux + vy * uy; r.lat = Math.abs(vx * uy - vy * ux); r.mode = 'ligne';
      }
    }
    // pointage en mètres : l'écart de côté compte le plus, l'avance un peu, le recul beaucoup
    r.score = r.mode === 'point' ? 0.6 * r.d + 0.5
      : r.lat + 0.15 * Math.max(0, r.along) + 1.5 * Math.max(0, -r.along);
    return r;
  }
  /* Classe les lignes ; prevKey = suggestion précédente (gardée tant qu'elle reste à HYST près). */
  function rank(cands, me, prevKey) {
    var list = cands.map(function (c) { return evalOne(c, me); }).filter(function (r) { return r.d <= MAXD; })
      .sort(function (a, b) { return a.score - b.score; });
    if (prevKey && list.length > 1) {
      var k = list.findIndex(function (r) { return r.key === prevKey; });
      if (k > 0 && list[k].score <= list[0].score + HYST) list.unshift(list.splice(k, 1)[0]);
    }
    var amb = list.length > 1 && Math.abs(list[1].score - list[0].score) < AMBIG;
    return { list: list, best: list[0] || null, ambiguous: amb };
  }
  /* Texte court : « 3,2 m · dans l'axe », « 1,4 m · 0,8 m à côté », « derrière ». */
  function describe(r) {
    var f = function (v) { return v.toFixed(1).replace('.', ','); };
    var t = f(r.d) + ' m';
    if (r.mode === 'point') return t + ' · début de ligne';
    if (r.along < -0.5) return t + ' · derrière';
    return t + (r.lat < 0.5 ? ' · dans l’axe' : ' · ' + f(r.lat) + ' m à côté') + (r.mode === 'courbe' ? ' (courbe)' : '');
  }
  var api = { evalOne: evalOne, rank: rank, describe: describe, MAXD: MAXD, HYST: HYST, AMBIG: AMBIG };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Poursuite = api;
})(typeof window !== 'undefined' ? window : this);
