// Audio and video calls. Peers connect directly (WebRTC); the database only carries signalling.
// Mesh design: for each pair, the smaller user id creates the offer. Works well up to about 4 people.
import * as fb from "./firebase.js";
import { $, toast, avatarHTML, errMsg } from "./ui.js";
import { icon } from "./icons.js";
import { initBoardUi, openBoard, closeBoard, toggleBoardPanel } from "./board.js";
import { notifyIncoming, notifyMissed } from "./notify.js";
import { initRingtone, startRing, stopRing, startRingback, stopRingback, unlockSound, soundReady, onSoundChange } from "./ringtone.js";

// For calls across strict networks, add a TURN server here:
// { urls: "turn:your-host:3478", username: "user", credential: "pass" }
const RTC_CONFIG = {
  iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }]
};
const INVITE_TTL = 60 * 1000;
const RING_TIMEOUT = 60 * 1000;
const NO_ANSWER = 60 * 1000;

const R = path => fb.ref(fb.db, path);

let ctx = null;
let session = null;
const ringing = { rid: null, timer: 0 };
let clockId = 0;

export function initCalls(context) {
  ctx = context;
  initBoardUi();
  $("#btnMic").addEventListener("click", toggleMic);
  $("#btnCam").addEventListener("click", toggleCam);
  $("#btnBoard").addEventListener("click", () => toggleBoardPanel());
  $("#btnHang").addEventListener("click", hangUp);
  initRingtone();
  $("#ringSound").addEventListener("click", () => {
    unlockSound();
    if (ringing.rid) startRing("incoming");
  });
  onSoundChange(ok => {
    $("#ringSound").hidden = ok || !ringing.rid;
  });

  const invitesRef = R(`userCalls/${ctx.me().uid}`);
  fb.onChildAdded(invitesRef, snap => handleInvite(snap.key, snap.val()));
  fb.onChildRemoved(invitesRef, snap => {
    if (ringing.rid === snap.key) hideRing();
  });
}

// ---------- Starting and joining ----------
async function getMedia(type) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("Calls need HTTPS and a modern browser.");
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
    video: type === "video" ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" } : false
  });
}

function mediaMessage(err) {
  return err?.name === "NotAllowedError" ? "Allow microphone and camera access to join calls" : errMsg(err);
}

export async function startCall({ type, targets, title }) {
  if (session || ringing.rid) return toast("Finish your current call first");
  if (!targets?.length) return toast("Nobody to call here");
  const me = ctx.me();
  const rid = fb.push(R("callRooms")).key;
  let local;
  try {
    local = await getMedia(type);
  } catch (err) {
    return toast(mediaMessage(err));
  }
  try {
    await fb.set(R(`callRooms/${rid}`), {
      createdBy: me.uid,
      type,
      title: title || "Call",
      boardLocked: false,
      createdAt: Date.now()
    });
    await joinRoom(rid, { type, title, createdBy: me.uid, targets, local });
    if (targets.length) {
      startRingback();
      session.noAnswer = setTimeout(noAnswer, NO_ANSWER);
    }
  } catch (err) {
    local.getTracks().forEach(track => track.stop());
    session = null;
    toast(errMsg(err));
  }
}

async function acceptCall(rid) {
  if (session) return;
  const me = ctx.me().uid;
  hideRing();
  // Read the room first: the read rule only allows it while the invite still exists.
  const room = (await fb.get(R(`callRooms/${rid}`)).catch(() => null))?.val();
  await fb.remove(R(`userCalls/${me}/${rid}`)).catch(() => {});
  if (!room) return toast("This call has already ended");
  let local;
  try {
    local = await getMedia(room.type);
  } catch (err) {
    return toast(mediaMessage(err));
  }
  try {
    await joinRoom(rid, { type: room.type, title: room.title, createdBy: room.createdBy, targets: [], local });
  } catch (err) {
    local.getTracks().forEach(track => track.stop());
    session = null;
    toast(errMsg(err));
  }
}

