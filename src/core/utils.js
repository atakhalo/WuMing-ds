// 通用数学 / 随机 / 绘制工具

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
export const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const chance = (p) => Math.random() < p;
export const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
export const approach = (v, target, step) =>
  v < target ? Math.min(v + step, target) : Math.max(v - step, target);

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pickWeighted(list, weightFn) {
  let total = 0;
  for (const it of list) total += weightFn(it);
  let r = Math.random() * total;
  for (const it of list) {
    r -= weightFn(it);
    if (r <= 0) return it;
  }
  return list[list.length - 1];
}

export function padZero(n, len = 2) {
  return String(Math.max(0, Math.floor(n))).padStart(len, '0');
}

// 缓动
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeOutQuad = (t) => 1 - (1 - t) * (1 - t);
export const easeInQuad = (t) => t * t;
export const easeInOutQuad = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export const FONT = '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif';

export const PAL = {
  ink: '#15110d',
  ink2: '#1d1813',
  ink3: '#2a231b',
  line: '#3d3225',
  line2: '#544633',
  paper: '#e9dfc8',
  paperDim: '#a99b7e',
  paperFaint: '#6d6350',
  gold: '#d4a24c',
  goldDim: '#8a6a2f',
  crimson: '#b23a3a',
  crimsonHi: '#e05c4a',
  jade: '#5c8d89',
  jadeHi: '#7ec3bd',
  azure: '#4a7ba7',
  violet: '#8a6fa8',
  white: '#f7f2e6',
  hp: '#c0392b',
  qi: '#3f8fb0',
  stam: '#c8a13c',
};

// ---------- 绘制辅助 ----------

export function fillRect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

export function strokeRect(ctx, x, y, w, h, color, lw = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.strokeRect(x + lw / 2, y + lw / 2, w - lw, h - lw);
}

export function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function panel(ctx, x, y, w, h, opt = {}) {
  const bg = opt.bg || 'rgba(21,17,13,0.94)';
  const border = opt.border || PAL.line2;
  ctx.save();
  roundRectPath(ctx, x, y, w, h, opt.r == null ? 6 : opt.r);
  ctx.fillStyle = bg;
  ctx.fill();
  if (opt.glow) {
    ctx.shadowColor = opt.glow;
    ctx.shadowBlur = 18;
  }
  ctx.strokeStyle = border;
  ctx.lineWidth = opt.lw || 1;
  ctx.stroke();
  ctx.restore();
}

export function text(ctx, str, x, y, opt = {}) {
  ctx.save();
  ctx.font = `${opt.weight || 400} ${opt.size || 15}px ${opt.mono ? 'Consolas, monospace' : FONT}`;
  ctx.fillStyle = opt.color || PAL.paper;
  ctx.textAlign = opt.align || 'left';
  ctx.textBaseline = opt.baseline || 'alphabetic';
  if (opt.alpha != null) ctx.globalAlpha = opt.alpha;
  if (opt.shadow) {
    ctx.shadowColor = opt.shadow;
    ctx.shadowBlur = opt.shadowBlur || 6;
  }
  ctx.fillText(str, x, y);
  ctx.restore();
}

export function measure(ctx, str, size = 15, weight = 400) {
  ctx.save();
  ctx.font = `${weight} ${size}px ${FONT}`;
  const w = ctx.measureText(str).width;
  ctx.restore();
  return w;
}

export function bar(ctx, x, y, w, h, ratio, color, opt = {}) {
  const r = clamp(ratio, 0, 1);
  ctx.save();
  roundRectPath(ctx, x, y, w, h, opt.r == null ? h / 2 : opt.r);
  ctx.fillStyle = opt.bg || '#0e0b08';
  ctx.fill();
  if (r > 0) {
    ctx.save();
    ctx.clip();
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, opt.gradTop || color);
    g.addColorStop(1, opt.gradBot || color);
    ctx.fillStyle = opt.flat ? color : g;
    ctx.fillRect(x, y, w * r, h);
    ctx.restore();
  }
  if (opt.border !== false) {
    ctx.strokeStyle = opt.border || 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}

// 带描边的文字（用于地图/战斗中的浮动字）
export function strokeText(ctx, str, x, y, opt = {}) {
  ctx.save();
  ctx.font = `${opt.weight || 700} ${opt.size || 16}px ${FONT}`;
  ctx.textAlign = opt.align || 'center';
  ctx.textBaseline = opt.baseline || 'middle';
  ctx.lineWidth = opt.outline || 3;
  ctx.strokeStyle = opt.outlineColor || 'rgba(0,0,0,0.75)';
  ctx.strokeText(str, x, y);
  ctx.fillStyle = opt.color || PAL.white;
  ctx.fillText(str, x, y);
  ctx.restore();
}

// 简单确定性哈希（用于格子装饰的稳定随机）
export function hash2(x, y, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}
