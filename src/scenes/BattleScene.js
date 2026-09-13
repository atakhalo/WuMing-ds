// 战斗场景：单时间轴驱动的回合节奏战斗
//
// 【核心】表现与时间轴是分开的两件事，表演期间时间轴完全暂停。
//
//   · 行动演出（perform）期间，时间轴**冻结不动**，只有画面在演。
//   · 演出结束，该行动才在时间轴上占一段时长（axis），此时时间轴开始推进。
//   · 演出本身**不占轴**，所以轴上每一段表示的就是「cd 时间」或「闪避／格挡时间」。
//
// 【时间轴】只有一条，我方与敌方的行动都排在上面。指针左侧留一小段「已走过」的
// 回忆区（约占全宽的 1/10），右侧都是「将要发生」。
//
//   现在                     轻↓      重↓      ← 轮到我方：只画下箭头预览落点
//    ▼                        │        │
//    ├─────┴──────────────────┴────────┴─────
//    │      └── 轻 0.34s ──┘                 ← 选定后箭头才变成一段行动条
//    │  ┌─敌·沉肩 0.8s─┐┌── 敌·背刺 0.8s ──┐  ← 最多两条：过去的（压暗）+ 将要的
//    └──────────────────────────────────────
//
//   · 推进到**我方的行动点**时时间冻结，等你选一个行动。选定前只显示下箭头
//     （预览各招式的 cd 落点），选定后箭头才变成行动条。
//   · 推进到**敌方的行动点**时敌人出手。演出期间轴同样冻结，但敌方行动条
//     **不隐藏**，方便你对照自己正处于哪一段。
//   · 轴上每一段弧长只表示两种含义之一：cd 时间，或闪避／格挡时间。
//   · 敌方轴上**最多两条**，每条代表一次出手：起点是那次出手的时刻，
//     长度是它到再下次出手的 cd。已发生的那条压暗，队列里那条亮色。
//     敌方出手的那一刻，两条一起向后接一段。
//   · 闪避与格挡也是排进轴的「一段行动」：若敌方行动点正落在这段之内，
//     就判定为成功闪避／格挡——不需要在敌人出手时做即时反应。
//   · 敌人招式分三类：攻击、防御（伤减）、歇息（回血）。后两类是留给玩家
//     调整节奏、攒体力连招的窗口。

import {
  BASE_MOVES, SKILLS, ULTIMATE, INTENT, SEQ_WINDOW, matchSkill, seqStep, stepMove, seqAfterSkill,
  QI_REGEN, STAM_REGEN, EVADE, GUARD, GUARD_PARRY_WINDOW, WAIT,
} from '../data/skills.js';
import { getEnemy, moveKind, SPAR_DUMMY, INTERVAL_SCALE } from '../data/enemies.js';
import { getItem, rollDrop } from '../data/items.js';
import {
  PAL, FONT, clamp, lerp, rand, randInt, fillRect, roundRectPath, text, bar,
  easeOutCubic, strokeText, measure,
} from '../core/utils.js';
import { justPressed } from '../core/input.js';
import { drawFigure } from '../ui/widgets.js';
import { renderCharPanel } from '../ui/charPanel.js';
import { sfx } from '../core/audio.js';

const GROUND_Y = 402;
const P_X = 300;
const E_X = 662;
const PAST_WINDOW = 0.36;    // 指针左侧可见的「已走过」区间（约占全宽的 1/10）
const FUTURE_WINDOW = 3.0;   // 指针右侧可见的「将要发生」区间（秒）

const DUMMY_ENEMY = {
  id: 'dummy', name: '木人桩', tier: 0, hp: 999999, atk: 0, def: 0,
  interval: [2.2, 3.0], exp: 0, gold: [0, 0], size: 1.0,
  bodyColor: '#8a6a4a', accentColor: '#5a4630', dummy: true,
  intro: '一具千疮百孔的木人，不会还手。', moves: [],
};

export class BattleScene {
  constructor(game) {
    this.game = game;
    this.reset();
  }

  reset() {
    this.fx = [];
    this.floaters = [];
    this.shakeT = 0;
    this.shakeDur = 1;
    this.shakeMag = 0;
    this.banner = null;
    this.tip = null;
    this.result = null;
    this.rewardInfo = null;
    this.showChar = false;   // 按 C 查看人物信息（打开时整个战斗冻结）
    this.hitStop = 0;
  }

  enter(args = {}) {
    this.reset();
    this.game.paused = false;
    this.training = !!args.training;
    this.spar = !!args.spar;     // 演武：对手是「会还手的机关木人」，而不是死木桩
    this.theme = args.theme || { wall: '#2c2b26', floor: '#3a3630', accent: '#6f8f5c' };
    this.tier = args.tier || 1;
    this.onEnd = args.onEnd || null;
    // 演武场的两种木人：死桩（∞ 血、只挨打）与机关木人（血有限、会出手）
    this.enemyDef = this.training
      ? (this.spar ? SPAR_DUMMY : DUMMY_ENEMY)
      : getEnemy(args.enemyId);

    // ---- 时间轴 ----
    // state: advancing 轴推进 | awaiting 轮到我方（冻结） | myPerform 我方演出（冻结） | enemyPerform 敌方演出（冻结）
    this.now = 0;
    this.state = 'advancing';
    this.nextPlayerAt = 0;
    this.myAct = null;           // 我方本段行动 { kind, from, axis, perform, name, tint, hits[] }
    this.myPerf = null;          // 我方演出 { t, dur, name, tint }
    this.enemyQueue = [];        // 敌方已排定的后续行动（按 at 升序，可显示「将要的行动」）
    this.enemyPerf = null;       // 敌人正在执行的行动 { t, dur, windup, strikeAt, recover, move }
    this.enemyAt = 0;            // 敌人本次演出开始的时间轴时刻
    this.enemyBarFrom = 0;       // 敌方「过去的行动」那条的起点（最近一次出手时刻）
    this.enemyBarName = null;    // 该次出手的招式名
    this.enemyBarKind = null;    // 该次出手的类型（defend 要在轴上换配色）
    this.enemyHasActed = false;  // 是否已经出手过至少一次
    this.enemyVs = null;         // 敌人出手时，我方正处于哪一段（决定闪避/格挡是否成立）

    const P = this.game.player;

    this.p = {
      ref: P,
      maxHp: P.maxHp,
      hp: this.training ? P.maxHp : clamp(P.hp, 1, P.maxHp),
      maxQi: P.maxQi,
      qi: this.training ? P.maxQi : clamp(P.qi == null ? P.maxQi : P.qi, 0, P.maxQi),
      maxStam: P.maxStamina,
      stam: P.maxStamina,
      // 剑意是跨战斗资源：进场沿用存档值，演武场照常带入（能不能攒见 gainIntent）
      maxIntent: INTENT.max,
      intent: clamp(P.intent == null ? 0 : P.intent, 0, INTENT.max),
      x: P_X,
      lunge: 0,
      facing: 1,
      seq: [],
      seqSetAt: -999,
      hitQueue: [],
      guardUp: false,            // 当前段是否为格挡
      evadeUp: false,            // 当前段是否为闪避
      hitFlash: 0,
      combo: 0,
      comboSetAt: -999,
      animT: Math.random() * 4,
      swing: 0,
      flinch: 0,
      guardPose: 0,
    };

    const ed = this.enemyDef;
    this.e = {
      def: ed,
      maxHp: ed.hp,
      hp: ed.hp,
      x: E_X,
      lunge: 0,
      facing: -1,
      hitQueue: [],
      hitFlash: 0,
      // 防御是一段「轴上的窗口」而不是演出状态：从它出手那一刻起盖到下一次出手。
      // 演出不入轴、玩家也不可能在演出里出招，所以减伤必须挂在轴上才可能被撞上
      guardUntil: -Infinity,   // 窗口的截止时刻（绝对时刻）
      guardMul: 1,
      restHeal: 0,
      dead: false,
      deadT: 0,
      animT: Math.random() * 4,
      swing: 0,
    };

    this.phase = 'intro';
    this.phaseTimer = 1.15;
    this.introT = 0;

    // 开局第一击提前：开场就要面对出手，没有白打的空档
    this.ensureEnemyQueue(4, rand(0.28, 0.55));
  }

  get P() { return this.game.player; }

  // ==================== 调度 ====================
  /**
   * 生成一次敌人行动。招式与出手时刻此刻就定下，
   * 这样轴上才能显示「将要的行动」。
   */
  makeEnemyPlan(at) {
    const moves = this.e.def.moves;
    const mv = moves[Math.floor(Math.random() * moves.length)];
    const impact = mv.impactDelay == null ? 0.12 : mv.impactDelay;
    const hits = mv.hits || 1;
    const recover = mv.recover || 0.55;
    // 收招从最后一击命中之后算起
    const strikeAt = mv.windup + impact + (hits - 1) * 0.18;
    const dur = strikeAt + 0.14 + recover;
    return { at, dur, windup: mv.windup, strikeAt, recover, move: mv, kind: moveKind(mv) };
  }

  enemyInterval() {
    const iv = this.e.def.interval || [2, 3];
    return rand(iv[0], iv[1]) * INTERVAL_SCALE;
  }

  /** 预先排定若干次敌人行动，队列排满为止（供轴上显示未来的行动） */
  ensureEnemyQueue(minCount = 2, firstAt) {
    const e = this.e;
    if (e.def.dummy || !e.def.moves || !e.def.moves.length) return;
    while (this.enemyQueue.length < minCount) {
      const last = this.enemyQueue[this.enemyQueue.length - 1];
      let at;
      if (last) at = last.at + this.enemyInterval();
      else if (firstAt != null) at = firstAt;
      else if (this.enemyHasActed) at = this.enemyBarFrom + this.enemyInterval();
      else at = this.now + this.enemyInterval();
      this.enemyQueue.push(this.makeEnemyPlan(at));
    }
  }

