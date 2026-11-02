/* Collecte GNSS — Arpent-Nord
 * codes.js : codes de points (Pcodes), description « Pcode String.Contrôle », nom du levé (AAMMJJSECT#NATSS)
 * et numéro de point (AJJJSS001), selon NDA-001 (sections 8, 10.2 et 10.3).
 * Les listes publiques viennent de codes-data.js ; reference.json (sur l'appareil) peut remplacer les natures
 * et fournir les codes d'arpenteurs.
 */
(function (root) {
  'use strict';
  var DATA = root.CODES_DATA || (typeof require !== 'undefined' ? require('./codes-data.js') : { codes: [], aide: [], nat: [], types: [] });

  var state = { codes: DATA.codes, aide: DATA.aide, nat: DATA.nat, types: DATA.types, arpenteurs: [], refVersion: null };
  var byCodeIdx = {};
  function index() { byCodeIdx = {}; state.codes.forEach(function (c) { byCodeIdx[c.code] = c; }); }
  index();

  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function num(c) { var n = parseInt(c.code, 10); return isNaN(n) ? 999999999 : n; }

  /* Recherche comme « Recherche de codes » : chiffres = début du numéro ; lettres = abréviation puis mots. */
  function search(q, limit) {
    var raw = String(q || '').trim(), qq = norm(raw);
    if (!qq) return [];
    var terms = qq.split(/\s+/).filter(Boolean), numeric = /^\d+$/.test(qq);
    var list = state.codes.filter(function (c) {
      var hay = norm(c.code + ' ' + c.aph + ' ' + c.description + ' ' + c.categorie);
      return terms.every(function (t) { return hay.indexOf(t) >= 0; });
    });
    function aphRank(c) { var a = norm(c.aph); if (!a || !/^[a-z]+$/.test(qq)) return 2; return a === qq ? 0 : (a.indexOf(qq) === 0 ? 1 : 2); }
    list.sort(function (a, b) {
      if (numeric) {
        var ex = (a.code === qq ? 0 : 1) - (b.code === qq ? 0 : 1); if (ex) return ex;
        var as = a.code.indexOf(qq) === 0 ? 0 : 1, bs = b.code.indexOf(qq) === 0 ? 0 : 1; if (as !== bs) return as - bs;
      } else {
        var ar = aphRank(a), br = aphRank(b); if (ar !== br) return ar - br;
      }
      return num(a) - num(b);
    });
    return limit ? list.slice(0, limit) : list;
  }
  function byCode(code) { return byCodeIdx[String(code)] || null; }

  /* Codes de contrôle (string Leica CS20) et commandes de calcul. */
  var CONTROLS = [
    { v: '', label: 'Aucun (point de la ligne)' },
    { v: '.1', label: '.1 Début de ligne' },
    { v: '.2', label: '.2 Fermer la forme' },
    { v: '.3', label: '.3 Début de courbe' },
    { v: '.5', label: '.5 Point dans la courbe' },
    { v: '.4', label: '.4 Fin de courbe' },
    { v: '.6', label: '.6 Cercle (1er point)' },
    { v: '.7', label: '.7 Continuer la ligne' }
  ];
  function commands() { return state.aide.filter(function (a) { return a.categorie === 'COMMANDE DE CALCUL'; }); }

  /* « 526 1.1 » -> { base: '526', str: '1', ctl: '.1', extra: '' } ; « 526 1.2_2.1 » -> extra '_2.1'. */
  function parseDesc(desc) {
    var s = String(desc || '').trim(), out = { base: '', str: '', ctl: '', extra: '' };
    if (!s) return out;
    var us = s.indexOf('_'), head = us >= 0 ? s.slice(0, us) : s;
    out.extra = us >= 0 ? s.slice(us) : '';
    var parts = head.trim().split(/\s+/);
    out.base = parts[0] || '';
    if (parts[1]) {
      var m = /^(\d+)(\.[1-7])?$/.exec(parts[1]);
      if (m) { out.str = m[1]; out.ctl = m[2] || ''; }
      else out.extra = ' ' + parts.slice(1).join(' ') + out.extra;
    }
    return out;
  }
  function compose(base, str, ctl, extra) {
    base = String(base || '').trim(); str = String(str || '').trim();
    if (!base) return '';
    var s = base;
    if (str) s += ' ' + str + (ctl || '');
    return s + (extra || '');
  }

  // ---------- Dates : AAMMJJ et jour de l'année (JJJ) ----------
  function pad(n, w) { var s = String(n); while (s.length < w) s = '0' + s; return s; }
  function yymmdd(d) { return pad(d.getFullYear() % 100, 2) + pad(d.getMonth() + 1, 2) + pad(d.getDate(), 2); }
  function dayOfYear(d) { return Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(d.getFullYear(), 0, 0)) / 864e5); }

  // ---------- Nom du levé : AAMMJJSECT#NATSS (16 caractères) ----------
  function leveName(p) {
    return yymmdd(p.date || new Date()) + String(p.sect || '').toUpperCase() + String(p.type || '') + String(p.nat || '').toUpperCase() + String(p.ss || '');
  }
  function natByCode(c) { for (var i = 0; i < state.nat.length; i++) if (state.nat[i].code === c) return state.nat[i]; return null; }
  function typeByCode(c) { for (var i = 0; i < state.types.length; i++) if (state.types[i].code === c) return state.types[i]; return null; }
  function arpenteur(ss) {
    for (var i = 0; i < state.arpenteurs.length; i++) if (pad(state.arpenteurs[i].ss, 2) === pad(ss, 2)) return state.arpenteurs[i];
    return null;
  }
  /* Vérifie un nom de levé. Retour : { ok, errors: [], parts } */
  function validateLeve(name, ss) {
    var s = String(name || '').trim().toUpperCase(), errors = [];
    var m = /^(\d{2})(\d{2})(\d{2})([A-Z0-9]{4})(\d)([A-Z]{3})(\d{2})$/.exec(s);
    if (!m) {
      errors.push(s.length !== 16 ? 'Le nom doit compter 16 caractères (' + s.length + ' inscrits)' : 'Forme attendue AAMMJJSECT#NATSS');
      return { ok: false, errors: errors, parts: null };
    }
    var parts = { date: m[1] + m[2] + m[3], sect: m[4], type: m[5], nat: m[6], ss: m[7] };
    var mo = +m[2], dd = +m[3];
    if (mo < 1 || mo > 12 || dd < 1 || dd > 31) errors.push('Date ' + parts.date + ' invalide');
    if (!typeByCode(parts.type)) errors.push('Type de levé « ' + parts.type + ' » inconnu');
    if (!natByCode(parts.nat)) errors.push('Nature « ' + parts.nat + ' » absente de la table');
    if (parts.ss === '00') errors.push('Code d\u2019arpenteur 00 invalide (01 à 99)');
    if (ss && pad(ss, 2) !== parts.ss) errors.push('Code d’arpenteur ' + parts.ss + ' différent du vôtre (' + pad(ss, 2) + ')');
    return { ok: !errors.length, errors: errors, parts: parts };
  }

  // ---------- Numéro de point : A JJJ SS 001 ----------
  /* A = dernier chiffre de l'année ; en année se terminant par 0, A est fourni (NDA-001, 10.3). */
  function pointPrefix(d, ss, aOverride) {
    var a = aOverride !== undefined && aOverride !== null && aOverride !== '' ? String(aOverride) : String(d.getFullYear() % 10);
    return a + pad(dayOfYear(d), 3) + pad(ss, 2);
  }
  /* Plages NNN de la journée (NDA-001, 10.3, exemple) : 001 à 199 levé, 200 à 400 implantation (type 2). */
  function pointRange(type) { return String(type) === '2' ? { min: 200, max: 400 } : { min: 1, max: 199 }; }
  /* Prochain numéro libre pour ce préfixe dans la plage, d'après les noms déjà utilisés.
   * Plage pleine : on continue après le plus grand numéro du jour. */
  function nextPointNumber(prefix, names, range) {
    range = range || { min: 1, max: 999 };
    var inRange = range.min - 1, all = 0, re = new RegExp('^' + prefix + '(\\d{3})$');
    (names || []).forEach(function (n) {
      var m = re.exec(String(n)); if (!m) return;
      var v = +m[1]; all = Math.max(all, v);
      if (v >= range.min && v <= range.max) inRange = Math.max(inRange, v);
    });
    var next = inRange + 1 <= range.max ? inRange + 1 : all + 1;
    return next > 999 ? null : prefix + pad(next, 3);
  }
  /* Secteur par défaut (NDA-001, 5.3, priorité 3) : 1re lettre + 3 derniers chiffres du contrat. AN-26-005 -> A005. */
  function defaultSector(contract) {
    var m = /^\s*(AN|MA)-?\d{2}-?(\d{3,4})\s*$/i.exec(String(contract || ''));
    return m ? m[1].charAt(0).toUpperCase() + m[2].slice(-3) : null;
  }

  /* Charge reference.json (Administration). Garde seulement ce qui sert au terrain. */
  function loadReference(ref) {
    if (!ref || typeof ref !== 'object') throw new Error('fichier illisible');
    if (!Array.isArray(ref.arpenteurs) && !Array.isArray(ref.nat)) throw new Error('ce n’est pas un fichier reference.json (ni « arpenteurs » ni « nat »)');
    var kept = { version: ref.version || '', arpenteurs: [], nat: [] };
    (ref.arpenteurs || []).forEach(function (a) { if (a && a.ss !== undefined) kept.arpenteurs.push({ ss: pad(a.ss, 2), nom: a.nom || '', actif: a.actif !== false }); });
    (ref.nat || []).forEach(function (n) { if (n && /^[A-Z]{3}$/.test(n.code)) kept.nat.push({ code: n.code, description: n.description || '' }); });
    return kept;
  }
  function applyReference(kept) {
    state.arpenteurs = kept && kept.arpenteurs ? kept.arpenteurs : [];
    state.nat = kept && kept.nat && kept.nat.length ? kept.nat : DATA.nat;
    state.refVersion = kept ? kept.version : null;
  }

  var api = {
    search: search, byCode: byCode, CONTROLS: CONTROLS, commands: commands, parseDesc: parseDesc, compose: compose,
    yymmdd: yymmdd, dayOfYear: dayOfYear, leveName: leveName, validateLeve: validateLeve,
    pointPrefix: pointPrefix, nextPointNumber: nextPointNumber, pointRange: pointRange, defaultSector: defaultSector,
    loadReference: loadReference, applyReference: applyReference, arpenteur: arpenteur,
    nat: function () { return state.nat; }, types: function () { return state.types; },
    arpenteurs: function () { return state.arpenteurs; }, refVersion: function () { return state.refVersion; },
    count: function () { return state.codes.length; }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Codes = api;
})(typeof window !== 'undefined' ? window : globalThis);
