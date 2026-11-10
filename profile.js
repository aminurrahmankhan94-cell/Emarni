// Own profile (#meView): display (cover, avatar, stats, tabs) + live editor
// (name, status, bio, accent, photo shape, drag + zoom crop). Other users render in people.js (#userView).
import * as fb from "./firebase.js";
import { $, $$, esc, toast, busy, errMsg, COLORS, clamp, initials, accentOf, posStyle } from "./ui.js";
import { icon } from "./icons.js";
import { PostList } from "./feed.js";
import { prepareUpload } from "./media.js";
import { playSound } from "./sounds.js";

let ctx = null;
let built = false;
let draft = null;
let uploadTarget = "cover";
let myPosts = null;
let editing = false;
let activeTab = "posts";

export function initProfile(context) {
  ctx = context;
}

export function onProfileShow() {
  if (!built) build();
  const me = ctx.me();
  if (!me) return;
  draft = JSON.parse(JSON.stringify(me));
  draft.avatarPos = draft.avatarPos || { x: 0, y: 0, z: 1 };
  draft.coverPos = draft.coverPos || { x: 0, y: 0, z: 1 };
  editing = false;
  activeTab = "posts";
  fillForm();
  paint();
  switchTab("posts");
}

function build() {
  built = true;
  const host = $("#meView");
  host.innerHTML = `
    <div class="profile-view">
      <button class="profile-back hidden" type="button" id="pfBack">${icon("back")}<span>Back</span></button>
      <div class="profile-cover" id="pfCover">
        <img id="pfCoverImg" alt="" draggable="false" hidden>
      </div>
      <div class="profile-id">
        <div class="av xl" id="pfAv" title="Drag to move" style="--ring:var(--accent);">
          <img id="pfAvImg" alt="" draggable="false" hidden>
          <span id="pfAvInit"></span>
        </div>
        <div class="profile-names">
          <h2 id="pfName"></h2>
          <p class="p-status" id="pfStatus" hidden></p>
          <button class="profile-eid" type="button" id="pfEid" title="Copy your EMARNI ID"></button>
        </div>
        <div class="profile-actions">
          <button class="btn btn-primary" type="button" id="pfEditBtn">${icon("pen")}<span>Edit profile</span></button>
        </div>
      </div>
      <p class="profile-bio" id="pfBio" hidden></p>
      <div class="profile-stats">
        <div class="stat"><b id="pfPostsCount">—</b><span>Posts</span></div>
        <div class="stat"><b id="pfFriendsCount">0</b><span>Friends</span></div>
      </div>
      <div class="profile-tabs" role="tablist">
        <button type="button" class="on" data-tab="posts">Posts</button>
        <button type="button" data-tab="about">About</button>
      </div>
      <div class="profile-tab-panel" id="pfTabPosts">
        <button class="post-trigger card-glass" type="button" data-open-post style="width:100%;display:flex;align-items:center;gap:10px;padding:12px 16px;background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);cursor:pointer;color:var(--text-dim);font-family:var(--font-body);font-size:14px;text-align:left;margin-bottom:14px;">
          <span class="pt-ic" style="display:inline-flex;">${icon("plus")}</span>
          <span class="pt-text" style="flex:1;">What's on your mind?</span>
          <span style="display:inline-flex;gap:6px;opacity:.6;">${icon("image")}${icon("film")}${icon("mic")}</span>
        </button>
        <div id="myPosts" style="display:flex;flex-direction:column;gap:var(--post-gap,14px);"></div>
      </div>
      <div class="profile-tab-panel hidden" id="pfTabAbout">
        <div class="profile-about">
          <div class="ab-row"><b>Display name</b><span id="pfAboutName"></span></div>
          <div class="ab-row"><b>EMARNI ID</b><span id="pfAboutEid"></span></div>
          <div class="ab-row"><b>Status</b><span id="pfAboutStatus">—</span></div>
          <div class="ab-row"><b>Bio</b><span id="pfAboutBio">—</span></div>
          <div class="ab-row"><b>Accent</b><span id="pfAboutAccent" style="display:inline-flex;align-items:center;gap:6px;"><i style="width:12px;height:12px;border-radius:50%;background:var(--accent);display:inline-block;"></i></span></div>
        </div>
      </div>

      <!-- Editor (hidden until Edit clicked) -->
      <div class="profile-editor hidden" id="pfEditor">
        <div class="pe-row">
          <button class="btn sm ghost" type="button" id="pfCoverBtn">${icon("image")}Cover photo</button>
          <label class="pe-zoom">Zoom <input type="range" id="pfCoverZoom" min="1" max="3" step="0.01"></label>
          <button class="btn sm ghost" type="button" id="pfCoverReset">Reset</button>
        </div>
        <div class="pe-drag cover" id="pfCoverDrag"><img id="pfCoverDragImg" alt="" draggable="false" hidden><span class="drag-hint">Drag to reposition</span></div>
        <div class="pe-row">
          <button class="btn sm ghost" type="button" id="pfAvBtn">${icon("user")}Profile photo</button>
          <label class="pe-zoom">Zoom <input type="range" id="pfAvZoom" min="1" max="3" step="0.01"></label>
          <button class="btn sm ghost" type="button" id="pfAvReset">Reset</button>
        </div>
        <div class="pe-drag avatar" id="pfAvDrag"><img id="pfAvDragImg" alt="" draggable="false" hidden><span class="drag-hint">Drag</span></div>
        <div class="pe-grid">
          <label>Display name <input id="pfNameIn" type="text" maxlength="32" autocomplete="name"></label>
          <label>Status <input id="pfStatusIn" type="text" maxlength="60" placeholder="Studying, Busy, Available"></label>
          <label class="wide">Bio <textarea id="pfBioIn" maxlength="200" rows="2" placeholder="A line about you"></textarea></label>
          <div class="wide">
            <span class="hint" style="font-size:12px;color:var(--text-dim);font-weight:600;">Accent colour</span>
            <div class="pe-swatches" id="pfColors"></div>
          </div>
          <div class="wide">
            <span class="hint" style="font-size:12px;color:var(--text-dim);font-weight:600;">Photo shape</span>
            <div class="pe-seg" id="pfShape">
              <button type="button" data-shape="circle">Circle</button>
              <button type="button" data-shape="squircle">Rounded</button>
            </div>
          </div>
        </div>
        <div class="pe-row" style="justify-content:space-between;">
          <button class="btn sm ghost" type="button" id="pfHealth">${icon("sparkle")}Check my setup</button>
          <small class="hint" style="font-size:11px;color:var(--text-faint);">Shows exactly what is not working, if anything.</small>
        </div>
        <ul class="list plain hidden" id="pfHealthOut"></ul>
        <div class="pe-row" style="justify-content:flex-end;gap:8px;">
          <button class="btn ghost" type="button" id="pfCancel">Cancel</button>
          <button class="btn btn-primary" type="button" id="pfSave">Save profile</button>
        </div>
        <input type="file" id="pfFile" accept="image/*" hidden>
      </div>

      <button class="about-teaser card-glass" type="button" data-go="about" style="display:flex;align-items:center;gap:12px;padding:14px 18px;background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);cursor:pointer;color:var(--text);text-align:left;width:100%;">
        <span style="display:inline-flex;color:var(--accent);">${icon("info")}</span>
        <span style="flex:1;"><b style="display:block;font-size:14px;">About EMARNI</b><small style="color:var(--text-dim);font-size:12px;">Our mission, our vision, and the team behind it</small></span>
        <span style="display:inline-flex;color:var(--text-faint);">${icon("chevright")}</span>
      </button>
    </div>`;

  $("#pfColors").innerHTML = COLORS.map(c => `<button type="button" data-c="${c}" style="background:${c}" aria-label="Accent ${c}"></button>`).join("");
  $("#pfNameIn").addEventListener("input", e => { draft.displayName = e.target.value; paint(); });
  $("#pfStatusIn").addEventListener("input", e => { draft.status = e.target.value; paint(); });
  $("#pfBioIn").addEventListener("input", e => { draft.bio = e.target.value; paint(); });
  $("#pfColors").addEventListener("click", e => {
    const btn = e.target.closest("[data-c]");
    if (btn) { draft.accent = btn.dataset.c; paint(); }
  });
  $("#pfShape").addEventListener("click", e => {
    const btn = e.target.closest("[data-shape]");
    if (btn) { draft.avatarShape = btn.dataset.shape; paint(); }
  });
  $("#pfCoverZoom").addEventListener("input", e => setZoom("coverPos", e.target.value));
  $("#pfAvZoom").addEventListener("input", e => setZoom("avatarPos", e.target.value));
  $("#pfCoverReset").addEventListener("click", () => { draft.coverPos = { x: 0, y: 0, z: 1 }; fillForm(); paint(); });
  $("#pfAvReset").addEventListener("click", () => { draft.avatarPos = { x: 0, y: 0, z: 1 }; fillForm(); paint(); });
  $("#pfCoverBtn").addEventListener("click", () => pickFile("cover"));
  $("#pfAvBtn").addEventListener("click", () => pickFile("avatar"));
  $("#pfFile").addEventListener("change", onFilePicked);
  $("#pfSave").addEventListener("click", save);
  $("#pfCancel").addEventListener("click", () => { editing = false; onProfileShow(); });
  $("#pfHealth").addEventListener("click", runCheck);
  $("#pfEditBtn").addEventListener("click", () => {
    editing = !editing;
    $("#pfEditor").classList.toggle("hidden", !editing);
    $("#pfEditBtn").innerHTML = editing ? `${icon("x")}<span>Done</span>` : `${icon("pen")}<span>Edit profile</span>`;
    if (editing) $("#pfEditor").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("#pfEid").addEventListener("click", () => {
    const me = ctx.me();
    navigator.clipboard?.writeText(me?.emarniId || "").then(() => toast("EMARNI ID copied")).catch(() => {});
  });
  $$(".profile-tabs [data-tab]").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
  bindDrag($("#pfCoverDrag"), "coverPos");
  bindDrag($("#pfAvDrag"), "avatarPos");
  myPosts = new PostList($("#myPosts"), {
    source: "user",
    uid: ctx.me().uid,
    emptyText: "You have not posted yet. Share a photo, video or voice note."
  });
  myPosts.start();
  // Live post count
  fb.watchUserPosts(ctx.me().uid, list => {
    const el = $("#pfPostsCount");
    if (el) el.textContent = list.length;
  }, () => {});
}

function switchTab(tab) {
  activeTab = tab;
  $$(".profile-tabs [data-tab]").forEach(b => b.classList.toggle("on", b.dataset.tab === tab));
  $("#pfTabPosts")?.classList.toggle("hidden", tab !== "posts");
  $("#pfTabAbout")?.classList.toggle("hidden", tab !== "about");
}

function fillForm() {
  $("#pfNameIn").value = draft.displayName || "";
  $("#pfStatusIn").value = draft.status || "";
  $("#pfBioIn").value = draft.bio || "";
  $("#pfCoverZoom").value = draft.coverPos.z;
  $("#pfAvZoom").value = draft.avatarPos.z;
}

function setZoom(key, raw) {
  draft[key].z = Number(raw);
  clampPos(key);
  paint();
}

// Keeps the photo covering its frame: the offset can never exceed the extra zoom area.
function clampPos(key) {
  const limit = ((draft[key].z - 1) / 2) * 100;
  draft[key].x = clamp(draft[key].x, -limit, limit);
  draft[key].y = clamp(draft[key].y, -limit, limit);
}

function bindDrag(box, key) {
  if (!box) return;
  let start = null;
  box.addEventListener("pointerdown", event => {
    if (event.target.closest("button, input")) return;
    box.setPointerCapture(event.pointerId);
    start = { x: event.clientX, y: event.clientY, px: draft[key].x, py: draft[key].y };
    box.classList.add("dragging");
  });
  box.addEventListener("pointermove", event => {
    if (!start) return;
    const rect = box.getBoundingClientRect();
    draft[key].x = start.px + ((event.clientX - start.x) / rect.width) * 100;
    draft[key].y = start.py + ((event.clientY - start.y) / rect.height) * 100;
    clampPos(key);
    paint();
  });
  const stop = () => { start = null; box.classList.remove("dragging"); fillForm(); };
  box.addEventListener("pointerup", stop);
  box.addEventListener("pointercancel", stop);
}

function paint() {
  const d = draft;
  if (!d) return;
  const accent = accentOf(d);
  // Cover (display)
  const coverImg = $("#pfCoverImg");
  if (d.coverURL) {
    if (coverImg.getAttribute("src") !== d.coverURL) coverImg.src = d.coverURL;
    coverImg.style.cssText = posStyle(d.coverPos);
    coverImg.hidden = false;
  } else {
    coverImg.hidden = true;
    $("#pfCover").style.background = `radial-gradient(circle at 18% 20%, ${accent}66, transparent 60%), linear-gradient(135deg, #0a0a0a, #3f0d0d)`;
  }
  // Cover (editor drag preview)
  const cdImg = $("#pfCoverDragImg");
  if (cdImg) {
    cdImg.hidden = !d.coverURL;
    if (d.coverURL) {
      if (cdImg.getAttribute("src") !== d.coverURL) cdImg.src = d.coverURL;
      cdImg.style.cssText = posStyle(d.coverPos);
    }
  }
  // Avatar (display)
  const av = $("#pfAv");
  av.classList.toggle("sq", d.avatarShape === "squircle");
  av.style.setProperty("--ring", accent);
  const avImg = $("#pfAvImg");
  avImg.hidden = !d.photoURL;
  if (d.photoURL) {
    if (avImg.getAttribute("src") !== d.photoURL) avImg.src = d.photoURL;
    avImg.style.cssText = posStyle(d.avatarPos);
  }
  $("#pfAvInit").textContent = d.photoURL ? "" : initials(d.displayName);
  // Avatar (editor drag preview)
  const ad = $("#pfAvDrag");
  if (ad) {
    ad.classList.toggle("sq", d.avatarShape === "squircle");
    ad.style.setProperty("--ring", accent);
    const adImg = $("#pfAvDragImg");
    adImg.hidden = !d.photoURL;
    if (d.photoURL) {
      if (adImg.getAttribute("src") !== d.photoURL) adImg.src = d.photoURL;
      adImg.style.cssText = posStyle(d.avatarPos);
    }
  }
  // Text fields
  $("#pfName").textContent = d.displayName || "";
  const statusEl = $("#pfStatus");
  statusEl.textContent = d.status || "";
  statusEl.hidden = !d.status;
  $("#pfEid").innerHTML = `${esc(d.emarniId || "")} ${icon("copy")}`;
  const bioEl = $("#pfBio");
  bioEl.textContent = d.bio || "";
  bioEl.hidden = !d.bio;
  // Friends count
  const fc = $("#pfFriendsCount");
  if (fc) fc.textContent = ctx?.friendIds?.().length ?? 0;
  // Editor toggles
  $$("#pfShape [data-shape]").forEach(b => b.classList.toggle("on", b.dataset.shape === (d.avatarShape || "circle")));
  $$("#pfColors [data-c]").forEach(b => b.classList.toggle("on", b.dataset.c.toLowerCase() === accent.toLowerCase()));
  const cz = $("#pfCoverZoom"); if (cz) cz.value = d.coverPos.z;
  const az = $("#pfAvZoom"); if (az) az.value = d.avatarPos.z;
  // About tab
  $("#pfAboutName") && ($("#pfAboutName").textContent = d.displayName || "—");
  $("#pfAboutEid") && ($("#pfAboutEid").textContent = d.emarniId || "—");
  $("#pfAboutStatus") && ($("#pfAboutStatus").textContent = d.status || "—");
  $("#pfAboutBio") && ($("#pfAboutBio").textContent = d.bio || "—");
}

function pickFile(target) {
  uploadTarget = target;
  $("#pfFile").click();
}

async function onFilePicked(event) {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  const button = uploadTarget === "cover" ? $("#pfCoverBtn") : $("#pfAvBtn");
  busy(button, true, "Uploading");
  try {
    const folder = uploadTarget === "cover" ? "covers" : "avatars";
    const ready = await prepareUpload(file, "image", uploadTarget === "cover" ? 1600 : 512);
    const result = await fb.uploadFile(`${folder}/${ctx.me().uid}`, ready.file);
    playSound("uploadDone");
    if (uploadTarget === "cover") {
      draft.coverURL = result.url;
      draft.coverPos = { x: 0, y: 0, z: 1 };
    } else {
      draft.photoURL = result.url;
      draft.avatarPos = { x: 0, y: 0, z: 1 };
    }
    fillForm();
    paint();
    toast("Picture added. Save to publish it.");
  } catch (err) {
    toast(errMsg(err));
  } finally {
    busy(button, false);
  }
}

async function save() {
  const name = (draft.displayName || "").trim();
  if (name.length < 2 || name.length > 32) return toast("Display name must be 2 to 32 characters");
  const btn = $("#pfSave");
  busy(btn, true, "Saving");
  try {
    const next = await fb.saveProfile({
      displayName: name,
      status: (draft.status || "").trim().slice(0, 60),
      bio: (draft.bio || "").trim().slice(0, 200),
      accent: accentOf(draft),
      avatarShape: draft.avatarShape === "squircle" ? "squircle" : "circle",
      photoURL: draft.photoURL || "",
      avatarPos: draft.avatarPos,
      coverURL: draft.coverURL || "",
      coverPos: draft.coverPos
    });
    ctx.setMe(next);
    playSound("confirm");
    toast("Profile saved");
    editing = false;
    $("#pfEditor").classList.add("hidden");
    $("#pfEditBtn").innerHTML = `${icon("pen")}<span>Edit profile</span>`;
  } catch (err) {
    toast(errMsg(err));
  } finally {
    busy(btn, false);
  }
}

async function runCheck() {
  const btn = $("#pfHealth");
  const out = $("#pfHealthOut");
  btn.disabled = true;
  out.classList.remove("hidden");
  out.innerHTML = `<li class="none">Checking the database, feed and photo storage…</li>`;
  try {
    const rows = await fb.runHealthCheck();
    out.innerHTML = rows
      .map(r => `<li class="item health-row ${r.ok ? "ok" : "bad"}"><span class="pill ${r.ok ? "green" : "red"}">${r.ok ? "OK" : "Fix"}</span><div class="grow"><b>${esc(r.name)}</b><small>${esc(r.message)}</small></div></li>`)
      .join("");
  } catch (err) {
    out.innerHTML = "";
    out.classList.add("hidden");
    toast(errMsg(err));
  } finally {
    btn.disabled = false;
  }
}
