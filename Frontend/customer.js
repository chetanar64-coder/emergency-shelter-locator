/* =========================================================
   Customer Registration & Resource Request Portal Logic
   ========================================================= */

const API_BASE = "http://127.0.0.1:8000";

let sheltersData = [];

// Elements
const apiBadge = document.getElementById("api-badge");
const shelterSelect = document.getElementById("shelter-select");
const shelterDetailsBody = document.getElementById("shelter-details-body");
const shelterStatusBadge = document.getElementById("shelter-status-badge");
const reservationForm = document.getElementById("reservation-form");
const alertBox = document.getElementById("alert-box");
const confirmationSection = document.getElementById("confirmation-section");
const submitBtn = document.getElementById("submit-btn");

// Fallback shelter data in case API is offline
const fallbackShelters = [
  { id: 1, name: "Sree Kanteerava Stadium", address: "Kasturba Road, Bengaluru", available_beds: 42, total_beds: 150, food_pkts: 320, water_liters: 900 },
  { id: 2, name: "Yeshwanthpura TTMC", address: "Yeshwanthpur, Bengaluru", available_beds: 28, total_beds: 100, food_pkts: 250, water_liters: 700 },
  { id: 3, name: "Kempegowda Bus Station (Majestic)", address: "Majestic, Bengaluru", available_beds: 0, total_beds: 120, food_pkts: 300, water_liters: 800 },
  { id: 4, name: "Koramangala Indoor Stadium", address: "Koramangala, Bengaluru", available_beds: 19, total_beds: 80, food_pkts: 180, water_liters: 500 },
  { id: 5, name: "Jayanagar Civic Association", address: "Jayanagar, Bengaluru", available_beds: 64, total_beds: 100, food_pkts: 220, water_liters: 650 },
  { id: 6, name: "Freedom Park", address: "Seshadri Road, Bengaluru", available_beds: 0, total_beds: 90, food_pkts: 200, water_liters: 600 },
  { id: 7, name: "Cubbon Park", address: "Kasturba Road, Bengaluru", available_beds: 25, total_beds: 70, food_pkts: 150, water_liters: 450 },
  { id: 8, name: "Bengaluru Palace", address: "Palace Road, Bengaluru", available_beds: 38, total_beds: 150, food_pkts: 310, water_liters: 850 }
];

// 1. Fetch Shelters from API
async function loadShelters() {
  try {
    const res = await fetch(`${API_BASE}/shelters`);
    if (!res.ok) throw new Error("HTTP error " + res.status);
    sheltersData = await res.json();
    if (apiBadge) {
      apiBadge.textContent = `Live MySQL: ${sheltersData.length} Shelters`;
      apiBadge.classList.remove("offline");
    }
  } catch (err) {
    console.warn("Backend offline, using fallback shelters:", err.message);
    sheltersData = fallbackShelters;
    if (apiBadge) {
      apiBadge.textContent = `Offline Mode: 8 Shelters`;
      apiBadge.classList.add("offline");
    }
  }

  populateShelterDropdown();
}

