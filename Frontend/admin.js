/* =========================================================
   Admin Resource & Shelter Control Dashboard Logic
   ========================================================= */

const API_BASE = "http://127.0.0.1:8000";

let adminShelters = [];
let adminReservations = [];

// Elements
const apiBadge = document.getElementById("api-badge");
const sheltersTbody = document.getElementById("shelters-tbody");
const reservationsTbody = document.getElementById("reservations-tbody");
const toastContainer = document.getElementById("toast-container");

// KPI Elements
const kpiAvailableBeds = document.getElementById("kpi-available-beds");
const kpiTotalBeds = document.getElementById("kpi-total-beds");
const kpiShelterRatio = document.getElementById("kpi-shelter-ratio");
const kpiShelterSubtext = document.getElementById("kpi-shelter-subtext");
const kpiFoodStock = document.getElementById("kpi-food-stock");
const kpiWaterStock = document.getElementById("kpi-water-stock");

// Buttons
document.getElementById("refresh-all-btn").addEventListener("click", () => {
  loadAdminDashboard();
  showToast("Refreshing live dashboard data...", "info");
});

document.getElementById("refresh-reservations-btn").addEventListener("click", () => {
  loadReservations();
  showToast("Refreshed citizen registrations.", "info");
});

// 1. Load All Admin Data
async function loadAdminDashboard() {
  await Promise.all([loadShelters(), loadReservations()]);
}

// 2. Fetch Shelters
async function loadShelters() {
  try {
    const res = await fetch(`${API_BASE}/shelters`);
    if (!res.ok) throw new Error("HTTP error " + res.status);
    adminShelters = await res.json();
    if (apiBadge) {
      apiBadge.textContent = `Live MySQL: ${adminShelters.length} Shelters`;
      apiBadge.classList.remove("offline");
    }
  } catch (err) {
    console.warn("API offline or error fetching shelters:", err);
    if (apiBadge) {
      apiBadge.textContent = "Offline Mode";
      apiBadge.classList.add("offline");
    }
  }

  updateKPICards();
  renderSheltersTable();
}

// 3. Fetch Reservations
async function loadReservations() {
  try {
    const res = await fetch(`${API_BASE}/reservations`);
    if (!res.ok) throw new Error("HTTP error " + res.status);
    adminReservations = await res.json();
  } catch (err) {
    console.warn("API offline or error fetching reservations:", err);
    adminReservations = [];
  }

  renderReservationsTable();
}

// 4. Update KPI Metrics
function updateKPICards() {
  if (!adminShelters || adminShelters.length === 0) return;

  let totalAvail = 0;
  let totalCap = 0;
  let openCount = 0;
  let fullCount = 0;
  let totalFood = 0;
  let totalWater = 0;

  adminShelters.forEach((s) => {
    const avail = Number(s.available_beds ?? s.avail_beds ?? 0);
    const cap = Number(s.total_beds ?? 0);
    const food = Number(s.food_pkts ?? 0);
    const water = Number(s.water_liters ?? 0);

    totalAvail += avail;
    totalCap += cap;
    totalFood += food;
    totalWater += water;

    if (avail > 0) {
      openCount++;
    } else {
      fullCount++;
    }
  });

  kpiAvailableBeds.textContent = totalAvail.toLocaleString();
  kpiTotalBeds.textContent = `Total Capacity: ${totalCap.toLocaleString()} Beds`;

  kpiShelterRatio.textContent = `${openCount} / ${adminShelters.length}`;
  kpiShelterSubtext.textContent = `${openCount} Open | ${fullCount} Full`;

  kpiFoodStock.textContent = totalFood.toLocaleString();
  kpiWaterStock.textContent = `${totalWater.toLocaleString()} L`;
}

