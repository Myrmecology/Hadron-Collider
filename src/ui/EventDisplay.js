/**
 * Hadron Collider — Event display panel (right panel)
 *
 * Shows the summary of the current collision event and keeps it live while
 * particles are still in flight (decays and absorptions keep arriving).
 * All dynamic text is set through textContent, never innerHTML.
 */
import { bus, EVENTS } from '../core/EventBus.js';
import { formatEnergy } from './ControlPanel.js';

const LIVE_REFRESH_MS = 200;
const MAX_ROWS = 40;
const MAX_DECAY_LINES = 14;

/** "1 in 1.3 million" style odds from a probability. */
function formatOdds(probability) {
  if (!(probability > 0)) return '';
  if (probability > 0.5) return 'most collisions';
  const n = 1 / probability;
  const units = [
    [1e9, 'billion'],
    [1e6, 'million'],
    [1e3, 'thousand'],
  ];
  for (const [value, word] of units) {
    if (n >= value) return `≈ 1 in ${(n / value).toPrecision(2)} ${word} collisions`;
  }
  return `≈ 1 in ${Math.round(n)} collisions`;
}

export class EventDisplay {
  #el = {};
  #event = null;
  #timer = null;
  #unsubscribe;

  constructor() {
    const $ = (id) => {
      const node = document.getElementById(id);
      if (!node) throw new Error(`EventDisplay: missing element #${id}`);
      return node;
    };
    this.#el = {
      run: $('event-run'),
      number: $('event-number'),
      process: $('event-process'),
      partons: $('event-partons'),
      sqrtShat: $('event-sqrt-shat'),
      multiplicity: $('event-multiplicity'),
      met: $('event-met'),
      particles: $('event-particles'),
      decays: $('event-decays'),
    };

    this.#unsubscribe = bus.on(EVENTS.COLLISION, ({ event }) => this.show(event));
  }

  /** Display a new event and keep it refreshed until it finishes. */
  show(event) {
    this.#event = event;
    clearInterval(this.#timer);
    this.#render(true);
    this.#timer = setInterval(() => {
      this.#render(false);
      if (this.#event?.finished) {
        clearInterval(this.#timer);
        this.#timer = null;
      }
    }, LIVE_REFRESH_MS);
  }

  /** Reset to the idle state (e.g. when the collider is switched off). */
  clear() {
    clearInterval(this.#timer);
    this.#timer = null;
    this.#event = null;
    const { run, number, process, partons, sqrtShat, multiplicity, met, particles, decays } = this.#el;
    for (const node of [run, number, partons, sqrtShat, multiplicity, met]) node.textContent = '—';
    process.textContent = 'Awaiting collision…';
    particles.replaceChildren();
    decays.replaceChildren();
  }

  #render(fresh) {
    if (!this.#event) return;
    const s = this.#event.summary(MAX_ROWS);
    const el = this.#el;

    el.run.textContent = `Run ${s.run}`;
    el.number.textContent = `#${s.number.toLocaleString('en-US')}`;

    // Process: name, parton-level label, and the true odds.
    const name = document.createElement('div');
    name.textContent = s.process;
    const label = document.createElement('div');
    label.textContent = s.label;
    label.style.color = 'var(--text)';
    const odds = document.createElement('div');
    odds.style.cssText = 'font-size:11px;color:var(--text-dim);margin-top:4px';
    odds.textContent = `${formatOdds(s.trueProbability)}${s.enhanced ? ' · selected by enhancement' : ''}`;
    el.process.replaceChildren(name, label, odds);

    if (fresh) {
      el.process.classList.remove('is-fresh');
      void el.process.offsetWidth; // restart the flash animation
      el.process.classList.add('is-fresh');
    }

    el.partons.textContent = s.partons;
    el.sqrtShat.textContent = `${formatEnergy(s.sqrtSHat)} of ${formatEnergy(s.sqrtS)}`;
    el.multiplicity.textContent = `${s.multiplicity} (${s.charged} charged)`;
    el.met.textContent = s.missingET > 0.05 ? `${s.missingET.toFixed(1)} GeV` : '< 0.1 GeV';

    // Final-state particle rows.
    const rows = s.particles.map((p) => {
      const li = document.createElement('li');
      li.className = 'particle-row';
      li.dataset.kind = p.kind;
      const sym = document.createElement('span');
      sym.className = 'particle-row__symbol';
      sym.textContent = p.symbol;
      const nm = document.createElement('span');
      nm.className = 'particle-row__name';
      nm.textContent = p.absorbedIn ? `${p.name} · ${p.absorbedIn}` : p.name;
      const val = document.createElement('span');
      val.className = 'particle-row__value';
      val.textContent = formatEnergy(p.energy);
      li.append(sym, nm, val);
      return li;
    });
    if (s.totalVisible > s.particles.length) {
      const more = document.createElement('li');
      more.className = 'particle-list__more';
      more.textContent = `+ ${s.totalVisible - s.particles.length} more`;
      rows.push(more);
    }
    el.particles.replaceChildren(...rows);

    // Decay chain.
    const lines = s.decays.slice(0, MAX_DECAY_LINES).map((text) => {
      const li = document.createElement('li');
      li.textContent = text;
      return li;
    });
    if (s.decays.length > MAX_DECAY_LINES) {
      const li = document.createElement('li');
      li.textContent = `… ${s.decays.length - MAX_DECAY_LINES} more decays`;
      lines.push(li);
    }
    if (lines.length === 0) {
      const li = document.createElement('li');
      li.textContent = s.finished ? 'No notable decays' : 'Waiting for decays…';
      lines.push(li);
    }
    el.decays.replaceChildren(...lines);
  }

  dispose() {
    clearInterval(this.#timer);
    this.#unsubscribe?.();
  }
}