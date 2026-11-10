// Posts: reusable post list (feed + every profile), right-panel suggestions/trending.
// The inline composer lives in postbox.js (mountComposer); we import it here.
import * as fb from "./firebase.js";
import { $, esc, toast, avatarHTML, timeAgo, busy, errMsg, askText, pop } from "./ui.js";
import { playSound } from "./sounds.js";
import { icon } from "./icons.js";
import { mountComposer } from "./postbox.js";

let ctx = null;
let feed = null;
const PAGE_SIZE = 20;
const byTime = (a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0);
const countComments = map =>
  Object.values(map).reduce((total, c) => total + 1 + Object.keys(c.replies || {}).length, 0);

export function initFeed(context) {
  ctx = context;
  const host = $("#feedView");
  let composerEl, listEl, tabBar;
  if (host) {
    host.innerHTML = `<div class="feed-wrap">
      <div class="feed-composer-slot"></div>
      <div class="feed-tabs" role="tablist">
        <button type="button" class="on" data-feed-tab="all">Everyone</button>
        <button type="button" data-feed-tab="friends">Friends only</button>
      </div>
      <div class="feed-list-slot"></div>
    </div>`;
    composerEl = host.querySelector(".feed-composer-slot");
    listEl = host.querySelector(".feed-list-slot");
    tabBar = host.querySelector(".feed-tabs");
  } else {
    // v8 fallback: #feedComposer + #feedList already in index.html
    composerEl = $("#feedComposer");
    listEl = $("#feedList");
    tabBar = document.querySelector(".tabs2");
  }
  mountComposer(composerEl, ctx);
  feed = new PostList(listEl, { source: "all", emptyText: "No posts yet. Share the first one." });
  feed.start();
  (tabBar ? tabBar.querySelectorAll("[data-feed-tab]") : []).forEach(btn => {
    btn.addEventListener("click", () => {
      (tabBar ? tabBar.querySelectorAll("[data-feed-tab]") : document.querySelectorAll("[data-feed-tab]"))
        .forEach(b => b.classList.toggle("on", b === btn));
      feed?.setMode(btn.dataset.feedTab);
    });
  });
}

export function refreshFeed() {
  feed?.refresh();
}

// Called by app.js when feed or people view is shown — fills the right panel slots.
export function onSocialShow() {
  fillSuggestions();
  fillTrending();
}

// ---------- Right panel: friend suggestions ----------
function fillSuggestions() {
  const slot = $("#rpSuggest");
  if (!slot || !ctx) return;
  const me = ctx.me();
  if (!me) return;
  const friends = new Set(ctx.friendIds());
  const candidates = Object.values(ctx.dir() || {})
    .filter(p => p && p.uid && p.uid !== me.uid && !friends.has(p.uid))
    .sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""))
    .slice(0, 5);
  if (!candidates.length) {
    slot.innerHTML = `<p class="hint" style="font-size:12px;color:var(--text-faint);padding:4px 8px;">No suggestions right now.</p>`;
    return;
  }
  slot.innerHTML = candidates.map(p => `
    <div class="rp-item" data-uid="${esc(p.uid)}">
      ${avatarHTML(p, "sm")}
      <div class="rp-info">
        <div class="rp-name">${esc(p.displayName)}</div>
        <div class="rp-sub">${esc(p.emarniId || "")}</div>
      </div>
      <button class="btn sm" type="button" data-suggest-add aria-label="Add friend">${icon("userplus")}</button>
    </div>`).join("");
  slot.onclick = async event => {
    const addBtn = event.target.closest("[data-suggest-add]");
    if (addBtn) {
      event.stopPropagation();
      const uid = addBtn.closest(".rp-item").dataset.uid;
      try {
        await fb.sendFriendRequest(uid, ctx.me());
        playSound("requestSent");
        toast("Friend request sent");
        fillSuggestions();
      } catch (err) { toast(errMsg(err)); }
      return;
    }
    const item = event.target.closest(".rp-item");
    if (item) ctx.openUser(item.dataset.uid);
  };
}

