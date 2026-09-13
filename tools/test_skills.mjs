// 搓招核心逻辑验证
// 用法: node tools/test_skills.mjs

import { SKILLS, BASE_MOVES, matchSkill, skillTotalDamage, skillLastHit, EVADE, GUARD, WAIT, GUARD_PARRY_WINDOW, STAM_REGEN } from '../src/data/skills.js';
import { ENEMIES } from '../src/data/enemies.js';
import { Player } from '../src/entities/Player.js';

let pass = 0;
let fail = 0;

function ok(cond, label, extra = '') {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (extra ? '  -> ' + extra : '')); }
}

console.log('=== 1. 技能序列前缀无关性 ===');
for (let i = 0; i < SKILLS.length; i++) {
  for (let j = 0; j < SKILLS.length; j++) {
    if (i === j) continue;
    const a = SKILLS[i].pattern;
    const b = SKILLS[j].pattern;
    if (a.length >= b.length) continue;
    const isPrefix = a.every((m, k) => b[k] === m);
    ok(!isPrefix, `${SKILLS[i].name}(${a.join('-')}) 不是 ${SKILLS[j].name}(${b.join('-')}) 的前缀`);
  }
}

console.log('\n=== 2. 技能序列唯一性 ===');
const seen = new Set();
for (const s of SKILLS) {
  const k = s.pattern.join('-');
  ok(!seen.has(k), `序列 ${k} 唯一`);
  seen.add(k);
}

console.log('\n=== 3. matchSkill 匹配结果 ===');
const L = 'light', H = 'heavy';
const cases = [
  { seq: [L], want: null, label: '[轻] 不成招' },
  { seq: [H], want: null, label: '[重] 不成招' },
  { seq: [L, L], want: null, label: '[轻轻] 不成招（等第三下）' },
  { seq: [H, H], want: null, label: '[重重] 不成招（等第三下）' },
  { seq: [L, H], want: 'liaoyun', label: '[轻重] -> 撩云式' },
  { seq: [H, L], want: 'jiemai', label: '[重轻] -> 截脉手' },
  { seq: [L, L, L], want: 'fengjuan', label: '[轻轻轻] -> 风卷残云' },
  { seq: [L, L, H], want: 'baihong', label: '[轻轻重] -> 白虹贯日' },
  { seq: [H, H, L], want: 'suixing', label: '[重重轻] -> 碎星击' },
  { seq: [H, H, H], want: 'tianbeng', label: '[重重重] -> 天崩地裂' },
  { seq: [L, L, L, H], want: 'baihong', label: '[轻轻轻重] 取后缀 -> 白虹贯日' },
  { seq: [H, L, H, L], want: 'jiemai', label: '[重轻重轻] 取后缀 -> 截脉手' },
  { seq: [L, L, H, H, H], want: 'tianbeng', label: '[轻轻重重重] 取后缀 -> 天崩地裂' },
  { seq: [H, H, L, L], want: null, label: '[重重轻轻] 无匹配' },
];

for (const c of cases) {
  const got = matchSkill(c.seq);
  const gotId = got ? got.id : null;
  ok(gotId === c.want, c.label, `得到 ${gotId}，期望 ${c.want}`);
}

