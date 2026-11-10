// Post composer: inline (in feed) + dialog ("What's on your mind?"). One media per post.
import * as fb from "./firebase.js";
import { $, esc, toast, errMsg, avatarHTML, busy, openDialog } from "./ui.js";
import { icon } from "./icons.js";
import { kindOf, checkSize, prepareUpload } from "./media.js";
import { playSound } from "./sounds.js";

const CHAR_LIMIT = 2000;
let ctx = null;
let wired = false;

// Shared recorder state (used by both inline and dialog composers)
let recorder = null;
let recChunks = [];
let recStream = null;

function setRecLabel(btn, on) {
  if (!btn) return;
  btn.classList.toggle("rec", on);
  btn.innerHTML = `${icon(on ? "stop" : "mic")}<span>${on ? "Stop" : "Voice"}</span>`;
}

async function startRecording(btn) {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    toast("Allow microphone access to record a voice note");
    return null;
  }
  recStream = stream;
  recorder = new MediaRecorder(stream);
  recChunks = [];
  recorder.ondataavailable = e => { if (e.data.size) recChunks.push(e.data); };
  return new Promise(resolve => {
    recorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      const type = recorder.mimeType || "audio/webm";
      const ext = type.includes("ogg") ? "ogg" : type.includes("mp4") ? "m4a" : "webm";
      const file = new File([new Blob(recChunks, { type })], `voice-${Date.now()}.${ext}`, { type });
      recorder = null; recStream = null;
      setRecLabel(btn, false);
      resolve(file);
    };
    recorder.start();
    setRecLabel(btn, true);
  });
}

function stopRecording() {
  if (recorder) recorder.stop();
}

// Pick + validate a file. Returns { file, kind, url, previewable } or null (toast shown).
function chooseFile(file) {
  const kind = kindOf(file);
  if (kind === "file") { toast("Choose a photo, video or audio file"); return null; }
  if (kind !== "image") {
    try { checkSize(file, kind); } catch (err) { toast(errMsg(err)); return null; }
  }
  const previewable = kind === "image"
    ? (/image\/(jpeg|png|webp|gif)/.test(file.type || "") || /\.(jpe?g|png|webp|gif)$/i.test(file.name || ""))
    : true;
  return { file, kind, url: URL.createObjectURL(file), previewable };
}

function previewHTML(pending) {
  if (!pending) return "";
  let media;
  if (pending.kind === "image") {
    media = pending.previewable
      ? `<img src="${pending.url}" alt="" draggable="false">`
      : `<span style="display:inline-flex;align-items:center;gap:6px;color:var(--text-dim);font-size:12px;">${icon("image")}<span>${esc(pending.file.name)}</span></span>`;
  } else if (pending.kind === "video") {
    media = `<video src="${pending.url}" controls playsinline preload="metadata"></video>`;
  } else {
    media = `<span style="display:inline-flex;align-items:center;gap:8px;flex:1;">${icon("mic")}<audio src="${pending.url}" controls preload="metadata"></audio></span>`;
  }
  return `${media}<button class="icon-btn sm" type="button" data-clear aria-label="Remove media" style="margin-left:auto;flex-shrink:0;">${icon("x")}</button>`;
}