// 2. Populate Dropdown - Allows selection of shelters with 0 beds if food/water is available!
function populateShelterDropdown() {
  const currentVal = shelterSelect.value;
  shelterSelect.innerHTML = `<option value="">-- Choose a Shelter in Bengaluru --</option>`;

  sheltersData.forEach((s) => {
    const avail = Number(s.available_beds ?? s.avail_beds ?? 0);
    const food = Number(s.food_pkts ?? 0);
    const water = Number(s.water_liters ?? 0);
    const hasBeds = avail > 0;
    const hasSupplies = food > 0 || water > 0;
    const isCompletelyEmpty = !hasBeds && !hasSupplies;

    const opt = document.createElement("option");
    opt.value = s.id;

    if (isCompletelyEmpty) {
      opt.textContent = `⛔ ${s.name} (COMPLETELY DEPLETED)`;
      opt.disabled = true;
      opt.style.color = "#dc2626";
    } else if (!hasBeds) {
      // Beds full, but food and/or water are still available!
      opt.textContent = `🟡 ${s.name} (Beds FULL: 0 | 🍲 ${food} pkts | 💧 ${water}L available)`;
      opt.style.color = "#b45309";
    } else {
      opt.textContent = `🟢 ${s.name} (${avail} Beds | 🍲 ${food} pkts | 💧 ${water}L)`;
    }

    shelterSelect.appendChild(opt);
  });

  // Preserve previous selection if still valid, or choose the first option that has any resource
  if (currentVal && sheltersData.some(s => s.id === parseInt(currentVal))) {
    shelterSelect.value = currentVal;
    const currentShelter = sheltersData.find(s => s.id === parseInt(currentVal));
    updateSelectedShelterCard(currentShelter);
  } else {
    const firstAvailable = sheltersData.find((s) => {
      const b = Number(s.available_beds ?? s.avail_beds ?? 0);
      const f = Number(s.food_pkts ?? 0);
      const w = Number(s.water_liters ?? 0);
      return b > 0 || f > 0 || w > 0;
    });
    if (firstAvailable) {
      shelterSelect.value = firstAvailable.id;
      updateSelectedShelterCard(firstAvailable);
    }
  }
}

