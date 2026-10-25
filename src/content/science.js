/**
 * Hadron Collider — Physics reference content
 *
 * Structured content for the Physics Reference dialog (rendered by
 * src/ui/InfoPanel.js). Data tables are generated from the simulation's own
 * data modules, so the reference and the physics engine always agree.
 *
 * Block types: p, h4, ul, table, callout (variant 'note'), source.
 * Inline emphasis: **bold**.
 */
import { MACHINE, DETECTOR, PHYSICS, SIMULATION, RENDER } from '../config/constants.js';
import { ALL_PARTICLES, getParticle, PDG } from '../data/particles.js';
import { getDecayTable } from '../data/decayModes.js';
import { crossSections, PROCESS } from '../physics/HardScatter.js';

/* =============================================================================
   Formatting helpers
   ============================================================================= */
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const sup = (n) => String(n).split('').map((c) => SUP[c] ?? c).join('');

function sci(x, digits = 3) {
  if (x === 0) return '0';
  const exp = Math.floor(Math.log10(Math.abs(x)));
  if (exp >= -2 && exp <= 3) return String(Number(x.toPrecision(digits)));
  const mant = Number((x / 10 ** exp).toPrecision(digits));
  return `${mant} × 10${sup(exp)}`;
}

function fmtCharge(charge3) {
  if (charge3 === 0) return '0';
  const sign = charge3 > 0 ? '+' : '−';
  return charge3 % 3 === 0 ? `${sign}${Math.abs(charge3) / 3}` : `${sign}${Math.abs(charge3)}/3`;
}

function fmtMass(gev) {
  if (gev === 0) return '0';
  if (gev < 1) return `${Number((gev * 1000).toPrecision(9))} MeV`;
  return `${Number(gev.toPrecision(7))} GeV`;
}

function fmtLifetime(seconds) {
  return Number.isFinite(seconds) ? `${sci(seconds)} s` : 'stable';
}

function fmtCrossSection(pb) {
  if (pb >= 1e9) return `${(pb / 1e9).toPrecision(3)} mb`;
  if (pb >= 1e6) return `${(pb / 1e6).toPrecision(3)} µb`;
  if (pb >= 1e3) return `${(pb / 1e3).toPrecision(3)} nb`;
  return `${pb.toPrecision(3)} pb`;
}

const spin = (s) => (s === 0.5 ? '½' : String(s));

const byFamily = (family) => ALL_PARTICLES.filter((p) => p.family === family);

/* =============================================================================
   Generated tables
   ============================================================================= */
const quarkTable = {
  type: 'table',
  head: ['Quark', 'Symbol', 'Charge (e)', 'Mass', 'Generation'],
  rows: byFamily('quark').map((q) => [q.name, q.symbol, fmtCharge(q.charge3), fmtMass(q.mass), String(q.generation)]),
};

const leptonTable = {
  type: 'table',
  head: ['Lepton', 'Symbol', 'Charge (e)', 'Mass', 'Lifetime'],
  rows: byFamily('lepton').map((l) => [
    l.name,
    l.symbol,
    fmtCharge(l.charge3),
    l.mass === 0 ? '< 0.45 eV' : fmtMass(l.mass),
    fmtLifetime(l.lifetime),
  ]),
};

const hadronTable = {
  type: 'table',
  head: ['Hadron', 'Type', 'Quarks', 'Charge', 'Mass', 'Lifetime'],
  rows: ALL_PARTICLES.filter((p) => p.family === 'meson' || p.family === 'baryon').map((h) => [
    `${h.symbol} (${h.name})`,
    h.family,
    h.content ?? '—',
    fmtCharge(h.charge3),
    fmtMass(h.mass),
    fmtLifetime(h.lifetime),
  ]),
};

const bosonTable = {
  type: 'table',
  head: ['Boson', 'Force', 'Spin', 'Mass', 'Width', 'Lifetime'],
  rows: [
    [PDG.PHOTON, 'Electromagnetic'],
    [PDG.GLUON, 'Strong'],
    [PDG.W_PLUS, 'Weak (charged current)'],
    [PDG.Z, 'Weak (neutral current)'],
    [PDG.HIGGS, 'Gives mass (Higgs field)'],
  ].map(([code, force]) => {
    const b = getParticle(code);
    return [
      `${b.symbol} (${b.name})`,
      force,
      spin(b.spin),
      fmtMass(b.mass),
      b.width > 0 ? fmtMass(b.width) : '—',
      fmtLifetime(b.lifetime),
    ];
  }),
};

