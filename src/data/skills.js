// 招式与技能数据
//
// 【搓招规则】基础招式（轻/重）按下即出招，并记入连招序列。
// 每次出招后检查序列末尾是否完整匹配某个技能，匹配则清空整个序列并释放技能。
//
// 【节奏规则】战斗由单一时间轴驱动，且**表现与时间轴是分开的**：
//   · perform  出招演出时长。演出期间时间轴**冻结**，只有画面在动。
//   · cd       演出结束后该行动在时间轴上占用的时长，期间时间轴推进。
//   因此一个行动的真实总耗时 ≈ perform + cd，但只有 cd 会推进时间轴。
//
// 关键约束：技能序列集合必须「前缀无关」——
// 没有任何一个技能序列是另一个技能序列的前缀。
// 这样才能做到「匹配即触发」而不会出现歧义（无需延迟判定，搓招零延迟）。
//
// 例如：若同时存在 [轻,重] 与 [轻,重,轻]，玩家按到「轻重」时系统无法判断
// 是该立刻放招还是等待第三下，必然产生手感延迟。故本表刻意规避此类冲突。

export const BASE_MOVES = {
  light: {
    id: 'light',
    key: 'KeyJ',
    label: '轻',
    actionName: '点剑',
    perform: 0.26,       // 出招演出时长（时间轴冻结）
    cd: 0.36,            // 演出结束后在时间轴上占用的时长
    impactDelay: 0.09,   // 从出招到命中的时刻，落在演出之内
    damage: 7,
    qiGain: 7,
    stamina: 9,
    reach: 92,
    tint: '#e9dfc8',
  },
  heavy: {
    id: 'heavy',
    key: 'KeyK',
    label: '重',
    actionName: '劈剑',
    perform: 0.36,
    cd: 0.60,
    impactDelay: 0.18,
    damage: 17,
    qiGain: 12,
    stamina: 19,
    reach: 106,
    tint: '#d4a24c',
  },
};

// 连招序列的保持窗口（时间轴秒数）。
// 用时间轴时间而非真实时间：轮到我方思考时序列不会消散。
export const SEQ_WINDOW = 8;

// 内力 / 体力
export const QI_MAX = 100;
export const STAM_MAX = 100;
export const STAM_REGEN = 26;          // 每秒（仅在时间轴推进时回复）
export const QI_REGEN = 1.2;           // 每秒自然回气

// 防御动作：与出招一样，都是「排进时间轴的一段行动」。
// 演出（perform）期间时间轴暂停，随后在轴上占用 axis 时长。
// 若敌方行动点落在这段之内，即判定为成功闪避 / 格挡——无需即时反应。
// 代价：这两段之内**不回体力**，所以不能靠连续防御无限拖。
export const EVADE = { perform: 0.18, axis: 0.50, stamina: 20, tint: '#8fd0e8' };
export const GUARD = { perform: 0.16, axis: 1.00, stamina: 20, tint: '#c8c0a8' };
// 格挡段的最初这段时间内被击中 → 招架（敌人硬直，我方回气）
export const GUARD_PARRY_WINDOW = 0.30;
// 让招：不出招（无演出），只把时间轴往前放一段，用来调整节奏／回气（不耗体，总是可用）。
// 轴段取得与轻击一致：够短，不会让玩家干等；又刚好回够一次轻击的体力（26 × 0.36 ≈ 9.4），
// 所以体力见底时能靠它攒出下一手，而不是被永久卡住。
export const WAIT = { perform: 0, axis: BASE_MOVES.light.cd, stamina: 0, tint: '#6d6350' };

/**
 * perform  演出时长（时间轴冻结），需 ≥ 最后一段的 delay
 * cd       演出结束后在时间轴上占用的时长
 * steps    技能的每一段伤害
 *   dmg      基础伤害
 *   delay    从出招起算的命中延迟（落在 perform 之内）
 *   reach    攻击距离
 *   arc      刀光弧度（度）
 *   fx       特效类型
 */
