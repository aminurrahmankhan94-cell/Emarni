// Pet adoption (free adoption only) and paid ads with admin approval.
import * as fb from "./firebase.js";
import { $, $$, esc, toast, busy, errMsg, timeAgo, LIMIT_MB, openDialog, avatarHTML, shrinkImage } from "./ui.js";
import { icon, petArt } from "./icons.js";

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

export function initMarket(context) {
  ctx = context;
  fb.watchAdoptions(list => {
    pets = list;
    renderPets();
  }, err => toast(errMsg(err)));
  fb.watchActiveAds(list => {
    activeAds = list;
    renderAds();
  }, err => toast(errMsg(err)));
  fb.watchMyAdRequests(list => {
    myAds = list;
    renderMyAds();
  }, err => toast(errMsg(err)));
  if (ctx.isAdmin()) {
    $("#adminAdsWrap").classList.remove("hidden");
    fb.watchAllAdRequests(list => {
      adminReqs = list;
      renderAdminAds();
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
}

export function onMarketShow() {
  // Listeners are realtime, so nothing to refresh on show.
}

// ---------- Pets ----------
function renderPets() {
  const me = ctx.me()?.uid;
  const list = pets.filter(pet => petFilter === "All" || pet.species === petFilter);
  $("#petGrid").innerHTML = list.map((pet, i) => petCard(pet, me, i)).join("");
  $("#petEmpty").classList.toggle("hidden", list.length > 0);
}

function petCard(pet, me, index) {
  const mine = pet.uid === me;
  const adopted = pet.status === "adopted";
  const owner = ctx.author(pet.uid);
  const photo = pet.photoURL
    ? `<img src="${esc(pet.photoURL)}" alt="${esc(pet.name)}" loading="lazy">`
    : `<div class="pet-ph">${petArt(pet.species)}</div>`;
  const facts = [pet.species, pet.breed, pet.age, pet.gender].filter(Boolean).join(" · ");
  let actions;
  if (mine) {
    actions = `
      <button class="btn sm ghost" type="button" data-pet="requests" data-id="${esc(pet.id)}">Requests</button>
      <button class="btn sm ghost" type="button" data-pet="toggle" data-id="${esc(pet.id)}">${adopted ? "Mark available" : "Mark adopted"}</button>
      <button class="btn sm danger" type="button" data-pet="delete" data-id="${esc(pet.id)}">Remove</button>`;
  } else if (adopted) {
    actions = `<span class="hint">Already adopted</span>`;
  } else {
    actions = `<button class="btn sm" type="button" data-pet="adopt" data-id="${esc(pet.id)}">Request to adopt</button>`;
  }
  return `<article class="pet${adopted ? " adopted" : ""}" style="--i:${index}">
    <div class="pet-media">
      ${photo}
      <span class="pill ${adopted ? "gray" : "green"}">${adopted ? "Adopted" : "Free · Available"}</span>
    </div>
    <div class="pet-body">
      <h3>${esc(pet.name)}</h3>
      <p class="meta">${esc(facts)}</p>
      <p class="meta">${icon("pin")}${esc(pet.location || "Location not given")}</p>
      ${pet.description ? `<p class="desc">${esc(pet.description)}</p>` : ""}
      <p class="by">Listed by ${esc(owner?.displayName || "Emarni user")} · ${timeAgo(pet.createdAt)}</p>
      <div class="pet-acts">${actions}</div>
    </div>
  </article>`;
}

function openPetForm() {
  $("#petForm").reset();
  petPhotoFile = null;
  $("#petPhotoPrev").hidden = true;
  openDialog("#dlgPet");
}

async function savePet(event) {
  event.preventDefault();
  const name = $("#petName").value.trim();
  const location = $("#petLocation").value.trim();
  if (name.length < 2) return toast("Enter the pet's name");
  if (!location) return toast("Enter the location");
  const btn = $("#petSave");
  busy(btn, true, "Listing…");
  try {
    let photo = null;
    if (petPhotoFile) {
      photo = await fb.uploadFile(`adoptions/${ctx.me().uid}`, await shrinkImage(petPhotoFile, 1000));
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
  } catch (err) {
    toast(errMsg(err));
  } finally {
    busy(btn, false);
  }
}

function openAdoptRequest(pet) {
  adoptTarget = pet;
  $("#adoptTitle").textContent = `Adopt ${pet.name}`;
  $("#adoptMsg").value = "";
  openDialog("#dlgAdopt");
}

async function sendAdoptRequest(event) {
  event.preventDefault();
  const message = $("#adoptMsg").value.trim();
  if (!message) return toast("Tell the owner a little about yourself");
  const btn = $("#adoptSend");
  busy(btn, true, "Sending…");
  try {
    await fb.sendAdoptionRequest(adoptTarget.id, message, ctx.me());
    $("#dlgAdopt").close();
    toast("Request sent. The owner will see it.");
  } catch (err) {
    toast(errMsg(err));
  } finally {
    busy(btn, false);
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
  $("#adsList").innerHTML = list
    .map((ad, i) => {
      const link = safeLink(ad.link);
      const image = ad.imageURL ? `<img src="${esc(ad.imageURL)}" alt="" loading="lazy">` : "";
      const until = new Date(Number(ad.expiresAt)).toLocaleDateString([], { day: "numeric", month: "short" });
      return `<article class="ad" style="--i:${i}">
        ${image ? `<div class="ad-media">${image}</div>` : ""}
        <div class="ad-body">
          <span class="tag sponsored">Sponsored · ${esc(ad.category || "Other")}</span>
          <h3>${esc(ad.title)}</h3>
          ${ad.body ? `<p>${esc(ad.body)}</p>` : ""}
          <div class="ad-foot">
            <small>Until ${esc(until)}</small>
            ${link ? `<a class="btn sm" href="${esc(link)}" target="_blank" rel="noopener noreferrer">Visit</a>` : ""}
          </div>
        </div>
      </article>`;
    })
    .join("");
  $("#adsEmpty").classList.toggle("hidden", list.length > 0);
}

const STATUS_LABEL = { pending: ["Awaiting review", "amber"], active: ["Live", "green"], rejected: ["Rejected", "red"] };

function renderMyAds() {
  $("#myAds").innerHTML = myAds.length
    ? myAds
        .map(req => {
          const [label, tone] = STATUS_LABEL[req.status] || ["Unknown", "gray"];
          return `<li class="item">
            <div class="grow"><b>${esc(req.title)}</b><small>${esc(req.days)} day(s) · BDT ${esc(req.amount)} · ${esc(req.payMethod)} · ${timeAgo(req.createdAt)}</small></div>
            <span class="pill ${tone}">${label}</span>
          </li>`;
        })
        .join("")
    : `<li class="none">You have not sent any ad requests yet.</li>`;
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
  $("#adminAds").innerHTML = `
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
  $("#adPayInfo").textContent = `Send BDT ${amount || "…"} via ${method} to ${PAY[method]}, then enter the Transaction ID below. Admins approve after checking the payment.`;
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
      if (!image.type.startsWith("image/")) throw new Error("Ad image must be a picture");
      if (image.size > LIMIT_MB.ad * 1048576) throw new Error(`Ad image must be under ${LIMIT_MB.ad} MB`);
      upload = await fb.uploadFile(`ads/${ctx.me().uid}`, await shrinkImage(image, 1000));
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

// ---------- Wiring ----------
function bind() {
  $$("[data-filter]").forEach(chip => {
    chip.addEventListener("click", () => {
      petFilter = chip.dataset.filter;
      $$("[data-filter]").forEach(item => item.classList.toggle("on", item === chip));
      renderPets();
    });
  });

  $("#newPetBtn").addEventListener("click", openPetForm);
  $("#petForm").addEventListener("submit", savePet);
  $("#petPhoto").addEventListener("change", event => {
    const file = event.target.files[0];
    petPhotoFile = null;
    const preview = $("#petPhotoPrev");
    if (!file) {
      preview.hidden = true;
      return;
    }
    if (!file.type.startsWith("image/")) return toast("Choose a picture");
    if (file.size > LIMIT_MB.pet * 1048576) return toast(`Photo must be under ${LIMIT_MB.pet} MB`);
    petPhotoFile = file;
    preview.src = URL.createObjectURL(file);
    preview.hidden = false;
  });

  $("#petGrid").addEventListener("click", event => {
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

  $("#adoptForm").addEventListener("submit", sendAdoptRequest);

  $("#listBody").addEventListener("click", event => {
    const btn = event.target.closest("[data-req-remove]");
    if (btn) fb.removeAdoptionRequest(btn.dataset.petId, btn.dataset.reqRemove).catch(err => toast(errMsg(err)));
  });

  $("#newAdBtn").addEventListener("click", () => {
    $("#adForm").reset();
    updatePayInfo();
    openDialog("#dlgAd");
  });
  $("#adAmount").addEventListener("input", updatePayInfo);
  $("#adPay").addEventListener("change", updatePayInfo);
  $("#adForm").addEventListener("submit", saveAd);

  $("#adminAds").addEventListener("click", event => {
    const btn = event.target.closest("[data-ad]");
    if (btn) decideAdFromButton(btn);
  });
}
