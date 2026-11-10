// Pet adoption (free adoption only) and paid ads with admin approval.
// S5 MARKET — renders into [data-view="adopt"] / [data-view="ads"].
import * as fb from "./firebase.js";
import { $, $$, esc, toast, busy, errMsg, timeAgo, openDialog, avatarHTML, askText } from "./ui.js";
import { prepareUpload } from "./media.js";
import { icon, petArt } from "./icons.js";
import { playSound } from "./sounds.js";

// Replace these numbers with your real payment details before you go live.
const PAY = {
  bKash: "01XXXXXXXXX (Send Money)",
  Nagad: "01XXXXXXXXX (Send Money)",
  Rocket: "01XXXXXXXXX (Send Money)",
  Bank: "Ask the Emarni admin for account details"
};
const MIN_AMOUNT = 100;

let ctx = null;
let pets = [];
let petFilter = "All";
let activeAds = [];
let myAds = [];
let adminReqs = [];
let adminAds = [];
let petPhotoFile = null;
let adoptTarget = null;
let unsubRequests = null;
let adTab = "live";

export function initMarket(context) {
  ctx = context;
  injectPetConfirm();
  injectAdTabs();
  injectAdPreview();
  fb.watchAdoptions(list => {
    pets = list;
    renderPets();
  }, err => toast(errMsg(err)));
  fb.watchActiveAds(list => {
    activeAds = list;
    renderAds();
    renderMyAds(); // owner controls depend on live ad state
  }, err => toast(errMsg(err)));
  fb.watchMyAdRequests(list => {
    myAds = list;
    renderMyAds();
    renderAdTabs();
  }, err => toast(errMsg(err)));
  if (ctx.isAdmin()) {
    const wrap = $("#adminAdsWrap");
    if (wrap) wrap.classList.remove("hidden");
    fb.watchAllAdRequests(list => {
      adminReqs = list;
      renderAdminAds();
      renderAdTabs();
    }, err => toast(errMsg(err)));
    fb.watchAllAds(list => {
      adminAds = list;
      renderAdminAds();
    }, err => toast(errMsg(err)));
  }
  bind();
}

export function refreshMarket() {
  renderPets();
  renderAds();
  renderMyAds();
  renderAdminAds();
}

export function onMarketShow() {
  // Listeners are realtime, so nothing to refresh on show.
}

// ---------- Injected shell bits (index.html is S1-owned; we add our controls) ----------
function injectPetConfirm() {
  const form = $("#petForm");
  if (!form || form.querySelector(".adopt-confirm")) return;
  const wrap = document.createElement("label");
  wrap.className = "adopt-confirm";
  wrap.innerHTML = `<input type="checkbox" id="petFreeConfirm" required>
    <span><b>Free adoption only.</b> I confirm this pet is offered for free adoption — no money, no sale.
    <small>Paid pet sales are not allowed on Emarni. Violations are removed.</small></span>`;
  const row = form.querySelector(".row");
  if (row) form.insertBefore(wrap, row); else form.appendChild(wrap);
}

function injectAdTabs() {
  const page = document.querySelector('[data-view="ads"] .page');
  if (!page || page.querySelector(".ad-tabs")) return;
  const tabs = document.createElement("div");
  tabs.className = "ad-tabs";
  tabs.innerHTML = `
    <button class="ad-tab on" type="button" data-ad-tab="live">Live ads</button>
    <button class="ad-tab" type="button" data-ad-tab="mine">My requests<span class="ad-tab-count hidden" id="adMineCount">0</span></button>
    <button class="ad-tab hidden" type="button" data-ad-tab="admin" id="adAdminTab">Admin<span class="ad-tab-count hidden" id="adAdminCount">0</span></button>`;
  const firstH3 = page.querySelector(".sec-title");
  if (firstH3) page.insertBefore(tabs, firstH3); else page.appendChild(tabs);
  if (ctx?.isAdmin()) $("#adAdminTab")?.classList.remove("hidden");
  applyAdTab();
}

function renderAdTabs() {
  const mineCount = myAds.filter(r => r.status === "pending").length;
  const mc = $("#adMineCount");
  if (mc) { mc.textContent = String(mineCount); mc.classList.toggle("hidden", mineCount === 0); }
  const adminCount = adminReqs.filter(r => r.status === "pending").length;
  const ac = $("#adAdminCount");
  if (ac) { ac.textContent = String(adminCount); ac.classList.toggle("hidden", adminCount === 0); }
}

