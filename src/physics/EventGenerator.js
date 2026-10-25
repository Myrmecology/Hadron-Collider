/**
 * Hadron Collider — Event generator and detector transport
 *
 * Builds a complete proton–proton collision event from the two colliding
 * Particle objects, then transports every product through the detector.
 *
 * GENERATION (at the primary vertex)
 *   1. Hard scatter: process and partons chosen by cross-section and PDFs.
 *   2. Ultra-short-lived states (t, W, Z, H; τ ~ 10⁻²⁵ s) decay in place.
 *   3. Multi-parton interactions: additional soft g g → g g scatterings within
 *      the same proton pair (Poisson-distributed; ≈ 4 at 13.6 TeV).
 *   4. Beam remnants: the rest of each proton continues along the beam.
 *   5. Hadronization of every color-singlet system:
 *        • the event-level system (colored hard partons + remnants)
 *        • decay products of W, Z, H (each its own color singlet)
 *        • each multi-parton-interaction gluon pair
 *   A four-momentum conservation check against the incoming protons is
 *   recorded for every event.
 *
 * TRANSPORT (each frame, by physics time)
 *   Particles move through the detector field (Boris pusher), decay when
 *   their sampled lifetimes expire, and stop according to how they interact:
 *     photons, e±          absorbed in the electromagnetic calorimeter
 *     hadrons              absorbed in the hadronic calorimeter
 *     muons                traverse everything; leave through the spectrometer
 *     neutrinos            escape undetected (missing transverse energy)
 *     |η| > 4.9            lost down the beam pipe, outside detector coverage
 *     low-pT loopers       stop in the tracker after spiraling (energy loss)
 */
import { DETECTOR, PHYSICS } from '../config/constants.js';
import { bus, EVENTS } from '../core/EventBus.js';
import { getParticle, isParton, isNeutrino, PDG } from '../data/particles.js';
import { BorisPusher } from './BorisPusher.js';
import { DecayEngine } from './DecayEngine.js';
import { FourVector } from './FourVector.js';
import { Hadronization } from './Hadronization.js';
import { HardScatter } from './HardScatter.js';
import { Particle, STATUS } from './Particle.js';

const { TOP, W_PLUS, Z, HIGGS, GLUON } = PDG;

/** States that decay at the vertex (lifetimes ≲ 10⁻²² s). */
const INSTANT = new Set([TOP, W_PLUS, Z, HIGGS]);

/** Decays worth listing in the Decay Chain panel. */
const NOTABLE = new Set([6, 24, 23, 25, 15, 511, 521, 411, 421, 443, 553, 310, 3122, 221, 13]);

/** Calorimeter penetration depths before a shower is considered absorbed (m). */
const ECAL_DEPTH = 0.15;
const HCAL_DEPTH = 0.9;

/** Detector coverage in pseudorapidity (forward calorimeters reach |η| = 4.9). */
const ETA_COVERAGE = 4.9;

/** Path length after which a low-momentum charged track is stopped in the tracker (m). */
const LOOPER_PATH = 12;

/** Upper bound on an event's duration in physics time (s). */
const MAX_EVENT_TIME = 200e-9;

/** Mean multi-parton-interaction count at 13.6 TeV. */
const MPI_MEAN_REF = 4;

/* =============================================================================
   Helpers
   ============================================================================= */
function poisson(mean, random) {
  const L = Math.exp(-mean);
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= random();
  } while (p > L && k < 50);
  return k - 1;
}

const inside = (pos, R, H) => Math.hypot(pos.x, pos.y) < R && Math.abs(pos.z) < H;

/* =============================================================================
   Collision event
   ============================================================================= */
export class CollisionEvent {
  constructor({ run, number, time, vertex, sqrtS, hard, crossing, mpi }) {
    this.run = run;
    this.number = number;
    this.time = time;
    this.clock = time;
    this.vertex = vertex;
    this.sqrtS = sqrtS;
    this.hard = hard;
    this.crossing = crossing;
    this.mpi = mpi;

    /** Every particle that exists or existed in the event (append-only). */
    /** @type {Particle[]} */
    this.particles = [];
    /** Human-readable decay lines for the Decay Chain panel. */
    this.decays = [];
    /** Relative four-momentum conservation error at the vertex. */
    this.conservationError = 0;
    this.finished = false;
    /** Increments whenever particles are added (renderers watch this). */
    this.version = 0;
  }

  add(particle) {
    this.particles.push(particle);
    this.version += 1;
  }

