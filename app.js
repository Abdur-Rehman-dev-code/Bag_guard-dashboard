
// Import Firebase App & Realtime Database from Google CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  update,
  off
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAhDuCugiBhbObJrZA-n-e9Ih1k9IwnkVM",
  authDomain: "bagguard-cbbe8.firebaseapp.com",
  databaseURL: "https://bagguard-cbbe8-default-rtdb.firebaseio.com",
  projectId: "bagguard-cbbe8",
  storageBucket: "bagguard-cbbe8.firebasestorage.app",
  messagingSenderId: "437565335164",
  appId: "1:437565335164:web:1484949049477741d14bf9"
};

// Initialize Firebase (Only Once!)
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
// --- COMMAND-SYNC GUARD STATE ---
const bagIdInput = document.getElementById("bagIdInput");
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
const mapsLinkBtn = document.getElementById("mapsLinkBtn");

const toggleLogBtn = document.getElementById("toggleLogBtn");
const logArrow = document.getElementById("logArrow");
const clearLogBtn = document.getElementById("clearLogBtn");
const eventLogList = document.getElementById("eventLogList");

if (mapsLinkBtn) {
  mapsLinkBtn.removeAttribute("href");
  mapsLinkBtn.removeAttribute("target");
  mapsLinkBtn.style.opacity = "0.5";
  mapsLinkBtn.style.cursor = "not-allowed";
  mapsLinkBtn.onclick = (e) => {
    e.preventDefault();
    return false;
  };
}
// =========================================================================
// STAGE 3: REMEMBERING THE BAG ID & SETTING UP TRACKING VARIABLES
// =========================================================================

// Start blank so the HTML placeholder shows until the user types a Bag ID
// Load previously typed Bag ID if saved; otherwise stay blank so placeholder shows
let currentBagId = localStorage.getItem("bagguard_bag_id") || "";
bagIdInput.value = currentBagId;
// Holds the active Firebase folder path (e.g., "bags/BG-101") so we can disconnect it if the user changes bags
let activeBagRef = null;

// Remembers the previous state (e.g., "ARMED") so we don't print duplicate log entries on every GPS update
let lastKnownState = null;

// --- COMMAND-SYNC GUARD (Prevents stale ESP32 packets from undoing button clicks) ---
let lastCommandTime = 0;
let pendingState = null;
const COMMAND_GUARD_MS = 5000;


// =========================================================================
// STAGE 4: ADDING TIMESTAMPED ENTRIES TO THE ACTIVITY LOG
// =========================================================================

function addLog(message, type = "info") {
  // Look inside HTML <ul id="eventLogList"> for the placeholder line <li class="log-empty">
  const emptyItem = eventLogList.querySelector(".log-empty");

  // If the placeholder "Waiting for system activity..." is still there, delete it before adding real logs
  if (emptyItem) emptyItem.remove();

  // Grab the computer's current local clock time (e.g., "03:45:10 PM")
  const now = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

  // Create a brand-new HTML <li> bullet element in memory
  const li = document.createElement("li");

  // Add a colored left border class ("log-safe", "log-alert", or "log-danger") defined in style.css
  if (type !== "info") li.classList.add(`log-${type}`);

  // Fill the <li> with a muted timestamp span plus the event message
  li.innerHTML = `<span class="log-time">${now}</span>${message}`;

  // Insert the newest log entry at the very top of HTML <ul id="eventLogList">
  eventLogList.prepend(li);
}


