/**
 * Hadron Collider — Particle catalog
 *
 * Every particle the simulation can create, with measured properties.
 *
 * SOURCES
 *   Particle Data Group (PDG), Review of Particle Physics (2024 edition).
 *   CODATA 2022 for the electron, muon, proton, and neutron masses.
 *
 * IDENTIFIERS
 *   Particles use the official PDG Monte Carlo numbering scheme, the same
 *   codes used by real event generators (Pythia, Herwig, Sherpa).
 *   A negative code denotes the antiparticle: 11 = e⁻, −11 = e⁺.
 *
 * QUANTUM NUMBERS ARE STORED AS INTEGERS
 *   charge3   electric charge in thirds of e   (u quark = +2, electron = −3)
 *   baryon3   baryon number in thirds          (quark = +1, proton = +3)
 *   lepton    lepton number                    (e⁻, μ⁻, τ⁻, ν = +1)
 *   Integers make conservation checks exact; no floating-point drift.
 *
 * UNITS
 *   mass in GeV/c², width in GeV, lifetime in seconds (Infinity = stable).
 *
 * NOTE ON QUARK MASSES
 *   Quarks are never observed in isolation (confinement), so their masses are
 *   scheme-dependent: u, d, s are MS-bar masses at 2 GeV; c and b are MS-bar
 *   masses m(m); the top mass is from direct measurements.
 */
import { PHYSICS } from '../config/constants.js';

const MeV = 1e-3;
const keV = 1e-6;

/** Lifetime τ = ħ / Γ for particles specified by their decay width. */
const fromWidth = (width) => PHYSICS.HBAR / width;

/**
 * Raw catalog, keyed by positive PDG code. All values describe the particle
 * (positive code); antiparticle properties are derived in getParticle().
 */
