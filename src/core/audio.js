// 极简合成音效（WebAudio，无外部素材）

let ac = null;
let master = null;
let muted = false;

export function initAudio() {
  if (ac) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = 0.3;
    master.connect(ac.destination);
  } catch (e) {
    ac = null;
  }
}

export function resumeAudio() {
  if (ac && ac.state === 'suspended') ac.resume();
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.3;
  return muted;
}

export function isMuted() { return muted; }

function env(node, t0, dur, gain, attack = 0.004) {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  node.connect(g);
  g.connect(master);
  return g;
}

function tone(freq, dur, type = 'sine', gain = 0.2, sweepTo = 0) {
  if (!ac || muted) return;
  const t0 = ac.currentTime;
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (sweepTo) o.frequency.exponentialRampToValueAtTime(Math.max(24, freq * sweepTo), t0 + dur);
  env(o, t0, dur, gain);
  o.start(t0);
  o.stop(t0 + dur + 0.06);
}

function noise(dur, gain = 0.2, freq = 1800, q = 1, type = 'bandpass') {
  if (!ac || muted) return;
  const t0 = ac.currentTime;
  const len = Math.max(1, Math.ceil(ac.sampleRate * dur));
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  src.connect(f);
  env(f, t0, dur, gain);
  src.start(t0);
}

export const sfx = {
  light() { noise(0.07, 0.20, 3600, 1.5); tone(760, 0.06, 'triangle', 0.07, 0.55); },
  heavy() { noise(0.15, 0.26, 1300, 0.9); tone(170, 0.15, 'sawtooth', 0.10, 0.5); },
  skill() { noise(0.20, 0.26, 2400, 1.1, 'highpass'); tone(520, 0.22, 'triangle', 0.10, 0.35); },
  ultimate() {
    noise(0.5, 0.30, 900, 0.7, 'lowpass');
    tone(140, 0.55, 'sawtooth', 0.14, 0.35);
    tone(280, 0.5, 'sine', 0.10, 0.4);
  },
  hitLight() { noise(0.06, 0.22, 2200, 2.0); tone(420, 0.05, 'square', 0.06, 0.6); },
  hitHeavy() { noise(0.13, 0.30, 900, 1.2); tone(120, 0.13, 'square', 0.10, 0.5); },
  evade() { noise(0.14, 0.14, 5200, 2.2, 'highpass'); },
  parry() {
    tone(1500, 0.16, 'square', 0.13, 0.4);
    tone(2400, 0.12, 'sine', 0.09, 0.5);
    noise(0.14, 0.20, 4200, 2.4);
  },
  guard() { noise(0.10, 0.18, 1600, 1.6); tone(300, 0.09, 'square', 0.06, 0.7); },
  hurt() { tone(220, 0.14, 'sawtooth', 0.13, 0.55); noise(0.12, 0.18, 700, 0.8); },
  die() { tone(200, 0.6, 'sawtooth', 0.13, 0.28); noise(0.5, 0.16, 500, 0.7, 'lowpass'); },
  levelUp() {
    [523, 659, 784, 1047].forEach((f, i) => {
      setTimeout(() => tone(f, 0.22, 'triangle', 0.10), i * 80);
    });
  },
  ui() { tone(880, 0.05, 'sine', 0.05, 1.2); },
  uiMove() { tone(600, 0.035, 'sine', 0.035, 1.3); },
  pickup() { tone(880, 0.09, 'triangle', 0.09); setTimeout(() => tone(1320, 0.12, 'triangle', 0.08), 70); },
  fail() { tone(260, 0.18, 'square', 0.09, 0.7); },
  step() { noise(0.04, 0.05, 900, 1.0); },
};
