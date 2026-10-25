/**
 * Hadron Collider — Particle
 *
 * A single particle instance: identity, four-momentum, position, history.
 * Used for both the circulating beam protons and every particle produced in
 * a collision.
 *
 * LIFETIME SAMPLING
 *   Radioactive decay is memoryless: the proper time until decay follows
 *     P(τ) = (1/τ₀) e^(−τ/τ₀),
 *   sampled by inversion as τ = −τ₀ ln(1 − u), u uniform on [0, 1).
 *
 * TIME DILATION
 *   In the lab, a particle with Lorentz factor γ lives γτ, and travels a mean
 *   distance βγcτ₀ before decaying. A B meson with cτ₀ ≈ 0.5 mm and γ ≈ 10
 *   flies ~5 mm, producing the displaced vertex used to tag b-quarks.
 *
 * UNITS
 *   position in m, time in s, momentum/energy in GeV (see constants.js).
 */
import { PHYSICS } from '../config/constants.js';
import { getParticle } from '../data/particles.js';
import { hasDecayTable } from '../data/decayModes.js';
import { FourVector } from './FourVector.js';

/** Particle lifecycle states. */
export const STATUS = Object.freeze({
  ALIVE: 'alive',
  DECAYED: 'decayed', // turned into daughter particles
  ABSORBED: 'absorbed', // stopped in a detector layer (calorimeter, etc.)
  ESCAPED: 'escaped', // left the detector volume (incl. neutrinos)
  COLLIDED: 'collided', // a beam proton consumed by the hard collision
});

let nextId = 1;

export class Particle {
  /**
   * @param {object} options
   * @param {number} options.pdg              PDG code (negative for antiparticles)
   * @param {FourVector} options.momentum     four-momentum in the lab frame (GeV)
   * @param {{x:number,y:number,z:number}} [options.position]  creation point (m)
   * @param {number} [options.time]           lab creation time (s)
   * @param {Particle|null} [options.parent]
   */
  constructor({ pdg, momentum, position = { x: 0, y: 0, z: 0 }, time = 0, parent = null }) {
    if (!(momentum instanceof FourVector)) {
      throw new TypeError('Particle: momentum must be a FourVector.');
    }

    this.id = nextId++;
    this.pdg = pdg;
    /** Static properties from the catalog (mass, charge, name, symbol...). */
    this.info = getParticle(pdg);

    this.momentum = momentum;
    this.position = { x: position.x, y: position.y, z: position.z };
    /** Production vertex: where the particle was born. */
    this.origin = Object.freeze({ x: position.x, y: position.y, z: position.z });

    this.creationTime = time;
    this.endTime = Infinity;
    this.status = STATUS.ALIVE;
    /** Detector layer that absorbed the particle, if any. */
    this.absorbedIn = null;

    this.parent = parent;
    /** @type {Particle[]} */
    this.children = [];
    this.generation = parent ? parent.generation + 1 : 0;
    if (parent) parent.children.push(this);

    /** Sampled proper lifetime (s); Infinity if the particle won't decay here. */
    this.properLifetime = Infinity;
    /** Lab-frame time at which the particle decays (s). */
    this.decayTime = Infinity;

    /**
     * Recorded trajectory for rendering: flat [x, y, z, t, x, y, z, t, ...].
     * Filled by the tracker; the first point is the production vertex.
     */
    this.track = [position.x, position.y, position.z, time];
  }

  /* ===========================================================================
     Decay scheduling
     =========================================================================== */

  /**
   * Sample this particle's lifetime from the exponential decay law and
   * schedule its decay time in the lab frame (including time dilation).
   * Particles with no decay table, or infinite lifetime, never decay here.
   *
   * @param {() => number} random  uniform generator on [0, 1)
   * @returns {number} lab-frame decay time (s), or Infinity
   */
  scheduleDecay(random) {
    const tau0 = this.info.lifetime;
    if (!Number.isFinite(tau0) || !hasDecayTable(this.pdg)) {
      this.properLifetime = Infinity;
      this.decayTime = Infinity;
      return Infinity;
    }

    // Inverse-transform sampling; (1 − u) avoids log(0).
    this.properLifetime = -tau0 * Math.log(1 - random());
    this.decayTime = this.creationTime + this.gamma * this.properLifetime;
    return this.decayTime;
  }

