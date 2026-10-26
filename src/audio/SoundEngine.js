/**
 * Hadron Collider — Sound engine
 *
 * All sound is synthesized in real time with the Web Audio API: no audio
 * files. The engine only listens to the simulation (it never alters physics)
 * and every call is guarded, so audio problems can never stop the collider.
 *
 *   Beam hum        low drone while beams circulate; pitch follows beam energy
 *   Mode chirps     short tones on beam-mode transitions; falling tone on dump
 *   Collision       sub-bass impact + filtered crack, scaled by √ŝ
 *   Readout         Geiger-like clicks, one per particle produced
 *   Signatures      tonal motifs for rare processes (H, Z, W, t t̄, b b̄)
 *   Slow motion     deeper, longer impacts at small time scales
 *
 * Browsers only allow audio after a user gesture, so the AudioContext is
 * created lazily by unlock() (called from the Activate switch or Sound button).
 */
import { MACHINE } from '../config/constants.js';

const STORAGE_KEY = 'hadron-collider:sound';
const MASTER_LEVEL = 1.2;
const HUM_LEVEL = 0.07;

/** Tonal signatures per hard process (frequencies in Hz). */
const SIGNATURES = {
  'higgs-ggf': { freqs: [261.63, 329.63, 392.0, 523.25], decay: 3.2, level: 0.05 },
  'top-pair': { freqs: [130.81, 196.0, 293.66], decay: 2.4, level: 0.05 },
  'drell-yan-z': { freqs: [440.0, 659.25], decay: 1.8, level: 0.045 },
  'drell-yan-w': { freqs: [415.3], decay: 1.4, level: 0.045 },
  'heavy-bb': { freqs: [587.33], decay: 0.7, level: 0.03 },
};

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

function readPreference() {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === null ? null : value === 'on';
  } catch {
    return null;
  }
}

function writePreference(enabled) {
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    /* storage unavailable: preference simply isn't remembered */
  }
}

export class SoundEngine {
  #ctx = null;
  #master = null;
  #noise = null;
  #hum = null;
  #enabled = true;
  #beamActive = false;
  #button = null;
  #onClick = null;

