// EMARNI v9 — Messaging (S2). Direct + group chats: conversation list with search/filters,
// pinned/muted (local), unread badges, message bubbles with reactions/reply/context menu,
// in-conversation search, photo/video/audio/file attachments with preview and progress, voice
// notes (hold to record), group creation and management, call handoff.
// Frozen: firebase.js API only. No presence / typing / read-receipts / forward / edit — those
// buttons are intentionally absent. Exports (stable): initChat, openDm, openGroup, openNewGroup,
// refreshChatHead, onChatsShow. Renders inside #chats (index.html shell); never touches other files.
import * as fb from "./firebase.js";
import { db, ref, query, orderByChild, limitToLast, onValue } from "./firebase.js";
import { $, $$, esc, toast, busy, errMsg, avatarHTML, askText, openDialog, timeAgo, timeOf, initials, COLORS, clamp } from "./ui.js";
import { icon } from "./icons.js";
import { startCall } from "./call.js";
import { kindOf, validateFile, prepareUpload, ACCEPT_FOR, KIND_LABEL } from "./media.js";
import { setActiveRoom, markRead, unreadFor } from "./notify.js";
import { playSound } from "./sounds.js";

const MAX_LEN = 1000;
// Reaction kinds are stored as strings; unicode emoji are allowed inside reaction data. Legacy
// v8 kinds (heart/check/sparkle) are mapped to emoji when displayed.
const REACT_EMOJI = ["❤️", "👍", "😂", "😮", "😢"];
const LEGACY_RX = { heart: "❤️", check: "👍", sparkle: "✨" };
const EMOJI_PICKER = ["😀", "😂", "🥰", "😎", "🤔", "😢", "😡", "👍", "👎", "❤️", "🔥", "🎉", "✨", "🙏", "💯", "🙌", "🤝", "👋", "😴", "🤩"];
const reduceMotion = () => document.documentElement.classList.contains("reduce-motion");

// Active conversation state
const C = { chat: null, group: null, msgs: [], reacts: {}, seen: new Set(), first: true, replyTo: null, openId: null, query: "", sending: false, unsubs: [] };
// Conversation-list state
const L = { me: null, friends: [], groups: {}, last: {}, filter: "all", search: "", unsubs: [], lastUnsubs: [], lastKeys: "" };
let ctx = null;
let pendingFile = null; // { file, kind, previewUrl } awaiting send confirmation
let rec = null; // { recorder, stream, chunks, timer, startX, startY, cancelled }

// ---------------------------------------------------------------------------
// Local pinned / muted state (honest: client-side only; does not suppress push)
// ---------------------------------------------------------------------------
const pinKey = key => `emarni-pinned-${key}`;
const muteKey = key => `emarni-mute-${key}`;
const isPinned = key => localStorage.getItem(pinKey(key)) === "1";
const isMuted = key => localStorage.getItem(muteKey(key)) === "1";
const togglePin = key => { const v = isPinned(key) ? null : "1"; v ? localStorage.setItem(pinKey(key), "1") : localStorage.removeItem(pinKey(key)); };
const toggleMute = key => { const v = isMuted(key) ? null : "1"; v ? localStorage.setItem(muteKey(key), "1") : localStorage.removeItem(muteKey(key)); };

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
export function initChat(context) {
  ctx = context;
  L.me = ctx.me()?.uid || null;
  const root = $("#chats");
  if (!root) return;
  root.classList.add("chat-v9");

  buildConvPane();
  buildComposerArea();
  wireStatic();
  startListWatchers();
  renderConvList();
}

export function refreshChatHead() {
  renderHead();
  renderConvList();
}

export async function openDm(uid) {
  const profile = ctx.byUid(uid);
  if (!profile) return toast("This person is not in your directory yet.");
  try {
    const roomId = await fb.openPrivateChat(uid);
    openChat({ type: "dm", id: roomId, uid, name: profile.displayName });
  } catch (err) {
    toast(errMsg(err));
  }
}

export function openGroup(gid, name) {
  openChat({ type: "group", id: gid, name: name || "Group" });
}

export function openNewGroup() {
  $("#gForm").reset();
  $("#gColors").innerHTML = COLORS.map(
    (c, i) => `<label class="sw"><input type="radio" name="gcolor" value="${esc(c)}"${i === 0 ? " checked" : ""}><span style="background:${esc(c)}"></span></label>`
  ).join("");
  const friends = ctx.friends() || [];
  $("#gFriends").innerHTML = friends.length
    ? friends.map(p => `<label class="pick"><input type="checkbox" value="${esc(p.uid)}">${avatarHTML(p, "xs")}<span>${esc(p.displayName)}</span></label>`).join("")
    : `<p class="hint">Add friends first, then create a group.</p>`;
  openDialog("#dlgGroup");
}

// Called by app.js when the chats view is shown (contract). Right-panel slots #rpOnline/#rpRecent
// do not exist in the v8 shell; if a future shell adds them, we fill them here. Always refreshes list.
export function onChatsShow() {
  if (!ctx) return;
  renderConvList();
  const rpOnline = $("#rpOnline");
  const rpRecent = $("#rpRecent");
  if (rpOnline) {
    const friends = (ctx.friends() || []).slice(0, 12);
    rpOnline.innerHTML = `<h3>Friends</h3>` + (friends.length
      ? `<ul class="rp-list">${friends.map(p => `<li class="rp-item" data-uid="${esc(p.uid)}">${avatarHTML(p, "xs")}<span>${esc(p.displayName)}</span></li>`).join("")}</ul>`
      : `<p class="hint">No friends yet.</p>`);
    rpOnline.querySelectorAll("[data-uid]").forEach(el => el.addEventListener("click", () => openDm(el.dataset.uid)));
  }
  if (rpRecent) {
    const items = recentConversations(6);
    rpRecent.innerHTML = `<h3>Recent</h3>` + (items.length
      ? `<ul class="rp-list">${items.map(c => `<li class="rp-item" data-key="${esc(c.key)}">${c.avatar}<span>${esc(c.name)}</span></li>`).join("")}</ul>`
      : `<p class="hint">No conversations yet.</p>`);
    rpRecent.querySelectorAll("[data-key]").forEach(el => el.addEventListener("click", () => {
      const c = recentConversations(50).find(x => x.key === el.dataset.key);
      if (c?.type === "dm") openDm(c.uid);
      else if (c) openGroup(c.id, c.name);
    }));
  }
}

