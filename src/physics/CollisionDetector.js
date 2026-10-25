/**
 * Hadron Collider — Collision detector (bunch-crossing logic at IP1)
 *
 * When the Accelerator halts the beams exactly at an armed IP1 crossing, this
 * module decides whether the two lead protons collide and, if so, prepares
 * the collision record handed to the event generator.
 *
 * GEOMETRIC TEST
 *   The actual 3D distance between the two Particle objects is compared with
 *   the beam size at the interaction point, σ* = √(ε_N β* / γ) ≈ 12 µm at
 *   6.8 TeV with β* = 0.3 m. Beams still separated by the 1 mm crossing bump
 *   miss each other; head-on beams collide.
 *
 * KINEMATIC TEST
 *   The collision energy is computed from the protons' own four-momenta:
 *     s = (p₁ + p₂)²,   √s = invariant mass of the two-proton system.
 *   Head-on beams must have near-zero total momentum; any imbalance would
 *   indicate a bug, so it is checked explicitly.
 *
 * LUMINOUS REGION
 *   Bunches are ~7.55 cm long (rms). Two Gaussian bunches crossing head-on
 *   produce collisions distributed along z with σ_z = σ_bunch / √2 ≈ 5.3 cm,
 *   centred on the IP. Transverse vertex spread is ~σ* / √2 (micrometres).
 */
import { PHYSICS } from '../config/constants.js';
import { bus, EVENTS } from '../core/EventBus.js';
import { FourVector } from './FourVector.js';

/** Design rms bunch length (m). */
const BUNCH_LENGTH_RMS = 0.0755;

/** Total transverse momentum allowed for a "head-on" pair, relative to √s. */
const MOMENTUM_BALANCE_TOLERANCE = 1e-6;

/** Standard normal deviate (Box–Muller transform). */
function gaussian(random) {
  let u = 0;
  while (u === 0) u = random(); // avoid log(0)
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * @typedef {object} CollisionRecord
 * @property {number} time                     physics time of the collision (s)
 * @property {{x:number,y:number,z:number}} vertex  primary vertex (m)
 * @property {[import('./Particle.js').Particle, import('./Particle.js').Particle]} protons
 * @property {FourVector} initialState         p₁ + p₂
 * @property {number} sqrtS                    collision energy (GeV)
 * @property {number} separation               transverse separation at IP (m)
 * @property {number} sigma                    beam size σ* at IP (m)
 * @property {number} crossing                 bunch-crossing number
 */

export class CollisionDetector {
  #random;
  #collisions = 0;
  #misses = 0;

  /** @param {{ random?: () => number }} [options] */
  constructor({ random = Math.random } = {}) {
    this.#random = random;
  }

  /**
   * Evaluate an armed bunch crossing reported by Accelerator.update().
   *
   * @param {import('./Accelerator.js').Accelerator} accelerator
   * @param {{ crossing: boolean }} updateResult
   * @returns {CollisionRecord | null}
   */
  process(accelerator, updateResult) {
    if (!updateResult?.crossing) return null;

    const crossing = accelerator.crossings;
    bus.emit(EVENTS.BUNCH_CROSSING, { crossing, simTime: accelerator.time });

    const [beam1, beam2] = accelerator.beams;
    if (!beam1?.particle || !beam2?.particle) return null;

    // ---------------------------------------------------------------------
    // 1. Geometric test on the real particle positions.
    // ---------------------------------------------------------------------
    const a = beam1.particle.position;
    const b = beam2.particle.position;
    const distance = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    const { sigma, overlapping } = accelerator.overlapAtIP();

    if (!overlapping || distance > 10 * sigma) {
      this.#misses += 1;
      return null;
    }

    // ---------------------------------------------------------------------
    // 2. Kinematic test: build the initial state from the four-momenta.
    // ---------------------------------------------------------------------
    const p1 = beam1.particle.momentum.clone();
    const p2 = beam2.particle.momentum.clone();
    const initialState = p1.add(p2);
    const sqrtS = initialState.mass;

    const imbalance = initialState.p / sqrtS;
    if (!(sqrtS > 0) || imbalance > MOMENTUM_BALANCE_TOLERANCE) {
      bus.emit(EVENTS.ERROR, {
        error: new Error(`Beams not head-on: |Σp⃗|/√s = ${imbalance.toExponential(2)}`),
        context: 'CollisionDetector',
      });
      return null;
    }

    // ---------------------------------------------------------------------
    // 3. Primary vertex inside the luminous region.
    // ---------------------------------------------------------------------
    const sigmaZ = BUNCH_LENGTH_RMS / Math.SQRT2;
    const sigmaT = sigma / Math.SQRT2;
    const vertex = {
      x: (a.x + b.x) / 2 + sigmaT * gaussian(this.#random),
      y: (a.y + b.y) / 2 + sigmaT * gaussian(this.#random),
      z: (a.z + b.z) / 2 + sigmaZ * gaussian(this.#random),
    };

    // The beams are consumed; the bunches keep circulating with new lead protons.
    const { protons, time } = accelerator.consumeCollision();
    this.#collisions += 1;

    return Object.freeze({
      time,
      vertex,
      protons,
      initialState,
      sqrtS,
      separation: distance,
      sigma,
      crossing,
    });
  }

  /** Number of crossings that produced a collision. */
  get collisions() {
    return this.#collisions;
  }

  /** Armed crossings where the beams did not overlap. */
  get misses() {
    return this.#misses;
  }

  /** Proton speed check helper: time for light to cross the luminous region (s). */
  static get luminousRegionCrossingTime() {
    return (2 * BUNCH_LENGTH_RMS) / PHYSICS.SPEED_OF_LIGHT;
  }
}