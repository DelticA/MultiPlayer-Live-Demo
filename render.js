import { WORLD } from "./network.js";

export function drawLane(ctx, title, markers) {
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
