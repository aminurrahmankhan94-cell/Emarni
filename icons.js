// Icon set and pet illustrations. The app uses these instead of emoji.
const PATHS = {
  chat: '<path d="M20.5 11.5a7.5 7.5 0 0 1-11.1 6.6L4 19.5l1.4-4.3A7.5 7.5 0 1 1 20.5 11.5Z"/>',
  sparkle: '<path d="M12 3.5l1.7 4.8 4.8 1.7-4.8 1.7L12 16.5l-1.7-4.8L5.5 10l4.8-1.7L12 3.5Z"/><path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z"/>',
  paw: '<circle cx="6.5" cy="9.5" r="2"/><circle cx="10.5" cy="5.5" r="2"/><circle cx="14.5" cy="5.5" r="2"/><circle cx="17.5" cy="9.5" r="2"/><path d="M12 11.5c-3.3 0-6.5 3.6-6.5 6.4 0 1.7 1.3 2.6 2.9 2.6 1.1 0 1.9-.6 3.6-.6s2.5.6 3.6.6c1.6 0 2.9-.9 2.9-2.6 0-2.8-3.2-6.4-6.5-6.4Z"/>',
  megaphone: '<path d="M4 10v4a1 1 0 0 0 1 1h2.5l5 3.8V5.2L7.5 9H5a1 1 0 0 0-1 1Z"/><path d="M16 9.2a4 4 0 0 1 0 5.6M18.8 6.4a8 8 0 0 1 0 11.2"/>',
  user: '<circle cx="12" cy="8.5" r="4"/><path d="M4.5 20.5c.6-3.9 3.7-6.5 7.5-6.5s6.9 2.6 7.5 6.5"/>',
  shield: '<path d="M12 3.5l7.5 2.8v5.7c0 4.6-3.2 8.2-7.5 9-4.3-.8-7.5-4.4-7.5-9V6.3L12 3.5Z"/><path d="M9 12l2.2 2.2L15.5 10"/>',
  power: '<path d="M12 3.5v7.5"/><path d="M6.4 6.6a8 8 0 1 0 11.2 0"/>',
  phone: '<path d="M5.2 4.2h3.6l1.8 4.6-2.4 1.6a11.2 11.2 0 0 0 5.4 5.4l1.6-2.4 4.6 1.8v3.6a1.8 1.8 0 0 1-2 1.8A16.8 16.8 0 0 1 3.4 6.2a1.8 1.8 0 0 1 1.8-2Z"/>',
  hangup: '<path d="M3 14.5c5.2-3.4 12.8-3.4 18 0l-2.2 3.4-3.2-1.5v-2.4c-2.2-.6-4.3-.6-6.5 0v2.4l-3.2 1.5L3 14.5Z"/>',
  video: '<rect x="3" y="6.5" width="12.5" height="11" rx="2.5"/><path d="M15.5 10.8l5.2-3v8.4l-5.2-3"/>',
  camoff: '<path d="M3.5 3.5l17 17"/><path d="M15.5 10.8l5.2-3v8.4l-2.2-1.3M3.5 7.5A2 2 0 0 0 3 9v6a2.5 2.5 0 0 0 2.5 2.5h8.6"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.2"/><circle cx="12" cy="7.9" r=".6" fill="currentColor"/>',
  back: '<path d="M14.5 5.5L8 12l6.5 6.5"/>',
  more: '<circle cx="5.5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="18.5" cy="12" r="1.4" fill="currentColor"/>',
  heart: '<path d="M12 19.8s-7.3-4.3-7.3-9.7a4.1 4.1 0 0 1 7.3-2.5 4.1 4.1 0 0 1 7.3 2.5c0 5.4-7.3 9.7-7.3 9.7Z"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.8"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 16.5l-4.8-4.8L7 19.5"/>',
  film: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M7.5 4.5v15M16.5 4.5v15M3.5 9.5h4M3.5 14.5h4M16.5 9.5h4M16.5 14.5h4"/>',
  music: '<path d="M9 17.5V6l10-2v11.5"/><circle cx="6.2" cy="17.5" r="2.7"/><circle cx="16.2" cy="15.5" r="2.7"/>',
  mic: '<rect x="9" y="3" width="6" height="11.5" rx="3"/><path d="M5.5 11.2a6.5 6.5 0 0 0 13 0M12 17.8v3.2"/>',
  micoff: '<path d="M3.5 3.5l17 17"/><path d="M9 9.2v2.3a3 3 0 0 0 4.9 2.3M15 10.5V6a3 3 0 0 0-5.8-1.1"/><path d="M5.5 11.2a6.5 6.5 0 0 0 9.8 5.6M18.5 11.2c0 .9-.2 1.8-.5 2.6M12 17.8v3.2"/>',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2.2" fill="currentColor"/>',
  send: '<path d="M20.5 3.5l-9.8 9.8"/><path d="M20.5 3.5l-6.5 17-3.3-7.2L3.5 10l17-6.5Z"/>',
  search: '<circle cx="11" cy="11" r="6.8"/><path d="M16.2 16.2l4.6 4.6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12.8l4.4 4.4L19 7.6"/>',
  x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  copy: '<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.5"/><path d="M15.5 8.5V6.5a2.5 2.5 0 0 0-2.5-2.5H6.5A2.5 2.5 0 0 0 4 6.5V13a2.5 2.5 0 0 0 2.5 2.5h2"/>',
  flag: '<path d="M5.5 21V4.5M5.5 4.5h11.5l-2.3 4 2.3 4H5.5"/>',
  users: '<circle cx="9" cy="8.5" r="3.6"/><path d="M2.8 20.5c.5-3.5 3.1-5.6 6.2-5.6s5.7 2.1 6.2 5.6"/><path d="M15.6 5.2a3.6 3.6 0 0 1 0 6.6M18.8 14.9c1.6.9 2.5 2.8 2.7 5.6"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.2 10.5V8a3.8 3.8 0 0 1 7.6 0v2.5"/>',
  unlock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.2 10.5V8a3.8 3.8 0 0 1 7.4-1.3"/>',
  pen: '<path d="M4 20l4.2-1 10.2-10.2a2.2 2.2 0 0 0-3.1-3.1L5.1 15.9 4 20Z"/><path d="M13.8 6.4l3.8 3.8"/>',
  eraser: '<path d="M4 19.5h16"/><path d="M3.8 13.8l8.3-8.3a2 2 0 0 1 2.8 0l4.4 4.4a2 2 0 0 1 0 2.8l-6.2 6.2H8.6L3.8 15.7a2 2 0 0 1 0-1.9Z"/>',
  undo: '<path d="M9.5 14.5L4.5 9.5l5-5"/><path d="M4.5 9.5h10a5.5 5.5 0 0 1 0 11h-3.5"/>',
  pin: '<path d="M12 21s-6.5-5.7-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 15.3 12 21 12 21Z"/><circle cx="12" cy="9.8" r="2.3"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="14.5" rx="2.8"/><path d="M4 10.5h16M8.5 3.5v4M15.5 3.5v4"/>',
  userplus: '<circle cx="10" cy="8.5" r="4"/><path d="M3 20.5c.5-3.5 3.3-5.7 7-5.7s6.5 2.2 7 5.7M19 8v6M16 11h6"/>',
  chevright: '<path d="M9.5 5.5l6.5 6.5-6.5 6.5"/>',
  record: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.6" fill="currentColor"/>',
  bell: '<path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15l1.5-2Z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  calc: '<rect x="5" y="3.5" width="14" height="17" rx="2.5"/><path d="M8.5 7.5h7M8.5 12.5h1.5M12.5 12.5h1.5M8.5 16h1.5M12.5 16h1.5"/>',
  type: '<path d="M5 6.5V5h14v1.5M12 5v14M9 19h6"/>',
  line: '<path d="M5 19L19 5"/>',
  arrow: '<path d="M5 19L19 5M11 5h8v8"/>',
  rect: '<rect x="4.5" y="6.5" width="15" height="11" rx="1.5"/>',
  circle: '<circle cx="12" cy="12" r="7.5"/>',
  grid: '<path d="M4 9h16M4 15h16M9 4v16M15 4v16"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  volume: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/>',
  device: '<rect x="3" y="4.5" width="18" height="12" rx="2"/><path d="M8 20.5h8M12 16.5v4"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3M14 9l2 2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/>',
  cloud: '<path d="M7 18.5h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.2 9.6 3.5 3.5 0 0 0 7 18.5Z"/>',
  cloudsun: '<circle cx="8.5" cy="8.5" r="3"/><path d="M8.5 2.5v1M2.5 8.5h1M4.3 4.3l.7.7M12.7 4.3l-.7.7"/><path d="M9 18.5h8.5a3.5 3.5 0 0 0 .3-7 4.8 4.8 0 0 0-9.2 1.2A2.9 2.9 0 0 0 9 18.5Z"/>',
  rain: '<path d="M7 14.5h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.2 5.6 3.5 3.5 0 0 0 7 14.5Z"/><path d="M8 17.5l-1 2.5M12 17.5l-1 2.5M16 17.5l-1 2.5"/>',
  storm: '<path d="M7 14.5h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.2 5.6 3.5 3.5 0 0 0 7 14.5Z"/><path d="M12.5 15.5l-2 4h2.5l-1.5 3.5"/>',
  snow: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/>',
  fog: '<path d="M4 9h16M3 13h18M5 17h14"/>',
  droplet: '<path d="M12 3.5c3 4.2 5.5 7.4 5.5 10.2A5.5 5.5 0 0 1 6.5 13.7C6.5 10.9 9 7.7 12 3.5Z"/>',
  wind: '<path d="M3 8h11a3 3 0 1 0-3-3M3 13h16a3 3 0 1 1-3 3M3 18h7"/>',
  dot: '<circle cx="12" cy="12" r="3"/>'
};

