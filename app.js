// Emarni: app shell. Loader, sign-in, navigation, friends, groups, notifications, and the feature modules.
import * as fb from "./firebase.js";
import { $, $$, esc, toast, busy, errMsg, avatarHTML, wireDialogs, openDialog } from "./ui.js";
import { icon, hydrate } from "./icons.js";
import { mountBrands } from "./brand.js";
import { initFeed, refreshFeed } from "./feed.js";
import { initMarket, refreshMarket, onMarketShow } from "./market.js";
import { initProfile, onProfileShow } from "./profile.js";
import { initCalls } from "./call.js";
import { initChat, openDm, openGroup, openNewGroup, refreshChatHead } from "./chat.js";
import { initPeople, openUser, refreshPeople } from "./people.js";
import { initMonitor, onMonitorShow } from "./monitor.js";
import { initPostbox } from "./postbox.js";
import { initPrefs } from "./prefs.js";
import { initSettings, onSettingsShow } from "./settings.js";
import { initSounds, playSound } from "./sounds.js";
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
  unsubs: []
};

// ---------- Loader ----------
const SPLASH_LINES = ["Warming up", "Securing your connection", "Syncing chats and friends", "Almost there"];
let splashTimer = 0;

function buildBrand() {
  $("#brand").innerHTML = "EMARNI"
    .split("")
    .map((letter, i) => `<span style="--i:${i}">${letter}</span>`)
    .join("");
}

function startSplash() {
  let i = 0;
  splashTimer = setInterval(() => {
    i = (i + 1) % SPLASH_LINES.length;
    const el = $("#splashMsg");
    el.classList.remove("swap");
    void el.offsetWidth;
    el.textContent = SPLASH_LINES[i];
    el.classList.add("swap");
  }, 1100);
}

function hideSplash() {
  const wait = Math.max(0, 1900 - (Date.now() - S.bootAt));
  setTimeout(() => {
    clearInterval(splashTimer);
    $("#splash").classList.add("done");
  }, wait);
}

// ---------- Views ----------
function showAuth() {
  $("#appView").classList.add("hidden");
  $("#authView").classList.remove("hidden");
}

function showApp() {
  $("#authView").classList.add("hidden");
  $("#appView").classList.remove("hidden");
}

function go(view) {
  $$("[data-nav]").forEach(btn => btn.classList.toggle("on", btn.dataset.nav === view));
  $$("[data-view]").forEach(section => section.classList.toggle("on", section.dataset.view === view));
  if (view === "me") onProfileShow();
  if (view === "adopt" || view === "ads") onMarketShow(view);
  if (view === "monitor") onMonitorShow();
  if (view === "settings") onSettingsShow();
}

// ---------- Sign in and register ----------
let authMode = "login";

function setAuthMode(mode) {
  authMode = mode;
  const reg = mode === "register";
  $$("[data-mode]").forEach(btn => btn.classList.toggle("on", btn.dataset.mode === mode));
  $("#fName").classList.toggle("hidden", !reg);
  $("#fEmail").classList.toggle("hidden", !reg);
  $("#fLogin").classList.toggle("hidden", reg);
  $("#forgot").classList.toggle("hidden", reg);
  $("#authTitle").textContent = reg ? "Create your account" : "Welcome back";
  $("#authHint").textContent = reg ? "You get an Emarni ID automatically." : "Sign in with your email or Emarni ID.";
  $("#authBtn").textContent = reg ? "Create account" : "Sign in";
  $("#fPass").autocomplete = reg ? "new-password" : "current-password";
  $("#authErr").textContent = "";
}

async function submitAuth(event) {
  event.preventDefault();
  const errorBox = $("#authErr");
  errorBox.textContent = "";
  const btn = $("#authBtn");
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
    errorBox.textContent = err.code === "auth/invalid-credential" ? "Wrong login or password." : errMsg(err);
    playSound("loginFail");
  } finally {
    busy(btn, false);
  }
}

async function forgotPassword() {
  const email = $("#fLogin").value.trim();
  if (!email.includes("@")) return toast("Type your email above first");
  try {
    await fb.sendResetEmail(email);
    toast("Reset link sent to your email");
  } catch (err) {
    toast(errMsg(err));
  }
}

// ---------- Relationships ----------
function friendUids() {
  return Object.keys(S.friends).filter(uid => S.friends[uid]?.status === "accepted");
}

