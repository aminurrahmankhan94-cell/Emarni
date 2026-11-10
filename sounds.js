// Sound player. Plays the tones from soundcore.js with the Web Audio API.
// Sound starts only after the person has tapped the page, because browsers block sound before that.
import { getPref } from "./prefs.js";
import { RECIPES, shouldPlay } from "./soundcore.js";

let ctx = null;
let lastAt = 0;
let installed = false;

function context() {
  if (!ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    ctx = new AudioCtx();
  }
  return ctx;
}

function unlock() {
  const c = context();
  if (c && c.state !== "running") c.resume().catch(() => {});
}

// Call once at boot. Adds the unlock on the first tap and a soft click for ordinary buttons.
export function initSounds() {
  if (installed) return;
  installed = true;
  ["pointerdown", "keydown", "touchstart"].forEach(type => {
    document.addEventListener(type, unlock, { capture: true, passive: true });
  });
  document.addEventListener("click", onClick, true);
}

function onClick(event) {
  const el = event.target.closest("button, .switch, .nav, [data-rx-add], [data-rx]");
  if (!el || el.disabled || el.matches("[data-close]")) return; // dialogs play their own open and close sounds
  let name = "click";
  if (el.matches(".nav")) name = "nav";
  else if (el.matches("[data-rx-add], [data-rx]")) name = "reaction";
  playSound(name);
}

function tone(c, note, t0) {
  const start = t0 + (note.t || 0);
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = note.type || "sine";
  osc.frequency.value = note.f;
  const volume = note.v || 0.07;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + note.d);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(start);
  osc.stop(start + note.d + 0.03);
}

// Plays a named sound. force=true ignores the settings (used by the "Test sound" button).
export function playSound(name, { force = false } = {}) {
  if (!RECIPES[name]) return;
  if (!force) {
    const prefs = {
      soundMaster: getPref("soundMaster"),
      sound: getPref("sound"),
      soundUi: getPref("soundUi"),
      soundCalls: getPref("soundCalls")
    };
    if (!shouldPlay(name, prefs)) return;
  }
  const now = performance.now();
  if (!force && now - lastAt < 45) return; // stop bursts of sound
  lastAt = now;
  const c = context();
  if (!c || c.state !== "running") return;
  const t0 = c.currentTime + 0.01;
  RECIPES[name].forEach(note => tone(c, note, t0));
}
