// Posts: a reusable composer and post list, used by the Feed and by every profile.
import * as fb from "./firebase.js";
import { $, esc, toast, avatarHTML, timeAgo, busy, errMsg, askText, pop } from "./ui.js";
import { kindOf, checkSize, prepareUpload } from "./media.js";
import { playSound } from "./sounds.js";
import { icon } from "./icons.js";

let ctx = null;
let feed = null;
const byTime = (a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0);
const countComments = map =>
  Object.values(map).reduce((total, c) => total + 1 + Object.keys(c.replies || {}).length, 0);

export function initFeed(context) {
  ctx = context;
  mountComposer($("#feedComposer"));
  feed = new PostList($("#feedList"), { source: "all", emptyText: "No posts yet. Share the first one." });
  feed.start();
  document.querySelectorAll("[data-feed-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-feed-tab]").forEach(b => b.classList.toggle("on", b === btn));
      feed.setMode(btn.dataset.feedTab);
    });
  });
}

export function refreshFeed() {
  feed?.refresh();
}

function mediaHTML(post) {
  if (!post.mediaURL) return "";
  const url = esc(post.mediaURL);
  if (post.mediaType === "image") {
    return `<a href="${url}" target="_blank" rel="noopener"><img class="pm-img" loading="lazy" alt="" src="${url}"></a>`;
  }
  if (post.mediaType === "video") {
    return `<video class="pm-vid" controls playsinline preload="metadata" src="${url}"></video>`;
  }
  if (post.mediaType === "audio") {
    return `<div class="pm-aud"><span>${icon("mic")}Voice or audio</span><audio controls preload="metadata" src="${url}"></audio></div>`;
  }
  return "";
}

const commentHTML = (c, parentId, me, isReply = false) => {
  const author = ctx.author(c.uid) || { uid: c.uid, displayName: "Emarni user" };
  return `<li class="citem${isReply ? " reply" : ""}" data-cid="${esc(c.id)}" data-parent="${esc(parentId || "")}">
    ${avatarHTML(author, "xs")}
    <div class="cbody">
      <div class="cmeta">
        <button class="name-btn" type="button" data-user="${esc(c.uid)}">${esc(author.displayName)}</button>
        <small>${timeAgo(c.createdAt)}</small>
      </div>
      <p>${esc(c.text)}</p>
      <div class="cacts">
        ${isReply ? "" : `<button type="button" data-act="reply">Reply</button>`}
        ${c.uid === me ? `<button type="button" data-act="del">Delete</button>` : ""}
      </div>
    </div>
  </li>`;
};

// A list of posts. source "all" shows everyone; source "user" shows one person's posts.
export class PostList {
  constructor(container, { source = "all", uid = "", emptyText = "No posts yet." } = {}) {
    this.container = container;
    this.source = source;
    this.uid = uid;
    this.emptyText = emptyText;
    this.mode = "all";
    this.last = [];
    this.off = null;
    this.cards = new Map();
    this.list = document.createElement("div");
    this.list.className = "feed-items";
    this.empty = document.createElement("p");
    this.empty.className = "empty hidden";
    container.innerHTML = "";
    container.append(this.list, this.empty);
    this.list.addEventListener("click", event => {
      const who = event.target.closest("[data-user]");
      if (who) ctx.openUser(who.dataset.user);
    });
  }

  start() {
    if (this.off) return;
    const onList = list => {
      this.last = list;
      this.paint();
    };
    const onError = err => toast(errMsg(err));
    this.off = this.source === "user"
      ? fb.watchUserPosts(this.uid, onList, onError)
      : fb.watchPosts(onList, onError);
  }

  stop() {
    if (this.off) this.off();
    this.off = null;
    this.cards.forEach(card => card.unsubs.forEach(off => off()));
    this.cards.clear();
    this.container.innerHTML = "";
  }

  setMode(mode) {
    this.mode = mode;
    this.paint();
  }

  refresh() {
    this.paint();
  }

  visible() {
    if (this.mode !== "friends") return this.last;
    const friends = new Set([ctx.me().uid, ...ctx.friendIds()]);
    return this.last.filter(post => friends.has(post.uid));
  }

  paint() {
    const list = this.visible();
    const keep = new Set(list.map(post => post.id));
    this.cards.forEach((card, id) => {
      if (!keep.has(id)) {
        card.unsubs.forEach(off => off());
        card.el.remove();
        this.cards.delete(id);
      }
    });
    list.forEach((post, index) => {
      let card = this.cards.get(post.id);
      if (!card) {
        card = this.build(post);
        this.cards.set(post.id, card);
      }
      card.post = post;
      this.paintHeader(card);
      if (this.list.children[index] !== card.el) {
        this.list.insertBefore(card.el, this.list.children[index] || null);
      }
    });
    this.empty.textContent = this.mode === "friends" ? "No posts from friends yet." : this.emptyText;
    this.empty.classList.toggle("hidden", list.length > 0);
  }

