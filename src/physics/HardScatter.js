/**
 * Hadron Collider — Hard scattering (the parton-level collision)
 *
 * Chooses which process occurs in a proton–proton collision, in proportion to
 * its cross-section, and generates the outgoing particles' four-momenta.
 *
 * PROCESSES (reference cross-sections at √s = 13.6 TeV)
 *   soft-qcd      inelastic minimum-bias scattering      σ_inel ≈ 79 mb (remainder)
 *   qcd-dijet     2 → 2 parton scattering, pT > 20 GeV    ≈ 0.5 mb
 *   heavy-bb      g g → b b̄                               ≈ 0.5 mb
 *   drell-yan-w   q q̄′ → W±                               ≈ 200 nb
 *   drell-yan-z   q q̄ → Z⁰                                 ≈ 60 nb
 *   top-pair      g g, q q̄ → t t̄                          ≈ 924 pb (NNLO+NNLL)
 *   higgs-ggf     g g → H (gluon fusion via a top loop)   ≈ 52 pb
 *   1 mb = 10⁹ pb.  Values are rounded literature figures (ATLAS, CMS, LHC
 *   Higgs WG, LHC Top WG); the multijet and bb̄ figures are approximate.
 *
 * ENERGY DEPENDENCE
 *   For a process of characteristic mass M, the cross-section scales with the
 *   parton luminosity:  σ(s) ∝ τ · dL/dτ  evaluated at τ = M²/s.
 *   The inelastic cross-section follows an empirical fit in ln²(√s).
 *
 * KINEMATICS (leading order)
 *   • Resonances (W, Z, H): mass from a relativistic Breit–Wigner, produced
 *     at rest in the transverse plane, longitudinally boosted by the parton
 *     system's rapidity.
 *   • 2 → 2 scattering: pT from the appropriate spectrum, outgoing rapidities
 *     sampled and weighted by the PDFs (sampling–importance–resampling).
 *   • t t̄: invariant mass above threshold, angular distribution ∝ 1 + cos²θ*.
 *   Initial-state radiation is not modelled at this stage.
 *
 * CONVENTION
 *   Parton "a" travels toward +z, parton "b" toward −z.
 */
import { getParticle, PDG } from '../data/particles.js';
import { FourVector } from './FourVector.js';
import { PARTONS, xf, samplePairAtTau } from './PartonDistributions.js';

const {
  DOWN, UP, STRANGE, CHARM, BOTTOM, TOP, GLUON, Z, W_PLUS, HIGGS,
} = PDG;

const PB_PER_MB = 1e9;
const SQRT_S_REF = 13_600;

/* =============================================================================
   Channel weights: which parton pairs (a, b) feed each process
   ============================================================================= */
const charge3 = (code) => getParticle(code).charge3;
const isQuarkCode = (code) => code !== GLUON;

const ggOnly = (a, b) => (a === GLUON && b === GLUON ? 1 : 0);

/** q q̄ → Z: relative couplings ∝ partial widths (up-type 0.74, down-type 1). */
const zChannel = (a, b) => {
  if (!isQuarkCode(a) || a !== -b) return 0;
  return Math.abs(a) % 2 === 0 ? 0.74 : 1.0;
};

/** |V_ij|² for (up-type, down-type) quark pairs: the CKM matrix. */
const CKM2 = {
  [`${UP}:${DOWN}`]: 0.9484, [`${UP}:${STRANGE}`]: 0.0504, [`${UP}:${BOTTOM}`]: 1.4e-5,
  [`${CHARM}:${DOWN}`]: 0.0504, [`${CHARM}:${STRANGE}`]: 0.9456, [`${CHARM}:${BOTTOM}`]: 0.0017,
};

/** q q̄′ → W±: one up-type and one down-type, quark with antiquark. */
const wChannel = (a, b) => {
  if (!isQuarkCode(a) || !isQuarkCode(b) || Math.sign(a) === Math.sign(b)) return 0;
  const up = [a, b].find((c) => Math.abs(c) % 2 === 0);
  const down = [a, b].find((c) => Math.abs(c) % 2 === 1);
  if (up === undefined || down === undefined) return 0;
  return CKM2[`${Math.abs(up)}:${Math.abs(down)}`] ?? 0;
};

