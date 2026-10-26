/**
 * Hadron Collider — Physical constants, machine parameters, and simulation settings
 *
 * UNIT CONVENTIONS (used throughout the codebase)
 *   length    metres (m)
 *   time      seconds (s)
 *   energy    giga-electronvolts (GeV)
 *   momentum  GeV/c
 *   mass      GeV/c²
 *   field     tesla (T)
 *   charge    multiples of the elementary charge e
 *
 * SOURCES
 *   CODATA 2022 recommended values of the fundamental physical constants.
 *   Particle Data Group (PDG), Review of Particle Physics.
 *   CERN, LHC Design Report Vol. I (CERN-2004-003) and LHC Run 3 parameters.
 *   ATLAS Collaboration, detector geometry (approximate, for visualization).
 */

/* =============================================================================
   Fundamental constants
   ============================================================================= */
export const PHYSICS = Object.freeze({
  /** Speed of light in vacuum (m/s). Exact by SI definition. */
  SPEED_OF_LIGHT: 299_792_458,

  /** Elementary charge (C). Exact by SI definition. */
  ELEMENTARY_CHARGE: 1.602_176_634e-19,

  /** Proton mass (GeV/c²). CODATA 2022: 938.272 089 43 MeV/c². */
  PROTON_MASS: 0.938_272_089_43,

  /** Proton mass (kg). CODATA 2022. */
  PROTON_MASS_KG: 1.672_621_925_95e-27,

  /** Reduced Planck constant (GeV·s). Converts a decay width Γ to a lifetime τ = ħ/Γ. */
  HBAR: 6.582_119_569e-25,

  /**
   * Magnetic rigidity conversion (GeV/c per T·m).
   * For a particle of charge q (in e): p [GeV/c] = 0.299 792 458 · q · B [T] · ρ [m]
   * Equivalent to p = qBρ in SI, which is why magnets must ramp with the beam energy.
   */
  RIGIDITY: 0.299_792_458,
});

/* =============================================================================
   Machine parameters — Large Hadron Collider
   ============================================================================= */
const CIRCUMFERENCE = 26_658.883;
const DIPOLE_BENDING_RADIUS = 2_803.95;
const ARC_COUNT = 8;

export const MACHINE = Object.freeze({
  /** Ring circumference (m). */
  CIRCUMFERENCE,

  /** Bending radius inside the main dipoles (m). */
  DIPOLE_BENDING_RADIUS,

  /**
   * The LHC is not a perfect circle: 8 curved arcs alternate with 8 straight
   * sections that house the experiments, RF cavities, and beam dump.
   */
  ARC_COUNT,
  STRAIGHT_COUNT: ARC_COUNT,

  /**
   * Straight-section length chosen so that the arcs (bending radius ρ)
   * plus the straights reproduce the true circumference:
   *   8 · L_straight = C − 2πρ
   */
  STRAIGHT_LENGTH: (CIRCUMFERENCE - 2 * Math.PI * DIPOLE_BENDING_RADIUS) / ARC_COUNT,

  /** 1232 superconducting dipoles, 14.3 m magnetic length each. 1232 × 14.3 m = 2πρ. */
  DIPOLE_COUNT: 1232,
  DIPOLE_MAGNETIC_LENGTH: 14.3,

  /** Dipole field at 7 TeV design energy (T). Operating temperature 1.9 K. */
  DIPOLE_DESIGN_FIELD: 8.33,

  /** Main quadrupoles (focusing magnets) in the arcs. */
  QUADRUPOLE_COUNT: 392,

  /** Beam energies per beam (GeV). */
  INJECTION_ENERGY: 450,
  RUN3_ENERGY: 6_800,
  DESIGN_ENERGY: 7_000,

  /** Real ramp from 450 GeV to top energy takes roughly 20 minutes (s). */
  REAL_RAMP_DURATION: 1_200,

  /** Radio-frequency system: 8 superconducting cavities per beam. */
  RF_FREQUENCY: 400.79e6,
  RF_HARMONIC_NUMBER: 35_640,
  RF_VOLTAGE_INJECTION: 8e6,
  RF_VOLTAGE_COLLISION: 16e6,

  /** Betatron tunes: transverse oscillations per turn (horizontal, vertical). */
  TUNE_HORIZONTAL: 64.31,
  TUNE_VERTICAL: 59.32,

  /** β* at the interaction point (m): how tightly the beams are squeezed. */
  BETA_STAR_DESIGN: 0.55,
  BETA_STAR_RUN3: 0.3,

  /** Bunch structure. */
  BUNCH_SPACING: 25e-9,
  BUNCHES_PER_BEAM_DESIGN: 2_808,
  PROTONS_PER_BUNCH_DESIGN: 1.15e11,

  /** Twin-aperture magnet geometry (m). */
  APERTURE_SEPARATION: 0.194,
  COLD_BORE_INNER_DIAMETER: 0.05,
  CRYOSTAT_OUTER_DIAMETER: 0.914,

  /**
   * Beam directions seen from above:
   * Beam 1 circulates clockwise, Beam 2 counter-clockwise.
   */
  BEAM1_DIRECTION: -1,
  BEAM2_DIRECTION: +1,
});

/* =============================================================================
   Detector — general-purpose design inspired by ATLAS (approximate radii)
   Interaction Point 1 sits at the world origin. Beam axis = z.
   ============================================================================= */
