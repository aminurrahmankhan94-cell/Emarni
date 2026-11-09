// People: search everyone by name or Emarni ID, open any profile with its posts,
// manage friend requests, message, call, and report.
import * as fb from "./firebase.js";
import { $, esc, toast, errMsg, avatarHTML, askText, posStyle, accentOf } from "./ui.js";
import { icon } from "./icons.js";
import { PostList } from "./feed.js";
import { openDm } from "./chat.js";
import { startCall } from "./call.js";
import { playSound } from "./sounds.js";

let ctx = null;
let viewing = null;
let posts = null;

// Buttons on a profile, by friendship state.
const ACTIONS = {
  friend: [["msg", "Message", "chat"], ["audio", "Audio call", "phone"], ["video", "Video call", "video"]],
  none: [["add", "Add friend", "userplus"]],
  sent: [["cancel", "Cancel request", "x"]],
  incoming: [["accept", "Accept", "check"], ["decline", "Decline", "x"]]
};

export function initPeople(context) {
  ctx = context;
  $("#peopleSearch").addEventListener("input", () => renderSearch());
  $("#peopleResults").addEventListener("click", onResultClick);
  $("#userBack").addEventListener("click", closeUser);
  $("#userCard").addEventListener("click", event => {
    const btn = event.target.closest("[data-act]");
    if (btn && viewing) act(btn.dataset.act, viewing);
  });
}

// Called whenever directory, friends, or requests change.
export function refreshPeople() {
  if (!ctx) return;
  renderSearch();
  if (viewing) renderUser();
}

export function renderSearch() {
  const q = $("#peopleSearch").value.trim().toLowerCase();
  $("#sideLists").classList.toggle("hidden", Boolean(q));
  $("#peopleResults").hidden = !q;
  if (!q) return;
  const me = ctx.me().uid;
  const upper = q.toUpperCase();
  const matches = Object.values(ctx.dir())
    .filter(p => p && p.uid && p.uid !== me)
    .filter(p => (p.displayName || "").toLowerCase().includes(q) || (p.emarniId || "").includes(upper))
    .sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""))
    .slice(0, 30);
  $("#peopleResults").innerHTML = matches.length
    ? matches.map(resultRow).join("")
    : `<li class="none">No one matches "${esc(q)}"</li>`;
}

function resultRow(p) {
  const rel = ctx.relation(p.uid);
  const buttons = {
    friend: `<button class="btn sm ghost" type="button" data-act="msg">Message</button>`,
    none: `<button class="btn sm" type="button" data-act="add">${icon("userplus")}Add</button>`,
    sent: `<button class="btn sm ghost" type="button" data-act="cancel">Requested</button>`,
    incoming: `<button class="btn sm" type="button" data-act="accept">Accept</button>`
  };
  return `<li class="item" data-uid="${esc(p.uid)}">
    ${avatarHTML(p, "sm")}
    <div class="grow"><b>${esc(p.displayName)}</b><small>${esc(p.emarniId)}${p.status ? " · " + esc(p.status) : ""}</small></div>
    ${buttons[rel] || ""}
  </li>`;
}

function onResultClick(event) {
  const row = event.target.closest("[data-uid]");
  if (!row) return;
  const btn = event.target.closest("[data-act]");
  if (btn) return act(btn.dataset.act, row.dataset.uid);
  openUser(row.dataset.uid);
}

async function act(action, uid) {
  const profile = ctx.author(uid);
  const name = profile?.displayName || "them";
  try {
    if (action === "msg") {
      closeUser();
      ctx.go("chats");
      await openDm(uid);
    } else if (action === "add") {
      await fb.sendFriendRequest(uid, ctx.me());
      playSound("requestSent");
      toast(`Friend request sent to ${name}`);
    } else if (action === "cancel") {
      await fb.cancelFriendRequest(uid);
      toast("Request cancelled");
    } else if (action === "accept" || action === "decline") {
      await fb.respondFriendRequest(uid, action === "accept");
      toast(action === "accept" ? `You are now friends with ${name}` : "Request declined");
    } else if (action === "audio" || action === "video") {
      closeUser();
      ctx.go("chats");
      await startCall({ type: action, targets: [uid], title: name });
    } else if (action === "report") {
      const reason = await askText({ title: `Report ${name}`, placeholder: "What happened?", okText: "Report" });
      if (!reason) return;
      await fb.reportUser(uid, reason);
      toast("User reported. Thank you.");
    }
  } catch (err) {
    toast(errMsg(err));
  }
}

export function openUser(uid) {
  if (!uid) return;
  if (uid === ctx.me().uid) return ctx.go("me");
  if (!ctx.author(uid)) return toast("Profile not found");
  viewing = uid;
  $("#userView").classList.add("open");
  renderUser();
  if (posts) posts.stop();
  posts = new PostList($("#userPosts"), { source: "user", uid, emptyText: "No posts yet." });
  posts.start();
}

export function closeUser() {
  $("#userView").classList.remove("open");
  viewing = null;
  if (posts) posts.stop();
  posts = null;
}

function renderUser() {
  const p = ctx.author(viewing);
  if (!p) return closeUser();
  const accent = accentOf(p);
  const rel = ctx.relation(viewing);
  const cover = p.coverURL
    ? `<img alt="" draggable="false" src="${esc(p.coverURL)}" style="${posStyle(p.coverPos)}">`
    : "";
  const bg = p.coverURL
    ? ""
    : `background:radial-gradient(circle at 20% 20%, ${accent}77, transparent 60%), linear-gradient(135deg, #0a0a0a, #3f0d0d)`;
  const actions = (ACTIONS[rel] || [])
    .map(([action, label, ic], i) => `<button class="btn${i ? " ghost" : ""}" type="button" data-act="${action}">${icon(ic)}${label}</button>`)
    .join("");
  $("#userCard").innerHTML = `
    <div class="pcover" style="${bg}">${cover}</div>
    <div class="pid">
      ${avatarHTML(p, "xl")}
      <div class="pnames">
        <h2>${esc(p.displayName)}</h2>
        ${p.status ? `<p class="pstatus">${esc(p.status)}</p>` : ""}
        <small>Emarni ID ${esc(p.emarniId)}</small>
      </div>
    </div>
    ${p.bio ? `<p class="pbio">${esc(p.bio)}</p>` : ""}
    <div class="uacts">${actions}<button class="btn ghost" type="button" data-act="report">${icon("flag")}Report</button></div>`;
}
