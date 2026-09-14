// 搓招核心逻辑验证
// 用法: node tools/test_skills.mjs

import { SKILLS, BASE_MOVES, matchSkill, seqStep, stepMove, seqAfterSkill, skillTotalDamage, skillLastHit, EVADE, GUARD, WAIT, GUARD_PARRY_WINDOW, STAM_REGEN, INTENT, ULTIMATE } from '../src/data/skills.js';
import { ENEMIES, SPAR_DUMMY, INTERVAL_SCALE } from '../src/data/enemies.js';
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

console.log('\n=== 3b. 招式接续（风卷残云算「轻」、白虹贯日算「重」） ===');
// as 非法会让招式接进序列后永远匹配不上任何连招（静默失效，不报错）
let badAs = 0;
for (const s of SKILLS) {
  if (s.as == null) continue;
  if (s.as !== L && s.as !== H) { badAs++; console.log(`    ${s.name} 的 as=${s.as} 非法`); }
}
ok(badAs === 0, `全部技能的 as 字段合法或省略（${SKILLS.filter((s) => s.as).length} 个可接续）`, `${badAs} 处非法`);
ok(SKILLS.find((s) => s.id === 'fengjuan').as === L, '风卷残云出招后算作「轻」');
ok(SKILLS.find((s) => s.id === 'baihong').as === H, '白虹贯日出招后算作「重」');
ok(SKILLS.find((s) => s.id === 'liaoyun').as == null, '撩云式不接续（出招后序列清空）');

ok(seqAfterSkill(SKILLS.find((s) => s.id === 'liaoyun')).length === 0, '无 as 的招式（撩云式）出招后序列清空');
ok(seqAfterSkill(SKILLS.find((s) => s.id === 'fengjuan')).length === 1, '风卷残云出招后把自己接进新序列');

// via 只是显示标记，匹配只看等效基础招式
ok(matchSkill([seqStep(L, 'fengjuan'), seqStep(L), seqStep(L)])?.id === 'fengjuan', '[风卷(轻)·轻·轻] -> 又一段风卷残云');
ok(matchSkill([seqStep(L, 'fengjuan'), seqStep(H)])?.id === 'liaoyun', '[风卷(轻)·重] 匹配撩云式');
ok(matchSkill([seqStep(H, 'baihong'), seqStep(L)])?.id === 'jiemai', '[白虹(重)·轻] -> 截脉手');
ok(matchSkill([seqStep(H, 'baihong'), seqStep(H), seqStep(H)])?.id === 'tianbeng', '[白虹(重)·重·重] -> 天崩地裂');
ok(matchSkill([seqStep(L, 'baihong'), seqStep(H, 'fengjuan')])?.id === 'liaoyun', 'via 与等效招式错配也不影响匹配结果');