function applyAdTab() {
  $$('[data-ad-tab]').forEach(b => b.classList.toggle("on", b.dataset.adTab === adTab));
  const live = $("#adsList"), liveEmpty = $("#adsEmpty"), mine = $("#myAds"), adminWrap = $("#adminAdsWrap");
  const set = (el, vis) => { if (el) el.style.display = vis ? "" : "none"; };
  // Section headers
  const headers = $$('[data-view="ads"] .sec-title');
  headers.forEach(h => { h.style.display = "none"; });
  if (adTab === "live") {
    set(live, true); set(liveEmpty, true); set(mine, false); set(adminWrap, false);
    if (headers[0]) headers[0].style.display = "";
  } else if (adTab === "mine") {
    set(live, false); set(liveEmpty, false); set(mine, true); set(adminWrap, false);
    if (headers[1]) headers[1].style.display = "";
  } else {
    set(live, false); set(liveEmpty, false); set(mine, false); set(adminWrap, true);
    if (headers[2]) headers[2].style.display = "";
  }
}

function injectAdPreview() {
  const form = $("#adForm");
  if (!form || form.querySelector(".ad-preview")) return;
  const prev = document.createElement("div");
  prev.className = "ad-preview hidden";
  prev.id = "adPreviewBox";
  prev.innerHTML = `<h4>Preview</h4><div id="adPreviewBody" class="ad-card" style="border-left:none;"></div>`;
  const payInfo = $("#adPayInfo");
  if (payInfo) form.insertBefore(prev, payInfo); else form.appendChild(prev);
  const toggle = document.createElement("button");
  toggle.type = "button"; toggle.className = "link"; toggle.id = "adPreviewToggle";
  toggle.textContent = "Preview ad";
  const row = form.querySelector(".row");
  if (row) row.insertBefore(toggle, row.firstChild);
  ["adTitle", "adBody", "adCategory", "adLink"].forEach(id => {
    const el = $("#" + id);
    if (el) el.addEventListener("input", updateAdPreview);
  });
}

function updateAdPreview() {
  const box = $("#adPreviewBody");
  if (!box) return;
  const title = $("#adTitle").value.trim() || "Your ad title";
  const body = $("#adBody").value.trim();
  const cat = $("#adCategory").value || "Other";
  const link = $("#adLink").value.trim();
  box.innerHTML = `
    <div class="ad-body">
      <span class="ad-tag">Sponsored · ${esc(cat)}</span>
      <h3>${esc(title)}</h3>
      ${body ? `<p>${esc(body)}</p>` : ""}
      <div class="ad-foot"><small>Until …</small>${link ? `<a class="btn sm" href="#" onclick="return false;">Visit</a>` : ""}</div>
    </div>`;
}

// ---------- Pets ----------
function renderPets() {
  const me = ctx.me()?.uid;
  const grid = $("#petGrid");
  if (!grid) return;
  const list = pets.filter(pet => petFilter === "All" || pet.species === petFilter);
  grid.innerHTML = list.map((pet, i) => petCard(pet, me, i)).join("");
  const empty = $("#petEmpty");
  if (empty) empty.classList.toggle("hidden", list.length > 0);
}

function petCard(pet, me, index) {
  const mine = pet.uid === me;
  const adopted = pet.status === "adopted";
  const owner = ctx.author(pet.uid);
  const photo = pet.photoURL
    ? `<img src="${esc(pet.photoURL)}" alt="${esc(pet.name)}" loading="lazy">`
    : `<div class="pet-ph">${petArt(pet.species)}</div>`;
  const facts = [pet.species, pet.breed, pet.age, pet.gender].filter(Boolean);
  const factsHTML = facts.map(f => `<span class="adopt-fact">${esc(f)}</span>`).join("");
  let actions;
  if (mine) {
    actions = `
      <button class="btn sm ghost" type="button" data-pet="requests" data-id="${esc(pet.id)}">${icon("users")}Requests</button>
      <button class="btn sm ghost" type="button" data-pet="toggle" data-id="${esc(pet.id)}">${adopted ? "Mark available" : "Mark adopted"}</button>
      <button class="btn sm danger" type="button" data-pet="delete" data-id="${esc(pet.id)}">${icon("trash")}Remove</button>`;
  } else if (adopted) {
    actions = `<span class="hint">Already adopted</span>`;
  } else {
    actions = `<button class="btn sm btn-primary" type="button" data-pet="adopt" data-id="${esc(pet.id)}">${icon("paw")}Request adoption</button>`;
  }
  return `<article class="adopt-card${adopted ? " adopted" : ""}" style="--i:${index}">
    <div class="adopt-media">
      ${photo}
      <span class="adopt-pill ${adopted ? "gone" : "free"}">${adopted ? "Adopted" : "Free · Available"}</span>
    </div>
    <div class="adopt-body">
      <h3>${esc(pet.name)}</h3>
      <div class="adopt-facts">${factsHTML}</div>
      <div class="adopt-loc">${icon("pin")}${esc(pet.location || "Location not given")}</div>
      ${pet.description ? `<p class="adopt-desc">${esc(pet.description)}</p>` : ""}
      <p class="adopt-by">Listed by ${esc(owner?.displayName || "Emarni user")} · ${timeAgo(pet.createdAt)}</p>
      <div class="adopt-acts">${actions}</div>
    </div>
  </article>`;
}

