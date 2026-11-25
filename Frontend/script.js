/* =========================================================
   Emergency Shelter & Resource Locator — Bengaluru (Full Stack v2.0)
   ========================================================= */

const API_BASE = "http://127.0.0.1:8001";

// 1. Initialize Map Centered on Bengaluru
const map = L.map("map", {
  center: [12.9750, 77.5920],
  zoom: 12,
  zoomControl: true
});

// Tile Providers
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

// Fail-safe tile error listener
let switchedToBackup = false;
osm.on("tileerror", function () {
  if (!switchedToBackup) {
    switchedToBackup = true;
    console.warn("OSM tile error detected. Falling back to Google Maps tiles.");
    if (map.hasLayer(osm)) map.removeLayer(osm);
    google.addTo(map);
  }
});

// Top-right layer toggle
L.control.layers({
  "OpenStreetMap": osm,
  "Google Maps": google
}, null, { position: "topright" }).addTo(map);

// Map Layers
const shelterMarkerLayer = L.layerGroup().addTo(map);
const routeLayerGroup = L.layerGroup().addTo(map);
let userMarker = null;

// State Variables
let userLocation = null; // { lat, lng }
let activeDestinationShelter = null; // shelter object
let allShelters = [];
let lastConfirmedBooking = null;

// Fallback Shelters (Bengaluru) if backend is offline
const defaultShelters = [
  {
    id: 1,
    name: "Sree Kanteerava Indoor Stadium",
    shortName: "Kanteerava",
    address: "Kasturba Road, Sampangi Rama Nagar, Bengaluru",
    lat: 12.9698,
    lng: 77.5926,
    openBeds: 42,
    totalBeds: 150,
    foodPackets: 320,
    water: "900 L",
    medicalKits: "Available",
    contactPhone: "+91 80 2222 0001",
    description: "Major indoor stadium relief camp. First aid center active near Gate 2.",
    isActive: true,
    labelPos: "hidden",
    autoOpenPopup: true
  },
  {
    id: 2,
    name: "Yeshwanthpur Relief Shelter",
    shortName: "Yeshwanthpur",
    address: "Tumkur Road, Yeshwanthpur, Bengaluru",
    lat: 13.0181,
    lng: 77.5565,
    openBeds: 28,
    totalBeds: 100,
    foodPackets: 250,
    water: "700 L",
    medicalKits: "Available",
    contactPhone: "+91 80 2337 1102",
    description: "Transit management center equipped with emergency rations and clean resting mats.",
    isActive: true,
    labelPos: "top"
  },
  {
    id: 3,
    name: "Kempegowda Bus Station (Majestic)",
    shortName: "Majestic",
    address: "Tank Bund Road, Majestic, Bengaluru",
    lat: 12.9767,
    lng: 77.5726,
    openBeds: 0,
    totalBeds: 120,
    foodPackets: 300,
    water: "800 L",
    medicalKits: "Low",
    contactPhone: "+91 80 2287 3303",
    description: "Central bus concourse. Currently at capacity; redirecting to Freedom Park or Kanteerava.",
    isActive: true,
    labelPos: "bottom"
  },
  {
    id: 4,
    name: "Koramangala Indoor Stadium",
    shortName: "Koramangala",
    address: "80 Feet Road, 8th Block, Koramangala, Bengaluru",
    lat: 12.9435,
    lng: 77.6228,
    openBeds: 19,
    totalBeds: 80,
    foodPackets: 180,
    water: "500 L",
    medicalKits: "Available",
    contactPhone: "+91 80 2553 4404",
    description: "Community indoor arena with clean drinking water and baby food packets available.",
    isActive: true,
    labelPos: "bottom"
  },
  {
    id: 5,
    name: "Jayanagar Civic Association",
    shortName: "Jayanagar",
    address: "Near 4th Block Complex, Jayanagar, Bengaluru",
    lat: 12.9265,
    lng: 77.5832,
    openBeds: 64,
    totalBeds: 100,
    foodPackets: 220,
    water: "650 L",
    medicalKits: "Available",
    contactPhone: "+91 80 2664 5505",
    description: "High-capacity community hall. Medical triage and emergency beds ready on Ground Floor.",
    isActive: true,
    labelPos: "bottom"
  },
  {
    id: 6,
    name: "Freedom Park",
    shortName: "Freedom Park",
    address: "Seshadri Road, Gandhi Nagar, Bengaluru",
    lat: 12.9774,
    lng: 77.5819,
    openBeds: 0,
    totalBeds: 90,
    foodPackets: 200,
    water: "600 L",
    medicalKits: "Low",
    contactPhone: "+91 80 2220 6606",
    description: "Outdoor park pavilion with covered shelters. Currently full.",
    isActive: true,
    labelPos: "top"
  },
  {
    id: 7,
    name: "Cubbon Park Relief Post",
    shortName: "Cubbon Park",
    address: "Near High Court, Kasturba Road, Bengaluru",
    lat: 12.9741,
    lng: 77.5934,
    openBeds: 25,
    totalBeds: 70,
    foodPackets: 150,
    water: "450 L",
    medicalKits: "Available",
    contactPhone: "+91 80 2286 7707",
    description: "Temporary relief camp with paramedical staff and bottled water.",
    isActive: true,
    labelPos: "top"
  },
  {
    id: 8,
    name: "Bengaluru Palace Grounds",
    shortName: "Bengaluru Palace",
    address: "Palace Road, Vasanth Nagar, Bengaluru",
    lat: 13.0035,
    lng: 77.5891,
    openBeds: 38,
    totalBeds: 150,
    foodPackets: 310,
    water: "850 L",
    medicalKits: "Available",
    contactPhone: "+91 80 2336 8808",
    description: "Spacious exhibition hall relief center with high-volume food distribution.",
    isActive: true,
    labelPos: "bottom"
  }
];

