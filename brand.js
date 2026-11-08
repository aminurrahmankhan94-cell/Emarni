// The Emarni mark: a red and black kite with white facet lines, a string and tails that move in the wind.
// Drawn from the brand artwork. Each part has a class so CSS can animate it.

const TAILS = [
  { cls: "tail t1", d: "M22 64 L4 96 L12 99 L30 72 Z", fill: "#ef4444" },
  { cls: "tail t2", d: "M28 72 L14 108 L22 109 L37 80 Z", fill: "#0a0a0a" },
  { cls: "tail t3", d: "M35 76 L26 104 L33 105 L44 82 Z", fill: "#dc2626" },
  { cls: "tail t1", d: "M76 98 L92 118 L98 112 L82 92 Z", fill: "#0a0a0a" },
  { cls: "tail t2", d: "M84 92 L104 106 L108 100 L92 86 Z", fill: "#ef4444" }
];

export function brandSVG() {
  const tails = TAILS.map(t => `<path class="${t.cls}" d="${t.d}" fill="${t.fill}"/>`).join("");
  return `<svg class="brand-svg kite" viewBox="0 0 120 120" aria-hidden="true">
    <g class="tails">${tails}</g>
    <g class="body">
      <path d="M50 10 L110 42 L70 104 L8 66 Z" fill="#0a0a0a"/>
      <path d="M56 18 L70 60 L16 64 Z" fill="#ef4444"/>
      <path d="M56 18 L102 44 L70 60 Z" fill="#b91c1c"/>
      <path d="M16 64 L70 60 L68 96 Z" fill="#991b1b"/>
      <path d="M102 44 L68 96 L70 60 Z" fill="#ef4444"/>
      <path d="M56 18 L70 60 L68 96" fill="none" stroke="#0a0a0a" stroke-width="3" stroke-linejoin="round"/>
      <path d="M16 64 L70 60 L102 44" fill="none" stroke="#0a0a0a" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M60 28 L92 44 M30 62 L64 54 M76 64 L96 50" fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round"/>
    </g>
    <path class="string" d="M68 96 Q82 110 66 118" fill="none" stroke="#0a0a0a" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`;
}

// Fills every [data-brand] element with the kite.
export function mountBrands(root = document) {
  root.querySelectorAll("[data-brand]").forEach(el => {
    if (el.dataset.brandDone) return;
    el.innerHTML = brandSVG();
    el.dataset.brandDone = "1";
  });
}
