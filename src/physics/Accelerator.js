/**
 * Hadron Collider — Accelerator (beam dynamics and machine program)
 *
 * Runs two counter-rotating proton bunches around the LHC lattice and steps
 * the machine through its operating cycle:
 *
 *   STANDBY → INJECTING → RAMPING → SQUEEZING → COLLIDING ⇄ COLLISION
 *
 * LONGITUDINAL MOTION
 *   Each bunch is represented by its lead proton (the one that will interact).
 *   Both beams are locked to a common RF reference, so a single path length
 *   σ(t) = ∫ v dt describes them:
 *     Beam 2:  s = s_P8 + σ   (counter-clockwise, injected near Point 8)
 *     Beam 1:  s = s_P2 − σ   (clockwise, injected near Point 2)
 *   The injection points are symmetric about IP1, so the bunches meet at IP1
 *   (and, half a turn later, at IP5) on every revolution.
 *
 * TRANSVERSE MOTION (smooth approximation)
 *   x(σ) = σ_x(γ) √(β(s)/β̄) cos(2π Q_x σ/C + φ₀), likewise for y with Q_y.
 *   • β̄ = R/Q is the average arc β-function.
 *   • Near IP1/IP5 the β-function follows the drift law β(d) = β* + d²/β*.
 *   • Beam size σ = √(ε_N β / γ): it shrinks as 1/√γ during the ramp
 *     (adiabatic damping).
 *   • Before collisions, a vertical separation bump keeps the beams apart at
 *     IP1. Entering COLLIDING collapses it, bringing the beams head-on.
 */
import { MACHINE, PHYSICS, SIMULATION } from '../config/constants.js';
import { PDG } from '../data/particles.js';
import { FourVector } from './FourVector.js';
import { MagnetLattice } from './MagnetLattice.js';
import { Particle } from './Particle.js';
import { RFCavity } from './RFCavity.js';

/* =============================================================================
   Machine states
   ============================================================================= */
export const MACHINE_STATE = Object.freeze({
  STANDBY: 'standby',
  INJECTING: 'injecting',
  RAMPING: 'ramping',
  SQUEEZING: 'squeezing',
  COLLIDING: 'colliding', // beams in collision, trigger armed
  COLLISION: 'collision', // event recorded, trigger holding
});

/* =============================================================================
   Optics and beam parameters
   ============================================================================= */
const C = MACHINE.CIRCUMFERENCE;
const MP = PHYSICS.PROTON_MASS;
const LIGHT = PHYSICS.SPEED_OF_LIGHT;

/** Design normalized transverse emittance (m·rad). */
const NORMALIZED_EMITTANCE = 3.75e-6;

/** β* at IP1/IP5 with injection optics (m). */
const BETA_STAR_INJECTION = 11;

/** Distance from the IP to the first final-focus (triplet) quadrupole (m). */
const L_STAR = 23;

/** Distance over which the IR optics match back to the arc (m). */
const IR_MATCH_DISTANCE = 270;

/** Average arc β-functions in the smooth approximation, β̄ = R / Q (m). */
const MEAN_RADIUS = C / (2 * Math.PI);
const BETA_ARC_X = MEAN_RADIUS / MACHINE.TUNE_HORIZONTAL;
const BETA_ARC_Y = MEAN_RADIUS / MACHINE.TUNE_VERTICAL;

/** Half-height of the vertical separation bump at IP1 before collisions (m). */
const SEPARATION_BUMP = 1.0e-3;
const SEPARATION_BUMP_EXTENT = 150;

/** Beams collide if their transverse separation at IP1 is below this many σ*. */
const COLLISION_TOLERANCE_SIGMA = 5;

/** Fraction of the remaining approach distance covered per frame in slow motion. */
const APPROACH_FRACTION = 0.06;
const NOMINAL_FRAME = 1 / 60;

/* =============================================================================
   Fixed positions along the ring
   ============================================================================= */
const POINT = Object.fromEntries(MagnetLattice.POINTS.map((p) => [p.point, p.s]));
const S_INJECT_BEAM1 = POINT[2];
const S_INJECT_BEAM2 = POINT[8];

/** Path length σ at which the bunches meet at IP1 (plus integer multiples of C). */
const PATH_IP1 = MagnetLattice.wrap(0 - S_INJECT_BEAM2);
/** Path length σ at which Beam 2 passes the RF cavities at Point 4. */
const PATH_RF = MagnetLattice.wrap(RFCavity.POSITION_S - S_INJECT_BEAM2);

