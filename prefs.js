// Preferences saved on this device, and the screen layout (phone or desktop) that fits the window.
const KEY = "emarni-prefs-v2";
const DEFAULTS = {
  layout: "auto", // "auto" | "phone" | "desktop"
  fog: true,
  reduceMotion: false,
  compact: false,
  largeText: false,
  sound: true, // master toggle for message sounds (alias: soundMessages)
  cards: true,
  osNotify: true,
  preview: true,
  envTheme: true,
  soundMaster: true,
  soundUi: true,
  soundCalls: true,
  // v9 additions (backward compatible — old stored prefs simply lack these keys)
  theme: "dark", // "dark" | "light" | "auto"
  soundNotify: true, // notification chimes
  soundMessages: true, // alias of sound; kept in sync
  desktopNotify: true, // OS/desktop notifications
  messagePreview: true // show message text in notifications
};
let prefs = { ...DEFAULTS };
let lastDevice = "";
let lastTheme = "";
const subs = new Set();
const phoneQuery = window.matchMedia
  ? window.matchMedia("(max-width: 760px), (pointer: coarse) and (max-width: 1024px)")
  : null;
const darkQuery = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
function load() {
  try {
    prefs = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    prefs = { ...DEFAULTS };
  }
  // soundMessages mirrors sound (master message toggle). Keep them in sync.
  if (prefs.soundMessages === undefined) prefs.soundMessages = prefs.sound;
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Storage is blocked (private mode): the choice still lasts for this visit.
  }
}
export function getPref(key) {
  if (key === "soundMessages") return prefs.sound; // alias always reflects master
  return prefs[key];
}
export function setPref(key, value) {
  prefs[key] = value;
  if (key === "sound") prefs.soundMessages = value;
  if (key === "soundMessages") prefs.sound = value;
  save();
  apply();
  subs.forEach(fn => fn(prefs));
}
export function resetPrefs() {
  prefs = { ...DEFAULTS };
  save();
  apply();
  subs.forEach(fn => fn(prefs));
}
export function onPrefs(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}
// "phone" or "desktop", from the chosen layout or, when set to auto, from the window size.
export function currentDevice() {
  if (prefs.layout === "phone" || prefs.layout === "desktop") return prefs.layout;
  return phoneQuery?.matches ? "phone" : "desktop";
}
// Resolved theme: "dark" or "light". "auto" follows the OS preference.
export function resolvedTheme() {
  if (prefs.theme === "light") return "light";
  if (prefs.theme === "auto") return darkQuery?.matches ? "dark" : "light";
  return "dark";
}
function apply() {
  const root = document.documentElement;
  const device = currentDevice();
  root.dataset.device = device;
  const theme = resolvedTheme();
  root.dataset.theme = theme;
  root.classList.toggle("no-fog", !prefs.fog);
  root.classList.toggle("reduce-motion", prefs.reduceMotion);
  root.classList.toggle("compact", prefs.compact);
  root.classList.toggle("text-large", prefs.largeText);
  if (device !== lastDevice || theme !== lastTheme) {
    lastDevice = device;
    lastTheme = theme;
    subs.forEach(fn => fn(prefs));
  }
}
export function initPrefs() {
  load();
  apply();
  phoneQuery?.addEventListener?.("change", apply);
  darkQuery?.addEventListener?.("change", () => {
    if (prefs.theme === "auto") apply();
  });
  window.addEventListener("resize", apply, { passive: true });
  window.addEventListener("orientationchange", apply);
}
