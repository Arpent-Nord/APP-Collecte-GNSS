/* Collecte GNSS — Arpent-Nord
 * ntrip.js : décodage de la table des sources NTRIP (lignes STR) et tri des points de montage.
 * Champs STR : 1 nom, 2 identifiant, 3 format, 4 détails, 5 porteuses, 6 constellations, 7 réseau, 8 pays,
 *              9 latitude, 10 longitude, 11 NMEA requis (1 = position envoyée, ex. VRS), 12 solution (0 = base unique, 1 = réseau).
 */
(function (root) {
  'use strict';
  function num(s) { var v = parseFloat(s); return isNaN(v) ? null : v; }

  function parseStr(line) {
    var f = String(line).split(';');
    if (f[0] !== 'STR' || !f[1]) return null;
    var nav = (f[6] || '').toUpperCase();
    return {
      name: f[1], id: f[2] || '', format: f[3] || '', details: f[4] || '', nav: f[6] || '',
      lat: num(f[9]), lon: num(f[10]),
      nmea: f[11] === '1',
      // Réseau : solution déclarée « 1 », ou position requise (VRS, iMAX…). Leur position dans la table est nominale.
      network: f[12] === '1' || f[11] === '1',
      galileo: /GAL/.test(nav), beidou: /BDS|BEI|CMP/.test(nav), glonass: /GLO/.test(nav),
      msm: /MSM/i.test(f[3] + ' ' + f[4] + ' ' + f[1]) || /10(7[4-7]|8[4-7]|9[4-7]|1[1-2][4-7])/.test(f[4] || '')
    };
  }

  function distanceKm(lat1, lon1, lat2, lon2) {
    var r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /* lignes : tableau de lignes STR (ou objets {name, info} venant d'Android) ; pos : {lat, lon} ou null */
  function mountList(lines, pos) {
    var out = [];
    (lines || []).forEach(function (l) {
      var m = parseStr(typeof l === 'string' ? l : (l.info || ''));
      if (!m && l && l.name) m = { name: l.name, id: '', format: '', nav: '', network: false, nmea: false };
      if (!m) return;
      // Les réseaux (VRS) n'ont pas une vraie position : la distance n'a de sens que pour une base unique.
      m.distKm = pos && !m.network && m.lat !== null && m.lon !== null && (m.lat !== 0 || m.lon !== 0)
        ? distanceKm(pos.lat, pos.lon, m.lat, m.lon) : null;
      var n = 0; if (m.glonass) n++; if (m.galileo) n++; if (m.beidou) n++;
      m.score = (m.network ? 1000 : 0) + n * 100 + (m.distKm !== null ? Math.max(0, 99 - m.distKm) : 0);
      m.label = m.name + ' — ' + [m.format, m.nav, m.network ? 'réseau (position requise)' : (m.distKm !== null ? 'base à ' + m.distKm.toFixed(0) + ' km' : 'base unique')]
        .filter(function (x) { return x; }).join(' · ');
      out.push(m);
    });
    out.sort(function (a, b) { return b.score - a.score || (a.name < b.name ? -1 : 1); });
    return out;
  }

  var api = { parseStr: parseStr, mountList: mountList, distanceKm: distanceKm };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Ntrip = api;
})(typeof window !== 'undefined' ? window : globalThis);
