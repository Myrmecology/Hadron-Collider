/**
 * Hadron Collider — Control panel (left panel + header status)
 *
 * Connects DOM controls to the event bus and renders machine telemetry.
 * Never touches the physics directly: it emits UI_* events and listens for
 * MACHINE_STATE and MACHINE_TELEMETRY.
 *
 * Status labels follow LHC beam-mode names used in the CERN Control Centre.
 */
import { bus, EVENTS } from '../core/EventBus.js';
import { SimulationClock } from '../core/SimulationClock.js';
import { MACHINE } from '../config/constants.js';

const STATUS_LABEL = Object.freeze({
  standby: 'STANDBY',
  injecting: 'INJECTION',
  ramping: 'RAMP',
  squeezing: 'SQUEEZE',
  colliding: 'STABLE BEAMS',
  collision: 'COLLISION',
});

const SUPERSCRIPT = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const superscript = (n) => String(n).split('').map((c) => SUPERSCRIPT[c] ?? c).join('');

/* =============================================================================
   Formatting helpers (exported for reuse by other UI modules)
   ============================================================================= */

/** Time scale as "0.25×" or "3.2 × 10⁻⁵×". */
export function formatScale(scale) {
  if (scale >= 0.01) return `${scale.toFixed(scale >= 0.995 ? 2 : 3)}×`;
  const exp = Math.floor(Math.log10(scale));
  const mantissa = scale / 10 ** exp;
  const m = mantissa.toFixed(1);
  return m === '1.0' ? `10${superscript(exp)}×` : `${m} × 10${superscript(exp)}×`;
}

/** Energy in GeV → "450 GeV" or "6.80 TeV". */
export function formatEnergy(gev) {
  if (!Number.isFinite(gev)) return '—';
  return gev >= 1000 ? `${(gev / 1000).toFixed(2)} TeV` : `${gev.toFixed(gev >= 100 ? 0 : 1)} GeV`;
}

/** Physics time with automatic units. */
export function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  const abs = Math.abs(seconds);
  if (abs < 1e-6) return `${(seconds * 1e9).toFixed(3)} ns`;
  if (abs < 1e-3) return `${(seconds * 1e6).toFixed(3)} µs`;
  if (abs < 1) return `${(seconds * 1e3).toFixed(3)} ms`;
  return `${seconds.toFixed(3)} s`;
}

/** Group decimal digits in threes: 0.9999999905 → "0.999 999 990 5". */
function groupDecimals(text) {
  const [whole, frac = ''] = text.split('.');
  return frac ? `${whole}.${frac.replace(/(\d{3})(?=\d)/g, '$1 ')}` : whole;
}

/** β displayed with enough digits to show where it departs from 1. */
function formatBeta(oneMinusBeta) {
  if (!(oneMinusBeta > 0)) return '1';
  const digits = Math.min(15, Math.ceil(-Math.log10(oneMinusBeta)) + 2);
  return groupDecimals((1 - oneMinusBeta).toFixed(digits));
}

const formatInt = (n) => Math.round(n).toLocaleString('en-US').replace(/,/g, ' ');

/* =============================================================================
   Control panel
   ============================================================================= */
export class ControlPanel {
  #el = {};
  #active = false;
  #clockTimer = null;
  #unsubscribers = [];

  constructor() {
    const $ = (id) => {
      const node = document.getElementById(id);
      if (!node) throw new Error(`ControlPanel: missing element #${id}`);
      return node;
    };

    this.#el = {
      toggle: $('collider-toggle'),
      timeScale: $('time-scale'),
      timeScaleReadout: $('time-scale-readout'),
      energy: $('beam-energy'),
      energyReadout: $('beam-energy-readout'),
      sqrtS: $('sqrt-s-readout'),
      rare: $('rare-enhance'),
      cameraGroup: $('camera-views'),
      status: $('system-status'),
      clock: $('utc-clock'),
      b1: { energy: $('b1-energy'), gamma: $('b1-gamma'), beta: $('b1-beta'), turns: $('b1-turns') },
      b2: { energy: $('b2-energy'), gamma: $('b2-gamma'), beta: $('b2-beta'), turns: $('b2-turns') },
      dipole: $('dipole-field'),
      rf: $('rf-voltage'),
      simTime: $('sim-time'),
    };

    // "Applies at next fill" note, appended after the √s readout.
    this.#el.fillNote = document.createElement('span');
    this.#el.fillNote.className = 'panel__fill-note';
    this.#el.sqrtS.after(this.#el.fillNote);

    this.#bindControls();
    this.#bindBus();
    this.#startClock();

