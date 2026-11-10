// Audio and video calls. Peers connect directly (WebRTC); the database only carries signalling.
// Mesh design: for each pair, the smaller user id creates the offer. Works well up to about 4 people.
//
// SIGNALLING LOGIC (getMedia/startCall/acceptCall/joinRoom/send/watchSignals/handleSignal/
// peerFor/offerTo/closePeer/watchParticipants/hangUp cleanup) is FROZEN — do not alter.
// This shard only owns UI markup, state, styling, and event wiring.
import * as fb from "./firebase.js";
import { $, toast, avatarHTML, errMsg } from "./ui.js";
import { icon } from "./icons.js";
import { initBoardUi, openBoard, closeBoard, toggleBoardPanel } from "./board.js";
import { notifyIncoming, notifyMissed } from "./notify.js";
import { playSound } from "./sounds.js";
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

// Inline SVG icons not present in icons.js (fullscreen / minimize / restore).
const ICON_EXPAND =
  '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
const ICON_SHRINK =
  '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3v3a2 2 0 0 1-2 2H3M16 3v3a2 2 0 0 0 2 2h3M8 21v-3a2 2 0 0 0-2-2H3M16 21v-3a2 2 0 0 1 2-2h3"/></svg>';

let ctx = null;
let session = null;
const ringing = { rid: null, timer: 0 };
let clockId = 0;
let domBuilt = false;
let qualityTimer = 0;

// ---------- DOM construction (renders inside #callLayer provided by the shell) ----------
function callMarkup() {
  const tools = [
    ["pen", "Pen"],
    ["erase", "Eraser"],
    ["text", "Text"],
    ["rect", "Rectangle"],
    ["circle", "Circle"],
    ["line", "Line"],
    ["arrow", "Arrow"]
  ];
  const toolBtns = tools
    .map(([t, label]) => `<button class="tool" type="button" data-tool="${t}" title="${label}" aria-label="${label}">${icon(t === "erase" ? "eraser" : t)}</button>`)
    .join("");
  return `
  <section class="call-ring" id="ringView" aria-live="assertive" hidden>
    <div class="ring-card">
      <div class="ring-av-wrap"><div class="ring-av" id="ringAv"></div></div>
      <h2 id="ringName"></h2>
      <p class="ring-type" id="ringType"></p>
      <button class="ring-sound" id="ringSound" type="button" hidden>Tap to hear the ringtone</button>
      <div class="ring-actions">
        <button class="ring-btn decline" type="button" id="ringDecline" aria-label="Decline call">${icon("hangup")}<span>Decline</span></button>
        <button class="ring-btn accept" type="button" id="ringAccept" aria-label="Accept call">${icon("phone")}<span>Accept</span></button>
      </div>
    </div>
  </section>

  <section class="call-view" id="callView" aria-label="Call" hidden>
    <header class="call-head">
      <div class="call-head-main">
        <strong id="callTitle">Call</strong>
        <span class="call-status" id="callStatus"></span>
      </div>
      <div class="call-head-side">
        <span class="call-quality q0" id="callQuality" aria-label="Connection quality"><i></i><i></i><i></i></span>
        <span class="call-timer" id="callTimer">00:00</span>
      </div>
    </header>

    <div class="call-body">
      <div class="tiles" id="tiles"></div>

      <div class="call-outgoing" id="callOutgoing" hidden>
        <div class="out-av" id="outAv"></div>
        <h3 id="outName"></h3>
        <p class="out-status"><span class="pulse-dot"></span>Calling…</p>
        <button class="out-cancel" id="outCancel" type="button">${icon("hangup")} Cancel</button>
      </div>

      <aside class="board-panel" id="boardPanel" aria-label="Whiteboard">
        <div class="board-tools">
          <div class="tool-group">${toolBtns}</div>
          <div class="tool-divider"></div>
          <div class="board-colors" id="boardColors"></div>
          <label class="board-width" title="Brush size"><input type="range" id="boardWidth" min="2" max="28" value="6" aria-label="Brush size"></label>
          <div class="tool-divider"></div>
          <div class="tool-group">
            <button class="tool" type="button" id="boardGrid" title="Grid / graph paper" aria-label="Grid"></button>
            <button class="tool" type="button" id="boardUndo" title="Undo" aria-label="Undo">${icon("undo")}</button>
            <button class="tool" type="button" id="boardClear" title="Clear" aria-label="Clear">${icon("trash")}</button>
            <button class="tool" type="button" id="boardCalc" title="Calculator" aria-label="Calculator">${icon("calc")}</button>
            <button class="tool" type="button" id="boardLock" title="Lock board" aria-label="Lock board" hidden></button>
          </div>
        </div>
        <div class="board-paper"><canvas id="board"></canvas></div>
        <p class="board-note" id="boardNote"></p>
      </aside>
    </div>

    <footer class="call-controls">
      <button class="ctrl-btn" type="button" id="btnMic" title="Mute / unmute" aria-label="Mute or unmute microphone">${icon("mic")}<span>Mute</span></button>
      <button class="ctrl-btn" type="button" id="btnCam" title="Turn camera on / off" aria-label="Toggle camera">${icon("video")}<span>Video</span></button>
      <button class="ctrl-btn" type="button" id="btnBoard" title="Open / close whiteboard" aria-label="Toggle whiteboard">${icon("pen")}<span>Board</span></button>
      <button class="ctrl-btn" type="button" id="btnFullscreen" title="Fullscreen" aria-label="Toggle fullscreen">${ICON_EXPAND}<span>Full</span></button>
      <button class="ctrl-btn" type="button" id="btnMinimize" title="Minimize to floating chip" aria-label="Minimize call">${ICON_SHRINK}<span>Min</span></button>
      <button class="ctrl-btn hangup" type="button" id="btnHang" title="End call" aria-label="End call">${icon("hangup")}<span>End</span></button>
    </footer>
  </section>

  <div class="call-min" id="callMin" hidden>
    <span class="min-av" id="minAv"></span>
    <span class="min-timer" id="minTimer">00:00</span>
    <button class="min-restore" type="button" id="minRestore" aria-label="Restore call">${ICON_EXPAND}</button>
    <button class="min-hang" type="button" id="minHang" aria-label="End call">${icon("hangup")}</button>
  </div>`;
}

