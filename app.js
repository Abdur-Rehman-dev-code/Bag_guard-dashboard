// Import Firebase App & Realtime Database from Google CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  update,
  off
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// Firebase project configuration (same backend endpoint & schema)
const firebaseConfig = {
  apiKey: "AIzaSyAhDuCugiBhbObJrZA-n-e9Ih1k9IwnkVM",
  authDomain: "bagguard-cbbe8.firebaseapp.com",
  databaseURL: "https://bagguard-cbbe8-default-rtdb.firebaseio.com",
  projectId: "bagguard-cbbe8",
  storageBucket: "bagguard-cbbe8.firebasestorage.app",
  messagingSenderId: "437565335164",
  appId: "1:437565335164:web:1484949049477741d14bf9"
};

// Initialize Firebase once
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Security & validation constants
const BAG_ID_REGEX = /^[A-Z0-9][A-Z0-9_-]{0,31}$/;
const ALLOWED_STATES = new Set(["DISARMED", "ARMING", "ARMED", "ALERT", "STOLEN"]);
const DEFAULT_LAT = 24.8607;
const DEFAULT_LNG = 67.0011;
const MAX_LOG_ENTRIES = 100;
const COMMAND_GUARD_MS = 5000;

// DOM references
const bagIdInput = document.getElementById("bagIdInput");
const bagIdError = document.getElementById("bagIdError");
const connectBtn = document.getElementById("connectBtn");
const connectionDot = document.getElementById("connectionDot");

const armToggle = document.getElementById("armToggle");
const buzzerControl = document.getElementById("buzzerControl");
const buzzerToggle = document.getElementById("buzzerToggle");

const stateBadge = document.getElementById("stateBadge");
const stateDescription = document.getElementById("stateDescription");
const subStatusText = document.getElementById("subStatusText");

const alertBanner = document.getElementById("alertBanner");
const btnYesMe = document.getElementById("btnYesMe");
const btnNotMe = document.getElementById("btnNotMe");

const latText = document.getElementById("latText");
const lngText = document.getElementById("lngText");
const gpsStatusText = document.getElementById("gpsStatusText");
const gpsPrivacyTag = document.getElementById("gpsPrivacyTag");
const mapsLinkBtn = document.getElementById("mapsLinkBtn");

const toggleLogBtn = document.getElementById("toggleLogBtn");
const logArrow = document.getElementById("logArrow");
const clearLogBtn = document.getElementById("clearLogBtn");
const eventLogList = document.getElementById("eventLogList");

// Tracking & command-sync guard state
let currentBagId = "";
let activeBagRef = null;
let lastKnownState = null;
let lastLat = DEFAULT_LAT;
let lastLng = DEFAULT_LNG;

let lastCommandTime = 0;
let pendingState = null;

// =========================================================================
// HELPERS: VALIDATION, CONNECTION BADGE & SAFE LOGGING
// =========================================================================

function readStoredBagId() {
  try {
    return localStorage.getItem("bagguard_bag_id") || "";
  } catch {
    return "";
  }
}

function writeStoredBagId(bagId) {
  try {
    if (bagId) {
      localStorage.setItem("bagguard_bag_id", bagId);
    } else {
      localStorage.removeItem("bagguard_bag_id");
    }
  } catch {
    // Ignore storage errors in restricted browser contexts
  }
}

function sanitizeBagId(rawValue) {
  if (typeof rawValue !== "string") return null;
  const normalized = rawValue.trim().toUpperCase();
  if (!BAG_ID_REGEX.test(normalized)) return null;
  return normalized;
}

function showInputFeedback(message) {
  if (!bagIdError) return;
  if (!message) {
    bagIdError.textContent = "";
    bagIdError.classList.add("hidden");
    return;
  }
  bagIdError.textContent = message;
  bagIdError.classList.remove("hidden");
}

function setConnectionStatus(status, label) {
  if (!connectionDot) return;
  connectionDot.className = `conn-badge conn-${status}`;
  const labelSpan = connectionDot.querySelector(".conn-label");
  if (labelSpan) {
    labelSpan.textContent = label;
  } else {
    connectionDot.textContent = label;
  }
}

function isValidCoordinate(lat, lng) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    Math.abs(lat) > 0.001 &&
    Math.abs(lng) > 0.001
  );
}

