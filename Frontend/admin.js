/* =========================================================
   Emergency Shelter Locator — Admin Dashboard JavaScript Logic
   ========================================================= */

const API_BASE = "http://127.0.0.1:8001";

let adminToken = localStorage.getItem("admin_token");
let allShelters = [];
let allReservations = [];
let shelterToDeleteId = null;
let currentEditingShelter = null;

// DOM Elements
const adminNameDisplay = document.getElementById("admin-name-display");
const logoutBtn = document.getElementById("logout-btn");
const refreshDataBtn = document.getElementById("refresh-data-btn");
const searchInput = document.getElementById("shelter-search-input");
const statusFilterSelect = document.getElementById("status-filter-select");
const sheltersTableBody = document.getElementById("shelters-table-body");

// Tabs
const tabSheltersBtn = document.getElementById("tab-shelters-btn");
const tabReservationsBtn = document.getElementById("tab-reservations-btn");
const viewShelters = document.getElementById("view-shelters");
const viewReservations = document.getElementById("view-reservations");
const reservationsTableBody = document.getElementById("reservations-table-body");
const resSearchInput = document.getElementById("res-search-input");
const refreshReservationsBtn = document.getElementById("refresh-reservations-btn");

// Stat Elements
const statTotalShelters = document.getElementById("stat-total-shelters");
const statActiveShelters = document.getElementById("stat-active-shelters");
const statInactiveSub = document.getElementById("stat-inactive-sub");
const statFullShelters = document.getElementById("stat-full-shelters");
const statAvailableBeds = document.getElementById("stat-available-beds");
const statTotalCapSub = document.getElementById("stat-total-cap-sub");
const statReservations = document.getElementById("stat-reservations");

// Modals
const shelterModal = document.getElementById("shelter-modal");
const modalTitle = document.getElementById("modal-title");
const shelterForm = document.getElementById("shelter-form");
const openAddModalBtn = document.getElementById("open-add-modal-btn");
const closeShelterModalBtn = document.getElementById("close-shelter-modal-btn");
const cancelShelterModalBtn = document.getElementById("cancel-shelter-modal-btn");

const availabilityModal = document.getElementById("availability-modal");
const availForm = document.getElementById("avail-form");
const closeAvailModalBtn = document.getElementById("close-avail-modal-btn");
const cancelAvailBtn = document.getElementById("cancel-avail-btn");

const deleteModal = document.getElementById("delete-modal");
const closeDeleteModalBtn = document.getElementById("close-delete-modal-btn");
const cancelDeleteBtn = document.getElementById("cancel-delete-btn");
const confirmDeleteBtn = document.getElementById("confirm-delete-btn");
const deleteShelterName = document.getElementById("delete-shelter-name");

// ----------------- Auth Verification -----------------

async function verifyAuth() {
  if (!adminToken) {
    window.location.href = "admin-login.html";
    return false;
  }

  try {
    const res = await fetch(`${API_BASE}/admin/me`, {
      headers: { "Authorization": `Bearer ${adminToken}` }
    });

    if (!res.ok) {
      throw new Error("Session expired");
    }

    const data = await res.json();
    const admin = data.admin;
    if (adminNameDisplay) {
      adminNameDisplay.textContent = admin.full_name || admin.username;
    }
    return true;
  } catch (err) {
    console.warn("Admin authentication check failed:", err.message);
    localStorage.removeItem("admin_token");
    localStorage.removeItem("admin_user");
    window.location.href = "admin-login.html";
    return false;
  }
}

