// Profile: live editor (name, status, bio, colour, photo shape, drag and zoom) and my own posts.
import * as fb from "./firebase.js";
import { $, $$, esc, toast, busy, errMsg, COLORS, LIMIT_MB, clamp, initials, accentOf, posStyle, shrinkImage } from "./ui.js";
import { icon } from "./icons.js";
import { PostList, mountComposer } from "./feed.js";

let ctx = null;
let built = false;
let draft = null;
let uploadTarget = "cover";
let myPosts = null;

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
  fillForm();
  paint();
}

function build() {
  built = true;
  $("#meView").innerHTML = `
    <div class="page profile-page">
      <div class="pf-preview card-glass">
        <div class="cover" id="pfCover">
          <img id="pfCoverImg" alt="" draggable="false" hidden>
          <span class="cover-hint">Drag to move</span>
        </div>
        <div class="pf-id">
          <div class="pf-av" id="pfAv" title="Drag to move">
            <img id="pfAvImg" alt="" draggable="false" hidden>
            <span id="pfAvInit"></span>
          </div>
          <div class="pf-name">
            <h2 id="pfName"></h2>
            <p id="pfStatus"></p>
            <small id="pfEid"></small>
          </div>
        </div>
        <p class="pf-bio" id="pfBio"></p>
      </div>

      <div class="card-glass pf-tools">
        <div class="pf-row">
          <button class="btn sm ghost" type="button" id="pfCoverBtn">${icon("image")}Cover photo</button>
          <label class="range">Cover zoom <input type="range" id="pfCoverZoom" min="1" max="3" step="0.01"></label>
          <button class="btn sm ghost" type="button" id="pfCoverReset">Reset</button>
        </div>
        <div class="pf-row">
          <button class="btn sm ghost" type="button" id="pfAvBtn">${icon("user")}Profile photo</button>
          <label class="range">Photo zoom <input type="range" id="pfAvZoom" min="1" max="3" step="0.01"></label>
          <button class="btn sm ghost" type="button" id="pfAvReset">Reset</button>
        </div>
        <div class="pf-grid">
          <label>Display name <input id="pfNameIn" maxlength="32" autocomplete="name"></label>
          <label>Status <input id="pfStatusIn" maxlength="60" placeholder="Studying, Busy, Available"></label>
          <label class="wide">Bio <textarea id="pfBioIn" maxlength="200" rows="2" placeholder="A line about you"></textarea></label>
          <div class="wide">
            <span class="hint">Accent colour</span>
            <div class="swatches" id="pfColors"></div>
          </div>
          <div class="wide">
            <span class="hint">Photo shape</span>
            <div class="seg" id="pfShape">
              <button type="button" data-shape="circle">Circle</button>
              <button type="button" data-shape="squircle">Rounded</button>
            </div>
          </div>
        </div>
        <div class="health">
          <div class="pf-row">
            <button class="btn sm ghost" type="button" id="pfHealth">${icon("sparkle")}Check my setup</button>
            <small class="hint">Shows exactly what is not working, if anything.</small>
          </div>
          <ul class="list plain" id="pfHealthOut"></ul>
        </div>
        <div class="pf-save"><button class="btn" type="button" id="pfSave">Save profile</button></div>
        <input type="file" id="pfFile" accept="image/*" hidden>
      </div>

      <section class="me-posts">
        <h3>My posts</h3>
        <button class="btn" type="button" id="mePostToggle">＋ Create post</button>
        <div id="meComposer" class="hidden"></div>
        <div id="myPosts"></div>
      </section>
      <section class="card-glass about-emarni">
        <h2>About Emarni</h2>
        <p class="about-tagline">Connecting People. Building a Better Digital Future.</p>
        <p>Emarni is a messaging platform developed by Raflido Studios, a software company from Bangladesh dedicated to innovation and meaningful technological advancement.</p>
        <p>The journey of Emarni began with a vision in 2024: to create a communication platform that brings people closer while promoting a safer, cleaner, and more respectful digital environment.</p>
        <p>At Emarni, we believe technology should serve humanity and contribute to a better world. Our mission is to make communication accessible, secure, and meaningful for everyone.</p>
        <h3>Our Mission</h3>
        <p>Our mission is to create a digital environment where people can communicate freely and confidently without exposure to harmful or inappropriate activities.</p>
        <p>Emarni is designed with security and user protection at its core. Through intelligent moderation bots and advanced security measures, we aim to prevent inappropriate activities and maintain a positive experience for our users.</p>
        <p>We are committed to continuously improving our platform to make it more secure, reliable, and accessible.</p>
        <h3>Our Vision</h3>
        <p>We envision a future where communication is not limited by internet access or data costs.</p>
        <p>By 2035, our goal is to enable people around the world to communicate without requiring a conventional mobile data package or internet subscription.</p>
        <p>We believe that access to communication should be a fundamental part of a connected world, and we are working toward making this vision a reality.</p>
        <h3>Emarni Radio &amp; TV</h3>
        <p>As part of our long-term vision, Raflido Studios plans to introduce Emarni Radio &amp; TV, bringing satellite-based radio and television broadcasting to the Emarni platform.</p>
        <p>Our goal is to make radio and television accessible to users without requiring mobile data or an internet connection.</p>
        <p>We also envision a platform where users can create and operate their own radio and television stations, allowing them to share their creativity, ideas, and content with audiences around the world.</p>
        <p>These initiatives represent our commitment to expanding the possibilities of digital communication and entertainment.</p>
        <h3>Developed by Raflido Studios</h3>
        <p>Emarni is proudly developed by Raflido Studios, a Bangladesh-based software company focused on building innovative digital products and technological solutions.</p>
        <p>All intellectual property rights and copyrights associated with Emarni are owned by Raflido Studios.</p>
        <h3>Our Commitment</h3>
        <p>At Emarni, we are committed to building more than just a messaging application.</p>
        <p>We are building a platform that brings people closer, encourages positive communication, and opens new possibilities for a connected digital future.</p>
        <p class="about-signoff">Emarni — A New Era of Communication.<br>Developed by Raflido Studios.</p>
      </section>
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
  $("#pfHealth").addEventListener("click", runCheck);

  bindDrag($("#pfCover"), "coverPos");
  bindDrag($("#pfAv"), "avatarPos");

  const composerRoot = $("#meComposer");
  $("#mePostToggle").addEventListener("click", () => {
    const opening = composerRoot.classList.contains("hidden");
    composerRoot.classList.toggle("hidden", !opening);
    $("#mePostToggle").textContent = opening ? "− Close post composer" : "＋ Create post";
    if (opening) composerRoot.querySelector("textarea")?.focus();
  });
  mountComposer(composerRoot);
  myPosts = new PostList($("#myPosts"), {
    source: "user",
    uid: ctx.me().uid,
    emptyText: "You have not posted yet. Share a photo, video or voice note."
  });
  myPosts.start();
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
  const stop = () => {
    start = null;
    box.classList.remove("dragging");
    fillForm();
  };
  box.addEventListener("pointerup", stop);
  box.addEventListener("pointercancel", stop);
}

function paint() {
  const d = draft;
  const accent = accentOf(d);

  const cover = $("#pfCover");
  const coverImg = $("#pfCoverImg");
  if (d.coverURL) {
    if (coverImg.getAttribute("src") !== d.coverURL) coverImg.src = d.coverURL;
    coverImg.style.cssText = posStyle(d.coverPos);
    coverImg.hidden = false;
    cover.style.background = "";
  } else {
    coverImg.hidden = true;
    cover.style.background = `radial-gradient(circle at 18% 20%, ${accent}66, transparent 60%), linear-gradient(135deg, #0a0a0a, #3f0d0d)`;
  }

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

  $("#pfName").textContent = d.displayName || "";
  $("#pfStatus").textContent = d.status || "";
  $("#pfEid").textContent = `Emarni ID: ${d.emarniId || ""}`;
  $("#pfBio").textContent = d.bio || "";

  $$("#pfShape [data-shape]").forEach(b => b.classList.toggle("on", b.dataset.shape === (d.avatarShape || "circle")));
  $$("#pfColors [data-c]").forEach(b => b.classList.toggle("on", b.dataset.c.toLowerCase() === accent.toLowerCase()));
  $("#pfCoverZoom").value = d.coverPos.z;
  $("#pfAvZoom").value = d.avatarPos.z;
}

