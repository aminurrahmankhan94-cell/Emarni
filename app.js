// Emarni v9 app shell (S1): loader, auth, navigation, global search, badges,
// side panel toggles, and module init wiring. Modules render inside #XView containers.
import * as fb from "./firebase.js";
import { $, $$, esc, toast, busy, errMsg, avatarHTML, wireDialogs, openDialog, debounce } from "./ui.js";
import { icon, hydrate } from "./icons.js";
import { mountBrands } from "./brand.js";
import { initFeed, refreshFeed, onSocialShow } from "./feed.js";
import { initMarket, refreshMarket, onMarketShow } from "./market.js";
import { initProfile, onProfileShow } from "./profile.js";
import { initCalls } from "./call.js";
import { initChat, openDm, openGroup, openNewGroup, refreshChatHead, onChatsShow } from "./chat.js";
import { initPeople, openUser, refreshPeople } from "./people.js";
import { initMonitor, onMonitorShow } from "./monitor.js";
import { initPostbox } from "./postbox.js";
import { initPrefs } from "./prefs.js";
import { initSettings, onSettingsShow } from "./settings.js";
import { initSounds, playSound } from "./sounds.js";
import { initRingtone } from "./ringtone.js";
import { initEnvironment } from "./environment.js";
import { initNotify, syncRooms, unreadFor, totalUnread, enableNotifications, permissionState } from "./notify.js";

const S = {
  me: null,
  isAdmin: false,
  booted: null,
  bootAt: Date.now(),
  dir: {}, // emarniId -> public profile
  byUid: {}, // uid -> public profile
  friends: {}, // uid -> { status }
  sent: {}, // uid -> request I sent
  requests: {}, // uid -> request sent to me
  groups: {}, // gid -> { name, color }
  posts: {}, // postId -> post (cached for search)
  pets: {}, // petId -> adoption listing
  ads: {}, // adId -> ad
  unsubs: []
};

// ---------- Loader / splash ----------
const SPLASH_LINES = ["Warming up", "Securing your connection", "Syncing chats and friends", "Almost there"];
let splashTimer = 0;
function buildBrand() {
  const el = $("#brand");
  if (el) el.innerHTML = "EMARNI".split("").map((letter, i) => `<span style="--i:${i}">${letter}</span>`).join("");
}
function startSplash() {
  let i = 0;
  splashTimer = setInterval(() => {
    i = (i + 1) % SPLASH_LINES.length;
    const el = $("#splashMsg");
    if (!el) return;
    el.classList.remove("swap");
    void el.offsetWidth;
    el.textContent = SPLASH_LINES[i];
    el.classList.add("swap");
  }, 1100);
}
function hideSplash() {
  const wait = Math.max(0, 1400 - (Date.now() - S.bootAt));
  setTimeout(() => {
    clearInterval(splashTimer);
    $("#splash")?.classList.add("done");
  }, wait);
}

// ---------- Auth / app visibility ----------
function showAuth() {
  $("#appShell")?.classList.add("hidden");
  $("#authScreen")?.classList.remove("hidden");
  $("#bottomNav")?.classList.add("hidden");
}
function showApp() {
  $("#authScreen")?.classList.add("hidden");
  $("#appShell")?.classList.remove("hidden");
}

// ---------- Router ----------
function go(view) {
  $$("[data-nav]").forEach(btn => btn.classList.toggle("on", btn.dataset.nav === view));
  $$("[data-view]").forEach(section => section.classList.toggle("on", section.dataset.view === view));
  if (view === "chats") safe(onChatsShow, "onChatsShow");
  if (view === "feed" || view === "people") safe(onSocialShow, "onSocialShow");
  if (view === "me") safe(onProfileShow, "onProfileShow");
  if (view === "adopt" || view === "ads") safe(onMarketShow, "onMarketShow", view);
  if (view === "monitor") safe(onMonitorShow, "onMonitorShow");
  if (view === "settings") safe(onSettingsShow, "onSettingsShow");
  if (view === "friends") renderFriendsView();
  if (view === "groups") renderGroupsView();
  if (view === "notifications") renderNotificationsView();
  if (view === "people") renderPeopleView();
  // Close drawers/sheets on navigation
  $("#notifyDrawer")?.classList.remove("open");
  $("#moreSheet")?.classList.remove("open");
  playSound("nav");
}
function safe(fn, name, ...args) { try { fn?.(...args); } catch (e) { console.warn(`[${name}]`, e); } }