  build(post) {
    const el = document.createElement("article");
    el.className = "post";
    el.innerHTML = `
      <header class="ph">
        <div class="who"></div>
        <button class="icon-btn sm" data-more type="button" aria-label="More options">${icon("more")}</button>
      </header>
      <p class="ptext"></p>
      <div class="pmedia"></div>
      <footer class="pact">
        <button class="act-like" type="button" aria-pressed="false"><span class="heart">${icon("heart")}</span><b>0</b></button>
        <button class="act-cm" type="button">${icon("chat")}<b>0</b></button>
      </footer>
      <section class="cbox hidden">
        <ul class="clist"></ul>
        <form class="cform">
          <div class="replying hidden"><span></span><button class="link" type="button">Cancel</button></div>
          <div class="crow">
            <input maxlength="500" placeholder="Write a comment" autocomplete="off">
            <button class="btn sm" type="submit">Send</button>
          </div>
        </form>
      </section>`;

    const card = { el, post, likes: {}, comments: {}, replyTo: null, unsubs: [] };
    const text = el.querySelector(".ptext");
    text.textContent = post.text || "";
    text.classList.toggle("hidden", !post.text);
    el.querySelector(".pmedia").innerHTML = mediaHTML(post);

    el.querySelector(".act-like").addEventListener("click", () => this.toggleLike(card));
    el.querySelector(".act-cm").addEventListener("click", () => el.querySelector(".cbox").classList.toggle("hidden"));
    el.querySelector("[data-more]").addEventListener("click", () => this.more(card));
    el.querySelector(".cform").addEventListener("submit", event => this.submitComment(event, card));
    el.querySelector(".replying button").addEventListener("click", () => this.setReply(card, null));
    el.querySelector(".clist").addEventListener("click", event => {
      const btn = event.target.closest("[data-act]");
      if (btn) this.commentAction(card, btn);
    });

    card.unsubs.push(
      fb.onValue(fb.ref(fb.db, `postLikes/${post.id}`), snap => {
        card.likes = snap.val() || {};
        this.paintActions(card);
      })
    );
    card.unsubs.push(
      fb.onValue(fb.ref(fb.db, `postComments/${post.id}`), snap => {
        card.comments = snap.val() || {};
        this.paintActions(card);
        this.paintComments(card);
      })
    );
    return card;
  }

  paintHeader(card) {
    const uid = card.post.uid;
    const author = ctx.author(uid) || { uid, displayName: "Emarni user" };
    const status = author.status ? ` · ${esc(author.status)}` : "";
    card.el.querySelector(".who").innerHTML = `
      <button class="who-btn" type="button" data-user="${esc(uid)}">
        ${avatarHTML(author, "sm")}
        <span class="who-txt"><b>${esc(author.displayName)}</b><small>${timeAgo(card.post.createdAt)}${status}</small></span>
      </button>`;
  }

  paintActions(card) {
    const mine = Boolean(card.likes[ctx.me().uid]);
    const like = card.el.querySelector(".act-like");
    like.classList.toggle("on", mine);
    like.setAttribute("aria-pressed", String(mine));
    like.querySelector("b").textContent = Object.keys(card.likes).length;
    card.el.querySelector(".act-cm b").textContent = countComments(card.comments);
  }

  paintComments(card) {
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
    list.innerHTML = items.length
      ? items.map(c => commentHTML(c, null, me) + c.replies.map(r => commentHTML(r, c.id, me, true)).join("")).join("")
      : `<li class="cempty">No comments yet. Start the conversation.</li>`;
  }

  async toggleLike(card) {
    const on = !card.likes[ctx.me().uid];
    if (on) {
      pop(card.el.querySelector(".heart"));
      playSound("like");
    }
    try {
      await fb.setLike(card.post.id, on);
    } catch (err) {
      toast(errMsg(err));
    }
  }

  setReply(card, target) {
    card.replyTo = target;
    const box = card.el.querySelector(".replying");
    box.classList.toggle("hidden", !target);
    if (target) {
      box.querySelector("span").textContent = `Replying to ${target.name}`;
      card.el.querySelector(".cform input").focus();
    }
  }

