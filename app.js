const WORLD = {
  width: 320,
  height: 150,
  entityRadius: 12,
  speed: 140,
  controllerBaseX: 140
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatMs(value) {
  return `${Math.round(value)} ms`;
}

function formatPx(value) {
  return `${value.toFixed(1)} px`;
}

function applyInput(position, input) {
  const next = position + (input.direction * WORLD.speed * input.dt / 1000);
  return clamp(next, WORLD.entityRadius, WORLD.width - WORLD.entityRadius);
}

class LagNetwork {
  constructor(config) {
    this.latency = config.latency;
    this.jitter = config.jitter;
    this.loss = config.loss;
    this.messages = [];
  }

  setConfig(config) {
    this.latency = config.latency;
    this.jitter = config.jitter;
    this.loss = config.loss;
  }

  send(now, from, to, type, payload) {
    if (Math.random() < this.loss) {
      return;
    }

    const offset = (Math.random() * 2 - 1) * this.jitter;
    const oneWay = Math.max(0, this.latency + offset);

    this.messages.push({
      from,
      to,
      type,
      payload,
      deliveryTime: now + oneWay
    });
  }

  receive(now, recipient) {
    const delivered = [];
    const pending = [];

    for (const message of this.messages) {
      if (message.to === recipient && message.deliveryTime <= now) {
        delivered.push(message);
      } else {
        pending.push(message);
      }
    }

    delivered.sort((a, b) => a.deliveryTime - b.deliveryTime);
    this.messages = pending;
    return delivered;
  }
}

class Server {
  constructor(network) {
    this.network = network;
    this.time = 0;
    this.position = WORLD.controllerBaseX;
    this.lastProcessedInput = 0;
    this.inputBacklog = [];
    this.snapshotAccumulator = 0;
    this.snapshotInterval = 100;
  }

  setSnapshotRate(rate) {
    this.snapshotInterval = 1000 / rate;
  }

  tick(dt, now) {
    this.time += dt;

    const incoming = this.network.receive(now, "server");
    for (const message of incoming) {
      if (message.type === "input") {
        this.inputBacklog.push(message.payload);
      }
    }

    this.inputBacklog.sort((a, b) => a.sequence - b.sequence);
    while (this.inputBacklog.length > 0) {
      const input = this.inputBacklog.shift();
      this.position = applyInput(this.position, input);
      this.lastProcessedInput = input.sequence;
    }

    this.snapshotAccumulator += dt;
    while (this.snapshotAccumulator >= this.snapshotInterval) {
      this.snapshotAccumulator -= this.snapshotInterval;
      const snapshot = {
        position: this.position,
        lastProcessedInput: this.lastProcessedInput,
        serverTime: this.time
      };

      this.network.send(now, "server", "controller", "snapshot", snapshot);
      this.network.send(now, "server", "simulator", "snapshot", snapshot);
    }
  }
}

class ControllerClient {
  constructor(network) {
    this.network = network;
    this.predictedPosition = WORLD.controllerBaseX;
    this.serverGhostPosition = WORLD.controllerBaseX;
    this.authoritativePosition = WORLD.controllerBaseX;
    this.pendingInputs = [];
    this.inputSequence = 0;
    this.lastCorrection = 0;
    this.direction = 0;
    this.enableReconciliation = true;
  }

  setDirection(direction) {
    this.direction = direction;
  }

  setReconciliationEnabled(enabled) {
    this.enableReconciliation = enabled;
  }

  sendLocalInput(dt, now) {
    if (this.direction !== 0) {
      const input = {
        sequence: ++this.inputSequence,
        direction: this.direction,
        dt
      };

      this.pendingInputs.push(input);
      this.predictedPosition = applyInput(this.predictedPosition, input);
      this.network.send(now, "controller", "server", "input", input);
    }
  }

  receiveSnapshots(now) {
    const incoming = this.network.receive(now, "controller");
    for (const message of incoming) {
      if (message.type !== "snapshot") {
        continue;
      }

      const snapshot = message.payload;
      this.authoritativePosition = snapshot.position;
      this.serverGhostPosition = snapshot.position;

      const before = this.predictedPosition;

      if (!this.enableReconciliation) {
        this.predictedPosition = snapshot.position;
        this.pendingInputs = this.pendingInputs.filter((input) => input.sequence > snapshot.lastProcessedInput);
        this.lastCorrection = this.predictedPosition - before;
        continue;
      }

      this.pendingInputs = this.pendingInputs.filter((input) => input.sequence > snapshot.lastProcessedInput);

      let replayPosition = snapshot.position;
      for (const input of this.pendingInputs) {
        replayPosition = applyInput(replayPosition, input);
      }

      this.predictedPosition = replayPosition;
      this.lastCorrection = this.predictedPosition - before;
    }
  }
}

class SimulatorClient {
  constructor(network) {
    this.network = network;
    this.buffer = [];
    this.renderPosition = WORLD.controllerBaseX;
    this.interpolationDelay = 180;
    this.newestSnapshotServerTime = 0;
    this.referenceSnapshot = null;
  }

  setInterpolationDelay(delay) {
    this.interpolationDelay = delay;
  }

  receiveSnapshots(now) {
    const incoming = this.network.receive(now, "simulator");
    for (const message of incoming) {
      if (message.type !== "snapshot") {
        continue;
      }

      const entry = {
        position: message.payload.position,
        serverTime: message.payload.serverTime,
        receiveTime: now
      };
      this.buffer.push(entry);
      this.buffer.sort((a, b) => a.serverTime - b.serverTime);
      this.newestSnapshotServerTime = Math.max(this.newestSnapshotServerTime, entry.serverTime);
      this.referenceSnapshot = entry;
    }
  }

  updateRenderPosition(now) {
    if (this.buffer.length === 0 || !this.referenceSnapshot) {
      return;
    }

    const estimatedServerTime = this.referenceSnapshot.serverTime + (now - this.referenceSnapshot.receiveTime);
    const renderTime = estimatedServerTime - this.interpolationDelay;

    while (this.buffer.length >= 2 && this.buffer[1].serverTime <= renderTime) {
      this.buffer.shift();
    }

    if (this.buffer.length >= 2) {
      const left = this.buffer[0];
      const right = this.buffer[1];
      const span = right.serverTime - left.serverTime || 1;
      const t = clamp((renderTime - left.serverTime) / span, 0, 1);
      this.renderPosition = left.position + (right.position - left.position) * t;
    } else {
      this.renderPosition = this.buffer[0].position;
    }
  }
}

function drawLane(ctx, title, markers) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.save();
  ctx.scale(ctx.canvas.width / WORLD.width, ctx.canvas.height / WORLD.height);

  ctx.fillStyle = "#faf6f0";
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);

  for (let x = 16; x < WORLD.width; x += 32) {
    ctx.strokeStyle = "rgba(88, 66, 44, 0.12)";
    ctx.beginPath();
    ctx.moveTo(x, 18);
    ctx.lineTo(x, WORLD.height - 18);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(29, 26, 24, 0.55)";
  ctx.font = "8px sans-serif";
  ctx.fillText(title, 12, 12);

  ctx.strokeStyle = "rgba(88, 66, 44, 0.20)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(WORLD.entityRadius, WORLD.height / 2);
  ctx.lineTo(WORLD.width - WORLD.entityRadius, WORLD.height / 2);
  ctx.stroke();

  for (const marker of markers) {
    ctx.globalAlpha = marker.alpha ?? 1;
    ctx.fillStyle = marker.color;
    ctx.beginPath();
    ctx.arc(marker.x, WORLD.height / 2, marker.radius ?? WORLD.entityRadius, 0, Math.PI * 2);
    ctx.fill();

    if (marker.label) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(29, 26, 24, 0.84)";
      ctx.font = "7px sans-serif";
      ctx.fillText(marker.label, marker.x - 10, WORLD.height / 2 - 18);
    }
  }

  ctx.restore();
}

