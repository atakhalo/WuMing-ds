// 基地场景：无明镇（2D 横板，NPC 交互与养成）

import {
  PAL, FONT, clamp, lerp, rand, fillRect, roundRectPath, text, bar, strokeText, measure,
} from '../core/utils.js';
import { isAnyDown, justPressed } from '../core/input.js';
import { NPCS, QUESTS, ATTRS, getQuest, getLocation } from '../data/world.js';
import {
  WEAPONS, ARMORS, ITEMS, getWeapon, getArmor, getItem,
  forgePrice, forgeBonus,
} from '../data/items.js';
import { SKILLS, skillTotalDamage } from '../data/skills.js';
import { drawFigure, drawMenu, keyCap, sectionTitle } from '../ui/widgets.js';
import { sfx } from '../core/audio.js';

const SCENE_W = 1320;
const GROUND_Y = 424;

export class BaseScene {
  constructor(game) {
    this.game = game;
    this.px = 528;
    this.facing = 1;
    this.animT = 0;
    this.camX = 0;
    this.walk = false;
    this.mode = 'walk';
    this.panel = null;
    this.charPanel = null;
    this.nearNpc = null;
    this.npcs = NPCS.map((n) => ({ ...n, animT: Math.random() * 3 }));
  }

  enter() {
    const P = this.game.player;
    // 回镇休整：气血与内力一并回满（内力在战斗之间是继承的）
    P.hp = P.maxHp;
    P.qi = P.maxQi;
    this.mode = 'walk';
    this.panel = null;
    this.charPanel = null;
    this.askRestart = false;
    this.px = clamp(this.px, 90, SCENE_W - 90);
    this.snapCam();
    this.game.paused = false;
  }

  get camMin() { return 0; }
  get camMax() { return SCENE_W - this.game.W; }

  snapCam() {
    this.camX = clamp(this.px - this.game.W / 2, this.camMin, this.camMax);
  }

  // ---------------- 更新 ----------------
  update(dt) {
    this.animT += dt;
    for (const n of this.npcs) n.animT += dt;

    if (this.mode === 'panel') { this.updatePanel(dt); return; }
    if (this.mode === 'char') { this.updateCharPanel(dt); return; }

    // 重开确认：清档不可逆，需按一次确认
    if (this.askRestart) {
      if (justPressed('Enter') || justPressed('Space') || justPressed('KeyJ')) {
        this.askRestart = false;
        sfx.ui();
        this.game.restart();
      } else if (justPressed('Escape') || justPressed('KeyQ') || justPressed('KeyR')) {
        this.askRestart = false;
        sfx.ui();
      }
      return;
    }
    if (justPressed('KeyR')) { this.askRestart = true; sfx.ui(); return; }

    let dx = 0;
    if (isAnyDown(['KeyA', 'ArrowLeft'])) dx -= 1;
    if (isAnyDown(['KeyD', 'ArrowRight'])) dx += 1;
    this.walk = dx !== 0;
    if (dx) {
      this.facing = dx;
      this.px = clamp(this.px + dx * 235 * dt, 80, SCENE_W - 80);
    }
    const t = clamp(dt * 7, 0, 1);
    this.camX = clamp(lerp(this.camX, this.px - this.game.W / 2, t), this.camMin, this.camMax);

    this.nearNpc = null;
    let best = 999;
    for (const n of this.npcs) {
      const d = Math.abs(n.x - this.px);
      if (d < 100 && d < best) { best = d; this.nearNpc = n; }
    }

    if (this.nearNpc && justPressed('KeyE')) this.openPanel(this.nearNpc);
    if (justPressed('KeyC') || justPressed('KeyI')) this.openCharPanel();
    if (justPressed('KeyM') || justPressed('Escape')) this.game.goto('world');
  }

  // ---------------- 对话/功能面板 ----------------
  openPanel(npc) {
    this.panel = {
      npc,
      index: 0,
      items: [],
      line: npc.lines[Math.floor(Math.random() * npc.lines.length)],
      scroll: 0,
    };
    this.refreshPanel(false);
    this.mode = 'panel';
    sfx.ui();
  }

  refreshPanel(keepIndex = false) {
    if (!this.panel) return;
    const items = this.buildItems(this.panel.npc);
    this.panel.items = items;
    if (!keepIndex || this.panel.index >= items.length) this.panel.index = 0;
    // 落点若正好是分组标题，顺延到下一个可选项
    if (items[this.panel.index] && items[this.panel.index].header) this.skipHeader(1);
  }