// ---------- Auth forms ----------
let authMode = "login";
function setAuthMode(mode) {
  authMode = mode;
  const reg = mode === "register";
  const forgot = mode === "forgot";
  $$("[data-mode]").forEach(btn => btn.classList.toggle("on", btn.dataset.mode === mode));
  $("#fName")?.classList.toggle("hidden", !reg);
  $("#fEmail")?.classList.toggle("hidden", !reg);
  $("#fLogin")?.classList.toggle("hidden", reg);
  $("#fPass")?.classList.toggle("hidden", forgot);
  $("#forgot")?.classList.toggle("hidden", reg || forgot);
  $("#authBtn").textContent = reg ? "Create account" : forgot ? "Send reset link" : "Sign in";
  $("#authTitle").textContent = reg ? "Create your account" : forgot ? "Reset your password" : "Welcome back";
  $("#authHint").textContent = reg
    ? "You get an Emarni ID automatically."
    : forgot
      ? "Enter your email and we will send a reset link."
      : "Sign in with your email or Emarni ID.";
  if ($("#fPass")) $("#fPass").autocomplete = reg ? "new-password" : "current-password";
  const err = $("#authErr");
  if (err) err.textContent = "";
}
async function submitAuth(event) {
  event.preventDefault();
  const errorBox = $("#authErr");
  if (errorBox) errorBox.textContent = "";
  const btn = $("#authBtn");
  if (authMode === "forgot") return forgotPassword();
  busy(btn, true, "Please wait");
  try {
    const password = $("#fPass").value;
    if (authMode === "register") {
      const name = $("#fName").value.trim();
      const email = $("#fEmail").value.trim();
      if (name.length < 2) throw new Error("Enter your name (2 or more characters).");
      if (!email.includes("@")) throw new Error("Enter a valid email address.");
      if (password.length < 6) throw new Error("Password must be at least 6 characters.");
      await fb.registerAccount({ email, password, displayName: name });
    } else {
      await fb.signInAccount($("#fLogin").value, password);
    }
  } catch (err) {
    if (errorBox) errorBox.textContent = err.code === "auth/invalid-credential" ? "Wrong login or password." : errMsg(err);
    playSound("loginFail");
  } finally {
    busy(btn, false);
  }
}
async function forgotPassword() {
  const email = ($("#fLogin")?.value || "").trim();
  if (!email.includes("@")) return toast("Type your email above first");
  const btn = $("#authBtn");
  busy(btn, true, "Sending");
  try {
    await fb.sendResetEmail(email);
    toast("Reset link sent to your email");
    setAuthMode("login");
  } catch (err) {
    toast(errMsg(err));
  } finally {
    busy(btn, false);
  }
}

// ---------- Relationships helpers ----------
function friendUids() { return Object.keys(S.friends).filter(uid => S.friends[uid]?.status === "accepted"); }
function friendProfiles() {
  return friendUids().map(uid => S.byUid[uid]).filter(Boolean).sort((a, b) => String(a.displayName).localeCompare(String(b.displayName)));
}
function relation(uid) {
  if (uid === S.me?.uid) return "me";
  if (S.friends[uid]?.status === "accepted") return "friend";
  if (S.requests[uid]?.status === "pending") return "incoming";
  if (S.sent[uid]?.status === "pending") return "sent";
  return "none";
}
function pendingRequests() { return Object.entries(S.requests).filter(([, r]) => r?.status === "pending"); }

// ---------- Entering the app ----------
async function enter(user) {
  S.me = await fb.ensureUserProfile(user);
  fb.syncAccount(user).catch(() => {});
  S.isAdmin = (await fb.checkAdmin(user)) === "ok";
  // Admin gating: reveal monitor nav + view
  const showMon = S.isAdmin;
  ["#monitorNav", "#monitorNavMore"].forEach(sel => { const el = $(sel); if (el) el.hidden = !showMon; });
  showApp();
  watchLists(user.uid);
  const ctx = {
    me: () => S.me,
    dir: () => S.dir,
    author: uid => S.byUid[uid] || null,
    isAdmin: () => S.isAdmin,
    friendIds: friendUids,
    relation,
    openUser,
    go,
    setMe: profile => { S.me = profile; renderMe(); refreshFeed(); }
  };
  // Init all modules (each guarded so one failure cannot break the shell)
  safe(initFeed, "initFeed", ctx);
  safe(initMarket, "initMarket", ctx);
  safe(initProfile, "initProfile", ctx);
  safe(initChat, "initChat", { me: ctx.me, byUid: uid => S.byUid[uid] || null, friends: friendProfiles, groupColor: gid => S.groups[gid]?.color || "#ef4444", openUser });
  safe(initCalls, "initCalls", ctx);
  safe(initPeople, "initPeople", ctx);
  if (S.isAdmin) safe(initMonitor, "initMonitor", ctx);
  safe(initPostbox, "initPostbox", ctx);
  safe(initSettings, "initSettings", ctx);
  safe(initNotify, "initNotify", ctx, refreshBadges);
  go("chats");
  renderMe();
  renderAvatarBtn();
  updateNotifyBadge();
  if (await fb.needsNotice().catch(() => false)) openDialog("#dlgNotice");
}

