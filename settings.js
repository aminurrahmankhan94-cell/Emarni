// Settings: profile, screen layout and appearance, notifications, media checks, and account.
import * as fb from "./firebase.js";
import { $, esc, toast, errMsg, busy, avatarHTML, openDialog } from "./ui.js";
import { icon } from "./icons.js";
import { getPref, setPref, resetPrefs, onPrefs, currentDevice } from "./prefs.js";
import { enableNotifications, permissionState } from "./notify.js";

let ctx = null;
let built = false;

export function initSettings(context) {
  ctx = context;
  onPrefs(() => {
    if (built) paint();
  });
}

export function onSettingsShow() {
  if (!built) build();
  paint();
}

const toggle = (key, label, hint) => `
  <div class="set-item">
    <div class="set-text"><b>${label}</b>${hint ? `<small>${hint}</small>` : ""}</div>
    <button type="button" class="switch" role="switch" data-pref="${key}" aria-label="${label}" aria-checked="false"><span></span></button>
  </div>`;

function build() {
  built = true;
  $("#settingsView").innerHTML = `
    <div class="page settings">
      <header class="page-head">
        <div>
          <h1>Settings</h1>
          <p class="hint">Saved on this device. Changes apply straight away.</p>
        </div>
      </header>

      <section class="set-card card-glass">
        <h3>${icon("user")}Profile</h3>
        <div class="set-profile" id="setProfile"></div>
        <div class="set-grid">
          <label>Display name <input id="setName" maxlength="32" autocomplete="name"></label>
          <label>Status <input id="setStatus" maxlength="60" placeholder="Studying, Busy, Available"></label>
        </div>
        <div class="set-actions">
          <button class="btn sm" type="button" data-act="saveQuick">Save profile</button>
          <button class="btn sm ghost" type="button" data-go="me">Photo and cover</button>
          <button class="btn sm ghost" type="button" data-act="copyId">Copy my Emarni ID</button>
        </div>
      </section>

      <section class="set-card card-glass">
        <h3>${icon("device")}Screen and appearance</h3>
        <div class="set-item">
          <div class="set-text"><b>Screen layout</b><small>Showing now: <span id="setDevice"></span>. Auto follows the size of the window.</small></div>
          <div class="seg tri">
            <button type="button" data-pref="layout" data-value="auto">Auto</button>
            <button type="button" data-pref="layout" data-value="phone">Phone</button>
            <button type="button" data-pref="layout" data-value="desktop">Desktop</button>
          </div>
        </div>
        ${toggle("fog", "Red fog background", "The soft, slowly moving red glow behind every screen")}
        ${toggle("reduceMotion", "Reduce motion", "Turns off most animations")}
        ${toggle("compact", "Compact spacing", "Fits more on the screen")}
        ${toggle("largeText", "Larger text", "Makes text and buttons a little bigger")}
      </section>

      <section class="set-card card-glass">
        <h3>${icon("bell")}Notifications</h3>
        <div class="set-item">
          <div class="set-text"><b>Notifications on this device</b><small id="setNotifyState"></small></div>
          <button class="btn sm" type="button" data-act="notify">Turn on</button>
        </div>
        ${toggle("sound", "Sound for new messages", "A short chime when something arrives")}
        ${toggle("cards", "In-app cards", "A card at the top right when something arrives")}
        ${toggle("osNotify", "Phone and desktop notifications", "Shown when Emarni is in the background")}
        ${toggle("preview", "Show message text", "Off hides the text and shows New message")}
      </section>

      <section class="set-card card-glass">
        <h3>${icon("sparkle")}Photos, videos and voice notes</h3>
        <p class="hint">Use these checks to find out whether media can be sent. A failed check shows the exact reason and the Firebase code.</p>
        <div class="set-actions">
          <button class="btn sm ghost" type="button" data-act="testImage">Test photo</button>
          <button class="btn sm ghost" type="button" data-act="testVideo">Test video</button>
          <button class="btn sm ghost" type="button" data-act="testAudio">Test voice note</button>
          <button class="btn sm" type="button" data-act="fullCheck">Full setup check</button>
        </div>
        <ul class="diag" id="setDiag"></ul>
      </section>

      <section class="set-card card-glass">
        <h3>${icon("key")}Account</h3>
        <div class="set-item">
          <div class="set-text"><b>Email</b><small id="setEmail"></small></div>
        </div>
        <div class="set-actions">
          <button class="btn sm ghost" type="button" data-act="resetPw">Change password by email</button>
          <button class="btn sm danger" type="button" data-act="signout">Sign out</button>
        </div>
      </section>

      <section class="set-card card-glass">
        <h3>${icon("info")}About and data</h3>
        <div class="set-actions">
          <button class="btn sm ghost" type="button" data-go="about">About Emarni</button>
          <button class="btn sm ghost" type="button" data-act="privacy">Privacy notice</button>
          <button class="btn sm ghost" type="button" data-act="resetPrefs">Reset settings to default</button>
        </div>
      </section>
    </div>`;

  const root = $("#settingsView");
  root.addEventListener("click", event => {
    const seg = event.target.closest("[data-pref][data-value]");
    if (seg) return setPref(seg.dataset.pref, seg.dataset.value);
    const sw = event.target.closest(".switch[data-pref]");
    if (sw) return setPref(sw.dataset.pref, !getPref(sw.dataset.pref));
    const act = event.target.closest("[data-act]");
    if (act) runAction(act.dataset.act, act);
  });
}