export const SKILLS = [
  {
    id: 'liaoyun',
    name: '撩云式',
    pattern: ['light', 'heavy'],
    qi: 16,
    perform: 0.61,
    cd: 0.30,
    tint: '#7ec3bd',
    price: 0,
    desc: '轻挑而起，反手撩剑。收招极快，攻守兼备。',
    steps: [
      { dmg: 11, delay: 0.10, reach: 104, arc: 110, fx: 'slash' },
      { dmg: 21, delay: 0.36, reach: 116, arc: 130, fx: 'slash-up', launch: true },
    ],
  },
  {
    id: 'jiemai',
    name: '截脉手',
    pattern: ['heavy', 'light'],
    qi: 20,
    perform: 0.75,
    cd: 0.35,
    tint: '#a9c46c',
    price: 0,
    desc: '重压其势，指击其脉。命中可打断敌招。',
    steps: [
      { dmg: 19, delay: 0.18, reach: 108, arc: 95, fx: 'slash' },
      { dmg: 16, delay: 0.50, reach: 96, arc: 60, fx: 'thrust', interrupt: true },
    ],
  },
  {
    id: 'fengjuan',
    name: '风卷残云',
    pattern: ['light', 'light', 'light'],
    qi: 22,
    perform: 0.75,
    cd: 0.35,
    tint: '#e9dfc8',
    price: 120,
    desc: '三连疾风，绵绵不绝。段数多，攒气快。',
    steps: [
      { dmg: 9, delay: 0.08, reach: 96, arc: 90, fx: 'slash' },
      { dmg: 9, delay: 0.24, reach: 98, arc: 100, fx: 'slash' },
      { dmg: 20, delay: 0.50, reach: 112, arc: 150, fx: 'flurry' },
    ],
  },
  {
    id: 'baihong',
    name: '白虹贯日',
    pattern: ['light', 'light', 'heavy'],
    qi: 30,
    perform: 1.03,
    cd: 0.55,
    tint: '#8fd0e8',
    price: 240,
    desc: '蓄势一刺，白虹贯日。无视半数护体真气。',
    steps: [
      { dmg: 10, delay: 0.10, reach: 96, arc: 90, fx: 'slash' },
      { dmg: 12, delay: 0.28, reach: 98, arc: 100, fx: 'slash' },
      { dmg: 46, delay: 0.78, reach: 150, arc: 20, fx: 'pierce', pierce: true },
    ],
  },
  {
    id: 'suixing',
    name: '碎星击',
    pattern: ['heavy', 'heavy', 'light'],
    qi: 26,
    perform: 1.11,
    cd: 0.60,
    tint: '#d9a441',
    price: 180,
    desc: '双沉重压后一记崩拳，将敌震退数步。',
    steps: [
      { dmg: 18, delay: 0.18, reach: 106, arc: 100, fx: 'slash' },
      { dmg: 18, delay: 0.46, reach: 106, arc: 100, fx: 'slash' },
      { dmg: 30, delay: 0.86, reach: 120, arc: 170, fx: 'slam', knockback: 90 },
    ],
  },
  {
    id: 'tianbeng',
    name: '天崩地裂',
    pattern: ['heavy', 'heavy', 'heavy'],
    qi: 48,
    perform: 1.35,
    cd: 1.00,
    tint: '#e05c4a',
    price: 480,
    desc: '三沉其势，一剑崩天。破护体，震敌胆。',
    steps: [
      { dmg: 20, delay: 0.20, reach: 106, arc: 100, fx: 'slash' },
      { dmg: 22, delay: 0.52, reach: 108, arc: 110, fx: 'slash' },
      { dmg: 68, delay: 1.10, reach: 138, arc: 220, fx: 'quake', pierce: true, breakGuard: true, screenShake: 14 },
    ],
  },
];

// 绝学：U 键释放，消耗全部内力，伤害与消耗的内力成正比
export const ULTIMATE = {
  id: 'wuming',
  name: '无明剑意',
  minQi: 40,
  perQi: 1.45,
  tint: '#c9a6ff',
  perform: 0.75,
  cd: 1.65,
  delay: 0.50,
  reach: 160,
  desc: '凝全身真气于一剑。消耗全部内力，每点内力化为锋芒。',
};

export function getSkillById(id) {
  return SKILLS.find((s) => s.id === id) || null;
}

export function skillTotalDamage(skill) {
  return skill.steps.reduce((a, s) => a + s.dmg, 0);
}

// 最后一击的命中时刻：用于绘制时间轴上的伤害标记
export function skillLastHit(skill) {
  return skill.steps.reduce((a, s) => Math.max(a, s.delay), 0);
}

// 一次行动的真实总耗时：演出（时间轴冻结）+ 冷却（时间轴推进）
export function skillFullTime(skill) {
  let t = 0;
  for (const m of skill.pattern) t += BASE_MOVES[m].perform + BASE_MOVES[m].cd;
  return t + skill.perform + skill.cd;
}

// 一次行动占用的时间轴时长（只有冷却会推进时间轴）
export function skillClockTime(skill) {
  let t = 0;
  for (const m of skill.pattern) t += BASE_MOVES[m].cd;
  return t + skill.cd;
}

/**
 * 在序列后缀中寻找匹配的技能。
 * 因为技能表前缀无关，这里最多只会命中一个；若确实命中多个，取最长者。
 */
export function matchSkill(seq) {
  let best = null;
  for (const sk of SKILLS) {
    const p = sk.pattern;
    if (p.length > seq.length) continue;
    let ok = true;
    const off = seq.length - p.length;
    for (let i = 0; i < p.length; i++) {
      if (seq[off + i] !== p[i]) { ok = false; break; }
    }
    if (ok && (!best || p.length > best.pattern.length)) best = sk;
  }
  return best;
}

// 已学会的技能列表（由玩家存档提供）
export function availableSkills(player) {
  return SKILLS.filter((s) => player.skills.includes(s.id));
}