  /** 时间轴推进；到点则派发行动 */
  advanceClock(dt) {
    this.now += dt;
    for (let guard = 0; guard < 8; guard++) {
      const eAt = (!this.enemyPerf && this.enemyQueue.length) ? this.enemyQueue[0].at : Infinity;
      const pAt = this.nextPlayerAt;
      if (Math.min(eAt, pAt) > this.now) break;

      if (eAt <= pAt) {
        this.beginEnemyPerform();
      } else {
        // 敌人正打到一半时等它收招完毕，别把挥到一半的剑冻住
        if (this.enemyPerf) break;
        // 行动点落在本帧内则精确停住，消除累积帧误差；
        // 若已越过行动点（被敌人演出推后），则保持当前时刻不倒流
        if (pAt > this.now - dt) this.now = pAt;
        this.enterAwaiting();
        break;
      }
    }
  }

  enterAwaiting() {
    this.state = 'awaiting';
    this.myAct = null;
    this.p.guardUp = false;
    this.p.evadeUp = false;
    sfx.uiMove();
  }

  beginEnemyPerform() {
    const plan = this.enemyQueue.shift();
    if (!plan) { this.state = 'advancing'; return; }
    // 演出开始时记下时间轴时刻，演出期间指针冻结在此处
    this.enemyPerf = Object.assign({}, plan, { t: 0, swing: 0 });
    this.enemyAt = plan.at;
    // 它此刻就算「已经出手」：这条行动条（起点是它出手的时刻）立即接上，
    // 表演期间轴上依然在，不会消失
    this.enemyBarFrom = plan.at;
    this.enemyBarName = plan.move.name;
    this.enemyBarKind = plan.kind;
    this.enemyHasActed = true;
    // 立刻把队列补回两条：否则表演期间队列只剩一条，
    // 轴上「将要的行动」那条会整段消失，演完才重新出现
    this.ensureEnemyQueue(2);

    // 敌方行动点落在我方哪一段行动之内？这决定闪避／格挡是否成立。
    // 因为一切都在轴上排好了，所以无需即时反应。
    const act = this.myAct;
    const inside = !!act && this.enemyAt < act.from + act.axis - 1e-6;
    this.enemyVs = {
      kind: inside ? act.kind : null,
      pos: inside ? (this.enemyAt - act.from) : 0,
      name: inside ? act.name : null,
    };

    // 在演出开场就把命中时刻排定（相对演出起点），
    // 这样演出推进到点即结算，不依赖逐帧累减
    this.e.hitQueue = [];
    const mv = plan.move;
    if (plan.kind === 'attack') {
      const impact = mv.impactDelay == null ? 0.12 : mv.impactDelay;
      const hits = mv.hits || 1;
      for (let i = 0; i < hits; i++) {
        this.e.hitQueue.push({ at: plan.windup + impact + i * 0.18, step: mv, done: false });
      }
    } else if (plan.kind === 'rest') {
      // 歇息：在出手时刻回血，玩家可以趁机让招或调整
      this.e.hitQueue.push({ at: plan.strikeAt, rest: true, done: false });
    }
    // defend 无结算，纯粹是一段「玩家打不痛」的窗口

    // 防御窗口 = [它出手那一刻, 它下一次出手)。轴上的「过去的行动」那条画的就是这一段，
    // 窗口与它严格一致，玩家看条就知道这段时间硬拼不划算。
    if (plan.kind === 'defend') {
      this.e.guardUntil = this.enemyQueue.length ? this.enemyQueue[0].at : plan.at + 0.8;
      this.e.guardMul = mv.guardMul == null ? 0.4 : mv.guardMul;
    }

    this.state = 'enemyPerform';
    this.e.swing = 0;
    sfx.uiMove();
  }

  endEnemyPerform() {
    const perf = this.enemyPerf;
    const e = this.e;
    e.swing = 0;
    e.hitQueue.length = 0;
    this.enemyPerf = null;
    this.enemyVs = null;
    // 敌方表演不占轴：指针仍停在行动点，随后从这里继续推进
    if (this.phase === 'fight') this.ensureEnemyQueue(2);
    this.state = 'advancing';
  }

  // ==================== 更新 ====================
  update(dt) {
    // 人物信息面板打开时整个战斗冻结：时间轴、演出、资源、特效一概不推进，
    // 否则玩家看信息时会被继续推进的敌人打死
    if (this.showChar) {
      if (justPressed('KeyC') || justPressed('KeyI') || justPressed('Escape')) {
        this.showChar = false;
        sfx.ui();
      }
      return;
    }

    if (this.hitStop > 0) {
      this.hitStop -= dt;
      dt *= 0.15;
    }
    this.updateFx(dt);
    this.p.animT += dt;
    this.e.animT += dt;

    if (this.phase === 'intro') {
      this.introT += dt;
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) this.phase = 'fight';
      return;
    }

    if (this.phase !== 'fight') {
      this.phaseTimer += dt;
      if (this.phaseTimer > 0.5 &&
        (justPressed('Enter') || justPressed('Space') || justPressed('KeyJ') || justPressed('Escape'))) {
        this.finish();
      }
      return;
    }

    // 时间轴推进
    if (this.state === 'advancing') this.advanceClock(dt);

    // 演出推进（演出期间时间轴冻结）
    if (this.state === 'myPerform') this.updateMyPerform(dt);
    else if (this.state === 'enemyPerform') this.updateEnemyPerform(dt);

    // 资源：只在时间轴推进时回复（思考与演出期间不白掉体力）
    if (this.state === 'advancing') this.updateResources(dt);

    this.updateInput(dt);

