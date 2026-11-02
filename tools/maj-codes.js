// Met à jour www/js/codes.js à partir de la version publiée de « Recherche de codes » (dépôt public Arpent-Nord/APP-PCodes).
// Usage : node tools/maj-codes.js chemin/vers/APP-PCodes/index.html
// Seules des données publiques sont copiées : codes (Pcodes), codes de contrôle et commandes de calcul, natures (NAT), types de levé.
'use strict';
const fs = require('fs'), path = require('path');
const src = process.argv[2];
if (!src) { console.error('Usage : node tools/maj-codes.js APP-PCodes/index.html'); process.exit(1); }
const html = fs.readFileSync(src, 'utf8');
const json = (re, what) => { const m = re.exec(html); if (!m) throw new Error(what + ' introuvable dans ' + src); return JSON.parse(m[1]); };
const codes = json(/const CODES\s*=\s*(\[.*?\]);/s, 'CODES').map((c) => ({ code: String(c.code), aph: c.aph || '', description: c.description || '', categorie: c.categorie || '' }));
const aide = json(/const AIDE\s*=\s*(\[.*?\]);/s, 'AIDE').map((a) => ({ code: a.code, description: a.description, categorie: a.categorie }));
const decode = (t) => t.replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
// Tableau HTML qui suit un titre <h3> : lignes <tr><td><code>X</code></td><td>Description</td></tr>
function table(title, codeRe) {
  const i = html.indexOf('<h3>' + title + '</h3>');
  if (i < 0) throw new Error('Tableau « ' + title + ' » introuvable');
  const t = html.slice(i, html.indexOf('</table>', i));
  const out = []; const re = /<tr><td><code>([^<]+)<\/code><\/td><td>([^<]*)<\/td><\/tr>/g; let m;
  while ((m = re.exec(t))) if (codeRe.test(m[1])) out.push({ code: m[1], description: decode(m[2]) });
  return out;
}
const types = table('Type de levé (#)', /^[1-9]$/);
const nat = table('Natures (NAT)', /^[A-Z]{3}$/);
if (codes.length < 100 || nat.length < 10 || types.length < 3) throw new Error(`Extraction incomplète : ${codes.length} codes, ${nat.length} natures, ${types.length} types`);
const out = `/* Collecte GNSS — Arpent-Nord
 * codes.js : GÉNÉRÉ par tools/maj-codes.js à partir de « Recherche de codes » (dépôt public Arpent-Nord/APP-PCodes).
 * Ne pas modifier à la main. Données publiques seulement. Extrait le ${new Date().toISOString().slice(0, 10)}.
 * ${codes.length} codes, ${aide.length} codes de contrôle / commandes, ${nat.length} natures, ${types.length} types de levé.
 */
(function (root) {
  'use strict';
  var DATA = ${JSON.stringify({ codes, aide, nat, types })};
  root.CODES_DATA = DATA;
  if (typeof module !== 'undefined' && module.exports) module.exports = DATA;
})(typeof window !== 'undefined' ? window : globalThis);
`;
const dest = path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'www', 'js', 'codes-data.js');
fs.writeFileSync(dest, out);
console.log(`codes-data.js : ${codes.length} codes, ${aide.length} contrôles/commandes, ${nat.length} natures, ${types.length} types.`);