// 3. Update Side Preview Card & Adjust Beds Input
function updateSelectedShelterCard(shelter) {
  const bedsInput = document.getElementById("beds-requested");
  const bedsHelper = document.getElementById("beds-helper");

  if (!shelter) {
    shelterDetailsBody.innerHTML = `<p style="color: #64748b; font-size: 13.5px;">Choose a shelter from the dropdown to see its real-time capacity and location.</p>`;
    shelterStatusBadge.className = "badge badge-pending";
    shelterStatusBadge.textContent = "Select Below";
    return;
  }

  const avail = Number(shelter.available_beds ?? shelter.avail_beds ?? 0);
  const food = Number(shelter.food_pkts ?? 0);
  const water = Number(shelter.water_liters ?? 0);

  if (avail === 0) {
    // Beds are full, but citizen can still request food & water!
    shelterStatusBadge.className = "badge badge-pending";
    shelterStatusBadge.textContent = "BEDS FULL (SUPPLIES ONLY)";

    if (bedsInput) {
      bedsInput.value = "0";
      bedsInput.max = "0";
    }
    if (bedsHelper) {
      bedsHelper.innerHTML = `<strong style="color: #b45309;">⚠️ Beds are full at this location. Set beds to 0 &mdash; you can still reserve food packets and drinking water below!</strong>`;
    }
  } else {
    shelterStatusBadge.className = "badge badge-open";
    shelterStatusBadge.textContent = `OPEN (${avail} BEDS)`;

    if (bedsInput) {
      if (parseInt(bedsInput.value) === 0) bedsInput.value = "1";
      bedsInput.max = avail.toString();
    }
    if (bedsHelper) {
      bedsHelper.textContent = "Enter 0 if you only require food rations or drinking water.";
    }
  }

  shelterDetailsBody.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 12px;">
      <div>
        <div style="font-size: 15px; font-weight: 800; color: #0f172a;">${shelter.name}</div>
        <div style="font-size: 12.5px; color: #64748b; margin-top: 2px;">${shelter.address || "Bengaluru Urban"}</div>
      </div>

      <div style="background-color: #f8fafc; border-radius: 6px; padding: 12px; display: flex; flex-direction: column; gap: 8px;">
        <div style="display: flex; justify-content: space-between; font-size: 13.5px;">
          <span style="font-weight: 600; color: #475569;">Available Beds:</span>
          <span style="font-weight: 800; color: ${avail === 0 ? '#dc2626' : '#16a34a'};">
            ${avail} / ${shelter.total_beds} ${avail === 0 ? '(FULL)' : ''}
          </span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 13.5px;">
          <span style="font-weight: 600; color: #475569;">Food Packets:</span>
          <span style="font-weight: 800; color: ${food > 0 ? '#15803d' : '#dc2626'};">
            ${food} pkts ${food > 0 ? '✓ Available' : '(Out of Stock)'}
          </span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 13.5px;">
          <span style="font-weight: 600; color: #475569;">Drinking Water:</span>
          <span style="font-weight: 800; color: ${water > 0 ? '#15803d' : '#dc2626'};">
            ${water} L ${water > 0 ? '✓ Available' : '(Out of Stock)'}
          </span>
        </div>
      </div>

      ${shelter.latitude ? `
        <div style="font-size: 11.5px; color: #64748b; font-family: monospace;">
          📍 GPS: ${Math.abs(shelter.latitude).toFixed(4)}° N, ${Math.abs(shelter.longitude).toFixed(4)}° E
        </div>
      ` : ""}
    </div>
  `;
}

// Dropdown change listener
shelterSelect.addEventListener("change", (e) => {
  const sid = parseInt(e.target.value);
  const s = sheltersData.find((item) => item.id === sid);
  updateSelectedShelterCard(s);
});

// 4. Handle Form Submission via POST /reservations
reservationForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideAlert();

  const name = document.getElementById("citizen-name").value.trim();
  const phone = document.getElementById("citizen-phone").value.trim();
  const shelterId = parseInt(shelterSelect.value);
  const bedsRequested = parseInt(document.getElementById("beds-requested").value) || 0;
  const foodRequested = parseInt(document.getElementById("food-requested").value) || 0;
  const waterRequested = parseInt(document.getElementById("water-requested").value) || 0;

  if (!shelterId) {
    showAlert("Please select a valid shelter.", "error");
    return;
  }

  // Must request at least one item
  if (bedsRequested === 0 && foodRequested === 0 && waterRequested === 0) {
    showAlert("Please request at least one item: beds, food packets, or drinking water.", "error");
    return;
  }

  // Capacity verification
  const selectedShelter = sheltersData.find((s) => s.id === shelterId);
  const availBeds = selectedShelter ? Number(selectedShelter.available_beds ?? selectedShelter.avail_beds ?? 0) : 0;
  const availFood = selectedShelter ? Number(selectedShelter.food_pkts ?? 0) : 0;
  const availWater = selectedShelter ? Number(selectedShelter.water_liters ?? 0) : 0;

  if (bedsRequested > 0 && bedsRequested > availBeds) {
    showAlert(`Capacity Exceeded: This shelter currently has ${availBeds} beds available. Set beds to 0 if you only want to reserve food or water rations.`, "error");
    return;
  }

  if (foodRequested > 0 && foodRequested > availFood) {
    showAlert(`Supply Exceeded: This shelter only has ${availFood} food packets available.`, "error");
    return;
  }

  if (waterRequested > 0 && waterRequested > availWater) {
    showAlert(`Supply Exceeded: This shelter only has ${availWater}L drinking water available.`, "error");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Processing Reservation...";

  try {
    const payload = {
      name: name,
      phone: phone,
      shelter_id: shelterId,
      beds_requested: bedsRequested,
      food_pkts_requested: foodRequested,
      water_liters_requested: waterRequested
    };

    const res = await fetch(`${API_BASE}/reservations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok) {
      const errMsg = data.detail || "Unable to complete reservation. Please try again.";
      showAlert(errMsg, "error");
      submitBtn.disabled = false;
      submitBtn.textContent = "🔒 Confirm & Reserve Shelter";
      return;
    }

    // Success: Render Confirmation Card
    renderConfirmationCard(data, payload, selectedShelter);
    
    // Refresh shelter list to reflect decremented stock
    await loadShelters();

    // Reset form fields
    reservationForm.reset();
    document.getElementById("beds-requested").value = "1";
    document.getElementById("food-requested").value = "0";
    document.getElementById("water-requested").value = "0";

  } catch (err) {
    console.error("Reservation Error:", err);
    showAlert("Connection error: Could not reach the backend API server. Make sure FastAPI is running on port 8000.", "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "🔒 Confirm & Reserve Shelter";
  }
});