// Safe DOM-based activity log writer (no innerHTML to prevent DOM XSS)
function addLog(message, type = "info") {
  if (!eventLogList) return;

  const emptyItem = eventLogList.querySelector(".log-empty");
  if (emptyItem) emptyItem.remove();

  const now = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

  const li = document.createElement("li");
  if (type === "safe" || type === "alert" || type === "danger") {
    li.classList.add(`log-${type}`);
  }

  const timeSpan = document.createElement("span");
  timeSpan.className = "log-time";
  timeSpan.textContent = now;

  const msgSpan = document.createElement("span");
  msgSpan.className = "log-message";
  msgSpan.textContent = String(message);

  li.append(timeSpan, msgSpan);
  eventLogList.prepend(li);

  while (eventLogList.children.length > MAX_LOG_ENTRIES) {
    eventLogList.lastElementChild.remove();
  }
}

// =========================================================================
// VISUAL STATE & GPS RENDERING
// =========================================================================

function setStatusTexts(badgeText, descText, subText) {
  if (stateBadge) stateBadge.textContent = badgeText;
  if (stateDescription) stateDescription.textContent = descText;
  if (subStatusText) subStatusText.textContent = subText;
}

function renderState(state, findBuzzer = false) {
  if (stateBadge) stateBadge.className = "state-badge";
  if (alertBanner) alertBanner.classList.add("hidden");

  if (state === "ARMING") {
    armToggle.checked = true;
    buzzerControl.classList.remove("hidden");
    buzzerToggle.checked = Boolean(findBuzzer);

    if (stateBadge) stateBadge.classList.add("state-arming");
    setStatusTexts(
      "ARMING (10s)",
      "Arming in progress... Close and secure your bag.",
      "Notification status: Arming countdown active"
    );
  } else if (state === "ARMED") {
    armToggle.checked = true;
    buzzerControl.classList.remove("hidden");
    buzzerToggle.checked = Boolean(findBuzzer);

    if (stateBadge) stateBadge.classList.add("state-armed");
    setStatusTexts(
      "ARMED & PROTECTED",
      "Motion sensors active. Watching for movement.",
      "Notification status: Armed & monitoring"
    );
  } else if (state === "ALERT") {
    armToggle.checked = true;
    buzzerControl.classList.remove("hidden");
    buzzerToggle.checked = Boolean(findBuzzer);
    if (alertBanner) alertBanner.classList.remove("hidden");

    if (stateBadge) stateBadge.classList.add("state-alert");
    setStatusTexts(
      "MOTION ALERT",
      "Movement detected! Confirm identity in the banner above.",
      "Notification status: 2FA Verification Sent"
    );
  } else if (state === "STOLEN") {
    armToggle.checked = true;
    buzzerControl.classList.remove("hidden");
    buzzerToggle.checked = Boolean(findBuzzer);
    if (alertBanner) alertBanner.classList.add("hidden");

    if (stateBadge) stateBadge.classList.add("state-stolen");
    setStatusTexts(
      "BAG STOLEN",
      "Theft confirmed! Alarm locked ON & GPS tracking live.",
      "Notification status: Emergency Theft Mode"
    );
  } else {
    armToggle.checked = false;
    buzzerControl.classList.add("hidden");
    buzzerToggle.checked = false;

    if (stateBadge) stateBadge.classList.add("state-disarmed");
    setStatusTexts(
      "IDLE (DISARMED)",
      "Bag is idle. Turn on the lock below to arm.",
      "Notification status: Standby"
    );
  }
}

