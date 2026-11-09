// Live time, date, location and weather, and an atmosphere that follows them.
// Weather uses Open-Meteo and the city name uses BigDataCloud. Both are free and need no API key.
import { describeWeather, atmosphereClasses, CITIES } from "./envcore.js";
import { getPref, onPrefs } from "./prefs.js";
import { icon } from "./icons.js";
import { $, esc, toast } from "./ui.js";

const PLACE_KEY = "emarni-place";
const WEATHER_KEY = "emarni-weather";
const WEATHER_TTL = 15 * 60 * 1000;
const RECHECK = 5 * 60 * 1000;

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

  $("#envCitySel").innerHTML = `<option value="">Choose a city</option>${CITIES.map(c => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join("")}`;
  $("#envBtn").addEventListener("click", () => $("#envPop").classList.toggle("hidden"));
  $("#envUseLoc").addEventListener("click", requestLocation);
  $("#envCitySel").addEventListener("change", event => chooseCity(event.target.value));
  document.addEventListener(
    "click",
    event => {
      if (!event.target.closest("#envPop, #envBtn")) $("#envPop").classList.add("hidden");
    },
    true
  );
  onPrefs(applyAtmosphere);

  tickClock();
  setInterval(tickClock, 1000);
  setInterval(() => refreshWeather(false), RECHECK);

  if (place) {
    $("#envCity").innerHTML = `${icon("pin")}${esc(place.name || "Your area")}`;
    paintWeather();
    refreshWeather(false);
  } else {
    showNoPlace();
  }
}

function tickClock() {
  const now = new Date();
  $("#envTime").textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  $("#envDate").textContent = now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "short", year: "numeric" });
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

function showNoPlace() {
  $("#envCity").innerHTML = `${icon("pin")}Choose a city`;
  $("#envCond").textContent = "Tap the location button";
  $("#envTemp").textContent = "--°C";
  $("#envHum").innerHTML = "";
  $("#envWind").innerHTML = "";
}

function paintWeather() {
  if (!weather) return;
  const d = describeWeather(weather.code);
  $("#envIcon").innerHTML = icon(d.icon);
  $("#envTemp").textContent = `${weather.temp}°C`;
  $("#envCond").textContent = d.label;
  $("#envHum").innerHTML = `${icon("droplet")}${weather.hum}%`;
  $("#envWind").innerHTML = `${icon("wind")}${weather.wind} km/h`;
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
    $("#envCond").textContent = "Weather is unavailable right now";
  }
}

async function reverseName(lat, lon) {
  const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`);
  if (!res.ok) throw new Error("Place lookup failed");
  const data = await res.json();
  return data.city || data.locality || data.principalSubdivision || "Your area";
}

async function setPlace(next) {
  place = next;
  if (!place.name) {
    $("#envCity").innerHTML = `${icon("pin")}Your area`;
    try {
      place.name = await reverseName(place.lat, place.lon);
    } catch {
      place.name = "Your area";
    }
  }
  writeJSON(PLACE_KEY, place);
  $("#envCity").innerHTML = `${icon("pin")}${esc(place.name)}`;
  refreshWeather(true);
}

function chooseCity(name) {
  const city = CITIES.find(c => c.name === name);
  if (!city) return;
  $("#envPop").classList.add("hidden");
  setPlace({ lat: city.lat, lon: city.lon, name: city.name });
}

// Asks for the browser's location permission. Call only from a button tap.
export function requestLocation() {
  $("#envPop").classList.add("hidden");
  if (!navigator.geolocation) {
    toast("This browser cannot share location. Choose a city instead.");
    return;
  }
  $("#envCond").textContent = "Finding your location...";
  navigator.geolocation.getCurrentPosition(
    pos => setPlace({ lat: pos.coords.latitude, lon: pos.coords.longitude, name: null }),
    err => {
      toast(err.code === 1 ? "Location permission was denied. Choose a city instead." : "Could not find your location. Choose a city instead.");
      if (place) paintWeather();
      else showNoPlace();
    },
    { timeout: 12000, maximumAge: 600000 }
  );
}