function ensureCallDom() {
  if (domBuilt) return;
  domBuilt = true;
  // Remove any legacy v8 inline call/ring markup (S1 now provides an empty #callLayer).
  // This prevents duplicate ids when running against the old index.html.
  ["#callView", "#ringView"].forEach(sel => {
    const el = document.querySelector(sel);
    if (el && !el.closest("#callLayer")) el.remove();
  });
  let layer = document.querySelector("#callLayer");
  if (!layer) {
    layer = document.createElement("div");
    layer.id = "callLayer";
    document.body.appendChild(layer);
  }
  layer.innerHTML = callMarkup();
  layer.hidden = true;
  // The minimized PiP chip lives outside #callLayer so it stays visible when the layer is hidden.
  const chip = layer.querySelector("#callMin");
  if (chip) document.body.appendChild(chip);
}

function syncLayerVisibility() {
  const layer = document.querySelector("#callLayer");
  if (!layer) return;
  const ringOpen = $("#ringView")?.classList.contains("open");
  const callOpen = $("#callView")?.classList.contains("open");
  layer.hidden = !(ringOpen || callOpen);
}

// ---------- Init ----------
export function initCalls(context) {
  ctx = context;
  ensureCallDom();
  initBoardUi();

  $("#btnMic").addEventListener("click", toggleMic);
  $("#btnCam").addEventListener("click", toggleCam);
  $("#btnBoard").addEventListener("click", () => toggleBoardPanel());
  $("#btnHang").addEventListener("click", hangUp);
  $("#btnFullscreen").addEventListener("click", toggleFullscreen);
  $("#btnMinimize").addEventListener("click", minimizeCall);
  $("#minRestore").addEventListener("click", restoreCall);
  $("#minHang").addEventListener("click", hangUp);
  $("#outCancel").addEventListener("click", hangUp);
  document.addEventListener("fullscreenchange", () => {
    $("#btnFullscreen")?.classList.toggle("on", Boolean(document.fullscreenElement));
  });

  initRingtone();
  $("#ringSound").addEventListener("click", () => {
    unlockSound();
    if (ringing.rid) startRing("incoming");
  });
  onSoundChange(ok => {
    const el = $("#ringSound");
    if (el) el.hidden = ok || !ringing.rid;
  });

  const invitesRef = R(`userCalls/${ctx.me().uid}`);
  fb.onChildAdded(invitesRef, snap => handleInvite(snap.key, snap.val()));
  fb.onChildRemoved(invitesRef, snap => {
    if (ringing.rid === snap.key) hideRing();
  });

  // Outbound call request from chat.js (detail: { targetUid, video:boolean }).
  window.addEventListener("emarni:start-call", onStartCallEvent);
}