export const DETECTOR = Object.freeze({
  /** Central solenoid field bending charged tracks in the inner detector (T). */
  SOLENOID_FIELD: 2.0,

  /** Beryllium beam pipe at the interaction point (m). */
  BEAM_PIPE_RADIUS: 0.0235,

  /** Inner tracker: silicon pixels/strips + transition-radiation tracker. */
  TRACKER_INNER_RADIUS: 0.033,
  TRACKER_OUTER_RADIUS: 1.08,
  TRACKER_HALF_LENGTH: 3.1,

  /** Superconducting solenoid. */
  SOLENOID_RADIUS: 1.23,
  SOLENOID_HALF_LENGTH: 2.9,

  /** Electromagnetic calorimeter (liquid argon): absorbs e± and photons. */
  ECAL_INNER_RADIUS: 1.5,
  ECAL_OUTER_RADIUS: 2.0,
  ECAL_HALF_LENGTH: 3.2,

  /** Hadronic calorimeter (steel / scintillating tiles): absorbs hadrons. */
  HCAL_INNER_RADIUS: 2.28,
  HCAL_OUTER_RADIUS: 4.25,
  HCAL_HALF_LENGTH: 6.1,

  /** Muon spectrometer: only muons (and neutrinos) penetrate this far. */
  MUON_INNER_RADIUS: 5.0,
  MUON_OUTER_RADIUS: 10.0,
  MUON_HALF_LENGTH: 22.0,

  /** Toroid field in the muon spectrometer (typical, T). */
  TOROID_FIELD: 0.5,

  /** Overall detector envelope: 46 m long, 25 m diameter. */
  OVERALL_LENGTH: 46,
  OVERALL_DIAMETER: 25,
});

/* =============================================================================
   Simulation settings
   ============================================================================= */
export const SIMULATION = Object.freeze({
  /** Time-scale slider range (dimensionless multiplier on the physics clock). */
  TIME_SCALE_MIN: 1e-9,
  TIME_SCALE_MAX: 1,
  TIME_SCALE_DEFAULT: 1e-4,

  /**
   * While beams circulate the ring, the clock never runs slower than this,
   * so one lap takes at most ~0.9 s of wall time at the slowest setting.
   */
  CIRCULATION_TIME_SCALE_FLOOR: 1e-4,

  /**
   * Dilation zone around IP1 (m from the interaction point).
   * Outside OUTER the circulation floor applies; inside INNER the user's
   * chosen time scale applies in full; between them the two blend
   * logarithmically.
   */
  DILATION_OUTER_DISTANCE: 300,
  DILATION_INNER_DISTANCE: 25,

  /**
   * Machine program, measured in turns. Injection and squeeze are faithful
   * in sequence; the energy ramp is compressed (real: ~13 million turns).
   */
  INJECTION_TURNS: 2,
  RAMP_TURNS: 6,
  SQUEEZE_TURNS: 1,

  /** After a displayed event, hold the display this long before the next trigger (wall s). */
  EVENT_DISPLAY_HOLD: 4,

  /** Clamp on a single frame's wall-clock delta (s), e.g. after a tab switch. */
  MAX_FRAME_DT: 0.1,

  /** Detector track integration (Boris pusher). */
  TRACK_STEP_LENGTH: 0.01,
  TRACK_MAX_STEPS: 6_000,

  /** Neutral, long-lived particles beyond this radius are treated as escaping (m). */
  WORLD_ESCAPE_RADIUS: 12,
});

/* =============================================================================
   Rendering — visual-only settings (never used by the physics)
   ============================================================================= */
export const RENDER = Object.freeze({
  /**
   * The real cryostat (0.914 m) would be invisible on a 26.7 km ring, so
   * transverse dimensions of the ring are drawn enlarged by this factor.
   * The enlargement tapers smoothly to 1 (true scale) near the detector.
   */
  TRANSVERSE_EXAGGERATION: 40,
  EXAGGERATION_TAPER_START: 400,
  EXAGGERATION_TAPER_END: 60,

  /** Ring tessellation. */
  RING_PATH_SEGMENTS: 2_400,
  RING_RADIAL_SEGMENTS: 18,

  /** Camera clipping planes (m); a logarithmic depth buffer covers the range. */
  CAMERA_NEAR: 0.005,
  CAMERA_FAR: 80_000,
  CAMERA_FOV: 50,

  /** Bloom post-processing. */
  BLOOM_STRENGTH: 1.1,
  BLOOM_RADIUS: 0.55,
  BLOOM_THRESHOLD: 0.12,

  /** Beam-trail length (number of stored positions per beam). */
  BEAM_TRAIL_POINTS: 180,
});

/* =============================================================================
   Colors — keep in sync with the --track-* tokens in src/styles/main.css
   ============================================================================= */
export const COLORS = Object.freeze({
  BACKGROUND: 0x04060b,

  RING_WIREFRAME: 0x2f6f9f,
  RING_GLOW: 0x5cc8ff,
  MAGNET_DIPOLE: 0x3a8fd0,
  MAGNET_QUADRUPOLE: 0xffb547,
  RF_CAVITY: 0x4be3a1,

  BEAM1: 0x5cc8ff,
  BEAM2: 0xff6bd6,
  COLLISION_FLASH: 0xffffff,

  TRACK_PHOTON: 0xf5d547,
  TRACK_ELECTRON: 0x3ddc84,
  TRACK_MUON: 0xff4d5e,
  TRACK_CHARGED: 0x4cc9f0,
  TRACK_NEUTRAL: 0xb388ff,
  TRACK_MET: 0xff6bd6,
  TRACK_JET: 0xffa24c,

  DETECTOR_TRACKER: 0x5cc8ff,
  DETECTOR_ECAL: 0x3ddc84,
  DETECTOR_HCAL: 0xffa24c,
  DETECTOR_MUON: 0x8597ab,
});