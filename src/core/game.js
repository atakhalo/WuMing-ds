// 游戏主控：场景栈、主循环、全局提示、转场

import { initInput, beginFrame, endFrame, clearInput } from './input.js';
import { loadRaw, writeRaw, loadMeta, writeMeta, clearRaw } from './save.js';
import { Player } from '../entities/Player.js';
import { PAL, fillRect, text, clamp, FONT } from './utils.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.W = 960;
    this.H = 540;

    this.scenes = {};
    this.scene = null;
    this.sceneName = '';

    this.player = new Player();
    this.meta = loadMeta();
    this.run = null;          // 当前副本局内数据
    this.toasts = [];         // 屏幕提示
    this.fade = 0;            // 0 无 -> 1 全黑
    this.fadeDir = 0;         // -1 淡入, 1 淡出
    this.pending = null;
    this.time = 0;
    this.last = 0;
    this.paused = false;

    this._loop = this._loop.bind(this);
    this._onResize = this._onResize.bind(this);
  }

  init() {
    initInput();
    window.addEventListener('resize', this._onResize);
    this._onResize();

    const save = loadRaw();
    if (save) this.player.load(save);

    requestAnimationFrame(this._loop);
  }

  save() {
    writeRaw(this.player.toJSON());
  }

  saveMeta() {
    writeMeta(this.meta);
  }

  /**
   * 重开一局：清掉存档与本局数据，玩家复位后回基地。
   * 复用同一个 Player 实例，避免各场景里已缓存的引用变成孤儿。
   */
  restart() {
    clearRaw();
    this.player.reset();
    this.meta = { runs: 0, deaths: 0, bestFloor: 0 };
    this.saveMeta();
    this.run = null;
    this.toasts.length = 0;
    this.save();
    this.goto('base');
  }

  _onResize() {
    const { canvas, ctx, W, H } = this;
    const scale = Math.min(window.innerWidth / W, window.innerHeight / H) * 0.985;
    canvas.style.width = Math.floor(W * scale) + 'px';
    canvas.style.height = Math.floor(H * scale) + 'px';
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
  }

  register(name, scene) {
    scene.game = this;
    this.scenes[name] = scene;
  }

  // 立即切换
  setScene(name, args) {
    const s = this.scenes[name];
    if (!s) { console.warn('场景不存在', name); return; }
    this.scene = s;
    this.sceneName = name;
    clearInput();
    if (s.enter) s.enter(args || {});
  }

  // 带黑场转场
  goto(name, args) {
    this.pending = { name, args: args || {} };
    this.fadeDir = 1;
  }

  toast(textStr, color) {
    this.toasts.push({ text: textStr, color: color || PAL.paper, t: 0, life: 2.2 });
    if (this.toasts.length > 6) this.toasts.shift();
  }

  // ---------- 主循环 ----------
  _loop(ts) {
    const now = ts / 1000;
    let dt = this.last ? now - this.last : 0.016;
    this.last = now;
    dt = Math.min(dt, 0.05);     // 防止切标签页后跳帧
    this.time += dt;

    this.update(dt);
    this.render();

    endFrame();
    requestAnimationFrame(this._loop);
  }

  update(dt) {
    // 输入心跳随游戏时间推进：超时未再收到 keydown 的按住键会被判为已松开
    beginFrame(dt);
    // 转场
    if (this.fadeDir > 0) {
      this.fade = Math.min(1, this.fade + dt * 4);
      if (this.fade >= 1 && this.pending) {
        const p = this.pending;
        this.pending = null;
        this.fadeDir = -1;
        this.setScene(p.name, p.args);
      }
    } else if (this.fadeDir < 0) {
      this.fade = Math.max(0, this.fade - dt * 2.6);
      if (this.fade <= 0) this.fadeDir = 0;
    }

    // 转场期间冻结场景逻辑
    const frozen = this.fadeDir !== 0 && this.fade > 0.35;
    if (this.scene && !this.paused && !frozen) {
      this.scene.update(dt);
    } else if (this.scene && this.paused && this.scene.updatePaused) {
      this.scene.updatePaused(dt);
    }

    // 提示
    for (const t of this.toasts) t.t += dt;
    this.toasts = this.toasts.filter((t) => t.t < t.life);
  }

  render() {
    const ctx = this.ctx;
    ctx.save();
    ctx.clearRect(0, 0, this.W, this.H);
    fillRect(ctx, 0, 0, this.W, this.H, PAL.ink);

    if (this.scene) this.scene.render(ctx);

    this._renderToasts(ctx);

    if (this.fade > 0) {
      ctx.globalAlpha = this.fade;
      fillRect(ctx, 0, 0, this.W, this.H, '#000000');
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  _renderToasts(ctx) {
    const startY = this.H - 92;
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      const t = this.toasts[i];
      const idx = this.toasts.length - 1 - i;
      const a = t.t < 0.15 ? t.t / 0.15 : t.t > t.life - 0.5 ? clamp((t.life - t.t) / 0.5, 0, 1) : 1;
      const y = startY - idx * 22;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = `500 15px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText(t.text, this.W / 2, y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, this.W / 2, y);
      ctx.restore();
    }
  }
}
