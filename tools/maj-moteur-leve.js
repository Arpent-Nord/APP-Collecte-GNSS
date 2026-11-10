// Met à jour www/js/moteur-leve.js à partir de « Validation de levé » (dépôt public Arpent-Nord/validation-leve, index.html).
// Usage : node tools/maj-moteur-leve.js chemin/vers/validation-leve/index.html
// But : le terrain (Collecte GNSS) et le bureau (Validation de levé) lisent les strings, dessinent les lignes,
// détectent les anomalies et calculent les commandes 2P…RECT avec EXACTEMENT le même code.
'use strict';
const fs = require('fs'), path = require('path');
const src = process.argv[2];
if (!src) { console.error('Usage : node tools/maj-moteur-leve.js validation-leve/index.html'); process.exit(1); }
const html = fs.readFileSync(src, 'utf8');
const FUNCS = ['buildCodes', 'splitCmd', 'parseDesc', 'formatDesc', 'addLinkDesc', 'patchLinkDesc', 'calcCmd', 'circle3', 'arc3pts',
  'catmull', 'segInter', 'analyze', 'lineVerts', 'rectFourth', 'swapPoints', 'aci'];
const CONSTS = ['LIAISON', 'CMD_NEED', 'CMD_RE'];
function grabFunction(name) {
  const i = html.indexOf('\nfunction ' + name + '(');
  if (i < 0) throw new Error('fonction ' + name + ' introuvable');
  let k = html.indexOf('{', i), depth = 0, inStr = null, esc = false, inRe = false;
  for (let j = k; j < html.length; j++) {
    const c = html[j];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === inStr) inStr = null; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '/' && html[j + 1] === '/') { j = html.indexOf('\n', j); continue; }
    if (c === '/' && html[j + 1] === '*') { j = html.indexOf('*/', j) + 1; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return html.slice(i + 1, j + 1); }
  }
  throw new Error('fin de ' + name + ' introuvable');
}
function grabConst(name) {
  const m = new RegExp('\\nconst ' + name + '=.*').exec(html);
  if (!m) throw new Error('constante ' + name + ' introuvable');
  return m[0].slice(1);
}
const dictLine = /\nconst DICT=(\{.*\});\s*\n/.exec(html);
if (!dictLine) throw new Error('DICT introuvable');
const DICT = JSON.parse(dictLine[1]);
// Couleurs : seulement les calques utilisés par les codes (le reste ne sert pas au croquis)
const layers = {};
DICT.codes.forEach((c) => { const L = c[4]; const k = 'C-' + L.slice(2); layers[L] = DICT.layers[L] != null ? DICT.layers[L] : (DICT.layers[k] != null ? DICT.layers[k] : 7); });
const ver = (/<title>[^<]*<\/title>/.exec(html) || [''])[0];
const vtag = (/v\d+\.\d+/.exec(html) || ['?'])[0];
const body = [
  CONSTS.map(grabConst).join('\n'),
  FUNCS.map(grabFunction).join('\n')
].join('\n');
if (/\?\?|\?\.[A-Za-z_$(\[]/.test(body)) console.warn('Attention : opérateurs ?? ou ?. présents (WebView récente requise).');
const out = `/* Collecte GNSS — Arpent-Nord
 * moteur-leve.js : GÉNÉRÉ par tools/maj-moteur-leve.js à partir de « Validation de levé » (Arpent-Nord/validation-leve, ${vtag}).
 * Ne pas modifier à la main : corriger dans Validation de levé, puis régénérer.
 * Extrait le ${new Date().toISOString().slice(0, 10)} : ${FUNCS.length} fonctions (lecture des descriptions « Pcode String.Contrôle »,
 * analyse des strings et anomalies, tracé des lignes, courbes et cercles, commandes 2P à RECT) et couleurs des calques.
 */
(function (root) {
  'use strict';
  var DICT = ${JSON.stringify({ codes: DICT.codes.map((c) => [c[0], c[4]]), layers })};
${body}
  var CODES = buildCodes({ codes: DICT.codes.map(function (c) { return [c[0], '', '', '', c[1], 'g']; }) });
  function layerOf(pc) { var c = CODES.get(String(pc)); return c ? c.layer : 'C-TOP-DIVERS'; }
  function colorOf(pc) { var L = layerOf(pc); var i = DICT.layers[L]; return aci(i == null ? 7 : i); }
  var api = { parseDesc: parseDesc, formatDesc: formatDesc, splitCmd: splitCmd, addLinkDesc: addLinkDesc, patchLinkDesc: patchLinkDesc,
    calcCmd: calcCmd, CMD_NEED: CMD_NEED, analyze: analyze, lineVerts: lineVerts, rectFourth: rectFourth, swapPoints: swapPoints,
    circle3: circle3, aci: aci, CODES: CODES, layerOf: layerOf, colorOf: colorOf, VERSION: ${JSON.stringify(vtag)} };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MoteurLeve = api;
})(typeof window !== 'undefined' ? window : globalThis);
`;
const dest = path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'www', 'js', 'moteur-leve.js');
fs.writeFileSync(dest, out);
console.log('moteur-leve.js : ' + FUNCS.length + ' fonctions, ' + DICT.codes.length + ' codes, ' + Object.keys(layers).length + ' calques (' + vtag + ').');
