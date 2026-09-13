// 语法与模块路径检查（不执行代码）
// 用法: node --experimental-vm-modules z-TempForAI/check_syntax.mjs src

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(process.argv[2] || 'src');
const files = [];

(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      walk(p);
    } else if (e.name.endsWith('.js') || e.name.endsWith('.mjs')) {
      files.push(p);
    }
  }
})(root);

let syntaxFail = 0;
let importFail = 0;

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const rel = path.relative(path.dirname(root), f);

  try {
    new vm.SourceTextModule(src, { identifier: f });
    console.log('OK   ' + rel);
  } catch (err) {
    syntaxFail++;
    console.log('FAIL ' + rel + '\n     ' + err.message);
  }

  const re = /(?:^|\n)\s*(?:import|export)[^\n]*?from\s+['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src))) {
    const spec = m[1];
    if (!spec.startsWith('.')) continue;
    const target = path.resolve(path.dirname(f), spec);
    if (!fs.existsSync(target)) {
      importFail++;
      console.log('     MISSING IMPORT -> ' + spec + '  (in ' + rel + ')');
    }
  }
}

console.log('\nfiles=' + files.length + '  syntaxFail=' + syntaxFail + '  missingImport=' + importFail);
process.exit(syntaxFail + importFail > 0 ? 1 : 0);