function paint() {
  const root = $("#settingsView");
  root.querySelectorAll("[data-pref][data-value]").forEach(b => b.classList.toggle("on", getPref(b.dataset.pref) === b.dataset.value));
  root.querySelectorAll(".switch[data-pref]").forEach(s => {
    const on = Boolean(getPref(s.dataset.pref));
    s.classList.toggle("on", on);
    s.setAttribute("aria-checked", String(on));
  });
  $("#setDevice").textContent = currentDevice() === "phone" ? "Phone" : "Desktop";
  const state = permissionState();
  $("#setNotifyState").textContent =
    state === "granted"
      ? "On"
      : state === "denied"
        ? "Blocked in the browser settings"
        : state === "unsupported"
          ? "Not supported in this browser"
          : "Off";
  const user = fb.getCurrentUser();
  $("#setEmail").textContent = user?.email || "Signed in with an Emarni ID, so there is no email on this account";
  const me = ctx?.me();
  if (me) {
    $("#setProfile").innerHTML = `${avatarHTML(me, "xl")}<div class="set-who"><b>${esc(me.displayName)}</b><small>Emarni ID ${esc(me.emarniId)}</small></div>`;
    if (document.activeElement?.id !== "setName") $("#setName").value = me.displayName || "";
    if (document.activeElement?.id !== "setStatus") $("#setStatus").value = me.status || "";
  }
}

function showDiag(rows) {
  $("#setDiag").innerHTML = rows
    .map(
      r => `<li class="diag-row ${r.ok ? "ok" : "bad"}">
        <span class="pill ${r.ok ? "green" : "red"}">${r.ok ? "OK" : "Fix"}</span>
        <div><b>${esc(r.name)}</b><small>${esc(r.message)}</small></div>
      </li>`
    )
    .join("");
}

async function runAction(name, btn) {
  try {
    if (name === "saveQuick") return await saveQuick(btn);
    if (name === "copyId") {
      navigator.clipboard?.writeText(ctx.me().emarniId);
      return toast("Emarni ID copied");
    }
    if (name === "notify") {
      await enableNotifications();
      return paint();
    }
    if (name === "testImage" || name === "testVideo" || name === "testAudio") {
      const kind = name.replace("test", "").toLowerCase();
      return await runTest(btn, kind);
    }
    if (name === "fullCheck") return await fullCheck(btn);
    if (name === "resetPw") return await resetPassword();
    if (name === "signout") {
      await fb.signOutAccount().catch(() => {});
      return location.reload();
    }
    if (name === "privacy") return openDialog("#dlgNotice");
    if (name === "resetPrefs") {
      if (confirm("Reset every setting on this device to the default?")) {
        resetPrefs();
        toast("Settings reset");
      }
    }
  } catch (err) {
    toast(errMsg(err));
  }
}

async function saveQuick(btn) {
  const displayName = $("#setName").value.trim();
  const status = $("#setStatus").value.trim().slice(0, 60);
  if (displayName.length < 2 || displayName.length > 32) return toast("Display name must be 2 to 32 characters");
  busy(btn, true, "Saving");
  try {
    const next = await fb.saveProfile({ displayName, status });
    ctx.setMe(next);
    toast("Profile saved");
  } finally {
    busy(btn, false);
  }
}

async function runTest(btn, kind) {
  busy(btn, true, "Testing");
  showDiag([{ name: `${kind} upload`, ok: true, message: "Testing..." }]);
  try {
    const row = await checkMedia(kind);
    showDiag([row]);
    toast(row.ok ? `${kind} upload works` : `${kind} upload failed. See the reason below.`);
  } finally {
    busy(btn, false);
  }
}

// Uploads a tiny test file of the given kind and removes it again.
async function checkMedia(kind) {
  const label = { image: "Photo upload", video: "Video upload", audio: "Voice note upload" }[kind];
  try {
    await fb.testMediaUpload(kind);
    return { name: label, ok: true, message: "Works. Photos, videos and voice notes can be sent." };
  } catch (err) {
    return { name: label, ok: false, message: errMsg(err) };
  }
}

async function fullCheck(btn) {
  busy(btn, true, "Checking");
  showDiag([{ name: "Full setup check", ok: true, message: "Checking the database, the feed and every kind of upload..." }]);
  try {
    const rows = await fb.runHealthCheck();
    rows.push(await checkMedia("video"));
    rows.push(await checkMedia("audio"));
    showDiag(rows);
  } catch (err) {
    showDiag([{ name: "Full setup check", ok: false, message: errMsg(err) }]);
  } finally {
    busy(btn, false);
  }
}

async function resetPassword() {
  const email = fb.getCurrentUser()?.email;
  if (!email) return toast("This account has no email. Password reset works for email accounts only.");
  await fb.sendResetEmail(email);
  toast("Password reset link sent to your email");
}