// Logout
logoutBtn.addEventListener("click", async () => {
  try {
    await fetch(`${API_BASE}/admin/logout`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${adminToken}` }
    });
  } catch (e) {}
  localStorage.removeItem("admin_token");
  localStorage.removeItem("admin_user");
  window.location.href = "admin-login.html";
});

// ----------------- Toast Notifications -----------------

function showToast(message, type = "success") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${type === "success" ? "✅" : "⚠️"}</span> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(100%)";
    toast.style.transition = "all 0.3s ease-out";
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ----------------- Tabs Navigation -----------------

tabSheltersBtn.addEventListener("click", () => {
  tabSheltersBtn.className = "btn-primary";
  tabReservationsBtn.className = "btn-secondary";
  viewShelters.style.display = "block";
  viewReservations.style.display = "none";
});

tabReservationsBtn.addEventListener("click", () => {
  tabReservationsBtn.className = "btn-primary";
  tabSheltersBtn.className = "btn-secondary";
  viewReservations.style.display = "block";
  viewShelters.style.display = "none";
  fetchReservations();
});

// ----------------- Fetch Dashboard Data -----------------

async function fetchStats() {
  try {
    const res = await fetch(`${API_BASE}/admin/stats`, {
      headers: { "Authorization": `Bearer ${adminToken}` }
    });
    if (!res.ok) throw new Error("Stats request failed");
    const stats = await res.json();

    statTotalShelters.textContent = stats.total_shelters;
    statActiveShelters.textContent = stats.active_shelters;
    statInactiveSub.textContent = `${stats.inactive_shelters} inactive`;
    statFullShelters.textContent = stats.full_shelters;
    statAvailableBeds.textContent = stats.total_available_beds;
    statTotalCapSub.textContent = `of ${stats.total_capacity} total capacity`;
    statReservations.textContent = stats.total_reservations;
  } catch (err) {
    console.error("Error fetching stats:", err);
  }
}

async function fetchShelters() {
  try {
    const res = await fetch(`${API_BASE}/admin/shelters`, {
      headers: { "Authorization": `Bearer ${adminToken}` }
    });
    if (!res.ok) throw new Error("Failed to load shelters");
    allShelters = await res.json();
    renderSheltersTable();
  } catch (err) {
    sheltersTableBody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 24px; color: #dc2626;">
          Error connecting to backend API. Please make sure FastAPI backend is running on port 8000.
        </td>
      </tr>
    `;
    console.error("Error fetching shelters:", err);
  }
}

async function fetchReservations() {
  try {
    const res = await fetch(`${API_BASE}/reservations`);
    if (!res.ok) throw new Error("Failed to load reservations");
    allReservations = await res.json();
    renderReservationsTable();
  } catch (err) {
    reservationsTableBody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 24px; color: #dc2626;">
          Error connecting to backend API.
        </td>
      </tr>
    `;
    console.error("Error fetching reservations:", err);
  }
}

// ----------------- Render Shelters Table -----------------

function renderSheltersTable() {
  const searchTerm = searchInput.value.toLowerCase().trim();
  const filterVal = statusFilterSelect.value;

  const filtered = allShelters.filter((s) => {
    if (searchTerm) {
      const matchName = (s.name || "").toLowerCase().includes(searchTerm);
      const matchAddr = (s.address || "").toLowerCase().includes(searchTerm);
      if (!matchName && !matchAddr) return false;
    }

    if (filterVal === "active" && !s.is_active) return false;
    if (filterVal === "inactive" && s.is_active) return false;
    if (filterVal === "available" && (!s.is_active || s.available_beds <= 0)) return false;
    if (filterVal === "full" && (!s.is_active || s.available_beds > 0)) return false;

    return true;
  });

  if (filtered.length === 0) {
    sheltersTableBody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 32px; color: #64748b;">
          No shelters found matching current filters.
        </td>
      </tr>
    `;
    return;
  }

  sheltersTableBody.innerHTML = filtered.map((s) => {
    const isFull = s.available_beds === 0;
    const pct = s.total_beds > 0 ? Math.round((s.available_beds / s.total_beds) * 100) : 0;
    const barClass = isFull ? "bar-red" : "bar-green";

    let statusBadge = "";
    if (!s.is_active) {
      statusBadge = `<span class="badge-status badge-inactive">● Inactive</span>`;
    } else if (isFull) {
      statusBadge = `<span class="badge-status badge-full">● Full (0 Beds)</span>`;
    } else {
      statusBadge = `<span class="badge-status badge-active">● Active (${s.available_beds} Open)</span>`;
    }

    const medClass = s.medical_status === "Available" ? "color: #166534;" : (s.medical_status === "Low" ? "color: #b45309;" : "color: #991b1b;");

    return `
      <tr data-id="${s.id}">
        <td>${statusBadge}</td>
        <td>
          <div class="shelter-name-cell">${escapeHtml(s.name)}</div>
          <div class="shelter-address-sub">${escapeHtml(s.address || "Bengaluru")}</div>
          ${s.description ? `<div style="font-size: 11px; color: #0284c7; margin-top: 2px;">ℹ️ ${escapeHtml(s.description)}</div>` : ""}
        </td>
        <td>
          <span class="coords-badge">${Number(s.latitude).toFixed(4)}°, ${Number(s.longitude).toFixed(4)}°</span>
        </td>
        <td>
          <div class="capacity-wrap">
            <span class="capacity-text">${s.available_beds} / ${s.total_beds} beds</span>
            <div class="capacity-progress">
              <div class="capacity-bar ${barClass}" style="width: ${pct}%;"></div>
            </div>
            <span style="font-size: 11px; color: #64748b;">${pct}% available</span>
          </div>
        </td>
        <td>
          <div>
            <span class="resource-pill">🍱 ${s.food_pkts} pkts</span>
            <span class="resource-pill">💧 ${s.water_liters} L</span>
          </div>
          <div style="font-size: 11.5px; font-weight: 700; margin-top: 3px; ${medClass}">
            💊 Meds: ${s.medical_status || "Available"}
          </div>
        </td>
        <td>
          <a href="tel:${s.contact_phone}" style="font-weight: 600; color: #0b457f; text-decoration: none;">
            📞 ${escapeHtml(s.contact_phone || "N/A")}
          </a>
        </td>
        <td>
          <div class="action-buttons">
            <button class="btn-action btn-action-avail" onclick="openQuickAvailModal(${s.id})" title="Quick update beds & supplies">
              ⚡ Avail
            </button>
            <button class="btn-action btn-action-edit" onclick="openEditModal(${s.id})" title="Edit complete information">
              ✏️ Edit
            </button>
            <button class="btn-action btn-action-toggle" onclick="toggleShelterStatus(${s.id}, ${!s.is_active})" title="${s.is_active ? 'Deactivate' : 'Activate'}">
              ${s.is_active ? '⏸️ Deactivate' : '▶️ Activate'}
            </button>
            <button class="btn-action btn-action-del" onclick="openDeleteModal(${s.id}, '${escapeQuote(s.name)}')" title="Delete shelter">
              🗑️
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

// ----------------- Render Reservations Table -----------------

function renderReservationsTable() {
  const searchTerm = (resSearchInput.value || "").toLowerCase().trim();

  const filtered = allReservations.filter(r => {
    if (!searchTerm) return true;
    const nameMatch = (r.citizen_name || r.name || "").toLowerCase().includes(searchTerm);
    const phoneMatch = (r.user_phone || r.phone || "").toLowerCase().includes(searchTerm);
    const otpMatch = (r.otp_code || "").toLowerCase().includes(searchTerm);
    const shelterMatch = (r.shelter_name || "").toLowerCase().includes(searchTerm);
    return nameMatch || phoneMatch || otpMatch || shelterMatch;
  });

  if (filtered.length === 0) {
    reservationsTableBody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 32px; color: #64748b;">
          No citizen reservations found.
        </td>
      </tr>
    `;
    return;
  }

  reservationsTableBody.innerHTML = filtered.map(r => {
    const isVerified = r.reservation_status === "VERIFIED";
    const statusPill = isVerified
      ? `<span class="badge-status badge-active">✅ VERIFIED (Admitted)</span>`
      : `<span class="badge-status" style="background:#fef3c7; color:#92400e;">⏳ CONFIRMED (Awaiting Entry)</span>`;

    return `
      <tr>
        <td><strong>#BKG-${r.id}</strong></td>
        <td>
          <div style="background: #eff6ff; border: 1.5px dashed #2563eb; border-radius: 6px; padding: 4px 8px; text-align: center; font-family: monospace; font-size: 16px; font-weight: 800; color: #1e40af; letter-spacing: 1px;">
            ${r.otp_code || "------"}
          </div>
        </td>
        <td>
          <div style="font-weight: 700; color: #0f172a;">${escapeHtml(r.citizen_name || r.name || "Citizen")}</div>
          <div style="font-size: 12px; color: #64748b;">📞 ${escapeHtml(r.user_phone || r.phone || "")}</div>
        </td>
        <td>
          <div style="font-weight: 600; color: #0b457f;">${escapeHtml(r.shelter_name || "")}</div>
        </td>
        <td>
          <div><strong>🛏️ ${r.beds_requested ?? 1} Bed(s)</strong></div>
          <div style="font-size: 11.5px; color: #475569;">🍱 ${r.food_pkts ?? r.food_pkts_requested ?? 0} Food &bull; 💧 ${r.water_liters ?? r.water_liters_requested ?? 0}L Water</div>
        </td>
        <td>${statusPill}</td>
        <td>
          ${!isVerified ? `
            <button class="btn-action btn-action-avail" onclick="verifyOtpCode('${r.otp_code}', '${r.user_phone}')">
              ✅ Verify OTP &amp; Admit
            </button>
          ` : `
            <span style="font-size: 11.5px; color: #166534; font-weight: 700;">Admitted</span>
          `}
        </td>
      </tr>
    `;
  }).join("");
}

window.verifyOtpCode = async function(otp, phone) {
  try {
    const res = await fetch(`${API_BASE}/reservations/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ otp_code: otp, phone: phone })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Verification failed");

    showToast(`OTP ${otp} verified successfully! Citizen admitted.`);
    await fetchReservations();
  } catch (err) {
    alert("Verification error: " + err.message);
  }
};

if (resSearchInput) resSearchInput.addEventListener("input", renderReservationsTable);
if (refreshReservationsBtn) refreshReservationsBtn.addEventListener("click", fetchReservations);

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeQuote(str) {
  if (!str) return "";
  return String(str).replace(/'/g, "\\'");
}

// ----------------- Add / Edit Shelter Modal -----------------

function openAddModal() {
  currentEditingShelter = null;
  modalTitle.textContent = "Add Emergency Shelter";
  document.getElementById("shelter-form-id").value = "";
  shelterForm.reset();
  document.getElementById("form-active").checked = true;
  document.getElementById("form-lat").value = "12.9716";
  document.getElementById("form-lng").value = "77.5946";
  document.getElementById("form-total-beds").value = "100";
  document.getElementById("form-available-beds").value = "50";
  document.getElementById("form-food").value = "150";
  document.getElementById("form-water").value = "500";
  document.getElementById("form-contact").value = "+91 80 2297 5000";
  document.getElementById("form-medical").value = "Available";
  shelterModal.classList.remove("modal-hidden");
}

window.openEditModal = function(id) {
  const shelter = allShelters.find(s => s.id === id);
  if (!shelter) return;

  currentEditingShelter = shelter;
  modalTitle.textContent = `Edit Shelter: ${shelter.name}`;
  document.getElementById("shelter-form-id").value = shelter.id;
  document.getElementById("form-name").value = shelter.name;
  document.getElementById("form-address").value = shelter.address || "";
  document.getElementById("form-lat").value = shelter.latitude;
  document.getElementById("form-lng").value = shelter.longitude;
  document.getElementById("form-total-beds").value = shelter.total_beds;
  document.getElementById("form-available-beds").value = shelter.available_beds;
  document.getElementById("form-food").value = shelter.food_pkts || 0;
  document.getElementById("form-water").value = shelter.water_liters || 0;
  document.getElementById("form-medical").value = shelter.medical_status || "Available";
  document.getElementById("form-contact").value = shelter.contact_phone || "+91 80 2297 5000";
  document.getElementById("form-description").value = shelter.description || "";
  document.getElementById("form-active").checked = Boolean(shelter.is_active);

  shelterModal.classList.remove("modal-hidden");
};

function closeShelterModal() {
  shelterModal.classList.add("modal-hidden");
  shelterForm.reset();
}

openAddModalBtn.addEventListener("click", openAddModal);
closeShelterModalBtn.addEventListener("click", closeShelterModal);
cancelShelterModalBtn.addEventListener("click", closeShelterModal);

shelterForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const id = document.getElementById("shelter-form-id").value;
  const name = document.getElementById("form-name").value.trim();
  const address = document.getElementById("form-address").value.trim();
  const latitude = parseFloat(document.getElementById("form-lat").value);
  const longitude = parseFloat(document.getElementById("form-lng").value);
  const total_beds = parseInt(document.getElementById("form-total-beds").value, 10);
  const available_beds = parseInt(document.getElementById("form-available-beds").value, 10);
  const food_pkts = parseInt(document.getElementById("form-food").value, 10) || 0;
  const water_liters = parseInt(document.getElementById("form-water").value, 10) || 0;
  const medical_status = document.getElementById("form-medical").value;
  const contact_phone = document.getElementById("form-contact").value.trim();
  const description = document.getElementById("form-description").value.trim();
  const is_active = document.getElementById("form-active").checked;

  if (available_beds > total_beds) {
    alert(`Available beds (${available_beds}) cannot exceed total capacity (${total_beds}).`);
    return;
  }

  const payload = {
    name,
    address,
    latitude,
    longitude,
    total_beds,
    available_beds,
    food_pkts,
    water_liters,
    medical_status,
    contact_phone,
    description,
    is_active
  };

  const isEdit = Boolean(id);
  const url = isEdit ? `${API_BASE}/admin/shelters/${id}` : `${API_BASE}/admin/shelters`;
  const method = isEdit ? "PUT" : "POST";

  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminToken}`
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Operation failed");

    closeShelterModal();
    showToast(isEdit ? "Shelter information updated successfully." : "New emergency shelter added successfully.");
    await refreshAll();
  } catch (err) {
    alert("Error saving shelter: " + err.message);
  }
});

// ----------------- Quick Availability Modal -----------------

window.openQuickAvailModal = function(id) {
  const shelter = allShelters.find(s => s.id === id);
  if (!shelter) return;

  document.getElementById("avail-form-id").value = shelter.id;
  document.getElementById("avail-shelter-name").textContent = `${shelter.name} (Total Beds: ${shelter.total_beds})`;
  document.getElementById("avail-input-beds").value = shelter.available_beds;
  document.getElementById("avail-input-beds").max = shelter.total_beds;
  document.getElementById("avail-cap-hint").textContent = `Max allowable: ${shelter.total_beds} beds`;
  document.getElementById("avail-input-food").value = shelter.food_pkts || 0;
  document.getElementById("avail-input-water").value = shelter.water_liters || 0;

  availabilityModal.classList.remove("modal-hidden");
};

function closeAvailModal() {
  availabilityModal.classList.add("modal-hidden");
  availForm.reset();
}

closeAvailModalBtn.addEventListener("click", closeAvailModal);
cancelAvailBtn.addEventListener("click", closeAvailModal);

availForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("avail-form-id").value;
  const available_beds = parseInt(document.getElementById("avail-input-beds").value, 10);
  const food_pkts = parseInt(document.getElementById("avail-input-food").value, 10);
  const water_liters = parseInt(document.getElementById("avail-input-water").value, 10);

  try {
    const res = await fetch(`${API_BASE}/admin/shelters/${id}/availability`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminToken}`
      },
      body: JSON.stringify({ available_beds, food_pkts, water_liters })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Update failed");

    closeAvailModal();
    showToast("Live capacity and relief supplies updated!");
    await refreshAll();
  } catch (err) {
    alert("Error updating availability: " + err.message);
  }
});

// ----------------- Toggle Active / Inactive -----------------

window.toggleShelterStatus = async function(id, newStatus) {
  try {
    const res = await fetch(`${API_BASE}/admin/shelters/${id}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminToken}`
      },
      body: JSON.stringify({ is_active: newStatus })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Status toggle failed");

    showToast(`Shelter ${newStatus ? 'activated' : 'deactivated'} successfully.`);
    await refreshAll();
  } catch (err) {
    alert("Error updating shelter status: " + err.message);
  }
};

// ----------------- Delete Shelter -----------------

window.openDeleteModal = function(id, name) {
  shelterToDeleteId = id;
  deleteShelterName.textContent = name;
  deleteModal.classList.remove("modal-hidden");
};

function closeDeleteModal() {
  deleteModal.classList.add("modal-hidden");
  shelterToDeleteId = null;
}

closeDeleteModalBtn.addEventListener("click", closeDeleteModal);
cancelDeleteBtn.addEventListener("click", closeDeleteModal);

confirmDeleteBtn.addEventListener("click", async () => {
  if (!shelterToDeleteId) return;

  try {
    const res = await fetch(`${API_BASE}/admin/shelters/${shelterToDeleteId}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${adminToken}` }
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Delete failed");

    closeDeleteModal();
    showToast("Shelter deleted successfully.");
    await refreshAll();
  } catch (err) {
    alert("Error deleting shelter: " + err.message);
  }
});

// ----------------- Event Listeners -----------------

searchInput.addEventListener("input", renderSheltersTable);
statusFilterSelect.addEventListener("change", renderSheltersTable);
refreshDataBtn.addEventListener("click", refreshAll);

async function refreshAll() {
  refreshDataBtn.disabled = true;
  refreshDataBtn.textContent = "⏳ Refreshing...";
  await Promise.all([fetchStats(), fetchShelters()]);
  refreshDataBtn.disabled = false;
  refreshDataBtn.textContent = "🔄 Refresh";
}

// ----------------- Initialization -----------------

document.addEventListener("DOMContentLoaded", async () => {
  const isAuthed = await verifyAuth();
  if (isAuthed) {
    await refreshAll();
  }
});