// ---------------------------------------------------------------------------
// Conversation list (left pane)
// ---------------------------------------------------------------------------
function buildConvPane() {
  const side = $("#chats aside.side");
  if (!side || $("#convWrap")) return;
  const wrap = document.createElement("div");
  wrap.id = "convWrap";
  wrap.className = "conv-wrap";
  wrap.innerHTML = `
    <div class="conv-head">
      <div class="conv-search">${icon("search")}<input id="convSearch" type="search" placeholder="Search conversations" autocomplete="off" maxlength="40"></div>
      <button class="icon-btn" id="convNewGroup" type="button" title="New group" aria-label="New group">${icon("plus")}</button>
    </div>
    <div class="conv-chips" role="tablist">
      <button class="chip on" type="button" data-filter="all">All</button>
      <button class="chip" type="button" data-filter="unread">Unread</button>
      <button class="chip" type="button" data-filter="groups">Groups</button>
    </div>
    <ul class="conv-list" id="convList"></ul>
  `;
  const sideLists = $("#sideLists");
  side.insertBefore(wrap, sideLists || side.lastChild);
  // Hide the legacy Friends/Groups sections (app.js still renders them; hidden is harmless).
  // Requests (#reqWrap) stay visible.
  ["sec-head", "groupList", "friendList"].forEach(id => {
    const el = id === "sec-head" ? side.querySelector(".sec-head") : $(`#${id}`);
    if (el) el.classList.add("chat-v9-hidden");
  });
  const friendsH = sideLists ? Array.from(sideLists.children).find(c => c.tagName === "H3") : null;
  if (friendsH) friendsH.classList.add("chat-v9-hidden");

  $("#convSearch").addEventListener("input", e => { L.search = e.target.value.trim().toLowerCase(); renderConvList(); });
  wrap.querySelectorAll("[data-filter]").forEach(btn => btn.addEventListener("click", () => {
    L.filter = btn.dataset.filter;
    wrap.querySelectorAll("[data-filter]").forEach(b => b.classList.toggle("on", b === btn));
    renderConvList();
  }));
  $("#convNewGroup").addEventListener("click", () => { playSound("click"); openNewGroup(); });
  $("#convList").addEventListener("click", onConvClick);
  $("#convList").addEventListener("contextmenu", onConvContext);
}

function startListWatchers() {
  if (!L.me) return;
  L.unsubs.forEach(off => off());
  L.unsubs = [];
  L.unsubs.push(fb.watchFriendships(L.me, () => { renderConvList(); }, () => {}));
  L.unsubs.push(fb.watchUserGroups(L.me, groups => { L.groups = groups || {}; renderConvList(); }, () => {}));
}

// Watch the last message of every room (limit 1) for previews + sorting. Real data, not faked.
// Only re-subscribes when the set of rooms actually changes (avoids render→resubscribe loops).
function refreshLastMessageWatchers(convs) {
  const keys = convs.map(c => c.key).sort().join("|");
  if (keys === L.lastKeys) return;
  L.lastKeys = keys;
  L.lastUnsubs.forEach(off => off());
  L.lastUnsubs = [];
  convs.forEach(c => {
    const path = c.type === "dm" ? `privateRooms/${c.id}/messages` : `groupMessages/${c.id}`;
    const q = query(ref(db, path), orderByChild("createdAt"), limitToLast(1));
    L.lastUnsubs.push(onValue(q, snap => {
      const vals = snap.val();
      const last = vals ? Object.values(vals)[0] : null;
      if (last) L.last[c.key] = { text: last.text, type: last.type, fileName: last.fileName, senderName: last.senderName, createdAt: last.createdAt };
      else delete L.last[c.key];
      renderConvList();
    }, () => {}));
  });
}

function buildConversations() {
  const me = L.me;
  const friends = ctx.friends() || [];
  const convs = [];
  friends.forEach(p => {
    const id = fb.roomIdFor(me, p.uid);
    convs.push({ type: "dm", id, uid: p.uid, key: `dm:${id}`, name: p.displayName, avatar: avatarHTML(p, "sm"), accent: p.accent });
  });
  Object.entries(L.groups).forEach(([gid, g]) => {
    convs.push({ type: "group", id: gid, key: `group:${gid}`, name: g.name || "Group", color: g.color || "#ef4444", avatar: groupAvatarHTML(gid, g.name, g.color) });
  });
  return convs;
}

function groupAvatarHTML(gid, name, color) {
  return `<span class="av" style="--ring:${esc(color || "#ef4444")}"><span>${esc(initials(name))}</span></span>`;
}

function recentConversations(n) {
  return buildConversations()
    .map(c => ({ ...c, ts: Number(L.last[c.key]?.createdAt) || 0 }))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, n);
}

function previewText(c) {
  const m = L.last[c.key];
  if (!m) return c.type === "group" ? "Group chat" : "Say hi 👋";
  if (m.type && m.type !== "text") {
    const label = { image: "Photo", video: "Video", audio: "Audio", voice: "Voice note", file: m.fileName || "File" }[m.type] || "Attachment";
    return `${m.senderName ? `${m.senderName}: ` : ""}${label}`;
  }
  return `${m.senderName ? `${m.senderName}: ` : ""}${m.text || ""}`;
}