function friendProfiles() {
  return friendUids()
    .map(uid => S.byUid[uid])
    .filter(Boolean)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

// How I relate to another user: me, friend, incoming request, request I sent, or none.
function relation(uid) {
  if (uid === S.me?.uid) return "me";
  if (S.friends[uid]?.status === "accepted") return "friend";
  if (S.requests[uid]?.status === "pending") return "incoming";
  if (S.sent[uid]?.status === "pending") return "sent";
  return "none";
}

// ---------- Entering the app ----------
async function enter(user) {
  S.me = await fb.ensureUserProfile(user);
  fb.syncAccount(user).catch(() => {});
  S.isAdmin = (await fb.checkAdmin(user)) === "ok";
  $("#adminNav").hidden = !S.isAdmin;
  $("#monitorBtn").hidden = !S.isAdmin;
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
    setMe: profile => {
      S.me = profile;
      renderMe();
      refreshFeed();
    }
  };
  initFeed(ctx);
  initMarket(ctx);
  initProfile(ctx);
  initChat({
    me: ctx.me,
    byUid: uid => S.byUid[uid] || null,
    friends: friendProfiles,
    groupColor: gid => S.groups[gid]?.color || "#ef4444",
    openUser
  });
  initCalls(ctx);
  initPeople(ctx);
  initMonitor(ctx);
  initPostbox(ctx);
  initSettings(ctx);
  initNotify(ctx, refreshBadges);
  go("chats");
  renderMe();
  paintNotifyButton();

  if (await fb.needsNotice().catch(() => false)) openDialog("#dlgNotice");
}

function watchLists(uid) {
  S.unsubs.push(
    fb.watchUserDirectory(dir => {
      S.dir = dir;
      S.byUid = {};
      Object.values(dir).forEach(profile => {
        if (profile?.uid) S.byUid[profile.uid] = profile;
      });
      renderMe();
      renderFriends();
      renderGroups();
      refreshFeed();
      refreshMarket();
      refreshChatHead();
      refreshPeople();
      syncRoomsNow();
    })
  );
  S.unsubs.push(
    fb.watchFriendships(uid, friends => {
      S.friends = friends;
      renderFriends();
      refreshPeople();
      refreshFeed();
      syncRoomsNow();
    })
  );
  S.unsubs.push(
    fb.watchSentRequests(uid, sent => {
      S.sent = sent;
      refreshPeople();
    })
  );
  S.unsubs.push(
    fb.watchIncomingRequests(uid, requests => {
      S.requests = requests;
      renderRequests();
      refreshPeople();
    })
  );
  S.unsubs.push(
    fb.watchUserGroups(uid, groups => {
      S.groups = groups;
      renderGroups();
      refreshChatHead();
      syncRoomsNow();
    })
  );
}

// Every friend conversation and group is watched for new messages, so notifications work in any chat.
function syncRoomsNow() {
  if (!S.me) return;
  const rooms = [];
  friendUids().forEach(uid => {
    const id = fb.roomIdFor(S.me.uid, uid);
    rooms.push({
      key: `dm:${id}`,
      kind: "dm",
      id,
      uid,
      title: S.byUid[uid]?.displayName || "Friend",
      open: () => {
        go("chats");
        openDm(uid);
      }
    });
  });
  Object.entries(S.groups).forEach(([gid, g]) => {
    rooms.push({
      key: `group:${gid}`,
      kind: "group",
      id: gid,
      title: g.name || "Group",
      open: () => {
        go("chats");
        openGroup(gid, g.name || "Group");
      }
    });
  });
  syncRooms(rooms).catch(() => {});
}

// Called when unread counts change.
function refreshBadges() {
  renderFriends();
  renderGroups();
  updateNavBadge();
}

function updateNavBadge() {
  const n = totalUnread();
  const badge = $("#chatsBadge");
  badge.textContent = n > 99 ? "99+" : String(n);
  badge.classList.toggle("hidden", n === 0);
}

function paintNotifyButton() {
  const state = permissionState();
  const btn = $("#notifyBtn");
  btn.classList.toggle("on", state === "granted");
  btn.title =
    state === "granted"
      ? "Notifications are on"
      : state === "denied"
        ? "Notifications are blocked. Allow them in the browser settings."
        : "Turn on notifications";
}

// ---------- Side panel rendering ----------
function renderMe() {
  const p = S.me;
  if (!p) return;
  $("#meBox").innerHTML = `${avatarHTML(p)}
    <div class="me-info">
      <b>${esc(p.displayName)}</b>
      <button class="copy-id" id="copyId" type="button" title="Copy your Emarni ID">${esc(p.emarniId)} ${icon("copy")}</button>
    </div>`;
  $("#copyId").addEventListener("click", () => {
    navigator.clipboard?.writeText(p.emarniId);
    toast("Emarni ID copied");
  });
}

