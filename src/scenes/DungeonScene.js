// 副本场景：格子地图探索

import {
  PAL, FONT, clamp, lerp, rand, randInt, hash2, fillRect, text,
  roundRectPath, strokeText, easeOutQuad, bar,
} from '../core/utils.js';
import { isDown, justPressed, isAnyDown } from '../core/input.js';
import { getLocation, getQuest, QUESTS } from '../data/world.js';
import { rollEnemyForTier, bossForTier, getEnemy } from '../data/enemies.js';
import { getItem, rollDrop } from '../data/items.js';
import { drawFigure, keyCap } from '../ui/widgets.js';
import { renderCharPanel } from '../ui/charPanel.js';
import { sfx } from '../core/audio.js';

const TS = 40;
const MW = 34;
const MH = 24;
const STEP_DUR = 0.145;
const SIGHT_R = 8.6;

export class DungeonScene {
  constructor(game) {
    this.game = game;
    this.map = null;
    this.showChar = false;   // 按 C 查看人物信息（打开时整张地图冻结）
    this._onBattleEnd = this._onBattleEnd.bind(this);
  }

  enter(args = {}) {
    this.showChar = false;
    if (args.resume && this.map) {
      this.battleCooldown = 1.1;
      this.flash = { text: '归来', t: 0, color: PAL.jadeHi };
      return;
    }
    this.generate(args);
  }

  // ---------------- 生成 ----------------
  generate(args) {
    this.locId = args.locId || 'bamboo';
    this.loc = getLocation(this.locId);
    this.tier = this.loc.tier;
    this.floor = args.floor || 1;
    this.totalFloors = this.loc.floors;
    this.isBossFloor = this.floor >= this.totalFloors;
    this.theme = this.loc.theme || { wall: '#2c2b26', floor: '#3a3630', accent: '#6f8f5c' };

    this.map = new Uint8Array(MW * MH);
    this.explored = new Uint8Array(MW * MH);
    this.decor = new Uint8Array(MW * MH);
    this.rooms = [];
    this.enemies = [];
    this.pickups = [];
    this.exit = null;
    this.pendingBoss = null;

    this.buildRooms();
    this.connectRooms();
    this.placeStuff();

    const start = this.rooms[0];
    this.spawn = { x: start.cx, y: start.cy };
    this.tx = start.cx;
    this.ty = start.cy;
    this.px = (start.cx + 0.5) * TS;
    this.py = (start.cy + 0.5) * TS;
    this.facing = 1;
    this.moving = null;
    this.stepT = 0;
    this.animT = 0;
    this.battleCooldown = 1.2;
    // 剑意随一次秘境探索而生灭：踏进第一层即从零开始
    // （回镇时已经清过，这里是双保险，防止日后新增入口时漏清）
    if (this.floor === 1) this.game.player.intent = 0;
    this.reveal();
    this.cam = { x: 0, y: 0 };
    this.snapCam();
    this.flash = { text: `${this.loc.name} · 第 ${this.floor} 层`, t: 0, color: PAL.paper };
    this.bossWarned = false;
  }

  idx(x, y) { return y * MW + x; }

  isWall(x, y) {
    if (x < 0 || y < 0 || x >= MW || y >= MH) return true;
    return this.map[this.idx(x, y)] === 0;
  }

  buildRooms() {
    const target = randInt(8, 11);
    let tries = 0;
    while (this.rooms.length < target && tries < 600) {
      tries++;
      const w = randInt(4, 8);
      const h = randInt(3, 6);
      const x = randInt(1, MW - w - 2);
      const y = randInt(1, MH - h - 2);
      const r = { x, y, w, h, cx: Math.floor(x + w / 2), cy: Math.floor(y + h / 2) };
      let bad = false;
      for (const o of this.rooms) {
        if (r.x < o.x + o.w + 1 && r.x + r.w + 1 > o.x && r.y < o.y + o.h + 1 && r.y + r.h + 1 > o.y) {
          bad = true; break;
        }
      }
      if (bad) continue;
      this.rooms.push(r);
      for (let yy = y; yy < y + h; yy++) {
        for (let xx = x; xx < x + w; xx++) {
          this.map[this.idx(xx, yy)] = 1;
        }
      }
    }
    // 房间太少时补几个小巧的隔间
    if (this.rooms.length < 5) {
      for (let t = 0; t < 40 && this.rooms.length < 5; t++) {
        const w = 3, h = 3;
        const x = randInt(1, MW - w - 2);
        const y = randInt(1, MH - h - 2);
        let bad = false;
        for (const o of this.rooms) {
          if (x < o.x + o.w + 1 && x + w + 1 > o.x && y < o.y + o.h + 1 && y + h + 1 > o.y) { bad = true; break; }
        }
        if (bad) continue;
        const r = { x, y, w, h, cx: x + 1, cy: y + 1 };
        this.rooms.push(r);
        for (let yy = y; yy < y + h; yy++) {
          for (let xx = x; xx < x + w; xx++) this.map[this.idx(xx, yy)] = 1;
        }
      }
    }
  }