function renderConvList() {
  const ul = $("#convList");
  if (!ul) return;
  const convs = buildConversations();
  refreshLastMessageWatchers(convs);
  const q = L.search;
  let list = convs.filter(c => {
    if (q && !String(c.name).toLowerCase().includes(q)) return false;
    if (L.filter === "groups") return c.type === "group";
    if (L.filter === "unread") return (unreadFor(c.key) || 0) > 0;
    return true;
  });
  list = list
    .map(c => ({ ...c, pinned: isPinned(c.key), muted: isMuted(c.key), unread: unreadFor(c.key) || 0, ts: Number(L.last[c.key]?.createdAt) || 0 }))
    .sort((a, b) => (b.pinned - a.pinned) || (b.ts - a.ts) || String(a.name).localeCompare(String(b.name)));

  if (!list.length) {
    ul.innerHTML = `<li class="none">${L.filter === "unread" ? "No unread messages." : L.filter === "groups" ? "No groups yet. Tap + to create one." : "No conversations yet. Add friends from People, then say hi."}</li>`;
    return;
  }
  ul.innerHTML = list.map(c => {
    const active = C.chat && C.chat.type === c.type && C.chat.id === c.id;
    const time = c.ts ? (sameDay(c.ts) ? timeOf(c.ts) : timeAgo(c.ts)) : "";
    return `<li class="conv-row${active ? " active" : ""}${c.pinned ? " pinned" : ""}" data-type="${c.type}" data-id="${esc(c.id)}" data-uid="${esc(c.uid || "")}" data-name="${esc(c.name)}" data-key="${esc(c.key)}">
      ${c.avatar}
      <div class="conv-main">
        <div class="conv-top"><b class="conv-name">${esc(c.name)}</b><span class="conv-time">${esc(time)}</span></div>
        <div class="conv-bottom"><span class="conv-preview">${esc(previewText(c))}</span>
          ${c.unread ? `<span class="badge${c.muted ? " muted" : ""}">${c.unread > 99 ? "99+" : c.unread}</span>` : ""}
          ${c.muted ? `<span class="conv-ico" title="Muted (local)">${icon("mute")}</span>` : ""}
          ${c.pinned ? `<span class="conv-ico pin" title="Pinned">${icon("pin")}</span>` : ""}
        </div>
      </div>
    </li>`;
  }).join("");
}

function onConvClick(e) {
  const row = e.target.closest(".conv-row");
  if (!row) return;
  if (row.dataset.type === "dm") openDm(row.dataset.uid);
  else openGroup(row.dataset.id, row.dataset.name);
}

function onConvContext(e) {
  const row = e.target.closest(".conv-row");
  if (!row) return;
  e.preventDefault();
  const key = row.dataset.key;
  const pinned = isPinned(key), muted = isMuted(key);
  const choice = window.confirm(`${pinned ? "Unpin" : "Pin"} this conversation? (OK = ${pinned ? "unpin" : "pin"}, Cancel = mute toggle: currently ${muted ? "muted" : "unmuted"})`);
  // Simple two-action menu via confirm: OK toggles pin, Cancel toggles mute.
  if (choice) { togglePin(key); playSound("click"); }
  else { toggleMute(key); playSound("click"); toast(muted ? "Unmuted (local)" : "Muted (local — notifications still arrive)"); }
  renderConvList();
}

const sameDay = ts => new Date(Number(ts)).toDateString() === new Date().toDateString();

// ---------------------------------------------------------------------------
// Composer area (rebuilt in place; IDs kept stable)
// ---------------------------------------------------------------------------
function buildComposerArea() {
  const composer = $("#composer");
  if (!composer || composer.dataset.v9) return;
  // Insert media-preview + recording bar above the composer form.
  const chatBox = $("#chatBox");
  const preview = document.createElement("div");
  preview.id = "mediaPreview";
  preview.className = "media-preview hidden";
  const recBar = document.createElement("div");
  recBar.id = "recBar";
  recBar.className = "rec-bar hidden";
  recBar.innerHTML = `<span class="rec-dot"></span><span id="recTime">0:00</span>
    <span class="rec-wave"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>
    <span class="rec-hint">Release to send · slide left to cancel</span>
    <button class="btn sm ghost" id="recCancel" type="button">Cancel</button>`;
  chatBox.insertBefore(preview, composer);
  chatBox.insertBefore(recBar, composer);

  composer.innerHTML = `
    <button class="icon-btn attach-btn" id="attachBtn" type="button" title="Attach photo, video, audio or file" aria-label="Attach">${icon("paperclip")}</button>
    <div class="attach-menu hidden" id="attachMenu" role="menu">
      <button type="button" data-attach="image">${icon("image")}<span>Photo</span></button>
      <button type="button" data-attach="video">${icon("film")}<span>Video</span></button>
      <button type="button" data-attach="audio">${icon("music")}<span>Audio</span></button>
      <button type="button" data-attach="file">${icon("copy")}<span>File</span></button>
    </div>
    <button class="icon-btn" id="emojiBtn" type="button" title="Emoji" aria-label="Emoji">${icon("smile")}</button>
    <div class="emoji-panel hidden" id="emojiPanel">${EMOJI_PICKER.map(e => `<button type="button" data-emoji="${e}">${e}</button>`).join("")}</div>
    <textarea id="msgInput" rows="1" placeholder="Write a message" maxlength="${MAX_LEN}" autocomplete="off"></textarea>
    <span class="char-count hidden" id="charCount"></span>
    <button class="icon-btn mic-btn" id="micBtn" type="button" title="Hold to record a voice note" aria-label="Hold to record voice note">${icon("mic")}</button>
    <button class="btn btn-primary" id="sendBtn" type="submit">${icon("send")}<span>Send</span></button>
    <input type="file" id="chatFile" hidden>
  `;
  composer.dataset.v9 = "1";
  wireComposer();
}

