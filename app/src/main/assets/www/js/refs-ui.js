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
  if (S.rfOrder) $('rfOrder').value = S.rfOrder;
  $('rfOrder').addEventListener('change', function () { S.rfOrder = this.value; Ctx.save(); });
  $('rfFile').addEventListener('change', function () {
    var file = this.files && this.files[0]; this.value = ''; if (!file) return;
    var fr = new FileReader();
    fr.onload = function () {
      try {
        if (!Ctx.leve()) throw new Error('aucun travail ouvert');
        var list = window.CogoUi.parsePointFile(fr.result, $('rfOrder').value); if (!list.length) throw new Error('aucun point lisible');
        var id = R.addFile(file.name, list); R.ensure(id);
        msg('rfMsg', list.length + ' point(s) de ' + file.name + ' liés : « point@' + R.source(id).alias + ' ».', 'ok');
      } catch (e) { msg('rfMsg', 'Fichier refusé : ' + e.message + '.', 'bad'); }
    };
    fr.readAsText(file);
  });

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