  async submitComment(event, card) {
    event.preventDefault();
    const input = card.el.querySelector(".cform input");
    const text = input.value.trim();
    if (!text) return;
    const btn = card.el.querySelector(".cform .btn");
    busy(btn, true, "...");
    try {
      await fb.addComment(card.post.id, text, card.replyTo?.id || null);
      input.value = "";
      this.setReply(card, null);
    } catch (err) {
      toast(errMsg(err));
    } finally {
      busy(btn, false);
    }
  }

  commentAction(card, btn) {
    const item = btn.closest(".citem");
    const cid = item.dataset.cid;
    const parent = item.dataset.parent || null;
    if (btn.dataset.act === "reply") {
      this.setReply(card, { id: cid, name: item.querySelector(".name-btn").textContent });
      return;
    }
    if (btn.dataset.act === "del" && confirm("Delete this comment?")) {
      fb.deleteComment(card.post.id, parent, cid).catch(err => toast(errMsg(err)));
    }
  }

  async more(card) {
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
}

// The composer: text plus photo, video, audio, or a recorded voice note. Works in any container.
export function mountComposer(root) {
  const form = document.createElement("form");
  form.className = "card-glass composer-card";
  form.innerHTML = `
    <textarea rows="2" maxlength="2000" placeholder="What's on your mind?"></textarea>
    <div class="attach">
      <button class="chip" type="button" data-attach="image">${icon("image")}Photo</button>
      <button class="chip" type="button" data-attach="video">${icon("film")}Video</button>
      <button class="chip" type="button" data-attach="audio">${icon("music")}Audio</button>
      <button class="chip" type="button" data-rec>${icon("mic")}<span>Record</span></button>
    </div>
    <input type="file" hidden>
    <div class="preview hidden"></div>
    <div class="progress hidden"><i></i></div>
    <div class="row between">
      <span class="hint">Photo 10 MB · Video 50 MB · Audio 20 MB</span>
      <button class="btn" type="submit">Post</button>
    </div>`;
  root.appendChild(form);

  const text = form.querySelector("textarea");
  const fileInput = form.querySelector('input[type="file"]');
  const preview = form.querySelector(".preview");
  const bar = form.querySelector(".progress");
  const submit = form.querySelector('button[type="submit"]');
  const recBtn = form.querySelector("[data-rec]");
  const mediaIcon = { image: "image", video: "film", audio: "music" };
  const accept = { image: "image/*", video: "video/*", audio: "audio/*" };
  let pending = null;
  let recorder = null;
  let chunks = [];

  const setRecLabel = on => {
    recBtn.classList.toggle("rec", on);
    recBtn.innerHTML = `${icon(on ? "stop" : "mic")}<span>${on ? "Stop" : "Record"}</span>`;
  };

  const setPending = file => {
    fileInput.value = "";
    if (!file) {
      pending = null;
    } else {
      const kind = kindOf(file);
      if (kind === "file") return toast("Choose a photo, video or audio file");
      if (kind !== "image") {
        try {
          checkSize(file, kind);
        } catch (err) {
          return toast(errMsg(err));
        }
      }
      pending = { file, kind };
    }
    preview.classList.toggle("hidden", !pending);
    preview.innerHTML = pending
      ? `<span class="chip-file">${icon(mediaIcon[pending.kind])}<span>${esc(pending.file.name)}</span></span>
         <button class="link" type="button" data-clear>Remove</button>`
      : "";
  };

  form.querySelectorAll("[data-attach]").forEach(btn => {
    btn.addEventListener("click", () => {
      fileInput.accept = accept[btn.dataset.attach];
      fileInput.click();
    });
  });
  fileInput.addEventListener("change", event => setPending(event.target.files[0]));
  preview.addEventListener("click", event => {
    if (event.target.closest("[data-clear]")) setPending(null);
  });

  recBtn.addEventListener("click", async () => {
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
      setPending(file);
    };
    recorder.start();
    setRecLabel(true);
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const body = text.value.trim();
    if (!body && !pending) return toast("Write something or attach a photo, video or voice note");
    busy(submit, true, "Posting");
    try {
      let media = null;
      if (pending) {
        bar.classList.remove("hidden");
        bar.firstElementChild.style.width = "0%";
        const ready = await prepareUpload(pending.file, pending.kind);
        media = await fb.uploadFile(`media/${ctx.me().uid}`, ready.file, pct => {
          bar.firstElementChild.style.width = `${Math.round(pct * 100)}%`;
        });
      }
      await fb.createPost({
        text: body,
        mediaType: media ? pending.kind : "none",
        mediaURL: media?.url,
        mediaPath: media?.path
      });
      text.value = "";
      setPending(null);
      toast("Posted");
    } catch (err) {
      toast(errMsg(err));
    } finally {
      busy(submit, false);
      bar.classList.add("hidden");
    }
  });
}
