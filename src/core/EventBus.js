/**
 * Hadron Collider — Event bus
 *
 * A small publish/subscribe hub that decouples the physics engine, the
 * renderer, and the user interface. Modules never call each other directly
 * across these boundaries; they emit and listen for named events.
 *
 * Design guarantees
 *   • Event names are declared once in EVENTS. Emitting or subscribing to an
 *     undeclared name throws, so typos fail loudly instead of silently.
 *   • A failing listener is isolated: its error is reported, and the
 *     remaining listeners still run. One bad handler cannot stall the
 *     simulation loop.
 *   • Listeners may unsubscribe themselves (or others) during dispatch safely.
 */

/**
 * Every event in the application, with its payload shape.
 * @readonly
 */
export const EVENTS = Object.freeze({
  /* ----------------------------- User interface ---------------------------- */
  /** { active: boolean } — the "Activate Collider" switch changed. */
  UI_COLLIDER_TOGGLE: 'ui:collider-toggle',

  /** { scale: number } — time-scale multiplier on the physics clock (10⁻⁹ … 1). */
  UI_TIME_SCALE: 'ui:time-scale',

  /** { energy: number } — energy per beam in GeV. */
  UI_BEAM_ENERGY: 'ui:beam-energy',

  /** { enabled: boolean } — rare-process enhancement (teaching aid). */
  UI_RARE_ENHANCE: 'ui:rare-enhance',

  /** { view: 'ring' | 'follow' | 'ip' } — camera mode. */
  UI_CAMERA_VIEW: 'ui:camera-view',

  /* -------------------------------- Machine -------------------------------- */
  /**
   * { state: string, previous: string }
   * States: standby → injecting → ramping → squeezing → colliding → collision
   */
  MACHINE_STATE: 'machine:state',

  /**
   * { beams: Array<{ energy, gamma, beta, turns }>, dipoleField, rfVoltage, simTime }
   * Emitted at a throttled rate for the telemetry panel.
   */
  MACHINE_TELEMETRY: 'machine:telemetry',

  /** { crossing: number, simTime: number } — the two bunches met at IP1. */
  BUNCH_CROSSING: 'machine:bunch-crossing',

  /* --------------------------------- Physics ------------------------------- */
  /** { event: CollisionEvent } — a full collision event was generated. */
  COLLISION: 'physics:collision',

  /* --------------------------------- System -------------------------------- */
  /** { label: string, progress: number (0…1), done: boolean, error?: string } */
  BOOT_STEP: 'system:boot-step',

  /** { error: Error, context: string } — a recoverable runtime error. */
  ERROR: 'system:error',
});

const KNOWN_EVENTS = new Set(Object.values(EVENTS));

function assertKnown(type) {
  if (!KNOWN_EVENTS.has(type)) {
    throw new Error(`EventBus: unknown event "${type}". Declare it in EVENTS first.`);
  }
}

export class EventBus {
  /** @type {Map<string, Set<Function>>} */
  #listeners = new Map();

  /**
   * Subscribe to an event.
   * @param {string} type     one of EVENTS
   * @param {(payload: any) => void} handler
   * @returns {() => void} unsubscribe function
   */
  on(type, handler) {
    assertKnown(type);
    if (typeof handler !== 'function') {
      throw new TypeError(`EventBus: handler for "${type}" must be a function.`);
    }

    let set = this.#listeners.get(type);
    if (!set) {
      set = new Set();
      this.#listeners.set(type, set);
    }
    set.add(handler);

    return () => this.off(type, handler);
  }

  /**
   * Subscribe for a single delivery, then unsubscribe automatically.
   * @returns {() => void} unsubscribe function (if the event never fires)
   */
  once(type, handler) {
    const unsubscribe = this.on(type, (payload) => {
      unsubscribe();
      handler(payload);
    });
    return unsubscribe;
  }

  /** Remove a specific handler. */
  off(type, handler) {
    assertKnown(type);
    const set = this.#listeners.get(type);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) this.#listeners.delete(type);
  }

  /**
   * Deliver a payload to every listener of an event, synchronously.
   * Listeners are snapshotted first, so subscribing or unsubscribing during
   * dispatch affects only future emissions.
   */
  emit(type, payload) {
    assertKnown(type);
    const set = this.#listeners.get(type);
    if (!set || set.size === 0) return;

    for (const handler of [...set]) {
      try {
        handler(payload);
      } catch (error) {
        console.error(`EventBus: listener for "${type}" threw`, error);
        // Report through the bus, but never recurse on ERROR itself.
        if (type !== EVENTS.ERROR) {
          this.emit(EVENTS.ERROR, { error, context: `listener:${type}` });
        }
      }
    }
  }

  /** Number of listeners attached to an event (useful for diagnostics). */
  listenerCount(type) {
    assertKnown(type);
    return this.#listeners.get(type)?.size ?? 0;
  }

  /** Remove every listener (used on teardown and hot-module reload). */
  clear() {
    this.#listeners.clear();
  }
}

/** Shared application-wide bus. */
export const bus = new EventBus();