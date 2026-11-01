// Shared UI helpers used by every module.
export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

export const esc = value =>
  String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

export const errMsg = err => err?.message || "Something went wrong. Please try again.";

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const COLORS = ["#ef4444", "#dc2626", "#f87171", "#fecaca", "#ffffff", "#a3a3a3"];

export const LIMIT_MB = { image: 10, video: 50, audio: 20, avatar: 5, cover: 8, pet: 8, ad: 5 };

let toastTimer = 0;
export function toast(message, ms = 2600) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), ms);
}

// Shows a loading label on a button and disables it. Call again with on=false to restore.
export function busy(button, on, label = "Working…") {
  if (!button) return;
  if (on) {
    button.dataset.label = button.textContent;
    button.textContent = label;
    button.disabled = true;
    button.classList.add("loading");
  } else {
    button.textContent = button.dataset.label || button.textContent;
    button.disabled = false;
    button.classList.remove("loading");
  }
}

export function initials(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map(word => word[0]).join("").toUpperCase() || "E";
}

export const accentOf = profile => (/^#[0-9a-f]{6}$/i.test(profile?.accent || "") ? profile.accent : "#ef4444");

// Position and zoom of a photo: x/y are percentages of the frame, z is the zoom (1 to 3).
export function posStyle(pos = {}) {
  const x = Number(pos.x) || 0;
  const y = Number(pos.y) || 0;
  const z = clamp(Number(pos.z) || 1, 1, 3);
  return `transform:translate(${x}%,${y}%) scale(${z})`;
}

// Avatar bubble: photo (positioned) or initials, with the owner's accent ring.
export function avatarHTML(profile = {}, extra = "") {
  const inner = profile.photoURL
    ? `<img alt="" draggable="false" loading="lazy" src="${esc(profile.photoURL)}" style="${posStyle(profile.avatarPos)}">`
    : `<span>${esc(initials(profile.displayName))}</span>`;
  const shape = profile.avatarShape === "squircle" ? " sq" : "";
  return `<span class="av${shape} ${extra}" style="--ring:${accentOf(profile)}">${inner}</span>`;
}

export function timeAgo(ts) {
  const seconds = (Date.now() - (Number(ts) || Date.now())) / 1000;
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return new Date(Number(ts)).toLocaleDateString([], { day: "numeric", month: "short" });
}

export const timeOf = ts => new Date(Number(ts) || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function fileKind(file) {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return "";
}

export function pop(el) {
  if (!el) return;
  el.classList.remove("pop");
  void el.offsetWidth;
  el.classList.add("pop");
}

export function openDialog(selector) {
  const dialog = $(selector);
  if (dialog && !dialog.open) dialog.showModal();
  return dialog;
}

// Wires every [data-close] button to close its dialog.
export function wireDialogs() {
  $$("[data-close]").forEach(btn => {
    btn.addEventListener("click", () => btn.closest("dialog")?.close());
  });
}

// Opens the shared text dialog and resolves with the entered text, or null if cancelled.
export function askText({ title, placeholder = "", required = true, okText = "Send" }) {
  const dialog = $("#dlgText");
  const input = $("#dlgTextInput");
  $("#dlgTextTitle").textContent = title;
  input.value = "";
  input.placeholder = placeholder;
  $("#dlgTextOk").textContent = okText;
  dialog.showModal();
  setTimeout(() => input.focus(), 60);
  return new Promise(resolve => {
    const finish = value => {
      dialog.close();
      resolve(value);
    };
    $("#dlgTextForm").onsubmit = event => {
      event.preventDefault();
      const value = input.value.trim();
      if (required && !value) {
        input.focus();
        return;
      }
      finish(value);
    };
    $("#dlgTextCancel").onclick = () => finish(null);
    dialog.oncancel = () => finish(null);
  });
}