// 5. Render Shelters Management Table
function renderSheltersTable() {
  if (!adminShelters || adminShelters.length === 0) {
    sheltersTbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 24px; color: #dc2626;">
          No shelters found. Please check database connection.
        </td>
      </tr>
    `;
    return;
  }

  sheltersTbody.innerHTML = "";

  adminShelters.forEach((s) => {
    const avail = Number(s.available_beds ?? s.avail_beds ?? 0);
    const isFull = avail <= 0;
    const tr = document.createElement("tr");
    tr.id = `shelter-row-${s.id}`;

    tr.innerHTML = `
      <td style="font-weight: 700; color: #64748b;">#${s.id}</td>
      <td>
        <div style="font-weight: 700; color: #0f172a;">${s.name}</div>
        <div style="font-size: 12px; color: #64748b;">${s.address || "Bengaluru Urban"}</div>
      </td>
      <td>
        <span class="badge ${isFull ? 'badge-full' : 'badge-open'}" id="status-badge-${s.id}">
          ${isFull ? '⛔ FULL' : '🟢 OPEN'}
        </span>
      </td>
      <td>
        <input type="number" class="table-input" id="total-beds-${s.id}" min="0" max="1000" value="${s.total_beds || 0}" />
      </td>
      <td>
        <input type="number" class="table-input" id="avail-beds-${s.id}" min="0" max="${s.total_beds || 1000}" value="${avail}" />
      </td>
      <td>
        <input type="number" class="table-input" id="food-${s.id}" min="0" max="5000" value="${s.food_pkts || 0}" />
      </td>
      <td>
        <input type="number" class="table-input" id="water-${s.id}" min="0" max="10000" value="${s.water_liters || 0}" />
      </td>
      <td style="text-align: right;">
        <button class="btn btn-primary btn-sm" id="btn-save-${s.id}" onclick="saveShelterResources(${s.id})">
          💾 Save
        </button>
      </td>
    `;

    sheltersTbody.appendChild(tr);
  });
}

// 6. Save Resources via PUT /shelters/{id}/resources
async function saveShelterResources(shelterId) {
  const saveBtn = document.getElementById(`btn-save-${shelterId}`);
  const availInput = document.getElementById(`avail-beds-${shelterId}`);
  const totalInput = document.getElementById(`total-beds-${shelterId}`);
  const foodInput = document.getElementById(`food-${shelterId}`);
  const waterInput = document.getElementById(`water-${shelterId}`);

  const availVal = parseInt(availInput.value);
  const totalVal = parseInt(totalInput.value);
  const foodVal = parseInt(foodInput.value);
  const waterVal = parseInt(waterInput.value);

  // Client side validation
  if (isNaN(availVal) || isNaN(totalVal) || isNaN(foodVal) || isNaN(waterVal)) {
    showToast("Please enter valid numeric values.", "error");
    return;
  }

  if (availVal < 0 || totalVal < 0 || foodVal < 0 || waterVal < 0) {
    showToast("Resource values cannot be negative.", "error");
    return;
  }

  if (availVal > totalVal) {
    showToast(`Available beds (${availVal}) cannot exceed Total Beds (${totalVal}).`, "error");
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = "Saving...";

  try {
    const payload = {
      avail_beds: availVal,
      total_beds: totalVal,
      food_pkts: foodVal,
      water_liters: waterVal
    };

    const res = await fetch(`${API_BASE}/shelters/${shelterId}/resources`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.detail || "Update failed.");
    }

    // Update in-memory shelter item
    const targetIdx = adminShelters.findIndex((s) => s.id === shelterId);
    if (targetIdx !== -1) {
      adminShelters[targetIdx] = { ...adminShelters[targetIdx], ...data };
    }

    // Update status badge immediately
    const badgeEl = document.getElementById(`status-badge-${shelterId}`);
    if (badgeEl) {
      const isFull = availVal === 0;
      badgeEl.className = `badge ${isFull ? 'badge-full' : 'badge-open'}`;
      badgeEl.textContent = isFull ? "⛔ FULL" : "🟢 OPEN";
    }

    // Refresh KPI metrics
    updateKPICards();

    showToast(`Saved! ${data.name || `Shelter #${shelterId}`} now has ${availVal} beds available.`, "success");

  } catch (err) {
    console.error("Save error:", err);
    showToast(`Error: ${err.message}`, "error");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "💾 Save";
  }
}

// 7. Render Registrations Table
function renderReservationsTable() {
  if (!adminReservations || adminReservations.length === 0) {
    reservationsTbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 24px; color: #64748b;">
          No citizen registrations recorded yet. Submit a booking from the Citizen Registration portal to see it here live!
        </td>
      </tr>
    `;
    return;
  }

  reservationsTbody.innerHTML = "";

  adminReservations.forEach((r) => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td style="font-weight: 700; color: #0b457f;">#${r.id}</td>
      <td style="font-weight: 700; color: #0f172a;">${r.citizen_name || r.name || "Citizen"}</td>
      <td style="font-family: monospace;">${r.user_phone || r.phone || "—"}</td>
      <td style="font-weight: 600;">${r.shelter_name || `Shelter #${r.shelter_id}`}</td>
      <td style="font-weight: 700; color: #16a34a;">${r.beds_requested || 1}</td>
      <td>${r.food_pkts_requested || 0}</td>
      <td>${r.water_liters_requested || 0} L</td>
      <td>
        <span style="font-family: monospace; font-weight: 700; background: #eff6ff; color: #1e3a8a; padding: 2px 6px; border-radius: 4px; border: 1px solid #bfdbfe;">
          ${r.otp_code || "—"}
        </span>
      </td>
      <td>
        <span class="badge badge-open">${r.reservation_status || "CONFIRMED"}</span>
      </td>
    `;

    reservationsTbody.appendChild(tr);
  });
}

// 8. Toast Feedback Helper
function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span>${type === "success" ? "✓" : (type === "error" ? "⚠️" : "ℹ️")}</span>
    <span>${message}</span>
  `;

  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";
    toast.style.transition = "all 0.25s ease-out";
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}

// Load on start
loadAdminDashboard();
