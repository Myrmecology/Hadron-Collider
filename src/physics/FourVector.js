/**
 * Hadron Collider — Four-vector (energy–momentum) mathematics
 *
 * A four-vector p = (E, pₓ, p_y, p_z) in natural units (c = 1):
 *   E in GeV, p in GeV/c, mass in GeV/c².
 * Metric signature (+, −, −, −):  p·q = E_p E_q − p⃗·q⃗,  p² = m².
 *
 * COORDINATE CONVENTION (matches ATLAS/CMS)
 *   z  along the beam axis
 *   x, y  transverse plane;  φ = azimuth in the transverse plane
 *   θ  polar angle from +z;  pseudorapidity η = −ln tan(θ/2)
 *
 * NUMERICAL STABILITY
 *   For ultra-relativistic particles (β → 1) naive formulas lose precision.
 *   This class computes γ from E/m and 1 − β from m² / (E(E + p)), and boosts
 *   using the parent four-vector directly, so no precision is lost to 1 − β².
 *
 * Methods ending in "InPlace" mutate and return `this` (allocation-free for
 * hot loops); all other methods return new instances.
 */
export class FourVector {
  /**
   * @param {number} E   energy (GeV)
   * @param {number} px  momentum x (GeV/c)
   * @param {number} py  momentum y (GeV/c)
   * @param {number} pz  momentum z (GeV/c)
   */
  constructor(E = 0, px = 0, py = 0, pz = 0) {
    this.E = E;
    this.px = px;
    this.py = py;
    this.pz = pz;
  }

  /* ===========================================================================
     Construction
     =========================================================================== */

  /** On-shell four-vector from mass and three-momentum: E = √(p² + m²). */
  static fromMassMomentum(mass, px, py, pz) {
    const E = Math.sqrt(px * px + py * py + pz * pz + mass * mass);
    return new FourVector(E, px, py, pz);
  }

  /**
   * On-shell four-vector from collider variables:
   * transverse momentum pT, pseudorapidity η, azimuth φ, mass m.
   */
  static fromPtEtaPhiM(pt, eta, phi, mass) {
    const px = pt * Math.cos(phi);
    const py = pt * Math.sin(phi);
    const pz = pt * Math.sinh(eta);
    return FourVector.fromMassMomentum(mass, px, py, pz);
  }

  /**
   * Momentum of each daughter in a two-body decay M → m₁ + m₂, in the
   * parent's rest frame. Uses the Källén function:
   *   p* = √λ(M², m₁², m₂²) / (2M),  λ(a,b,c) = a² + b² + c² − 2ab − 2ac − 2bc
   * Returns 0 if the decay is at or below threshold.
   */
  static twoBodyMomentum(M, m1, m2) {
    if (M <= m1 + m2) return 0;
    // Factored form of λ: numerically better than the expanded polynomial.
    const lambda = (M * M - (m1 + m2) ** 2) * (M * M - (m1 - m2) ** 2);
    return Math.sqrt(Math.max(0, lambda)) / (2 * M);
  }

  clone() {
    return new FourVector(this.E, this.px, this.py, this.pz);
  }

  set(E, px, py, pz) {
    this.E = E;
    this.px = px;
    this.py = py;
    this.pz = pz;
    return this;
  }

  copy(other) {
    return this.set(other.E, other.px, other.py, other.pz);
  }

  /* ===========================================================================
     Arithmetic
     =========================================================================== */

  add(other) {
    return this.clone().addInPlace(other);
  }

  addInPlace(other) {
    this.E += other.E;
    this.px += other.px;
    this.py += other.py;
    this.pz += other.pz;
    return this;
  }

  sub(other) {
    return this.clone().subInPlace(other);
  }

  subInPlace(other) {
    this.E -= other.E;
    this.px -= other.px;
    this.py -= other.py;
    this.pz -= other.pz;
    return this;
  }

  scale(k) {
    return new FourVector(this.E * k, this.px * k, this.py * k, this.pz * k);
  }

  /** Minkowski inner product p·q = E_p E_q − p⃗·q⃗ (Lorentz invariant). */
  dot(other) {
    return this.E * other.E - this.px * other.px - this.py * other.py - this.pz * other.pz;
  }

  /** Sum of an array of four-vectors (e.g. total momentum of a final state). */
  static sum(vectors) {
    const total = new FourVector();
    for (const v of vectors) total.addInPlace(v);
    return total;
  }

  /* ===========================================================================
     Invariants and kinematic quantities
     =========================================================================== */

  /** |p⃗|² */
  get p2() {
    return this.px * this.px + this.py * this.py + this.pz * this.pz;
  }

  /** |p⃗| (GeV/c) */
  get p() {
    return Math.sqrt(this.p2);
  }

  /** Invariant mass squared m² = E² − |p⃗|². */
  get mass2() {
    return this.E * this.E - this.p2;
  }

  /**
   * Invariant mass. A slightly negative m² can arise from rounding for
   * massless particles; by convention return −√|m²| so the sign is visible.
   */
  get mass() {
    const m2 = this.mass2;
    return m2 >= 0 ? Math.sqrt(m2) : -Math.sqrt(-m2);
  }