allShelters = [...defaultShelters];

// Normalizer
function normalizeShelter(s, index) {
  const openBeds = Number(
    s.available_beds ?? s.open_beds ?? s.beds ?? 0
  );

  const totalBeds = Number(
    s.total_beds ?? (openBeds > 0 ? openBeds + 50 : 100)
  );

  const lat = parseFloat(s.latitude ?? s.lat);
  const lng = parseFloat(s.longitude ?? s.lng);

  const rawFood = s.food_pkts ?? s.food_packets ?? 0;
  const rawWater = s.water_liters ?? s.water ?? 0;
  const rawMedical = s.medical_status ?? s.medical_kits ?? "Available";
  const contactPhone = s.contact_phone ?? s.contactPhone ?? "+91 80 2297 5000";
  const description = s.description ?? "";
  const isActive = s.is_active !== undefined ? Boolean(s.is_active) : true;

  const foodPackets = typeof rawFood === "number" ? rawFood : parseInt(rawFood, 10) || 0;
  const water = typeof rawWater === "number" ? `${rawWater} L` : (rawWater.toString().includes("L") ? rawWater : `${rawWater} L`);

  const isFirst = index === 0 || (s.name || "").includes("Kanteerava");

  return {
    id: s.id,
    name: s.name || "Shelter",
    shortName: (s.name || "")
      .replace(/Emergency|Shelter|Relief|Community|Center|Hall|Hub|Indoor|Stadium|Public/gi, "")
      .trim() || s.name,
    address: s.address || "Bengaluru",
    lat,
    lng,
    openBeds,
    totalBeds,
    foodPackets,
    water,
    medicalKits: rawMedical,
    contactPhone,
    description,
    isActive,
    labelPos: isFirst ? "hidden" : (openBeds === 0 ? "bottom" : (lat > 12.98 ? "top" : "bottom")),
    autoOpenPopup: isFirst
  };
}

// Haversine Distance
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

