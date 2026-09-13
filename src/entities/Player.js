// 玩家：属性、养成、存档

import { BASE_MOVES, QI_MAX, STAM_MAX, INTENT } from '../data/skills.js';
import { getWeapon, getArmor, forgeBonus } from '../data/items.js';
import { expForLevel } from '../data/world.js';

const BASE_HP = 110;
const BASE_QI = 55;

export class Player {
  constructor() {
    this.reset();
  }

  reset() {
    this.name = '无名';
    this.level = 1;
    this.exp = 0;
    this.attrPoints = 2;
    this.attrs = { str: 0, vit: 0, agi: 0, int: 0 };

    this.gold = 60;
    this.weapon = 'wood';
    this.weaponLevel = 0;
    this.armor = 'cloth';
    this.weapons = ['wood'];
    this.armors = ['cloth'];

    // 初始只会两招，其余需向师父请教
    this.skills = ['liaoyun', 'jiemai'];
    this.items = { jinchuang: 3, xingqi: 2 };

    this.activeQuests = ['q_bamboo'];
    this.doneQuests = [];
    this.unlocked = ['town', 'bamboo'];

    this.kills = 0;
    this.deaths = 0;
    this.maxCombo = 0;
    this.bestFloor = 0;

    // 剑意：只在一次秘境探索内保留。
    // 回镇即清空（见 BaseScene.enter），故**不进存档**——刷新/重开都等于脱离了秘境
    this.intent = 0;

    // 气血与内力是「当前值」，不进存档，但必须给出初值：
    // 缺了 qi 会让读 P.qi 的地方算出 NaN（副本 HUD 曾显示「气 NaN/55」）
    this.hp = this.maxHp;
    this.qi = this.maxQi;
  }

  // ---------- 派生属性 ----------
  get weaponData() { return getWeapon(this.weapon); }
  get armorData() { return getArmor(this.armor); }
  get forge() { return forgeBonus(this.weaponLevel); }

  get maxHp() {
    return BASE_HP + (this.level - 1) * 12 + this.attrs.vit * 8 + this.armorData.hpMax;
  }
  get maxQi() {
    return BASE_QI + (this.level - 1) * 6 + this.attrs.int * 4 + this.weaponData.qiMax + this.forge.qi;
  }
  get maxStamina() {
    return STAM_MAX + this.attrs.agi * 1;
  }
  get maxIntent() { return INTENT.max; }
  get intentFull() { return this.intent >= INTENT.max; }
  get defense() {
    return this.armorData.def + this.weaponData.def + Math.floor(this.level * 0.4);
  }
  get attackMul() {
    return 1 + this.attrs.str * 0.012 + (this.level - 1) * 0.012;
  }
  // 出招时间倍率（越小越快）
  get speedMul() {
    return 1 / (1 + this.attrs.agi * 0.008);
  }
  get qiRegenMul() {
    return 1 + this.attrs.int * 0.006;
  }

  get lightDamage() {
    const base = BASE_MOVES.light.damage + this.weaponData.lightBonus + this.forge.light;
    return base * this.attackMul;
  }
  get heavyDamage() {
    const base = BASE_MOVES.heavy.damage + this.weaponData.heavyBonus + this.forge.heavy;
    return base * this.attackMul;
  }

  get expToNext() { return expForLevel(this.level); }

  // ---------- 成长 ----------
  addExp(n) {
    this.exp += n;
    let ups = 0;
    while (this.exp >= this.expToNext) {
      this.exp -= this.expToNext;
      this.level++;
      this.attrPoints += 2;
      ups++;
    }
    return ups;
  }

  spendAttr(id) {
    if (this.attrPoints <= 0 || !(id in this.attrs)) return false;
    this.attrs[id]++;
    this.attrPoints--;
    if (id === 'vit') this.hp = Math.min(this.hp + 8, this.maxHp);
    return true;
  }

  addItem(id, n = 1) {
    this.items[id] = (this.items[id] || 0) + n;
  }

  useItem(id) {
    if (!this.items[id] || this.items[id] <= 0) return false;
    this.items[id]--;
    if (this.items[id] <= 0) delete this.items[id];
    return true;
  }

  itemCount(id) { return this.items[id] || 0; }

  hasSkill(id) { return this.skills.includes(id); }

  learnSkill(id) {
    if (this.skills.includes(id)) return false;
    this.skills.push(id);
    return true;
  }

  // ---------- 存档 ----------
  toJSON() {
    return {
      name: this.name,
      level: this.level,
      exp: this.exp,
      attrPoints: this.attrPoints,
      attrs: { ...this.attrs },
      gold: this.gold,
      weapon: this.weapon,
      weaponLevel: this.weaponLevel,
      armor: this.armor,
      weapons: this.weapons.slice(),
      armors: this.armors.slice(),
      skills: this.skills.slice(),
      items: { ...this.items },
      activeQuests: this.activeQuests.slice(),
      doneQuests: this.doneQuests.slice(),
      unlocked: this.unlocked.slice(),
      kills: this.kills,
      deaths: this.deaths,
      maxCombo: this.maxCombo,
      bestFloor: this.bestFloor,
    };
  }

  load(data) {
    if (!data) return this;
    const keys = Object.keys(this.toJSON());
    for (const k of keys) {
      if (data[k] !== undefined) this[k] = data[k];
    }
    this.attrs = Object.assign({ str: 0, vit: 0, agi: 0, int: 0 }, data.attrs || {});
    this.items = Object.assign({}, data.items || {});
    // 剑意不进存档，读档一律归零（旧档里可能残留该字段，不能读进来）
    this.intent = 0;
    this.hp = this.maxHp;
    this.qi = this.maxQi;
    return this;
  }
}
