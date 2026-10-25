/**
 * Hadron Collider — Magnet lattice and ring geometry
 *
 * Builds the design (reference) orbit of the LHC and the positions of its
 * magnets. Everything is expressed in world coordinates (metres):
 *
 *   • IP1 (ATLAS) sits at the world origin; the beam axis there is ±z.
 *   • The ring lies in the horizontal x–z plane; +y points up.
 *   • Arc-length coordinate s runs counter-clockwise seen from above, with
 *     s = 0 at IP1. Beam 2 travels toward +s, Beam 1 toward −s (clockwise),
 *     matching the real machine.
 *
 * GEOMETRY
 *   8 arcs (pure dipole bending, radius ρ, 45° each) alternate with 8
 *   straight sections, so the ring closes exactly with circumference C.
 *   Each arc is filled by 154 dipoles × 14.3 m = ρ · π/4.
 *
 * CURVILINEAR FRAME (accelerator convention)
 *   At any s: tangent t̂ (direction of +s), outward x̂ (away from the ring
 *   center), and vertical ŷ. A particle is described by (s, x, y), its
 *   transverse offsets from the design orbit.
 *
 * MAGNETIC RIGIDITY
 *   A particle of momentum p and charge q follows the design orbit only if
 *   the dipole field satisfies p = q B ρ (B in T, p in GeV/c via 0.2998).
 */
import { MACHINE, PHYSICS } from '../config/constants.js';

const C = MACHINE.CIRCUMFERENCE;
const RHO = MACHINE.DIPOLE_BENDING_RADIUS;
const ARCS = MACHINE.ARC_COUNT;
const STRAIGHT = MACHINE.STRAIGHT_LENGTH;
const ARC_ANGLE = (2 * Math.PI) / ARCS;
const ARC_LENGTH = RHO * ARC_ANGLE;

/** FODO cells per arc (23 in the LHC), two main quadrupoles per cell. */
const CELLS_PER_ARC = 23;
const QUADS_PER_ARC = CELLS_PER_ARC * 2;
const DIPOLES_PER_ARC = MACHINE.DIPOLE_COUNT / ARCS; // 154

/**
 * Twin-aperture beam separation. Far from a collision point the beams run
 * in separate pipes 194 mm apart. Separation dipoles (D1/D2, roughly 59 m and
 * 153 m from the IP) bring them into one common pipe near the IP.
 */
const HALF_SEPARATION = MACHINE.APERTURE_SEPARATION / 2;
const SEPARATION_FULL_DISTANCE = 153;
const SEPARATION_ZERO_DISTANCE = 59;

/* =============================================================================
   Frame helpers for a tangent heading angle θ in the x–z plane:
     tangent  t̂(θ) = ( sin θ, 0,  cos θ )
     inward   n̂(θ) = ( cos θ, 0, −sin θ )   (toward the ring center)
     outward  x̂(θ) = −n̂(θ)
   Turning counter-clockwise about +y increases θ.
   ============================================================================= */
const tangentOf = (theta) => ({ x: Math.sin(theta), y: 0, z: Math.cos(theta) });
const inwardOf = (theta) => ({ x: Math.cos(theta), y: 0, z: -Math.sin(theta) });

/* =============================================================================
   Build the segment table
   Sequence along +s: ½ straight (IP1) → arc → straight → … → arc → ½ straight.
   ============================================================================= */
function buildSegments() {
  const segments = [];
  let s = 0;
  let theta = 0;
  const P = { x: 0, y: 0, z: 0 };

  const pushStraight = (length) => {
    segments.push({
      type: 'straight',
      sStart: s,
      length,
      start: { ...P },
      theta,
    });
    const t = tangentOf(theta);
    P.x += t.x * length;
    P.z += t.z * length;
    s += length;
  };

  const pushArc = (index) => {
    const n = inwardOf(theta);
    const center = { x: P.x + RHO * n.x, y: 0, z: P.z + RHO * n.z };
    segments.push({
      type: 'arc',
      index,
      sStart: s,
      length: ARC_LENGTH,
      start: { ...P },
      theta,
      center,
    });
    // Advance to the arc's end point.
    const t = tangentOf(theta);
    const c = Math.cos(ARC_ANGLE);
    const sn = Math.sin(ARC_ANGLE);
    P.x += RHO * (n.x * (1 - c) + t.x * sn);
    P.z += RHO * (n.z * (1 - c) + t.z * sn);
    theta += ARC_ANGLE;
    s += ARC_LENGTH;
  };

  pushStraight(STRAIGHT / 2);
  for (let k = 0; k < ARCS; k++) {
    pushArc(k);
    pushStraight(k < ARCS - 1 ? STRAIGHT : STRAIGHT / 2);
  }

  // Closure check: the orbit must return to the origin with the same heading.
  const closureError = Math.hypot(P.x, P.z);
  const lengthError = Math.abs(s - C);
  if (closureError > 1e-6 || lengthError > 1e-6) {
    throw new Error(
      `MagnetLattice: ring does not close (position error ${closureError} m, length error ${lengthError} m).`,
    );
  }

  return segments;
}

