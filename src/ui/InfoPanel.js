/**
 * Hadron Collider — Physics reference dialog
 *
 * Renders the structured content from src/content/science.js into the
 * native <dialog>. Content blocks are converted to DOM nodes directly;
 * no HTML strings are ever parsed.
 *
 * BLOCK FORMAT
 *   { type: 'p',       text }
 *   { type: 'h4',      text }
 *   { type: 'ul',      items: string[] }
 *   { type: 'table',   head: string[], rows: string[][] }
 *   { type: 'callout', text, variant?: 'note' }
 *   { type: 'source',  text }
 * Inline emphasis: **bold** inside any text string.
 */
import { TOPICS } from '../content/science.js';

/**
 * Append text to a parent, converting **bold** segments to <strong>.
 * @param {HTMLElement} parent
 * @param {string} text
 */
function appendRich(parent, text) {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith('**') && part.endsWith('**')) {
      const strong = document.createElement('strong');
      strong.textContent = part.slice(2, -2);
      parent.append(strong);
    } else {
      parent.append(document.createTextNode(part));
    }
  }
  return parent;
}

/** Build the DOM node for one content block. */
function renderBlock(block) {
  switch (block.type) {
    case 'p':
      return appendRich(document.createElement('p'), block.text);

    case 'h4':
      return appendRich(document.createElement('h4'), block.text);

    case 'ul': {
      const ul = document.createElement('ul');
      for (const item of block.items) ul.append(appendRich(document.createElement('li'), item));
      return ul;
    }

    case 'table': {
      const table = document.createElement('table');
      const thead = document.createElement('thead');
      const headRow = document.createElement('tr');
      for (const cell of block.head) {
        const th = document.createElement('th');
        th.scope = 'col';
        appendRich(th, cell);
        headRow.append(th);
      }
      thead.append(headRow);
      const tbody = document.createElement('tbody');
      for (const row of block.rows) {
        const tr = document.createElement('tr');
        for (const cell of row) tr.append(appendRich(document.createElement('td'), cell));
        tbody.append(tr);
      }
      table.append(thead, tbody);
      return table;
    }

    case 'callout': {
      const div = document.createElement('div');
      div.className = block.variant === 'note' ? 'callout callout--note' : 'callout';
      return appendRich(div, block.text);
    }

    case 'source': {
      const p = document.createElement('p');
      p.className = 'source-note';
      return appendRich(p, block.text);
    }

    default:
      throw new Error(`InfoPanel: unknown block type "${block.type}"`);
  }
}

export class InfoPanel {
  #dialog;
  #nav;
  #content;
  #openButton;
  #closeButton;
  #current = TOPICS[0]?.id ?? null;
  #buttons = new Map();

  constructor() {
    const $ = (id) => {
      const node = document.getElementById(id);
      if (!node) throw new Error(`InfoPanel: missing element #${id}`);
      return node;
    };
    this.#dialog = $('info-panel');
    this.#nav = $('info-nav');
    this.#content = $('info-content');
    this.#openButton = $('info-open');
    this.#closeButton = $('info-close');

    this.#buildNav();
    this.#bind();
    if (this.#current) this.show(this.#current);
  }

  #buildNav() {
    for (const topic of TOPICS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'info-nav__btn';
      button.textContent = topic.title;
      button.addEventListener('click', () => this.show(topic.id));
      this.#nav.append(button);
      this.#buttons.set(topic.id, button);
    }
  }

  #bind() {
    this.#openButton.addEventListener('click', () => this.open());
    this.#closeButton.addEventListener('click', () => this.close());

    // Click on the backdrop (outside the dialog box) closes it.
    this.#dialog.addEventListener('click', (e) => {
      if (e.target !== this.#dialog) return;
      const r = this.#dialog.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) this.close();
    });
  }

  /** Open the dialog, optionally at a specific topic. */
  open(topicId = this.#current) {
    if (topicId) this.show(topicId);
    if (!this.#dialog.open) this.#dialog.showModal();
    this.#buttons.get(this.#current)?.focus();
  }

  close() {
    if (this.#dialog.open) this.#dialog.close();
    this.#openButton.focus();
  }

  /** Render one topic. */
  show(topicId) {
    const topic = TOPICS.find((t) => t.id === topicId);
    if (!topic) return;
    this.#current = topicId;

    for (const [id, button] of this.#buttons) {
      const active = id === topicId;
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }

    const heading = document.createElement('h3');
    heading.textContent = topic.title;
    this.#content.replaceChildren(heading, ...topic.blocks.map(renderBlock));
    this.#content.scrollTop = 0;
  }
}