const CATALOG = {
  /* ===========================================================================
     QUARKS — fundamental, spin ½, carry color charge. Never seen free.
     =========================================================================== */
  1: {
    key: 'down', name: 'down quark', antiName: 'down antiquark',
    symbol: 'd', antiSymbol: 'd̄',
    family: 'quark', generation: 1,
    mass: 4.7 * MeV, charge3: -1, baryon3: 1, lepton: 0, spin: 0.5,
    lifetime: Infinity, displayKind: 'jet', selfConjugate: false,
  },
  2: {
    key: 'up', name: 'up quark', antiName: 'up antiquark',
    symbol: 'u', antiSymbol: 'ū',
    family: 'quark', generation: 1,
    mass: 2.16 * MeV, charge3: 2, baryon3: 1, lepton: 0, spin: 0.5,
    lifetime: Infinity, displayKind: 'jet', selfConjugate: false,
  },
  3: {
    key: 'strange', name: 'strange quark', antiName: 'strange antiquark',
    symbol: 's', antiSymbol: 's̄',
    family: 'quark', generation: 2,
    mass: 93.5 * MeV, charge3: -1, baryon3: 1, lepton: 0, spin: 0.5,
    lifetime: Infinity, displayKind: 'jet', selfConjugate: false,
  },
  4: {
    key: 'charm', name: 'charm quark', antiName: 'charm antiquark',
    symbol: 'c', antiSymbol: 'c̄',
    family: 'quark', generation: 2,
    mass: 1.273, charge3: 2, baryon3: 1, lepton: 0, spin: 0.5,
    lifetime: Infinity, displayKind: 'jet', selfConjugate: false,
  },
  5: {
    key: 'bottom', name: 'bottom quark', antiName: 'bottom antiquark',
    symbol: 'b', antiSymbol: 'b̄',
    family: 'quark', generation: 3,
    mass: 4.183, charge3: -1, baryon3: 1, lepton: 0, spin: 0.5,
    lifetime: Infinity, displayKind: 'jet', selfConjugate: false,
  },
  6: {
    key: 'top', name: 'top quark', antiName: 'top antiquark',
    symbol: 't', antiSymbol: 't̄',
    family: 'quark', generation: 3,
    // The only quark that decays before it can form a hadron (τ ≈ 5 × 10⁻²⁵ s).
    mass: 172.57, width: 1.42, charge3: 2, baryon3: 1, lepton: 0, spin: 0.5,
    displayKind: 'jet', selfConjugate: false,
  },

  /* ===========================================================================
     LEPTONS — fundamental, spin ½, no color charge.
     =========================================================================== */
  11: {
    key: 'electron', name: 'electron', antiName: 'positron',
    symbol: 'e⁻', antiSymbol: 'e⁺',
    family: 'lepton', generation: 1,
    mass: 0.510_998_950_69 * MeV, charge3: -3, baryon3: 0, lepton: 1, spin: 0.5,
    lifetime: Infinity, displayKind: 'electron', selfConjugate: false,
  },
  12: {
    key: 'nu_e', name: 'electron neutrino', antiName: 'electron antineutrino',
    symbol: 'νₑ', antiSymbol: 'ν̄ₑ',
    family: 'lepton', generation: 1,
    // Neutrino masses are non-zero but below ~0.8 eV; negligible at LHC energies.
    mass: 0, charge3: 0, baryon3: 0, lepton: 1, spin: 0.5,
    lifetime: Infinity, displayKind: 'neutrino', selfConjugate: false,
  },
  13: {
    key: 'muon', name: 'muon', antiName: 'antimuon',
    symbol: 'μ⁻', antiSymbol: 'μ⁺',
    family: 'lepton', generation: 2,
    mass: 105.658_375_5 * MeV, charge3: -3, baryon3: 0, lepton: 1, spin: 0.5,
    lifetime: 2.196_981_1e-6, displayKind: 'muon', selfConjugate: false,
  },
  14: {
    key: 'nu_mu', name: 'muon neutrino', antiName: 'muon antineutrino',
    symbol: 'ν_μ', antiSymbol: 'ν̄_μ',
    family: 'lepton', generation: 2,
    mass: 0, charge3: 0, baryon3: 0, lepton: 1, spin: 0.5,
    lifetime: Infinity, displayKind: 'neutrino', selfConjugate: false,
  },
  15: {
    key: 'tau', name: 'tau', antiName: 'antitau',
    symbol: 'τ⁻', antiSymbol: 'τ⁺',
    family: 'lepton', generation: 3,
    mass: 1_776.93 * MeV, charge3: -3, baryon3: 0, lepton: 1, spin: 0.5,
    lifetime: 290.3e-15, displayKind: 'charged', selfConjugate: false,
  },
  16: {
    key: 'nu_tau', name: 'tau neutrino', antiName: 'tau antineutrino',
    symbol: 'ν_τ', antiSymbol: 'ν̄_τ',
    family: 'lepton', generation: 3,
    mass: 0, charge3: 0, baryon3: 0, lepton: 1, spin: 0.5,
    lifetime: Infinity, displayKind: 'neutrino', selfConjugate: false,
  },

  /* ===========================================================================
     GAUGE BOSONS — force carriers, spin 1.
     =========================================================================== */
  21: {
    key: 'gluon', name: 'gluon', antiName: 'gluon',
    symbol: 'g', antiSymbol: 'g',
    family: 'gauge-boson',
    // Carries the strong force; massless, and itself carries color charge.
    mass: 0, charge3: 0, baryon3: 0, lepton: 0, spin: 1,
    lifetime: Infinity, displayKind: 'jet', selfConjugate: true,
  },
  22: {
    key: 'photon', name: 'photon', antiName: 'photon',
    symbol: 'γ', antiSymbol: 'γ',
    family: 'gauge-boson',
    mass: 0, charge3: 0, baryon3: 0, lepton: 0, spin: 1,
    lifetime: Infinity, displayKind: 'photon', selfConjugate: true,
  },
  23: {
    key: 'Z', name: 'Z boson', antiName: 'Z boson',
    symbol: 'Z⁰', antiSymbol: 'Z⁰',
    family: 'gauge-boson',
    mass: 91.188, width: 2.4955, charge3: 0, baryon3: 0, lepton: 0, spin: 1,
    displayKind: 'neutral', selfConjugate: true,
  },
  24: {
    key: 'W', name: 'W⁺ boson', antiName: 'W⁻ boson',
    symbol: 'W⁺', antiSymbol: 'W⁻',
    family: 'gauge-boson',
    mass: 80.3692, width: 2.085, charge3: 3, baryon3: 0, lepton: 0, spin: 1,
    displayKind: 'charged', selfConjugate: false,
  },

  /* ===========================================================================
     SCALAR BOSON — the Higgs, spin 0. Discovered at the LHC, 4 July 2012.
     =========================================================================== */
  25: {
    key: 'higgs', name: 'Higgs boson', antiName: 'Higgs boson',
    symbol: 'H', antiSymbol: 'H',
    family: 'scalar-boson',
    // Width: PDG measured value 3.7 MeV; the Standard Model predicts ≈ 4.1 MeV.
    mass: 125.2, width: 3.7 * MeV, charge3: 0, baryon3: 0, lepton: 0, spin: 0,
    displayKind: 'neutral', selfConjugate: true,
  },

  /* ===========================================================================
     LIGHT MESONS — quark + antiquark, integer spin.
     =========================================================================== */
  111: {
    key: 'pi0', name: 'neutral pion', antiName: 'neutral pion',
    symbol: 'π⁰', antiSymbol: 'π⁰',
    family: 'meson', content: '(uū − dd̄)/√2', antiContent: '(uū − dd̄)/√2',
    mass: 134.9768 * MeV, charge3: 0, baryon3: 0, lepton: 0, spin: 0,
    lifetime: 8.43e-17, displayKind: 'neutral', selfConjugate: true,
  },
  211: {
    key: 'pi_plus', name: 'charged pion', antiName: 'charged pion',
    symbol: 'π⁺', antiSymbol: 'π⁻',
    family: 'meson', content: 'ud̄', antiContent: 'ūd',
    mass: 139.570_39 * MeV, charge3: 3, baryon3: 0, lepton: 0, spin: 0,
    lifetime: 2.6033e-8, displayKind: 'charged', selfConjugate: false,
  },
  221: {
    key: 'eta', name: 'eta meson', antiName: 'eta meson',
    symbol: 'η', antiSymbol: 'η',
    family: 'meson', content: '≈(uū + dd̄ − 2ss̄)/√6', antiContent: '≈(uū + dd̄ − 2ss̄)/√6',
    mass: 547.862 * MeV, width: 1.31 * keV, charge3: 0, baryon3: 0, lepton: 0, spin: 0,
    displayKind: 'neutral', selfConjugate: true,
  },
  321: {
    key: 'K_plus', name: 'charged kaon', antiName: 'charged kaon',
    symbol: 'K⁺', antiSymbol: 'K⁻',
    family: 'meson', content: 'us̄', antiContent: 'ūs',
    mass: 493.677 * MeV, charge3: 3, baryon3: 0, lepton: 0, spin: 0,
    lifetime: 1.238e-8, displayKind: 'charged', selfConjugate: false,
  },
  310: {
    key: 'K_short', name: 'K-short', antiName: 'K-short',
    symbol: 'K⁰_S', antiSymbol: 'K⁰_S',
    family: 'meson', content: '≈(ds̄ − sd̄)/√2', antiContent: '≈(ds̄ − sd̄)/√2',
    mass: 497.611 * MeV, charge3: 0, baryon3: 0, lepton: 0, spin: 0,
    lifetime: 8.954e-11, displayKind: 'neutral', selfConjugate: true,
  },
  130: {
    key: 'K_long', name: 'K-long', antiName: 'K-long',
    symbol: 'K⁰_L', antiSymbol: 'K⁰_L',
    family: 'meson', content: '≈(ds̄ + sd̄)/√2', antiContent: '≈(ds̄ + sd̄)/√2',
    mass: 497.611 * MeV, charge3: 0, baryon3: 0, lepton: 0, spin: 0,
    lifetime: 5.116e-8, displayKind: 'neutral', selfConjugate: true,
  },

  /* ===========================================================================
     HEAVY-FLAVOR MESONS — contain a charm or bottom quark. Their picosecond
     lifetimes create displaced vertices, the basis of "b-tagging".
     =========================================================================== */
  411: {
    key: 'D_plus', name: 'D⁺ meson', antiName: 'D⁻ meson',
    symbol: 'D⁺', antiSymbol: 'D⁻',
    family: 'meson', content: 'cd̄', antiContent: 'c̄d',
    mass: 1_869.66 * MeV, charge3: 3, baryon3: 0, lepton: 0, spin: 0,
    lifetime: 1.033e-12, displayKind: 'charged', selfConjugate: false,
  },
  421: {
    key: 'D0', name: 'D⁰ meson', antiName: 'anti-D⁰ meson',
    symbol: 'D⁰', antiSymbol: 'D̄⁰',
    family: 'meson', content: 'cū', antiContent: 'c̄u',
    mass: 1_864.84 * MeV, charge3: 0, baryon3: 0, lepton: 0, spin: 0,
    lifetime: 4.103e-13, displayKind: 'neutral', selfConjugate: false,
  },
  511: {
    key: 'B0', name: 'B⁰ meson', antiName: 'anti-B⁰ meson',
    symbol: 'B⁰', antiSymbol: 'B̄⁰',
    family: 'meson', content: 'db̄', antiContent: 'd̄b',
    mass: 5_279.72 * MeV, charge3: 0, baryon3: 0, lepton: 0, spin: 0,
    lifetime: 1.517e-12, displayKind: 'neutral', selfConjugate: false,
  },
  521: {
    key: 'B_plus', name: 'B⁺ meson', antiName: 'B⁻ meson',
    symbol: 'B⁺', antiSymbol: 'B⁻',
    family: 'meson', content: 'ub̄', antiContent: 'ūb',
    mass: 5_279.41 * MeV, charge3: 3, baryon3: 0, lepton: 0, spin: 0,
    lifetime: 1.638e-12, displayKind: 'charged', selfConjugate: false,
  },

  /* ===========================================================================
     QUARKONIA — a heavy quark bound to its own antiquark.
     J/ψ (1974, "November Revolution") confirmed the charm quark;
     Υ (1977) revealed the bottom quark.
     =========================================================================== */
  443: {
    key: 'J_psi', name: 'J/psi meson', antiName: 'J/psi meson',
    symbol: 'J/ψ', antiSymbol: 'J/ψ',
    family: 'meson', content: 'cc̄', antiContent: 'cc̄',
    mass: 3_096.9 * MeV, width: 92.6 * keV, charge3: 0, baryon3: 0, lepton: 0, spin: 1,
    displayKind: 'neutral', selfConjugate: true,
  },
  553: {
    key: 'Upsilon', name: 'Upsilon (1S) meson', antiName: 'Upsilon (1S) meson',
    symbol: 'Υ(1S)', antiSymbol: 'Υ(1S)',
    family: 'meson', content: 'bb̄', antiContent: 'bb̄',
    mass: 9_460.4 * MeV, width: 54.02 * keV, charge3: 0, baryon3: 0, lepton: 0, spin: 1,
    displayKind: 'neutral', selfConjugate: true,
  },

  /* ===========================================================================
     BARYONS — three quarks, half-integer spin.
     =========================================================================== */
  2212: {
    key: 'proton', name: 'proton', antiName: 'antiproton',
    symbol: 'p', antiSymbol: 'p̄',
    family: 'baryon', content: 'uud', antiContent: 'ūūd̄',
    // Experimental lower bound on the proton lifetime exceeds 10³⁴ years.
    mass: PHYSICS.PROTON_MASS, charge3: 3, baryon3: 3, lepton: 0, spin: 0.5,
    lifetime: Infinity, displayKind: 'charged', selfConjugate: false,
  },
  2112: {
    key: 'neutron', name: 'neutron', antiName: 'antineutron',
    symbol: 'n', antiSymbol: 'n̄',
    family: 'baryon', content: 'udd', antiContent: 'ūd̄d̄',
    // Free-neutron lifetime ≈ 878 s; effectively stable on detector timescales.
    mass: 939.565_421_94 * MeV, charge3: 0, baryon3: 3, lepton: 0, spin: 0.5,
    lifetime: 878.4, displayKind: 'neutral', selfConjugate: false,
  },
  3122: {
    key: 'Lambda', name: 'Lambda baryon', antiName: 'anti-Lambda baryon',
    symbol: 'Λ', antiSymbol: 'Λ̄',
    family: 'baryon', content: 'uds', antiContent: 'ūd̄s̄',
    mass: 1_115.683 * MeV, charge3: 0, baryon3: 3, lepton: 0, spin: 0.5,
    lifetime: 2.617e-10, displayKind: 'neutral', selfConjugate: false,
  },
};

