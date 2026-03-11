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

  if (actor.label) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(29, 26, 24, 0.84)";
    ctx.font = "7px sans-serif";
    ctx.fillText(actor.label, -12, headY - 10);
  }

  ctx.restore();
}

export function drawLane(ctx, title, actors) {
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
