export const WORLD = {
  width: 320,
  height: 150,
  entityRadius: 12,
  speed: 140,
  controllerBaseX: 140
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function applyInput(position, input) {
  const next = position + (input.direction * WORLD.speed * input.dt / 1000);
  return clamp(next, WORLD.entityRadius, WORLD.width - WORLD.entityRadius);
}

export class LagNetwork {
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

export class Server {
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

export class ControllerClient {
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

export class SimulatorClient {
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
