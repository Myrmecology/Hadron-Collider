/**
 * Hadron Collider — Boris pusher and detector magnetic field
 *
 * Integrates the relativistic Lorentz-force equation for a charged particle
 * in a static magnetic field:
 *
 *     dp⃗/dt = q (v⃗ × B⃗)
 *
 * In this codebase's units (p in GeV/c, E in GeV, B in T, q in e, t in s):
 *
 *     dp⃗/dt = q c² 10⁻⁹ (β⃗ × B⃗)        with β⃗ = p⃗ / E
 *
 * The momentum vector precesses about B⃗ at the relativistic cyclotron frequency
 *     ω = q c² 10⁻⁹ |B| / E   (rad/s).
 *
 * BORIS ROTATION (Boris 1970, with exact gyration angle)
 *   For a step Δt the momentum is rotated about B̂ by θ = ωΔt using
 *     t⃗ = B̂ tan(θ/2),   s⃗ = 2t⃗ / (1 + t²)
 *     p⃗′ = p⃗ + p⃗ × t⃗,   p⃗₊ = p⃗ + p⃗′ × s⃗
 *   This is an exact rotation: |p⃗| and E are conserved to rounding error, so
 *   helices neither spiral inward nor outward over thousands of steps.
 *   Position is then advanced with the updated velocity (leapfrog scheme).
 *
 * STEP CONTROL
 *   Each substep is limited both in path length and in turning angle, so
 *   tightly curling low-momentum tracks stay accurate.
 *
 * DETECTOR FIELD (ATLAS-inspired)
 *   • Central solenoid: uniform 2 T along +z inside the inner detector.
 *     A track of transverse momentum pT curls with radius r = pT / (0.3 B).
 *     Tracks with pT ≲ 0.32 GeV never leave the tracker: they spiral ("loopers").
 *   • Barrel toroid: azimuthal field in the muon spectrometer, bending muons
 *     in the r–z plane for an independent momentum measurement.
 */
import { DETECTOR, PHYSICS, SIMULATION } from '../config/constants.js';

/** q c² × 10⁻⁹: converts (charge in e, B in T, E in GeV) → rad/s. */
const LORENTZ_COEFF = PHYSICS.SPEED_OF_LIGHT * PHYSICS.SPEED_OF_LIGHT * 1e-9;

/** Maximum turning angle per substep (rad). */
const MAX_TURN_PER_STEP = 0.04;

/** Default spacing between recorded track points (m). */
const DEFAULT_RECORD_SPACING = 0.02;

/* =============================================================================
   Detector magnetic field map
   ============================================================================= */

/**
 * Magnetic field at a point (T). IP1 at the origin, beam along z.
 *
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {{x:number,y:number,z:number}} [out]  optional output object
 * @returns {{x:number,y:number,z:number}}
 */
export function detectorField(x, y, z, out = { x: 0, y: 0, z: 0 }) {
  const r = Math.hypot(x, y);
  const az = Math.abs(z);

  // Central solenoid: uniform axial field.
  if (r < DETECTOR.SOLENOID_RADIUS && az < DETECTOR.SOLENOID_HALF_LENGTH) {
    out.x = 0;
    out.y = 0;
    out.z = DETECTOR.SOLENOID_FIELD;
    return out;
  }

  // Barrel toroid: azimuthal field B⃗ = B_T φ̂ in the muon spectrometer.
  if (
    r > DETECTOR.MUON_INNER_RADIUS &&
    r < DETECTOR.MUON_OUTER_RADIUS &&
    az < DETECTOR.MUON_HALF_LENGTH &&
    r > 0
  ) {
    out.x = (-y / r) * DETECTOR.TOROID_FIELD;
    out.y = (x / r) * DETECTOR.TOROID_FIELD;
    out.z = 0;
    return out;
  }

  out.x = 0;
  out.y = 0;
  out.z = 0;
  return out;
}

/* =============================================================================
   Boris pusher
   ============================================================================= */
export class BorisPusher {
  /** @type {(x:number,y:number,z:number,out:object)=>object} */
  #field;
  #B = { x: 0, y: 0, z: 0 };

  /**
   * @param {Function} [fieldFn]  magnetic field map; defaults to the detector field
   */
  constructor(fieldFn = detectorField) {
    this.#field = fieldFn;
  }

