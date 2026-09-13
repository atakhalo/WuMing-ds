// 世界地图 / 地点 / NPC / 任务

export const LOCATIONS = [
  {
    id: 'town',
    name: '无明镇',
    kind: 'town',
    x: 250,
    y: 392,
    unlocked: true,
    theme: { sky: '#2c2a35', ground: '#3a3226' },
    desc: '山坳里的小镇。青石街，酒旗斜。',
  },
  {
    id: 'bamboo',
    name: '幽篁竹海',
    kind: 'dungeon',
    tier: 1,
    floors: 2,
    x: 452,
    y: 300,
    unlocked: true,
    theme: { wall: '#1f2a20', floor: '#3c4c34', accent: '#6f8f5c' },
    desc: '竹影蔽日，风过如泣。常有山贼与野物出没。',
    requires: null,
  },
  {
    id: 'ruin',
    name: '落霞废宅',
    kind: 'dungeon',
    tier: 2,
    floors: 3,
    x: 640,
    y: 358,
    unlocked: false,
    theme: { wall: '#2c221c', floor: '#4d3c31', accent: '#a8714a' },
    desc: '主人早亡，宅子空了十年。夜里总有人影走动。',
    requires: 'q_bamboo',
  },
  {
    id: 'cave',
    name: '黑风洞',
    kind: 'dungeon',
    tier: 3,
    floors: 3,
    x: 500,
    y: 168,
    unlocked: false,
    theme: { wall: '#191921', floor: '#35353f', accent: '#7a6fa8' },
    desc: '洞口终年不散的黑雾。进去的人，少有回头。',
    requires: 'q_ruin',
  },
  {
    id: 'peak',
    name: '寒鸦峰',
    kind: 'dungeon',
    tier: 4,
    floors: 4,
    x: 754,
    y: 196,
    unlocked: false,
    theme: { wall: '#1d2429', floor: '#3d4950', accent: '#8fd0e8' },
    desc: '峰顶有雪，雪上有剑痕。剑痕里埋着旧事。',
    requires: 'q_cave',
  },
  {
    id: 'gates',
    name: '无明剑冢',
    kind: 'dungeon',
    tier: 5,
    floors: 3,
    x: 852,
    y: 372,
    unlocked: false,
    theme: { wall: '#221826', floor: '#3e2e3f', accent: '#c9a6ff' },
    desc: '传说中剑主埋剑之处。剑冢无门，只待有缘。',
    requires: 'q_peak',
  },
];

export function getLocation(id) {
  return LOCATIONS.find((l) => l.id === id) || LOCATIONS[0];
}

// 世界地图上地点之间的路径（仅用于绘制连线）
export const ROUTES = [
  ['town', 'bamboo'],
  ['bamboo', 'ruin'],
  ['bamboo', 'cave'],
  ['ruin', 'peak'],
  ['cave', 'peak'],
  ['peak', 'gates'],
];

export const NPCS = [
  {
    id: 'dummy',
    name: '木人桩',
    role: 'trial',
    x: 170,
    tint: '#8a6a4a',
    title: '练功桩',
    lines: [
      '（一具被砍得千疮百孔的木人桩。）',
      '可以在这里反复练习搓招，木人不会还手。',
    ],
  },
  {
    id: 'smith',
    name: '铁四',
    role: 'forge',
    x: 400,
    tint: '#a8543a',
    title: '铸剑师',
    lines: [
      '「剑好不好，不看刃，看握剑的人。」',
      '「拿来，我给你拾掇拾掇。」',
    ],
  },
  {
    id: 'mentor',
    name: '云隐',
    role: 'train',
    x: 650,
    tint: '#5c8d89',
    title: '授业师父',
    lines: [
      '「剑法不在多，在于连。」',
      '「轻者引之，重者断之。轻重相济，方成招。」',
    ],
  },
  {
    id: 'steward',
    name: '柳娘',
    role: 'quest',
    x: 900,
    tint: '#b23a3a',
    title: '镇守',
    lines: [
      '「镇子外头不太平，你若有胆，替我们走一遭。」',
    ],
  },
  {
    id: 'merchant',
    name: '胡商',
    role: 'shop',
    x: 1140,
    tint: '#d4a24c',
    title: '行脚商人',
    lines: [
      '「走南闯北，什么都卖，什么都收。」',
    ],
  },
];

export const QUESTS = [
  {
    id: 'q_bamboo',
    title: '竹海清贼',
    desc: '幽篁竹海盘踞着一伙山贼，去把他们的窝点清了。',
    goal: { kind: 'clear', loc: 'bamboo' },
    reward: { gold: 150, exp: 70, items: [{ id: 'jinchuang', n: 3 }] },
    unlocks: 'ruin',
    hint: '幽篁竹海：2 层，第 2 层有首领。',
  },
  {
    id: 'q_ruin',
    title: '废宅人影',
    desc: '落霞废宅夜夜有人影。去看看究竟是什么东西。',
    goal: { kind: 'clear', loc: 'ruin' },
    reward: { gold: 320, exp: 150, items: [{ id: 'dan', n: 2 }] },
    unlocks: 'cave',
    requires: 'q_bamboo',
    hint: '落霞废宅：3 层，尸傀皮糙肉厚，重招难破。',
  },
  {
    id: 'q_cave',
    title: '黑风洞底',
    desc: '黑风洞里传出钟声。洞底到底有什么？',
    goal: { kind: 'clear', loc: 'cave' },
    reward: { gold: 620, exp: 300, items: [{ id: 'dan', n: 4 }] },
    unlocks: 'peak',
    requires: 'q_ruin',
    hint: '黑风洞：3 层。刀疤僧出手极重，注意卸力。',
  },
  {
    id: 'q_peak',
    title: '寒鸦剑痕',
    desc: '峰顶的剑痕是谁留下的？上去看看。',
    goal: { kind: 'clear', loc: 'peak' },
    reward: { gold: 980, exp: 520, items: [{ id: 'dan', n: 6 }] },
    unlocks: 'gates',
    requires: 'q_cave',
    hint: '寒鸦峰：4 层。影卫统领的连斩不可硬接。',
  },
  {
    id: 'q_gates',
    title: '无明剑冢',
    desc: '传闻剑主未死。若真如此，去问他一剑。',
    goal: { kind: 'clear', loc: 'gates' },
    reward: { gold: 2000, exp: 1200, items: [{ id: 'dan', n: 10 }] },
    unlocks: null,
    requires: 'q_peak',
    hint: '无明剑冢：3 层。此行的尽头，是剑主。',
  },
];

export function getQuest(id) {
  return QUESTS.find((q) => q.id === id) || null;
}

// 属性点说明
export const ATTRS = [
  { id: 'str', name: '劲力', desc: '每点 +1.2% 招式伤害', color: '#e05c4a' },
  { id: 'vit', name: '体魄', desc: '每点 +8 气血上限', color: '#b23a3a' },
  { id: 'agi', name: '身法', desc: '每点 +0.8% 出招速度、+1 体力', color: '#5c8d89' },
  { id: 'int', name: '内息', desc: '每点 +4 内力上限、+0.6% 回气', color: '#4a7ba7' },
];

export function expForLevel(level) {
  return Math.floor(60 * Math.pow(1.42, level - 1));
}