function wireComposer() {
  const input = $("#msgInput");
  const sendBtn = $("#sendBtn");
  input.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(e); }
  });
  input.addEventListener("input", () => {
    const n = input.value.length;
    const cc = $("#charCount");
    cc.textContent = `${n}/${MAX_LEN}`;
    cc.classList.toggle("hidden", n === 0);
    cc.classList.toggle("near", n > MAX_LEN - 100);
    autoGrow(input);
  });
  $("#attachBtn").addEventListener("click", e => { e.stopPropagation(); $("#attachMenu").classList.toggle("hidden"); $("#emojiPanel").classList.add("hidden"); });
  $("#attachMenu").addEventListener("click", e => {
    const opt = e.target.closest("[data-attach]");
    if (!opt) return;
    const kind = opt.dataset.attach;
    $("#attachMenu").classList.add("hidden");
    const f = $("#chatFile");
    f.accept = ACCEPT_FOR[kind] || "";
    f.dataset.kind = kind;
    f.value = "";
    f.click();
  });
  $("#chatFile").addEventListener("change", onFilePicked);
  $("#emojiBtn").addEventListener("click", e => { e.stopPropagation(); $("#emojiPanel").classList.toggle("hidden"); $("#attachMenu").classList.add("hidden"); });
  $("#emojiPanel").addEventListener("click", e => {
    const b = e.target.closest("[data-emoji]");
    if (!b) return;
    insertAtCursor(input, b.dataset.emoji);
    input.focus();
  });
  document.addEventListener("click", () => { $("#attachMenu").classList.add("hidden"); $("#emojiPanel").classList.add("hidden"); });
  // Voice: hold to record
  const mic = $("#micBtn");
  mic.addEventListener("pointerdown", startVoice);
  $("#recCancel").addEventListener("click", () => { if (rec) rec.cancelled = true; stopVoice(true); });
  $("#mediaPreview").addEventListener("click", e => {
    if (e.target.closest("#previewCancel")) { clearPendingFile(); }
    if (e.target.closest("#previewSend")) { sendPendingFile(); }
  });
  $("#composer").addEventListener("submit", sendText);
  sendBtn.disabled = false;
}

function autoGrow(el) {
  el.style.height = "auto";
  el.style.height = clamp(el.scrollHeight, 24, 120) + "px";
}

function insertAtCursor(el, text) {
  const s = el.selectionStart ?? el.value.length;
  const e = el.selectionEnd ?? el.value.length;
  el.value = el.value.slice(0, s) + text + el.value.slice(e);
  el.selectionStart = el.selectionEnd = s + text.length;
  el.dispatchEvent(new Event("input"));
}

// ---------------------------------------------------------------------------
// Voice recording (MediaRecorder) — uploads as type:"voice"
// ---------------------------------------------------------------------------
async function startVoice(e) {
  if (rec || C.sending) return;
  if (!C.chat) return toast("Open a conversation first.");
  e.preventDefault();
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    return toast(errMsg(err) || "Microphone access is needed for voice notes.");
  }
  const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "";
  const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks = [];
  recorder.ondataavailable = ev => { if (ev.data.size) chunks.push(ev.data); };
  recorder.onstop = () => finishVoice(chunks, recorder.mimeType || "audio/webm");
  rec = { recorder, stream, chunks, timer: null, startX: e.clientX, startY: e.clientY, cancelled: false, seconds: 0 };
  recorder.start();
  $("#recBar").classList.remove("hidden");
  $("#composer").classList.add("recording");
  rec.timer = setInterval(() => {
    rec.seconds++;
    if (rec.seconds > 600) stopVoice(false); // 10 min cap
    $("#recTime").textContent = `${Math.floor(rec.seconds / 60)}:${String(rec.seconds % 60).padStart(2, "0")}`;
  }, 1000);
  window.addEventListener("pointermove", onRecMove);
  window.addEventListener("pointerup", onRecUp, { once: true });
}

function onRecMove(e) {
  if (!rec) return;
  if (rec.startX - e.clientX > 70) { rec.cancelled = true; stopVoice(true); }
}

function onRecUp() {
  if (!rec) return;
  window.removeEventListener("pointermove", onRecMove);
  stopVoice(false);
}

function stopVoice(cancelled) {
  if (!rec) return;
  const r = rec;
  rec = null;
  clearInterval(r.timer);
  window.removeEventListener("pointermove", onRecMove);
  try { r.recorder.stop(); } catch {}
  r.stream.getTracks().forEach(t => t.stop());
  $("#recBar").classList.add("hidden");
  $("#composer").classList.remove("recording");
  if (cancelled || r.cancelled || r.seconds < 1) { r.chunks.length = 0; toast(r.seconds < 1 && !cancelled ? "Hold a little longer to record." : "Voice note cancelled."); }
}

async function finishVoice(chunks, mime) {
  if (!chunks.length || !C.chat) return;
  const blob = new Blob(chunks, { type: mime });
  const file = new File([blob], `voice-${Date.now()}.webm`, { type: mime });
  const replyTo = C.replyTo;
  const btn = $("#sendBtn");
  busy(btn, true, "Sending");
  C.sending = true;
  try {
    const sent = await fb.uploadFile(`chatfiles/${L.me}`, file, pct => { $("#chatProg").classList.remove("hidden"); $("#chatProg").firstElementChild.style.width = `${Math.round(pct * 100)}%`; });
    await fb.sendChatMessage(C.chat, { type: "voice", fileURL: sent.url, filePath: sent.path, fileName: file.name, fileSize: file.size, fileType: file.type, replyTo }, ctx.me());
    setReply(null);
    playSound("send");
  } catch (err) {
    if (replyTo) setReply(replyTo);
    toast(errMsg(err));
  } finally {
    C.sending = false;
    busy(btn, false);
    $("#chatProg").classList.add("hidden");
  }
}