// Custom Marker Pin
function createMarkerIcon(s) {
  const isInactive = !s.isActive;
  const isFull = s.openBeds === 0;

  let colorClass = "open";
  let labelText = `${s.shortName || s.name} (${s.openBeds} Beds)`;

  if (isInactive) {
    colorClass = "inactive";
    labelText = `${s.shortName || s.name} (INACTIVE)`;
  } else if (isFull) {
    colorClass = "full";
    labelText = `${s.shortName || s.name} (FULL)`;
  }

  const labelClass = `pin-label ${colorClass}`;
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

// User Location Pulsing Pin
function createUserMarkerIcon() {
  return L.divIcon({
    className: "custom-map-marker",
    html: `
      <div class="user-marker-container">
        <div class="user-marker-pulse"></div>
        <div class="user-marker-core"></div>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18]
  });
}

// Build Popup Card with Both Road Directions AND Emergency Bed/Food Reservation
function buildPopupCard(s) {
  const isInactive = !s.isActive;
  const isFull = s.openBeds === 0;

  let statusClass = "open";
  let statusText = `OPEN (${s.openBeds} / ${s.totalBeds} Beds Available)`;

  if (isInactive) {
    statusClass = "inactive";
    statusText = "INACTIVE / CLOSED";
  } else if (isFull) {
    statusClass = "full";
    statusText = `FULL (0 / ${s.totalBeds} Beds Available)`;
  }

  let distHtml = "";
  if (userLocation) {
    const dist = calculateDistance(userLocation.lat, userLocation.lng, s.lat, s.lng);
    distHtml = `<div class="popup-detail" style="font-weight: 700; color: #2563eb;">📍 Distance: ${dist} km away</div>`;
  }

  const latStr = `${Math.abs(s.lat).toFixed(4)}° N`;
  const lngStr = `${Math.abs(s.lng).toFixed(4)}° E`;

  return `
    <div class="shelter-popup-card">
      <div class="popup-title">${s.name}</div>
      <div class="popup-address">${s.address}</div>
      <div class="popup-status ${statusClass}">
        <span class="status-bullet">●</span> ${statusText}
      </div>
      ${distHtml}
      <div class="popup-detail">🍱 Food Packets: <strong>${s.foodPackets}</strong> | 💧 Water: <strong>${s.water}</strong></div>
      <div class="popup-detail">💊 Medical Kits: <strong>${s.medicalKits || "Available"}</strong></div>
      <div class="popup-contact">
        Emergency Contact: <a href="tel:${s.contactPhone}">📞 ${s.contactPhone}</a>
      </div>
      ${s.description ? `<div class="popup-detail" style="font-style: italic; color: #64748b; margin-top: 4px;">ℹ️ ${s.description}</div>` : ""}
      <div class="popup-gps">GPS: ${latStr}, ${lngStr}</div>
      
      <div class="popup-actions">
        <button class="popup-btn-reserve" ${isFull || isInactive ? 'disabled' : ''} onclick="openReservationModal(${s.id})">
          🛏️ Reserve Bed &amp; Supplies (Get OTP)
        </button>
        <div class="popup-buttons-row">
          <button class="popup-btn-nav" onclick="navigateToShelter(${s.id})">
            🚗 Get Road Directions
          </button>
        </div>
      </div>
    </div>
  `;
}

// Render Pins
function renderPins() {
  shelterMarkerLayer.clearLayers();

  const filterAvailableEl = document.getElementById("filter-available");
  const filterFoodWaterEl = document.getElementById("filter-food-water");

  const filterAvailable = filterAvailableEl ? filterAvailableEl.checked : false;
  const filterFoodWater = filterFoodWaterEl ? filterFoodWaterEl.checked : false;

  let filtered = allShelters.filter((s) => {
    if (!s.isActive) return false;
    if (filterAvailable && s.openBeds <= 0) return false;
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
      .addTo(shelterMarkerLayer)
      .bindPopup(buildPopupCard(s), {
        maxWidth: 320,
        autoPan: false,
        closeOnClick: false,
        autoClose: false
      });

    if (s.autoOpenPopup && !userLocation) {
      targetPopupMarker = marker;
    }
  });

  if (targetPopupMarker) {
    targetPopupMarker.openPopup();
  }

  map.invalidateSize();
}

// ----------------- User Emergency Location Logic -----------------

function setUserLocation(lat, lng, centerMap = true) {
  userLocation = { lat, lng };

  // Update or create user marker
  if (userMarker) {
    userMarker.setLatLng([lat, lng]);
  } else {
    userMarker = L.marker([lat, lng], {
      icon: createUserMarkerIcon(),
      draggable: true,
      zIndexOffset: 1000
    }).addTo(map);

    userMarker.bindTooltip("Your Emergency Location<br>(Drag to adjust)", {
      direction: "top",
      offset: [0, -18],
      permanent: false
    });

    userMarker.on("dragend", function (e) {
      const pos = e.target.getLatLng();
      setUserLocation(pos.lat, pos.lng, false);
    });
  }

  // Update status bar
  const coordsText = document.getElementById("location-coords-text");
  const clearBtn = document.getElementById("btn-clear-location");
  if (coordsText) {
    coordsText.innerHTML = `Location: <strong>${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E</strong>`;
  }
  if (clearBtn) clearBtn.style.display = "block";

  if (centerMap) {
    map.setView([lat, lng], 13);
  }

  // Calculate recommendations
  updateShelterRecommendations();

  // If a road route is active, recalculate road route to selected shelter
  if (activeDestinationShelter) {
    calculateRoadRoute(activeDestinationShelter);
  }

  // Refresh popups to update distance text
  renderPins();
}

function clearUserLocation() {
  userLocation = null;
  activeDestinationShelter = null;

  if (userMarker) {
    map.removeLayer(userMarker);
    userMarker = null;
  }

  routeLayerGroup.clearLayers();

  const coordsText = document.getElementById("location-coords-text");
  const clearBtn = document.getElementById("btn-clear-location");
  const recContainer = document.getElementById("recommendations-container");
  const routeCard = document.getElementById("route-navigation-card");

  if (coordsText) coordsText.textContent = "No location selected yet. Click map or GPS.";
  if (clearBtn) clearBtn.style.display = "none";
  if (recContainer) recContainer.style.display = "none";
  if (routeCard) routeCard.style.display = "none";

  renderPins();
}

// ----------------- Shelter Recommendations Logic -----------------

function updateShelterRecommendations() {
  if (!userLocation) return;

  const recContainer = document.getElementById("recommendations-container");
  const recList = document.getElementById("recommendations-list");
  const recNotice = document.getElementById("recommendations-notice");

  // 1. Retrieve active shelters
  const activeShelters = allShelters.filter(s => s.isActive);

  // 2. Compute distance for all active shelters
  const withDistance = activeShelters.map(s => ({
    ...s,
    distanceKm: calculateDistance(userLocation.lat, userLocation.lng, s.lat, s.lng)
  }));

  // Sort all by distance
  withDistance.sort((a, b) => a.distanceKm - b.distanceKm);

  // Check if nearest overall active shelter is full
  const nearestOverall = withDistance[0];
  const closestIsFull = nearestOverall && nearestOverall.openBeds === 0;

  if (closestIsFull && recNotice) {
    recNotice.style.display = "block";
    recNotice.innerHTML = `⚠️ Nearest shelter <strong>${nearestOverall.name}</strong> (${nearestOverall.distanceKm} km) is currently <strong>FULL</strong>. Recommending next available shelters:`;
  } else if (recNotice) {
    recNotice.style.display = "none";
  }

  // Filter available shelters (beds > 0)
  const availableShelters = withDistance.filter(s => s.openBeds > 0);

  if (availableShelters.length === 0) {
    recList.innerHTML = `<div style="font-size: 12px; color: #dc2626; padding: 6px;">All nearby shelters are currently at full capacity. Please contact emergency services.</div>`;
    recContainer.style.display = "block";
    return;
  }

  // Display top recommendations
  const topRecs = availableShelters.slice(0, 5);

  recList.innerHTML = topRecs.map((s, idx) => {
    const isRank1 = idx === 0;
    const rankLabel = isRank1 ? "#1 Closest Available" : `#${idx + 1} Nearby Shelter`;
    const rankClass = isRank1 ? "rank-1" : "rank-other";
    const isActiveDest = activeDestinationShelter && activeDestinationShelter.id === s.id;

    return `
      <div class="rec-card ${isActiveDest ? 'active-dest' : ''}" onclick="navigateToShelter(${s.id})">
        <div class="rec-card-top">
          <span class="rec-rank-badge ${rankClass}">${rankLabel}</span>
          <span class="rec-dist">${s.distanceKm} km</span>
        </div>
        <div class="rec-name">${s.name}</div>
        <div class="rec-meta">
          <span class="rec-beds-open">🛏️ ${s.openBeds} beds open</span>
          <span>&bull;</span>
          <span>🍱 ${s.foodPackets} pkts</span>
        </div>
        <div class="rec-buttons-row">
          <button class="rec-btn-reserve" onclick="event.stopPropagation(); openReservationModal(${s.id})">
            🛏️ Reserve (Get OTP)
          </button>
          <button class="rec-btn-nav" onclick="event.stopPropagation(); navigateToShelter(${s.id})">
            🚗 Navigate
          </button>
        </div>
      </div>
    `;
  }).join("");

  recContainer.style.display = "block";
}

// ----------------- OSRM Road Route Navigation -----------------

window.navigateToShelter = async function(shelterId) {
  const shelter = allShelters.find(s => s.id === shelterId);
  if (!shelter) return;

  // If user has not set location yet, use Bengaluru City Center as default emergency origin
  if (!userLocation) {
    setUserLocation(12.9716, 77.5946, false);
    alert("Location was not set. Default emergency location placed at Bengaluru Center. You can click anywhere on the map or drag the blue pin to change your location.");
  }

  activeDestinationShelter = shelter;
  await calculateRoadRoute(shelter);
  updateShelterRecommendations();
};

async function calculateRoadRoute(shelter) {
  if (!userLocation || !shelter) return;

  const routeCard = document.getElementById("route-navigation-card");
  const routeDestName = document.getElementById("route-dest-name");
  const routeDistVal = document.getElementById("route-distance-val");
  const routeTimeVal = document.getElementById("route-time-val");
  const routeNote = document.getElementById("route-instructions-text");

  if (routeCard) routeCard.style.display = "block";
  if (routeDestName) routeDestName.textContent = shelter.name;
  if (routeDistVal) routeDistVal.textContent = "Calculating...";
  if (routeTimeVal) routeTimeVal.textContent = "Calculating...";

  routeLayerGroup.clearLayers();

  const userLon = userLocation.lng;
  const userLat = userLocation.lat;
  const shelterLon = shelter.lng;
  const shelterLat = shelter.lat;

  // OSRM Driving Route API
  const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${userLon},${userLat};${shelterLon},${shelterLat}?overview=full&geometries=geojson`;

  try {
    const res = await fetch(osrmUrl);
    if (!res.ok) throw new Error("OSRM routing returned HTTP " + res.status);
    const data = await res.json();

    if (!data.routes || data.routes.length === 0) {
      throw new Error("No road route found between locations.");
    }

    const route = data.routes[0];
    const geojson = route.geometry;
    const distanceKm = (route.distance / 1000).toFixed(1);
    const durationMins = Math.max(1, Math.round(route.duration / 60));

    // Outer casing line for high contrast
    L.geoJSON(geojson, {
      style: {
        color: "#ffffff",
        weight: 8,
        opacity: 0.95,
        lineCap: "round",
        lineJoin: "round"
      }
    }).addTo(routeLayerGroup);

    // Vibrant driving route line
    const polylineLayer = L.geoJSON(geojson, {
      style: {
        color: "#2563eb",
        weight: 5,
        opacity: 0.9,
        lineCap: "round",
        lineJoin: "round"
      }
    }).addTo(routeLayerGroup);

    if (routeDistVal) routeDistVal.textContent = `${distanceKm} km`;
    if (routeTimeVal) routeTimeVal.textContent = `${durationMins} mins`;
    if (routeNote) {
      routeNote.textContent = `Actual road route via OSRM. Follow the blue route to ${shelter.name}.`;
    }

    // Zoom and pan map to fit entire route
    const bounds = polylineLayer.getBounds();
    map.fitBounds(bounds, { padding: [50, 50] });

  } catch (err) {
    console.warn("OSRM routing error or rate limit:", err.message);

    // Fallback: calculate Haversine distance and draw direct guide route
    const haversineDist = calculateDistance(userLocation.lat, userLocation.lng, shelter.lat, shelter.lng);
    const estDriveTime = Math.max(2, Math.round((haversineDist / 25) * 60));

    const line = L.polyline([[userLocation.lat, userLocation.lng], [shelter.lat, shelter.lng]], {
      color: "#2563eb",
      weight: 4,
      dashArray: "6, 8"
    }).addTo(routeLayerGroup);

    if (routeDistVal) routeDistVal.textContent = `~${haversineDist} km`;
    if (routeTimeVal) routeTimeVal.textContent = `~${estDriveTime} mins`;
    if (routeNote) {
      routeNote.textContent = `Direct routing connection. Head towards ${shelter.address}.`;
    }

    map.fitBounds(line.getBounds(), { padding: [50, 50] });
  }
}

// ----------------- Citizen Reservation & OTP Flow (No Registration Required) -----------------

const resModal = document.getElementById("reservation-modal");
const resForm = document.getElementById("reservation-form");
const closeResModalBtn = document.getElementById("close-reservation-modal");
const cancelResModalBtn = document.getElementById("cancel-reservation-btn");
const submitResBtn = document.getElementById("submit-reservation-btn");
const resBtnText = document.getElementById("res-btn-text");
const resBtnSpinner = document.getElementById("res-btn-spinner");

const otpModal = document.getElementById("otp-confirmation-modal");
const btnOtpNavigate = document.getElementById("btn-otp-navigate");
const btnOtpDone = document.getElementById("btn-otp-done");

window.openReservationModal = function(shelterId) {
  const shelter = allShelters.find(s => s.id === shelterId);
  if (!shelter) return;

  document.getElementById("res-shelter-id").value = shelter.id;
  document.getElementById("res-shelter-title").textContent = shelter.name;
  document.getElementById("res-shelter-address").textContent = shelter.address || "Bengaluru";

  document.getElementById("res-pill-beds").textContent = `🛏️ ${shelter.openBeds} Beds Open`;
  document.getElementById("res-pill-food").textContent = `🍱 ${shelter.foodPackets} Food Pkts`;
  document.getElementById("res-pill-water").textContent = `💧 ${shelter.water}`;

  const bedsInput = document.getElementById("res-beds-count");
  bedsInput.max = shelter.openBeds;
  bedsInput.value = shelter.openBeds > 0 ? 1 : 0;
  document.getElementById("res-beds-limit").textContent = `Max allowable: ${shelter.openBeds} beds`;

  document.getElementById("res-food-count").max = shelter.foodPackets || 99;
  document.getElementById("res-citizen-name").value = "";
  document.getElementById("res-citizen-phone").value = "";

  resModal.classList.remove("modal-hidden");
};

function closeReservationModal() {
  resModal.classList.add("modal-hidden");
  resForm.reset();
}

if (closeResModalBtn) closeResModalBtn.addEventListener("click", closeReservationModal);
if (cancelResModalBtn) cancelResModalBtn.addEventListener("click", closeReservationModal);

if (resForm) {
  resForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const shelterId = parseInt(document.getElementById("res-shelter-id").value, 10);
    const name = document.getElementById("res-citizen-name").value.trim();
    const phone = document.getElementById("res-citizen-phone").value.trim();
    const beds = parseInt(document.getElementById("res-beds-count").value, 10) || 0;
    const food = parseInt(document.getElementById("res-food-count").value, 10) || 0;
    const water = parseInt(document.getElementById("res-water-count").value, 10) || 0;

    if (!name || !phone) {
      alert("Please provide your name and mobile phone number for the admission OTP code.");
      return;
    }

    if (beds === 0 && food === 0 && water === 0) {
      alert("Please request at least one resource: beds, food packets, or drinking water.");
      return;
    }

    submitResBtn.disabled = true;
    resBtnText.textContent = "Generating Admission OTP...";
    resBtnSpinner.style.display = "inline-block";

    try {
      const res = await fetch(`${API_BASE}/reservations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name,
          phone: phone,
          shelter_id: shelterId,
          beds_requested: beds,
          food_pkts_requested: food,
          water_liters_requested: water
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Unable to complete reservation. Capacity may have just updated.");
      }

      lastConfirmedBooking = {
        ...data,
        shelterId: shelterId
      };

      closeReservationModal();

      // Show OTP Confirmation Modal
      showOtpConfirmation(data, shelterId);

      // Re-fetch live shelters to reflect decremented beds/food/water
      await fetchLiveShelters();

    } catch (err) {
      alert("Reservation notice: " + err.message);
    } finally {
      submitResBtn.disabled = false;
      resBtnText.textContent = "Confirm & Generate Admission OTP";
      resBtnSpinner.style.display = "none";
    }
  });
}