// 派生链走一遍真实按键流程（规则取自数据层的 seqAfterSkill，与战斗里一致）
{
  const own = ['liaoyun', 'baihong', 'jiemai', 'fengjuan', 'suixing', 'tianbeng'];
  let chain = [];
  const press = (mv) => {
    const next = chain.concat([seqStep(mv)]);
    const sk = matchSkill(next);
    if (sk && own.includes(sk.id)) { chain = seqAfterSkill(sk); return sk; }
    chain = next;
    return null;
  };
  ok(press(L) === null && press(H)?.id === 'liaoyun', '轻·重 -> 撩云式');
  ok(chain.length === 0, '撩云式之后序列清空（不接续）');

  chain = [];
  ok(press(L) === null && press(L) === null && press(L)?.id === 'fengjuan', '轻·轻·轻 -> 风卷残云');
  ok(chain.length === 1 && stepMove(chain[0]) === L && chain[0].via === 'fengjuan',
    '风卷残云之后序列变成一项 [风卷(轻)]');
  // 派生项本身占一次「轻」，所以再按两下就能续下一段
  ok(press(L) === null && press(L)?.id === 'fengjuan',
    '风卷(轻)·轻·轻 -> 又一段风卷残云（连按轻也能一路滚下去）');

  chain = seqAfterSkill(SKILLS.find((s) => s.id === 'baihong'));
  ok(press(H) === null && press(H)?.id === 'tianbeng', '白虹(重)·重·重 -> 天崩地裂');

  chain = [];
  press(H);
  ok(chain.length === 1 && stepMove(chain[0]) === H, '未成招时序列照常累积（[重]）');
}
// 接续不会引入歧义：带派生项的序列与等效基础序列的匹配结果一一对应
{
  let diff = 0;
  for (const c of cases) {
    const alt = c.seq.map((m) => seqStep(m, m === L ? 'fengjuan' : 'baihong'));
    if ((matchSkill(alt)?.id ?? null) !== (matchSkill(c.seq)?.id ?? null)) {
      diff++;
      console.log(`    [${c.seq.join(',')}] 带派生项后匹配结果变了`);
    }
  }
  ok(diff === 0, `${cases.length} 条序列在带派生项时匹配结果不变（无歧义）`, `不一致 ${diff} 处`);
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
// 防御段都短于基础招式：防御不是「按下去就安全」，得卡准敌人出手那一刻
ok(EVADE.axis < BASE_MOVES.light.cd,
  `闪避轴段(${EVADE.axis}s)短于轻击轴段(${BASE_MOVES.light.cd}s)`);
ok(GUARD.axis < BASE_MOVES.heavy.cd,
  `格挡轴段(${GUARD.axis}s)短于重击轴段(${BASE_MOVES.heavy.cd}s)`);
ok(WAIT.stamina === 0, '让招不耗体力，体力耗尽时仍可脱困');
ok(WAIT.axis === EVADE.axis,
  `让招轴段(${WAIT.axis}s)与闪避一致（${EVADE.axis}s）`);
// 耗体按「效果越彻底越贵」排：闪避完全免伤 > 重击 > 格挡（只减伤、仍要挨四成半）
ok(GUARD.stamina < BASE_MOVES.heavy.stamina,
  `格挡耗体(${GUARD.stamina})低于一次重击(${BASE_MOVES.heavy.stamina})——防空（防了个空）的代价不该比出招还贵`);
ok(GUARD.stamina < EVADE.stamina,
  `格挡耗体(${GUARD.stamina})低于闪避(${EVADE.stamina})——闪避完全免伤，代价理应更高`);
// 让招是体力见底时的唯一出路，判据是「不耗体 + 回体为正 + 有限次内能凑出一手」。
// 轴段与闪避对齐后（0.30s）一次只回 7.8，不足一次轻击（9），故要求两次内凑够：
// 只要回体为正，体力就单调回升，不会出现「出不了招 → 轴不动 → 体力不回」的死循环。
const waitGain = WAIT.axis * STAM_REGEN;
const waitTimes = Math.ceil(BASE_MOVES.light.stamina / waitGain);
console.log(`  让招 ${WAIT.axis}s 一次回体 ${waitGain.toFixed(1)}，连让 ${waitTimes} 次可凑出一次轻击（${BASE_MOVES.light.stamina}）`);
ok(waitGain > 0, `让招回体为正（${waitGain.toFixed(1)}）——体力必然单调回升`);
ok(waitTimes <= 2,
  `连让 ${waitTimes} 次即可凑出一次轻击，体力见底不会卡死`);

// 敌方两次出手的间隔必须留出可被防御覆盖的余地。系数取数据层导出的那一个，
// 免得测试与实现各写一份、改了一边另一边仍绿
const enemyGaps = ENEMIES.map((e) => {
  const iv = e.interval || [2, 3];
  return { name: e.name, min: iv[0] * INTERVAL_SCALE, max: iv[1] * INTERVAL_SCALE };
});
console.log('  敌方轴上 CD 区间：' + enemyGaps.map((g) => `${g.name} ${g.min.toFixed(2)}~${g.max.toFixed(2)}s`).join('　'));
// 防御段不要求盖满敌人 CD（那是旧的长闪长挡），但至少要够窄到能「卡点」、
// 又不能窄到按下去毫无意义。取最短 CD 的一半作为可用性下限。
const tightest = Math.min(...enemyGaps.map((g) => g.min));
ok(GUARD.axis >= tightest * 0.5,
  `格挡轴段(${GUARD.axis}s) ≥ 最短敌方 CD(${tightest.toFixed(2)}s)的一半，卡点仍可操作`,
  `格挡仅 ${GUARD.axis}s，比 ${(tightest * 0.5).toFixed(2)}s 还短`);
ok(EVADE.axis >= tightest * 0.5,
  `闪避轴段(${EVADE.axis}s) ≥ 最短敌方 CD(${tightest.toFixed(2)}s)的一半，卡点仍可操作`,
  `闪避仅 ${EVADE.axis}s`);
ok(GUARD_PARRY_WINDOW > 0 && GUARD_PARRY_WINDOW < GUARD.axis,
  `招架窗口(${GUARD_PARRY_WINDOW}s)落在格挡段(${GUARD.axis}s)之内`);
ok(GUARD_PARRY_WINDOW <= GUARD.axis * 0.5,
  `招架窗口只占格挡段的 ${(GUARD_PARRY_WINDOW / GUARD.axis * 100).toFixed(0)}%，仍属「掐着点」而非随手可得`);

// CD 压到比一次轻击的轴段还短，轴上就会挤成一团、失去读轴的意义
ok(tightest >= 0.30,
  `最短的敌方轴上 CD 为 ${tightest.toFixed(2)}s，仍长于一次轻击的轴段(${BASE_MOVES.light.cd}s)可读`,
  `CD=${tightest.toFixed(2)}s 太挤`);

console.log('\n=== 7b. 演武用机关木人（会还手的陪练） ===');
{
  const en = SPAR_DUMMY;
  const kinds = { attack: 0, defend: 0, rest: 0 };
  let bad = 0;
  for (const mv of en.moves) {
    const kind = mv.kind || 'attack';
    if (kinds[kind] == null) { bad++; console.log(`    ${mv.name} 的 kind=${kind} 非法`); continue; }
    kinds[kind]++;
    const need = ['windup', 'recover', 'impactDelay'];
    if (kind === 'attack') need.push('damage', 'reach');
    if (kind === 'defend') need.push('guardMul');
    if (kind === 'rest') need.push('heal');
    for (const f of need) {
      const v = mv[f];
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        bad++;
        console.log(`    ${en.name}/${mv.name}(${kind}) 缺少合法字段 ${f} = ${v}`);
      }
    }
    // 起手太短玩家来不及读轴，这是练读轴的地方，必须留足
    if (kind === 'attack' && mv.windup < 0.35) {
      bad++;
      console.log(`    ${en.name}/${mv.name} 起手仅 ${mv.windup}s，来不及反应`);
    }
  }
  ok(bad === 0, '机关木人的招式字段齐备、攻击起手可反应', `${bad} 处问题`);
  ok(kinds.attack > 0 && kinds.defend > 0 && kinds.rest > 0,
    `三类行动俱全（攻 ${kinds.attack} / 守 ${kinds.defend} / 息 ${kinds.rest}）`);
  ok(en.hp === 10000, `机关木人是打不完的桩子（${en.hp} 气血）——死木桩才是 ∞`);
  const iv = en.interval;
  ok(Array.isArray(iv) && iv.length === 2 && iv[0] > 0 && iv[1] > iv[0], `interval 合法 [${iv}]`);
  // 混进 ENEMIES 的话秘境会刷出木人来
  ok(!ENEMIES.some((e) => e.id === en.id), '机关木人不在副本敌人表 ENEMIES 内（秘境不会刷出）');
}