  skipHeader(dir, wrap = true) {
    const items = this.panel.items;
    if (!items.length) return;
    let i = this.panel.index;
    for (let k = 0; k < items.length; k++) {
      i = (i + dir + items.length) % items.length;
      if (!items[i].header) { this.panel.index = i; return; }
    }
  }

  updatePanel(dt) {
    const p = this.panel;
    if (!p) { this.mode = 'walk'; return; }
    if (justPressed('ArrowUp') || justPressed('KeyW')) { this.skipHeader(-1); sfx.uiMove(); }
    if (justPressed('ArrowDown') || justPressed('KeyS')) { this.skipHeader(1); sfx.uiMove(); }
    if (justPressed('Escape') || justPressed('KeyQ')) { this.mode = 'walk'; this.panel = null; sfx.ui(); return; }
    if (justPressed('Enter') || justPressed('Space') || justPressed('KeyE')) {
      const it = p.items[p.index];
      if (it && !it.header) {
        if (it.disabled) { sfx.fail(); this.game.toast(it.failMsg || '条件不足', PAL.crimsonHi); }
        else { it.action(); this.refreshPanel(true); sfx.ui(); }
      }
    }
  }

  // ---------------- 角色面板 ----------------
  openCharPanel() {
    this.charPanel = { index: 0 };
    this.mode = 'char';
    sfx.ui();
  }

  updateCharPanel(dt) {
    const P = this.game.player;
    const c = this.charPanel;
    if (justPressed('Escape') || justPressed('KeyC') || justPressed('KeyI')) {
      this.mode = 'walk';
      this.charPanel = null;
      sfx.ui();
      return;
    }
    if (justPressed('ArrowUp') || justPressed('KeyW')) { c.index = (c.index + 3) % 4; sfx.uiMove(); }
    if (justPressed('ArrowDown') || justPressed('KeyS')) { c.index = (c.index + 1) % 4; sfx.uiMove(); }
    if (justPressed('Enter') || justPressed('Space')) {
      if (P.attrPoints > 0) {
        const id = ATTRS[c.index].id;
        P.spendAttr(id);
        sfx.pickup();
        this.game.save();
      } else {
        sfx.fail();
        this.game.toast('无可用修为点', PAL.paperDim);
      }
    }
  }

  // ---------------- 菜单内容 ----------------
  buildItems(npc) {
    switch (npc.role) {
      case 'trial': return this.itemsTrial();
      case 'forge': return this.itemsForge();
      case 'train': return this.itemsTrain();
      case 'quest': return this.itemsQuest();
      case 'shop': return this.itemsShop();
      default: return [];
    }
  }

  itemsTrial() {
    return [
      {
        label: '演武 · 木人桩',
        desc: '不还手的木人。在此熟悉轻重与连招。',
        value: '进入',
        action: () => this.startTrial(),
      },
      {
        label: '重述要诀',
        desc: '轻重 J/K 出招；L 闪避、空格格挡、S 让招——都是排进时间轴的一段行动。',
        value: '',
        action: () => this.showComboChart(),
      },
    ];
  }

  showComboChart() {
    const P = this.game.player;
    const lines = SKILLS.filter((s) => P.hasSkill(s.id))
      .map((s) => `${s.pattern.map((m) => (m === 'light' ? '轻' : '重')).join('·')}  →  ${s.name}`);
    this.game.toast(lines.length ? lines.join('　｜　') : '尚未习得连招', PAL.jadeHi);
  }

  startTrial() {
    this.mode = 'walk';
    this.panel = null;
    this.game.goto('battle', {
      training: true,
      theme: { wall: '#2b2822', floor: '#3a352c', accent: '#6f8f5c' },
      onEnd: () => {
        this.game.toast('演武结束', PAL.paperDim);
        this.game.goto('base');
      },
    });
  }

