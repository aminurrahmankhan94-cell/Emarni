// Feed: posts (text, photo, video, voice), likes, comments and replies.
import * as fb from "./firebase.js";
import { $, $$, esc, toast, avatarHTML, timeAgo, busy, errMsg, fileKind, LIMIT_MB, askText, pop } from "./ui.js";

let ctx = null;
const cards = new Map(); // postId -> { el, post, likes, comments, replyTo, unsubs }
let pendingFile = null; // { file, kind }
let recorder = null;
let recordChunks = [];

export function initFeed(context) {
  ctx = context;
  bindComposer();
  fb.watchPosts(renderList, err => toast(errMsg(err)));
}

// Called when directory data changes so names and photos stay current.
export function refreshFeed() {
  cards.forEach(card => {
    paintHeader(card);
    paintComments(card);
  });
}

function renderList(posts) {
  const feedEl = $("#feedList");
  const keep = new Set(posts.map(post => post.id));
  cards.forEach((card, id) => {
    if (!keep.has(id)) {
      card.unsubs.forEach(off => off());
      card.el.remove();
      cards.delete(id);
    }
  });
  posts.forEach((post, index) => {
    let card = cards.get(post.id);
    if (!card) {
      card = buildCard(post);
      cards.set(post.id, card);
    }
    card.post = post;
    if (feedEl.children[index] !== card.el) feedEl.insertBefore(card.el, feedEl.children[index] || null);
    paintHeader(card);
  });
  $("#feedEmpty").classList.toggle("hidden", posts.length > 0);
}

function buildCard(post) {
  const el = document.createElement("article");
  el.className = "post";
  el.innerHTML = `
    <header class="ph">
      <div class="who"></div>
      <button class="icon-btn more" type="button" aria-label="More options">⋯</button>
    </header>
    <p class="ptext"></p>
    <div class="pmedia"></div>
    <footer class="pact">
      <button class="act-like" type="button" aria-pressed="false"><span class="heart">♥</span><b>0</b></button>
      <button class="act-cm" type="button"><span>💬</span><b>0</b></button>
    </footer>
    <section class="cbox hidden">
      <ul class="clist"></ul>
      <form class="cform">
        <div class="replying hidden"><span></span><button class="link" type="button">Cancel</button></div>
        <div class="crow">
          <input maxlength="500" placeholder="Write a comment…" autocomplete="off">
          <button class="btn sm" type="submit">Send</button>
        </div>
      </form>
    </section>`;

  const text = el.querySelector(".ptext");
  text.textContent = post.text || "";
  text.hidden = !post.text;
  el.querySelector(".pmedia").innerHTML = mediaHTML(post);

  const card = { el, post, likes: {}, comments: {}, replyTo: null, unsubs: [] };
  wire(card);
  card.unsubs.push(
    fb.onValue(fb.ref(fb.db, `postLikes/${post.id}`), snap => {
      card.likes = snap.val() || {};
      paintActions(card);
    })
  );
  card.unsubs.push(
    fb.onValue(fb.ref(fb.db, `postComments/${post.id}`), snap => {
      card.comments = snap.val() || {};
      paintActions(card);
      paintComments(card);
    })
  );
  return card;
}

function mediaHTML(post) {
  if (!post.mediaURL) return "";
  const url = esc(post.mediaURL);
  if (post.mediaType === "image") return `<a href="${url}" target="_blank" rel="noopener"><img class="pm-img" loading="lazy" alt="" src="${url}"></a>`;
  if (post.mediaType === "video") return `<video class="pm-vid" controls playsinline preload="metadata" src="${url}"></video>`;
  if (post.mediaType === "audio") {
    return `<div class="pm-aud"><span>🎙️ Voice &amp; audio</span><audio controls preload="metadata" src="${url}"></audio></div>`;
  }
  return "";
}