/** t t̄: gluon fusion dominates at the LHC; q q̄ annihilation contributes ~10%. */
const ttChannel = (a, b) => {
  if (a === GLUON && b === GLUON) return 1;
  if (isQuarkCode(a) && a === -b) return 1.6;
  return 0;
};

const anyPair = () => 1;

/* =============================================================================
   Process catalog
   ============================================================================= */
export const PROCESS = Object.freeze({
  SOFT: 'soft-qcd',
  DIJET: 'qcd-dijet',
  BB: 'heavy-bb',
  W: 'drell-yan-w',
  Z: 'drell-yan-z',
  TT: 'top-pair',
  H: 'higgs-ggf',
});

const DEFINITIONS = Object.freeze([
  {
    id: PROCESS.DIJET, name: 'QCD dijet production',
    sigmaRef: 0.5 * PB_PER_MB, massScale: 40, channel: anyPair, enhancedWeight: 0.18,
  },
  {
    id: PROCESS.BB, name: 'Bottom-quark pair production',
    sigmaRef: 0.5 * PB_PER_MB, massScale: 10, channel: ggOnly, enhancedWeight: 0.12,
  },
  {
    id: PROCESS.W, name: 'W boson (Drell–Yan)',
    sigmaRef: 2.0e5, massScale: 80.37, channel: wChannel, enhancedWeight: 0.14,
  },
  {
    id: PROCESS.Z, name: 'Z boson (Drell–Yan)',
    sigmaRef: 6.0e4, massScale: 91.19, channel: zChannel, enhancedWeight: 0.14,
  },
  {
    id: PROCESS.TT, name: 'Top-quark pair production',
    sigmaRef: 924, massScale: 400, channel: ttChannel, enhancedWeight: 0.1,
  },
  {
    id: PROCESS.H, name: 'Higgs boson (gluon fusion)',
    sigmaRef: 52, massScale: 125.2, channel: ggOnly, enhancedWeight: 0.1,
  },
]);

/** Inelastic pp cross-section (mb): empirical fit, 52 mb at 0.9 TeV → 79 mb at 13.6 TeV. */
function sigmaInelastic(sqrtS) {
  const L = Math.log(sqrtS);
  return 22.9 + 0.6195 * L * L;
}

/** τ · dL/dτ for a channel at mass M and collision energy √s. */
const lumCache = new Map();
function luminosityTerm(M, sqrtS, channel, key) {
  const cacheKey = `${key}:${M}:${sqrtS.toFixed(1)}`;
  if (lumCache.has(cacheKey)) return lumCache.get(cacheKey);
  const tau = (M * M) / (sqrtS * sqrtS);
  let value = 0;
  if (tau < 1) {
    const result = samplePairAtTau(tau, channel, () => 0.5);
    value = result ? tau * result.luminosity : 0;
  }
  lumCache.set(cacheKey, value);
  return value;
}

const sigmaCache = new Map();

/**
 * Cross-sections (pb) of every process at a given √s (GeV).
 * @returns {Map<string, number>} including PROCESS.SOFT (the remainder)
 */
export function crossSections(sqrtS) {
  const key = sqrtS.toFixed(1);
  if (sigmaCache.has(key)) return sigmaCache.get(key);

  const result = new Map();
  let hardTotal = 0;
  for (const def of DEFINITIONS) {
    const ref = luminosityTerm(def.massScale, SQRT_S_REF, def.channel, def.id);
    const now = luminosityTerm(def.massScale, sqrtS, def.channel, def.id);
    const sigma = ref > 0 ? def.sigmaRef * (now / ref) : 0;
    result.set(def.id, sigma);
    hardTotal += sigma;
  }
  const inelastic = sigmaInelastic(sqrtS) * PB_PER_MB;
  result.set(PROCESS.SOFT, Math.max(0, inelastic - hardTotal));
  result.set('inelastic', inelastic);

  sigmaCache.set(key, result);
  return result;
}

/* =============================================================================
   Sampling utilities
   ============================================================================= */

