// Chat panel: direct and group chats with photos, videos, voice notes, files, replies,
// reactions, in-chat search, delete, report, group management, and calls.
import * as fb from "./firebase.js";
import { $, esc, toast, busy, errMsg, avatarHTML, askText, timeOf, initials, COLORS, openDialog, shrinkImage } from "./ui.js";
import { icon } from "./icons.js";
import { startCall } from "./call.js";
import { kindOf, checkSize, prepareUpload } from "./media.js";
import { setActiveRoom, markRead } from "./notify.js";

const LIMIT = { image: 10, video: 50, audio: 20, file: 25 };
const REACTIONS = ["heart", "check", "sparkle"];

const C = {
  chat: null,
  group: null,
  msgs: [],
  reacts: {},
  unsubs: [],
  seen: new Set(),
  first: true,
  replyTo: null,
  openId: null,
  query: ""
};

let ctx = null;

// ctx: { me(), byUid(uid), friends(), groupColor(gid), openUser(uid) }
export function initChat(context) {
  ctx = context;
  $("#backBtn").addEventListener("click", () => {
    setActiveRoom(null);
    $("#chats").classList.remove("chatting");
  });
  $("#chatActs").addEventListener("click", event => {
    const call = event.target.closest("[data-call]");
    if (call) return callFromChat(call.dataset.call);
    const head = event.target.closest("[data-head]");
    if (!head) return;
    if (head.dataset.head === "search") return toggleSearch();
    headAction();
  });
  $("#chatHeadInfo").addEventListener("click", headAction);
  $("#msgs").addEventListener("click", onMessageClick);
  $("#composer").addEventListener("submit", sendText);
  $("#attachBtn").addEventListener("click", () => $("#chatFile").click());
  $("#chatFile").addEventListener("change", onFile);
  $("#replyCancel").addEventListener("click", () => setReply(null));
  $("#chatSearchInput").addEventListener("input", event => {
    C.query = event.target.value.trim().toLowerCase();
    paint();
  });
  $("#gForm").addEventListener("submit", createFromForm);
  $("#infoAdd").addEventListener("click", addMemberFromInfo);
  $("#infoLeave").addEventListener("click", leaveCurrentGroup);
  $("#infoBody").addEventListener("click", event => {
    const row = event.target.closest("[data-user]");
    if (!row) return;
    $("#dlgInfo").close();
    ctx.openUser(row.dataset.user);
  });
}

export function refreshChatHead() {
  renderHead();
}

export async function openDm(uid) {
  const profile = ctx.byUid(uid);
  if (!profile) return;
  try {
    const roomId = await fb.openPrivateChat(uid);
    openChat({ type: "dm", id: roomId, uid, name: profile.displayName });
  } catch (err) {
    toast(errMsg(err));
  }
}

export function openGroup(gid, name) {
  openChat({ type: "group", id: gid, name });
}

function closeSubs() {
  C.unsubs.forEach(off => off());
  C.unsubs = [];
}

function openChat(chat) {
  closeSubs();
  Object.assign(C, { chat, group: null, msgs: [], reacts: {}, seen: new Set(), first: true, replyTo: null, openId: null, query: "" });
  $("#chatSearchInput").value = "";
  $("#chatSearch").classList.add("hidden");
  setReply(null);
  const roomKey = chat.type === "dm" ? `dm:${chat.id}` : `group:${chat.id}`;
  setActiveRoom(roomKey);
  markRead(roomKey);
  $("#emptyChat").classList.add("hidden");
  $("#chatBox").classList.remove("hidden");
  $("#chats").classList.add("chatting");
  $("#msgs").innerHTML = `<div class="skeleton"><span></span><span></span><span></span></div>`;
  renderHead();

  const onError = err => toast(errMsg(err));
  C.unsubs.push(
    chat.type === "dm"
      ? fb.watchMessages(chat, list => renderList(list), onError)
      : fb.watchGroupMessages(chat.id, list => renderList(list), onError)
  );
  C.unsubs.push(
    fb.watchReactions(chat, reacts => {
      C.reacts = reacts;
      paint();
    }, onError)
  );
  if (chat.type === "group") {
    C.unsubs.push(
      fb.watchGroup(chat.id, group => {
        C.group = group;
        renderHead();
      }, onError)
    );
  }
}