function resizeCanvas(ctx) {
  const dpr = window.devicePixelRatio || 1;
  const rect = ctx.canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));

  if (ctx.canvas.width !== width || ctx.canvas.height !== height) {
    ctx.canvas.width = width;
    ctx.canvas.height = height;
  }
}

const refs = {
  latency: document.getElementById("latency"),
  latencyValue: document.getElementById("latencyValue"),
  jitter: document.getElementById("jitter"),
  jitterValue: document.getElementById("jitterValue"),
  loss: document.getElementById("loss"),
  lossValue: document.getElementById("lossValue"),
  snapshotRate: document.getElementById("snapshotRate"),
  snapshotRateValue: document.getElementById("snapshotRateValue"),
  interpDelay: document.getElementById("interpDelay"),
  interpDelayValue: document.getElementById("interpDelayValue"),
  showGhost: document.getElementById("showGhost"),
  enableReconciliation: document.getElementById("enableReconciliation"),
  statusLine: document.getElementById("statusLine"),
  networkLine: document.getElementById("networkLine"),
  serverTimeStat: document.getElementById("serverTimeStat"),
  serverAckStat: document.getElementById("serverAckStat"),
  serverPositionStat: document.getElementById("serverPositionStat"),
  serverQueueStat: document.getElementById("serverQueueStat"),
  controllerPredictedStat: document.getElementById("controllerPredictedStat"),
  controllerGhostStat: document.getElementById("controllerGhostStat"),
  controllerPendingStat: document.getElementById("controllerPendingStat"),
  controllerCorrectionStat: document.getElementById("controllerCorrectionStat"),
  simRenderedStat: document.getElementById("simRenderedStat"),
  simSnapshotStat: document.getElementById("simSnapshotStat"),
  simBufferStat: document.getElementById("simBufferStat"),
  simDelayStat: document.getElementById("simDelayStat"),
  serverCanvas: document.getElementById("serverCanvas").getContext("2d"),
  controllerCanvas: document.getElementById("controllerCanvas").getContext("2d"),
  simCanvas: document.getElementById("simCanvas").getContext("2d")
};

const network = new LagNetwork({
  latency: Number(refs.latency.value),
  jitter: Number(refs.jitter.value),
  loss: Number(refs.loss.value) / 100
});
const server = new Server(network);
const controller = new ControllerClient(network);
const simulator = new SimulatorClient(network);