function openPetForm() {
  const form = $("#petForm");
  if (form) form.reset();
  petPhotoFile = null;
  const prev = $("#petPhotoPrev");
  if (prev) prev.hidden = true;
  const cb = $("#petFreeConfirm");
  if (cb) cb.checked = false;
  openDialog("#dlgPet");
}

async function savePet(event) {
  event.preventDefault();
  const name = $("#petName").value.trim();
  const location = $("#petLocation").value.trim();
  const confirm = $("#petFreeConfirm");
  if (name.length < 2) return toast("Enter the pet's name");
  if (!location) return toast("Enter the location");
  if (confirm && !confirm.checked) return toast("Please confirm this is a free adoption (no sale).");
  const btn = $("#petSave");
  busy(btn, true, "Listing…");
  try {
    let photo = null;
    if (petPhotoFile) {
      photo = await fb.uploadFile(`adoptions/${ctx.me().uid}`, (await prepareUpload(petPhotoFile, "image", 1000)).file);
    }
    await fb.createAdoption({
      name,
      species: $("#petSpecies").value,
      breed: $("#petBreed").value.trim().slice(0, 40),
      age: $("#petAge").value.trim().slice(0, 30),
      gender: $("#petGender").value,
      location: location.slice(0, 60),
      description: $("#petDesc").value.trim().slice(0, 500),
      photoURL: photo?.url || "",
      photoPath: photo?.path || ""
    });
    $("#dlgPet").close();
    toast("Listed for free adoption");
    playSound("posted");
  } catch (err) {
    toast(errMsg(err));
  } finally {
    busy(btn, false);
  }
}

async function openAdoptRequest(pet) {
  adoptTarget = pet;
  const message = await askText({
    title: `Adopt ${pet.name}`,
    placeholder: "Tell the owner about your home and why you want this pet…",
    required: true,
    okText: "Send request"
  });
  if (message == null) return;
  const btn = document.activeElement;
  try {
    await fb.sendAdoptionRequest(pet.id, message, ctx.me());
    toast("Adoption request sent. The owner will see it.");
    playSound("requestSent");
  } catch (err) {
    toast(errMsg(err));
  }
}

function openRequests(pet) {
  if (unsubRequests) unsubRequests();
  $("#listTitle").textContent = `Requests for ${pet.name}`;
  $("#listBody").innerHTML = `<p class="hint">Loading…</p>`;
  openDialog("#dlgList");
  unsubRequests = fb.watchAdoptionRequests(pet.id, requests => {
    const rows = Object.entries(requests);
    $("#listBody").innerHTML = rows.length
      ? rows
          .map(([uid, req]) => {
            const author = ctx.author(uid) || { displayName: req.name || "Emarni user" };
            return `<li class="item">
              ${avatarHTML(author, "sm")}
              <div class="grow"><b>${esc(author.displayName)}</b><small>${esc(req.message)}</small></div>
              <button class="btn sm ghost" type="button" data-req-remove="${esc(uid)}" data-pet-id="${esc(pet.id)}">Remove</button>
            </li>`;
          })
          .join("")
      : `<p class="hint">No requests yet.</p>`;
  }, err => toast(errMsg(err)));
  $("#dlgList").addEventListener("close", () => {
    if (unsubRequests) unsubRequests();
    unsubRequests = null;
  }, { once: true });
}

// ---------- Ads ----------
function safeLink(url) {
  return /^https?:\/\//i.test(url || "") ? url : "";
}

