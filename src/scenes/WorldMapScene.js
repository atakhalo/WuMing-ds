// 世界地图场景

import {
  PAL, FONT, clamp, lerp, rand, fillRect, roundRectPath, text, strokeText, hash2,
} from '../core/utils.js';
import { justPressed } from '../core/input.js';
import { LOCATIONS, ROUTES, QUESTS, getLocation } from '../data/world.js';
import { sfx } from '../core/audio.js';
import { keyCap } from '../ui/widgets.js';

export class WorldMapScene {
  constructor(game) {
    this.game = game;
    this.index = 0;
    this.animT = 0;
    this.hover = -1;
    this.mouse = { x: -1, y: -1 };
    this._bindMouse();
  }

  _bindMouse() {
    const c = this.game.canvas;
    c.addEventListener('mousemove', (e) => {
      const r = c.getBoundingClientRect();
      this.mouse.x = ((e.clientX - r.left) / r.width) * this.game.W;
      this.mouse.y = ((e.clientY - r.top) / r.height) * this.game.H;
    });
    c.addEventListener('click', () => {
      if (this.game.sceneName !== 'world') return;
      if (this.hover >= 0 && this.hover < this.nodes.length) {
        if (this.hover === this.index) this.enterSelected();
        else { this.index = this.hover; sfx.uiMove(); }
      }
    });
  }

  enter(args = {}) {
    this.animT = 0;
    this.buildNodes();
    // 默认选中当前可用且未通关的地点
    const P = this.game.player;
    let idx = this.nodes.findIndex((n) => n.loc.id !== 'town' && n.unlocked && !P.doneQuests.includes(
      (QUESTS.find((q) => q.goal.loc === n.loc.id) || {}).id));
    if (idx < 0) idx = this.nodes.findIndex((n) => n.loc.id === 'town');
    this.index = Math.max(0, idx);
    this.message = args.message || null;
    this.msgT = 0;
  }

  buildNodes() {
    const P = this.game.player;
    this.nodes = LOCATIONS.map((loc) => {
      const quest = QUESTS.find((q) => q.goal.loc === loc.id);
      return {
        loc,
        unlocked: loc.unlocked || P.unlocked.includes(loc.id) || loc.kind === 'town',
        questDone: quest ? P.doneQuests.includes(quest.id) : false,
        hasQuest: quest ? P.activeQuests.includes(quest.id) : false,
      };
    });
  }

  update(dt) {
    this.animT += dt;
    if (this.message) {
      this.msgT += dt;
      if (this.msgT > 2.6) this.message = null;
    }

    // 鼠标悬停
    this.hover = -1;
    this.nodes.forEach((n, i) => {
      if (Math.hypot(n.loc.x - this.mouse.x, n.loc.y - this.mouse.y) < 26) this.hover = i;
    });

    if (justPressed('ArrowLeft') || justPressed('KeyA')) { this.step(-1); }
    if (justPressed('ArrowRight') || justPressed('KeyD')) { this.step(1); }
    if (justPressed('ArrowUp') || justPressed('KeyW')) { this.step(-1); }
    if (justPressed('ArrowDown') || justPressed('KeyS')) { this.step(1); }

    if (justPressed('Enter') || justPressed('Space') || justPressed('KeyE') || justPressed('KeyJ')) {
      this.enterSelected();
    }
    if (justPressed('Escape') || justPressed('KeyM')) {
      this.game.goto('base');
      sfx.ui();
    }
  }

  step(d) {
    this.index = (this.index + d + this.nodes.length) % this.nodes.length;
    sfx.uiMove();
  }

  enterSelected() {
    const n = this.nodes[this.index];
    if (!n) return;
    if (!n.unlocked) {
      const req = n.loc.requires ? QUESTS.find((q) => q.id === n.loc.requires) : null;
      this.message = req ? `尚未开启 · 需先完成「${req.title}」` : '此处尚不可往';
      sfx.fail();
      return;
    }
    sfx.ui();
    if (n.loc.kind === 'town') {
      this.game.goto('base');
    } else {
      this.game.run = {
        locId: n.loc.id,
        floor: 1,
        tier: n.loc.tier,
        totalFloors: n.loc.floors,
      };
      this.game.goto('dungeon', { locId: n.loc.id, floor: 1 });
    }
  }