async function joinRoom(rid, { type, title, createdBy, targets, local }) {
  const me = ctx.me();
  session = {
    rid,
    type,
    title: title || "Call",
    host: createdBy === me.uid,
    targets: targets || [],
    local,
    micOn: true,
    camOn: type === "video",
    peers: new Map(),
    names: new Map(),
    unsubs: []
  };
  showCallView();
  addTile(me.uid, me, true, { cam: session.camOn, mic: true });
  attachLocal();

  const myPart = R(`callRooms/${rid}/participants/${me.uid}`);
  fb.onDisconnect(myPart).remove().catch(() => {});

  // Write our presence first: the read rules only allow listening once we are a participant.
  // Offers and ICE messages wait in the database, so listeners attached below still receive them.
  await fb.set(myPart, { name: me.displayName, joinedAt: Date.now(), cam: session.camOn, mic: true });

  watchSignals(rid, me.uid);
  watchParticipants(rid, me.uid);
  openBoard({ rid, me: me.uid, host: session.host });

  if (session.targets.length) {
    const updates = {};
    session.targets.forEach(uid => {
      updates[`userCalls/${uid}/${rid}`] = {
        from: me.uid,
        fromName: me.displayName,
        type,
        title: title || "Call",
        createdAt: Date.now()
      };
    });
    await fb.update(fb.ref(fb.db), updates);
  }
}

// ---------- Ringing ----------
function handleInvite(rid, invite) {
  if (!invite || session || ringing.rid) return;
  const me = ctx.me().uid;
  if (Date.now() - (invite.createdAt || 0) > INVITE_TTL) {
    fb.remove(R(`userCalls/${me}/${rid}`)).catch(() => {});
    return;
  }
  fb.get(R(`callRooms/${rid}`))
    .then(snap => {
      if (!snap.exists()) {
        fb.remove(R(`userCalls/${me}/${rid}`)).catch(() => {});
        return;
      }
      showRing(rid, invite);
    })
    .catch(() => {});
}

function showRing(rid, invite) {
  notifyIncoming(invite);
  ringing.rid = rid;
  const caller = ctx.author(invite.from) || { displayName: invite.fromName };
  $("#ringAv").innerHTML = avatarHTML(caller, "xl");
  $("#ringName").textContent = invite.fromName || caller.displayName || "Someone";
  const kind = invite.type === "video" ? "Video call" : "Audio call";
  $("#ringType").textContent = invite.title ? `${kind} · ${invite.title}` : kind;
  $("#ringView").classList.add("open");
  $("#ringAccept").onclick = () => acceptCall(rid);
  $("#ringDecline").onclick = () => declineCall(rid);
  startRing("incoming");
  $("#ringSound").hidden = soundReady();
  ringing.timer = setTimeout(() => missedCall(rid, invite), RING_TIMEOUT);
}

function hideRing() {
  clearTimeout(ringing.timer);
  stopRing();
  ringing.rid = null;
  $("#ringView").classList.remove("open");
}

async function declineCall(rid) {
  hideRing();
  await fb.remove(R(`userCalls/${ctx.me().uid}/${rid}`)).catch(() => {});
}

// ---------- Signalling ----------
function send(to, data) {
  if (!session) return;
  fb.push(R(`callRooms/${session.rid}/signals/${to}`), { from: ctx.me().uid, ...data, at: Date.now() }).catch(() => {});
}

function watchSignals(rid, me) {
  session.unsubs.push(
    fb.onChildAdded(R(`callRooms/${rid}/signals/${me}`), snap => {
      const signal = snap.val();
      fb.remove(snap.ref).catch(() => {});
      if (signal && session) handleSignal(signal);
    })
  );
}

async function handleSignal(signal) {
  const from = signal.from;
  if (signal.kind === "ice") {
    if (!signal.candidate) return;
    const peer = peerFor(from);
    if (peer.remoteSet) peer.pc.addIceCandidate(signal.candidate).catch(() => {});
    else peer.pending.push(signal.candidate);
    return;
  }
  if (signal.kind === "offer") {
    const peer = peerFor(from);
    await peer.pc.setRemoteDescription({ type: "offer", sdp: signal.sdp });
    peer.remoteSet = true;
    flushIce(peer);
    const answer = await peer.pc.createAnswer();
    await peer.pc.setLocalDescription(answer);
    send(from, { kind: "answer", sdp: answer.sdp });
    return;
  }
  if (signal.kind === "answer") {
    const peer = session.peers.get(from);
    if (!peer) return;
    await peer.pc.setRemoteDescription({ type: "answer", sdp: signal.sdp });
    peer.remoteSet = true;
    flushIce(peer);
  }
}