// ---------- Right panel: trending posts (top 3 by likes) ----------
let trendingPosts = [];
let trendingOff = null;
function fillTrending() {
  const slot = $("#rpTrending");
  if (!slot) return;
  if (trendingOff) { trendingOff(); trendingOff = null; }
  trendingOff = fb.watchPosts(list => {
    trendingPosts = list;
    paintTrending();
  }, () => {});
}
function paintTrending() {
  const slot = $("#rpTrending");
  if (!slot) return;
  const withLikes = trendingPosts.map(p => ({ ...p, likeCount: 0 }));
  // Fetch like counts for top candidates (cheap: we only need top 3, sample recent 50)
  const recent = [...withLikes].sort((a, b) => Number(b.createdAt) - Number(a.createdAt)).slice(0, 50);
  let done = 0;
  if (!recent.length) { slot.innerHTML = `<p class="hint" style="font-size:12px;color:var(--text-faint);padding:4px 8px;">No posts yet.</p>`; return; }
  recent.forEach(p => {
    fb.get(fb.ref(fb.db, `postLikes/${p.id}`)).then(snap => {
      p.likeCount = snap.numChildren();
      done++;
      if (done === recent.length) {
        const top = [...recent].sort((a, b) => b.likeCount - a.likeCount).slice(0, 3);
        slot.innerHTML = top.length ? top.map((p, i) => {
          const author = ctx?.author(p.uid);
          const snippet = (p.text || "").slice(0, 90) || (p.mediaType ? `[${p.mediaType}]` : "Post");
          return `<div class="rp-trend-item" data-post="${esc(p.id)}">
            <span class="rt-rank">${i + 1}</span>
            <div class="rt-text"><b style="color:var(--text);">${esc(author?.displayName || "User")}</b> · ${esc(snippet)}${(p.text || "").length > 90 ? "…" : ""}</div>
            <span class="rt-likes">${icon("heart")}${p.likeCount}</span>
          </div>`;
        }).join("") : `<p class="hint" style="font-size:12px;color:var(--text-faint);padding:4px 8px;">No trending posts yet.</p>`;
        slot.onclick = event => {
          const item = event.target.closest("[data-post]");
          if (!item) return;
          // Switch to feed and scroll to the post
          ctx?.go?.("feed");
          setTimeout(() => {
            const el = document.querySelector(`.post-card[data-pid="${item.dataset.post}"]`);
            if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.style.outline = "2px solid var(--accent)"; setTimeout(() => el.style.outline = "", 1600); }
          }, 250);
        };
      }
    }).catch(() => { done++; });
  });
}

// ---------- Media rendering ----------
function mediaHTML(post) {
  if (!post.mediaURL) return "";
  const url = esc(post.mediaURL);
  if (post.mediaType === "image") {
    return `<a href="${url}" target="_blank" rel="noopener"><img class="pm-img" loading="lazy" alt="" src="${url}"></a>`;
  }
  if (post.mediaType === "video") {
    return `<video class="pm-vid" controls playsinline preload="metadata" src="${url}"></video>`;
  }
  if (post.mediaType === "audio" || post.mediaType === "voice") {
    return `<div class="pm-aud"><span>${icon("mic")}${post.mediaType === "voice" ? "Voice note" : "Audio"}</span><audio controls preload="metadata" src="${url}"></audio></div>`;
  }
  return "";
}

const commentHTML = (c, parentId, me, isReply = false) => {
  const author = ctx.author(c.uid) || { uid: c.uid, displayName: "Emarni user" };
  return `<li class="comment-item${isReply ? " reply" : ""}" data-cid="${esc(c.id)}" data-parent="${esc(parentId || "")}">
    ${avatarHTML(author, "xs")}
    <div class="cm-body">
      <div class="cm-meta">
        <button class="cm-name" type="button" data-user="${esc(c.uid)}">${esc(author.displayName)}</button>
        <span class="cm-time">${timeAgo(c.createdAt)}</span>
      </div>
      <p class="cm-text">${esc(c.text)}</p>
      <div class="cm-acts">
        ${isReply ? "" : `<button type="button" data-act="reply">Reply</button>`}
        ${c.uid === me ? `<button type="button" data-act="del">Delete</button>` : ""}
      </div>
    </div>
  </li>`;
};

