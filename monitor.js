// Admin monitor: a read-only view of every direct and group conversation.
// Each open is written to the audit trail first; if logging fails, nothing is shown.
import * as fb from "./firebase.js";
import { $, esc, toast, errMsg, timeOf } from "./ui.js";
import { icon } from "./icons.js";
import { playSound } from "./sounds.js";

let ctx = null;
let items = [];
let loadedAt = 0;
let stopMessages = null;
let current = null;

export function initMonitor(context) {
  ctx = context;
  injectAdminLink();
  const search = $("#monSearch");
  if (search) search.addEventListener("input", paintList);
  const refresh = $("#monRefresh");
  if (refresh) refresh.addEventListener("click", load);
  const list = $("#monList");
  if (list) list.addEventListener("click", event => {
    const row = event.target.closest("[data-key]");
    if (row) { playSound("click"); openConvo(row.dataset.key); }
  });
  const close = $("#monClose");
  if (close) close.addEventListener("click", () => { playSound("close"); closeConvo(); });
}

// Link to the standalone admin page (admin.html) — injected because index.html is S1-owned.
function injectAdminLink() {
  const head = document.querySelector('[data-view="monitor"] .page-head');
  if (!head || head.querySelector(".mon-admin-link")) return;
  const wrap = document.createElement("div");
  wrap.style.display = "flex";
  wrap.style.gap = "8px";
  wrap.style.alignItems = "center";
  const existing = head.querySelector(".btn") || head.querySelector("button");
  const a = document.createElement("a");
  a.href = "admin.html";
  a.className = "btn ghost sm mon-admin-link";
  a.innerHTML = `${icon("shield")}Admin panel`;
  if (existing && existing.parentNode) {
    existing.parentNode.insertBefore(a, existing);
  } else {
    head.appendChild(a);
  }
}

export function onMonitorShow() {
  if (!ctx?.isAdmin()) return;
  if (!items.length || Date.now() - loadedAt > 5 * 60 * 1000) load();
}

const nameOf = uid => ctx.author(uid)?.displayName || "Emarni user";

async function load() {
  if (!ctx?.isAdmin()) return;
  $("#monList").innerHTML = `<li class="none">Loading conversations...</li>`;
  try {
    const uids = Object.values(ctx.dir()).map(p => p.uid).filter(Boolean);
    const dms = new Map();
    const groupIds = new Set();
    await Promise.all(
      uids.map(async uid => {
        const [friends, groups] = await Promise.all([fb.adminGetFriendships(uid), fb.adminGetUserGroups(uid)]);
        Object.entries(friends).forEach(([other, rel]) => {
          if (rel?.status === "accepted") dms.set([uid, other].sort().join("__"), [uid, other]);
        });
        Object.keys(groups).forEach(gid => groupIds.add(gid));
      })
    );
    const direct = [];
    dms.forEach(([a, b], id) => {
      direct.push({ key: `dm:${id}`, kind: "dm", id, title: `${nameOf(a)} and ${nameOf(b)}`, sub: "Direct" });
    });
    const groups = await Promise.all(
      [...groupIds].map(gid =>
        fb.adminGetGroup(gid).then(g =>
          g
            ? { key: `group:${gid}`, kind: "group", id: gid, title: g.name || "Group", sub: `${Object.keys(g.members || {}).length} members` }
            : null
        )
      )
    );
    items = direct.concat(groups.filter(Boolean)).sort((x, y) => x.title.localeCompare(y.title));
    loadedAt = Date.now();
    paintList();
  } catch (err) {
    $("#monList").innerHTML = "";
    toast(errMsg(err));
  }
}

function paintList() {
  const q = $("#monSearch").value.trim().toLowerCase();
  const rows = items.filter(item => !q || item.title.toLowerCase().includes(q));
  $("#monList").innerHTML = rows.length
    ? rows
        .map(
          item => `<li class="item mon-row${current === item.key ? " active" : ""}" data-key="${esc(item.key)}">
            <span class="mon-ic">${icon(item.kind === "group" ? "users" : "chat")}</span>
            <div class="grow"><b>${esc(item.title)}</b><small>${esc(item.sub)}</small></div>
          </li>`
        )
        .join("")
    : `<li class="none">${items.length ? "No conversations match." : "No conversations found yet."}</li>`;
}

async function openConvo(key) {
  const item = items.find(i => i.key === key);
  if (!item) return;
  closeConvo(true);
  const scope = item.kind === "group" ? "group" : "dm";
  try {
    await fb.logAdminOpen(scope, item.id);
  } catch {
    toast("Could not write the audit log, so this conversation was not opened.");
    return;
  }
  current = key;
  paintList();
  $("#monHead").classList.remove("hidden");
  $("#monTitle").textContent = item.title;
  $("#monMeta").textContent = item.kind === "group" ? `Group · ${item.sub}` : "Direct conversation";
  $("#monMsgs").innerHTML = `<div class="skeleton"><span></span><span></span><span></span></div>`;
  stopMessages = fb.watchRoomMessagesFor(scope, item.id, paintMessages, err => toast(errMsg(err)));
}

function closeConvo(silent) {
  if (stopMessages) stopMessages();
  stopMessages = null;
  current = null;
  if (silent === true) return;
  $("#monHead").classList.add("hidden");
  $("#monMsgs").innerHTML = `<p class="empty">Choose a conversation on the left.</p>`;
  paintList();
}

function paintMessages(msgs) {
  const box = $("#monMsgs");
  if (!msgs.length) {
    box.innerHTML = `<p class="empty">No messages in this conversation.</p>`;
    return;
  }
  box.innerHTML = msgs
    .map(m => {
      const who = m.senderName || nameOf(m.uid);
      const file = m.fileURL
        ? `<a class="mon-file" href="${esc(m.fileURL)}" target="_blank" rel="noopener">${icon("copy")}${esc(m.fileName || "file")}</a>`
        : "";
      return `<div class="mon-msg">
        <div class="mon-who"><b>${esc(who)}</b><small>${timeOf(m.createdAt)}</small></div>
        ${m.text ? `<p>${esc(m.text)}</p>` : ""}
        ${file}
      </div>`;
    })
    .join("");
  box.scrollTop = box.scrollHeight;
}