    // Initialize readouts from the controls' default values.
    this.#onTimeScaleInput();
    this.#onEnergyInput();
  }

  /* ---------------------------------------------------------------- Controls */
  #bindControls() {
    const { toggle, timeScale, energy, rare, cameraGroup } = this.#el;

    toggle.addEventListener('change', () => {
      this.#active = toggle.checked;
      bus.emit(EVENTS.UI_COLLIDER_TOGGLE, { active: toggle.checked });
      this.#updateFillNote();
    });

    timeScale.addEventListener('input', () => this.#onTimeScaleInput());
    energy.addEventListener('input', () => this.#onEnergyInput());

    rare.addEventListener('change', () => {
      bus.emit(EVENTS.UI_RARE_ENHANCE, { enabled: rare.checked });
    });

    cameraGroup.addEventListener('click', (e) => {
      const button = e.target.closest('[data-view]');
      if (!button) return;
      this.setCameraView(button.dataset.view);
      bus.emit(EVENTS.UI_CAMERA_VIEW, { view: button.dataset.view });
    });

    // Spacebar toggles the collider, unless focus is in an editable control.
    this.onKeyDown = (e) => {
      if (e.code !== 'Space' || e.repeat) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' && document.activeElement.type !== 'checkbox') return;
      if (tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
      if (document.querySelector('dialog[open]')) return;
      e.preventDefault();
      toggle.checked = !toggle.checked;
      toggle.dispatchEvent(new Event('change'));
    };
    window.addEventListener('keydown', this.onKeyDown);
  }

  #setFill(input) {
    const min = Number(input.min);
    const max = Number(input.max);
    const pct = ((Number(input.value) - min) / (max - min)) * 100;
    input.style.setProperty('--fill', `${pct}%`);
  }

  #onTimeScaleInput() {
    const { timeScale, timeScaleReadout } = this.#el;
    const t = Number(timeScale.value) / Number(timeScale.max);
    const scale = SimulationClock.sliderToScale(t);
    timeScaleReadout.textContent = formatScale(scale);
    timeScale.setAttribute('aria-valuetext', `${formatScale(scale)} time scale`);
    this.#setFill(timeScale);
    bus.emit(EVENTS.UI_TIME_SCALE, { scale });
  }

  #onEnergyInput() {
    const { energy, energyReadout, sqrtS } = this.#el;
    const gev = Number(energy.value) * 1000;
    energyReadout.textContent = formatEnergy(gev);
    sqrtS.textContent = formatEnergy(2 * gev);
    energy.setAttribute('aria-valuetext', `${formatEnergy(gev)} per beam`);
    this.#setFill(energy);
    this.#updateFillNote();
    bus.emit(EVENTS.UI_BEAM_ENERGY, { energy: gev });
  }

  #updateFillNote() {
    this.#el.fillNote.textContent = this.#active ? ' · applies at next fill' : '';
  }

  /** Highlight the active camera button (also used for automatic switches). */
  setCameraView(view) {
    for (const button of this.#el.cameraGroup.querySelectorAll('[data-view]')) {
      const active = button.dataset.view === view;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    }
  }

  /* --------------------------------------------------------------------- Bus */
  #bindBus() {
    this.#unsubscribers.push(
      bus.on(EVENTS.MACHINE_STATE, ({ state }) => this.#renderState(state)),
      bus.on(EVENTS.MACHINE_TELEMETRY, (telemetry) => this.#renderTelemetry(telemetry)),
    );
  }

  #renderState(state) {
    const { status, toggle } = this.#el;
    status.dataset.state = state;
    status.textContent = STATUS_LABEL[state] ?? state.toUpperCase();
    if (state === 'standby' && toggle.checked) {
      toggle.checked = false;
      this.#active = false;
      this.#updateFillNote();
    }
  }

  #renderTelemetry(t) {
    const { b1, b2, dipole, rf, simTime } = this.#el;
    const beams = t.beams ?? [];

    for (const [cells, beam] of [
      [b1, beams[0]],
      [b2, beams[1]],
    ]) {
      if (!beam) {
        cells.energy.textContent = '—';
        cells.gamma.textContent = '—';
        cells.beta.textContent = '—';
        cells.turns.textContent = '0';
        continue;
      }
      cells.energy.textContent = formatEnergy(beam.energy);
      cells.gamma.textContent = formatInt(beam.gamma);
      cells.beta.textContent = formatBeta(beam.oneMinusBeta);
      cells.turns.textContent = formatInt(beam.turns);
    }

    dipole.textContent = beams.length ? `${t.dipoleField.toFixed(2)} T` : '—';
    rf.textContent = t.rfVoltage > 0 ? `${(t.rfVoltage / 1e6).toFixed(1)} MV` : '—';
    simTime.textContent = formatTime(t.simTime ?? 0);
  }

  /* ------------------------------------------------------------------- Clock */
  #startClock() {
    const tick = () => {
      const now = new Date();
      const hh = String(now.getUTCHours()).padStart(2, '0');
      const mm = String(now.getUTCMinutes()).padStart(2, '0');
      const ss = String(now.getUTCSeconds()).padStart(2, '0');
      this.#el.clock.textContent = `${hh}:${mm}:${ss} UTC`;
      this.#el.clock.dateTime = now.toISOString();
    };
    tick();
    this.#clockTimer = setInterval(tick, 1000);
  }

  /** Current control values (used at startup to sync the simulation). */
  get values() {
    const { timeScale, energy, rare } = this.#el;
    return {
      scale: SimulationClock.sliderToScale(Number(timeScale.value) / Number(timeScale.max)),
      energy: Number(energy.value) * 1000 || MACHINE.RUN3_ENERGY,
      rare: rare.checked,
    };
  }

  dispose() {
    clearInterval(this.#clockTimer);
    window.removeEventListener('keydown', this.onKeyDown);
    for (const off of this.#unsubscribers) off();
  }
}