/** Relativistic Breit–Wigner mass sample, truncated to M ± window·Γ. */
function sampleBreitWigner(M, width, random, window = 12, minMass = 0) {
  if (!(width > 0)) return M;
  const lo = Math.max(minMass, M - window * width);
  const hi = M + window * width;
  const thetaLo = Math.atan((lo * lo - M * M) / (M * width));
  const thetaHi = Math.atan((hi * hi - M * M) / (M * width));
  const theta = thetaLo + random() * (thetaHi - thetaLo);
  return Math.sqrt(Math.max(minMass * minMass, M * M + M * width * Math.tan(theta)));
}

/** Gamma(k = 2, θ) deviate: sum of two exponentials. */
const gamma2 = (theta, random) => -theta * Math.log((1 - random()) * (1 - random()));

/** Pick a flavor at x with probability ∝ x f(x), restricted to `allowed`. */
function chooseFlavor(x, random, allowed = PARTONS) {
  let total = 0;
  for (const code of allowed) total += xf(code, x);
  let r = random() * total;
  for (const code of allowed) {
    r -= xf(code, x);
    if (r <= 0) return code;
  }
  return allowed[0];
}

const totalXf = (x, allowed = PARTONS) => allowed.reduce((acc, code) => acc + xf(code, x), 0);

/** Partonic system four-momentum for momentum fractions (xa toward +z, xb toward −z). */
function partonSystem(xa, xb, sqrtS) {
  const Ea = 0.5 * xa * sqrtS;
  const Eb = 0.5 * xb * sqrtS;
  return new FourVector(Ea + Eb, 0, 0, Ea - Eb);
}

/** Two-body final state in the partonic CM frame, boosted to the lab. */
function twoBodyInFrame(system, m1, m2, cosTheta, phi) {
  const M = system.mass;
  const p = FourVector.twoBodyMomentum(M, m1, m2);
  const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
  const px = p * sinTheta * Math.cos(phi);
  const py = p * sinTheta * Math.sin(phi);
  const pz = p * cosTheta;
  const d1 = FourVector.fromMassMomentum(m1, px, py, pz).boostInPlace(system);
  const d2 = FourVector.fromMassMomentum(m2, -px, -py, -pz).boostInPlace(system);
  return [d1, d2];
}

/* =============================================================================
   Hard scatter generator
   ============================================================================= */

/**
 * @typedef {object} HardProcess
 * @property {string} id               PROCESS id
 * @property {string} name             human-readable process name
 * @property {string} label            e.g. "u ū → Z⁰"
 * @property {number} crossSection     σ at this √s (pb)
 * @property {number} trueProbability  σ / σ_inelastic
 * @property {boolean} enhanced        selected with rare-process enhancement
 * @property {{flavor:number,x:number}} partonA  from the +z beam
 * @property {{flavor:number,x:number}} partonB  from the −z beam
 * @property {number} sqrtSHat         partonic collision energy (GeV)
 * @property {Array<{pdg:number, momentum:FourVector}>} outgoing  lab-frame products
 */

export class HardScatter {
  #random;

  /** @param {{ random?: () => number }} [options] */
  constructor({ random = Math.random } = {}) {
    this.#random = random;
  }

  /**
   * Generate one hard process.
   *
   * @param {number} sqrtS  collision energy (GeV)
   * @param {{ enhanced?: boolean }} [options]
   * @returns {HardProcess}
   */
  generate(sqrtS, { enhanced = false } = {}) {
    const sigmas = crossSections(sqrtS);
    const id = this.#chooseProcess(sigmas, enhanced);
    const crossSection = sigmas.get(id);
    const trueProbability = crossSection / sigmas.get('inelastic');

    let result;
    switch (id) {
      case PROCESS.W:
        result = this.#resonance(sqrtS, W_PLUS, wChannel);
        break;
      case PROCESS.Z:
        result = this.#resonance(sqrtS, Z, zChannel);
        break;
      case PROCESS.H:
        result = this.#resonance(sqrtS, HIGGS, ggOnly);
        break;
      case PROCESS.TT:
        result = this.#topPair(sqrtS);
        break;
      case PROCESS.BB:
        result = this.#twoToTwo(sqrtS, { kind: 'bb' });
        break;
      case PROCESS.DIJET:
        result = this.#twoToTwo(sqrtS, { kind: 'dijet' });
        break;
      default:
        result = this.#twoToTwo(sqrtS, { kind: 'soft' });
    }

    // A process may be kinematically closed at very low √s; fall back to soft QCD.
    if (!result) {
      result = this.#twoToTwo(sqrtS, { kind: 'soft' });
      return this.#finish(PROCESS.SOFT, sigmas, enhanced, result);
    }
    return this.#finish(id, sigmas, enhanced, result, crossSection, trueProbability);
  }

