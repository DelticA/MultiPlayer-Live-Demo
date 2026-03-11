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

export function createCharacterState(overrides = {}) {
  return {
    x: WORLD.controllerBaseX,
    crouchAmount: 0,
    facing: 1,
    moveDirection: 0,
    ...overrides
  };
}

export function copyCharacterState(state) {
  return { ...state };
}

export function getCharacterPose(state) {
  if (state.crouchAmount >= 0.5) {
    return "crouch";
  }

  if (state.moveDirection !== 0) {
    return "walk";
  }

  return "idle";
}

export function applyInput(state, input) {
  const facing = input.direction !== 0 ? Math.sign(input.direction) : state.facing;
  const crouchAmount = input.crouching ? 1 : 0;
  const moveDirection = input.crouching ? 0 : input.direction;
  const next = state.x + (moveDirection * WORLD.speed * input.dt / 1000);

  return {
    x: clamp(next, WORLD.entityRadius, WORLD.width - WORLD.entityRadius),
    crouchAmount,
    facing,
    moveDirection
  };
}

export function interpolateCharacterState(left, right, t) {
  return {
    x: left.x + (right.x - left.x) * t,
    crouchAmount: left.crouchAmount + (right.crouchAmount - left.crouchAmount) * t,
    facing: t < 0.5 ? left.facing : right.facing,
    moveDirection: t < 0.5 ? left.moveDirection : right.moveDirection
  };
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
    this.character = createCharacterState();
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
      this.character = applyInput(this.character, input);
      this.lastProcessedInput = input.sequence;
    }

    this.snapshotAccumulator += dt;
    while (this.snapshotAccumulator >= this.snapshotInterval) {
      this.snapshotAccumulator -= this.snapshotInterval;
      const snapshot = {
        character: copyCharacterState(this.character),
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
    this.predictedState = createCharacterState();
    this.serverGhostState = createCharacterState();
    this.authoritativeState = createCharacterState();
    this.pendingInputs = [];
    this.inputSequence = 0;
    this.lastCorrection = 0;
    this.direction = 0;
    this.crouching = false;
    this.enableReconciliation = true;
    this.lastSentDirection = 0;
    this.lastSentCrouching = false;
  }

  setDirection(direction) {
    this.direction = direction;
  }

  setCrouching(crouching) {
    this.crouching = crouching;
  }

  setReconciliationEnabled(enabled) {
    this.enableReconciliation = enabled;
  }

  sendLocalInput(dt, now) {
    const stateChanged =
      this.direction !== this.lastSentDirection ||
      this.crouching !== this.lastSentCrouching;
    const active = this.direction !== 0 || this.crouching;

    if (active || stateChanged) {
      const input = {
        sequence: ++this.inputSequence,
        direction: this.direction,
        crouching: this.crouching,
        dt
      };

      this.pendingInputs.push(input);
      this.predictedState = applyInput(this.predictedState, input);
      this.network.send(now, "controller", "server", "input", input);
      this.lastSentDirection = this.direction;
      this.lastSentCrouching = this.crouching;
    }
  }

  receiveSnapshots(now) {
    const incoming = this.network.receive(now, "controller");
    for (const message of incoming) {
      if (message.type !== "snapshot") {
        continue;
      }

      const snapshot = message.payload;
      this.authoritativeState = copyCharacterState(snapshot.character);
      this.serverGhostState = copyCharacterState(snapshot.character);

      const before = this.predictedState.x;

      if (!this.enableReconciliation) {
        this.predictedState = copyCharacterState(snapshot.character);
        this.pendingInputs = this.pendingInputs.filter((input) => input.sequence > snapshot.lastProcessedInput);
        this.lastCorrection = this.predictedState.x - before;
        continue;
      }

      this.pendingInputs = this.pendingInputs.filter((input) => input.sequence > snapshot.lastProcessedInput);

      let replayState = copyCharacterState(snapshot.character);
      for (const input of this.pendingInputs) {
        replayState = applyInput(replayState, input);
      }

      this.predictedState = replayState;
      this.lastCorrection = this.predictedState.x - before;
    }
  }
}

export class SimulatorClient {
  constructor(network) {
    this.network = network;
    this.buffer = [];
    this.renderState = createCharacterState();
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
        character: copyCharacterState(message.payload.character),
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
      this.renderState = interpolateCharacterState(left.character, right.character, t);
    } else {
      this.renderState = copyCharacterState(this.buffer[0].character);
    }
  }
}