function renderRequests() {
  const pending = Object.entries(S.requests).filter(([, req]) => req?.status === "pending");
  $("#reqWrap").classList.toggle("hidden", pending.length === 0);
  $("#reqList").innerHTML = pending
    .map(
      ([uid, req]) => `<li class="item">
        <div class="grow"><b>${esc(req.fromName)}</b><small>${esc(req.fromEmarniId)}</small></div>
        <button class="btn sm" type="button" data-req="accept" data-uid="${esc(uid)}">Accept</button>
        <button class="btn sm ghost" type="button" data-req="decline" data-uid="${esc(uid)}">Decline</button>
      </li>`
    )
    .join("");
}

const badgeHTML = n => (n ? `<span class="ubadge">${n > 99 ? "99+" : n}</span>` : "");

function renderGroups() {
  const entries = Object.entries(S.groups).sort((a, b) => String(a[1].name).localeCompare(String(b[1].name)));
  $("#groupList").innerHTML = entries.length
    ? entries
        .map(
          ([gid, g]) => `<li class="item" data-gid="${esc(gid)}">
            <span class="dot" style="background:${esc(g.color || "#ef4444")}"></span>
            <div class="grow"><b>${esc(g.name)}</b><small>Group chat</small></div>
            ${badgeHTML(unreadFor(`group:${gid}`))}
          </li>`
        )
        .join("")
    : `<li class="none">No groups yet</li>`;
  updateNavBadge();
}

function renderFriends() {
  const list = friendProfiles();
  const me = S.me?.uid;
  $("#friendList").innerHTML = list.length
    ? list
        .map(
          p => `<li class="item" data-uid="${esc(p.uid)}">
            ${avatarHTML(p, "sm")}
            <div class="grow"><b>${esc(p.displayName)}</b><small>${esc(p.status || p.emarniId)}</small></div>
            ${badgeHTML(unreadFor(`dm:${fb.roomIdFor(me, p.uid)}`))}
          </li>`
        )
        .join("")
    : `<li class="none">No friends yet. Search for people above to add them.</li>`;
}

// ---------- Wiring ----------
function wire() {
  $$("[data-mode]").forEach(btn => btn.addEventListener("click", () => setAuthMode(btn.dataset.mode)));
  $("#authForm").addEventListener("submit", submitAuth);
  $("#forgot").addEventListener("click", forgotPassword);

  $$("[data-nav]").forEach(btn => btn.addEventListener("click", () => go(btn.dataset.nav)));
  // Any element with data-go (for example the About link on the profile) opens that view.
  document.addEventListener("click", event => {
    const target = event.target.closest("[data-go]");
    if (target) go(target.dataset.go);
  });
  $$("[data-signout]").forEach(btn =>
    btn.addEventListener("click", async () => {
      await fb.signOutAccount().catch(() => {});
      location.reload();
    })
  );
  $("#adminNav").addEventListener("click", () => {
    location.href = "admin.html";
  });
  $("#monitorBtn").addEventListener("click", () => go("monitor"));
  $("#settingsBtn").addEventListener("click", () => go("settings"));

  $("#notifyBtn").addEventListener("click", async () => {
    if (permissionState() === "granted") return toast("Notifications are already on");
    await enableNotifications();
    paintNotifyButton();
  });

  $("#reqList").addEventListener("click", async event => {
    const btn = event.target.closest("[data-req]");
    if (!btn) return;
    try {
      await fb.respondFriendRequest(btn.dataset.uid, btn.dataset.req === "accept");
      playSound(btn.dataset.req === "accept" ? "accepted" : "click");
      toast(btn.dataset.req === "accept" ? "Friend added" : "Request declined");
    } catch (err) {
      toast(errMsg(err));
    }
  });

  $("#friendList").addEventListener("click", event => {
    const row = event.target.closest("[data-uid]");
    if (row) openUser(row.dataset.uid);
  });
  $("#groupList").addEventListener("click", event => {
    const row = event.target.closest("[data-gid]");
    if (row) openGroup(row.dataset.gid, S.groups[row.dataset.gid]?.name || "Group");
  });
  $("#newGroup").addEventListener("click", openNewGroup);

  $("#noticeOk").addEventListener("click", async () => {
    const btn = $("#noticeOk");
    busy(btn, true, "Saving");
    try {
      await fb.acknowledgeNotice();
      $("#dlgNotice").close();
    } catch (err) {
      toast(errMsg(err));
    } finally {
      busy(btn, false);
    }
  });

  wireDialogs();
}

// ---------- Boot ----------
function boot() {
  initPrefs();
  initSounds();
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
