// Parses every .jsx as ES3 (what Premiere's ExtendScript understands) and every panel .js as ES2021.
// ES3 also forbids reserved words as object keys or after a dot (e.g. {in: 1} or a.class), which acorn allows, so we check that too.
const acorn = require('acorn'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const RESERVED = new Set(('break case catch continue default delete do else finally for function if in instanceof new return switch this throw try typeof var void while with ' +
  'class const enum export extends import super null true false').split(' '));
let bad = 0;

function walkAst(node, fn) {
  if (!node || typeof node.type !== 'string') return;
  fn(node);
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (Array.isArray(v)) v.forEach(c => c && typeof c.type === 'string' && walkAst(c, fn));
    else if (v && typeof v.type === 'string') walkAst(v, fn);
  }
}

function check(file, ecmaVersion) {
  const src = fs.readFileSync(file, 'utf8');
  let ast;
  try { ast = acorn.parse(src, { ecmaVersion, allowReserved: true, locations: true }); }
  catch (e) { bad++; console.log(`✗ ${path.relative(root, file)}:${e.loc ? e.loc.line + ':' + e.loc.column : ''} ${e.message}`); return; }
  if (ecmaVersion !== 3) return;
  walkAst(ast, n => {
    let name = null;
    if (n.type === 'Property' && !n.computed && n.key.type === 'Identifier') name = n.key.name;
    if (n.type === 'MemberExpression' && !n.computed && n.property.type === 'Identifier') name = n.property.name;
    if (name && RESERVED.has(name)) { bad++; console.log(`✗ ${path.relative(root, file)}:${n.loc.start.line} reserved word "${name}" used as a property name (quote it for ExtendScript)`); }
    if (n.type === 'VariableDeclaration' && n.kind !== 'var') { bad++; console.log(`✗ ${path.relative(root, file)}:${n.loc.start.line} "${n.kind}" is not ES3`); }
  });
}
function walk(dir, ext, v) { for (const f of fs.readdirSync(dir)) { const p = path.join(dir, f); if (fs.statSync(p).isDirectory()) walk(p, ext, v); else if (p.endsWith(ext)) check(p, v); } }
walk(path.join(root, 'jsx'), '.jsx', 3);
walk(path.join(root, 'js'), '.js', 2021);
console.log(bad ? `${bad} problem(s)` : 'All scripts parse.');
process.exit(bad ? 1 : 0);