// =========================================================================
// STAGE 5: UPDATING THE VISUAL DASHBOARD BASED ON BAG STATE
// =========================================================================
function setStatusTexts(badgeText, descText, subText) {
  if (stateBadge) stateBadge.textContent = badgeText;
  if (stateDescription) stateDescription.textContent = descText;
  if (subStatusText) subStatusText.textContent = subText;
}
function renderState(state, findBuzzer = false) {
  // Reset HTML <div id="stateBadge"> back to its base class before adding a state color class
  if (stateBadge) stateBadge.className = "state-badge";

  // Hide the top orange 2FA alert banner <section id="alertBanner"> by default (only shown in ALERT)
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
      "⚠️ MOTION ALERT",
      "Movement detected! Confirm identity above.",
      "Notification status: 2FA Verification Sent"
    );

  } else if (state === "STOLEN") {
    armToggle.checked = true;
    buzzerControl.classList.remove("hidden");
    buzzerToggle.checked = Boolean(findBuzzer);
    if (alertBanner) alertBanner.classList.add("hidden");

    if (stateBadge) stateBadge.classList.add("state-stolen");
    setStatusTexts(
      "🚨 BAG STOLEN",
      "Theft confirmed! Alarm locked ON & GPS tracking live.",
      "Notification status: Emergency Theft Mode"
    );

  } else {
    // DEFAULT / DISARMED (IDLE) STATE:
    armToggle.checked = false;
    buzzerControl.classList.add("hidden");
    buzzerToggle.checked = false;

    if (stateBadge) stateBadge.classList.add("state-disarmed");
    setStatusTexts(
      "IDLE (DISARMED)",
      "Bag is idle. Turn on the lock above to arm.",
      "Notification status: Standby"
    );
  }
}
function updateTrackButton(state, lat = 24.8607, lng = 67.0011) {
  if (!mapsLinkBtn) return;

  if (state === "STOLEN") {
    const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
    latText.textContent = lat.toFixed(6);
    lngText.textContent = lng.toFixed(6);
    gpsStatusText.textContent = "Theft confirmed! Live location tracking active.";

    mapsLinkBtn.setAttribute("href", mapsUrl);
    mapsLinkBtn.setAttribute("target", "_blank");
    mapsLinkBtn.disabled = false;
    mapsLinkBtn.removeAttribute("disabled");
    mapsLinkBtn.removeAttribute("aria-disabled");
    mapsLinkBtn.classList.remove("disabled", "btn-disabled", "locked");

    // Force-override any gray CSS styling
    mapsLinkBtn.style.setProperty("pointer-events", "auto", "important");
    mapsLinkBtn.style.setProperty("opacity", "1", "important");
    mapsLinkBtn.style.setProperty("filter", "none", "important");
    mapsLinkBtn.style.setProperty("cursor", "pointer", "important");
    mapsLinkBtn.style.setProperty("background-color", "#ef4444", "important");
    mapsLinkBtn.style.setProperty("color", "#ffffff", "important");

    mapsLinkBtn.onclick = (e) => {
      e.preventDefault();
      window.open(mapsUrl, "_blank", "noopener");
    };
  } else {
    latText.textContent = "--.------";
    lngText.textContent = "--.------";
    gpsStatusText.textContent =
      state === "DISARMED"
        ? "System idle. Coordinates hidden."
        : "Armed & monitoring. Coordinates reveal only if stolen.";

    mapsLinkBtn.removeAttribute("href");
    mapsLinkBtn.removeAttribute("target");
    mapsLinkBtn.disabled = true;
    mapsLinkBtn.setAttribute("disabled", "true");
    mapsLinkBtn.classList.add("disabled");

    mapsLinkBtn.style.setProperty("pointer-events", "none", "important");
    mapsLinkBtn.style.setProperty("opacity", "0.5", "important");
    mapsLinkBtn.style.setProperty("cursor", "not-allowed", "important");
    mapsLinkBtn.style.removeProperty("background-color");
    mapsLinkBtn.style.removeProperty("color");

    mapsLinkBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      return false;
    };
  }
}

// =========================================================================
// STAGE 6: LIVE TWO-WAY SYNC WITH FIREBASE REALTIME DATABASE
// =========================================================================

function connectToBag(bagId) {
  // If we were already listening to a previous bag in Firebase, detach that old listener first
  if (activeBagRef) off(activeBagRef);

 // Clean up spaces and convert letters to UPPERCASE; stop if box is empty
  currentBagId = bagId.trim().toUpperCase();
  if (!currentBagId) return;

  bagIdInput.value = currentBagId;
  localStorage.setItem("bagguard_bag_id", currentBagId);

  // Show an orange "Syncing..." indicator in HTML <span id="connectionDot"> while connecting
  connectionDot.textContent = "● Syncing...";
  connectionDot.style.color = "orange";
  lastKnownState = null;

  // Point Firebase to the database folder "bags/<currentBagId>" (for example: "bags/BG-101")
  activeBagRef = ref(db, `bags/${currentBagId}`);

  // Start a live listener: runs automatically now AND every time Firebase data changes (from web or ESP32)
  onValue(activeBagRef, (snapshot) => {
    // Update HTML <span id="connectionDot"> to green once Firebase responds
    connectionDot.textContent = `● Connected (${currentBagId})`;
    connectionDot.style.color = "limegreen";

    // Read the JSON object stored at "bags/BG-101" (if empty in Firebase, use an empty object {})
    const data = snapshot.val() || {};

   // Extract "state" (default "DISARMED") and "findBuzzer" (default false) from Firebase
    let state = data.state || "DISARMED";
    const findBuzzer = Boolean(data.findBuzzer);

    // --- COMMAND-SYNC GUARD CHECK ---
   const timeSinceClick = Date.now() - lastCommandTime;
    if (pendingState && timeSinceClick < COMMAND_GUARD_MS) {
      // Allow ESP32 to advance ARMING -> ARMED immediately
      if (pendingState === "ARMING" && state === "ARMED") {
        pendingState = null;
      } else if (state !== pendingState) {
        state = pendingState; // Keep our newly clicked state (e.g., DISARMED) on screen
      } else {
        pendingState = null;  // ESP32 confirmed the change; release guard early
      }
    } else {
      pendingState = null;
    }

    // Pass guarded state to Stage 5 to update all switches, badges, and banners on screen
    renderState(state, findBuzzer);

    // Only write a new entry to <ul id="eventLogList"> if the security state actually changed
    if (state !== lastKnownState) {
      if (state === "ARMING") addLog("Security lock turned ON - Arming started.", "info");
      if (state === "ARMED") addLog("System is now ARMED & protected.", "safe");
      if (state === "ALERT") addLog("⚠️ Motion detected! 2FA alert triggered.", "alert");
      if (state === "STOLEN") addLog("🚨 Theft confirmed! Alarm & live GPS active.", "danger");
      if (state === "DISARMED" && lastKnownState !== null) {
        addLog("System DISARMED (Idle).", "safe");
      }
      lastKnownState = state;
    }

    // Use live NEO-6M coordinates if valid; otherwise use fallback coordinates
    const rawLat = Number(data.lat);
    const rawLng = Number(data.lng);
    const hasLiveGPS = Math.abs(rawLat) > 0.001 && Math.abs(rawLng) > 0.001;

    const lat = hasLiveGPS ? rawLat : 24.8607;
    const lng = hasLiveGPS ? rawLng : 67.0011;

    updateTrackButton(state, lat, lng);

    
  });
}

  