function wire(card) {
  const el = card.el;
  el.querySelector(".act-like").addEventListener("click", () => toggleLike(card));
  el.querySelector(".act-cm").addEventListener("click", () => el.querySelector(".cbox").classList.toggle("hidden"));
  el.querySelector(".more").addEventListener("click", () => moreMenu(card));
  el.querySelector(".cform").addEventListener("submit", event => submitComment(event, card));
  el.querySelector(".replying button").addEventListener("click", () => setReply(card, null));
  el.querySelector(".clist").addEventListener("click", event => {
    const btn = event.target.closest("[data-act]");
    if (btn) commentAction(card, btn);
  });
}

function paintHeader(card) {
  const author = ctx.author(card.post.uid) || { displayName: "Emarni user" };
  const status = author.status ? ` · ${esc(author.status)}` : "";
  card.el.querySelector(".who").innerHTML = `${avatarHTML(author, "sm")}
    <div><b>${esc(author.displayName)}</b><small>${timeAgo(card.post.createdAt)}${status}</small></div>`;
}

function countComments(map) {
  return Object.values(map).reduce((total, comment) => total + 1 + Object.keys(comment.replies || {}).length, 0);
}

function paintActions(card) {
  const mine = Boolean(card.likes[ctx.me().uid]);
  const like = card.el.querySelector(".act-like");
  like.classList.toggle("on", mine);
  like.setAttribute("aria-pressed", String(mine));
  like.querySelector("b").textContent = Object.keys(card.likes).length;
  card.el.querySelector(".act-cm b").textContent = countComments(card.comments);
}

async function toggleLike(card) {
  const on = !card.likes[ctx.me().uid];
  if (on) pop(card.el.querySelector(".heart"));
  try {
    await fb.setLike(card.post.id, on);
  } catch (err) {
    toast(errMsg(err));
  }
}

const byTime = (a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0);

function paintComments(card) {
  const list = card.el.querySelector(".clist");
  const me = ctx.me().uid;
  const items = Object.entries(card.comments)
    .map(([id, c]) => ({
      id,
      ...c,
      replies: Object.entries(c.replies || {})
        .map(([rid, r]) => ({ id: rid, ...r }))
        .sort(byTime)
    }))
    .sort(byTime);
  if (!items.length) {
    list.innerHTML = `<li class="cempty">No comments yet. Start the conversation.</li>`;
    return;
  }
  list.innerHTML = items
    .map(c => commentHTML(c, null, me) + c.replies.map(r => commentHTML(r, c.id, me, true)).join(""))
    .join("");
}

function commentHTML(c, parentId, me, isReply = false) {
  const author = ctx.author(c.uid) || { displayName: "Emarni user" };
  const mine = c.uid === me;
  return `<li class="citem${isReply ? " reply" : ""}" data-cid="${esc(c.id)}" data-parent="${esc(parentId || "")}">
    ${avatarHTML(author, "xs")}
    <div class="cbody">
      <div class="cmeta"><b>${esc(author.displayName)}</b><small>${timeAgo(c.createdAt)}</small></div>
      <p>${esc(c.text)}</p>
      <div class="cacts">
        ${isReply ? "" : `<button type="button" data-act="reply">Reply</button>`}
        ${mine ? `<button type="button" data-act="del">Delete</button>` : ""}
      </div>
    </div>
  </li>`;
}

function commentAction(card, btn) {
  const item = btn.closest(".citem");
  const cid = item.dataset.cid;
  const parent = item.dataset.parent || null;
  if (btn.dataset.act === "reply") {
    setReply(card, { id: cid, name: item.querySelector(".cmeta b").textContent });
    return;
  }
  if (btn.dataset.act === "del") {
    if (!confirm("Delete this comment?")) return;
    fb.deleteComment(card.post.id, parent, cid).catch(err => toast(errMsg(err)));
  }
}

function setReply(card, target) {
  card.replyTo = target;
  const box = card.el.querySelector(".replying");
  box.classList.toggle("hidden", !target);
  if (target) {
    box.querySelector("span").textContent = `Replying to ${target.name}`;
    card.el.querySelector(".cform input").focus();
  }
}

