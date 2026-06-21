import { WORLD } from "./network.js";

function drawActor(ctx, actor, groundY) {
  const state = actor.state;
  const crouchLift = state.crouchAmount * 10;
  const bodyHeight = 20 - state.crouchAmount * 6;
  const hipY = groundY - 16 + crouchLift;
  const shoulderY = hipY - bodyHeight;
  const headY = shoulderY - 10;
  const walkBlend = state.crouchAmount >= 0.5 ? 0 : Math.abs(state.moveDirection);
  const swing = Math.sin(actor.phase * 0.012) * 6 * walkBlend;
  const armSwing = Math.sin(actor.phase * 0.012 + Math.PI / 2) * 5 * walkBlend;
  const facing = state.facing || 1;

  ctx.save();
  ctx.translate(actor.x, 0);
  ctx.globalAlpha = actor.alpha ?? 1;
  ctx.strokeStyle = actor.color;
  ctx.fillStyle = actor.color;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";

  ctx.fillStyle = "rgba(29, 26, 24, 0.08)";
  ctx.beginPath();
  ctx.ellipse(0, groundY + 4, 12, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = actor.color;
  ctx.beginPath();
  ctx.arc(0, headY, 5.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = actor.color;
  ctx.beginPath();
  ctx.moveTo(0, shoulderY);
  ctx.lineTo(0, hipY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, shoulderY + 4);
  ctx.lineTo(8 * facing + armSwing, shoulderY + 8);
  ctx.moveTo(0, shoulderY + 4);
  ctx.lineTo(-8 * facing - armSwing, shoulderY + 7);
  ctx.stroke();

  const legLeftX = -4 + swing;
  const legRightX = 4 - swing;
  const kneeY = hipY + 10 - state.crouchAmount * 3;

  ctx.beginPath();
  ctx.moveTo(0, hipY);
  ctx.lineTo(legLeftX, kneeY);
  ctx.lineTo(-6, groundY);
  ctx.moveTo(0, hipY);
  ctx.lineTo(legRightX, kneeY);
  ctx.lineTo(6, groundY);
  ctx.stroke();

  ctx.restore();
}

function getActorLabelY(state, groundY) {
  const crouchLift = state.crouchAmount * 10;
  const bodyHeight = 20 - state.crouchAmount * 6;
  const hipY = groundY - 16 + crouchLift;
  const shoulderY = hipY - bodyHeight;
  return shoulderY - 22;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function eventSeriesKey(event) {
  if (event.type === "input") {
    return event.kind === "send" ? "predicted" : "server";
  }

  if (event.type === "snapshot") {
    if (event.kind === "send") {
      return "server";
    }

    if (event.to === "controller") {
      return "ghost";
    }

    if (event.to === "simulator") {
      return "simulator";
    }
  }

  return null;
}

function findNearestSample(samples, time) {
  if (samples.length === 0) {
    return null;
  }

  let nearest = samples[0];
  let bestDistance = Math.abs(nearest.time - time);

  for (let i = 1; i < samples.length; i += 1) {
    const distance = Math.abs(samples[i].time - time);
    if (distance < bestDistance) {
      nearest = samples[i];
      bestDistance = distance;
    }
  }

  return nearest;
}

export function drawLane(ctx, title, actors) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.fillStyle = "#faf6f0";
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  const scale = Math.min(ctx.canvas.width / WORLD.width, ctx.canvas.height / WORLD.height);
  const offsetX = (ctx.canvas.width - WORLD.width * scale) / 2;
  const offsetY = (ctx.canvas.height - WORLD.height * scale) / 2;

  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);

  ctx.fillStyle = "#faf6f0";
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);

  for (let x = 16; x < WORLD.width; x += 32) {
    ctx.strokeStyle = "rgba(88, 66, 44, 0.12)";
    ctx.beginPath();
    ctx.moveTo(x, 18);
    ctx.lineTo(x, WORLD.height - 18);
    ctx.stroke();
  }

  const groundY = WORLD.height / 2 + 18;
  ctx.strokeStyle = "rgba(88, 66, 44, 0.20)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(WORLD.entityRadius, groundY);
  ctx.lineTo(WORLD.width - WORLD.entityRadius, groundY);
  ctx.stroke();

  for (const actor of actors) {
    drawActor(ctx, actor, groundY);
  }

  ctx.restore();

  const rect = ctx.canvas.getBoundingClientRect();
  const dpr = rect.width > 0 ? ctx.canvas.width / rect.width : 1;

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.fillStyle = "rgba(29, 26, 24, 0.58)";
  ctx.font = "600 10px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(title, 10, 8);

  ctx.fillStyle = "rgba(29, 26, 24, 0.84)";
  ctx.font = "600 9px sans-serif";
  ctx.textAlign = "center";
  for (const actor of actors) {
    if (!actor.label) {
      continue;
    }

    const labelX = (offsetX + actor.x * scale) / dpr;
    const labelY = (offsetY + getActorLabelY(actor.state, groundY) * scale) / dpr;
    ctx.fillText(actor.label, labelX, labelY);
  }
  ctx.restore();
}