function flushIce(peer) {
  peer.pending.splice(0).forEach(candidate => {
    peer.pc.addIceCandidate(candidate).catch(() => {});
  });
}

function peerFor(uid) {
  let peer = session.peers.get(uid);
  if (peer) return peer;
  const pc = new RTCPeerConnection(RTC_CONFIG);
  peer = { uid, pc, pending: [], remoteSet: false, stream: new MediaStream() };
  session.peers.set(uid, peer);
  session.local.getTracks().forEach(track => pc.addTrack(track, session.local));
  pc.onicecandidate = event => {
    if (event.candidate) send(uid, { kind: "ice", candidate: event.candidate.toJSON() });
  };
  pc.ontrack = event => {
    peer.stream.addTrack(event.track);
    attachRemote(uid, peer.stream);
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed") {
      toast(`Connection with ${session?.names.get(uid) || "someone"} failed. Try again.`);
    }
  };
  return peer;
}

async function offerTo(uid) {
  const peer = peerFor(uid);
  try {
    const offer = await peer.pc.createOffer();
    await peer.pc.setLocalDescription(offer);
    send(uid, { kind: "offer", sdp: offer.sdp });
  } catch (err) {
    toast(errMsg(err));
  }
}

function closePeer(uid) {
  const peer = session?.peers.get(uid);
  if (!peer) return;
  peer.pc.close();
  session.peers.delete(uid);
}

// ---------- Participants ----------
function watchParticipants(rid, me) {
  const base = R(`callRooms/${rid}/participants`);
  session.unsubs.push(
    fb.onChildAdded(base, snap => {
      const uid = snap.key;
      if (uid === me) return;
      markConnected();
      const info = snap.val() || {};
      session.names.set(uid, info.name || "Guest");
      addTile(uid, ctx.author(uid) || { displayName: info.name }, false, info);
      if (me < uid && !session.peers.has(uid)) offerTo(uid);
    })
  );
  session.unsubs.push(
    fb.onChildChanged(base, snap => {
      if (snap.key !== me) updateFlags(snap.key, snap.val() || {});
    })
  );
  session.unsubs.push(
    fb.onChildRemoved(base, snap => {
      closePeer(snap.key);
      tileOf(snap.key)?.remove();
    })
  );
}

// ---------- Tiles ----------
function tileOf(uid) {
  return $("#tiles").querySelector(`.tile[data-uid="${uid}"]`);
}

function addTile(uid, profile, isMe, info = {}) {
  let tile = tileOf(uid);
  if (!tile) {
    tile = document.createElement("div");
    tile.className = `tile${isMe ? " me" : ""}`;
    tile.dataset.uid = uid;
    tile.innerHTML = `
      <video playsinline autoplay${isMe ? " muted" : ""}></video>
      <div class="ph"></div>
      <span class="tag"></span>
      <span class="mic-state"></span>`;
    $("#tiles").appendChild(tile);
  }
  tile.querySelector(".ph").innerHTML = avatarHTML(profile || {}, "xl");
  tile.querySelector(".tag").textContent = isMe ? "You" : profile?.displayName || info.name || "Guest";
  updateFlags(uid, info);
  const peer = session?.peers.get(uid);
  if (peer && !isMe) attachRemote(uid, peer.stream);
}

function updateFlags(uid, info) {
  const tile = tileOf(uid);
  if (!tile) return;
  tile.classList.toggle("cam-off", info.cam === false);
  tile.querySelector(".mic-state").innerHTML = info.mic === false ? icon("micoff") : "";
}