function renderAds() {
  const list = activeAds;
  const box = $("#adsList");
  if (!box) return;
  box.innerHTML = list
    .map((ad, i) => {
      const link = safeLink(ad.link);
      const image = ad.imageURL ? `<div class="ad-media"><img src="${esc(ad.imageURL)}" alt="" loading="lazy"></div>` : "";
      const until = new Date(Number(ad.expiresAt)).toLocaleDateString([], { day: "numeric", month: "short" });
      return `<article class="ad-card" style="--i:${i}">
        ${image}
        <div class="ad-body">
          <span class="ad-tag">Sponsored · ${esc(ad.category || "Other")}</span>
          <h3>${esc(ad.title)}</h3>
          ${ad.body ? `<p>${esc(ad.body)}</p>` : ""}
          <div class="ad-foot">
            <small>Until ${esc(until)}</small>
            ${link ? `<a class="btn sm btn-primary" href="${esc(link)}" target="_blank" rel="noopener noreferrer">Visit</a>` : ""}
          </div>
        </div>
      </article>`;
    })
    .join("");
  const empty = $("#adsEmpty");
  if (empty) empty.classList.toggle("hidden", list.length > 0);
}

const STATUS_LABEL = { pending: ["Awaiting review", "amber"], active: ["Live", "green"], rejected: ["Rejected", "red"] };

function renderMyAds() {
  const box = $("#myAds");
  if (!box) return;
  box.innerHTML = myAds.length
    ? myAds
        .map(req => {
          const [label, tone] = STATUS_LABEL[req.status] || ["Unknown", "gray"];
          const liveAd = activeAds.find(a => a.id === req.aid);
          const isLive = Boolean(liveAd);
          const paused = req.status === "active" && !isLive; // active but not in live list => paused or expired
          let controls = "";
          if (req.status === "active") {
            const pauseBtn = isLive
              ? `<button class="btn sm ghost" type="button" data-myad="pause" data-id="${esc(req.aid)}">Pause</button>`
              : `<button class="btn sm ghost" type="button" data-myad="resume" data-id="${esc(req.aid)}">Resume</button>`;
            const extendBtn = isLive
              ? `<button class="btn sm ghost" type="button" data-myad="extend" data-id="${esc(req.aid)}" data-expires="${esc(liveAd.expiresAt)}">+7 days</button>`
              : "";
            const removeBtn = `<button class="btn sm danger" type="button" data-myad="remove" data-id="${esc(req.aid)}" data-uid="${esc(req.uid)}">Remove</button>`;
            controls = `<div class="ad-req-acts">${pauseBtn}${extendBtn}${removeBtn}</div>`;
          }
          return `<li class="ad-req-item">
            <div class="grow">
              <b>${esc(req.title)}</b>
              <small>${esc(req.days)} day(s) · BDT ${esc(req.amount)} · ${esc(req.payMethod)} · ${timeAgo(req.createdAt)}${paused ? " · paused" : ""}</small>
            </div>
            <span class="pill ${tone}">${label}</span>
            ${controls}
          </li>`;
        })
        .join("")
    : `<li class="none ad-empty">You have not sent any ad requests yet. Tap “New ad” to start.</li>`;
}

function pendingRow(req) {
  return `<li class="item">
    <div class="grow"><b>${esc(req.title)}</b><small>${esc(req.days)} day(s) · BDT ${esc(req.amount)} · ${esc(req.payMethod)} · TxnID ${esc(req.txnId)}</small></div>
    <button class="btn sm" type="button" data-ad="approve" data-id="${esc(req.aid)}">Approve</button>
    <button class="btn sm danger" type="button" data-ad="reject" data-id="${esc(req.aid)}">Reject</button>
  </li>`;
}

function liveRow(ad, now) {
  const expired = Number(ad.expiresAt) <= now;
  const [label, tone] = expired ? ["Expired", "gray"] : ad.paused ? ["Paused", "amber"] : ["Live", "green"];
  const left = expired ? "" : `${Math.max(1, Math.ceil((Number(ad.expiresAt) - now) / 86400000))} day(s) left · `;
  const toggle = expired
    ? ""
    : ad.paused
      ? `<button class="btn sm ghost" type="button" data-ad="resume" data-id="${esc(ad.id)}">Resume</button>`
      : `<button class="btn sm ghost" type="button" data-ad="pause" data-id="${esc(ad.id)}">Pause</button>`;
  return `<li class="item">
    <div class="grow"><b>${esc(ad.title)}</b><small>${left}${esc(ad.category || "Other")}</small></div>
    <span class="pill ${tone}">${label}</span>
    ${toggle}
    <button class="btn sm ghost" type="button" data-ad="extend" data-id="${esc(ad.id)}">+7 days</button>
    <button class="btn sm danger" type="button" data-ad="remove" data-id="${esc(ad.id)}" data-uid="${esc(ad.uid)}">Remove</button>
  </li>`;
}

