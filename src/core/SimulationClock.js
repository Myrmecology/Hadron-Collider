/**
 * Hadron Collider — Simulation clock
 *
 * Converts wall-clock frame time into physics time:
 *
 *     Δt_physics = Δt_wall × effectiveScale
 *
 * Every physical process (beam motion, decays, detector tracks) advances by
 * Δt_physics, so slowing the clock slows the whole simulation consistently.
 *
 * EFFECTIVE SCALE
 *   userScale    the value chosen on the slider (10⁻⁹ … 1)
 *   floor        CIRCULATION_TIME_SCALE_FLOOR (10⁻⁴): while bunches circulate
 *                far from the interaction point, the clock never runs slower
 *                than this, so the machine program completes in seconds.
 *   dilation     weight in [0, 1] supplied by the accelerator each frame:
 *                0 far from IP1 (floor applies), 1 at the collision (full
 *                userScale). Intermediate values blend logarithmically.
 *
 *   log(target) = lerp( log(max(userScale, floor)), log(userScale), dilation )
 *
 * The effective scale eases toward the target in log space, so changes of
 * many orders of magnitude feel smooth rather than abrupt.
 */
import { SIMULATION } from '../config/constants.js';

const LOG_MIN = Math.log10(SIMULATION.TIME_SCALE_MIN);
const LOG_MAX = Math.log10(SIMULATION.TIME_SCALE_MAX);

/** Wall-clock time constant for easing the effective scale (s). */
const SCALE_EASING_TAU = 0.18;

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (t) => t * t * (3 - 2 * t);

export class SimulationClock {
  #userScale = SIMULATION.TIME_SCALE_DEFAULT;
  #dilation = 0;
  #logEffective = Math.log10(SIMULATION.TIME_SCALE_DEFAULT);

  #time = 0; // physics time since reset (s)
  #frame = 0;
  #lastTimestamp = null; // ms, from requestAnimationFrame
  #paused = false;

  /* ===========================================================================
     Slider mapping (logarithmic)
     =========================================================================== */

  /**
   * Map a normalized slider position t ∈ [0, 1] to a time scale.
   * 0 → 10⁻⁹, 1 → 1, evenly spaced in decades.
   */
  static sliderToScale(t) {
    return 10 ** lerp(LOG_MIN, LOG_MAX, clamp(t, 0, 1));
  }

  /** Inverse of sliderToScale. */
  static scaleToSlider(scale) {
    const safe = clamp(scale, SIMULATION.TIME_SCALE_MIN, SIMULATION.TIME_SCALE_MAX);
    return (Math.log10(safe) - LOG_MIN) / (LOG_MAX - LOG_MIN);
  }

  /**
   * Dilation weight from the distance (m) between the approaching bunches
   * and the interaction point. Smooth in log-distance:
   *   d ≥ OUTER → 0,   d ≤ INNER → 1.
   */
  static dilationFromDistance(distance) {
    const outer = SIMULATION.DILATION_OUTER_DISTANCE;
    const inner = SIMULATION.DILATION_INNER_DISTANCE;
    if (!(distance < outer)) return 0;
    if (distance <= inner) return 1;
    const t = (Math.log(outer) - Math.log(distance)) / (Math.log(outer) - Math.log(inner));
    return smoothstep(clamp(t, 0, 1));
  }

  /* ===========================================================================
     Controls
     =========================================================================== */

  /** Set the user's chosen time scale (clamped to the supported range). */
  setUserScale(scale) {
    if (!Number.isFinite(scale)) return;
    this.#userScale = clamp(scale, SIMULATION.TIME_SCALE_MIN, SIMULATION.TIME_SCALE_MAX);
  }

  /** Dilation weight in [0, 1]; see class documentation. */
  setDilation(weight) {
    this.#dilation = Number.isFinite(weight) ? clamp(weight, 0, 1) : 0;
  }

  pause() {
    this.#paused = true;
  }

  resume() {
    this.#paused = false;
    this.#lastTimestamp = null; // avoid a giant first delta after resuming
  }

  /** Reset physics time to zero (e.g. when the collider is switched off). */
  reset() {
    this.#time = 0;
    this.#frame = 0;
    this.#dilation = 0;
  }

  /* ===========================================================================
     Per-frame advance
     =========================================================================== */

  /**
   * Advance the clock by one rendered frame.
   *
   * @param {number} timestamp  high-resolution time in ms (from requestAnimationFrame)
   * @returns {{ wallDt: number, simDt: number }} seconds of wall and physics time
   */
  advance(timestamp) {
    const previous = this.#lastTimestamp;
    this.#lastTimestamp = timestamp;

    // First frame, or clock just resumed: no elapsed time yet.
    if (previous === null) return { wallDt: 0, simDt: 0 };

    // Clamp large gaps (tab hidden, debugger pause) so physics never jumps.
    const wallDt = clamp((timestamp - previous) / 1000, 0, SIMULATION.MAX_FRAME_DT);

    this.#easeEffectiveScale(wallDt);
    this.#frame += 1;

    if (this.#paused) return { wallDt, simDt: 0 };

    const simDt = wallDt * this.effectiveScale;
    this.#time += simDt;
    return { wallDt, simDt };
  }

  #targetLogScale() {
    const logUser = Math.log10(this.#userScale);
    const logCirculation = Math.log10(Math.max(this.#userScale, SIMULATION.CIRCULATION_TIME_SCALE_FLOOR));
    return lerp(logCirculation, logUser, this.#dilation);
  }

  #easeEffectiveScale(wallDt) {
    const target = this.#targetLogScale();
    // Exponential approach: frame-rate independent.
    const k = 1 - Math.exp(-wallDt / SCALE_EASING_TAU);
    this.#logEffective = lerp(this.#logEffective, target, k);
    // Snap when within 0.1% to avoid an endless asymptotic tail.
    if (Math.abs(this.#logEffective - target) < 4e-4) this.#logEffective = target;
  }

  /* ===========================================================================
     Read-only state
     =========================================================================== */

  /** Physics time elapsed since reset (s). */
  get time() {
    return this.#time;
  }

  /** Scale actually applied this frame, after floor, dilation, and easing. */
  get effectiveScale() {
    return 10 ** this.#logEffective;
  }

  /** The scale the user selected on the slider. */
  get userScale() {
    return this.#userScale;
  }

  get dilation() {
    return this.#dilation;
  }

  get frame() {
    return this.#frame;
  }

  get paused() {
    return this.#paused;
  }
}