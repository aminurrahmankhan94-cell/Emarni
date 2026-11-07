// Scientific calculator for the call screen. Results can be placed on the whiteboard as text.
// The expression is parsed by a small, safe parser (no eval).
import { toast } from "./ui.js";
import { icon } from "./icons.js";

const FUNCS = {
  sin: (v, deg) => Math.sin(deg ? (v * Math.PI) / 180 : v),
  cos: (v, deg) => Math.cos(deg ? (v * Math.PI) / 180 : v),
  tan: (v, deg) => Math.tan(deg ? (v * Math.PI) / 180 : v),
  ln: v => Math.log(v),
  log: v => Math.log10(v),
  sqrt: v => Math.sqrt(v)
};
const CONST = { pi: Math.PI, e: Math.E };

// Keys in the panel, row by row. The value is what gets typed into the expression.
const KEYS = [
  ["sin(", "cos(", "tan(", "pi"],
  ["ln(", "log(", "sqrt(", "^"],
  ["(", ")", "%", "DEL"],
  ["7", "8", "9", "/"],
  ["4", "5", "6", "*"],
  ["1", "2", "3", "-"],
  ["0", ".", "e", "+"],
  ["AC", "ANS", "DEG", "="]
];
const PRETTY = { "*": "×", "/": "÷", "-": "−", pi: "π", "sqrt(": "√(" };

let panel = null;
let expr = "";
let ans = 0;
let deg = true;
let lastOut = "";
let onInsert = () => {};

function tokenize(src) {
  const clean = src.replace(/\s+/g, "");
  const parts = clean.match(/\d+\.?\d*|\.\d+|[a-z]+|[-+*/^%()]/g) || [];
  if (parts.join("") !== clean) {
    throw new Error("Use only numbers, + − × ÷ ^ % brackets, and the keys on the panel");
  }
  return parts.map(t => (/^(\d|\.)/.test(t) ? { num: parseFloat(t) } : t));
}

// Evaluates an expression. Grammar: expr = term (+|- term)*, term = factor (*|/|implicit factor)*,
// factor = -factor | power, power = postfix (^ factor)?, postfix = primary %*, primary = number | ( expr ) | const | fn(expr).
export function evaluate(src, degrees, previous) {
  const t = tokenize(src);
  let i = 0;
  const peek = () => t[i];
  const eat = op => {
    if (t[i] === op) {
      i += 1;
      return true;
    }
    return false;
  };
  const startsPrimary = tok =>
    tok !== undefined && (typeof tok === "object" || tok === "(" || tok === "pi" || tok === "e" || tok === "ans" || (typeof tok === "string" && FUNCS[tok]));

  const expression = () => {
    let v = term();
    while (peek() === "+" || peek() === "-") {
      const op = t[i];
      i += 1;
      const r = term();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  };
  const term = () => {
    let v = factor();
    for (;;) {
      if (peek() === "*" || peek() === "/") {
        const op = t[i];
        i += 1;
        const r = factor();
        v = op === "*" ? v * r : v / r;
      } else if (startsPrimary(peek())) {
        v *= factor(); // implicit multiplication, e.g. 2pi or 3(4+1)
      } else {
        break;
      }
    }
    return v;
  };
  const factor = () => {
    if (eat("-")) return -factor();
    if (eat("+")) return factor();
    return power();
  };
  const power = () => {
    const base = postfix();
    if (eat("^")) return Math.pow(base, factor());
    return base;
  };
  const postfix = () => {
    let v = primary();
    while (eat("%")) v /= 100;
    return v;
  };
  const primary = () => {
    const tok = t[i];
    i += 1;
    if (tok === undefined) throw new Error("The expression is not finished");
    if (typeof tok === "object") return tok.num;
    if (tok === "(") {
      const v = expression();
      if (!eat(")")) throw new Error("Missing closing bracket )");
      return v;
    }
    if (tok === "pi" || tok === "e") return CONST[tok];
    if (tok === "ans") return previous;
    if (FUNCS[tok]) {
      if (!eat("(")) throw new Error(`${tok} needs an opening bracket (`);
      const v = expression();
      if (!eat(")")) throw new Error("Missing closing bracket )");
      return FUNCS[tok](v, degrees);
    }
    throw new Error(`Unknown part: ${tok}`);
  };

  const result = expression();
  if (i !== t.length) throw new Error("Check the expression near the end");
  if (!Number.isFinite(result)) throw new Error("This result is not a real number");
  return result;
}

export function initCalc(insert) {
  onInsert = insert;
  panel = document.createElement("div");
  panel.className = "calc";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Scientific calculator");
  const keys = KEYS.map(row =>
    row
      .map(k => {
        const cls = /^[0-9]$/.test(k) ? " num" : k === "=" || k === "AC" ? " strong" : "";
        return `<button type="button" class="ck${cls}" data-k="${k}">${PRETTY[k] || k}</button>`;
      })
      .join("")
  ).join("");
  panel.innerHTML = `
    <div class="calc-head">
      <b>Scientific calculator</b>
      <span class="calc-mode" id="calcMode"></span>
      <button class="icon-btn sm" type="button" id="calcClose" aria-label="Close calculator">${icon("x")}</button>
    </div>
    <div class="calc-screen"><small id="calcExpr"></small><strong id="calcOut">0</strong></div>
    <div class="calc-keys">${keys}</div>
    <div class="calc-foot"><button class="btn sm" type="button" id="calcPut" disabled>Put result on the board</button></div>`;
  document.body.appendChild(panel);
  panel.addEventListener("click", onClick);
  paint();
}

export function toggleCalc(force) {
  if (!panel) return;
  panel.classList.toggle("open", force ?? !panel.classList.contains("open"));
  paint();
}

function onClick(event) {
  if (event.target.closest("#calcClose")) return toggleCalc(false);
  if (event.target.closest("#calcPut")) {
    if (lastOut) onInsert(`${expr} = ${lastOut}`);
    return;
  }
  const btn = event.target.closest("[data-k]");
  if (btn) press(btn.dataset.k);
}

function press(k) {
  if (k === "AC") {
    expr = "";
    lastOut = "";
  } else if (k === "DEL") {
    expr = expr.slice(0, -1);
    lastOut = "";
  } else if (k === "DEG") {
    deg = !deg;
  } else if (k === "ANS") {
    expr += "ans";
  } else if (k === "=") {
    evaluateNow();
  } else {
    expr += k;
  }
  paint();
}

function evaluateNow() {
  if (!expr.trim()) return;
  try {
    const value = evaluate(expr, deg, ans);
    ans = value;
    lastOut = String(Number(value.toPrecision(12)));
  } catch (err) {
    lastOut = "";
    toast(err.message || "Check the expression");
  }
}

function pretty(s) {
  return s.replace(/sqrt\(/g, "√(").replace(/pi/g, "π").replace(/\*/g, "×").replace(/\//g, "÷").replace(/-/g, "−");
}

function paint() {
  if (!panel) return;
  panel.querySelector("#calcMode").textContent = deg ? "DEG" : "RAD";
  panel.querySelector("#calcExpr").textContent = pretty(expr);
  panel.querySelector("#calcOut").textContent = lastOut || (expr ? "" : "0");
  panel.querySelector("#calcPut").disabled = !lastOut;
}