function onStartCallEvent(ev) {
  const detail = ev?.detail || {};
  const targetUid = detail.targetUid;
  if (!targetUid) return;
  if (session || ringing.rid) return toast("Finish your current call first");
  unlockSound();
  const profile = ctx.author(targetUid) || {};
  startCall({
    type: detail.video ? "video" : "audio",
    targets: [targetUid],
    title: profile.displayName || "Call"
  });
}

// ---------- Starting and joining (SIGNALLING — PRESERVED) ----------
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
    unsubs: [],
    iceConnected: false,
    joinedOnce: false
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
  startQualityMonitor();
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

// ---------- Ringing (incoming) ----------
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
  $("#ringView").hidden = false;
  $("#ringView").classList.add("open");
  $("#ringAccept").onclick = () => acceptCall(rid);
  $("#ringDecline").onclick = () => declineCall(rid);
  startRing("incoming"); // also vibrates (ringtone.js)
  $("#ringSound").hidden = soundReady();
  syncLayerVisibility();
  ringing.timer = setTimeout(() => missedCall(rid, invite), RING_TIMEOUT);
}

function hideRing() {
  clearTimeout(ringing.timer);
  stopRing();
  ringing.rid = null;
  $("#ringView").classList.remove("open");
  $("#ringView").hidden = true;
  syncLayerVisibility();
}

async function declineCall(rid) {
  hideRing();
  await fb.remove(R(`userCalls/${ctx.me().uid}/${rid}`)).catch(() => {});
}

// ---------- Signalling (PRESERVED — do not touch) ----------
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
  // UI-only: track ICE state for status text + quality dots. Signalling unchanged.
  pc.oniceconnectionstatechange = () => updateConnState(pc.iceConnectionState);
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

// ---------- Connection state + quality (UI only) ----------
function updateConnState(state) {
  if (!session) return;
  const view = $("#callView");
  if (state === "connected" || state === "completed") {
    if (!session.iceConnected) {
      session.iceConnected = true;
      playSound("callConnected"); // plays once, when ICE actually succeeds
    }
    setCallStatus("Connected");
    setQuality(3);
  } else if (state === "checking" || state === "new") {
    if (!session.iceConnected) setCallStatus("Connecting…");
  } else if (state === "disconnected") {
    if (session.iceConnected) {
      setCallStatus("Reconnecting…");
      setQuality(1);
    }
  } else if (state === "failed") {
    setCallStatus("Reconnecting…");
    setQuality(1);
  }
}

function setQuality(q) {
  const el = $("#callQuality");
  if (!el) return;
  el.classList.remove("q0", "q1", "q2", "q3");
  el.classList.add("q" + Math.max(0, Math.min(3, q)));
}

function startQualityMonitor() {
  stopQualityMonitor();
  if (!RTCPeerConnection.prototype.getStats) return;
  qualityTimer = setInterval(async () => {
    if (!session || !session.iceConnected) return;
    let loss = 0;
    let total = 0;
    for (const peer of session.peers.values()) {
      try {
        const stats = await peer.pc.getStats();
        stats.forEach(rep => {
          if (rep.type === "inbound-rtp" && rep.packetsReceived) {
            total += rep.packetsReceived;
            loss += rep.packetsLost || 0;
          }
        });
      } catch {
        /* getStats not available on this peer */
      }
    }
    if (!total) return;
    const ratio = loss / total;
    setQuality(ratio > 0.05 ? 1 : ratio > 0.02 ? 2 : 3);
  }, 4000);
}