const SEGMENTS = Object.freeze(buildSegments().map(Object.freeze));
const SEGMENT_STARTS = SEGMENTS.map((seg) => seg.sStart);

/** Geometric center of the ring (mean of the arc centers). */
const RING_CENTER = (() => {
  const arcs = SEGMENTS.filter((seg) => seg.type === 'arc');
  const sum = arcs.reduce((acc, seg) => ({ x: acc.x + seg.center.x, z: acc.z + seg.center.z }), { x: 0, z: 0 });
  return Object.freeze({ x: sum.x / arcs.length, y: 0, z: sum.z / arcs.length });
})();

/* =============================================================================
   The eight LHC points. Points are numbered 1 → 8 in the Beam 1 (clockwise)
   direction, i.e. toward decreasing s.
   ============================================================================= */
const pointS = (k) => (((ARCS + 1 - k) % ARCS) * C) / ARCS;

const POINTS = Object.freeze(
  [
    { point: 1, name: 'ATLAS', role: 'General-purpose experiment', collides: true },
    { point: 2, name: 'ALICE', role: 'Heavy-ion experiment', collides: true },
    { point: 3, name: 'Momentum cleaning', role: 'Collimation of off-momentum particles', collides: false },
    { point: 4, name: 'RF system', role: 'Superconducting accelerating cavities', collides: false },
    { point: 5, name: 'CMS', role: 'General-purpose experiment', collides: true },
    { point: 6, name: 'Beam dump', role: 'Beam extraction and absorption', collides: false },
    { point: 7, name: 'Betatron cleaning', role: 'Collimation of the beam halo', collides: false },
    { point: 8, name: 'LHCb', role: 'Bottom-quark physics experiment', collides: true },
  ].map((p) => Object.freeze({ ...p, s: pointS(p.point) })),
);

const COLLISION_POINTS_S = POINTS.filter((p) => p.collides).map((p) => p.s);

/* =============================================================================
   Magnet placement (for rendering and diagnostics)
   ============================================================================= */
const MAGNETS = (() => {
  const dipoles = [];
  const quadrupoles = [];
  for (const seg of SEGMENTS) {
    if (seg.type !== 'arc') continue;
    for (let j = 0; j < DIPOLES_PER_ARC; j++) {
      dipoles.push({ s: seg.sStart + (j + 0.5) * MACHINE.DIPOLE_MAGNETIC_LENGTH, arc: seg.index });
    }
    for (let j = 0; j < QUADS_PER_ARC; j++) {
      quadrupoles.push({
        s: seg.sStart + ((j + 0.5) * ARC_LENGTH) / QUADS_PER_ARC,
        arc: seg.index,
        // Alternating focusing / defocusing: the "FODO" pattern.
        focusing: j % 2 === 0 ? 'F' : 'D',
      });
    }
  }
  return Object.freeze({
    dipoles: Object.freeze(dipoles.map(Object.freeze)),
    quadrupoles: Object.freeze(quadrupoles.map(Object.freeze)),
  });
})();

/* =============================================================================
   Lattice
   ============================================================================= */
export class MagnetLattice {
  /** Reference momentum the dipoles are currently powered for (GeV/c). */
  #referenceMomentum = 0;
  /** Field scale applied to all arc dipoles (1 = nominal). For experiments. */
  #dipoleScale = 1;

  static get CIRCUMFERENCE() {
    return C;
  }

  static get BENDING_RADIUS() {
    return RHO;
  }

  static get SEGMENTS() {
    return SEGMENTS;
  }

  static get POINTS() {
    return POINTS;
  }

  static get MAGNETS() {
    return MAGNETS;
  }

  static get RING_CENTER() {
    return RING_CENTER;
  }

  static get CELLS_PER_ARC() {
    return CELLS_PER_ARC;
  }

  /* ===========================================================================
     Magnet powering
     =========================================================================== */

  /**
   * Power the dipoles so that a particle with momentum p (charge +1)
   * follows the design orbit: B = p / (0.2998 · ρ).
   */
  setReferenceMomentum(p) {
    this.#referenceMomentum = Math.max(0, p);
  }

  get referenceMomentum() {
    return this.#referenceMomentum;
  }

  /** Scale all dipole fields (1 = nominal; 0 = magnets off → beam is lost). */
  setDipoleScale(scale) {
    this.#dipoleScale = Number.isFinite(scale) ? scale : 1;
  }