  itemsForge() {
    const P = this.game.player;
    const w = P.weaponData;
    const items = [];
    const price = forgePrice(w, P.weaponLevel);
    const maxed = P.weaponLevel >= 10;
    items.push({
      label: `淬炼 · ${w.name} +${P.weaponLevel}`,
      desc: maxed ? '已至极限，再炼则毁。'
        : `轻招 +${P.forge.light}→+${forgeBonus(P.weaponLevel + 1).light}　重招 +${P.forge.heavy}→+${forgeBonus(P.weaponLevel + 1).heavy}　内力 +${P.forge.qi}→+${forgeBonus(P.weaponLevel + 1).qi}`,
      value: maxed ? '—' : `${price} 两`,
      disabled: maxed || P.gold < price,
      failMsg: P.gold < price ? '银两不足' : '已达极限',
      action: () => {
        P.gold -= price;
        P.weaponLevel++;
        sfx.levelUp();
        this.game.toast(`${w.name} 淬炼至 +${P.weaponLevel}`, PAL.gold);
        this.game.save();
      },
    });

    items.push({ header: true, label: '兵器' });
    for (const wp of WEAPONS) {
      const owned = P.weapons.includes(wp.id);
      const equipped = P.weapon === wp.id;
      items.push({
        label: wp.name + (equipped ? ' （佩）' : ''),
        desc: `${wp.desc}　轻+${wp.lightBonus} 重+${wp.heavyBonus} 内力+${wp.qiMax}`,
        value: equipped ? '使用中' : owned ? '换上' : `${wp.price} 两`,
        disabled: equipped || (!owned && P.gold < wp.price),
        failMsg: equipped ? '正佩此剑' : '银两不足',
        color: equipped ? PAL.gold : undefined,
        action: () => {
          if (!owned) {
            P.gold -= wp.price;
            P.weapons.push(wp.id);
          }
          P.weapon = wp.id;
          P.weaponLevel = 0;
          sfx.pickup();
          this.game.toast(`换上 ${wp.name}`, PAL.gold);
          this.game.save();
        },
      });
    }
    return items;
  }

  itemsTrain() {
    const P = this.game.player;
    const items = [{
      header: true, label: `剑招 · 已习 ${P.skills.length}/${SKILLS.length}`,
    }];
    for (const s of SKILLS) {
      const known = P.hasSkill(s.id);
      const afford = P.gold >= s.price;
      items.push({
        label: s.name,
        desc: `${s.pattern.map((m) => (m === 'light' ? '轻' : '重')).join('·')}　耗气 ${s.qi}　${s.desc}`,
        value: known ? '已习' : s.price === 0 ? '本就通晓' : `${s.price} 两`,
        tag: known ? `总伤 ${Math.round(skillTotalDamage(s))}` : '',
        disabled: known || !afford,
        failMsg: '银两不足',
        color: known ? PAL.jadeHi : undefined,
        action: () => {
          P.gold -= s.price;
          P.learnSkill(s.id);
          sfx.levelUp();
          this.game.toast(`习得「${s.name}」`, s.tint);
          this.game.save();
        },
      });
    }
    items.push({ header: true, label: '根基' });
    items.push({
      label: '按 C 打开内息与行装',
      desc: '分配修为点，查看装备与剑招总览。',
      value: P.attrPoints > 0 ? `待分配 ${P.attrPoints}` : '',
      action: () => { this.mode = 'walk'; this.panel = null; this.openCharPanel(); },
    });
    return items;
  }

  itemsQuest() {
    const P = this.game.player;
    const items = [];
    items.push({ header: true, label: '委托' });
    for (const q of QUESTS) {
      const done = P.doneQuests.includes(q.id);
      const active = P.activeQuests.includes(q.id);
      if (!done && !active) continue;
      const loc = getLocation(q.goal.loc);
      items.push({
        label: `${done ? '【已成】' : '【在办】'}${q.title}`,
        desc: `${q.desc}　${q.hint || ''}`,
        value: done ? '已了' : `→ ${loc.name}`,
        color: done ? PAL.paperFaint : PAL.paper,
        disabled: done,
        action: () => {
          if (done) return;
          this.mode = 'walk';
          this.panel = null;
          this.game.goto('dungeon', { locId: q.goal.loc, floor: 1 });
        },
      });
    }
    const allDone = QUESTS.every((q) => P.doneQuests.includes(q.id));
    if (items.length === 1) {
      items.push({ label: allDone ? '「镇上再无难事。」' : '暂无委托', desc: '', value: '', disabled: true, action: () => {} });
    }
    items.push({ header: true, label: '行踪' });
    items.push({
      label: '查看舆图',
      desc: '前往世界地图，选择要去的去处。',
      value: '启程',
      action: () => { this.mode = 'walk'; this.panel = null; this.game.goto('world'); },
    });
    return items;
  }

