/* Collecte GNSS — Arpent-Nord
 * cogo-ui.js : onglet « Calculs ». Raccourcis numériques à la Menarp : 1 Enregistre, 2 Liste, 3 Loc Az,
 * 4 Inverse, 7 Superficie, 15 Prolonge ligne. Les calculs sont dans cogo.js ; la base de points est celle de l'application.
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var Ctx = window.AppCtx;
  if (!Ctx || !window.Cogo) return;
  var esc = Ctx.esc, S = Ctx.settings;

  // ---------- Réglages ----------
  ['cgAng', 'cgDist', 'cgFact', 'cgFactVal', 'cgCodeSel', 'cgCodeOther'].forEach(function (id) {
    if (S[id] !== undefined) $(id).value = S[id];
    $(id).addEventListener('change', function () { S[id] = this.value; Ctx.save(); renderSettings(); });
  });
  if (S.cgStay === false) $('cgStay').checked = false;
  $('cgStay').addEventListener('change', function () { S.cgStay = this.checked; Ctx.save(); });
  function angMode() { return $('cgAng').value; }
  function ang(id) { return Cogo.parseAngle($(id).value, angMode()); }
  function num(id) { var v = parseFloat(String($(id).value).replace(',', '.')); return isNaN(v) ? NaN : v; }
  function fmtAz(a) { return Cogo.formatAngle(a, angMode()); }
  function f3(v) { return v === null || v === undefined || isNaN(v) ? '—' : v.toFixed(3); }
  function msg(id, text, cls) { var m = $(id); m.style.display = text ? '' : 'none'; m.className = 'msg' + (cls ? ' ' + cls : ''); m.textContent = text || ''; }

  // ---------- Base de points ----------
  /* Dernier point portant ce nom, avec coordonnées planes. */
  function findPoint(name) {
    name = String(name || '').trim(); if (!name) return null;
    var pts = Ctx.points();
    for (var i = pts.length - 1; i >= 0; i--) {
      var p = pts[i];
      if (p.nom === name && p.est !== null && p.est !== undefined) return { name: p.nom, e: p.est, n: p.nord, z: p.alt, src: p, idx: i };
    }
    return null;
  }
  function need(names) {
    var out = [], missing = [];
    names.forEach(function (n) { var p = findPoint(n); if (p) out.push(p); else missing.push(n || '(vide)'); });
    if (missing.length) throw new Error('Point introuvable : ' + missing.join(', '));
    var sys = currentSystem(), other = out.filter(function (p) { return p.src.systeme && p.src.systeme !== sys; });
    if (other.length) throw new Error('Point ' + other[0].name + ' dans un autre système (' + other[0].src.systeme + ') que le travail (' + sys + ')');
    return out;
  }
  function currentSystem() { var hz = Proj.horizontalById(Ctx.job().hz); return hz.epsg ? 'EPSG:' + hz.epsg : 'Geographiques'; }

  /* Latitude, longitude NAD83(SCRS) et hauteur ellipsoïdale approchée d'un point plan (pour les facteurs et le CSV). */
  function geo(e, n, z) {
    var job = Ctx.job(), hz = Proj.horizontalById(job.hz);
    if (!hz.zone) return null;
    var g = Proj.mtm(hz.zone).inverse(e, n);
    if (hz.datum === 'NAD83') { var c = Proj.nad83ToCsrs(g.lat, g.lon); if (c) g = { lat: c.lat, lon: c.lon }; }
    var vt = Proj.verticalById(job.vt), N = null;
    if (vt.grid) N = Proj.gridValue(vt.grid, g.lat, g.lon);
    else if (vt.id === '10588-sep' && !isNaN(job.sep)) N = job.sep;
    g.N = N;
    g.hEll = z !== null && z !== undefined && !isNaN(z) ? z + (N === null ? 0 : N) : null;
    return g;
  }
  /* Facteur combiné (grille = sol × facteur) au milieu des points donnés. */
  function factorAt(pts) {
    var e = 0, n = 0, z = 0, nz = 0;
    pts.forEach(function (p) { e += p.e; n += p.n; if (p.z !== null && p.z !== undefined && !isNaN(p.z)) { z += p.z; nz++; } });
    e /= pts.length; n /= pts.length;
    var g = geo(e, n, nz ? z / nz : 0);
    if (!g) return 1;
    return Cogo.combinedFactor(e, g.lat, g.hEll || 0);
  }
  /* Facteur du secteur de travail (comme Menarp) : moyenne des facteurs d'échelle des points du levé en cours
   * × facteur de l'altitude moyenne (hauteur ellipsoïdale = altitude + N). */
  function sector() {
    var leve = Ctx.leve(), list = [];
    Ctx.points().forEach(function (p) {
      if (p.est === null || p.est === undefined || (leve && p.leve !== leve)) return;
      var lat = p.lat, h = p.hEll;
      if (lat === null || lat === undefined || h === null || h === undefined) { var g = geo(p.est, p.nord, p.alt); if (!g) return; lat = g.lat; if (h === null || h === undefined) h = g.hEll; }
      list.push({ e: p.est, lat: lat, hEll: h });
    });
    return Cogo.sectorFactor(list);
  }
  /* Facteur combiné à utiliser : secteur (défaut), au lieu du calcul, ou inscrit. */
  function factorFor(pts) {
    var mode = $('cgFact').value;
    if (mode === 'manuel') { var v = num('cgFactVal'); if (!isNaN(v) && v > 0.99 && v < 1.01) return v; }
    if (mode === 'secteur') { var s = sector(); if (s) return s.cf; }
    return factorAt(pts);
  }
  function toGrid(d, pts) { return $('cgDist').value === 'sol' ? d * factorFor(pts) : d; }
  function renderSettings() {
    $('cgFactValWrap').style.display = $('cgFact').value === 'manuel' ? '' : 'none';
    $('cgCodeOtherWrap').style.display = $('cgCodeSel').value === 'autre' ? '' : 'none';
    var info = $('cgFactInfo'), mode = $('cgFact').value, s = sector();
    if (mode === 'manuel') info.textContent = 'Facteur combiné inscrit : ' + (isNaN(num('cgFactVal')) ? '(à inscrire)' : num('cgFactVal').toFixed(8)) + '.';
    else if (mode === 'secteur' && s) info.textContent = 'Facteur combiné du secteur : ' + s.cf.toFixed(8) + ' (échelle moyenne ' + s.k.toFixed(8) +
      ' × altitude ' + s.ef.toFixed(8) + ', h moyenne ' + s.hMean.toFixed(1) + ' m, ' + s.n + ' point(s) du levé).';
    else info.textContent = 'Facteur combiné calculé au lieu de chaque calcul' + (mode === 'secteur' ? ' (aucun point dans le levé en cours pour le secteur)' : '') + '.';
    var code = computedCode();
    ['c3Code', 'c15Code'].forEach(function (id) { if (!$(id).value.trim() || $(id).value === lastCode) $(id).value = code; });
    lastCode = code;
  }
  var lastCode = '';
  function computedCode() { return $('cgCodeSel').value === 'autre' ? $('cgCodeOther').value.trim() : $('cgCodeSel').value; }

  /* Nouveau point théorique, au format des points mesurés (CSV identique). */
  function makePoint(name, code, c, type, formule) {
    var job = Ctx.job(), hz = Proj.horizontalById(job.hz), vt = Proj.verticalById(job.vt);
    var g = geo(c.e, c.n, c.z);
    var hasZ = c.z !== null && c.z !== undefined && !isNaN(c.z);
    return {
      leve: Ctx.leve(), nom: name, code: code || '', note: '', codeDesc: Ctx.codeDescription(code || ''),
      est: c.e, nord: c.n, alt: hasZ ? c.z : null,
      systeme: hz.epsg ? 'EPSG:' + hz.epsg : 'Geographiques',
      systemeAlti: hasZ ? (vt.grid ? 'EPSG:10588 (' + vt.grid + ')' : vt.id === '10588-sep' ? 'EPSG:10588 (separation fixe)' : 'Ellipsoidale') : '',
      lat: g ? g.lat : null, lon: g ? g.lon : null, hEll: g ? g.hEll : null, sep: g ? g.N : null,
      type: type, formule: formule, start: new Date().toISOString()
    };
  }
  function saveNew(nameId, codeId, c, formule, msgId) {
    var name = $(nameId).value.trim();
    if (!name) { msg(msgId, 'Indiquer le nom du nouveau point.', 'warn'); return false; }
    if (findPoint(name) && !confirm('Le point ' + name + ' existe déjà. Ajouter quand même un point du même nom ?')) return false;
    Ctx.addPoints([makePoint(name, $(codeId).value.trim() || computedCode(), c, 'calcule', formule)]);
    msg(msgId, 'Point ' + name + ' enregistré (' + formule + ').', 'ok');
    suggested[nameId] = Ctx.nextName(); $(nameId).value = suggested[nameId];
    return true;
  }
  function dl(id, rows) { $(id).innerHTML = rows.map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>'; }).join(''); }

  /* Bouton ± à côté des champs qui acceptent un signe (le clavier numérique d'Android n'a pas toujours le « − »). */
  ['c3Ang', 'c3Dz', 'c3Pente', 'c15D', 'c15O'].forEach(function (id) {
    var inp = $(id), wrap = document.createElement('div'), b = document.createElement('button');
    wrap.className = 'inline'; wrap.style.marginTop = '4px';
    b.type = 'button'; b.className = 'btn'; b.textContent = '±'; b.title = 'Changer le signe';
    inp.parentNode.insertBefore(wrap, inp); wrap.appendChild(inp); wrap.appendChild(b); inp.style.marginTop = '0';
    b.addEventListener('click', function () {
      var v = inp.value.trim(); inp.value = v.charAt(0) === '-' ? v.slice(1) : '-' + v;
      inp.dispatchEvent(new Event('input')); inp.focus();
    });
  });

  // ---------- Barre de commandes ----------
  var current = null, suggested = {};
  function show(n) {
    var c = Cogo.COMMANDS.filter(function (x) { return x.n === +n; })[0];
    document.querySelectorAll('.cgpane').forEach(function (p) { p.classList.toggle('on', c && +p.dataset.cmd === c.n); });
    document.querySelectorAll('#cgCmds .chip').forEach(function (b) { b.classList.toggle('sel', c && +b.dataset.n === c.n); });
    $('cgTitle').textContent = c ? c.n + ' · ' + c.label + ' — ' + c.desc : 'Commande inconnue : 1, 2, 3, 4, 7 ou 15.';
    if (!c) return;
    current = c.n; S.cgLast = c.n; Ctx.save(); renderSettings();
    // Nom proposé : prochain numéro libre (refait si le nom affiché est déjà pris).
    var nameId = { 1: 'c1Nom', 3: 'c3Nom', 15: 'c15Nom' }[c.n];
    if (nameId) {
      var v = $(nameId).value.trim();
      if (!v || findPoint(v) || v === suggested[nameId]) { suggested[nameId] = Ctx.nextName(); $(nameId).value = suggested[nameId]; }
    }
  }
  Cogo.COMMANDS.forEach(function (c) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'chip cgcmd'; b.dataset.n = c.n;
    b.innerHTML = '<b>' + c.n + '</b>' + esc(c.label); b.title = c.desc;
    b.addEventListener('click', function () { $('cgN').value = c.n; show(c.n); });
    $('cgCmds').appendChild(b);
  });
  $('cgN').addEventListener('input', function () { if (this.value.trim()) show(this.value.trim()); });
  $('cgN').value = S.cgLast || 3; show($('cgN').value);

  // ---------- 1 Enregistre ----------
  $('c1Save').addEventListener('click', function () {
    var name = $('c1Nom').value.trim(), e = num('c1E'), n = num('c1N'), z = num('c1Z');
    if (!name || isNaN(e) || isNaN(n)) { msg('c1Msg', 'Nom, Est et Nord requis.', 'warn'); return; }
    if (findPoint(name) && !confirm('Le point ' + name + ' existe déjà. Ajouter quand même ?')) return;
    Ctx.addPoints([makePoint(name, $('c1Code').value.trim(), { e: e, n: n, z: isNaN(z) ? null : z }, 'inscrit', 'Inscrit')]);
    msg('c1Msg', 'Point ' + name + ' enregistré.', 'ok');
    $('c1Nom').value = Ctx.nextName(); $('c1E').value = ''; $('c1N').value = ''; $('c1Z').value = '';
  });

  /* Lecture d'un fichier de points : CSV Flow 360 (en-tête) ou P,N,E,Z,D / P,E,N,Z,D. */
  function parsePointFile(text, order) {
    var lines = String(text).replace(/^﻿/, '').split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (!lines.length) return [];
    var sep = lines[0].indexOf('\t') >= 0 ? '\t' : lines[0].indexOf(';') >= 0 && lines[0].indexOf(',') < 0 ? ';' : ',';
    function split(l) {
      var out = [], cur = '', q = false;
      for (var i = 0; i < l.length; i++) {
        var ch = l[i];
        if (ch === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
        else if (ch === sep && !q) { out.push(cur); cur = ''; } else cur += ch;
      }
      out.push(cur); return out.map(function (x) { return x.trim(); });
    }
    var first = split(lines[0]), header = first.some(function (h) { return /^(name|point|easting|northing|est|nord|x|y)$/i.test(h); });
    var idx = { p: 0, n: 1, e: 2, z: 3, d: 4 };
    if (order === 'PENZD') idx = { p: 0, e: 1, n: 2, z: 3, d: 4 };
    if (header) {
      var f = function (re) { for (var i = 0; i < first.length; i++) if (re.test(first[i])) return i; return -1; };
      idx = { p: f(/^(name|point|nom|pt)$/i), e: f(/^(easting|est|e|x)$/i), n: f(/^(northing|nord|n|y)$/i),
        z: f(/^(elevation|altitude|z|elev)$/i), d: f(/^description$/i) };
      if (idx.d < 0) idx.d = f(/^(code|desc)$/i);
      if (idx.p < 0 || idx.e < 0 || idx.n < 0) throw new Error('colonnes Nom, Est et Nord introuvables dans l’en-tête');
      lines = lines.slice(1);
    }
    var out = [];
    lines.forEach(function (l, k) {
      var c = split(l), e = parseFloat(c[idx.e]), n = parseFloat(c[idx.n]), z = idx.z >= 0 ? parseFloat(c[idx.z]) : NaN;
      if (!c[idx.p] || isNaN(e) || isNaN(n)) return;
      out.push({ name: c[idx.p], e: e, n: n, z: isNaN(z) ? null : z, d: idx.d >= 0 ? (c[idx.d] || '') : '' });
    });
    return out;
  }
  $('c1File').addEventListener('change', function () {
    var file = this.files && this.files[0]; this.value = '';
    if (!file) return;
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var list = parsePointFile(fr.result, $('c1Order').value), add = [], skipped = 0, replaced = 0;
        var dup = $('c1Dup').value, src = 'Importé de ' + file.name;
        list.forEach(function (r) {
          var ex = findPoint(r.name), p = makePoint(r.name, r.d, r, 'importe', src);
          if (ex && dup === 'skip') { skipped++; return; }
          if (ex && dup === 'replace') { Ctx.replacePoint(ex.idx, p); replaced++; return; }
          add.push(p);
        });
        if (add.length) Ctx.addPoints(add);
        msg('c1Msg', list.length + ' point(s) lu(s) : ' + add.length + ' ajouté(s)' + (replaced ? ', ' + replaced + ' remplacé(s)' : '') +
          (skipped ? ', ' + skipped + ' ignoré(s) (déjà présents)' : '') + '.', list.length ? 'ok' : 'warn');
      } catch (e) { msg('c1Msg', 'Fichier refusé : ' + e.message + '.', 'bad'); }
    };
    fr.readAsText(file);
  });

  // ---------- 2 Liste ----------
  var lastList = [];
  function listPoints() {
    var pts = Ctx.points(), seq = Cogo.parseSequence($('c2Seq').value), type = $('c2Type').value;
    var code = $('c2Code').value.trim().toLowerCase(), leve = Ctx.leve(), onlyLeve = $('c2Leve').checked;
    var res = [];
    if (seq.length) {
      seq.forEach(function (n) { var p = findPoint(n); if (p) res.push(p.src); });
    } else res = pts.slice();
    res = res.filter(function (p) {
      var theo = p.type && p.type !== 'mesure';
      if (type === 'mesure' && theo) return false;
      if (type === 'theo' && !theo) return false;
      if (code && String(p.code || '').toLowerCase().indexOf(code) < 0) return false;
      if (onlyLeve && leve && p.leve !== leve) return false;
      return true;
    });
    return res;
  }
  $('c2Go').addEventListener('click', function () {
    var res = listPoints(), line = null;
    if ($('c2A').value.trim() || $('c2B').value.trim()) {
      try { line = need([$('c2A').value.trim(), $('c2B').value.trim()]); } catch (e) { msg('c2Msg', e.message + '.', 'warn'); return; }
    }
    lastList = res;
    var head = '<tr><th>Point</th><th>Code</th><th>Est</th><th>Nord</th><th>Alt.</th>' + (line ? '<th>Chaînage</th><th>Écart</th><th>dZ</th>' : '') + '</tr>';
    $('c2Table').innerHTML = '<thead>' + head + '</thead><tbody>' + res.map(function (p) {
      var theo = p.type && p.type !== 'mesure', extra = '';
      if (line) {
        var so = Cogo.stationOffset(line[0], line[1], { e: p.est, n: p.nord, z: p.alt });
        extra = '<td class="num">' + f3(so.chainage) + '</td><td class="num">' + (so.offset >= 0 ? '+' : '') + f3(so.offset) + '</td><td class="num">' + f3(so.dz) + '</td>';
      }
      return '<tr><td' + (theo ? ' class="theo"' : '') + '>' + esc(p.nom) + '</td><td>' + esc(p.code) + '</td><td class="num">' + f3(p.est) +
        '</td><td class="num">' + f3(p.nord) + '</td><td class="num">' + f3(p.alt) + '</td>' + extra + '</tr>';
    }).join('') + '</tbody>';
    msg('c2Msg', res.length + ' point(s)' + (line ? ' · ligne ' + line[0].name + ' → ' + line[1].name + ' (' + f3(Cogo.hdist(line[0], line[1])) + ' m) ; écart + à droite' : '') + '.', res.length ? '' : 'warn');
  });
  $('c2Csv').addEventListener('click', function () {
    if (!lastList.length) { msg('c2Msg', 'Lister d’abord les points.', 'warn'); return; }
    var name = (Ctx.leve() || 'liste').replace(/[^\w#-]+/g, '_') + '_liste.csv';
    Ctx.saveText(name, 'text/csv', Survey.toCsv(lastList));
  });
  $('c2Copy').addEventListener('click', function () {
    var dest = $('c2Dest').value.trim().toUpperCase();
    if (!lastList.length || !dest) { msg('c2Msg', 'Lister les points et indiquer le levé de destination.', 'warn'); return; }
    var copies = lastList.map(function (p) {
      var c = JSON.parse(JSON.stringify(p)); c.leve = dest;
      if (c.type === 'mesure' || !c.type) { c.type = 'importe'; c.formule = 'Copié du levé ' + (p.leve || '(sans nom)'); }
      return c;
    });
    Ctx.addPoints(copies);
    msg('c2Msg', copies.length + ' point(s) copié(s) vers le levé ' + dest + ' (comme points théoriques).', 'ok');
  });

  // ---------- 3 Loc Az ----------
  var FIELDS3 = {
    azdist: ['A', 'azA', 'dA', 'dz', 'pente'], angdist: ['A', 'R', 'ang', 'dA', 'dz', 'pente'],
    azaz: ['A', 'azA', 'B', 'azB'], distdist: ['A', 'dA', 'B', 'dB', 'sol'], azdistx: ['A', 'azA', 'B', 'dB', 'sol']
  };
  var pending3 = null;
  function mode3() {
    var m = $('c3Mode').value, f = FIELDS3[m];
    document.querySelectorAll('[data-cmd="3"] [data-f]').forEach(function (l) { l.style.display = f.indexOf(l.dataset.f) >= 0 ? '' : 'none'; });
    var sol = $('c3Sol'); sol.innerHTML = '';
    (m === 'distdist' ? [['left', 'À gauche de A → B'], ['right', 'À droite de A → B']] : [['1', '1re rencontre le long de l’azimut'], ['2', '2e rencontre']])
      .forEach(function (o) { var x = document.createElement('option'); x.value = o[0]; x.textContent = o[1]; sol.appendChild(x); });
    pending3 = null; $('c3Save').disabled = true; $('c3Res').innerHTML = '';
    S.c3Mode = m; Ctx.save();
  }
  if (S.c3Mode) $('c3Mode').value = S.c3Mode;
  $('c3Mode').addEventListener('change', mode3); mode3();
  ['c3A', 'c3R', 'c3AzA', 'c3Ang', 'c3DA', 'c3B', 'c3AzB', 'c3DB', 'c3Sol', 'c3Dz', 'c3Pente'].forEach(function (id) {
    $(id).addEventListener('input', function () { pending3 = null; $('c3Save').disabled = true; });
  });
  function calc3() {
    var m = $('c3Mode').value, A, B, R, c, formule, opt = {};
    var dz = num('c3Dz'), pe = num('c3Pente');
    if (!isNaN(dz)) opt.dz = dz; else if (!isNaN(pe)) opt.slopePct = pe;
    if (m === 'azdist') {
      A = need([$('c3A').value])[0];
      var az = ang('c3AzA'), d = num('c3DA'); if (isNaN(az) || isNaN(d)) throw new Error('Azimut et distance requis');
      var dg = toGrid(d, [A]); c = Cogo.locAz(A, az, dg, opt);
      formule = 'Loc Az de ' + A.name + ', Az ' + fmtAz(az) + ', D ' + d.toFixed(3) + ($('cgDist').value === 'sol' ? ' sol' : '');
    } else if (m === 'angdist') {
      var two = need([$('c3A').value, $('c3R').value]); A = two[0]; R = two[1];
      var an = ang('c3Ang'), d2 = num('c3DA'); if (isNaN(an) || isNaN(d2)) throw new Error('Angle et distance requis');
      c = Cogo.locAngle(A, R, an, toGrid(d2, [A]), opt);
      formule = 'Loc Angle de ' + A.name + ' (réf. ' + R.name + '), Ang ' + fmtAz(an) + ', D ' + d2.toFixed(3) + ($('cgDist').value === 'sol' ? ' sol' : '');
    } else if (m === 'azaz') {
      var ab = need([$('c3A').value, $('c3B').value]); A = ab[0]; B = ab[1];
      var a1 = ang('c3AzA'), a2 = ang('c3AzB'); if (isNaN(a1) || isNaN(a2)) throw new Error('Deux azimuts requis');
      c = Cogo.intersectAzAz(A, a1, B, a2); if (!c) throw new Error('Azimuts parallèles : aucune intersection');
      c.z = null; formule = 'Intersection Az ' + A.name + ' ' + fmtAz(a1) + ' / Az ' + B.name + ' ' + fmtAz(a2);
    } else if (m === 'distdist') {
      var ab2 = need([$('c3A').value, $('c3B').value]); A = ab2[0]; B = ab2[1];
      var r1 = num('c3DA'), r2 = num('c3DB'); if (isNaN(r1) || isNaN(r2)) throw new Error('Deux distances requises');
      var x = Cogo.intersectDistDist(A, toGrid(r1, [A, B]), B, toGrid(r2, [A, B]));
      if (!x) throw new Error('Les deux distances ne se rencontrent pas');
      c = x[$('c3Sol').value]; c.z = null;
      formule = 'Intersection D ' + A.name + ' ' + r1.toFixed(3) + ' / D ' + B.name + ' ' + r2.toFixed(3) + ' (' + ($('c3Sol').value === 'left' ? 'gauche' : 'droite') + ')';
    } else {
      var ab3 = need([$('c3A').value, $('c3B').value]); A = ab3[0]; B = ab3[1];
      var a3 = ang('c3AzA'), r3 = num('c3DB'); if (isNaN(a3) || isNaN(r3)) throw new Error('Azimut et distance requis');
      var sols = Cogo.intersectAzDist(A, a3, B, toGrid(r3, [A, B]));
      if (!sols.length) throw new Error('L’azimut ne rencontre pas la distance');
      c = sols[Math.min(sols.length, +$('c3Sol').value) - 1]; c.z = null;
      formule = 'Intersection Az ' + A.name + ' ' + fmtAz(a3) + ' / D ' + B.name + ' ' + r3.toFixed(3) + ' (solution ' + $('c3Sol').value + ' sur ' + sols.length + ')';
    }
    var inv = Cogo.inverse(A, c), k = factorFor([A, c]);
    dl('c3Res', [['Est', f3(c.e)], ['Nord', f3(c.n)], ['Altitude', f3(c.z)],
      ['Depuis ' + esc(A.name), fmtAz(inv.az) + ' · ' + f3(inv.dist) + ' m grille · ' + f3(inv.dist / k) + ' m sol'],
      ['Facteur combiné', k.toFixed(8)]]);
    pending3 = { c: c, formule: formule, A: A };
  }
  $('c3Calc').addEventListener('click', function () {
    try { calc3(); $('c3Save').disabled = false; msg('c3Msg', ''); }
    catch (e) { pending3 = null; $('c3Save').disabled = true; $('c3Res').innerHTML = ''; msg('c3Msg', e.message + '.', 'warn'); }
  });
  $('c3Save').addEventListener('click', function () {
    if (!pending3) return;
    var name = $('c3Nom').value.trim();
    if (saveNew('c3Nom', 'c3Code', pending3.c, pending3.formule, 'c3Msg')) {
      // Cheminement : sans « rester au point de départ », le nouveau point devient la station.
      if (!$('cgStay').checked && ($('c3Mode').value === 'azdist' || $('c3Mode').value === 'angdist')) {
        if ($('c3Mode').value === 'angdist') $('c3R').value = $('c3A').value;
        $('c3A').value = name;
      }
      pending3 = null; $('c3Save').disabled = true;
    }
  });

  // ---------- 4 Inverse ----------
  function mode4() {
    var m = $('c4Mode').value;
    document.querySelectorAll('[data-cmd="4"] [data-m]').forEach(function (l) { l.style.display = (l.dataset.m === '2') === (m === '2') ? '' : 'none'; });
    S.c4Mode = m; Ctx.save();
  }
  if (S.c4Mode) $('c4Mode').value = S.c4Mode;
  $('c4Mode').addEventListener('change', mode4); mode4();
  $('c4Go').addEventListener('click', function () {
    try {
      var m = $('c4Mode').value, pts = m === '2' ? need([$('c4A').value, $('c4B').value]) : need(Cogo.parseSequence($('c4Seq').value));
      if (pts.length < 2) throw new Error('Au moins deux points');
      var res = Cogo.inverseSeries(pts, m === 'radial' ? 'radial' : 'chain'), k = factorFor(pts);
      $('c4Table').innerHTML = '<thead><tr><th>De</th><th>À</th><th>Azimut</th><th>Dist. grille</th><th>Dist. sol</th><th>dZ</th><th>Pente</th></tr></thead><tbody>' +
        res.legs.map(function (r) {
          return '<tr><td>' + esc(r.from) + '</td><td>' + esc(r.to) + '</td><td>' + fmtAz(r.az) + '</td><td class="num">' + f3(r.dist) +
            '</td><td class="num">' + f3(r.dist / k) + '</td><td class="num">' + f3(r.dz) + '</td><td class="num">' + (r.slopePct === null ? '—' : r.slopePct.toFixed(2) + ' %') + '</td></tr>';
        }).join('') + '</tbody>';
      msg('c4Msg', (m === 'radial' ? '' : 'Longueur totale : ' + f3(res.total) + ' m grille, ' + f3(res.total / k) + ' m sol · ') + 'facteur combiné ' + k.toFixed(8) + '.', '');
    } catch (e) { $('c4Table').innerHTML = ''; msg('c4Msg', e.message + '.', 'warn'); }
  });

  // ---------- 7 Superficie ----------
  $('c7Go').addEventListener('click', function () {
    try {
      var pts = need(Cogo.parseSequence($('c7Seq').value));
      var r = Cogo.area(pts); if (!r) throw new Error('Au moins trois sommets');
      var k = factorFor(pts), sol = r.area / (k * k);
      dl('c7Res', [['Superficie (grille)', r.area.toFixed(3) + ' m²'], ['Superficie (sol)', sol.toFixed(3) + ' m²'],
        ['Hectares (sol)', (sol / 10000).toFixed(4) + ' ha'], ['Pieds carrés (sol)', (sol / 0.09290304).toFixed(1) + ' pi²'],
        ['Acres (sol)', (sol / 4046.8564224).toFixed(4)], ['Périmètre', r.perimeter.toFixed(3) + ' m grille · ' + (r.perimeter / k).toFixed(3) + ' m sol'],
        ['Sommets', pts.length + ' · ' + esc(pts.map(function (p) { return p.name; }).join(', '))]]);
      msg('c7Msg', '');
    } catch (e) { $('c7Res').innerHTML = ''; msg('c7Msg', e.message + '.', 'warn'); }
  });

  // ---------- 15 Prolonge ligne ----------
  var pending15 = null;
  $('c15Calc').addEventListener('click', function () {
    try {
      var ab = need([$('c15A').value, $('c15B').value]), A = ab[0], B = ab[1], c, formule;
      if ($('c15P').value.trim()) {
        var P = need([$('c15P').value])[0];
        c = Cogo.perpendicular(A, B, P);
        formule = 'Perpendiculaire de ' + P.name + ' sur ' + A.name + '-' + B.name + ' (3PP)';
        dl('c15Res', [['Est', f3(c.e)], ['Nord', f3(c.n)], ['Altitude (sur la ligne)', f3(c.z)],
          ['Chaînage depuis ' + esc(A.name), f3(c.chainage) + ' m'], ['Écart de ' + esc(P.name), (c.offset >= 0 ? '+' : '') + f3(c.offset) + ' m (+ à droite)']]);
      } else {
        var d = num('c15D'), o = num('c15O'); if (isNaN(d)) throw new Error('Distance requise');
        if (isNaN(o)) o = 0;
        c = Cogo.alongLine(A, B, toGrid(d, [A, B]), toGrid(o, [A, B]));
        formule = 'Prolonge ' + A.name + '-' + B.name + ', D ' + d.toFixed(3) + (o ? ', déport ' + o.toFixed(3) : '') + ' (2PD)';
        dl('c15Res', [['Est', f3(c.e)], ['Nord', f3(c.n)], ['Altitude (pente de la ligne)', f3(c.z)],
          ['Longueur ' + esc(A.name) + '-' + esc(B.name), f3(Cogo.hdist(A, B)) + ' m grille']]);
      }
      pending15 = { c: c, formule: formule }; $('c15Save').disabled = false; msg('c15Msg', '');
    } catch (e) { pending15 = null; $('c15Save').disabled = true; $('c15Res').innerHTML = ''; msg('c15Msg', e.message + '.', 'warn'); }
  });
  $('c15Save').addEventListener('click', function () {
    if (pending15 && saveNew('c15Nom', 'c15Code', pending15.c, pending15.formule, 'c15Msg')) { pending15 = null; $('c15Save').disabled = true; }
  });

  window.CogoUi = { parsePointFile: parsePointFile };
})();
