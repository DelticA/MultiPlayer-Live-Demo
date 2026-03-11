import {
  LagNetwork,
  Server,
  ControllerClient,
  SimulatorClient
} from "./network.js";
import { drawLane, resizeCanvases } from "./render.js";

function formatMs(value) {
  return `${Math.round(value)} ms`;
}

function formatPx(value) {
  return `${value.toFixed(1)} px`;
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

const renderContexts = [refs.serverCanvas, refs.controllerCanvas, refs.simCanvas];
const keys = new Set();

let previousFrame = performance.now();
let nowMs = 0;

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

function updateDirection() {
  const left = keys.has("ArrowLeft") || keys.has("KeyA");
  const right = keys.has("ArrowRight") || keys.has("KeyD");
  controller.setDirection((right ? 1 : 0) + (left ? -1 : 0));
}

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

for (const input of [refs.latency, refs.jitter, refs.loss, refs.snapshotRate, refs.interpDelay, refs.enableReconciliation]) {
  input.addEventListener("input", syncControlLabels);
  input.addEventListener("change", syncControlLabels);
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

window.addEventListener("resize", () => resizeCanvases(renderContexts, render));

syncControlLabels();
resizeCanvases(renderContexts, render);
requestAnimationFrame(frame);