function resizeCanvases() {
  resizeCanvas(refs.serverCanvas);
  resizeCanvas(refs.controllerCanvas);
  resizeCanvas(refs.simCanvas);
  render();
}

function syncControlLabels() {
  refs.latencyValue.textContent = `${refs.latency.value} ms`;
  refs.jitterValue.textContent = `${refs.jitter.value} ms`;
  refs.lossValue.textContent = `${refs.loss.value}%`;
  refs.snapshotRateValue.textContent = `${refs.snapshotRate.value} Hz`;
  refs.interpDelayValue.textContent = `${refs.interpDelay.value} ms`;

  network.setConfig({
    latency: Number(refs.latency.value),
    jitter: Number(refs.jitter.value),
    loss: Number(refs.loss.value) / 100
  });
  server.setSnapshotRate(Number(refs.snapshotRate.value));
  simulator.setInterpolationDelay(Number(refs.interpDelay.value));
  controller.setReconciliationEnabled(refs.enableReconciliation.checked);
}

for (const input of [refs.latency, refs.jitter, refs.loss, refs.snapshotRate, refs.interpDelay, refs.enableReconciliation]) {
  input.addEventListener("input", syncControlLabels);
  input.addEventListener("change", syncControlLabels);
}
syncControlLabels();

const keys = new Set();

function updateDirection() {
  const left = keys.has("ArrowLeft") || keys.has("KeyA");
  const right = keys.has("ArrowRight") || keys.has("KeyD");
  controller.setDirection((right ? 1 : 0) + (left ? -1 : 0));
}

window.addEventListener("keydown", (event) => {
  if (["ArrowLeft", "ArrowRight", "KeyA", "KeyD"].includes(event.code)) {
    event.preventDefault();
    keys.add(event.code);
    updateDirection();
  }
});

window.addEventListener("keyup", (event) => {
  if (["ArrowLeft", "ArrowRight", "KeyA", "KeyD"].includes(event.code)) {
    keys.delete(event.code);
    updateDirection();
  }
});

let previousFrame = performance.now();
let nowMs = 0;

function updateStats() {
  refs.serverTimeStat.textContent = formatMs(server.time);
  refs.serverAckStat.textContent = String(server.lastProcessedInput);
  refs.serverPositionStat.textContent = formatPx(server.position);
  refs.serverQueueStat.textContent = String(server.inputBacklog.length);

  refs.controllerPredictedStat.textContent = formatPx(controller.predictedPosition);
  refs.controllerGhostStat.textContent = formatPx(controller.serverGhostPosition);
  refs.controllerPendingStat.textContent = String(controller.pendingInputs.length);
  refs.controllerCorrectionStat.textContent = `${controller.lastCorrection >= 0 ? "+" : ""}${controller.lastCorrection.toFixed(1)} px`;

  refs.simRenderedStat.textContent = formatPx(simulator.renderPosition);
  refs.simSnapshotStat.textContent = formatMs(simulator.newestSnapshotServerTime);
  refs.simBufferStat.textContent = String(simulator.buffer.length);
  refs.simDelayStat.textContent = `${refs.interpDelay.value} ms`;

  const directionText =
    controller.direction < 0 ? "向左输入持续中" :
    controller.direction > 0 ? "向右输入持续中" :
    "等待输入。按住 A / D 或左右方向键移动实体。";

  refs.statusLine.textContent =
    `${directionText} 主控领先服务器 ${Math.abs(controller.predictedPosition - controller.serverGhostPosition).toFixed(1)} px。`;
  refs.networkLine.textContent = `队列中消息 ${network.messages.length} 条，延迟 ${refs.latency.value} ms，抖动 ${refs.jitter.value} ms，丢包 ${refs.loss.value}%`;
}

function render() {
  drawLane(refs.serverCanvas, "server authoritative lane", [
    { x: server.position, color: "#0f766e", label: "authoritative" }
  ]);

  const controllerMarkers = [
    { x: controller.predictedPosition, color: "#111827", label: "predicted" }
  ];

  if (refs.showGhost.checked) {
    controllerMarkers.push({
      x: controller.serverGhostPosition,
      color: "#7c3aed",
      alpha: 0.6,
      radius: 10,
      label: "server"
    });
  }

  drawLane(refs.controllerCanvas, "controller prediction lane", controllerMarkers);

  drawLane(refs.simCanvas, "simulator interpolation lane", [
    { x: simulator.renderPosition, color: "#2563eb", label: "interpolated" }
  ]);
}

function frame(currentTime) {
  const dt = Math.min(currentTime - previousFrame, 50);
  previousFrame = currentTime;
  nowMs += dt;

  controller.sendLocalInput(dt, nowMs);
  server.tick(dt, nowMs);
  controller.receiveSnapshots(nowMs);
  simulator.receiveSnapshots(nowMs);
  simulator.updateRenderPosition(nowMs);

  updateStats();
  render();
  requestAnimationFrame(frame);
}

window.addEventListener("resize", resizeCanvases);
resizeCanvases();
requestAnimationFrame(frame);