    if (this.tip) {
      this.tip.t += dt;
      if (this.tip.t > 1.6) this.tip = null;
    }
    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t > this.banner.life) this.banner = null;
    }

    const p = this.p;
    if (p.seq.length && this.now - p.seqSetAt > SEQ_WINDOW) p.seq = [];
    if (p.combo > 0 && this.now - p.comboSetAt > 2.4) p.combo = 0;
  }

  updateResources(dt) {
    const p = this.p;
    const P = this.P;
    // 防御段内不回体力：否则可以靠连续格挡无限拖时间
    const act = this.myAct;
    const defending = !!act && (act.kind === 'evade' || act.kind === 'guard');
    if (!defending) {
      p.stam = Math.min(p.maxStam, p.stam + STAM_REGEN * dt);
    }
    p.qi = Math.min(p.maxQi, p.qi + QI_REGEN * P.qiRegenMul * dt);
  }

  // ---- 我方演出 ----
  updateMyPerform(dt) {
    const perf = this.myPerf;
    if (!perf) { this.endMyPerform(); return; }
    perf.t += dt;
    const k = clamp(perf.t / Math.max(0.01, perf.dur), 0, 1);
    const act = this.myAct;

    if (act && act.kind === 'evade') {
      // 侧身闪避：压身 → 回正
      this.p.swing = 0;
      this.p.guardPose = 0;
    } else if (act && act.kind === 'guard') {
      // 举剑格挡：抬起 → 稳住
      this.p.guardPose = clamp(k / 0.7, 0, 1);
      this.p.swing = 0;
    } else {
      // 出招：挥出 → 收回，收回动作落在演出后半段
      this.p.swing = k < 0.3 ? k / 0.3 : 1 - (k - 0.3) / 0.7;
    }

    // 演出期间的命中判定
    if (this.p.hitQueue.length) {
      for (const h of this.p.hitQueue) h.at -= dt;
      const ready = this.p.hitQueue.filter((h) => h.at <= 0);
      this.p.hitQueue = this.p.hitQueue.filter((h) => h.at > 0);
      for (const h of ready) this.playerHit(h.step);
    }

    if (perf.t >= perf.dur) this.endMyPerform();
  }

  endMyPerform() {
    const act = this.myAct;
    this.myPerf = null;
    this.p.swing = 0;
    this.p.hitQueue.length = 0;
    if (this.phase !== 'fight') return;
    // 演出不入轴：指针不跳，从原处开始推进本行动的轴段
    this.nextPlayerAt = this.now + (act ? act.axis : 0);
    this.state = 'advancing';
  }

  // ---- 敌方演出 ----
  updateEnemyPerform(dt) {
    const perf = this.enemyPerf;
    if (!perf) { this.endEnemyPerform(); return; }
    perf.t += dt;
    const t = perf.t;

    // 姿态：攻击=挥剑；防御=举剑架住；歇息=松垂
    let swing = 0;
    if (perf.kind === 'defend') {
      const k = clamp(t / Math.max(0.01, perf.strikeAt), 0, 1);
      swing = k < 0.5 ? k * 1.5 : 0.75;
    } else if (perf.kind === 'rest') {
      swing = 0;
    } else if (t < perf.windup) {
      swing = (t / Math.max(0.01, perf.windup)) * 0.85;
    } else if (t < perf.strikeAt) {
      swing = 0.85 + ((t - perf.windup) / Math.max(0.01, perf.strikeAt - perf.windup)) * 0.15;
    } else if (t < perf.strikeAt + 0.14) {
      swing = 1 - ((t - perf.strikeAt) / 0.14) * 0.55;
    } else {
      const rk = clamp((t - perf.strikeAt - 0.14) / Math.max(0.01, perf.recover), 0, 1);
      swing = 0.45 * (1 - rk);
    }
    this.e.swing = swing;

    // 结算：攻击→伤害玩家；歇息→敌人回血；防御→无结算
    for (const h of this.e.hitQueue) {
      if (h.done || t < h.at) continue;
      h.done = true;
      if (h.rest) {
        const heal = perf.move.heal || 10;
        const before = this.e.hp;
        this.e.hp = Math.min(this.e.maxHp, this.e.hp + heal);
        const got = Math.round(this.e.hp - before);
        if (got > 0) {
          this.spawnFloater(this.e.x, GROUND_Y - 100, `+${got}`, '#7ce08a', 18);
          sfx.pickup();
        }
        this.flashTip(`${this.e.def.name} 调息片刻`);
      } else {
        this.enemyHitPlayer(h.step);
      }
    }

    if (t >= perf.dur) this.endEnemyPerform();
  }

  // ---- 输入 ----
  updateInput(dt) {
    const p = this.p;
    const awaiting = this.state === 'awaiting';
    const myTurn = this.state === 'myPerform';

    p.hitFlash = Math.max(0, p.hitFlash - dt * 3.4);
    p.flinch = Math.max(0, p.flinch - dt * 3);
    p.lunge = lerp(p.lunge, 0, clamp(dt * 9, 0, 1));
    this.e.hitFlash = Math.max(0, this.e.hitFlash - dt * 3.4);
    this.e.lunge = lerp(this.e.lunge, 0, clamp(dt * 8, 0, 1));

    if (!myTurn) {
      p.swing = lerp(p.swing, 0, clamp(dt * 8, 0, 1));
      if (p.guardPose > 0 && !p.guardUp) p.guardPose = lerp(p.guardPose, 0, clamp(dt * 6, 0, 1));
    }
    // 格挡段内保持举剑姿态
    if (p.guardUp) p.guardPose = lerp(p.guardPose, 1, clamp(dt * 10, 0, 1));
    else if (this.state !== 'myPerform') p.guardPose = lerp(p.guardPose, 0, clamp(dt * 5, 0, 1));

    if (justPressed('Escape')) { this.tryFlee(); return; }

    // 随时可查人物信息（C / I），不占用行动、不影响时间轴
    if (justPressed('KeyC') || justPressed('KeyI')) {
      this.showChar = true;
      sfx.ui();
      return;
    }

    // 只有轮到我方时才接受指令；此后一切交给时间轴
    if (awaiting) {
      if (justPressed('KeyJ')) { this.tryMove('light'); return; }
      if (justPressed('KeyK')) { this.tryMove('heavy'); return; }
      if (justPressed('KeyU')) { this.doUltimate(); return; }
      if (justPressed('KeyL')) { this.doEvade(); return; }
      if (justPressed('Space')) { this.doGuard(); return; }
      if (justPressed('KeyS') || justPressed('ArrowDown')) { this.doWait(); return; }
    }

    if (justPressed('Digit1')) this.usePill('jinchuang');
    if (justPressed('Digit2')) this.usePill('xingqi');
  }

  // ---------- 出招 ----------
  tryMove(moveId) {
    const p = this.p;
    if (this.state !== 'awaiting') return;

    const seq = p.seq.concat([seqStep(moveId)]);
    const skill = matchSkill(seq);

    if (skill && this.P.hasSkill(skill.id)) {
      if (p.qi >= skill.qi) { this.castSkill(skill); return; }
      this.flashTip(`内力不足，连招中断（需 ${skill.qi}）`);
      sfx.fail();
      this.baseMove(moveId, [seqStep(moveId)]);
      return;
    }
    this.baseMove(moveId, seq);
  }

  /**
   * 开始一次我方行动。
   *   perform 演出时长（时间轴冻结，不占轴）
   *   axis    演出结束后在轴上占用的时长——即「cd」或「闪避/格挡」的持续段
   */
  beginMyAction(o) {
    const p = this.p;
    const spd = this.P.speedMul;
    const perform = Math.max(0, o.perform * spd);

    this.myAct = {
      kind: o.kind || 'attack',
      from: this.now,
      perform,
      axis: o.axis * spd,
      name: o.name,
      tint: o.tint,
      hits: (o.steps || []).map((s) => this.now + s.delay * spd),
    };
    p.hitQueue = (o.steps || []).map((s) => ({ at: s.delay * spd, step: s.step }));
    p.guardUp = this.myAct.kind === 'guard';
    p.evadeUp = this.myAct.kind === 'evade';

    if (perform > 0) {
      this.myPerf = { t: 0, dur: perform, name: o.name, tint: o.tint };
      this.state = 'myPerform';
    } else {
      this.endMyPerform();
    }
  }

  baseMove(moveId, seq) {
    const p = this.p;
    const mv = BASE_MOVES[moveId];
    if (p.stam < mv.stamina) {
      // 不代玩家做决定：仅提示，等玩家自己选择「让招」把时间轴往前放
      this.flashTip('体力不济，可先「让招」(S) 回气');
      sfx.fail();
      return;
    }
    p.stam -= mv.stamina;
    p.seq = seq.slice();
    p.seqSetAt = this.now;
    this.gainIntent(INTENT.perBase);

    this.beginMyAction({
      kind: 'attack',
      perform: mv.perform,
      axis: mv.cd,
      name: mv.actionName,
      tint: mv.tint,
      steps: [{
        delay: mv.impactDelay,
        step: {
          dmg: moveId === 'light' ? this.P.lightDamage : this.P.heavyDamage,
          reach: mv.reach,
          arc: moveId === 'light' ? 92 : 130,
          fx: moveId === 'light' ? 'slash' : 'slam',
          qiGain: mv.qiGain,
          tint: mv.tint,
          isBase: true,
        },
      }],
    });
    if (moveId === 'light') sfx.light(); else sfx.heavy();
  }

  // 兵器对技能的加成：按段数分摊，避免多段技能被放大
  get skillWeaponBonus() {
    const w = this.P.weaponData;
    return (w.lightBonus + w.heavyBonus) * 0.5 + this.P.forge.light + this.P.forge.heavy;
  }

  castSkill(skill) {
    const p = this.p;
    p.qi -= skill.qi;
    // 原序列清空；若这招本身相当于一个基础招式（风卷残云算「轻」、白虹贯日算「重」），
    // 就作为一项接进新序列，让连招能一路滚下去（轻轻轻→风卷残云→再按两下轻→…）
    p.seq = seqAfterSkill(skill);
    p.seqSetAt = p.seq.length ? this.now : -999;
    this.gainIntent(INTENT.perSkill);

    const per = skill.steps.length ? this.skillWeaponBonus / skill.steps.length : 0;
    this.beginMyAction({
      kind: 'attack',
      perform: skill.perform,
      axis: skill.cd,
      name: skill.name,
      tint: skill.tint,
      steps: skill.steps.map((s) => ({
        delay: s.delay,
        step: { ...s, dmg: (s.dmg + per) * this.P.attackMul, tint: skill.tint },
      })),
    });
    this.banner = { text: skill.name, t: 0, life: 0.9, color: skill.tint };
    sfx.skill();
  }

  /**
   * 剑意累积：出招（基础招与连招）都会长剑意，攒满才能放绝学。
   * 生命周期是「一次秘境探索」：场内（含演武）随便攒，离开秘境或演武结束就归零。
   */
  gainIntent(n) {
    const p = this.p;
    if (n <= 0 || p.intent >= p.maxIntent) return;
    p.intent = Math.min(p.maxIntent, p.intent + n);
    if (p.intent >= p.maxIntent) {
      this.flashTip('剑意已满 · 按 U 出无明剑意');
      sfx.parry();
    }
  }

  doUltimate() {
    const p = this.p;
    if (this.state !== 'awaiting') return;
    if (p.intent < ULTIMATE.intentCost) {
      this.flashTip(`剑意未满（${Math.floor(p.intent)} / ${ULTIMATE.intentCost}）`);
      sfx.fail();
      return;
    }
    // 伤害由剑意换算而来（不与内力挂钩），放完清零
    const spent = p.intent;
    p.intent = 0;
    p.seq = [];
    p.seqSetAt = -999;

    this.beginMyAction({
      kind: 'attack',
      perform: ULTIMATE.perform,
      axis: ULTIMATE.cd,
      name: ULTIMATE.name,
      tint: ULTIMATE.tint,
      steps: [{
        delay: ULTIMATE.delay,
        step: {
          dmg: spent * ULTIMATE.dmgPerIntent * this.P.attackMul,
          reach: ULTIMATE.reach, arc: 240, fx: 'ultimate',
          tint: ULTIMATE.tint,
          pierce: true, breakGuard: true, knockback: 70, screenShake: 16,
        },
      }],
    });
    this.banner = { text: ULTIMATE.name, t: 0, life: 1.3, color: ULTIMATE.tint };
    this.shake(16, 0.5);
    sfx.ultimate();
  }

  /** 闪避：排一段较短的轴段，敌方行动点若落在其中即自动闪开 */
  doEvade() {
    const p = this.p;
    if (this.state !== 'awaiting') return;
    if (p.stam < EVADE.stamina) { this.flashTip('体力不济，可先「让招」(S) 回气'); sfx.fail(); return; }
    p.stam -= EVADE.stamina;
    this.beginMyAction({
      kind: 'evade',
      perform: EVADE.perform,
      axis: EVADE.axis,
      name: '闪避',
      tint: EVADE.tint,
    });
    sfx.evade();
    for (let i = 0; i < 6; i++) {
      this.fx.push({
        type: 'dust', x: p.x + rand(-8, 8), y: GROUND_Y - rand(0, 8),
        t: 0, life: rand(0.25, 0.45), vx: rand(-40, 10), vy: rand(-30, -6),
        r: rand(2, 5), color: 'rgba(200,190,170,0.5)',
      });
    }
  }

  /** 格挡：排一段较长的轴段，落在其中的敌方攻击会被大幅减伤（起手段内则招架） */
  doGuard() {
    const p = this.p;
    if (this.state !== 'awaiting') return;
    if (p.stam < GUARD.stamina) { this.flashTip('体力不济，可先「让招」(S) 回气'); sfx.fail(); return; }
    p.stam -= GUARD.stamina;
    // 格挡打断连招：举剑架招，先前攒下的序列就此作废（不额外提示，看序列即可）
    p.seq = [];
    p.seqSetAt = -999;
    this.flashTip('格挡');
    this.beginMyAction({
      kind: 'guard',
      perform: GUARD.perform,
      axis: GUARD.axis,
      name: '格挡',
      tint: GUARD.tint,
    });
    sfx.guard();
  }

  /** 让招：不出招，只把时间轴往前放一段，用来调整出手节奏（不耗体，总是可用） */
  doWait() {
    if (this.state !== 'awaiting') return;
    const p = this.p;
    // 与格挡一样打断连招：收手让招，先前攒下的序列就此作废（不额外提示，看序列即可）
    p.seq = [];
    p.seqSetAt = -999;
    this.flashTip('让招 · 静观其变');
    this.beginMyAction({
      kind: 'wait',
      perform: WAIT.perform,
      axis: WAIT.axis,
      name: '让招',
      tint: WAIT.tint,
    });
    sfx.uiMove();
  }

  usePill(id) {
    const p = this.p;
    if (this.P.itemCount(id) <= 0) { this.flashTip('已无此药'); sfx.fail(); return; }
    const item = getItem(id);
    if (!item) return;
    this.P.useItem(id);
    if (item.kind === 'heal') {
      const before = p.hp;
      p.hp = Math.min(p.maxHp, p.hp + item.value);
      this.spawnFloater(p.x, GROUND_Y - 92, `+${Math.round(p.hp - before)}`, '#7ce08a', 20);
    } else {
      const before = p.qi;
      p.qi = Math.min(p.maxQi, p.qi + item.value);
      this.spawnFloater(p.x, GROUND_Y - 92, `气 +${Math.round(p.qi - before)}`, '#8fd0e8', 18);
    }
    sfx.pickup();
    this.game.toast(`服下${item.name}`, PAL.jade);
  }

  flashTip(msg) {
    this.tip = { text: msg, t: 0 };
  }

  // ---------- 命中结算 ----------
  playerHit(st) {
    const p = this.p;
    p.lunge = 26;
    this.spawnSlash(p.x + 34 + p.lunge, GROUND_Y - 46, -70 + rand(-14, 14),
      st.arc, st.reach, st.tint, st.fx);

    const e = this.e;
    if (e.dead) return;

    // 命中回气：基础招式按招式表，连招每段固定 3 点。
    // 放在演武场分支之前——否则打木人桩不回气，就没法在那里练连招。
    if (st.isBase && st.qiGain) {
      p.qi = Math.min(p.maxQi, p.qi + st.qiGain);
    } else if (!st.isBase) {
      p.qi = Math.min(p.maxQi, p.qi + 3);
    }

    // 死木桩只是挨打的靶子：伤害取简化数值、不扣血。机关木人走正常结算，能被打空
    if (this.training && e.def.dummy) {
      this.spawnFloater(e.x, GROUND_Y - 96, Math.round(st.dmg), '#ffffff', 17);
      this.bumpCombo();
      this.spawnHit(e.x, GROUND_Y - 50, st.tint, 0.7);
      this.shake(3, 0.12);
      sfx.hitLight();
      return;
    }

    const pierce = st.pierce ? 0.5 : 1;
    let real = Math.max(1, st.dmg - e.def.def * 0.6 * pierce);
    // 敌人正在防御（轴上的那段窗口内）：伤害被大幅削弱，这是它「歇一口气」的时间
    if (this.now < e.guardUntil) {
      real *= e.guardMul;
      this.spawnFloater(e.x + rand(-10, 10), GROUND_Y - 118, '挡', '#a9b4c0', 17);
    }
    e.hp -= real;
    e.hitFlash = 1;
    this.bumpCombo();

    const big = real > 26;
    // 只写伤害数值：连击数改用「N 连」跟在后面，避免被误读成伤害倍率
    this.spawnFloater(e.x + rand(-8, 8), GROUND_Y - 96 - rand(0, 12),
      `${Math.round(real)}${p.combo > 4 ? `　${p.combo} 连` : ''}`,
      big ? '#ffcf5c' : '#ffffff', big ? 22 : 17);
    this.spawnHit(e.x, GROUND_Y - 50, st.tint, big ? 1.35 : 0.85);
    this.shake(big ? 7 : 3, big ? 0.2 : 0.11);
    this.hitStop = big ? 0.07 : 0.03;
    if (big) sfx.hitHeavy(); else sfx.hitLight();

    if (st.knockback) e.lunge = -st.knockback * 0.6;

    // 打断：敌人的这次行动作废，直接跳过
    if (st.interrupt && this.enemyPerf && this.enemyPerf.t < this.enemyPerf.strikeAt) {
      this.flashTip('截脉 · 打断！');
      this.enemyPerf = null;
      this.e.hitQueue.length = 0;
      this.e.swing = 0;
      this.now = Math.max(this.now, this.enemyAt);
      this.state = 'advancing';
    }
    if (st.screenShake) this.shake(st.screenShake, 0.35);

    if (e.hp <= 0) this.killEnemy();
  }

  bumpCombo() {
    const p = this.p;
    p.combo++;
    p.comboSetAt = this.now;
    this.P.maxCombo = Math.max(this.P.maxCombo, p.combo);
  }

  enemyHitPlayer(mv) {
    const p = this.p;
    if (this.phase !== 'fight') return;

    // 结果由敌方出手时刻落在轴上的哪一段决定，不做即时反应
    const vs = this.enemyVs || { kind: null, pos: 0 };

    if (vs.kind === 'evade') {
      this.spawnFloater(p.x, GROUND_Y - 104, '闪避', '#8fd0e8', 18);
      sfx.evade();
      return;
    }
    if (vs.kind === 'guard' && vs.pos <= GUARD_PARRY_WINDOW) {
      this.spawnFloater(p.x, GROUND_Y - 104, '招架！', '#ffd76a', 22);
      p.qi = Math.min(p.maxQi, p.qi + 18);
      this.e.hitQueue.length = 0;
      this.hitStop = 0.12;
      this.shake(9, 0.3);
      sfx.parry();
      // 招架成功：敌人这次行动提前收场
      if (this.enemyPerf) {
        const perf = this.enemyPerf;
        perf.t = Math.max(perf.t, perf.strikeAt);
        perf.dur = perf.strikeAt + 0.28;
        perf.recover = 0.28;
      }
      return;
    }

    let dmg = mv.damage * (this.tier >= 3 ? 1.05 : 1);
    if (vs.kind === 'guard') {
      dmg *= 0.45;
      sfx.guard();
      this.spawnFloater(p.x, GROUND_Y - 110, '格挡', '#c8c0a8', 16);
    }
    const real = Math.round(Math.max(1, dmg - this.P.defense * 0.6));
    p.hp -= real;
    p.hitFlash = 1;
    p.flinch = 1;
    p.combo = 0;
    this.spawnFloater(p.x, GROUND_Y - 96, `-${real}`, '#ff7b6b', 20);
    this.spawnHit(p.x, GROUND_Y - 52, '#ff7b6b', 1.0);
    this.shake(8, 0.24);
    this.hitStop = 0.05;
    sfx.hurt();
    if (p.hp <= 0) {
      p.hp = 0;
      // 演武场里被打空不算败：不记死亡、不丢进度，只收场
      if (this.training) { this.flashTip('气血耗尽 · 演武收场'); this.endBattle('flee'); return; }
      this.endBattle('defeat');
    }
  }

  killEnemy() {
    const e = this.e;
    e.hp = 0;
    e.dead = true;
    e.hitQueue.length = 0;
    e.guardUntil = -Infinity;
    this.enemyPerf = null;
    this.enemyQueue.length = 0;
    sfx.die();
    this.shake(12, 0.5);
    for (let i = 0; i < 18; i++) {
      this.fx.push({
        type: 'dust', x: e.x + rand(-16, 16), y: GROUND_Y - rand(10, 80),
        t: 0, life: rand(0.4, 0.9), vx: rand(-70, 70), vy: rand(-90, -20),
        r: rand(2, 6), color: 'rgba(190,70,60,0.55)',
      });
    }
    this.endBattle('victory');
  }

  // ---------- 结束 ----------
  tryFlee() {
    if (this.training) { this.endBattle('flee'); return; }
    if (this.phase !== 'fight') return;
    this.p.hp = Math.max(1, Math.round(this.p.hp - this.p.maxHp * 0.12));
    this.endBattle('flee');
  }

  endBattle(kind) {
    if (this.phase === 'victory' || this.phase === 'defeat' || this.phase === 'flee') return;
    this.phase = kind;
    this.phaseTimer = 0;
    this.result = kind;

    const P = this.P;
    if (kind === 'victory' && !this.training) {
      const ed = this.enemyDef;
      const exp = ed.exp;
      const gold = randInt(ed.gold[0], ed.gold[1]);
      const drops = [];
      if (Math.random() < (ed.boss ? 1 : 0.32)) {
        const id = rollDrop(ed.tier);
        drops.push({ id, n: 1 });
        P.addItem(id, 1);
      }
      P.gold += gold;
      const ups = P.addExp(exp);
      this.rewardInfo = { exp, gold, drops, ups };
    } else if (kind === 'defeat') {
      P.deaths++;
    }
  }

  finish() {
    const P = this.P;
    if (!this.training) {
      P.hp = clamp(this.p.hp, 1, P.maxHp);
      P.qi = this.p.qi;
      // 剑意在同一次秘境探索的战斗之间保留，带回副本场景
      P.intent = clamp(this.p.intent, 0, P.maxIntent);
    } else {
      P.hp = P.maxHp;
      P.qi = P.maxQi;
      // 演武攒下的剑意不带出去（秘境外一律为零）
      P.intent = 0;
    }
    this.game.save();
    const cb = this.onEnd;
    if (cb) cb({ result: this.result, reward: this.rewardInfo });
  }

  // ==================== 特效 ====================
  shake(mag, dur) {
    if (mag >= this.shakeMag * (this.shakeT / Math.max(0.001, this.shakeDur))) {
      this.shakeMag = mag;
      this.shakeT = dur;
      this.shakeDur = dur;
    }
  }

  spawnSlash(x, y, angleDeg, arcDeg, reach, tint, fxType) {
    this.fx.push({
      type: 'slash', x, y,
      a0: (angleDeg * Math.PI) / 180,
      sweep: ((arcDeg || 100) * Math.PI) / 180,
      r: reach * 0.92,
      tint: tint || '#ffffff',
      fxt: fxType || 'slash',
      t: 0, life: 0.2, width: fxType === 'slam' ? 11 : 6,
    });
  }

  spawnHit(x, y, color, scale) {
    this.fx.push({ type: 'hit', x, y, t: 0, life: 0.26, color: color || '#fff', scale: scale || 1 });
    for (let i = 0; i < 7; i++) {
      this.fx.push({
        type: 'spark', x, y, t: 0, life: rand(0.15, 0.32),
        vx: rand(-180, 180) * scale, vy: rand(-190, 60) * scale,
        r: rand(1.2, 3) * scale, color: color || '#fff',
      });
    }
  }

  spawnFloater(x, y, txt, color, size) {
    this.floaters.push({
      x, y, text: String(txt), color: color || '#fff', size: size || 16,
      t: 0, life: 0.85, vx: rand(-16, 16), vy: -66,
    });
  }

  updateFx(dt) {
    for (const f of this.fx) {
      f.t += dt;
      if (f.type === 'spark' || f.type === 'dust') {
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.vy += 420 * dt;
        f.vx *= 0.965;
      }
    }
    this.fx = this.fx.filter((f) => f.t < f.life);

    for (const f of this.floaters) {
      f.t += dt;
      f.y += f.vy * dt;
      f.x += f.vx * dt;
      f.vy += 105 * dt;
    }
    this.floaters = this.floaters.filter((f) => f.t < f.life);

    this.shakeT = Math.max(0, this.shakeT - dt);
  }

  // ==================== 渲染 ====================
  render(ctx) {
    this.renderWorld(ctx);
    this.renderOverlay(ctx);
    // 人物面板永远画在最上层
    if (this.showChar) {
      renderCharPanel(ctx, this.game.W, this.game.H, this.P, {
        hp: this.p.hp, maxHp: this.p.maxHp,
        qi: this.p.qi, maxQi: this.p.maxQi,
        stam: this.p.stam, maxStam: this.p.maxStam,
        intent: this.p.intent, maxIntent: this.p.maxIntent,
        tip: this.p.intent >= this.p.maxIntent ? '剑意已满 —— 按 U 出「无明剑意」'
          : this.training ? '演武中攒下的剑意，一出演武场即散'
            : '剑意随本次秘境探索而生灭，出秘境即散',
      });
    }
  }

  renderWorld(ctx) {
    const t = this.theme;
    const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    g.addColorStop(0, '#12100e');
    g.addColorStop(0.55, t.wall || '#2c2b26');
    g.addColorStop(1, '#1a1714');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.game.W, GROUND_Y);
    this.renderBackdrop(ctx);

    ctx.fillStyle = t.floor || '#3a3630';
    ctx.fillRect(0, GROUND_Y, this.game.W, this.game.H - GROUND_Y);
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.fillRect(0, GROUND_Y, this.game.W, 3);
    for (let i = 0; i < 34; i++) {
      const x = ((i * 137.5) % this.game.W);
      ctx.fillStyle = `rgba(255,255,255,${0.014 + ((i * 7) % 5) * 0.006})`;
      ctx.fillRect(x, GROUND_Y + 8 + ((i * 13) % 100), 30 + ((i * 11) % 50), 1);
    }

    ctx.save();
    if (this.shakeT > 0) {
      const k = this.shakeT / Math.max(0.001, this.shakeDur);
      const m = this.shakeMag * k * k;
      ctx.translate(rand(-m, m), rand(-m, m));
    }
    this.renderEnemy(ctx);
    this.renderPlayer(ctx);
    this.renderFxLayers(ctx);
    ctx.restore();

    this.renderTopBar(ctx);
    this.renderBottomPanel(ctx);
    this.renderFloaters(ctx);
    this.renderBanner(ctx);
    this.renderAwaitHint(ctx);

    // 演出期间压暗四周，突出"正在演"这件事
    if (this.state === 'myPerform' || this.state === 'enemyPerform') {
      const perf = this.myPerf || this.enemyPerf;
      const k = perf ? clamp(perf.t / Math.max(0.01, perf.dur), 0, 1) : 0.5;
      const a = Math.sin(k * Math.PI) * 0.22;
      const vg = ctx.createRadialGradient(this.game.W / 2, GROUND_Y - 40, 120, this.game.W / 2, GROUND_Y - 40, 560);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, `rgba(0,0,0,${0.55 + a})`);
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, this.game.W, this.game.H);
    }
  }

  renderBackdrop(ctx) {
    const t = this.theme;
    const acc = t.accent || '#6f8f5c';
    ctx.save();
    ctx.globalAlpha = 0.34;
    for (let layer = 0; layer < 3; layer++) {
      const baseY = GROUND_Y - 20 - layer * 12;
      const amp = 60 + layer * 34;
      ctx.fillStyle = `rgba(${layer === 0 ? '18,22,26' : '22,26,28'},${0.85 - layer * 0.16})`;
      ctx.beginPath();
      ctx.moveTo(-20, baseY + 40);
      for (let x = -20; x <= this.game.W + 20; x += 40) {
        const h = Math.sin(x * 0.006 + layer * 2.1) * amp * 0.5 + Math.sin(x * 0.013 + layer) * amp * 0.28;
        ctx.lineTo(x, baseY - h);
      }
      ctx.lineTo(this.game.W + 20, baseY + 40);
      ctx.closePath();
      ctx.fill();
    }
    const rg = ctx.createRadialGradient(this.game.W * 0.5, GROUND_Y - 40, 20, this.game.W * 0.5, GROUND_Y - 40, 460);
    rg.addColorStop(0, this.hexA(acc, 0.16));
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, this.game.W, GROUND_Y);
    ctx.restore();
  }

  hexA(hex, a) {
    if (!hex || hex[0] !== '#') return `rgba(120,120,120,${a})`;
    const h = hex.slice(1);
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  renderPlayer(ctx) {
    const p = this.p;
    const introOffset = this.phase === 'intro' ? -Math.max(0, this.phaseTimer) * 420 : 0;
    const W = this.P.weaponData;
    const swinging = p.swing > 0.02;
    const guarding = p.guardPose > 0.05;
    const evading = p.evadeUp && this.state === 'advancing';

    // 闪避时侧身下沉
    const crouch = evading ? 6 : 0;

    drawFigure(ctx, p.x + p.lunge + introOffset, GROUND_Y + crouch, {
      scale: 1.0 - (evading ? 0.06 : 0),
      facing: 1,
      pose: p.flinch > 0.3 ? 'hurt' : swinging ? 'attack' : 'idle',
      t: p.animT,
      bodyColor: '#3d4a5c',
      accentColor: '#26303c',
      skinColor: '#d9bfa3',
      sashColor: PAL.crimson,
      bladeColor: W.tint,
      bladeLength: 48,
      hiltColor: '#2a231b',
      guardColor: PAL.gold,
      weaponAngle: guarding ? lerp(-0.12, -0.95, p.guardPose) : lerp(-0.12, 0.98, p.swing),
      swordAngle: guarding ? lerp(-0.55, -0.05, p.guardPose) : lerp(-0.55, 0.52, p.swing),
      flash: p.hitFlash,
      alpha: evading ? 0.72 : 1,
    });

    // 格挡架势：剑身横在身前
    if (guarding) {
      ctx.save();
      ctx.globalAlpha = 0.35 + p.guardPose * 0.3 + Math.sin(this.game.time * 10) * 0.08;
      ctx.strokeStyle = '#c8c0a8';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.arc(p.x + 20, GROUND_Y - 44, 42, -1.15, 1.15);
      ctx.stroke();
      ctx.restore();
    }
    // 闪避残影
    if (evading) {
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = '#8fd0e8';
      ctx.lineWidth = 2;
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.arc(p.x - i * 13, GROUND_Y - 34, 26 - i * 3, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  renderEnemy(ctx) {
    const e = this.e;
    const introOffset = this.phase === 'intro' ? Math.max(0, this.phaseTimer) * 420 : 0;
    const x = e.x + e.lunge + introOffset;

    ctx.save();
    if (e.dead) {
      ctx.globalAlpha = Math.max(0.25, 1 - e.deadT * 0.08);
      ctx.translate(x, GROUND_Y);
      ctx.rotate(-1.5);
      ctx.translate(-x, -GROUND_Y);
    }

    drawFigure(ctx, x, GROUND_Y, {
      scale: e.def.size || 1,
      facing: -1,
      pose: e.dead ? 'dead' : (e.swing > 0.2 ? 'attack' : 'idle'),
      t: e.animT,
      bodyColor: e.def.bodyColor,
      accentColor: e.def.accentColor,
      skinColor: e.def.boss ? '#c9a98a' : '#c2a888',
      sashColor: e.def.boss ? '#7a2020' : '#4a4030',
      bladeColor: e.def.boss ? '#e8d9a0' : '#b8bcc0',
      hiltColor: '#2a231b',
      guardColor: e.def.boss ? '#e05c4a' : '#8a6a2f',
      weaponAngle: lerp(-0.12, -1.45, e.swing),
      swordAngle: lerp(-0.55, -1.1, e.swing),
      flash: e.hitFlash,
      bladeLength: e.def.boss ? 54 : 46,
    });
    ctx.restore();

    // 敌人演出中的提示：攻击给红色起手警示，防御/歇息给柔和标示。
    // 防御的标示要盖满轴上的整段（不只表演那一下），玩家才知道何时不该硬拼
    const perf = this.enemyPerf;
    const guarding = this.now < e.guardUntil;
    if ((perf || guarding) && !e.dead && this.phase === 'fight') {
      const bob = Math.sin(this.game.time * 18) * 3;
      if (perf && perf.kind === 'attack') {
        if (perf.t < perf.strikeAt) {
          const k = clamp(perf.t / Math.max(0.01, perf.strikeAt), 0, 1);
          ctx.save();
          ctx.globalAlpha = 0.35 + k * 0.5;
          ctx.strokeStyle = '#e05c4a';
          ctx.lineWidth = 2 + k * 2;
          ctx.beginPath();
          ctx.arc(x, GROUND_Y - 44, 40 + k * 14, -1.4, 1.4);
          ctx.stroke();
          ctx.restore();

          strokeText(ctx, '!', x, GROUND_Y - 104 + bob, { size: 24, color: '#ff6b52', outline: 4 });
          const bw = 54;
          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          ctx.fillRect(x - bw / 2, GROUND_Y - 92 + bob, bw, 4);
          ctx.fillStyle = '#e05c4a';
          ctx.fillRect(x - bw / 2, GROUND_Y - 92 + bob, bw * k, 4);
        }
      } else {
        // 防御 / 歇息：提示这是可以调整节奏的窗口
        const isGuard = guarding;
        const col = isGuard ? '#a9b4c0' : '#7ce08a';
        ctx.save();
        ctx.globalAlpha = 0.4;
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, GROUND_Y - 44, 42, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        strokeText(ctx, isGuard ? '守' : '息', x, GROUND_Y - 104 + bob, {
          size: 20, color: col, outline: 4,
        });
      }
    }
  }

  renderFxLayers(ctx) {
    for (const f of this.fx) {
      const k = clamp(f.t / f.life, 0, 1);
      if (f.type === 'slash') {
        const a = (1 - k) * 0.95;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.globalCompositeOperation = 'lighter';
        const r = f.r * (0.72 + k * 0.42);
        ctx.strokeStyle = f.tint;
        ctx.lineWidth = f.width * (1 - k * 0.75);
        ctx.lineCap = 'round';
        if (f.fxt === 'pierce') {
          ctx.beginPath();
          ctx.moveTo(f.x, f.y);
          ctx.lineTo(f.x + Math.cos(f.a0) * r * 1.5, f.y + Math.sin(f.a0) * r * 1.5);
          ctx.stroke();
        } else if (f.fxt === 'ultimate') {
          for (let i = 0; i < 4; i++) {
            ctx.globalAlpha = a * (1 - i * 0.2);
            ctx.lineWidth = (f.width - i * 1.6) * (1 - k * 0.7);
            ctx.beginPath();
            ctx.arc(f.x, f.y, r * (0.55 + i * 0.16), f.a0, f.a0 + f.sweep);
            ctx.stroke();
          }
        } else {
          ctx.beginPath();
          ctx.arc(f.x, f.y, r, f.a0, f.a0 + f.sweep);
          ctx.stroke();
          ctx.globalAlpha = a * 0.55;
          ctx.lineWidth = f.width * 2.4 * (1 - k * 0.8);
          ctx.beginPath();
          ctx.arc(f.x, f.y, r * 0.9, f.a0 + f.sweep * 0.15, f.a0 + f.sweep * 0.85);
          ctx.stroke();
        }
        ctx.restore();
      } else if (f.type === 'hit') {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = (1 - k) * 0.9;
        ctx.strokeStyle = f.color;
        ctx.lineWidth = 3 * f.scale;
        const r = 6 + k * 30 * f.scale;
        for (let i = 0; i < 6; i++) {
          const ang = (i / 6) * Math.PI * 2 + k * 0.7;
          ctx.beginPath();
          ctx.moveTo(f.x + Math.cos(ang) * r * 0.3, f.y + Math.sin(ang) * r * 0.3);
          ctx.lineTo(f.x + Math.cos(ang) * r, f.y + Math.sin(ang) * r);
          ctx.stroke();
        }
        ctx.restore();
      } else if (f.type === 'spark' || f.type === 'dust') {
        ctx.save();
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = f.color;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r * (1 - k * 0.5), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  renderFloaters(ctx) {
    for (const f of this.floaters) {
      const k = clamp(f.t / f.life, 0, 1);
      const a = k < 0.15 ? k / 0.15 : 1 - Math.pow(k, 3);
      ctx.save();
      ctx.globalAlpha = clamp(a, 0, 1);
      strokeText(ctx, f.text, f.x, f.y, { size: f.size, color: f.color, outline: 3.5 });
      ctx.restore();
    }
  }

  renderBanner(ctx) {
    if (!this.banner) return;
    const b = this.banner;
    const k = b.t / b.life;
    const a = k < 0.12 ? k / 0.12 : 1 - Math.pow(clamp((k - 0.6) / 0.4, 0, 1), 2);
    ctx.save();
    ctx.globalAlpha = clamp(a, 0, 1);
    const y = 168;
    const w = 300;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(this.game.W / 2 - w / 2, y - 22, w, 42);
    ctx.strokeStyle = b.color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.game.W / 2 - w / 2, y - 22);
    ctx.lineTo(this.game.W / 2 - w / 2, y + 20);
    ctx.moveTo(this.game.W / 2 + w / 2, y - 22);
    ctx.lineTo(this.game.W / 2 + w / 2, y + 20);
    ctx.stroke();
    strokeText(ctx, b.text, this.game.W / 2, y + 1, { size: 27, color: b.color, outline: 0, weight: 700 });
    ctx.restore();
  }

  renderAwaitHint(ctx) {
    if (this.phase !== 'fight') return;
    const p = this.p;
    const bob = Math.sin(this.game.time * 4) * 3;
    if (this.state === 'awaiting') {
      ctx.save();
      ctx.globalAlpha = 0.75 + Math.sin(this.game.time * 5) * 0.25;
      strokeText(ctx, '▼ 轮到你选行动', p.x, GROUND_Y - 132 + bob, {
        size: 17, color: '#ffd76a', outline: 4,
      });
      ctx.restore();
      return;
    }
    // 轴段推进中：标出我方正处在哪一段（防御是否已排上）
    if (this.state === 'advancing' && this.myAct && this.myAct.kind !== 'attack' && this.myAct.kind !== 'wait') {
      const col = this.myAct.kind === 'guard' ? '#c8c0a8' : '#8fd0e8';
      ctx.save();
      ctx.globalAlpha = 0.9;
      strokeText(ctx, this.myAct.kind === 'guard' ? '◈ 格挡中' : '◈ 闪避中', p.x, GROUND_Y - 132 + bob, {
        size: 15, color: col, outline: 4,
      });
      ctx.restore();
    }
  }

  renderTopBar(ctx) {
    const e = this.e;
    const boss = !!e.def.boss;
    const bw = boss ? 620 : 460;
    const bx = (this.game.W - bw) / 2;
    const by = 40;

    ctx.save();
    strokeText(ctx, e.def.name, this.game.W / 2, by - 12, {
      size: boss ? 20 : 17, color: boss ? '#e05c4a' : PAL.paper, outline: 3,
    });

    // 只有死木桩显示 ∞：机关木人的血是有限的，打空即收场
    const infiniteHp = this.training && e.def.dummy;
    const hpRatio = infiniteHp ? 1 : clamp(e.hp / e.maxHp, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    ctx.fillRect(bx - 2, by - 2, bw + 4, 14);
    const hg = ctx.createLinearGradient(bx, by, bx, by + 10);
    hg.addColorStop(0, boss ? '#e05c4a' : '#c0392b');
    hg.addColorStop(1, boss ? '#8a2020' : '#7a2018');
    ctx.fillStyle = hg;
    ctx.fillRect(bx, by, bw * hpRatio, 10);
    ctx.strokeStyle = 'rgba(233,223,200,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, 9);

    text(ctx, infiniteHp ? '∞' : `${Math.ceil(e.hp)} / ${e.maxHp}`, bx + bw / 2, by + 5, {
      size: 11, align: 'center', baseline: 'middle', color: '#fff',
    });
    if (!this.training) {
      text(ctx, `第 ${this.tier} 阶`, bx - 14, by + 5, {
        size: 12, align: 'right', baseline: 'middle', color: PAL.goldDim,
      });
    }
    ctx.restore();

    if (this.phase === 'intro') {
      ctx.save();
      ctx.globalAlpha = clamp(1 - this.introT * 1.4, 0, 1);
      text(ctx, e.def.intro || '', this.game.W / 2, 108, {
        size: 14, align: 'center', color: PAL.paperDim,
      });
      ctx.restore();
    }
  }

  renderBottomPanel(ctx) {
    const H = this.game.H;
    const py = H - 138, ph = 122;

    panelBox(ctx, 20, py, 268, ph, PAL.line2);
    this.renderPlayerPanel(ctx, 20, py, 268, ph);

    const tx = 298, ty = py, tw = this.game.W - 298 - 20, th = ph;
    panelBox(ctx, tx, ty, tw, th, PAL.line2);
    this.renderTimeline(ctx, tx, ty, tw, th);

    if (this.tip) {
      const a = this.tip.t < 0.12 ? this.tip.t / 0.12 : clamp((1.6 - this.tip.t) / 0.4, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      text(ctx, this.tip.text, tx + tw / 2, ty - 12, {
        size: 14, weight: 700, align: 'center', color: '#ffb26b',
      });
      ctx.restore();
    }
  }

  renderPlayerPanel(ctx, x, y, w, h) {
    const p = this.p;
    text(ctx, this.P.name, x + 14, y + 22, { size: 14, weight: 700, color: PAL.paper });
    text(ctx, `Lv.${this.P.level}`, x + w - 14, y + 22, { size: 13, align: 'right', color: PAL.gold });

    const barW = w - 28;
    bar(ctx, x + 14, y + 32, barW, 12, p.hp / p.maxHp, PAL.hp, { r: 2 });
    text(ctx, `${Math.ceil(p.hp)} / ${p.maxHp}`, x + 14 + barW / 2, y + 38, {
      size: 10, align: 'center', baseline: 'middle', color: 'rgba(255,255,255,0.92)',
    });

    bar(ctx, x + 14, y + 48, barW, 10, p.qi / p.maxQi, PAL.qi, { r: 2 });
    text(ctx, `气 ${Math.floor(p.qi)} / ${p.maxQi}`, x + 14 + barW / 2, y + 53, {
      size: 9.5, align: 'center', baseline: 'middle', color: 'rgba(255,255,255,0.92)',
    });

    bar(ctx, x + 14, y + 62, barW, 10, p.stam / p.maxStam, PAL.stam, { r: 2 });
    text(ctx, `体 ${Math.floor(p.stam)}`, x + 14 + barW / 2, y + 67, {
      size: 9.5, align: 'center', baseline: 'middle', color: 'rgba(255,255,255,0.92)',
    });

    // 剑意：攒满才能按 U 出无明剑意，所以满了要显眼
    const full = p.intent >= p.maxIntent;
    const pulse = full ? 0.72 + Math.sin(this.game.time * 7) * 0.28 : 1;
    ctx.save();
    ctx.globalAlpha = pulse;
    bar(ctx, x + 14, y + 76, barW, 10, p.intent / p.maxIntent, ULTIMATE.tint, {
      r: 2,
      border: full ? 'rgba(233,214,255,0.95)' : 'rgba(0,0,0,0.55)',
    });
    ctx.restore();
    text(ctx, full ? `剑意已满 · ${Math.floor(p.intent)}（按 U）` : `剑意 ${Math.floor(p.intent)} / ${p.maxIntent}`,
      x + 14 + barW / 2, y + 81, {
        size: 9.5, align: 'center', baseline: 'middle',
        color: full ? '#1a1220' : 'rgba(255,255,255,0.92)',
        weight: full ? 700 : 400,
      });

    const jin = this.P.itemCount('jinchuang');
    const xing = this.P.itemCount('xingqi');
    text(ctx, `[1] 药 ×${jin}`, x + 14, y + 100, { size: 11, color: jin > 0 ? PAL.jadeHi : '#584f40' });
    text(ctx, `[2] 散 ×${xing}`, x + 92, y + 100, { size: 11, color: xing > 0 ? PAL.azure : '#584f40' });
    // 让人知道战斗中随时能查人物（打开时战斗冻结，看信息不吃亏）
    text(ctx, '[C] 人物', x + w - 14, y + 100, {
      size: 11, align: 'right', color: PAL.paperFaint,
    });

    if (p.combo > 1) {
      const k = clamp((this.now - p.comboSetAt) / 2.4, 0, 1);
      ctx.save();
      ctx.globalAlpha = 0.5 + (1 - k) * 0.5;
      strokeText(ctx, `${p.combo} 连`, x + w - 40, y + 110, {
        size: 19, color: p.combo > 9 ? '#ffcf5c' : '#e9dfe8', outline: 3,
      });
      ctx.restore();
    }
  }

  // ---------- 时间轴面板 ----------
  renderTimeline(ctx, x, y, w, h) {
    const seqW = 122;
    this.renderSeqBox(ctx, x + 12, y, seqW, h);

    ctx.save();
    ctx.strokeStyle = 'rgba(212,162,76,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + seqW + 14, y + 12);
    ctx.lineTo(x + seqW + 14, y + h - 12);
    ctx.stroke();
    ctx.restore();

    this.renderTrack(ctx, x + seqW + 22, y, w - seqW - 32, h);
  }

  renderSeqBox(ctx, x, y, w, h) {
    const p = this.p;
    text(ctx, '连招', x, y + 20, { size: 12, weight: 700, color: PAL.gold });

    const NS = 24, gap = 5;
    if (p.seq.length === 0) {
      text(ctx, '—', x + 4, y + 54, { size: 18, color: '#4d4638' });
    } else {
      p.seq.forEach((step, i) => {
        const isHeavy = stepMove(step) === 'heavy';
        // 由招式接续而来的那一项：写招式名而不是「轻/重」，底部色条标出它算哪一类
        const sk = step.via ? SKILLS.find((s) => s.id === step.via) : null;
        const bx = x + i * (NS + gap);
        const by = y + 34;
        roundRectPath(ctx, bx, by, NS, NS, 4);
        ctx.fillStyle = isHeavy ? 'rgba(80,58,20,0.92)' : 'rgba(40,36,28,0.92)';
        ctx.fill();
        ctx.strokeStyle = sk ? sk.tint : isHeavy ? PAL.gold : PAL.paper;
        ctx.lineWidth = isHeavy || sk ? 2 : 1.4;
        ctx.stroke();
        const label = sk ? sk.name.slice(0, 2) : isHeavy ? '重' : '轻';
        let size = 13;
        while (size > 9 && measure(ctx, label, size, 700) > NS - 4) size--;
        text(ctx, label, bx + NS / 2, by + NS / 2 + (sk ? 0 : 1), {
          size, weight: 700, align: 'center', baseline: 'middle',
          color: sk ? sk.tint : isHeavy ? PAL.gold : PAL.paper,
        });
        if (sk) fillRect(ctx, bx + 3, by + NS - 4, NS - 6, 2, isHeavy ? PAL.gold : PAL.paper);
      });
      const life = clamp(1 - (this.now - p.seqSetAt) / SEQ_WINDOW, 0, 1);
      fillRect(ctx, x, y + 66, w - 22, 2, 'rgba(255,255,255,0.08)');
      fillRect(ctx, x, y + 66, (w - 22) * life, 2, 'rgba(212,162,76,0.5)');
    }

    const hint = this.nextHint();
    if (hint) text(ctx, hint.text, x, y + 94, { size: 11, color: hint.color });
  }

  nextHint() {
    const p = this.p;
    const seq = p.seq;
    const next = [];
    for (const sid of this.P.skills) {
      const sk = SKILLS.find((s) => s.id === sid);
      if (!sk || sk.pattern.length <= seq.length) continue;
      let pre = true;
      for (let i = 0; i < seq.length; i++) if (sk.pattern[i] !== stepMove(seq[i])) { pre = false; break; }
      if (pre) next.push({ sk, need: sk.pattern.slice(seq.length) });
    }
    if (!next.length) return seq.length ? { text: '无后续招式', color: '#584f40' } : null;
    next.sort((a, b) => a.need.length - b.need.length);
    const t = next[0];
    const label = t.need.map((m) => (m === 'light' ? '轻' : '重')).join('·');
    return { text: `再按【${label}】`, color: p.qi >= t.sk.qi ? PAL.jadeHi : '#8a6a2f' };
  }

  /**
   * 时间轴：一条公共刻度。指针处是「现在」——
   * 左侧是刚走过的行动（压暗），右侧是将要发生的行动。
   *   · 上半是我方：等待输入时用**下箭头**在各个候选时长对应的时刻打点；
   *     选定后箭头化为一条行动条
   *   · 下半是敌方：**最多两条**，每条代表一次出手 ——
   *     「过去的行动」（最近一次已发生的出手）与「将要的行动」（队列里的下一次）。
   *     起点就是那次出手的时刻，长度就是它到再下次出手的 cd，段内标注招式名与该段时长
   * 表演期间指针冻结；所有条按绝对时刻定位，随指针推进自然向左滑过指针。
   */
  renderTrack(ctx, x, y, w, h) {
    const trackL = x + 8;
    const trackR = x + w - 4;
    const scale = (trackR - trackL) / (PAST_WINDOW + FUTURE_WINDOW);
    const x0 = trackL + PAST_WINDOW * scale;      // 指针（现在）
    const toPx = (t) => x0 + (t - this.now) * scale;

    const p = this.p;
    const awaiting = this.state === 'awaiting';
    const axisY = y + 52;       // 时间轴线（候选箭头所指的时刻）
    const myBarY = y + 56;      // 我方行动条
    const eBarY = y + 80;       // 敌方行动条
    const barH = 18;
    const frozen = this.state !== 'advancing';

    // 标题与状态
    text(ctx, '时间轴', x, y + 14, { size: 12, weight: 700, color: PAL.gold });
    let statusText, statusColor, blink = false;
    if (this.state === 'awaiting') { statusText = '◆ 轮到你选行动（时间冻结）'; statusColor = '#ffd76a'; blink = true; }
    else if (this.state === 'myPerform') { statusText = '■ 出招表演（时间冻结）'; statusColor = '#8fd0e8'; }
    else if (this.state === 'enemyPerform') { statusText = '■ 敌方出手（时间冻结）'; statusColor = '#e05c4a'; blink = true; }
    else { statusText = '▶ 时间推进'; statusColor = 'rgba(233,223,200,0.45)'; }
    ctx.save();
    ctx.globalAlpha = blink ? 0.6 + Math.sin(this.game.time * 6) * 0.4 : 1;
    text(ctx, statusText, x + w, y + 14, { size: 11, weight: 700, align: 'right', color: statusColor });
    ctx.restore();

    // 时间轴主刻度线
    ctx.save();
    ctx.strokeStyle = 'rgba(233,223,200,0.26)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(trackL, axisY);
    ctx.lineTo(trackR, axisY);
    ctx.stroke();
    // 逐秒刻度
    ctx.strokeStyle = 'rgba(233,223,200,0.10)';
    for (let t = Math.ceil(this.now - PAST_WINDOW); t <= this.now + FUTURE_WINDOW; t++) {
      const px = toPx(t);
      if (px < trackL - 1 || px > trackR + 1) continue;
      ctx.beginPath();
      ctx.moveTo(px, axisY - 3);
      ctx.lineTo(px, axisY + 3);
      ctx.stroke();
    }
    ctx.restore();

    // 敌方条底衬
    fillRect(ctx, trackL, eBarY, trackR - trackL, barH, 'rgba(255,255,255,0.022)');
    fillRect(ctx, trackL, myBarY, trackR - trackL, barH, 'rgba(255,255,255,0.018)');

    // ---- 敌方：最多两条 ——「过去的行动」（如有）+「将要的行动」----
    // 每条代表一次出手：起点就是它的出手时刻，长度就是它到下次出手的 cd。
    ctx.save();
    ctx.beginPath();
    ctx.rect(trackL, y + 18, trackR - trackL, h - 22);
    ctx.clip();

    const eQ = this.enemyQueue;

    // 防御段单独配色：它代表「这段时间打它不痛」，与普通攻击段区分开
    const enemySeg = (from, to, name, isPast, kind) => {
      const l = Math.max(toPx(from), trackL);
      const r = Math.min(toPx(to), trackR);
      if (r - l <= 1) return;

      const defend = kind === 'defend';
      const fillCol = defend ? '#5a6a78' : '#b0453a';
      const lineCol = defend ? '#a9b4c0' : '#e05c4a';

      roundRectPath(ctx, l, eBarY, r - l, barH, 3);
      ctx.fillStyle = this.hexA(fillCol, isPast ? 0.15 : 0.30);
      ctx.fill();
      ctx.strokeStyle = this.hexA(lineCol, isPast ? 0.34 : 0.58);
      ctx.lineWidth = 1;
      ctx.stroke();

      // 两端各标一次「出手时刻」
      ctx.fillStyle = this.hexA(defend ? '#c8d4dc' : '#ff8566', isPast ? 0.48 : 0.95);
      const sl = Math.max(toPx(from), trackL);
      const sr = Math.min(toPx(from) + 4, trackR);
      if (sr > sl) ctx.fillRect(sl, eBarY, sr - sl, barH);
      const er = toPx(to);
      if (er >= trackL && er <= trackR) ctx.fillRect(er - 2, eBarY, 4, barH);

      const dur = to - from;
      const label = `${defend ? '守 · ' : ''}${name || '行动'} ${dur.toFixed(1)}s`;
      const tcol = defend
        ? (isPast ? 'rgba(190,206,218,0.62)' : 'rgba(212,226,236,0.94)')
        : (isPast ? 'rgba(255,186,166,0.62)' : 'rgba(255,208,196,0.92)');
      if (r - l > measure(ctx, label, 10.5, 700) + 10) {
        text(ctx, label, (l + r) / 2, eBarY + barH / 2, {
          size: 10.5, weight: 700, align: 'center', baseline: 'middle', color: tcol,
        });
      } else if (r - l > 34) {
        text(ctx, `${dur.toFixed(1)}s`, (l + r) / 2, eBarY + barH / 2, {
          size: 10, weight: 700, align: 'center', baseline: 'middle', color: tcol,
        });
      }
    };

    if (!this.e.dead) {
      // 过去的行动：最近一次已发生的出手，从它出手那一刻起算它的 cd
      if (this.enemyHasActed && eQ.length) {
        enemySeg(this.enemyBarFrom, eQ[0].at, this.enemyBarName, true, this.enemyBarKind);
      }
      // 将要的行动：队列里的下一次出手，同样从它出手那一刻起算它的 cd
      if (eQ.length >= 2) {
        enemySeg(eQ[0].at, eQ[1].at, eQ[0].move.name, false, eQ[0].kind);
      }
    }

    // 我方行动条（选定后才出现）
    if (this.myAct) {
      const act = this.myAct;
      const cl = Math.max(toPx(act.from), trackL);
      const cr = Math.min(toPx(act.from + act.axis), trackR);
      const tint = act.tint || PAL.gold;
      const performing = this.state === 'myPerform';

      if (cr > cl) {
        roundRectPath(ctx, cl, myBarY, cr - cl, barH, 3);
        ctx.fillStyle = this.hexA(tint, performing ? 0.34 : 0.22);
        ctx.fill();
        ctx.strokeStyle = this.hexA(tint, performing ? 0.95 : 0.72);
        ctx.lineWidth = performing ? 1.5 : 1.2;
        ctx.stroke();

        // 轴段很短时（如撩云式 0.30s）条内放不下名字，就贴到条的右侧写
        const label = act.name || '';
        const lw = measure(ctx, label, 10, 700);
        const tcol = performing ? '#ffffff' : 'rgba(240,230,208,0.9)';
        if (cr - cl >= lw + 8) {
          text(ctx, label, cl + 4, myBarY + barH / 2, {
            size: 10, weight: 700, baseline: 'middle', color: tcol,
          });
        } else if (cr + 4 + lw <= trackR) {
          text(ctx, label, cr + 4, myBarY + barH / 2, {
            size: 10, weight: 700, baseline: 'middle', color: tcol,
          });
        }
      }
      // 命中时刻小点
      for (const ht of act.hits) {
        const hx = toPx(ht);
        if (hx < trackL || hx > trackR) continue;
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.beginPath();
        ctx.arc(hx, myBarY + barH, 2.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();

    // ---- 已走过的区间压暗：让「已行动 接 将行动」一目了然 ----
    if (x0 > trackL) {
      ctx.save();
      const g = ctx.createLinearGradient(trackL, 0, x0, 0);
      g.addColorStop(0, 'rgba(5,4,3,0.56)');
      g.addColorStop(1, 'rgba(5,4,3,0.18)');
      ctx.fillStyle = g;
      ctx.fillRect(trackL, y + 18, x0 - trackL, h - 22);
      ctx.restore();
    }

    // ---- 我方候选：下箭头标出「选它的话，时间会推进到哪一刻」----
    if (awaiting) {
      const spd = this.P.speedMul;
      // 候选分两排：防御（闪避／格挡）在上、基础招式（轻／重）在下。
      // 同排两项的落点天然隔得开（闪避 0.30 vs 格挡 0.50、轻 0.36 vs 重 0.60），
      // 两排正好把四个标签装下；若因轴段或缩放改动挤住，会顺延到下一排兜底，不至于叠字
      const items = [
        { name: '轻', axis: BASE_MOVES.light.cd, cost: BASE_MOVES.light.stamina, tint: '#e9dfc8', row: 0 },
        { name: '重', axis: BASE_MOVES.heavy.cd, cost: BASE_MOVES.heavy.stamina, tint: '#d4a24c', row: 0 },
        { name: '闪避', axis: EVADE.axis, cost: EVADE.stamina, tint: EVADE.tint, row: 1 },
        { name: '格挡', axis: GUARD.axis, cost: GUARD.stamina, tint: GUARD.tint, row: 1 },
      ].map((it) => ({ ...it, x: x0 + it.axis * spd * scale }));

      // 同排两项的最小留白。身法越高同排间距越窄（轴段差 × spd × scale），留白取小些
      const LABEL_GAP = 3;
      const rowEnds = [-Infinity, -Infinity];
      const order = items.slice().sort((a, b) => (a.row - b.row) || (a.x - b.x));
      for (const it of order) {
        const half = measure(ctx, it.name, 10.5, 700) / 2;
        let row = it.row;
        while (row < rowEnds.length && it.x - half < rowEnds[row] + LABEL_GAP) row++;
        if (row >= rowEnds.length) rowEnds.push(-Infinity);
        rowEnds[row] = it.x + half;
        it.row = row;
      }

      // 排距取 15：字号 10.5 时两排之间留出约 4.5px 空隙，再小就贴在一起了
      const rowHgt = 15;
      const baseY = axisY - 7;
      for (const it of items) {
        const ok = p.stam >= it.cost;
        const col = ok ? it.tint : '#8a6a62';
        const labelY = baseY - it.row * rowHgt;

        text(ctx, it.name, it.x, labelY, {
          size: 10.5, weight: 700, align: 'center', baseline: 'bottom',
          color: ok ? 'rgba(233,223,200,0.9)' : 'rgba(190,130,120,0.7)',
        });

        // 下箭头：从标签下方穿过时间轴**与我方整条行动条**，尖端落在两方行动条之间——
        // 竖线所在就是落点，不必在两条之间来回对位
        const top = labelY + 2;
        const bot = (myBarY + barH + eBarY) / 2;
        if (bot > top) {
          ctx.save();
          ctx.strokeStyle = col;
          ctx.fillStyle = col;
          ctx.lineWidth = 1.2;
          ctx.globalAlpha = ok ? 0.9 : 0.5;
          ctx.beginPath();
          ctx.moveTo(it.x, top);
          ctx.lineTo(it.x, bot - 3.5);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(it.x, bot);
          ctx.lineTo(it.x - 3.2, bot - 4.2);
          ctx.lineTo(it.x + 3.2, bot - 4.2);
          ctx.closePath();
          ctx.fill();
          // 轴上落点
          ctx.beginPath();
          ctx.arc(it.x, axisY, 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
    }

    // ---- 敌方下一次出手的参考线：贯穿到我方刻度 ----
    const refAt = this.enemyPerf ? null : (this.enemyQueue.length ? this.enemyQueue[0].at : null);
    if (refAt != null && !this.e.dead) {
      const rx = toPx(refAt);
      if (rx >= trackL && rx <= trackR) {
        const near = refAt - this.now;
        const urgent = near >= 0 && near < 0.6;
        ctx.save();
        ctx.globalAlpha = urgent ? 0.5 + Math.sin(this.game.time * 16) * 0.3 : 0.42;
        ctx.strokeStyle = '#e05c4a';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(rx, axisY - 1);
        ctx.lineTo(rx, eBarY + barH + 1);
        ctx.stroke();
        ctx.restore();
      }
    }

    // ---- 指针（现在）----
    ctx.save();
    ctx.globalAlpha = frozen ? 0.7 + Math.sin(this.game.time * 6) * 0.3 : 0.9;
    const pcol = this.state === 'awaiting' ? '#ffd76a'
      : this.state === 'myPerform' ? '#8fd0e8'
        : this.state === 'enemyPerform' ? '#e05c4a' : 'rgba(233,223,200,0.8)';
    ctx.strokeStyle = pcol;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(x0, axisY - 26);
    ctx.lineTo(x0, eBarY + barH + 3);
    ctx.stroke();
    ctx.restore();

    // 行标签
    text(ctx, '我', trackL - 2, myBarY + barH / 2, {
      size: 10, align: 'right', baseline: 'middle', color: PAL.paperDim,
    });
    text(ctx, '敌', trackL - 2, eBarY + barH / 2, {
      size: 10, align: 'right', baseline: 'middle', color: PAL.paperDim,
    });

    // 底部操作提示
    text(ctx, 'J轻 K重　L闪避　空格格挡　S让招　U绝学', trackL, y + h - 5, {
      size: 10, color: 'rgba(233,223,200,0.34)',
    });
  }

  renderOverlay(ctx) {
    if (this.phase !== 'victory' && this.phase !== 'defeat' && this.phase !== 'flee') return;
    const W = this.game.W, H = this.game.H;
    const a = clamp(this.phaseTimer / 0.35, 0, 1);
    ctx.save();
    ctx.globalAlpha = a * 0.82;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = a;

    const win = this.phase === 'victory';
    const title = win ? '胜' : this.phase === 'defeat' ? '败' : '退';
    const color = win ? '#ffd76a' : this.phase === 'defeat' ? '#e05c4a' : '#8fd0e8';

    strokeText(ctx, title, W / 2, H / 2 - 74, { size: 62, color, outline: 0, weight: 700 });

    if (win && this.rewardInfo) {
      const r = this.rewardInfo;
      let yy = H / 2 - 14;
      text(ctx, `历练 +${r.exp}`, W / 2, yy, { size: 17, align: 'center', color: PAL.paper }); yy += 26;
      text(ctx, `银两 +${r.gold}`, W / 2, yy, { size: 17, align: 'center', color: PAL.gold }); yy += 26;
      for (const d of r.drops) {
        const it = getItem(d.id);
        text(ctx, `获得 ${it ? it.name : d.id} ×${d.n}`, W / 2, yy, {
          size: 14, align: 'center', color: PAL.jadeHi,
        });
        yy += 22;
      }
      if (r.ups > 0) {
        ctx.globalAlpha = a * (0.6 + Math.sin(this.game.time * 8) * 0.4);
        text(ctx, `修为精进！等级提升至 ${this.P.level}`, W / 2, yy + 8, {
          size: 18, align: 'center', weight: 700, color: '#ffd76a',
        });
        ctx.globalAlpha = a;
      }
    } else if (this.phase === 'defeat') {
      text(ctx, '你倒在血泊中，被路过的樵夫拖回了镇上。', W / 2, H / 2 - 10, {
        size: 14, align: 'center', color: PAL.paperDim,
      });
      text(ctx, '本局副本进度与部分银两已失落。', W / 2, H / 2 + 16, {
        size: 13, align: 'center', color: '#8a6a2f',
      });
    } else if (this.phase === 'flee') {
      text(ctx, this.training ? '演武到此为止，回镇调息。' : '你退出了战斗。', W / 2, H / 2 - 10, {
        size: 14, align: 'center', color: PAL.paperDim,
      });
    }

    const blink = 0.55 + Math.sin(this.game.time * 5) * 0.45;
    ctx.globalAlpha = a * blink;
    text(ctx, '按 空格 / 回车 继续', W / 2, H / 2 + 76, {
      size: 14, align: 'center', color: PAL.paper,
    });
    ctx.restore();
  }
}

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
