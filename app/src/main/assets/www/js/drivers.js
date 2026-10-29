/* Collecte GNSS — Arpent-Nord
 * drivers.js : un pilote par marque / modèle de récepteur.
 * Le reste de l'application ne connaît que les événements normalisés (GGA, GST, RMC…).
 * Ajouter un récepteur = ajouter une entrée ici.
 */
(function (root) {
  'use strict';
  var Nmea = root.Nmea || (typeof require !== 'undefined' ? require('./nmea.js') : null);

  // Décodeur NMEA générique : la majorité des récepteurs l'utilisent.
  function nmeaDecoder(onEvent) {
    var stream = new Nmea.NmeaStream(onEvent);
    return {
      pushBytes: function (b) { stream.pushBytes(b); },
      pushText: function (t) { stream.pushText(t); },
      stats: stream.stats
    };
  }

  var DRIVERS = [
    {
      id: 'emlid-rs4', brand: 'Emlid', label: 'Emlid Reach RS4', transport: 'bluetooth',
      createDecoder: nmeaDecoder,
      setup: 'Dans Emlid Flow (une seule fois) : Sortie de position = Bluetooth, format NMEA (GGA, GST, RMC). ' +
             'Entrée des corrections = Bluetooth (à valider selon le firmware).'
    },
    {
      id: 'emlid-rx2', brand: 'Emlid', label: 'Emlid Reach RX2', transport: 'bluetooth',
      createDecoder: nmeaDecoder,
      setup: 'Apparier le RX2 dans les réglages Bluetooth d’Android. Sortie NMEA par Bluetooth (à valider).'
    },
    {
      id: 'emlid-rx', brand: 'Emlid', label: 'Emlid Reach RX', transport: 'bluetooth',
      createDecoder: nmeaDecoder,
      apcDefault: 0.145, // décalage vertical utilisé par Emlid Flow pour le RX
      setup: 'Apparier le RX dans les réglages Bluetooth d’Android. Le RX transmet du NMEA et accepte les corrections par Bluetooth (à valider).'
    },
    {
      id: 'trimble-nmea', brand: 'Trimble', label: 'Trimble R8 à R12 (NMEA)', transport: 'bluetooth',
      createDecoder: nmeaDecoder,
      // Phase 3 : décodeur GSOF (format binaire publié par Trimble) pour les écarts-types complets.
      setup: 'Configuration unique (Trimble Access, interface web du récepteur ou utilitaire Trimble) : ' +
             'activer la sortie NMEA GGA + GST sur le port Bluetooth et l’enregistrer comme réglage au démarrage. ' +
             'Entrée RTCM par Bluetooth à valider pour chaque modèle.'
    },
    {
      id: 'generic-nmea', brand: 'Autre', label: 'Récepteur NMEA générique', transport: 'bluetooth',
      createDecoder: nmeaDecoder,
      setup: 'Tout récepteur qui émet du NMEA (GGA, idéalement GST) par Bluetooth.'
    },
    {
      id: 'simulation', brand: 'Essai', label: 'Simulation (sans récepteur)', transport: 'simulation',
      createDecoder: nmeaDecoder,
      apcDefault: 0,
      setup: 'Génère des positions fictives pour essayer l’interface. Aucune donnée réelle.'
    }
  ];

  function byId(id) {
    for (var i = 0; i < DRIVERS.length; i++) if (DRIVERS[i].id === id) return DRIVERS[i];
    return null;
  }

  /* Simulateur : produit des trames NMEA à 5 Hz autour d'un point.
   * Flottant pendant les premières secondes, puis RTK fixe. */
  function Simulator(onText, opts) {
    opts = opts || {};
    this.onText = onText;
    this.lat0 = opts.lat || 46.8123456;
    this.lon0 = opts.lon || -71.2087654;
    this.h0 = opts.alt || 75.0;
    this.sep = opts.sep || -29.5;
    this.hz = opts.hz || 5;
    this.floatSec = opts.floatSec === undefined ? 6 : opts.floatSec;
    this.t0 = 0;
    this.timer = null;
    this.forceFloat = false;
  }
  function gauss() {
    var u = 1 - Math.random(), v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function pad(n, w) { var s = String(n); while (s.length < w) s = '0' + s; return s; }
  function degToDm(deg, isLat) {
    var a = Math.abs(deg), d = Math.floor(a), m = (a - d) * 60;
    var ms = m.toFixed(8); if (m < 10) ms = '0' + ms;
    return { v: pad(d, isLat ? 2 : 3) + ms, h: isLat ? (deg >= 0 ? 'N' : 'S') : (deg >= 0 ? 'E' : 'W') };
  }
  Simulator.prototype.epoch = function (now) {
    var el = (now - this.t0) / 1000;
    var fixed = !this.forceFloat && el >= this.floatSec;
    var s = fixed ? 0.008 : 0.15, sv = fixed ? 0.015 : 0.3;
    var dN = gauss() * s, dE = gauss() * s, dU = gauss() * sv;
    var lat = this.lat0 + dN / 111132.954;
    var lon = this.lon0 + dE / (111319.49 * Math.cos(this.lat0 * Math.PI / 180));
    var alt = this.h0 + dU;
    var d = new Date(now);
    var t = pad(d.getUTCHours(), 2) + pad(d.getUTCMinutes(), 2) + pad(d.getUTCSeconds(), 2) + '.' + pad(Math.floor(d.getUTCMilliseconds() / 10), 2);
    var la = degToDm(lat, true), lo = degToDm(lon, false);
    var gga = Nmea.withChecksum(['GPGGA', t, la.v, la.h, lo.v, lo.h, fixed ? 4 : 5, 24, '0.6',
      alt.toFixed(4), 'M', this.sep.toFixed(3), 'M', '1.0', '0000'].join(','));
    var gst = Nmea.withChecksum(['GPGST', t, '0.012', s.toFixed(3), s.toFixed(3), '0.0',
      s.toFixed(3), s.toFixed(3), sv.toFixed(3)].join(','));
    var date = pad(d.getUTCDate(), 2) + pad(d.getUTCMonth() + 1, 2) + pad(d.getUTCFullYear() % 100, 2);
    var rmc = Nmea.withChecksum(['GPRMC', t, 'A', la.v, la.h, lo.v, lo.h, '0.0', '0.0', date, '', '', 'D'].join(','));
    return gga + '\r\n' + gst + '\r\n' + rmc + '\r\n';
  };
  Simulator.prototype.start = function () {
    var self = this;
    this.t0 = Date.now();
    this.timer = setInterval(function () { self.onText(self.epoch(Date.now())); }, 1000 / this.hz);
  };
  Simulator.prototype.stop = function () { if (this.timer) clearInterval(this.timer); this.timer = null; };

  var api = { DRIVERS: DRIVERS, byId: byId, Simulator: Simulator };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Drivers = api;
})(typeof window !== 'undefined' ? window : globalThis);
