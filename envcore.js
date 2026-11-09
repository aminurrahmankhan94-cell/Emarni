// Pure helpers for the live time, weather and atmosphere. No DOM and no network, so they can be tested.
// Weather codes follow the WMO standard that Open-Meteo returns.
export const WEATHER = {
  0: ["Clear sky", "sun", "clear"],
  1: ["Mainly clear", "sun", "clear"],
  2: ["Partly cloudy", "cloudsun", "cloud"],
  3: ["Overcast", "cloud", "cloud"],
  45: ["Fog", "fog", "fog"],
  48: ["Freezing fog", "fog", "fog"],
  51: ["Light drizzle", "rain", "rain"],
  53: ["Drizzle", "rain", "rain"],
  55: ["Heavy drizzle", "rain", "rain"],
  61: ["Light rain", "rain", "rain"],
  63: ["Rain", "rain", "rain"],
  65: ["Heavy rain", "rain", "rain"],
  71: ["Light snow", "snow", "snow"],
  73: ["Snow", "snow", "snow"],
  75: ["Heavy snow", "snow", "snow"],
  80: ["Rain showers", "rain", "rain"],
  81: ["Rain showers", "rain", "rain"],
  82: ["Violent showers", "storm", "storm"],
  95: ["Thunderstorm", "storm", "storm"],
  96: ["Thunderstorm with hail", "storm", "storm"],
  99: ["Thunderstorm with hail", "storm", "storm"]
};

export function describeWeather(code) {
  const [label, icon, family] = WEATHER[Number(code)] || ["Weather unavailable", "cloud", "cloud"];
  return { label, icon, family };
}

// morning 05:00-10:59, afternoon 11:00-15:59, evening 16:00-18:59, night otherwise.
export function partOfDay(hour) {
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 16) return "afternoon";
  if (hour >= 16 && hour < 19) return "evening";
  return "night";
}

// The classes that set the atmosphere, for the time of day and the weather family.
export function atmosphereClasses(hour, family) {
  const weatherClass = family && family !== "clear" ? `wx-${family}` : "wx-clear";
  return [`env-${partOfDay(hour)}`, weatherClass];
}

// Cities for the manual choice, used when location is not shared.
export const CITIES = [
  { name: "Dhaka", lat: 23.8103, lon: 90.4125 },
  { name: "Chattogram", lat: 22.3569, lon: 91.7832 },
  { name: "Sylhet", lat: 24.8949, lon: 91.8687 },
  { name: "Khulna", lat: 22.8456, lon: 89.5403 },
  { name: "Rajshahi", lat: 24.3745, lon: 88.6042 },
  { name: "Barishal", lat: 22.701, lon: 90.3535 },
  { name: "Rangpur", lat: 25.7439, lon: 89.2752 },
  { name: "Mymensingh", lat: 24.7471, lon: 90.4203 }
];