function renderList(list) {
  C.msgs = list;
  paint();
}

// ---------- Header ----------
function renderHead() {
  const chat = C.chat;
  if (!chat) return;
  const info = $('[data-head="info"]');
  if (chat.type === "dm") {
    const profile = ctx.byUid(chat.uid) || { displayName: chat.name, emarniId: "" };
    $("#chatAv").innerHTML = avatarHTML(profile);
    $("#chatName").textContent = profile.displayName;
    $("#chatSub").textContent = profile.status || (profile.emarniId ? `ID ${profile.emarniId}` : "");
    info.innerHTML = icon("user");
    info.title = "View profile";
  } else {
    const color = ctx.groupColor(chat.id);
    const count = Object.keys(C.group?.members || {}).length;
    $("#chatAv").innerHTML = `<span class="av" style="--ring:${color}"><span>${esc(initials(chat.name))}</span></span>`;
    $("#chatName").textContent = chat.name;
    $("#chatSub").textContent = count ? `${count} member${count === 1 ? "" : "s"}` : "Group";
    info.innerHTML = icon("info");
    info.title = "Group info";
  }
}

// ---------- Painting messages ----------
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
  return [m.text, m.fileName, m.senderName].some(value => String(value || "").toLowerCase().includes(C.query));
}

function paint() {
  const box = $("#msgs");
  const chat = C.chat;
  if (!chat) return;
  const me = ctx.me().uid;
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
        if (label !== day) {
          html += `<div class="day-sep"><span>${esc(label)}</span></div>`;
          day = label;
        }
        const fresh = !C.first && !C.seen.has(m.id) ? " fresh" : "";
        html += bubble(m, me, chat.type === "group", fresh);
      });
      box.innerHTML = html;
    }
  }
  C.msgs.forEach(m => C.seen.add(m.id));
  C.first = false;
  if (stick || C.msgs.at(-1)?.uid === me) box.scrollTop = box.scrollHeight;
}

function mediaHTML(m) {
  if (!m.fileURL) return "";
  const url = esc(m.fileURL);
  if (m.type === "image") return `<a href="${url}" target="_blank" rel="noopener"><img class="media img" loading="lazy" alt="" src="${url}"></a>`;
  if (m.type === "video") return `<video class="media" controls playsinline preload="metadata" src="${url}"></video>`;
  if (m.type === "audio") return `<audio class="media aud" controls preload="metadata" src="${url}"></audio>`;
  return `<a class="file" href="${url}" target="_blank" rel="noopener">${icon("copy")}<span><b>${esc(m.fileName || "File")}</b><small>${fmtSize(m.fileSize)}</small></span></a>`;
}

function bubble(m, me, isGroup, fresh) {
  const mine = m.uid === me;
  const reacts = C.reacts[m.id] || {};
  const chips = REACTIONS
    .map(kind => ({ kind, n: Object.values(reacts).filter(v => v === kind).length, on: reacts[me] === kind }))
    .filter(r => r.n)
    .map(r => `<button class="rx${r.on ? " on" : ""}" type="button" data-rx="${r.kind}">${icon(r.kind)}<b>${r.n}</b></button>`)
    .join("");
  const bar = REACTIONS.map(kind => `<button type="button" data-rx-add="${kind}" aria-label="React ${kind}">${icon(kind)}</button>`).join("");
  const sender = !mine && isGroup ? `<small class="sender">${esc(m.senderName || "Member")}</small>` : "";
  const quote = m.replyTo
    ? `<div class="quote"><b>${esc(m.replyTo.name || "Message")}</b><span>${esc(m.replyTo.text || "")}</span></div>`
    : "";
  const own = mine
    ? `<button type="button" data-act="del">Delete</button>`
    : `<button type="button" data-act="rep">Report</button>`;
  return `<div class="msg${mine ? " mine" : ""}${fresh}${m.id === C.openId ? " open" : ""}" data-id="${esc(m.id)}">
    ${sender}${quote}${mediaHTML(m)}
    ${m.text ? `<p class="txt">${esc(m.text)}</p>` : ""}
    <div class="meta-row">${chips}<time>${timeOf(m.createdAt)}</time></div>
    <div class="act">
      <button type="button" data-act="reply">Reply</button>
      <span class="rx-bar">${bar}</span>
      ${own}
    </div>
  </div>`;
}

