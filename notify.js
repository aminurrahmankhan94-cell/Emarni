// Notifications: new messages, friend requests, accepted requests, post likes/comments,
// calls — with a right-side drawer (#notifyDrawer), a full notifications view, in-app
// cards, unread badges, and browser/phone notifications when in the background.
import * as fb from "./firebase.js";
import { $, esc, toast, timeAgo } from "./ui.js";
import { icon } from "./icons.js";
import { playSound } from "./sounds.js";
import { getPref } from "./prefs.js";

let ctx = null;
let onChange = () => {};
let activeKey = null;
const listeners = new Map(); // room key -> unsubscribe
const ensured = new Set(); // direct-room ids whose membership is already written
const unread = {}; // room key -> count (message unread only; stable for totalUnread)
const seen = new Set(); // message ids already handled
const bootAt = Date.now();
let lastPing = 0;

// ---------- Notification center state ----------
const READ_KEY = "emarni-notify-read";
const NOTIFY_CAP = 120;
let notifications = []; // {key, type, icon, icClass, title, body, time, view, uid}
const seenNotify = new Set(); // stable keys already recorded (dedup)
let readKeys = loadRead();
let socialUnsubs = []; // friend/post watchers
let shellReady = false;

function loadRead() {
  try { return new Set(JSON.parse(localStorage.getItem(READ_KEY) || "[]")); }
  catch { return new Set(); }
}
function saveRead() {
  try { localStorage.setItem(READ_KEY, JSON.stringify([...readKeys].slice(-500))); } catch {}
}
function notifyUnreadCount() {
  return notifications.filter(n => !readKeys.has(n.key)).length;
}

// Sound pref: new soundNotify key, fall back to legacy "sound"
function soundOn() {
  const v = getPref("soundNotify");
  return v === undefined ? getPref("sound") !== false : v === true;
}
function desktopOn() {
  const v = getPref("desktopNotify");
  return v === undefined ? getPref("osNotify") !== false : v === true;
}
function cardsOn() { return getPref("cards") !== false; }

// ---------- Stable exports (unchanged contract) ----------
export function initNotify(context, changed) {
  ctx = context;
  onChange = changed || (() => {});
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
  ensureShell();
  startSocialWatchers();
}