  /** Final-state particles (not decayed, not partons). */
  get finalState() {
    return this.particles.filter((p) => p.status !== STATUS.DECAYED && !isParton(p.pdg));
  }

  /** Missing transverse energy (GeV): |Σ pT| of the neutrinos. */
  get missingET() {
    let px = 0;
    let py = 0;
    for (const p of this.finalState) {
      if (isNeutrino(p.pdg)) {
        px += p.momentum.px;
        py += p.momentum.py;
      }
    }
    return Math.hypot(px, py);
  }

  /** Snapshot for the Event Display panel. */
  summary(limit = 40) {
    const visible = this.finalState.filter(
      (p) => !isNeutrino(p.pdg) && Math.abs(p.momentum.eta) <= ETA_COVERAGE,
    );
    visible.sort((a, b) => b.momentum.E - a.momentum.E);
    const sym = (code) => getParticle(code).symbol;

    return {
      run: this.run,
      number: this.number,
      process: this.hard.name,
      label: this.hard.label,
      enhanced: this.hard.enhanced,
      trueProbability: this.hard.trueProbability,
      partons: `${sym(this.hard.partonA.flavor)} (x=${this.hard.partonA.x.toPrecision(3)}) · ${sym(
        this.hard.partonB.flavor,
      )} (x=${this.hard.partonB.x.toPrecision(3)})`,
      sqrtSHat: this.hard.sqrtSHat,
      sqrtS: this.sqrtS,
      multiplicity: visible.length,
      charged: visible.filter((p) => p.isCharged).length,
      missingET: this.missingET,
      mpi: this.mpi,
      vertex: this.vertex,
      conservationError: this.conservationError,
      particles: visible.slice(0, limit).map((p) => ({
        id: p.id,
        symbol: p.symbol,
        name: p.name,
        kind: p.displayKind,
        energy: p.momentum.E,
        pt: p.momentum.pt,
        status: p.status,
        absorbedIn: p.absorbedIn,
      })),
      totalVisible: visible.length,
      decays: [...this.decays],
      finished: this.finished,
    };
  }
}

/* =============================================================================
   Event generator
   ============================================================================= */
export class EventGenerator {
  #random;
  #hard;
  #decay;
  #hadron;
  #pusher;
  #event = null;
  #count = 0;

  /** @param {{ random?: () => number }} [options] */
  constructor({ random = Math.random } = {}) {
    this.#random = random;
    this.#hard = new HardScatter({ random });
    this.#decay = new DecayEngine({ random });
    this.#hadron = new Hadronization({ random });
    this.#pusher = new BorisPusher();
  }

  get current() {
    return this.#event;
  }

