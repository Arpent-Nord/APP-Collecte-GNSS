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
    'mLeve', 'mNom', 'mCode', 'mPole', 'cDur', 'cMin', 'cSH', 'cSV', 'cFix', 'jHz', 'jVt', 'jSep'];
  var LEVE_TEMPLATE = 'AAMMJJSECT#NATSS';
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
    if (s.type === 'GST') { state.gst = s; if (state.recorder && !state.recorder.done) state.recorder.feedGst(s); return; }
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
      var need = state.recorder.opts.requireFixed ? 'RTK fixe' : 'une solution';
      $('measTxt').textContent = st.waiting
        ? 'En attente de ' + need + '…' + (st.rejected ? ' (' + st.rejected + ' époque(s) rejetée(s))' : '')
        : 'Mesure ' + st.elapsed.toFixed(0) + ' / ' + state.recorder.opts.durationSec + ' s · ' + st.accepted + ' époque(s) retenue(s)' +
          (st.rejected ? ' · ' + st.rejected + ' rejetée(s)' : '');
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
    $('dAge').textContent = fresh && g.quality >= 2 && g.ageCorr !== null ? g.ageCorr.toFixed(1) + ' s' : '—';
    $('dHdop').textContent = fresh && g.hdop !== null ? g.hdop.toFixed(1) : '—';
    $('dLat').textContent = fresh ? fmtDeg(g.lat) : '—';
    $('dLon').textContent = fresh ? fmtDeg(g.lon) : '—';
    $('dH').textContent = fresh && g.hEll !== null ? g.hEll.toFixed(3) + ' m' : '—';
    $('dRef').textContent = fresh && g.refStation ? g.refStation : '—';
    $('dRate').textContent = state.connected ? String(state.rate) : '—';
    $('dBad').textContent = state.decoder ? state.decoder.stats.bad : 0;
    var c = fresh && g.hEll !== null ? Proj.convert(g.lat, g.lon, g.hEll - numVal('mPole', 0) - numVal('mApc', 0), job()) : null;
    $('dE').textContent = c && c.e !== null ? c.e.toFixed(3) : '—';
    $('dN').textContent = c && c.n !== null ? c.n.toFixed(3) : '—';
    $('dZ').textContent = c && c.z !== null ? c.z.toFixed(3) : '—';
    if (c && c.warn !== state.lastWarn) { state.lastWarn = c.warn; updateJobUi(); }
    $('log').textContent = logBuf.join('\n');
    var measuring = state.recorder && !state.recorder.done;
    $('btnMeasure').disabled = !state.connected || !fresh || measuring || !!state.pending;
    $('btnMeasure').textContent = measuring ? 'Mesure en cours' : 'Mesurer';
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
    var byDrv = settings.apcByDriver || {};
    var apc = byDrv[d.id] !== undefined ? byDrv[d.id] : (d.apcDefault !== undefined ? d.apcDefault : 0);
    $('mApc').value = Number(apc).toFixed(3);
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
      $('nUser').value.trim(), $('nPass').value);
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
    $('measTxt').textContent = 'Mesure…';
    $('measBox').classList.add('on');
  }
  function cancelMeasure() {
    state.recorder = null; state.pending = null;
    $('measBox').classList.remove('on'); $('prog').style.width = '0%';
    alertMsg('Mesure annulée.');
  }
  function alertMsg(t) { $('result').style.display = 'block'; $('rTitle').textContent = 'Attention'; $('rMsg').textContent = t; $('rMsg').className = 'msg warn'; $('rList').innerHTML = ''; }

  function finishMeasure() {
    var r = state.recorder.result(numVal('mPole', 0), numVal('mApc', 0));
    $('measBox').classList.remove('on');
    if (r.n) {
      var cv = Proj.convert(r.lat, r.lon, r.hEll, job());
      r.est = cv.e; r.nord = cv.n; r.alt = cv.z; r.sep = cv.N; r.warn = cv.warn;
      r.systeme = cv.hz.epsg ? 'EPSG:' + cv.hz.epsg : 'Geographiques';
      r.systemeAlti = cv.z !== null ? 'EPSG:10588' + (cv.vt.grid ? ' (' + cv.vt.grid + ')' : ' (separation fixe)') : 'Ellipsoidale';
    }
    state.pending = r;
    var box = $('result'); box.style.display = 'block';
    $('rTitle').textContent = 'Point ' + $('mNom').value.trim();
    var msg = $('rMsg');
    if (r.ok) { msg.className = 'msg ok'; msg.textContent = 'Critères respectés.' + (r.reasons.length ? ' ' + r.reasons.join(' · ') : ''); }
    else { msg.className = 'msg bad'; msg.textContent = r.reasons.join(' · ') || 'Mesure invalide.'; }
    var rows = [];
    if (r.n) {
      rows = [];
      if (r.est !== null) rows.push(['Est / Nord', r.est.toFixed(3) + ' / ' + r.nord.toFixed(3)]);
      if (r.alt !== null) rows.push(['Altitude CGVD28', r.alt.toFixed(3) + ' m']);
      if (r.warn) rows.push(['Avertissement', esc(r.warn)]);
      rows = rows.concat([
        ['Latitude', fmtDeg(r.lat)], ['Longitude', fmtDeg(r.lon)],
        ['H ellipsoïdale (au sol)', r.hEll.toFixed(3) + ' m'],
        ['Précision H / V', fmtCm(r.sigmaH) + ' / ' + fmtCm(r.sigmaV)],
        ['Dispersion H / V', fmtCm(r.spreadH) + ' / ' + fmtCm(r.spreadV)],
        ['Époques', r.n + ' retenues' + (r.rejected ? ', ' + r.rejected + ' rejetées (non incluses dans la moyenne)' : '')],
        ['Solution', Nmea.FIX_LABELS[r.quality] || r.quality]
      ]);
    } else rows = [['Époques rejetées', String(r.rejected)]];
    $('rList').innerHTML = rows.map(function (x) { return '<dt>' + x[0] + '</dt><dd>' + x[1] + '</dd>'; }).join('');
    $('btnKeep').disabled = !r.n;
    $('btnKeep').textContent = r.ok ? 'Conserver' : 'Conserver quand même';
  }
  function keepPoint() {
    var r = state.pending; if (!r || !r.n) return;
    var p = {
      leve: $('mLeve').value.trim(), nom: $('mNom').value.trim(), code: $('mCode').value.trim(), note: $('mNote').value.trim(),
      est: r.est, nord: r.nord, alt: r.alt, systeme: r.systeme, systemeAlti: r.systemeAlti, sep: r.sep,
      lat: r.lat, lon: r.lon, hEll: r.hEll, sigmaH: r.sigmaH, sigmaV: r.sigmaV, n: r.n, rejected: r.rejected,
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

  // ---------- Travail : nom du levé et systèmes ----------
  function job() { return { hz: $('jHz').value, vt: $('jVt').value, sep: numVal('jSep', NaN) }; }
  function fillSystems() {
    Proj.HORIZONTAL.forEach(function (sy) {
      var o = document.createElement('option'); o.value = sy.id; o.textContent = sy.label + (Proj.available(sy) ? '' : ' (grille requise)');
      o.disabled = !Proj.available(sy); $('jHz').appendChild(o);
    });
    Proj.VERTICAL.forEach(function (sy) {
      var o = document.createElement('option'); o.value = sy.id; o.textContent = sy.label + (Proj.available(sy) ? '' : ' (grille requise)');
      o.disabled = !Proj.available(sy); $('jVt').appendChild(o);
    });
  }
  function updateJobUi() {
    var hz = Proj.horizontalById($('jHz').value), vt = Proj.verticalById($('jVt').value);
    if (!Proj.available(hz)) { $('jHz').value = '2949'; hz = Proj.horizontalById('2949'); }
    if (!Proj.available(vt)) { $('jVt').value = '10588-2010'; vt = Proj.verticalById('10588-2010'); }
    var sepMode = vt.id === '10588-sep';
    $('jSepWrap').style.display = sepMode ? '' : 'none';
    $('jSepHint').style.display = sepMode ? '' : 'none';
    var msgs = [];
    if (sepMode && isNaN(numVal('jSep', NaN))) msgs.push('Inscrire la séparation N du chantier pour obtenir les altitudes.');
    if (vt.id === '10588-2010') msgs.push('Modèle HT2_2010v70 (NAD83(SCRS) époque 2010) : standard Arpent-Nord, comme « CGVD28 height » dans Emlid Flow.');
    if (vt.id === '10588-2002') msgs.push('Modèle HT2_2002v70 (NAD83(SCRS)v4, époque 2002) : environ 2 cm d\u2019écart avec HT2_2010v70 dans la région de Québec.');
    if (!Proj.hasGrid('NA83SCRS')) msgs.push('Systèmes NAD83 (32186-32188) : grille de conversion NAD83 ↔ NAD83(SCRS) à installer.');
    if (hz.datum === 'NAD83') msgs.push('NAD83 (1986) : conversion par la grille NTv2 NA83SCRS du MRN (Québec).');
    if (state.lastWarn && /zone/.test(state.lastWarn)) msgs.unshift(state.lastWarn + '.');
    var m = $('jobMsg'); m.textContent = msgs.join(' '); m.className = 'msg' + (msgs.length ? ' warn' : ''); m.style.display = msgs.length ? '' : 'none';
    var leve = $('mLeve').value.trim();
    $('jobLine').innerHTML = 'Levé <b>' + esc(leve || '(sans nom)') + '</b> · ' + esc(hz.label.split(' — ')[0]) + ' · ' +
      esc(vt.id === 'ellips' ? 'hauteur ellipsoïdale' : vt.id === '10588-sep' ? 'CGVD28 (N = ' + (isNaN(numVal('jSep', NaN)) ? '?' : numVal('jSep', NaN).toFixed(3)) + ')' : 'CGVD28 ' + vt.grid);
  }
  function updateGhost() {
    var v = $('mLeve').value;
    $('leveGhost').innerHTML = '<span class="typed">' + esc(v) + '</span>' + esc(LEVE_TEMPLATE.slice(v.length));
  }
  function today() {
    var d = new Date();
    var ymd = String(d.getFullYear()).slice(2) + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
    var v = $('mLeve').value;
    $('mLeve').value = v.replace(/^\d{0,6}/, ymd);
    updateGhost(); updateJobUi(); persistFields(); $('mLeve').focus();
  }

  // ---------- Points ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function renderPoints() {
    $('nbPoints').textContent = points.length ? '(' + points.length + ')' : '';
    $('ptEmpty').style.display = points.length ? 'none' : 'block';
    $('ptBody').innerHTML = points.map(function (p, i) {
      var f3 = function (v) { return v === null || v === undefined ? '—' : v.toFixed(3); };
      return '<tr><td>' + esc(p.nom) + '</td><td>' + esc(p.code) + '</td><td class="num">' + f3(p.est) + '</td><td class="num">' + f3(p.nord) +
        '</td><td class="num">' + f3(p.alt) + '</td><td class="num">' + fmtCm(p.sigmaH) + '</td><td class="num">' + fmtCm(p.sigmaV) +
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
          if (ev.error) { setNtripMsg('Liste impossible : ' + ev.error + ' (vérifier le serveur, le port et la connexion Internet).', 'bad'); break; }
          var pos = state.gga && state.gga.lat !== null ? { lat: state.gga.lat, lon: state.gga.lon } : null;
          var list = Ntrip.mountList(ev.mounts || [], pos), sel = $('nMountSel');
          sel.innerHTML = '';
          if (!list.length) {
            $('mountSelWrap').style.display = 'none';
            setNtripMsg('Le serveur n\u2019a renvoyé aucun point de montage. Vérifier le serveur, le port et les identifiants, ou inscrire le nom à la main.', 'warn');
            break;
          }
          addOpt(sel, '', '— Choisir (' + list.length + ') —');
          list.forEach(function (m) { addOpt(sel, m.name, m.label); });
          if (list.some(function (m) { return m.name === $('nMount').value; })) sel.value = $('nMount').value;
          $('mountSelWrap').style.display = '';
          setNtripMsg(list.length + ' point(s) de montage reçu(s). Les réseaux (VRS) et les flux multi-constellations sont en tête de liste.', 'ok');
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
  $('nMountSel').addEventListener('change', function () { if (this.value) { $('nMount').value = this.value; persistFields(); } });
  $('btnMeasure').addEventListener('click', startMeasure);
  $('btnCancel').addEventListener('click', cancelMeasure);
  $('btnToday').addEventListener('click', today);
  $('mLeve').addEventListener('input', function () { updateGhost(); updateJobUi(); });
  ['jHz', 'jVt', 'jSep'].forEach(function (id) { $(id).addEventListener('change', function () { updateJobUi(); persistFields(); }); });
  $('mApc').addEventListener('change', function () {
    settings.apcByDriver = settings.apcByDriver || {};
    settings.apcByDriver[currentDriver().id] = numVal('mApc', 0); save(STORE_SETTINGS, settings);
  });
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
  fillSystems();
  if (!settings.jHz) settings.jHz = '2949';
  if (!settings.jVt || settings.jVt === '10588-grille') settings.jVt = '10588-2010';
  restoreFields();
  if (!currentDriver() || !Drivers.byId($('selDriver').value)) $('selDriver').selectedIndex = 0;
  applyTheme();
  onDriverChange();
  refreshDevices();
  renderPoints();
  updateGhost();
  updateJobUi();
  $('modeInfo').textContent = Native ? 'Application Android — version ' + Native.appVersion() : 'Mode navigateur : simulation seulement (le Bluetooth exige l’application Android).';
})();