function attachRemote(uid, stream) {
  const video = tileOf(uid)?.querySelector("video");
  if (!video) return;
  if (video.srcObject !== stream) video.srcObject = stream;
  video.play?.().catch(() => {});
}

function attachLocal() {
  const video = tileOf(ctx.me().uid)?.querySelector("video");
  if (video && session) video.srcObject = session.local;
}

// ---------- Controls ----------
function toggleMic() {
  if (!session) return;
  session.micOn = !session.micOn;
  session.local.getAudioTracks().forEach(track => {
    track.enabled = session.micOn;
  });
  $("#btnMic").classList.toggle("off", !session.micOn);
  fb.update(R(`callRooms/${session.rid}/participants/${ctx.me().uid}`), { mic: session.micOn }).catch(() => {});
  updateFlags(ctx.me().uid, { mic: session.micOn, cam: session.camOn });
}

function toggleCam() {
  if (!session || session.type !== "video") return;
  session.camOn = !session.camOn;
  session.local.getVideoTracks().forEach(track => {
    track.enabled = session.camOn;
  });
  $("#btnCam").classList.toggle("off", !session.camOn);
  fb.update(R(`callRooms/${session.rid}/participants/${ctx.me().uid}`), { cam: session.camOn }).catch(() => {});
  updateFlags(ctx.me().uid, { mic: session.micOn, cam: session.camOn });
}

async function hangUp() {
  const s = session;
  if (!s) return;
  session = null;
  const me = ctx.me().uid;
  stopRingback();
  clearTimeout(s.noAnswer);
  s.unsubs.forEach(off => off());
  s.peers.forEach(peer => peer.pc.close());
  s.local.getTracks().forEach(track => track.stop());
  closeBoard();
  hideCallView();
  try {
    if (s.host) {
      for (const uid of s.targets) {
        await fb.remove(R(`userCalls/${uid}/${s.rid}`)).catch(() => {});
      }
    }
    const snap = await fb.get(R(`callRooms/${s.rid}/participants`));
    const others = Object.keys(snap.val() || {}).filter(uid => uid !== me);
    if (!others.length) {
      await fb.remove(R(`callRooms/${s.rid}`));
    } else {
      await fb.remove(R(`callRooms/${s.rid}/participants/${me}`));
      await fb.remove(R(`callRooms/${s.rid}/live/${me}`));
      await fb.remove(R(`callRooms/${s.rid}/signals/${me}`));
    }
  } catch {
    // Cleanup is best effort; the room is removed when the last person leaves.
  }
}

// ---------- Call screen ----------
function showCallView() {
  $("#callView").classList.add("open");
  $("#callTitle").textContent = session.title;
  $("#btnCam").hidden = session.type !== "video";
  setCallStatus(session.targets.length ? "Calling..." : "Joining...");
  $("#btnCam").classList.toggle("off", !session.camOn);
  $("#btnMic").classList.remove("off");
  $("#boardPanel").classList.remove("open");
  startClock();
}

function hideCallView() {
  $("#callView").classList.remove("open");
  $("#tiles").innerHTML = "";
  clearInterval(clockId);
  clockId = 0;
}

function startClock() {
  const started = Date.now();
  clearInterval(clockId);
  const tick = () => {
    const total = Math.floor((Date.now() - started) / 1000);
    const pad = value => String(value).padStart(2, "0");
    $("#callTimer").textContent = `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
  };
  tick();
  clockId = setInterval(tick, 1000);
}

// ---------- Call status, connection, timeouts and missed calls ----------
function setCallStatus(text) {
  const el = $("#callStatus");
  if (el) el.textContent = text;
}

// The first remote person joined: stop the caller's ringback and show "Connected".
function markConnected() {
  stopRingback();
  clearTimeout(session?.noAnswer);
  setCallStatus("Connected");
}

function noAnswer() {
  if (!session) return;
  toast("No answer. The call has ended.", 3500);
  hangUp();
}

function missedCall(rid, invite) {
  notifyMissed(invite);
  toast(`Missed ${invite.type === "video" ? "video" : "audio"} call from ${invite.fromName || "someone"}`, 4200);
  declineCall(rid);
}