// =========================================================================
// STAGE 7: HANDLING USER CLICKS & TOGGLE SWITCHES
// =========================================================================

// When the user clicks the "Set" button <button id="connectBtn"> in the header:
connectBtn.addEventListener("click", () => {
  const typedId = bagIdInput.value.trim();
  if (!typedId) {
    alert("Please enter a Bag ID first.");
    return;
  }
  connectToBag(typedId);
  addLog(`Switched active device to ${currentBagId}.`, "info");
});

// When the user flips the main Security System Lock switch <input id="armToggle">:
armToggle.addEventListener("change", () => {
  if (!activeBagRef) {
    armToggle.checked = false;
    alert("Enter a Bag ID and click Set first.");
    return;
  }

  if (armToggle.checked) {
    lastCommandTime = Date.now();
    pendingState = "ARMING";
    renderState("ARMING", false);
    update(activeBagRef, { state: "ARMING" });
  } else {
    lastCommandTime = Date.now();
    pendingState = "DISARMED";
    lastKnownState = "DISARMED";
    buzzerToggle.checked = false;
    buzzerControl.classList.add("hidden");
    renderState("DISARMED", false);
    addLog("System DISARMED (Idle) - Bag recovered.", "safe");

    update(activeBagRef, { state: "DISARMED", findBuzzer: false });
  }
});

// When the user flips the Find My Bag buzzer switch <input id="buzzerToggle">:
buzzerToggle.addEventListener("change", () => {
  if (!activeBagRef || !armToggle.checked) {
    buzzerToggle.checked = false;
    return;
  }
  const isRinging = buzzerToggle.checked;
  update(activeBagRef, { findBuzzer: isRinging });
  addLog(isRinging ? "🔔 Find My Bag buzzer turned ON." : "🔕 Find My Bag buzzer turned OFF.", "alert");
});

// When the user clicks "Yes (It's Me)" <button id="btnYesMe"> on the orange 2FA alert banner:
btnYesMe.addEventListener("click", () => {
  if (!activeBagRef) return;
  lastCommandTime = Date.now();
  pendingState = "DISARMED";
  renderState("DISARMED", false);

  update(activeBagRef, { state: "DISARMED", findBuzzer: false });
  addLog("Owner verified ('Yes, It's Me') - System disarmed.", "safe");
});

// When the user clicks "No (Stolen!)" <button id="btnNotMe"> on the orange 2FA alert banner:
btnNotMe.addEventListener("click", () => {
  if (!activeBagRef) return;
  lastCommandTime = Date.now();
  pendingState = "STOLEN";
  renderState("STOLEN", buzzerToggle.checked);
  updateTrackButton("STOLEN");

  update(activeBagRef, { state: "STOLEN" });
  addLog("Owner reported theft ('No, Stolen!') - Emergency alarm locked ON.", "danger");
});

// When the user clicks the collapsible Recent Activity Log bar <div id="toggleLogBtn">:
toggleLogBtn.addEventListener("click", (e) => {
  // Ignore the click if the user specifically clicked the "Clear" button inside the header bar
  if (e.target === clearLogBtn) return;

  // Toggle ".hidden" on <ul id="eventLogList"> (returns true if now hidden, false if now visible)
  const isHidden = eventLogList.classList.toggle("hidden");

  // Show the "Clear" button <button id="clearLogBtn"> only when the drawer is open
  clearLogBtn.classList.toggle("hidden", isHidden);

  // Flip the arrow text inside <span id="logArrow"> between "▼ Show" and "▲ Hide"
  logArrow.textContent = isHidden ? "▼ Show" : "▲ Hide";
});

// When the user clicks the "Clear" button <button id="clearLogBtn">:
clearLogBtn.addEventListener("click", () => {
  // Replace all log items inside <ul id="eventLogList"> with a fresh placeholder message
  eventLogList.innerHTML = `<li class="log-empty">Activity log cleared.</li>`;
});


// =========================================================================
// STARTUP: CONNECT IMMEDIATELY WHEN THE WEBPAGE LOADS
// =========================================================================

// Automatically connect to the saved Bag ID ("BG-101") as soon as the browser finishes reading app.js
// Auto-connect only if the user has already saved a Bag ID previously
if (currentBagId) {
  connectToBag(currentBagId);
}
