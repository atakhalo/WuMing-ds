// 《无明剑》入口

import { Game } from './core/game.js';
import { BaseScene } from './scenes/BaseScene.js';
import { WorldMapScene } from './scenes/WorldMapScene.js';
import { DungeonScene } from './scenes/DungeonScene.js';
import { BattleScene } from './scenes/BattleScene.js';
import { ResultScene } from './scenes/ResultScene.js';
import { initAudio, resumeAudio } from './core/audio.js';
import { clearInput, debugInput } from './core/input.js';
import { PAL } from './core/utils.js';

const canvas = document.getElementById('game');
const game = new Game(canvas);

game.register('base', new BaseScene(game));
game.register('world', new WorldMapScene(game));
game.register('dungeon', new DungeonScene(game));
game.register('battle', new BattleScene(game));
game.register('result', new ResultScene(game));

game.init();
game.setScene('base');

if (game.player.level === 1 && game.player.kills === 0) {
  game.toast('按 A / D 行走，靠近 NPC 按 E 交谈', PAL.gold);
  game.toast('先去木人桩演练一番，熟悉轻重与连招', PAL.jadeHi);
}

// 首次交互后才能创建 AudioContext
function unlockAudio() {
  initAudio();
  resumeAudio();
  window.removeEventListener('keydown', unlockAudio);
  window.removeEventListener('mousedown', unlockAudio);
}
window.addEventListener('keydown', unlockAudio);
window.addEventListener('mousedown', unlockAudio);

const boot = document.getElementById('boot');
if (boot) {
  boot.classList.add('hidden');
  setTimeout(() => boot.remove(), 500);
}

// 调试用：控制台可访问
window.__wuming = game;
window.__clearInput = clearInput;
window.__inputDebug = debugInput;