function showOtpConfirmation(data, shelterId) {
  const shelter = allShelters.find(s => s.id === shelterId) || (data.shelter ? normalizeShelter(data.shelter, 0) : null);

  document.getElementById("otp-code-number").textContent = data.otp_code;
  document.getElementById("otp-booking-id").textContent = `Confirmation ID: #${data.confirmation_id || data.booking_id}`;
  document.getElementById("otp-shelter-name").textContent = shelter ? shelter.name : "Emergency Relief Shelter";
  document.getElementById("otp-citizen-name").textContent = `${data.citizen_name || "Citizen"} (${data.phone || ""})`;
  document.getElementById("otp-resources-text").textContent = `🛏️ ${data.beds_reserved ?? data.beds_requested ?? 1} Bed(s), 🍱 ${data.food_pkts_reserved ?? data.food_pkts_requested ?? 0} Food Pkts, 💧 ${data.water_liters_reserved ?? data.water_liters_requested ?? 0}L Water`;

  otpModal.classList.remove("modal-hidden");
}

if (btnOtpDone) {
  btnOtpDone.addEventListener("click", () => {
    otpModal.classList.add("modal-hidden");
  });
}

if (btnOtpNavigate) {
  btnOtpNavigate.addEventListener("click", () => {
    otpModal.classList.add("modal-hidden");
    if (lastConfirmedBooking && lastConfirmedBooking.shelterId) {
      navigateToShelter(lastConfirmedBooking.shelterId);
    }
  });
}

