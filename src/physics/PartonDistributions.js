/**
 * Hadron Collider — Parton distribution functions (PDFs)
 *
 * f_i(x) dx is the number of partons of flavor i carrying a fraction between
 * x and x + dx of the proton's momentum. The functions here are written as
 * x·f(x), the momentum density, using the standard parametric form
 *
 *     x f(x) = A · x^a · (1 − x)^b
 *
 * normalized analytically with Euler Beta functions:
 *     number   ∫ f dx    = A · B(a, b + 1)
 *     momentum ∫ x f dx  = A · B(a + 1, b + 1)
 *
 * PHYSICS ENCODED
 *   • Valence sum rules (exact): ∫(u − ū) dx = 2,  ∫(d − d̄) dx = 1.
 *   • Momentum sum rule (exact): Σ_i ∫ x f_i dx = 1.
 *   • Gluons carry ≈ 47% of the momentum and dominate at small x.
 *   • Flavor-asymmetric sea: d̄ > ū (E866/NuSea), s = s̄ suppressed,
 *     heavy-quark (c, b) sea further suppressed.
 *   • d_v falls faster than u_v at large x, so d/u → small as x → 1.
 *
 * SCOPE
 *   A fixed-scale (Q ≈ 100 GeV) analytic approximation to modern global fits
 *   (CT18, NNPDF4.0, MSHT20). It reproduces their qualitative shapes and
 *   momentum fractions; it does not include Q² evolution (DGLAP).
 */
import { PDG } from '../data/particles.js';

/* =============================================================================
   Special functions
   ============================================================================= */

/** Natural log of the gamma function (Lanczos approximation, g = 7, n = 9). */
function logGamma(z) {
  const coeffs = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (z < 0.5) {
    // Reflection formula: Γ(z) Γ(1 − z) = π / sin(πz)
    return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * z))) - logGamma(1 - z);
  }
  const zz = z - 1;
  let sum = coeffs[0];
  for (let i = 1; i < coeffs.length; i++) sum += coeffs[i] / (zz + i);
  const t = zz + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (zz + 0.5) * Math.log(t) - t + Math.log(sum);
}

/** Euler Beta function B(p, q) = Γ(p)Γ(q)/Γ(p+q). */
function beta(p, q) {
  return Math.exp(logGamma(p) + logGamma(q) - logGamma(p + q));
}

/* =============================================================================
   Component definitions
   ============================================================================= */

/**
 * Each component: shape exponents (a, b) and either a number normalization
 * (valence) or a momentum fraction (gluon and sea).
 */
const COMPONENTS = {
  uValence: { a: 0.7, b: 4.66, number: 2 },
  dValence: { a: 0.7, b: 6.08, number: 1 },
  gluon: { a: -0.25, b: 5.0, momentum: 0.47 },
  uBar: { a: -0.2, b: 7.0, momentum: 0.032 },
  dBar: { a: -0.2, b: 7.0, momentum: 0.036 },
  sBar: { a: -0.2, b: 7.5, momentum: 0.024 },
  cBar: { a: -0.2, b: 8.0, momentum: 0.012 },
  bBar: { a: -0.2, b: 8.5, momentum: 0.006 },
};

// Analytic normalization constants A.
for (const comp of Object.values(COMPONENTS)) {
  comp.A =
    comp.number !== undefined
      ? comp.number / beta(comp.a, comp.b + 1)
      : comp.momentum / beta(comp.a + 1, comp.b + 1);
  comp.momentumFraction = comp.A * beta(comp.a + 1, comp.b + 1);
  Object.freeze(comp);
}

const shape = (comp, x) => comp.A * x ** comp.a * (1 - x) ** comp.b;

/* =============================================================================
   Sum-rule verification at load time
   ============================================================================= */