// ================= INLINE COMPOSER (mounted in feed) =================
export function mountComposer(root, context) {
  if (!root) return;
  const me = context?.me?.();
  const form = document.createElement("form");
  form.className = "post-composer";
  form.innerHTML = `
    <div class="pc-head">
      ${me ? avatarHTML(me, "sm") : ""}
      <textarea rows="2" maxlength="${CHAR_LIMIT}" placeholder="What's on your mind?"></textarea>
    </div>
    <div class="pc-preview hidden"></div>
    <div class="pc-progress hidden"><i></i></div>
    <div class="pc-tools">
      <div class="pc-attach">
        <button type="button" data-attach="image">${icon("image")}<span>Photo</span></button>
        <button type="button" data-attach="video">${icon("film")}<span>Video</span></button>
        <button type="button" data-attach="audio">${icon("music")}<span>Audio</span></button>
        <button type="button" data-rec>${icon("mic")}<span>Voice</span></button>
      </div>
      <div class="pc-meta">
        <span class="pc-count">0 / ${CHAR_LIMIT}</span>
        <button class="btn btn-primary sm" type="submit" disabled>Post</button>
      </div>
    </div>
    <input type="file" hidden>`;
  root.appendChild(form);

  const text = form.querySelector("textarea");
  const fileInput = form.querySelector('input[type="file"]');
  const preview = form.querySelector(".pc-preview");
  const bar = form.querySelector(".pc-progress");
  const submit = form.querySelector('button[type="submit"]');
  const count = form.querySelector(".pc-count");
  const recBtn = form.querySelector("[data-rec]");
  let pending = null;

  const refresh = () => {
    const len = text.value.length;
    count.textContent = `${len} / ${CHAR_LIMIT}`;
    count.classList.toggle("over", len > CHAR_LIMIT);
    submit.disabled = !(text.value.trim() || pending);
  };
  text.addEventListener("input", refresh);

  const clearPending = () => {
    if (pending?.url) URL.revokeObjectURL(pending.url);
    pending = null;
    preview.classList.add("hidden");
    preview.innerHTML = "";
    refresh();
  };
  const setPending = p => {
    if (pending?.url) URL.revokeObjectURL(pending.url);
    pending = p;
    if (p) {
      preview.innerHTML = previewHTML(p);
      preview.classList.remove("hidden");
    } else {
      preview.classList.add("hidden");
      preview.innerHTML = "";
    }
    refresh();
  };

  form.querySelectorAll("[data-attach]").forEach(btn => {
    btn.addEventListener("click", () => {
      fileInput.accept = { image: "image/*", video: "video/*", audio: "audio/*" }[btn.dataset.attach];
      fileInput.click();
    });
  });
  fileInput.addEventListener("change", e => {
    const f = e.target.files[0];
    fileInput.value = "";
    if (f) { const p = chooseFile(f); if (p) setPending(p); }
  });
  preview.addEventListener("click", e => {
    if (e.target.closest("[data-clear]")) clearPending();
  });
  recBtn.addEventListener("click", async () => {
    if (recorder) { stopRecording(); return; }
    const file = await startRecording(recBtn);
    if (file) { const p = chooseFile(file); if (p) setPending(p); }
  });

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const body = text.value.trim();
    if (!body && !pending) return toast("Write something or attach a photo, video or voice note");
    busy(submit, true, "Posting");
    try {
      let media = null;
      if (pending) {
        bar.classList.remove("hidden");
        bar.firstElementChild.style.width = "0%";
        const ready = await prepareUpload(pending.file, pending.kind);
        media = await fb.uploadFile(`media/${context.me().uid}`, ready.file, pct => {
          bar.firstElementChild.style.width = `${Math.round(pct * 100)}%`;
        });
      }
      await fb.createPost({
        text: body,
        mediaType: media ? pending.kind : "none",
        mediaURL: media?.url,
        mediaPath: media?.path
      });
      playSound("posted");
      toast("Post shared");
      text.value = "";
      clearPending();
    } catch (err) {
      toast(errMsg(err));
    } finally {
      busy(submit, false);
      bar.classList.add("hidden");
    }
  });
  refresh();
}

// ================= DIALOG COMPOSER (#dlgPost) =================
let dlgPending = null;

export function initPostbox(context) {
  ctx = context;
  if (wired) return;
  wired = true;
  document.addEventListener("click", e => {
    if (e.target.closest("[data-open-post]")) openPostbox();
  });
  const text = $("#pbText");
  const count = ensurePbCount();
  if (text) text.addEventListener("input", () => {
    if (count) {
      count.textContent = `${text.value.length} / ${CHAR_LIMIT}`;
      count.classList.toggle("over", text.value.length > CHAR_LIMIT);
    }
    refreshDlg();
  });
  $("#pbFile")?.addEventListener("change", e => {
    const f = e.target.files[0];
    e.target.value = "";
    if (f) { const p = chooseFile(f); if (p) setDlgPending(p); }
  });
  document.querySelectorAll("[data-pb]").forEach(btn => {
    btn.addEventListener("click", () => {
      const input = $("#pbFile");
      if (!input) return;
      input.accept = { image: "image/*", video: "video/*", audio: "audio/*" }[btn.dataset.pb];
      input.click();
    });
  });
  $("#pbRec")?.addEventListener("click", async () => {
    if (recorder) { stopRecording(); return; }
    const file = await startRecording($("#pbRec"));
    if (file) { const p = chooseFile(file); if (p) setDlgPending(p); }
  });
  $("#pbPreview")?.addEventListener("click", e => {
    if (e.target.closest("[data-pb-clear]") || e.target.closest("[data-clear]")) clearDlgPending();
  });
  $("#pbForm")?.addEventListener("submit", submitDlg);
}

