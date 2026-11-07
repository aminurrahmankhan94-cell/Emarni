// Shared whiteboard used inside a call: pen, typed text, shapes, eraser, grid or graph paper,
// the calculator, undo, clear, and a host lock. Everything syncs live through the call room.
import * as fb from "./firebase.js";
import { $, $$, toast, errMsg, COLORS, askText } from "./ui.js";
import { icon } from "./icons.js";
import { initCalc, toggleCalc } from "./calc.js";

const W = 1600;
const H = 900;
const R = path => fb.ref(fb.db, path);
const toArr = value => (Array.isArray(value) ? value : Object.values(value || {}));
const clamp01 = v => Math.min(1, Math.max(0, v));
const round4 = v => Math.round(v * 10000) / 10000;
const GRID_NAMES = ["Grid off", "Grid", "Graph paper"];

const st = {
  rid: null,
  me: null,
  host: false,
  unsubs: [],
  strokes: new Map(), // item id -> item, in drawing order
  live: {}, // uid -> pen stroke being drawn right now
  locked: false,
  mine: [], // ids of my items, for undo
  cur: null, // item I am drawing right now
  lastLive: 0,
  color: "#ffffff",
  width: 6,
  tool: "pen",
  grid: 0
};

let canvas = null;
let g = null;
let paper = null;

export function initBoardUi() {
  canvas = $("#board");
  paper = canvas.parentElement;
  canvas.width = W;
  canvas.height = H;
  g = canvas.getContext("2d");

  $("#boardColors").innerHTML = COLORS.map(c => `<button type="button" data-c="${c}" style="background:${c}" aria-label="Colour ${c}"></button>`).join("");
  $("#boardColors").addEventListener("click", event => {
    const btn = event.target.closest("[data-c]");
    if (!btn) return;
    st.color = btn.dataset.c;
    if (st.tool === "erase") st.tool = "pen";
    paintTools();
  });
  $$("[data-tool]").forEach(btn => btn.addEventListener("click", () => setTool(btn.dataset.tool)));
  $("#boardWidth").addEventListener("input", event => {
    st.width = Number(event.target.value);
  });
  $("#boardGrid").addEventListener("click", () => {
    st.grid = (st.grid + 1) % GRID_NAMES.length;
    paintTools();
  });
  $("#boardCalc").addEventListener("click", () => toggleCalc());
  initCalc(text => placeText(text));
  $("#boardUndo").addEventListener("click", undo);
  $("#boardClear").addEventListener("click", clearBoard);
  $("#boardLock").addEventListener("click", toggleLock);

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", finish);
  canvas.addEventListener("pointercancel", finish);
  paintTools();
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

function setTool(tool) {
  st.tool = tool;
  paintTools();
}

function norm(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: round4(clamp01((event.clientX - rect.left) / rect.width)),
    y: round4(clamp01((event.clientY - rect.top) / rect.height))
  };
}

function onDown(event) {
  if (!canDraw()) return;
  const p = norm(event);
  if (st.tool === "text") {
    addTextAt(p);
    return;
  }
  canvas.setPointerCapture(event.pointerId);
  if (st.tool === "pen" || st.tool === "erase") {
    st.cur = { kind: "pen", c: st.color, w: st.width, e: st.tool === "erase" ? 1 : 0, p: [p.x, p.y] };
  } else {
    st.cur = { kind: "shape", k: st.tool, c: st.color, w: st.width, p: [p.x, p.y, p.x, p.y] };
  }
  redraw();
}

function onMove(event) {
  if (!st.cur) return;
  const p = norm(event);
  if (st.cur.kind === "pen") {
    st.cur.p.push(p.x, p.y);
    const now = Date.now();
    if (now - st.lastLive > 120 && st.rid) {
      st.lastLive = now;
      fb.set(R(`callRooms/${st.rid}/live/${st.me}`), st.cur).catch(() => {});
    }
  } else {
    st.cur.p[2] = p.x;
    st.cur.p[3] = p.y;
  }
  redraw();
}

async function finish() {
  if (!st.cur) return;
  const cur = st.cur;
  st.cur = null;
  if (st.rid) {
    const valid = cur.kind === "pen" ? cur.p.length >= 2 : Math.hypot(cur.p[2] - cur.p[0], cur.p[3] - cur.p[1]) > 0.004;
    if (valid) {
      const data =
        cur.kind === "pen"
          ? { uid: st.me, c: cur.c, w: cur.w, e: cur.e, p: cur.p }
          : { uid: st.me, t: "shp", k: cur.k, c: cur.c, w: cur.w, p: cur.p };
      await saveItem(data);
    }
    if (cur.kind === "pen") fb.remove(R(`callRooms/${st.rid}/live/${st.me}`)).catch(() => {});
  }
  redraw();
}