  /** Nominal arc dipole field for the current reference momentum (T). */
  get dipoleField() {
    return (this.#dipoleScale * this.#referenceMomentum) / (PHYSICS.RIGIDITY * RHO);
  }

  /* ===========================================================================
     Geometry queries
     =========================================================================== */

  /** Wrap any s into [0, C). */
  static wrap(s) {
    return ((s % C) + C) % C;
  }

  /** Segment containing arc-length s. */
  static segmentAt(s) {
    const sw = MagnetLattice.wrap(s);
    // Binary search on segment start positions.
    let lo = 0;
    let hi = SEGMENT_STARTS.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (SEGMENT_STARTS[mid] <= sw) lo = mid;
      else hi = mid - 1;
    }
    return SEGMENTS[lo];
  }

  /** Vertical dipole field on the design orbit at s (T). Zero in straights. */
  fieldAt(s) {
    return MagnetLattice.segmentAt(s).type === 'arc' ? this.dipoleField : 0;
  }

  /** Design-orbit curvature 1/ρ at s (1/m). Zero in straights. */
  static curvatureAt(s) {
    return MagnetLattice.segmentAt(s).type === 'arc' ? 1 / RHO : 0;
  }

  /**
   * Curvilinear frame at s: position on the design orbit, tangent (+s),
   * outward horizontal normal, and vertical.
   *
   * @param {number} s
   * @param {object} [out]  optional object to fill (avoids allocation)
   */
  static frameAt(s, out = {}) {
    const seg = MagnetLattice.segmentAt(s);
    const u = MagnetLattice.wrap(s) - seg.sStart;

    let px;
    let pz;
    let theta;

    if (seg.type === 'straight') {
      const t = tangentOf(seg.theta);
      px = seg.start.x + t.x * u;
      pz = seg.start.z + t.z * u;
      theta = seg.theta;
    } else {
      const phi = u / RHO;
      const t = tangentOf(seg.theta);
      const n = inwardOf(seg.theta);
      const c = Math.cos(phi);
      const sn = Math.sin(phi);
      px = seg.start.x + RHO * (n.x * (1 - c) + t.x * sn);
      pz = seg.start.z + RHO * (n.z * (1 - c) + t.z * sn);
      theta = seg.theta + phi;
    }

    const st = Math.sin(theta);
    const ct = Math.cos(theta);
    out.position = { x: px, y: 0, z: pz };
    out.tangent = { x: st, y: 0, z: ct };
    out.outward = { x: -ct, y: 0, z: st };
    out.up = { x: 0, y: 1, z: 0 };
    out.segment = seg;
    return out;
  }

  /** World position of a particle at curvilinear coordinates (s, x, y). */
  static toWorld(s, x = 0, y = 0, out = { x: 0, y: 0, z: 0 }) {
    const f = MagnetLattice.frameAt(s);
    out.x = f.position.x + x * f.outward.x;
    out.y = y;
    out.z = f.position.z + x * f.outward.z;
    return out;
  }

  /* ===========================================================================
     Interaction-point helpers
     =========================================================================== */

  /** Signed path distance from s to IP1 (shortest way round), in (−C/2, C/2]. */
  static signedDistanceToIP1(s) {
    const sw = MagnetLattice.wrap(s);
    return sw > C / 2 ? sw - C : sw;
  }

  /** Path distance from s to the nearest collision point (IP1, 2, 5, 8). */
  static distanceToNearestCollisionPoint(s) {
    const sw = MagnetLattice.wrap(s);
    let best = Infinity;
    for (const ip of COLLISION_POINTS_S) {
      const d = Math.abs(sw - ip);
      best = Math.min(best, d, C - d);
    }
    return best;
  }

  /**
   * Horizontal offset of a beam's own aperture from the design orbit (m).
   * Beam 1 runs on the outer side (+), Beam 2 on the inner side (−), each
   * 97 mm from the center line, merging smoothly into the common pipe near
   * the collision points.
   *
   * @param {number} s
   * @param {1|2} beam
   */
  static apertureOffset(s, beam) {
    const d = MagnetLattice.distanceToNearestCollisionPoint(s);
    let k;
    if (d >= SEPARATION_FULL_DISTANCE) k = 1;
    else if (d <= SEPARATION_ZERO_DISTANCE) k = 0;
    else {
      const t = (d - SEPARATION_ZERO_DISTANCE) / (SEPARATION_FULL_DISTANCE - SEPARATION_ZERO_DISTANCE);
      k = t * t * (3 - 2 * t);
    }
    return (beam === 1 ? 1 : -1) * HALF_SEPARATION * k;
  }
}