  hCorridor(x1, x2, y) {
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
      if (x >= 0 && x < MW && y >= 0 && y < MH) this.map[this.idx(x, y)] = 1;
    }
  }

  vCorridor(y1, y2, x) {
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
      if (x >= 0 && x < MW && y >= 0 && y < MH) this.map[this.idx(x, y)] = 1;
    }
  }

  connectRooms() {
    for (let i = 1; i < this.rooms.length; i++) {
      const a = this.rooms[i - 1];
      const b = this.rooms[i];
      if (Math.random() < 0.5) {
        this.hCorridor(a.cx, b.cx, a.cy);
        this.vCorridor(a.cy, b.cy, b.cx);
      } else {
        this.vCorridor(a.cy, b.cy, a.cx);
        this.hCorridor(a.cx, b.cx, b.cy);
      }
    }
    // 额外回环，避免死路太多
    const extra = randInt(1, 3);
    for (let i = 0; i < extra; i++) {
      const a = this.rooms[randInt(0, this.rooms.length - 1)];
      const b = this.rooms[randInt(0, this.rooms.length - 1)];
      if (a === b) continue;
      this.hCorridor(a.cx, b.cx, a.cy);
      this.vCorridor(a.cy, b.cy, b.cx);
    }
  }

  freeTileIn(room, minDistFromSpawn) {
    for (let t = 0; t < 30; t++) {
      const x = randInt(room.x + 1, room.x + room.w - 2);
      const y = randInt(room.y + 1, room.y + room.h - 2);
      if (this.isWall(x, y)) continue;
      if (occupied(x, y, this.enemies) || occupied(x, y, this.pickups)) continue;
      return { x, y };
    }
    return null;
  }

  placeStuff() {
    const rooms = this.rooms;
    const spawnRoom = rooms[0];

    // 出口：离出生房间最远
    let far = rooms[1] || rooms[0];
    let bestD = -1;
    for (let i = 1; i < rooms.length; i++) {
      const d = Math.abs(rooms[i].cx - spawnRoom.cx) + Math.abs(rooms[i].cy - spawnRoom.cy);
      if (d > bestD) { bestD = d; far = rooms[i]; }
    }
    this.exit = { x: far.cx, y: far.cy };

    // 敌人（避开出生房间，且与出生点保持距离，别一进图就贴脸）
    const baseCount = 4 + Math.floor(this.tier * 1.4) + Math.floor(this.floor * 0.8);
    const count = Math.min(16, baseCount + randInt(-1, 2));
    for (let i = 0; i < count; i++) {
      const room = rooms[randInt(1, rooms.length - 1)];
      if (!room) continue;
      const pos = this.freeTileIn(room);
      if (!pos) continue;
      if (Math.hypot(pos.x - spawnRoom.cx, pos.y - spawnRoom.cy) < 6.5) continue;
      if (Math.abs(pos.x - this.exit.x) < 2 && Math.abs(pos.y - this.exit.y) < 2) continue;
      const def = rollEnemyForTier(this.tier, false);
      this.enemies.push(this.makeEnemy(def, pos.x, pos.y, room));
    }

    // Boss 层：出口旁放 Boss
    if (this.isBossFloor) {
      const bd = bossForTier(this.tier);
      const bx = clamp(this.exit.x + randInt(-3, 3), 2, MW - 3);
      const by = clamp(this.exit.y + randInt(-3, 3), 2, MH - 3);
      const spot = this.findNear(bx, by);
      if (spot) {
        const boss = this.makeEnemy(bd, spot.x, spot.y, far);
        boss.isBoss = true;
        this.enemies.push(boss);
        this.pendingBoss = boss;
      }
    }

    // 宝箱 / 草药
    const chests = randInt(2, 3);
    for (let i = 0; i < chests; i++) {
      const room = rooms[randInt(1, rooms.length - 1)];
      const pos = room && this.freeTileIn(room);
      if (pos) this.pickups.push({ x: pos.x, y: pos.y, kind: 'chest', taken: false, room });
    }
    const herbs = randInt(2, 4);
    for (let i = 0; i < herbs; i++) {
      const room = rooms[randInt(0, rooms.length - 1)];
      const pos = room && this.freeTileIn(room);
      if (pos) this.pickups.push({ x: pos.x, y: pos.y, kind: 'herb', taken: false, room });
    }
  }

  findNear(x, y) {
    for (let r = 0; r < 6; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx, ny = y + dy;
          if (this.isWall(nx, ny)) continue;
          return { x: nx, y: ny };
        }
      }
    }
    return null;
  }

  makeEnemy(def, x, y, room) {
    return {
      def,
      tx: x, ty: y,
      px: (x + 0.5) * TS,
      py: (y + 0.5) * TS,
      home: room ? { x: room.cx, y: room.cy } : { x, y },
      moving: null,
      stepT: 0,
      think: rand(0.2, 1.2),
      facing: 1,
      animT: Math.random() * 3,
      mode: 'patrol',
      awake: false,
      dead: false,
    };
  }

  // ---------------- 更新 ----------------
  update(dt) {
    // 人物面板打开时整张地图冻结（包括巡逻的敌人），看信息不吃亏
    if (this.showChar) {
      if (justPressed('KeyC') || justPressed('KeyI') || justPressed('Escape')) {
        this.showChar = false;
        sfx.ui();
      }
      return;
    }

    this.animT += dt;
    if (this.flash) {
      this.flash.t += dt;
      if (this.flash.t > 2.0) this.flash = null;
    }
    if (this.battleCooldown > 0) this.battleCooldown -= dt;
    if (this.game.player.hp <= 0) this.game.player.hp = 1;

    this.updatePlayer(dt);
    this.updateEnemies(dt);
    this.updateCam(dt);
    this.checkPickups();

    // 随时可查人物信息（C / I）
    if (justPressed('KeyC') || justPressed('KeyI')) {
      this.showChar = true;
      sfx.ui();
      return;
    }

    if (justPressed('Escape')) {
      this.game.toast('离开副本，进度不保。', PAL.crimsonHi);
      this.game.run = null;
      this.game.goto('world');
    }

    // Boss 警示
    if (this.pendingBoss && !this.bossWarned) {
      const b = this.pendingBoss;
      if (Math.hypot(b.px - this.px, b.py - this.py) < 5 * TS) {
        this.bossWarned = true;
        this.flash = { text: `强敌气息：${b.def.name}`, t: 0, color: PAL.crimsonHi };
        sfx.fail();
      }
    }
  }

  updatePlayer(dt) {
    const P = this.game.player;
    if (this.moving) {
      this.stepT += dt / STEP_DUR;
      if (this.stepT >= 1) {
        this.tx = this.moving.tx;
        this.ty = this.moving.ty;
        this.px = (this.tx + 0.5) * TS;
        this.py = (this.ty + 0.5) * TS;
        this.moving = null;
        this.stepT = 0;
        this.reveal();
        this.onArrive();
      } else {
        const k = easeOutQuad(this.stepT);
        this.px = lerp(this.moving.sx, (this.moving.tx + 0.5) * TS, k);
        this.py = lerp(this.moving.sy, (this.moving.ty + 0.5) * TS, k);
      }
      return;
    }

    if (this.battleCooldown > 0) return;

    let dx = 0, dy = 0;
    if (isAnyDown(['KeyA', 'ArrowLeft'])) dx = -1;
    else if (isAnyDown(['KeyD', 'ArrowRight'])) dx = 1;
    else if (isAnyDown(['KeyW', 'ArrowUp'])) dy = -1;
    else if (isAnyDown(['KeyS', 'ArrowDown'])) dy = 1;
    if (!dx && !dy) return;

    if (dx !== 0) this.facing = dx;
    const nx = this.tx + dx;
    const ny = this.ty + dy;
    if (this.isWall(nx, ny)) {
      sfx.step();
      return;
    }
    this.moving = { tx: nx, ty: ny, sx: this.px, sy: this.py };
    this.stepT = 0;
    sfx.step();
  }

  updateEnemies(dt) {
    const P = this.game.player;
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.animT += dt;

      if (e.moving) {
        e.stepT += dt / (STEP_DUR * 1.55);
        if (e.stepT >= 1) {
          e.tx = e.moving.tx;
          e.ty = e.moving.ty;
          e.px = (e.tx + 0.5) * TS;
          e.py = (e.ty + 0.5) * TS;
          e.moving = null;
          e.stepT = 0;
        } else {
          const k = easeOutQuad(e.stepT);
          e.px = lerp(e.moving.sx, (e.moving.tx + 0.5) * TS, k);
          e.py = lerp(e.moving.sy, (e.moving.ty + 0.5) * TS, k);
        }
        continue;
      }

      const d = Math.hypot(e.px - this.px, e.py - this.py);
      const detect = e.def.boss ? 7.5 * TS : 5.2 * TS;

      if (d < detect) { e.awake = true; e.mode = 'chase'; }
      else if (e.awake && d > detect * 1.9) { e.awake = false; e.mode = 'patrol'; }

      // 接战
      if (d < TS * 0.86 && this.battleCooldown <= 0) {
        this.startBattle(e);
        return;
      }

      e.think -= dt;
      if (e.think > 0) continue;
      e.think = e.mode === 'chase' ? rand(0.16, 0.3) : rand(0.5, 1.3);

      let dir = null;
      if (e.mode === 'chase') {
        const dx = this.tx - e.tx;
        const dy = this.ty - e.ty;
        const opts = [];
        if (Math.abs(dx) > 0) opts.push({ x: Math.sign(dx), y: 0, w: 3 });
        if (Math.abs(dy) > 0) opts.push({ x: 0, y: Math.sign(dy), w: 3 });
        opts.push({ x: randInt(-1, 1), y: 0, w: 1 });
        opts.push({ x: 0, y: randInt(-1, 1), w: 1 });
        const valid = opts.filter((o) => (o.x || o.y) && !this.isWall(e.tx + o.x, e.ty + o.y));
        if (valid.length) {
          let total = valid.reduce((a, o) => a + o.w, 0);
          let r = Math.random() * total;
          for (const o of valid) { r -= o.w; if (r <= 0) { dir = o; break; } }
          if (!dir) dir = valid[0];
        }
      } else {
        // 巡逻：在出生房间附近游走
        const distHome = Math.abs(e.tx - e.home.x) + Math.abs(e.ty - e.home.y);
        const tries = [
          { x: randInt(-1, 1), y: 0 },
          { x: 0, y: randInt(-1, 1) },
        ];
        for (const o of tries) {
          if (!(o.x || o.y)) continue;
          if (this.isWall(e.tx + o.x, e.ty + o.y)) continue;
          if (distHome > 4) {
            const backX = Math.sign(e.home.x - e.tx);
            const backY = Math.sign(e.home.y - e.ty);
            if (Math.abs(e.home.x - e.tx) > Math.abs(e.home.y - e.ty)) { o.x = backX; o.y = 0; }
            else { o.x = 0; o.y = backY; }
            if (this.isWall(e.tx + o.x, e.ty + o.y)) continue;
          }
          dir = o;
          break;
        }
      }

      if (dir && (dir.x || dir.y)) {
        e.moving = { tx: e.tx + dir.x, ty: e.ty + dir.y, sx: e.px, sy: e.py };
        e.stepT = 0;
        if (dir.x !== 0) e.facing = dir.x;
      }
    }
  }

  updateCam(dt) {
    const W = this.game.W, H = this.game.H;
    const txx = clamp(this.px - W / 2, 0, MW * TS - W);
    const tyy = clamp(this.py - H / 2, 0, MH * TS - H);
    this.cam.x = lerp(this.cam.x, txx, clamp(dt * 7, 0, 1));
    this.cam.y = lerp(this.cam.y, tyy, clamp(dt * 7, 0, 1));
  }

  snapCam() {
    const W = this.game.W, H = this.game.H;
    this.cam.x = clamp(this.px - W / 2, 0, MW * TS - W);
    this.cam.y = clamp(this.py - H / 2, 0, MH * TS - H);
  }

  reveal() {
    const R = Math.ceil(SIGHT_R);
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dy * dy > SIGHT_R * SIGHT_R) continue;
        const x = this.tx + dx, y = this.ty + dy;
        if (x < 0 || y < 0 || x >= MW || y >= MH) continue;
        this.explored[this.idx(x, y)] = 1;
      }
    }
  }

  onArrive() {
    // 出口
    if (this.exit && this.tx === this.exit.x && this.ty === this.exit.y) {
      if (this.isBossFloor && this.pendingBoss && !this.pendingBoss.dead) {
        this.flash = { text: '先解决眼前的对手', t: 0, color: PAL.crimsonHi };
        return;
      }
      this.useExit();
      return;
    }
    // 拾取
    for (const p of this.pickups) {
      if (!p.taken && p.x === this.tx && p.y === this.ty) this.takePickup(p);
    }
  }

  checkPickups() {
    for (const p of this.pickups) {
      if (!p.taken && p.x === this.tx && p.y === this.ty) this.takePickup(p);
    }
  }

  takePickup(p) {
    p.taken = true;
    const P = this.game.player;
    if (p.kind === 'chest') {
      if (Math.random() < 0.45) {
        const id = rollDrop(this.tier);
        P.addItem(id, 1);
        const it = getItem(id);
        this.flash = { text: `箱中：${it ? it.name : id}`, t: 0, color: PAL.jadeHi };
        this.game.toast(`拾得 ${it ? it.name : id}`, PAL.jadeHi);
      } else {
        const g = randInt(20, 40) + this.tier * 18;
        P.gold += g;
        this.flash = { text: `箱中：银两 +${g}`, t: 0, color: PAL.gold };
        this.game.toast(`拾得银两 +${g}`, PAL.gold);
      }
    } else {
      const heal = Math.round(P.maxHp * 0.18) + 8;
      P.hp = Math.min(P.maxHp, P.hp + heal);
      this.flash = { text: `草药：气血 +${heal}`, t: 0, color: '#7ce08a' };
      this.game.toast(`服下草药，气血 +${heal}`, '#7ce08a');
    }
    sfx.pickup();
    this.game.save();
  }

  // ---------------- 战斗 ----------------
  startBattle(enemy) {
    this.battleCooldown = 2.2;
    this.currentEnemy = enemy;
    const isBossFight = !!enemy.isBoss;
    this.game.goto('battle', {
      enemyId: enemy.def.id,
      tier: enemy.isBoss ? enemy.def.tier : this.tier,
      theme: this.theme,
      onEnd: this._onBattleEnd,
    });
  }

  _onBattleEnd(res) {
    const e = this.currentEnemy;
    const P = this.game.player;
    const back = () => {
      this.battleCooldown = 1.6;
      this.game.goto('dungeon', { resume: true });
    };

    if (res.result === 'victory' && e) {
      e.dead = true;
      P.kills++;
      if (e.isBoss) {
        this.pendingBoss = null;
        this.game.toast(`${e.def.name} 已伏诛`, '#ffd76a');
      }
      back();
    } else if (res.result === 'defeat') {
      this.game.run = null;
      this.game.player.deaths++;
      const lost = Math.floor(P.gold * 0.25);
      P.gold = Math.max(0, P.gold - lost);
      P.hp = Math.max(1, Math.round(P.maxHp * 0.4));
      this.game.save();
      this.game.toast(lost > 0 ? `败北，失落银两 ${lost}` : '败北', PAL.crimsonHi);
      this.game.goto('base');
    } else {
      // 逃跑：被推离一格
      const dx = Math.sign(this.px - e.px) || 1;
      const nx = clamp(this.tx - dx, 1, MW - 2);
      if (!this.isWall(nx, this.ty)) {
        this.tx = nx;
        this.px = (nx + 0.5) * TS;
      }
      this.game.toast('你脱离了战斗', PAL.paperDim);
      back();
    }
  }

  useExit() {
    const P = this.game.player;
    if (this.floor >= this.totalFloors) {
      this.finishDungeon();
      return;
    }
    P.hp = Math.min(P.maxHp, P.hp + Math.round(P.maxHp * 0.22));
    const r = this.game.run;
    if (r) r.floor = this.floor + 1;
    this.game.toast(`踏入更深一层（气血稍复）`, PAL.jadeHi);
    sfx.pickup();
    this.game.goto('dungeon', {
      locId: this.locId,
      floor: this.floor + 1,
    });
  }

  finishDungeon() {
    const P = this.game.player;
    const loc = this.loc;
    const gold = 90 + loc.tier * 130 + randInt(0, 60);
    const exp = 60 + loc.tier * 90;
    P.gold += gold;
    const ups = P.addExp(exp);
    P.bestFloor = Math.max(P.bestFloor, loc.tier);

    // 任务完成
    const quest = QUESTS.find((q) => q.goal.loc === this.locId && !P.doneQuests.includes(q.id));
    let questMsg = null;
    if (quest) {
      P.doneQuests.push(quest.id);
      const ai = P.activeQuests.indexOf(quest.id);
      if (ai >= 0) P.activeQuests.splice(ai, 1);
      P.gold += quest.reward.gold;
      P.addExp(quest.reward.exp);
      for (const it of quest.reward.items) P.addItem(it.id, it.n);
      if (quest.unlocks && !P.unlocked.includes(quest.unlocks)) {
        P.unlocked.push(quest.unlocks);
        const nl = getLocation(quest.unlocks);
        questMsg = `新地点开启：${nl.name}`;
      }
      const next = QUESTS.find((q) => q.requires === quest.id);
      if (next && !P.activeQuests.includes(next.id) && !P.doneQuests.includes(next.id)) {
        P.activeQuests.push(next.id);
        if (!questMsg) questMsg = `新委托：${next.title}`;
      }
    }

    this.game.run = null;
    this.game.save();
    if (ups > 0) {
      sfx.levelUp();
      this.game.toast(`修为精进！等级 ${P.level}`, '#ffd76a');
    }
    this.game.goto('result', {
      title: '副本通关',
      subtitle: loc.name,
      lines: [
        `历练 +${exp}`,
        `银两 +${gold}`,
        quest ? `任务完成：${quest.title}` : null,
        questMsg,
      ].filter(Boolean),
    });
  }

  // ---------------- 渲染 ----------------
  render(ctx) {
    const W = this.game.W, H = this.game.H;
    const t = this.theme;

    ctx.fillStyle = '#0a0806';
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(-Math.round(this.cam.x), -Math.round(this.cam.y));
    this.renderMap(ctx);
    this.renderPickups(ctx);
    this.renderEnemies(ctx);
    this.renderPlayer(ctx);
    ctx.restore();

    // 边缘暗角
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.36, W / 2, H / 2, H * 0.86);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.72)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    this.renderUI(ctx);
    if (this.showChar) {
      const P = this.game.player;
      renderCharPanel(ctx, W, H, P, {
        hp: P.hp, maxHp: P.maxHp,
        qi: P.qi, maxQi: P.maxQi,
        intent: P.intent, maxIntent: P.maxIntent,
        showStam: false,      // 体力是战斗内资源，走图时没有意义
        tip: '剑意随本次秘境探索而生灭，出秘境即散',
      });
    }
  }

  renderMap(ctx) {
    const W = this.game.W, H = this.game.H;
    const t = this.theme;
    const x0 = Math.max(0, Math.floor(this.cam.x / TS) - 1);
    const x1 = Math.min(MW - 1, Math.ceil((this.cam.x + W) / TS) + 1);
    const y0 = Math.max(0, Math.floor(this.cam.y / TS) - 1);
    const y1 = Math.min(MH - 1, Math.ceil((this.cam.y + H) / TS) + 1);

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = this.idx(x, y);
        const px = x * TS, py = y * TS;
        const seen = this.explored[i];

        if (!seen) {
          ctx.fillStyle = '#070605';
          ctx.fillRect(px, py, TS, TS);
          continue;
        }

        const dgr = Math.hypot(x + 0.5 - (this.px / TS), y + 0.5 - (this.py / TS));
        const inSight = dgr < SIGHT_R;
        // 视野内最亮，边缘柔和过渡；已探索但离开视野则压暗
        const edge = inSight ? clamp((SIGHT_R - dgr) / 2.4, 0, 1) : 0;
        const dim = inSight ? lerp(0.52, 1, edge) : 0.4;

        if (this.map[i] === 0) {
          ctx.fillStyle = shade(t.wall || '#2c2b26', dim * 0.78);
          ctx.fillRect(px, py, TS, TS);
          const topOpen = y > 0 && this.map[this.idx(x, y - 1)] === 1;
          if (topOpen) {
            ctx.fillStyle = shade(t.accent || '#6f8f5c', dim * 0.42);
            ctx.fillRect(px, py, TS, 3);
          }
          ctx.fillStyle = `rgba(0,0,0,${0.28 * dim})`;
          ctx.fillRect(px, py + TS - 5, TS, 5);
        } else {
          const n = hash2(x, y, 7);
          ctx.fillStyle = shade(t.floor || '#3a3630', dim);
          ctx.fillRect(px, py, TS, TS);
          ctx.fillStyle = `rgba(255,255,255,${0.028 * dim})`;
          ctx.fillRect(px + n * 24, py + hash2(x, y, 3) * 24, 3, 2);
          if (hash2(x, y, 11) > 0.9) {
            ctx.fillStyle = shade(t.accent || '#6f8f5c', dim * 0.34);
            ctx.fillRect(px + 10 + n * 12, py + 14 + n * 10, 5, 2);
          }
          ctx.strokeStyle = `rgba(0,0,0,${0.20 * dim})`;
          ctx.lineWidth = 1;
          ctx.strokeRect(px + 0.5, py + 0.5, TS - 1, TS - 1);
        }

        if (!inSight) {
          ctx.fillStyle = `rgba(6,5,4,${0.42 + (1 - dim) * 0.3})`;
          ctx.fillRect(px, py, TS, TS);
        }
      }
    }

    // 出口
    if (this.exit && this.explored[this.idx(this.exit.x, this.exit.y)]) {
      const ex = (this.exit.x + 0.5) * TS;
      const ey = (this.exit.y + 0.5) * TS;
      const pulse = 0.55 + Math.sin(this.game.time * 3) * 0.45;
      ctx.save();
      ctx.globalAlpha = 0.55 + pulse * 0.35;
      const g = ctx.createRadialGradient(ex, ey, 2, ex, ey, 30);
      g.addColorStop(0, 'rgba(140,220,255,0.85)');
      g.addColorStop(1, 'rgba(140,220,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(ex, ey, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = 'rgba(180,235,255,0.8)';
      ctx.lineWidth = 1.6;
      for (let i = 0; i < 3; i++) {
        const rr = 8 + i * 6 + Math.sin(this.game.time * 2.4 + i) * 3;
        ctx.beginPath();
        ctx.arc(ex, ey, rr, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  renderPickups(ctx) {
    for (const p of this.pickups) {
      if (p.taken) continue;
      if (!this.explored[this.idx(p.x, p.y)]) continue;
      const x = (p.x + 0.5) * TS;
      const y = (p.y + 0.5) * TS;
      const bob = Math.sin(this.game.time * 2.6 + p.x) * 3;
      if (p.kind === 'chest') {
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(x, y + 12, 13, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#6a4a26';
        ctx.fillRect(x - 12, y - 8 + bob, 24, 17);
        ctx.fillStyle = '#8a6234';
        ctx.fillRect(x - 12, y - 12 + bob, 24, 6);
        ctx.fillStyle = PAL.gold;
        ctx.fillRect(x - 3, y - 4 + bob, 6, 8);
        ctx.strokeStyle = 'rgba(255,220,140,0.55)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x - 12.5, y - 12.5 + bob, 25, 22);
        ctx.restore();
      } else {
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(x, y + 11, 10, 3.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#5aa35c';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y + 10 + bob);
        ctx.lineTo(x, y - 2 + bob);
        ctx.stroke();
        ctx.fillStyle = '#6fc06a';
        for (let i = 0; i < 3; i++) {
          const a = -1.5 + i * 0.9;
          ctx.beginPath();
          ctx.ellipse(x + Math.cos(a) * 7, y - 2 + bob + Math.sin(a) * 5, 6, 3.4, a, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }
  }

  renderEnemies(ctx) {
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.px - this.px, e.py - this.py);
      if (d > 9 * TS) continue;
      if (!this.explored[this.idx(clamp(e.tx, 0, MW - 1), clamp(e.ty, 0, MH - 1))]) continue;

      drawFigure(ctx, e.px, e.py + 12, {
        scale: (e.def.size || 1) * 0.92,
        facing: e.facing,
        pose: e.moving ? 'walk' : 'idle',
        t: e.animT,
        bodyColor: e.def.bodyColor,
        accentColor: e.def.accentColor,
        skinColor: e.def.boss ? '#c9a98a' : '#c2a888',
        sashColor: e.def.boss ? '#7a2020' : '#4a4030',
        bladeColor: e.def.boss ? '#e8d9a0' : '#b8bcc0',
        guardColor: e.def.boss ? '#e05c4a' : '#8a6a2f',
        bladeLength: e.def.boss ? 50 : 42,
      });

      if (e.def.boss) {
        ctx.save();
        ctx.globalAlpha = 0.6 + Math.sin(this.game.time * 5) * 0.3;
        ctx.strokeStyle = '#e05c4a';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(e.px, e.py + 2, 24, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      } else if (e.awake) {
        ctx.save();
        ctx.globalAlpha = 0.85;
        strokeText(ctx, '!', e.px, e.py - 62, { size: 17, color: '#ff9a6b', outline: 3 });
        ctx.restore();
      }
    }
  }

  renderPlayer(ctx) {
    const P = this.game.player;
    const bob = this.moving ? Math.abs(Math.sin(this.stepT * Math.PI * 2)) * 2 : Math.sin(this.animT * 2.2) * 1.2;
    drawFigure(ctx, this.px, this.py + 12, {
      scale: 0.95,
      facing: this.facing,
      pose: this.moving ? 'walk' : 'idle',
      t: this.animT,
      bodyColor: '#3d4a5c',
      accentColor: '#26303c',
      sashColor: PAL.crimson,
      bladeColor: P.weaponData.tint,
      bladeLength: 44,
    });
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = 'rgba(140,220,255,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(this.px, this.py + 13, 20, 8, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  renderUI(ctx) {
    const W = this.game.W, H = this.game.H;
    const P = this.game.player;

    // 左上信息
    ctx.save();
    roundRectPath(ctx, 14, 12, 258, 70, 5);
    ctx.fillStyle = 'rgba(12,10,8,0.8)';
    ctx.fill();
    ctx.strokeStyle = PAL.line2;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    text(ctx, this.loc.name, 26, 34, { size: 16, weight: 700, color: PAL.paper });
    text(ctx, `第 ${this.floor} / ${this.totalFloors} 层${this.isBossFloor ? ' · 首领' : ''}`,
      26, 54, { size: 12, color: this.isBossFloor ? PAL.crimsonHi : PAL.paperDim });

    // 气血与内力并排；数字叠在条内，避免与另一条抢横向空间
    const barY = 60, barH = 11, barW = 112;
    const hpR = clamp(P.hp / P.maxHp, 0, 1);
    const qiR = clamp(P.qi / P.maxQi, 0, 1);

    bar(ctx, 26, barY, barW, barH, hpR, hpR > 0.35 ? '#b23a3a' : '#e05c4a', { r: 3, flat: true });
    text(ctx, `血 ${Math.ceil(P.hp)}/${P.maxHp}`, 26 + barW / 2, barY + barH / 2 + 0.5, {
      size: 10, align: 'center', baseline: 'middle', color: 'rgba(255,255,255,0.94)',
    });

    bar(ctx, 146, barY, barW, barH, qiR, PAL.qi, { r: 3, flat: true });
    text(ctx, `气 ${Math.floor(P.qi)}/${P.maxQi}`, 146 + barW / 2, barY + barH / 2 + 0.5, {
      size: 10, align: 'center', baseline: 'middle', color: 'rgba(255,255,255,0.94)',
    });

    // 剑意是秘境内的资源，走图时也要能看见攒到哪了
    const intentR = clamp(P.intent / P.maxIntent, 0, 1);
    const intentFull = P.intent >= P.maxIntent;
    bar(ctx, 266, barY, barW, barH, intentR, '#c9a6ff', {
      r: 3, flat: true,
      border: intentFull ? 'rgba(233,214,255,0.95)' : 'rgba(0,0,0,0.55)',
    });
    text(ctx, `意 ${Math.floor(P.intent)}/${P.maxIntent}`, 266 + barW / 2, barY + barH / 2 + 0.5, {
      size: 10, align: 'center', baseline: 'middle', color: 'rgba(255,255,255,0.94)',
    });

    // 小地图
    this.renderMinimap(ctx);

    // 底部提示
    ctx.save();
    ctx.globalAlpha = 0.72;
    const hint = 'WASD / 方向键 移动    ·    走到传送光门进入下一层    ·    C 人物    ·    Esc 撤离';
    text(ctx, hint, W / 2, H - 16, { size: 12, align: 'center', color: PAL.paperDim });
    ctx.restore();

    // 层名闪光
    if (this.flash) {
      const k = this.flash.t / 2.0;
      const a = k < 0.1 ? k / 0.1 : 1 - Math.pow(clamp((k - 0.5) / 0.5, 0, 1), 2);
      ctx.save();
      ctx.globalAlpha = clamp(a, 0, 1);
      strokeText(ctx, this.flash.text, W / 2, 118, {
        size: 26, color: this.flash.color, outline: 4,
      });
      ctx.restore();
    }
  }

  renderMinimap(ctx) {
    const W = this.game.W;
    const mw = 174, mh = Math.round(mw * MH / MW);
    const mx = W - mw - 16, my = 14;
    const cell = mw / MW;

    ctx.save();
    roundRectPath(ctx, mx - 4, my - 4, mw + 8, mh + 8, 4);
    ctx.fillStyle = 'rgba(8,7,5,0.82)';
    ctx.fill();
    ctx.strokeStyle = PAL.line2;
    ctx.lineWidth = 1;
    ctx.stroke();

    for (let y = 0; y < MH; y++) {
      for (let x = 0; x < MW; x++) {
        const i = this.idx(x, y);
        if (!this.explored[i]) continue;
        ctx.fillStyle = this.map[i] === 0 ? 'rgba(70,62,50,0.85)' : 'rgba(150,142,120,0.55)';
        ctx.fillRect(mx + x * cell, my + y * cell, Math.ceil(cell), Math.ceil(cell));
      }
    }

    // 敌人
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (!this.explored[this.idx(clamp(e.tx, 0, MW - 1), clamp(e.ty, 0, MH - 1))]) continue;
      ctx.fillStyle = e.def.boss ? '#ff5a44' : '#d9744a';
      ctx.fillRect(mx + e.tx * cell - 0.5, my + e.ty * cell - 0.5, cell + 2, cell + 2);
    }
    // 出口
    if (this.exit) {
      ctx.fillStyle = '#8fd0e8';
      ctx.fillRect(mx + this.exit.x * cell - 1, my + this.exit.y * cell - 1, cell + 2, cell + 2);
    }
    // 玩家
    ctx.fillStyle = '#ffe27a';
    ctx.fillRect(mx + this.tx * cell - 1.5, my + this.ty * cell - 1.5, cell + 3, cell + 3);

    ctx.restore();
  }
}

function occupied(x, y, list) {
  for (const it of list) {
    if (it.x === x && it.y === y) return true;
  }
  return false;
}

function shade(hex, k) {
  if (!hex || hex[0] !== '#') return hex;
  let h = hex.slice(1);
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  const r = Math.round(((n >> 16) & 255) * k);
  const g = Math.round(((n >> 8) & 255) * k);
  const b = Math.round((n & 255) * k);
  return `rgb(${r},${g},${b})`;
}