/* =============================================================================
   Finalize: derive lifetimes from widths, freeze everything.
   ============================================================================= */
for (const [code, def] of Object.entries(CATALOG)) {
  def.pdg = Number(code);
  def.width ??= 0;
  if (def.lifetime === undefined) def.lifetime = fromWidth(def.width);
  def.content ??= null;
  def.antiContent ??= def.content;
  Object.freeze(def);
}
Object.freeze(CATALOG);

/* =============================================================================
   Public API
   ============================================================================= */

/** Readable aliases for PDG codes used throughout the code. */
export const PDG = Object.freeze({
  DOWN: 1, UP: 2, STRANGE: 3, CHARM: 4, BOTTOM: 5, TOP: 6,
  ELECTRON: 11, NU_E: 12, MUON: 13, NU_MU: 14, TAU: 15, NU_TAU: 16,
  GLUON: 21, PHOTON: 22, Z: 23, W_PLUS: 24, HIGGS: 25,
  PI0: 111, PI_PLUS: 211, ETA: 221, K_PLUS: 321, K_SHORT: 310, K_LONG: 130,
  D_PLUS: 411, D0: 421, B0: 511, B_PLUS: 521,
  J_PSI: 443, UPSILON: 553,
  PROTON: 2212, NEUTRON: 2112, LAMBDA: 3122,
});