// ---------- Message interactions ----------
function onMessageClick(event) {
  const row = event.target.closest(".msg");
  if (!row) return;
  const msg = C.msgs.find(m => m.id === row.dataset.id);
  if (!msg) return;
  const rx = event.target.closest("[data-rx], [data-rx-add]");
  if (rx) {
    const kind = rx.dataset.rxAdd || rx.dataset.rx;
    const mine = (C.reacts[msg.id] || {})[ctx.me().uid];
    setReaction(msg, mine === kind ? null : kind);
    return;
  }
  const act = event.target.closest("[data-act]");
  if (act) {
    messageAction(act.dataset.act, msg);
    return;
  }
  C.openId = C.openId === msg.id ? null : msg.id;
  row.classList.toggle("open", C.openId === msg.id);
}

function setReaction(msg, kind) {
  fb.setReaction(C.chat, msg.id, kind).catch(err => toast(errMsg(err)));
}

async function messageAction(action, msg) {
  const chat = C.chat;
  if (action === "reply") {
    setReply({
      id: msg.id,
      name: msg.uid === ctx.me().uid ? "You" : msg.senderName || "Member",
      text: (msg.text || msg.fileName || "Attachment").slice(0, 120)
    });
    $("#msgInput").focus();
    return;
  }
  if (action === "del") {
    if (!confirm("Delete this message? A safety copy stays with admins for 30 days.")) return;
    try {
      if (chat.type === "dm") await fb.deleteMessage(chat, msg.id);
      else await fb.deleteGroupMessage(chat.id, msg);
    } catch (err) {
      toast(errMsg(err));
    }
    return;
  }
  if (action === "rep") {
    const reason = await askText({ title: "Report message", placeholder: "Why are you reporting this?", okText: "Report" });
    if (!reason) return;
    try {
      if (chat.type === "dm") await fb.reportMessage(chat, msg.id, reason);
      else await fb.reportGroupMessage(chat.id, msg, reason);
      toast("Report sent. Thank you.");
    } catch (err) {
      toast(errMsg(err));
    }
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
  if (open) {
    $("#chatSearchInput").focus();
  } else {
    C.query = "";
    $("#chatSearchInput").value = "";
    paint();
  }
}

// ---------- Sending ----------
async function sendText(event) {
  event.preventDefault();
  const input = $("#msgInput");
  const text = input.value.trim();
  const chat = C.chat;
  if (!chat || !text) return;
  const replyTo = C.replyTo;
  input.value = "";
  setReply(null);
  try {
    await fb.sendChatMessage(chat, { text, replyTo }, ctx.me());
  } catch (err) {
    input.value = text;
    if (replyTo) setReply(replyTo);
    toast(errMsg(err));
  }
}

async function onFile(event) {
  const file = event.target.files[0];
  event.target.value = "";
  const chat = C.chat;
  if (!file || !chat) return;
  const kind = kindOf(file);
  if (kind === "file" && file.size === 0) return toast("This file is empty");
  if (kind !== "image") {
    try {
      checkSize(file, kind);
    } catch (err) {
      return toast(errMsg(err));
    }
  }
  const bar = $("#chatProg");
  const btn = $("#attachBtn");
  const replyTo = C.replyTo;
  bar.classList.remove("hidden");
  bar.firstElementChild.style.width = "0%";
  btn.disabled = true;
  try {
    const ready = await prepareUpload(file, kind);
    const sent = await fb.uploadFile(`chatfiles/${ctx.me().uid}`, ready.file, pct => {
      bar.firstElementChild.style.width = `${Math.round(pct * 100)}%`;
    });
    await fb.sendChatMessage(
      chat,
      {
        type: kind,
        fileURL: sent.url,
        filePath: sent.path,
        fileName: file.name,
        fileSize: ready.file.size,
        fileType: ready.file.type,
        replyTo
      },
      ctx.me()
    );
    setReply(null);
  } catch (err) {
    toast(errMsg(err));
  } finally {
    bar.classList.add("hidden");
    btn.disabled = false;
  }
}

// ---------- Header actions ----------
function headAction() {
  const chat = C.chat;
  if (!chat) return;
  if (chat.type === "dm") return ctx.openUser(chat.uid);
  openInfo();
}

function callFromChat(type) {
  const chat = C.chat;
  if (!chat) return;
  if (chat.type === "dm") {
    startCall({ type, targets: [chat.uid], title: chat.name });
    return;
  }
  const targets = Object.keys(C.group?.members || {}).filter(uid => uid !== ctx.me().uid);
  if (!targets.length) return toast("Add members to the group first");
  startCall({ type, targets, title: chat.name });
}

// ---------- Group create ----------
export function openNewGroup() {
  $("#gForm").reset();
  $("#gColors").innerHTML = COLORS.map(
    (c, i) => `<label class="sw"><input type="radio" name="gcolor" value="${c}"${i === 0 ? " checked" : ""}><span style="background:${c}"></span></label>`
  ).join("");
  const friends = ctx.friends();
  $("#gFriends").innerHTML = friends.length
    ? friends
        .map(p => `<label class="pick"><input type="checkbox" value="${esc(p.uid)}">${avatarHTML(p, "xs")}<span>${esc(p.displayName)}</span></label>`)
        .join("")
    : `<p class="hint">Add friends first, then create a group.</p>`;
  openDialog("#dlgGroup");
}

async function createFromForm(event) {
  event.preventDefault();
  const name = $("#gName").value.trim();
  const color = $('input[name="gcolor"]:checked')?.value || COLORS[0];
  const uids = Array.from($("#gFriends").querySelectorAll("input:checked")).map(input => input.value);
  if (name.length < 2) return toast("Group name needs at least 2 characters");
  if (!uids.length) return toast("Pick at least one friend");
  const btn = $("#gCreate");
  busy(btn, true, "Creating");
  try {
    const gid = await fb.createGroup({ name, color, memberUids: uids });
    $("#dlgGroup").close();
    openGroup(gid, name);
    toast("Group created");
  } catch (err) {
    toast(errMsg(err));
  } finally {
    busy(btn, false);
  }
}

// ---------- Group info ----------
function openInfo() {
  const group = C.group;
  const chat = C.chat;
  if (!group || !chat) return;
  const members = group.members || {};
  $("#infoTitle").textContent = group.name || chat.name;
  $("#infoBody").innerHTML = Object.keys(members)
    .map(uid => {
      const p = ctx.byUid(uid) || { displayName: "Emarni user", uid };
      const role = uid === group.createdBy ? "Creator" : p.emarniId || "";
      return `<li class="item" data-user="${esc(uid)}">${avatarHTML(p, "sm")}<div class="grow"><b>${esc(p.displayName)}</b><small>${esc(role)}</small></div></li>`;
    })
    .join("");
  const addable = ctx.friends().filter(p => !members[p.uid]);
  $("#infoAddSel").innerHTML = addable.length
    ? addable.map(p => `<option value="${esc(p.uid)}">${esc(p.displayName)}</option>`).join("")
    : `<option value="">No friends to add</option>`;
  $("#infoAdd").disabled = !addable.length;
  openDialog("#dlgInfo");
}

async function addMemberFromInfo() {
  const chat = C.chat;
  const group = C.group;
  const uid = $("#infoAddSel").value;
  if (!chat || !group || !uid) return;
  try {
    await fb.addGroupMembers(chat.id, { name: group.name, color: group.color || COLORS[0], uids: [uid] });
    toast("Member added");
    openInfo();
  } catch (err) {
    toast(errMsg(err));
  }
}

async function leaveCurrentGroup() {
  const chat = C.chat;
  if (!chat || chat.type !== "group") return;
  if (!confirm("Leave this group?")) return;
  try {
    await fb.leaveGroup(chat.id);
    $("#dlgInfo").close();
    closeSubs();
    Object.assign(C, { chat: null, group: null, msgs: [], reacts: {} });
    $("#chatBox").classList.add("hidden");
    $("#emptyChat").classList.remove("hidden");
    $("#chats").classList.remove("chatting");
    toast("You left the group");
  } catch (err) {
    toast(errMsg(err));
  }
}
