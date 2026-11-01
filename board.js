// Shared whiteboard used inside a call. Strokes are stored in the call room and sync live.
import * as fb from "./firebase.js";
import { $, $$, toast, errMsg, COLORS } from "./ui.js";

const W = 1600;
const H = 900;
const R = path => fb.ref(fb.db, path);
const toArr = value => (Array.isArray(value) ? value : Object.values(value || {}));
const clamp01 = value => Math.min(1, Math.max(0, value));

const st = {
  rid: null,
  me: null,
  host: false,
  unsubs: [],
  strokes: new Map(), // strokeId -> stroke, in drawing order
  live: {}, // uid -> stroke being drawn right now
  locked: false,
  mine: [], // ids of my strokes, for undo
  cur: null, // stroke I am drawing
  lastLive: 0,
  color: "#67e8f9",
  width: 6,
  erase: false
};

let canvas = null;
let g = null;

export function initBoardUi() {
  canvas = $("#board");
  canvas.width = W;
  canvas.height = H;
  g = canvas.getContext("2d");

  $("#boardColors").innerHTML = COLORS.map(c => `<button type="button" data-c="${c}" style="background:${c}" aria-label="Colour ${c}"></button>`).join("");
  $("#boardColors").addEventListener("click", event => {
    const btn = event.target.closest("[data-c]");
    if (!btn) return;
    st.color = btn.dataset.c;
    st.erase = false;
    paintTools();
  });
  $("#boardWidth").addEventListener("input", event => {
    st.width = Number(event.target.value);
  });
  $("#boardErase").addEventListener("click", () => {
    st.erase = !st.erase;
    paintTools();
  });
  $("#boardUndo").addEventListener("click", undo);
  $("#boardClear").addEventListener("click", clearBoard);
  $("#boardLock").addEventListener("click", toggleLock);

  canvas.addEventListener("pointerdown", event => {
    if (!canDraw()) return;
    canvas.setPointerCapture(event.pointerId);
    st.cur = { c: st.color, w: st.width, e: st.erase ? 1 : 0, p: [] };
    addPoint(event);
    redraw();
  });
  canvas.addEventListener("pointermove", event => {
    if (!st.cur) return;
    addPoint(event);
    const now = Date.now();
    if (now - st.lastLive > 120) {
      st.lastLive = now;
      fb.set(R(`callRooms/${st.rid}/live/${st.me}`), st.cur).catch(() => {});
    }
    redraw();
  });
  canvas.addEventListener("pointerup", finishStroke);
  canvas.addEventListener("pointercancel", finishStroke);
}

// Starts listening to the board of a call room.
export function openBoard({ rid, me, host }) {
  closeBoard();
  st.rid = rid;
  st.me = me;
  st.host = host;
  st.strokes = new Map();
  st.live = {};
  st.locked = false;
  st.mine = [];
  st.cur = null;
  st.unsubs.push(
    fb.onValue(R(`callRooms/${rid}/board`), snap => {
      const next = new Map();
      snap.forEach(child => {
        next.set(child.key, child.val());
      });
      st.strokes = next;
      redraw();
    })
  );
  st.unsubs.push(
    fb.onValue(R(`callRooms/${rid}/live`), snap => {
      st.live = snap.val() || {};
      redraw();
    })
  );
  st.unsubs.push(
    fb.onValue(R(`callRooms/${rid}/boardLocked`), snap => {
      st.locked = snap.val() === true;
      paintTools();
    })
  );
  paintTools();
  redraw();
}

export function closeBoard() {
  st.unsubs.forEach(off => off());
  st.unsubs = [];
  st.rid = null;
  st.cur = null;
  if (g) g.clearRect(0, 0, W, H);
}

export function toggleBoardPanel(force) {
  $("#boardPanel").classList.toggle("open", force ?? !$("#boardPanel").classList.contains("open"));
}

function canDraw() {
  return Boolean(st.rid) && (st.host || !st.locked);
}

function addPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const x = clamp01((event.clientX - rect.left) / rect.width);
  const y = clamp01((event.clientY - rect.top) / rect.height);
  st.cur.p.push(Math.round(x * 10000) / 10000, Math.round(y * 10000) / 10000);
}

async function finishStroke() {
  if (!st.cur) return;
  const stroke = st.cur;
  st.cur = null;
  if (stroke.p.length >= 2 && st.rid) {
    try {
      const key = fb.push(R(`callRooms/${st.rid}/board`)).key;
      await fb.set(R(`callRooms/${st.rid}/board/${key}`), { uid: st.me, ...stroke });
      st.mine.push(key);
    } catch (err) {
      toast(errMsg(err));
    }
  }
  if (st.rid) fb.remove(R(`callRooms/${st.rid}/live/${st.me}`)).catch(() => {});
  redraw();
}

async function undo() {
  if (!st.rid || !canDraw()) return;
  const key = st.mine.pop();
  if (!key) return toast("Nothing to undo");
  await fb.remove(R(`callRooms/${st.rid}/board/${key}`)).catch(err => toast(errMsg(err)));
}

async function clearBoard() {
  if (!st.rid) return;
  if (st.host) {
    await fb.remove(R(`callRooms/${st.rid}/board`)).catch(err => toast(errMsg(err)));
    st.mine = [];
    return;
  }
  if (st.locked) return toast("The host has locked the board");
  const keys = [...st.mine];
  st.mine = [];
  for (const key of keys) {
    await fb.remove(R(`callRooms/${st.rid}/board/${key}`)).catch(() => {});
  }
}

function toggleLock() {
  if (!st.host || !st.rid) return;
  fb.set(R(`callRooms/${st.rid}/boardLocked`), !st.locked).catch(err => toast(errMsg(err)));
}

function paintTools() {
  $$("#boardColors [data-c]").forEach(btn => btn.classList.toggle("on", !st.erase && btn.dataset.c === st.color));
  $("#boardWidth").value = st.width;
  $("#boardErase").classList.toggle("on", st.erase);
  $("#boardLock").hidden = !st.host;
  $("#boardLock").textContent = st.locked ? "🔓 Unlock board" : "🔒 Lock board";
  $("#boardLock").classList.toggle("on", st.locked);
  $("#boardClear").textContent = st.host ? "Clear all" : "Clear mine";
  canvas.classList.toggle("readonly", !canDraw());
  let note = "";
  if (st.locked && !st.host) note = "The teacher has locked the board. You can watch along.";
  if (st.locked && st.host) note = "Board is locked. Only you can draw.";
  $("#boardNote").textContent = note;
}

function drawStroke(stroke, alpha) {
  const pts = toArr(stroke.p);
  if (pts.length < 2) return;
  const width = Number(stroke.w) || 6;
  g.save();
  g.globalAlpha = alpha;
  g.lineCap = "round";
  g.lineJoin = "round";
  g.globalCompositeOperation = stroke.e ? "destination-out" : "source-over";
  g.strokeStyle = stroke.c || "#ffffff";
  g.fillStyle = stroke.c || "#ffffff";
  g.lineWidth = width;
  g.beginPath();
  if (pts.length < 4) {
    g.arc(pts[0] * W, pts[1] * H, width / 2, 0, Math.PI * 2);
    g.fill();
  } else {
    g.moveTo(pts[0] * W, pts[1] * H);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i] * W, pts[i + 1] * H);
    g.stroke();
  }
  g.restore();
}

function redraw() {
  if (!g) return;
  g.clearRect(0, 0, W, H);
  st.strokes.forEach(stroke => drawStroke(stroke, 1));
  Object.entries(st.live).forEach(([uid, stroke]) => {
    if (uid !== st.me && stroke) drawStroke(stroke, 0.85);
  });
  if (st.cur) drawStroke(st.cur, 0.9);
}