function stopQualityMonitor() {
  clearInterval(qualityTimer);
  qualityTimer = 0;
}

// ---------- Participants (PRESERVED) ----------
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
  tile.classList.toggle("audio-only", session?.type !== "video");
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

function toggleFullscreen() {
  const layer = document.querySelector("#callLayer");
  if (!layer) return;
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  } else {
    layer.requestFullscreen?.().catch(() => toast("Fullscreen is not available here"));
  }
}

function minimizeCall() {
  if (!session) return;
  $("#callView").classList.add("minimized");
  $("#callMin").hidden = false;
  const layer = document.querySelector("#callLayer");
  if (layer) layer.hidden = true; // chip lives in <body> and stays visible
}

function restoreCall() {
  $("#callView").classList.remove("minimized");
  $("#callMin").hidden = true;
  const layer = document.querySelector("#callLayer");
  if (layer && session) layer.hidden = false;
}

async function hangUp() {
  const s = session;
  if (!s) return;
  session = null;
  const me = ctx.me().uid;
  stopRingback();
  stopRing();
  clearTimeout(s.noAnswer);
  stopQualityMonitor();
  playSound("callEnd");
  s.unsubs.forEach(off => off());
  s.peers.forEach(peer => peer.pc.close());
  s.local.getTracks().forEach(track => track.stop());
  closeBoard();
  restoreCall();
  hideCallView();
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
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
  const view = $("#callView");
  view.hidden = false;
  view.classList.add("open");
  $("#callTitle").textContent = session.title;
  $("#btnCam").hidden = session.type !== "video";
  setCallStatus(session.targets.length ? "Calling…" : "Joining…");
  $("#btnCam").classList.toggle("off", !session.camOn);
  $("#btnMic").classList.remove("off");
  $("#boardPanel").classList.remove("open");
  // Outgoing ringing overlay (shown until the first peer actually joins).
  const out = $("#callOutgoing");
  if (session.targets.length) {
    const first = ctx.author(session.targets[0]) || {};
    $("#outAv").innerHTML = avatarHTML(first, "xl");
    $("#outName").textContent = first.displayName || session.title || "Calling";
    out.hidden = false;
    out.classList.add("show");
  } else {
    out.hidden = true;
    out.classList.remove("show");
  }
  // Minimized chip avatar = me.
  $("#minAv").innerHTML = avatarHTML(ctx.me(), "sm");
  startClock();
  syncLayerVisibility();
}

function hideCallView() {
  $("#callView").classList.remove("open");
  $("#callView").hidden = true;
  $("#tiles").innerHTML = "";
  clearInterval(clockId);
  clockId = 0;
  setQuality(0);
  syncLayerVisibility();
}

function startClock() {
  const started = Date.now();
  clearInterval(clockId);
  const tick = () => {
    const total = Math.floor((Date.now() - started) / 1000);
    const pad = value => String(value).padStart(2, "0");
    const label = `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
    $("#callTimer").textContent = label;
    const min = $("#minTimer");
    if (min) min.textContent = label;
  };
  tick();
  clockId = setInterval(tick, 1000);
}

// ---------- Call status, connection, timeouts and missed calls ----------
function setCallStatus(text) {
  const el = $("#callStatus");
  if (el) el.textContent = text;
  const view = $("#callView");
  if (!view) return;
  view.classList.remove("state-connecting", "state-connected", "state-reconnecting");
  if (text === "Connected") view.classList.add("state-connected");
  else if (text === "Reconnecting…") view.classList.add("state-reconnecting");
  else view.classList.add("state-connecting");
}

// The first remote person joined: stop ringback, hide the outgoing overlay, and
// move to "Connecting…". "Connected" + callConnected sound fire only when ICE
// actually succeeds (see updateConnState).
function markConnected() {
  if (session?.joinedOnce) return;
  if (session) session.joinedOnce = true;
  stopRingback();
  clearTimeout(session?.noAnswer);
  const out = $("#callOutgoing");
  if (out) {
    out.classList.remove("show");
    out.hidden = true;
  }
  setCallStatus("Connecting…");
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