// ----------------- Citizen Booking Lookup / OTP Modal -----------------

const btnOpenLookup = document.getElementById("btn-open-lookup");
const lookupModal = document.getElementById("lookup-modal");
const closeLookupModal = document.getElementById("close-lookup-modal");
const lookupForm = document.getElementById("lookup-form");
const lookupInput = document.getElementById("lookup-input");
const lookupResults = document.getElementById("lookup-results");

if (btnOpenLookup) {
  btnOpenLookup.addEventListener("click", () => {
    lookupResults.innerHTML = "";
    lookupInput.value = "";
    lookupModal.classList.remove("modal-hidden");
  });
}

if (closeLookupModal) {
  closeLookupModal.addEventListener("click", () => {
    lookupModal.classList.add("modal-hidden");
  });
}

if (lookupForm) {
  lookupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const query = lookupInput.value.trim();
    if (!query) return;

    lookupResults.innerHTML = `<div style="text-align: center; color: #64748b; padding: 10px;">Searching database...</div>`;

    try {
      const isOtp = /^\d{6}$/.test(query);
      const url = isOtp
        ? `${API_BASE}/reservations/lookup?otp=${encodeURIComponent(query)}`
        : `${API_BASE}/reservations/lookup?phone=${encodeURIComponent(query)}`;

      const res = await fetch(url);
      if (!res.ok) throw new Error("Search failed");
      const list = await res.json();

      if (!list || list.length === 0) {
        lookupResults.innerHTML = `<div style="color: #dc2626; font-size: 13px; padding: 8px;">No active reservation found for "${query}".</div>`;
        return;
      }

      lookupResults.innerHTML = list.map(b => `
        <div style="background: #f8fafc; border: 1.5px solid #2563eb; border-radius: 8px; padding: 12px; margin-bottom: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <strong style="color: #0f172a; font-size: 14px;">${b.shelter_name}</strong>
            <span style="background: #dcfce7; color: #166534; font-weight: 800; padding: 2px 8px; border-radius: 4px; font-size: 11px;">${b.reservation_status || "CONFIRMED"}</span>
          </div>
          <div style="margin: 8px 0; background: #eff6ff; padding: 8px; border-radius: 6px; text-align: center;">
            <span style="font-size: 11px; color: #1e40af; font-weight: 700;">ADMISSION OTP CODE:</span>
            <div style="font-size: 22px; font-weight: 900; color: #1e3a8a; font-family: monospace; letter-spacing: 2px;">${b.otp_code}</div>
          </div>
          <div style="font-size: 12px; color: #334155;">
            👤 ${b.citizen_name} &bull; 📞 ${b.user_phone}<br>
            🛏️ ${b.beds_requested || 1} Bed(s) &bull; 🍱 ${b.food_pkts || 0} Food Pkts &bull; 💧 ${b.water_liters || 0}L Water
          </div>
          <button style="margin-top: 8px; width: 100%; background: #2563eb; color: #fff; border: none; border-radius: 4px; padding: 6px; font-weight: 700; cursor: pointer; font-size: 12px;" onclick="lookupModal.classList.add('modal-hidden'); navigateToShelter(${b.shelter_id});">
            🚗 Navigate to this Shelter
          </button>
        </div>
      `).join("");

    } catch (err) {
      lookupResults.innerHTML = `<div style="color: #dc2626; font-size: 13px;">Error: ${err.message}</div>`;
    }
  });
}

