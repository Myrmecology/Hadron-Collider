/**
 * Hadron Collider — Radio-frequency accelerating system
 *
 * The LHC accelerates protons with 16 superconducting RF cavities at Point 4
 * (8 per beam, 400.79 MHz). A proton crossing the cavities at phase φ gains
 *
 *     ΔE = q V sin φ   per turn.
 *
 * Above the transition energy (γ_t ≈ 55.7; LHC protons are always above it)
 * stable motion requires the synchronous particle to ride the falling slope
 * of the RF wave. Particles arriving early or late receive slightly less or
 * more energy and oscillate around it (synchrotron oscillations), which is
 * what keeps each bunch bunched.
 *
 * REAL RAMP
 *   450 GeV → 6.8 TeV in about 20 minutes ≈ 13.5 million turns, so the
 *   synchronous energy gain is ≈ 470 keV per turn, with V rising 8 → 16 MV.
 *
 * COMPRESSED RAMP (this simulation)
 *   The ramp completes in SIMULATION.RAMP_TURNS. This module computes the real
 *   per-turn gain and states the exact compression factor applied on top of
 *   it, so the simplification is explicit and inspectable.
 *
 * SYNCHROTRON RADIATION
 *   Energy radiated per turn by a charge e on a bending radius ρ:
 *     U₀ = e² β³ γ⁴ / (3 ε₀ ρ)
 *   ≈ 6.7 keV per turn for a 7 TeV proton (vs. GeV-scale for electrons, since
 *   U₀ ∝ γ⁴ = (E/m)⁴ and the proton is 1836× heavier).
 */
import { MACHINE, PHYSICS, SIMULATION } from '../config/constants.js';
import { MagnetLattice } from './MagnetLattice.js';

/** Vacuum permittivity (F/m), CODATA 2022. */
const EPSILON_0 = 8.854_187_8188e-12;

/** Transition Lorentz factor of the LHC lattice. */
export const GAMMA_TRANSITION = 55.7;

/** Location of the RF cavities: Point 4. */
const RF_POINT = MagnetLattice.POINTS.find((p) => p.point === 4);

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

export class RFCavity {
  #startEnergy = MACHINE.INJECTION_ENERGY;
  #targetEnergy = MACHINE.RUN3_ENERGY;
  #rampTurns = SIMULATION.RAMP_TURNS;
  #ramping = false;
  #passes = 0;

  /** Arc-length position of the RF system (m). */
  static get POSITION_S() {
    return RF_POINT.s;
  }

  static get FREQUENCY() {
    return MACHINE.RF_FREQUENCY;
  }

  static get HARMONIC_NUMBER() {
    return MACHINE.RF_HARMONIC_NUMBER;
  }

  /* ===========================================================================
     Ramp program
     =========================================================================== */

  /**
   * Configure an energy ramp.
   * @param {object} program
   * @param {number} program.startEnergy   GeV per beam
   * @param {number} program.targetEnergy  GeV per beam
   * @param {number} [program.turns]       passes over which to ramp
   */
  startRamp({ startEnergy, targetEnergy, turns = SIMULATION.RAMP_TURNS }) {
    this.#startEnergy = startEnergy;
    this.#targetEnergy = targetEnergy;
    this.#rampTurns = Math.max(1, Math.round(turns));
    this.#passes = 0;
    this.#ramping = true;
  }

  /** Hold energy constant (injection plateau, flat top, or stable beams). */
  hold() {
    this.#ramping = false;
  }

  get isRamping() {
    return this.#ramping;
  }

  /** Ramp progress in [0, 1]. */
  get rampFraction() {
    return this.#ramping ? clamp(this.#passes / this.#rampTurns, 0, 1) : this.#passes > 0 ? 1 : 0;
  }

  /* ===========================================================================
     Physics
     =========================================================================== */