const higgsDecayTable = {
  type: 'table',
  head: ['Decay', 'Branching ratio'],
  rows: getDecayTable(PDG.HIGGS).modes.map((m) => [
    `H → ${m.products.map((c) => getParticle(c).symbol).join(' ')}${m.offShell ? ' (one virtual)' : ''}`,
    `${(m.br * 100).toPrecision(3)}%`,
  ]),
};

const sigma = crossSections(2 * MACHINE.RUN3_ENERGY);
const crossSectionTable = {
  type: 'table',
  head: ['Process', 'σ at √s = 13.6 TeV', 'Roughly 1 in…'],
  rows: [
    [PROCESS.SOFT, 'Soft QCD (minimum bias)'],
    [PROCESS.DIJET, 'QCD dijets (pT > 20 GeV)'],
    [PROCESS.BB, 'b b̄ pairs'],
    [PROCESS.W, 'W boson'],
    [PROCESS.Z, 'Z boson'],
    [PROCESS.TT, 't t̄ pairs'],
    [PROCESS.H, 'Higgs (gluon fusion)'],
  ].map(([id, name]) => {
    const s = sigma.get(id);
    const odds = sigma.get('inelastic') / s;
    return [name, fmtCrossSection(s), odds < 2 ? '—' : Number(odds.toPrecision(2)).toLocaleString('en-US')];
  }),
};

const machineTable = {
  type: 'table',
  head: ['Parameter', 'Value'],
  rows: [
    ['Circumference', `${MACHINE.CIRCUMFERENCE.toLocaleString('en-US')} m`],
    ['Main dipoles', `${MACHINE.DIPOLE_COUNT} × ${MACHINE.DIPOLE_MAGNETIC_LENGTH} m`],
    ['Dipole bending radius', `${MACHINE.DIPOLE_BENDING_RADIUS} m`],
    ['Dipole field at 7 TeV', `${MACHINE.DIPOLE_DESIGN_FIELD} T at 1.9 K`],
    ['Injection energy', `${MACHINE.INJECTION_ENERGY} GeV`],
    ['Run 3 energy per beam', `${MACHINE.RUN3_ENERGY / 1000} TeV (√s = ${(2 * MACHINE.RUN3_ENERGY) / 1000} TeV)`],
    ['RF frequency', `${MACHINE.RF_FREQUENCY / 1e6} MHz (harmonic ${MACHINE.RF_HARMONIC_NUMBER.toLocaleString('en-US')})`],
    ['RF voltage per beam', `${MACHINE.RF_VOLTAGE_INJECTION / 1e6} → ${MACHINE.RF_VOLTAGE_COLLISION / 1e6} MV`],
    ['Betatron tunes (H / V)', `${MACHINE.TUNE_HORIZONTAL} / ${MACHINE.TUNE_VERTICAL}`],
    ['β* (design / Run 3)', `${MACHINE.BETA_STAR_DESIGN} m / ${MACHINE.BETA_STAR_RUN3} m`],
    ['Bunch spacing', '25 ns'],
    ['Bunches per beam (design)', MACHINE.BUNCHES_PER_BEAM_DESIGN.toLocaleString('en-US')],
    ['Protons per bunch (design)', sci(MACHINE.PROTONS_PER_BUNCH_DESIGN)],
  ],
};

/* =============================================================================
   Topics
   ============================================================================= */