function updateTrackButton(state, lat = lastLat, lng = lastLng) {
  if (!mapsLinkBtn) return;

  const safeLat = Number.isFinite(lat) && lat >= -90 && lat <= 90 ? lat : DEFAULT_LAT;
  const safeLng = Number.isFinite(lng) && lng >= -180 && lng <= 180 ? lng : DEFAULT_LNG;

  if (state === "STOLEN") {
    const formattedLat = safeLat.toFixed(6);
    const formattedLng = safeLng.toFixed(6);
    const mapsUrl = `https://www.google.com/maps?q=${encodeURIComponent(formattedLat)},${encodeURIComponent(formattedLng)}`;

    latText.textContent = formattedLat;
    lngText.textContent = formattedLng;

    if (gpsStatusText) {
      gpsStatusText.textContent = "Theft confirmed! Live location tracking is active.";
    }
    if (gpsPrivacyTag) {
      gpsPrivacyTag.textContent = "Live Tracking";
      gpsPrivacyTag.classList.add("tag-live");
    }

    mapsLinkBtn.setAttribute("href", mapsUrl);
    mapsLinkBtn.setAttribute("target", "_blank");
    mapsLinkBtn.setAttribute("rel", "noopener noreferrer");
    mapsLinkBtn.setAttribute("aria-disabled", "false");
    mapsLinkBtn.classList.remove("disabled");
    mapsLinkBtn.classList.add("track-unlocked");

    mapsLinkBtn.onclick = (e) => {
      e.preventDefault();
      window.open(mapsUrl, "_blank", "noopener,noreferrer");
    };
  } else {
    latText.textContent = "--.------";
    lngText.textContent = "--.------";

    if (gpsStatusText) {
      gpsStatusText.textContent =
        state === "DISARMED"
          ? "System idle. Coordinates stay hidden unless theft is confirmed."
          : "Armed & monitoring. Coordinates reveal only if stolen.";
    }
    if (gpsPrivacyTag) {
      gpsPrivacyTag.textContent = "Privacy Locked";
      gpsPrivacyTag.classList.remove("tag-live");
    }

    mapsLinkBtn.removeAttribute("href");
    mapsLinkBtn.removeAttribute("target");
    mapsLinkBtn.setAttribute("aria-disabled", "true");
    mapsLinkBtn.classList.remove("track-unlocked");
    mapsLinkBtn.classList.add("disabled");

    mapsLinkBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      return false;
    };
  }
}

// =========================================================================
// LIVE TWO-WAY SYNC WITH FIREBASE REALTIME DATABASE
// =========================================================================

function sendBagUpdate(payload, errorContext) {
  if (!activeBagRef) return;
  update(activeBagRef, payload).catch((err) => {
    pendingState = null;
    setConnectionStatus("error", "Write Failed");
    addLog(`Failed to ${errorContext}: ${err.message || "Permission or network error."}`, "danger");
  });
}

function connectToBag(bagId) {
  const validId = sanitizeBagId(bagId);
  if (!validId) {
    showInputFeedback("Use 1–32 letters, numbers, '-' or '_' only (e.g. BG-001).");
    return false;
  }

  showInputFeedback("");

  if (activeBagRef) off(activeBagRef);

  currentBagId = validId;
  bagIdInput.value = currentBagId;
  writeStoredBagId(currentBagId);

  setConnectionStatus("syncing", `Syncing (${currentBagId})...`);
  lastKnownState = null;

  // Keep exact Firebase Realtime Database endpoint: bags/<currentBagId>
  activeBagRef = ref(db, `bags/${currentBagId}`);

  onValue(
    activeBagRef,
    (snapshot) => {
      setConnectionStatus("connected", `Connected (${currentBagId})`);

      const data = snapshot.val() || {};
      const rawState = typeof data.state === "string" ? data.state.toUpperCase() : "DISARMED";
      let state = ALLOWED_STATES.has(rawState) ? rawState : "DISARMED";
      const findBuzzer = Boolean(data.findBuzzer);

      // Command-sync guard prevents stale ESP32 packets from reverting recent clicks
      const timeSinceClick = Date.now() - lastCommandTime;
      if (pendingState && timeSinceClick < COMMAND_GUARD_MS) {
        if (pendingState === "ARMING" && state === "ARMED") {
          pendingState = null;
        } else if (state !== pendingState) {
          state = pendingState;
        } else {
          pendingState = null;
        }
      } else {
        pendingState = null;
      }

      renderState(state, findBuzzer);

      if (state !== lastKnownState) {
        if (state === "ARMING") addLog("Security lock turned ON - Arming started.", "info");
        if (state === "ARMED") addLog("System is now ARMED & protected.", "safe");
        if (state === "ALERT") addLog("Motion detected! 2FA alert triggered.", "alert");
        if (state === "STOLEN") addLog("Theft confirmed! Alarm & live GPS active.", "danger");
        if (state === "DISARMED" && lastKnownState !== null) {
          addLog("System DISARMED (Idle).", "safe");
        }
        lastKnownState = state;
      }

      // Use live NEO-6M coordinates if finite & in range; otherwise fallback
      const rawLat = Number(data.lat);
      const rawLng = Number(data.lng);
      const hasLiveGPS = isValidCoordinate(rawLat, rawLng);

      lastLat = hasLiveGPS ? rawLat : DEFAULT_LAT;
      lastLng = hasLiveGPS ? rawLng : DEFAULT_LNG;

      updateTrackButton(state, lastLat, lastLng);
    },
    (error) => {
      setConnectionStatus("error", "Sync Error");
      addLog(`Connection error for ${currentBagId}: ${error.message || "Access denied."}`, "danger");
    }
  );

  return true;
}

