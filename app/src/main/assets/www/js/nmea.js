/* Collecte GNSS — Arpent-Nord
 * nmea.js : découpage d'un flux d'octets en trames NMEA et décodage (GGA, GST, RMC, GSA).
 * Indépendant du récepteur. Fonctionne dans le navigateur, la WebView Android et Node (tests).
 */
(function (root) {
  'use strict';

  var FIX_LABELS = {
    0: 'Aucune solution',
    1: 'Autonome',
    2: 'DGPS',
    3: 'PPS',
    4: 'RTK fixe',
    5: 'RTK flottant',
    6: 'Estimée',
    7: 'Manuelle',
    8: 'Simulation'
  };

  function checksumOk(line) {
    // line : "$....*HH" (sans fin de ligne)
    var star = line.lastIndexOf('*');
    if (star < 0 || star + 3 > line.length) return false;
    var sum = 0;
    for (var i = 1; i < star; i++) sum ^= line.charCodeAt(i);
    var given = parseInt(line.substr(star + 1, 2), 16);
    return !isNaN(given) && given === sum;
  }

  function withChecksum(body) {
    // body sans '$' ni '*'
    var sum = 0;
    for (var i = 0; i < body.length; i++) sum ^= body.charCodeAt(i);
    var hex = sum.toString(16).toUpperCase();
    if (hex.length < 2) hex = '0' + hex;
    return '$' + body + '*' + hex;
  }

  function num(s) {
    if (s === undefined || s === null || s === '') return null;
    var v = parseFloat(s);
    return isNaN(v) ? null : v;
  }

  // "4649.1234", "N" -> degrés décimaux
  function dmToDeg(value, hemi) {
    if (!value) return null;
    var dot = value.indexOf('.');
    var degLen = (dot < 0 ? value.length : dot) - 2;
    if (degLen < 1) return null;
    var deg = parseInt(value.substr(0, degLen), 10);
    var min = parseFloat(value.substr(degLen));
    if (isNaN(deg) || isNaN(min)) return null;
    var d = deg + min / 60;
    if (hemi === 'S' || hemi === 'W') d = -d;
    return d;
  }

  function parseTime(hhmmss) {
    if (!hhmmss || hhmmss.length < 6) return null;
    return {
      h: parseInt(hhmmss.substr(0, 2), 10),
      m: parseInt(hhmmss.substr(2, 2), 10),
      s: parseFloat(hhmmss.substr(4))
    };
  }

  function parseSentence(line) {
    if (!line || line.charAt(0) !== '$') return null;
    if (!checksumOk(line)) return { type: 'invalid', raw: line };
    var star = line.lastIndexOf('*');
    var f = line.substring(1, star).split(',');
    var talker = f[0].substr(0, 2);
    var kind = f[0].substr(2);
    var out = { type: kind, talker: talker, raw: line };

    switch (kind) {
      case 'GGA':
        out.time = parseTime(f[1]);
        out.lat = dmToDeg(f[2], f[3]);
        out.lon = dmToDeg(f[4], f[5]);
        out.quality = f[6] === '' ? 0 : parseInt(f[6], 10);
        out.qualityLabel = FIX_LABELS[out.quality] || ('Code ' + out.quality);
        out.sats = num(f[7]);
        out.hdop = num(f[8]);
        out.alt = num(f[9]);            // altitude au-dessus du géoïde du récepteur
        out.geoidSep = num(f[11]);      // séparation géoïde-ellipsoïde du récepteur
        out.hEll = (out.alt !== null && out.geoidSep !== null) ? out.alt + out.geoidSep : null;
        out.ageCorr = num(f[13]);
        out.refStation = f[14] || '';
        return out;
      case 'GST':
        out.time = parseTime(f[1]);
        out.rms = num(f[2]);
        out.sigmaLat = num(f[6]);
        out.sigmaLon = num(f[7]);
        out.sigmaAlt = num(f[8]);
        return out;
      case 'RMC':
        out.time = parseTime(f[1]);
        out.status = f[2];
        out.lat = dmToDeg(f[3], f[4]);
        out.lon = dmToDeg(f[5], f[6]);
        out.date = f[9] && f[9].length === 6 ? {
          d: parseInt(f[9].substr(0, 2), 10),
          m: parseInt(f[9].substr(2, 2), 10),
          y: 2000 + parseInt(f[9].substr(4, 2), 10)
        } : null;
        return out;
      case 'GSA':
        out.mode = f[2];
        out.pdop = num(f[15]);
        out.hdop = num(f[16]);
        out.vdop = num(f[17]);
        return out;
      default:
        return out;
    }
  }

  /* Découpeur de flux : accepte des morceaux d'octets (Uint8Array) ou du texte,
   * retrouve les trames $....*HH même si des données binaires (RTCM, GSOF…) sont mélangées. */
  function NmeaStream(onSentence) {
    this.buf = '';
    this.onSentence = onSentence;
    this.stats = { ok: 0, bad: 0 };
  }
  NmeaStream.prototype.pushBytes = function (bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) {
      var c = bytes[i];
      // On garde l'ASCII imprimable + CR/LF ; le reste devient un séparateur.
      s += (c >= 32 && c < 127) || c === 10 || c === 13 ? String.fromCharCode(c) : '\n';
    }
    this.pushText(s);
  };
  NmeaStream.prototype.pushText = function (text) {
    this.buf += text;
    if (this.buf.length > 8192) this.buf = this.buf.slice(-4096);
    var idx;
    while ((idx = this.buf.search(/[\r\n]/)) >= 0) {
      var line = this.buf.slice(0, idx);
      this.buf = this.buf.slice(idx + 1);
      var start = line.lastIndexOf('$');
      if (start < 0) continue;
      line = line.slice(start).trim();
      if (line.length < 6) continue;
      var parsed = parseSentence(line);
      if (!parsed) continue;
      if (parsed.type === 'invalid') { this.stats.bad++; continue; }
      this.stats.ok++;
      if (this.onSentence) this.onSentence(parsed);
    }
  };

  var api = {
    FIX_LABELS: FIX_LABELS,
    checksumOk: checksumOk,
    withChecksum: withChecksum,
    dmToDeg: dmToDeg,
    parseSentence: parseSentence,
    NmeaStream: NmeaStream
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Nmea = api;
})(typeof window !== 'undefined' ? window : globalThis);
