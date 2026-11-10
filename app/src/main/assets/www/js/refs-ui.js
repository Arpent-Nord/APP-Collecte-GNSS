/* Collecte GNSS — Arpent-Nord
 * refs-ui.js : écrans des références liées (onglet Travail), du contrôle (onglet Mesure) et export des contrôles.
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var Ctx = window.AppCtx, R = window.Refs;
  if (!Ctx || !R || !$('rfCard')) return;
  var esc = Ctx.esc, S = Ctx.settings;
  var STATES = ['Caché', 'Visible', 'Utilisable'];
  function msg(id, t, cls) { var m = $(id); m.style.display = t ? '' : 'none'; m.className = 'msg' + (cls ? ' ' + cls : ''); m.textContent = t || ''; }
  function f3(v) { return v === null || v === undefined || isNaN(v) ? '—' : (+v).toFixed(3); }

  // ---------- Onglet Travail : références liées ----------
  function renderCard() {
    var job = Ctx.leve(), box = $('rfList');
    if (!job) { box.innerHTML = '<p class="hint">Ouvrir un travail pour lui lier des références.</p>'; $('rfJob').innerHTML = ''; return; }
    var list = R.linked(job, 0);
    box.innerHTML = list.length ? '' : '<p class="hint">Aucune référence liée à ce travail.</p>';
    list.forEach(function (s) {
      var n = R.pointsOf(s.id).length, row = document.createElement('div'); row.className = 'rfrow';
      row.innerHTML = '<span class="nm"><b>' + esc(s.label) + '</b><small>' + n + ' point(s) · nom « point@' + esc(s.alias) + ' »</small></span>' +
        '<button type="button" class="btn rfst s' + s.state + '">' + STATES[s.state] + '</button>' +
        '<button type="button" class="btn" title="Délier de ce travail">Délier</button>' +
        (s.kind !== 'job' ? '<button type="button" class="btn danger" title="Retirer de l’appareil">Retirer</button>' : '');
      var b = row.querySelectorAll('button');
      b[0].addEventListener('click', function () { R.setState(s.id, (s.state + 1) % 3); });
      b[1].addEventListener('click', function () { R.unlink(s.id); });
      if (b[2]) b[2].addEventListener('click', function () {
        if (confirm('Retirer « ' + s.name + ' » de l’appareil ? Les travaux qui le liaient ne le verront plus.')) R.removeFile(s.id);
      });
      box.appendChild(row);
    });
    var L = R.links(job), sel = $('rfJob'); sel.innerHTML = '';
    var o0 = document.createElement('option'); o0.value = ''; o0.textContent = '— Travail ou fichier de l’appareil —'; sel.appendChild(o0);
    Ctx.allJobs().forEach(function (j) {
      if (j.name === job || L[R.jobId(j.name)] !== undefined) return;
      var o = document.createElement('option'); o.value = R.jobId(j.name);
      o.textContent = j.name + ' · ' + (j.date ? j.date.toLocaleDateString('fr-CA') : 's. d.') + ' · ' + j.count + ' pt'; sel.appendChild(o);
    });
    R.fileList().forEach(function (f) {
      if (L[f.id] !== undefined || f.kind !== 'file') return;
      var o = document.createElement('option'); o.value = f.id; o.textContent = f.label + ' · ' + R.pointsOf(f.id).length + ' pt'; sel.appendChild(o);
    });
  }
  $('rfAddJob').addEventListener('click', function () {
    var id = $('rfJob').value;
    if (!Ctx.leve()) { msg('rfMsg', 'Ouvrir d’abord un travail.', 'warn'); return; }
    if (!id) { msg('rfMsg', 'Choisir un travail ou un fichier dans la liste.', 'warn'); return; }
    R.ensure(id); msg('rfMsg', R.source(id).label + ' lié : ses points sont utilisables sans entrer dans le levé.', 'ok');
  });
  $('rfFile').addEventListener('change', function () {
    var files = [].slice.call(this.files || []); this.value = ''; if (!files.length) return;
    previewFiles(files, {
      link: function (name, list) {
        if (!Ctx.leve()) throw new Error('aucun travail ouvert');
        var id = R.addFile(name, list); R.ensure(id);
        msg('rfMsg', list.length + ' point(s) de ' + name + ' liés : « point@' + R.source(id).alias + ' ».', 'ok');
      },
      error: function (e) { msg('rfMsg', 'Fichier refusé : ' + e.message + '.', 'bad'); }
    });
  });

  // ---------- Aperçu d'un fichier avant de le lier ou de le copier ----------
  /* Le sélecteur d'Android coupe les noms : avant toute action, on montre le fichier (taille, date, premières lignes),
   * ce qu'on en lit (points, ordre des colonnes détecté, étendue, codes) et sa distance au travail ou à la position. */
  var FP = (function () {
    var d = document.createElement('div'); d.className = 'pk fpv'; d.id = 'fpv'; d.hidden = true;
    d.innerHTML = '<div class="pkbox" role="dialog" aria-modal="true">' +
      '<div class="pkhead"><b id="fpName"></b><button class="pkx" id="fpClose" type="button" aria-label="Fermer">×</button></div>' +
      '<div class="meta" id="fpMeta"></div>' +
      '<label>Ordre des colonnes<select id="fpOrder"></select></label>' +
      '<div class="meta" id="fpStats"></div><div class="near meta" id="fpNear"></div>' +
      '<div class="scroll"><table id="fpTable"></table><div class="meta" style="margin-top:6px">Début du fichier :</div><pre id="fpRaw"></pre></div>' +
      '<div class="pkfoot"><div class="pkseq" id="fpQueue"></div>' +
      '<button class="btn" id="fpSkip" type="button">Ignorer ce fichier</button>' +
      '<button class="btn" id="fpCopy" type="button">Copier dans le levé</button>' +
      '<button class="btn primary" id="fpLink" type="button">Lier au travail</button></div></div>';
    document.body.appendChild(d);
    return d;
  })();
  /* Ordre probable d'un fichier sans en-tête : au Québec (MTM), le Nord (≈ 5 000 000) dépasse l'Est (≈ 300 000). */
  function detectOrder(text) {
    var a = window.CogoUi.parsePointFile(text, 'PNEZD');
    if (!a.length) return 'PNEZD';
    var sorted = function (v) { v = v.slice().sort(function (x, y) { return x - y; }); return v[v.length >> 1]; };
    return sorted(a.map(function (r) { return r.n; })) >= sorted(a.map(function (r) { return r.e; })) ? 'PNEZD' : 'PENZD';
  }
  function hasHeader(text) { var l = String(text).replace(/^﻿/, '').split(/\r?\n/)[0] || ''; return /(^|[,;\t])\s*(name|point|easting|northing|est|nord|x|y)\s*([,;\t]|$)/i.test(l); }
  function previewFiles(files, opt) {
    var queue = files.slice();
    function next() {
      var file = queue.shift(); if (!file) { FP.hidden = true; return; }
      var fr = new FileReader();
      fr.onload = function () { show(file, String(fr.result || '')); };
      fr.onerror = function () { opt.error && opt.error(new Error('lecture impossible')); next(); };
      fr.readAsText(file);
    }
    function show(file, text) {
      var head = hasHeader(text), auto = head ? null : detectOrder(text), list = [];
      var lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(function (l) { return l.trim(); });
      $('fpName').textContent = file.name;
      $('fpMeta').textContent = (file.size < 1024 ? file.size + ' o' : (file.size / 1024).toFixed(1) + ' ko') + ' · ' +
        (file.lastModified ? new Date(file.lastModified).toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short' }) : 'date inconnue') + ' · ' + lines.length + ' ligne(s)' +
        (head ? ' · en-tête reconnu' : '');
      var sel = $('fpOrder'); sel.innerHTML = '';
      (head ? [['HEAD', 'Selon l’en-tête du fichier']] : [['PNEZD', 'P, N, E, Z, D' + (auto === 'PNEZD' ? ' (détecté)' : '')], ['PENZD', 'P, E, N, Z, D' + (auto === 'PENZD' ? ' (détecté)' : '')]])
        .forEach(function (o) { var x = document.createElement('option'); x.value = o[0]; x.textContent = o[1]; sel.appendChild(x); });
      sel.value = head ? 'HEAD' : auto; sel.disabled = head;
      $('fpRaw').textContent = lines.slice(0, 6).join('\n') + (lines.length > 6 ? '\n…' : '');
      function parse() {
        try { list = window.CogoUi.parsePointFile(text, head ? 'PNEZD' : sel.value); } catch (e) { list = []; $('fpStats').textContent = 'Illisible : ' + e.message + '.'; }
        render();
      }
      function render() {
        var n = list.length, skip = lines.length - n - (head ? 1 : 0);
        $('fpLink').disabled = $('fpCopy').disabled = !n;
        if (!n) { $('fpStats').textContent = 'Aucun point lisible : ce n’est pas un fichier de points P,N,E,Z,D ou CSV avec en-tête.'; $('fpTable').innerHTML = ''; $('fpNear').textContent = ''; return; }
        var e0 = Infinity, e1 = -Infinity, n0 = Infinity, n1 = -Infinity, se = 0, sn = 0, codes = {}, zs = 0;
        list.forEach(function (r) {
          e0 = Math.min(e0, r.e); e1 = Math.max(e1, r.e); n0 = Math.min(n0, r.n); n1 = Math.max(n1, r.n); se += r.e; sn += r.n;
          if (r.z !== null) zs++;
          var c = String(r.d || '').trim().split(/\s+/)[0]; if (c) codes[c] = (codes[c] || 0) + 1;
        });
        var top = Object.keys(codes).sort(function (a, b) { return codes[b] - codes[a]; }).slice(0, 6);
        $('fpStats').textContent = n + ' point(s)' + (skip > 0 ? ' · ' + skip + ' ligne(s) ignorée(s)' : '') + ' · étendue ' + (e1 - e0).toFixed(1) + ' × ' + (n1 - n0).toFixed(1) + ' m' +
          ' · ' + (zs === n ? 'avec altitudes' : zs ? zs + ' avec altitude' : 'sans altitude') + (top.length ? ' · codes : ' + top.map(function (c) { return c + ' (' + codes[c] + ')'; }).join(', ') : '');
        // distance au travail (points du jour) ou à la position : est-ce le bon site, le bon système ?
        var cx = se / n, cy = sn / n, here = Ctx.here(), jp = Ctx.jobPoints().filter(function (p) { return p.est !== null && p.est !== undefined; }), ref = null, what = '';
        if (here) { ref = [here.e, here.n]; what = 'de ta position'; }
        else if (jp.length) { ref = [jp.reduce(function (s, p) { return s + p.est; }, 0) / jp.length, jp.reduce(function (s, p) { return s + p.nord; }, 0) / jp.length]; what = 'des points du travail'; }
        var nr = $('fpNear');
        if (ref) {
          var d = Math.hypot(cx - ref[0], cy - ref[1]), far = d > 5000;
          nr.className = 'near meta ' + (far ? 'warn' : 'ok');
          nr.textContent = 'Centre du fichier à ' + (d < 1000 ? d.toFixed(0) + ' m' : (d / 1000).toFixed(1) + ' km') + ' ' + what + (far ? ' : autre site, ou autre système / ordre des colonnes ?' : '.');
        } else { nr.className = 'near meta'; nr.textContent = 'Position et points du travail inconnus : distance au site non vérifiée.'; }
        var f = function (v) { return v === null || v === undefined ? '—' : v.toFixed(3); };
        $('fpTable').innerHTML = '<tr><th>Point</th><th>Est</th><th>Nord</th><th>Z</th><th>Description</th></tr>' + list.slice(0, 8).map(function (r) {
          return '<tr><td>' + esc(r.name) + '</td><td>' + f(r.e) + '</td><td>' + f(r.n) + '</td><td>' + f(r.z) + '</td><td>' + esc(r.d || '') + '</td></tr>';
        }).join('') + (n > 8 ? '<tr><td colspan="5">… ' + (n - 8) + ' autre(s)</td></tr>' : '');
      }
      sel.onchange = parse;
      $('fpQueue').textContent = queue.length ? queue.length + ' autre(s) fichier(s) ensuite' : '';
      $('fpCopy').style.display = opt.copy ? '' : 'none';
      $('fpLink').className = 'btn' + (opt.main === 'copier' ? '' : ' primary');
      $('fpCopy').className = 'btn' + (opt.main === 'copier' ? ' primary' : '');
      function act(fn) { return function () { try { fn(file.name, list); } catch (e) { opt.error && opt.error(e); } next(); }; }
      $('fpLink').onclick = act(opt.link);
      $('fpCopy').onclick = opt.copy ? act(opt.copy) : null;
      $('fpSkip').onclick = next;
      $('fpClose').onclick = function () { queue = []; FP.hidden = true; };
      FP.hidden = false; parse();
    }
    next();
  }
  window.RefsUi = { previewFiles: previewFiles, detectOrder: detectOrder };

  // ---------- Onglet Mesure : contrôle ----------
  function asTarget(name) {
    var hit = window.CogoUi.findPoint(name); if (!hit) return null;
    if (hit.linked) return hit.src;
    var p = hit.src, job = Ctx.leve();   // point du levé du jour : contrôle aussi possible
    return { nom: p.nom, q: p.nom, est: p.est, nord: p.nord, alt: p.alt === undefined ? null : p.alt, code: p.code || '', codeDesc: p.codeDesc || '', refLabel: 'Travail ' + job, refAlias: job };
  }
  function setTarget() {
    var v = $('ctlRef').value.trim();
    if (!v) { R.control.set(null); return; }
    var t = asTarget(v);
    if (!t) { R.control.set(null); msg('ctlMsg', 'Point ' + v + ' introuvable dans le travail ni dans ses références liées (bouton Points).', 'warn'); return; }
    R.control.set(t);
  }
  function renderCtl() {
    var t = R.control.target(); $('ctlCard').classList.toggle('on', !!t);
    if (t) msg('ctlMsg', 'Prochaine mesure = contrôle sur ' + t.q + (t.code ? ' (' + t.code + (t.codeDesc ? ' · ' + t.codeDesc : '') + ')' : '') +
      ' · E ' + f3(t.est) + ' N ' + f3(t.nord) + ' Z ' + f3(t.alt) + '. ' + ($('ctlKeep').checked ? 'La mesure sera aussi gardée comme point du levé.' : 'Rien n’entre au levé : seuls les écarts sont enregistrés.'), '');
    renderExport();
  }
  $('ctlPick').addEventListener('click', function () { window.CogoUi.openPicker($('ctlRef'), 'one', 'Point de contrôle'); });
  $('ctlRef').addEventListener('change', setTarget);
  $('ctlClear').addEventListener('click', function () { $('ctlRef').value = ''; R.control.set(null); msg('ctlMsg', ''); });
  $('ctlKeep').addEventListener('change', renderCtl);
  document.addEventListener('cg:control', function (e) {
    var c = e.detail;
    if (!c) { renderCtl(); return; }
    $('ctlRef').value = ''; $('ctlCard').classList.remove('on');
    var bad = c.dH > 0.05 || (c.dZ !== null && Math.abs(c.dZ) > 0.05);
    msg('ctlMsg', 'Contrôle sur ' + c.ref.nom + '@' + c.ref.alias + ' enregistré : ΔE ' + f3(c.dE) + ' · ΔN ' + f3(c.dN) + ' · ΔH ' + f3(c.dH) +
      ' · ΔZ ' + f3(c.dZ) + ' m' + (c.mes.keptAs ? ' · gardé comme point ' + c.mes.keptAs : '') + '.', bad ? 'warn' : 'ok');
    renderExport();
  });

  // ---------- Onglet Points : export des contrôles ----------
  function renderExport() { var n = Ctx.leve() ? R.control.list().length : 0, b = $('btnExportCtl'); b.style.display = n ? '' : 'none'; b.textContent = 'Exporter les contrôles (' + n + ')'; }
  $('btnExportCtl').addEventListener('click', function () {
    var job = Ctx.leve(); if (!job) return;
    Ctx.saveText(job.replace(/[^\w#-]+/g, '_') + '_CONTROLES.csv', 'text/csv', R.controlsCsv(job));
  });

  function all() { renderCard(); renderExport(); }
  var lastJob = Ctx.leve();
  document.addEventListener('cg:job', function () {
    if (Ctx.leve() !== lastJob) { lastJob = Ctx.leve(); R.control.set(null); $('ctlRef').value = ''; msg('ctlMsg', ''); }
    all();
  });
  document.addEventListener('cg:refs', all);
  document.addEventListener('cg:points', all);
  all();
})();