// ---------------------------------------------------------------------------
// File attachments: pick → preview → send (with progress)
// ---------------------------------------------------------------------------
async function onFilePicked(e) {
  const file = e.target.files[0];
  const kind = e.target.dataset.kind || kindOf(file);
  e.target.value = "";
  if (!file || !C.chat) return;
  // Images are resized first in prepareUpload, so skip the pre-size check (a large raw photo may
  // still shrink under the limit). Non-images are validated up front.
  if (kind !== "image") {
    try { validateFile(file, kind); } catch (err) { return toast(err.message); }
  }
  let previewUrl = "";
  if (kind === "image") previewUrl = URL.createObjectURL(file);
  pendingFile = { file, kind, previewUrl };
  renderPreview();
}

function renderPreview() {
  const box = $("#mediaPreview");
  if (!pendingFile) { box.classList.add("hidden"); box.innerHTML = ""; return; }
  const { file, kind, previewUrl } = pendingFile;
  const thumb = kind === "image" && previewUrl
    ? `<img src="${esc(previewUrl)}" alt="">`
    : `<span class="prev-ico">${icon({ image: "image", video: "film", audio: "music" }[kind] || "copy")}</span>`;
  box.innerHTML = `<div class="prev-card">${thumb}
    <div class="prev-meta"><b>${esc(file.name)}</b><small>${KIND_LABEL[kind] || "File"} · ${(file.size / 1048576).toFixed(1)} MB</small></div>
    <button class="icon-btn" id="previewCancel" type="button" title="Remove" aria-label="Remove attachment">${icon("x")}</button>
    <button class="btn sm btn-primary" id="previewSend" type="button">Send</button>
  </div>`;
  box.classList.remove("hidden");
}

function clearPendingFile() {
  if (pendingFile?.previewUrl) URL.revokeObjectURL(pendingFile.previewUrl);
  pendingFile = null;
  renderPreview();
}

async function sendPendingFile() {
  const pf = pendingFile;
  if (!pf || !C.chat) return;
  pendingFile = null;
  renderPreview();
  const replyTo = C.replyTo;
  const btn = $("#sendBtn");
  busy(btn, true, "Sending");
  C.sending = true;
  try {
    const ready = await prepareUpload(pf.file, pf.kind);
    $("#chatProg").classList.remove("hidden");
    $("#chatProg").firstElementChild.style.width = "0%";
    const sent = await fb.uploadFile(`chatfiles/${L.me}`, ready.file, pct => { $("#chatProg").firstElementChild.style.width = `${Math.round(pct * 100)}%`; });
    await fb.sendChatMessage(C.chat, {
      type: ready.kind,
      fileURL: sent.url,
      filePath: sent.path,
      fileName: pf.file.name,
      fileSize: ready.file.size,
      fileType: ready.file.type,
      replyTo
    }, ctx.me());
    setReply(null);
    playSound("send");
  } catch (err) {
    if (replyTo) setReply(replyTo);
    toast(errMsg(err));
  } finally {
    C.sending = false;
    busy(btn, false);
    $("#chatProg").classList.add("hidden");
  }
}

// ---------------------------------------------------------------------------
// Static wiring (header, messages, dialogs, back, search)
// ---------------------------------------------------------------------------
function wireStatic() {
  $("#backBtn").addEventListener("click", () => {
    if (rec) { rec.cancelled = true; stopVoice(true); }
    clearPendingFile();
    setActiveRoom(null);
    $("#chats").classList.remove("chatting");
    closeSubs();
    Object.assign(C, { chat: null, group: null, msgs: [], reacts: {}, seen: new Set(), first: true, replyTo: null, openId: null, query: "" });
    $("#chatBox").classList.add("hidden");
    $("#emptyChat").classList.remove("hidden");
    renderConvList();
  });
  $("#chatActs").addEventListener("click", e => {
    const call = e.target.closest("[data-call]");
    if (call) return callFromChat(call.dataset.call);
    const head = e.target.closest("[data-head]");
    if (head) { if (head.dataset.head === "search") toggleSearch(); else headAction(); return; }
    if (e.target.closest("#headMore")) toggleHeadMenu();
  });
  // Add the "more" button to the header actions (pin/mute local).
  const acts = $("#chatActs");
  if (acts && !$("#headMore")) {
    const more = document.createElement("button");
    more.className = "icon-btn";
    more.id = "headMore";
    more.type = "button";
    more.title = "More";
    more.setAttribute("aria-label", "More options");
    more.innerHTML = icon("more");
    acts.appendChild(more);
    const menu = document.createElement("div");
    menu.id = "headMenu";
    menu.className = "head-menu hidden";
    menu.innerHTML = `<button type="button" data-hm="pin">${icon("pin")}<span>Pin/unpin</span></button>
      <button type="button" data-hm="mute">${icon("mute")}<span>Mute/unmute (local)</span></button>`;
    acts.parentElement.appendChild(menu);
    menu.addEventListener("click", e => {
      const b = e.target.closest("[data-hm]");
      if (!b || !C.chat) return;
      const key = C.chat.type === "dm" ? `dm:${C.chat.id}` : `group:${C.chat.id}`;
      if (b.dataset.hm === "pin") { togglePin(key); toast(isPinned(key) ? "Pinned" : "Unpinned"); }
      else { toggleMute(key); toast(isMuted(key) ? "Muted (local — notifications still arrive)" : "Unmuted"); }
      menu.classList.add("hidden");
      renderConvList();
      playSound("click");
    });
    document.addEventListener("click", e => { if (!e.target.closest("#headMore") && !e.target.closest("#headMenu")) $("#headMenu")?.classList.add("hidden"); });
  }
  $("#chatHeadInfo").addEventListener("click", headAction);
  $("#msgs").addEventListener("click", onMessageClick);
  $("#msgs").addEventListener("contextmenu", e => {
    const row = e.target.closest(".msg");
    if (!row) return;
    e.preventDefault();
    C.openId = row.dataset.id;
    paint();
  });
  $("#replyCancel").addEventListener("click", () => setReply(null));
  $("#chatSearchInput").addEventListener("input", e => { C.query = e.target.value.trim().toLowerCase(); paint(); });
  $("#gForm").addEventListener("submit", createFromForm);
  $("#infoAdd").addEventListener("click", addMemberFromInfo);
  $("#infoLeave").addEventListener("click", leaveCurrentGroup);
  $("#infoBody").addEventListener("click", e => {
    const row = e.target.closest("[data-user]");
    if (!row) return;
    $("#dlgInfo").close();
    ctx.openUser(row.dataset.user);
  });
}

