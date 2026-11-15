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
// =========================================================================
// STAGE 3: REMEMBERING THE BAG ID & SETTING UP TRACKING VARIABLES
// =========================================================================

// Check browser storage for a previously saved Bag ID; if none exists, default to "BG-101"
let currentBagId = localStorage.getItem("bagguard_bag_id") || "BG-101";

// Put that saved Bag ID straight into HTML <input id="bagIdInput"> in the top header
bagIdInput.value = currentBagId;

// Holds the active Firebase folder path (e.g., "bags/BG-101") so we can disconnect it if the user changes bags
let activeBagRef = null;

// Remembers the previous state (e.g., "ARMED") so we don't print duplicate log entries on every GPS update
let lastKnownState = null;


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

function renderState(state, findBuzzer = false) {
  // Reset HTML <div id="stateBadge"> back to its base class before adding a state color class
  stateBadge.className = "state-badge";

  // Hide the top orange 2FA alert banner <section id="alertBanner"> by default (only shown in ALERT/STOLEN)
  alertBanner.classList.add("hidden");

  if (state === "ARMING") {
    // Keep HTML <input id="armToggle"> switched ON (green)
    armToggle.checked = true;

    // Reveal the Find My Bag box <div id="buzzerControl"> right underneath the lock switch
    buzzerControl.classList.remove("hidden");

    // Match the Find My Bag slider <input id="buzzerToggle"> to Firebase's true/false value
    buzzerToggle.checked = Boolean(findBuzzer);

    // Style <div id="stateBadge"> blue (.state-arming) and update the status text elements in Card 1
    stateBadge.classList.add("state-arming");
    stateBadge.textContent = "ARMING (10s)";
    stateDescription.textContent = "Arming in progress... Close and secure your bag.";
    subStatusText.textContent = "Notification status: Arming countdown active";

  } else if (state === "ARMED") {
    // Keep Security Lock ON and keep <div id="buzzerControl"> visible so the user can ping the bag anytime
    armToggle.checked = true;
    buzzerControl.classList.remove("hidden");
    buzzerToggle.checked = Boolean(findBuzzer);

    // Style <div id="stateBadge"> green (.state-armed) and update Card 1 descriptions
    stateBadge.classList.add("state-armed");
    stateBadge.textContent = "ARMED & PROTECTED";
    stateDescription.textContent = "Motion sensors active. Watching for movement.";
    subStatusText.textContent = "Notification status: Armed & monitoring";

  } else if (state === "ALERT") {
    // Keep Security Lock ON and Find My Bag visible
    armToggle.checked = true;
    buzzerControl.classList.remove("hidden");
    buzzerToggle.checked = Boolean(findBuzzer);

    // Pop open the orange 2FA warning banner <section id="alertBanner"> ("Bag Moving! Is this you?")
    alertBanner.classList.remove("hidden");

    // Style <div id="stateBadge"> orange (.state-alert)
    stateBadge.classList.add("state-alert");
    stateBadge.textContent = "⚠️ MOTION ALERT";
    stateDescription.textContent = "Movement detected! Confirm identity above.";
    subStatusText.textContent = "Notification status: 2FA Verification Sent";

  } else if (state === "STOLEN") {
    // Lock Security Switch ON, keep <div id="buzzerControl"> visible, and force the buzzer slider ON
    armToggle.checked = true;
    buzzerControl.classList.remove("hidden");
    buzzerToggle.checked = true;

    // Keep <section id="alertBanner"> visible on screen so user can disarm if recovered
    alertBanner.classList.remove("hidden");

    // Style <div id="stateBadge"> red (.state-stolen)
    stateBadge.classList.add("state-stolen");
    stateBadge.textContent = "🚨 BAG STOLEN";
    stateDescription.textContent = "Theft confirmed! Alarm locked ON & GPS tracking live.";
    subStatusText.textContent = "Notification status: Emergency Theft Mode";

  } else {
    // DEFAULT / DISARMED STATE:
    // Turn HTML <input id="armToggle"> OFF
    armToggle.checked = false;

    // Hide the Find My Bag box <div id="buzzerControl"> completely while the system is off
    buzzerControl.classList.add("hidden");

    // Reset the buzzer slider <input id="buzzerToggle"> to OFF
    buzzerToggle.checked = false;

    // Style <div id="stateBadge"> gray (.state-disarmed) and show idle messages
    stateBadge.classList.add("state-disarmed");
    stateBadge.textContent = "IDLE (DISARMED)";
    stateDescription.textContent = "Bag is idle. Turn on the lock above to arm.";
    subStatusText.textContent = "Notification status: Standby";
  }
}


// =========================================================================
// STAGE 6: LIVE TWO-WAY SYNC WITH FIREBASE REALTIME DATABASE
// =========================================================================

