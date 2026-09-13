// 结算 / 提示场景

import { PAL, clamp, roundRectPath, text, strokeText, fillRect } from '../core/utils.js';
import { justPressed } from '../core/input.js';
import { sfx } from '../core/audio.js';

export class ResultScene {
  constructor(game) {
    this.game = game;
    this.animT = 0;
  }

  enter(args = {}) {
    this.animT = 0;
    this.title = args.title || '结算';
    this.subtitle = args.subtitle || '';
    this.lines = args.lines || [];
    this.next = args.next || 'base';
    this.color = args.color || PAL.gold;
  }

  update(dt) {
    this.animT += dt;
    if (this.animT < 0.5) return;
    if (justPressed('Enter') || justPressed('Space') || justPressed('KeyJ') || justPressed('Escape') || justPressed('KeyE')) {
      sfx.ui();
      this.game.goto(this.next);
    }
  }

  render(ctx) {
    const W = this.game.W, H = this.game.H;
    ctx.fillStyle = '#0c0a08';
    ctx.fillRect(0, 0, W, H);

    // 光晕
    const g = ctx.createRadialGradient(W / 2, H / 2 - 20, 20, W / 2, H / 2 - 20, 340);
    g.addColorStop(0, 'rgba(212,162,76,0.09)');
    g.addColorStop(1, 'rgba(212,162,76,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const a = clamp(this.animT / 0.45, 0, 1);
    ctx.save();
    ctx.globalAlpha = a;

    strokeText(ctx, this.title, W / 2, H / 2 - 132, {
      size: 40, color: this.color, outline: 0, weight: 700,
    });
    if (this.subtitle) {
      text(ctx, this.subtitle, W / 2, H / 2 - 96, {
        size: 14, align: 'center', color: PAL.paperDim,
      });
    }

    ctx.save();
    ctx.strokeStyle = 'rgba(212,162,76,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 150, H / 2 - 78);
    ctx.lineTo(W / 2 + 150, H / 2 - 78);
    ctx.stroke();
    ctx.restore();

    this.lines.forEach((l, i) => {
      const la = clamp((this.animT - 0.25 - i * 0.12) / 0.3, 0, 1);
      ctx.save();
      ctx.globalAlpha = a * la;
      text(ctx, l, W / 2, H / 2 - 40 + i * 30, {
        size: 16, align: 'center', color: PAL.paper,
      });
      ctx.restore();
    });

    if (this.animT > 0.5) {
      const blink = 0.5 + Math.sin(this.animT * 5) * 0.5;
      ctx.globalAlpha = a * blink;
      text(ctx, '按 空格 继续', W / 2, H / 2 + 148, {
        size: 14, align: 'center', color: PAL.paperDim,
      });
    }

    ctx.restore();
  }
}
