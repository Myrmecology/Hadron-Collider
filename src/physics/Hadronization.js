/**
 * Hadron Collider — Hadronization (string fragmentation)
 *
 * Quarks and gluons are confined: they are never observed alone. As colored
 * partons separate, the color field between them forms a narrow "string"
 * (tension κ ≈ 1 GeV/fm). The string breaks by producing quark–antiquark
 * pairs from the vacuum, and the pieces combine into colorless hadrons.
 *
 * MODEL
 *   An iterative string-fragmentation scheme in the spirit of the Lund model
 *   (Andersson, Gustafson, Ingelman, Sjöstrand 1983), using Pythia 8 default
 *   parameters:
 *     • Lund symmetric fragmentation function
 *         f(z) ∝ (1/z) (1 − z)^a exp(−b m_T² / z),  a = 0.68, b = 0.98 GeV⁻²
 *     • Flavor of each string break: u : d : s = 1 : 1 : 0.217
 *     • Diquark (baryon) breaks with probability 0.081
 *     • Gaussian transverse momentum per break, σ = 0.335 GeV
 *   Each jet fragments along its parton's direction. Leftover flavors from all
 *   string ends are joined into final hadrons, then a global momentum
 *   rescaling in the system rest frame enforces EXACT four-momentum
 *   conservation. Charge and baryon number are conserved exactly and verified.
 *
 * SIMPLIFICATIONS
 *   Only pseudoscalar mesons and the octet baryons in the catalog are produced
 *   (no vector mesons). States absent from the catalog (Σ, Ξ, Δ, D_s, B_s, Λ_c,
 *   Λ_b…) map to the nearest catalogued hadron of the same charge; where no
 *   baryon of that charge exists, a pion is emitted alongside, preserving
 *   charge and baryon number.
 */
import { getParticle, PDG } from '../data/particles.js';
import { FourVector } from './FourVector.js';

const {
  DOWN, UP, STRANGE, CHARM, BOTTOM, GLUON,
  PI0, PI_PLUS, ETA, K_PLUS, K_SHORT, K_LONG,
  D_PLUS, D0, B0, B_PLUS, J_PSI, UPSILON,
  PROTON, NEUTRON, LAMBDA,
} = PDG;

/* =============================================================================
   Pythia 8 default fragmentation parameters
   ============================================================================= */
const LUND_A = 0.68;
const LUND_B = 0.98; // GeV⁻²
const PROB_S_TO_UD = 0.217;
const PROB_DIQUARK = 0.081;
const SIGMA_PT = 0.335; // GeV
const ETA_FRACTION = 0.12; // share of light neutral mesons emitted as η
const STOP_MOMENTUM = 0.9; // GeV: below this, a string end joins the final pool
const MAX_ATTEMPTS = 12;

/** Quark charges in thirds of e. */
const Q3 = { [DOWN]: -1, [UP]: 2, [STRANGE]: -1, [CHARM]: 2, [BOTTOM]: -1 };

/* =============================================================================
   Random helpers
   ============================================================================= */