function renderAdminAds() {
  const box = $("#adminAds");
  if (!box) return;
  const now = Date.now();
  const approved = adminReqs.filter(r => r.status === "active");
  const waiting = adminReqs.filter(r => r.status === "pending");
  const revenue = approved.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const byMethod = {};
  approved.forEach(r => {
    byMethod[r.payMethod] = (byMethod[r.payMethod] || 0) + (Number(r.amount) || 0);
  });
  const methods = Object.entries(byMethod).map(([m, v]) => `${esc(m)}: BDT ${v}`).join(" · ") || "No approved payments yet";
  const liveNow = adminAds.filter(ad => Number(ad.expiresAt) > now && ad.paused !== true).length;
  box.innerHTML = `
    <div class="stat-grid">
      <div class="stat"><span>Revenue (approved)</span><b>BDT ${revenue}</b></div>
      <div class="stat"><span>Waiting</span><b>${waiting.length}</b></div>
      <div class="stat"><span>Live now</span><b>${liveNow}</b></div>
      <div class="stat wide"><span>By payment method</span><small>${methods}</small></div>
    </div>
    <h3 class="sub">Waiting for approval</h3>
    <ul class="list plain">${waiting.length ? waiting.map(pendingRow).join("") : `<li class="none">Nothing waiting.</li>`}</ul>
    <h3 class="sub">All ads</h3>
    <ul class="list plain">${adminAds.length ? adminAds.map(ad => liveRow(ad, now)).join("") : `<li class="none">No ads yet.</li>`}</ul>`;
}

function updatePayInfo() {
  const amount = Number($("#adAmount").value) || 0;
  const method = $("#adPay").value;
  const info = $("#adPayInfo");
  if (info) info.textContent = `Send BDT ${amount || "…"} via ${method} to ${PAY[method]}, then enter the Transaction ID below. Admins approve after checking the payment.`;
}

async function saveAd(event) {
  event.preventDefault();
  const title = $("#adTitle").value.trim();
  const amount = Number($("#adAmount").value);
  const days = Number($("#adDays").value);
  const txnId = $("#adTxn").value.trim();
  if (title.length < 2) return toast("Give your ad a title");
  if (!(amount >= MIN_AMOUNT)) return toast(`Minimum amount is BDT ${MIN_AMOUNT}`);
  if (!(days >= 1 && days <= 30)) return toast("Choose 1 to 30 days");
  if (txnId.length < 4) return toast("Enter the payment Transaction ID");
  const btn = $("#adSend");
  busy(btn, true, "Sending…");
  try {
    const image = $("#adImage").files[0];
    let upload = null;
    if (image) {
      upload = await fb.uploadFile(`ads/${ctx.me().uid}`, (await prepareUpload(image, "image", 1000)).file);
    }
    await fb.createAdRequest({
      title,
      body: $("#adBody").value,
      link: $("#adLink").value,
      category: $("#adCategory").value,
      days,
      amount,
      payMethod: $("#adPay").value,
      txnId,
      imageURL: upload?.url || "",
      imagePath: upload?.path || ""
    });
    $("#dlgAd").close();
    toast("Request sent. You will see the status below.");
    playSound("requestSent");
    adTab = "mine";
    applyAdTab();
  } catch (err) {
    toast(errMsg(err));
  } finally {
    busy(btn, false);
  }
}

async function decideAdFromButton(btn) {
  const action = btn.dataset.ad;
  const id = btn.dataset.id;
  try {
    if (action === "approve" || action === "reject") {
      const req = adminReqs.find(r => r.aid === id);
      if (!req) return;
      if (action === "reject" && !confirm("Reject this ad request?")) return;
      await fb.decideAd(req, action === "approve");
      toast(action === "approve" ? "Ad approved and live" : "Ad rejected");
      playSound("confirm");
    } else if (action === "pause" || action === "resume") {
      await fb.setAdPaused(id, action === "pause");
      toast(action === "pause" ? "Ad paused" : "Ad is live again");
    } else if (action === "extend") {
      const ad = adminAds.find(a => a.id === id);
      if (!ad) return;
      await fb.extendAd(id, ad.expiresAt, 7);
      toast("Extended by 7 days");
    } else if (action === "remove") {
      if (!confirm("Remove this ad now?")) return;
      await fb.removeAd(id, btn.dataset.uid);
      toast("Ad removed");
    }
  } catch (err) {
    toast(errMsg(err));
  }
}

