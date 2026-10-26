/**
 * Hadron Collider — Application entry point
 *
 * Boots the system in stages (reported on the boot screen), wires every module
 * through the event bus, and runs the frame loop:
 *
 *   wall time ──► SimulationClock ──► physics time
 *                                       │
 *        EventGenerator.update  ◄───────┤  (particles in flight)
 *        Accelerator.update     ◄───────┘  (beams; stops at IP1 crossings)
 *              │ crossing
 *        CollisionDetector.process ──► EventGenerator.generate ──► COLLISION
 *
 *   then: telemetry + sound (throttled) → scene updates → bloom render
 *
 * Modules are imported dynamically during boot so that any failure (a load
 * error, or a physics self-check that throws) is shown on the boot screen
 * with the stage that failed.
 */

const TELEMETRY_INTERVAL = 0.1; // wall-clock seconds between telemetry updates

/* =============================================================================
   Boot screen helpers
   ============================================================================= */
const bootScreen = document.getElementById('boot-screen');
const bootLog = document.getElementById('boot-log');
const bootProgress = document.getElementById('boot-progress');

function bootStep(label, progress) {
  const li = document.createElement('li');
  const text = document.createElement('span');
  text.textContent = label;
  li.append(text);
  bootLog?.append(li);
  if (bootProgress) bootProgress.style.width = `${Math.round(progress * 100)}%`;
  return {
    done: () => li.classList.add('is-done'),
    fail: () => li.classList.add('is-error'),
  };
}

function bootFailure(error) {
  console.error('Hadron Collider failed to start:', error);
  const message = document.createElement('p');
  message.style.cssText = 'margin-top:16px;color:var(--danger);font-size:12px;line-height:1.5;white-space:pre-wrap';
  message.textContent = `${error?.message ?? error}\n\nOpen the browser console (F12) for details.`;
  bootScreen?.querySelector('.boot-screen__inner')?.append(message);
}

/** Yield to the browser so each boot line paints before the next stage runs. */
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

/* =============================================================================
   Boot
   ============================================================================= */