console.log('\n=== 4. 最长匹配唯一性（决定系统无歧义的关键） ===');
const seqs = [];
for (let n = 1; n <= 6; n++) {
  for (let mask = 0; mask < (1 << n); mask++) {
    const s = [];
    for (let k = 0; k < n; k++) s.push((mask >> k) & 1 ? H : L);
    seqs.push(s);
  }
}
let tieCount = 0;
let wrongPick = 0;
for (const s of seqs) {
  const hits = SKILLS.filter((sk) => {
    if (sk.pattern.length > s.length) return false;
    const off = s.length - sk.pattern.length;
    return sk.pattern.every((m, i) => s[off + i] === m);
  });
  if (!hits.length) {
    if (matchSkill(s) !== null) { wrongPick++; console.log('    应为空匹配: [' + s.join(',') + ']'); }
    continue;
  }
  const maxLen = Math.max(...hits.map((h) => h.pattern.length));
  const longest = hits.filter((h) => h.pattern.length === maxLen);
  if (longest.length > 1) {
    tieCount++;
    console.log('    同长并列: [' + s.join(',') + '] -> ' + longest.map((h) => h.name).join(' / '));
  }
  if (matchSkill(s)?.id !== longest[0].id) {
    wrongPick++;
    console.log('    未取最长: [' + s.join(',') + '] 得到 ' + matchSkill(s)?.name + '，应为 ' + longest[0].name);
  }
}
ok(tieCount === 0, `${seqs.length} 种输入序列的最长匹配均唯一`, `并列 ${tieCount} 处`);
ok(wrongPick === 0, 'matchSkill 始终返回最长匹配', `错误 ${wrongPick} 处`);

console.log('\n=== 4b. 短技能不会被长技能的前缀吞掉 ===');
// 前缀无关的直接含义：不存在技能 A 是技能 B 的前缀
// 否则玩家按出 A 时 A 立即触发并清空时间轴，永远无法凑齐 B
let devoured = 0;
for (const a of SKILLS) {
  for (const b of SKILLS) {
    if (a === b || a.pattern.length >= b.pattern.length) continue;
    if (a.pattern.every((m, i) => b.pattern[i] === m)) {
      devoured++;
      console.log(`    ${a.name}(${a.pattern.join('-')}) 会被 ${b.name}(${b.pattern.join('-')}) 的前缀吞掉`);
    }
  }
}
ok(devoured === 0, '无技能被更长技能的前缀遮蔽', `遮蔽 ${devoured} 处`);

console.log('\n=== 5. 节奏与数值（演出 + 时间轴冷却） ===');
const lightCycle = BASE_MOVES.light.perform + BASE_MOVES.light.cd;
const heavyCycle = BASE_MOVES.heavy.perform + BASE_MOVES.heavy.cd;
const lightDps = BASE_MOVES.light.damage / lightCycle;
const heavyDps = BASE_MOVES.heavy.damage / heavyCycle;
console.log(`  基础轻击 演出${BASE_MOVES.light.perform}s + 冷却${BASE_MOVES.light.cd}s = ${lightCycle.toFixed(2)}s  DPS=${lightDps.toFixed(1)}`);
console.log(`  基础重击 演出${BASE_MOVES.heavy.perform}s + 冷却${BASE_MOVES.heavy.cd}s = ${heavyCycle.toFixed(2)}s  DPS=${heavyDps.toFixed(1)}`);
ok(BASE_MOVES.heavy.damage > BASE_MOVES.light.damage, '重击单发高于轻击');
ok(heavyDps > lightDps, '重击 DPS 高于轻击（更慢但更重）');

// 命中必须落在演出之内，否则会出现"演出放完了伤害还没结算"
for (const m of ['light', 'heavy']) {
  ok(BASE_MOVES[m].impactDelay <= BASE_MOVES[m].perform,
    `基础${m === 'light' ? '轻' : '重'}击的命中(${BASE_MOVES[m].impactDelay}s)落在演出(${BASE_MOVES[m].perform}s)内`);
}

