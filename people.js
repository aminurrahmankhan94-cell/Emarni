// People: discovery grid (#peopleView), sidebar search fallback, friend requests,
// and other-user profile overlay (#userView). Own profile lives in profile.js (#meView).
import * as fb from "./firebase.js";
import { $, esc, toast, errMsg, avatarHTML, askText, posStyle, accentOf } from "./ui.js";
import { icon } from "./icons.js";
import { PostList } from "./feed.js";
import { openDm } from "./chat.js";
import { playSound } from "./sounds.js";

let ctx = null;
let viewing = null;
let posts = null;
let postCountOff = null;

export function initPeople(context) {
  ctx = context;
  // v8 sidebar search (inside chats view) — keep wired if present.
  $("#peopleSearch")?.addEventListener("input", renderSidebarSearch);
  $("#peopleResults")?.addEventListener("click", onSidebarClick);
  // v9 people discovery view.
  buildPeopleView();
  // Other-user profile overlay.
  $("#userBack")?.addEventListener("click", closeUser);
  $("#userCard")?.addEventListener("click", onUserCardClick);
}

export function refreshPeople() {
  if (!ctx) return;
  renderSidebarSearch();
  renderPeopleView();
  if (viewing) renderUser();
}

// ================= v9 PEOPLE DISCOVERY (#peopleView) =================
function buildPeopleView() {
  const host = $("#peopleView");
  if (!host) return;
  host.innerHTML = `<div class="people-wrap">
    <div class="people-search">
      ${icon("search")}
      <input type="search" id="pvSearch" placeholder="Search by name or EMARNI ID" autocomplete="off" maxlength="40">
    </div>
    <div class="people-sec-title" id="pvTitle">Suggested for you</div>
    <div class="people-grid" id="pvGrid"></div>
    <p class="people-empty hidden" id="pvEmpty"></p>
  </div>`;
  $("#pvSearch").addEventListener("input", renderPeopleView);
}

function renderPeopleView() {
  const grid = $("#pvGrid");
  const empty = $("#pvEmpty");
  const title = $("#pvTitle");
  if (!grid) return;
  const me = ctx.me();
  if (!me) return;
  const q = ($("#pvSearch")?.value || "").trim().toLowerCase();
  const upper = q.toUpperCase();
  const friends = new Set(ctx.friendIds());
  let list = Object.values(ctx.dir() || {})
    .filter(p => p && p.uid && p.uid !== me.uid);
  if (q) {
    list = list.filter(p => (p.displayName || "").toLowerCase().includes(q) || (p.emarniId || "").toUpperCase().includes(upper));
    if (title) title.textContent = `Results for “${esc(q)}”`;
  } else {
    // Default: non-friends first (suggestions), then friends.
    list = list.sort((a, b) => {
      const af = friends.has(a.uid) ? 1 : 0;
      const bf = friends.has(b.uid) ? 1 : 0;
      if (af !== bf) return af - bf;
      return (a.displayName || "").localeCompare(b.displayName || "");
    });
    if (title) title.textContent = "Suggested for you";
  }
  list = list.slice(0, 60);
  empty.hidden = list.length > 0;
  if (!list.length) {
    empty.textContent = q ? `No one matches “${q}”.` : "No people found.";
    grid.innerHTML = "";
    return;
  }
  grid.innerHTML = list.map(personCard).join("");
}

function personCard(p) {
  const rel = ctx.relation(p.uid);
  const btn = rel === "incoming"
    ? `<button class="btn sm btn-primary pc-action" type="button" data-act="accept">${icon("check")}Accept</button>
       <button class="btn sm ghost pc-action" type="button" data-act="decline">${icon("x")}Decline</button>`
    : rel === "sent"
      ? `<button class="btn sm ghost pc-action" type="button" data-act="cancel">${icon("check")}Request sent</button>`
      : rel === "friend"
        ? `<button class="btn sm ghost pc-action" type="button" data-act="msg">${icon("chat")}Message</button>`
        : `<button class="btn sm btn-primary pc-action" type="button" data-act="add">${icon("userplus")}Add friend</button>`;
  return `<div class="person-card" data-uid="${esc(p.uid)}">
    <div class="pc-avatar">${avatarHTML(p)}</div>
    <div class="pc-name">${esc(p.displayName || "Emarni user")}</div>
    <div class="pc-eid">${esc(p.emarniId || "")}</div>
    <div class="pc-bio">${esc(p.bio || p.status || "")}</div>
    ${btn}
  </div>`;
}

// ================= v8 SIDEBAR SEARCH (inside chats) =================
function renderSidebarSearch() {
  const input = $("#peopleSearch");
  const results = $("#peopleResults");
  if (!input || !results) return;
  const q = input.value.trim().toLowerCase();
  $("#sideLists")?.classList.toggle("hidden", Boolean(q));
  results.hidden = !q;
  if (!q) return;
  const me = ctx.me().uid;
  const upper = q.toUpperCase();
  const matches = Object.values(ctx.dir() || {})
    .filter(p => p && p.uid && p.uid !== me)
    .filter(p => (p.displayName || "").toLowerCase().includes(q) || (p.emarniId || "").toUpperCase().includes(upper))
    .sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""))
    .slice(0, 30);
  results.innerHTML = matches.length
    ? matches.map(sidebarRow).join("")
    : `<li class="none">No one matches “${esc(q)}”</li>`;
}

