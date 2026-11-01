// Chat panel: direct messages and group chats, with delete, report, calls and group management.
import * as fb from "./firebase.js";
import { $, $$, esc, toast, busy, errMsg, avatarHTML, askText, timeOf, initials, COLORS, openDialog } from "./ui.js";
import { startCall } from "./call.js";

const C = {
  chat: null, // { type: "dm" | "group", id, uid?, name }
  group: null, // live group record (groups/{id})
  msgs: [],
  unsubs: [],
  seen: new Set(),
  first: true
};

let ctx = null;

// ctx: { me(), byUid(uid), friends() -> profiles, groupColor(gid) }
export function initChat(context) {
  ctx = context;

  $("#backBtn").addEventListener("click", () => $("#chats").classList.remove("chatting"));
  $("#chatActs").addEventListener("click", event => {
    const call = event.target.closest("[data-call]");
    if (call) return callFromChat(call.dataset.call);
    const head = event.target.closest("[data-head]");
    if (head) return headAction();
  });

  $("#msgs").addEventListener("click", onMessageAction);
  $("#composer").addEventListener("submit", sendFromComposer);

  $("#newGroup").addEventListener("click", openNewGroup);
  $("#gForm").addEventListener("submit", createFromForm);
  $("#infoAdd").addEventListener("click", addMemberFromInfo);
  $("#infoLeave").addEventListener("click", leaveCurrentGroup);
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
  C.chat = chat;
  C.group = null;
  C.msgs = [];
  C.seen = new Set();
  C.first = true;

  $("#emptyChat").classList.add("hidden");
  $("#chatBox").classList.remove("hidden");
  $("#chats").classList.add("chatting");
  $("#msgs").innerHTML = `<div class="skeleton"><span></span><span></span><span></span></div>`;
  renderHead();

  const onError = err => toast(errMsg(err));
  if (chat.type === "dm") {
    C.unsubs.push(fb.watchMessages(chat, renderMessages, onError));
  } else {
    C.unsubs.push(fb.watchGroupMessages(chat.id, renderMessages, onError));
    C.unsubs.push(
      fb.watchGroup(
        chat.id,
        group => {
          C.group = group;
          renderHead();
        },
        onError
      )
    );
  }
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
    info.textContent = "⚑";
    info.title = "Report user";
  } else {
    const color = ctx.groupColor(chat.id);
    const count = Object.keys(C.group?.members || {}).length;
    $("#chatAv").innerHTML = `<span class="av" style="--ring:${color}"><span>${esc(initials(chat.name))}</span></span>`;
    $("#chatName").textContent = chat.name;
    $("#chatSub").textContent = count ? `${count} member${count === 1 ? "" : "s"}` : "Group";
    info.textContent = "ⓘ";
    info.title = "Group info";
  }
}

// ---------- Messages ----------
function renderMessages(list) {
  const box = $("#msgs");
  const chat = C.chat;
  if (!chat) return;
  C.msgs = list;
  const me = ctx.me().uid;
  const stick = box.scrollHeight - box.scrollTop - box.clientHeight < 140;

  if (!list.length) {
    box.innerHTML = `<div class="empty-msgs">No messages yet. Say hi 👋</div>`;
  } else {
    box.innerHTML = list
      .map(m => {
        const mine = m.uid === me;
        const fresh = !C.first && !C.seen.has(m.id) ? " fresh" : "";
        const sender = !mine && chat.type === "group" ? `<small>${esc(m.senderName || "Member")}</small>` : "";
        const action = mine
          ? `<button type="button" data-act="del">Delete</button>`
          : `<button type="button" data-act="rep">Report</button>`;
        return `<div class="msg${mine ? " mine" : ""}${fresh}" data-id="${esc(m.id)}">
          ${sender}
          <span class="txt">${esc(m.text)}</span>
          <time>${timeOf(m.createdAt)}</time>
          <div class="act">${action}</div>
        </div>`;
      })
      .join("");
  }

  list.forEach(m => C.seen.add(m.id));
  C.first = false;
  if (stick || list.at(-1)?.uid === me) box.scrollTop = box.scrollHeight;
}

async function sendFromComposer(event) {
  event.preventDefault();
  const input = $("#msgInput");
  const text = input.value;
  const chat = C.chat;
  if (!chat || !text.trim()) return;
  input.value = "";
  try {
    if (chat.type === "dm") await fb.sendMessage(chat, text, ctx.me());
    else await fb.sendGroupMessage(chat.id, text, ctx.me());
  } catch (err) {
    input.value = text;
    toast(errMsg(err));
  }
}

async function onMessageAction(event) {
  const btn = event.target.closest("[data-act]");
  if (!btn || !C.chat) return;
  const id = btn.closest(".msg")?.dataset.id;
  const msg = C.msgs.find(item => item.id === id);
  if (!msg) return;
  const chat = C.chat;

  if (btn.dataset.act === "del") {
    if (!confirm("Delete this message? A safety copy stays with admins for 30 days.")) return;
    try {
      if (chat.type === "dm") await fb.deleteMessage(chat, id);
      else await fb.deleteGroupMessage(chat.id, msg);
    } catch (err) {
      toast(errMsg(err));
    }
    return;
  }

  if (btn.dataset.act === "rep") {
    const reason = await askText({ title: "Report message", placeholder: "Why are you reporting this?", okText: "Report" });
    if (!reason) return;
    try {
      if (chat.type === "dm") await fb.reportMessage(chat, id, reason);
      else await fb.reportGroupMessage(chat.id, msg, reason);
      toast("Report sent. Thank you.");
    } catch (err) {
      toast(errMsg(err));
    }
  }
}

// ---------- Calls and head actions ----------
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

async function headAction() {
  const chat = C.chat;
  if (!chat) return;
  if (chat.type === "dm") {
    const reason = await askText({ title: `Report ${chat.name}`, placeholder: "What happened?", okText: "Report" });
    if (!reason) return;
    try {
      await fb.reportUser(chat.uid, reason);
      toast("User reported. Thank you.");
    } catch (err) {
      toast(errMsg(err));
    }
    return;
  }
  openInfo();
}

// ---------- Group create ----------
function friendChoices() {
  return ctx.friends();
}

export function openNewGroup() {
  $("#gForm").reset();
  $("#gColors").innerHTML = COLORS.map(
    (c, i) => `<label class="sw"><input type="radio" name="gcolor" value="${c}"${i === 0 ? " checked" : ""}><span style="background:${c}"></span></label>`
  ).join("");
  const friends = friendChoices();
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
  const uids = $$("#gFriends input:checked").map(input => input.value);
  if (name.length < 2) return toast("Group name needs at least 2 characters");
  if (!uids.length) return toast("Pick at least one friend");
  const btn = $("#gCreate");
  busy(btn, true, "Creating…");
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
      const p = ctx.byUid(uid) || { displayName: "Emarni user" };
      const role = uid === group.createdBy ? "Creator" : p.emarniId || "";
      return `<li class="item">${avatarHTML(p, "sm")}<div class="grow"><b>${esc(p.displayName)}</b><small>${esc(role)}</small></div></li>`;
    })
    .join("");
  const addable = friendChoices().filter(p => !members[p.uid]);
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
    C.chat = null;
    C.group = null;
    $("#chatBox").classList.add("hidden");
    $("#emptyChat").classList.remove("hidden");
    $("#chats").classList.remove("chatting");
    toast("You left the group");
  } catch (err) {
    toast(errMsg(err));
  }
}