function watchLists(uid) {
  S.unsubs.push(
    fb.watchUserDirectory(dir => {
      S.dir = dir;
      S.byUid = {};
      Object.values(dir).forEach(profile => { if (profile?.uid) S.byUid[profile.uid] = profile; });
      renderMe(); renderAvatarBtn(); renderFriends(); renderGroups(); renderRequests();
      refreshFeed(); refreshMarket(); refreshChatHead(); refreshPeople(); syncRoomsNow();
    })
  );
  S.unsubs.push(
    fb.watchFriendships(uid, friends => { S.friends = friends; renderFriends(); renderGroups(); refreshPeople(); refreshFeed(); syncRoomsNow(); })
  );
  S.unsubs.push(fb.watchSentRequests(uid, sent => { S.sent = sent; refreshPeople(); }));
  S.unsubs.push(fb.watchIncomingRequests(uid, requests => { S.requests = requests; renderRequests(); updateNotifyBadge(); refreshPeople(); }));
  S.unsubs.push(fb.watchUserGroups(uid, groups => { S.groups = groups; renderGroups(); refreshChatHead(); syncRoomsNow(); }));
  // Caches for global search
  S.unsubs.push(fb.watchPosts(posts => { S.posts = posts || {}; }));
  S.unsubs.push(fb.watchAdoptions(pets => { S.pets = pets || {}; }));
  S.unsubs.push(fb.watchActiveAds(ads => { S.ads = ads || {}; }));
}

function syncRoomsNow() {
  if (!S.me) return;
  const rooms = [];
  friendUids().forEach(uid => {
    const id = fb.roomIdFor(S.me.uid, uid);
    rooms.push({ key: `dm:${id}`, kind: "dm", id, uid, title: S.byUid[uid]?.displayName || "Friend", open: () => { go("chats"); openDm(uid); } });
  });
  Object.entries(S.groups).forEach(([gid, g]) => {
    rooms.push({ key: `group:${gid}`, kind: "group", id: gid, title: g.name || "Group", open: () => { go("chats"); openGroup(gid, g.name || "Group"); } });
  });
  syncRooms(rooms).catch(() => {});
}

function refreshBadges() { renderFriends(); renderGroups(); updateNavBadge(); updateNotifyBadge(); }

function updateNavBadge() {
  const n = totalUnread();
  ["#chatsBadge"].forEach(sel => {
    const badge = $(sel);
    if (!badge) return;
    badge.textContent = n > 99 ? "99+" : String(n);
    badge.classList.toggle("hidden", n === 0);
  });
}
function updateNotifyBadge() {
  const n = totalUnread() + pendingRequests().length;
  ["#notifyBadge", "#notifNavBadge"].forEach(sel => {
    const badge = $(sel);
    if (!badge) return;
    badge.textContent = n > 99 ? "99+" : String(n);
    badge.classList.toggle("hidden", n === 0);
  });
}

