// 打包：把 src/ 下的 ES Module 合成一个自包含的 index.html，双击即可打开。
//
// 两个 HTML 的分工：
//   index-dev.html  开发版外壳，外链 styles.css 与 src/main.js（拆模块，需服务器）
//   index.html      打包版，本脚本的产物（内联全部 JS/CSS，可直接双击）
//
// 为什么需要打包：浏览器把 file:// 下的 module 脚本当作跨源请求（origin 为 "null"），
// 会被 CORS 直接拦掉，页面就卡在启动界面。classic 脚本没有这个限制，
// 因此把模块内联成一段普通脚本即可绕开，同时保留模块化的源码结构。
//
// 用法: node tools/build_standalone.mjs
//
// 产物只依赖源码，不含任何构建期状态，可随时重新生成。

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const ENTRY = resolve(ROOT, 'src/main.js');
const TEMPLATE = resolve(ROOT, 'index-dev.html');
const OUT = resolve(ROOT, 'index.html');

const idOf = (abs) => relative(ROOT, abs).split(sep).join('/');

// 本项目的导入导出形式很规整：只有 `import { a, b } from './x.js'`
// 与 `export const|function|class NAME`，没有别名、命名空间、默认导出。
const IMPORT_RE = /^[ \t]*import\s*\{([\s\S]*?)\}\s*from\s*(['"])([^'"]+)\2[ \t]*;?/gm;
const EXPORT_RE = /^[ \t]*export\s+(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm;

function parseModule(abs) {
  const src = readFileSync(abs, 'utf8');
  const deps = [];
  const params = [];
  const slots = [];      // 每个参数位对应 [依赖模块, 导出名]

  const body = src.replace(IMPORT_RE, (_m, names, _q, spec) => {
    const dep = idOf(resolve(dirname(abs), spec));
    deps.push(dep);
    for (const n of names.split(',')) {
      const t = n.trim();
      if (!t) continue;
      params.push(t);
      slots.push([dep, t]);
    }
    return '';
  });

  const exports = [];
  let m;
  EXPORT_RE.lastIndex = 0;
  while ((m = EXPORT_RE.exec(body))) exports.push(m[1]);

  const stripped = body.replace(/^[ \t]*export\s+/gm, '');
  const leftover = stripped.match(/^[ \t]*(?:export|import)\s/m);
  if (leftover) throw new Error(`${idOf(abs)} 里还有未处理的 ${leftover[0].trim()} 语句`);

  return { id: idOf(abs), deps, params, slots, exports, body: stripped };
}

// 深度优先，依赖先出；顺带检测循环依赖
const mods = new Map();
const order = [];

function visit(abs, stack) {
  const id = idOf(abs);
  if (mods.has(id)) return;
  if (stack.includes(id)) throw new Error(`存在循环依赖: ${[...stack, id].join(' -> ')}`);
  if (!existsSync(abs)) throw new Error(`找不到模块文件: ${abs}`);

  const mod = parseModule(abs);
  mods.set(id, mod);
  for (const d of mod.deps) visit(resolve(ROOT, d), [...stack, id]);
  order.push(id);
}

visit(ENTRY, []);

// 构建期就校验每个 import 的名字确实被导出，别等运行时才炸
for (const mod of mods.values()) {
  for (const [dep, name] of mod.slots) {
    const target = mods.get(dep);
    if (!target) throw new Error(`${mod.id} 依赖的 ${dep} 未被收集`);
    if (!target.exports.includes(name)) {
      throw new Error(`${mod.id} 从 ${dep} 导入了 ${name}，但该模块没有导出它`);
    }
  }
}

const emit = (mod) => {
  const ret = mod.exports.map((n) => `${n}: ${n}`).join(', ');
  return `__def(${JSON.stringify(mod.id)}, ${JSON.stringify(mod.slots)}, ` +
    `function (${mod.params.join(', ')}) {\n'use strict';\n` +
    `${mod.body}\nreturn { ${ret} };\n});`;
};

const RUNTIME = `(function () {
'use strict';
var __defs = {}, __cache = {};
function __def(id, slots, factory) { __defs[id] = { slots: slots, factory: factory }; }
function __req(id) {
  if (__cache[id]) return __cache[id];
  var d = __defs[id];
  if (!d) throw new Error('模块未找到: ' + id);
  return (__cache[id] = d.factory.apply(null, d.slots.map(__arg)));
}
function __arg(slot) {
  var m = __req(slot[0]);
  if (!(slot[1] in m)) throw new Error('模块 ' + slot[0] + ' 没有导出 ' + slot[1]);
  return m[slot[1]];
}`;

const bundle = [
  '/* 由 tools/build_standalone.mjs 生成，请勿直接编辑；改 src/ 后重新运行即可 */',
  RUNTIME,
  ...order.map((id) => emit(mods.get(id))),
  `__req(${JSON.stringify(idOf(ENTRY))});`,
  '})();',
].join('\n');

// ---- 套用开发版外壳（保持它作为页面结构的唯一来源）----
let html = readFileSync(TEMPLATE, 'utf8');

const LINK = '<link rel="stylesheet" href="styles.css">';
if (!html.includes(LINK)) throw new Error('index-dev.html 中找不到外链样式，模板已改动');
const css = readFileSync(resolve(ROOT, 'styles.css'), 'utf8');
html = html.replace(LINK, `<style>\n${css}\n</style>`);

const MODULE = '<script type="module" src="src/main.js"></script>';
if (!html.includes(MODULE)) throw new Error('index-dev.html 中找不到模块入口，模板已改动');
html = html.replace(MODULE, `<script>\n${bundle.replace(/<\/script/gi, '<\\/script')}\n</script>`);

// 只检查真正的「外链引用」，不扫普通文本（注释里提到文件名是允许的）
const leftover = [/<link[^>]*href=["'][^"']+["']/gi, /<script[^>]*\ssrc=["'][^"']+["']/gi]
  .flatMap((re) => [...html.matchAll(re)].map((m) => m[0]));
if (leftover.length) {
  throw new Error(`产物里仍有外链引用，未完全内联:\n  ${leftover.join('\n  ')}`);
}

// 产物会覆盖 index.html：把模板顶部那段「开发版」说明换成打包版说明，
// 免得产物里写着「请用 index.html」而它自己就是 index.html
const BANNER = /^<!DOCTYPE html>\s*<!--[\s\S]*?-->/;
if (!BANNER.test(html)) throw new Error('模板顶部注释已被改动，请同步更新 build_standalone.mjs');
html = html.replace(BANNER,
  '<!DOCTYPE html>\n<!-- 打包版：由 tools/build_standalone.mjs 从 index-dev.html 生成，请勿直接编辑。\n' +
  '     已内联全部 JS 与 CSS，双击本文件即可离线运行，不需要服务器。\n' +
  '     改代码请改 src/ 或 index-dev.html，然后重新运行该脚本。 -->');

writeFileSync(OUT, html, 'utf8');

console.log(`模板: ${relative(ROOT, TEMPLATE)}`);
console.log(`入口: ${idOf(ENTRY)}`);
console.log(`模块: ${order.length} 个（依赖优先排序）`);
console.log(`产物: ${idOf(OUT)}  ${(Buffer.byteLength(html, 'utf8') / 1024).toFixed(1)} KB`);
console.log('双击 index.html 即可离线运行。');