// Stroke icon as an inline SVG string.
export function icon(name, cls = "") {
  return `<svg class="ico${cls ? " " + cls : ""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] || PATHS.dot}</svg>`;
}

// Fills every <i data-icon="name"> element in the static HTML with its icon.
export function hydrate(root = document) {
  root.querySelectorAll("[data-icon]").forEach(el => {
    if (el.dataset.iconDone) return;
    el.innerHTML = icon(el.dataset.icon);
    el.dataset.iconDone = "1";
  });
}

const ART = {
  Cat: `<svg viewBox="0 0 120 120" aria-hidden="true">
    <path d="M26 52L30 18l22 20z" fill="#ef4444"/><path d="M94 52L90 18L68 38z" fill="#ef4444"/>
    <ellipse cx="60" cy="66" rx="36" ry="32" fill="#f4f4f5"/>
    <ellipse cx="46" cy="62" rx="4.2" ry="5.2" fill="#0a0a0a"/><ellipse cx="74" cy="62" rx="4.2" ry="5.2" fill="#0a0a0a"/>
    <path d="M55 74h10l-5 5z" fill="#ef4444"/>
    <path d="M30 74h14M30 81l13-3M90 74H76M90 81l-13-3" stroke="#0a0a0a" stroke-width="2" stroke-linecap="round" fill="none"/>
  </svg>`,
  Dog: `<svg viewBox="0 0 120 120" aria-hidden="true">
    <ellipse cx="28" cy="66" rx="13" ry="24" fill="#7f1d1d"/><ellipse cx="92" cy="66" rx="13" ry="24" fill="#7f1d1d"/>
    <ellipse cx="60" cy="62" rx="34" ry="36" fill="#f4f4f5"/>
    <circle cx="48" cy="56" r="4.5" fill="#0a0a0a"/><circle cx="72" cy="56" r="4.5" fill="#0a0a0a"/>
    <circle cx="49.5" cy="54.5" r="1.4" fill="#fff"/><circle cx="73.5" cy="54.5" r="1.4" fill="#fff"/>
    <ellipse cx="60" cy="74" rx="8" ry="6" fill="#0a0a0a"/>
    <path d="M54 84q6 9 12 0z" fill="#ef4444"/>
  </svg>`,
  Rabbit: `<svg viewBox="0 0 120 120" aria-hidden="true">
    <ellipse cx="46" cy="34" rx="9" ry="28" fill="#f4f4f5"/><ellipse cx="74" cy="34" rx="9" ry="28" fill="#f4f4f5"/>
    <ellipse cx="46" cy="36" rx="4" ry="18" fill="#ef4444"/><ellipse cx="74" cy="36" rx="4" ry="18" fill="#ef4444"/>
    <circle cx="60" cy="74" r="30" fill="#f4f4f5"/>
    <circle cx="50" cy="70" r="4" fill="#0a0a0a"/><circle cx="70" cy="70" r="4" fill="#0a0a0a"/>
    <path d="M56 80h8l-4 4z" fill="#ef4444"/>
  </svg>`,
  Bird: `<svg viewBox="0 0 120 120" aria-hidden="true">
    <path d="M48 40q10-18 26-6q-6 8-6 12z" fill="#ef4444"/>
    <ellipse cx="58" cy="70" rx="34" ry="28" fill="#f4f4f5"/>
    <path d="M28 72q14-22 36-10q-10 18-36 10z" fill="#ef4444"/>
    <circle cx="78" cy="58" r="4.5" fill="#0a0a0a"/>
    <path d="M90 62l14 6-14 5z" fill="#0a0a0a"/>
  </svg>`,
  Other: `<svg viewBox="0 0 120 120" aria-hidden="true">
    <circle cx="30" cy="48" r="11" fill="#f4f4f5"/><circle cx="50" cy="30" r="11" fill="#f4f4f5"/>
    <circle cx="72" cy="30" r="11" fill="#f4f4f5"/><circle cx="92" cy="48" r="11" fill="#f4f4f5"/>
    <path d="M60 58c-16 0-30 18-30 32 0 9 7 13 14 13 7 0 9-4 16-4s9 4 16 4c7 0 14-4 14-13 0-14-14-32-30-32Z" fill="#ef4444"/>
  </svg>`
};

// Illustration for a pet's species, used when a listing has no photo.
export function petArt(species) {
  return ART[species] || ART.Other;
}