export function drawPositionChart(ctx, samples, events, now, windowMs = 10000, options = {}) {
  const rect = ctx.canvas.getBoundingClientRect();
  const dpr = rect.width > 0 ? ctx.canvas.width / rect.width : 1;
  const width = rect.width || ctx.canvas.width;
  const height = rect.height || ctx.canvas.height;
  const startTime = now - windowMs;
  const visibleSamples = samples.filter((sample) => sample.time >= startTime);
  const visibleEvents = events.filter((event) => event.time >= startTime && event.time <= now);
  const plot = {
    left: 38,
    right: width - 12,
    top: 20,
    bottom: height - 28
  };
  const plotWidth = Math.max(1, plot.right - plot.left);
  const plotHeight = Math.max(1, plot.bottom - plot.top);
  const yMin = 0;
  const yMax = WORLD.width;
  const visibleSeries = options.visibleSeries ?? {};
  const series = [
    { key: "server", label: "Server", color: "#0f766e" },
    { key: "predicted", label: "Predicted", color: "#111827" },
    { key: "ghost", label: "Ghost", color: "#7c3aed" },
    { key: "simulator", label: "Simulator", color: "#2563eb" }
  ].filter((item) => visibleSeries[item.key] !== false);
  const xForTime = (time) => plot.left + ((time - startTime) / windowMs) * plotWidth;
  const yForValue = (value) => {
    const t = (clamp(value, yMin, yMax) - yMin) / (yMax - yMin);
    return plot.bottom - t * plotHeight;
  };

  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.save();
  ctx.scale(dpr, dpr);

  ctx.fillStyle = "#faf6f0";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(88, 66, 44, 0.16)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= 4; i += 1) {
    const x = plot.left + (plotWidth * i) / 4;
    ctx.moveTo(x, plot.top);
    ctx.lineTo(x, plot.bottom);
  }
  for (let i = 0; i <= 4; i += 1) {
    const y = plot.top + (plotHeight * i) / 4;
    ctx.moveTo(plot.left, y);
    ctx.lineTo(plot.right, y);
  }
  ctx.stroke();

  ctx.strokeStyle = "rgba(29, 26, 24, 0.28)";
  ctx.beginPath();
  ctx.moveTo(plot.left, plot.top);
  ctx.lineTo(plot.left, plot.bottom);
  ctx.lineTo(plot.right, plot.bottom);
  ctx.stroke();

  ctx.fillStyle = "rgba(29, 26, 24, 0.62)";
  ctx.font = "600 10px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("Position over time", 10, 7);

  ctx.font = "9px sans-serif";
  ctx.fillStyle = "rgba(29, 26, 24, 0.52)";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (const value of [0, 160, 320]) {
    ctx.fillText(`${value}px`, plot.left - 6, yForValue(value));
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(`-${Math.round(windowMs / 1000)}s`, plot.left, plot.bottom + 8);
  ctx.fillText(`-${(windowMs / 2000).toFixed(1)}s`, plot.left + plotWidth / 2, plot.bottom + 8);
  ctx.fillText("now", plot.right, plot.bottom + 8);

  for (const item of series) {
    ctx.strokeStyle = item.color;
    ctx.lineWidth = item.key === "ghost" ? 1.5 : 2;
    ctx.globalAlpha = item.key === "ghost" ? 0.72 : 0.95;
    ctx.beginPath();

    let drew = false;
    for (const sample of visibleSamples) {
      const x = xForTime(sample.time);
      const y = yForValue(sample[item.key]);
      if (!drew) {
        ctx.moveTo(x, y);
        drew = true;
      } else {
        ctx.lineTo(x, y);
      }
    }

    if (drew) {
      ctx.stroke();
    }
  }

  ctx.globalAlpha = 1;
  for (const event of visibleEvents.slice(-700)) {
    const key = eventSeriesKey(event);
    if (!key) {
      continue;
    }

    const sample = findNearestSample(visibleSamples, event.time);
    if (!sample || sample[key] === undefined) {
      continue;
    }

    const item = series.find((candidate) => candidate.key === key);
    if (!item) {
      continue;
    }

    const x = xForTime(event.time);
    const y = yForValue(sample[key]);
    const radius = event.kind === "send" ? 2.1 : 2.6;

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = event.kind === "receive" ? "rgba(255, 251, 245, 0.94)" : "rgba(255, 251, 245, 0.30)";
    ctx.strokeStyle = event.dropped ? "#d97706" : item.color;
    ctx.lineWidth = event.kind === "receive" ? 1.25 : 1;
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

export function resizeCanvas(ctx) {
  const dpr = window.devicePixelRatio || 1;
  const rect = ctx.canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));

  if (ctx.canvas.width !== width || ctx.canvas.height !== height) {
    ctx.canvas.width = width;
    ctx.canvas.height = height;
  }
}

export function resizeCanvases(contexts, render) {
  for (const ctx of contexts) {
    resizeCanvas(ctx);
  }
  render();
}
