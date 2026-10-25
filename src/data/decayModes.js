/**
 * Hadron Collider — Decay tables
 *
 * Branching ratios (BR): the measured fraction of decays that proceed through
 * each final state. Keyed by positive PDG code; antiparticle decays are the
 * charge conjugates and are derived automatically.
 *
 * SOURCES
 *   Particle Data Group (PDG), Review of Particle Physics (2024 edition).
 *   Higgs branching ratios: LHC Higgs Working Group (CERN Yellow Report 4),
 *   Standard Model predictions for m_H ≈ 125 GeV.
 *
 * COVERAGE
 *   Each table lists the dominant modes. Where the listed modes do not sum to
 *   exactly 100% (many tiny modes omitted), the probabilities are renormalized
 *   over the listed set. Heavy-flavor (D, B) tables use representative
 *   exclusive modes and are marked `representative: true`.
 *
 * OFF-SHELL MODES
 *   H → WW* and H → ZZ*: the Higgs (125 GeV) is lighter than two real W or Z
 *   bosons, so one of the pair is "virtual" (off its mass shell). These modes
 *   are flagged `offShell` and the decay engine samples the virtual mass.
 *
 * VALIDATION
 *   At load time every mode is checked for conservation of electric charge,
 *   baryon number, and lepton number, and for kinematic accessibility.
 *   A violation throws immediately, so no unphysical decay can ever run.
 */
import { getParticle, antiOf, PDG } from './particles.js';

const {
  DOWN: d, UP: u, STRANGE: s, CHARM: c, BOTTOM: b,
  ELECTRON: e, NU_E: ve, MUON: mu, NU_MU: vm, TAU: tau, NU_TAU: vt,
  GLUON: g, PHOTON: gamma, Z, W_PLUS: W, HIGGS: H,
  PI0: pi0, PI_PLUS: pip, ETA: eta, K_PLUS: Kp, K_SHORT: KS, K_LONG: KL,
  D_PLUS: Dp, D0, B0, B_PLUS: Bp, J_PSI: Jpsi, UPSILON: Ups,
  PROTON: p, NEUTRON: n, LAMBDA: Lam, TOP: t,
} = PDG;

/* =============================================================================
   Raw decay tables (particle, not antiparticle)
   ============================================================================= */