// ----------------- GPS & Map Event Listeners -----------------

// GPS Button
const btnGps = document.getElementById("btn-gps");
if (btnGps) {
  btnGps.addEventListener("click", () => {
    const btnText = document.getElementById("btn-gps-text");
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser. Please click directly on the map to choose your emergency location.");
      return;
    }

    if (btnText) btnText.textContent = "Acquiring GPS location...";
    btnGps.disabled = true;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        btnGps.disabled = false;
        if (btnText) btnText.textContent = "Use My Current Location (GPS)";
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setUserLocation(lat, lng, true);
      },
      (error) => {
        btnGps.disabled = false;
        if (btnText) btnText.textContent = "Use My Current Location (GPS)";
        console.warn("GPS Geolocation error:", error.message);
        alert(
          "Location access was denied or could not be determined.\n\nYou can manually select your emergency location by clicking anywhere on the interactive map."
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  });
}

// Map Click Listener for Manual Selection
map.on("click", (e) => {
  setUserLocation(e.latlng.lat, e.latlng.lng, false);
});

// Clear Location Button
const btnClearLocation = document.getElementById("btn-clear-location");
if (btnClearLocation) {
  btnClearLocation.addEventListener("click", clearUserLocation);
}

// Close Route Button
const btnCloseRoute = document.getElementById("btn-close-route");
if (btnCloseRoute) {
  btnCloseRoute.addEventListener("click", () => {
    activeDestinationShelter = null;
    routeLayerGroup.clearLayers();
    const routeCard = document.getElementById("route-navigation-card");
    if (routeCard) routeCard.style.display = "none";
    updateShelterRecommendations();
  });
}