async function myAdAction(btn) {
  const action = btn.dataset.myad;
  const id = btn.dataset.id;
  try {
    if (action === "pause" || action === "resume") {
      await fb.setAdPaused(id, action === "pause");
      toast(action === "pause" ? "Ad paused" : "Ad is live again");
    } else if (action === "extend") {
      await fb.extendAd(id, Number(btn.dataset.expires) || Date.now(), 7);
      toast("Extended by 7 days");
    } else if (action === "remove") {
      if (!confirm("Remove this ad now?")) return;
      await fb.removeAd(id, btn.dataset.uid);
      toast("Ad removed");
    }
  } catch (err) {
    toast(errMsg(err));
  }
}

// ---------- Wiring ----------
function bind() {
  $$("[data-filter]").forEach(chip => {
    chip.addEventListener("click", () => {
      petFilter = chip.dataset.filter;
      $$("[data-filter]").forEach(item => item.classList.toggle("on", item === chip));
      renderPets();
      playSound("click");
    });
  });
  const newPet = $("#newPetBtn");
  if (newPet) newPet.addEventListener("click", openPetForm);
  const petForm = $("#petForm");
  if (petForm) petForm.addEventListener("submit", savePet);
  const petPhoto = $("#petPhoto");
  if (petPhoto) petPhoto.addEventListener("change", event => {
    const file = event.target.files[0];
    petPhotoFile = null;
    const preview = $("#petPhotoPrev");
    if (!file) { if (preview) preview.hidden = true; return; }
    petPhotoFile = file;
    if (preview) { preview.src = URL.createObjectURL(file); preview.hidden = false; }
  });
  const petGrid = $("#petGrid");
  if (petGrid) petGrid.addEventListener("click", event => {
    const btn = event.target.closest("[data-pet]");
    if (!btn) return;
    const pet = pets.find(item => item.id === btn.dataset.id);
    if (!pet) return;
    const action = btn.dataset.pet;
    if (action === "adopt") openAdoptRequest(pet);
    if (action === "requests") openRequests(pet);
    if (action === "toggle") {
      fb.setAdoptionStatus(pet.id, pet.status === "adopted" ? "available" : "adopted").catch(err => toast(errMsg(err)));
    }
    if (action === "delete") {
      if (!confirm(`Remove ${pet.name}'s listing?`)) return;
      fb.deleteAdoption(pet).catch(err => toast(errMsg(err)));
    }
  });
  const listBody = $("#listBody");
  if (listBody) listBody.addEventListener("click", event => {
    const btn = event.target.closest("[data-req-remove]");
    if (btn) fb.removeAdoptionRequest(btn.dataset.petId, btn.dataset.reqRemove).catch(err => toast(errMsg(err)));
  });
  const newAd = $("#newAdBtn");
  if (newAd) newAd.addEventListener("click", () => {
    const form = $("#adForm");
    if (form) form.reset();
    updatePayInfo();
    const prev = $("#adPreviewBox");
    if (prev) prev.classList.add("hidden");
    openDialog("#dlgAd");
  });
  const adAmount = $("#adAmount");
  if (adAmount) adAmount.addEventListener("input", updatePayInfo);
  const adPay = $("#adPay");
  if (adPay) adPay.addEventListener("change", updatePayInfo);
  const adForm = $("#adForm");
  if (adForm) adForm.addEventListener("submit", saveAd);
  const adminAds = $("#adminAds");
  if (adminAds) adminAds.addEventListener("click", event => {
    const btn = event.target.closest("[data-ad]");
    if (btn) decideAdFromButton(btn);
  });
  const myAdsBox = $("#myAds");
  if (myAdsBox) myAdsBox.addEventListener("click", event => {
    const btn = event.target.closest("[data-myad]");
    if (btn) myAdAction(btn);
  });
  // Ad tabs
  document.addEventListener("click", event => {
    const tab = event.target.closest("[data-ad-tab]");
    if (tab) {
      adTab = tab.dataset.adTab;
      applyAdTab();
      playSound("click");
    }
    const prevToggle = event.target.closest("#adPreviewToggle");
    if (prevToggle) {
      const box = $("#adPreviewBox");
      if (box) {
        box.classList.toggle("hidden");
        if (!box.classList.contains("hidden")) updateAdPreview();
      }
    }
  });
}