function gaussian(random) {
  let u = 0;
  while (u === 0) u = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

/** New light flavor from a string break: u : d : s = 1 : 1 : 0.217. */
function lightFlavor(random) {
  const r = random() * (2 + PROB_S_TO_UD);
  if (r < 1) return UP;
  if (r < 2) return DOWN;
  return STRANGE;
}

/**
 * Sample z from the Lund symmetric fragmentation function by rejection.
 * The maximum is located on a grid for the given m_T².
 */
function sampleLundZ(mT2, random) {
  const fz = (z) => (1 / z) * (1 - z) ** LUND_A * Math.exp((-LUND_B * mT2) / z);
  let fMax = 0;
  for (let i = 1; i < 60; i++) fMax = Math.max(fMax, fz(i / 60));
  fMax *= 1.1;
  for (let i = 0; i < 400; i++) {
    const z = 0.001 + 0.998 * random();
    if (random() * fMax <= fz(z)) return z;
  }
  return 0.3;
}

/* =============================================================================
   Hadron selection from flavor content
   Items use signed codes: +q quark, −q antiquark.
   ============================================================================= */

/** Meson from quark q (> 0) and antiquark of flavor f (> 0): q f̄. */
function mesonFor(q, f, random) {
  const charge = (Q3[q] - Q3[f]) / 3;
  const heavy = Math.max(q, f);

  if (heavy === BOTTOM) {
    if (q === BOTTOM && f === BOTTOM) return [UPSILON];
    if (q === BOTTOM) return [charge < 0 ? -B_PLUS : -B0]; // b q̄′: anti-B
    return [charge > 0 ? B_PLUS : B0]; // q b̄: B
  }
  if (heavy === CHARM) {
    if (q === CHARM && f === CHARM) return [J_PSI];
    if (q === CHARM) return [charge > 0 ? D_PLUS : D0]; // c q̄′: D
    return [charge < 0 ? -D_PLUS : -D0]; // q c̄: anti-D
  }
  if (heavy === STRANGE) {
    if (q === STRANGE && f === STRANGE) return [ETA];
    if (charge > 0) return [K_PLUS];
    if (charge < 0) return [-K_PLUS];
    return [random() < 0.5 ? K_SHORT : K_LONG]; // K⁰ or K̄⁰ → K_S / K_L
  }
  if (charge > 0) return [PI_PLUS];
  if (charge < 0) return [-PI_PLUS];
  return [random() < ETA_FRACTION ? ETA : PI0];
}

/**
 * Baryon from three quarks (all > 0) or antibaryon (anti = true).
 * Maps to p, n, Λ with exact charge; out-of-range charges emit a pion too.
 */
function baryonFor(quarks, anti) {
  const charge3 = quarks.reduce((acc, q) => acc + Q3[q], 0);
  const charge = charge3 / 3;
  const hasDownTypeHeavy = quarks.some((q) => q === STRANGE || q === BOTTOM);

  let codes;
  if (charge === 1) codes = [PROTON];
  else if (charge === 0) codes = [hasDownTypeHeavy ? LAMBDA : NEUTRON];
  else if (charge === 2) codes = [PROTON, PI_PLUS];
  else if (charge === -1) codes = [hasDownTypeHeavy ? LAMBDA : NEUTRON, -PI_PLUS];
  else throw new Error(`Hadronization: impossible baryon charge ${charge}`);

  return anti ? codes.map((c) => (getParticle(c).selfConjugate ? c : -c)) : codes;
}

/* =============================================================================
   String-end items
     { kind: 'q',     flavors: [±q] }        quark (+) or antiquark (−)
     { kind: 'dq',    flavors: [q1, q2] }    diquark (color anti-triplet)
     { kind: 'dqbar', flavors: [q1, q2] }    anti-diquark (color triplet)
   ============================================================================= */
const quarkItem = (code) => ({ kind: 'q', flavors: [code] });

function itemCharge3(item) {
  if (item.kind === 'q') {
    const f = item.flavors[0];
    return f > 0 ? Q3[f] : -Q3[-f];
  }
  const sum = item.flavors.reduce((acc, q) => acc + Q3[q], 0);
  return item.kind === 'dq' ? sum : -sum;
}

function itemBaryon3(item) {
  if (item.kind === 'q') return Math.sign(item.flavors[0]);
  return item.kind === 'dq' ? 2 : -2;
}

/** One string break at the current end: returns hadron codes and the new end. */
function stringBreak(current, random) {
  if (current.kind === 'q') {
    const f = current.flavors[0];
    const baryonic = random() < PROB_DIQUARK;

    if (f > 0) {
      if (baryonic) {
        const dq = [lightFlavor(random), lightFlavor(random)];
        return { hadrons: baryonFor([f, ...dq], false), next: { kind: 'dqbar', flavors: dq } };
      }
      const nf = lightFlavor(random);
      return { hadrons: mesonFor(f, nf, random), next: quarkItem(nf) };
    }
    // Antiquark end.
    const af = -f;
    if (baryonic) {
      const dq = [lightFlavor(random), lightFlavor(random)];
      return { hadrons: baryonFor([af, ...dq], true), next: { kind: 'dq', flavors: dq } };
    }
    const nf = lightFlavor(random);
    return { hadrons: mesonFor(nf, af, random), next: quarkItem(-nf) };
  }

  const nf = lightFlavor(random);
  if (current.kind === 'dq') {
    // Diquark + new quark → baryon; the new antiquark continues.
    return { hadrons: baryonFor([...current.flavors, nf], false), next: quarkItem(-nf) };
  }
  // Anti-diquark + new antiquark → antibaryon; the new quark continues.
  return { hadrons: baryonFor([...current.flavors, nf], true), next: quarkItem(nf) };
}

/* =============================================================================
   Hadronization
   ============================================================================= */
export class Hadronization {
  #random;

  /** @param {{ random?: () => number }} [options] */
  constructor({ random = Math.random } = {}) {
    this.#random = random;
  }

  /**
   * String ends for a parton. A gluon carries color and anticolor, so it
   * acts as a quark end plus an antiquark end sharing its momentum.
   *
   * @param {number} pdg
   * @param {FourVector} momentum
   * @returns {Array<{ item: object, momentum: FourVector }>}
   */
  partonEnds(pdg, momentum) {
    if (pdg === GLUON) {
      const f = lightFlavor(this.#random);
      const half = momentum.scale(0.5);
      return [
        { item: quarkItem(f), momentum: half },
        { item: quarkItem(-f), momentum: half.clone() },
      ];
    }
    return [{ item: quarkItem(pdg), momentum }];
  }

  /**
   * String ends for a proton remnant after partons were extracted from it.
   * The remnant holds what is left of uud, plus partners of any sea quarks
   * taken (extracting a sea s leaves an s̄ behind).
   *
   * @param {number[]} extracted   parton codes removed from this proton
   * @param {FourVector} momentum  remnant four-momentum (beam minus extracted)
   * @returns {Array<{ item: object, momentum: FourVector }>}
   */
  remnantEnds(extracted, momentum) {
    const quarks = [UP, UP, DOWN];
    const antiquarks = [];
    for (const code of extracted) {
      if (code === GLUON) continue;
      if (code > 0) {
        const idx = quarks.indexOf(code);
        if (idx >= 0) quarks.splice(idx, 1); // valence quark taken
        else antiquarks.push(code); // sea quark: its antiquark partner remains
      } else {
        quarks.push(-code); // sea antiquark: its quark partner remains
      }
    }

    // Pair leftover sea partners into the remnant before forming the diquark.
    const items = [];
    while (antiquarks.length > 0 && quarks.length > 2) {
      items.push(quarkItem(-antiquarks.pop()));
      items.push(quarkItem(quarks.pop()));
    }
    for (const a of antiquarks) items.push(quarkItem(-a));
    if (quarks.length >= 2) {
      items.push({ kind: 'dq', flavors: [quarks.pop(), quarks.pop()] });
    }
    for (const q of quarks) items.push(quarkItem(q));

    // Share the remnant momentum: the diquark keeps the larger part.
    const weights = items.map((it) => (it.kind === 'dq' ? 3 : 0.5 + this.#random()));
    const total = weights.reduce((a, b) => a + b, 0);
    return items.map((item, i) => ({ item, momentum: momentum.scale(weights[i] / total) }));
  }

  /**
   * Fragment a color-singlet system into hadrons with exact conservation of
   * four-momentum, charge, and baryon number.
   *
   * @param {Array<{ item: object, momentum: FourVector }>} ends
   * @returns {Array<{ pdg: number, momentum: FourVector }>}
   */
  hadronizeSystem(ends) {
    const total = FourVector.sum(ends.map((e) => e.momentum));
    const W = total.mass;
    const charge3 = ends.reduce((acc, e) => acc + itemCharge3(e.item), 0);
    const baryon3 = ends.reduce((acc, e) => acc + itemBaryon3(e.item), 0);

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const raw = this.#fragment(ends);
      const result = this.#conserve(raw, total, W);
      if (!result) continue;

      const outCharge = result.reduce((acc, h) => acc + getParticle(h.pdg).charge3, 0);
      const outBaryon = result.reduce((acc, h) => acc + getParticle(h.pdg).baryon3, 0);
      if (outCharge !== charge3 || outBaryon !== baryon3) {
        throw new Error(
          `Hadronization: conservation failed (charge ${charge3}→${outCharge}, baryon ${baryon3}→${outBaryon}).`,
        );
      }
      return result;
    }
    return this.#fallback(total, charge3, baryon3);
  }

  /** Iterative fragmentation of every string end, then closure of the pool. */
  #fragment(ends) {
    const hadrons = [];
    const pool = [];

    for (const { item, momentum } of ends) {
      const p = momentum.p;
      if (p === 0) {
        pool.push({ item, p3: { x: 0, y: 0, z: 0 } });
        continue;
      }
      const axis = { x: momentum.px / p, y: momentum.py / p, z: momentum.pz / p };
      // Orthonormal basis perpendicular to the jet axis.
      const ref = Math.abs(axis.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
      let e1 = {
        x: axis.y * ref.z - axis.z * ref.y,
        y: axis.z * ref.x - axis.x * ref.z,
        z: axis.x * ref.y - axis.y * ref.x,
      };
      const n1 = Math.hypot(e1.x, e1.y, e1.z);
      e1 = { x: e1.x / n1, y: e1.y / n1, z: e1.z / n1 };
      const e2 = {
        x: axis.y * e1.z - axis.z * e1.y,
        y: axis.z * e1.x - axis.x * e1.z,
        z: axis.x * e1.y - axis.y * e1.x,
      };

      let current = item;
      let remaining = p;

      for (let guard = 0; guard < 400 && remaining > STOP_MOMENTUM; guard++) {
        const { hadrons: codes, next } = stringBreak(current, this.#random);
        const mass = codes.reduce((acc, c) => acc + getParticle(c).mass, 0);
        const ptx = SIGMA_PT * gaussian(this.#random);
        const pty = SIGMA_PT * gaussian(this.#random);
        const mT2 = mass * mass + ptx * ptx + pty * pty;
        const z = sampleLundZ(mT2, this.#random);
        const pL = z * remaining;
        remaining -= pL;

        const share = 1 / codes.length;
        for (const code of codes) {
          hadrons.push({
            pdg: code,
            p3: {
              x: (axis.x * pL + e1.x * ptx + e2.x * pty) * share,
              y: (axis.y * pL + e1.y * ptx + e2.y * pty) * share,
              z: (axis.z * pL + e1.z * ptx + e2.z * pty) * share,
            },
          });
        }
        current = next;
      }

      pool.push({
        item: current,
        p3: { x: axis.x * remaining, y: axis.y * remaining, z: axis.z * remaining },
      });
    }

    hadrons.push(...this.#closePool(pool));
    return hadrons;
  }

  /** Join leftover string ends into hadrons, conserving flavor exactly. */
  #closePool(pool) {
    const quarks = [];
    const antiquarks = [];
    for (const { item, p3 } of pool) {
      const parts =
        item.kind === 'q'
          ? [item.flavors[0]]
          : item.kind === 'dq'
            ? item.flavors
            : item.flavors.map((f) => -f);
      const share = 1 / parts.length;
      for (const code of parts) {
        const entry = { code: Math.abs(code), p3: { x: p3.x * share, y: p3.y * share, z: p3.z * share } };
        (code > 0 ? quarks : antiquarks).push(entry);
      }
    }

    const sumP = (list) =>
      list.reduce((acc, e) => ({ x: acc.x + e.p3.x, y: acc.y + e.p3.y, z: acc.z + e.p3.z }), { x: 0, y: 0, z: 0 });
    const emit = (codes, p3, out) => {
      const share = 1 / codes.length;
      for (const code of codes) {
        out.push({ pdg: code, p3: { x: p3.x * share, y: p3.y * share, z: p3.z * share } });
      }
    };

    if ((quarks.length - antiquarks.length) % 3 !== 0) {
      throw new Error('Hadronization: unbalanced flavor pool (baryon number not integer).');
    }

    const out = [];
    while (quarks.length > 0 && antiquarks.length > 0) {
      const q = quarks.pop();
      const a = antiquarks.pop();
      emit(mesonFor(q.code, a.code, this.#random), sumP([q, a]), out);
    }
    while (quarks.length >= 3) {
      const trio = quarks.splice(-3, 3);
      emit(baryonFor(trio.map((t) => t.code), false), sumP(trio), out);
    }
    while (antiquarks.length >= 3) {
      const trio = antiquarks.splice(-3, 3);
      emit(baryonFor(trio.map((t) => t.code), true), sumP(trio), out);
    }
    return out;
  }

  /**
   * Enforce exact four-momentum conservation: in the system rest frame,
   * remove residual net momentum, then rescale all momenta by a common factor
   * λ so that Σ √(λ²p² + m²) = W. Finally boost back to the lab.
   */
  #conserve(raw, total, W) {
    if (raw.length < 2) return null;
    const masses = raw.map((h) => getParticle(h.pdg).mass);
    const massSum = masses.reduce((a, b) => a + b, 0);
    if (massSum >= W) return null;

    // Lab four-vectors → rest frame of the system.
    const vecs = raw.map((h, i) =>
      FourVector.fromMassMomentum(masses[i], h.p3.x, h.p3.y, h.p3.z).boostToRestFrameOfInPlace(total),
    );

    // Remove residual three-momentum, shared in proportion to energy.
    const net = FourVector.sum(vecs);
    const energySum = net.E;
    for (const v of vecs) {
      const w = v.E / energySum;
      v.px -= net.px * w;
      v.py -= net.py * w;
      v.pz -= net.pz * w;
    }

    // Solve Σ √(λ² p_i² + m_i²) = W for λ (monotonic; Newton's method).
    const p2 = vecs.map((v) => v.p2);
    let lambda = 1;
    for (let iter = 0; iter < 60; iter++) {
      let f = -W;
      let df = 0;
      for (let i = 0; i < vecs.length; i++) {
        const e = Math.sqrt(lambda * lambda * p2[i] + masses[i] * masses[i]);
        f += e;
        df += e > 0 ? (lambda * p2[i]) / e : 0;
      }
      if (Math.abs(f) < 1e-9 * W) break;
      if (df <= 0) return null;
      lambda = Math.max(1e-6, lambda - f / df);
    }

    return vecs.map((v, i) => {
      const momentum = FourVector.fromMassMomentum(
        masses[i],
        v.px * lambda,
        v.py * lambda,
        v.pz * lambda,
      ).boostInPlace(total);
      return { pdg: raw[i].pdg, momentum };
    });
  }

  /** Minimal two-body final state if iterative fragmentation fails repeatedly. */
  #fallback(total, charge3, baryon3) {
    const codes = [];
    if (baryon3 === 6) codes.push(PROTON, PROTON);
    else if (baryon3 === 3) codes.push(PROTON);
    else if (baryon3 === -3) codes.push(-PROTON);

    let q = charge3 - codes.reduce((acc, c) => acc + getParticle(c).charge3, 0);
    while (q >= 3) {
      codes.push(PI_PLUS);
      q -= 3;
    }
    while (q <= -3) {
      codes.push(-PI_PLUS);
      q += 3;
    }
    while (codes.length < 2) codes.push(PI0);

    const masses = codes.map((c) => getParticle(c).mass);
    const M = total.mass;
    if (masses.reduce((a, b) => a + b, 0) >= M) {
      throw new Error('Hadronization: system below every hadronic threshold.');
    }
    const p = FourVector.twoBodyMomentum(M, masses[0], masses.slice(1).reduce((a, b) => a + b, 0));
    const c = 2 * this.#random() - 1;
    const s = Math.sqrt(1 - c * c);
    const phi = 2 * Math.PI * this.#random();
    const dir = { x: s * Math.cos(phi), y: s * Math.sin(phi), z: c };

    const result = [
      {
        pdg: codes[0],
        momentum: FourVector.fromMassMomentum(masses[0], p * dir.x, p * dir.y, p * dir.z).boostInPlace(total),
      },
    ];
    const rest = codes.slice(1);
    const share = 1 / rest.length;
    for (let i = 0; i < rest.length; i++) {
      result.push({
        pdg: rest[i],
        momentum: FourVector.fromMassMomentum(
          masses[i + 1],
          -p * dir.x * share,
          -p * dir.y * share,
          -p * dir.z * share,
        ).boostInPlace(total),
      });
    }
    return result;
  }
}