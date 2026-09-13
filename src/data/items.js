// 物品：武器 / 护具 / 丹药

export const WEAPONS = [
  {
    id: 'wood',
    name: '桃木剑',
    tier: 0,
    price: 0,
    desc: '削来练手的东西，好歹是柄剑。',
    lightBonus: 1,
    heavyBonus: 1,
    qiMax: 0,
    def: 0,
    tint: '#8a6a4a',
  },
  {
    id: 'iron',
    name: '精铁剑',
    tier: 1,
    price: 180,
    desc: '镇上铁铺的常货，刃口端正。',
    lightBonus: 3,
    heavyBonus: 4,
    qiMax: 8,
    def: 0,
    tint: '#9aa0a6',
  },
  {
    id: 'willow',
    name: '柳叶刀',
    tier: 2,
    price: 420,
    desc: '薄如柳叶，快而不滞。轻招尤为凌厉。',
    lightBonus: 8,
    heavyBonus: 4,
    qiMax: 6,
    def: 0,
    tint: '#b9c3c9',
  },
  {
    id: 'blackiron',
    name: '玄铁重剑',
    tier: 2,
    price: 460,
    desc: '重剑无锋，大巧不工。重招势大力沉。',
    lightBonus: 3,
    heavyBonus: 13,
    qiMax: 4,
    def: 2,
    tint: '#5a5f66',
  },
  {
    id: 'frost',
    name: '霜刃',
    tier: 3,
    price: 980,
    desc: '寒气逼人，出鞘即结薄霜。真气运转更畅。',
    lightBonus: 11,
    heavyBonus: 11,
    qiMax: 22,
    def: 1,
    tint: '#8fd0e8',
  },
  {
    id: 'wuming',
    name: '无明剑',
    tier: 4,
    price: 2200,
    desc: '剑身无铭，握之无光。据说是剑主佩剑。',
    lightBonus: 17,
    heavyBonus: 19,
    qiMax: 40,
    def: 5,
    tint: '#c9a6ff',
  },
];

export function getWeapon(id) {
  return WEAPONS.find((w) => w.id === id) || WEAPONS[0];
}

// 强化等级带来的加成
export function forgeBonus(level) {
  return {
    light: Math.floor(level * 1.5),
    heavy: Math.floor(level * 2),
    qi: level * 2,
  };
}

// 强化下一级的价格
export function forgePrice(weapon, level) {
  const base = 60 + weapon.tier * 70;
  return Math.floor(base * Math.pow(1.55, level));
}

export const ARMORS = [
  { id: 'cloth', name: '粗布衣', tier: 0, price: 0, desc: '家中旧衣。', hpMax: 0, def: 0 },
  { id: 'leather', name: '皮甲', tier: 1, price: 160, desc: '熟牛皮所制，略挡刀锋。', hpMax: 20, def: 2 },
  { id: 'chain', name: '锁子甲', tier: 2, price: 480, desc: '细环相扣，轻便坚韧。', hpMax: 45, def: 5 },
  { id: 'silk', name: '天蚕丝衣', tier: 3, price: 1100, desc: '柔韧无比，刀枪难入。', hpMax: 80, def: 9 },
];

export function getArmor(id) {
  return ARMORS.find((a) => a.id === id) || ARMORS[0];
}

export const ITEMS = [
  {
    id: 'jinchuang',
    name: '金创药',
    kind: 'heal',
    price: 30,
    value: 45,
    desc: '即刻回复 45 点气血。',
    battleUsable: true,
  },
  {
    id: 'xingqi',
    name: '行气散',
    kind: 'qi',
    price: 26,
    value: 40,
    desc: '即刻回复 40 点内力。',
    battleUsable: true,
  },
  {
    id: 'dan',
    name: '小还丹',
    kind: 'heal',
    price: 70,
    value: 120,
    desc: '即刻回复 120 点气血。',
    battleUsable: true,
  },
];

export function getItem(id) {
  return ITEMS.find((i) => i.id === id) || null;
}

// 副本内的掉落表
export function rollDrop(tier) {
  const pool = [
    { id: 'jinchuang', w: 10 },
    { id: 'xingqi', w: 8 },
    { id: 'dan', w: tier >= 3 ? 6 : 2 },
  ];
  let total = pool.reduce((a, p) => a + p.w, 0);
  let r = Math.random() * total;
  for (const p of pool) {
    r -= p.w;
    if (r <= 0) return p.id;
  }
  return 'jinchuang';
}