  /** True while the current event still has particles in flight. */
  get active() {
    return Boolean(this.#event && !this.#event.finished);
  }

  get eventCount() {
    return this.#count;
  }

  reset() {
    this.#event = null;
  }

  /* ===========================================================================
     Generation
     =========================================================================== */

  /**
   * Build a full collision event from a CollisionDetector record.
   *
   * @param {import('./CollisionDetector.js').CollisionRecord} record
   * @param {{ enhanced?: boolean, run?: number }} [options]
   * @returns {CollisionEvent}
   */
  generate(record, { enhanced = false, run = 1 } = {}) {
    const t0 = record.time;
    const vertex = record.vertex;
    const [beam1, beam2] = record.protons;

    // Beam 2 travels toward +z at IP1, Beam 1 toward −z.
    const pA = beam2.momentum.clone();
    const pB = beam1.momentum.clone();

    const hard = this.#hard.generate(record.sqrtS, { enhanced });
    this.#count += 1;

    const event = new CollisionEvent({
      run,
      number: this.#count,
      time: t0,
      vertex,
      sqrtS: record.sqrtS,
      hard,
      crossing: record.crossing,
      mpi: 0,
    });

    const extractedA = [hard.partonA.flavor];
    const extractedB = [hard.partonB.flavor];
    let xA = hard.partonA.x;
    let xB = hard.partonB.x;

    /** Colored partons that connect to the beam remnants. */
    const colored = [];
    /** Independent color-singlet systems: { source, partons: [{pdg, momentum}] }. */
    const singlets = [];

    const makeParticle = (pdg, momentum, parent = null) =>
      new Particle({ pdg, momentum: momentum.clone(), position: vertex, time: t0, parent });

    const finalize = (particle) => {
      particle.scheduleDecay(this.#random);
      particle._time = particle.creationTime;
      event.add(particle);
    };

    // Resolve t, W, Z, H immediately at the vertex.
    const resolve = (particle) => {
      const result = this.#decay.decay(particle, t0);
      if (!result) {
        finalize(particle);
        return;
      }
      if (NOTABLE.has(Math.abs(particle.pdg))) event.decays.push(result.label);

      const partons = [];
      for (const child of result.daughters) {
        if (isParton(child.pdg)) {
          child.markDecayed(t0); // replaced by its hadrons
          if (Math.abs(particle.pdg) === TOP) colored.push({ pdg: child.pdg, momentum: child.momentum });
          else partons.push({ pdg: child.pdg, momentum: child.momentum });
        } else if (INSTANT.has(Math.abs(child.pdg))) {
          resolve(child);
        } else {
          finalize(child);
        }
      }
      if (partons.length > 0) singlets.push({ source: particle, partons });
    };

    // 1–2. Hard-process products.
    for (const out of hard.outgoing) {
      const code = Math.abs(out.pdg);
      if (isParton(out.pdg) && code !== TOP) {
        colored.push({ pdg: out.pdg, momentum: out.momentum });
      } else if (INSTANT.has(code)) {
        resolve(makeParticle(out.pdg, out.momentum));
      } else {
        finalize(makeParticle(out.pdg, out.momentum));
      }
    }

    // 3. Multi-parton interactions: soft g g → g g within the same proton pair.
    const mpiMean = MPI_MEAN_REF * (record.sqrtS / 13_600) ** 0.25;
    const nMPI = poisson(mpiMean, this.#random);
    const pT0 = 2.28 * (record.sqrtS / 7000) ** 0.215;
    for (let i = 0; i < nMPI; i++) {
      const r = this.#random();
      const a = pT0 * pT0;
      const inv = 1 / (0.25 + a) - r * (1 / (0.25 + a) - 1 / (100 + a));
      const pt = Math.sqrt(Math.max(0, 1 / inv - a));
      const y3 = (2 * this.#random() - 1) * 2.5;
      const y4 = (2 * this.#random() - 1) * 2.5;
      const xa = (pt * (Math.exp(y3) + Math.exp(y4))) / record.sqrtS;
      const xb = (pt * (Math.exp(-y3) + Math.exp(-y4))) / record.sqrtS;
      if (xA + xa > 0.95 || xB + xb > 0.95) continue;

      xA += xa;
      xB += xb;
      extractedA.push(GLUON);
      extractedB.push(GLUON);
      const phi = 2 * Math.PI * this.#random();
      singlets.push({
        source: null,
        partons: [
          { pdg: GLUON, momentum: new FourVector(pt * Math.cosh(y3), pt * Math.cos(phi), pt * Math.sin(phi), pt * Math.sinh(y3)) },
          { pdg: GLUON, momentum: new FourVector(pt * Math.cosh(y4), -pt * Math.cos(phi), -pt * Math.sin(phi), pt * Math.sinh(y4)) },
        ],
      });
      event.mpi += 1;
    }

    // 4. Beam remnants carry the rest of each proton's momentum.
    const remnantA = pA.scale(1 - xA);
    const remnantB = pB.scale(1 - xB);

    // 5. Hadronize every color-singlet system.
    const eventEnds = [
      ...colored.flatMap((p) => this.#hadron.partonEnds(p.pdg, p.momentum)),
      ...this.#hadron.remnantEnds(extractedA, remnantA),
      ...this.#hadron.remnantEnds(extractedB, remnantB),
    ];
    for (const h of this.#hadron.hadronizeSystem(eventEnds)) {
      finalize(makeParticle(h.pdg, h.momentum));
    }
    for (const system of singlets) {
      const ends = system.partons.flatMap((p) => this.#hadron.partonEnds(p.pdg, p.momentum));
      for (const h of this.#hadron.hadronizeSystem(ends)) {
        finalize(makeParticle(h.pdg, h.momentum, system.source));
      }
    }

    // Conservation check: everything produced versus the two incoming protons.
    const initial = pA.add(pB);
    const produced = FourVector.sum(event.particles.filter((p) => p.isAlive).map((p) => p.momentum));
    const diff = initial.sub(produced);
    event.conservationError = Math.hypot(diff.E, diff.px, diff.py, diff.pz) / initial.E;
    if (event.conservationError > 1e-6) {
      bus.emit(EVENTS.ERROR, {
        error: new Error(`Four-momentum not conserved: relative error ${event.conservationError.toExponential(2)}`),
        context: 'EventGenerator',
      });
    }

    this.#event = event;
    bus.emit(EVENTS.COLLISION, { event });
    return event;
  }

  /* ===========================================================================
     Transport
     =========================================================================== */

  /**
   * Stopping rule for a particle: returns a reason string, or null to continue.
   * @param {Particle} p
   */
  #stopReason(p) {
    const pos = p.position;
    const kind = p.displayKind;

    if (!inside(pos, DETECTOR.MUON_OUTER_RADIUS + 2, DETECTOR.MUON_HALF_LENGTH + 2)) return 'escaped';

    const forward = Math.abs(p.momentum.eta) > ETA_COVERAGE;
    if (forward) return null; // continues down the beam pipe until it leaves

    if (kind === 'neutrino' || kind === 'muon') return null;

    if (kind === 'photon' || kind === 'electron') {
      if (!inside(pos, DETECTOR.ECAL_INNER_RADIUS + ECAL_DEPTH, DETECTOR.ECAL_HALF_LENGTH + ECAL_DEPTH)) {
        return 'ECAL';
      }
    } else if (!inside(pos, DETECTOR.HCAL_INNER_RADIUS + HCAL_DEPTH, DETECTOR.HCAL_HALF_LENGTH)) {
      return 'HCAL';
    }

    // Low-momentum charged particles curl inside the tracker until they range out.
    if (p.isCharged && inside(pos, DETECTOR.TRACKER_OUTER_RADIUS, DETECTOR.TRACKER_HALF_LENGTH)) {
      const path = p.beta * PHYSICS.SPEED_OF_LIGHT * (p._time - p.creationTime);
      if (path > LOOPER_PATH) return 'Tracker';
    }
    return null;
  }

  /** Decay a particle in flight and hadronize any partons it produces. */
  #decayInFlight(event, particle, time) {
    const result = this.#decay.decay(particle, time);
    if (!result) {
      particle.decayTime = Infinity;
      return;
    }
    if (NOTABLE.has(Math.abs(particle.pdg))) event.decays.push(result.label);

    const partons = [];
    for (const child of result.daughters) {
      if (isParton(child.pdg)) {
        child.markDecayed(time);
        partons.push(child);
      } else {
        child._time = time;
        event.add(child);
      }
    }

    if (partons.length > 0) {
      const ends = partons.flatMap((p) => this.#hadron.partonEnds(p.pdg, p.momentum));
      for (const h of this.#hadron.hadronizeSystem(ends)) {
        const hadron = new Particle({
          pdg: h.pdg,
          momentum: h.momentum,
          position: particle.position,
          time,
          parent: particle,
        });
        hadron.scheduleDecay(this.#random);
        hadron._time = time;
        event.add(hadron);
      }
    }
  }

  /**
   * Advance the current event by dt of physics time.
   * @param {number} dt
   * @returns {boolean} true while particles remain in flight
   */
  update(dt) {
    const event = this.#event;
    if (!event || event.finished || dt <= 0) return false;

    const tEnd = event.clock + dt;

    // The list can grow during the loop (decay daughters are appended).
    for (let i = 0; i < event.particles.length; i++) {
      const p = event.particles[i];
      if (!p.isAlive || isParton(p.pdg)) continue;
      p._time ??= p.creationTime;

      let guard = 0;
      while (p.isAlive && p._time < tEnd && guard++ < 64) {
        const target = Math.min(tEnd, p.decayTime);
        let reason = null;

        if (target > p._time) {
          const advanced = this.#pusher.advance(p, target - p._time, p._time, {
            stop: (prt) => {
              reason = this.#stopReason(prt);
              return reason !== null;
            },
          });
          p._time += advanced;
        }

        if (reason === 'escaped') {
          p.markEscaped(p._time);
        } else if (reason) {
          p.markAbsorbed(p._time, reason);
        } else if (p._time >= p.decayTime - 1e-21) {
          this.#decayInFlight(event, p, p._time);
        }
      }
    }

    event.clock = tEnd;

    const inFlight = event.particles.some((p) => p.isAlive && !isParton(p.pdg));
    if (!inFlight || event.clock - event.time > MAX_EVENT_TIME) {
      for (const p of event.particles) if (p.isAlive) p.markEscaped(event.clock);
      event.finished = true;
    }
    return !event.finished;
  }
}