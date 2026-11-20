/* =========================================================
   Emergency Shelter & Resource Locator — Bengaluru (Full Stack)
   ========================================================= */

// 1. Initialize Map Centered on Bengaluru
const map = L.map("map", {
  center: [12.9750, 77.5920],
  zoom: 12,
  zoomControl: true
});

// Primary & Fallback Tile Providers
const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  subdomains: ["a", "b", "c"],
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
});

const google = L.tileLayer("https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}", {
  maxZoom: 20,
  subdomains: ["mt0", "mt1", "mt2", "mt3"],
  attribution: '&copy; Google Maps'
});

// Add OSM as default
osm.addTo(map);

// Automatic fail-safe: if OSM tiles are blocked or timeout, switch to Google Maps tiles
let switchedToBackup = false;
osm.on("tileerror", function () {
  if (!switchedToBackup) {
    switchedToBackup = true;
    console.warn("OSM tile error detected. Falling back to Google Maps tiles.");
    if (map.hasLayer(osm)) map.removeLayer(osm);
    google.addTo(map);
  }
});

// Top-right layer toggle so user can easily switch anytime
L.control.layers({
  "OpenStreetMap": osm,
  "Google Maps": google
}, null, { position: "topright" }).addTo(map);

// Force map resize recalculation
setTimeout(() => {
  map.invalidateSize();
}, 250);
window.addEventListener("resize", () => map.invalidateSize());

// Marker layer group
const markerLayer = L.layerGroup().addTo(map);

// Fallback 8 Bengaluru Shelters (used only if FastAPI backend is offline)
const defaultShelters = [
  {
    id: 1,
    name: "Sree Kanteerava Indoor Stadium",
    shortName: "Kanteerava",
    lat: 12.9698,
    lng: 77.5926,
    openBeds: 42,
    totalBeds: 150,
    foodPackets: 320,
    water: "900 L",
    medicalKits: "Available",
    labelPos: "hidden",
    autoOpenPopup: true
  },
  {
    id: 2,
    name: "Yeshwanthpur Relief Shelter",
    shortName: "Yeshwanthpur",
    lat: 13.0280,
    lng: 77.5400,
    openBeds: 28,
    totalBeds: 100,
    foodPackets: 240,
    water: "700 L",
    medicalKits: "Available",
    labelPos: "top"
  },
  {
    id: 3,
    name: "Majestic Relief Center",
    shortName: "Majestic",
    lat: 12.9767,
    lng: 77.5713,
    openBeds: 0,
    totalBeds: 120,
    foodPackets: 0,
    water: "50 L",
    medicalKits: "Low",
    labelPos: "bottom"
  },
  {
    id: 4,
    name: "Jayanagar Community Center",
    shortName: "Jayanagar",
    lat: 12.9250,
    lng: 77.5838,
    openBeds: 64,
    totalBeds: 100,
    foodPackets: 300,
    water: "850 L",
    medicalKits: "Available",
    labelPos: "bottom"
  },
  {
    id: 5,
    name: "Koramangala Indoor Shelter",
    shortName: "Koramangala",
    lat: 12.9352,
    lng: 77.6245,
    openBeds: 19,
    totalBeds: 80,
    foodPackets: 180,
    water: "500 L",
    medicalKits: "Available",
    labelPos: "bottom"
  },
  {
    id: 6,
    name: "Indiranagar Relief Center",
    shortName: "Indiranagar",
    lat: 12.9784,
    lng: 77.6408,
    openBeds: 35,
    totalBeds: 100,
    foodPackets: 210,
    water: "600 L",
    medicalKits: "Available",
    labelPos: "top"
  },
  {
    id: 7,
    name: "Shivajinagar Public Shelter",
    shortName: "Shivajinagar",
    lat: 12.9863,
    lng: 77.6012,
    openBeds: 22,
    totalBeds: 70,
    foodPackets: 140,
    water: "400 L",
    medicalKits: "Available",
    labelPos: "top"
  },
  {
    id: 8,
    name: "Hebbal Relief Hub",
    shortName: "Hebbal",
    lat: 13.0358,
    lng: 77.5970,
    openBeds: 0,
    totalBeds: 90,
    foodPackets: 15,
    water: "100 L",
    medicalKits: "Low",
    labelPos: "bottom"
  }
];

let allShelters = [...defaultShelters];

// Normalizer matching Afrid's MySQL schema (food_pkts, water_liters) & FastAPI response
function normalizeShelter(s, index) {
  const openBeds = Number(
    s.available_beds ??
    s.open_beds ??
    s.beds ??
    (s.capacity ? s.capacity.total - s.capacity.occupied : 0)
  );

  const totalBeds = Number(
    s.total_beds ??
    (s.capacity ? s.capacity.total : (openBeds > 0 ? openBeds + 50 : 100))
  );

  const lat = parseFloat(s.latitude ?? s.lat);
  const lng = parseFloat(s.longitude ?? s.lng);

  // Match Afrid's exact MySQL columns: food_pkts and water_liters
  const rawFood = s.food_pkts ?? s.food_packets ?? s.food_status ?? 0;
  const rawWater = s.water_liters ?? s.water ?? s.water_status ?? 0;
  const rawMedical = s.medical_kits ?? s.medical_status ?? (openBeds > 0 ? "Available" : "Low");

  const foodPackets = typeof rawFood === "number"
    ? rawFood
    : (rawFood === "HIGH" ? 320 : (rawFood === "MEDIUM" ? 150 : 0));

  const water = typeof rawWater === "number"
    ? `${rawWater} L`
    : (rawWater.toString().includes("L") ? rawWater : `${rawWater} L`);

  const isFirst = index === 0 || (s.name || "").includes("Kanteerava");

  return {
    id: s.id,
    name: s.name || "Shelter",
    shortName: (s.name || "")
      .replace(/Emergency|Shelter|Relief|Community|Center|Hall|Hub|Indoor|Stadium|Public/gi, "")
      .trim() || s.name,
    lat,
    lng,
    openBeds,
    totalBeds,
    foodPackets,
    water,
    medicalKits: rawMedical === "HIGH" || rawMedical === "Available" ? "Available" : "Low",
    labelPos: isFirst ? "hidden" : (openBeds === 0 ? "bottom" : (lat > 12.98 ? "top" : "bottom")),
    autoOpenPopup: isFirst
  };
}