/** Smallest path ≥ current that is ≡ offset (mod C). */
function nextPathAt(path, offset) {
  const k = Math.ceil((path - offset) / C - 1e-12);
  return offset + Math.max(0, k) * C;
}

/** Number of times the path crosses `offset + kC` in (from, to]. */
function crossingsBetween(from, to, offset) {
  return Math.floor((to - offset) / C) - Math.floor((from - offset) / C);
}

/* =============================================================================
   Beam (one bunch)
   ============================================================================= */
class Beam {
  /**
   * @param {1|2} id
   * @param {number} injectionS
   * @param {number} direction  +1 (toward +s) or −1
   * @param {() => number} random
   */
  constructor(id, injectionS, direction, random) {
    this.id = id;
    this.injectionS = injectionS;
    this.direction = direction;
    this.phaseX = random() * 2 * Math.PI;
    this.phaseY = random() * 2 * Math.PI;
    this.protonsInBunch = MACHINE.PROTONS_PER_BUNCH_DESIGN;
    this.collisions = 0;

    /** Curvilinear coordinates (m): s along the ring, x/y offsets from the orbit. */
    this.s = injectionS;
    this.x = 0;
    this.y = 0;
    /** Offset of this beam's own aperture from the design orbit (m). */
    this.aperture = 0;

    /** The lead proton of the bunch: a real Particle object. */
    this.particle = null;
  }

  sAt(path) {
    return MagnetLattice.wrap(this.injectionS + this.direction * path);
  }
}

/* =============================================================================
   Accelerator
   ============================================================================= */
export class Accelerator {
  #lattice;
  #rf;
  #random;
  #listeners = new Set();

  #state = MACHINE_STATE.STANDBY;
  #active = false;

  #energy = MACHINE.INJECTION_ENERGY; // GeV per beam
  #targetEnergy = MACHINE.RUN3_ENERGY; // energy for the current fill
  #pendingEnergy = MACHINE.RUN3_ENERGY; // applied at the next fill

  #path = 0; // σ: synchronous path length since injection (m)
  #time = 0; // physics time since injection (s)
  #squeezeStartPath = 0;
  #betaStar = BETA_STAR_INJECTION;
  #bumpScale = 1; // 1 = beams separated at IP1, 0 = head-on
  #armed = false;
  #crossings = 0;
  #lastRF = null;

  /** @type {[Beam, Beam] | []} */
  beams = [];

  /**
   * @param {object} [options]
   * @param {MagnetLattice} [options.lattice]
   * @param {RFCavity} [options.rf]
   * @param {() => number} [options.random]  uniform RNG on [0, 1)
   */
  constructor({ lattice = new MagnetLattice(), rf = new RFCavity(), random = Math.random } = {}) {
    this.#lattice = lattice;
    this.#rf = rf;
    this.#random = random;
    this.#lattice.setReferenceMomentum(this.#momentumOf(this.#energy));
  }

  /* ===========================================================================
     State change notifications
     =========================================================================== */

  /** Subscribe to state changes: handler({ state, previous }). Returns unsubscribe. */
  onStateChange(handler) {
    this.#listeners.add(handler);
    return () => this.#listeners.delete(handler);
  }

