// 键盘输入：支持 持续按住 / 本帧刚按下 / 本帧刚抬起

const down = new Set();
const frameDown = new Set();
const frameUp = new Set();
// 每个按住键最后一次收到 keydown 的时刻（浏览器在键被按住时会持续重复 keydown）。
// 若某键超过 HOLD_TIMEOUT 没再收到，说明 keyup 丢了，按已松开处理。
const lastSeen = new Map();
let anyKeyFlag = false;
let clock = 0;

const HOLD_TIMEOUT = 0.7;   // 秒。系统重复延迟通常 0.5s，持续阶段则每 ~35ms 一次

const PREVENT = new Set([
  'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Tab',
]);

export function initInput() {
  window.addEventListener('keydown', (e) => {
    if (PREVENT.has(e.code)) e.preventDefault();
    lastSeen.set(e.code, clock);
    if (e.repeat) return;
    down.add(e.code);
    frameDown.add(e.code);
    anyKeyFlag = true;
  });
  window.addEventListener('keyup', (e) => {
    if (PREVENT.has(e.code)) e.preventDefault();
    lastSeen.delete(e.code);
    down.delete(e.code);
    frameUp.add(e.code);
  });
  // 失焦/切页面时 keyup 会丢失
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) releaseAll();
  });
}

function releaseAll() {
  for (const c of down) frameUp.add(c);
  down.clear();
  lastSeen.clear();
}

export const isDown = (code) => down.has(code);
export const justPressed = (code) => frameDown.has(code);
export const justReleased = (code) => frameUp.has(code);
export const anyPressed = () => anyKeyFlag;

export function isAnyDown(codes) {
  for (const c of codes) if (down.has(c)) return true;
  return false;
}

/** 每帧调用：把「心跳已断」的键当作已松开 */
function sweepStaleHolds() {
  for (const c of down) {
    const t = lastSeen.get(c);
    if (t == null || clock - t > HOLD_TIMEOUT) {
      down.delete(c);
      lastSeen.delete(c);
      frameUp.add(c);
    }
  }
}

export function beginFrame(dt) {
  clock += dt;
  sweepStaleHolds();
}

export function endFrame() {
  frameDown.clear();
  frameUp.clear();
  anyKeyFlag = false;
}

// 切换场景时调用，避免上一帧的按键被新场景消费。
// 只清「本帧」集合与按住集合是不够的：若玩家仍按着方向键，浏览器会继续发送
// repeat keydown，下一帧该键又被加回 down，照样会一直走。
// 因此这里同时把心跳复位，让该键必须重新「按下」才会生效。
export function clearInput() {
  down.clear();
  frameDown.clear();
  frameUp.clear();
  lastSeen.clear();
  anyKeyFlag = false;
}

// 调试用：查看按键状态
export function debugInput() {
  return { held: [...down], clock: +clock.toFixed(2), seen: [...lastSeen.entries()].map(([k, v]) => k + ':' + v.toFixed(2)) };
}

export function moveAxis() {
  let x = 0, y = 0;
  if (isAnyDown(['KeyA', 'ArrowLeft'])) x -= 1;
  if (isAnyDown(['KeyD', 'ArrowRight'])) x += 1;
  if (isAnyDown(['KeyW', 'ArrowUp'])) y -= 1;
  if (isAnyDown(['KeyS', 'ArrowDown'])) y += 1;
  return { x, y };
}

export function confirmPressed() {
  return justPressed('Enter') || justPressed('Space') || justPressed('KeyJ') || justPressed('KeyE');
}

export function cancelPressed() {
  return justPressed('Escape') || justPressed('Backspace') || justPressed('KeyK');
}
