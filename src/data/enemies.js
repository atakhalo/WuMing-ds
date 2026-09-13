/**
 * 敌人数据
 *
 * 敌人的每次行动都排在时间轴上，行动分三类：
 *   · kind 'attack'  攻击：起手 → 命中 → 收招
 *   · kind 'defend'  防御：期间玩家伤害被 guardMul 削弱，可趁机让招/回气
 *   · kind 'rest'    歇息：回血 heal，是玩家可以放心调整节奏的窗口
 *
 * 招式字段
 *   name         招式名
 *   kind         行动类型（缺省为 attack）
 *   windup       起手时长（时间轴上的预警）
 *   impactDelay  从挥出到打中的延迟
 *   recover      命中后的收招僵直
 *   damage       伤害
 *   reach        攻击距离
 *   type         'slash' | 'thrust' | 'slam' | 'multi'
 *   hits         段数
 *   guardMul     仅 defend：玩家伤害乘数
 *   heal         仅 rest：回复量
 */

export const ENEMIES = [
  {
    id: 'wolf',
    name: '野狗',
    tier: 1,
    hp: 44,
    atk: 6,
    def: 0,
    interval: [1.5, 2.3],
    exp: 12,
    gold: [4, 9],
    size: 0.85,
    bodyColor: '#6b5a45',
    accentColor: '#3d3225',
    intro: '一条瘦骨嶙峋的野狗，龇着牙绕圈。',
    moves: [
      { name: '扑咬', windup: 0.52, impactDelay: 0.12, recover: 0.30, damage: 7, reach: 96, type: 'thrust' },
      { name: '绕圈', kind: 'rest', windup: 0.34, impactDelay: 0.10, recover: 0.24, heal: 6 },
    ],
  },
  {
    id: 'bandit',
    name: '山贼',
    tier: 1,
    hp: 62,
    atk: 8,
    def: 1,
    interval: [1.7, 2.5],
    exp: 18,
    gold: [8, 16],
    size: 1.0,
    bodyColor: '#7a5a44',
    accentColor: '#4a3428',
    intro: '裹着破布衫的山贼，手中钢刀豁了口。',
    moves: [
      { name: '横劈', windup: 0.60, impactDelay: 0.13, recover: 0.34, damage: 9, reach: 108, type: 'slash' },
      { name: '突刺', windup: 0.74, impactDelay: 0.14, recover: 0.38, damage: 13, reach: 130, type: 'thrust' },
      { name: '抱头', kind: 'defend', windup: 0.30, impactDelay: 0.10, recover: 0.26, guardMul: 0.40 },
    ],
  },
  {
    id: 'viper',
    name: '碧纹蛇',
    tier: 1,
    hp: 38,
    atk: 9,
    def: 0,
    interval: [1.2, 1.9],
    exp: 16,
    gold: [6, 12],
    size: 0.8,
    bodyColor: '#4c7a52',
    accentColor: '#2c4a30',
    intro: '青鳞细蛇盘在落叶间，吐着信子。',
    moves: [
      { name: '吐信', windup: 0.40, impactDelay: 0.09, recover: 0.26, damage: 6, reach: 84, type: 'thrust' },
      { name: '缠咬', windup: 0.56, impactDelay: 0.11, recover: 0.30, damage: 11, reach: 92, type: 'multi', hits: 2 },
    ],
  },
  {
    id: 'thug',
    name: '泼皮',
    tier: 1,
    hp: 52,
    atk: 7,
    def: 0,
    interval: [1.1, 1.7],
    exp: 15,
    gold: [6, 13],
    size: 0.95,
    bodyColor: '#8a6a3a',
    accentColor: '#4a3a22',
    intro: '街面上混日子的泼皮，出手又急又乱。',
    moves: [
      { name: '乱拳', windup: 0.36, impactDelay: 0.09, recover: 0.22, damage: 5, reach: 92, type: 'multi', hits: 2 },
      { name: '踹腿', windup: 0.50, impactDelay: 0.11, recover: 0.26, damage: 9, reach: 104, type: 'slam' },
      { name: '退开', kind: 'rest', windup: 0.28, impactDelay: 0.08, recover: 0.20, heal: 5 },
    ],
  },
  {
    id: 'lancer',
    name: '长枪手',
    tier: 2,
    hp: 76,
    atk: 12,
    def: 2,
    interval: [1.5, 2.2],
    exp: 30,
    gold: [14, 26],
    size: 1.02,
    bodyColor: '#5a6a4a',
    accentColor: '#32402a',
    intro: '端着一杆长枪，枪尖始终指着你的咽喉。',
    moves: [
      { name: '直刺', windup: 0.62, impactDelay: 0.13, recover: 0.32, damage: 15, reach: 146, type: 'thrust' },
      { name: '挑枪', windup: 0.50, impactDelay: 0.11, recover: 0.28, damage: 10, reach: 128, type: 'slash' },
      { name: '收枪', kind: 'defend', windup: 0.28, impactDelay: 0.09, recover: 0.24, guardMul: 0.45 },
    ],
  },
  {
    id: 'blade',
    name: '黑衣刀客',
    tier: 2,
    hp: 88,
    atk: 12,
    def: 3,
    interval: [1.6, 2.4],
    exp: 34,
    gold: [16, 28],
    size: 1.05,
    bodyColor: '#3a3a46',
    accentColor: '#22222c',
    intro: '黑衣蒙面，刀未出鞘，杀气已至。',
    moves: [
      { name: '拔刀斩', windup: 0.55, impactDelay: 0.12, recover: 0.30, damage: 14, reach: 118, type: 'slash' },
      { name: '连环斩', windup: 0.68, impactDelay: 0.12, recover: 0.34, damage: 9, reach: 112, type: 'multi', hits: 3 },
      { name: '背刺', windup: 0.80, impactDelay: 0.15, recover: 0.38, damage: 22, reach: 138, type: 'thrust' },
      { name: '沉肩', kind: 'rest', windup: 0.32, impactDelay: 0.09, recover: 0.26, heal: 8 },
    ],
  },
  {
    id: 'zombie',
    name: '尸傀',
    tier: 2,
    hp: 130,
    atk: 13,
    def: 6,
    interval: [2.2, 3.2],
    exp: 40,
    gold: [12, 24],
    size: 1.15,
    bodyColor: '#6a6f5c',
    accentColor: '#3f4438',
    intro: '皮肤青灰的尸傀，动作迟滞却力大无穷。',
    moves: [
      { name: '钝击', windup: 0.82, impactDelay: 0.16, recover: 0.36, damage: 20, reach: 104, type: 'slam' },
      { name: '横扫', windup: 1.00, impactDelay: 0.18, recover: 0.42, damage: 24, reach: 122, type: 'slam', knockback: 60 },
      { name: '僵立', kind: 'rest', windup: 0.46, impactDelay: 0.12, recover: 0.34, heal: 12 },
    ],
  },
  {
    id: 'warden',
    name: '铁卫',
    tier: 3,
    hp: 168,
    atk: 15,
    def: 11,
    interval: [1.7, 2.5],
    exp: 76,
    gold: [34, 60],
    size: 1.12,
    bodyColor: '#4a5260',
    accentColor: '#2a303a',
    intro: '披着重甲的护卫，铁盾一横，刀枪难入。',
    moves: [
      { name: '盾撞', windup: 0.66, impactDelay: 0.13, recover: 0.34, damage: 17, reach: 112, type: 'slam', knockback: 50 },
      { name: '斩击', windup: 0.54, impactDelay: 0.12, recover: 0.30, damage: 14, reach: 124, type: 'slash' },
      { name: '举盾', kind: 'defend', windup: 0.34, impactDelay: 0.10, recover: 0.30, guardMul: 0.25 },
    ],
  },
  {
    id: 'monk',
    name: '刀疤僧',
    tier: 3,
    hp: 190,
    atk: 16,
    def: 8,
    interval: [1.6, 2.3],
    exp: 90,
    gold: [40, 70],
    size: 1.2,
    boss: true,
    bodyColor: '#8a5a3a',
    accentColor: '#5a3420',
    intro: '满脸刀疤的僧人扛着戒刀，咧嘴一笑。',
    moves: [
      { name: '戒刀斩', windup: 0.58, impactDelay: 0.12, recover: 0.32, damage: 18, reach: 126, type: 'slash' },
      { name: '金刚杵', windup: 0.88, impactDelay: 0.17, recover: 0.40, damage: 30, reach: 118, type: 'slam', knockback: 70 },
      { name: '狮子吼', windup: 0.72, impactDelay: 0.13, recover: 0.32, damage: 12, reach: 150, type: 'multi', hits: 2 },
      { name: '铁布衫', kind: 'defend', windup: 0.40, impactDelay: 0.11, recover: 0.32, guardMul: 0.30 },
    ],
  },
  {
    id: 'assassin',
    name: '夜行刺客',
    tier: 4,
    hp: 175,
    atk: 24,
    def: 5,
    interval: [1.1, 1.7],
    exp: 140,
    gold: [70, 115],
    size: 1.0,
    bodyColor: '#2e2a3a',
    accentColor: '#181622',
    intro: '来去无声，刀锋上淬着夜露。',
    moves: [
      { name: '刺客突袭', windup: 0.38, impactDelay: 0.09, recover: 0.24, damage: 20, reach: 128, type: 'thrust' },
      { name: '双刃连击', windup: 0.55, impactDelay: 0.10, recover: 0.28, damage: 12, reach: 116, type: 'multi', hits: 3 },
      { name: '潜形', kind: 'defend', windup: 0.26, impactDelay: 0.08, recover: 0.22, guardMul: 0.35 },
    ],
  },
  {
    id: 'shadow',
    name: '影卫统领',
    tier: 4,
    hp: 260,
    atk: 21,
    def: 10,
    interval: [1.35, 2.0],
    exp: 160,
    gold: [80, 130],
    size: 1.12,
    boss: true,
    bodyColor: '#2d2d44',
    accentColor: '#191926',
    intro: '影卫统领负手而立，剑在鞘中，气机却已锁住全身。',
    moves: [
      { name: '影袭', windup: 0.45, impactDelay: 0.10, recover: 0.28, damage: 17, reach: 130, type: 'thrust' },
      { name: '乱影', windup: 0.62, impactDelay: 0.11, recover: 0.30, damage: 11, reach: 118, type: 'multi', hits: 4 },
      { name: '封喉', windup: 0.92, impactDelay: 0.16, recover: 0.40, damage: 38, reach: 146, type: 'thrust' },
      { name: '剑罡', windup: 0.78, impactDelay: 0.15, recover: 0.34, damage: 26, reach: 168, type: 'slam', knockback: 60 },
      { name: '凝气', kind: 'rest', windup: 0.34, impactDelay: 0.10, recover: 0.28, heal: 16 },
    ],
  },
  {
    id: 'master',
    name: '无明剑主',
    tier: 5,
    hp: 360,
    atk: 26,
    def: 13,
    interval: [1.2, 1.8],
    exp: 320,
    gold: [200, 320],
    size: 1.18,
    boss: true,
    bodyColor: '#4a2a3a',
    accentColor: '#2a1622',
    intro: '「无名者，方得无明之剑。」剑主缓缓抬手。',
    moves: [
      { name: '无明斩', windup: 0.48, impactDelay: 0.11, recover: 0.28, damage: 22, reach: 132, type: 'slash' },
      { name: '落英', windup: 0.60, impactDelay: 0.10, recover: 0.28, damage: 13, reach: 122, type: 'multi', hits: 5 },
      { name: '断念', windup: 0.88, impactDelay: 0.16, recover: 0.38, damage: 44, reach: 150, type: 'thrust' },
      { name: '剑意', windup: 0.98, impactDelay: 0.18, recover: 0.42, damage: 34, reach: 178, type: 'slam', knockback: 80 },
      { name: '养剑', kind: 'rest', windup: 0.32, impactDelay: 0.10, recover: 0.26, heal: 22 },
      { name: '剑罡护体', kind: 'defend', windup: 0.36, impactDelay: 0.11, recover: 0.30, guardMul: 0.28 },
    ],
  },
];

/** 行动类型：缺省即普通攻击 */
export function moveKind(mv) {
  return mv.kind || 'attack';
}

export function getEnemy(id) {
  return ENEMIES.find((e) => e.id === id) || ENEMIES[0];
}

// 按副本层级抽取敌人：只取 [tier-1, tier] 这一档，避免低阶副本刷出高阶怪
export function rollEnemyForTier(tier, allowBoss = false) {
  const lo = Math.max(1, tier - 1);
  const pool = ENEMIES.filter((e) => {
    if (e.boss && !allowBoss) return false;
    return e.tier >= lo && e.tier <= tier;
  });
  const usable = pool.length ? pool : ENEMIES.filter((e) => !e.boss && e.tier <= tier);
  const final = usable.length ? usable : ENEMIES.filter((e) => !e.boss);
  return final[Math.floor(Math.random() * final.length)];
}

export function bossForTier(tier) {
  const bosses = ENEMIES.filter((e) => e.boss);
  let best = bosses[0];
  let bestD = 99;
  for (const b of bosses) {
    const d = Math.abs(b.tier - tier);
    if (d < bestD) { bestD = d; best = b; }
  }
  return best;
}