let comboBetter = 0;
for (const s of SKILLS) {
  const skillDmg = skillTotalDamage(s);
  const last = skillLastHit(s);
  const prePerform = s.pattern.reduce((a, m) => a + BASE_MOVES[m].perform, 0);
  const preCd = s.pattern.reduce((a, m) => a + BASE_MOVES[m].cd, 0);
  const preDmg = s.pattern.reduce((a, m) => a + BASE_MOVES[m].damage, 0);
  // 连招的真实总耗时含前置基础招式（演出 + 冷却），伤害也含前置招式
  const cycle = prePerform + preCd + s.perform + s.cd;
  const dmg = preDmg + skillDmg;
  const dps = dmg / cycle;
  const patStr = s.pattern.map((m) => (m === L ? '轻' : '重')).join('·');
  console.log(`  ${s.name.padEnd(6, '　')} ${patStr.padEnd(6, '　')} 耗气=${String(s.qi).padStart(2)}  演出${s.perform.toFixed(2)}s+冷却${s.cd.toFixed(2)}s  连招总伤=${String(Math.round(dmg)).padStart(3)}  全 cycle=${cycle.toFixed(2)}s  DPS=${dps.toFixed(1)}`);
  ok(last <= s.perform, `${s.name}：最后一击(${last.toFixed(2)}s)在演出(${s.perform}s)内完成`, `超出 ${(last - s.perform).toFixed(2)}s`);
  if (dps > Math.max(lightDps, heavyDps)) comboBetter++;
}
ok(comboBetter === SKILLS.length, '所有技能连招的 DPS 均高于基础招式连按', `${comboBetter}/${SKILLS.length}`);

console.log('\n=== 6. 敌人数据完整性（recover 缺失曾导致敌人只攻击一次） ===');
let missing = 0;
let attackCount = 0, defendCount = 0, restCount = 0;
for (const en of ENEMIES) {
  let hasAttack = false;
  for (const mv of en.moves) {
    const kind = mv.kind || 'attack';
    if (kind === 'attack') { hasAttack = true; attackCount++; }
    else if (kind === 'defend') defendCount++;
    else if (kind === 'rest') restCount++;
    // 各类行动需要的字段不同：攻击要伤害，防御要减伤系数，歇息要回复量
    const need = ['windup', 'recover', 'impactDelay'];
    if (kind === 'attack') need.push('damage');
    if (kind === 'defend') need.push('guardMul');
    if (kind === 'rest') need.push('heal');
    for (const f of need) {
      const v = mv[f];
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        missing++;
        console.log(`    ${en.name}/${mv.name}(${kind}) 缺少合法字段 ${f} = ${v}`);
      }
    }
  }
  if (!hasAttack) {
    missing++;
    console.log(`    ${en.name} 没有任何攻击手段，玩家永远不会受伤`);
  }
  const iv = en.interval;
  if (!Array.isArray(iv) || iv.length !== 2) {
    missing++;
    console.log(`    ${en.name} interval 非法`);
  }
}
ok(missing === 0, `${ENEMIES.length} 个敌人的全部行动字段齐备`, `缺失 ${missing} 处`);
console.log(`  行动构成：攻击 ${attackCount}　防御 ${defendCount}　歇息 ${restCount}`);
ok(defendCount > 0 && restCount > 0, '存在防御与歇息行动（供玩家调整节奏）');

// 需要玩家「来得及反应」的只有攻击：防御/歇息不伤害玩家，可以很快
let tooFast = 0;
for (const en of ENEMIES) {
  for (const mv of en.moves) {
    if ((mv.kind || 'attack') !== 'attack') continue;
    if (mv.windup < 0.35) {
      tooFast++;
      console.log(`    ${en.name}/${mv.name} 起手仅 ${mv.windup}s，来不及反应`);
    }
  }
}
ok(tooFast === 0, '所有敌方攻击的起手时间均 ≥0.35s（可反应）', `${tooFast} 处过短`);

