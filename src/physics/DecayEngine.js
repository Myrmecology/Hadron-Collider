/**
 * Hadron Collider — Decay engine
 *
 * Turns an unstable particle into its daughters when its sampled lifetime
 * expires:
 *   1. Choose a decay mode according to the measured branching ratios.
 *   2. Assign daughter masses (catalog masses; Breit–Wigner for broad
 *      resonances such as W, Z, t; propagator-weighted for virtual bosons).
 *   3. Generate momenta in the parent rest frame by Lorentz-invariant phase
 *      space: exact for two bodies, GENBOD (F. James, CERN 68-15) for N > 2.
 *   4. Boost every daughter into the laboratory frame.
 *
 * The parent's ACTUAL invariant mass is used (a Z produced at 90.6 GeV decays
 * with 90.6 GeV), so energy and momentum are conserved exactly, event by event.
 *
 * SCOPE
 *   Decays are distributed by phase space alone; spin correlations and
 *   matrix-element weighting (e.g. V−A structure of muon decay) are not
 *   modelled. Branching ratios, masses, lifetimes, and kinematics are exact.
 */
import { getParticle, PDG } from '../data/particles.js';
import { sampleDecayMode, describeDecay } from '../data/decayModes.js';
import { FourVector } from './FourVector.js';
import { Particle } from './Particle.js';

/** Daughters wider than this (GeV) get a Breit–Wigner mass instead of the pole mass. */
const BROAD_WIDTH = 0.5;

/** Lower bound for a virtual (off-shell) boson's mass (GeV). */
const VIRTUAL_MASS_MIN = 2;

const MAX_MODE_ATTEMPTS = 12;

/* =============================================================================
   Isotropic direction and helpers
   ============================================================================= */
function isotropic(random) {
  const cosTheta = 2 * random() - 1;
  const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
  const phi = 2 * Math.PI * random();
  return { x: sinTheta * Math.cos(phi), y: sinTheta * Math.sin(phi), z: cosTheta };
}

/** Relativistic Breit–Wigner mass, truncated to [lo, hi]. */
function breitWigner(M, width, lo, hi, random) {
  if (!(width > 0) || hi <= lo) return Math.min(Math.max(M, lo), hi);
  const a = Math.atan((lo * lo - M * M) / (M * width));
  const b = Math.atan((hi * hi - M * M) / (M * width));
  const theta = a + random() * (b - a);
  return Math.sqrt(Math.max(lo * lo, M * M + M * width * Math.tan(theta)));
}

/* =============================================================================
   Decay engine
   ============================================================================= */
export class DecayEngine {
  #random;

  /** @param {{ random?: () => number }} [options] */
  constructor({ random = Math.random } = {}) {
    this.#random = random;
  }

  /**
   * N-body Lorentz-invariant phase space in the parent rest frame.
   * Two bodies: exact back-to-back. N > 2: GENBOD with accept–reject on the
   * phase-space weight, so events are unweighted.
   *
   * @param {number} M          parent invariant mass (GeV)
   * @param {number[]} masses   daughter masses (GeV)
   * @param {() => number} random
   * @returns {FourVector[] | null}  daughter momenta in the rest frame
   */
  static phaseSpace(M, masses, random) {
    const n = masses.length;
    const sumM = masses.reduce((a, b) => a + b, 0);
    const available = M - sumM;
    if (!(available > 0) || n < 2) return null;

    if (n === 2) {
      const p = FourVector.twoBodyMomentum(M, masses[0], masses[1]);
      const d = isotropic(random);
      return [
        FourVector.fromMassMomentum(masses[0], p * d.x, p * d.y, p * d.z),
        FourVector.fromMassMomentum(masses[1], -p * d.x, -p * d.y, -p * d.z),
      ];
    }

    // Maximum weight bound (as in ROOT's TGenPhaseSpace).
    let emMax = available + masses[0];
    let emMin = 0;
    let wtMax = 1;
    for (let i = 1; i < n; i++) {
      emMin += masses[i - 1];
      emMax += masses[i];
      wtMax *= FourVector.twoBodyMomentum(emMax, emMin, masses[i]);
    }

    for (let attempt = 0; attempt < 10_000; attempt++) {
      // Ordered random numbers define the intermediate invariant masses.
      const r = [0];
      for (let i = 1; i < n - 1; i++) r.push(random());
      r.push(1);
      r.sort((a, b) => a - b);

      const invMass = [];
      let running = 0;
      for (let i = 0; i < n; i++) {
        running += masses[i];
        invMass.push(r[i] * available + running);
      }

      const pd = [];
      let weight = 1;
      for (let i = 1; i < n; i++) {
        const p = FourVector.twoBodyMomentum(invMass[i], invMass[i - 1], masses[i]);
        pd.push(p);
        weight *= p;
      }

      if (random() * wtMax > weight) continue;

      // Build the cascade: (((d0 d1) d2) d3)…, each step isotropic.
      const d = isotropic(random);
      const out = [
        FourVector.fromMassMomentum(masses[0], pd[0] * d.x, pd[0] * d.y, pd[0] * d.z),
        FourVector.fromMassMomentum(masses[1], -pd[0] * d.x, -pd[0] * d.y, -pd[0] * d.z),
      ];

      for (let i = 2; i < n; i++) {
        const dir = isotropic(random);
        const p = pd[i - 1];
        // Subsystem (d0 … d_{i−1}) of mass invMass[i−1] recoils against d_i.
        const subsystem = FourVector.fromMassMomentum(invMass[i - 1], p * dir.x, p * dir.y, p * dir.z);
        for (const v of out) v.boostInPlace(subsystem);
        out.push(FourVector.fromMassMomentum(masses[i], -p * dir.x, -p * dir.y, -p * dir.z));
      }
      return out;
    }
    return null;
  }