async function boot() {
  let step;
  try {
    step = bootStep('Loading particle catalog and decay tables (PDG 2024)', 0.1);
    const [{ bus, EVENTS }, { SimulationClock }, { SIMULATION }] = await Promise.all([
      import('./core/EventBus.js'),
      import('./core/SimulationClock.js'),
      import('./config/constants.js'),
      import('./data/particles.js'),
      import('./data/decayModes.js'),
    ]);
    step.done();
    await nextFrame();

    step = bootStep('Building magnet lattice and verifying ring closure', 0.25);
    const [{ Accelerator, MACHINE_STATE }, { CollisionDetector }] = await Promise.all([
      import('./physics/Accelerator.js'),
      import('./physics/CollisionDetector.js'),
    ]);
    const accelerator = new Accelerator();
    const collisionDetector = new CollisionDetector();
    step.done();
    await nextFrame();

    step = bootStep('Loading parton distributions and event generator', 0.4);
    const { EventGenerator } = await import('./physics/EventGenerator.js');
    const eventGenerator = new EventGenerator();
    step.done();
    await nextFrame();

    step = bootStep('Initializing WebGL2 renderer', 0.55);
    const [{ SceneManager }, { PostProcessing }] = await Promise.all([
      import('./scene/SceneManager.js'),
      import('./scene/PostProcessing.js'),
    ]);
    const manager = new SceneManager(document.getElementById('collider-canvas'));
    const post = new PostProcessing(manager);
    step.done();
    await nextFrame();

    step = bootStep('Constructing 26.7 km ring and 1232 dipoles', 0.7);
    const [{ Ring }, { BeamRenderer }] = await Promise.all([
      import('./scene/Ring.js'),
      import('./scene/BeamRenderer.js'),
    ]);
    const ring = new Ring();
    const beams = new BeamRenderer();
    manager.add(ring.object, beams.object);
    step.done();
    await nextFrame();

    step = bootStep('Assembling detector at IP1', 0.82);
    const [{ Detector }, { TrackRenderer }, { CameraDirector }] = await Promise.all([
      import('./scene/Detector.js'),
      import('./scene/TrackRenderer.js'),
      import('./scene/CameraDirector.js'),
    ]);
    const detector = new Detector();
    const tracks = new TrackRenderer();
    manager.add(detector.object, tracks.object);
    const director = new CameraDirector(manager.camera, manager.controls);
    step.done();
    await nextFrame();

    step = bootStep('Connecting control room interface and audio', 0.92);
    const [{ ControlPanel }, { EventDisplay }, { InfoPanel }, { SoundEngine }] = await Promise.all([
      import('./ui/ControlPanel.js'),
      import('./ui/EventDisplay.js'),
      import('./ui/InfoPanel.js'),
      import('./audio/SoundEngine.js'),
    ]);

    const clock = new SimulationClock();
    const settings = { enhanced: false, run: 0 };
    const sound = new SoundEngine({ button: document.getElementById('sound-toggle') });

    // Bus wiring (subscribe before the panels emit their initial values).
    accelerator.onStateChange((payload) => bus.emit(EVENTS.MACHINE_STATE, payload));

    bus.on(EVENTS.UI_COLLIDER_TOGGLE, ({ active }) => {
      sound.unlock(); // the switch is a user gesture, so audio may start here
      if (active) settings.run += 1;
      eventGenerator.reset();
      tracks.clear();
      eventDisplay.clear();
      clock.reset();
      accelerator.setActive(active);
      sound.setBeamActive(active);
    });
    bus.on(EVENTS.UI_TIME_SCALE, ({ scale }) => clock.setUserScale(scale));
    bus.on(EVENTS.UI_BEAM_ENERGY, ({ energy }) => accelerator.setBeamEnergy(energy));
    bus.on(EVENTS.UI_RARE_ENHANCE, ({ enabled }) => {
      settings.enhanced = enabled;
    });
    bus.on(EVENTS.UI_CAMERA_VIEW, ({ view }) => director.setMode(view, { silent: true }));
    bus.on(EVENTS.MACHINE_STATE, ({ state }) => sound.stateChange(state));
    bus.on(EVENTS.COLLISION, ({ event }) => {
      tracks.setEvent(event);
      detector.pulse();
      post.surge();
      director.onCollision();
      sound.collision(event, clock.effectiveScale);
    });
    bus.on(EVENTS.ERROR, ({ error, context }) => console.warn(`[${context}]`, error?.message ?? error));

    const controlPanel = new ControlPanel();
    const eventDisplay = new EventDisplay();
    new InfoPanel();
    director.onModeChange((mode) => controlPanel.setCameraView(mode));

    // Sync the simulation with the controls' initial values.
    const initial = controlPanel.values;
    clock.setUserScale(initial.scale);
    accelerator.setBeamEnergy(initial.energy);
    settings.enhanced = initial.rare;
    bus.emit(EVENTS.MACHINE_TELEMETRY, accelerator.telemetry());
    step.done();
    await nextFrame();

    bootStep('Systems nominal. Ready for beam.', 1).done();
    await new Promise((resolve) => setTimeout(resolve, 450));
    bootScreen?.classList.add('is-hidden');

    /* =========================================================================
       Frame loop
       ========================================================================= */
    let telemetryTimer = 0;
    let holdTimer = 0;
    let rafId = 0;
    const reportedErrors = new Set();

    const physicsStep = (simDt) => {
      // 1. Particles already in flight.
      eventGenerator.update(simDt);

      // 2. Beams; the accelerator halts exactly at armed IP1 crossings.
      let remaining = simDt;
      for (let guard = 0; guard < 8 && remaining > 0; guard++) {
        const result = accelerator.update(remaining);
        if (!result.crossing) break;

        const record = collisionDetector.process(accelerator, result);
        if (record) {
          eventGenerator.generate(record, { enhanced: settings.enhanced, run: settings.run });
          // Transport the new event for the rest of this frame's physics time.
          eventGenerator.update(result.remaining);
        }
        remaining = result.remaining;
      }
    };

    const frame = (timestamp) => {
      rafId = requestAnimationFrame(frame);
      try {
        const { wallDt, simDt } = clock.advance(timestamp);

        if (simDt > 0) physicsStep(simDt);

        // Trigger hold: keep the finished event on screen, then re-arm.
        if (accelerator.state === MACHINE_STATE.COLLISION && !eventGenerator.active) {
          holdTimer += wallDt;
          if (holdTimer >= SIMULATION.EVENT_DISPLAY_HOLD) {
            holdTimer = 0;
            accelerator.rearm();
          }
        } else {
          holdTimer = 0;
        }

        // Slow-motion dilation: full while debris flies, geometric on approach.
        clock.setDilation(eventGenerator.active ? 1 : accelerator.dilationWeight(clock.userScale));

        // Throttled telemetry and beam-hum pitch.
        telemetryTimer += wallDt;
        if (telemetryTimer >= TELEMETRY_INTERVAL) {
          telemetryTimer = 0;
          bus.emit(EVENTS.MACHINE_TELEMETRY, accelerator.telemetry());
          sound.update(accelerator.energy);
        }

        // Visuals.
        director.update(wallDt, accelerator, beams);
        manager.update();
        ring.update(manager.camera);
        detector.update(wallDt);
        beams.update(accelerator, clock.effectiveScale, manager.camera);
        tracks.update(wallDt, manager.camera);
        post.update(wallDt);
        post.render();
      } catch (error) {
        // Report each distinct error once; keep the loop alive.
        const key = error?.message ?? String(error);
        if (!reportedErrors.has(key)) {
          reportedErrors.add(key);
          console.error('Frame error:', error);
          bus.emit(EVENTS.ERROR, { error, context: 'frame' });
        }
      }
    };
    rafId = requestAnimationFrame(frame);

    // Developer access in the browser console (development builds only).
    if (import.meta.env.DEV) {
      window.collider = { accelerator, eventGenerator, collisionDetector, clock, manager, director, bus, sound };
    }

    // Clean teardown on Vite hot reload.
    if (import.meta.hot) {
      import.meta.hot.dispose(() => {
        cancelAnimationFrame(rafId);
        controlPanel.dispose();
        eventDisplay.dispose();
        sound.dispose();
        tracks.dispose();
        beams.dispose();
        ring.dispose();
        detector.dispose();
        post.dispose();
        manager.dispose();
        bus.clear();
      });
    }
  } catch (error) {
    step?.fail();
    bootFailure(error);
  }
}

boot();