(() => {
  const seaMomentum =
    2 *
    (COMPONENTS.uBar.momentumFraction +
      COMPONENTS.dBar.momentumFraction +
      COMPONENTS.sBar.momentumFraction +
      COMPONENTS.cBar.momentumFraction +
      COMPONENTS.bBar.momentumFraction);
  const total =
    COMPONENTS.uValence.momentumFraction +
    COMPONENTS.dValence.momentumFraction +
    COMPONENTS.gluon.momentumFraction +
    seaMomentum;
  if (Math.abs(total - 1) > 1e-3) {
    throw new Error(`PartonDistributions: momentum sum rule violated (Σ = ${total.toFixed(5)}).`);
  }
})();

/* =============================================================================
   Partons available in the proton
   ============================================================================= */
const { DOWN, UP, STRANGE, CHARM, BOTTOM, GLUON } = PDG;

export const PARTONS = Object.freeze([
  GLUON,
  DOWN, UP, STRANGE, CHARM, BOTTOM,
  -DOWN, -UP, -STRANGE, -CHARM, -BOTTOM,
]);

/**
 * Momentum density x·f(x) for a parton in a PROTON.
 * @param {number} flavor  PDG code: 21, ±1 … ±5
 * @param {number} x       momentum fraction in (0, 1)
 */
export function xf(flavor, x) {
  if (!(x > 0 && x < 1)) return 0;
  switch (flavor) {
    case GLUON:
      return shape(COMPONENTS.gluon, x);
    case UP:
      return shape(COMPONENTS.uValence, x) + shape(COMPONENTS.uBar, x);
    case DOWN:
      return shape(COMPONENTS.dValence, x) + shape(COMPONENTS.dBar, x);
    case -UP:
      return shape(COMPONENTS.uBar, x);
    case -DOWN:
      return shape(COMPONENTS.dBar, x);
    case STRANGE:
    case -STRANGE:
      return shape(COMPONENTS.sBar, x);
    case CHARM:
    case -CHARM:
      return shape(COMPONENTS.cBar, x);
    case BOTTOM:
    case -BOTTOM:
      return shape(COMPONENTS.bBar, x);
    default:
      return 0;
  }
}

/** Number density f(x) = x·f(x) / x. */
export function f(flavor, x) {
  return x > 0 ? xf(flavor, x) / x : 0;
}

/** Fraction of the proton's momentum carried by a parton flavor. */
export function momentumFraction(flavor) {
  switch (Math.abs(flavor) === GLUON ? GLUON : flavor) {
    case GLUON: return COMPONENTS.gluon.momentumFraction;
    case UP: return COMPONENTS.uValence.momentumFraction + COMPONENTS.uBar.momentumFraction;
    case DOWN: return COMPONENTS.dValence.momentumFraction + COMPONENTS.dBar.momentumFraction;
    case -UP: return COMPONENTS.uBar.momentumFraction;
    case -DOWN: return COMPONENTS.dBar.momentumFraction;
    case STRANGE: case -STRANGE: return COMPONENTS.sBar.momentumFraction;
    case CHARM: case -CHARM: return COMPONENTS.cBar.momentumFraction;
    case BOTTOM: case -BOTTOM: return COMPONENTS.bBar.momentumFraction;
    default: return 0;
  }
}

/* =============================================================================
   Sampling tables (in ln x, where the measure f(x) dx = x f(x) d(ln x))
   ============================================================================= */
const LN_X_MIN = Math.log(1e-7);
const GRID = 1600;
const LN_STEP = -LN_X_MIN / GRID;

const lnGrid = new Float64Array(GRID + 1);
const totalCdf = new Float64Array(GRID + 1);
(() => {
  let running = 0;
  for (let i = 0; i <= GRID; i++) {
    lnGrid[i] = LN_X_MIN + i * LN_STEP;
    if (i > 0) {
      const xMid = Math.exp(lnGrid[i] - LN_STEP / 2);
      let density = 0;
      for (const flavor of PARTONS) density += xf(flavor, xMid);
      running += density * LN_STEP;
    }
    totalCdf[i] = running;
  }
})();

/** Pick a flavor at fixed x with probability ∝ x f_i(x). */
function chooseFlavor(x, random) {
  let total = 0;
  for (const flavor of PARTONS) total += xf(flavor, x);
  let r = random() * total;
  for (const flavor of PARTONS) {
    r -= xf(flavor, x);
    if (r <= 0) return flavor;
  }
  return GLUON;
}