export function permissionState() {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
}

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
    if (!wanted.has(key)) { off(); listeners.delete(key); }
  });
  for (const room of rooms) {
    if (listeners.has(room.key)) continue;
    if (room.kind === "dm" && !ensured.has(room.id)) {
      try { await fb.openPrivateChat(room.uid); ensured.add(room.id); }
      catch { continue; }
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
  if (soundOn() && Date.now() - lastPing > 800) { playSound("receive"); lastPing = Date.now(); }
  if (cardsOn()) card(title, body, "chat", room.open);
  if (desktopOn()) osNotify(title, body, room.key);
  // Add to notification center
  pushNotification({
    key: `msg:${room.key}:${id}`,
    type: "msg",
    icon: "chat",
    icClass: "ic-msg",
    title,
    body,
    view: "chats",
    uid: room.uid || null
  });
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
  if (cardsOn()) card(`${who} is calling`, `Incoming ${kind}`, "phone", null);
  if (desktopOn()) osNotify(`Incoming ${kind}`, `${who} is calling you on Emarni`, `call-${invite.from}`);
  pushNotification({
    key: `call:${invite.from}:${Date.now()}`,
    type: "call",
    icon: "phone",
    icClass: "ic-call",
    title: `${who} is calling`,
    body: `Incoming ${kind}`,
    view: "chats"
  });
}

export function notifyMissed(invite) {
  const kind = invite.type === "video" ? "video" : "audio";
  const who = invite.fromName || "someone";
  if (cardsOn()) card(`Missed ${kind} call`, `From ${who}`, "phone", null);
  if (desktopOn()) osNotify(`Missed ${kind} call`, `From ${who}`, `missed-${invite.from}`);
  pushNotification({
    key: `missed:${invite.from}:${Date.now()}`,
    type: "call",
    icon: "phone",
    icClass: "ic-call",
    title: `Missed ${kind} call`,
    body: `From ${who}`,
    view: "chats"
  });
}

export function setActiveRoom(key) { activeKey = key; }

export function markRead(key) {
  if (unread[key]) { delete unread[key]; onChange(); }
}

export function unreadFor(key) { return unread[key] || 0; }

export function totalUnread() {
  return Object.values(unread).reduce((sum, n) => sum + n, 0);
}

// ---------- Social watchers: friend requests, accepted, post likes/comments ----------
function startSocialWatchers() {
  const me = ctx?.me()?.uid;
  if (!me) return;
  // Stop old
  socialUnsubs.forEach(u => { try { u(); } catch {} });
  socialUnsubs = [];

  // Incoming friend requests
  const seenReqs = new Set();
  socialUnsubs.push(fb.watchIncomingRequests(me, reqs => {
    Object.entries(reqs || {}).forEach(([uid, req]) => {
      if (seenReqs.has(uid)) return;
      seenReqs.add(uid);
      if (Number(req?.createdAt || 0) < bootAt - 3000) return; // old
      const name = req?.name || "Someone";
      pushNotification({
        key: `freq:${uid}`,
        type: "friend",
        icon: "userplus",
        icClass: "ic-friend",
        title: `${name} sent you a friend request`,
        body: "Tap to see people and requests",
        view: "people",
        uid
      });
      if (soundOn()) playSound("requestSent");
      if (desktopOn()) osNotify("New friend request", `${name} wants to connect`, `freq-${uid}`);
    });
  }, () => {}));

  // Sent requests -> accepted
  const seenAccepted = new Set();
  socialUnsubs.push(fb.watchSentRequests(me, sent => {
    Object.entries(sent || {}).forEach(([uid, rel]) => {
      if (rel?.status !== "accepted") return;
      if (seenAccepted.has(uid)) return;
      seenAccepted.add(uid);
      if (Number(rel?.createdAt || 0) < bootAt - 3000 && !rel.acceptedAt) return;
      const name = rel?.name || "Someone";
      pushNotification({
        key: `accepted:${uid}`,
        type: "friend",
        icon: "check",
        icClass: "ic-friend",
        title: `${name} accepted your friend request`,
        body: "You are now connected",
        view: "friends",
        uid
      });
      if (soundOn()) playSound("accepted");
      if (desktopOn()) osNotify("Friend request accepted", `${name} accepted your request`, `acc-${uid}`);
    });
  }, () => {}));

  // My posts -> likes and comments
  const seenLikes = new Set();
  const seenComments = new Set();
  const postUnsubs = [];
  socialUnsubs.push(() => postUnsubs.forEach(u => { try { u(); } catch {} }));
  const myPosts = fb.watchUserPosts(me, posts => {
    const ids = new Set((posts || []).map(p => p.id));
    // Attach like/comment watchers to each of my posts
    ids.forEach(pid => {
      if (postUnsubs._attached?.has(pid)) return;
      postUnsubs._attached = postUnsubs._attached || new Set();
      postUnsubs._attached.add(pid);
      // Likes
      postUnsubs.push(fb.onValue(fb.ref(fb.db, `postLikes/${pid}`), snap => {
        const likes = snap.val() || {};
        Object.keys(likes).forEach(uid => {
          if (uid === me) return;
          const k = `like:${pid}:${uid}`;
          if (seenLikes.has(k)) return;
          seenLikes.add(k);
          const author = ctx?.author?.(uid);
          const name = author?.displayName || "Someone";
          pushNotification({
            key: k,
            type: "like",
            icon: "heart",
            icClass: "ic-like",
            title: `${name} liked your post`,
            body: "Tap to view the feed",
            view: "feed"
          });
          if (soundOn()) playSound("like");
        });
      }, () => {}));
      // Comments (top-level + replies flattened)
      postUnsubs.push(fb.onValue(fb.ref(fb.db, `postComments/${pid}`), snap => {
        const val = snap.val() || {};
        const walk = (obj, parentId) => {
          Object.entries(obj).forEach(([cid, c]) => {
            if (cid === "replies" && typeof c === "object") { walk(c, parentId); return; }
            if (!c || typeof c !== "object" || !c.uid) return;
            const k = `comment:${pid}:${cid}`;
            if (seenComments.has(k)) return;
            seenComments.add(k);
            if (c.uid === me) return;
            if (Number(c.createdAt || 0) < bootAt - 3000) return;
            const author = ctx?.author?.(c.uid);
            const name = author?.displayName || "Someone";
            const text = String(c.text || "").slice(0, 80);
            pushNotification({
              key: k,
              type: "comment",
              icon: "reply",
              icClass: "ic-comment",
              title: `${name} commented on your post`,
              body: text || "New comment",
              view: "feed"
            });
            if (soundOn()) playSound("reaction");
            if (desktopOn()) osNotify("New comment", `${name}: ${text}`, k);
          });
        };
        walk(val, null);
      }, () => {}));
    });
  }, () => {});
  socialUnsubs.push(myPosts);
}

// ---------- Notification center core ----------
function pushNotification(n) {
  if (seenNotify.has(n.key)) return; // dedup by stable key
  seenNotify.add(n.key);
  n.time = Date.now();
  notifications.unshift(n);
  if (notifications.length > NOTIFY_CAP) notifications = notifications.slice(0, NOTIFY_CAP);
  renderNotifyAll();
  // In-app toast when not focused
  if (document.hidden || !document.hasFocus()) {
    if (cardsOn()) card(n.title, n.body, n.icon, null);
  }
}

function markNotifyRead(key) {
  readKeys.add(key);
  saveRead();
  renderNotifyAll();
}

function markAllNotifyRead() {
  notifications.forEach(n => readKeys.add(n.key));
  saveRead();
  renderNotifyAll();
  toast("All notifications marked as read");
  playSound("confirm");
}

// ---------- Shell: create drawer + full view if S1 hasn't yet ----------
function ensureShell() {
  if (shellReady) return;
  shellReady = true;
  // Full notifications view (section so go("notifications") works)
  if (!$("#notificationsView")) {
    const sec = document.createElement("section");
    sec.className = "view";
    sec.dataset.view = "notifications";
    sec.id = "notificationsView";
    sec.innerHTML = `<div class="page">
      <header class="page-head">
        <div><h1>Notifications</h1>
        <p class="hint">Messages, friend requests, likes, comments and calls.</p></div>
        <button class="btn ghost sm" type="button" id="notifyMarkAllFull"><i data-icon="check"></i>Mark all read</button>
      </header>
      <div class="notify-list" id="notifyListFull"></div>
    </div>`;
    const stage = document.querySelector("main.stage") || document.querySelector("#workspace") || document.body;
    stage.appendChild(sec);
    $("#notifyMarkAllFull")?.addEventListener("click", markAllNotifyRead);
  }
  // Right-side drawer
  if (!$("#notifyDrawer")) {
    const drawer = document.createElement("aside");
    drawer.id = "notifyDrawer";
    drawer.setAttribute("aria-label", "Notifications");
    drawer.innerHTML = `<div class="nd-backdrop" data-notify-close></div>
      <div class="notify-head">
        <h2>${icon("bell")}Notifications<span class="notify-badge hidden" id="notifyDrawerBadge">0</span></h2>
        <div class="notify-actions">
          <button class="notify-mark-all" type="button" id="notifyMarkAll">Mark all read</button>
          <button class="notify-close" type="button" data-notify-close aria-label="Close notifications">${icon("x")}</button>
        </div>
      </div>
      <div class="notify-list" id="notifyListDrawer"></div>
      <div class="notify-foot">
        <span id="notifyFootCount"></span>
        <a id="notifyViewAll" type="button">View all →</a>
      </div>`;
    document.body.appendChild(drawer);
    $("#notifyMarkAll")?.addEventListener("click", markAllNotifyRead);
    drawer.addEventListener("click", e => {
      if (e.target.closest("[data-notify-close]")) closeDrawer();
    });
    $("#notifyViewAll")?.addEventListener("click", () => {
      closeDrawer();
      ctx?.go?.("notifications");
    });
  }
  // Wire bell if present (S1 may provide #notifyBell; #notifyBtn is permission toggle — leave it)
  const bell = $("#notifyBell");
  if (bell && !bell._notifyWired) {
    bell._notifyWired = true;
    bell.addEventListener("click", e => { e.preventDefault(); toggleDrawer(); });
  }
  // Custom event so S1 can open the drawer from any bell button
  window.addEventListener("emarni:openNotify", () => openDrawer());
  document.addEventListener("click", e => {
    const opener = e.target.closest("[data-open-notify]");
    if (opener) { e.preventDefault(); toggleDrawer(); }
  });
  renderNotifyAll();
}

function openDrawer() { $("#notifyDrawer")?.classList.add("open"); }
function closeDrawer() { $("#notifyDrawer")?.classList.remove("open"); }
function toggleDrawer() { $("#notifyDrawer")?.classList.toggle("open"); }

function renderNotifyAll() {
  renderNotifyList($("#notifyListDrawer"), true);
  renderNotifyList($("#notifyListFull"), false);
  const n = notifyUnreadCount();
  const badge = $("#notifyDrawerBadge");
  if (badge) { badge.textContent = n > 99 ? "99+" : String(n); badge.classList.toggle("hidden", n === 0); }
  const foot = $("#notifyFootCount");
  if (foot) foot.textContent = n ? `${n} unread` : "All caught up";
  // If S1 added a #notifyBadge, update it too
  const nb = $("#notifyBadge");
  if (nb) { nb.textContent = n > 99 ? "99+" : String(n); nb.classList.toggle("hidden", n === 0); }
}

function renderNotifyList(box, compact) {
  if (!box) return;
  if (!notifications.length) {
    box.innerHTML = `<div class="notify-empty">${icon("bell")}<p>No notifications yet.</p><p>When something happens, it will show up here.</p></div>`;
    return;
  }
  box.innerHTML = notifications.map(n => {
    const unread = !readKeys.has(n.key);
    return `<button class="notify-card${unread ? " unread" : ""}" type="button" data-notify-key="${esc(n.key)}" data-notify-view="${esc(n.view || "")}">
      <span class="notify-ic ${n.icClass || ""}">${icon(n.icon)}</span>
      <span class="notify-txt">
        <b>${esc(n.title)}</b>
        <small>${esc(n.body || "")} · ${timeAgo(n.time)}</small>
      </span>
    </button>`;
  }).join("");
  box.querySelectorAll("[data-notify-key]").forEach(el => {
    el.addEventListener("click", () => {
      markNotifyRead(el.dataset.notifyKey);
      const view = el.dataset.notifyView;
      if (view && ctx?.go) ctx.go(view);
      closeDrawer();
    });
  });
}

// ---------- In-app card at the top right (kept) ----------
function card(title, body, iconName, onClick) {
  const stack = $("#noticeStack");
  if (!stack) return;
  const el = document.createElement("button");
  el.type = "button";
  el.className = "ncard";
  el.innerHTML = `<span class="nc-ic">${icon(iconName)}</span><span class="nc-txt"><b>${esc(title)}</b><small>${esc(body)}</small></span>`;
  el.addEventListener("click", () => { el.remove(); onClick?.(); });
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