// ---------- Rendering (side lists + dedicated views) ----------
function renderMe() {
  const p = S.me;
  if (!p) return;
  const box = $("#meBox");
  if (box) {
    box.innerHTML = `${avatarHTML(p)}
      <div class="me-info">
        <b>${esc(p.displayName)}</b>
        <button class="copy-id" id="copyId" type="button" title="Copy your Emarni ID">${esc(p.emarniId)} ${icon("copy")}</button>
      </div>`;
    $("#copyId")?.addEventListener("click", () => { navigator.clipboard?.writeText(p.emarniId); toast("Emarni ID copied"); });
  }
}
function renderAvatarBtn() {
  const btn = $("#avatarBtn");
  if (!btn || !S.me) return;
  btn.innerHTML = S.me.photoURL ? `<img alt="" src="${esc(S.me.photoURL)}">` : `<span style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-weight:700;background:var(--panel-2);">${esc((S.me.displayName || "E")[0].toUpperCase())}</span>`;
}
const badgeHTML = n => (n ? `<span class="ubadge">${n > 99 ? "99+" : n}</span>` : "");
function renderRequests() {
  const pending = pendingRequests();
  // Chats side panel
  const wrap = $("#reqWrap");
  if (wrap) wrap.classList.toggle("hidden", pending.length === 0);
  const list = $("#reqList");
  if (list) {
    list.innerHTML = pending.map(([uid, req]) => `<li class="item">
      <div class="grow"><b>${esc(req.fromName)}</b><small>${esc(req.fromEmarniId)}</small></div>
      <button class="btn sm" type="button" data-req="accept" data-uid="${esc(uid)}">Accept</button>
      <button class="btn sm ghost" type="button" data-req="decline" data-uid="${esc(uid)}">Decline</button>
    </li>`).join("");
  }
}
function renderGroups() {
  const entries = Object.entries(S.groups).sort((a, b) => String(a[1].name).localeCompare(String(b[1].name)));
  const html = entries.length
    ? entries.map(([gid, g]) => `<li class="item" data-gid="${esc(gid)}">
        <span class="dot" style="background:${esc(g.color || "#ef4444")}"></span>
        <div class="grow"><b>${esc(g.name)}</b><small>Group chat</small></div>
        ${badgeHTML(unreadFor(`group:${gid}`))}
      </li>`).join("")
    : `<li class="none">No groups yet</li>`;
  const gl = $("#groupList"); if (gl) gl.innerHTML = html;
  const glf = $("#groupListFull"); if (glf) glf.innerHTML = html;
  updateNavBadge();
}
function renderFriends() {
  const list = friendProfiles();
  const me = S.me?.uid;
  const html = list.length
    ? list.map(p => `<li class="item" data-uid="${esc(p.uid)}">
        ${avatarHTML(p, "sm")}
        <div class="grow"><b>${esc(p.displayName)}</b><small>${esc(p.status || p.emarniId)}</small></div>
        ${badgeHTML(unreadFor(`dm:${fb.roomIdFor(me, p.uid)}`))}
      </li>`).join("")
    : `<li class="none">No friends yet. Search for people above to add them.</li>`;
  const fl = $("#friendList"); if (fl) fl.innerHTML = html;
  const flf = $("#friendListFull"); if (flf) flf.innerHTML = html;
}
function renderFriendsView() {
  renderFriends();
  const pending = pendingRequests();
  const wrap = $("#reqWrapFriends");
  if (wrap) wrap.classList.toggle("hidden", pending.length === 0);
  const list = $("#reqListFriends");
  if (list) {
    list.innerHTML = pending.map(([uid, req]) => `<li class="item">
      <div class="grow"><b>${esc(req.fromName)}</b><small>${esc(req.fromEmarniId)}</small></div>
      <button class="btn sm" type="button" data-req="accept" data-uid="${esc(uid)}">Accept</button>
      <button class="btn sm ghost" type="button" data-req="decline" data-uid="${esc(uid)}">Decline</button>
    </li>`).join("");
  }
}
function renderGroupsView() { renderGroups(); }
function renderNotificationsView() {
  const el = $("#notifContent");
  if (!el) return;
  const pending = pendingRequests();
  if (!pending.length) {
    el.innerHTML = `<div class="empty-state"><i data-icon="bell" class="ico"></i><p>No notifications yet.</p></div>`;
    hydrate(el);
    return;
  }
  el.innerHTML = `<h3 class="sec-title">Friend requests</h3><ul class="list">${pending.map(([uid, req]) => `<li class="item">
    <div class="grow"><b>${esc(req.fromName)}</b><small>${esc(req.fromEmarniId)}</small></div>
    <button class="btn sm" type="button" data-req="accept" data-uid="${esc(uid)}">Accept</button>
    <button class="btn sm ghost" type="button" data-req="decline" data-uid="${esc(uid)}">Decline</button>
  </li>`).join("")}</ul>`;
}
function renderPeopleView() {
  const el = $("#peopleDirList");
  if (!el) return;
  const all = Object.values(S.byUid).filter(p => p.uid !== S.me?.uid).sort((a, b) => String(a.displayName).localeCompare(String(b.displayName)));
  if (!all.length) { el.innerHTML = `<p class="empty">Loading people…</p>`; return; }
  el.innerHTML = `<h3 class="sec-title">Everyone on Emarni (${all.length})</h3><ul class="list">${all.map(p => `<li class="item" data-uid="${esc(p.uid)}">
    ${avatarHTML(p, "sm")}<div class="grow"><b>${esc(p.displayName)}</b><small>${esc(p.emarniId)}</small></div>
  </li>`).join("")}</ul>`;
}

