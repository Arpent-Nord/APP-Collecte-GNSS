/* Collecte GNSS — Arpent-Nord
 * app.js : interface. Parle au module natif Android (window.GnssNative) quand il existe;
 * sinon (navigateur) seul le mode simulation est offert.
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var Native = window.GnssNative || null;
  // La position (GGA) part vers le serveur NTRIP depuis le service natif (écran éteint compris).
  var NATIVE_GGA = !!(Native && Native.nativeGga && Native.nativeGga());
  var STORE_SETTINGS = 'cg.settings.v1', STORE_POINTS = 'cg.points.v1', STORE_REF = 'cg.reference.v1', STORE_JOBS = 'cg.jobs.v1';

  // ---------- Stockage local (sur l'appareil seulement) ----------
  function load(key, def) { try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
  function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } }

  var settings = load(STORE_SETTINGS, {});
  var points = load(STORE_POINTS, []);
  var jobs = load(STORE_JOBS, {});      // { nom du travail : { created: ISO } }

  var FIELDS = ['selDriver', 'nHost', 'nPort', 'nUser', 'nPass', 'nMount', 'nGga', 'nAgent', 'bScreen', 'kSrc', 'kAgeMax', 'kBaseName', 'kBaseE', 'kBaseN', 'kBaseZ',
    'mLeve', 'mNom', 'mCode', 'mStr', 'jSS', 'jNum', 'jA', 'jSect', 'jType', 'jNat', 'mPole', 'cDur', 'cMin', 'cSH', 'cSV', 'cFix', 'jHz', 'jVt', 'jSep', 'jBaseMax'];
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
    if (Native && !NATIVE_GGA && state.ntripOn && $('nGga').checked && s.quality > 0 && Date.now() - state.lastGgaToCaster > 10000) {
      state.lastGgaToCaster = Date.now();
      Native.ntripGga(s.raw);
    }
    if (state.recorder && !state.recorder.done) {
      if (s.quality >= 2 && s.ageCorr !== null && s.ageCorr !== undefined) state.measAgeMax = Math.max(state.measAgeMax || 0, s.ageCorr);
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
    else if (corrTooOld(g)) { fix.className = 'fix old'; fix.textContent = g.qualityLabel + ' · corr. ' + g.ageCorr.toFixed(0) + ' s'; }
    else { fix.className = 'fix q' + g.quality; fix.textContent = g.qualityLabel; }
    $('dAgeKv').classList.toggle('far', !!(fresh && corrTooOld(g)));
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
    var bk = fresh ? baseKm() : null, far = bk !== null && bk > numVal('jBaseMax', 10);
    $('sbBase').textContent = bk === null ? '—' : bk.toFixed(1) + ' km';
    var bid = baseIdNow();
    $('dBase').textContent = bk === null ? '—' : bk.toFixed(1) + ' km' + (bid !== null ? ' (' + (radioMode() ? '' : 'station ') + bid + ')' : '');
    $('sbBaseKv').classList.toggle('far', far); $('dBaseKv').classList.toggle('far', far);
    var c = fresh && g.hEll !== null ? Proj.convert(g.lat, g.lon, g.hEll - numVal('mPole', 0) - numVal('mApc', 0), job()) : null;
    $('dE').textContent = c && c.e !== null ? c.e.toFixed(3) : '—';
    $('dN').textContent = c && c.n !== null ? c.n.toFixed(3) : '—';
    $('dZ').textContent = c && c.z !== null ? c.z.toFixed(3) : '—';
    if (c && c.warn !== state.lastWarn) { state.lastWarn = c.warn; updateJobUi(); }
    $('log').textContent = logBuf.join('\n');
    var measuring = state.recorder && !state.recorder.done;
    var jw = jobWritable();
    $('btnMeasure').disabled = !state.connected || !fresh || measuring || !!state.pending || !jw.ok;
    $('jobWarn').style.display = jw.ok ? 'none' : ''; if (!jw.ok) $('jobWarn').textContent = jw.why;
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

  // ---------- Arrière-plan (écran éteint) ----------
  function applyScreen() { if (Native && Native.keepScreenOn) Native.keepScreenOn($('bScreen').checked); }
  function renderBackground() {
    var restricted = !!(Native && Native.batteryRestricted && Native.batteryRestricted());
    $('btnBattery').style.display = restricted ? '' : 'none';
    var m = $('bgMsg');
    if (!Native) { m.textContent = 'Disponible dans l’application Android.'; m.className = 'msg'; return; }
    m.textContent = restricted
      ? 'Android peut ralentir l’application écran éteint (optimisation de la batterie). Autoriser l’arrière-plan pour un lien stable.'
      : 'Le lien au récepteur et les corrections restent actifs écran éteint (notification « Collecte GNSS »).';
    m.className = 'msg ' + (restricted ? 'warn' : 'ok');
  }

  // ---------- Profils NTRIP (plusieurs fournisseurs : SmartNet, CAN-NET…) ----------
  var PROF_FIELDS = { host: 'nHost', port: 'nPort', user: 'nUser', pass: 'nPass', mount: 'nMount', gga: 'nGga', agent: 'nAgent' };
  function profFromFields(name) {
    var p = { name: name };
    Object.keys(PROF_FIELDS).forEach(function (k) { var el = $(PROF_FIELDS[k]); p[k] = el.type === 'checkbox' ? el.checked : el.value; });
    return p;
  }
  function profToFields(p) {
    Object.keys(PROF_FIELDS).forEach(function (k) {
      var el = $(PROF_FIELDS[k]), v = p[k];
      if (el.type === 'checkbox') el.checked = v !== false; else el.value = v === undefined || v === null ? '' : v;
    });
    $('nMountSel').innerHTML = ''; $('mountSelWrap').style.display = 'none';
  }
  function initProfiles() {
    if (!settings.ntripProfiles || !settings.ntripProfiles.length) {
      var first = profFromFields($('nHost').value.indexOf('smartnet') >= 0 ? 'SmartNet' : 'Profil 1');
      settings.ntripProfiles = [first, {
        name: 'CAN-NET', host: 'gps.can-net.ca', port: '2300', user: '', pass: '', mount: 'qcvrsrtcm32', gga: true, agent: ''
      }];
      if (first.host === 'gps.can-net.ca') settings.ntripProfiles.pop();
      settings.ntripActive = 0;
      save(STORE_SETTINGS, settings);
    }
    renderProfiles();
  }
  function renderProfiles() {
    var sel = $('nProfile'); sel.innerHTML = '';
    settings.ntripProfiles.forEach(function (p, i) { addOpt(sel, String(i), p.name || ('Profil ' + (i + 1))); });
    sel.value = String(settings.ntripActive || 0);
    $('nProfName').value = settings.ntripProfiles[settings.ntripActive || 0].name || '';
    $('btnProfDel').disabled = settings.ntripProfiles.length < 2;
  }
  function saveActiveProfile() {
    var i = settings.ntripActive || 0, cur = settings.ntripProfiles[i];
    settings.ntripProfiles[i] = profFromFields(cur ? cur.name : 'Profil');
    persistFields();
  }
  function switchProfile(i) {
    if (state.ntripOn) { setNtripMsg('Arrêter les corrections avant de changer de profil.', 'warn'); renderProfiles(); return; }
    saveActiveProfile();
    settings.ntripActive = i;
    profToFields(settings.ntripProfiles[i]);
    persistFields(); renderProfiles();
    state.base = null;
    setNtripMsg('Profil « ' + settings.ntripProfiles[i].name + ' » chargé.');
  }
  function newProfile() {
    if (state.ntripOn) { setNtripMsg('Arrêter les corrections avant de changer de profil.', 'warn'); return; }
    saveActiveProfile();
    settings.ntripProfiles.push({ name: 'Profil ' + (settings.ntripProfiles.length + 1), host: '', port: '2101', user: '', pass: '', mount: '', gga: true, agent: '' });
    switchProfile(settings.ntripProfiles.length - 1);
    $('nProfName').focus(); $('nProfName').select();
  }
  function renameProfile() {
    var p = settings.ntripProfiles[settings.ntripActive || 0], name = $('nProfName').value.trim();
    if (!name) { $('nProfName').value = p.name; return; }
    p.name = name; save(STORE_SETTINGS, settings); renderProfiles();
  }
  function deleteProfile() {
    if (settings.ntripProfiles.length < 2 || state.ntripOn) return;
    var i = settings.ntripActive || 0;
    if (!confirm('Supprimer le profil « ' + settings.ntripProfiles[i].name + ' » ?')) return;
    settings.ntripProfiles.splice(i, 1);
    settings.ntripActive = 0;
    profToFields(settings.ntripProfiles[0]); persistFields(); renderProfiles();
  }

  // ---------- NTRIP ----------
  function setNtripMsg(text, cls) { var m = $('ntripMsg'); m.textContent = text; m.className = 'msg' + (cls ? ' ' + cls : ''); }
  function ntripStart() {
    persistFields();
    if (!Native) { setNtripMsg('Corrections disponibles seulement dans l’application Android.', 'warn'); return; }
    if (radioMode()) { setNtripMsg('Source « Radio » choisie : le NTRIP mélangerait deux sources de corrections.', 'warn'); return; }
    if (!state.connected || state.sim) { setNtripMsg('Connecter d’abord un récepteur réel.', 'warn'); return; }
    if (!$('nHost').value || !$('nMount').value) { setNtripMsg('Serveur et point de montage requis.', 'warn'); return; }
    state.ntripOn = true; state.lastGgaToCaster = 0;
    $('btnNtrip').disabled = true; $('btnNtripStop').disabled = false;
    if (Native.ntripSetAgent) Native.ntripSetAgent($('nAgent').value.trim());
    if (Native.ntripGgaEnabled) Native.ntripGgaEnabled($('nGga').checked);
    // La position est remise AVANT la connexion : certains serveurs (iMAX, VRS) l'exigent dès la demande.
    if (state.gga && $('nGga').checked) { Native.ntripGga(state.gga.raw); state.lastGgaToCaster = Date.now(); }
    Native.ntripStart($('nHost').value.trim(), parseInt($('nPort').value, 10) || 2101, $('nMount').value.trim(),
      $('nUser').value.trim(), $('nPass').value);
  }
  function ntripStop() {
    state.ntripOn = false; state.base = null;
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
    state.measAgeMax = null;
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
    r.baseKm = baseKm(); r.baseId = baseIdNow();
    r.corrSrc = corrSourceLabel(); r.ageMax = state.measAgeMax;
    var ageLim = numVal('kAgeMax', 5);
    if (r.n && r.ageMax !== null && r.ageMax !== undefined && r.ageMax > ageLim) {
      r.reasons.push('Âge des corrections jusqu\u2019à ' + r.ageMax.toFixed(1) + ' s (> ' + ageLim + ' s) : liaison ' + (radioMode() ? 'radio' : 'Internet') + ' faible, vérifier ou répéter');
      r.baseWarn = true;
    }
    if (r.n && r.baseKm !== null && r.baseKm > numVal('jBaseMax', 10)) {
      r.reasons.push('Ligne de base ' + r.baseKm.toFixed(1) + ' km > ' + numVal('jBaseMax', 10) + ' km : altitude moins fiable, répéter plus tard ou fermer sur un repère');
      r.baseWarn = true;
    }
    state.pending = r;
    var box = $('result'); box.style.display = 'block';
    $('rTitle').textContent = 'Point ' + $('mNom').value.trim();
    var msg = $('rMsg');
    if (r.ok && r.baseWarn) { msg.className = 'msg warn'; msg.textContent = 'Critères respectés, mais : ' + r.reasons.join(' · '); }
    else if (r.ok) { msg.className = 'msg ok'; msg.textContent = 'Critères respectés.' + (r.reasons.length ? ' ' + r.reasons.join(' · ') : ''); }
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
        ['Solution', Nmea.FIX_LABELS[r.quality] || r.quality],
        ['Ligne de base', r.baseKm === null ? 'inconnue' : r.baseKm.toFixed(1) + ' km' + (r.baseId !== null ? ' (' + esc(String(r.baseId)) + ')' : '')],
        ['Corrections', esc(r.corrSrc) + (r.ageMax !== null && r.ageMax !== undefined ? ' · âge max ' + r.ageMax.toFixed(1) + ' s' : '')]
      ]);
    } else rows = [['Époques rejetées', String(r.rejected)]];
    $('rList').innerHTML = rows.map(function (x) { return '<dt>' + x[0] + '</dt><dd>' + x[1] + '</dd>'; }).join('');
    $('btnKeep').disabled = !r.n;
    $('btnKeep').textContent = r.ok ? 'Conserver' : 'Conserver quand même';
  }
  function keepPoint() {
    var r = state.pending; if (!r || !r.n) return;
    var jw = jobWritable(); if (!jw.ok) { alertMsg(jw.why); return; }
    var nm = $('mNom').value.trim();
    if (jobPoints().some(function (q) { return q.nom === nm; })) {
      var nx = settings.jNum === 'libre' ? null : autoPointName();
      alertMsg('Le point ' + nm + ' existe déjà dans ce travail. Changer le nom' + (nx ? ' (prochain libre : ' + nx + ')' : '') + ' puis conserver.');
      if (nx) $('mNom').value = nx;
      return;
    }
    // Contrôle sur un point de référence liée : enregistré au travail (écarts), sans ajouter le point d'origine au levé.
    var ctlNote = '';
    if (window.Refs && Refs.control.active()) {
      var cr = Refs.control.record(r, $('mLeve').value.trim());
      if (!cr.keep) { state.pending = null; state.recorder = null; $('result').style.display = 'none'; $('prog').style.width = '0%'; renderJobBar(); return; }
      ctlNote = cr.note;
    }
    // Point implanté : écarts à la cible enregistrés au travail et notés au point.
    var stake = window.Stake && Stake.active() ? Stake.record(r, $('mLeve').value.trim(), $('mNom').value.trim()) : null;
    if (stake) ctlNote = (ctlNote + ' ' + stake.note).trim();
    var p = {
      leve: $('mLeve').value.trim(), nom: $('mNom').value.trim(), code: $('mCode').value.trim(), note: ($('mNote').value.trim() + (ctlNote ? ' ' + ctlNote : '')).trim(),
      codeDesc: codeDescription($('mCode').value), type: 'mesure',
      est: r.est, nord: r.nord, alt: r.alt, systeme: r.systeme, systemeAlti: r.systemeAlti, sep: r.sep,
      baseKm: r.baseKm, baseId: r.baseId, corrSrc: r.corrSrc, ageMax: r.ageMax,
      lat: r.lat, lon: r.lon, hEll: r.hEll, sigmaH: r.sigmaH, sigmaV: r.sigmaV, n: r.n, rejected: r.rejected,
      qualityLabel: (Nmea.FIX_LABELS[r.quality] || r.quality) + (r.ok ? '' : ' (hors critères)'),
      pole: r.pole, apc: r.apc, recepteur: state.driver ? state.driver.label : '', start: r.start, end: r.end
    };
    if (stake) { p.implante = stake.cible; p.type = 'mesure'; }
    points.push(p); save(STORE_POINTS, points);
    rememberCode(Codes.parseDesc(p.code).base);
    if (!(window.LeveCodes && LeveCodes.active())) afterPointCode();
    $('mNom').value = settings.jNum === 'libre' ? Survey.nextPointName(p.nom) : (autoPointName() || Survey.nextPointName(p.nom));
    $('mNote').value = '';
    persistFields();
    state.pending = null; state.recorder = null;
    $('result').style.display = 'none'; $('prog').style.width = '0%';
    renderPoints();
  }
  function dropPoint() { state.pending = null; state.recorder = null; $('result').style.display = 'none'; $('prog').style.width = '0%'; }
  function redo() { dropPoint(); startMeasure(); }

  // ---------- Ligne de base ----------
  // NTRIP : position de la station lue dans les corrections (1005/1006).
  // Radio : position de la base inscrite (ou prise d'un point mesuré) dans l'onglet Récepteur.
  function baseKm() {
    var g = state.gga;
    if (!g || g.hEll === null || g.lat === null) return null;
    if (radioMode()) {
      var rb = radioBase();
      return rb ? Ntrip.baselineKm(g.lat, g.lon, g.hEll, rb.x, rb.y, rb.z) : null;
    }
    var b = state.base;
    if (!b || Date.now() - b.at > 120000) return null;
    return Ntrip.baselineKm(g.lat, g.lon, g.hEll, b.x, b.y, b.z);
  }
  function baseIdNow() {
    if (radioMode()) {
      var nm = $('kBaseName').value.trim();
      if (nm) return nm;
      return state.gga && state.gga.refStation ? 'station ' + state.gga.refStation : null;
    }
    return state.base ? state.base.id : null;
  }
  function corrTooOld(g) { return g && g.quality >= 2 && g.ageCorr !== null && g.ageCorr !== undefined && g.ageCorr > numVal('kAgeMax', 5); }

  // ---------- Source des corrections : NTRIP (tablette) ou radio (récepteur) ----------
  function radioMode() { return $('kSrc').value === 'radio'; }
  function corrSourceLabel() {
    if (radioMode()) return 'Radio (recepteur)';
    return state.ntripOn ? 'NTRIP ' + $('nMount').value.trim() : 'Aucune relayee par la tablette';
  }
  /* Position de la base (radio) : Est / Nord / Altitude dans le système du travail -> ECEF. */
  function radioBase() {
    var e = numVal('kBaseE', NaN), n = numVal('kBaseN', NaN);
    if (isNaN(e) || isNaN(n)) return null;
    var hz = Proj.horizontalById($('jHz').value);
    if (!hz.zone) return null;
    var geo = Proj.mtm(hz.zone).inverse(e, n); // NAD83 ou SCRS : écart d'environ 1 m, négligeable pour une ligne de base
    var z = numVal('kBaseZ', NaN), vt = Proj.verticalById($('jVt').value), N = null;
    if (vt.grid) N = Proj.gridValue(vt.grid, geo.lat, geo.lon);
    else if (vt.id === '10588-sep') N = numVal('jSep', NaN);
    var h = isNaN(z) ? (state.gga && state.gga.hEll !== null ? state.gga.hEll : 0) : z + (N === null || isNaN(N) ? 0 : N);
    var p = Ntrip.geoToEcef(geo.lat, geo.lon, h);
    p.lat = geo.lat; p.lon = geo.lon;
    return p;
  }
  function applySrc() {
    var radio = radioMode();
    $('radioBox').style.display = radio ? '' : 'none';
    $('ntripBox').style.display = radio ? 'none' : '';
    if (radio && state.ntripOn) ntripStop();
    renderRadio();
  }
  function renderRadio() {
    if (!radioMode()) return;
    var m = $('radioMsg'), hz = Proj.horizontalById($('jHz').value);
    if (!hz.zone) { m.className = 'msg warn'; m.textContent = 'Choisir un système MTM dans l\u2019onglet Travail pour inscrire la base en Est / Nord.'; return; }
    var rb = radioBase();
    if (!rb) { m.className = 'msg'; m.textContent = 'Inscrire Est et Nord de la base (ou prendre un point mesuré) pour obtenir la ligne de base.'; return; }
    m.className = 'msg ok';
    m.textContent = 'Base : ' + rb.lat.toFixed(6) + '°, ' + rb.lon.toFixed(6) + '°' + (isNaN(numVal('kBaseZ', NaN)) ? ' (altitude non inscrite : hauteur du mobile utilisée)' : '') + '.';
  }
  function fillBasePoints() {
    var sel = $('kBasePt'); sel.innerHTML = '';
    addOpt(sel, '', points.length ? '— Choisir un point (' + points.length + ') —' : '— Aucun point mesuré —');
    points.forEach(function (p, i) { if (p.lat !== null && p.lat !== undefined) addOpt(sel, String(i), p.nom + (p.code ? ' (' + p.code + ')' : '')); });
  }
  function takeBasePoint() {
    var i = $('kBasePt').value; if (i === '') return;
    var p = points[+i]; if (!p) return;
    var cv = Proj.convert(p.lat, p.lon, p.hEll, job()); // recalculé dans le système actuel du travail
    if (cv.e === null) { $('radioMsg').className = 'msg warn'; $('radioMsg').textContent = 'Système du travail sans coordonnées planes.'; return; }
    $('kBaseE').value = cv.e.toFixed(3); $('kBaseN').value = cv.n.toFixed(3);
    $('kBaseZ').value = cv.z !== null ? cv.z.toFixed(3) : '';
    if (!$('kBaseName').value.trim()) $('kBaseName').value = p.nom;
    $('kBasePt').value = '';
    persistFields(); renderRadio();
  }

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
    var m = $('leveMsg');
    if (!v.trim()) { m.style.display = 'none'; return; }
    var r = Codes.validateLeve(v, ssValue());
    m.style.display = '';
    if (r.ok) {
      var nat = Codes.nat().filter(function (n) { return n.code === r.parts.nat; })[0], ty = Codes.types().filter(function (t) { return t.code === r.parts.type; })[0];
      m.className = 'msg ok'; m.textContent = 'Nom conforme : ' + (ty ? ty.description : '') + ' · ' + (nat ? nat.description : '') + ' · secteur ' + r.parts.sect + '.';
    } else if (v.trim().length < 16) {
      m.className = 'msg'; m.textContent = 'En cours de saisie (' + v.trim().length + ' / 16).';
    } else { m.className = 'msg warn'; m.textContent = r.errors.join(' · ') + '. Le levé serait « À vérifier » au dépôt.'; }
  }

  // ---------- Nomenclature : arpenteur, nom du levé, numéros de points ----------
  function ssValue() { var v = $('jSS').value.trim(); return /^\d{1,2}$/.test(v) && +v > 0 ? ('0' + v).slice(-2) : ''; }
  /* Type de levé (#) lu dans le nom du levé, s'il est conforme. */
  function leveType() { var r = Codes.validateLeve($('mLeve').value); return r.parts ? r.parts.type : ''; }
  function fillNomenclature() {
    var t = $('jType'), n = $('jNat'), tv = t.value || settings.jType, nv = n.value || settings.jNat;
    t.innerHTML = ''; n.innerHTML = '';
    Codes.types().forEach(function (x) { addOpt(t, x.code, x.code + ' – ' + x.description); });
    addOpt(n, '', '— Choisir —');
    Codes.nat().forEach(function (x) { addOpt(n, x.code, x.code + ' – ' + x.description); });
    if (tv) t.value = tv;
    if (nv && Codes.nat().some(function (x) { return x.code === nv; })) n.value = nv;
  }
  function renderSS() {
    var ss = ssValue(), a = ss ? Codes.arpenteur(ss) : null;
    $('jSSNameWrap').style.display = Codes.arpenteurs().length ? '' : 'none';
    $('jSSName').value = a ? a.nom + (a.actif ? '' : ' (inactif)') : (ss && Codes.arpenteurs().length ? 'Code absent de reference.json' : '');
    var yr0 = new Date().getFullYear() % 10 === 0;
    $('jAWrap').style.display = yr0 && $('jNum').value === 'an' ? '' : 'none';
    var h = $('jNumHint');
    if ($('jNum').value === 'libre') h.textContent = 'Le nom suivant reprend le dernier en augmentant son numéro (P9 → P10).';
    else if (!ss) h.textContent = 'Inscrire votre code d\u2019arpenteur (SS) pour numéroter les points AJJJSS001.';
    else h.textContent = 'Aujourd\u2019hui : ' + Codes.pointPrefix(new Date(), ss, yr0 ? $('jA').value : null) + '001, ' +
      'A = dernier chiffre de l\u2019année, JJJ = jour de l\u2019année, SS = votre code, NNN = 001 à 199 en levé, 200 à 400 en implantation (type 2)' + (yr0 ? ' ; année en 0 : A = dernier chiffre de l\u2019année avant le début du contrat' : '') + '.';
  }
  /* Prochain numéro AJJJSS### libre (tous les points de l'appareil), ou null si non applicable. */
  function autoPointName() {
    var ss = ssValue(); if ($('jNum').value !== 'an' || !ss) return null;
    var yr0 = new Date().getFullYear() % 10 === 0;
    if (yr0 && !/^\d$/.test($('jA').value)) return null;
    var prefix = Codes.pointPrefix(new Date(), ss, yr0 ? $('jA').value : null);
    return Codes.nextPointNumber(prefix, points.map(function (p) { return p.nom; }), Codes.pointRange(leveType()));
  }
  /* Nomenclature AN : remplace un nom par défaut, ou d'un autre jour / autre code, par le prochain numéro du jour. */
  function refreshAutoName() {
    if ($('jNum').value !== 'an') return;
    var auto = autoPointName(), cur = $('mNom').value.trim();
    if (auto && (!cur || /^\d{1,3}$/.test(cur) || (/^\d{9}$/.test(cur) && cur.slice(0, 6) !== auto.slice(0, 6)))) { $('mNom').value = auto; persistFields(); }
  }
  function composeLeve() {
    var ss = ssValue(), sect = $('jSect').value.trim().toUpperCase();
    if (!ss) { alertLeve('Inscrire votre code d\u2019arpenteur (SS) dans « Arpenteur et numérotation ».'); return; }
    if (!/^[A-Z0-9]{4}$/.test(sect)) { alertLeve('Le secteur compte 4 caractères (lettres ou chiffres).'); return; }
    if (!$('jNat').value) { alertLeve('Choisir la nature (NAT).'); return; }
    $('mLeve').value = Codes.leveName({ date: new Date(), sect: sect, type: $('jType').value, nat: $('jNat').value, ss: ss });
    persistFields(); updateGhost(); updateJobUi(); registerJob($('mLeve').value.trim()); renderJobBar(); refreshAutoName();
  }
  function alertLeve(t) { var m = $('leveMsg'); m.style.display = ''; m.className = 'msg warn'; m.textContent = t; }

  // ---------- Fichier de référence (reference.json, gardé sur l'appareil) ----------
  function renderRef() {
    var m = $('refMsg'), v = Codes.refVersion();
    $('btnRefClear').style.display = v !== null ? '' : 'none';
    if (v === null) { m.className = 'msg'; m.textContent = 'Aucun fichier chargé : natures de la copie publique (' + Codes.nat().length + '), ' + Codes.count() + ' codes de points.'; return; }
    m.className = 'msg ok';
    m.textContent = 'reference.json' + (v ? ' du ' + v : '') + ' : ' + Codes.arpenteurs().length + ' code(s) d\u2019arpenteur, ' + Codes.nat().length + ' nature(s).';
  }
  function loadRefFile(file) {
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var kept = Codes.loadReference(JSON.parse(String(fr.result).replace(/^\uFEFF/, '')));
        save(STORE_REF, kept); Codes.applyReference(kept);
        fillNomenclature(); renderSS(); renderRef(); updateGhost();
      } catch (e) { $('refMsg').className = 'msg bad'; $('refMsg').textContent = 'Fichier refusé : ' + e.message + '.'; }
    };
    fr.onerror = function () { $('refMsg').className = 'msg bad'; $('refMsg').textContent = 'Lecture impossible.'; };
    fr.readAsText(file);
  }

  // ---------- Codes de points (Pcodes) ----------
  var codeBase = '';
  function codeDescription(desc) { var c = Codes.byCode(Codes.parseDesc(desc).base); return c ? c.description : ''; }
  function fillControls() {
    var sel = $('mCtl'); sel.innerHTML = '';
    Codes.CONTROLS.forEach(function (c) { addOpt(sel, c.v, c.label); });
    var box = $('cmdChips'); box.innerHTML = '';
    Codes.commands().forEach(function (c) {
      var b = document.createElement('button'); b.className = 'chip'; b.type = 'button'; b.textContent = c.code; b.title = c.description;
      b.addEventListener('click', function () { $('mCode').value = $('mCode').value.trim() + '_' + c.code; onDescEdit(); });
      box.appendChild(b);
    });
    var u = document.createElement('button'); u.className = 'chip'; u.type = 'button'; u.textContent = '_ liaison';
    u.title = 'Liaison multiple : 526 1.2_2.1 ferme le string 1 et débute le string 2';
    u.addEventListener('click', function () { $('mCode').value = $('mCode').value.trim() + '_'; $('mCode').focus(); });
    box.appendChild(u);
  }
  function renderCodeList() {
    var q = $('codeQ').value, list = Codes.search(q, 8), box = $('codeList');
    box.innerHTML = '';
    list.forEach(function (c) {
      var b = document.createElement('button'); b.type = 'button';
      b.innerHTML = '<span class="c">' + esc(c.code) + '</span><span class="a">' + esc(c.aph) + '</span><span class="d">' + esc(c.description) + '<small>' + esc(c.categorie) + '</small></span>';
      b.addEventListener('click', function () { pickCode(c.code); });
      box.appendChild(b);
    });
    box.classList.toggle('on', list.length > 0 && q.trim().length > 0);
  }
  function pickCode(code) {
    if (code !== codeBase) { $('mStr').value = nextString(code); $('mCtl').value = '.1'; }
    codeBase = code;
    $('codeQ').value = ''; $('codeList').classList.remove('on');
    buildDesc(); renderCodeSel();
  }
  /* Prochain numéro de ligne libre pour ce code, dans le levé courant. */
  function nextString(code) {
    var leve = $('mLeve').value.trim(), max = 0;
    points.forEach(function (p) {
      if (p.leve !== leve) return;
      String(p.code || '').split('_').forEach(function (part, i) {
        var d = Codes.parseDesc(i ? (/^\d+(\.\d)?$/.test(part.trim()) ? Codes.parseDesc(p.code).base + ' ' + part : part) : part);
        if (d.base === code && d.str) max = Math.max(max, +d.str);
      });
    });
    return String(max + 1);
  }
  function buildDesc() {
    var extra = Codes.parseDesc($('mCode').value).extra;
    $('mCode').value = Codes.compose(codeBase, $('mStr').value, $('mCtl').value, extra);
    persistFields(); renderCodeHint();
  }
  function onDescEdit() {
    var d = Codes.parseDesc($('mCode').value);
    codeBase = d.base; $('mStr').value = d.str; $('mCtl').value = d.ctl;
    persistFields(); renderCodeSel(); renderCodeHint();
  }
  function renderCodeSel() {
    var c = codeBase ? Codes.byCode(codeBase) : null;
    $('codeSel').innerHTML = !codeBase ? '<span class="hint">Aucun code choisi.</span>'
      : c ? 'Code <b>' + esc(c.code) + (c.aph ? ' ' + esc(c.aph) : '') + '</b> · ' + esc(c.description) + ' <span class="hint">(' + esc(c.categorie) + ')</span>'
        : '<span style="color:var(--warn)">Code « ' + esc(codeBase) + ' » absent de la liste des Pcodes.</span>';
    var rec = $('codeRecent'); rec.innerHTML = '';
    (settings.recentCodes || []).forEach(function (code) {
      var k = Codes.byCode(code); if (!k) return;
      var b = document.createElement('button'); b.type = 'button'; b.className = 'chip' + (code === codeBase ? ' sel' : '');
      b.textContent = code + (k.aph ? ' ' + k.aph : ''); b.title = k.description;
      b.addEventListener('click', function () { pickCode(code); });
      rec.appendChild(b);
    });
  }
  function renderCodeHint() {
    var d = Codes.parseDesc($('mCode').value), h = $('codeHint');
    var ctl = Codes.CONTROLS.filter(function (c) { return c.v === d.ctl; })[0];
    h.textContent = !d.base ? 'Description : Pcode String.Contrôle, ex. 526 1.1 (code 526, ligne 1, début de ligne).'
      : 'Ce point : code ' + d.base + (d.str ? ', ligne ' + d.str : ', sans ligne') + (d.ctl && ctl ? ', ' + ctl.label.replace(/^\.\d /, '').toLowerCase() : '') + (d.extra ? ', ' + d.extra : '') + '.';
  }
  function rememberCode(code) {
    if (!code || !Codes.byCode(code)) return;
    var r = (settings.recentCodes || []).filter(function (c) { return c !== code; });
    r.unshift(code); settings.recentCodes = r.slice(0, 8); save(STORE_SETTINGS, settings);
  }
  /* Après un point : le contrôle ne vaut que pour ce point ; une forme fermée (.2) prépare la ligne suivante. */
  function afterPointCode() {
    var d = Codes.parseDesc($('mCode').value);
    codeBase = d.base;
    if (d.extra) { $('mCode').value = Codes.compose(d.base, d.str, '', ''); onDescEdit(); return; }
    if (d.ctl === '.2') { $('mStr').value = String((+d.str || 0) + 1); $('mCtl').value = '.1'; }
    else $('mCtl').value = '';
    buildDesc(); renderCodeSel();
  }
  function newString() {
    if (!codeBase) { $('codeQ').focus(); return; }
    var n = Math.max(+nextString(codeBase), (+$('mStr').value || 0) + 1);
    $('mStr').value = String(n); $('mCtl').value = '.1'; buildDesc();
  }
  function today() {
    var d = new Date();
    var ymd = String(d.getFullYear()).slice(2) + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
    var v = $('mLeve').value;
    $('mLeve').value = v.replace(/^\d{0,6}/, ymd);
    updateGhost(); updateJobUi(); persistFields(); renderJobBar(); $('mLeve').focus();
  }

  // ---------- Points ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function renderPoints() {
    fillBasePoints(); if (window.AppCtx) renderJobBar();
    document.dispatchEvent(new Event('cg:points'));
    var all = $('ptAll').checked, cur = $('mLeve').value.trim();
    var shown = []; points.forEach(function (p, i) { if (all || (p.leve || '') === cur) shown.push({ p: p, i: i }); });
    $('nbPoints').textContent = shown.length ? '(' + shown.length + ')' : '';
    $('ptEmpty').style.display = shown.length ? 'none' : 'block';
    $('ptEmpty').textContent = all ? 'Aucun point sur l\u2019appareil.' : 'Aucun point dans le travail ' + (cur || '(sans nom)') + '.';
    $('ptJobTh').style.display = all ? '' : 'none';
    $('btnExport').textContent = all ? 'Exporter tous les travaux (CSV)' : 'Exporter le travail en cours (CSV)';
    $('ptBody').innerHTML = shown.map(function (x) {
      var p = x.p, i = x.i;
      var f3 = function (v) { return v === null || v === undefined ? '—' : v.toFixed(3); };
      var theo = p.type && p.type !== 'mesure';
      return '<tr><td' + (theo ? ' class="theo" title="' + esc(p.type + (p.formule ? ' : ' + p.formule : '')) + '"' : '') + '>' + esc(p.nom) + '</td><td>' + esc(p.code) + '</td><td class="num">' + f3(p.est) + '</td><td class="num">' + f3(p.nord) +
        '</td><td class="num">' + f3(p.alt) + '</td><td class="num">' + fmtCm(p.sigmaH) + '</td><td class="num">' + fmtCm(p.sigmaV) +
        '</td>' + (all ? '<td>' + esc(p.leve || '') + '</td>' : '') + '<td><button class="btn danger" data-del="' + i + '" title="Supprimer">✕</button></td></tr>';
    }).join('');
  }
  function exportCsv() {
    var cur = $('mLeve').value.trim(), list = $('ptAll').checked ? points : points.filter(function (p) { return (p.leve || '') === cur; });
    if (!list.length) return;
    var csv = Survey.toCsv(list);
    var d = new Date();
    var stamp = String(d.getFullYear()).slice(2) + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
    var leve = ($('ptAll').checked ? 'tous_travaux' : (cur || 'collecte')).replace(/[^\w#-]+/g, '_');
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
          if (ev.state === 'connected') {
            // Page rechargée pendant que le service était relié : recréer le décodeur.
            if (!state.decoder) { state.driver = currentDriver(); state.decoder = state.driver.createDecoder(onSentence); }
            onConnected('Connecté à ' + (ev.msg || 'récepteur') + '.');
          }
          else if (ev.state === 'connecting') setBtMsg('Connexion…');
          else if (ev.state === 'reconnecting') {
            // Coupure du lien : le service réessaie seul ; les corrections NTRIP restent ouvertes.
            if (!state.connected) onConnected('');
            setBtMsg(ev.msg || 'Lien perdu — reconnexion…', 'warn');
          }
          else if (ev.state === 'error') { onDisconnected('Erreur : ' + (ev.msg || ''), 'bad'); if (state.ntripOn) ntripStop(); }
          else { onDisconnected(ev.msg || 'Déconnecté.'); if (state.ntripOn) ntripStop(); }
          break;
        case 'ntrip':
          var cls = ev.state === 'connected' ? 'ok' : (ev.state === 'error' || ev.state === 'retry') ? 'bad' : '';
          var kb = ev.bytes ? ' — ' + (ev.bytes / 1024).toFixed(1) + ' ko reçus' : '';
          setNtripMsg((ev.msg || ev.state) + kb, cls);
          if (ev.state === 'stopped') { state.ntripOn = false; $('btnNtrip').disabled = false; $('btnNtripStop').disabled = true; }
          else if (!state.ntripOn) { state.ntripOn = true; $('btnNtrip').disabled = true; $('btnNtripStop').disabled = false; }
          break;
        case 'base':
          state.base = { id: ev.id, x: ev.x, y: ev.y, z: ev.z, at: Date.now() };
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
          document.dispatchEvent(new CustomEvent('cg:file', { detail: { ok: !!ev.ok } }));
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
  $('nProfile').addEventListener('change', function () { switchProfile(parseInt(this.value, 10)); });
  $('btnProfNew').addEventListener('click', newProfile);
  $('nProfName').addEventListener('change', renameProfile);
  $('btnProfDel').addEventListener('click', deleteProfile);
  Object.keys(PROF_FIELDS).forEach(function (k) { $(PROF_FIELDS[k]).addEventListener('change', saveActiveProfile); });
  $('nMountSel').addEventListener('change', function () { if (this.value) { $('nMount').value = this.value; saveActiveProfile(); } });
  $('btnMeasure').addEventListener('click', startMeasure);
  $('btnCancel').addEventListener('click', cancelMeasure);
  $('btnToday').addEventListener('click', today);
  $('mLeve').addEventListener('input', function () { updateGhost(); updateJobUi(); renderJobBar(); });
  ['jHz', 'jVt', 'jSep'].forEach(function (id) { $(id).addEventListener('change', function () { updateJobUi(); persistFields(); }); });
  $('mApc').addEventListener('change', function () {
    settings.apcByDriver = settings.apcByDriver || {};
    settings.apcByDriver[currentDriver().id] = numVal('mApc', 0); save(STORE_SETTINGS, settings);
  });
  $('btnKeep').addEventListener('click', keepPoint);
  $('btnDrop').addEventListener('click', dropPoint);
  $('btnRedo').addEventListener('click', redo);
  $('btnExport').addEventListener('click', exportCsv);
  $('ptAll').addEventListener('change', renderPoints);
  $('btnClear').addEventListener('click', function () {
    if (!points.length || !confirm('Effacer les ' + points.length + ' points de cet appareil?')) return;
    points = []; save(STORE_POINTS, points); renderPoints();
  });
  $('ptBody').addEventListener('click', function (e) {
    var i = e.target.getAttribute('data-del'); if (i === null) return;
    var pt = points[i], jw = jobWritable();
    if ((pt.leve || '') !== $('mLeve').value.trim() || !jw.ok) { alert('Le point ' + pt.nom + ' appartient au travail ' + (pt.leve || '(sans nom)') + ', en consultation : il ne peut pas être supprimé.'); return; }
    if (!confirm('Supprimer le point ' + pt.nom + ' du travail ' + (pt.leve || '') + ' ?')) return;
    points.splice(+i, 1); save(STORE_POINTS, points); renderPoints();
  });
  document.querySelectorAll('input').forEach(function (el) { el.addEventListener('change', persistFields); });
  $('nGga').addEventListener('change', function () { if (Native && Native.ntripGgaEnabled) Native.ntripGgaEnabled(this.checked); });
  $('bScreen').addEventListener('change', applyScreen);
  $('codeQ').addEventListener('input', renderCodeList);
  $('codeQ').addEventListener('keydown', function (e) { if (e.key === 'Enter') { var r = Codes.search(this.value, 1); if (r.length) pickCode(r[0].code); } });
  $('mStr').addEventListener('input', buildDesc);
  $('mCtl').addEventListener('change', buildDesc);
  $('mCode').addEventListener('input', onDescEdit);
  $('btnNewStr').addEventListener('click', newString);
  $('btnAutoName').addEventListener('click', function () {
    var n = settings.jNum === 'libre' ? null : autoPointName();
    if (n) { $('mNom').value = n; persistFields(); } else if ($('jNum').value === 'an') alertMsg('Inscrire votre code d\u2019arpenteur (SS) dans l\u2019onglet Travail.');
  });
  $('btnCompose').addEventListener('click', composeLeve);
  $('jSect').addEventListener('change', function () {
    // Un numéro de contrat donne le secteur par défaut : AN-26-005 -> A005, MA-26-0495 -> M495.
    var d = Codes.defaultSector(this.value);
    this.value = d || this.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    persistFields();
  });
  ['jSS', 'jNum', 'jA'].forEach(function (id) { $(id).addEventListener('change', function () { persistFields(); renderSS(); updateGhost(); refreshAutoName(); }); });
  $('refFile').addEventListener('change', function () { if (this.files && this.files[0]) loadRefFile(this.files[0]); this.value = ''; });
  $('btnRefClear').addEventListener('click', function () {
    if (!confirm('Retirer reference.json de cet appareil ?')) return;
    try { localStorage.removeItem(STORE_REF); } catch (e) { /* rien */ }
    Codes.applyReference(null); fillNomenclature(); renderSS(); renderRef(); updateGhost();
  });
  $('kSrc').addEventListener('change', function () { persistFields(); applySrc(); });
  $('kBasePt').addEventListener('change', takeBasePoint);
  ['kBaseE', 'kBaseN', 'kBaseZ', 'jHz', 'jVt'].forEach(function (id) { $(id).addEventListener('change', renderRadio); });
  $('btnBattery').addEventListener('click', function () { if (Native && Native.requestBatteryExemption) Native.requestBatteryExemption(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) renderBackground(); });

  fillDrivers();
  fillSystems();
  var storedRef = load(STORE_REF, null);
  if (storedRef) Codes.applyReference(storedRef);
  fillNomenclature();
  fillControls();
  if (!settings.jHz) settings.jHz = '2949';
  if (!settings.jVt || settings.jVt === '10588-grille') settings.jVt = '10588-2010';
  restoreFields();
  if (!currentDriver() || !Drivers.byId($('selDriver').value)) $('selDriver').selectedIndex = 0;
  applyTheme();
  onDriverChange();
  refreshDevices();
  initProfiles();
  renderPoints();
  updateGhost();
  updateJobUi();
  applyScreen();
  renderBackground();
  applySrc();
  onDescEdit();
  renderSS();
  renderRef();
  refreshAutoName();
  if ($('mLeve').value.trim()) registerJob($('mLeve').value.trim());
  renderJobBar();
  // Le service de collecte a pu rester relié pendant que l'interface était fermée : on reprend son état.
  if (Native && Native.syncState) {
    var addr = Native.syncState();
    if (addr) { $('selDevice').value = addr; }
  }
  // ---------- Travaux (jobs) : le travail en cours, ouvert ou en consultation ----------
  function sameDay(a, b) { return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
  function registerJob(name) {
    if (!name || jobs[name]) return;
    jobs[name] = { created: new Date().toISOString() }; save(STORE_JOBS, jobs);
  }
  /* Date d'un travail : AAMMJJ du nom (NDA-001), sinon date de création, sinon date du premier point. */
  function jobDate(name) {
    var m = /^(\d{2})(\d{2})(\d{2})/.exec(name || '');
    if (m) { var d = new Date(2000 + +m[1], +m[2] - 1, +m[3]); if (d.getMonth() === +m[2] - 1 && d.getDate() === +m[3]) return d; }
    if (jobs[name] && jobs[name].created) return new Date(jobs[name].created);
    for (var i = 0; i < points.length; i++) if (points[i].leve === name && points[i].start) return new Date(points[i].start);
    return null;
  }
  function jobPoints(name) { name = name === undefined ? $('mLeve').value.trim() : name; return points.filter(function (p) { return (p.leve || '') === name; }); }
  /* Le travail en cours reçoit-il des points ? Critère : sa date est aujourd'hui. */
  function jobWritable() {
    var name = $('mLeve').value.trim();
    if (!name) return { ok: false, why: 'Aucun travail : inscrire ou composer le nom du travail dans l’onglet Travail.' };
    var d = jobDate(name);
    if (d && !sameDay(d, new Date())) return { ok: false, why: 'Travail ' + name + ' du ' + d.toLocaleDateString('fr-CA') + ' : en consultation seulement. Créer un nouveau travail pour ajouter des points.' };
    return { ok: true, why: '' };
  }
  function allJobs() {
    var map = {};
    Object.keys(jobs).forEach(function (n) { map[n] = 0; });
    points.forEach(function (p) { var n = p.leve || ''; if (n) map[n] = (map[n] || 0) + 1; });
    return Object.keys(map).map(function (n) { return { name: n, count: map[n], date: jobDate(n) }; })
      .sort(function (a, b) { return (b.date ? b.date.getTime() : 0) - (a.date ? a.date.getTime() : 0) || a.name.localeCompare(b.name); });
  }
  function renderJobBar() {
    var name = $('mLeve').value.trim(), bar = $('jobBar'), jw = jobWritable(), d = jobDate(name);
    bar.className = 'jobbar' + (!name ? ' none' : jw.ok ? '' : ' closed');
    var ssMissing = settings.jNum !== 'libre' && !ssValue();
    if (!name) bar.innerHTML = '<b>Aucun travail</b><small>Toucher ici pour créer ou ouvrir un travail.</small>';
    else bar.innerHTML = '<span class="st">' + (jw.ok ? 'Ouvert' : 'Consultation') + '</span>Travail <b>' + esc(name) + '</b>' +
      '<small>' + (d ? d.toLocaleDateString('fr-CA') + ' · ' : '') + jobPoints(name).length + ' point(s)' +
      (ssMissing ? ' · <span style="color:var(--bad)">code d’arpenteur manquant : numéros de points non conformes</span>' : '') + '</small>';
    var sel = $('jOpen'), cur = sel.value; sel.innerHTML = '';
    var o0 = document.createElement('option'); o0.value = ''; o0.textContent = '— Choisir (' + allJobs().length + ') —'; sel.appendChild(o0);
    allJobs().forEach(function (j) {
      var o = document.createElement('option'); o.value = j.name;
      o.textContent = j.name + ' · ' + (j.date ? j.date.toLocaleDateString('fr-CA') : 's. d.') + ' · ' + j.count + ' pt' + (j.date && sameDay(j.date, new Date()) ? ' · ouvert' : '');
      sel.appendChild(o);
    });
    sel.value = '';
    document.dispatchEvent(new Event('cg:job'));
  }
  function openJob(name) {
    $('mLeve').value = name; registerJob(name); persistFields();
    updateGhost(); updateJobUi(); renderJobBar(); refreshAutoName();
  }
  $('jobBar').addEventListener('click', function () { showTab('travail'); });
  $('jOpen').addEventListener('change', function () { if (this.value) openJob(this.value); });
  $('btnNewJob').addEventListener('click', function () {
    $('mLeve').value = ''; updateGhost(); renderJobBar();
    var det = document.querySelector('#tab-travail details'); if (det) det.open = true;
    $('mLeve').focus();
  });
  $('mLeve').addEventListener('change', function () { var n = this.value.trim(); if (n) registerJob(n); renderJobBar(); refreshAutoName(); });
  setInterval(renderJobBar, 60000);   // passage à minuit : le travail de la veille devient en consultation

  // ---------- Contexte partagé avec le module Calculs (cogo-ui.js) ----------
  window.AppCtx = {
    points: function () { return points; },
    job: job,
    leve: function () { return $('mLeve').value.trim(); },
    writable: jobWritable, jobPoints: jobPoints, allJobs: allJobs, jobDate: jobDate,
    /* Enregistre la base de points après une correction faite sur place (outils du levé par codes). */
    savePoints: function () { save(STORE_POINTS, points); renderPoints(); },
    jobMeta: function (name) { name = name || $('mLeve').value.trim(); registerJob(name); return jobs[name]; },
    saveJobs: function () { save(STORE_JOBS, jobs); },
    setDesc: function (d) { $('mCode').value = d; onDescEdit(); },
    desc: function () { return $('mCode').value.trim(); },
    pointName: function () { return $('mNom').value.trim(); },
    isNative: !!Native,
    /* Ajoute des points (calculés, inscrits, importés) à la base de l'appareil. */
    addPoints: function (list) {
      list.forEach(function (p) { points.push(p); });
      save(STORE_POINTS, points); renderPoints(); renderJobBar();
      var names = {}; list.forEach(function (p) { names[p.nom] = 1; });
      if (names[$('mNom').value.trim()]) { $('mNom').value = settings.jNum === 'libre' ? Survey.nextPointName($('mNom').value.trim()) : (autoPointName() || Survey.nextPointName($('mNom').value.trim())); persistFields(); }
    },
    replacePoint: function (i, p) { points[i] = p; save(STORE_POINTS, points); renderPoints(); },
    nextName: function () {
      var n = settings.jNum === 'libre' ? null : autoPointName();
      if (n) return n;
      var last = points.length ? points[points.length - 1].nom : $('mNom').value.trim() || '0';
      var c = Survey.nextPointName(last), used = {}; points.forEach(function (p) { used[p.nom] = 1; });
      while (used[c]) c = Survey.nextPointName(c);
      return c;
    },
    codeDescription: codeDescription,
    saveText: function (name, mime, content) {
      if (Native) { Native.saveFile(name, mime, content); return; }
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([(/csv/.test(mime) ? '\uFEFF' : '') + content], { type: mime }));
      a.download = name; document.body.appendChild(a); a.click(); a.remove();
    },
    esc: esc, settings: settings, save: function () { save(STORE_SETTINGS, settings); },
    /* Position actuelle du récepteur dans le système du travail (pour trier les points par proximité), ou null. */
    here: function () {
      var g = state.gga; if (!g || g.lat === null || Date.now() - state.lastGgaAt > 5000) return null;
      var c = Proj.convert(g.lat, g.lon, g.hEll === null ? null : g.hEll - numVal('mPole', 0) - numVal('mApc', 0), job());
      if (!c || c.e === null) return null;
      var gs = state.gst && Date.now() - state.lastGgaAt < 5000 ? state.gst : null;
      return { e: c.e, n: c.n, z: c.z, q: g.quality, qLabel: Nmea.FIX_LABELS[g.quality] || '',
        sh: gs && gs.sigmaLat !== null && gs.sigmaLon !== null ? Math.hypot(gs.sigmaLat, gs.sigmaLon) : null, sv: gs ? gs.sigmaAlt : null };
    },
    /* Prochain numéro d'implantation du jour (NDA-001, 10.3 : 200 à 400), ou null sans code d'arpenteur. */
    stakeName: function () {
      var ss = ssValue(); if ($('jNum').value !== 'an' || !ss) return null;
      var yr0 = new Date().getFullYear() % 10 === 0;
      if (yr0 && !/^\d$/.test($('jA').value)) return null;
      var prefix = Codes.pointPrefix(new Date(), ss, yr0 ? $('jA').value : null);
      return Codes.nextPointNumber(prefix, points.map(function (p) { return p.nom; }), Codes.pointRange('2'));
    },
    setPointName: function (n) { $('mNom').value = n; persistFields(); }
  };

  $('modeInfo').textContent = Native ? 'Application Android — version ' + Native.appVersion() : 'Mode navigateur : simulation seulement (le Bluetooth exige l’application Android).';
})();