  itemsShop() {
    const P = this.game.player;
    const items = [{ header: true, label: '护具' }];
    for (const a of ARMORS) {
      const owned = P.armors.includes(a.id);
      const equipped = P.armor === a.id;
      items.push({
        label: a.name + (equipped ? ' （着）' : ''),
        desc: `${a.desc}　气血+${a.hpMax} 护体+${a.def}`,
        value: equipped ? '使用中' : owned ? '换上' : `${a.price} 两`,
        disabled: equipped || (!owned && P.gold < a.price),
        failMsg: equipped ? '已在身上' : '银两不足',
        color: equipped ? PAL.gold : undefined,
        action: () => {
          if (!owned) { P.gold -= a.price; P.armors.push(a.id); }
          P.armor = a.id;
          P.hp = Math.min(P.hp + a.hpMax, P.maxHp);
          sfx.pickup();
          this.game.toast(`换上 ${a.name}`, PAL.jadeHi);
          this.game.save();
        },
      });
    }
    items.push({ header: true, label: '丹药' });
    for (const it of ITEMS) {
      const price = it.price;
      const have = P.itemCount(it.id);
      items.push({
        label: it.name,
        desc: `${it.desc}　现有 ${have}`,
        value: `${price} 两`,
        disabled: P.gold < price,
        failMsg: '银两不足',
        action: () => {
          P.gold -= price;
          P.addItem(it.id, 1);
          sfx.pickup();
          this.game.toast(`购得 ${it.name}`, PAL.jadeHi);
          this.game.save();
        },
      });
    }
    return items;
  }

  // ---------------- 渲染 ----------------
  render(ctx) {
    const W = this.game.W, H = this.game.H;

    this.renderSky(ctx);
    ctx.save();
    ctx.translate(-Math.round(this.camX), 0);
    this.renderTown(ctx);
    this.renderNpcs(ctx);
    this.renderPlayer(ctx);
    ctx.restore();
    this.renderForeground(ctx);

    // HUD
    this.renderHud(ctx);

    if (this.mode === 'panel') this.renderPanel(ctx);
    if (this.mode === 'char') this.renderCharPanel(ctx);
    if (this.askRestart) this.renderRestartAsk(ctx);
  }

