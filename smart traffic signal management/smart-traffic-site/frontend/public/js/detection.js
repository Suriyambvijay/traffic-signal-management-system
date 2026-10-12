// ============================================================
// SHARED DETECTION / SIGNAL ENGINE
// Runs COCO-SSD against each current image/video frame and aggregates
// recognized vehicle classes before updating lane and signal state.
// ============================================================

const TrafficEngine = (function () {
  const laneOrder = ["N", "E", "S", "W"];
  const savedLaneCounts = JSON.parse(sessionStorage.getItem("st_lane_counts") || "{}");
  const savedSignal = JSON.parse(sessionStorage.getItem("st_signal") || "{}");
  const state = {
    lanes: Object.fromEntries(laneOrder.map((lane) => {
      const count = Math.max(0, Number(savedLaneCounts[lane] && savedLaneCounts[lane].count) || 0);
      return [lane, { count, density: densityFromCount(count) }];
    })),
    signal: {
      active: laneOrder.includes(savedSignal.active) ? savedSignal.active : "N",
      phase: ["green", "yellow", "red"].includes(savedSignal.phase) ? savedSignal.phase : "green",
      remaining: Math.max(1, Number(savedSignal.remaining) || 8),
      manual: Boolean(savedSignal.manual),
      greenElapsed: 0,
      lastTickAt: Date.now(),
    },
    history: JSON.parse(sessionStorage.getItem("st_history") || "[]"),
    cloudRecords: parseInt(sessionStorage.getItem("st_records") || "0", 10),
  };
  let modelPromise;
  const DENSITY_LABEL = { low: "Low", med: "Medium", high: "High", vhigh: "Very high" };

  function densityFromCount(c) {
    if (c <= 4) return "low";
    if (c <= 9) return "med";
    if (c <= 15) return "high";
    return "vhigh";
  }

  function greenDurationForCount(count) {
    if (count <= 0) return 8;
    return Math.min(60, 10 + count * 2);
  }

  function saveSignal() {
    const { active, phase, remaining, manual } = state.signal;
    sessionStorage.setItem("st_signal", JSON.stringify({ active, phase, remaining, manual }));
  }

  function nextLaneWithDemand(currentLane) {
    const currentIndex = laneOrder.indexOf(currentLane);
    for (let offset = 1; offset <= laneOrder.length; offset++) {
      const lane = laneOrder[(currentIndex + offset + laneOrder.length) % laneOrder.length];
      if (state.lanes[lane].count > 0) return lane;
    }
    if (state.lanes[currentLane].count > 0) return currentLane;
    return laneOrder[(currentIndex + 1 + laneOrder.length) % laneOrder.length];
  }

  function updateSignalForCounts() {
    const signal = state.signal;
    if (signal.manual) return;

    if (signal.phase === "red") {
      signal.active = nextLaneWithDemand(signal.active);
      signal.phase = "green";
      signal.greenElapsed = 0;
      signal.remaining = greenDurationForCount(state.lanes[signal.active].count);
    } else if (signal.phase === "green" && state.lanes[signal.active].count === 0) {
      const nextLane = nextLaneWithDemand(signal.active);
      if (nextLane !== signal.active) {
        signal.phase = "yellow";
        signal.remaining = 3;
      }
    } else if (signal.phase === "green") {
      signal.remaining = Math.max(1, greenDurationForCount(state.lanes[signal.active].count) - signal.greenElapsed);
    }

    sessionStorage.setItem("st_lane_counts", JSON.stringify(state.lanes));
    saveSignal();
  }

  function setManualMode(enabled) {
    const signal = state.signal;
    signal.manual = Boolean(enabled);
    signal.lastTickAt = Date.now();
    if (!signal.manual) {
      if (state.lanes[signal.active].count === 0) signal.active = nextLaneWithDemand(signal.active);
      signal.phase = "green";
      signal.greenElapsed = 0;
      signal.remaining = greenDurationForCount(state.lanes[signal.active].count);
      updateSignalForCounts();
    }
    saveSignal();
  }

  function setManualSignal(lane, phase) {
    if (!laneOrder.includes(lane) || !["green", "yellow"].includes(phase)) return;
    state.signal.manual = true;
    state.signal.active = lane;
    state.signal.phase = phase;
    state.signal.remaining = phase === "yellow" ? 5 : 99;
    state.signal.greenElapsed = 0;
    state.signal.lastTickAt = Date.now();
    saveSignal();
  }

  function setManualAllRed() {
    state.signal.manual = true;
    state.signal.phase = "red";
    state.signal.remaining = 99;
    state.signal.lastTickAt = Date.now();
    saveSignal();
  }

  function recordCycle(total) {
    state.history.push(total);
    if (state.history.length > 20) state.history.shift();
    sessionStorage.setItem("st_history", JSON.stringify(state.history));
    state.cloudRecords++;
    sessionStorage.setItem("st_records", String(state.cloudRecords));
  }

  function loadModel() {
    if (!window.cocoSsd) return Promise.reject(new Error("Vehicle detection model scripts did not load."));
    if (!modelPromise) modelPromise = window.cocoSsd.load().catch((error) => {
      modelPromise = null;
      throw error;
    });
    return modelPromise;
  }

  function classifyVehicles(predictions) {
    const classes = { car: 0, bike: 0, auto: 0, bus: 0, truck: 0, emergency: 0 };
    const vehicleLabels = new Set(["car", "bicycle", "motorcycle", "bus", "truck"]);
    const vehicles = predictions.filter((prediction) => vehicleLabels.has(prediction.class));
    vehicles.forEach(({ class: label }) => {
      if (label === "car") classes.car++;
      else if (label === "bicycle" || label === "motorcycle") classes.bike++;
      else if (label === "bus") classes.bus++;
      else if (label === "truck") classes.truck++;
    });
    return { classes, total: vehicles.length };
  }

  function tick(onUpdate) {
    const signal = state.signal;
    const now = Date.now();
    if (signal.manual) {
      signal.lastTickAt = now;
      return;
    }

    let elapsedSeconds = Math.floor((now - signal.lastTickAt) / 1000);
    if (elapsedSeconds <= 0) return;
    signal.lastTickAt += elapsedSeconds * 1000;

    while (elapsedSeconds > 0) {
      signal.remaining--;
      if (signal.phase === "green") signal.greenElapsed++;
      elapsedSeconds--;

      if (signal.remaining > 0) continue;
      if (signal.phase === "green") {
        signal.phase = "yellow";
        signal.remaining = 3;
      } else if (signal.phase === "yellow") {
        signal.active = nextLaneWithDemand(signal.active);
        signal.phase = "green";
        signal.greenElapsed = 0;
        signal.remaining = greenDurationForCount(state.lanes[signal.active].count);
      }
    }

    saveSignal();
    if (onUpdate) onUpdate();
  }

  async function persistResult(result, uid, metadata) {
    if (!uid || typeof db === "undefined") return;
    metadata = metadata || {};
    const trafficDetails = {
      vehicleCount: result.total,
      density: result.overallDensity,
      score: result.score,
      wait: result.wait,
      classes: result.classes,
      lanes: result.lanes,
      signal: JSON.parse(JSON.stringify(state.signal)),
      emergency: result.classes.emergency > 0,
      sourceCount: metadata.sourceCount || 0,
      measuredAt: result.timestamp,
    };
    const userRef = db.collection("users").doc(uid);
    const historyWrite = userRef.collection("detections").add({
      ...trafficDetails,
      total: result.total,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    const latestWrite = userRef.collection("traffic").doc("latest").set({
      ...trafficDetails,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    const profileWrite = userRef.set({
      latestTraffic: trafficDetails,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    const writes = await Promise.allSettled([historyWrite, latestWrite, profileWrite]);
    const failedWrite = writes.find((write) => write.status === "rejected");
    if (failedWrite) {
      const error = failedWrite.reason;
      console.error("Could not store traffic details in Firestore", error);
      window.dispatchEvent(new CustomEvent("traffic:storage-error", { detail: error }));
      return false;
    }
    window.dispatchEvent(new CustomEvent("traffic:stored", { detail: trafficDetails }));
    if (trafficDetails.emergency) {
      userRef.collection("events").add({
        type: "emergency",
        message: "Emergency vehicle detected — signal override issued",
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      }).catch((error) => console.error("Could not store traffic event in Firestore", error));
    }
    return true;
  }

  async function runDetection(mediaEl, opts) {
    opts = opts || {};
    const t0 = performance.now();
    let predictions;
    try {
      const model = await loadModel();
      predictions = await model.detect(mediaEl, 100, 0.45);
    } catch (error) {
      console.error("Vehicle detection failed", error);
      window.dispatchEvent(new CustomEvent("traffic:detection-error", { detail: error }));
      return null;
    }
    const { classes, total } = classifyVehicles(predictions);
    const inf = (performance.now() - t0).toFixed(1);

    if (opts.lane && state.lanes[opts.lane]) {
      state.lanes[opts.lane] = { count: total, density: densityFromCount(total) };
    }

    const overallDensity = densityFromCount(Math.round((total / 4) * 1.3));
    const wait = Math.round(8 + total * 1.6);
    const score = Math.min(100, Math.round(total * 3.1 + (classes.emergency ? 15 : 0)));

    const result = {
      total, classes, inf, overallDensity, wait, score,
      lanes: JSON.parse(JSON.stringify(state.lanes)),
      timestamp: new Date().toISOString(),
    };

    if (opts.uid && opts.persist !== false) await persistResult(result, opts.uid);

    return result;
  }

  return {
    state, DENSITY_LABEL, densityFromCount, greenDurationForCount, updateSignalForCounts,
    setManualMode, setManualSignal, setManualAllRed, recordCycle, tick, runDetection, persistResult, laneOrder,
  };
})();
