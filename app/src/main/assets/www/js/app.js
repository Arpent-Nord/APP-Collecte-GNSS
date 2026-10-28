/* Collecte GNSS — Arpent-Nord
 * app.js : interface. Parle au module natif Android (window.GnssNative) quand il existe;
 * sinon (navigateur) seul le mode simulation est offert.
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var Native = window.GnssNative || null;
  var STORE_SETTINGS = 'cg.settings.v1', STORE_POINTS = 'cg.points.v1';

  // ---------- Stockage local (sur l'appareil seulement) ----------
  function load(key, def) { try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
  function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } }

  var settings = load(STORE_SETTINGS, {});
  var points = load(STORE_POINTS, []);

  var FIELDS = ['selDriver', 'nHost', 'nPort', 'nUser', 'nPass', 'nMount', 'nGga',
    'mLeve', 'mNom', 'mCode', 'mPole', 'mApc', 'cDur', 'cMin', 'cSH', 'cSV', 'cFix'];
  function restoreFields() {
    FIELDS.forEach(function (id) {
      if (!(id in settings)) return;
      var el = $(id);
      if (el.type === 'checkbox') el.checked = !!settings[id]; else el.value = settings[id];
    });
  }
  function persistFields() {
    FIELDS.forEach(function (id) {
      var el = $(id);
      settings[id] = el.type === 'checkbox' ? el.checked : el.value;
    });
    save(STORE_SETTINGS, settings);
  }

  // ---------- État GNSS ----------
  var state = { connected: false, driver: null, decoder: null, sim: null, gga: null, gst: null, lastGgaAt: 0,
    ggaCount: 0, rate: 0, lastGgaToCaster: 0, ntripOn: false, recorder: null, pending: null };

  function fmtCm(m) { return m === null || m === undefined ? '—' : (m * 100).toFixed(1) + ' cm'; }
  function fmtDeg(d) { return d === null || d === undefined ? '—' : d.toFixed(8) + '°'; }

  function onSentence(s) {
    if (s.type === 'GST') { state.gst = s; return; }
    if (s.type !== 'GGA') return;
    state.gga = s; state.lastGgaAt = Date.now(); state.ggaCount++;
    logLine(s.raw);
    // Position envoyée au serveur NTRIP (réseaux VRS), aux 10 s.
    if (Native && state.ntripOn && $('nGga').checked && s.quality > 0 && Date.now() - state.lastGgaToCaster > 10000) {
      state.lastGgaToCaster = Date.now();
      Native.ntripGga(s.raw);
    }
    if (state.recorder && !state.recorder.done) {
      var st = state.recorder.feed(s, state.gst, Date.now());
      $('prog').style.width = (st.progress * 100).toFixed(0) + '%';
      $('btnMeasure').textContent = 'Mesure… ' + st.accepted + ' époque(s)' + (st.rejected ? ' / ' + st.rejected + ' rejetée(s)' : '');
      if (st.done) finishMeasure();
    }
  }

  var logBuf = [];
  function logLine(t) {
    logBuf.push(t); if (logBuf.length > 40) logBuf.shift();
  }

  function render() {
    var g = state.gga, fresh = g && Date.now() - state.lastGgaAt < 3000;
    var fix = $('sbFix');
    if (!state.connected) { fix.className = 'fix off'; fix.textContent = 'Déconnecté'; }
    else if (!fresh) { fix.className = 'fix'; fix.textContent = 'Aucune donnée'; }
    else { fix.className = 'fix q' + g.quality; fix.textContent = g.qualityLabel; }
    var gs = fresh ? state.gst : null;
    var sh = gs && gs.sigmaLat !== null ? Math.sqrt(gs.sigmaLat * gs.sigmaLat + gs.sigmaLon * gs.sigmaLon) : null;
    $('sbSH').textContent = fmtCm(sh);
    $('sbSV').textContent = fmtCm(gs ? gs.sigmaAlt : null);
    $('sbSats').textContent = fresh && g.sats !== null ? g.sats : '—';
    $('dFix').textContent = fresh ? g.qualityLabel : '—';
    $('dAge').textContent = fresh && g.ageCorr !== null ? g.ageCorr.toFixed(1) + ' s' : '—';
    $('dHdop').textContent = fresh && g.hdop !== null ? g.hdop.toFixed(1) : '—';
    $('dLat').textContent = fresh ? fmtDeg(g.lat) : '—';
    $('dLon').textContent = fresh ? fmtDeg(g.lon) : '—';
    $('dH').textContent = fresh && g.hEll !== null ? g.hEll.toFixed(3) + ' m' : '—';
    $('dRef').textContent = fresh && g.refStation ? g.refStation : '—';
    $('dRate').textContent = state.connected ? String(state.rate) : '—';
    $('dBad').textContent = state.decoder ? state.decoder.stats.bad : 0;
    $('log').textContent = logBuf.join('\n');
    $('btnMeasure').disabled = !state.connected || !fresh || (state.recorder && !state.recorder.done) || !!state.pending;
    if (!state.recorder || state.recorder.done) $('btnMeasure').textContent = 'Mesurer';
  }
  setInterval(function () { state.rate = state.ggaCount; state.ggaCount = 0; }, 1000);
  setInterval(render, 250);

  // ---------- Pilotes et appareils ----------
  function fillDrivers() {
    var sel = $('selDriver');
    Drivers.DRIVERS.forEach(function (d) {
      if (!Native && d.transport !== 'simulation') return;
      var o = document.createElement('option'); o.value = d.id; o.textContent = d.label; sel.appendChild(o);
    });
  }
  function currentDriver() { return Drivers.byId($('selDriver').value) || Drivers.DRIVERS[0]; }
  function onDriverChange() {
    var d = currentDriver();
    $('driverSetup').textContent = d.setup;
    $('selDevice').disabled = d.transport === 'simulation';
    persistFields();
  }
  function refreshDevices() {
    var sel = $('selDevice'); sel.innerHTML = '';
    if (!Native) { addOpt(sel, '', 'Bluetooth disponible seulement dans l’application Android'); return; }
    var list = [];
    try { list = JSON.parse(Native.listDevices() || '[]'); } catch (e) { list = []; }
    if (!list.length) addOpt(sel, '', 'Aucun appareil apparié (voir Réglages Android > Bluetooth)');
    list.forEach(function (d) { addOpt(sel, d.address, d.name + ' (' + d.address + ')'); });
    if (settings.lastDevice) sel.value = settings.lastDevice;
  }
  function addOpt(sel, v, t) { var o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); }

  function setBtMsg(text, cls) { var m = $('btMsg'); m.textContent = text; m.className = 'msg' + (cls ? ' ' + cls : ''); }

  function connect() {
    var d = currentDriver();
    state.driver = d;
    state.decoder = d.createDecoder(onSentence);
    state.gga = null; state.gst = null;
    if (d.transport === 'simulation') {
      state.sim = new Drivers.Simulator(function (txt) { state.decoder.pushText(txt); });
      state.sim.start();
      onConnected('Simulation en cours (données fictives).');
      return;
    }
    var addr = $('selDevice').value;
    if (!addr) { setBtMsg('Choisir un appareil apparié.', 'warn'); return; }
    settings.lastDevice = addr; save(STORE_SETTINGS, settings);
    setBtMsg('Connexion…');
    $('btnConnect').disabled = true;
    Native.connect(addr);
  }
  function onConnected(msg) {
    state.connected = true;
    $('btnConnect').disabled = true; $('btnDisconnect').disabled = false;
    $('selDriver').disabled = true; $('selDevice').disabled = true;
    setBtMsg(msg, 'ok');
  }
  function onDisconnected(msg, cls) {
    state.connected = false;
    if (state.sim) { state.sim.stop(); state.sim = null; }
    if (state.recorder && !state.recorder.done) { state.recorder.stop(); finishMeasure(); }
    $('btnConnect').disabled = false; $('btnDisconnect').disabled = true;
    $('selDriver').disabled = false; onDriverChange();
    setBtMsg(msg || 'Non connecté.', cls);
  }
  function disconnect() {
    if (state.sim) { onDisconnected('Simulation arrêtée.'); return; }
    if (Native) Native.disconnect();
  }

  // ---------- NTRIP ----------
  function setNtripMsg(text, cls) { var m = $('ntripMsg'); m.textContent = text; m.className = 'msg' + (cls ? ' ' + cls : ''); }
  function ntripStart() {
    persistFields();
    if (!Native) { setNtripMsg('Corrections disponibles seulement dans l’application Android.', 'warn'); return; }
    if (!state.connected || state.sim) { setNtripMsg('Connecter d’abord un récepteur réel.', 'warn'); return; }
    if (!$('nHost').value || !$('nMount').value) { setNtripMsg('Serveur et point de montage requis.', 'warn'); return; }
    state.ntripOn = true; state.lastGgaToCaster = 0;
    $('btnNtrip').disabled = true; $('btnNtripStop').disabled = false;
    Native.ntripStart($('nHost').value.trim(), parseInt($('nPort').value, 10) || 2101, $('nMount').value.trim(),
      $('nUser').value, $('nPass').value);
    if (state.gga && $('nGga').checked) { Native.ntripGga(state.gga.raw); state.lastGgaToCaster = Date.now(); }
  }
  function ntripStop() {
    state.ntripOn = false;
    $('btnNtrip').disabled = false; $('btnNtripStop').disabled = true;
    if (Native) Native.ntripStop();
    setNtripMsg('Corrections arrêtées.');
  }
  function sourcetable() {
    persistFields();
    if (!Native) { setNtripMsg('Disponible seulement dans l’application Android.', 'warn'); return; }
    if (!$('nHost').value) { setNtripMsg('Indiquer le serveur.', 'warn'); return; }
    setNtripMsg('Lecture de la liste…');
    Native.ntripSourcetable($('nHost').value.trim(), parseInt($('nPort').value, 10) || 2101, $('nUser').value, $('nPass').value);
  }

  // ---------- Mesure ----------
  function numVal(id, def) { var v = parseFloat(String($(id).value).replace(',', '.')); return isNaN(v) ? def : v; }
  function startMeasure() {
    persistFields();
    if (!$('mNom').value.trim()) { alertMsg('Indiquer un nom de point.'); return; }
    state.recorder = new Survey.Recorder({
      durationSec: numVal('cDur', 5), minEpochs: numVal('cMin', 3),
      maxSigmaH: numVal('cSH', 2) / 100, maxSigmaV: numVal('cSV', 3) / 100,
      requireFixed: $('cFix').checked
    });
    $('result').style.display = 'none';
    $('prog').style.width = '0%';
  }
  function alertMsg(t) { $('result').style.display = 'block'; $('rTitle').textContent = 'Attention'; $('rMsg').textContent = t; $('rMsg').className = 'msg warn'; $('rList').innerHTML = ''; }

  function finishMeasure() {
    var r = state.recorder.result(numVal('mPole', 0), numVal('mApc', 0));
    state.pending = r;
    var box = $('result'); box.style.display = 'block';
    $('rTitle').textContent = 'Point ' + $('mNom').value.trim();
    var msg = $('rMsg');
    if (r.ok) { msg.className = 'msg ok'; msg.textContent = 'Critères respectés.' + (r.reasons.length ? ' ' + r.reasons.join(' · ') : ''); }
    else { msg.className = 'msg bad'; msg.textContent = r.reasons.join(' · ') || 'Mesure invalide.'; }
    var rows = [];
    if (r.n) {
      rows = [
        ['Latitude', fmtDeg(r.lat)], ['Longitude', fmtDeg(r.lon)],
        ['H ellipsoïdale (au sol)', r.hEll.toFixed(3) + ' m'],
        ['Précision H / V', fmtCm(r.sigmaH) + ' / ' + fmtCm(r.sigmaV)],
        ['Dispersion H / V', fmtCm(r.spreadH) + ' / ' + fmtCm(r.spreadV)],
        ['Époques', r.n + ' acceptées, ' + r.rejected + ' rejetées'],
        ['Solution', Nmea.FIX_LABELS[r.quality] || r.quality]
      ];
    } else rows = [['Époques rejetées', String(r.rejected)]];
    $('rList').innerHTML = rows.map(function (x) { return '<dt>' + x[0] + '</dt><dd>' + x[1] + '</dd>'; }).join('');
    $('btnKeep').disabled = !r.n;
    $('btnKeep').textContent = r.ok ? 'Conserver' : 'Conserver quand même';
  }
  function keepPoint() {
    var r = state.pending; if (!r || !r.n) return;
    var p = {
      leve: $('mLeve').value.trim(), nom: $('mNom').value.trim(), code: $('mCode').value.trim(), note: $('mNote').value.trim(),
      lat: r.lat, lon: r.lon, hEll: r.hEll, hRec: r.hRec, sigmaH: r.sigmaH, sigmaV: r.sigmaV, n: r.n, rejected: r.rejected,
      qualityLabel: (Nmea.FIX_LABELS[r.quality] || r.quality) + (r.ok ? '' : ' (hors critères)'),
      pole: r.pole, apc: r.apc, recepteur: state.driver ? state.driver.label : '', start: r.start, end: r.end
    };
    points.push(p); save(STORE_POINTS, points);
    $('mNom').value = Survey.nextPointName(p.nom); $('mNote').value = '';
    persistFields();
    state.pending = null; state.recorder = null;
    $('result').style.display = 'none'; $('prog').style.width = '0%';
    renderPoints();
  }
  function dropPoint() { state.pending = null; state.recorder = null; $('result').style.display = 'none'; $('prog').style.width = '0%'; }
  function redo() { dropPoint(); startMeasure(); }

  // ---------- Points ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function renderPoints() {
    $('nbPoints').textContent = points.length ? '(' + points.length + ')' : '';
    $('ptEmpty').style.display = points.length ? 'none' : 'block';
    $('ptBody').innerHTML = points.map(function (p, i) {
      return '<tr><td>' + esc(p.nom) + '</td><td>' + esc(p.code) + '</td><td class="num">' + fmtCm(p.sigmaH) +
        '</td><td class="num">' + fmtCm(p.sigmaV) + '</td><td class="num">' + p.n +
        '</td><td><button class="btn danger" data-del="' + i + '" title="Supprimer">✕</button></td></tr>';
    }).join('');
  }
  function exportCsv() {
    if (!points.length) return;
    var csv = Survey.toCsv(points);
    var d = new Date();
    var stamp = String(d.getFullYear()).slice(2) + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
    var leve = (points[points.length - 1].leve || 'collecte').replace(/[^\w#-]+/g, '_');
    var name = leve + '_' + stamp + '.csv';
    if (Native) { Native.saveFile(name, 'text/csv', csv); return; }
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }

  // ---------- Événements du module natif ----------
  function b64ToBytes(b64) {
    var bin = atob(b64), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  window.GnssApp = {
    onNative: function (ev) {
      if (typeof ev === 'string') { try { ev = JSON.parse(ev); } catch (e) { return; } }
      switch (ev.t) {
        case 'data': if (state.decoder) state.decoder.pushBytes(b64ToBytes(ev.b64)); break;
        case 'bt':
          if (ev.state === 'connected') onConnected('Connecté à ' + (ev.msg || 'récepteur') + '.');
          else if (ev.state === 'connecting') setBtMsg('Connexion…');
          else if (ev.state === 'error') { onDisconnected('Erreur : ' + (ev.msg || ''), 'bad'); if (state.ntripOn) ntripStop(); }
          else { onDisconnected(ev.msg || 'Déconnecté.'); if (state.ntripOn) ntripStop(); }
          break;
        case 'ntrip':
          var cls = ev.state === 'connected' ? 'ok' : (ev.state === 'error' || ev.state === 'retry') ? 'bad' : '';
          var kb = ev.bytes ? ' — ' + (ev.bytes / 1024).toFixed(1) + ' ko reçus' : '';
          setNtripMsg((ev.msg || ev.state) + kb, cls);
          if (ev.state === 'stopped') { state.ntripOn = false; $('btnNtrip').disabled = false; $('btnNtripStop').disabled = true; }
          break;
        case 'sourcetable':
          if (ev.error) { setNtripMsg('Liste impossible : ' + ev.error, 'bad'); break; }
          var dl = $('mountList'); dl.innerHTML = '';
          (ev.mounts || []).forEach(function (m) { var o = document.createElement('option'); o.value = m.name; o.label = m.info || ''; dl.appendChild(o); });
          setNtripMsg((ev.mounts || []).length + ' point(s) de montage trouvé(s). Choisir dans le champ.', 'ok');
          break;
        case 'file':
          var pm = $('ptMsg'); pm.style.display = 'block';
          pm.className = 'msg ' + (ev.ok ? 'ok' : 'warn');
          pm.textContent = ev.ok ? 'Fichier enregistré.' : ('Enregistrement annulé ou impossible. ' + (ev.msg || ''));
          break;
      }
    }
  };

  // ---------- Onglets, thème, liaisons ----------
  function showTab(name) {
    document.querySelectorAll('nav.tabs button').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === name); });
    document.querySelectorAll('section.tab').forEach(function (s) { s.classList.toggle('active', s.id === 'tab-' + name); });
  }
  document.querySelectorAll('nav.tabs button').forEach(function (b) { b.addEventListener('click', function () { showTab(b.dataset.tab); }); });

  function applyTheme() { if (settings.theme) document.documentElement.setAttribute('data-theme', settings.theme); }
  $('btnTheme').addEventListener('click', function () {
    var dark = settings.theme ? settings.theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    settings.theme = dark ? 'light' : 'dark'; save(STORE_SETTINGS, settings); applyTheme();
  });
  $('btnRetour').addEventListener('click', function (e) { if (Native) { e.preventDefault(); Native.openUrl(this.href); } });

  $('selDriver').addEventListener('change', onDriverChange);
  $('btnRefresh').addEventListener('click', refreshDevices);
  $('btnConnect').addEventListener('click', connect);
  $('btnDisconnect').addEventListener('click', disconnect);
  $('btnNtrip').addEventListener('click', ntripStart);
  $('btnNtripStop').addEventListener('click', ntripStop);
  $('btnSource').addEventListener('click', sourcetable);
  $('btnMeasure').addEventListener('click', startMeasure);
  $('btnKeep').addEventListener('click', keepPoint);
  $('btnDrop').addEventListener('click', dropPoint);
  $('btnRedo').addEventListener('click', redo);
  $('btnExport').addEventListener('click', exportCsv);
  $('btnClear').addEventListener('click', function () {
    if (!points.length || !confirm('Effacer les ' + points.length + ' points de cet appareil?')) return;
    points = []; save(STORE_POINTS, points); renderPoints();
  });
  $('ptBody').addEventListener('click', function (e) {
    var i = e.target.getAttribute('data-del'); if (i === null) return;
    if (!confirm('Supprimer le point ' + points[i].nom + '?')) return;
    points.splice(+i, 1); save(STORE_POINTS, points); renderPoints();
  });
  document.querySelectorAll('input').forEach(function (el) { el.addEventListener('change', persistFields); });

  fillDrivers();
  restoreFields();
  if (!currentDriver() || !Drivers.byId($('selDriver').value)) $('selDriver').selectedIndex = 0;
  applyTheme();
  onDriverChange();
  refreshDevices();
  renderPoints();
  $('modeInfo').textContent = Native ? 'Application Android — version ' + Native.appVersion() : 'Mode navigateur : simulation seulement (le Bluetooth exige l’application Android).';
})();
