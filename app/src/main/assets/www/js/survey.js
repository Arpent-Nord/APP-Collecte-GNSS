/* Collecte GNSS — Arpent-Nord
 * survey.js : mesure d'un point par moyenne d'époques, contrôle de qualité, export CSV.
 */
(function (root) {
  'use strict';

  var M_PER_DEG_LAT = 111132.954;
  function mPerDegLon(lat) { return 111319.49 * Math.cos(lat * Math.PI / 180); }

  function mean(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : null; }
  function std(a) {
    if (a.length < 2) return 0;
    var m = mean(a), s = 0;
    for (var i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m);
    return Math.sqrt(s / (a.length - 1));
  }

  /* opts : durationSec, requireFixed, maxSigmaH, maxSigmaV, minEpochs */
  function Recorder(opts) {
    this.opts = {
      durationSec: opts && opts.durationSec > 0 ? opts.durationSec : 5,
      requireFixed: !(opts && opts.requireFixed === false),
      maxSigmaH: opts && opts.maxSigmaH > 0 ? opts.maxSigmaH : 0.02,
      maxSigmaV: opts && opts.maxSigmaV > 0 ? opts.maxSigmaV : 0.03,
      minEpochs: opts && opts.minEpochs > 0 ? opts.minEpochs : 3
    };
    this.samples = [];
    this.rejected = 0;
    this.qualities = {};
    this.tStart = null;
    this.tEnd = null;
    this.done = false;
  }

  /* gga : trame GGA décodée ; gst : dernière GST décodée (ou null) ; now : ms */
  Recorder.prototype.feed = function (gga, gst, now) {
    if (this.done) return this.status(now);
    now = now || Date.now();
    if (this.tStart === null) this.tStart = now;
    if (gga && gga.lat !== null && gga.lon !== null) {
      this.qualities[gga.quality] = (this.qualities[gga.quality] || 0) + 1;
      var acceptable = this.opts.requireFixed ? gga.quality === 4 : gga.quality > 0;
      if (acceptable && gga.hEll !== null) {
        this.samples.push({
          lat: gga.lat, lon: gga.lon, hEll: gga.hEll, alt: gga.alt, sep: gga.geoidSep,
          sLat: gst ? gst.sigmaLat : null, sLon: gst ? gst.sigmaLon : null, sAlt: gst ? gst.sigmaAlt : null,
          q: gga.quality
        });
      } else {
        this.rejected++;
      }
    }
    if ((now - this.tStart) / 1000 >= this.opts.durationSec) {
      this.done = true;
      this.tEnd = now;
    }
    return this.status(now);
  };

  Recorder.prototype.status = function (now) {
    var el = this.tStart === null ? 0 : ((this.tEnd || now || Date.now()) - this.tStart) / 1000;
    return {
      done: this.done,
      elapsed: el,
      progress: Math.min(1, el / this.opts.durationSec),
      accepted: this.samples.length,
      rejected: this.rejected
    };
  };

  Recorder.prototype.stop = function (now) {
    if (!this.done) { this.done = true; this.tEnd = now || Date.now(); }
  };

  /* Résultat de la mesure. pole : hauteur de canne (m) ; apc : décalage du récepteur (m). */
  Recorder.prototype.result = function (pole, apc) {
    var s = this.samples, o = this.opts;
    var reasons = [];
    pole = Number(pole) || 0; apc = Number(apc) || 0;
    if (s.length === 0) {
      return { ok: false, n: 0, rejected: this.rejected, reasons: [o.requireFixed ? 'Aucune époque en RTK fixe' : 'Aucune époque valide'] };
    }
    var lats = [], lons = [], hs = [], alts = [], sl = [], so = [], sa = [];
    for (var i = 0; i < s.length; i++) {
      lats.push(s[i].lat); lons.push(s[i].lon); hs.push(s[i].hEll);
      if (s[i].alt !== null) alts.push(s[i].alt);
      if (s[i].sLat !== null) sl.push(s[i].sLat);
      if (s[i].sLon !== null) so.push(s[i].sLon);
      if (s[i].sAlt !== null) sa.push(s[i].sAlt);
    }
    var lat = mean(lats), lon = mean(lons);
    var spreadN = std(lats) * M_PER_DEG_LAT;
    var spreadE = std(lons) * mPerDegLon(lat);
    var spreadH = Math.sqrt(spreadN * spreadN + spreadE * spreadE);
    var spreadV = std(hs);
    var gstH = (sl.length && so.length) ? Math.sqrt(Math.pow(mean(sl), 2) + Math.pow(mean(so), 2)) : null;
    var gstV = sa.length ? mean(sa) : null;
    // Précision retenue : la plus pessimiste entre l'estimation du récepteur (GST) et la dispersion observée.
    var sigmaH = Math.max(gstH === null ? 0 : gstH, spreadH);
    var sigmaV = Math.max(gstV === null ? 0 : gstV, spreadV);
    var offset = pole + apc;

    if (s.length < o.minEpochs) reasons.push('Seulement ' + s.length + ' époque(s) (min. ' + o.minEpochs + ')');
    if (sigmaH > o.maxSigmaH) reasons.push('Précision H ' + (sigmaH * 100).toFixed(1) + ' cm > ' + (o.maxSigmaH * 100).toFixed(1) + ' cm');
    if (sigmaV > o.maxSigmaV) reasons.push('Précision V ' + (sigmaV * 100).toFixed(1) + ' cm > ' + (o.maxSigmaV * 100).toFixed(1) + ' cm');
    if (gstH === null) reasons.push('Pas de trame GST : précision estimée par la dispersion seulement');

    var total = this.samples.length + this.rejected;
    return {
      ok: s.length >= o.minEpochs && sigmaH <= o.maxSigmaH && sigmaV <= o.maxSigmaV,
      warnOnly: gstH === null,
      lat: lat, lon: lon,
      hEll: mean(hs) - offset,
      hRec: alts.length ? mean(alts) - offset : null,
      sep: s[0].sep,
      sigmaH: sigmaH, sigmaV: sigmaV, spreadH: spreadH, spreadV: spreadV, gstH: gstH, gstV: gstV,
      n: s.length, rejected: this.rejected,
      fixRatio: total ? s.length / total : 0,
      quality: s[0].q,
      pole: pole, apc: apc,
      start: new Date(this.tStart).toISOString(),
      end: new Date(this.tEnd || Date.now()).toISOString(),
      reasons: reasons
    };
  };

  function nextPointName(name) {
    var m = /^(.*?)(\d+)$/.exec(name || '');
    if (!m) return (name || 'P') + '1';
    var n = String(parseInt(m[2], 10) + 1);
    while (n.length < m[2].length) n = '0' + n;
    return m[1] + n;
  }

  var CSV_COLUMNS = [
    ['leve', 'Leve'], ['nom', 'Point'], ['code', 'Code'],
    ['lat', 'Latitude'], ['lon', 'Longitude'], ['hEll', 'H_ellipsoidale'], ['hRec', 'H_geoide_recepteur'],
    ['sigmaH', 'Precision_H'], ['sigmaV', 'Precision_V'], ['n', 'Epoques'], ['rejected', 'Epoques_rejetees'],
    ['qualityLabel', 'Solution'], ['pole', 'Hauteur_canne'], ['apc', 'Decalage_recepteur'],
    ['recepteur', 'Recepteur'], ['start', 'Debut_UTC'], ['end', 'Fin_UTC'], ['note', 'Note']
  ];

  function fmt(key, v) {
    if (v === null || v === undefined) return '';
    if (key === 'lat' || key === 'lon') return v.toFixed(9);
    if (typeof v === 'number') return (key === 'n' || key === 'rejected') ? String(v) : v.toFixed(4);
    var s = String(v);
    if (/[",\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function toCsv(points) {
    var lines = [CSV_COLUMNS.map(function (c) { return c[1]; }).join(',')];
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      lines.push(CSV_COLUMNS.map(function (c) { return fmt(c[0], p[c[0]]); }).join(','));
    }
    return lines.join('\r\n') + '\r\n';
  }

  var api = { Recorder: Recorder, nextPointName: nextPointName, toCsv: toCsv, CSV_COLUMNS: CSV_COLUMNS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Survey = api;
})(typeof window !== 'undefined' ? window : globalThis);