// Custom Marker Pin with Label
function createMarkerIcon(s) {
  const isFull = s.openBeds === 0;
  const colorClass = isFull ? "full" : "open";
  const labelText = isFull
    ? `${s.shortName || s.name} (FULL)`
    : `${s.shortName || s.name} (${s.openBeds} Beds)`;

  const labelClass = isFull ? "pin-label full" : "pin-label";
  const isTop = s.labelPos === "top";

  let innerHTML = "";
  if (s.labelPos === "hidden") {
    innerHTML = `<div class="pin-container"><div class="pin-circle ${colorClass}"></div></div>`;
  } else if (isTop) {
    innerHTML = `
      <div class="pin-container top">
        <span class="${labelClass}">${labelText}</span>
        <div class="pin-circle ${colorClass}"></div>
      </div>
    `;
  } else {
    innerHTML = `
      <div class="pin-container bottom">
        <div class="pin-circle ${colorClass}"></div>
        <span class="${labelClass}">${labelText}</span>
      </div>
    `;
  }

  return L.divIcon({
    className: "custom-map-marker",
    html: innerHTML,
    iconSize: [180, 50],
    iconAnchor: [90, isTop ? 40 : 10],
    popupAnchor: [0, isTop ? -42 : -14]
  });
}

// Build Popup Card
function buildPopupCard(s) {
  const isFull = s.openBeds === 0;
  const statusClass = isFull ? "full" : "open";
  const statusText = isFull
    ? `FULL (0 / ${s.totalBeds} Beds)`
    : `OPEN (${s.openBeds} / ${s.totalBeds} Beds)`;

  const latStr = `${Math.abs(s.lat).toFixed(4)}° N`;
  const lngStr = `${Math.abs(s.lng).toFixed(4)}° E`;

  return `
    <div class="shelter-popup-card">
      <div class="popup-title">${s.name}</div>
      <div class="popup-status ${statusClass}">
        <span class="status-bullet">●</span> Status: ${statusText}
      </div>
      <div class="popup-detail">Food Packets: ${s.foodPackets} | Water: ${s.water}</div>
      <div class="popup-detail">Medical Kits: ${s.medicalKits || "Available"}</div>
      <div class="popup-gps">GPS: ${latStr}, ${lngStr}</div>
    </div>
  `;
}

// Render Pins and apply filters
function renderPins() {
  markerLayer.clearLayers();

  const filterAvailableEl = document.getElementById("filter-available");
  const filterFoodWaterEl = document.getElementById("filter-food-water");

  const filterAvailable = filterAvailableEl ? filterAvailableEl.checked : false;
  const filterFoodWater = filterFoodWaterEl ? filterFoodWaterEl.checked : false;

  let filtered = allShelters.filter((s) => {
    if (filterAvailable && s.openBeds <= 0) {
      return false;
    }
    if (filterFoodWater) {
      const hasFood = typeof s.foodPackets === "number" ? s.foodPackets > 0 : s.foodPackets !== "0";
      const hasWater = s.water !== "0 L" && s.water !== "Low" && s.water !== "0";
      if (!hasFood || !hasWater) return false;
    }
    return true;
  });

  let targetPopupMarker = null;

  filtered.forEach((s) => {
    if (isNaN(s.lat) || isNaN(s.lng)) return;

    const marker = L.marker([s.lat, s.lng], {
      icon: createMarkerIcon(s)
    })
      .addTo(markerLayer)
      .bindPopup(buildPopupCard(s), {
        maxWidth: 320,
        autoPan: false,
        closeOnClick: false,
        autoClose: false
      });

    if (s.autoOpenPopup) {
      targetPopupMarker = marker;
    }
  });

  if (targetPopupMarker) {
    targetPopupMarker.openPopup();
  }

  map.invalidateSize();
}

// Filter Checkbox Listeners
const filterAvailableEl = document.getElementById("filter-available");
if (filterAvailableEl) filterAvailableEl.addEventListener("change", renderPins);

const filterFoodWaterEl = document.getElementById("filter-food-water");
if (filterFoodWaterEl) filterFoodWaterEl.addEventListener("change", renderPins);

// Fetch Live Data from FastAPI + MySQL Backend
async function fetchLiveShelters() {
  const badgeEl = document.getElementById("api-badge");
  try {
    const res = await fetch("http://127.0.0.1:8000/shelters");
    if (!res.ok) throw new Error("HTTP error " + res.status);
    const data = await res.json();
    const rawList = Array.isArray(data) ? data : (data.shelters || data.data || []);

    if (rawList.length > 0) {
      allShelters = rawList.map((item, idx) => normalizeShelter(item, idx));
      if (badgeEl) badgeEl.textContent = `Live MySQL: ${allShelters.length} Shelters`;
    }
  } catch (err) {
    console.warn("Backend offline. Displaying fallback Bengaluru shelters:", err.message);
    if (badgeEl) badgeEl.textContent = `Offline Mode: 8 Shelters`;
  }
  renderPins();
}

// Load on start
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", fetchLiveShelters);
} else {
  fetchLiveShelters();
}