async function submitComment(event, card) {
  event.preventDefault();
  const input = card.el.querySelector(".cform input");
  const text = input.value.trim();
  if (!text) return;
  const btn = card.el.querySelector(".cform .btn");
  busy(btn, true, "…");
  try {
    await fb.addComment(card.post.id, text, card.replyTo?.id || null);
    input.value = "";
    setReply(card, null);
  } catch (err) {
    toast(errMsg(err));
  } finally {
    busy(btn, false);
  }
}

async function moreMenu(card) {
  if (card.post.uid === ctx.me().uid) {
    if (!confirm("Delete this post? This cannot be undone.")) return;
    try {
      await fb.deletePost(card.post);
      toast("Post deleted");
    } catch (err) {
      toast(errMsg(err));
    }
    return;
  }
  const reason = await askText({ title: "Report post", placeholder: "What is wrong with this post?", okText: "Report" });
  if (!reason) return;
  try {
    await fb.reportPost(card.post, reason);
    toast("Thanks. Admins will review it.");
  } catch (err) {
    toast(errMsg(err));
  }
}

// ---------- Composer ----------
function bindComposer() {
  $$("[data-attach]").forEach(btn => {
    btn.addEventListener("click", () => {
      const input = $("#postFile");
      input.accept = { image: "image/*", video: "video/*", audio: "audio/*" }[btn.dataset.attach];
      input.click();
    });
  });
  $("#postFile").addEventListener("change", event => setPending(event.target.files[0]));
  $("#postPreview").addEventListener("click", event => {
    if (event.target.closest("[data-clear]")) setPending(null);
  });
  $("#recordBtn").addEventListener("click", event => toggleRecord(event.currentTarget));
  $("#postForm").addEventListener("submit", submitPost);
}

function setPending(file) {
  $("#postFile").value = "";
  if (!file) {
    pendingFile = null;
  } else {
    const kind = fileKind(file);
    if (!kind) return toast("Choose a photo, video or audio file");
    if (file.size > LIMIT_MB[kind] * 1048576) return toast(`${kind} files must be under ${LIMIT_MB[kind]} MB`);
    pendingFile = { file, kind };
  }
  const preview = $("#postPreview");
  preview.classList.toggle("hidden", !pendingFile);
  const icon = { image: "🖼️", video: "🎬", audio: "🎙️" };
  preview.innerHTML = pendingFile
    ? `<span class="chip-file">${icon[pendingFile.kind]} ${esc(pendingFile.file.name)}</span>
       <button class="link" type="button" data-clear>Remove</button>`
    : "";
}

async function toggleRecord(btn) {
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
  recordChunks = [];
  recorder.ondataavailable = event => {
    if (event.data.size) recordChunks.push(event.data);
  };
  recorder.onstop = () => {
    stream.getTracks().forEach(track => track.stop());
    const type = recorder.mimeType || "audio/webm";
    const ext = type.includes("ogg") ? "ogg" : "webm";
    const file = new File([new Blob(recordChunks, { type })], `voice-${Date.now()}.${ext}`, { type });
    recorder = null;
    btn.classList.remove("rec");
    btn.textContent = "🎙️ Record";
    setPending(file);
  };
  recorder.start();
  btn.classList.add("rec");
  btn.textContent = "⏹ Stop";
}

async function submitPost(event) {
  event.preventDefault();
  const text = $("#postText").value.trim();
  if (!text && !pendingFile) return toast("Write something or attach a photo, video or voice note");
  const btn = $("#postBtn");
  const bar = $("#postProg");
  busy(btn, true, "Posting…");
  try {
    let media = null;
    if (pendingFile) {
      bar.classList.remove("hidden");
      bar.firstElementChild.style.width = "0%";
      media = await fb.uploadFile(`media/${ctx.me().uid}`, pendingFile.file, pct => {
        bar.firstElementChild.style.width = `${Math.round(pct * 100)}%`;
      });
    }
    await fb.createPost({
      text,
      mediaType: media ? pendingFile.kind : "none",
      mediaURL: media?.url,
      mediaPath: media?.path
    });
    $("#postText").value = "";
    setPending(null);
    toast("Posted ✨");
  } catch (err) {
    toast(errMsg(err));
  } finally {
    busy(btn, false);
    bar.classList.add("hidden");
  }
}