const TABLES = {
  /* -------------------------------- Top quark -------------------------------- */
  [t]: {
    // |V_tb| ≈ 1: the top decays to W b essentially every time.
    modes: [{ br: 1.0, products: [W, b] }],
  },

  /* ------------------------------- W⁺ boson ---------------------------------- */
  [W]: {
    modes: [
      { br: 0.1071, products: [-e, ve] },
      { br: 0.1063, products: [-mu, vm] },
      { br: 0.1138, products: [-tau, vt] },
      // Hadronic 67.41% total, split by CKM matrix elements.
      { br: 0.3189, products: [u, -d] },
      { br: 0.3184, products: [c, -s] },
      { br: 0.0170, products: [u, -s] },
      { br: 0.0170, products: [c, -d] },
    ],
  },

  /* -------------------------------- Z boson ---------------------------------- */
  [Z]: {
    modes: [
      { br: 0.033632, products: [e, -e] },
      { br: 0.033662, products: [mu, -mu] },
      { br: 0.033696, products: [tau, -tau] },
      // Invisible width (20.000%): three neutrino flavors. Seen only as missing E_T.
      { br: 0.066667, products: [ve, -ve] },
      { br: 0.066667, products: [vm, -vm] },
      { br: 0.066667, products: [vt, -vt] },
      // Hadronic 69.911%: R_b = 0.21629 and R_c = 0.1721 measured at LEP/SLD.
      { br: 0.1512, products: [b, -b] },
      { br: 0.1203, products: [c, -c] },
      { br: 0.156, products: [s, -s] },
      { br: 0.156, products: [d, -d] },
      { br: 0.1156, products: [u, -u] },
    ],
  },

  /* ----------------------------- Higgs boson --------------------------------- */
  [H]: {
    modes: [
      { br: 0.582, products: [b, -b] },
      { br: 0.214, products: [W, -W], offShell: true },
      { br: 0.0819, products: [g, g] },
      { br: 0.0627, products: [tau, -tau] },
      { br: 0.0289, products: [c, -c] },
      { br: 0.0262, products: [Z, Z], offShell: true },
      // H → γγ: rare (0.23%) but very clean. One of the two discovery channels in 2012.
      { br: 0.00227, products: [gamma, gamma] },
      { br: 0.00153, products: [Z, gamma] },
      { br: 0.000218, products: [mu, -mu] },
    ],
  },

  /* --------------------------------- Leptons --------------------------------- */
  [mu]: {
    modes: [{ br: 1.0, products: [e, -ve, vm] }],
  },
  [tau]: {
    modes: [
      { br: 0.1782, products: [e, -ve, vt] },
      { br: 0.1739, products: [mu, -vm, vt] },
      { br: 0.1082, products: [-pip, vt] },
      { br: 0.2549, products: [-pip, pi0, vt] },
      { br: 0.0926, products: [-pip, pi0, pi0, vt] },
      { br: 0.0899, products: [-pip, -pip, pip, vt] },
      { br: 0.0274, products: [-pip, -pip, pip, pi0, vt] },
      { br: 0.00696, products: [-Kp, vt] },
    ],
  },

  /* ------------------------------ Light mesons ------------------------------- */
  [pi0]: {
    modes: [
      { br: 0.98823, products: [gamma, gamma] },
      { br: 0.01174, products: [-e, e, gamma] }, // Dalitz decay
    ],
  },
  [pip]: {
    modes: [
      { br: 0.99988, products: [-mu, vm] },
      // Helicity-suppressed: far rarer than the muon mode despite more phase space.
      { br: 1.23e-4, products: [-e, ve] },
    ],
  },
  [eta]: {
    modes: [
      { br: 0.3936, products: [gamma, gamma] },
      { br: 0.3257, products: [pi0, pi0, pi0] },
      { br: 0.2292, products: [pip, -pip, pi0] },
      { br: 0.0422, products: [pip, -pip, gamma] },
    ],
  },
  [Kp]: {
    modes: [
      { br: 0.6356, products: [-mu, vm] },
      { br: 0.2067, products: [pip, pi0] },
      { br: 0.05583, products: [pip, pip, -pip] },
      { br: 0.0507, products: [pi0, -e, ve] },
      { br: 0.03352, products: [pi0, -mu, vm] },
      { br: 0.0176, products: [pip, pi0, pi0] },
    ],
  },
  [KS]: {
    modes: [
      { br: 0.692, products: [pip, -pip] },
      { br: 0.3069, products: [pi0, pi0] },
    ],
  },
  [KL]: {
    modes: [
      { br: 0.20275, products: [pip, e, -ve] },
      { br: 0.20275, products: [-pip, -e, ve] },
      { br: 0.1352, products: [pip, mu, -vm] },
      { br: 0.1352, products: [-pip, -mu, vm] },
      { br: 0.1952, products: [pi0, pi0, pi0] },
      { br: 0.1254, products: [pip, -pip, pi0] },
    ],
  },

  /* ---------------------------- Charm mesons --------------------------------- */
  [Dp]: {
    representative: true,
    modes: [
      { br: 0.0938, products: [-Kp, pip, pip] },
      { br: 0.0625, products: [-Kp, pip, pip, pi0] },
      { br: 0.0736, products: [KS, pip, pi0] },
      { br: 0.01562, products: [KS, pip] },
      // D⁺ → K̄⁰ e⁺ νₑ (8.72%); K̄⁰ appears as K_S or K_L with equal probability.
      { br: 0.0436, products: [KS, -e, ve] },
      { br: 0.0436, products: [KL, -e, ve] },
    ],
  },
  [D0]: {
    representative: true,
    modes: [
      { br: 0.03947, products: [-Kp, pip] },
      { br: 0.144, products: [-Kp, pip, pi0] },
      { br: 0.0822, products: [-Kp, pip, pip, -pip] },
      { br: 0.028, products: [KS, pip, -pip] },
      { br: 0.03549, products: [-Kp, -e, ve] },
      { br: 0.0341, products: [-Kp, -mu, vm] },
    ],
  },

  /* ---------------------------- Bottom mesons -------------------------------- */
  // B⁺ = u b̄. The b̄ decays (mostly) to c̄, producing an anti-D meson.
  [Bp]: {
    representative: true,
    modes: [
      { br: 0.00461, products: [-D0, pip] },
      { br: 0.0235, products: [-D0, -e, ve] },
      { br: 0.0235, products: [-D0, -mu, vm] },
      { br: 0.0056, products: [-D0, pip, pip, -pip] },
      // B⁺ → J/ψ K⁺: a classic "golden" channel (J/ψ → μ⁺μ⁻).
      { br: 0.00102, products: [Jpsi, Kp] },
    ],
  },
  [B0]: {
    representative: true,
    modes: [
      { br: 0.00252, products: [-Dp, pip] },
      { br: 0.0231, products: [-Dp, -e, ve] },
      { br: 0.0231, products: [-Dp, -mu, vm] },
      { br: 0.006, products: [-Dp, pip, pip, -pip] },
      // B⁰ → J/ψ K_S: the channel used to measure CP violation in B mesons.
      { br: 0.000446, products: [Jpsi, KS] },
    ],
  },

  /* ------------------------------- Quarkonia --------------------------------- */
  [Jpsi]: {
    modes: [
      { br: 0.05971, products: [e, -e] },
      { br: 0.05961, products: [mu, -mu] },
      // Hadronic decays proceed mainly through three gluons (ggg).
      { br: 0.8807, products: [g, g, g] },
    ],
  },
  [Ups]: {
    modes: [
      { br: 0.0238, products: [e, -e] },
      { br: 0.0248, products: [mu, -mu] },
      { br: 0.026, products: [tau, -tau] },
      { br: 0.9254, products: [g, g, g] },
    ],
  },

  /* -------------------------------- Baryons ---------------------------------- */
  [Lam]: {
    modes: [
      { br: 0.641, products: [p, -pip] },
      { br: 0.359, products: [n, pi0] },
    ],
  },
};