// 5. Render Confirmation Card
function renderConfirmationCard(response, requestPayload, initialShelter) {
  const updatedShelter = response.shelter || initialShelter;
  const remBeds = updatedShelter ? (updatedShelter.available_beds ?? updatedShelter.avail_beds ?? 0) : 0;
  const remFood = updatedShelter ? (updatedShelter.food_pkts ?? 0) : 0;
  const remWater = updatedShelter ? (updatedShelter.water_liters ?? 0) : 0;

  confirmationSection.style.display = "block";
  confirmationSection.innerHTML = `
    <div class="confirmation-card">
      <div class="confirmation-header">
        <div class="confirmation-title">
          <span>✅</span> Reservation Confirmed &mdash; Booking #${response.booking_id || response.confirmation_id || "B15"}
        </div>
        <div class="otp-box">
          <div style="font-size: 11px; font-weight: 700; color: #1e40af; text-transform: uppercase;">Check-in OTP</div>
          <div class="otp-code">${response.otp_code || "482910"}</div>
        </div>
      </div>

      <div class="confirmation-grid">
        <div class="confirmation-item">
          <span class="confirm-label">Citizen Name</span>
          <span class="confirm-val">${requestPayload.name}</span>
        </div>
        <div class="confirmation-item">
          <span class="confirm-label">Phone Number</span>
          <span class="confirm-val">${requestPayload.phone}</span>
        </div>
        <div class="confirmation-item">
          <span class="confirm-label">Shelter Assigned</span>
          <span class="confirm-val" style="color: #0b457f;">${updatedShelter ? updatedShelter.name : "Emergency Shelter"}</span>
        </div>
        <div class="confirmation-item">
          <span class="confirm-label">Beds Reserved</span>
          <span class="confirm-val" style="color: ${requestPayload.beds_requested > 0 ? '#16a34a' : '#64748b'};">
            ${requestPayload.beds_requested > 0 ? `${requestPayload.beds_requested} Bed(s)` : '0 Beds (Supplies Only)'}
          </span>
        </div>
        <div class="confirmation-item">
          <span class="confirm-label">Supplies Allocated</span>
          <span class="confirm-val" style="color: #0f172a;">
            ${requestPayload.food_pkts_requested} Food Pkts | ${requestPayload.water_liters_requested} L Water
          </span>
        </div>
        <div class="confirmation-item">
          <span class="confirm-label">Shelter Remaining Stock</span>
          <span class="confirm-val" style="color: ${remBeds === 0 ? '#b45309' : '#15803d'}; font-size: 13.5px;">
            ${remBeds} Beds ${remBeds === 0 ? '(FULL)' : ''} | ${remFood} Food | ${remWater}L Water
          </span>
        </div>
      </div>

      <div style="display: flex; gap: 12px; align-items: center; justify-content: flex-end; margin-top: 6px;">
        <a href="index.html" class="btn btn-primary btn-sm">🗺️ View Updated Map Marker</a>
        <a href="admin.html" class="btn btn-secondary btn-sm">⚙️ View in Admin Live Log</a>
      </div>
    </div>
  `;

  // Scroll to confirmation
  confirmationSection.scrollIntoView({ behavior: "smooth" });
}

function showAlert(message, type = "error") {
  alertBox.style.display = "block";
  alertBox.className = type === "error" ? "alert-card alert-error" : "alert-card alert-success";
  alertBox.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px; font-weight: 700;">
      <span>${type === "error" ? "⚠️ Error" : "✓ Notice"}</span>
    </div>
    <div style="font-size: 13.5px;">${message}</div>
  `;
  alertBox.scrollIntoView({ behavior: "smooth" });
}

function hideAlert() {
  alertBox.style.display = "none";
}

// Initial load
loadShelters();