  /**
   * Cyclotron radius of a track's transverse motion in a uniform field (m):
   *   r = pT / (0.2998 · |q| · B)
   */
  static curvatureRadius(pt, charge, field) {
    const qB = Math.abs(charge) * field;
    return qB > 0 ? pt / (PHYSICS.RIGIDITY * qB) : Infinity;
  }

  /**
   * Advance a particle by a single Boris step of duration dt (s).
   * Mutates particle.momentum and particle.position.
   *
   * @param {import('./Particle.js').Particle} particle
   * @param {number} dt
   */
  step(particle, dt) {
    const m = particle.momentum;
    const pos = particle.position;
    const E = m.E;
    if (!(E > 0) || dt <= 0) return;

    const q = particle.charge;

    if (q !== 0) {
      const B = this.#field(pos.x, pos.y, pos.z, this.#B);
      const bMag = Math.hypot(B.x, B.y, B.z);

      if (bMag > 0) {
        // Rotation angle and tan(θ/2) along B̂. The sign of q sets the sense.
        const theta = (-q * LORENTZ_COEFF * bMag * dt) / E;
        const k = Math.tan(theta / 2) / bMag;
        const tx = B.x * k;
        const ty = B.y * k;
        const tz = B.z * k;
        const t2 = tx * tx + ty * ty + tz * tz;
        const sk = 2 / (1 + t2);
        const sx = tx * sk;
        const sy = ty * sk;
        const sz = tz * sk;

        // p′ = p + p × t
        const ppx = m.px + (m.py * tz - m.pz * ty);
        const ppy = m.py + (m.pz * tx - m.px * tz);
        const ppz = m.pz + (m.px * ty - m.py * tx);

        // p₊ = p + p′ × s
        m.px += ppy * sz - ppz * sy;
        m.py += ppz * sx - ppx * sz;
        m.pz += ppx * sy - ppy * sx;
      }
    }

    // Drift with the updated velocity v⃗ = (p⃗ / E) c.
    const k = (PHYSICS.SPEED_OF_LIGHT * dt) / E;
    pos.x += m.px * k;
    pos.y += m.py * k;
    pos.z += m.pz * k;
  }

  /**
   * Advance a particle by a total duration dt (s), subdividing into substeps
   * limited by path length and turning angle. Records track points at a fixed
   * spatial spacing so rendered curves are smooth at any time scale.
   *
   * @param {import('./Particle.js').Particle} particle
   * @param {number} dt        physics time to advance (s)
   * @param {number} time      lab time at the start of this advance (s)
   * @param {object} [options]
   * @param {number} [options.recordSpacing]  metres between recorded points
   * @param {(particle) => boolean} [options.stop]  checked after each substep;
   *        return true to halt early (e.g. particle absorbed)
   * @returns {number} physics time actually advanced (≤ dt)
   */
  advance(particle, dt, time, { recordSpacing = DEFAULT_RECORD_SPACING, stop = null } = {}) {
    const m = particle.momentum;
    const E = m.E;
    const p = m.p;
    if (!(E > 0) || p === 0 || dt <= 0) return 0;

    const speed = (p / E) * PHYSICS.SPEED_OF_LIGHT;
    let maxStep = SIMULATION.TRACK_STEP_LENGTH / speed;

    // Limit the turning angle per substep for charged particles in a field.
    if (particle.isCharged) {
      const B = this.#field(particle.position.x, particle.position.y, particle.position.z, this.#B);
      const bMag = Math.hypot(B.x, B.y, B.z);
      if (bMag > 0) {
        const omega = (Math.abs(particle.charge) * LORENTZ_COEFF * bMag) / E;
        maxStep = Math.min(maxStep, MAX_TURN_PER_STEP / omega);
      }
    } else {
      // Neutral particles travel in straight lines: no need for small steps
      // beyond what is required for smooth recording and boundary checks.
      maxStep = Math.max(maxStep, recordSpacing / speed);
    }

    particle._pathSinceRecord ??= 0;

    let elapsed = 0;
    let guard = 0;
    while (elapsed < dt && guard < SIMULATION.TRACK_MAX_STEPS) {
      const h = Math.min(maxStep, dt - elapsed);
      this.step(particle, h);
      elapsed += h;
      guard += 1;

      particle._pathSinceRecord += speed * h;
      if (particle._pathSinceRecord >= recordSpacing) {
        particle.recordPoint(time + elapsed);
        particle._pathSinceRecord = 0;
      }

      if (stop && stop(particle)) break;
    }

    return elapsed;
  }
}