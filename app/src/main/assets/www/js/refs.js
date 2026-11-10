/* Collecte GNSS — Arpent-Nord
 * refs.js : références liées. Un travail contient SES points (mesurés, calculés). Les autres travaux de l'appareil
 * et les fichiers de points (.txt, .csv) peuvent lui être liés, en lecture seule, sans jamais être copiés dans le levé :
 *   0 = caché, 1 = visible au croquis, 2 = utilisable (choix des points, calculs, contrôle, implantation).
 * Un point lié se nomme « nom@source » (ex. 631462015@261109A0051EXC63) : aucun conflit avec les numéros du jour.
 * Un contrôle sur un point lié est enregistré au travail (écarts, références du point d'origine), pas comme point.
 * Tout reste sur l'appareil.
 */
(function () {
  'use strict';
  var Ctx = window.AppCtx;
  if (!Ctx) return;
  var STORE = 'cg.refs.v1';
  function load() { try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch (e) { return {}; } }
  function store() { try { localStorage.setItem(STORE, JSON.stringify(files)); return true; } catch (e) { return false; } }
  var files = load();   // { id : { id, kind: 'file' | 'saisis', name, alias, added, points: [{ nom, est, nord, alt, code }] } }

  // ---------- Sources ----------
  function jobId(name) { return 'job:' + name; }
  /* Une source : travail de l'appareil ou fichier. */
  function source(id) {
    if (id.indexOf('job:') === 0) {
      var name = id.slice(4);
      return { id: id, kind: 'job', name: name, alias: name, label: 'Travail ' + name };
    }
    var f = files[id]; if (!f) return null;
    return { id: id, kind: f.kind, name: f.name, alias: f.alias, label: (f.kind === 'saisis' ? 'Saisis au terrain' : 'Fichier ' + f.name), added: f.added };
  }
  function bySourceAlias(alias) {
    if (Ctx.allJobs().some(function (j) { return j.name === alias; })) return source(jobId(alias));
    for (var k in files) if (files[k].alias === alias) return source(k);
    return null;
  }
  /* Points d'une source, normalisés ; chacun porte son nom qualifié (q) et sa source (ref). */
  function pointsOf(id) {
    var s = source(id); if (!s) return [];
    var raw;
    if (s.kind === 'job') {
      var seen = {}; raw = [];
      var all = Ctx.points();
      for (var i = all.length - 1; i >= 0; i--) {
        var p = all[i];
        if ((p.leve || '') !== s.name || p.del || p.est === null || p.est === undefined || seen[p.nom]) continue;
        seen[p.nom] = 1; raw.push(p);
      }
    } else raw = files[id].points;
    return raw.map(function (p) {
      return { nom: p.nom, q: p.nom + '@' + s.alias, est: p.est, nord: p.nord, alt: p.alt === undefined ? null : p.alt, code: p.code || '', codeDesc: p.codeDesc || '',
        systeme: p.systeme, type: p.type, lat: p.lat, hEll: p.hEll, ref: s.id, refLabel: s.label, refAlias: s.alias };
    });
  }

  // ---------- Liens d'un travail ----------
  function links(job) {
    job = job === undefined ? Ctx.leve() : job; if (!job) return {};
    var m = Ctx.jobMeta(job); m.refs = m.refs || {}; return m.refs;
  }
  /* Sources liées au travail, avec leur état (0, 1, 2) ; les sources disparues sont ignorées. */
  function linked(job, min) {
    var L = links(job), out = [];
    Object.keys(L).forEach(function (id) {
      var s = source(id); if (!s || L[id] < (min || 0)) return;
      s.state = L[id]; out.push(s);
    });
    return out;
  }
  function setState(id, st, job) { var L = links(job); L[id] = st; Ctx.saveJobs(); fire(); }
  function unlink(id, job) { var L = links(job); delete L[id]; Ctx.saveJobs(); fire(); }
  /* Lie une source si elle ne l'est pas ; la rend utilisable si elle l'était moins. */
  function ensure(id, job) { var L = links(job); if (!(L[id] >= 2)) { L[id] = 2; Ctx.saveJobs(); fire(); } }
  function fire() { document.dispatchEvent(new Event('cg:refs')); }

  // ---------- Fichiers ----------
  function uniqueAlias(base) {
    base = String(base || 'fichier').replace(/\.[^.]+$/, '').replace(/[@\s]+/g, '_').slice(0, 40) || 'fichier';
    var a = base, k = 2, used = {};
    Object.keys(files).forEach(function (id) { used[files[id].alias] = 1; });
    Ctx.allJobs().forEach(function (j) { used[j.name] = 1; });
    while (used[a]) a = base + '-' + (k++);
    return a;
  }
  /* Ajoute un fichier de points comme source ; list = [{ name, e, n, z, d }] (lecture de parsePointFile). */
  function addFile(name, list) {
    var id = 'f:' + Date.now().toString(36);
    files[id] = { id: id, kind: 'file', name: name, alias: uniqueAlias(name), added: new Date().toISOString(),
      points: list.map(function (r) { return { nom: r.name, est: r.e, nord: r.n, alt: r.z, code: r.d || '' }; }) };
    if (!store()) { delete files[id]; throw new Error('mémoire de l’appareil pleine : retirer d’anciens fichiers liés'); }
    return id;
  }
  /* Point inscrit au terrain (coordonnées connues) : dans la source « saisis » du travail, jamais dans le levé. */
  function addSaisi(job, pt) {
    var id = 's:' + job, f = files[id];
    if (!f) f = files[id] = { id: id, kind: 'saisis', name: 'Saisis ' + job, alias: uniqueAlias('saisis-' + job.slice(0, 6)), added: new Date().toISOString(), points: [] };
    var ex = f.points.findIndex(function (p) { return p.nom === pt.nom; });
    if (ex >= 0) f.points[ex] = pt; else f.points.push(pt);
    store(); ensure(id, job);
    return pt.nom + '@' + f.alias;
  }
  /* Retire un fichier de l'appareil (et de tous les travaux qui le liaient). */
  function removeFile(id) {
    delete files[id]; store();
    Ctx.allJobs().forEach(function (j) { var m = Ctx.jobMeta(j.name); if (m.refs && m.refs[id] !== undefined) delete m.refs[id]; });
    Ctx.saveJobs(); fire();
  }
  function fileList() { return Object.keys(files).map(function (k) { return source(k); }); }

  // ---------- Recherche ----------
  /* « nom@source » : la source nommée (liée ou non). « nom » seul : unique parmi les sources utilisables du travail.
   * Retour : { p, ambiguous: [noms qualifiés] } ou null. */
  function find(name, job) {
    name = String(name || '').trim(); if (!name) return null;
    var at = name.lastIndexOf('@');
    if (at > 0) {
      var s = bySourceAlias(name.slice(at + 1)), nm = name.slice(0, at);
      if (!s) return null;
      var hit = pointsOf(s.id).filter(function (p) { return p.nom === nm; })[0];
      return hit ? { p: hit } : null;
    }
    var found = [];
    linked(job, 2).forEach(function (s) { pointsOf(s.id).forEach(function (p) { if (p.nom === name) found.push(p); }); });
    if (found.length === 1) return { p: found[0] };
    if (found.length > 1) return { p: null, ambiguous: found.map(function (p) { return p.q; }) };
    return null;
  }
  /* Points visibles au croquis (état ≥ 1) du travail en cours. */
  function visible(job) {
    var out = [];
    linked(job, 1).forEach(function (s) { pointsOf(s.id).forEach(function (p) { out.push(p); }); });
    return out;
  }

  // ---------- Contrôle ----------
  var target = null;   // point lié visé (normalisé) ou null
  var control = {
    active: function () { return !!target; },
    target: function () { return target; },
    set: function (p) { target = p || null; document.dispatchEvent(new Event('cg:control')); },
    /* Enregistre le contrôle d'une mesure r (résultat de la moyenne) ; retour { keep, note }. */
    record: function (r, job) {
      var t = target, keep = !!(document.getElementById('ctlKeep') || {}).checked;
      var dE = r.est - t.est, dN = r.nord - t.nord, dZ = t.alt === null || r.alt === null || r.alt === undefined ? null : r.alt - t.alt;
      var c = {
        t: new Date().toISOString(), job: job,
        ref: { source: t.refLabel, alias: t.refAlias, nom: t.nom, code: t.code, codeDesc: t.codeDesc, est: t.est, nord: t.nord, alt: t.alt },
        mes: { est: r.est, nord: r.nord, alt: r.alt, sigmaH: r.sigmaH, sigmaV: r.sigmaV, n: r.n, qualite: r.quality, ok: r.ok, debut: r.start, fin: r.end,
          recepteur: '', pole: r.pole, keptAs: keep ? Ctx.pointName() : null },
        dE: dE, dN: dN, dH: Math.hypot(dE, dN), dZ: dZ
      };
      var m = Ctx.jobMeta(job); m.controles = m.controles || []; m.controles.push(c);
      m.journal = m.journal || []; m.journal.push({ t: new Date().toLocaleString('fr-CA'), why: 'Contrôle sur ' + t.q + ' : ΔH ' + c.dH.toFixed(3) + ' m' + (dZ === null ? '' : ', ΔZ ' + dZ.toFixed(3) + ' m') });
      Ctx.saveJobs();
      target = null;
      document.dispatchEvent(new CustomEvent('cg:control', { detail: c }));
      return { keep: keep, note: 'Contrôle sur ' + t.q + ' (ΔH ' + c.dH.toFixed(3) + (dZ === null ? '' : ', ΔZ ' + dZ.toFixed(3)) + ')' };
    },
    list: function (job) { var m = Ctx.jobMeta(job === undefined ? Ctx.leve() : job); return (m && m.controles) || []; }
  };
  /* Rapport CSV des contrôles du travail. */
  function controlsCsv(job) {
    var f = function (v) { return v === null || v === undefined || isNaN(v) ? '' : (+v).toFixed(3); };
    var q = function (v) { v = String(v === null || v === undefined ? '' : v); return /[",;\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var rows = [['Date', 'Travail', 'Source', 'Point_reference', 'Description', 'E_ref', 'N_ref', 'Z_ref', 'E_mes', 'N_mes', 'Z_mes', 'dE', 'dN', 'dH', 'dZ', 'Sigma_H', 'Sigma_V', 'Epoques', 'Point_garde'].join(',')];
    control.list(job).forEach(function (c) {
      rows.push([c.t, c.job, c.ref.source, c.ref.nom, (c.ref.code + (c.ref.codeDesc ? ' ' + c.ref.codeDesc : '')).trim(), f(c.ref.est), f(c.ref.nord), f(c.ref.alt),
        f(c.mes.est), f(c.mes.nord), f(c.mes.alt), f(c.dE), f(c.dN), f(c.dH), f(c.dZ), f(c.mes.sigmaH), f(c.mes.sigmaV), c.mes.n || '', c.mes.keptAs || ''].map(q).join(','));
    });
    return rows.join('\r\n') + '\r\n';
  }

  window.Refs = {
    source: source, jobId: jobId, pointsOf: pointsOf, links: links, linked: linked, setState: setState, unlink: unlink, ensure: ensure,
    addFile: addFile, addSaisi: addSaisi, removeFile: removeFile, fileList: fileList, find: find, visible: visible,
    control: control, controlsCsv: controlsCsv
  };
})();
