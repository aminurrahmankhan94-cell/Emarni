// The Emarni mark: a black disc with a red spiral that turns. It replaces the old letter logo.

// One spiral arm, drawn as a polyline from the centre outwards.
function arm(offset) {
  let d = "";
  for (let i = 0; i <= 64; i += 1) {
    const t = i / 64;
    const angle = offset + t * 2.6 * Math.PI * 2;
    const r = 3 + t * 41;
    const x = (50 + r * Math.cos(angle)).toFixed(2);
    const y = (50 + r * Math.sin(angle)).toFixed(2);
    d += `${i === 0 ? "M" : "L"}${x} ${y}`;
  }
  return d;
}

export function brandSVG() {
  const arms = [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3]
    .map((offset, i) => `<path class="arm a${i}" d="${arm(offset)}"/>`)
    .join("");
  return `<svg class="brand-svg" viewBox="0 0 100 100" aria-hidden="true">
    <defs>
      <radialGradient id="emBg" cx="32%" cy="28%" r="80%">
        <stop offset="0" stop-color="#3b0b0b"/>
        <stop offset="1" stop-color="#000000"/>
      </radialGradient>
      <linearGradient id="emRed" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#fecaca"/>
        <stop offset=".5" stop-color="#ef4444"/>
        <stop offset="1" stop-color="#7f1d1d"/>
      </linearGradient>
    </defs>
    <circle cx="50" cy="50" r="49" fill="url(#emBg)" stroke="rgba(239,68,68,.45)" stroke-width="1"/>
    <g class="spin">${arms}</g>
    <circle cx="50" cy="50" r="4.5" fill="#ffffff"/>
  </svg>`;
}

// Fills every [data-brand] element with the mark.
export function mountBrands(root = document) {
  root.querySelectorAll("[data-brand]").forEach(el => {
    if (el.dataset.brandDone) return;
    el.innerHTML = brandSVG();
    el.dataset.brandDone = "1";
  });
}