/**
 * Sample one parton from a proton: momentum fraction x ≥ xMin and flavor,
 * distributed according to Σ_i f_i(x).
 *
 * @param {() => number} random
 * @param {number} [xMin=1e-6]
 * @returns {{ flavor: number, x: number }}
 */
export function sampleParton(random, xMin = 1e-6) {
  const lnMin = Math.max(LN_X_MIN, Math.log(xMin));
  const startIndex = Math.max(0, Math.floor((lnMin - LN_X_MIN) / LN_STEP));
  const cMin = totalCdf[startIndex];
  const cMax = totalCdf[GRID];

  const target = cMin + random() * (cMax - cMin);

  // Binary search the cumulative table.
  let lo = startIndex;
  let hi = GRID;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (totalCdf[mid] < target) lo = mid;
    else hi = mid;
  }
  // Linear interpolation inside the cell.
  const span = totalCdf[hi] - totalCdf[lo] || 1;
  const lnX = lnGrid[lo] + ((target - totalCdf[lo]) / span) * LN_STEP;
  const x = Math.min(1 - 1e-9, Math.max(Math.exp(lnMin), Math.exp(lnX)));

  return { flavor: chooseFlavor(x, random), x };
}

/**
 * Sample the two colliding partons for a FIXED partonic energy.
 *
 * With τ = x₁x₂ = ŝ/s fixed, the remaining freedom is the rapidity of the
 * parton system, y = ½ ln(x₁/x₂), with x₁ = √τ e^y and x₂ = √τ e^−y, and
 *     dx₁ dx₂ = dτ dy.
 * Each (y, flavor pair) is weighted by f₁(x₁) f₂(x₂) × channelWeight(f₁, f₂).
 *
 * @param {number} tau                       ŝ / s, in (0, 1)
 * @param {(a:number, b:number) => number} channelWeight  coupling weight for the
 *        pair (beam-1 parton a, beam-2 parton b); return 0 to forbid
 * @param {() => number} random
 * @param {number} [ySteps=48]
 * @returns {{ flavor1:number, flavor2:number, x1:number, x2:number, y:number, luminosity:number } | null}
 */
export function samplePairAtTau(tau, channelWeight, random, ySteps = 48) {
  if (!(tau > 0 && tau < 1)) return null;
  const yMax = -0.5 * Math.log(tau);
  const dy = (2 * yMax) / ySteps;
  const rootTau = Math.sqrt(tau);

  const cells = [];
  let total = 0;

  for (let k = 0; k < ySteps; k++) {
    const y = -yMax + (k + 0.5) * dy;
    const x1 = rootTau * Math.exp(y);
    const x2 = rootTau * Math.exp(-y);
    if (x1 >= 1 || x2 >= 1) continue;

    for (const a of PARTONS) {
      const fa = f(a, x1);
      if (fa === 0) continue;
      for (const b of PARTONS) {
        const w = channelWeight(a, b);
        if (w <= 0) continue;
        const weight = fa * f(b, x2) * w * dy;
        if (weight > 0) {
          total += weight;
          cells.push({ y, a, b, weight });
        }
      }
    }
  }

  if (total <= 0) return null;

  let r = random() * total;
  let chosen = cells[cells.length - 1];
  for (const cell of cells) {
    r -= cell.weight;
    if (r <= 0) {
      chosen = cell;
      break;
    }
  }

  // Jitter within the rapidity cell, keeping both x below 1.
  let y = chosen.y + (random() - 0.5) * dy;
  y = Math.max(-yMax + 1e-9, Math.min(yMax - 1e-9, y));

  return {
    flavor1: chosen.a,
    flavor2: chosen.b,
    x1: rootTau * Math.exp(y),
    x2: rootTau * Math.exp(-y),
    y,
    luminosity: total, // parton luminosity ∝ dL/dτ for this channel
  };
}