  #finish(id, sigmas, enhanced, result, crossSection = sigmas.get(id), trueProbability) {
    const def = DEFINITIONS.find((d) => d.id === id);
    const name = def?.name ?? 'Soft QCD (minimum bias)';
    const sym = (code) => getParticle(code).symbol;
    const label = `${sym(result.partonA.flavor)} ${sym(result.partonB.flavor)} → ${result.outgoing
      .map((o) => sym(o.pdg))
      .join(' ')}`;

    return Object.freeze({
      id,
      name,
      label,
      crossSection,
      trueProbability: trueProbability ?? crossSection / sigmas.get('inelastic'),
      enhanced,
      ...result,
    });
  }

  #chooseProcess(sigmas, enhanced) {
    const entries = enhanced
      ? [
          ...DEFINITIONS.map((d) => [d.id, sigmas.get(d.id) > 0 ? d.enhancedWeight : 0]),
          [PROCESS.SOFT, 1 - DEFINITIONS.reduce((acc, d) => acc + d.enhancedWeight, 0)],
        ]
      : [...sigmas.entries()].filter(([key]) => key !== 'inelastic');

    const total = entries.reduce((acc, [, w]) => acc + w, 0);
    let r = this.#random() * total;
    for (const [key, w] of entries) {
      r -= w;
      if (r <= 0) return key;
    }
    return PROCESS.SOFT;
  }

  /* ---------------------------------------------------------------------------
     Resonance production: q q̄ → Z, q q̄′ → W±, g g → H
     --------------------------------------------------------------------------- */
  #resonance(sqrtS, pdg, channel) {
    const info = getParticle(pdg);
    const M = sampleBreitWigner(info.mass, info.width, this.#random);
    const tau = (M * M) / (sqrtS * sqrtS);
    if (tau >= 1) return null;

    const pair = samplePairAtTau(tau, channel, this.#random);
    if (!pair) return null;

    // For W production the parton charges fix the sign: u d̄ → W⁺, ū d → W⁻.
    let code = pdg;
    if (pdg === W_PLUS) {
      code = charge3(pair.flavor1) + charge3(pair.flavor2) > 0 ? W_PLUS : -W_PLUS;
    }

    const momentum = new FourVector(M * Math.cosh(pair.y), 0, 0, M * Math.sinh(pair.y));
    return {
      partonA: { flavor: pair.flavor1, x: pair.x1 },
      partonB: { flavor: pair.flavor2, x: pair.x2 },
      sqrtSHat: M,
      outgoing: [{ pdg: code, momentum }],
    };
  }

  /* ---------------------------------------------------------------------------
     Top-quark pairs
     --------------------------------------------------------------------------- */
  #topPair(sqrtS) {
    const top = getParticle(TOP);
    for (let attempt = 0; attempt < 20; attempt++) {
      const mtt = 2 * top.mass + gamma2(60, this.#random);
      const tau = (mtt * mtt) / (sqrtS * sqrtS);
      if (tau >= 1) return null;

      const pair = samplePairAtTau(tau, ttChannel, this.#random);
      if (!pair) return null;

      const m1 = sampleBreitWigner(top.mass, top.width, this.#random, 8);
      const m2 = sampleBreitWigner(top.mass, top.width, this.#random, 8);
      if (m1 + m2 >= mtt) continue;

      // cos θ* from 1 + cos²θ* (accept–reject).
      let c;
      do {
        c = 2 * this.#random() - 1;
      } while (this.#random() * 2 > 1 + c * c);
      const phi = 2 * Math.PI * this.#random();

      const system = partonSystem(pair.x1, pair.x2, sqrtS);
      const [t, tbar] = twoBodyInFrame(system, m1, m2, c, phi);
      return {
        partonA: { flavor: pair.flavor1, x: pair.x1 },
        partonB: { flavor: pair.flavor2, x: pair.x2 },
        sqrtSHat: mtt,
        outgoing: [
          { pdg: TOP, momentum: t },
          { pdg: -TOP, momentum: tbar },
        ],
      };
    }
    return null;
  }

  /* ---------------------------------------------------------------------------
     2 → 2 parton scattering: soft QCD, hard dijets, b b̄
     --------------------------------------------------------------------------- */
  #samplePt(kind, sqrtS) {
    const r = this.#random();
    if (kind === 'dijet') {
      // dσ/dpT ∝ pT⁻⁵ above 20 GeV (inverse CDF of a power law).
      const lo = 20;
      const hi = sqrtS / 2;
      const n = 4; // CDF exponent for pT⁻⁵
      return (lo ** -n - r * (lo ** -n - hi ** -n)) ** (-1 / n);
    }
    // Regularized spectrum dσ/dpT² ∝ 1/(pT² + pT0²)²  (Pythia-style).
    const pT0 =
      kind === 'bb' ? 5 : 2.28 * (sqrtS / 7000) ** 0.215; // energy-dependent soft cutoff
    const a = pT0 * pT0;
    const pMin = kind === 'bb' ? 1 : 0.25;
    const pMax = kind === 'bb' ? 2500 : 400; // in GeV²
    const inv = 1 / (pMin + a) - r * (1 / (pMin + a) - 1 / (pMax + a));
    return Math.sqrt(Math.max(0, 1 / inv - a));
  }

  #twoToTwo(sqrtS, { kind }) {
    const isBB = kind === 'bb';
    const m = isBB ? getParticle(BOTTOM).mass : 0;
    const allowed = isBB ? [GLUON] : PARTONS;
    const Y_MAX = 5;
    const candidates = [];
    let total = 0;

    // Sampling–importance–resampling over (pT, y₃, y₄).
    for (let i = 0; i < 64; i++) {
      const pt = this.#samplePt(kind, sqrtS);
      const mT = Math.sqrt(pt * pt + m * m);
      const y3 = (2 * this.#random() - 1) * Y_MAX;
      const y4 = (2 * this.#random() - 1) * Y_MAX;
      const xa = (mT * (Math.exp(y3) + Math.exp(y4))) / sqrtS;
      const xb = (mT * (Math.exp(-y3) + Math.exp(-y4))) / sqrtS;
      if (!(xa < 1 && xb < 1)) continue;

      const weight = totalXf(xa, allowed) * totalXf(xb, allowed);
      if (weight > 0) {
        total += weight;
        candidates.push({ pt, mT, y3, y4, xa, xb, weight });
      }
    }
    if (candidates.length === 0) return null;

    let r = this.#random() * total;
    let pick = candidates[candidates.length - 1];
    for (const cand of candidates) {
      r -= cand.weight;
      if (r <= 0) {
        pick = cand;
        break;
      }
    }

    const flavorA = chooseFlavor(pick.xa, this.#random, allowed);
    const flavorB = chooseFlavor(pick.xb, this.#random, allowed);

    // Outgoing flavors: dominant t-channel exchange keeps the parton flavors;
    // for heavy flavor the gluons produce a b b̄ pair.
    let out3 = flavorA;
    let out4 = flavorB;
    if (isBB) {
      const flip = this.#random() < 0.5;
      out3 = flip ? BOTTOM : -BOTTOM;
      out4 = -out3;
    }

    const phi = 2 * Math.PI * this.#random();
    const mom3 = new FourVector(
      pick.mT * Math.cosh(pick.y3),
      pick.pt * Math.cos(phi),
      pick.pt * Math.sin(phi),
      pick.mT * Math.sinh(pick.y3),
    );
    const mom4 = new FourVector(
      pick.mT * Math.cosh(pick.y4),
      -pick.pt * Math.cos(phi),
      -pick.pt * Math.sin(phi),
      pick.mT * Math.sinh(pick.y4),
    );

    return {
      partonA: { flavor: flavorA, x: pick.xa },
      partonB: { flavor: flavorB, x: pick.xb },
      sqrtSHat: mom3.add(mom4).mass,
      outgoing: [
        { pdg: out3, momentum: mom3 },
        { pdg: out4, momentum: mom4 },
      ],
    };
  }
}