const resolvedCache = new Map();

/**
 * Look up a particle or antiparticle by PDG code.
 * Negative codes return the antiparticle with charge, baryon number,
 * lepton number, name, symbol, and quark content conjugated.
 *
 * @param {number} pdg  PDG Monte Carlo code (negative for antiparticles)
 * @returns {Readonly<object>} particle descriptor
 * @throws {RangeError} if the code is not in the catalog
 */
export function getParticle(pdg) {
  const cached = resolvedCache.get(pdg);
  if (cached) return cached;

  const def = CATALOG[Math.abs(pdg)];
  if (!def) throw new RangeError(`Unknown PDG code: ${pdg}`);

  let resolved;
  if (pdg > 0 || def.selfConjugate) {
    resolved = Object.freeze({ ...def, pdg: def.selfConjugate ? Math.abs(pdg) : pdg, isAnti: false });
  } else {
    resolved = Object.freeze({
      ...def,
      pdg,
      isAnti: true,
      name: def.antiName,
      symbol: def.antiSymbol,
      content: def.antiContent,
      charge3: -def.charge3,
      baryon3: -def.baryon3,
      lepton: -def.lepton,
    });
  }

  resolvedCache.set(pdg, resolved);
  return resolved;
}

/** Charge-conjugate code: particle ↔ antiparticle (self-conjugate codes are unchanged). */
export function antiOf(pdg) {
  const def = CATALOG[Math.abs(pdg)];
  if (!def) throw new RangeError(`Unknown PDG code: ${pdg}`);
  return def.selfConjugate ? Math.abs(pdg) : -pdg;
}

/** Electric charge in units of e (e.g. +2/3 for an up quark). */
export const chargeOf = (pdg) => getParticle(pdg).charge3 / 3;

/** Proper decay length cτ in metres (Infinity for stable particles). */
export const properDecayLength = (pdg) => PHYSICS.SPEED_OF_LIGHT * getParticle(pdg).lifetime;

export const isQuark = (pdg) => Math.abs(pdg) >= 1 && Math.abs(pdg) <= 6;
export const isGluon = (pdg) => Math.abs(pdg) === 21;
export const isParton = (pdg) => isQuark(pdg) || isGluon(pdg);
export const isLepton = (pdg) => Math.abs(pdg) >= 11 && Math.abs(pdg) <= 16;
export const isNeutrino = (pdg) => [12, 14, 16].includes(Math.abs(pdg));
export const isChargedLepton = (pdg) => [11, 13, 15].includes(Math.abs(pdg));
export const isHadron = (pdg) => {
  const family = getParticle(pdg).family;
  return family === 'meson' || family === 'baryon';
};
export const isCharged = (pdg) => getParticle(pdg).charge3 !== 0;

/** Every catalogued particle (positive codes), for the physics reference panel. */
export const ALL_PARTICLES = Object.freeze(Object.values(CATALOG));