function connectToBag(bagId) {
  // If we were already listening to a previous bag in Firebase, detach that old listener first
  if (activeBagRef) off(activeBagRef);

  // Clean up spaces, convert letters to UPPERCASE (e.g., "bg-101" -> "BG-101"), or fallback to "BG-101"
  currentBagId = bagId.trim().toUpperCase() || "BG-101";

  // Put the cleaned Bag ID back into HTML <input id="bagIdInput"> and save it in browser storage
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
    const state = data.state|| "DISARMED";
    const findBuzzer = Boolean(data.findBuzzer);

    // Pass those values to Stage 5 to update all switches, badges, and banners on screen
    renderState(state, findBuzzer);

    // Only write a new entry to <ul id="eventLogList"> if the security state actually changed
    if (state !== lastKnownState) {
      if (state === "ARMING") addLog("Security lock turned ON — Arming started.", "info");
      if (state === "ARMED") addLog("System is now ARMED & protected.", "safe");
      if (state === "ALERT") addLog("⚠️ Motion detected! 2FA alert triggered.", "alert");
      if (state === "STOLEN") addLog("🚨 Theft confirmed! Alarm & live GPS active.", "danger");
      if (state === "DISARMED" && lastKnownState !== null) {
        addLog("System DISARMED (Idle).", "safe");
      }
      // Update lastKnownState so this exact state isn't logged twice
      lastKnownState = state;
    }

    // Read NEO-6M GPS coordinates ("lat" and "lng") from Firebase and convert them to numbers
    const lat = Number(data.lat);
    const lng = Number(data.lng);

    // If valid non-zero GPS coordinates exist in Firebase:
    if (lat && lng && (lat !== 0 || lng !== 0)) {
      // Display coordinates rounded to 6 decimal places in HTML <p id="latText"> and <p id="lngText">
      latText.textContent = lat.toFixed(6);
      lngText.textContent = lng.toFixed(6);

      // Update the GPS helper text in HTML <p id="gpsStatusText">
      gpsStatusText.textContent = "Live NEO-6M GPS coordinates received.";

      // Set the Google Maps destination link on HTML <a id="mapsLinkBtn"> and unlock the blue button
      mapsLinkBtn.href = `https://www.google.com/maps?q=${lat},${lng}`;
      mapsLinkBtn.classList.remove("disabled");
    } else {
      // If no GPS fix exists yet, show dashes and keep HTML <a id="mapsLinkBtn"> grayed out (.disabled)
      latText.textContent = "--.------";
      lngText.textContent = "--.------";
      gpsStatusText.textContent = "GPS activates automatically if theft is confirmed.";
      mapsLinkBtn.href = "#";
      mapsLinkBtn.classList.add("disabled");
    }
  });
}


// =========================================================================
// STAGE 7: HANDLING USER CLICKS & TOGGLE SWITCHES
// =========================================================================

// When the user clicks the "Set" button <button id="connectBtn"> in the header:
connectBtn.addEventListener("click", () => {
  // Connect Firebase to whatever Bag ID is typed inside <input id="bagIdInput">
  connectToBag(bagIdInput.value);
  addLog(`Switched active device to ${currentBagId}.`, "info");
});

// When the user flips the main Security System Lock switch <input id="armToggle">:
armToggle.addEventListener("change", () => {
  if (!activeBagRef) return;

  if (armToggle.checked) {
    // Switched ON: Tell Firebase to set "state" to "ARMING" (ESP32 will read this and start countdown)
    update(activeBagRef, { state: "ARMING" });
  } else {
    // Switched OFF: Tell Firebase to disarm the bag AND shut off the Find My Bag buzzer together
    update(activeBagRef, { state: "DISARMED", findBuzzer: false });
  }
});

// When the user flips the Find My Bag buzzer switch <input id="buzzerToggle">:
buzzerToggle.addEventListener("change", () => {
  // Safety guard: if the main Security Lock is OFF, force the buzzer switch OFF and do nothing
  if (!activeBagRef || !armToggle.checked) {
    buzzerToggle.checked = false;
    return;
  }

  // Read whether the slider is now true (ON) or false (OFF)
  const isRinging = buzzerToggle.checked;

  // Send "findBuzzer: true/false" to Firebase so the ESP32 turns the physical buzzer ON or OFF
  update(activeBagRef, { findBuzzer: isRinging });

  // Record the action in the Recent Activity Log
  addLog(isRinging ? "🔔 Find My Bag buzzer turned ON." : "🔕 Find My Bag buzzer turned OFF.", "alert");
});

// When the user clicks "Yes (It's Me)" <button id="btnYesMe"> on the orange 2FA alert banner:
btnYesMe.addEventListener("click", () => {
  if (!activeBagRef) return;
  // Cancel the alarm in Firebase by setting state back to "DISARMED" and turning off the buzzer
  update(activeBagRef, { state: "DISARMED", findBuzzer: false });
  addLog("Owner verified ('Yes, It's Me') — System disarmed.", "safe");
});

// When the user clicks "No (Stolen!)" <button id="btnNotMe"> on the orange 2FA alert banner:
btnNotMe.addEventListener("click", () => {
  if (!activeBagRef) return;
  // Escalate Firebase to "STOLEN" mode and lock "findBuzzer: true" so the alarm sounds continuously
  update(activeBagRef, { state: "STOLEN", findBuzzer: true });
  addLog("Owner reported theft ('No, Stolen!') — Emergency alarm locked ON.", "danger");
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
connectToBag(currentBagId);