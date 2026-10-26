# Hadron Collider
# FOR A VIDEO DEMO OF THIS PROJECT PLEASE VISIT: 

A physics-driven, real-time WebGL simulation of a proton–proton collider, modeled on CERN's Large Hadron Collider.

Two proton bunches circulate in opposite directions around a 26.7 km ring, steered by simulated superconducting magnets and accelerated by RF cavities. When they meet head-on inside an ATLAS-style detector, the collision is computed, not animated: the outcome is generated from measured physics, so no two collisions are ever the same.

Built with [Three.js](https://threejs.org/) and [Vite](https://vite.dev/).

---

## Features

**The machine**
- The real LHC layout: 8 curved arcs and 8 straight sections totaling 26,658.883 m, with all 1,232 superconducting dipole magnets, arc quadrupoles in FODO cells, and RF cavities at Point 4
- The full machine cycle using real LHC beam-mode names: Injection → Ramp → Squeeze → Stable Beams
- Beam energy from 450 GeV (injection) to 7 TeV (design), defaulting to the Run 3 energy of 6.8 TeV (√s = 13.6 TeV)
- Dipole field computed from magnetic rigidity (p = qBρ), rising from 0.54 T to 8.09 T as the beams ramp
- Betatron oscillations with the real LHC tunes, adiabatic damping, and β* squeezed from 11 m to 0.3 m

**The collision**
- Collisions detected from the protons' actual positions and four-momenta, with a collision vertex sampled in the luminous region
- Process selection weighted by real cross-sections: soft QCD, dijets, b-quark pairs, W and Z bosons, top-quark pairs, and the Higgs boson
- Parton distribution functions satisfying the proton's momentum and valence sum rules
- Real branching ratios from the Particle Data Group, with charge, baryon-number, and lepton-number conservation verified for every decay
- String fragmentation using Pythia 8 parameters, multi-parton interactions, and beam remnants
- Four-momentum conservation checked against the incoming protons for every event

**The detector**
- An ATLAS-inspired detector: pixel and strip trackers, a 2 T solenoid, electromagnetic and hadronic calorimeters (64 tile modules), a muon spectrometer, and 8 toroid coils
- Charged tracks curving in the magnetic field (Boris algorithm), particles decaying in flight with time dilation, and absorption in the correct detector layer
- An event display with color-coded tracks, calorimeter energy towers, missing transverse energy, and displaced secondary vertices

**The experience**
- Time control spanning nine orders of magnitude, from real time (1×) to one-billionth speed (10⁻⁹×)
- Three camera views with cinematic transitions: Ring, Follow Beam, and Detector
- A live Event Display listing the hard process, its true odds, the colliding partons, and the decay chain
- A built-in Physics Reference covering hadrons, leptons, quarks, force carriers, the Higgs boson, the LHC, and detectors
- Synthesized sound effects (Web Audio API, no audio files): a beam hum that follows the energy, beam-mode tones, collision impacts, and distinct signatures for rare processes

---

## Getting started

### Requirements

- [Node.js](https://nodejs.org/) 20.19 or newer
- A browser with WebGL2 support (current Chrome, Edge, Firefox, or Safari)

### Install and run

```bash
npm install
npm run dev
```

Vite starts a local development server and opens the collider in your browser, usually at `http://localhost:5173`.

### Production build

```bash
npm run build
npm run preview
```

`npm run build` writes an optimized static site to `dist/`. It uses relative paths, so it can be hosted on any static host, including GitHub Pages. `npm run preview` serves the build locally for a final check.

---

## Controls

| Control | What it does |
|---|---|
| **Activate Collider** | Injects the beams and runs the machine cycle; switching off dumps the beams. **Spacebar** also toggles it. |
| **Time Scale** | Scales the physics clock from 10⁻⁹× to 1×. Defaults to 10⁻⁴×, where one lap takes about a second. |
| **Beam Energy** | Energy per beam, 0.45 to 7 TeV. Changes apply at the next fill, as on the real machine. |
| **Enhance rare processes** | Makes W, Z, top, and Higgs events far more frequent. The Event Display always reports the true odds. |
| **Camera** | **Ring** for the overview, **Follow Beam** to ride behind a bunch, **Detector** to watch collisions. |
| **Sound** | Mutes or unmutes audio; the setting is remembered. |
| **Physics Reference** | Opens the in-depth reference on particle physics and the collider. |

**Mouse:** left-drag to orbit, scroll to zoom, right-drag to pan.

### Tips

- **Watch a collision in slow motion:** select **Detector**, set the time scale to about 10⁻⁸, and activate the collider.
- **Ride the beam:** select **Follow Beam** at the default 10⁻⁴× and activate the collider.
- **Hunt for the Higgs:** turn on **Enhance rare processes** and listen for its bell-chord signature.

---

## How it works

Every frame, the simulation clock converts wall-clock time into physics time using the chosen time scale. Then:

1. **Accelerator** moves the two bunches along the ring, applies RF energy kicks at Point 4, ramps the dipoles in step with the energy, and stops exactly when the bunches meet at IP1.
2. **CollisionDetector** checks that the two protons actually overlap in space and are head-on, then computes the collision energy from their four-momenta.
3. **EventGenerator** builds the event: the hard scatter, instant decays of short-lived particles, multi-parton interactions, beam remnants, and hadronization.
4. Every particle is **transported** through the detector's magnetic field, decays when its sampled lifetime runs out, and stops where its type interacts.
5. The **renderer** draws whatever the physics computed: tracks, towers, vertices, and the beams.

While the bunches circle the ring, the clock never runs slower than 10⁻⁴× so the machine cycle completes in seconds. Approaching the collision, it eases smoothly down to the chosen slow-motion setting.

---

## Project structure

```
hadron-collider/
├── index.html                  Page layout and control-room interface
├── vite.config.js              Dev server and build configuration
├── package.json
├── public/
│   └── favicon.svg
└── src/
    ├── main.js                 Boot sequence, module wiring, frame loop
    ├── audio/
    │   └── SoundEngine.js      Synthesized sound effects
    ├── config/
    │   └── constants.js        Physical constants and machine parameters
    ├── content/
    │   └── science.js          Physics Reference content
    ├── core/
    │   ├── EventBus.js         Publish/subscribe messaging between modules
    │   └── SimulationClock.js  Physics clock and time scaling
    ├── data/
    │   ├── particles.js        Particle catalog (PDG 2024)
    │   └── decayModes.js       Branching ratios with conservation checks
    ├── physics/
    │   ├── FourVector.js       Relativistic kinematics
    │   ├── Particle.js         Particle state and lifetime sampling
    │   ├── MagnetLattice.js    Ring geometry and magnet layout
    │   ├── RFCavity.js         Acceleration and synchrotron radiation
    │   ├── BorisPusher.js      Charged-particle motion and detector field
    │   ├── Accelerator.js      Beam dynamics and machine cycle
    │   ├── CollisionDetector.js Bunch-crossing logic
    │   ├── PartonDistributions.js Parton distribution functions
    │   ├── HardScatter.js      Process selection and kinematics
    │   ├── DecayEngine.js      Decays and phase space (GENBOD)
    │   ├── Hadronization.js    String fragmentation
    │   └── EventGenerator.js   Event building and detector transport
    ├── scene/
    │   ├── SceneManager.js     Renderer, camera, controls
    │   ├── Ring.js             Collider ring visualization
    │   ├── Detector.js         ATLAS-inspired detector
    │   ├── BeamRenderer.js     Proton bunches and trails
    │   ├── TrackRenderer.js    Event display
    │   ├── CameraDirector.js   Camera views and transitions
    │   └── PostProcessing.js   Bloom
    ├── styles/
    │   └── main.css
    └── ui/
        ├── ControlPanel.js     Controls and telemetry
        ├── EventDisplay.js     Event summary panel
        └── InfoPanel.js        Physics Reference dialog
```

---

## Scientific accuracy

**Taken directly from measurement or established theory**
- Fundamental constants (CODATA 2022) and particle masses, widths, lifetimes, and quark content (Particle Data Group 2024)
- LHC geometry, magnet counts, injection points, beam directions, RF parameters, and betatron tunes
- Relativistic kinematics with numerically stable formulas, Lorentz boosts, and time dilation
- Branching ratios from the Particle Data Group and the LHC Higgs Working Group
- Conservation of energy, momentum, charge, baryon number, and lepton number, verified in code

**Simplified for a real-time visualization**
- Each bunch is represented by one lead proton; real crossings involve about 10¹¹ protons per bunch and around 50–60 simultaneous collisions
- The energy ramp is compressed from about 20 minutes to a few turns, using an explicit compression factor applied to the real per-turn physics
- Both beams share one RF timing reference, and betatron motion uses a smooth approximation
- Parton distributions are analytic, at a fixed energy scale
- Hard processes are leading order, without a parton shower
- Hadronization produces the common hadrons, mapping rarer ones to catalogued hadrons with the same charge
- Decays use phase space without spin correlations
- The detector response is simplified: no particle showers, and absorption at fixed depths
- In the ring view, the tube's width is drawn 40× larger than real so it's visible; this never affects the physics

The full breakdown is in the in-app Physics Reference under **About this simulation**.

---

## Sources

- CODATA 2022 recommended values of the fundamental physical constants
- Particle Data Group, *Review of Particle Physics* (2024)
- LHC Design Report, Volume I (CERN-2004-003)
- LHC Higgs Working Group, CERN Yellow Report 4
- ATLAS Collaboration detector publications
- T. Sjöstrand et al., *An Introduction to PYTHIA 8*
- F. James, *Monte Carlo Phase Space*, CERN 68-15 (GENBOD)
- J. P. Boris, *Relativistic Plasma Simulation*, Proceedings of the Fourth Conference on Numerical Simulation of Plasmas (1970)

---

## Security

- The development and preview servers listen on `localhost` only and send hardened HTTP headers (content-type sniffing protection, frame denial, a strict referrer policy, and a permissions policy that denies camera, microphone, and location access)
- All dynamic interface text is inserted with `textContent`, never `innerHTML`
- `.gitignore` keeps environment files, secrets, SSH and GPG key material, YubiKey artifacts, and certificates out of version control

---

*This is an independent educational project. It is not affiliated with or endorsed by CERN or the ATLAS Collaboration.*