// ---------- Global search (unified, debounced) ----------
function runSearch(q) {
  const box = $("#searchResults");
  if (!box) return;
  q = q.trim().toLowerCase();
  if (!q) { box.classList.add("hidden"); box.innerHTML = ""; return; }
  const groups = [];
  // People
  const people = Object.values(S.byUid).filter(p =>
    String(p.displayName).toLowerCase().includes(q) || String(p.emarniId).toLowerCase().includes(q)
  ).slice(0, 6);
  if (people.length) groups.push({ label: "People", icon: "user", items: people.map(p => ({ title: p.displayName, sub: p.emarniId, action: () => openUser(p.uid) })) });
  // Groups
  const grps = Object.entries(S.groups).filter(([, g]) => String(g.name).toLowerCase().includes(q)).slice(0, 5);
  if (grps.length) groups.push({ label: "Groups", icon: "users", items: grps.map(([gid, g]) => ({ title: g.name, sub: "Group chat", action: () => { go("chats"); openGroup(gid, g.name); } })) });
  // Posts
  const posts = Object.values(S.posts).filter(p => String(p.text || "").toLowerCase().includes(q)).slice(0, 5);
  if (posts.length) groups.push({ label: "Posts", icon: "sparkle", items: posts.map(p => ({ title: String(p.text || "").slice(0, 60), sub: p.authorName || "Post", action: () => go("feed") })) });
  // Pets (adoptions)
  const pets = Object.values(S.pets).filter(p => String(p.name || "").toLowerCase().includes(q) || String(p.species || "").toLowerCase().includes(q)).slice(0, 5);
  if (pets.length) groups.push({ label: "Pets for adoption", icon: "paw", items: pets.map(p => ({ title: p.name, sub: `${p.species || "Pet"} · ${p.location || ""}`, action: () => go("adopt") })) });
  // Ads
  const ads = Object.values(S.ads).filter(a => String(a.title || "").toLowerCase().includes(q)).slice(0, 5);
  if (ads.length) groups.push({ label: "Ads", icon: "megaphone", items: ads.map(a => ({ title: a.title, sub: a.category || "Ad", action: () => go("ads") })) });

  if (!groups.length) {
    box.innerHTML = `<div class="sr-item" style="color:var(--text-faint);cursor:default;">No results for “${esc(q)}”</div>`;
  } else {
    box.innerHTML = groups.map(g => `<div class="sr-group">${esc(g.label)}</div>` +
      g.items.map((it, i) => `<div class="sr-item" data-sr="${esc(g.label)}-${i}">${icon(g.icon)}<span><b>${esc(it.title)}</b><small>${esc(it.sub)}</small></span></div>`).join("")
    ).join("");
    // Wire clicks
    let idx = 0;
    groups.forEach(g => g.items.forEach(it => {
      const el = box.querySelector(`[data-sr="${g.label}-${idx}"]`);
      if (el) el.addEventListener("click", () => { box.classList.add("hidden"); $("#searchInput").value = ""; it.action(); });
      idx++;
    }));
  }
  box.classList.remove("hidden");
}
const debouncedSearch = debounce(runSearch, 250);

