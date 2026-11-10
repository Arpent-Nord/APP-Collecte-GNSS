/* Collecte GNSS — Arpent-Nord
 * leve-codes.js : levé par codes (méthode string) dans l'onglet Mesure.
 *  - boîtes de codes nommées, ajustables au terrain (remplacer, ajouter, retirer), proposées selon la nature (NAT) ;
 *  - suivi des strings en direct : pour le code choisi, ses lignes (ouvertes, fermées), nouvelle ligne, contrôles .1 à .6 ;
 *  - croquis qui se dessine (couleurs des calques Arpent-Nord), position du récepteur et segment à venir ;
 *  - anomalies en direct et outils de correction au toucher, avec le moteur de Validation de levé (moteur-leve.js) ;
 *  - export du levé brut (AAMMJJSECT#NATSS.txt) et de sa version corrigée (_MODIF.txt), P,N,E,Z,D sans en-tête (NDA-001).
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var Ctx = window.AppCtx, M = window.MoteurLeve;
  if (!Ctx || !M || !$('lcCard')) return;
  var S = Ctx.settings, esc = Ctx.esc;
  var st = { on: false, code: null, str: {}, ctl: {}, extra: [], solo: false, cmdKeep: '', view: null, lbl: S.lcLbl !== false,
    tool: null, picks: [], hist: [], A: null, rows: [], idx: [], lastCount: -1, editing: false };

  // ---------- Mode ----------
  function setMode(on) {
    st.on = on; S.lcMode = on; Ctx.save();
    $('mmPoint').classList.toggle('on', !on); $('mmCodes').classList.toggle('on', on);
    $('lcCard').hidden = !on; document.body.classList.toggle('codes-mode', on);
    if (on) { st.lastCount = jobPts().length; refresh(true); }
  }
  $('mmPoint').addEventListener('click', function () { setMode(false); });
  $('mmCodes').addEventListener('click', function () { setMode(true); });

  // ---------- Analyse du travail en cours (moteur de Validation de levé) ----------
  function jobPts() { return Ctx.jobPoints(); }
  function analyze() {
    var all = Ctx.points(), job = Ctx.leve(), rows = [], idx = [];
    all.forEach(function (p, i) {
      if ((p.leve || '') !== job || p.del || p.est === null || p.est === undefined) return;
      var z = p.alt === null || p.alt === undefined ? 0 : p.alt;
      rows.push({ i: rows.length, name: p.nom, e: p.est, n: p.nord, z: z, desc: p.code || '', xyz: [p.est.toFixed(3), p.nord.toFixed(3), z.toFixed(3)] });
      idx.push(i);
    });
    var A;
    try { A = M.analyze(rows, M.CODES, { dup: 0.005, maxSeg: 60 }); } catch (e) { A = { lines: [], issues: [], cmds: [] }; }
    // ligne d'un seul point : normal pendant qu'on la lève (dernier point du travail ou string actif)
    var lastRow = rows.length - 1, act = st.code ? st.code + '|' + st.str[st.code] : '', closed = {};
    A.lines.forEach(function (L) { if (L.closed) closed[L.key] = 1; });
    st.curveKeys = {};
    A.issues.forEach(function (x) { if (x.kind === 'curveOpen' && !closed[x.key]) st.curveKeys[x.key] = 1; });
    // pendant le levé : ligne d'un point en cours et courbe pas encore finie (.4) sont normales
    A.issues = A.issues.filter(function (x) {
      if (x.kind === 'single' && (x.row === lastRow || x.key === act)) return false;
      if (x.kind === 'curveOpen' && !closed[x.key] && !isDone(x.key)) return false;
      return true;
    });
    st.rows = rows; st.idx = idx; st.A = A;
    return A;
  }
  /* Lignes terminées (TERMINER) : gardées au journal du travail, sans effet sur le fichier. */
  function fini() { var m = Ctx.jobMeta(); if (!m) return {}; m.fini = m.fini || {}; return m.fini; }
  function isDone(key) { return !!fini()[key]; }
  /* Lignes d'un code : par string, la dernière ligne (ouverte ou fermée) et son nombre de points. */
  function stringsOf(code) {
    var out = {};
    (st.A ? st.A.lines : []).forEach(function (L) {
      if (String(L.pcode) !== String(code) || L.type === 'circle') return;
      var o = out[L.str] || (out[L.str] = { str: L.str, n: 0, open: false, last: null, line: null });
      o.n += L.pts.length; o.open = !L.closed; o.last = L.pts[L.pts.length - 1]; o.line = L;
    });
    // string débuté sur un seul point (pas encore une ligne)
    st.rows.forEach(function (r, k) {
      var p = M.parseDesc(r.desc); (p.links || []).forEach(function (l) {
        if (String(l.pcode) === String(code) && !out[l.str]) out[l.str] = { str: l.str, n: 1, open: true, last: k, line: null };
      });
    });
    Object.keys(out).forEach(function (k) { out[k].done = out[k].open && isDone(code + '|' + k); });
    return Object.keys(out).map(function (k) { return out[k]; }).sort(function (a, b) { return (+a.str) - (+b.str); });
  }
  function nextStr(code) { var m = 0; stringsOf(code).forEach(function (s) { m = Math.max(m, +s.str || 0); }); return String(m + 1); }

  // ---------- Boîtes de codes ----------
  function boxes() {
    if (!S.lcBoxes || !S.lcBoxes.length) {
      var rec = (S.recentCodes || []).slice(0, 12);
      S.lcBoxes = [{ name: 'Ma boîte', codes: rec }]; S.lcBoxIdx = 0; Ctx.save();
    }
    if (S.lcBoxIdx === undefined || !S.lcBoxes[S.lcBoxIdx]) S.lcBoxIdx = 0;
    return S.lcBoxes;
  }
  function box() { return boxes()[S.lcBoxIdx]; }
  function renderBoxSel() {
    var sel = $('lcBox'); sel.innerHTML = '';
    boxes().forEach(function (b, i) { var o = document.createElement('option'); o.value = i; o.textContent = b.name + ' (' + b.codes.length + ')'; sel.appendChild(o); });
    sel.value = S.lcBoxIdx;
  }
  $('lcBox').addEventListener('change', function () { S.lcBoxIdx = +this.value; Ctx.save(); renderCodes(); });
  function renderCodes() {
    var g = $('lcCodes'); g.innerHTML = ''; g.classList.toggle('editing', st.editing);
    var b = box();
    if (!b.codes.length) g.innerHTML = '<p class="hint">Boîte vide : « Modifier » puis « + Code » pour la remplir.</p>';
    b.codes.forEach(function (code, k) {
      var c = Codes.byCode(code), lines = st.editing ? [] : stringsOf(code), open = lines.filter(function (s) { return s.open && !s.done; }).length;
      var bt = document.createElement('button'); bt.type = 'button';
      bt.className = code === st.code && !st.editing ? 'sel' : '';
      bt.style.setProperty('--c', M.colorOf(code) === '#ffffff' ? '#777' : M.colorOf(code));
      bt.innerHTML = '<b>' + esc(code) + (c && c.aph ? ' <span style="font-size:13px;color:var(--muted)">' + esc(c.aph) + '</span>' : '') + '</b><small>' + esc(c ? c.description : 'code inconnu') + '</small>' +
        (lines.length ? '<span class="lns">' + (open ? open + ' ouv.' : '') + (lines.length - open ? (open ? ' · ' : '') + (lines.length - open) + ' f.' : '') + '</span>' : '');
      bt.addEventListener('click', function () { if (st.editing) editSlot(k); else pickCode(code); });
      g.appendChild(bt);
    });
  }
  // ----- édition au terrain -----
  var hidden = document.createElement('input'); hidden.type = 'hidden'; document.body.appendChild(hidden);
  function chooseCode(cb) {
    hidden.value = '';
    var h = function () { hidden.removeEventListener('change', h); if (hidden.value) cb(hidden.value); };
    hidden.addEventListener('change', h);
    window.CogoUi.openPicker(hidden, 'code', 'Choisir un code pour la boîte');
  }
  function editSlot(k) {
    var b = box(), code = b.codes[k];
    var act = prompt('Code ' + code + ' : écrire R pour le remplacer, X pour le retirer, G ou D pour le déplacer à gauche ou à droite.', 'R');
    if (!act) return; act = act.trim().toUpperCase();
    if (act === 'X') b.codes.splice(k, 1);
    else if (act === 'G' && k > 0) b.codes.splice(k - 1, 0, b.codes.splice(k, 1)[0]);
    else if (act === 'D' && k < b.codes.length - 1) b.codes.splice(k + 1, 0, b.codes.splice(k, 1)[0]);
    else if (act === 'R') return chooseCode(function (nc) { if (b.codes.indexOf(nc) < 0) b.codes[k] = nc; Ctx.save(); renderCodes(); renderBoxSel(); });
    Ctx.save(); renderCodes(); renderBoxSel();
  }
  $('lcBoxEdit').addEventListener('click', function () { st.editing = true; $('lcEditBar').hidden = false; renderCodes(); });
  $('lcEditDone').addEventListener('click', function () { st.editing = false; $('lcEditBar').hidden = true; renderCodes(); });
  $('lcAddCode').addEventListener('click', function () { chooseCode(function (c) { var b = box(); if (b.codes.indexOf(c) < 0) b.codes.push(c); Ctx.save(); renderCodes(); renderBoxSel(); }); });
  $('lcNewBox').addEventListener('click', function () {
    var n = prompt('Nom de la nouvelle boîte (ex. Route, Bâtiment, Ponceau) :'); if (!n) return;
    boxes().push({ name: n.trim(), codes: [] }); S.lcBoxIdx = boxes().length - 1; Ctx.save(); renderBoxSel(); renderCodes();
  });
  $('lcRenBox').addEventListener('click', function () { var n = prompt('Nouveau nom de la boîte :', box().name); if (!n) return; box().name = n.trim(); Ctx.save(); renderBoxSel(); });
  $('lcDelBox').addEventListener('click', function () {
    if (boxes().length < 2) { alert('Il faut garder au moins une boîte.'); return; }
    if (!confirm('Supprimer la boîte « ' + box().name + ' » ?')) return;
    boxes().splice(S.lcBoxIdx, 1); S.lcBoxIdx = 0; Ctx.save(); renderBoxSel(); renderCodes();
  });
  /* Stratégie selon la nature : les codes les plus utilisés dans les travaux de même nature (NAT) sur l'appareil. */
  $('lcNatBox').addEventListener('click', function () {
    var v = Codes.validateLeve(Ctx.leve()); if (!v.parts) { alert('Le nom du travail n’est pas au format AAMMJJSECT#NATSS : nature inconnue.'); return; }
    var nat = v.parts.nat, freq = {};
    Ctx.points().forEach(function (p) {
      var w = Codes.validateLeve(p.leve || ''); if (!w.parts || w.parts.nat !== nat) return;
      var d = M.parseDesc(p.code || ''); var pcs = [d.pcode].concat((d.links || []).map(function (l) { return l.pcode; }));
      pcs.forEach(function (pc) { if (pc && Codes.byCode(pc)) freq[pc] = (freq[pc] || 0) + 1; });
    });
    var top = Object.keys(freq).sort(function (a, b) { return freq[b] - freq[a]; }).slice(0, 16);
    if (!top.length) { alert('Aucun levé de nature ' + nat + ' sur cet appareil pour l’instant. La boîte se construira au fil des levés.'); return; }
    var nm = 'Nature ' + nat, ex = boxes().findIndex(function (b) { return b.name === nm; });
    if (ex >= 0) boxes()[ex].codes = top; else boxes().push({ name: nm, codes: top });
    S.lcBoxIdx = ex >= 0 ? ex : boxes().length - 1; Ctx.save(); renderBoxSel(); renderCodes();
  });

  // ---------- Code choisi, strings et contrôles ----------
  var CTL = [['', 'Suivant'], ['1', 'Début .1'], ['2', 'Fermer .2'], ['3', 'Début courbe .3'], ['5', 'Pt courbe .5'], ['4', 'Fin courbe .4'], ['6', 'Cercle .6']];
  function pickCode(code) {
    st.code = code; st.solo = false;
    if (!st.str[code]) {
      var open = stringsOf(code).filter(function (s) { return s.open && !s.done; });
      if (open.length) { st.str[code] = open[open.length - 1].str; st.ctl[code] = ''; }
      else { st.str[code] = nextStr(code); st.ctl[code] = '1'; }
    }
    refresh();
  }
  function renderStr() {
    var code = st.code, box2 = $('lcStr');
    if (!code) { box2.hidden = true; return; }
    box2.hidden = false;
    var c = Codes.byCode(code), lines = stringsOf(code), cur = st.str[code], ctl = st.ctl[code] || '';
    $('lcStrCode').textContent = code + (c ? ' ' + c.aph + ' · ' + c.description : '');
    var curInfo = lines.filter(function (s) { return s.str === cur; })[0];
    $('lcStrInfo').textContent = st.solo ? 'Point seul (sans ligne)' : 'Ligne ' + cur + (curInfo ? ' · ' + curInfo.n + ' pt' + (curInfo.done ? ' · terminée : REPRENDRE pour continuer' : curInfo.open ? ' · ouverte' : ' · fermée') : ' · nouvelle');
    var L = $('lcLines'); L.innerHTML = '';
    lines.forEach(function (s) {
      var b = document.createElement('button'); b.type = 'button';
      b.className = 'chip ' + (s.open && !s.done ? 'open' : 'closed') + (s.str === cur && !st.solo ? ' sel' : '');
      b.textContent = 'L' + s.str + ' · ' + s.n + (s.done ? ' (terminée)' : s.open ? '' : ' (fermée)');
      b.addEventListener('click', function () { st.solo = false; st.str[code] = s.str; st.ctl[code] = s.open ? '' : '1'; refresh(); });
      L.appendChild(b);
    });
    var nb = document.createElement('button'); nb.type = 'button'; var ns = nextStr(code);
    nb.className = 'chip' + (cur === ns && !st.solo ? ' sel' : ''); nb.textContent = '+ Nouvelle ligne L' + ns;
    nb.addEventListener('click', function () { st.solo = false; st.str[code] = ns; st.ctl[code] = '1'; refresh(); });
    L.appendChild(nb);
    var sb = document.createElement('button'); sb.type = 'button'; sb.className = 'chip' + (st.solo ? ' sel' : ''); sb.textContent = 'Point seul';
    sb.addEventListener('click', function () { st.solo = !st.solo; refresh(); });
    L.appendChild(sb);
    if (curInfo && curInfo.open && !st.solo) {
      var tb = document.createElement('button'); tb.type = 'button'; tb.className = 'chip ' + (curInfo.done ? 'resume' : 'end');
      tb.textContent = curInfo.done ? 'REPRENDRE L' + cur : 'TERMINER L' + cur;
      tb.title = curInfo.done ? 'Remettre la ligne en poursuite' : 'La ligne s\u2019arrête ici : plus de point attendu';
      tb.addEventListener('click', function () { if (curInfo.done) reprendre(code, cur); else terminer(code, cur); });
      L.appendChild(tb);
    }
    var C = $('lcCtl'); C.innerHTML = '';
    if (!st.solo) CTL.forEach(function (x) {
      var b = document.createElement('button'); b.type = 'button';
      var on = x[0] === '' ? ctl === '' : ctl.split('.').indexOf(x[0]) >= 0;
      b.className = 'chip' + (on ? ' sel' : ''); b.textContent = x[1];
      b.addEventListener('click', function () {
        var cs = ctl ? ctl.split('.') : [];
        if (x[0] === '') cs = [];
        else if (cs.indexOf(x[0]) >= 0) cs = cs.filter(function (y) { return y !== x[0]; });
        else if ((x[0] === '3' && cs.indexOf('1') >= 0) || (x[0] === '1' && cs.indexOf('3') >= 0) || (x[0] === '6' && cs.indexOf('1') >= 0) ||
                 (x[0] === '2' && cs.indexOf('4') >= 0) || (x[0] === '4' && cs.indexOf('2') >= 0)) cs.push(x[0]);   // combinés : .1.3, .1.6, .4.2
        else cs = [x[0]];
        st.ctl[code] = cs.sort().join('.').replace(/^(2)\.(4)$/, '4.2'); refresh();
      });
      C.appendChild(b);
    });
    var X = $('lcExtra'); X.innerHTML = '';
    st.extra.forEach(function (l, k) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'chip sel';
      b.textContent = 'Aussi ' + l.pcode + ' L' + l.str + (l.ctrl ? '.' + l.ctrl : '') + ' ×';
      b.title = 'Toucher pour retirer cette liaison';
      b.addEventListener('click', function () { st.extra.splice(k, 1); refresh(); });
      X.appendChild(b);
    });
    var ab = document.createElement('button'); ab.type = 'button'; ab.className = 'chip'; ab.textContent = '+ Lier aussi à une autre ligne';
    ab.addEventListener('click', addExtra); X.appendChild(ab);
  }
  function journal(why) { var m = Ctx.jobMeta(); if (!m) return; m.journal = m.journal || []; m.journal.push({ t: new Date().toLocaleString('fr-CA'), why: why }); }
  function terminer(code, str) {
    fini()[code + '|' + str] = 1; journal('Ligne ' + code + ' / ' + str + ' terminée'); Ctx.saveJobs();
    if (st.lock === code + '|' + str) st.lock = null;
    var open = stringsOf(code).filter(function (s) { return s.open && !s.done; });
    if (open.length) { st.str[code] = open[open.length - 1].str; st.ctl[code] = ''; }
    else { st.str[code] = nextStr(code); st.ctl[code] = '1'; }
    refresh();
  }
  function reprendre(code, str) {
    delete fini()[code + '|' + str]; journal('Ligne ' + code + ' / ' + str + ' reprise'); Ctx.saveJobs();
    activate(code, str);
  }
  /* Rend une ligne active : son code, son string, contrôle « Suivant ». */
  function activate(code, str) {
    st.code = String(code); st.str[st.code] = String(str); st.ctl[st.code] = ''; st.solo = false; st.extra = [];
    refresh();
  }
  /* Liaison multiple (« _ ») : le point appartient aussi à une autre ligne ouverte du travail (ex. 526 1.2_526 2.1). */
  function addExtra() {
    var opts = [];
    (st.A ? st.A.lines : []).forEach(function (L) { if (!L.closed && L.type !== 'circle' && !(String(L.pcode) === String(st.code) && L.str === st.str[st.code])) opts.push(L.pcode + ' ' + L.str); });
    var txt = prompt('Lier aussi ce point à (code et ligne, ex. 526 2) :' + (opts.length ? '\nLignes ouvertes : ' + opts.join(' · ') : '') + '\nAjouter « .2 » pour fermer cette ligne, « .1 » pour la débuter.', opts[0] || '');
    if (!txt) return;
    var m = /^\s*(\d{1,4})\s+(\d+)(?:\.([1-7](?:\.[1-7])?))?\s*$/.exec(txt);
    if (!m) { alert('Format attendu : code et ligne, ex. 526 2 ou 526 2.2'); return; }
    st.extra.push({ pcode: m[1], str: m[2], ctrl: m[3] || null }); refresh();
  }
  /* Description du prochain point : « Pcode String.Contrôle » + liaisons multiples + commande en cours (2P…). */
  function composeDesc() {
    if (!st.code) return '';
    var d = st.solo ? st.code : M.formatDesc({ pcode: st.code, str: st.str[st.code], ctrl: st.ctl[st.code] || null, attrs: [] });
    st.extra.forEach(function (l) { d = M.addLinkDesc(d, l); });
    var cur = M.splitCmd(Ctx.desc()); if (cur.cmd) d += '_' + cur.cmd.text;
    return d;
  }
  /* Après un point conservé : le contrôle ne vaut que pour ce point ; une fermeture prépare la ligne suivante. */
  function advance() {
    var code = st.code; if (!code) return;
    var ctl = st.ctl[code] || '';
    if (!st.solo) {
      if (ctl.split('.').indexOf('2') >= 0) { st.str[code] = nextStr(code); st.ctl[code] = '1'; }
      else st.ctl[code] = '';
    }
    st.extra = [];
  }

  // ---------- Mise à jour générale ----------
  function refresh(fit) {
    if (!st.on) return;
    analyze(); renderBoxSel(); renderCodes(); renderStr(); renderAnom(); st.sugHtml = ''; renderSug();
    var d = composeDesc();
    if (d && d !== Ctx.desc()) Ctx.setDesc(d);
    $('lcDesc').textContent = d || '—'; $('lcName').textContent = Ctx.pointName();
    measureState();
    $('lcUndo').disabled = !st.hist.length;
    if (fit || !st.view || !st.userView) fitView();
    else if (st.rows.length) {   // le dernier point levé reste visible
      var lr = st.rows[st.rows.length - 1], q = toScr(lr.e, lr.n), sz = size();
      if (q[0] < 10 || q[1] < 10 || q[0] > sz.w - 10 || q[1] > sz.h - 10) { st.view.cx = lr.e; st.view.cy = lr.n; }
    }
    draw();
  }
  function activeDone() { return st.code && !st.solo && isDone(st.code + '|' + st.str[st.code]); }
  function measureState() {
    var bm = $('btnMeasure'); var ctl = window.Refs && Refs.control.active() && !$('ctlKeep').checked;   // contrôle seul : pas de description requise
    $('lcMeasure').disabled = bm.disabled || (!ctl && (!composeDesc() || activeDone())); $('lcMeasure').textContent = bm.textContent;
  }
  $('lcMeasure').addEventListener('click', function () { $('btnMeasure').click(); });

  // ---------- Poursuite : quelle ligne ouverte suis-je en train de rejoindre ? ----------
  function cands() {
    var out = {}, inLine = {};
    (st.A ? st.A.lines : []).forEach(function (L) {
      inLine[L.key] = 1;
      if (L.type !== 'line' || L.closed || isDone(L.key)) return;
      out[L.key] = { key: L.key, pcode: L.pcode, str: L.str, curve: !!st.curveKeys[L.key], pts: L.pts.map(function (i) { return [st.rows[i].e, st.rows[i].n]; }) };
    });
    st.rows.forEach(function (r) {   // string débuté sur un seul point
      (M.parseDesc(r.desc).links || []).forEach(function (l) {
        var key = l.pcode + '|' + l.str;
        if (inLine[key] || isDone(key) || (l.ctrl || '').split('.').indexOf('2') >= 0) return;
        out[key] = { key: key, pcode: l.pcode, str: l.str, curve: false, pts: [[r.e, r.n]] };
      });
    });
    return out;
  }
  function lbl(key) { return key.replace('|', ' L'); }
  function renderSug() {
    var box4 = $('lcSug'), me = Ctx.here(), html = '';
    if (!st.on || !me || !window.Poursuite) { box4.hidden = true; st.sugHtml = ''; return; }
    var C = cands(), act = st.code && !st.solo ? st.code + '|' + st.str[st.code] : '';
    if (st.lock && !C[st.lock]) st.lock = null;   // ligne fermée ou terminée : objectif atteint
    if (st.lock) {
      var r = Poursuite.evalOne(C[st.lock], [me.e, me.n]);
      html = '<span class="hint">Objectif</span> <b>' + esc(lbl(st.lock)) + '</b> <span>' + esc(Poursuite.describe(r)) + '</span>' +
        (st.lock !== act ? ' <button type="button" class="chip sel" data-k="' + esc(st.lock) + '">Activer</button>' : '') +
        ' <button type="button" class="chip" data-free="1">Libérer</button>';
    } else {
      var keys = Object.keys(C);
      if (!keys.length) { box4.hidden = true; st.sugHtml = ''; return; }
      var R = Poursuite.rank(keys.map(function (k) { return C[k]; }), [me.e, me.n], st.sugKey);
      if (!R.best) { box4.hidden = true; st.sugHtml = ''; return; }
      st.sugKey = R.best.key;
      html = '<span class="hint">' + (R.ambiguous ? 'Ambigu' : 'Suggéré') + '</span>' + R.list.slice(0, 3).map(function (x, i) {
        return '<button type="button" class="chip' + (i === 0 && !R.ambiguous ? ' best' : '') + (x.key === act ? ' sel' : '') + '" data-k="' + esc(x.key) + '">' +
          '<b>' + esc(lbl(x.key)) + '</b> ' + esc(Poursuite.describe(x)) + (x.key === act ? ' ✓' : '') + '</button>';
      }).join('');
    }
    box4.hidden = false;
    if (html === st.sugHtml) return;
    st.sugHtml = html; box4.innerHTML = html;
    box4.querySelectorAll('[data-k]').forEach(function (b) { b.addEventListener('click', function () { var k = b.dataset.k.split('|'); activate(k[0], k[1]); }); });
    var fr = box4.querySelector('[data-free]'); if (fr) fr.addEventListener('click', function () { st.lock = null; st.sugHtml = ''; renderSug(); draw(); });
  }
  // nouveau point conservé ou base modifiée
  document.addEventListener('cg:refs', function () { if (st.on) draw(); });
  document.addEventListener('cg:control', function () { if (st.on) { measureState(); if (!st.userView) fitView(); draw(); } });
  document.addEventListener('cg:points', function () {
    if (!st.on) return;
    var n = jobPts().length;
    if (st.lastCount >= 0 && n === st.lastCount + 1) advance();
    st.lastCount = n; refresh();
  });
  setInterval(function () {
    if (!st.on || document.hidden) return;
    measureState(); renderSug();
    $('lcName').textContent = Ctx.pointName(); draw();
  }, 1000);

  // ---------- Anomalies ----------
  function renderAnom() {
    var box3 = $('lcAnom'), is = (st.A ? st.A.issues : []).filter(function (x) { return x.sev !== 'info'; });
    box3.hidden = !is.length; if (!is.length) return;
    var ne = is.filter(function (x) { return x.sev === 'err'; }).length;
    box3.innerHTML = '<button type="button" class="sum"><b>⚠ ' + is.length + ' anomalie(s)</b>' + (ne ? ' · ' + ne + ' erreur(s)' : '') + (st.anomOpen ? ' ▴' : ' ▾') + '</button>' +
      (st.anomOpen ? is.slice(0, 8).map(function (x, k) {
        var r = st.rows[x.row];
        return '<button type="button" data-k="' + k + '" class="' + (x.sev === 'err' ? 'err' : '') + '">' + (r ? esc(r.name) + ' : ' : '') + esc(x.msg) + '</button>';
      }).join('') : '');
    box3.querySelector('.sum').addEventListener('click', function () { st.anomOpen = !st.anomOpen; renderAnom(); });
    box3.querySelectorAll('[data-k]').forEach(function (b) { b.addEventListener('click', function () { var x = is[+b.dataset.k], r = st.rows[x.row]; if (r) { st.view.cx = r.e; st.view.cy = r.n; st.flash = x.row; draw(); } }); });
  }

  // ---------- Croquis ----------
  var cv = $('lcCanvas'), ctx = cv.getContext('2d');
  function size() { var r = cv.getBoundingClientRect(), d = window.devicePixelRatio || 1; if (cv.width !== Math.round(r.width * d)) { cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d); } return { w: r.width, h: r.height, d: d }; }
  function fitView() {
    var pts = st.rows.map(function (r) { return [r.e, r.n]; }), me = Ctx.here(); if (me) pts.push([me.e, me.n]);
    var tg = window.Refs && Refs.control.target(); if (tg) pts.push([tg.est, tg.nord]);   // point de contrôle visé
    var s = size();
    if (!pts.length) { st.view = { cx: me ? me.e : 0, cy: me ? me.n : 0, k: 5 }; return; }
    var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    pts.forEach(function (p) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
    var w = Math.max(x1 - x0, 5), h = Math.max(y1 - y0, 5);
    st.view = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, k: Math.min((s.w - 60) / w, (s.h - 40) / h) };
  }
  function toScr(e, n) { var s = size(); return [s.w / 2 + (e - st.view.cx) * st.view.k, s.h / 2 - (n - st.view.cy) * st.view.k]; }
  function toW(x, y) { var s = size(); return [st.view.cx + (x - s.w / 2) / st.view.k, st.view.cy - (y - s.h / 2) / st.view.k]; }
  function draw() {
    if (!st.on || !st.view) return;
    var s = size(); ctx.setTransform(s.d, 0, 0, s.d, 0, 0); ctx.clearRect(0, 0, s.w, s.h);
    ctx.fillStyle = '#11181a'; ctx.fillRect(0, 0, s.w, s.h);
    // échelle
    var m = Math.pow(10, Math.floor(Math.log10(80 / st.view.k))), len = [1, 2, 5, 10].map(function (f) { return f * m; }).filter(function (v) { return v * st.view.k < 120; }).pop() || m;
    ctx.strokeStyle = '#9aaba9'; ctx.fillStyle = '#9aaba9'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(10, s.h - 10); ctx.lineTo(10 + len * st.view.k, s.h - 10); ctx.stroke();
    ctx.font = '11px Barlow, sans-serif'; ctx.fillText(len + ' m', 12, s.h - 14);
    var labels = []; st.hit = [];
    var A = st.A || { lines: [], issues: [] }, step = Math.max(0.05, 2 / st.view.k);
    var errRows = {}; A.issues.forEach(function (x) { if (x.sev === 'err') errRows[x.row] = 1; });
    A.lines.forEach(function (L) {
      var col = M.colorOf(L.pcode), vv;
      try { vv = M.lineVerts(L, st.rows, step).verts; } catch (e) { return; }
      var act = String(L.pcode) === String(st.code) && L.str === st.str[st.code], poly = vv.map(function (v) { return toScr(v[0], v[1]); });
      if (st.lock === L.key) { ctx.strokeStyle = 'rgba(77,208,225,.45)'; ctx.lineWidth = 9; ctx.beginPath(); poly.forEach(function (p, k) { if (k) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.stroke(); }
      ctx.strokeStyle = col; ctx.lineWidth = act ? 3.5 : 2; ctx.beginPath();
      if (isDone(L.key)) ctx.setLineDash([2, 3]);
      poly.forEach(function (p, k) { if (k) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
      ctx.stroke(); ctx.setLineDash([]);
      st.hit.push({ key: L.key, pcode: L.pcode, str: L.str, closed: L.closed, poly: poly });
      labels.push({ txt: L.pcode + '_' + L.str, col: col, poly: poly });
    });
    // étiquettes « 185_2 » le long des lignes : plus on zoome, plus il y en a
    ctx.font = 'bold 11px Barlow, sans-serif';
    labels.forEach(function (o) {
      var P = o.poly, tot = 0, seg = [];
      for (var i = 1; i < P.length; i++) { var l = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); seg.push(l); tot += l; }
      if (tot < 30) return;
      var every = 220, marks = [];
      if (tot < every) marks.push(tot / 2); else for (var m2 = every / 2; m2 < tot; m2 += every) marks.push(m2);
      marks.forEach(function (at) {
        var acc = 0;
        for (var j = 0; j < seg.length; j++) {
          if (acc + seg[j] >= at) {
            var f = (at - acc) / (seg[j] || 1), x = P[j][0] + (P[j + 1][0] - P[j][0]) * f, y = P[j][1] + (P[j + 1][1] - P[j][1]) * f;
            if (x < 0 || y < 0 || x > s.w || y > s.h) return;
            var w = ctx.measureText(o.txt).width + 6;
            ctx.fillStyle = 'rgba(17,24,26,.85)'; ctx.fillRect(x - w / 2, y - 8, w, 15);
            ctx.fillStyle = o.col === '#ffffff' ? '#e6eeed' : o.col; ctx.fillText(o.txt, x - w / 2 + 3, y + 4);
            return;
          }
          acc += seg[j];
        }
      });
    });
    // références liées visibles (autres travaux, fichiers) : croix grises, hors du levé
    if (window.Refs) {
      ctx.strokeStyle = '#7d8c8a'; ctx.fillStyle = '#7d8c8a'; ctx.lineWidth = 1.5; ctx.font = '10px Barlow, sans-serif';
      var tg = Refs.control.target();
      Refs.visible().forEach(function (p) {
        var q = toScr(p.est, p.nord); if (q[0] < -10 || q[1] < -10 || q[0] > s.w + 10 || q[1] > s.h + 10) return;
        ctx.beginPath(); ctx.moveTo(q[0] - 4, q[1] - 4); ctx.lineTo(q[0] + 4, q[1] + 4); ctx.moveTo(q[0] + 4, q[1] - 4); ctx.lineTo(q[0] - 4, q[1] + 4); ctx.stroke();
        if (tg && tg.q === p.q) { ctx.strokeStyle = '#4dd0e1'; ctx.beginPath(); ctx.arc(q[0], q[1], 9, 0, 7); ctx.stroke(); ctx.strokeStyle = '#7d8c8a'; }
        if (st.lbl && st.view.k > 2) ctx.fillText(p.nom.length > 6 ? p.nom.slice(-4) : p.nom, q[0] + 5, q[1] + 11);
      });
    }
    // points
    st.rows.forEach(function (r, k) {
      var p = toScr(r.e, r.n), pt = Ctx.points()[st.idx[k]], theo = pt && pt.type && pt.type !== 'mesure';
      ctx.fillStyle = errRows[k] ? '#ff6b6b' : theo ? '#7fd3cd' : '#f2f4f4';
      ctx.beginPath(); if (theo) { ctx.moveTo(p[0], p[1] - 4); ctx.lineTo(p[0] + 4, p[1]); ctx.lineTo(p[0], p[1] + 4); ctx.lineTo(p[0] - 4, p[1]); } else ctx.arc(p[0], p[1], 3, 0, 7); ctx.fill();
      if (st.flash === k) { ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p[0], p[1], 10, 0, 7); ctx.stroke(); }
      var pi = st.picks.indexOf(k);
      if (pi >= 0) { ctx.fillStyle = '#f2c94c'; ctx.beginPath(); ctx.arc(p[0], p[1], 9, 0, 7); ctx.fill(); ctx.fillStyle = '#222'; ctx.font = 'bold 11px Barlow, sans-serif'; ctx.fillText(String(pi + 1), p[0] - 3, p[1] + 4); }
      if (st.lbl) { ctx.fillStyle = '#c9d6d4'; ctx.font = '11px Barlow, sans-serif'; ctx.fillText(r.name.length > 6 ? r.name.slice(-4) : r.name, p[0] + 5, p[1] - 5); }
    });
    // position du récepteur et segment à venir
    var me = Ctx.here();
    if (me) {
      var q = toScr(me.e, me.n);
      if (st.code && !st.solo) {
        var cur = stringsOf(st.code).filter(function (x) { return x.str === st.str[st.code]; })[0], ctl = st.ctl[st.code] || '';
        if (cur && cur.open && cur.last !== null && ctl.split('.').indexOf('1') < 0) {
          var lp = toScr(st.rows[cur.last].e, st.rows[cur.last].n);
          ctx.setLineDash([6, 5]); ctx.strokeStyle = M.colorOf(st.code); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(lp[0], lp[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
          if (ctl.split('.').indexOf('2') >= 0 && cur.line) { var f = toScr(st.rows[cur.line.pts[0]].e, st.rows[cur.line.pts[0]].n); ctx.lineTo(f[0], f[1]); ctx.stroke(); }
          ctx.setLineDash([]);
        }
      }
      ctx.strokeStyle = '#4dd0e1'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(q[0], q[1], 8, 0, 7); ctx.moveTo(q[0] - 13, q[1]); ctx.lineTo(q[0] + 13, q[1]); ctx.moveTo(q[0], q[1] - 13); ctx.lineTo(q[0], q[1] + 13); ctx.stroke();
    }
    if (!st.rows.length && !me) { ctx.fillStyle = '#9aaba9'; ctx.font = '14px Barlow, sans-serif'; ctx.fillText('Le croquis se dessine au fil des points.', 16, 28); }
  }
  // déplacement, zoom, sélection au toucher
  var ptrs = {}, drag = null;
  cv.addEventListener('pointerdown', function (e) { cv.setPointerCapture(e.pointerId); ptrs[e.pointerId] = [e.offsetX, e.offsetY]; drag = { x: e.offsetX, y: e.offsetY, moved: false, cx: st.view.cx, cy: st.view.cy }; });
  cv.addEventListener('pointermove', function (e) {
    if (!ptrs[e.pointerId]) return;
    var ids = Object.keys(ptrs);
    if (ids.length === 2) {
      var o = ptrs[ids[0]], p = ptrs[ids[1]], d0 = Math.hypot(o[0] - p[0], o[1] - p[1]);
      ptrs[e.pointerId] = [e.offsetX, e.offsetY];
      var o2 = ptrs[ids[0]], p2 = ptrs[ids[1]], d1 = Math.hypot(o2[0] - p2[0], o2[1] - p2[1]);
      if (d0 > 0) st.view.k *= d1 / d0; st.userView = true; drag.moved = true; draw(); return;
    }
    ptrs[e.pointerId] = [e.offsetX, e.offsetY];
    if (!drag) return;
    var dx = e.offsetX - drag.x, dy = e.offsetY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
    if (drag.moved) { st.userView = true; st.view.cx = drag.cx - dx / st.view.k; st.view.cy = drag.cy + dy / st.view.k; draw(); }
  });
  cv.addEventListener('pointerup', function (e) {
    var wasTap = drag && !drag.moved && Object.keys(ptrs).length === 1;
    delete ptrs[e.pointerId]; if (!Object.keys(ptrs).length) { if (wasTap) tap(e.offsetX, e.offsetY); drag = null; }
  });
  cv.addEventListener('pointercancel', function (e) { delete ptrs[e.pointerId]; drag = null; });
  cv.addEventListener('wheel', function (e) { e.preventDefault(); zoomAt(e.deltaY < 0 ? 1.25 : 0.8, e.offsetX, e.offsetY); }, { passive: false });
  function zoomAt(f, x, y) { st.userView = true; var w = toW(x, y); st.view.k *= f; var w2 = toW(x, y); st.view.cx += w[0] - w2[0]; st.view.cy += w[1] - w2[1]; draw(); }
  $('lcZin').addEventListener('click', function () { var s = size(); zoomAt(1.5, s.w / 2, s.h / 2); });
  $('lcZout').addEventListener('click', function () { var s = size(); zoomAt(1 / 1.5, s.w / 2, s.h / 2); });
  $('lcFit').addEventListener('click', function () { st.userView = false; fitView(); draw(); });
  $('lcMe').addEventListener('click', function () { var me = Ctx.here(); if (!me) { toolMsg('Position du récepteur inconnue.', 'warn'); return; } st.userView = true; st.view.cx = me.e; st.view.cy = me.n; if (st.view.k < 5) st.view.k = 10; draw(); });
  $('lcLbl').classList.toggle('on', st.lbl);
  $('lcLbl').addEventListener('click', function () { st.lbl = !st.lbl; S.lcLbl = st.lbl; Ctx.save(); this.classList.toggle('on', st.lbl); draw(); });
  window.addEventListener('resize', function () { if (st.on) draw(); });
  function nearest(x, y) {
    var best = -1, bd = 26;
    st.rows.forEach(function (r, k) { var p = toScr(r.e, r.n), d = Math.hypot(p[0] - x, p[1] - y); if (d < bd) { bd = d; best = k; } });
    return best;
  }

  // ---------- Outils de correction (mêmes règles que Validation de levé) ----------
  var NEED = { swap: 2, rev: 1, close: 2, link: 2, cut: 2, join: 2, edit: 1, del: 1 };
  var HELP = { swap: 'Touchez les 2 points à échanger.', rev: 'Touchez un point de la ligne à inverser.', close: 'Touchez le 1er et le dernier point de la figure.',
    link: 'Touchez le point de la ligne, puis le point à rattacher.', cut: 'Touchez les 2 points reliés par erreur.', join: 'Touchez un point de chaque ligne.',
    edit: 'Touchez le point à modifier.', del: 'Touchez le point à effacer ou à rétablir.' };
  function toolMsg(t, cls, html) { var m = $('lcToolMsg'); m.hidden = !t; m.className = 'msg' + (cls ? ' ' + cls : ''); if (html) m.innerHTML = t; else m.textContent = t || ''; }
  document.querySelectorAll('#lcTools [data-t]').forEach(function (b) {
    b.addEventListener('click', function () {
      var t = b.dataset.t;
      if (st.tool === t) { st.tool = null; st.picks = []; }
      else {
        if (t !== 'edit' && !Ctx.writable().ok) { toolMsg(Ctx.writable().why, 'warn'); return; }
        st.tool = t; st.picks = []; toolMsg(HELP[t]);
      }
      document.querySelectorAll('#lcTools [data-t]').forEach(function (x) { x.classList.toggle('on', x.dataset.t === st.tool); });
      if (!st.tool) toolMsg(''); draw();
    });
  });
  function endTool() { st.tool = null; st.picks = []; document.querySelectorAll('#lcTools [data-t]').forEach(function (x) { x.classList.remove('on'); }); }
  function tap(x, y) {
    var k = nearest(x, y);
    if (!st.tool) {
      var r = k >= 0 ? st.rows[k] : null, pd = r ? Math.hypot(toScr(r.e, r.n)[0] - x, toScr(r.e, r.n)[1] - y) : 99, L = lineAt(x, y);
      if (L && pd > 10) return pickLine(L);
      if (r) { toolMsg(r.name + ' · ' + (r.desc || '(sans description)') + ' · Z ' + r.z.toFixed(3)); st.flash = k; draw(); }
      return;
    }
    if (k < 0) return;
    if (st.picks.indexOf(k) >= 0) return;
    st.picks.push(k); draw();
    if (st.picks.length >= NEED[st.tool]) apply(st.tool, st.picks.slice());
  }
  /* Ligne sous le doigt (14 px) : la plus proche. */
  function lineAt(x, y) {
    var best = null, bd = 14;
    (st.hit || []).forEach(function (h) {
      for (var i = 1; i < h.poly.length; i++) {
        var a = h.poly[i - 1], b = h.poly[i], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
        var t = l2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2)) : 0;
        var d = Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
        if (d < bd) { bd = d; best = h; }
      }
    });
    return best;
  }
  /* Toucher une ligne : ouverte = objectif fixé et ligne active ; fermée ou terminée = information. */
  function pickLine(h) {
    if (h.closed) { toolMsg('Ligne ' + h.pcode + '_' + h.str + ' fermée.'); return; }
    if (isDone(h.key)) { activate(h.pcode, h.str); toolMsg('Ligne ' + h.pcode + '_' + h.str + ' terminée : REPRENDRE pour la continuer.', 'warn'); return; }
    st.lock = h.key; activate(h.pcode, h.str);
    toolMsg('Objectif : ' + h.pcode + '_' + h.str + '. La suggestion se tait jusqu\u2019à « Libérer ».', 'ok');
  }
  function P(k) { return Ctx.points()[st.idx[k]]; }
  function snap(ks) { return ks.map(function (k) { var p = P(k); return { p: p, before: JSON.stringify(p) }; }); }
  function touch(p) { if (!p.orig) p.orig = { est: p.est, nord: p.nord, alt: p.alt, code: p.code || '' }; }
  function record(items, why) {
    st.hist.push(items);
    var meta = Ctx.jobMeta(); meta.journal = meta.journal || [];
    meta.journal.push({ t: new Date().toLocaleString('fr-CA'), why: why });
    Ctx.saveJobs(); Ctx.savePoints(); endTool(); toolMsg(why, 'ok'); refresh();
  }
  function linkOf(k, key) { return (M.parseDesc(st.rows[k].desc).links || []).filter(function (l) { return l.pcode + '|' + l.str === key; })[0]; }
  function lineOf(k) { return (st.A.lines || []).filter(function (L) { return L.type === 'line' && L.pts.indexOf(k) >= 0; }); }
  function setD(k, d) { var p = P(k); touch(p); p.code = d; st.rows[k].desc = d; }
  function freeStr(pc, n, reserve) {
    var used = {}; st.rows.forEach(function (r) { (M.parseDesc(r.desc).links || []).forEach(function (l) { if (String(l.pcode) === String(pc)) used[+l.str] = 1; }); });
    (reserve || []).forEach(function (s) { used[+s] = 1; });
    var out = [], s = 1; while (out.length < n) { if (!used[s]) out.push(String(s)); s++; } return out;
  }
  function choose(title, options) {
    toolMsg('<b>' + esc(title) + '</b>' + options.map(function (o, i) { return '<button type="button" class="btn" style="display:block;margin-top:6px;text-align:left" data-o="' + i + '">' + o.txt + '</button>'; }).join('') +
      '<button type="button" class="btn" style="margin-top:6px" data-o="x">Annuler</button>', 'warn', true);
    $('lcToolMsg').querySelectorAll('[data-o]').forEach(function (b) {
      b.addEventListener('click', function () { if (b.dataset.o === 'x') { endTool(); toolMsg(''); draw(); return; } options[+b.dataset.o].fn(); });
    });
  }
  function apply(t, ks) {
    var a = ks[0], b = ks[1], items, L;
    try {
      if (t === 'swap') {
        items = snap([a, b]); var A = P(a), B = P(b); touch(A); touch(B);
        ['est', 'nord', 'alt', 'lat', 'lon', 'hEll', 'sep'].forEach(function (f) { var x = A[f]; A[f] = B[f]; B[f] = x; });
        return record(items, 'Coordonnées de ' + A.nom + ' et ' + B.nom + ' échangées (INV PTS).');
      }
      if (t === 'rev') {
        L = lineOf(a)[0]; if (!L) throw new Error('Ce point ne fait partie d’aucune ligne.');
        var shared = L.pts.filter(function (i) { return st.A.lines.some(function (o) { return o !== L && o.pts.indexOf(i) >= 0; }); });
        if (shared.length) throw new Error('Impossible : ' + shared.map(function (i) { return st.rows[i].name; }).join(', ') + ' appartient aussi à une autre ligne.');
        items = snap(L.pts); var co = L.pts.map(function (i) { var p = P(i); return { est: p.est, nord: p.nord, alt: p.alt, lat: p.lat, lon: p.lon, hEll: p.hEll }; }).reverse();
        L.pts.forEach(function (i, j) { var p = P(i); touch(p); Object.keys(co[j]).forEach(function (f) { p[f] = co[j][f]; }); });
        return record(items, 'Ligne ' + L.pcode + ' / ' + L.str + ' inversée (' + L.pts.length + ' points).');
      }
      if (t === 'close') {
        var opts = [];
        st.A.lines.forEach(function (L2) {
          if (L2.type !== 'line' || L2.closed) return;
          var f = L2.pts[0], l = L2.pts[L2.pts.length - 1];
          if ((a === f && b === l) || (a === l && b === f)) opts.push({ txt: 'Fermer ' + esc(L2.pcode) + ' / ' + esc(L2.str) + ' : ' + esc(st.rows[l].name) + ' reçoit .2', fn: function () {
            var it = snap([l]); setD(l, M.patchLinkDesc(st.rows[l].desc, L2.key, function (x) { x.ctrl = x.ctrl === '4' ? '4.2' : '2'; })); record(it, 'Ligne ' + L2.pcode + ' / ' + L2.str + ' fermée.'); } });
          [[a, b], [b, a]].forEach(function (pq) {
            var Pp = pq[0], Q = pq[1];
            if (Pp === f && Q > l && L2.pts.indexOf(Q) < 0) opts.push({ txt: 'Fermer ' + esc(L2.pcode) + ' / ' + esc(L2.str) + ' en passant par ' + esc(st.rows[Q].name) + ' (reçoit .2)', fn: function () {
              var it = snap([Q]); setD(Q, M.addLinkDesc(st.rows[Q].desc, { pcode: L2.pcode, str: L2.str, ctrl: '2' })); record(it, 'Ligne ' + L2.pcode + ' / ' + L2.str + ' fermée par ' + st.rows[Q].name + '.'); } });
          });
        });
        if (!opts.length) throw new Error('Ces 2 points ne sont pas le début et la fin d’une ligne ouverte.');
        return opts.length === 1 ? opts[0].fn() : choose('Fermer la figure', opts);
      }
      if (t === 'link') {
        var o2 = [], E = Math.min(a, b), Lt = Math.max(a, b);
        st.A.lines.forEach(function (L2) {
          if (L2.type !== 'line' || L2.closed) return;
          var f = L2.pts[0], l = L2.pts[L2.pts.length - 1];
          [[a, b], [b, a]].forEach(function (pq) {
            var Pp = pq[0], Q = pq[1]; if (L2.pts.indexOf(Pp) < 0 || L2.pts.indexOf(Q) >= 0) return;
            if (Pp === l && Q > l) o2.push({ txt: 'Prolonger ' + esc(L2.pcode) + ' / ' + esc(L2.str) + ' jusqu’à ' + esc(st.rows[Q].name), fn: function () {
              var it = snap([Q]); setD(Q, M.addLinkDesc(st.rows[Q].desc, { pcode: L2.pcode, str: L2.str, ctrl: null })); record(it, 'Ligne ' + L2.pcode + ' / ' + L2.str + ' prolongée jusqu’à ' + st.rows[Q].name + '.'); } });
            if (Pp === f && Q < f) o2.push({ txt: 'Débuter ' + esc(L2.pcode) + ' / ' + esc(L2.str) + ' à ' + esc(st.rows[Q].name) + ' (levé avant)', fn: function () {
              var it = snap([Q, f]); setD(Q, M.addLinkDesc(st.rows[Q].desc, { pcode: L2.pcode, str: L2.str, ctrl: '1' }));
              setD(f, M.patchLinkDesc(st.rows[f].desc, L2.key, function (x) { if (x.ctrl === '1') x.ctrl = null; })); record(it, 'Ligne ' + L2.pcode + ' / ' + L2.str + ' débutée à ' + st.rows[Q].name + '.'); } });
          });
        });
        if (!o2.length) {
          var pc = M.parseDesc(st.rows[E].desc).pcode || M.parseDesc(st.rows[Lt].desc).pcode;
          if (!pc) throw new Error('Aucun code sur ces points.');
          var s1 = freeStr(pc, 1)[0];
          o2.push({ txt: 'Nouvelle ligne ' + esc(pc) + ' / ' + s1 + ' : ' + esc(st.rows[E].name) + ' (.1) → ' + esc(st.rows[Lt].name), fn: function () {
            var it = snap([E, Lt]); setD(E, M.addLinkDesc(st.rows[E].desc, { pcode: pc, str: s1, ctrl: '1' })); setD(Lt, M.addLinkDesc(st.rows[Lt].desc, { pcode: pc, str: s1, ctrl: null }));
            record(it, 'Liaison forcée : nouvelle ligne ' + pc + ' / ' + s1 + '.'); } });
        }
        return o2.length === 1 ? o2[0].fn() : choose('Lier les 2 points', o2);
      }
      if (t === 'cut') {
        var done = false;
        st.A.lines.forEach(function (L2) {
          if (done || L2.type !== 'line') return;
          var Pp = L2.pts, n = Pp.length - 1, k2 = -1;
          for (var j = 0; j < n; j++) if ((Pp[j] === a && Pp[j + 1] === b) || (Pp[j] === b && Pp[j + 1] === a)) { k2 = j; break; }
          if (k2 < 0 && L2.closed && ((Pp[n] === a && Pp[0] === b) || (Pp[n] === b && Pp[0] === a))) k2 = n;
          if (k2 < 0) return; done = true;
          if (k2 === n) { var it0 = snap([Pp[n]]); setD(Pp[n], M.patchLinkDesc(st.rows[Pp[n]].desc, L2.key, function (x) { if (x.ctrl === '2') x.ctrl = null; else if (x.ctrl === '4.2') x.ctrl = '4'; })); return record(it0, 'Fermeture retirée (' + L2.pcode + ' / ' + L2.str + ').'); }
          var pieces = [Pp.slice(0, k2 + 1), Pp.slice(k2 + 1)]; if (L2.closed) pieces.push([Pp[0], Pp[n]]);
          var orig = {}; Pp.forEach(function (i) { var lk = linkOf(i, L2.key); orig[i] = lk ? lk.ctrl : null; });
          var uniq = Pp.filter(function (i, j2) { return Pp.indexOf(i) === j2; }), it = snap(uniq);
          uniq.forEach(function (i) { setD(i, M.patchLinkDesc(st.rows[i].desc, L2.key, function () { return null; })); });
          var valid = pieces.filter(function (x) { return x.length >= 2; }), strs = [L2.str].concat(freeStr(L2.pcode, Math.max(0, valid.length - 1), [L2.str]));
          valid.forEach(function (piece, pi) {
            piece.forEach(function (i, j3) {
              var c = orig[i]; if (j3 === 0) c = (c === '3' || c === '6') ? c : '1'; else if (c === '1' || c === '2') c = null;
              if (piece === pieces[2]) c = j3 === 0 ? '1' : null;
              setD(i, M.addLinkDesc(st.rows[i].desc, { pcode: L2.pcode, str: strs[pi], ctrl: c }));
            });
          });
          record(it, 'Segment retiré : ligne ' + L2.pcode + ' / ' + L2.str + ' séparée en ' + valid.length + ' (strings ' + strs.slice(0, valid.length).join(', ') + ').');
        });
        if (!done) throw new Error('Ces 2 points ne sont pas consécutifs sur une même ligne.');
        return;
      }
      if (t === 'join') {
        var la = lineOf(a), lb = lineOf(b), pair = null;
        la.forEach(function (X) { lb.forEach(function (Y) { if (!pair && X !== Y) pair = X.pts[0] <= Y.pts[0] ? { A: X, B: Y } : { A: Y, B: X }; }); });
        if (!pair) throw new Error('Touchez un point de chacune des 2 lignes.');
        var go = function (pc, closed) {
          var keep = String(pc) === String(pair.A.pcode) ? pair.A : pair.B, str = keep.str;
          var pts = pair.A.pts.concat(pair.B.pts).filter(function (x, j4, arr) { return arr.indexOf(x) === j4; }).sort(function (x, y) { return x - y; });
          var cA = {}, cB = {}; pair.A.pts.forEach(function (i) { var l = linkOf(i, pair.A.key); cA[i] = l ? l.ctrl : null; }); pair.B.pts.forEach(function (i) { var l = linkOf(i, pair.B.key); cB[i] = l ? l.ctrl : null; });
          var it = snap(pts);
          pts.forEach(function (i, j5) {
            var inA = i in cA, inB = i in cB, c = inA ? cA[i] : cB[i]; if (inA && inB && !cA[i]) c = cB[i];
            if (j5 === 0) c = (c === '3' || c === '6') ? c : '1'; else if (c === '1' || c === '2' || c === '6') c = null;
            if (closed && j5 === pts.length - 1) c = '2';
            var setx = function (x) { x.pcode = String(pc); x.str = str; x.ctrl = c; };
            var d = st.rows[i].desc;
            if (inA) { d = M.patchLinkDesc(d, pair.A.key, setx); if (inB) d = M.patchLinkDesc(d, pair.B.key, function () { return null; }); }
            else d = M.patchLinkDesc(d, pair.B.key, setx);
            setD(i, d);
          });
          record(it, 'Lignes unies : ' + pc + ' / ' + str + ', ' + pts.length + ' points' + (closed ? ', figure fermée' : '') + '.');
        };
        var o3 = [{ txt: 'Unir en figure fermée (code ' + esc(pair.A.pcode) + ')', fn: function () { go(pair.A.pcode, true); } },
                  { txt: 'Unir en ligne ouverte (code ' + esc(pair.A.pcode) + ')', fn: function () { go(pair.A.pcode, false); } }];
        if (String(pair.A.pcode) !== String(pair.B.pcode)) o3.push({ txt: 'Unir en figure fermée (code ' + esc(pair.B.pcode) + ')', fn: function () { go(pair.B.pcode, true); } });
        return choose('Unir les 2 lignes (ordre du levé)', o3);
      }
      if (t === 'edit') {
        var p = P(a), nd = prompt('Description du point ' + p.nom + ' (Pcode String.Contrôle, ex. 526 1.1) :', p.code || '');
        if (nd === null) { endTool(); toolMsg(''); draw(); return; }
        if (!Ctx.writable().ok) throw new Error(Ctx.writable().why);
        items = snap([a]); setD(a, nd.trim()); p.codeDesc = Ctx.codeDescription ? Ctx.codeDescription(nd) : p.codeDesc;
        return record(items, 'Description de ' + p.nom + ' : « ' + (p.orig ? p.orig.code : '') + ' » → « ' + nd.trim() + ' ».');
      }
      if (t === 'del') {
        var pd = P(a); items = snap([a]); touch(pd); pd.del = !pd.del;
        return record(items, 'Point ' + pd.nom + (pd.del ? ' effacé (exclu du _MODIF, gardé au brut).' : ' rétabli.'));
      }
    } catch (e) { endTool(); toolMsg(e.message, 'warn'); draw(); }
  }
  // effacés : le croquis ne les montre pas ; on peut les rétablir depuis la liste des points (onglet Points) ou par ANNULER
  $('lcUndo').addEventListener('click', function () {
    var items = st.hist.pop(); if (!items) return;
    items.forEach(function (x) { var o = JSON.parse(x.before); Object.keys(x.p).forEach(function (k) { delete x.p[k]; }); Object.keys(o).forEach(function (k) { x.p[k] = o[k]; }); });
    var meta = Ctx.jobMeta(); meta.journal = meta.journal || []; meta.journal.push({ t: new Date().toLocaleString('fr-CA'), why: 'Annulation de la dernière correction' });
    Ctx.saveJobs(); Ctx.savePoints(); toolMsg('Dernière correction annulée.', 'ok'); refresh();
  });

  // ---------- Export : brut + _MODIF (P,N,E,Z,D, sans en-tête) ----------
  function fmt(v) { return v === null || v === undefined || isNaN(v) ? '' : (+v).toFixed(3); }
  function exportRows(useOrig, opts) {
    return Ctx.jobPoints().filter(function (p) {
      if (p.est === null || p.est === undefined) return false;
      if (!useOrig && p.del) return false;
      if ((p.type === 'importe' || p.type === 'inscrit') && !opts.refs) return false;
      return true;
    }).map(function (p) {
      var o = useOrig && p.orig ? p.orig : p;
      return [p.nom, fmt(o.nord), fmt(o.est), fmt(o.alt), String(o.code || '').trim()].join(',');
    });
  }
  function exportLeve() {
    var job = Ctx.leve(), pts = Ctx.jobPoints();
    if (!job || !pts.length) { alert('Aucun point dans le travail en cours.'); return; }
    var bad = pts.filter(function (p) { return !/^\d{9}$|^\d{10}$/.test(p.nom) && p.type !== 'importe'; });
    var v = Codes.validateLeve(job);
    var warn = [];
    if (!v.ok) warn.push('Nom du travail non conforme (' + v.errors.join(', ') + ') : le levé sera « À vérifier » au dépôt.');
    if (bad.length) warn.push(bad.length + ' point(s) hors numérotation AJJJSSNNN / AAMMJJNNNN (ex. ' + bad[0].nom + ') : Validation de levé demandera de renuméroter.');
    var errs = (st.A || analyze()).issues.filter(function (x) { return x.sev === 'err'; }).length;
    if (errs) warn.push(errs + ' anomalie(s) de codes non corrigée(s).');
    var refs = pts.some(function (p) { return p.type === 'importe' || p.type === 'inscrit'; }) &&
      confirm('Inclure les points importés ou inscrits (références d’autres travaux) ?\nOK = oui, Annuler = mesurés et calculés seulement.');
    if (warn.length && !confirm(warn.join('\n') + '\n\nExporter quand même ?')) return;
    var brut = exportRows(true, { refs: refs }).join('\r\n') + '\r\n', modif = exportRows(false, { refs: refs }).join('\r\n') + '\r\n';
    var modified = pts.some(function (p) { return p.orig || p.del; });
    var base = job.replace(/[^\w#-]+/g, '_');
    Ctx.saveText(base + '.txt', 'text/plain', brut);
    if (!modified) { exportMsg('Fichier ' + base + '.txt exporté (aucune correction : pas de _MODIF).'); return; }
    if (Ctx.isNative) {
      // Android : un fichier à la fois ; le _MODIF suit l'enregistrement du brut
      var once = function (e) { document.removeEventListener('cg:file', once); if (e.detail && e.detail.ok) Ctx.saveText(base + '_MODIF.txt', 'text/plain', modif); };
      document.addEventListener('cg:file', once);
    } else Ctx.saveText(base + '_MODIF.txt', 'text/plain', modif);
    exportMsg('Fichiers ' + base + '.txt (brut) et ' + base + '_MODIF.txt (corrigé) exportés.');
  }
  function exportMsg(t) { var m = $('ptMsg'); if (m) { m.style.display = 'block'; m.className = 'msg ok'; m.textContent = t; } }
  // bouton dans l'onglet Points
  (function () {
    var ex = $('btnExport'); if (!ex) return;
    var b = document.createElement('button'); b.className = 'btn primary'; b.id = 'btnExportLeve'; b.type = 'button';
    b.textContent = 'Exporter le levé (.txt brut + _MODIF)'; ex.parentNode.insertBefore(b, ex);
    ex.classList.remove('primary');
    b.addEventListener('click', exportLeve);
  })();

  window.LeveCodes = { active: function () { return st.on; }, cands: cands, activate: activate, lineAt: lineAt, refresh: refresh, exportLeve: exportLeve, _st: st };
  setMode(!!S.lcMode);
})();