function ensurePbCount() {
  // Add a character counter next to the submit row if S1's dialog doesn't have one.
  let c = $("#pbCount");
  if (c) return c;
  const submit = $("#pbSubmit");
  if (!submit) return null;
  c = document.createElement("span");
  c.id = "pbCount";
  c.className = "pb-count";
  c.textContent = `0 / ${CHAR_LIMIT}`;
  submit.parentElement?.insertBefore(c, submit);
  return c;
}

export function openPostbox() {
  const me = ctx?.me();
  if (!me) return;
  const av = $("#pbAv");
  if (av) av.innerHTML = avatarHTML(me, "sm");
  const name = $("#pbName");
  if (name) name.textContent = me.displayName || "";
  const text = $("#pbText");
  if (text) { text.value = ""; text.placeholder = `What's on your mind, ${me.displayName || "friend"}?`; }
  const err = $("#pbErr");
  if (err) err.textContent = "";
  clearDlgPending();
  refreshDlg();
  openDialog("#dlgPost");
  setTimeout(() => $("#pbText")?.focus(), 100);
}

function refreshDlg() {
  const hasText = ($("#pbText")?.value.trim().length || 0) > 0;
  const btn = $("#pbSubmit");
  if (btn) btn.disabled = !(hasText || dlgPending);
  const c = $("#pbCount");
  if (c) c.textContent = `${($("#pbText")?.value.length || 0)} / ${CHAR_LIMIT}`;
}

function setDlgPending(p) {
  if (dlgPending?.url) URL.revokeObjectURL(dlgPending.url);
  dlgPending = p;
  const box = $("#pbPreview");
  if (!box) return;
  if (p) {
    let media;
    if (p.kind === "image") {
      media = p.previewable
        ? `<img src="${p.url}" alt="" draggable="false">`
        : `<div class="pb-aud">${icon("image")}<span>${esc(p.file.name)} selected.</span></div>`;
    } else if (p.kind === "video") {
      media = `<video src="${p.url}" controls playsinline preload="metadata"></video>`;
    } else {
      media = `<div class="pb-aud">${icon("mic")}<audio src="${p.url}" controls preload="metadata"></audio></div>`;
    }
    box.innerHTML = `${media}<button class="icon-btn sm pb-x" type="button" data-pb-clear aria-label="Remove">${icon("x")}</button>`;
    box.classList.remove("hidden");
  } else {
    box.classList.add("hidden");
    box.innerHTML = "";
  }
  const err = $("#pbErr");
  if (err) err.textContent = "";
  refreshDlg();
}

function clearDlgPending() {
  if (dlgPending?.url) URL.revokeObjectURL(dlgPending.url);
  dlgPending = null;
  const box = $("#pbPreview");
  if (box) { box.classList.add("hidden"); box.innerHTML = ""; }
  refreshDlg();
}

function showDlgProgress(p, on) {
  const bar = $("#pbProg");
  if (!bar) return;
  bar.classList.toggle("hidden", !on);
  if (bar.firstElementChild) bar.firstElementChild.style.width = `${Math.round(p * 100)}%`;
}

async function submitDlg(event) {
  event.preventDefault();
  const text = ($("#pbText")?.value || "").trim();
  if (!text && !dlgPending) return;
  const btn = $("#pbSubmit");
  const err = $("#pbErr");
  if (err) err.textContent = "";
  busy(btn, true, "Posting");
  if (dlgPending) showDlgProgress(0, true);
  try {
    let media = null;
    if (dlgPending) {
      const ready = await prepareUpload(dlgPending.file, dlgPending.kind);
      media = await fb.uploadFile(`media/${ctx.me().uid}`, ready.file, p => showDlgProgress(p, true));
    }
    await fb.createPost({
      text,
      mediaType: media ? dlgPending.kind : "none",
      mediaURL: media?.url,
      mediaPath: media?.path
    });
    playSound("posted");
    toast("Post shared");
    clearDlgPending();
    const dlg = $("#dlgPost");
    dlg?.close?.();
  } catch (error) {
    if (err) err.textContent = errMsg(error);
    toast(errMsg(error));
  } finally {
    busy(btn, false);
    showDlgProgress(0, false);
    refreshDlg();
  }
}
