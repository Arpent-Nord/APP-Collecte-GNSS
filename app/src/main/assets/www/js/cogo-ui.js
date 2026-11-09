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
    if (mode === 'un') return 1;
    if (mode === 'manuel') { var v = num('cgFactVal'); if (!isNaN(v) && v > 0.99 && v < 1.01) return v; }
    if (mode === 'secteur') { var s = sector(); if (s) return s.cf; }
    return factorAt(pts);
  }
  function toGrid(d, pts) { return $('cgDist').value === 'sol' ? d * factorFor(pts) : d; }
  function renderSettings() {
    $('cgFactValWrap').style.display = $('cgFact').value === 'manuel' ? '' : 'none';
    $('cgCodeOtherWrap').style.display = $('cgCodeSel').value === 'autre' ? '' : 'none';
    var info = $('cgFactInfo'), mode = $('cgFact').value, s = sector();
    if (mode === 'un') info.textContent = 'Facteur combiné = 1 : aucune correction, distance sol = distance grille.';
    else if (mode === 'manuel') info.textContent = 'Facteur combiné inscrit : ' + (isNaN(num('cgFactVal')) ? '(à inscrire)' : num('cgFactVal').toFixed(8)) + '.';
    else if (mode === 'secteur' && s) info.textContent = 'Facteur combiné du secteur : ' + s.cf.toFixed(8) + ' (échelle moyenne ' + s.k.toFixed(8) +
      ' × altitude ' + s.ef.toFixed(8) + ', h moyenne ' + s.hMean.toFixed(1) + ' m, ' + s.n + ' point(s) du levé).';
    else info.textContent = 'Facteur combiné calculé au lieu de chaque calcul' + (mode === 'secteur' ? ' (aucun point dans le levé en cours pour le secteur)' : '') + '.';
    var code = computedCode();
    ['c3Code'].forEach(function (id) { if (!$(id).value.trim() || $(id).value === lastCode) $(id).value = code; });
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
  ['c3Ang', 'c3D1', 'c3D2', 'c3Off', 'c3Dz', 'c3Pente'].forEach(function (id) {
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
    $('cgTitle').textContent = c ? c.n + ' · ' + c.label + ' — ' + c.desc : 'Commande inconnue : 1, 2, 3, 4 ou 7.';
    if (c && c.n === 2) fillLeves();
    if (!c) return;
    current = c.n; S.cgLast = c.n; Ctx.save(); renderSettings();
    // Nom proposé : prochain numéro libre (refait si le nom affiché est déjà pris).
    var nameId = { 1: 'c1Nom', 3: 'c3Nom' }[c.n];
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
    var code = $('c2Code').value.trim().toLowerCase(), sel = $('c2Leve').value, leve = sel === '*cur' ? Ctx.leve() : sel;
    var inLeve = function (p) { return sel === '*all' || (p.leve || '') === leve; };
    var res = [];
    if (seq.length) {
      seq.forEach(function (n) { for (var i = pts.length - 1; i >= 0; i--) if (pts[i].nom === n && inLeve(pts[i])) { res.push(pts[i]); break; } });
    } else res = pts.filter(inLeve);
    res = res.filter(function (p) {
      var theo = p.type && p.type !== 'mesure';
      if (type === 'mesure' && theo) return false;
      if (type === 'theo' && !theo) return false;
      if (code && String(p.code || '').toLowerCase().indexOf(code) < 0) return false;
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
  /* Liste des levés présents sur l'appareil. */
  function fillLeves() {
    var sel = $('c2Leve'), cur = sel.value || '*cur', seen = {}, opts = [['*cur', 'Levé en cours (' + (Ctx.leve() || 'sans nom') + ')'], ['*all', 'Tous les levés']];
    Ctx.points().forEach(function (p) { var l = p.leve || ''; if (!seen[l] && l !== Ctx.leve()) { seen[l] = 1; opts.push([l, l || '(sans nom)']); } });
    sel.innerHTML = ''; opts.forEach(function (o) { var x = document.createElement('option'); x.value = o[0]; x.textContent = o[1]; sel.appendChild(x); });
    sel.value = opts.some(function (o) { return o[0] === cur; }) ? cur : '*cur';
  }
  $('c1FromLeve').addEventListener('click', function () {
    $('cgN').value = 2; show(2);
    var sel = $('c2Leve'); if (sel.options.length > 2) sel.selectedIndex = 2;
    $('c2Dest').value = ''; $('c2CopyBox').open = true; $('c2Seq').focus();
  });
  $('c2Copy').addEventListener('click', function () {
    var dest = ($('c2Dest').value.trim() || Ctx.leve()).toUpperCase();
    if (!lastList.length || !dest) { msg('c2Msg', 'Lister les points et indiquer le levé de destination.', 'warn'); return; }
    var inDest = {}; Ctx.points().forEach(function (p) { if ((p.leve || '') === dest) inDest[p.nom] = 1; });
    var skipped = 0;
    var copies = lastList.filter(function (p) { if (inDest[p.nom]) { skipped++; return false; } return true; }).map(function (p) {
      var c = JSON.parse(JSON.stringify(p)); c.leve = dest;
      if (c.type === 'mesure' || !c.type) { c.type = 'importe'; c.formule = 'Copié du levé ' + (p.leve || '(sans nom)'); }
      return c;
    });
    if (copies.length) Ctx.addPoints(copies);
    msg('c2Msg', copies.length + ' point(s) copié(s) vers le levé ' + dest + ' (comme points théoriques)' + (skipped ? ', ' + skipped + ' ignoré(s) : déjà dans ce levé' : '') + '.', copies.length ? 'ok' : 'warn');
    fillLeves();
  });

  // ---------- 3 Création de points ----------
  /* Champs et libellés par méthode. Les commandes 2P à RECT suivent les règles de Validation de levé. */
  var M3 = {
    '2P':   { f: ['P1', 'P2'], L: ['1er point', '2e point'], help: 'Point milieu de 1-2. Z : moyenne des deux points.' },
    '2PD':  { f: ['P1', 'P2', 'from', 'd1', 'off'], L: ['Point 1', 'Point 2'], d1: 'Distance sur l’alignement 1-2',
              help: 'Distance depuis le point 1, ou depuis le point 2 pour prolonger au-delà ; négative = vers l’arrière. Z : pente de 1-2.' },
    '2D':   { f: ['P1', 'P2', 'd1', 'd2', 'sol'], L: ['Point 1', 'Point 2'], d1: 'Distance depuis le point 1',
              help: 'Intersection de deux distances. Côté par rapport à 1 → 2 : droite ou gauche (une distance négative = gauche).' },
    '3PP':  { f: ['P1', 'P2', 'P3'], L: ['1er point du segment', '2e point du segment', 'Point à projeter'],
              help: 'Pied de la perpendiculaire du point 3 sur le segment 1-2. Z interpolé sur 1-2.' },
    '4P':   { f: ['P1', 'P2', 'P3', 'P4'], L: ['Point 1 (droite 1-2)', 'Point 2', 'Point 3 (droite 3-4)', 'Point 4'], help: 'Intersection des droites 1-2 et 3-4.' },
    '3C':   { f: ['P1', 'P2', 'P3'], L: ['1er point du cercle', '2e point', '3e point'], help: 'Centre du cercle passant par les 3 points ; le rayon est affiché.' },
    'RECT': { f: ['P1', 'P2', 'P3'], L: ['Point A', 'Point B (coin du milieu)', 'Point C'], help: '4e coin du rectangle A-B-C (B au coin). Z = ZA + ZC − ZB.' },
    azdist: { f: ['P1', 'az1', 'd1', 'dz', 'pente'], L: ['Point de départ'], d1: 'Distance', az1: 'Azimut',
              help: 'Point à un azimut et une distance d’un point connu.' },
    angdist:{ f: ['P1', 'P2', 'ang', 'd1', 'dz', 'pente'], L: ['Station', 'Référence arrière'], d1: 'Distance',
              help: 'Angle mesuré depuis la référence arrière : + horaire, − antihoraire.' },
    azaz:   { f: ['P1', 'az1', 'P2', 'az2'], L: ['Point 1', 'Point 2'], az1: 'Azimut depuis le point 1', help: 'Intersection de deux azimuts.' },
    azdistx:{ f: ['P1', 'az1', 'P2', 'd2', 'sol'], L: ['Point 1', 'Point 2'], az1: 'Azimut depuis le point 1',
              help: 'Intersection d’un azimut (depuis 1) et d’une distance (depuis 2) : jusqu’à deux solutions.' }
  };
  var pending3 = null;
  function mode3() {
    var m = $('c3Mode').value, cfg = M3[m];
    document.querySelectorAll('[data-cmd="3"] [data-f]').forEach(function (l) { l.style.display = cfg.f.indexOf(l.dataset.f) >= 0 ? '' : 'none'; });
    for (var k = 1; k <= 4; k++) $('c3L' + k).textContent = cfg.L[k - 1] || ('Point ' + k);
    $('c3LD1').textContent = cfg.d1 || 'Distance'; $('c3LAz1').textContent = cfg.az1 || 'Azimut depuis le point 1';
    var sol = $('c3Sol'); sol.innerHTML = '';
    (m === 'azdistx' ? [['1', '1re rencontre le long de l’azimut'], ['2', '2e rencontre']] : [['1', 'À droite de 1 → 2'], ['-1', 'À gauche de 1 → 2']])
      .forEach(function (o) { var x = document.createElement('option'); x.value = o[0]; x.textContent = o[1]; sol.appendChild(x); });
    $('c3Help').textContent = cfg.help;
    pending3 = null; $('c3Save').disabled = true; $('c3Res').innerHTML = '';
    S.c3Mode = m; Ctx.save();
  }
  if (S.c3Mode && M3[S.c3Mode]) $('c3Mode').value = S.c3Mode;
  $('c3Mode').addEventListener('change', mode3); mode3();
  ['c3P1', 'c3P2', 'c3P3', 'c3P4', 'c3From', 'c3Az1', 'c3Ang', 'c3D1', 'c3Az2', 'c3D2', 'c3Off', 'c3Sol', 'c3Dz', 'c3Pente'].forEach(function (id) {
    $(id).addEventListener('input', function () { pending3 = null; $('c3Save').disabled = true; });
    $(id).addEventListener('change', function () { pending3 = null; $('c3Save').disabled = true; });
  });
  function req(v, what) { if (isNaN(v)) throw new Error(what + ' requis'); return v; }
  /* « 4-7 » (ou « 4-7+90 ») dans un champ d'azimut ou de distance : calculé à partir de deux points du levé. */
  function pairOf(id) {
    var m = /^\s*([^\s+\-,;]+)\s*-\s*([^\s+\-,;]+)\s*(?:([+-])\s*(\S+))?\s*$/.exec($(id).value);
    if (!m) return null;
    var pts = need([m[1], m[2]]);
    return { a: pts[0], b: pts[1], sign: m[3], extra: m[4] };
  }
  /* Azimut : nombre (format choisi) ou 4-7 [± angle]. */
  function azIn(id, what) {
    var pr = pairOf(id);
    if (!pr) return req(ang(id), what);
    var az = Cogo.azimuth(pr.a, pr.b);
    if (pr.extra) { var x = Cogo.parseAngle(pr.extra, angMode()); if (isNaN(x)) throw new Error('Angle « ' + pr.extra + ' » illisible'); az += pr.sign === '-' ? -x : x; }
    if (Cogo.hdist(pr.a, pr.b) === 0) throw new Error('Points ' + pr.a.name + ' et ' + pr.b.name + ' confondus');
    return Cogo.norm360(az);
  }
  /* Distance : nombre (grille ou sol selon le réglage) ou 4-7 (distance grille entre deux points, ramenée au réglage
   * pour que la conversion grille/sol la redonne exactement). */
  function distIn(id, P, what) {
    var pr = pairOf(id);
    if (!pr) return req(num(id), what);
    var d = Cogo.hdist(pr.a, pr.b);
    return $('cgDist').value === 'sol' ? d / factorFor(P) : d;
  }
  /* Texte de la formule : « 4-7 » si la valeur vient de deux points. */
  function src(id) { var v = $(id).value.trim(); return /^[^\s+\-,;]+\s*-\s*[^\s+\-,;]+/.test(v) && !/^-?[\d.,]+$/.test(v) ? ' (' + v.replace(/\s+/g, '') + ')' : ''; }
  function calc3() {
    var m = $('c3Mode').value, cfg = M3[m], names = [];
    cfg.f.forEach(function (f) { if (/^P\d$/.test(f)) names.push($('c3' + f).value); });
    var P = need(names), A = P[0], B = P[1], c = null, formule, extra = [], opt = {};
    var dz = num('c3Dz'), pe = num('c3Pente'), sd = $('cgDist').value === 'sol' ? ' sol' : '';
    if (!isNaN(dz)) opt.dz = dz; else if (!isNaN(pe)) opt.slopePct = pe;
    var list = P.map(function (p) { return p.name; }).join(', ');
    switch (m) {
      case '2P': c = Cogo.midpoint(A, B); formule = '2P de ' + list; break;
      case '2PD': {
        var d = distIn('c3D1', P, 'Distance'), off = num('c3Off'), from = +$('c3From').value;
        if (Cogo.hdist(A, B) === 0) throw new Error('Les deux points sont confondus');
        c = Cogo.pointAtDistance(A, B, toGrid(d, P), from, isNaN(off) ? 0 : toGrid(off, P));
        formule = '2PD ' + list + ', D ' + d.toFixed(3) + sd + src('c3D1') + ' depuis ' + (from === 2 ? B.name : A.name) + (off ? ', déport ' + off.toFixed(3) : ''); break;
      }
      case '2D': {
        var d1 = distIn('c3D1', P, 'Distance depuis le point 1'), d2 = distIn('c3D2', P, 'Distance depuis le point 2');
        var side = (d1 < 0 || d2 < 0) ? -1 : +$('c3Sol').value;
        c = Cogo.twoDistances(A, B, toGrid(Math.abs(d1), P), toGrid(Math.abs(d2), P), side);
        if (!c) throw new Error('Les distances ' + Math.abs(d1).toFixed(3) + ' et ' + Math.abs(d2).toFixed(3) + ' ne se croisent pas (base ' + Cogo.hdist(A, B).toFixed(3) + ' m)');
        formule = '2D ' + list + ', D ' + Math.abs(d1).toFixed(3) + ' / ' + Math.abs(d2).toFixed(3) + sd + ' (' + (side < 0 ? 'gauche' : 'droite') + ')'; break;
      }
      case '3PP': c = Cogo.perpendicular(A, B, P[2]); if (!c) throw new Error('Les deux premiers points sont confondus');
        extra.push(['Chaînage depuis ' + esc(A.name), f3(c.chainage) + ' m'], ['Écart de ' + esc(P[2].name), (c.offset >= 0 ? '+' : '') + f3(c.offset) + ' m (+ à droite)']);
        formule = '3PP ' + list; break;
      case '4P': c = Cogo.intersectLines(P[0], P[1], P[2], P[3]); if (!c) throw new Error('Les droites 1-2 et 3-4 sont parallèles'); formule = '4P ' + list; break;
      case '3C': c = Cogo.circleCenter(P[0], P[1], P[2]); if (!c) throw new Error('Les 3 points sont alignés');
        extra.push(['Rayon', f3(c.r) + ' m grille · ' + f3(c.r / factorFor(P)) + ' m sol']); formule = '3C ' + list + ', R ' + c.r.toFixed(3); break;
      case 'RECT': c = Cogo.rectCorner(P[0], P[1], P[2]); formule = 'RECT ' + list; break;
      case 'azdist': {
        var az = azIn('c3Az1', 'Azimut'), dd = distIn('c3D1', P, 'Distance');
        c = Cogo.locAz(A, az, toGrid(dd, P), opt); formule = 'Az-dist de ' + A.name + ', Az ' + fmtAz(az) + src('c3Az1') + ', D ' + dd.toFixed(3) + sd + src('c3D1'); break;
      }
      case 'angdist': {
        var an = req(ang('c3Ang'), 'Angle'), d3 = distIn('c3D1', P, 'Distance');
        c = Cogo.locAngle(A, B, an, toGrid(d3, [A]), opt);
        formule = 'Angle-dist de ' + A.name + ' (réf. ' + B.name + '), Ang ' + fmtAz(an) + ', D ' + d3.toFixed(3) + sd; break;
      }
      case 'azaz': {
        var a1 = azIn('c3Az1', 'Azimut depuis le point 1'), a2 = azIn('c3Az2', 'Azimut depuis le point 2');
        c = Cogo.intersectAzAz(A, a1, B, a2); if (!c) throw new Error('Azimuts parallèles : aucune intersection');
        c.z = null; formule = 'Intersection Az ' + A.name + ' ' + fmtAz(a1) + src('c3Az1') + ' / Az ' + B.name + ' ' + fmtAz(a2) + src('c3Az2'); break;
      }
      case 'azdistx': {
        var a3 = azIn('c3Az1', 'Azimut depuis le point 1'), r3 = distIn('c3D2', P, 'Distance depuis le point 2');
        var sols = Cogo.intersectAzDist(A, a3, B, toGrid(r3, P));
        if (!sols.length) throw new Error('L’azimut ne rencontre pas la distance');
        c = sols[Math.min(sols.length, +$('c3Sol').value || 1) - 1]; c.z = null;
        formule = 'Intersection Az ' + A.name + ' ' + fmtAz(a3) + ' / D ' + B.name + ' ' + r3.toFixed(3) + sd + ' (solution ' + Math.min(sols.length, +$('c3Sol').value || 1) + ' sur ' + sols.length + ')'; break;
      }
    }
    var inv = Cogo.inverse(A, c), k = factorFor(P.concat([c]));
    dl('c3Res', [['Est', f3(c.e)], ['Nord', f3(c.n)], ['Altitude', f3(c.z)]].concat(extra).concat([
      ['Depuis ' + esc(A.name), fmtAz(inv.az) + ' · ' + f3(inv.dist) + ' m grille · ' + f3(inv.dist / k) + ' m sol']]));
    pending3 = { c: c, formule: formule };
  }
  $('c3Calc').addEventListener('click', function () {
    try { calc3(); $('c3Save').disabled = false; msg('c3Msg', ''); }
    catch (e) { pending3 = null; $('c3Save').disabled = true; $('c3Res').innerHTML = ''; msg('c3Msg', e.message + '.', 'warn'); }
  });
  $('c3Save').addEventListener('click', function () {
    if (!pending3) return;
    var name = $('c3Nom').value.trim(), m = $('c3Mode').value;
    if (saveNew('c3Nom', 'c3Code', pending3.c, pending3.formule, 'c3Msg')) {
      // Cheminement : sans « rester au point de départ », le nouveau point devient la station.
      if (!$('cgStay').checked && (m === 'azdist' || m === 'angdist')) {
        if (m === 'angdist') $('c3P2').value = $('c3P1').value;
        $('c3P1').value = name;
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

  // ---------- Sélecteur de points (ouvre le levé et aide à choisir) ----------
  var PK = { input: null, mode: 'one', chosen: [], skip: {} };
  (function buildPicker() {
    var d = document.createElement('div'); d.className = 'pk'; d.id = 'pk'; d.hidden = true;
    d.innerHTML = '<div class="pkbox" role="dialog" aria-modal="true">' +
      '<div class="pkhead"><b id="pkTitle">Choisir un point</b><button class="pkx" id="pkClose" type="button" aria-label="Fermer">×</button></div>' +
      '<input id="pkQ" placeholder="Chercher : nom, code, description" autocomplete="off">' +
      '<div class="pkopts"><label>Levé<select id="pkLeve"></select></label>' +
      '<label>Ordre<select id="pkSort"><option value="recent">Plus récents</option><option value="near">Plus proches de moi</option><option value="name">Par nom</option></select></label></div>' +
      '<div class="pklist" id="pkList"></div>' +
      '<div class="pkfoot"><div class="pkseq" id="pkSeq"></div>' +
      '<button class="btn" id="pkKbd" type="button">Saisir au clavier</button>' +
      '<button class="btn" id="pkUndo" type="button">Retirer le dernier</button>' +
      '<button class="btn primary" id="pkOk" type="button">OK</button></div></div>';
    document.body.appendChild(d);
    d.addEventListener('click', function (e) { if (e.target === d) closePicker(); });
  })();
  if (S.pkSort) $('pkSort').value = S.pkSort;
  function leveList() {
    var cur = Ctx.leve(), seen = {}, out = [['*cur', 'Levé en cours (' + (cur || 'sans nom') + ')'], ['*all', 'Tous les levés']];
    Ctx.points().forEach(function (p) { var l = p.leve || ''; if (!seen[l] && l !== cur) { seen[l] = 1; out.push([l, l || '(sans nom)']); } });
    return out;
  }
  function pkPoints() {
    var sel = $('pkLeve').value, cur = Ctx.leve(), q = $('pkQ').value.trim().toLowerCase();
    var pts = Ctx.points(), byName = {}, list = [];
    for (var i = pts.length - 1; i >= 0; i--) {
      var p = pts[i];
      if (p.est === null || p.est === undefined || byName[p.nom]) continue;
      if (sel === '*cur' ? (p.leve || '') !== cur : sel !== '*all' && (p.leve || '') !== sel) continue;
      byName[p.nom] = 1;
      if (q && (p.nom + ' ' + (p.code || '') + ' ' + (p.codeDesc || '')).toLowerCase().indexOf(q) < 0) continue;
      list.push({ p: p, i: i });
    }
    var here = Ctx.here ? Ctx.here() : null, sort = $('pkSort').value;
    if (sort === 'near' && here) list.forEach(function (x) { x.d = Math.hypot(x.p.est - here.e, x.p.nord - here.n); });
    if (sort === 'near' && here) list.sort(function (a, b) { return a.d - b.d; });
    else if (sort === 'name') list.sort(function (a, b) { return String(a.p.nom).localeCompare(String(b.p.nom), 'fr', { numeric: true }); });
    return { list: list, here: here };
  }
  /* Mode « code » : bibliothèque de Pcodes (codes récents si la recherche est vide). */
  function renderCodes() {
    var q = $('pkQ').value.trim(), box = $('pkList'), list;
    list = q ? Codes.search(q, 60) : (S.recentCodes || []).map(function (c) { return Codes.byCode(c); }).filter(Boolean)
      .concat(['299', '300', '301'].map(function (c) { return Codes.byCode(c); }).filter(Boolean));
    var seen = {}; box.innerHTML = '';
    list.forEach(function (c) {
      if (seen[c.code]) return; seen[c.code] = 1;
      var b = document.createElement('button'); b.type = 'button'; b.className = 'pkrow';
      b.innerHTML = '<span class="nm">' + esc(c.code) + ' ' + esc(c.aph || '') + '</span><span class="cd">' + esc(c.categorie || '') + '</span><span class="xy">' + esc(c.description) + '</span>';
      b.addEventListener('click', function () { finish(c.code); });
      box.appendChild(b);
    });
    if (!list.length) box.innerHTML = '<p class="hint" style="padding:10px">Aucun code. Chercher par numéro, abréviation ou mot.</p>';
    $('pkSeq').textContent = ''; $('pkOk').style.display = 'none'; $('pkUndo').style.display = 'none';
  }
  function renderPicker() {
    var isCode = PK.mode === 'code';
    document.querySelector('.pkopts').style.display = isCode ? 'none' : '';
    if (isCode) return renderCodes();
    var r = pkPoints(), box = $('pkList'), f = function (v) { return v === null || v === undefined ? '—' : v.toFixed(3); };
    box.innerHTML = '';
    if (!r.list.length) box.innerHTML = '<p class="hint" style="padding:10px">Aucun point' + ($('pkQ').value ? ' pour cette recherche' : ' dans ce levé') + '. Essayez « Tous les levés ».</p>';
    r.list.slice(0, 300).forEach(function (x) {
      var p = x.p, b = document.createElement('button'), theo = p.type && p.type !== 'mesure';
      b.type = 'button'; b.className = 'pkrow' + (PK.chosen.indexOf(p.nom) >= 0 ? ' sel' : '');
      b.innerHTML = '<span class="nm' + (theo ? ' theo' : '') + '">' + esc(p.nom) + '</span><span class="cd">' + esc(p.code || '') + (p.codeDesc ? ' · ' + esc(p.codeDesc) : '') + '</span>' +
        '<span class="xy">E ' + f(p.est) + ' · N ' + f(p.nord) + ' · Z ' + f(p.alt) + (x.d !== undefined ? ' · à ' + x.d.toFixed(1) + ' m' : '') + (theo ? ' · ' + esc(p.type) : '') + '</span>';
      b.addEventListener('click', function () { pickPoint(p.nom); });
      box.appendChild(b);
    });
    if ($('pkSort').value === 'near' && !r.here) box.insertAdjacentHTML('afterbegin', '<p class="hint" style="padding:6px">Position du récepteur inconnue : ordre des plus récents.</p>');
    var multi = PK.mode !== 'one';
    $('pkSeq').textContent = multi ? (PK.chosen.length ? (PK.mode === 'pair' ? 'De ' + PK.chosen.join(' vers ') : PK.chosen.join(', ')) : (PK.mode === 'pair' ? 'Touchez le point de départ, puis le point d’arrivée.' : 'Touchez les points dans l’ordre.')) : '';
    $('pkOk').style.display = PK.mode === 'seq' ? '' : 'none';
    $('pkUndo').style.display = multi && PK.chosen.length ? '' : 'none';
  }
  function openPicker(input, mode, title) {
    PK.input = input; PK.mode = mode; PK.chosen = [];
    if (mode === 'seq') PK.chosen = Cogo.parseSequence(input.value);
    $('pkTitle').textContent = title || (mode === 'code' ? 'Choisir un code' : mode === 'pair' ? 'Choisir deux points' : mode === 'seq' ? 'Choisir les points' : 'Choisir un point');
    var sel = $('pkLeve'), prev = sel.value; sel.innerHTML = '';
    leveList().forEach(function (o) { var x = document.createElement('option'); x.value = o[0]; x.textContent = o[1]; sel.appendChild(x); });
    sel.value = prev && [].some.call(sel.options, function (o) { return o.value === prev; }) ? prev : '*cur';
    // Levé en cours vide : montrer tous les levés
    $('pkQ').value = '';
    if (mode !== 'code' && sel.value === '*cur' && !pkPoints().list.length) sel.value = '*all';
    $('pk').hidden = false; renderPicker();
  }
  function closePicker() { $('pk').hidden = true; PK.input = null; }
  function finish(val) {
    var inp = PK.input; closePicker(); if (!inp) return;
    inp.value = val; inp.dispatchEvent(new Event('input')); inp.dispatchEvent(new Event('change'));
  }
  function pickPoint(name) {
    if (PK.mode === 'one') { finish(name); return; }
    if (PK.mode === 'pair') {
      PK.chosen.push(name);
      if (PK.chosen.length === 2) { if (PK.chosen[0] === PK.chosen[1]) { PK.chosen.pop(); return renderPicker(); } finish(PK.chosen.join('-')); return; }
      return renderPicker();
    }
    PK.chosen.push(name); renderPicker();
  }
  $('pkClose').addEventListener('click', closePicker);
  $('pkOk').addEventListener('click', function () { finish(PK.chosen.join(', ')); });
  $('pkUndo').addEventListener('click', function () { PK.chosen.pop(); renderPicker(); });
  $('pkKbd').addEventListener('click', function () { var inp = PK.input; closePicker(); if (inp) { PK.skip[inp.id] = true; inp.focus(); } });
  $('pkQ').addEventListener('input', renderPicker);
  $('pkLeve').addEventListener('change', renderPicker);
  $('pkSort').addEventListener('change', function () { S.pkSort = this.value; Ctx.save(); renderPicker(); });

  /* Ajoute un bouton « Points » à un champ ; un champ de point vide ouvre le sélecteur dès qu'on le touche. */
  function attach(id, mode, label, auto) {
    var inp = $(id), wrap = inp.parentNode.classList && inp.parentNode.classList.contains('inline') ? inp.parentNode : null;
    if (!wrap) {
      wrap = document.createElement('div'); wrap.className = 'inline'; wrap.style.marginTop = '4px';
      inp.parentNode.insertBefore(wrap, inp); wrap.appendChild(inp); inp.style.marginTop = '0';
    }
    var b = document.createElement('button'); b.type = 'button'; b.className = 'btn pkbtn'; b.textContent = label || 'Points';
    b.title = mode === 'pair' ? 'Calculer à partir de deux points (4-7)' : mode === 'code' ? 'Choisir dans la liste des codes' : 'Choisir dans le levé';
    wrap.insertBefore(b, inp.nextSibling);
    b.addEventListener('click', function () { openPicker(inp, mode); });
    if (auto) inp.addEventListener('focus', function () {
      if (PK.skip[id]) { PK.skip[id] = false; return; }
      if (!inp.value.trim() && $('pk').hidden) { inp.blur(); openPicker(inp, mode); }
    });
  }
  ['c3P1', 'c3P2', 'c3P3', 'c3P4', 'c4A', 'c4B', 'c2A', 'c2B'].forEach(function (id) { attach(id, 'one', 'Points', true); });
  ['c4Seq', 'c7Seq', 'c2Seq'].forEach(function (id) { attach(id, 'seq', 'Points', id !== 'c2Seq'); });
  ['c3Az1', 'c3Az2', 'c3D1', 'c3D2'].forEach(function (id) { attach(id, 'pair', '2 pts', false); });
  ['c1Code', 'c3Code', 'c2Code'].forEach(function (id) { attach(id, 'code', 'Codes', false); });

  window.CogoUi = { parsePointFile: parsePointFile };
})();
