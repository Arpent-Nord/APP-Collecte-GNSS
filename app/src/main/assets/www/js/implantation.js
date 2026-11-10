/* Collecte GNSS — Arpent-Nord
 * implantation.js : premier module d'implantation GNSS (onglet Mesure → Implantation).
 *  - Point : guider vers un point du travail ou d'une référence liée (nom@source), sans le copier dans le levé.
 *  - Ligne : chaînage et déport par rapport à la ligne A→B (+ droite / − gauche) ; chaînage et déport à implanter au choix.
 * Écarts en grille (plan MTM) : Nord / Est, et Avancer / Droite selon le sens de la marche ; ΔZ en Déblai / Remblai.
 * « Mesurer le point implanté » fait la mesure normale (moyenne, critères) : le point garde un numéro d'implantation
 * (NDA-001 : 200 à 400) et ses écarts à la cible ; le rapport s'exporte en <travail>_IMPLANTATION.csv.
 */
(function (root) {
  'use strict';

  // ---------- Calculs (purs, testés) ----------
  /* Écart de la position me à la cible t (vers la cible) ; heading (rad, depuis le nord, horaire) facultatif. */
  function toTarget(me, t, heading) {
    var dE = t.e - me.e, dN = t.n - me.n, r = { dE: dE, dN: dN, d: Math.hypot(dE, dN), fwd: null, right: null, dZ: null };
    if (heading !== null && heading !== undefined) {
      var ux = Math.sin(heading), uy = Math.cos(heading);
      r.fwd = dE * ux + dN * uy; r.right = dE * uy - dN * ux;
    }
    // déblai (+) : le sol mesuré est plus haut que la cible ; remblai (−) : plus bas
    if (t.z !== null && t.z !== undefined && me.z !== null && me.z !== undefined) r.dZ = me.z - t.z;
    return r;
  }
  /* Position par rapport à la ligne A→B : chaînage depuis A, déport (+ droite / − gauche), Z de la ligne à ce chaînage. */
  function onLine(a, b, p) {
    var dx = b.e - a.e, dy = b.n - a.n, L = Math.hypot(dx, dy);
    if (L < 1e-6) return null;
    var ux = dx / L, uy = dy / L, vx = p.e - a.e, vy = p.n - a.n;
    var ch = vx * ux + vy * uy, off = vx * uy - vy * ux, z = null;
    if (a.z !== null && a.z !== undefined && b.z !== null && b.z !== undefined) z = a.z + (b.z - a.z) * ch / L;
    return { ch: ch, off: off, L: L, z: z, ux: ux, uy: uy };
  }
  /* Point de la ligne A→B au chaînage ch et au déport off (+ droite). */
  function linePoint(a, b, ch, off) {
    var o = onLine(a, b, a); if (!o) return null;
    var z = o.z === null ? null : a.z + (b.z - a.z) * ch / o.L;
    return { e: a.e + o.ux * ch + o.uy * (off || 0), n: a.n + o.uy * ch - o.ux * (off || 0), z: z };
  }
  /* Sens de la marche d'après les positions récentes [{e, n, t}] : il faut au moins 0,5 m parcouru. */
  function headingFrom(track) {
    if (track.length < 2) return null;
    var last = track[track.length - 1];
    for (var i = track.length - 2; i >= 0; i--) {
      var d = Math.hypot(last.e - track[i].e, last.n - track[i].n);
      if (d >= 0.5) return Math.atan2(last.e - track[i].e, last.n - track[i].n);
    }
    return null;
  }
  var calc = { toTarget: toTarget, onLine: onLine, linePoint: linePoint, headingFrom: headingFrom };
  if (typeof module !== 'undefined' && module.exports) { module.exports = calc; return; }

  // ---------- Écran ----------
  var $ = function (id) { return document.getElementById(id); };
  var Ctx = root.AppCtx;
  if (!Ctx || !$('stCard')) return;
  var S = Ctx.settings, esc = Ctx.esc;
  var st = { on: false, type: S.stType || 'point', track: [], target: null, info: null };
  function f3(v) { return v === null || v === undefined || isNaN(v) ? '—' : (+v).toFixed(3); }
  function num(id) { var v = parseFloat(String($(id).value).replace(',', '.')); return isNaN(v) ? NaN : v; }
  function msg(t, cls) { var m = $('stMsg'); m.style.display = t ? '' : 'none'; m.className = 'msg' + (cls ? ' ' + cls : ''); m.textContent = t || ''; }
  ['stP', 'stA', 'stB', 'stCh', 'stOff', 'stStep', 'stTol'].forEach(function (id) {
    if (S[id] !== undefined) $(id).value = S[id];
    $(id).addEventListener('change', function () { S[id] = this.value; Ctx.save(); resolve(); });
  });

  // mode Implantation dans la barre de l'onglet Mesure
  function setOn(on) {
    st.on = on; S.stMode = on; Ctx.save();
    $('stCard').hidden = !on; document.body.classList.toggle('stake-mode', on);
    $('mmStake').classList.toggle('on', on);
    if (on) { $('mmPoint').classList.remove('on'); $('mmCodes').classList.remove('on'); resolve(); setName(); }
    else if (!(root.LeveCodes && LeveCodes.active())) $('mmPoint').classList.add('on');
  }
  $('mmStake').addEventListener('click', function () { if (root.LeveCodes && LeveCodes.active()) $('mmPoint').click(); setOn(true); });
  $('mmPoint').addEventListener('click', function () { if (st.on) setOn(false); });
  $('mmCodes').addEventListener('click', function () { if (st.on) { st.on = false; S.stMode = false; Ctx.save(); $('stCard').hidden = true; document.body.classList.remove('stake-mode'); $('mmStake').classList.remove('on'); } });

  function setType(t) {
    st.type = t; S.stType = t; Ctx.save();
    $('stTPoint').classList.toggle('sel', t === 'point'); $('stTLine').classList.toggle('sel', t === 'line');
    $('stPointIn').hidden = t !== 'point'; $('stLineIn').hidden = t !== 'line';
    resolve();
  }
  $('stTPoint').addEventListener('click', function () { setType('point'); });
  $('stTLine').addEventListener('click', function () { setType('line'); });
  // choix des points : sélecteur du levé et des références liées
  ['stP', 'stA', 'stB'].forEach(function (id) {
    var inp = $(id), wrap = document.createElement('div'), b = document.createElement('button');
    wrap.className = 'inline'; wrap.style.marginTop = '4px';
    inp.parentNode.insertBefore(wrap, inp); wrap.appendChild(inp); inp.style.marginTop = '0';
    b.type = 'button'; b.className = 'btn pkbtn'; b.textContent = 'Points'; wrap.appendChild(b);
    b.addEventListener('click', function () { root.CogoUi.openPicker(inp, 'one', id === 'stP' ? 'Point à implanter' : id === 'stA' ? 'Début de ligne (A)' : 'Fin de ligne (B)'); });
  });
  function step(k) {
    var s = num('stStep') || 5, c = num('stCh');
    $('stCh').value = (Math.max(0, (isNaN(c) ? 0 : c) + k * s)).toFixed(3).replace(/\.?0+$/, '') || '0';
    S.stCh = $('stCh').value; Ctx.save(); resolve();
  }
  $('stPrev').addEventListener('click', function () { step(-1); });
  $('stNext').addEventListener('click', function () { step(1); });

  /* Lit la cible : un point, ou la ligne A→B (et son point de chaînage / déport s'il est demandé). */
  function pt(name) {
    var h = root.CogoUi.findPoint(name); if (!h) return null;
    return { e: h.e, n: h.n, z: h.z === undefined ? null : h.z, name: h.name, code: (h.src && h.src.code) || '', src: h.linked ? h.src.refLabel : 'Travail ' + Ctx.leve() };
  }
  function resolve() {
    st.target = null; st.line = null; msg('');
    if (st.type === 'point') {
      var v = $('stP').value.trim(); if (!v) { render(); return; }
      var p = pt(v); if (!p) { msg('Point ' + v + ' introuvable dans le travail ni dans ses références liées (bouton Points).', 'warn'); render(); return; }
      st.target = p;
      if (!Ctx.desc() && p.code) Ctx.setDesc(p.code);
    } else {
      var a = $('stA').value.trim(), b = $('stB').value.trim(); if (!a || !b) { render(); return; }
      var A = pt(a), B = pt(b);
      if (!A || !B) { msg('Point ' + (!A ? a : b) + ' introuvable (bouton Points).', 'warn'); render(); return; }
      if (!calc.onLine(A, B, A)) { msg('A et B sont confondus.', 'warn'); render(); return; }
      st.line = { a: A, b: B };
      var ch = num('stCh'), off = num('stOff');
      if (!isNaN(ch)) {
        var q = calc.linePoint(A, B, ch, isNaN(off) ? 0 : off);
        st.target = { e: q.e, n: q.n, z: q.z, name: A.name + '→' + B.name + ' ch ' + ch.toFixed(3) + (isNaN(off) || !off ? '' : ' dép ' + off.toFixed(3)), code: A.code, src: A.src, ch: ch, off: isNaN(off) ? 0 : off };
      }
    }
    render();
  }

  // ---------- Guidage en direct ----------
  var cv = $('stCanvas'), g = cv.getContext('2d');
  function size() { var r = cv.getBoundingClientRect(), d = window.devicePixelRatio || 1; if (cv.width !== Math.round(r.width * d)) { cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d); } return { w: r.width, h: r.height, d: d }; }
  function cell(label, val, on) { return '<div' + (on ? ' class="on"' : '') + '><small>' + label + '</small><b>' + val + '</b></div>'; }
  function lr(v, pos, neg) { return v === null ? '—' : (v >= 0 ? pos : neg) + ' ' + Math.abs(v).toFixed(3); }
  function render() {
    if (!st.on) return;
    var me = Ctx.here(), tol = num('stTol') || 0.02, grid = [], big = '', sz = size();
    if (me) { st.track.push({ e: me.e, n: me.n, t: Date.now() }); st.track = st.track.filter(function (x) { return Date.now() - x.t < 6000; }); }
    var head = calc.headingFrom(st.track), info = null, li = null;
    if (me && st.line) li = calc.onLine(st.line.a, st.line.b, me);
    if (me && st.target) info = calc.toTarget(me, st.target, head);
    st.info = info;
    if (!me) big = 'Position du récepteur inconnue' + (Ctx.isNative ? ' : connecter le récepteur.' : ' (mode navigateur).');
    else if (!st.target && !li) big = st.type === 'point' ? 'Choisir le point à implanter.' : 'Choisir A et B.';
    if (info) {
      var onT = info.d <= tol;
      big = '<b>' + (onT ? 'SUR LA CIBLE ' : '') + info.d.toFixed(3) + ' m</b><br>' + esc(st.target.name) +
        (head === null ? '<br><small>Marcher quelques pas : Avancer / Droite suivront.</small>' : '');
      if (info.fwd !== null) { grid.push(cell(info.fwd >= 0 ? 'Avancer' : 'Reculer', Math.abs(info.fwd).toFixed(3), Math.abs(info.fwd) <= tol)); grid.push(cell(info.right >= 0 ? 'Droite' : 'Gauche', Math.abs(info.right).toFixed(3), Math.abs(info.right) <= tol)); }
      grid.push(cell(info.dN >= 0 ? 'Nord' : 'Sud', Math.abs(info.dN).toFixed(3), Math.abs(info.dN) <= tol));
      grid.push(cell(info.dE >= 0 ? 'Est' : 'Ouest', Math.abs(info.dE).toFixed(3), Math.abs(info.dE) <= tol));
      grid.push(cell(info.dZ === null ? 'ΔZ' : info.dZ >= 0 ? 'Déblai (couper)' : 'Remblai (remplir)', info.dZ === null ? '—' : Math.abs(info.dZ).toFixed(3), false));
    }
    if (li) {
      grid.push(cell('Chaînage', f3(li.ch) + (li.ch < 0 ? ' (avant A)' : li.ch > li.L ? ' (après B)' : ''), false));
      grid.push(cell('Déport', lr(li.off, 'Droite', 'Gauche'), Math.abs(li.off) <= tol && !st.target));
      if (!st.target) {
        var dz = li.z !== null && me.z !== null && me.z !== undefined ? me.z - li.z : null;
        grid.push(cell(dz === null ? 'ΔZ ligne' : dz >= 0 ? 'Déblai / ligne' : 'Remblai / ligne', dz === null ? '—' : Math.abs(dz).toFixed(3), false));
        big = '<b>' + lr(li.off, 'Droite', 'Gauche') + ' m</b><br>de la ligne ' + esc(st.line.a.name) + '→' + esc(st.line.b.name) + ' · ch ' + li.ch.toFixed(3);
      }
      grid.push(cell('Longueur A→B', li.L.toFixed(3), false));
    }
    if (me) grid.push(cell('Solution', esc(me.qLabel || '') + (me.sh !== null ? ' · ' + (me.sh * 100).toFixed(1) + ' cm' : ''), false));
    $('stGrid').innerHTML = grid.join('');
    $('stBig').innerHTML = big; $('stBig').classList.toggle('on', !!(info && info.d <= tol));
    var bm = $('btnMeasure'); $('stMeasure').disabled = bm.disabled || !(st.target || st.line); $('stMeasure').textContent = bm.textContent === 'Mesurer' ? 'Mesurer le point implanté' : bm.textContent;
    draw(sz, me, head, li);
  }
  /* Cible au centre, nord en haut ; l'échelle suit la distance (plus on approche, plus on zoome). */
  function draw(s, me, head, li) {
    g.setTransform(s.d, 0, 0, s.d, 0, 0); g.fillStyle = '#11181a'; g.fillRect(0, 0, s.w, s.h);
    var c = st.target || (me && li ? { e: me.e - li.uy * li.off, n: me.n + li.ux * li.off } : null);
    if (!c) return;
    var d = me ? Math.hypot(me.e - c.e, me.n - c.n) : 1, R = Math.min(s.w, s.h) / 2 - 18;
    var span = Math.max(0.1, Math.pow(10, Math.ceil(Math.log10(Math.max(d * 1.25, 0.05))))), k = R / span;
    if (span / 2 > d * 1.25) { span /= 2; k = R / span; }
    var X = function (e) { return s.w / 2 + (e - c.e) * k; }, Y = function (n) { return s.h / 2 - (n - c.n) * k; };
    g.strokeStyle = '#2c3a3c'; g.lineWidth = 1; g.fillStyle = '#7d8c8a'; g.font = '11px Barlow, sans-serif';
    [0.25, 0.5, 0.75, 1].forEach(function (f) { g.beginPath(); g.arc(s.w / 2, s.h / 2, R * f, 0, 7); g.stroke(); });
    g.fillText((span).toPrecision(2).replace(/\.?0+$/, '') + ' m', s.w / 2 + R + 3, s.h / 2 - 3);
    g.fillText('N', s.w / 2 - 3, 12);
    if (st.line) {   // la ligne A→B, prolongée
      var A = st.line.a, B = st.line.b, o = calc.onLine(A, B, A), far = span * 4;
      g.strokeStyle = '#f2c94c'; g.lineWidth = 2; g.beginPath();
      g.moveTo(X(A.e - o.ux * far), Y(A.n - o.uy * far)); g.lineTo(X(B.e + o.ux * far), Y(B.n + o.uy * far)); g.stroke();
      g.fillStyle = '#f2c94c'; [[A, 'A'], [B, 'B']].forEach(function (x) { g.beginPath(); g.arc(X(x[0].e), Y(x[0].n), 4, 0, 7); g.fill(); g.fillText(x[1], X(x[0].e) + 6, Y(x[0].n) - 6); });
    }
    if (st.target) { g.strokeStyle = '#ff6b6b'; g.lineWidth = 2; g.beginPath(); g.moveTo(s.w / 2 - 10, s.h / 2); g.lineTo(s.w / 2 + 10, s.h / 2); g.moveTo(s.w / 2, s.h / 2 - 10); g.lineTo(s.w / 2, s.h / 2 + 10); g.stroke(); }
    if (me) {
      var px = X(me.e), py = Y(me.n);
      g.strokeStyle = '#4dd0e1'; g.lineWidth = 2; g.beginPath(); g.arc(px, py, 7, 0, 7); g.stroke();
      if (head !== null) { g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.sin(head) * 22, py - Math.cos(head) * 22); g.stroke(); }
      if (st.target) { g.setLineDash([4, 4]); g.beginPath(); g.moveTo(px, py); g.lineTo(s.w / 2, s.h / 2); g.stroke(); g.setLineDash([]); }
    }
  }
  setInterval(function () { if (st.on && !document.hidden) render(); }, 1000);

  // ---------- Mesure et rapport ----------
  function setName() { if (!st.on) return; var n = Ctx.stakeName(); if (n) Ctx.setPointName(n); }
  $('stMeasure').addEventListener('click', function () { setName(); $('btnMeasure').click(); });
  document.addEventListener('cg:points', function () { if (st.on) setName(); renderExport(); });
  document.addEventListener('cg:job', renderExport);
  function list(job) { var m = Ctx.jobMeta(job === undefined ? Ctx.leve() : job); return (m && m.implantations) || []; }
  function renderExport() { var n = Ctx.leve() ? list().length : 0, b = $('btnExportStake'); if (!b) return; b.style.display = n ? '' : 'none'; b.textContent = 'Exporter l’implantation (' + n + ')'; }
  (function () {
    var ex = $('btnExportCtl'); if (!ex) return;
    var b = document.createElement('button'); b.className = 'btn'; b.id = 'btnExportStake'; b.type = 'button'; b.style.display = 'none';
    ex.parentNode.insertBefore(b, ex.nextSibling);
    b.addEventListener('click', function () {
      var job = Ctx.leve(); if (!job) return;
      var q = function (v) { v = String(v === null || v === undefined ? '' : v); return /[",;\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
      var rows = [['Date', 'Travail', 'Point_implante', 'Cible', 'Source', 'Description', 'E_cible', 'N_cible', 'Z_cible', 'E_mes', 'N_mes', 'Z_mes', 'dE', 'dN', 'dH', 'Deblai(+)_Remblai(-)', 'Chainage', 'Deport', 'Sigma_H', 'Sigma_V'].join(',')];
      list(job).forEach(function (c) {
        rows.push([c.t, c.job, c.nom, c.cible.name, c.cible.src, c.cible.code, f3(c.cible.e), f3(c.cible.n), f3(c.cible.z), f3(c.mes.e), f3(c.mes.n), f3(c.mes.z),
          f3(c.dE), f3(c.dN), f3(c.dH), f3(c.dZ), c.ch === null ? '' : f3(c.ch), c.off === null ? '' : f3(c.off), f3(c.sigmaH), f3(c.sigmaV)].map(q).join(','));
      });
      Ctx.saveText(job.replace(/[^\w#-]+/g, '_') + '_IMPLANTATION.csv', 'text/csv', rows.join('\r\n') + '\r\n');
    });
  })();

  root.Stake = {
    calc: calc,
    active: function () { return st.on && !!(st.target || st.line); },
    /* Appelé à la conservation du point mesuré : écarts mesuré − cible (ou chaînage / déport sur la ligne). */
    record: function (r, job, nom) {
      var me = { e: r.est, n: r.nord, z: r.alt === undefined ? null : r.alt }, t = st.target, li = st.line ? calc.onLine(st.line.a, st.line.b, me) : null;
      var c = { t: new Date().toISOString(), job: job, nom: nom, mes: me, sigmaH: r.sigmaH, sigmaV: r.sigmaV, ch: li ? li.ch : null, off: li ? li.off : null };
      if (t) { c.cible = { name: t.name, src: t.src, code: t.code, e: t.e, n: t.n, z: t.z }; c.dE = me.e - t.e; c.dN = me.n - t.n; c.dH = Math.hypot(c.dE, c.dN); c.dZ = t.z === null || me.z === null ? null : me.z - t.z; }
      else { c.cible = { name: 'ligne ' + st.line.a.name + '→' + st.line.b.name, src: st.line.a.src, code: st.line.a.code, e: null, n: null, z: li.z }; c.dE = c.dN = null; c.dH = Math.abs(li.off); c.dZ = li.z === null || me.z === null ? null : me.z - li.z; }
      var m = Ctx.jobMeta(job); m.implantations = m.implantations || []; m.implantations.push(c); Ctx.saveJobs();
      var note = 'Implanté ' + c.cible.name + (t ? ' : ΔH ' + c.dH.toFixed(3) : ' : ch ' + li.ch.toFixed(3) + ' dép ' + li.off.toFixed(3)) + (c.dZ === null ? '' : ', ' + (c.dZ >= 0 ? 'D ' : 'R ') + Math.abs(c.dZ).toFixed(3));
      msg(note + '.', 'ok'); renderExport();
      return { note: note, cible: c.cible.name };
    },
    list: list
  };
  setType(st.type);
  if (S.stMode) setOn(true);
})(typeof window !== 'undefined' ? window : this);