  renderSky(ctx) {
    const H = this.game.H;
    const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y + 40);
    g.addColorStop(0, '#0e1018');
    g.addColorStop(0.42, '#1c1c26');
    g.addColorStop(0.74, '#33291f');
    g.addColorStop(1, '#241a13');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.game.W, H);

    // 星
    for (let i = 0; i < 60; i++) {
      const x = (i * 191.7) % this.game.W;
      const y = ((i * 97.3) % 240);
      const tw = 0.35 + Math.sin(this.animT * 1.4 + i) * 0.3;
      ctx.fillStyle = `rgba(230,225,210,${clamp(tw, 0, 1) * 0.55})`;
      ctx.fillRect(x, y, 1.4, 1.4);
    }

    // 月
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(240,236,220,0.92)';
    ctx.beginPath();
    ctx.arc(this.game.W - 132, 92, 30, 0, Math.PI * 2);
    ctx.fill();
    const mg = ctx.createRadialGradient(this.game.W - 132, 92, 20, this.game.W - 132, 92, 130);
    mg.addColorStop(0, 'rgba(220,215,190,0.18)');
    mg.addColorStop(1, 'rgba(220,215,190,0)');
    ctx.fillStyle = mg;
    ctx.beginPath();
    ctx.arc(this.game.W - 132, 92, 130, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  renderTown(ctx) {
    const camL = this.camX - 60;
    const camR = this.camX + this.game.W + 60;

    // 远山
    ctx.save();
    ctx.globalAlpha = 0.5;
    for (let layer = 0; layer < 2; layer++) {
      ctx.fillStyle = layer === 0 ? '#191a22' : '#20202a';
      ctx.beginPath();
      ctx.moveTo(camL, GROUND_Y);
      for (let x = camL; x <= camR; x += 30) {
        const h = Math.sin(x * 0.0042 + layer * 2.4) * 66 + Math.sin(x * 0.011 + layer) * 26;
        ctx.lineTo(x, 300 + layer * 26 - h * 0.5);
      }
      ctx.lineTo(camR, GROUND_Y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // 房屋
    const houses = [
      { x: 90, w: 190, h: 150, name: '铁铺' },
      { x: 330, w: 220, h: 176, name: '演武堂' },
      { x: 590, w: 200, h: 160, name: '医馆' },
      { x: 830, w: 230, h: 190, name: '悦来客栈' },
      { x: 1100, w: 180, h: 146, name: '杂货' },
    ];
    for (const h of houses) {
      const y = GROUND_Y - h.h;
      ctx.fillStyle = '#1d1a16';
      ctx.fillRect(h.x, y, h.w, h.h);
      ctx.fillStyle = '#262119';
      ctx.beginPath();
      ctx.moveTo(h.x - 18, y + 6);
      ctx.lineTo(h.x + h.w / 2, y - 34);
      ctx.lineTo(h.x + h.w + 18, y + 6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,220,160,0.055)';
      ctx.fillRect(h.x + 16, y + 34, 34, 30);
      ctx.fillRect(h.x + h.w - 54, y + 34, 34, 30);
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(h.x + 0.5, y + 0.5, h.w - 1, h.h - 1);

      // 招牌
      ctx.save();
      ctx.fillStyle = 'rgba(20,14,10,0.9)';
      ctx.fillRect(h.x + h.w / 2 - 26, y + 14, 52, 22);
      ctx.strokeStyle = 'rgba(212,162,76,0.5)';
      ctx.strokeRect(h.x + h.w / 2 - 26, y + 14, 52, 22);
      text(ctx, h.name, h.x + h.w / 2, y + 30, {
        size: 13, align: 'center', weight: 700, color: '#d8b878',
      });
      ctx.restore();
    }

    // 灯笼
    const lanterns = [180, 340, 560, 760, 960, 1180];
    for (const lx of lanterns) {
      const ly = 300 + Math.sin(this.animT * 1.6 + lx) * 3;
      const g = ctx.createRadialGradient(lx, ly, 4, lx, ly, 62);
      g.addColorStop(0, 'rgba(255,170,90,0.30)');
      g.addColorStop(1, 'rgba(255,170,90,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(lx, ly, 62, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#8f2e26';
      ctx.beginPath();
      ctx.ellipse(lx, ly, 10, 13, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,200,120,0.65)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,200,120,0.2)';
      ctx.beginPath();
      ctx.moveTo(lx, ly - 13);
      ctx.lineTo(lx, ly - 40);
      ctx.stroke();
    }

    // 地面
    ctx.fillStyle = '#2e2a22';
    ctx.fillRect(camL, GROUND_Y, camR - camL, this.game.H - GROUND_Y);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(camL, GROUND_Y, camR - camL, 3);
    for (let x = Math.floor(camL / 46) * 46; x < camR; x += 46) {
      ctx.strokeStyle = 'rgba(0,0,0,0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, GROUND_Y + 6);
      ctx.lineTo(x - 8, this.game.H);
      ctx.stroke();
    }
  }

  renderNpcs(ctx) {
    for (const n of this.npcs) {
      const isNear = this.nearNpc === n;

      if (n.role === 'trial') {
        this.renderDummy(ctx, n);
      } else {
        drawFigure(ctx, n.x, GROUND_Y, {
          scale: 0.98,
          facing: n.x > this.px ? -1 : 1,
          pose: 'idle',
          t: n.animT,
          bodyColor: n.tint,
          accentColor: shadeHex(n.tint, 0.6),
          sashColor: shadeHex(n.tint, 1.25),
          hideWeapon: true,
          bladeLength: 0,
        });
      }

      // 名字牌
      ctx.save();
      ctx.globalAlpha = isNear ? 1 : 0.72;
      const label = `${n.name} · ${n.title}`;
      ctx.font = `500 12px ${FONT}`;
      const tw = ctx.measureText(label).width;
      roundRectPath(ctx, n.x - tw / 2 - 8, GROUND_Y - 106, tw + 16, 20, 3);
      ctx.fillStyle = 'rgba(10,8,6,0.75)';
      ctx.fill();
      ctx.strokeStyle = isNear ? 'rgba(212,162,76,0.7)' : 'rgba(120,110,90,0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
      text(ctx, label, n.x, GROUND_Y - 92, {
        size: 12, align: 'center', color: isNear ? PAL.gold : PAL.paperDim,
      });

      if (isNear && this.mode === 'walk') {
        const bob = Math.sin(this.animT * 4) * 2;
        keyCap(ctx, n.x - 34, GROUND_Y - 128 + bob, 'E', {});
        text(ctx, '交谈', n.x - 12, GROUND_Y - 121 + bob, { size: 12, color: PAL.paper });
      }
    }
  }

  renderDummy(ctx, n) {
    const x = n.x;
    const y = GROUND_Y;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath();
    ctx.ellipse(x, y + 1, 22, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6b5436';
    ctx.fillRect(x - 9, y - 78, 18, 78);
    ctx.fillStyle = '#7d6242';
    ctx.fillRect(x - 9, y - 78, 6, 78);
    // 横臂
    ctx.fillStyle = '#5f4a30';
    ctx.fillRect(x - 34, y - 60, 68, 9);
    ctx.fillRect(x - 26, y - 30, 52, 8);
    // 缠绕的草绳
    ctx.strokeStyle = 'rgba(150,120,80,0.55)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(x - 9, y - 70 + i * 15);
      ctx.lineTo(x + 9, y - 66 + i * 15);
      ctx.stroke();
    }
    // 刀痕
    ctx.strokeStyle = 'rgba(30,22,14,0.7)';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 6; i++) {
      const yy = y - 74 + i * 12 + (i % 3) * 3;
      ctx.beginPath();
      ctx.moveTo(x - 8, yy);
      ctx.lineTo(x + 8, yy + 3);
      ctx.stroke();
    }
    ctx.restore();
  }

  renderPlayer(ctx) {
    drawFigure(ctx, this.px, GROUND_Y, {
      scale: 1.0,
      facing: this.facing,
      pose: this.walk ? 'walk' : 'idle',
      t: this.animT,
      bodyColor: '#3d4a5c',
      accentColor: '#26303c',
      sashColor: PAL.crimson,
      bladeColor: this.game.player.weaponData.tint,
      bladeLength: 48,
    });
  }

  renderForeground(ctx) {
    const W = this.game.W, H = this.game.H;
    const g = ctx.createLinearGradient(0, H - 130, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, H - 130, W, 130);
  }

  renderHud(ctx) {
    const W = this.game.W, H = this.game.H;
    const P = this.game.player;

    ctx.save();
    roundRectPath(ctx, 14, 12, 268, 74, 5);
    ctx.fillStyle = 'rgba(12,10,8,0.82)';
    ctx.fill();
    ctx.strokeStyle = PAL.line2;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    text(ctx, `无名 · Lv.${P.level}`, 26, 34, { size: 15, weight: 700, color: PAL.paper });
    text(ctx, `${P.gold} 两`, 268, 34, { size: 14, align: 'right', color: PAL.gold });

    const bw = 150;
    bar(ctx, 26, 42, bw, 9, P.hp / P.maxHp, PAL.hp, { r: 2 });
    bar(ctx, 26, 56, bw, 9, P.qi / P.maxQi, PAL.qi, { r: 2 });
    bar(ctx, 26, 70, bw, 7, P.exp / P.expToNext, PAL.jade, { r: 2 });

    text(ctx, `历练`, 26 + bw + 10, 50, { size: 10, color: PAL.paperFaint });
    text(ctx, `${Math.floor(P.exp)}/${P.expToNext}`, 268, 50, {
      size: 10, align: 'right', color: PAL.paperFaint,
    });
    if (P.attrPoints > 0) {
      const blink = 0.6 + Math.sin(this.animT * 5) * 0.4;
      ctx.save();
      ctx.globalAlpha = blink;
      text(ctx, `修为点 ×${P.attrPoints}（按 C 分配）`, 26, 96, {
        size: 12, weight: 700, color: '#ffd76a',
      });
      ctx.restore();
    }

    // 底部操作提示
    ctx.save();
    ctx.globalAlpha = 0.75;
    text(ctx, 'A / D 行走　·　E 交谈　·　C 内息　·　M 舆图　·　R 重开', W / 2, H - 18, {
      size: 12, align: 'center', color: PAL.paperDim,
    });
    ctx.restore();
  }

  renderRestartAsk(ctx) {
    const W = this.game.W, H = this.game.H;
    const P = this.game.player;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    ctx.fillRect(0, 0, W, H);

    const pw = 420, ph = 176;
    const px = (W - pw) / 2, py = (H - ph) / 2;
    roundRectPath(ctx, px, py, pw, ph, 8);
    ctx.fillStyle = 'rgba(18,14,11,0.98)';
    ctx.fill();
    ctx.strokeStyle = PAL.crimsonHi;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    strokeText(ctx, '重开一局', W / 2, py + 44, { size: 22, color: '#ffb26b', outline: 0 });

    text(ctx, '当前进度将全部抹去，回到初入江湖之时。', W / 2, py + 78, {
      size: 13, align: 'center', color: PAL.paper,
    });
    text(ctx, `等级 ${P.level}　银两 ${P.gold}　已学剑招 ${P.skills.length} 式`, W / 2, py + 102, {
      size: 12, align: 'center', color: PAL.paperFaint,
    });

    const blink = 0.6 + Math.sin(this.animT * 5) * 0.4;
    ctx.globalAlpha = blink;
    text(ctx, '空格 / 回车 确认重开　·　Esc 取消', W / 2, py + ph - 26, {
      size: 13, weight: 700, align: 'center', color: PAL.crimsonHi,
    });
    ctx.restore();
  }

  renderPanel(ctx) {
    const W = this.game.W, H = this.game.H;
    const p = this.panel;
    if (!p) return;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    const pw = 640, ph = 404;
    const px = (W - pw) / 2, py = (H - ph) / 2;

    ctx.save();
    roundRectPath(ctx, px, py, pw, ph, 8);
    ctx.fillStyle = 'rgba(16,13,10,0.97)';
    ctx.fill();
    ctx.strokeStyle = PAL.line2;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    roundRectPath(ctx, px + 5, py + 5, pw - 10, ph - 10, 6);
    ctx.strokeStyle = 'rgba(212,162,76,0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // 头部
    text(ctx, p.npc.name, px + 26, py + 38, { size: 20, weight: 700, color: PAL.gold });
    text(ctx, p.npc.title, px + 26 + measure(ctx, p.npc.name, 20, 700) + 26, py + 38, {
      size: 12, color: PAL.paperFaint,
    });
    text(ctx, 'Esc 离开', px + pw - 26, py + 38, {
      size: 12, align: 'right', color: PAL.paperFaint,
    });
    ctx.save();
    ctx.strokeStyle = 'rgba(212,162,76,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px + 26, py + 50);
    ctx.lineTo(px + pw - 26, py + 50);
    ctx.stroke();
    ctx.restore();

    // 台词
    text(ctx, p.line, px + 26, py + 74, { size: 13, color: '#9a8f76' });

    // 菜单
    const menuY = py + 100;
    drawMenu(ctx, px + 34, menuY, pw - 92, p.items, p.index, {
      maxRows: 6,
      selBg: 'rgba(212,162,76,0.11)',
    });

    // 底部
    const goldStr = `银两 ${this.game.player.gold}`;
    text(ctx, goldStr, px + 26, py + ph - 20, { size: 13, color: PAL.gold });
    text(ctx, '↑↓ 选择　Enter 确认', px + pw - 26, py + ph - 20, {
      size: 12, align: 'right', color: PAL.paperFaint,
    });
  }

  renderCharPanel(ctx) {
    const W = this.game.W, H = this.game.H;
    const P = this.game.player;
    const c = this.charPanel;
    if (!c) return;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    const pw = 700, ph = 446;
    const px = (W - pw) / 2, py = (H - ph) / 2;
    panelBox(ctx, px, py, pw, ph);

    text(ctx, '内息 · 行装', px + 26, py + 36, { size: 19, weight: 700, color: PAL.gold });
    text(ctx, `Lv.${P.level}　${P.exp}/${P.expToNext} 历练　剩余修为 ${P.attrPoints}`,
      px + 190, py + 36, { size: 13, color: PAL.paperDim });
    text(ctx, 'Esc/C 关闭', px + pw - 26, py + 36, {
      size: 12, align: 'right', color: PAL.paperFaint,
    });
    divider(ctx, px + 26, py + 48, pw - 52);

    // 左：属性
    sectionTitle(ctx, px + 26, py + 74, '根基');
    ATTRS.forEach((a, i) => {
      const sel = i === c.index;
      const y = py + 100 + i * 40;
      if (sel) {
        ctx.save();
        roundRectPath(ctx, px + 18, y - 16, 288, 34, 4);
        ctx.fillStyle = 'rgba(212,162,76,0.10)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(212,162,76,0.4)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }
      text(ctx, a.name, px + 30, y, { size: 15, weight: sel ? 700 : 400, color: a.color });
      text(ctx, String(P.attrs[a.id]), px + 250, y, {
        size: 15, align: 'right', color: sel ? PAL.paper : PAL.paperDim,
      });
      text(ctx, a.desc, px + 30, y + 14, { size: 11, color: '#7d735e' });
    });

    // 左下方派生数值
    sectionTitle(ctx, px + 26, py + 274, '身手');
    const rows = [
      ['气血上限', Math.round(P.maxHp)],
      ['内力上限', Math.round(P.maxQi)],
      ['轻招伤害', P.lightDamage.toFixed(1)],
      ['重招伤害', P.heavyDamage.toFixed(1)],
      ['护体', Math.round(P.defense)],
      ['出招速度', `${(1 / P.speedMul * 100).toFixed(0)}%`],
    ];
    rows.forEach(([k, v], i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = px + 30 + col * 148;
      const y = py + 300 + row * 24;
      text(ctx, k, x, y, { size: 12, color: '#8b8069' });
      text(ctx, String(v), x + 130, y, { size: 12, align: 'right', color: PAL.paper });
    });

    // 右：装备与剑招
    sectionTitle(ctx, px + 364, py + 74, '行装');
    const w = P.weaponData;
    const ar = P.armorData;
    const equip = [
      ['兵器', `${w.name} +${P.weaponLevel}`],
      ['', `轻+${w.lightBonus + P.forge.light}　重+${w.heavyBonus + P.forge.heavy}　内力+${w.qiMax + P.forge.qi}`],
      ['护具', ar.name],
      ['', `气血+${ar.hpMax}　护体+${ar.def}`],
    ];
    equip.forEach(([k, v], i) => {
      const y = py + 100 + i * 22;
      if (k) {
        text(ctx, k, px + 372, y, { size: 13, color: PAL.paperDim });
        text(ctx, v, px + 632, y, { size: 13, align: 'right', color: PAL.paper });
      } else {
        text(ctx, v, px + 372, y, { size: 11, color: '#7d735e' });
      }
    });

    sectionTitle(ctx, px + 364, py + 202, `剑招 (${P.skills.length}/${SKILLS.length})`);
    P.skills.forEach((sid, i) => {
      const s = SKILLS.find((x) => x.id === sid);
      if (!s) return;
      const y = py + 226 + i * 26;
      const pat = s.pattern.map((m) => (m === 'light' ? '轻' : '重')).join('·');
      text(ctx, pat, px + 372, y, { size: 12.5, color: baseTint(s.tint), weight: 700 });
      text(ctx, s.name, px + 424, y, { size: 13.5, color: PAL.paper });
      text(ctx, `耗气 ${s.qi}`, px + 632, y, { size: 11, align: 'right', color: PAL.paperFaint });
      text(ctx, `${s.steps.length} 段 · 总伤 ${Math.round(skillTotalDamage(s))}`,
        px + 372, y + 11, { size: 10.5, color: '#8a8070' });
    });

    text(ctx, '绝学：无明剑意　按 U　消耗全部内力（需 ≥40）',
      px + 372, py + ph - 24, { size: 11, color: '#8a6a2f' });
    text(ctx, '战斗为时间轴制：轮到你时冻结选行动，表演不入轴，只有 cd 段推进时间',
      px + 372, py + ph - 10, { size: 10.5, color: '#6d6350' });
  }
}

function baseTint(hex) {
  return hex || PAL.paper;
}

function panelBox(ctx, x, y, w, h) {
  ctx.save();
  roundRectPath(ctx, x, y, w, h, 8);
  ctx.fillStyle = 'rgba(16,13,10,0.97)';
  ctx.fill();
  ctx.strokeStyle = PAL.line2;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  roundRectPath(ctx, x + 5, y + 5, w - 10, h - 10, 6);
  ctx.strokeStyle = 'rgba(212,162,76,0.18)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function divider(ctx, x, y, w) {
  ctx.save();
  ctx.strokeStyle = 'rgba(212,162,76,0.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.stroke();
  ctx.restore();
}

function shadeHex(hex, k) {
  if (!hex || hex[0] !== '#') return hex;
  let h = hex.slice(1);
  if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('');
  const n = parseInt(h, 16);
  const r = clamp(Math.round(((n >> 16) & 255) * k), 0, 255);
  const g = clamp(Math.round(((n >> 8) & 255) * k), 0, 255);
  const b = clamp(Math.round((n & 255) * k), 0, 255);
  return `rgb(${r},${g},${b})`;
}