  /** Transverse momentum pT = √(pₓ² + p_y²): momentum perpendicular to the beam. */
  get pt() {
    return Math.hypot(this.px, this.py);
  }

  /** Transverse energy E_T = E · sin θ. */
  get et() {
    const p = this.p;
    return p > 0 ? (this.E * this.pt) / p : 0;
  }

  /** Azimuthal angle φ ∈ (−π, π]. */
  get phi() {
    return Math.atan2(this.py, this.px);
  }

  /** Polar angle θ ∈ [0, π] measured from +z (the beam axis). */
  get theta() {
    return Math.atan2(this.pt, this.pz);
  }

  /**
   * Pseudorapidity η = −ln tan(θ/2) = asinh(p_z / pT).
   * η = 0 is perpendicular to the beam; |η| → ∞ along the beam.
   */
  get eta() {
    const pt = this.pt;
    if (pt === 0) return this.pz >= 0 ? Infinity : -Infinity;
    return Math.asinh(this.pz / pt);
  }

  /** Rapidity y = ½ ln((E + p_z)/(E − p_z)). Differences in y are boost-invariant along z. */
  get rapidity() {
    const num = this.E + this.pz;
    const den = this.E - this.pz;
    if (num <= 0) return -Infinity;
    if (den <= 0) return Infinity;
    return 0.5 * Math.log(num / den);
  }

  /** Speed β = |p⃗| / E (in units of c). */
  get beta() {
    return this.E > 0 ? this.p / this.E : 0;
  }

  /**
   * 1 − β, computed stably: 1 − β = (E − p)/E = m² / (E (E + p)).
   * Essential at LHC energies, where 1 − β ≈ 10⁻⁸.
   */
  get oneMinusBeta() {
    const p = this.p;
    const m2 = this.mass2;
    if (this.E <= 0) return 1;
    if (m2 <= 0) return 0; // massless: moves at c
    return m2 / (this.E * (this.E + p));
  }

  /** Lorentz factor γ = E / m. Infinity for massless particles. */
  get gamma() {
    const m = this.mass;
    return m > 0 ? this.E / m : Infinity;
  }

  /** Velocity vector β⃗ = p⃗ / E (units of c). */
  get betaVector() {
    const inv = this.E > 0 ? 1 / this.E : 0;
    return { x: this.px * inv, y: this.py * inv, z: this.pz * inv };
  }

  /** Unit direction of motion (zero vector if at rest). */
  get direction() {
    const p = this.p;
    if (p === 0) return { x: 0, y: 0, z: 0 };
    return { x: this.px / p, y: this.py / p, z: this.pz / p };
  }

  /* ===========================================================================
     Lorentz transformations
     =========================================================================== */

  /**
   * Boost this vector from the rest frame of `frame` into the frame where
   * `frame` has its stated four-momentum. Used to carry decay products from
   * the parent's rest frame into the lab.
   *
   * Uses γ = E/M and β⃗ = p⃗/E taken directly from the parent, avoiding the
   * catastrophic cancellation in γ = 1/√(1 − β²) when β → 1.
   *
   * @param {FourVector} frame  four-momentum of the moving frame (must be timelike)
   */
  boostInPlace(frame) {
    const M = frame.mass;
    if (!(M > 0)) {
      throw new RangeError('FourVector.boost: frame must have positive invariant mass.');
    }

    const gamma = frame.E / M;
    const bx = frame.px / frame.E;
    const by = frame.py / frame.E;
    const bz = frame.pz / frame.E;

    const bp = bx * this.px + by * this.py + bz * this.pz; // β⃗·p⃗
    // (γ − 1)/β² written as γ²/(γ + 1): exact identity, stable as β → 0 and β → 1.
    const factor = (gamma * gamma) / (gamma + 1);

    const E = this.E;
    const coeff = factor * bp + gamma * E;

    this.E = gamma * (E + bp);
    this.px += coeff * bx;
    this.py += coeff * by;
    this.pz += coeff * bz;
    return this;
  }

  boost(frame) {
    return this.clone().boostInPlace(frame);
  }

  /**
   * Inverse boost: carry this vector from the lab into the rest frame of
   * `frame` (e.g. to analyze a decay in its own center-of-mass).
   */
  boostToRestFrameOfInPlace(frame) {
    const inverse = new FourVector(frame.E, -frame.px, -frame.py, -frame.pz);
    return this.boostInPlace(inverse);
  }

  boostToRestFrameOf(frame) {
    return this.clone().boostToRestFrameOfInPlace(frame);
  }

  /** Rotate the three-momentum about the z (beam) axis by angle φ. */
  rotateZInPlace(angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const x = this.px;
    const y = this.py;
    this.px = c * x - s * y;
    this.py = s * x + c * y;
    return this;
  }

  /* ===========================================================================
     Diagnostics
     =========================================================================== */

  /** True if every component is a finite number. */
  isFinite() {
    return (
      Number.isFinite(this.E) &&
      Number.isFinite(this.px) &&
      Number.isFinite(this.py) &&
      Number.isFinite(this.pz)
    );
  }

  toString(digits = 4) {
    const f = (x) => x.toFixed(digits);
    return `(E=${f(this.E)}, px=${f(this.px)}, py=${f(this.py)}, pz=${f(this.pz)}) GeV`;
  }
}