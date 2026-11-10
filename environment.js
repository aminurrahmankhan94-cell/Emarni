// Live time, date, location and weather, and an atmosphere that follows them.
// Weather uses Open-Meteo and the city name uses BigDataCloud. Both are free and need no API key.
import { describeWeather, atmosphereClasses, CITIES } from "./envcore.js";
import { getPref, onPrefs } from "./prefs.js";
import { icon } from "./icons.js";
import { $, esc, toast } from "./ui.js";
const PLACE_KEY = "emarni-place";
const WEATHER_KEY = "emarni-weather";
const WEATHER_TTL = 10 * 60 * 1000; // 10 minute cache
const RECHECK = 10 * 60 * 1000; // refresh every 10 minutes
const CLOCK_MS = 30 * 1000; // clock tick every 30 seconds
let place = null;
let weather = null;
let lastClasses = [];
let started = false;
function readJSON(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}
function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage is blocked: the value still works for this visit.
  }
}
export function initEnvironment() {
  if (started) return;
  started = true;
  place = readJSON(PLACE_KEY);
  weather = readJSON(WEATHER_KEY);
  // City dropdown in the env popover (manual fallback when location is not shared).
  const sel = $("#envCitySel");
  if (sel) {
    sel.innerHTML = `<option value="">Choose a city</option>${CITIES.map(
      c => `<option value="${esc(c.name)}">${esc(c.name)}</option>`
    ).join("")}`;
    sel.addEventListener("change", event => chooseCity(event.target.value));
  }
  $("#envBtn")?.addEventListener("click", () => $("#envPop")?.classList.toggle("hidden"));
  $("#envUseLoc")?.addEventListener("click", requestLocation);
  document.addEventListener(
    "click",
    event => {
      if (!event.target.closest("#envPop, #envBtn")) $("#envPop")?.classList.add("hidden");
    },
    true
  );
  onPrefs(applyAtmosphere);
  tickClock();
  setInterval(tickClock, CLOCK_MS);
  setInterval(() => refreshWeather(false), RECHECK);
  if (place) {
    paintCity();
    paintWeather();
    refreshWeather(false);
  } else {
    showNoPlace();
  }
}
function tickClock() {
  const now = new Date();
  const t = $("#envTime");
  if (t) t.textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const d = $("#envDate");
  if (d) d.textContent = now.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
  applyAtmosphere();
}
// Sets the atmosphere classes on the page. Only changes the page when the time of day or weather family changes.
function applyAtmosphere() {
  const root = document.documentElement;
  const family = weather ? describeWeather(weather.code).family : "clear";
  const next = getPref("envTheme") ? atmosphereClasses(new Date().getHours(), family) : [];
  if (next.join(" ") === lastClasses.join(" ")) return;
  lastClasses.forEach(name => root.classList.remove(name));
  next.forEach(name => root.classList.add(name));
  lastClasses = next;
}
function paintCity() {
  const el = $("#envCity");
  if (el) el.innerHTML = `${icon("pin")}${esc(place?.name || "Your area")}`;
}
function showNoPlace() {
  const el = $("#envCity");
  if (el) el.innerHTML = `${icon("pin")}Choose a city`;
  const cond = $("#envCond");
  if (cond) cond.textContent = "Tap the location button";
  const temp = $("#envTemp");
  if (temp) temp.textContent = "--°";
  const hum = $("#envHumidity") || $("#envHum");
  if (hum) hum.innerHTML = "";
  const wind = $("#envWind");
  if (wind) wind.innerHTML = "";
  paintIconWrap("cloud");
}
function paintIconWrap(name) {
  // v9: #envIconWrap contains an <i data-icon> hydrated by icons.js hydrate().
  const wrap = $("#envIconWrap");
  if (wrap) {
    const i = wrap.querySelector("i");
    if (i) {
      i.dataset.icon = name;
      delete i.dataset.iconDone;
      i.innerHTML = icon(name);
      i.dataset.iconDone = "1";
    } else {
      wrap.innerHTML = icon(name);
    }
  }
  // legacy v8 #envIcon (span) — keep working if present
  const legacy = $("#envIcon");
  if (legacy) legacy.innerHTML = icon(name);
}
function paintWeather() {
  if (!weather) return;
  const d = describeWeather(weather.code);
  paintIconWrap(d.icon);
  const temp = $("#envTemp");
  if (temp) temp.textContent = `${weather.temp}°`;
  const cond = $("#envCond");
  if (cond) cond.textContent = d.label;
  const hum = $("#envHumidity") || $("#envHum");
  if (hum) hum.innerHTML = `${icon("droplet")}${weather.hum}%`;
  const wind = $("#envWind");
  if (wind) wind.innerHTML = `${icon("wind")}${weather.wind} km/h`;
}
function placeKey() {
  return `${place.lat.toFixed(2)},${place.lon.toFixed(2)}`;
}
async function refreshWeather(force) {
  if (!place) return;
  const cached = weather && weather.place === placeKey() && Date.now() - weather.at < WEATHER_TTL;
  if (!force && cached) {
    paintWeather();
    applyAtmosphere();
    return;
  }
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Weather service replied ${res.status}`);
    const data = await res.json();
    const c = data.current || {};
    weather = {
      at: Date.now(),
      place: placeKey(),
      code: c.weather_code ?? 0,
      temp: Math.round(c.temperature_2m ?? 0),
      hum: Math.round(c.relative_humidity_2m ?? 0),
      wind: Math.round(c.wind_speed_10m ?? 0)
    };
    writeJSON(WEATHER_KEY, weather);
    paintWeather();
    applyAtmosphere();
  } catch {
    const cond = $("#envCond");
    if (cond) cond.textContent = "Weather is unavailable right now";
  }
}
async function reverseName(lat, lon) {
  const res = await fetch(
    `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`
  );
  if (!res.ok) throw new Error("Place lookup failed");
  const data = await res.json();
  return data.city || data.locality || data.principalSubdivision || "Your area";
}
async function setPlace(next) {
  place = next;
  if (!place.name) {
    paintCity();
    try {
      place.name = await reverseName(place.lat, place.lon);
    } catch {
      place.name = "Your area";
    }
  }
  writeJSON(PLACE_KEY, place);
  paintCity();
  refreshWeather(true);
}
function chooseCity(name) {
  const city = CITIES.find(c => c.name === name);
  if (!city) return;
  $("#envPop")?.classList.add("hidden");
  setPlace({ lat: city.lat, lon: city.lon, name: city.name });
}
// Asks for the browser's location permission. Call only from a button tap.
export function requestLocation() {
  $("#envPop")?.classList.add("hidden");
  if (!navigator.geolocation) {
    toast("This browser cannot share location. Choose a city instead.");
    return;
  }
  const cond = $("#envCond");
  if (cond) cond.textContent = "Finding your location...";
  navigator.geolocation.getCurrentPosition(
    pos => setPlace({ lat: pos.coords.latitude, lon: pos.coords.longitude, name: null }),
    err => {
      toast(
        err.code === 1
          ? "Location permission was denied. Choose a city instead."
          : "Could not find your location. Choose a city instead."
      );
      if (place) paintWeather();
      else showNoPlace();
    },
    { timeout: 12000, maximumAge: 600000 }
  );
}
