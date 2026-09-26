// ============================================================
// SHARED DETECTION / SIGNAL ENGINE
// Simulated computer-vision pipeline: takes a real <img>/<video>
// frame, samples pixel activity across a grid, and derives a
// plausible vehicle count + class mix from it. Swap this module
// for real calls to a YOLOv8 backend endpoint in production.
// ============================================================

const TrafficEngine = (function () {
  const state = {
    lanes: { N: { count: 0, density: "low" }, S: { count: 0, density: "low" }, E: { count: 0, density: "low" }, W: { count: 0, density: "low" } },
    signal: { active: "N", phase: "green", remaining: 18, manual: false },
    history: JSON.parse(sessionStorage.getItem("st_history") || "[]"),
    cloudRecords: parseInt(sessionStorage.getItem("st_records") || "0", 10),
  };
  const laneOrder = ["N", "E", "S", "W"];
  let laneIdx = 0;
  const DENSITY_LABEL = { low: "Low", med: "Medium", high: "High", vhigh: "Very high" };

  function densityFromCount(c) {
    if (c <= 4) return "low";
    if (c <= 9) return "med";
    if (c <= 15) return "high";
    return "vhigh";
  }

  function analyzeImageData(ctx, w, h) {
    const cellsX = 6, cellsY = 4;
    const cw = w / cellsX, ch = h / cellsY;
    let activityCells = 0, totalVariance = 0;
    for (let cy = 0; cy < cellsY; cy++) {
      for (let cx = 0; cx < cellsX; cx++) {
        const data = ctx.getImageData(cx * cw, cy * ch, Math.max(1, cw | 0), Math.max(1, ch | 0)).data;
        let sum = 0, sumSq = 0, n = 0;
        for (let i = 0; i < data.length; i += 16) {
          const lum = 0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2];
          sum += lum; sumSq += lum * lum; n++;
        }
        const mean = sum / n;
        const variance = sumSq / n - mean * mean;
        totalVariance += variance;
        if (variance > 350) activityCells++;
      }
    }
    const rand = (seed) => { const x = Math.sin(seed * 99.13 + totalVariance) * 10000; return x - Math.floor(x); };
    const vehicleEstimate = Math.max(1, Math.round(activityCells * 1.4 + rand(1) * 3));
    return { activityCells, totalVariance, vehicleEstimate, rand };
  }

  function classifyVehicles(estimate, rand) {
    let car = 0, bike = 0, auto = 0, bus = 0, truck = 0, emergency = 0;
    for (let i = 0; i < estimate; i++) {
      const r = rand(i + 7);
      if (r < 0.55) car++;
      else if (r < 0.72) bike++;
      else if (r < 0.85) auto++;
      else if (r < 0.94) truck++;
      else if (r < 0.985) bus++;
      else emergency++;
    }
    return { car, bike, auto, bus, truck, emergency };
  }

  function tick(onUpdate) {
    if (state.signal.manual) return;
    state.signal.remaining--;
    if (state.signal.remaining <= 0) {
      if (state.signal.phase === "green") {
        state.signal.phase = "yellow"; state.signal.remaining = 3;
      } else if (state.signal.phase === "yellow") {
        laneIdx = (laneIdx + 1) % 4;
        state.signal.active = laneOrder[laneIdx];
        state.signal.phase = "green";
        const d = state.lanes[state.signal.active].density;
        state.signal.remaining = { low: 18, med: 24, high: 32, vhigh: 40 }[d];
      }
    }
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
    const off = document.createElement("canvas");
    off.width = 160; off.height = 90;
    const octx = off.getContext("2d", { willReadFrequently: true });
    try { octx.drawImage(mediaEl, 0, 0, off.width, off.height); } catch (e) {}
    const t0 = performance.now();
    const { vehicleEstimate, rand } = analyzeImageData(octx, off.width, off.height);
    const classes = classifyVehicles(vehicleEstimate, rand);
    const inf = (performance.now() - t0).toFixed(1);

    const total = vehicleEstimate;
    if (opts.lane && state.lanes[opts.lane]) {
      state.lanes[opts.lane] = { count: total, density: densityFromCount(total) };
    } else {
      const split = [0.32, 0.28, 0.22, 0.18].sort(() => rand(99) - 0.5);
      laneOrder.forEach((l, i) => {
        const c = Math.max(0, Math.round(total * split[i]));
        state.lanes[l] = { count: c, density: densityFromCount(c) };
      });
    }

    const overallDensity = densityFromCount(Math.round((total / 4) * 1.3));
    const wait = Math.round(8 + total * 1.6);
    const score = Math.min(100, Math.round(total * 3.1 + (classes.emergency ? 15 : 0)));

    if (classes.emergency > 0) {
      // Emergency vehicle always wins, regardless of manual mode
      state.signal.manual = false;
      state.signal.active = laneOrder[Math.floor(rand(3) * 4)];
      state.signal.phase = "green"; state.signal.remaining = 25;
    } else if (!state.signal.manual) {
      // Adaptive decision: give green to whichever lane has the heaviest traffic
      let busiestLane = laneOrder[0];
      laneOrder.forEach((l) => {
        if (state.lanes[l].count > state.lanes[busiestLane].count) busiestLane = l;
      });
      const busiestDensity = state.lanes[busiestLane].density;
      const greenDuration = { low: 18, med: 24, high: 32, vhigh: 40 }[busiestDensity];

      if (state.signal.active !== busiestLane) {
        // switch lanes: brief yellow caution before the new lane gets green
        state.signal.active = busiestLane;
        state.signal.phase = "yellow";
        state.signal.remaining = 3;
      } else {
        // same lane still busiest — extend/refresh its green to match current density
        state.signal.phase = "green";
        state.signal.remaining = greenDuration;
      }
    }

    state.history.push(total);
    if (state.history.length > 20) state.history.shift();
    sessionStorage.setItem("st_history", JSON.stringify(state.history));

    state.cloudRecords++;
    sessionStorage.setItem("st_records", String(state.cloudRecords));

    const result = {
      total, classes, inf, overallDensity, wait, score,
      lanes: JSON.parse(JSON.stringify(state.lanes)),
      timestamp: new Date().toISOString(),
    };

    if (opts.uid && opts.persist !== false) persistResult(result, opts.uid);

    return result;
  }

  return {
    state, DENSITY_LABEL, densityFromCount, tick, runDetection, persistResult, laneOrder,
  };
})();
