// UI 组件 & 角色绘制

import { PAL, FONT, clamp, fillRect, roundRectPath, text, bar } from '../core/utils.js';

// ---------------- 人形绘制 ----------------
// x, y 为脚底中心点
export function drawFigure(ctx, x, y, o = {}) {
  const s = o.scale || 1;
  const facing = o.facing == null ? 1 : o.facing;
  const body = o.bodyColor || '#6b5a45';
  const accent = o.accentColor || '#3d3225';
  const t = o.t || 0;
  const pose = o.pose || 'idle';
  const alpha = o.alpha == null ? 1 : o.alpha;
  const tint = o.tint || null;

  ctx.save();
  ctx.globalAlpha = alpha;

  // 地面投影
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath();
  ctx.ellipse(x, y + 1, 20 * s, 5.5 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.translate(x, y);
  ctx.scale(facing * s, s);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const breathe = Math.sin(t * 2.2) * 1.1;
  let bob = breathe;
  let lean = 0;
  if (pose === 'walk') bob = Math.abs(Math.sin(t * 9)) * 2.6 - 1;
  else if (pose === 'attack') { bob = -2; lean = 0.16; }
  else if (pose === 'hurt') { bob = 0; lean = -0.22; }
  else if (pose === 'dead') { bob = 0; lean = -0.9; }

  ctx.translate(0, bob);
  ctx.rotate(lean * 0.4);

  const hipY = -20;
  const shoulderY = -46;
  const headY = -56;
  const headR = 9.2;

  // 腿
  const legSwing = pose === 'walk' ? Math.sin(t * 9) * 7 : 0;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(-1, hipY);
  ctx.lineTo(-1 - legSwing * 0.5, -1);
  ctx.moveTo(2, hipY);
  ctx.lineTo(2 + legSwing * 0.5, -1);
  ctx.stroke();

  // 躯干
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(-9, shoulderY - 2);
  ctx.lineTo(9, shoulderY - 2);
  ctx.lineTo(7.5, hipY + 3);
  ctx.lineTo(-7.5, hipY + 3);
  ctx.closePath();
  ctx.fill();

  // 衣襟高光
  ctx.strokeStyle = 'rgba(255,255,255,0.13)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(0, shoulderY - 1);
  ctx.lineTo(-2.5, hipY + 2);
  ctx.stroke();

  // 腰带
  ctx.fillStyle = o.sashColor || PAL.crimson;
  ctx.fillRect(-8, hipY - 4, 16, 3.4);

  // 头
  ctx.fillStyle = o.skinColor || '#d9bfa3';
  ctx.beginPath();
  ctx.arc(1, headY, headR, 0, Math.PI * 2);
  ctx.fill();
  // 发髻
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(0, headY - 4, headR * 0.95, Math.PI * 1.02, Math.PI * 2.05);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-1.5, headY - 11, 3.6, 0, Math.PI * 2);
  ctx.fill();

  // 眼睛（朝向侧）
  ctx.fillStyle = 'rgba(20,16,12,0.85)';
  ctx.fillRect(5, headY - 1, 3.4, 1.8);

  // 手臂 + 武器
  const armPose = o.armAngle == null ? 0 : o.armAngle;
  const backArmSwing = pose === 'walk' ? Math.sin(t * 9 + Math.PI) * 0.5 : 0;
  const react = o.reactAngle || 0;

  ctx.save();
  ctx.translate(4, shoulderY + 2);
  ctx.rotate(-0.35 + armPose + react + backArmSwing);
  ctx.strokeStyle = body;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(13, 5);
  ctx.stroke();
  ctx.restore();

  // 前臂 + 剑
  ctx.save();
  ctx.translate(7, shoulderY + 3);
  ctx.rotate(o.weaponAngle == null ? -0.1 : o.weaponAngle);
  ctx.strokeStyle = body;
  ctx.lineWidth = 6.4;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(14, 4.5);
  ctx.stroke();

  if (!o.hideWeapon) {
    ctx.save();
    ctx.translate(14, 4.5);
    ctx.rotate(o.swordAngle == null ? -0.55 : o.swordAngle);
    // 剑柄
    ctx.strokeStyle = o.hiltColor || '#3a2f24';
    ctx.lineWidth = 3.6;
    ctx.beginPath();
    ctx.moveTo(-5, 0);
    ctx.lineTo(2, 0);
    ctx.stroke();
    // 护手
    ctx.strokeStyle = o.guardColor || PAL.gold;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(2, -3.4);
    ctx.lineTo(2, 3.4);
    ctx.stroke();
    // 剑身
    const blade = o.bladeLength || 46;
    const g = ctx.createLinearGradient(2, 0, blade, 0);
    g.addColorStop(0, o.bladeColor || '#cfd6da');
    g.addColorStop(1, '#ffffff');
    ctx.strokeStyle = g;
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(2, 0);
    ctx.lineTo(blade, 0);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();

  // 受击闪白
  if (o.flash > 0) {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = `rgba(255,255,255,${clamp(o.flash, 0, 1) * 0.75})`;
    ctx.fillRect(-30, -76, 60, 80);
    ctx.globalCompositeOperation = 'source-over';
  }

  ctx.restore();

  if (tint) {
    ctx.save();
    ctx.globalAlpha = alpha * 0.5;
    ctx.strokeStyle = tint;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y - 28 * s, 22 * s, 34 * s, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

// ---------------- 菜单 ----------------
/**
 * items: [{ label, value, desc, disabled, color, tag }]
 * 返回 { rowH, visibleFrom, visibleTo }
 */
export function drawMenu(ctx, x, y, w, items, index, o = {}) {
  const hasDesc = items.some((i) => i.desc);
  const rowH = o.rowH || (hasDesc ? 46 : 34);
  const maxRows = o.maxRows || items.length;
  let from = 0;
  if (items.length > maxRows) {
    from = clamp(index - Math.floor(maxRows / 2), 0, items.length - maxRows);
  }
  const to = Math.min(items.length, from + maxRows);

  for (let i = from; i < to; i++) {
    const it = items[i];
    const ry = y + (i - from) * rowH;

    if (it.header) {
      text(ctx, it.label, x, ry + 14, { size: 12, weight: 700, color: PAL.goldDim });
      ctx.save();
      ctx.strokeStyle = 'rgba(212,162,76,0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + ctx.measureText(it.label).width + 12, ry + 10);
      ctx.lineTo(x + w, ry + 10);
      ctx.stroke();
      ctx.restore();
      continue;
    }

    const sel = i === index;
    const dis = !!it.disabled;

    if (sel) {
      ctx.save();
      roundRectPath(ctx, x - 6, ry - 4, w + 12, rowH - 4, 4);
      ctx.fillStyle = o.selBg || 'rgba(212,162,76,0.10)';
      ctx.fill();
      ctx.strokeStyle = o.selBorder || 'rgba(212,162,76,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
      fillRect(ctx, x - 8, ry - 2, 3, rowH - 8, PAL.gold);
    }

    const labelColor = dis
      ? PAL.paperFaint
      : it.color || (sel ? PAL.paper : PAL.paperDim);
    text(ctx, it.label, x, ry + 15, {
      size: o.labelSize || 15,
      weight: sel ? 700 : 400,
      color: labelColor,
    });

    if (it.tag) {
      text(ctx, it.tag, x + w - (it.value ? 132 : 0), ry + 15, {
        size: 12,
        color: dis ? PAL.paperFaint : (it.tagColor || PAL.jade),
        align: 'right',
      });
    }

    if (it.value) {
      text(ctx, it.value, x + w, ry + 15, {
        size: 14,
        color: dis ? PAL.paperFaint : (sel ? PAL.gold : PAL.paperDim),
        align: 'right',
      });
    }

    if (it.desc) {
      text(ctx, it.desc, x, ry + 34, {
        size: 12,
        color: dis ? '#6a6052' : '#9a8f76',
      });
    }
  }

  // 滚动指示
  if (items.length > maxRows) {
    const trackH = maxRows * rowH - 6;
    fillRect(ctx, x + w + 6, y - 4, 2, trackH, '#2a231b');
    const thumbH = Math.max(18, trackH * (maxRows / items.length));
    const thumbY = y - 4 + (trackH - thumbH) * (index / Math.max(1, items.length - 1));
    fillRect(ctx, x + w + 4, thumbY, 6, thumbH, PAL.goldDim);
  }

  return { rowH, from, to };
}

// ---------------- 其他小件 ----------------
export function sectionTitle(ctx, x, y, label, color) {
  text(ctx, label, x, y, { size: 13, weight: 700, color: color || PAL.gold });
  ctx.save();
  ctx.strokeStyle = 'rgba(212,162,76,0.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 12, y - 4.5);
  ctx.lineTo(x + 320, y - 4.5);
  ctx.stroke();
  ctx.restore();
}

export function keyCap(ctx, x, y, key, o = {}) {
  const pad = 5;
  ctx.save();
  ctx.font = `700 ${o.size || 11}px ${FONT}`;
  const w = Math.max(18, ctx.measureText(key).width + pad * 2);
  roundRectPath(ctx, x, y - 10, w, 15, 3);
  ctx.fillStyle = o.bg || 'rgba(233,223,200,0.10)';
  ctx.fill();
  ctx.strokeStyle = o.border || 'rgba(233,223,200,0.28)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = o.color || PAL.paper;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(key, x + w / 2, y - 2.5);
  ctx.restore();
  return w;
}

export function statRow(ctx, x, y, label, value, o = {}) {
  text(ctx, label, x, y, { size: 12.5, color: '#8b8069' });
  text(ctx, value, x + (o.w || 150), y, {
    size: 12.5,
    align: 'right',
    color: o.color || PAL.paper,
  });
}

export function resourceBar(ctx, x, y, w, h, label, ratio, color, valueText) {
  bar(ctx, x, y, w, h, ratio, color, { r: 2 });
  if (valueText) {
    text(ctx, valueText, x + w / 2, y + h / 2 + 0.5, {
      size: 10,
      align: 'center',
      baseline: 'middle',
      color: 'rgba(255,255,255,0.92)',
    });
  }
}
