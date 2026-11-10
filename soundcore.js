// Pure sound definitions: short, soft tones made from synthesised notes. No audio files and no licensed sounds.
// Each note: frequency f (Hz), start t (seconds), duration d (seconds), volume v, and optional wave type.
export const RECIPES = {
  click: [{ f: 1320, t: 0, d: 0.05, v: 0.05 }],
  nav: [{ f: 880, t: 0, d: 0.045, v: 0.04 }],
  reaction: [{ f: 1046, t: 0, d: 0.07, v: 0.06 }],
  open: [{ f: 660, t: 0, d: 0.12, v: 0.05 }, { f: 990, t: 0.05, d: 0.12, v: 0.04 }],
  close: [{ f: 990, t: 0, d: 0.1, v: 0.04 }, { f: 660, t: 0.06, d: 0.12, v: 0.04 }],
  send: [{ f: 740, t: 0, d: 0.09, v: 0.07 }, { f: 1100, t: 0.06, d: 0.12, v: 0.06 }],
  receive: [{ f: 880, t: 0, d: 0.14, v: 0.1 }, { f: 1174, t: 0.12, d: 0.2, v: 0.08 }],
  like: [{ f: 620, t: 0, d: 0.09, v: 0.08 }, { f: 930, t: 0.05, d: 0.14, v: 0.06 }],
  requestSent: [{ f: 660, t: 0, d: 0.18, v: 0.06 }, { f: 880, t: 0.14, d: 0.22, v: 0.05 }],
  accepted: [{ f: 784, t: 0, d: 0.12, v: 0.09 }, { f: 988, t: 0.1, d: 0.12, v: 0.09 }, { f: 1318, t: 0.2, d: 0.28, v: 0.08 }],
  uploadDone: [{ f: 1046, t: 0, d: 0.1, v: 0.07 }, { f: 1318, t: 0.09, d: 0.16, v: 0.06 }],
  posted: [{ f: 880, t: 0, d: 0.1, v: 0.08 }, { f: 1108, t: 0.08, d: 0.1, v: 0.08 }, { f: 1318, t: 0.16, d: 0.22, v: 0.07 }],
  callConnected: [{ f: 523, t: 0, d: 0.1, v: 0.09 }, { f: 784, t: 0.1, d: 0.3, v: 0.08 }],
  callEnd: [{ f: 620, t: 0, d: 0.14, v: 0.07 }, { f: 415, t: 0.14, d: 0.3, v: 0.06 }],
  error: [{ f: 220, t: 0, d: 0.18, v: 0.1, type: "triangle" }, { f: 180, t: 0.14, d: 0.22, v: 0.08, type: "triangle" }],
  warning: [{ f: 440, t: 0, d: 0.12, v: 0.07 }],
  confirm: [{ f: 392, t: 0, d: 0.14, v: 0.07 }],
  loginOk: [{ f: 523, t: 0, d: 0.12, v: 0.08 }, { f: 659, t: 0.1, d: 0.12, v: 0.08 }, { f: 784, t: 0.2, d: 0.3, v: 0.08 }],
  loginFail: [{ f: 260, t: 0, d: 0.16, v: 0.09, type: "triangle" }]
};

// Which settings group each sound belongs to.
export const CATEGORY = {
  send: "messages",
  receive: "messages",
  callConnected: "calls",
  callEnd: "calls"
};

export function categoryOf(name) {
  return CATEGORY[name] || "ui";
}

// Whether a sound may play, given the saved settings. Master off silences everything.
// The default for a missing setting is "on", so an unknown setting never silences sound by accident.
export function shouldPlay(name, prefs = {}) {
  if (!RECIPES[name]) return false;
  if (prefs.soundMaster === false) return false;
  const category = categoryOf(name);
  if (category === "messages") return prefs.sound !== false;
  if (category === "calls") return prefs.soundCalls !== false;
  return prefs.soundUi !== false;
}