function toggleHeadMenu() { $("#headMenu").classList.toggle("hidden"); }

// ---------------------------------------------------------------------------
// Opening a conversation
// ---------------------------------------------------------------------------
function closeSubs() { C.unsubs?.forEach(off => off()); C.unsubs = []; }

function openChat(chat) {
  closeSubs();
  C.unsubs = [];
  Object.assign(C, { chat, group: null, msgs: [], reacts: {}, seen: new Set(), first: true, replyTo: null, openId: null, query: "", sending: false });
  $("#chatSearchInput").value = "";
  $("#chatSearch").classList.add("hidden");
  setReply(null);
  clearPendingFile();
  const roomKey = chat.type === "dm" ? `dm:${chat.id}` : `group:${chat.id}`;
  setActiveRoom(roomKey);
  markRead(roomKey);
  $("#emptyChat").classList.add("hidden");
  $("#chatBox").classList.remove("hidden");
  $("#chats").classList.add("chatting");
  $("#msgs").innerHTML = `<div class="skeleton"><span></span><span></span><span></span></div>`;
  renderHead();
  renderConvList();
  const onError = err => toast(errMsg(err));
  C.unsubs.push(
    chat.type === "dm"
      ? fb.watchMessages(chat, list => renderList(list), onError)
      : fb.watchGroupMessages(chat.id, list => renderList(list), onError)
  );
  C.unsubs.push(fb.watchReactions(chat, reacts => { C.reacts = reacts; paint(); }, onError));
  if (chat.type === "group") {
    C.unsubs.push(fb.watchGroup(chat.id, group => { C.group = group; renderHead(); }, onError));
  }
}

function renderList(list) { C.msgs = list; paint(); }

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------
function renderHead() {
  const chat = C.chat;
  if (!chat) return;
  const info = $('[data-head="info"]');
  if (chat.type === "dm") {
    const profile = ctx.byUid(chat.uid) || { displayName: chat.name, emarniId: "" };
    $("#chatAv").innerHTML = avatarHTML(profile);
    $("#chatName").textContent = profile.displayName;
    // No last-seen / presence API in firebase.js — show the honest EMARNI ID instead.
    $("#chatSub").textContent = profile.emarniId ? `EMARNI ID: ${profile.emarniId}` : (profile.status || "");
    if (info) { info.innerHTML = icon("user"); info.title = "View profile"; }
  } else {
    const color = C.group?.color || ctx.groupColor(chat.id);
    const count = Object.keys(C.group?.members || {}).length;
    $("#chatAv").innerHTML = `<span class="av" style="--ring:${esc(color)}"><span>${esc(initials(chat.name))}</span></span>`;
    $("#chatName").textContent = C.group?.name || chat.name;
    $("#chatSub").textContent = count ? `${count} member${count === 1 ? "" : "s"}` : "Group";
    if (info) { info.innerHTML = icon("info"); info.title = "Group info"; }
  }
}

function headAction() {
  const chat = C.chat;
  if (!chat) return;
  if (chat.type === "dm") return ctx.openUser(chat.uid);
  openInfo();
}

// Call handoff: dispatch a CustomEvent (S4/S1 may listen) AND call startCall directly so calls
// keep working in the current shell. call.js startCall guards against double-start.
function callFromChat(type) {
  const chat = C.chat;
  if (!chat) return;
  let targets, title;
  if (chat.type === "dm") { targets = [chat.uid]; title = ctx.byUid(chat.uid)?.displayName || chat.name; }
  else {
    targets = Object.keys(C.group?.members || {}).filter(uid => uid !== L.me);
    title = C.group?.name || chat.name;
    if (!targets.length) return toast("Add members to the group first.");
  }
  const detail = { type, targets, title, video: type === "video", targetUid: targets[0] };
  window.dispatchEvent(new CustomEvent("emarni:start-call", { detail }));
  startCall({ type, targets, title });
}

