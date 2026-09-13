// 人物信息面板（战斗与秘境共用）
//
// 两处都要「按 C 看人」，但取数来源不同：
//   · 战斗里看的是本场的运行时快照（this.p）——气血体力都是这一场剩多少
//   · 秘境里没有战斗快照，直接读玩家（HP/气/剑意），且体力在战斗外无意义
// 所以这里只接一个「视图」对象，不关心调用方是谁。

import {
  PAL, roundRectPath, text, bar, fillRect,
} from '../core/utils.js';
import { BASE_MOVES, SKILLS, ULTIMATE, INTENT, QI_REGEN, STAM_REGEN, skillTotalDamage } from '../data/skills.js';
import { ATTRS } from '../data/world.js';
import { sectionTitle } from './widgets.js';

const PW = 700;
const PH = 456;

function panelBox(ctx, x, y, w, h, border) {
  ctx.save();
  roundRectPath(ctx, x, y, w, h, 5);
  ctx.fillStyle = 'rgba(14,11,8,0.9)';
  ctx.fill();
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

/**
 * @param view  { hp, maxHp, qi, maxQi, stam, maxStam, intent, maxIntent,
 *                showStam, armorDefense, tip }
 *               stam / maxStam 留空即不显示体力一条（秘境里没有这个资源）
 */
export function renderCharPanel(ctx, W, H, P, view) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.74)';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  const px = Math.round((W - PW) / 2), py = Math.round((H - PH) / 2);
  panelBox(ctx, px, py, PW, PH, PAL.line2);

  text(ctx, '人物', px + 26, py + 34, { size: 19, weight: 700, color: PAL.gold });
  text(ctx, `Lv.${P.level}　${P.exp}/${P.expToNext} 历练　剩余修为 ${P.attrPoints}`,
    px + 106, py + 34, { size: 13, color: PAL.paperDim });
  text(ctx, 'Esc/C 关闭', px + PW - 26, py + 34, {
    size: 12, align: 'right', color: PAL.paperFaint,
  });
  fillRect(ctx, px + 26, py + 46, PW - 52, 1, 'rgba(233,223,200,0.16)');

  // ---- 左：当前状态（各行按需出现，故用 lineno 递增而非下标） ----
  sectionTitle(ctx, px + 26, py + 70, '当前');
  const intentFull = view.intent >= view.maxIntent;
  const rowsDef = [
    ['气血', view.hp, view.maxHp, PAL.hp, false, ''],
    ['内力', view.qi, view.maxQi, PAL.qi, false, `回 ${(P.qiRegenMul * QI_REGEN).toFixed(1)}/s`],
    ['体力', view.stam, view.maxStam, PAL.stam, false, `回 ${STAM_REGEN}/s`],
    ['剑意', view.intent, view.maxIntent, ULTIMATE.tint, intentFull,
      `出招 +${INTENT.perBase}／连招 +${INTENT.perSkill}`],
  ].filter((r) => view.showStam !== false || r[0] !== '体力');

  rowsDef.forEach(([name, v, max, col, full, note], i) => {
    const y = py + 86 + i * 30;
    const bw = 212;
    bar(ctx, px + 26, y, bw, 14, v / max, col, {
      r: 3,
      border: full ? 'rgba(233,214,255,0.95)' : 'rgba(0,0,0,0.55)',
    });
    text(ctx, `${name} ${Math.floor(v)} / ${max}`, px + 26 + bw / 2, y + 7.5, {
      size: 10.5, align: 'center', baseline: 'middle', color: 'rgba(255,255,255,0.94)',
    });
    if (note) text(ctx, note, px + 250, y + 7.5, { size: 10, baseline: 'middle', color: '#7d735e' });
  });

  const attrTop = py + 86 + rowsDef.length * 30 + 10;
  sectionTitle(ctx, px + 26, attrTop, '根基');
  ATTRS.forEach((a, i) => {
    const y = attrTop + 24 + i * 24;
    text(ctx, a.name, px + 30, y, { size: 12.5, color: a.color });
    text(ctx, String(P.attrs[a.id]), px + 160, y, { size: 12.5, align: 'right', color: PAL.paper });
    text(ctx, a.desc, px + 176, y, { size: 10.5, color: '#7d735e' });
  });

  // ---- 右：身手 / 兵装 / 剑招 ----
  sectionTitle(ctx, px + 364, py + 70, '身手');
  const stam = view.showStam === false ? Infinity : view.stam;
  const hits = [
    ['轻招伤害', `${P.lightDamage.toFixed(1)}${stam < BASE_MOVES.light.stamina ? '　体力不足' : ''}`],
    ['重招伤害', `${P.heavyDamage.toFixed(1)}${stam < BASE_MOVES.heavy.stamina ? '　体力不足' : ''}`],
    ['护体', Math.round(view.armorDefense == null ? P.defense : view.armorDefense)],
    ['出招速度', `${(1 / P.speedMul * 100).toFixed(0)}%`],
  ];
  hits.forEach(([k, v], i) => {
    const x = px + 372 + (i % 2) * 158;
    const y = py + 94 + Math.floor(i / 2) * 22;
    text(ctx, k, x, y, { size: 12, color: '#8b8069' });
    text(ctx, String(v), x + 146, y, { size: 12, align: 'right', color: PAL.paper });
  });

  sectionTitle(ctx, px + 364, py + 148, '兵装');
  const w = P.weaponData;
  const ar = P.armorData;
  const equip = [
    ['兵器', `${w.name} +${P.weaponLevel}`,
      `轻+${w.lightBonus + P.forge.light}　重+${w.heavyBonus + P.forge.heavy}　内力+${w.qiMax + P.forge.qi}`],
    ['护具', ar.name, `气血+${ar.hpMax}　护体+${ar.def}`],
  ];
  equip.forEach(([k, v, sub], i) => {
    const y = py + 172 + i * 30;
    text(ctx, k, px + 372, y, { size: 12.5, color: PAL.paperDim });
    text(ctx, v, px + 632, y, { size: 12.5, align: 'right', color: PAL.paper });
    text(ctx, sub, px + 372, y + 13, { size: 10.5, color: '#7d735e' });
  });

  sectionTitle(ctx, px + 364, py + 244, `剑招 (${P.skills.length}/${SKILLS.length})`);
  P.skills.forEach((sid, i) => {
    const s = SKILLS.find((x) => x.id === sid);
    if (!s) return;
    const y = py + 268 + i * 26;
    const pat = s.pattern.map((m) => (m === 'light' ? '轻' : '重')).join('·');
    const afford = view.qi >= s.qi;
    text(ctx, pat, px + 372, y, { size: 12.5, weight: 700, color: s.tint });
    text(ctx, s.name, px + 424, y, { size: 13.5, color: afford ? PAL.paper : '#8a7f6d' });
    text(ctx, `耗气 ${s.qi}`, px + 632, y, {
      size: 11, align: 'right', color: afford ? PAL.paperFaint : '#8a6a2f',
    });
    const extra = `总伤 ${Math.round(skillTotalDamage(s) * P.attackMul)}`
      + (s.as ? `　接续${s.as === 'light' ? '轻' : '重'}` : '');
    text(ctx, extra, px + 372, y + 11, { size: 10.5, color: '#8a8070' });
  });

  // 提示行独占一行空白（上方 6 条剑招最多画到 py+409），避免与剑招小字叠在一起
  if (view.tip) {
    fillRect(ctx, px + 26, py + PH - 34, PW - 52, 1, 'rgba(233,223,200,0.10)');
    text(ctx, view.tip, px + 26, py + PH - 16, { size: 11.5, color: '#8a6a2f' });
  }
}