  /** @param {{ button?: HTMLButtonElement | null }} [options] */
  constructor({ button = null } = {}) {
    this.#enabled = readPreference() ?? true;
    this.#button = button;
    if (button) {
      this.#onClick = () => this.toggle();
      button.addEventListener('click', this.#onClick);
      this.#renderButton();
    }
  }

  static get supported() {
    return typeof window !== 'undefined' && Boolean(window.AudioContext || window.webkitAudioContext);
  }

  get enabled() {
    return this.#enabled;
  }

  /* ===========================================================================
     Setup
     =========================================================================== */

  /** Create or resume the audio context. Must be called from a user gesture. */
  unlock() {
    if (!this.#enabled || !SoundEngine.supported) return;
    try {
      if (!this.#ctx) this.#init();
      if (this.#ctx.state === 'suspended') this.#ctx.resume();
    } catch (error) {
      console.warn('SoundEngine: audio unavailable', error);
    }
  }

  #init() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    this.#ctx = ctx;

    // Master chain: gain → compressor (prevents clipping) → speakers.
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -8;
    compressor.ratio.value = 12;
    compressor.knee.value = 6;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;
    compressor.ratio.value = 6;
    this.#master = ctx.createGain();
    this.#master.gain.value = MASTER_LEVEL;
    this.#master.connect(compressor);
    compressor.connect(ctx.destination);

    // Two seconds of white noise, reused by every noise-based sound.
    const length = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    this.#noise = buffer;

    this.#hum = this.#createHum();
  }

  /** Beam hum: two detuned sawtooths through a low-pass filter, gently pulsing. */
  #createHum() {
    const ctx = this.#ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 180;
    filter.Q.value = 2;

    const oscA = ctx.createOscillator();
    const oscB = ctx.createOscillator();
    oscA.type = 'sawtooth';
    oscB.type = 'sawtooth';
    oscA.frequency.value = 40;
    oscB.frequency.value = 40;
    oscB.detune.value = 9;

    // Slow amplitude pulse (≈ 0.4 Hz) for a living, mechanical feel.
    const lfo = ctx.createOscillator();
    const lfoDepth = ctx.createGain();
    lfo.frequency.value = 0.4;
    lfoDepth.gain.value = 0.25;
    const pulse = ctx.createGain();
    pulse.gain.value = 1;
    lfo.connect(lfoDepth).connect(pulse.gain);

    oscA.connect(filter);
    oscB.connect(filter);
    filter.connect(pulse).connect(gain).connect(this.#master);
    oscA.start();
    oscB.start();
    lfo.start();

    return { gain, filter, oscA, oscB, lfo };
  }

  #ready() {
    return Boolean(this.#enabled && this.#ctx && this.#ctx.state === 'running');
  }

  /* ===========================================================================
     Controls
     =========================================================================== */

  toggle() {
    this.#enabled = !this.#enabled;
    writePreference(this.#enabled);
    this.#renderButton();
    try {
      if (this.#enabled) {
        this.unlock();
        this.#master?.gain.setTargetAtTime(MASTER_LEVEL, this.#ctx.currentTime, 0.05);
      } else if (this.#ctx) {
        this.#master.gain.setTargetAtTime(0, this.#ctx.currentTime, 0.05);
      }
    } catch (error) {
      console.warn('SoundEngine:', error);
    }
  }

  #renderButton() {
    if (!this.#button) return;
    this.#button.textContent = this.#enabled ? 'Sound On' : 'Sound Off';
    this.#button.setAttribute('aria-pressed', String(this.#enabled));
  }

  /* ===========================================================================
     Simulation hooks
     =========================================================================== */

  /** Beams injected (true) or dumped (false). */
  setBeamActive(active) {
    this.#beamActive = active;
    if (!this.#ctx || !this.#hum) return;
    try {
      const target = active ? HUM_LEVEL : 0;
      this.#hum.gain.gain.setTargetAtTime(target, this.#ctx.currentTime, active ? 0.6 : 0.25);
    } catch (error) {
      console.warn('SoundEngine:', error);
    }
  }

  /** Follow the beam energy: pitch and brightness rise through the ramp. */
  update(energy) {
    if (!this.#beamActive || !this.#ctx || !this.#hum) return;
    try {
      const f = clamp(
        (energy - MACHINE.INJECTION_ENERGY) / (MACHINE.DESIGN_ENERGY - MACHINE.INJECTION_ENERGY),
        0,
        1,
      );
      const now = this.#ctx.currentTime;
      const pitch = 38 + 34 * f;
      this.#hum.oscA.frequency.setTargetAtTime(pitch, now, 0.3);
      this.#hum.oscB.frequency.setTargetAtTime(pitch, now, 0.3);
      this.#hum.filter.frequency.setTargetAtTime(160 + 520 * f, now, 0.3);
    } catch (error) {
      console.warn('SoundEngine:', error);
    }
  }

  /** Short control-room tone on each beam-mode transition. */
  stateChange(state) {
    if (!this.#ready()) return;
    try {
      const t = this.#ctx.currentTime + 0.01;
      if (state === 'standby') {
        this.#blip(t, 660, 440, 0.18, 0.05);
      } else if (state === 'colliding') {
        this.#blip(t, 880, 1320, 0.07, 0.05);
        this.#blip(t + 0.09, 1320, 1760, 0.07, 0.04);
      } else if (state !== 'collision') {
        this.#blip(t, 880, 1100, 0.08, 0.04);
      }
    } catch (error) {
      console.warn('SoundEngine:', error);
    }
  }

  /**
   * Collision sound, shaped by the event's energy, multiplicity, and process.
   * @param {import('../physics/EventGenerator.js').CollisionEvent} event
   * @param {number} timeScale  current effective time scale
   */
  collision(event, timeScale = 1) {
    if (!this.#ready()) return;
    try {
      const t = this.#ctx.currentTime + 0.01;
      const shat = event?.hard?.sqrtSHat ?? 10;
      const intensity = clamp(Math.log10(1 + shat) / Math.log10(1 + 1000), 0.3, 1);
      const slowness = clamp(-Math.log10(Math.max(timeScale, 1e-12)) / 9, 0, 1);
      const stretch = 1 + 2.5 * slowness;
      const pitch = 1 - 0.35 * slowness;

      this.#impact(t, intensity, stretch, pitch);
      this.#crack(t, intensity, stretch, pitch);
      this.#readout(t, event?.particles?.length ?? 20, stretch);

      const signature = SIGNATURES[event?.hard?.id];
      if (signature) this.#chime(t + 0.08 * stretch, signature, stretch, pitch);
    } catch (error) {
      console.warn('SoundEngine:', error);
    }
  }

  /* ===========================================================================
     Voices
     =========================================================================== */

  /** Gain envelope: fast attack, exponential decay. */
  #envelope(gainNode, t, peak, attack, decay) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    g.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  #release(...nodes) {
    return () => {
      for (const node of nodes) {
        try {
          node.disconnect();
        } catch {
          /* already disconnected */
        }
      }
    };
  }

  /** Sub-bass impact: a sine sweeping down from ~140 Hz. */
  #impact(t, intensity, stretch, pitch) {
    const ctx = this.#ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140 * pitch, t);
    osc.frequency.exponentialRampToValueAtTime(36 * pitch, t + 0.4 * stretch);
    this.#envelope(gain, t, 0.9 * intensity, 0.006, 0.9 * stretch);
    osc.connect(gain).connect(this.#master);
    osc.start(t);
    osc.stop(t + 1.2 * stretch);
    osc.onended = this.#release(osc, gain);
  }

  /** Filtered noise "crack" with a falling band-pass sweep. */
  #crack(t, intensity, stretch, pitch) {
    const ctx = this.#ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.#noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.9;
    filter.frequency.setValueAtTime(3800 * pitch, t);
    filter.frequency.exponentialRampToValueAtTime(260 * pitch, t + 0.6 * stretch);
    const gain = ctx.createGain();
    this.#envelope(gain, t, 0.5 * intensity, 0.003, 0.55 * stretch);
    src.connect(filter).connect(gain).connect(this.#master);
    src.start(t, Math.random() * 1.2);
    src.stop(t + 0.8 * stretch);
    src.onended = this.#release(src, filter, gain);
  }

  /** Detector readout: one soft click per particle, scattered in time. */
  #readout(t, count, stretch) {
    const ctx = this.#ctx;
    const clicks = Math.min(48, Math.max(4, Math.round(count / 3)));
    const spread = 0.25 + 1.1 * stretch;
    for (let i = 0; i < clicks; i++) {
      const at = t + 0.04 + Math.random() ** 1.6 * spread;
      const src = ctx.createBufferSource();
      src.buffer = this.#noise;
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 2400 + Math.random() * 3000;
      const gain = ctx.createGain();
      this.#envelope(gain, at, 0.04 + Math.random() * 0.06, 0.001, 0.02);
      src.connect(filter).connect(gain).connect(this.#master);
      src.start(at, Math.random() * 1.8);
      src.stop(at + 0.03);
      src.onended = this.#release(src, filter, gain);
    }
  }

  /** Bell-like chime: each tone has an inharmonic overtone (×2.76), as real bells do. */
  #chime(t, { freqs, decay, level }, stretch, pitch) {
    const ctx = this.#ctx;
    freqs.forEach((f, i) => {
      const at = t + i * 0.06;
      for (const [ratio, amp] of [
        [1, 1],
        [2.76, 0.3],
      ]) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = f * ratio * pitch;
        this.#envelope(gain, at, level * amp, 0.01, decay * (ratio === 1 ? 1 : 0.5) * stretch);
        osc.connect(gain).connect(this.#master);
        osc.start(at);
        osc.stop(at + decay * stretch + 0.1);
        osc.onended = this.#release(osc, gain);
      }
    });
  }

  /** Short pitched blip for interface tones. */
  #blip(t, from, to, duration, level) {
    const ctx = this.#ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(to, t + duration);
    this.#envelope(gain, t, level, 0.005, duration);
    osc.connect(gain).connect(this.#master);
    osc.start(t);
    osc.stop(t + duration + 0.05);
    osc.onended = this.#release(osc, gain);
  }

  /* ===========================================================================
     Teardown
     =========================================================================== */
  dispose() {
    if (this.#button && this.#onClick) this.#button.removeEventListener('click', this.#onClick);
    try {
      this.#ctx?.close();
    } catch {
      /* ignore */
    }
    this.#ctx = null;
  }
}