  /**
   * RF voltage per beam (V). Rises from the injection setting to the
   * collision setting during the ramp (longitudinal emittance control).
   */
  get voltage() {
    const f = this.rampFraction;
    return MACHINE.RF_VOLTAGE_INJECTION + f * (MACHINE.RF_VOLTAGE_COLLISION - MACHINE.RF_VOLTAGE_INJECTION);
  }

  /**
   * Synchrotron-radiation energy loss per turn (GeV) for a proton of
   * Lorentz factor γ:  U₀ = e β³ γ⁴ / (3 ε₀ ρ)  in eV, converted to GeV.
   */
  static synchrotronLossPerTurn(gamma) {
    const beta = Math.sqrt(Math.max(0, 1 - 1 / (gamma * gamma)));
    const volts = (PHYSICS.ELEMENTARY_CHARGE * beta ** 3 * gamma ** 4) / (3 * EPSILON_0 * MachineRho());
    return volts * 1e-9;
  }

  /**
   * Real-machine synchronous energy gain per turn (GeV) at the current
   * point of the ramp: total ramp energy spread over the real ramp duration.
   */
  realGainPerTurn(revolutionFrequency) {
    const turns = MACHINE.REAL_RAMP_DURATION * revolutionFrequency;
    return (this.#targetEnergy - this.#startEnergy) / turns;
  }

  /**
   * Synchronous phase (radians, measured on the falling slope above
   * transition) implied by the real per-turn gain and the present voltage.
   */
  synchronousPhase(revolutionFrequency, gamma) {
    if (!this.#ramping) return Math.PI; // stationary bucket above transition
    const required = this.realGainPerTurn(revolutionFrequency) + RFCavity.synchrotronLossPerTurn(gamma);
    const sinPhi = clamp(required / (this.voltage * 1e-9), -1, 1);
    return Math.PI - Math.asin(sinPhi);
  }

  /** Compression of the ramp relative to the real machine (dimensionless). */
  compressionFactor(revolutionFrequency) {
    if (!this.#ramping) return 1;
    const simulatedGain = (this.#targetEnergy - this.#startEnergy) / this.#rampTurns;
    return simulatedGain / this.realGainPerTurn(revolutionFrequency);
  }

  /**
   * A bunch passes through the cavities. Returns the net energy change
   * for this pass and diagnostics describing how it was computed.
   *
   * @param {number} energy               current beam energy (GeV)
   * @param {number} revolutionFrequency  turns per second at this energy
   * @returns {{
   *   deltaE: number, realGain: number, synchrotronLoss: number,
   *   compression: number, voltage: number, phase: number
   * }}
   */
  pass(energy, revolutionFrequency) {
    const gamma = energy / PHYSICS.PROTON_MASS;
    const synchrotronLoss = RFCavity.synchrotronLossPerTurn(gamma);
    const voltage = this.voltage;

    if (!this.#ramping) {
      // Flat energy: the RF exactly replaces the synchrotron-radiation loss.
      return {
        deltaE: 0,
        realGain: synchrotronLoss,
        synchrotronLoss,
        compression: 1,
        voltage,
        phase: Math.PI - Math.asin(clamp(synchrotronLoss / (voltage * 1e-9), -1, 1)),
      };
    }

    const phase = this.synchronousPhase(revolutionFrequency, gamma);
    const realGain = voltage * 1e-9 * Math.sin(phase); // q = +1 e → ΔE[eV] = V sin φ
    const compression = this.compressionFactor(revolutionFrequency);

    this.#passes += 1;
    let deltaE = (realGain - synchrotronLoss) * compression + synchrotronLoss;

    // Never overshoot the flat-top energy.
    if (energy + deltaE >= this.#targetEnergy) {
      deltaE = this.#targetEnergy - energy;
      this.#ramping = false;
    }

    return { deltaE, realGain, synchrotronLoss, compression, voltage, phase };
  }

  reset() {
    this.#ramping = false;
    this.#passes = 0;
  }
}

/** Bending radius, read lazily to avoid a circular-import ordering issue. */
function MachineRho() {
  return MACHINE.DIPOLE_BENDING_RADIUS;
}