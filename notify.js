// Notifications: new messages and calls, unread counts, a short sound, in-app cards,
// and browser or phone notifications when the app is in the background.
import * as fb from "./firebase.js";
import { $, esc, toast } from "./ui.js";
import { icon } from "./icons.js";
import { ping } from "./ringtone.js";
import { getPref } from "./prefs.js";

let ctx = null;
let onChange = () => {};
let activeKey = null;
const listeners = new Map(); // room key -> unsubscribe
const ensured = new Set(); // direct-room ids whose membership is already written
const unread = {}; // room key -> count
const seen = new Set(); // message ids already handled
const bootAt = Date.now();
let lastPing = 0;

export function initNotify(context, changed) {
  ctx = context;
  onChange = changed || (() => {});
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

export function permissionState() {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
}

// Asks for permission. Must be called from a button tap.
export async function enableNotifications() {
  if (!("Notification" in window)) {
    toast("This browser does not support notifications");
    return false;
  }
  const result = await Notification.requestPermission();
  toast(result === "granted" ? "Notifications are on" : "Notifications were not allowed");
  onChange();
  return result === "granted";
}

// rooms: [{ key, kind: "dm" | "group", id, uid?, title, open() }]. Call whenever friends or groups change.
export async function syncRooms(rooms) {
  const me = ctx?.me()?.uid;
  if (!me) return;
  const wanted = new Set(rooms.map(room => room.key));
  listeners.forEach((off, key) => {
    if (!wanted.has(key)) {
      off();
      listeners.delete(key);
    }
  });
  for (const room of rooms) {
    if (listeners.has(room.key)) continue;
    if (room.kind === "dm" && !ensured.has(room.id)) {
      try {
        await fb.openPrivateChat(room.uid); // membership is needed to read the room
        ensured.add(room.id);
      } catch {
        continue;
      }
    }
    listen(room, me);
  }
}

function listen(room, me) {
  const path = room.kind === "dm" ? `privateRooms/${room.id}/messages` : `groupMessages/${room.id}`;
  const q = fb.query(fb.ref(fb.db, path), fb.orderByChild("createdAt"), fb.limitToLast(1));
  const off = fb.onChildAdded(q, snap => handle(room, snap.key, snap.val(), me), () => {});
  listeners.set(room.key, off);
}

function handle(room, id, msg, me) {
  if (!msg || msg.uid === me || seen.has(id)) return;
  if (Number(msg.createdAt) < bootAt - 3000) return; // old history, not a new message
  seen.add(id);
  if (activeKey === room.key && !document.hidden && document.hasFocus()) return;

  unread[room.key] = (unread[room.key] || 0) + 1;
  onChange();

  const sender = msg.senderName || "Emarni";
  const title = room.kind === "group" ? room.title : sender;
  const body = room.kind === "group" ? `${sender}: ${preview(msg)}` : preview(msg);
  if (getPref("sound") && Date.now() - lastPing > 800) {
    ping();
    lastPing = Date.now();
  }
  if (getPref("cards")) card(title, body, "chat", room.open);
  if (getPref("osNotify")) osNotify(title, body, room.key);
}

function preview(m) {
  if (!getPref("preview")) return "New message";
  if (m.type === "image") return "Photo";
  if (m.type === "video") return "Video";
  if (m.type === "audio") return "Voice message";
  if (m.type && m.type !== "text") return `File: ${m.fileName || "file"}`;
  return String(m.text || "").slice(0, 120);
}

// Announces a call. The ringing itself is handled by call.js.
export function notifyIncoming(invite) {
  const kind = invite.type === "video" ? "video call" : "audio call";
  const who = invite.fromName || "Someone";
  if (getPref("cards")) card(`${who} is calling`, `Incoming ${kind}`, "phone", null);
  if (getPref("osNotify")) osNotify(`Incoming ${kind}`, `${who} is calling you on Emarni`, `call-${invite.from}`);
}

export function notifyMissed(invite) {
  const kind = invite.type === "video" ? "video" : "audio";
  const who = invite.fromName || "someone";
  if (getPref("cards")) card(`Missed ${kind} call`, `From ${who}`, "phone", null);
  if (getPref("osNotify")) osNotify(`Missed ${kind} call`, `From ${who}`, `missed-${invite.from}`);
}

export function setActiveRoom(key) {
  activeKey = key;
}

export function markRead(key) {
  if (unread[key]) {
    delete unread[key];
    onChange();
  }
}

export function unreadFor(key) {
  return unread[key] || 0;
}

export function totalUnread() {
  return Object.values(unread).reduce((sum, n) => sum + n, 0);
}

// In-app card at the top right. Clicking it opens the conversation.
function card(title, body, iconName, onClick) {
  const stack = $("#noticeStack");
  if (!stack) return;
  const el = document.createElement("button");
  el.type = "button";
  el.className = "ncard";
  el.innerHTML = `<span class="nc-ic">${icon(iconName)}</span><span class="nc-txt"><b>${esc(title)}</b><small>${esc(body)}</small></span>`;
  el.addEventListener("click", () => {
    el.remove();
    onClick?.();
  });
  stack.appendChild(el);
  while (stack.children.length > 4) stack.firstElementChild.remove();
  setTimeout(() => el.classList.add("out"), 5200);
  setTimeout(() => el.remove(), 5700);
}

// Browser or phone notification. Used only when the app is not in focus.
async function osNotify(title, body, tag) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (!document.hidden && document.hasFocus()) return;
  const options = { body, tag, renotify: true };
  try {
    const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : null;
    if (reg) await reg.showNotification(title, options);
    else new Notification(title, options);
  } catch {
    // Notifications are optional; the in-app card still shows.
  }
}
