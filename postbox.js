// "Create post" dialog, in the Facebook style: text, plus photo, video, audio or a voice note.
import * as fb from "./firebase.js";
import { $, toast, errMsg, avatarHTML, busy, openDialog } from "./ui.js";
import { icon } from "./icons.js";
import { kindOf, checkSize, prepareUpload } from "./media.js";

let ctx = null;
let wired = false;
let pending = null; // { file, kind, url, previewable }
let recorder = null;
let chunks = [];

export function initPostbox(context) {
  ctx = context;
  if (wired) return;
  wired = true;

  document.addEventListener("click", event => {
    if (event.target.closest("[data-open-post]")) openPostbox();
  });
  $("#pbText").addEventListener("input", refresh);
  $("#pbFile").addEventListener("change", event => {
    const file = event.target.files[0];
    event.target.value = "";
    if (file) choose(file);
  });
  document.querySelectorAll("[data-pb]").forEach(btn => {
    btn.addEventListener("click", () => {
      const input = $("#pbFile");
      input.accept = { image: "image/*", video: "video/*", audio: "audio/*" }[btn.dataset.pb];
      input.click();
    });
  });
  $("#pbRec").addEventListener("click", toggleRecord);
  $("#pbPreview").addEventListener("click", event => {
    if (event.target.closest("[data-pb-clear]")) {
      clearPending();
      refresh();
    }
  });
  $("#pbForm").addEventListener("submit", submit);
}

export function openPostbox() {
  const me = ctx?.me();
  if (!me) return;
  $("#pbAv").innerHTML = avatarHTML(me, "sm");
  $("#pbName").textContent = me.displayName || "";
  $("#pbText").value = "";
  $("#pbText").placeholder = `What's on your mind, ${me.displayName || "friend"}?`;
  $("#pbErr").textContent = "";
  clearPending();
  refresh();
  openDialog("#dlgPost");
  setTimeout(() => $("#pbText").focus(), 100);
}

function refresh() {
  const hasText = $("#pbText").value.trim().length > 0;
  $("#pbSubmit").disabled = !(hasText || pending);
}

function choose(file) {
  const kind = kindOf(file);
  if (kind === "file") return toast("Choose a photo, video or audio file");
  if (kind !== "image") {
    try {
      checkSize(file, kind);
    } catch (err) {
      return toast(errMsg(err));
    }
  }
  clearPending();
  const previewable = kind !== "image" || /image\/(jpeg|png|webp|gif)/.test(file.type || "") || /\.(jpe?g|png|webp|gif)$/i.test(file.name || "");
  pending = { file, kind, url: URL.createObjectURL(file), previewable };
  paintPreview();
  $("#pbErr").textContent = "";
  refresh();
}

function clearPending() {
  if (pending?.url) URL.revokeObjectURL(pending.url);
  pending = null;
  const box = $("#pbPreview");
  box.classList.add("hidden");
  box.innerHTML = "";
}

function paintPreview() {
  const box = $("#pbPreview");
  let media;
  if (pending.kind === "image") {
    media = pending.previewable
      ? `<img src="${pending.url}" alt="">`
      : `<div class="pb-aud">${icon("image")}<span>${pending.file.name} selected. Preview is not available in this browser, but it will be sent as a JPG.</span></div>`;
  } else if (pending.kind === "video") {
    media = `<video src="${pending.url}" controls playsinline preload="metadata"></video>`;
  } else {
    media = `<div class="pb-aud">${icon("mic")}<audio src="${pending.url}" controls preload="metadata"></audio></div>`;
  }
  box.innerHTML = `${media}<button class="icon-btn sm pb-x" type="button" data-pb-clear aria-label="Remove">${icon("x")}</button>`;
  box.classList.remove("hidden");
}

function showProgress(p, on) {
  const bar = $("#pbProg");
  bar.classList.toggle("hidden", !on);
  bar.firstElementChild.style.width = `${Math.round(p * 100)}%`;
}

function setRecLabel(on) {
  const btn = $("#pbRec");
  btn.classList.toggle("rec", on);
  btn.innerHTML = `${icon(on ? "stop" : "mic")}${on ? "Stop" : "Voice"}`;
}

async function toggleRecord() {
  if (recorder) {
    recorder.stop();
    return;
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    toast("Allow microphone access to record a voice note");
    return;
  }
  recorder = new MediaRecorder(stream);
  chunks = [];
  recorder.ondataavailable = event => {
    if (event.data.size) chunks.push(event.data);
  };
  recorder.onstop = () => {
    stream.getTracks().forEach(track => track.stop());
    const type = recorder.mimeType || "audio/webm";
    const ext = type.includes("ogg") ? "ogg" : type.includes("mp4") ? "m4a" : "webm";
    const file = new File([new Blob(chunks, { type })], `voice-${Date.now()}.${ext}`, { type });
    recorder = null;
    setRecLabel(false);
    choose(file);
  };
  recorder.start();
  setRecLabel(true);
}

async function submit(event) {
  event.preventDefault();
  const text = $("#pbText").value.trim();
  if (!text && !pending) return;
  const btn = $("#pbSubmit");
  const err = $("#pbErr");
  err.textContent = "";
  busy(btn, true, "Posting");
  if (pending) showProgress(0, true);
  try {
    let media = null;
    if (pending) {
      const ready = await prepareUpload(pending.file, pending.kind);
      media = await fb.uploadFile(`media/${ctx.me().uid}`, ready.file, p => showProgress(p, true));
    }
    await fb.createPost({
      text,
      mediaType: media ? pending.kind : "none",
      mediaURL: media?.url,
      mediaPath: media?.path
    });
    toast("Post shared");
    clearPending();
    $("#dlgPost").close();
  } catch (error) {
    err.textContent = errMsg(error);
    toast(errMsg(error));
  } finally {
    busy(btn, false);
    showProgress(0, false);
    refresh();
  }
}