/* =============================================================================
   Validation — conservation laws and kinematic thresholds
   ============================================================================= */
function validateMode(parentPdg, mode) {
  const parent = getParticle(parentPdg);
  const products = mode.products.map(getParticle);
  const sum = (key) => products.reduce((acc, prt) => acc + prt[key], 0);
  const label = `${parent.symbol} → ${products.map((prt) => prt.symbol).join(' ')}`;

  if (sum('charge3') !== parent.charge3) {
    throw new Error(`Decay table violates charge conservation: ${label}`);
  }
  if (sum('baryon3') !== parent.baryon3) {
    throw new Error(`Decay table violates baryon-number conservation: ${label}`);
  }
  if (sum('lepton') !== parent.lepton) {
    throw new Error(`Decay table violates lepton-number conservation: ${label}`);
  }
  if (!mode.offShell) {
    const threshold = products.reduce((acc, prt) => acc + prt.mass, 0);
    if (threshold >= parent.mass) {
      throw new Error(`Decay is kinematically forbidden (Σm ≥ M): ${label}`);
    }
  }
  if (!(mode.br > 0)) {
    throw new Error(`Branching ratio must be positive: ${label}`);
  }
}

/* =============================================================================
   Build normalized, frozen tables with cumulative distributions for sampling
   ============================================================================= */
const BUILT = new Map();

for (const [code, table] of Object.entries(TABLES)) {
  const pdg = Number(code);
  let total = 0;
  for (const mode of table.modes) {
    validateMode(pdg, mode);
    total += mode.br;
  }

  let running = 0;
  const modes = table.modes.map((mode) => {
    const probability = mode.br / total;
    running += probability;
    return Object.freeze({
      products: Object.freeze([...mode.products]),
      br: mode.br,
      probability,
      cumulative: running,
      offShell: Boolean(mode.offShell),
    });
  });

  BUILT.set(
    pdg,
    Object.freeze({
      modes: Object.freeze(modes),
      coverage: total,
      representative: Boolean(table.representative),
    }),
  );
}

/* =============================================================================
   Public API
   ============================================================================= */

/** True if the particle (or antiparticle) has a decay table. */
export function hasDecayTable(pdg) {
  return BUILT.has(Math.abs(pdg));
}

/**
 * Decay table for a particle or antiparticle.
 * For antiparticles, each product is charge-conjugated (CP-symmetric rates).
 *
 * @param {number} pdg
 * @returns {{ modes: ReadonlyArray<object>, coverage: number, representative: boolean } | null}
 */
const conjugatedCache = new Map();

export function getDecayTable(pdg) {
  const base = BUILT.get(Math.abs(pdg));
  if (!base) return null;

  const particle = getParticle(pdg);
  if (!particle.isAnti) return base;

  const cached = conjugatedCache.get(pdg);
  if (cached) return cached;

  const conjugated = Object.freeze({
    ...base,
    modes: Object.freeze(
      base.modes.map((mode) =>
        Object.freeze({ ...mode, products: Object.freeze(mode.products.map(antiOf)) }),
      ),
    ),
  });
  conjugatedCache.set(pdg, conjugated);
  return conjugated;
}

/**
 * Choose a decay mode at random according to its branching ratio.
 *
 * @param {number} pdg
 * @param {() => number} random  uniform generator on [0, 1)
 * @returns {Readonly<object> | null} the chosen mode, or null if stable/untabulated
 */
export function sampleDecayMode(pdg, random) {
  const table = getDecayTable(pdg);
  if (!table) return null;

  const r = random();
  for (const mode of table.modes) {
    if (r < mode.cumulative) return mode;
  }
  return table.modes[table.modes.length - 1];
}

/** Human-readable label for a decay mode, e.g. "Z⁰ → μ⁻ μ⁺". */
export function describeDecay(parentPdg, mode) {
  const parent = getParticle(parentPdg).symbol;
  const products = mode.products.map((code) => getParticle(code).symbol).join(' ');
  return `${parent} → ${products}`;
}