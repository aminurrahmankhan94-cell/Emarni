// Ringtones made with the Web Audio API. Browsers block sound until the person has tapped the page,
// so the first tap unlocks it. Incoming calls use a double ring; callers hear a ringback tone.
let ctx = null;
let timer = 0;
let current = null;
const subs = new Set();

const PATTERN = {
  incoming: { period: 3200, bursts: [0, 0.7], dur: 0.5, freq: [480, 620], gain: 0.3 },
  ringback: { period: 4200, bursts: [0], dur: 1.2, freq: [425, 425], gain: 0.14 }
};

function audio() {
  if (!ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    ctx = new AudioCtx();
  }
  return ctx;
}

export function soundReady() {
  return ctx?.state === "running";
}

function emit() {
  const ok = soundReady();
  subs.forEach(fn => fn(ok));
}

export function onSoundChange(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

// Call from a tap or key press. Safe to call many times.
export function unlockSound() {
  const a = audio();
  if (!a) return false;
  if (a.state !== "running") a.resume().then(emit).catch(() => {});
  emit();
  return a.state === "running";
}

// Unlocks sound on the first interaction anywhere in the app.
export function initRingtone() {
  ["pointerdown", "keydown", "touchstart"].forEach(type => {
    document.addEventListener(type, () => unlockSound(), { capture: true, passive: true });
  });
}

function tone(a, f1, f2, start, dur, vol) {
  const t = a.currentTime + start;
  const gain = a.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.03);
  gain.gain.setValueAtTime(vol, t + dur - 0.08);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  gain.connect(a.destination);
  [f1, f2].forEach(freq => {
    const osc = a.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    osc.connect(gain);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  });
}

function play(kind) {
  const a = audio();
  if (!a || a.state !== "running") return;
  const p = PATTERN[kind];
  p.bursts.forEach(offset => tone(a, p.freq[0], p.freq[1], offset, p.dur, p.gain));
  if (kind === "incoming") navigator.vibrate?.([350, 200, 350]);
}

export function startRing(kind) {
  stopRing();
  const a = audio();
  if (a && a.state !== "running") a.resume().then(emit).catch(() => {});
  current = kind;
  play(kind);
  timer = setInterval(() => play(kind), PATTERN[kind].period);
  emit();
}

export function stopRing() {
  clearInterval(timer);
  timer = 0;
  current = null;
  navigator.vibrate?.(0);
}

export const startRingback = () => startRing("ringback");

export function stopRingback() {
  if (current === "ringback") stopRing();
}

// Short two-note chime for a new message. Silent until the page has been tapped once.
let lastChime = 0;
export function ping() {
  const a = audio();
  if (!a || a.state !== "running") return;
  const now = Date.now();
  if (now - lastChime < 600) return;
  lastChime = now;
  const t = a.currentTime;
  [880, 1174].forEach((freq, i) => {
    const start = t + i * 0.12;
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.16, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
    osc.connect(gain).connect(a.destination);
    osc.start(start);
    osc.stop(start + 0.32);
  });
}