  // ---------------- 渲染 ----------------
  render(ctx) {
    const W = this.game.W, H = this.game.H;

    // 底色
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#14120f');
    g.addColorStop(0.5, '#1c1813');
    g.addColorStop(1, '#0f0d0a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    this.renderTerrain(ctx);
    this.renderRoutes(ctx);
    this.renderNodes(ctx);
    this.renderInfoPanel(ctx);
    this.renderHeader(ctx);

    if (this.message) {
      ctx.save();
      const a = clamp(this.msgT < 0.2 ? this.msgT / 0.2 : (2.6 - this.msgT) / 0.5, 0, 1);
      ctx.globalAlpha = a;
      roundRectPath(ctx, W / 2 - 190, H - 92, 380, 34, 4);
      ctx.fillStyle = 'rgba(20,12,10,0.92)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(224,92,74,0.5)';
      ctx.stroke();
      text(ctx, this.message, W / 2, H - 70, {
        size: 13, align: 'center', color: PAL.crimsonHi,
      });
      ctx.restore();
    }

    text(ctx, '← → 选择去处　·　Enter 出发　·　M / Esc 返回镇中', this.game.W / 2, H - 18, {
      size: 12, align: 'center', color: PAL.paperDim,
    });
  }

  renderTerrain(ctx) {
    const W = this.game.W, H = this.game.H;
    // 山峦纹理
    ctx.save();
    ctx.globalAlpha = 0.42;
    for (let layer = 0; layer < 4; layer++) {
      ctx.fillStyle = ['#1b1a17', '#21201b', '#26241d', '#2b2820'][layer];
      ctx.beginPath();
      let started = false;
      for (let x = -20; x <= W + 20; x += 18) {
        const y = 120 + layer * 78
          + Math.sin(x * 0.0075 + layer * 1.7) * (34 + layer * 12)
          + Math.sin(x * 0.019 + layer * 3.1) * 13;
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.lineTo(W + 20, H);
      ctx.lineTo(-20, H);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // 江河
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = '#5a86a8';
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-20, 430);
    ctx.bezierCurveTo(220, 372, 330, 472, 520, 410);
    ctx.bezierCurveTo(690, 356, 800, 452, 980, 392);
    ctx.stroke();
    ctx.globalAlpha = 0.10;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();

    // 纸纹
    for (let i = 0; i < 220; i++) {
      const x = hash2(i, 1, 5) * W;
      const y = hash2(i, 2, 9) * H;
      ctx.fillStyle = `rgba(220,200,160,${0.012 + hash2(i, 3, 2) * 0.02})`;
      ctx.fillRect(x, y, 2, 2);
    }

    // 边框
    ctx.save();
    ctx.strokeStyle = 'rgba(212,162,76,0.16)';
    ctx.lineWidth = 2;
    ctx.strokeRect(12.5, 12.5, W - 25, H - 25);
    ctx.strokeStyle = 'rgba(212,162,76,0.07)';
    ctx.lineWidth = 1;
    ctx.strokeRect(18.5, 18.5, W - 37, H - 37);
    ctx.restore();
  }

  renderRoutes(ctx) {
    ctx.save();
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 7]);
    for (const [a, b] of ROUTES) {
      const la = getLocation(a);
      const lb = getLocation(b);
      const na = this.nodes.find((n) => n.loc.id === a);
      const nb = this.nodes.find((n) => n.loc.id === b);
      const open = na && nb && na.unlocked && nb.unlocked;
      ctx.strokeStyle = open ? 'rgba(212,162,76,0.42)' : 'rgba(120,110,90,0.16)';
      ctx.beginPath();
      ctx.moveTo(la.x, la.y);
      const mx = (la.x + lb.x) / 2;
      const my = (la.y + lb.y) / 2 - 22;
      ctx.quadraticCurveTo(mx, my, lb.x, lb.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  renderNodes(ctx) {
    this.nodes.forEach((n, i) => {
      const sel = i === this.index;
      const hov = i === this.hover;
      const { x, y } = n.loc;
      const unlocked = n.unlocked;
      const isTown = n.loc.kind === 'town';
      const pulse = 0.5 + Math.sin(this.animT * 2.2 + i) * 0.5;

      ctx.save();

      // 光晕
      if (unlocked) {
        const r = sel ? 44 : 30;
        const gg = ctx.createRadialGradient(x, y, 2, x, y, r);
        const col = isTown ? '212,162,76' : n.hasQuest ? '224,92,74' : '140,200,240';
        gg.addColorStop(0, `rgba(${col},${(sel ? 0.42 : 0.2) + pulse * 0.14})`);
        gg.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = gg;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // 底盘
      ctx.beginPath();
      ctx.arc(x, y, sel ? 19 : 15, 0, Math.PI * 2);
      ctx.fillStyle = unlocked ? (isTown ? '#3a2c18' : '#1c242c') : '#1a1815';
      ctx.fill();
      ctx.strokeStyle = unlocked
        ? (sel ? PAL.gold : 'rgba(212,162,76,0.55)')
        : 'rgba(110,100,84,0.4)';
      ctx.lineWidth = sel ? 2.4 : 1.4;
      ctx.stroke();

      // 图标
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = unlocked ? (isTown ? PAL.gold : '#8fd0e8') : '#5b5445';
      if (isTown) {
        ctx.fillRect(-7, -2, 14, 8);
        ctx.beginPath();
        ctx.moveTo(-9, -2);
        ctx.lineTo(0, -9);
        ctx.lineTo(9, -2);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(-8, 7);
        ctx.lineTo(0, -8);
        ctx.lineTo(8, 7);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // 未解锁锁扣
      if (!unlocked) {
        ctx.fillStyle = 'rgba(160,150,130,0.75)';
        ctx.fillRect(x - 3.5, y + 20, 7, 6);
        ctx.strokeStyle = 'rgba(160,150,130,0.75)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(x, y + 20, 3.2, Math.PI, Math.PI * 2);
        ctx.stroke();
      }

      // 名称
      const label = n.loc.name;
      ctx.font = `700 ${sel ? 15 : 13}px ${FONT}`;
      const tw = ctx.measureText(label).width;
      roundRectPath(ctx, x - tw / 2 - 9, y + 22, tw + 18, 21, 3);
      ctx.fillStyle = 'rgba(10,9,7,0.86)';
      ctx.fill();
      ctx.strokeStyle = sel ? 'rgba(212,162,76,0.75)' : 'rgba(120,110,90,0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      text(ctx, label, x, y + 37, {
        size: sel ? 15 : 13,
        align: 'center',
        weight: sel ? 700 : 500,
        color: unlocked ? (sel ? PAL.gold : PAL.paper) : '#6b6252',
      });

      if (n.hasQuest && !n.questDone && unlocked) {
        const bob = Math.sin(this.animT * 4) * 2;
        strokeText(ctx, '!', x + 20, y - 20 + bob, { size: 17, color: '#ff6b52', outline: 3 });
      }
      if (n.questDone && unlocked) {
        strokeText(ctx, '✓', x + 20, y - 20, { size: 15, color: '#7ce08a', outline: 3 });
      }
    });
  }

  renderHeader(ctx) {
    const W = this.game.W;
    ctx.save();
    roundRectPath(ctx, W / 2 - 90, 20, 180, 38, 5);
    ctx.fillStyle = 'rgba(12,10,8,0.85)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(212,162,76,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    text(ctx, '舆　图', W / 2, 45, {
      size: 19, align: 'center', weight: 700, color: PAL.gold,
    });
  }

  renderInfoPanel(ctx) {
    const n = this.nodes[this.index];
    if (!n) return;
    const W = this.game.W;
    const pw = 420, ph = 128;
    const px = 26, py = this.game.H - ph - 40;

    ctx.save();
    roundRectPath(ctx, px, py, pw, ph, 6);
    ctx.fillStyle = 'rgba(12,10,8,0.92)';
    ctx.fill();
    ctx.strokeStyle = n.unlocked ? 'rgba(212,162,76,0.4)' : 'rgba(110,100,84,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    const col = n.unlocked ? PAL.paper : '#6b6252';
    text(ctx, n.loc.name, px + 18, py + 30, { size: 17, weight: 700, color: n.unlocked ? PAL.gold : '#6b6252' });

    const kindLabel = n.loc.kind === 'town'
      ? '据 点'
      : `秘境 · ${n.loc.floors} 层 · 第 ${n.loc.tier} 阶`;
    text(ctx, kindLabel, px + pw - 18, py + 30, {
      size: 12, align: 'right', color: n.unlocked ? PAL.jadeHi : '#5b5445',
    });

    text(ctx, n.loc.desc, px + 18, py + 56, { size: 12.5, color: '#9a8f76' });

    const quest = QUESTS.find((q) => q.goal.loc === n.loc.id);
    if (quest) {
      const done = n.questDone;
      const active = n.hasQuest;
      text(ctx, `委托：${quest.title}`, px + 18, py + 80, {
        size: 12, color: done ? '#7ce08a' : active ? PAL.crimsonHi : '#6b6252',
      });
      text(ctx, done ? '已成' : active ? '在办' : '未接', px + pw - 18, py + 80, {
        size: 12, align: 'right', color: done ? '#7ce08a' : active ? PAL.crimsonHi : '#5b5445',
      });
    }

    // 主要属性预览
    if (n.loc.kind !== 'town' && n.unlocked) {
      text(ctx, `建议：气血 ${Math.round(this.game.player.maxHp)} · 轻招 ${this.game.player.lightDamage.toFixed(0)} · 重招 ${this.game.player.heavyDamage.toFixed(0)}`,
        px + 18, py + 104, { size: 11, color: '#7d735e' });
    } else if (!n.unlocked) {
      const req = n.loc.requires ? QUESTS.find((q) => q.id === n.loc.requires) : null;
      text(ctx, req ? `开启条件：完成「${req.title}」` : '尚未探明', px + 18, py + 104, {
        size: 11, color: '#8a6a2f',
      });
    }
  }
}