async function saveItem(data) {
  try {
    const key = fb.push(R(`callRooms/${st.rid}/board`)).key;
    await fb.set(R(`callRooms/${st.rid}/board/${key}`), data);
    st.mine.push(key);
  } catch (err) {
    toast(errMsg(err));
  }
}

async function addTextAt(p) {
  if (!st.rid) return;
  const text = await askText({ title: "Type on the board", placeholder: "Write the text to place here", okText: "Place" });
  if (!text) return;
  await saveItem({ uid: st.me, t: "txt", c: st.color, w: st.width, p: [p.x, p.y], s: text.slice(0, 300) });
}

// Used by the calculator: puts the text in the middle of the board.
function placeText(text) {
  if (!canDraw()) return toast("You cannot draw on this board right now");
  saveItem({ uid: st.me, t: "txt", c: st.color, w: st.width, p: [0.5, 0.45], s: String(text).slice(0, 300) });
  toast("Result placed on the board");
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
  $$("[data-tool]").forEach(btn => btn.classList.toggle("on", btn.dataset.tool === st.tool));
  $$("#boardColors [data-c]").forEach(btn => btn.classList.toggle("on", btn.dataset.c === st.color));
  $("#boardWidth").value = st.width;
  $("#boardGrid").innerHTML = `${icon("grid")}<span>${GRID_NAMES[st.grid]}</span>`;
  $("#boardGrid").classList.toggle("on", st.grid > 0);
  paper.classList.toggle("grid-on", st.grid === 1);
  paper.classList.toggle("graph-on", st.grid === 2);
  $("#boardLock").hidden = !st.host;
  $("#boardLock").innerHTML = `${icon(st.locked ? "unlock" : "lock")}<span>${st.locked ? "Unlock board" : "Lock board"}</span>`;
  $("#boardLock").classList.toggle("on", st.locked);
  $("#boardClear").innerHTML = `${icon("trash")}<span>${st.host ? "Clear all" : "Clear mine"}</span>`;
  canvas.classList.toggle("readonly", !canDraw());
  let note = "";
  if (st.locked && !st.host) note = "The teacher has locked the board. You can watch along.";
  if (st.locked && st.host) note = "Board is locked. Only you can draw.";
  $("#boardNote").textContent = note;
}

// ---------- Drawing ----------
function drawItem(item, alpha) {
  if (item.t === "txt") return drawText(item, alpha);
  if (item.t === "shp" || item.kind === "shape") return drawShape(item, alpha);
  return drawPen(item, alpha);
}

function drawPen(stroke, alpha) {
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

function drawText(item, alpha) {
  const p = toArr(item.p);
  if (p.length < 2) return;
  const size = 16 + (Number(item.w) || 6) * 2.4;
  g.save();
  g.globalAlpha = alpha;
  g.fillStyle = item.c || "#ffffff";
  g.font = `600 ${size}px "Hind Siliguri", system-ui, sans-serif`;
  g.textBaseline = "top";
  String(item.s || "")
    .split("\n")
    .forEach((line, i) => g.fillText(line, p[0] * W, p[1] * H + i * size * 1.3));
  g.restore();
}

function drawShape(item, alpha) {
  const pts = toArr(item.p);
  if (pts.length < 4) return;
  const x1 = pts[0] * W;
  const y1 = pts[1] * H;
  const x2 = pts[2] * W;
  const y2 = pts[3] * H;
  const width = Number(item.w) || 6;
  g.save();
  g.globalAlpha = alpha;
  g.strokeStyle = item.c || "#ffffff";
  g.lineWidth = width;
  g.lineCap = "round";
  g.lineJoin = "round";
  g.beginPath();
  if (item.k === "line") {
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
  } else if (item.k === "arrow") {
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const head = 14 + width * 2;
    g.moveTo(x2, y2);
    g.lineTo(x2 - head * Math.cos(angle - 0.45), y2 - head * Math.sin(angle - 0.45));
    g.moveTo(x2, y2);
    g.lineTo(x2 - head * Math.cos(angle + 0.45), y2 - head * Math.sin(angle + 0.45));
  } else if (item.k === "rect") {
    g.rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
  } else if (item.k === "circle") {
    const rx = Math.max(Math.abs(x2 - x1) / 2, 0.5);
    const ry = Math.max(Math.abs(y2 - y1) / 2, 0.5);
    g.ellipse((x1 + x2) / 2, (y1 + y2) / 2, rx, ry, 0, 0, Math.PI * 2);
  }
  g.stroke();
  g.restore();
}

function redraw() {
  if (!g) return;
  g.clearRect(0, 0, W, H);
  st.strokes.forEach(item => drawItem(item, 1));
  Object.entries(st.live).forEach(([uid, stroke]) => {
    if (uid !== st.me && stroke) drawItem(stroke, 0.85);
  });
  if (st.cur) drawItem(st.cur, 0.9);
}