  /**
   * Assign masses to the daughters of a chosen mode, given the parent mass.
   * @returns {number[] | null}
   */
  #daughterMasses(M, mode) {
    const infos = mode.products.map(getParticle);
    const pole = infos.map((info) => info.mass);

    if (mode.offShell) {
      // One boson on (near) its mass shell, its partner virtual.
      // The virtual mass is weighted by the boson propagator times phase space.
      const info = infos[0];
      const real = breitWigner(info.mass, info.width, VIRTUAL_MASS_MIN, M - VIRTUAL_MASS_MIN, this.#random);
      const maxVirtual = M - real;
      if (maxVirtual <= VIRTUAL_MASS_MIN) return null;

      const mV2 = info.mass * info.mass;
      const candidates = [];
      let total = 0;
      for (let i = 0; i < 48; i++) {
        const m = VIRTUAL_MASS_MIN + this.#random() * (maxVirtual - VIRTUAL_MASS_MIN);
        const propagator = 1 / ((m * m - mV2) ** 2 + mV2 * info.width * info.width);
        const w = propagator * m * m * FourVector.twoBodyMomentum(M, real, m);
        if (w > 0) {
          total += w;
          candidates.push({ m, w });
        }
      }
      if (total <= 0) return null;
      let r = this.#random() * total;
      let virtual = candidates[candidates.length - 1].m;
      for (const c of candidates) {
        r -= c.w;
        if (r <= 0) {
          virtual = c.m;
          break;
        }
      }
      // Randomize which of the pair is the virtual one.
      return this.#random() < 0.5 ? [real, virtual] : [virtual, real];
    }

    // Broad daughters (W from top decay, etc.) get a Breit–Wigner mass
    // bounded by the energy left after the other daughters.
    const masses = [...pole];
    for (let i = 0; i < infos.length; i++) {
      if (infos[i].width > BROAD_WIDTH) {
        const others = pole.reduce((acc, m, j) => (j === i ? acc : acc + m), 0);
        const hi = M - others - 1e-3;
        masses[i] = breitWigner(infos[i].mass, infos[i].width, VIRTUAL_MASS_MIN, hi, this.#random);
      }
    }
    return masses;
  }

  /**
   * Decay a particle at lab time `time`. The parent is marked DECAYED and the
   * daughters are created at its current position with scheduled lifetimes.
   *
   * @param {Particle} parent
   * @param {number} time
   * @returns {{ daughters: Particle[], label: string, mode: object } | null}
   */
  decay(parent, time) {
    const M = parent.momentum.mass;
    if (!(M > 0)) return null;

    for (let attempt = 0; attempt < MAX_MODE_ATTEMPTS; attempt++) {
      const mode = sampleDecayMode(parent.pdg, this.#random);
      if (!mode) return null;

      const masses = this.#daughterMasses(M, mode);
      if (!masses) continue;

      const restFrame = DecayEngine.phaseSpace(M, masses, this.#random);
      if (!restFrame) continue; // this mode is closed at this parent mass; resample

      parent.markDecayed(time);

      const daughters = mode.products.map((pdg, i) => {
        const momentum = restFrame[i].boostInPlace(parent.momentum);
        const child = new Particle({
          pdg,
          momentum,
          position: parent.position,
          time,
          parent,
        });
        child.scheduleDecay(this.#random);
        return child;
      });

      return { daughters, label: describeDecay(parent.pdg, mode), mode };
    }

    // No accessible mode (parent produced below every threshold): leave it stable.
    return null;
  }

  /**
   * Verify four-momentum conservation for a decay (diagnostics).
   * @returns {number} |Δp| / E, the relative violation
   */
  static conservationError(parent, daughters) {
    const sum = FourVector.sum(daughters.map((d) => d.momentum));
    const diff = parent.momentum.sub(sum);
    return Math.hypot(diff.E, diff.px, diff.py, diff.pz) / parent.momentum.E;
  }
}

export { PDG };