// =========================================================================
// USER INTERACTIONS & EVENT LISTENERS
// =========================================================================

function handleConnectBag() {
  const typedId = bagIdInput.value.trim();
  if (!typedId) {
    showInputFeedback("Please enter a Bag ID first.");
    bagIdInput.focus();
    return;
  }
  if (connectToBag(typedId)) {
    addLog(`Switched active device to ${currentBagId}.`, "info");
  }
}

connectBtn.addEventListener("click", handleConnectBag);

bagIdInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    handleConnectBag();
  }
});

bagIdInput.addEventListener("input", () => {
  if (bagIdError && !bagIdError.classList.contains("hidden")) {
    showInputFeedback("");
  }
});

armToggle.addEventListener("change", () => {
  if (!activeBagRef) {
    armToggle.checked = false;
    showInputFeedback("Enter a Bag ID and click Set first.");
    bagIdInput.focus();
    return;
  }

  if (armToggle.checked) {
    lastCommandTime = Date.now();
    pendingState = "ARMING";
    renderState("ARMING", false);
    sendBagUpdate({ state: "ARMING" }, "arm security lock");
  } else {
    lastCommandTime = Date.now();
    pendingState = "DISARMED";
    lastKnownState = "DISARMED";
    buzzerToggle.checked = false;
    buzzerControl.classList.add("hidden");
    renderState("DISARMED", false);
    updateTrackButton("DISARMED");
    addLog("System DISARMED (Idle) - Bag recovered.", "safe");

    sendBagUpdate({ state: "DISARMED", findBuzzer: false }, "disarm security lock");
  }
});

buzzerToggle.addEventListener("change", () => {
  if (!activeBagRef || !armToggle.checked) {
    buzzerToggle.checked = false;
    return;
  }
  const isRinging = buzzerToggle.checked;
  sendBagUpdate({ findBuzzer: isRinging }, "toggle Find My Bag buzzer");
  addLog(
    isRinging ? "Find My Bag buzzer turned ON." : "Find My Bag buzzer turned OFF.",
    "alert"
  );
});

btnYesMe.addEventListener("click", () => {
  if (!activeBagRef) return;
  lastCommandTime = Date.now();
  pendingState = "DISARMED";
  lastKnownState = "DISARMED";
  renderState("DISARMED", false);
  updateTrackButton("DISARMED");

  sendBagUpdate({ state: "DISARMED", findBuzzer: false }, "verify owner & disarm");
  addLog("Owner verified ('Yes, It's Me') - System disarmed.", "safe");
});

btnNotMe.addEventListener("click", () => {
  if (!activeBagRef) return;
  lastCommandTime = Date.now();
  pendingState = "STOLEN";
  lastKnownState = "STOLEN";
  renderState("STOLEN", buzzerToggle.checked);
  updateTrackButton("STOLEN", lastLat, lastLng);

  sendBagUpdate({ state: "STOLEN" }, "report theft");
  addLog("Owner reported theft ('No, Stolen!') - Emergency alarm locked ON.", "danger");
});

function toggleActivityLog(e) {
  if (e && e.target === clearLogBtn) return;

  const isHidden = eventLogList.classList.toggle("hidden");
  clearLogBtn.classList.toggle("hidden", isHidden);
  toggleLogBtn.setAttribute("aria-expanded", String(!isHidden));
  logArrow.textContent = isHidden ? "Show ▾" : "Hide ▴";
}

toggleLogBtn.addEventListener("click", toggleActivityLog);
toggleLogBtn.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    toggleActivityLog(e);
  }
});

clearLogBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const emptyLi = document.createElement("li");
  emptyLi.className = "log-empty";
  emptyLi.textContent = "Activity log cleared.";
  eventLogList.replaceChildren(emptyLi);
});

// =========================================================================
// INITIALIZATION
// =========================================================================

updateTrackButton("DISARMED");

const savedBagId = sanitizeBagId(readStoredBagId());
if (savedBagId) {
  connectToBag(savedBagId);
} else {
  // Discard invalid/corrupted stored value if present
  writeStoredBagId("");
  bagIdInput.value = "";
}