  #setState(next) {
    if (next === this.#state) return;
    const previous = this.#state;
    this.#state = next;
    for (const handler of [...this.#listeners]) handler({ state: next, previous });
  }

  /* ===========================================================================
     Controls
     =========================================================================== */

  /** Switch the collider on (inject a new fill) or off (dump the beams). */
  setActive(active) {
    if (active === this.#active) return;
    this.#active = active;
    if (active) this.#inject();
    else this.#dump();
  }

  /** Requested energy per beam (GeV). Takes effect at the next fill. */
  setBeamEnergy(energy) {
    if (!Number.isFinite(energy)) return;
    this.#pendingEnergy = Math.min(MACHINE.DESIGN_ENERGY, Math.max(MACHINE.INJECTION_ENERGY, energy));
  }

  /** Re-arm the trigger after an event has been displayed. */
  rearm() {
    if (this.#state === MACHINE_STATE.COLLISION) {
      this.#armed = true;
      this.#setState(MACHINE_STATE.COLLIDING);
    }
  }

  #inject() {
    this.#energy = MACHINE.INJECTION_ENERGY;
    this.#targetEnergy = this.#pendingEnergy;
    this.#path = 0;
    this.#time = 0;
    this.#crossings = 0;
    this.#betaStar = BETA_STAR_INJECTION;
    this.#bumpScale = 1;
    this.#armed = false;
    this.#rf.reset();
    this.#lattice.setReferenceMomentum(this.#momentumOf(this.#energy));

    this.beams = [
      new Beam(1, S_INJECT_BEAM1, MACHINE.BEAM1_DIRECTION, this.#random),
      new Beam(2, S_INJECT_BEAM2, MACHINE.BEAM2_DIRECTION, this.#random),
    ];
    for (const beam of this.beams) beam.particle = this.#createProton(beam);
    this.#updateBeams();

    this.#setState(MACHINE_STATE.INJECTING);
  }

  #dump() {
    // Real LHC: beams are extracted at Point 6 onto graphite absorber blocks.
    this.beams = [];
    this.#armed = false;
    this.#rf.reset();
    this.#setState(MACHINE_STATE.STANDBY);
  }

  /* ===========================================================================
     Kinematics helpers
     =========================================================================== */

  #momentumOf(energy) {
    return Math.sqrt(Math.max(0, energy * energy - MP * MP));
  }

  /** Proton speed (m/s) at the current energy: v = (p/E) c. */
  get speed() {
    return (this.#momentumOf(this.#energy) / this.#energy) * LIGHT;
  }

  /** Revolution frequency (Hz): f = v / C. ≈ 11 245 Hz. */
  get revolutionFrequency() {
    return this.speed / C;
  }

  /** Lorentz factor of the beam protons. */
  get gamma() {
    return this.#energy / MP;
  }

  /** 1 − β, computed stably: m² / (E (E + p)). */
  get oneMinusBeta() {
    const p = this.#momentumOf(this.#energy);
    return (MP * MP) / (this.#energy * (this.#energy + p));
  }

  /** RMS beam size (m) for β-function β at the current energy. */
  #sigma(beta) {
    return Math.sqrt((NORMALIZED_EMITTANCE * beta) / this.gamma);
  }

  /** β-function at s, including the IR drift law near IP1 and IP5 (m). */
  #betaAt(s, betaArc) {
    const d = Math.min(
      Math.abs(MagnetLattice.signedDistanceToIP1(s)),
      Math.abs(MagnetLattice.wrap(s - POINT[5]) > C / 2
        ? MagnetLattice.wrap(s - POINT[5]) - C
        : MagnetLattice.wrap(s - POINT[5])),
    );
    const bs = this.#betaStar;
    if (d <= L_STAR) return bs + (d * d) / bs;
    if (d >= IR_MATCH_DISTANCE) return betaArc;
    // Smooth logarithmic match from the triplet back to the arc optics.
    const atTriplet = bs + (L_STAR * L_STAR) / bs;
    const t = (d - L_STAR) / (IR_MATCH_DISTANCE - L_STAR);
    const w = t * t * (3 - 2 * t);
    return Math.exp(Math.log(atTriplet) * (1 - w) + Math.log(betaArc) * w);
  }

  #createProton(beam) {
    const frame = MagnetLattice.frameAt(beam.s);
    const p = this.#momentumOf(this.#energy);
    const momentum = new FourVector(
      this.#energy,
      frame.tangent.x * beam.direction * p,
      0,
      frame.tangent.z * beam.direction * p,
    );
    const position = MagnetLattice.toWorld(beam.s, beam.aperture + beam.x, beam.y);
    return new Particle({ pdg: PDG.PROTON, momentum, position, time: this.#time });
  }

  /** Recompute every beam's coordinates, momentum, and particle position. */
  #updateBeams() {
    const p = this.#momentumOf(this.#energy);
    for (const beam of this.beams) {
      const s = beam.sAt(this.#path);
      beam.s = s;
      beam.aperture = MagnetLattice.apertureOffset(s, beam.id);

      // Betatron oscillation (1σ particle) with local β-function.
      const phaseAdvance = (2 * Math.PI * this.#path) / C;
      const bx = this.#betaAt(s, BETA_ARC_X);
      const by = this.#betaAt(s, BETA_ARC_Y);
      beam.x = this.#sigma(bx) * Math.cos(MACHINE.TUNE_HORIZONTAL * phaseAdvance + beam.phaseX);
      beam.y = this.#sigma(by) * Math.cos(MACHINE.TUNE_VERTICAL * phaseAdvance + beam.phaseY);

      // Vertical separation bump at IP1 (beams kept apart until collisions).
      const dIP = Math.abs(MagnetLattice.signedDistanceToIP1(s));
      if (dIP < SEPARATION_BUMP_EXTENT && this.#bumpScale > 0) {
        const t = 1 - dIP / SEPARATION_BUMP_EXTENT;
        beam.y += (beam.id === 1 ? 1 : -1) * SEPARATION_BUMP * this.#bumpScale * t * t * (3 - 2 * t);
      }

      // Update the real Particle: four-momentum along the local tangent.
      const frame = MagnetLattice.frameAt(s);
      const prt = beam.particle;
      if (prt) {
        prt.momentum.set(
          this.#energy,
          frame.tangent.x * beam.direction * p,
          0,
          frame.tangent.z * beam.direction * p,
        );
        MagnetLattice.toWorld(s, beam.aperture + beam.x, beam.y, prt.position);
      }
    }
  }

  /* ===========================================================================
     Time evolution
     =========================================================================== */

  /**
   * Advance the beams by dt of physics time. Stops early, exactly at an armed
   * IP1 bunch crossing, so the collision can be evaluated at that instant.
   *
   * @param {number} dt  physics time (s)
   * @returns {{ advanced: number, crossing: boolean }}
   */
  update(dt) {
    if (!this.#active || this.beams.length === 0 || dt <= 0) {
      return { advanced: 0, crossing: false };
    }

    let remaining = dt;
    let guard = 0;

    while (remaining > 0 && guard++ < 64) {
      const v = this.speed;
      const reach = this.#path + v * remaining;

      // Candidate events ahead of the current path position.
      const events = [];
      if (this.#rf.isRamping || this.#state === MACHINE_STATE.INJECTING) {
        events.push({ kind: 'rf', at: nextPathAt(this.#path + 1e-9, PATH_RF) });
      }
      if (this.#state === MACHINE_STATE.INJECTING) {
        events.push({ kind: 'phase', at: SIMULATION.INJECTION_TURNS * C });
      }
      if (this.#state === MACHINE_STATE.SQUEEZING) {
        events.push({ kind: 'phase', at: this.#squeezeStartPath + SIMULATION.SQUEEZE_TURNS * C });
      }
      if (this.#armed) {
        events.push({ kind: 'crossing', at: nextPathAt(this.#path + 1e-9, PATH_IP1) });
      }

      const next = events.filter((e) => e.at <= reach).sort((a, b) => a.at - b.at)[0];

      if (!next) {
        this.#advancePath(reach, remaining);
        remaining = 0;
        break;
      }

      const step = (next.at - this.#path) / v;
      this.#advancePath(next.at, step);
      remaining -= step;

      if (next.kind === 'rf') this.#onRFPass();
      else if (next.kind === 'phase') this.#onPhaseBoundary();
      else if (next.kind === 'crossing') {
        this.#updateBeams();
        return { advanced: dt - remaining, crossing: true, remaining };
      }
    }

    this.#updateBeams();
    return { advanced: dt - remaining, crossing: false, remaining: 0 };
  }

  #advancePath(to, dt) {
    this.#crossings += Math.max(0, crossingsBetween(this.#path, to, PATH_IP1));
    this.#path = to;
    this.#time += dt;

    if (this.#state === MACHINE_STATE.SQUEEZING) {
      // β* reduced logarithmically from injection optics to collision optics.
      const f = Math.min(1, (this.#path - this.#squeezeStartPath) / (SIMULATION.SQUEEZE_TURNS * C));
      this.#betaStar = Math.exp(
        Math.log(BETA_STAR_INJECTION) * (1 - f) + Math.log(MACHINE.BETA_STAR_RUN3) * f,
      );
    }
  }

  #onRFPass() {
    if (!this.#rf.isRamping) {
      this.#lastRF = this.#rf.pass(this.#energy, this.revolutionFrequency);
      return;
    }
    this.#lastRF = this.#rf.pass(this.#energy, this.revolutionFrequency);
    this.#energy += this.#lastRF.deltaE;
    // Magnets track the beam: B = p / (0.2998 ρ) keeps the orbit centered.
    this.#lattice.setReferenceMomentum(this.#momentumOf(this.#energy));

    if (!this.#rf.isRamping) {
      this.#squeezeStartPath = this.#path;
      this.#setState(MACHINE_STATE.SQUEEZING);
    }
  }

  #onPhaseBoundary() {
    if (this.#state === MACHINE_STATE.INJECTING) {
      if (this.#targetEnergy > this.#energy) {
        this.#rf.startRamp({ startEnergy: this.#energy, targetEnergy: this.#targetEnergy });
        this.#setState(MACHINE_STATE.RAMPING);
      } else {
        this.#squeezeStartPath = this.#path;
        this.#setState(MACHINE_STATE.SQUEEZING);
      }
    } else if (this.#state === MACHINE_STATE.SQUEEZING) {
      this.#betaStar = MACHINE.BETA_STAR_RUN3;
      this.#bumpScale = 0; // collapse the separation bump: beams head-on
      this.#armed = true;
      this.#setState(MACHINE_STATE.COLLIDING);
    }
  }

  /* ===========================================================================
     Collisions
     =========================================================================== */

  /**
   * Transverse overlap of the two bunches at IP1 right now.
   * @returns {{ separation: number, sigma: number, overlapping: boolean }}
   */
  overlapAtIP() {
    if (this.beams.length < 2) return { separation: Infinity, sigma: 0, overlapping: false };
    const [b1, b2] = this.beams;
    const separation = Math.hypot(b1.aperture + b1.x - (b2.aperture + b2.x), b1.y - b2.y);
    const sigma = this.#sigma(this.#betaStar);
    return { separation, sigma, overlapping: separation <= COLLISION_TOLERANCE_SIGMA * sigma };
  }

  /**
   * Hand the two lead protons to the event generator. They are marked as
   * collided, and each bunch gets a fresh lead proton for the next crossing
   * (a real bunch holds ~10¹¹ protons).
   *
   * @returns {{ protons: [Particle, Particle], time: number }}
   */
  consumeCollision() {
    const protons = this.beams.map((beam) => beam.particle);
    for (const beam of this.beams) {
      beam.particle.markCollided(this.#time);
      beam.collisions += 1;
      beam.protonsInBunch -= 1;
      beam.particle = this.#createProton(beam);
    }
    this.#armed = false;
    this.#setState(MACHINE_STATE.COLLISION);
    return { protons, time: this.#time };
  }

  /**
   * Dilation weight for the simulation clock while an armed crossing
   * approaches. The target time scale shrinks in proportion to the remaining
   * distance, so each frame covers a fixed fraction of it: a smooth,
   * geometric "braking" into the collision at any slow-motion setting.
   *
   * @param {number} userScale  the slider's time scale
   * @returns {number} weight in [0, 1]
   */
  dilationWeight(userScale) {
    const floor = SIMULATION.CIRCULATION_TIME_SCALE_FLOOR;
    if (!this.#armed || userScale >= floor) return 0;

    const remaining = nextPathAt(this.#path, PATH_IP1) - this.#path;
    const k = APPROACH_FRACTION / (this.speed * NOMINAL_FRAME);
    const target = Math.min(floor, Math.max(userScale, k * remaining));
    return (Math.log(floor) - Math.log(target)) / (Math.log(floor) - Math.log(userScale));
  }

  /* ===========================================================================
     Read-only state
     =========================================================================== */

  get state() {
    return this.#state;
  }

  get isActive() {
    return this.#active;
  }

  get armed() {
    return this.#armed;
  }

  /** Energy per beam (GeV). */
  get energy() {
    return this.#energy;
  }

  /** Energy the next fill will ramp to (GeV). */
  get pendingEnergy() {
    return this.#pendingEnergy;
  }

  /** Centre-of-mass energy √s = 2E for head-on collisions of equal beams (GeV). */
  get sqrtS() {
    return 2 * this.#energy;
  }

  get betaStar() {
    return this.#betaStar;
  }

  /** Completed revolutions since injection. */
  get turns() {
    return Math.floor(this.#path / C);
  }

  /** Bunch crossings at IP1 since injection. */
  get crossings() {
    return this.#crossings;
  }

  /** Physics time since injection (s). */
  get time() {
    return this.#time;
  }

  get lattice() {
    return this.#lattice;
  }

  get rf() {
    return this.#rf;
  }

  /** Snapshot for the telemetry panel. */
  telemetry() {
    const gamma = this.gamma;
    const beam = {
      energy: this.#energy,
      gamma,
      beta: 1 - this.oneMinusBeta,
      oneMinusBeta: this.oneMinusBeta,
      turns: this.turns,
    };
    return {
      state: this.#state,
      beams: this.beams.length ? [beam, { ...beam }] : [],
      dipoleField: this.#lattice.dipoleField,
      rfVoltage: this.#active ? this.#rf.voltage : 0,
      rfCompression: this.#lastRF?.compression ?? 1,
      synchrotronLoss: RFCavity.synchrotronLossPerTurn(gamma),
      revolutionFrequency: this.revolutionFrequency,
      betaStar: this.#betaStar,
      beamSizeAtIP: this.#sigma(this.#betaStar),
      crossings: this.#crossings,
      simTime: this.#time,
    };
  }
}