// ---------------------------------------------------------------------------
// Message painting
// ---------------------------------------------------------------------------
function dayLabel(ts) {
  const d = new Date(Number(ts) || Date.now());
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

function fmtSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

function matches(m) {
  return [m.text, m.fileName, m.senderName].some(v => String(v || "").toLowerCase().includes(C.query));
}

function paint() {
  const box = $("#msgs");
  const chat = C.chat;
  if (!chat) return;
  const me = L.me;
  const stick = box.scrollHeight - box.scrollTop - box.clientHeight < 160;
  if (!C.msgs.length) {
    box.innerHTML = `<div class="empty-msgs">No messages yet. Say hi, or send a photo, voice note or file.</div>`;
  } else {
    const list = C.query ? C.msgs.filter(matches) : C.msgs;
    if (!list.length) {
      box.innerHTML = `<div class="empty-msgs">No message matches "${esc(C.query)}".</div>`;
    } else {
      let html = "";
      let day = "";
      list.forEach(m => {
        const label = dayLabel(m.createdAt);
        if (label !== day) { html += `<div class="day-sep"><span>${esc(label)}</span></div>`; day = label; }
        const fresh = !C.first && !C.seen.has(m.id) && !reduceMotion() ? " fresh" : "";
        html += bubble(m, me, chat.type === "group", fresh);
      });
      box.innerHTML = html;
    }
  }
  C.msgs.forEach(m => C.seen.add(m.id));
  C.first = false;
  if (stick || C.msgs.at(-1)?.uid === me) box.scrollTop = box.scrollHeight;
}

function displayRx(kind) { return LEGACY_RX[kind] || kind; }

function mediaHTML(m) {
  if (!m.fileURL) return "";
  const url = esc(m.fileURL);
  if (m.type === "voice") return voiceHTML(m);
  if (m.type === "image") return `<a href="${url}" target="_blank" rel="noopener"><img class="media img" loading="lazy" alt="" src="${url}"></a>`;
  if (m.type === "video") return `<video class="media" controls playsinline preload="metadata" src="${url}"></video>`;
  if (m.type === "audio") return `<audio class="media aud" controls preload="metadata" src="${url}"></audio>`;
  return `<a class="file" href="${url}" target="_blank" rel="noopener">${icon("copy")}<span><b>${esc(m.fileName || "File")}</b><small>${fmtSize(m.fileSize)}</small></span></a>`;
}

// Custom voice-note player: play/pause + progress + duration (from audio metadata).
// Play/pause glyphs are unicode media symbols (no "play" icon in the frozen icon set).
function voiceHTML(m) {
  return `<div class="voice" data-voice="${esc(m.id)}" data-src="${esc(m.fileURL)}">
    <button class="voice-play icon-btn" type="button" aria-label="Play voice note">▶</button>
    <div class="voice-bar"><i class="voice-fill" style="width:0%"></i></div>
    <span class="voice-time">0:00</span>
    <audio preload="metadata" src="${esc(m.fileURL)}"></audio>
  </div>`;
}

function bubble(m, me, isGroup, fresh) {
  const mine = m.uid === me;
  const reacts = C.reacts[m.id] || {};
  const chips = Object.entries(reacts)
    .reduce((acc, [uid, kind]) => { const k = displayRx(kind); acc[k] = (acc[k] || 0) + 1; if (uid === me) acc._mine = k; return acc; }, { _mine: null });
  const chipHTML = Object.entries(chips).filter(([k]) => k !== "_mine")
    .map(([k, n]) => `<button class="rx${chips._mine === k ? " on" : ""}" type="button" data-rx="${esc(k)}">${esc(k)}<b>${n > 1 ? n : ""}</b></button>`).join("");
  const bar = REACT_EMOJI.map(k => `<button type="button" data-rx-add="${esc(k)}" aria-label="React ${k}">${esc(k)}</button>`).join("");
  const sender = !mine && isGroup ? `<small class="sender" style="color:var(--accent)">${esc(m.senderName || "Member")}</small>` : "";
  const quote = m.replyTo
    ? `<div class="quote"><b>${esc(m.replyTo.name || "Message")}</b><span>${esc(m.replyTo.text || "")}</span></div>` : "";
  const copyBtn = m.text ? `<button type="button" data-act="copy">Copy</button>` : "";
  const own = mine ? `<button type="button" data-act="del">${icon("trash")} Delete</button>` : `<button type="button" data-act="rep">${icon("flag")} Report</button>`;
  return `<div class="msg${mine ? " mine" : ""}${fresh}${m.id === C.openId ? " open" : ""}" data-id="${esc(m.id)}">
    ${sender}${quote}${mediaHTML(m)}
    ${m.text ? `<p class="txt">${esc(m.text)}</p>` : ""}
    <div class="meta-row">${chipHTML}<time>${timeOf(m.createdAt)}</time></div>
    <div class="act">
      ${copyBtn}
      <button type="button" data-act="reply">${icon("reply")} Reply</button>
      <span class="rx-bar">${bar}</span>
      ${own}
    </div>
  </div>`;
}

// ---------------------------------------------------------------------------
// Message interactions
// ---------------------------------------------------------------------------
let voiceState = null; // { audio, fill, time, playing }

function onMessageClick(e) {
  // Voice note play/pause
  const voice = e.target.closest(".voice");
  if (voice) { toggleVoice(voice); return; }
  const row = e.target.closest(".msg");
  if (!row) return;
  const msg = C.msgs.find(m => m.id === row.dataset.id);
  if (!msg) return;
  const rx = e.target.closest("[data-rx], [data-rx-add]");
  if (rx) {
    const kind = rx.dataset.rxAdd || rx.dataset.rx;
    const mine = (C.reacts[msg.id] || {})[L.me];
    const mineDisplay = displayRx(mine);
    applyReaction(msg, mineDisplay === kind ? null : kind);
    return;
  }
  const act = e.target.closest("[data-act]");
  if (act) { messageAction(act.dataset.act, msg); return; }
  C.openId = C.openId === msg.id ? null : msg.id;
  paint();
}

function toggleVoice(voiceEl) {
  const audio = voiceEl.querySelector("audio");
  const fill = voiceEl.querySelector(".voice-fill");
  const time = voiceEl.querySelector(".voice-time");
  const btn = voiceEl.querySelector(".voice-play");
  if (voiceState && voiceState.audio !== audio) { voiceState.audio.pause(); voiceState = null; }
  if (audio.paused) {
    audio.play().catch(() => toast("Could not play this voice note."));
    voiceState = { audio, fill, time, playing: true };
    btn.textContent = "❚❚";
  } else {
    audio.pause();
    voiceState = null;
    btn.textContent = "▶";
  }
  audio.ontimeupdate = () => {
    const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
    fill.style.width = `${pct}%`;
    const s = Math.floor(audio.currentTime);
    time.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  audio.onloadedmetadata = () => {
    const s = Math.floor(audio.duration || 0);
    time.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  audio.onended = () => { fill.style.width = "0%"; voiceState = null; btn.textContent = "▶"; };
}

function applyReaction(msg, kind) {
  // kind is a display emoji; store it directly (setReaction accepts any string).
  fb.setReaction(C.chat, msg.id, kind).catch(err => toast(errMsg(err)));
  if (kind) playSound("reaction");
}

async function messageAction(action, msg) {
  const chat = C.chat;
  if (action === "copy") {
    try { await navigator.clipboard.writeText(msg.text || ""); toast("Copied"); } catch { toast("Could not copy"); }
    return;
  }
  if (action === "reply") {
    setReply({ id: msg.id, name: msg.uid === L.me ? "You" : msg.senderName || "Member", text: (msg.text || msg.fileName || "Attachment").slice(0, 120) });
    $("#msgInput").focus();
    C.openId = null;
    paint();
    return;
  }
  if (action === "del") {
    if (!confirm("Delete this message? A safety copy stays with admins for 30 days.")) return;
    try {
      if (chat.type === "dm") await fb.deleteMessage(chat, msg.id);
      else await fb.deleteGroupMessage(chat.id, msg);
      playSound("click");
    } catch (err) { toast(errMsg(err)); }
    return;
  }
  if (action === "rep") {
    const reason = await askText({ title: "Report message", placeholder: "Why are you reporting this?", okText: "Report" });
    if (!reason) return;
    try {
      if (chat.type === "dm") await fb.reportMessage(chat, msg.id, reason);
      else await fb.reportGroupMessage(chat.id, msg, reason);
      toast("Report sent. Thank you.");
      playSound("confirm");
    } catch (err) { toast(errMsg(err)); }
  }
}

function setReply(target) {
  C.replyTo = target;
  $("#replyBar").classList.toggle("hidden", !target);
  $("#replyText").textContent = target ? `Replying to ${target.name}: ${target.text}` : "";
}

function toggleSearch() {
  const bar = $("#chatSearch");
  const open = bar.classList.toggle("hidden") === false;
  if (open) $("#chatSearchInput").focus();
  else { C.query = ""; $("#chatSearchInput").value = ""; paint(); }
}

// ---------------------------------------------------------------------------
// Sending text
// ---------------------------------------------------------------------------
async function sendText(e) {
  e.preventDefault();
  if (C.sending) return;
  const input = $("#msgInput");
  const text = input.value.trim();
  const chat = C.chat;
  if (!chat) return;
  if (!text && !pendingFile) return;
  if (pendingFile) { sendPendingFile(); if (!text) return; }
  if (!text) return;
  const replyTo = C.replyTo;
  input.value = "";
  $("#charCount").classList.add("hidden");
  input.style.height = "auto";
  setReply(null);
  const btn = $("#sendBtn");
  busy(btn, true, "Sending");
  C.sending = true;
  try {
    await fb.sendChatMessage(chat, { text, replyTo }, ctx.me());
    playSound("send");
  } catch (err) {
    input.value = text;
    if (replyTo) setReply(replyTo);
    toast(errMsg(err));
  } finally {
    C.sending = false;
    busy(btn, false);
  }
}

// ---------------------------------------------------------------------------
// Group create / info
// ---------------------------------------------------------------------------
async function createFromForm(e) {
  e.preventDefault();
  const name = $("#gName").value.trim();
  const color = $('input[name="gcolor"]:checked')?.value || COLORS[0];
  const uids = Array.from($("#gFriends").querySelectorAll("input:checked")).map(i => i.value);
  if (name.length < 2) return toast("Group name needs at least 2 characters");
  if (!uids.length) return toast("Pick at least one friend");
  const btn = $("#gCreate");
  busy(btn, true, "Creating");
  try {
    const gid = await fb.createGroup({ name, color, memberUids: uids });
    $("#dlgGroup").close();
    openGroup(gid, name);
    toast("Group created");
    playSound("confirm");
  } catch (err) {
    toast(errMsg(err));
  } finally {
    busy(btn, false);
  }
}

function openInfo() {
  const group = C.group;
  const chat = C.chat;
  if (!group || !chat) return;
  const members = group.members || {};
  $("#infoTitle").textContent = group.name || chat.name;
  $("#infoBody").innerHTML = Object.keys(members).map(uid => {
    const p = ctx.byUid(uid) || { displayName: "Emarni user", uid };
    const role = uid === group.createdBy ? "Creator" : (p.emarniId ? `ID ${p.emarniId}` : "Member");
    return `<li class="item" data-user="${esc(uid)}">${avatarHTML(p, "sm")}<div class="grow"><b>${esc(p.displayName)}</b><small>${esc(role)}</small></div></li>`;
  }).join("");
  const addable = (ctx.friends() || []).filter(p => !members[p.uid]);
  $("#infoAddSel").innerHTML = addable.length
    ? addable.map(p => `<option value="${esc(p.uid)}">${esc(p.displayName)}</option>`).join("")
    : `<option value="">No friends to add</option>`;
  $("#infoAdd").disabled = !addable.length;
  openDialog("#dlgInfo");
}

async function addMemberFromInfo() {
  const chat = C.chat, group = C.group, uid = $("#infoAddSel").value;
  if (!chat || !group || !uid) return;
  try {
    await fb.addGroupMembers(chat.id, { name: group.name, color: group.color || COLORS[0], uids: [uid] });
    toast("Member added");
    playSound("confirm");
    openInfo();
  } catch (err) { toast(errMsg(err)); }
}

async function leaveCurrentGroup() {
  const chat = C.chat;
  if (!chat || chat.type !== "group") return;
  if (!confirm("Leave this group? You will need to be re-added to return.")) return;
  try {
    await fb.leaveGroup(chat.id);
    $("#dlgInfo").close();
    closeSubs();
    Object.assign(C, { chat: null, group: null, msgs: [], reacts: {} });
    $("#chatBox").classList.add("hidden");
    $("#emptyChat").classList.remove("hidden");
    $("#chats").classList.remove("chatting");
    setActiveRoom(null);
    toast("You left the group");
    renderConvList();
  } catch (err) { toast(errMsg(err)); }
}