  /* ===========================================================================
     Kinematics
     =========================================================================== */

  /** Rest mass (GeV/c²) from the catalog. */
  get mass() {
    return this.info.mass;
  }

  /** Electric charge in units of e. */
  get charge() {
    return this.info.charge3 / 3;
  }

  get isCharged() {
    return this.info.charge3 !== 0;
  }

  get energy() {
    return this.momentum.E;
  }

  /** Lorentz factor γ = E/m (Infinity for massless particles). */
  get gamma() {
    return this.info.mass > 0 ? this.momentum.E / this.info.mass : Infinity;
  }

  get beta() {
    return this.momentum.beta;
  }

  /** Velocity in m/s: v⃗ = β⃗ c. */
  get velocity() {
    const b = this.momentum.betaVector;
    const c = PHYSICS.SPEED_OF_LIGHT;
    return { x: b.x * c, y: b.y * c, z: b.z * c };
  }

  /** Mean lab decay length βγcτ₀ (m). Infinity for stable particles. */
  get meanDecayLength() {
    const tau0 = this.info.lifetime;
    if (!Number.isFinite(tau0) || this.info.mass === 0) return Infinity;
    // βγ = |p| / m
    return (this.momentum.p / this.info.mass) * PHYSICS.SPEED_OF_LIGHT * tau0;
  }

  /** Proper time experienced by the particle at lab time t: τ = (t − t₀)/γ. */
  properTimeAt(labTime) {
    const g = this.gamma;
    return Number.isFinite(g) ? (labTime - this.creationTime) / g : 0;
  }

  /** Distance from the production vertex to the current position (m). */
  get flightDistance() {
    return Math.hypot(
      this.position.x - this.origin.x,
      this.position.y - this.origin.y,
      this.position.z - this.origin.z,
    );
  }

  /** Transverse distance from the beam axis (m). */
  get transverseRadius() {
    return Math.hypot(this.position.x, this.position.y);
  }

  /* ===========================================================================
     Trajectory and lifecycle
     =========================================================================== */

  /** Append the current position to the recorded track. */
  recordPoint(time) {
    this.track.push(this.position.x, this.position.y, this.position.z, time);
  }

  /** Number of recorded track points. */
  get trackLength() {
    return this.track.length / 4;
  }

  get isAlive() {
    return this.status === STATUS.ALIVE;
  }

  #end(status, time) {
    if (this.status !== STATUS.ALIVE) return;
    this.status = status;
    this.endTime = time;
    this.recordPoint(time);
  }

  markDecayed(time) {
    this.#end(STATUS.DECAYED, time);
  }

  markEscaped(time) {
    this.#end(STATUS.ESCAPED, time);
  }

  markCollided(time) {
    this.#end(STATUS.COLLIDED, time);
  }

  /** @param {string} layer  e.g. 'ECAL', 'HCAL' */
  markAbsorbed(time, layer) {
    this.absorbedIn = layer;
    this.#end(STATUS.ABSORBED, time);
  }

  /* ===========================================================================
     Display helpers
     =========================================================================== */

  get symbol() {
    return this.info.symbol;
  }

  get name() {
    return this.info.name;
  }

  /** Track color category: photon, electron, muon, charged, neutral, neutrino, jet. */
  get displayKind() {
    return this.info.displayKind;
  }

  toString() {
    return `${this.symbol}#${this.id} E=${this.momentum.E.toFixed(3)} GeV [${this.status}]`;
  }

  /** Reset the id counter (e.g. between runs, for reproducible logs). */
  static resetIds() {
    nextId = 1;
  }
}