console.log('\n=== 7c. 敌人强度与节奏 ===');
{
  // 血量：tier 越高越厚（同阶内允许有脆皮与厚甲之分，故比的是各 tier 的均值），
  // 且都在合理区间（防手滑写成 900 或 9）
  const byTier = new Map();
  for (const e of ENEMIES) {
    if (!byTier.has(e.tier)) byTier.set(e.tier, []);
    byTier.get(e.tier).push(e.hp);
  }
  const tiers = [...byTier.keys()].sort((a, b) => a - b);
  const avgOf = (t) => byTier.get(t).reduce((a, b) => a + b, 0) / byTier.get(t).length;
  console.log('  各阶平均血量：' + tiers.map((t) => `tier${t} ${avgOf(t).toFixed(0)}`).join('　'));
  let nonMono = 0;
  for (let i = 1; i < tiers.length; i++) {
    if (avgOf(tiers[i]) < avgOf(tiers[i - 1])) {
      nonMono++;
      console.log(`    tier${tiers[i - 1]} 均值 ${avgOf(tiers[i - 1]).toFixed(0)} > tier${tiers[i]} 均值 ${avgOf(tiers[i]).toFixed(0)}`);
    }
  }
  ok(nonMono === 0, '各阶平均血量随 tier 不下降（高阶不会整体比低阶更脆）', `${nonMono} 处倒挂`);
  const hpRange = { min: Math.min(...ENEMIES.map((e) => e.hp)), max: Math.max(...ENEMIES.map((e) => e.hp)) };
  console.log(`  敌人血量区间：${hpRange.min} ~ ${hpRange.max}`);
  ok(hpRange.min >= 80, `最脆的敌人也有 ${hpRange.min} 血（一击秒不掉）`, `仅 ${hpRange.min}`);
  ok(hpRange.max <= 1200, `最厚的敌人 ${hpRange.max} 血（不靠磨血拖延）`, `${hpRange.max} 过厚`);

  // 节奏：开局首击与出手间隔都收紧过，别再被随手调回去
  const minCd = Math.min(...ENEMIES.map((e) => (e.interval || [2, 3])[0] * INTERVAL_SCALE));
  const avgCd = ENEMIES.reduce((a, e) => a + (e.interval || [2, 3])[0] * INTERVAL_SCALE, 0) / ENEMIES.length;
  console.log(`  轴上出手间隔：最快 ${minCd.toFixed(2)}s　平均 ${avgCd.toFixed(2)}s（首击 0.28~0.55s）`);
  ok(minCd <= 0.45, `最快的敌人约 ${minCd.toFixed(2)}s 出手一次（节奏够紧）`, `${minCd.toFixed(2)}s 偏慢`);
  ok(INTERVAL_SCALE > 0 && INTERVAL_SCALE <= 0.42, `出手间隔系数 ${INTERVAL_SCALE} 未回退到旧值 0.42`);

  // 攻击力：同样按阶递进。后期偏弱是玩家反馈过的问题，故高阶的单发伤害要压得住场面
  const dmgOf = (e) => Math.max(...e.moves.filter((m) => (m.kind || 'attack') === 'attack').map((m) => m.damage));
  const byTierDmg = new Map();
  for (const e of ENEMIES) {
    if (!byTierDmg.has(e.tier)) byTierDmg.set(e.tier, []);
    byTierDmg.get(e.tier).push(dmgOf(e));
  }
  const avgDmg = (t) => byTierDmg.get(t).reduce((a, b) => a + b, 0) / byTierDmg.get(t).length;
  console.log('  各阶最高单发伤害均值：' + [...byTierDmg.keys()].sort((a, b) => a - b)
    .map((t) => `tier${t} ${avgDmg(t).toFixed(0)}`).join('　'));
  let dmgDrop = 0;
  for (let i = 1; i < tiers.length; i++) if (avgDmg(tiers[i]) < avgDmg(tiers[i - 1])) dmgDrop++;
  ok(dmgDrop === 0, '各阶攻击力随 tier 不下降', `${dmgDrop} 处倒挂`);
  ok(dmgOf(ENEMIES.find((e) => e.id === 'master')) >= 80,
    `无明剑主的最强招 ${dmgOf(ENEMIES.find((e) => e.id === 'master'))} 点（后期要有压迫感）`);
}