// ---------- PostList: source "all" or "user" ----------
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
    this.showCount = PAGE_SIZE;
    this.list = document.createElement("div");
    this.list.className = "post-list";
    this.list.style.display = "flex";
    this.list.style.flexDirection = "column";
    this.list.style.gap = "var(--post-gap, 14px)";
    this.empty = document.createElement("p");
    this.empty.className = "feed-empty";
    this.empty.hidden = true;
    this.moreBtn = document.createElement("button");
    this.moreBtn.className = "btn ghost feed-showmore";
    this.moreBtn.type = "button";
    this.moreBtn.textContent = "Show more";
    this.moreBtn.hidden = true;
    this.moreBtn.addEventListener("click", () => {
      this.showCount += PAGE_SIZE;
      this.paint();
    });
    container.innerHTML = "";
    container.append(this.list, this.empty, this.moreBtn);
    this.list.addEventListener("click", event => {
      const who = event.target.closest("[data-user]");
      if (who) { event.preventDefault(); ctx.openUser(who.dataset.user); }
    });
  }

  start() {
    if (this.off) return;
    const onList = list => { this.last = list; this.paint(); };
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

  setMode(mode) { this.mode = mode; this.showCount = PAGE_SIZE; this.paint(); }
  refresh() { this.paint(); }

  visible() {
    const all = [...this.last].sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
    if (this.mode !== "friends") return all;
    const friends = new Set([ctx.me().uid, ...ctx.friendIds()]);
    return all.filter(post => friends.has(post.uid));
  }

  paint() {
    const list = this.visible();
    const keep = new Set(list.map(p => p.id));
    this.cards.forEach((card, id) => {
      if (!keep.has(id)) {
        card.unsubs.forEach(off => off());
        card.el.remove();
        this.cards.delete(id);
      }
    });
    const shown = list.slice(0, this.showCount);
    shown.forEach((post, index) => {
      let card = this.cards.get(post.id);
      if (!card) { card = this.build(post); this.cards.set(post.id, card); }
      card.post = post;
      this.paintHeader(card);
      if (this.list.children[index] !== card.el) {
        this.list.insertBefore(card.el, this.list.children[index] || null);
      }
    });
    // Remove cards that are beyond showCount from DOM (keep in Map for re-show)
    Array.from(this.list.children).forEach((el, i) => {
      if (i >= shown.length) el.remove();
    });
    this.moreBtn.hidden = list.length <= this.showCount;
    this.moreBtn.textContent = `Show more (${list.length - this.showCount} remaining)`;
    this.empty.textContent = this.mode === "friends" ? "No posts from friends yet." : this.emptyText;
    this.empty.hidden = list.length > 0;
  }

  build(post) {
    const el = document.createElement("article");
    el.className = "post-card";
    el.dataset.pid = post.id;
    el.innerHTML = `
      <header class="post-head">
        <button class="post-author" type="button" data-user="${esc(post.uid)}">
          <span class="pa-avatar"></span>
          <span class="pa-text">
            <span class="pa-name"></span>
            <span class="pa-sub"><span class="pa-eid"></span><span class="pa-dot">·</span><span class="pa-time"></span></span>
          </span>
        </button>
        <button class="post-more" type="button" data-more aria-label="More options">${icon("more")}</button>
      </header>
      <div class="post-text" hidden></div>
      <div class="post-media"></div>
      <footer class="post-actions">
        <button class="act-like" type="button" aria-pressed="false"><span class="heart">${icon("heart")}</span><b>0</b></button>
        <button class="act-comment" type="button" aria-expanded="false">${icon("chat")}<b>0</b></button>
        <button class="act-copy" type="button" title="Copy link to this post">${icon("copy")}<span>Copy link</span></button>
      </footer>
      <section class="post-comments" hidden>
        <ul class="cm-list"></ul>
        <div class="cm-replying" hidden><span></span><button type="button" data-cancel-reply>Cancel</button></div>
        <form class="cm-form">
          <input maxlength="500" placeholder="Write a comment…" autocomplete="off">
          <button class="btn sm" type="submit">Send</button>
        </form>
      </section>`;
    const card = { el, post, likes: {}, comments: {}, replyTo: null, unsubs: [] };
    const text = el.querySelector(".post-text");
    text.textContent = post.text || "";
    text.hidden = !post.text;
    el.querySelector(".post-media").innerHTML = mediaHTML(post);
    el.querySelector(".act-like").addEventListener("click", () => this.toggleLike(card));
    el.querySelector(".act-comment").addEventListener("click", () => {
      const box = el.querySelector(".post-comments");
      const open = box.hidden;
      box.hidden = !open;
      el.querySelector(".act-comment").classList.toggle("on", open);
      el.querySelector(".act-comment").setAttribute("aria-expanded", String(open));
      if (open) el.querySelector(".cm-form input").focus();
    });
    el.querySelector(".act-copy").addEventListener("click", () => {
      const link = `${location.origin}${location.pathname}#post-${post.id}`;
      navigator.clipboard?.writeText(link).then(() => toast("Link copied to clipboard")).catch(() => toast("Could not copy link"));
    });
    el.querySelector("[data-more]").addEventListener("click", () => this.more(card));
    el.querySelector(".cm-form").addEventListener("submit", event => this.submitComment(event, card));
    el.querySelector("[data-cancel-reply]").addEventListener("click", () => this.setReply(card, null));
    el.querySelector(".cm-list").addEventListener("click", event => {
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
    const author = ctx.author(uid) || { uid, displayName: "Emarni user", emarniId: "" };
    card.el.querySelector(".pa-avatar").innerHTML = avatarHTML(author, "sm");
    card.el.querySelector(".pa-name").textContent = author.displayName || "Emarni user";
    card.el.querySelector(".pa-eid").textContent = author.emarniId ? `@${author.emarniId}` : "";
    card.el.querySelector(".pa-time").textContent = timeAgo(card.post.createdAt);
  }

  paintActions(card) {
    const mine = Boolean(card.likes[ctx.me().uid]);
    const like = card.el.querySelector(".act-like");
    like.classList.toggle("on", mine);
    like.setAttribute("aria-pressed", String(mine));
    like.querySelector("b").textContent = Object.keys(card.likes).length;
    card.el.querySelector(".act-comment b").textContent = countComments(card.comments);
  }

  paintComments(card) {
    const list = card.el.querySelector(".cm-list");
    const me = ctx.me().uid;
    const items = Object.entries(card.comments)
      .map(([id, c]) => ({
        id, ...c,
        replies: Object.entries(c.replies || {})
          .map(([rid, r]) => ({ id: rid, ...r }))
          .sort(byTime)
      }))
      .sort(byTime);
    list.innerHTML = items.length
      ? items.map(c => commentHTML(c, null, me) + c.replies.map(r => commentHTML(r, c.id, me, true)).join("")).join("")
      : `<li class="cm-empty">No comments yet. Start the conversation.</li>`;
  }

  async toggleLike(card) {
    const on = !card.likes[ctx.me().uid];
    const btn = card.el.querySelector(".act-like");
    if (on) {
      btn.classList.remove("pop"); void btn.offsetWidth; btn.classList.add("pop");
      pop(card.el.querySelector(".heart"));
      playSound("like");
    }
    try { await fb.setLike(card.post.id, on); }
    catch (err) { toast(errMsg(err)); }
  }

  setReply(card, target) {
    card.replyTo = target;
    const box = card.el.querySelector(".cm-replying");
    box.hidden = !target;
    if (target) {
      box.querySelector("span").textContent = `Replying to ${target.name}`;
      card.el.querySelector(".cm-form input").focus();
    }
  }

  async submitComment(event, card) {
    event.preventDefault();
    const input = card.el.querySelector(".cm-form input");
    const text = input.value.trim();
    if (!text) return;
    const btn = card.el.querySelector(".cm-form .btn");
    busy(btn, true, "…");
    try {
      await fb.addComment(card.post.id, text, card.replyTo?.id || null);
      input.value = "";
      this.setReply(card, null);
    } catch (err) { toast(errMsg(err)); }
    finally { busy(btn, false); }
  }

  commentAction(card, btn) {
    const item = btn.closest(".comment-item");
    const cid = item.dataset.cid;
    const parent = item.dataset.parent || null;
    if (btn.dataset.act === "reply") {
      this.setReply(card, { id: cid, name: item.querySelector(".cm-name").textContent });
      return;
    }
    if (btn.dataset.act === "del" && confirm("Delete this comment?")) {
      fb.deleteComment(card.post.id, parent, cid).catch(err => toast(errMsg(err)));
    }
  }

  async more(card) {
    if (card.post.uid === ctx.me().uid) {
      if (!confirm("Delete this post? This cannot be undone.")) return;
      try { await fb.deletePost(card.post); toast("Post deleted"); }
      catch (err) { toast(errMsg(err)); }
      return;
    }
    const reason = await askText({ title: "Report post", placeholder: "What is wrong with this post?", okText: "Report" });
    if (!reason) return;
    try {
      await fb.reportPost(card.post, reason);
      toast("Thanks. Admins will review it.");
    } catch (err) { toast(errMsg(err)); }
  }
}