console.log('\n=== 7. 防御行动的轴段 ===');
// 闪避／格挡都是排进时间轴的一段行动，所以必须有正的轴长与演出时长
const DEFS = [
  { name: '闪避', d: EVADE, key: 'L' },
  { name: '格挡', d: GUARD, key: '空格' },
  { name: '让招', d: WAIT, key: 'S' },
];
for (const it of DEFS) {
  const okShape = typeof it.d.perform === 'number' && Number.isFinite(it.d.perform)
    && typeof it.d.axis === 'number' && Number.isFinite(it.d.axis);
  ok(okShape, `${it.name}：perform=${it.d.perform}s / axis=${it.d.axis}s 合法`);
  if (it.d.axis > 0) {
    console.log(`  ${it.name}(${it.key}) 演出 ${it.d.perform}s → 轴段 ${it.d.axis}s，耗体 ${it.d.stamina}`);
  }
}
ok(EVADE.axis < GUARD.axis, '闪避的轴段短于格挡（短闪长挡）');
ok(WAIT.stamina === 0, '让招不耗体力，体力耗尽时仍可脱困');
// 让招若短到回不满一次轻击，体力见底时会陷入「让招-让招-…」的死循环
const waitGain = WAIT.axis * STAM_REGEN;
ok(waitGain >= BASE_MOVES.light.stamina,
  `让招 ${WAIT.axis}s 回体 ${waitGain.toFixed(1)} ≥ 轻击耗体 ${BASE_MOVES.light.stamina}，体力见底也能攒出下一手`);

// 敌方两次出手的间隔必须留出可被防御覆盖的余地
const enemyGaps = ENEMIES.map((e) => {
  const iv = e.interval || [2, 3];
  return { name: e.name, min: iv[0] * 0.5, max: iv[1] * 0.5 };
});
console.log('  敌方轴上 CD 区间：' + enemyGaps.map((g) => `${g.name} ${g.min.toFixed(1)}~${g.max.toFixed(1)}s`).join('　'));
ok(GUARD.axis >= 1.0, `格挡轴段(${GUARD.axis}s)足够长，能覆盖常见的敌方出手窗口`);
ok(GUARD_PARRY_WINDOW > 0 && GUARD_PARRY_WINDOW < GUARD.axis,
  `招架窗口(${GUARD_PARRY_WINDOW}s)落在格挡段(${GUARD.axis}s)之内`);

console.log('\n=== 8. 体力循环可行性 ===');
const seqStam = BASE_MOVES.light.stamina * 2;
console.log(`  连按 轻轻 耗体 ${seqStam}，体力上限 100，回复 26/s`);
ok(seqStam < 100, '轻重连段不会立刻耗空体力');

console.log('\n=== 9. 玩家初值（缺字段会静默变成 NaN） ===');
// reset() 漏掉 qi 时，副本 HUD 会显示「气 NaN/55」，且条不渲染
const p0 = new Player();
ok(Number.isFinite(p0.hp) && Number.isFinite(p0.qi), `新号 hp=${p0.hp} qi=${p0.qi} 均为有限数`);
ok(p0.hp === p0.maxHp && p0.qi === p0.maxQi, `新号气血/内力为满值（${p0.hp}/${p0.maxHp}　${p0.qi}/${p0.maxQi}）`);
ok(Number.isFinite(p0.maxStamina) && Number.isFinite(p0.lightDamage), '派生属性（体力上限／轻击伤害）均为有限数');

p0.level = 6;
p0.attrs.vit = 4;
p0.qi = 0;
p0.hp = 1;
p0.reset();
ok(p0.level === 1 && p0.hp === p0.maxHp && p0.qi === p0.maxQi,
  `reset() 把等级与气血/内力一并复位（Lv${p0.level}　${p0.hp}/${p0.maxHp}　${p0.qi}/${p0.maxQi}）`);

// 存档往返：load() 只读 toJSON() 里有的键，其余必须自洽
const p1 = new Player();
p1.level = 7;
p1.gold = 1234;
const raw = JSON.parse(JSON.stringify(p1.toJSON()));
const p2 = new Player();
p2.load(raw);
ok(p2.level === 7 && p2.gold === 1234, `存档往返保留等级与银两（Lv${p2.level}　${p2.gold} 两）`);
ok(Number.isFinite(p2.hp) && Number.isFinite(p2.qi) && p2.hp === p2.maxHp && p2.qi === p2.maxQi,
  `读档后气血/内力自洽（${p2.hp}/${p2.maxHp}　${p2.qi}/${p2.maxQi}）`);

console.log(`\n结果: pass=${pass}  fail=${fail}`);
process.exit(fail > 0 ? 1 : 0);