// ---------- Wiring ----------
function wire() {
  // Auth
  $$("[data-mode]").forEach(btn => btn.addEventListener("click", () => setAuthMode(btn.dataset.mode)));
  $("#authForm")?.addEventListener("submit", submitAuth);
  $("#forgot")?.addEventListener("click", () => setAuthMode("forgot"));

  // Navigation (all [data-nav] buttons)
  $$("[data-nav]").forEach(btn => btn.addEventListener("click", () => go(btn.dataset.nav)));
  document.addEventListener("click", event => {
    const target = event.target.closest("[data-go]");
    if (target) go(target.dataset.go);
  });

  // Sign out
  ["#signOutBtn", "#signOutBtnMobile"].forEach(sel => $(sel)?.addEventListener("click", async () => {
    await fb.signOutAccount().catch(() => {});
    location.reload();
  }));

  // Sidebar collapse
  $("#sidebarToggle")?.addEventListener("click", () => {
    $("#sidebar")?.classList.toggle("collapsed");
    $("#appShell")?.classList.toggle("sidebar-collapsed");
  });

  // Right panel toggle
  $("#rightToggle")?.addEventListener("click", () => {
    const rp = $("#rightPanel");
    if (!rp) return;
    rp.classList.toggle("hidden");
    $("#appShell")?.classList.toggle("with-right", !rp.classList.contains("hidden"));
  });

  // Notify bell -> drawer is auto-wired by notify.js (toggleDrawer). Badge updated below.
  updateNotifyBadge();

  // Avatar -> me
  $("#avatarBtn")?.addEventListener("click", () => go("me"));

  // Bottom nav More sheet
  $("#moreBtn")?.addEventListener("click", () => {
    const sheet = $("#moreSheet");
    if (!sheet) return;
    sheet.classList.toggle("hidden");
    requestAnimationFrame(() => sheet.classList.toggle("open", !sheet.classList.contains("hidden")));
  });

  // Global search
  const si = $("#searchInput");
  if (si) {
    si.addEventListener("input", () => debouncedSearch(si.value));
    si.addEventListener("focus", () => { if (si.value.trim()) runSearch(si.value); });
  }
  document.addEventListener("click", event => {
    if (!event.target.closest("#globalSearch")) $("#searchResults")?.classList.add("hidden");
  });

  // Friend request accept/decline (delegated — lists render dynamically)
  document.addEventListener("click", async event => {
    const btn = event.target.closest("[data-req]");
    if (!btn) return;
    try {
      await fb.respondFriendRequest(btn.dataset.uid, btn.dataset.req === "accept");
      playSound(btn.dataset.req === "accept" ? "accepted" : "click");
      toast(btn.dataset.req === "accept" ? "Friend added" : "Request declined");
    } catch (err) { toast(errMsg(err)); }
  });

  // Friend/group row clicks (chats side + friends/groups views)
  document.addEventListener("click", event => {
    const friendRow = event.target.closest("#friendListFull [data-uid], #friendList [data-uid]");
    if (friendRow && !friendRow.closest("[data-req]")) return openUser(friendRow.dataset.uid);
    const groupRow = event.target.closest("[data-gid]");
    if (groupRow) return openGroup(groupRow.dataset.gid, S.groups[groupRow.dataset.gid]?.name || "Group");
    const peopleRow = event.target.closest("#peopleDirList [data-uid], #peopleResultsMain [data-uid]");
    if (peopleRow) return openUser(peopleRow.dataset.uid);
  });

  // New group buttons
  ["#newGroup", "#newGroupBtn"].forEach(sel => $(sel)?.addEventListener("click", openNewGroup));

  // People search in people view (mirrors chats side search)
  $("#peopleSearchMain")?.addEventListener("input", e => {
    const q = e.target.value.trim().toLowerCase();
    const box = $("#peopleResultsMain");
    if (!box) return;
    if (!q) { box.innerHTML = ""; return; }
    const matches = Object.values(S.byUid).filter(p =>
      String(p.displayName).toLowerCase().includes(q) || String(p.emarniId).toLowerCase().includes(q)
    );
    box.innerHTML = matches.length
      ? matches.map(p => `<li class="item" data-uid="${esc(p.uid)}">${avatarHTML(p, "sm")}<div class="grow"><b>${esc(p.displayName)}</b><small>${esc(p.emarniId)}</small></div></li>`).join("")
      : `<li class="none">No one matches “${esc(q)}”</li>`;
  });

  // Notice dialog
  $("#noticeOk")?.addEventListener("click", async () => {
    const btn = $("#noticeOk");
    busy(btn, true, "Saving");
    try { await fb.acknowledgeNotice(); $("#dlgNotice")?.close(); }
    catch (err) { toast(errMsg(err)); }
    finally { busy(btn, false); }
  });

  wireDialogs();
}

// ---------- Boot ----------
function boot() {
  initPrefs();
  initSounds();
  initRingtone();
  initEnvironment();
  buildBrand();
  startSplash();
  hydrate();
  mountBrands();
  wire();
  fb.watchAuth(async user => {
    if (!user) {
      S.booted = null;
      showAuth();
      hideSplash();
      return;
    }
    if (S.booted === user.uid) return;
    S.booted = user.uid;
    try {
      await enter(user);
      playSound("loginOk");
    } catch (err) {
      toast(errMsg(err));
      S.booted = null;
      showAuth();
    }
    hideSplash();
  });
}
boot();