function sidebarRow(p) {
  const rel = ctx.relation(p.uid);
  const btn = {
    friend: `<button class="btn sm ghost" type="button" data-act="msg">Message</button>`,
    none: `<button class="btn sm btn-primary" type="button" data-act="add">${icon("userplus")}Add</button>`,
    sent: `<button class="btn sm ghost" type="button" data-act="cancel">Requested</button>`,
    incoming: `<button class="btn sm btn-primary" type="button" data-act="accept">Accept</button>`
  }[rel] || "";
  return `<li class="item" data-uid="${esc(p.uid)}">
    ${avatarHTML(p, "sm")}
    <div class="grow"><b>${esc(p.displayName)}</b><small>${esc(p.emarniId)}${p.status ? " · " + esc(p.status) : ""}</small></div>
    ${btn}
  </li>`;
}

function onSidebarClick(event) {
  const row = event.target.closest("[data-uid]");
  if (!row) return;
  const btn = event.target.closest("[data-act]");
  if (btn) { event.stopPropagation(); act(btn.dataset.act, row.dataset.uid); return; }
  openUser(row.dataset.uid);
}

// ================= OTHER-USER PROFILE (#userView overlay) =================
export function openUser(uid) {
  if (!uid || !ctx) return;
  if (uid === ctx.me().uid) { ctx.go("me"); return; }
  if (!ctx.author(uid)) { toast("Profile not found"); return; }
  viewing = uid;
  const uv = $("#userView");
  if (uv) uv.classList.add("open");
  renderUser();
  if (posts) posts.stop();
  posts = new PostList($("#userPosts"), { source: "user", uid, emptyText: "No posts yet." });
  posts.start();
}

export function closeUser() {
  $("#userView")?.classList.remove("open");
  viewing = null;
  if (posts) { posts.stop(); posts = null; }
  if (postCountOff) { postCountOff(); postCountOff = null; }
}

function onUserCardClick(event) {
  const btn = event.target.closest("[data-act]");
  if (btn && viewing) act(btn.dataset.act, viewing);
}

function renderUser() {
  const card = $("#userCard");
  if (!card) return;
  const p = ctx.author(viewing);
  if (!p) return closeUser();
  const accent = accentOf(p);
  const rel = ctx.relation(viewing);
  const cover = p.coverURL
    ? `<div class="profile-cover"><img alt="" draggable="false" src="${esc(p.coverURL)}" style="${posStyle(p.coverPos)}"></div>`
    : `<div class="profile-cover" style="background:radial-gradient(circle at 20% 20%, ${accent}55, transparent 60%), linear-gradient(135deg, #0a0a0a, #1a0a0a);"></div>`;
  const actions = [];
  if (rel === "friend") {
    actions.push(`<button class="btn btn-primary" type="button" data-act="msg">${icon("chat")}Message</button>`);
  } else if (rel === "sent") {
    actions.push(`<button class="btn ghost" type="button" data-act="cancel">${icon("check")}Request sent</button>`);
  } else if (rel === "incoming") {
    actions.push(`<button class="btn btn-primary" type="button" data-act="accept">${icon("check")}Accept</button>`);
    actions.push(`<button class="btn ghost" type="button" data-act="decline">${icon("x")}Decline</button>`);
  } else {
    actions.push(`<button class="btn btn-primary" type="button" data-act="add">${icon("userplus")}Add friend</button>`);
  }
  actions.push(`<button class="btn ghost" type="button" data-act="report">${icon("flag")}Report</button>`);
  card.innerHTML = `
    ${cover}
    <div class="profile-id">
      ${avatarHTML(p, "xl")}
      <div class="profile-names">
        <h2>${esc(p.displayName)}</h2>
        ${p.status ? `<p class="p-status">${esc(p.status)}</p>` : ""}
        <button class="profile-eid" type="button" data-copy-eid title="Copy EMARNI ID">${esc(p.emarniId || "")} ${icon("copy")}</button>
      </div>
      <div class="profile-actions">${actions.join("")}</div>
    </div>
    ${p.bio ? `<p class="profile-bio">${esc(p.bio)}</p>` : ""}
    <div class="profile-stats">
      <div class="stat"><b id="uvPostsCount">—</b><span>Posts</span></div>
      <div class="stat"><b>—</b><span>Friends</span></div>
    </div>`;
  card.querySelector("[data-copy-eid]")?.addEventListener("click", () => {
    navigator.clipboard?.writeText(p.emarniId || "").then(() => toast("EMARNI ID copied")).catch(() => {});
  });
  if (postCountOff) { postCountOff(); postCountOff = null; }
  postCountOff = fb.watchUserPosts(viewing, list => {
    const el = card.querySelector("#uvPostsCount");
    if (el) el.textContent = list.length;
  }, () => {});
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
      refreshPeople();
    } else if (action === "cancel") {
      await fb.cancelFriendRequest(uid);
      toast("Request cancelled");
      refreshPeople();
    } else if (action === "accept" || action === "decline") {
      await fb.respondFriendRequest(uid, action === "accept");
      playSound(action === "accept" ? "accepted" : "click");
      toast(action === "accept" ? `You are now friends with ${name}` : "Request declined");
      refreshPeople();
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