console.log('\n=== 8. 体力循环可行性 ===');
const seqStam = BASE_MOVES.light.stamina * 2;
console.log(`  连按 轻轻 耗体 ${seqStam}，体力上限 100，回复 26/s`);
ok(seqStam < 100, '轻重连段不会立刻耗空体力');

console.log('\n=== 8b. 剑意与无明剑意 ===');
{
  // 剑意是跨战斗资源：数值必须有限、上下限自洽，否则「满剑意」判定会失灵
  ok(Number.isFinite(INTENT.max) && INTENT.max > 0, `剑意上限 ${INTENT.max}`);
  ok(INTENT.perBase > 0 && INTENT.perSkill > 0, `出招累积：基础 ${INTENT.perBase} / 连招 ${INTENT.perSkill}`);
  ok(INTENT.perSkill > INTENT.perBase, '连招累积多于基础招式（鼓励搓招）');

  // 攒满需要几次？太少则开场就能放，太多则形同虚设
  const byBase = INTENT.max / INTENT.perBase;
  const bySkill = INTENT.max / INTENT.perSkill;
  console.log(`  攒满一槽：全靠基础招式需 ${byBase.toFixed(0)} 次，全靠连招需 ${bySkill.toFixed(0)} 次`);
  ok(bySkill >= 4 && bySkill <= 20, `全靠连招攒满需 ${bySkill.toFixed(0)} 次（跨场积累才有意义）`);

  ok(ULTIMATE.intentCost === INTENT.max, `绝学需要满槽（${ULTIMATE.intentCost}）`);
  ok(Number.isFinite(ULTIMATE.dmgPerIntent) && ULTIMATE.dmgPerIntent > 0,
    `剑意换伤害 ${ULTIMATE.dmgPerIntent}／点，满槽约 ${Math.round(ULTIMATE.intentCost * ULTIMATE.dmgPerIntent)} 点伤害`);
  // 轴段缩短过（1.65 → 1.10 → 与闪避同长），别被调回去
  ok(ULTIMATE.cd === EVADE.axis, `无明剑意轴段 ${ULTIMATE.cd}s，与闪避(${EVADE.axis}s)同长`);
  ok(ULTIMATE.cd <= 0.40, `无明剑意轴段 ${ULTIMATE.cd}s（已缩短，原为 1.65s）`);
  ok(ULTIMATE.delay <= ULTIMATE.perform, `命中(${ULTIMATE.delay}s)落在演出(${ULTIMATE.perform}s)内`);
  ok(!('minQi' in ULTIMATE) && !('perQi' in ULTIMATE),
    '绝学不再与内力挂钩（门槛已改为剑意，残留字段会误导后来人）');

  // 玩家侧：字段齐全、演武可攒、但不进存档（剑意随秘境结束而散）
  const pi = new Player();
  ok(pi.intent === 0 && pi.maxIntent === INTENT.max, `新号剑意 ${pi.intent}/${pi.maxIntent}`);
  ok(pi.intentFull === false, '新号剑意未满');
  pi.intent = INTENT.max;
  ok(pi.intentFull === true, '满槽时 intentFull 为真');

  ok(pi.toJSON().intent === undefined, '剑意不写进存档（只在一次秘境探索内保留）');
  pi.level = 5;
  const round = new Player().load(JSON.parse(JSON.stringify(pi.toJSON())));
  ok(round.intent === 0, `存档往返后剑意归零（${round.intent}）`);
  const legacy = new Player().load({ level: 3, intent: 88 });
  ok(legacy.intent === 0, '旧档里残留的剑意字段不会被读进来（否则等于跨秘境保留）');
}

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