function pickFile(target) {
  uploadTarget = target;
  $("#pfFile").click();
}

async function onFilePicked(event) {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  if (!file.type.startsWith("image/")) return toast("Choose a picture");
  const kind = uploadTarget === "cover" ? "cover" : "avatar";
  if (file.size > LIMIT_MB[kind] * 1048576) return toast(`Picture must be under ${LIMIT_MB[kind]} MB`);

  const button = uploadTarget === "cover" ? $("#pfCoverBtn") : $("#pfAvBtn");
  busy(button, true, "Uploading");
  try {
    const folder = uploadTarget === "cover" ? "covers" : "avatars";
    const small = await shrinkImage(file, uploadTarget === "cover" ? 1600 : 512);
    const result = await fb.uploadFile(`${folder}/${ctx.me().uid}`, small);
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
    toast("Profile saved");
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
  out.innerHTML = `<li class="none">Checking the database, feed and photo storage...</li>`;
  try {
    const rows = await fb.runHealthCheck();
    out.innerHTML = rows
      .map(r => `<li class="item health-row ${r.ok ? "ok" : "bad"}"><span class="pill ${r.ok ? "green" : "red"}">${r.ok ? "OK" : "Fix"}</span><div class="grow"><b>${esc(r.name)}</b><small>${esc(r.message)}</small></div></li>`)
      .join("");
  } catch (err) {
    out.innerHTML = "";
    toast(errMsg(err));
  } finally {
    btn.disabled = false;
  }
}