export const TOPICS = Object.freeze([
  /* ------------------------------------------------------------------------ */
  {
    id: 'standard-model',
    title: 'The Standard Model',
    blocks: [
      { type: 'p', text: 'The **Standard Model** is the theory describing every known elementary particle and three of the four fundamental forces: electromagnetism, the weak force, and the strong force. Gravity is not included. It is the most precisely tested theory in science: some of its predictions agree with experiment to better than one part in a billion.' },
      { type: 'h4', text: 'Matter particles: fermions' },
      { type: 'p', text: 'All ordinary matter is built from **fermions**, particles with spin ½. There are twelve, in two families of six: **quarks**, which feel the strong force, and **leptons**, which do not. Each family comes in three **generations** of increasing mass. Everything around you is made from the first generation alone: up and down quarks (inside protons and neutrons) and electrons.' },
      { type: 'h4', text: 'Force carriers: bosons' },
      { type: 'p', text: 'Forces act through the exchange of **gauge bosons** (spin 1): the **photon** for electromagnetism, eight **gluons** for the strong force, and the **W⁺, W⁻, and Z** for the weak force. The **Higgs boson** (spin 0) is the excitation of the field that gives the W, Z, quarks, and charged leptons their masses.' },
      { type: 'h4', text: 'Antimatter' },
      { type: 'p', text: 'Every fermion has an **antiparticle** with the same mass and opposite charges: the positron (e⁺) for the electron, the antiproton (p̄) for the proton. When a particle meets its antiparticle they can annihilate into energy, and energy can create particle–antiparticle pairs. That is what happens, billions of times per second, at the LHC.' },
      { type: 'callout', text: 'A collider turns energy into matter. Through **E = mc²**, the kinetic energy of the colliding protons can become new, heavier particles that did not exist inside the protons before the collision.' },
    ],
  },

  /* ------------------------------------------------------------------------ */
  {
    id: 'hadrons',
    title: 'Hadrons',
    blocks: [
      { type: 'p', text: 'A **hadron** is any composite particle made of quarks (and antiquarks) bound together by the **strong force**. The name comes from the Greek *hadrós*, "stout" or "thick." The Large Hadron Collider is named for the hadrons it collides: protons.' },
      { type: 'h4', text: 'Baryons and mesons' },
      { type: 'ul', items: [
        '**Baryons** contain three quarks, carry baryon number +1, and have half-integer spin (½, 3/2…). Protons (uud) and neutrons (udd) are baryons; so is the Λ (uds).',
        '**Mesons** contain one quark and one antiquark, carry baryon number 0, and have integer spin (0, 1…). Pions (π), kaons (K), and the B and D mesons are mesons.',
        '**Exotic hadrons** with four quarks (tetraquarks) or five (pentaquarks) have also been observed; LHCb reported the first clear pentaquark states in 2015.',
      ] },
      { type: 'h4', text: 'Why quarks are always confined' },
      { type: 'p', text: 'Quarks carry **color charge**, and the strong force between colored objects does not weaken with distance; beyond about a femtometre (10⁻¹⁵ m) it stays roughly constant, like a stretched elastic string with a tension of about **1 GeV per femtometre**. Pulling quarks apart stores so much energy in the string that it becomes cheaper to create a new quark–antiquark pair from that energy. The string snaps into two hadrons instead of releasing a free quark. This is **confinement**: every hadron is "colorless" overall.' },
      { type: 'h4', text: 'Where hadron mass comes from' },
      { type: 'p', text: 'A proton weighs 938 MeV, yet its three valence quarks add up to only about 9 MeV. Roughly **99% of a proton\'s mass is the energy of the strong-force field** and the motion of the quarks and gluons inside it (E = mc² in reverse). The Higgs field gives quarks their small intrinsic masses, but the mass of almost all visible matter comes from quantum chromodynamics.' },
      { type: 'h4', text: 'Hadrons in this simulation' },
      hadronTable,
      { type: 'source', text: 'Masses and lifetimes: Particle Data Group, Review of Particle Physics (2024); CODATA 2022 for the proton and neutron.' },
    ],
  },

  /* ------------------------------------------------------------------------ */
  {
    id: 'proton',
    title: 'Inside the proton',
    blocks: [
      { type: 'p', text: 'The textbook picture, "two up quarks and one down quark," describes the proton\'s **valence quarks**: the net quark content that gives it charge +1 and baryon number +1. At LHC energies the real proton is far richer.' },
      { type: 'h4', text: 'Valence quarks, sea quarks, and gluons' },
      { type: 'ul', items: [
        '**Valence quarks** (u, u, d): the permanent net content. Exactly 2 more u than ū and 1 more d than d̄, always.',
        '**Sea quarks**: quark–antiquark pairs (uū, dd̄, ss̄, even cc̄ and bb̄) constantly created and annihilated by gluons. There are slightly more d̄ than ū in the sea, an asymmetry measured by the E866/NuSea experiment at Fermilab.',
        '**Gluons**: the carriers of the strong force. At the energies probed by the LHC, gluons carry about **half of the proton\'s momentum**, more than all the quarks combined.',
      ] },
      { type: 'h4', text: 'Parton distribution functions' },
      { type: 'p', text: 'Quarks and gluons are collectively called **partons**. A **parton distribution function** f(x) gives the probability of finding a parton carrying a fraction x of the proton\'s momentum. Gluons dominate at small x; valence quarks dominate at large x. In a collision, typically just **one parton from each proton** takes part in the hard interaction, so the energy available, √ŝ = √(x₁x₂s), is usually a small fraction of the full √s.' },
      { type: 'callout', text: 'This is why heavy particles are rare: making a 125 GeV Higgs boson requires two gluons whose momentum fractions multiply to at least (125/13 600)² ≈ 8 × 10⁻⁵. Gluons that energetic are much less common than soft ones.' },
      { type: 'h4', text: 'More proton facts' },
      { type: 'ul', items: [
        `Mass: ${fmtMass(PHYSICS.PROTON_MASS)} (CODATA 2022), about 1836 times the electron mass.`,
        'Charge radius: about 0.84 femtometres.',
        'Lifetime: stable as far as anyone can tell; experiments place the lower limit above 10³⁴ years.',
        'Spin: the quark spins supply only about 30% of the proton\'s spin ½; the rest comes from gluon spin and orbital motion (the "proton spin puzzle").',
      ] },
    ],
  },

  /* ------------------------------------------------------------------------ */
  {
    id: 'quarks',
    title: 'Quarks and color charge',
    blocks: [
      { type: 'p', text: 'Quarks are elementary fermions with **fractional electric charge**: +2/3 e for up-type quarks (u, c, t) and −1/3 e for down-type quarks (d, s, b). They are the only known particles that feel all four fundamental interactions.' },
      quarkTable,
      { type: 'p', text: 'Because quarks are never free, their masses are defined in a particular theoretical scheme: the light quarks (u, d, s) are quoted at an energy scale of 2 GeV, c and b at their own mass scale, and the top quark from direct reconstruction of its decays.' },
      { type: 'h4', text: 'Color charge and gluons' },
      { type: 'p', text: 'The strong force acts on **color charge**, which comes in three kinds called red, green, and blue (no relation to real colors). Antiquarks carry anticolors. The theory of the strong force is **quantum chromodynamics (QCD)**. Unlike photons, which are neutral, **gluons themselves carry color**, so they attract each other. There are **eight gluons**.' },
      { type: 'h4', text: 'Asymptotic freedom' },
      { type: 'p', text: 'At very short distances (high energies) the strong force becomes weak, so quarks inside a proton behave almost as free particles when struck hard. This **asymptotic freedom** earned Gross, Wilczek, and Politzer the 2004 Nobel Prize in Physics. It is why collisions can be described as individual partons scattering.' },
      { type: 'h4', text: 'Jets' },
      { type: 'p', text: 'A quark or gluon knocked out of a proton stretches a color string, which breaks repeatedly into quark–antiquark pairs. The result is a narrow spray of hadrons, a **jet**, pointing along the original parton\'s direction. Jets are how quarks and gluons appear in a detector.' },
      { type: 'h4', text: 'Discovery history' },
      { type: 'ul', items: [
        'Up and down: deep inelastic scattering at SLAC, 1968, revealed point-like constituents inside the proton.',
        'Strange: implied by kaons, discovered in cosmic rays in 1947.',
        'Charm: the J/ψ (a cc̄ meson), discovered simultaneously at Brookhaven and SLAC in November 1974.',
        'Bottom: the Υ (a bb̄ meson), Fermilab, 1977.',
        'Top: the CDF and DØ experiments at Fermilab, 1995. At 172.6 GeV it is the heaviest known elementary particle and decays in about 5 × 10⁻²⁵ s, too fast to form any hadron.',
        'Gluon: three-jet events at the PETRA collider (DESY), 1979.',
      ] },
    ],
  },

  /* ------------------------------------------------------------------------ */
  {
    id: 'leptons',
    title: 'Leptons',
    blocks: [
      { type: 'p', text: '**Leptons** are elementary fermions that do not carry color charge, so they do not feel the strong force. As far as all experiments can tell, they have **no internal structure**: unlike hadrons, they are not made of anything smaller.' },
      leptonTable,
      { type: 'h4', text: 'Charged leptons' },
      { type: 'ul', items: [
        '**Electron** (e⁻): discovered by J. J. Thomson in 1897; stable. Electrons and positrons are stopped in the electromagnetic calorimeter.',
        '**Muon** (μ⁻): 207 times heavier than the electron; discovered in cosmic rays in 1936. It lives 2.2 µs at rest, but time dilation lets fast muons travel kilometres. Muons pass through calorimeters almost untouched, so a detector\'s outermost layer is built to catch them.',
        '**Tau** (τ⁻): discovered at SLAC in 1975 by Martin Perl. Heavy enough (1.777 GeV) to decay into hadrons, which it does about 65% of the time.',
      ] },
      { type: 'h4', text: 'Neutrinos' },
      { type: 'p', text: 'Each charged lepton has a neutral partner **neutrino** (νₑ, ν_μ, ν_τ). Neutrinos interact only through the weak force, so they pass through a detector, and even the Earth, almost never interacting. The discovery that neutrinos **oscillate** between flavors proved they have mass (Nobel Prize 2015, Kajita and McDonald), but that mass is tiny: the KATRIN experiment limits it to below about 0.45 eV.' },
      { type: 'callout', text: 'Collider detectors "see" neutrinos only by what is missing. Momentum perpendicular to the beam must balance to zero; an imbalance, called **missing transverse energy**, reveals invisible particles.' },
      { type: 'h4', text: 'Lepton number' },
      { type: 'p', text: 'In every interaction observed at colliders, **lepton number** is conserved: leptons count +1, antileptons −1. When a muon decays, μ⁻ → e⁻ ν̄ₑ ν_μ, the total lepton number stays +1. The simulation checks this law for every decay.' },
    ],
  },

  /* ------------------------------------------------------------------------ */
  {
    id: 'bosons',
    title: 'Force carriers',
    blocks: [
      { type: 'p', text: 'In quantum field theory, forces arise from the exchange of **bosons**. The range of a force is set by the mass of its carrier: massless photons give electromagnetism infinite range, while the heavy W and Z confine the weak force to about 10⁻¹⁸ m.' },
      bosonTable,
      { type: 'ul', items: [
        '**Photon** (γ): carrier of electromagnetism; massless and electrically neutral.',
        '**Gluons** (g): eight massless carriers of the strong force, each carrying color charge.',
        '**W⁺, W⁻, Z**: carriers of the weak force, responsible for radioactive β decay and the only force that can change a quark\'s flavor. Discovered at CERN in 1983 by the UA1 and UA2 experiments (Nobel Prize 1984, Rubbia and van der Meer).',
      ] },
      { type: 'p', text: 'The W and Z are so short-lived (about 3 × 10⁻²⁵ s) that they are never seen directly; they are identified from their decay products. A Z decaying to two muons shows up as a pair whose combined **invariant mass** peaks at 91.19 GeV.' },
      { type: 'source', text: 'Masses and widths: PDG 2024. Lifetimes computed as τ = ħ/Γ.' },
    ],
  },

  /* ------------------------------------------------------------------------ */
  {
    id: 'higgs',
    title: 'The Higgs boson',
    blocks: [
      { type: 'p', text: 'The **Higgs field** fills all of space. Particles that interact with it acquire mass; the stronger the interaction, the heavier the particle. The W and Z gain mass this way (the Brout–Englert–Higgs mechanism, proposed in 1964), as do the quarks and charged leptons through so-called Yukawa couplings. The photon and gluons do not interact with the field and remain massless.' },
      { type: 'p', text: 'The **Higgs boson** is a ripple in that field. Its discovery was announced by the ATLAS and CMS collaborations at CERN on **4 July 2012**, and François Englert and Peter Higgs received the 2013 Nobel Prize in Physics.' },
      { type: 'h4', text: 'Production' },
      { type: 'p', text: 'At the LHC the Higgs is made mainly by **gluon fusion**: two gluons create a virtual top-quark loop, which produces the Higgs. The top quark couples most strongly to the Higgs because it is the heaviest particle.' },
      { type: 'h4', text: 'Decays (Standard Model, m_H ≈ 125 GeV)' },
      higgsDecayTable,
      { type: 'p', text: 'The most common decay, to b b̄, is buried under enormous backgrounds of ordinary b-quark production. The discovery came instead from two **rare but clean** channels: **H → γγ** (two high-energy photons) and **H → ZZ* → 4 leptons** (the "golden channel").' },
      { type: 'callout', variant: 'note', text: 'The Higgs gives mass to elementary particles, but it is **not** the main source of your mass. About 99% of the mass of protons and neutrons, and so of atoms, comes from strong-force energy (see "Inside the proton").' },
      { type: 'source', text: 'Branching ratios: LHC Higgs Working Group, CERN Yellow Report 4.' },
    ],
  },

  /* ------------------------------------------------------------------------ */
  {
    id: 'lhc',
    title: 'The Large Hadron Collider',
    blocks: [
      { type: 'p', text: 'The LHC lies 50 to 175 metres underground beneath the France–Switzerland border near Geneva, in the tunnel originally built for the LEP electron–positron collider. Two proton beams circulate in opposite directions in separate vacuum pipes and cross at four points, where the experiments ATLAS, ALICE, CMS, and LHCb record the collisions.' },
      machineTable,
      { type: 'h4', text: 'The injector chain' },
      { type: 'p', text: 'Protons start as hydrogen ions and are accelerated in stages: **Linac4 → Proton Synchrotron Booster → Proton Synchrotron → Super Proton Synchrotron → LHC**, entering the LHC at 450 GeV.' },
      { type: 'h4', text: 'Magnets' },
      { type: 'p', text: `Superconducting niobium–titanium dipoles, cooled by superfluid helium to 1.9 K (colder than outer space), bend the beams. The required field follows from p = qBρ: at 6.8 TeV the dipoles run at about ${((MACHINE.RUN3_ENERGY / (PHYSICS.RIGIDITY * MACHINE.DIPOLE_BENDING_RADIUS))).toFixed(2)} T. Quadrupole magnets focus the beams in alternating planes (the FODO pattern), and powerful triplet quadrupoles squeeze them to micrometre size at the collision points.` },
      { type: 'h4', text: 'A fill, step by step' },
      { type: 'ul', items: [
        '**Injection**: beams enter at 450 GeV.',
        '**Ramp**: RF cavities raise the energy while the dipole current rises in step; about 20 minutes in the real machine.',
        '**Squeeze**: the optics at the interaction points tighten (β* falls from 11 m to tens of centimetres), shrinking the beams.',
        '**Stable beams**: separation bumps are collapsed, the beams collide head-on, and the experiments take data for many hours.',
        '**Dump**: the beams are extracted at Point 6 onto graphite absorber blocks. At design intensity each beam stores about 360 MJ, comparable to a high-speed train.',
      ] },
      { type: 'p', text: 'Bunches cross every 25 ns, and in Run 3 each crossing produces on average around 50–60 simultaneous proton–proton collisions ("pile-up").' },
    ],
  },

  /* ------------------------------------------------------------------------ */
  {
    id: 'detector',
    title: 'The detector',
    blocks: [
      { type: 'p', text: 'A general-purpose detector such as ATLAS is built like an onion: concentric layers, each designed to measure a different kind of particle. ATLAS is 46 m long, 25 m in diameter, and weighs about 7000 tonnes. The detector in this simulation follows its layout.' },
      {
        type: 'table',
        head: ['Layer', 'Radius', 'What it does'],
        rows: [
          ['Beam pipe', `${DETECTOR.BEAM_PIPE_RADIUS * 1000} mm`, 'Beryllium: nearly transparent to particles'],
          ['Inner tracker', `${DETECTOR.TRACKER_INNER_RADIUS * 1000} mm – ${DETECTOR.TRACKER_OUTER_RADIUS} m`, 'Records charged tracks; curvature in the field gives momentum and charge'],
          ['Solenoid', `${DETECTOR.SOLENOID_RADIUS} m`, `${DETECTOR.SOLENOID_FIELD} T field along the beam`],
          ['EM calorimeter', `${DETECTOR.ECAL_INNER_RADIUS} – ${DETECTOR.ECAL_OUTER_RADIUS} m`, 'Absorbs electrons and photons and measures their energy'],
          ['Hadronic calorimeter', `${DETECTOR.HCAL_INNER_RADIUS} – ${DETECTOR.HCAL_OUTER_RADIUS} m`, 'Absorbs hadrons (pions, kaons, protons, neutrons)'],
          ['Muon spectrometer', `${DETECTOR.MUON_INNER_RADIUS} – ${DETECTOR.MUON_OUTER_RADIUS} m`, 'Tracks muons in a toroidal field'],
        ],
      },
      { type: 'h4', text: 'Identifying particles by their signatures' },
      {
        type: 'table',
        head: ['Particle', 'Tracker', 'EM cal.', 'Hadronic cal.', 'Muon system'],
        rows: [
          ['Photon γ', '—', 'shower', '—', '—'],
          ['Electron e±', 'track', 'shower', '—', '—'],
          ['Charged hadron', 'track', 'small', 'shower', '—'],
          ['Neutral hadron', '—', 'small', 'shower', '—'],
          ['Muon μ±', 'track', 'tiny', 'tiny', 'track'],
          ['Neutrino ν', '—', '—', '—', '— (missing energy)'],
        ],
      },
      { type: 'h4', text: 'Measuring momentum' },
      { type: 'p', text: 'A charged particle in a magnetic field B curls with radius r = pT / (0.3 · B) (r in m, pT in GeV, B in T). In the 2 T solenoid a 1 GeV pion bends with a 1.7 m radius; a 100 GeV muon is almost straight. Tracks with pT below about 0.3 GeV curl up inside the tracker and never reach the calorimeters.' },
      { type: 'h4', text: 'The trigger' },
      { type: 'p', text: 'Bunches cross up to 40 million times per second, far too many to store. A hardware **trigger** selects about 100 000 crossings per second, and a software trigger keeps roughly 1000–3000 of the most interesting. This simulation likewise displays one event and holds it on screen before the next is triggered.' },
    ],
  },

  /* ------------------------------------------------------------------------ */
  {
    id: 'event-display',
    title: 'Reading an event display',
    blocks: [
      { type: 'ul', items: [
        '**Blue lines**: charged hadrons (mostly pions). Bundles of them pointing the same way are **jets**.',
        '**Green lines ending in green towers**: electrons absorbed in the electromagnetic calorimeter.',
        '**Yellow lines**: photons. Neutral, so they leave no tracker hits; they end in green EM towers. Pairs of photons often come from π⁰ → γγ.',
        '**Red lines crossing everything**: muons. Two energetic muons together often signal a Z or J/ψ decay.',
        '**Faint purple dashed lines**: neutral hadrons (neutrons, K_L), which are invisible in the tracker.',
        '**Dashed magenta lines**: neutrinos, which escape unseen. The detector infers them from missing transverse energy.',
        '**Towers**: energy deposits in the calorimeters; height grows with the logarithm of energy.',
        '**White dots away from the centre**: **secondary vertices**, where a B meson, D meson, K_S, or Λ decayed after flying millimetres to centimetres. B-meson vertices are how b-quark jets are tagged.',
        '**Spirals in the tracker**: low-momentum "loopers" curling in the magnetic field.',
      ] },
      { type: 'h4', text: 'The panel on the right' },
      { type: 'ul', items: [
        '**Hard process**: the parton-level collision, e.g. u ū → Z⁰, with its true probability per collision.',
        '**Partons**: which parton came from each proton and its momentum fraction x.',
        '**√ŝ**: the energy of the parton collision, compared with the full proton–proton √s.',
        '**Multiplicity**: visible particles produced (charged count in brackets).',
        '**Decay chain**: the notable decays in the order they occurred.',
      ] },
    ],
  },

  /* ------------------------------------------------------------------------ */
  {
    id: 'kinematics',
    title: 'Kinematics and units',
    blocks: [
      { type: 'h4', text: 'Natural units' },
      { type: 'p', text: 'Particle physicists set c = 1, so energy, momentum, and mass are all quoted in **electronvolts**: 1 GeV = 10⁹ eV ≈ 1.6 × 10⁻¹⁰ J. A proton\'s mass is 0.938 GeV; each LHC beam proton carries 6.8 TeV, about 7000 times its rest energy.' },
      { type: 'h4', text: 'Four-vectors and invariant mass' },
      { type: 'p', text: 'Energy and momentum form a **four-vector** p = (E, pₓ, p_y, p_z). Its "length" m² = E² − |p|² is the same in every reference frame. Adding the four-vectors of decay products and computing this invariant mass recovers the mass of the parent; this is how the Z, the top quark, and the Higgs are found in real data.' },
      { type: 'h4', text: 'Collider variables' },
      { type: 'ul', items: [
        '**√s**: total collision energy of the two protons, 2 × 6.8 TeV = 13.6 TeV for head-on beams.',
        '**√ŝ**: energy of the colliding partons, √(x₁x₂) · √s.',
        '**pT (transverse momentum)**: momentum perpendicular to the beam. The initial pT is zero, so the final-state pT must balance.',
        '**η (pseudorapidity)**: −ln tan(θ/2), where θ is the angle from the beam. η = 0 is perpendicular to the beam; |η| ≈ 4.9 is the edge of ATLAS\'s coverage.',
        '**γ (Lorentz factor)**: E/m. A 6.8 TeV proton has γ ≈ 7250 and β = v/c ≈ 0.999 999 990 5.',
      ] },
      { type: 'h4', text: 'Cross-sections' },
      { type: 'p', text: 'The likelihood of a process is its **cross-section**, measured in **barns** (1 b = 10⁻²⁸ m²). Proton–proton collisions at 13.6 TeV have an inelastic cross-section near 80 millibarns; Higgs production is about 50 picobarns, a billion times smaller.' },
      crossSectionTable,
    ],
  },

  /* ------------------------------------------------------------------------ */
  {
    id: 'about',
    title: 'About this simulation',
    blocks: [
      { type: 'p', text: 'Every collision here is computed, not animated. Two Particle objects are carried around a model of the LHC by its magnet lattice, brought into collision by the code, and the outcome is generated from measured physics. This section states plainly what is exact and what is simplified.' },
      { type: 'h4', text: 'Taken directly from measurement or theory' },
      { type: 'ul', items: [
        'Fundamental constants (CODATA 2022) and particle masses, widths, lifetimes, and quark content (PDG 2024).',
        'LHC geometry: circumference, 8 arcs and 8 straight sections, 1232 dipoles, bending radius, the eight access points, injection points, and beam directions.',
        'Magnetic rigidity (p = qBρ), relativistic kinematics with numerically stable formulas, Lorentz boosts, and time dilation.',
        'Charged-particle motion by the Boris algorithm in a solenoid + toroid field.',
        'Branching ratios from PDG and the LHC Higgs Working Group, with automatic checks of charge, baryon-number, and lepton-number conservation.',
        'Exponential lifetime sampling, Breit–Wigner resonance shapes, and GENBOD phase space; four-momentum conservation is verified for every event.',
      ] },
      { type: 'h4', text: 'Simplified or approximated' },
      { type: 'ul', items: [
        '**One proton per bunch**: each bunch is represented by its lead proton. A real crossing has ~10¹¹ protons per bunch and ~50–60 simultaneous collisions (pile-up).',
        `**Compressed ramp**: the energy ramp completes in ${SIMULATION.RAMP_TURNS} turns instead of ~13 million (≈ 20 minutes). The per-turn RF physics is computed at real values and then multiplied by an explicit compression factor.`,
        '**Common RF reference**: both beams are locked to one timing reference so they always meet at IP1.',
        '**Smooth-approximation optics**: betatron motion uses the real tunes and β-function scaling, not a full magnet-by-magnet lattice model.',
        '**Analytic PDFs** at a fixed scale (shapes and momentum fractions modelled on CT18/NNPDF), without QCD evolution.',
        '**Leading-order hard processes** with literature cross-sections; no parton shower (initial- and final-state radiation), which in reality broadens jets and adds extra jets.',
        '**String-inspired fragmentation** with Pythia parameters but only pseudoscalar mesons and octet baryons; rarer hadrons are mapped to catalogued ones of the same charge.',
        '**Phase-space decays**: no spin correlations or matrix-element weighting.',
        '**Simplified detector response**: no electromagnetic or hadronic showers, no energy loss except for stopped loopers, and absorption at fixed depths.',
      ] },
      { type: 'h4', text: 'Time and scale on screen' },
      { type: 'ul', items: [
        `The clock runs in real physics time scaled by the slider (10⁻⁹ to 1). While bunches circulate, it never runs slower than ${sci(SIMULATION.CIRCULATION_TIME_SCALE_FLOOR)}×; within ${SIMULATION.DILATION_OUTER_DISTANCE} m of IP1 it eases to the chosen slow-motion setting.`,
        `In the ring view, the tube's width is drawn ${RENDER.TRANSVERSE_EXAGGERATION}× larger than real so it is visible on a 26.7 km ring. It tapers to true scale near the detector. The physics never sees this enlargement.`,
      ] },
      { type: 'source', text: 'Sources: CODATA 2022; Particle Data Group, Review of Particle Physics (2024); LHC Design Report (CERN-2004-003); LHC Higgs Working Group Yellow Report 4; ATLAS detector papers; T. Sjöstrand et al., Pythia 8 manual; F. James, CERN 68-15 (GENBOD); J. P. Boris (1970).' },
    ],
  },
]);