// Filter Checkbox Listeners
const filterAvailableEl = document.getElementById("filter-available");
if (filterAvailableEl) filterAvailableEl.addEventListener("change", renderPins);

const filterFoodWaterEl = document.getElementById("filter-food-water");
if (filterFoodWaterEl) filterFoodWaterEl.addEventListener("change", renderPins);

// ----------------- Fetch Live Data from Backend -----------------

async function fetchLiveShelters() {
  const badgeEl = document.getElementById("api-badge");
  try {
    const res = await fetch(`${API_BASE}/shelters/all`);
    if (!res.ok) throw new Error("HTTP error " + res.status);
    const data = await res.json();
    const rawList = Array.isArray(data) ? data : (data.shelters || data.data || []);

    if (rawList.length > 0) {
      allShelters = rawList.map((item, idx) => normalizeShelter(item, idx));
      if (badgeEl) badgeEl.textContent = `Live MySQL: ${allShelters.length} Shelters`;
    }
  } catch (err) {
    console.warn("Backend API offline or unreachable. Displaying fallback Bengaluru shelters:", err.message);
    if (badgeEl) badgeEl.textContent = `Offline Mode: 8 Shelters`;
  }
  renderPins();
  if (userLocation) {
    updateShelterRecommendations();
  }
}

// Load on start
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", fetchLiveShelters);
} else {
  fetchLiveShelters();
}
