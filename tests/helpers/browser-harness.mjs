import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';

/**
 * Deterministic API-contract fakes around the ACTUAL packaged HTML/bootstrap.
 * This is not a browser, layout/accessibility conformance test, real IndexedDB,
 * or evidence of audible output, autoplay permission, or device compatibility.
 * No source adapter or registration is imported/replaced by this harness.
 *
 * await startBundle({ artifactPath: 'dist/JanPon.html', shared: createSharedState(),
 *   audio: { resume: 'pending' }, reducedMotion: true, matchMedia: false });
 * flush() advances promise/IDB jobs only; tick(ms) advances the fake clock;
 * tick() runs the next timer; drain() runs timers until the queue is empty.
 */
export const HARNESS_SCOPE = 'Node VM API-contract fakes; real-browser QA NOT_RUN';

export class FakeEvent {
  constructor(type, init = {}) {
    Object.assign(this, { type, bubbles: false, cancelable: false, composed: false,
      defaultPrevented: false, isTrusted: false, target: null, currentTarget: null,
      eventPhase: 0, key: '', code: '', repeat: false, isComposing: false,
      altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...init });
    this._stopped = false; this._immediate = false; this._passive = false; this._path = [];
  }
  preventDefault() { if (this.cancelable && !this._passive) this.defaultPrevented = true; }
  stopPropagation() { this._stopped = true; }
  stopImmediatePropagation() { this._stopped = true; this._immediate = true; }
  composedPath() { return [...this._path]; }
  get cancelBubble() { return this._stopped; }
  set cancelBubble(value) { if (value) this.stopPropagation(); }
}

class EventTarget {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, callback, options = {}) {
    if (!callback) return;
    const settings = typeof options === 'boolean' ? { capture: options } : options ?? {};
    if (settings.signal?.aborted) return;
    const listeners = this.listeners.get(type) ?? [];
    const capture = !!settings.capture;
    if (!listeners.some(row => row.callback === callback && row.capture === capture)) {
      listeners.push({ callback, capture, once: !!settings.once, passive: !!settings.passive });
      this.listeners.set(type, listeners);
      settings.signal?.addEventListener('abort', () => this.removeEventListener(type, callback, capture), { once: true });
    }
  }
  removeEventListener(type, callback, options = {}) {
    const capture = typeof options === 'boolean' ? options : !!options?.capture;
    const listeners = this.listeners.get(type);
    if (!listeners) return;
    this.listeners.set(type, listeners.filter(row => row.callback !== callback || row.capture !== capture));
  }
  _parentEventTarget() { return null; }
  dispatchEvent(event) {
    if (!(event instanceof FakeEvent)) event = new FakeEvent(event.type, event);
    const path = [this];
    while (path.at(-1)._parentEventTarget()) path.push(path.at(-1)._parentEventTarget());
    event.target = this; event._path = path; event._stopped = false; event._immediate = false;
    const invoke = (target, capture, phase) => {
      event.currentTarget = target; event.eventPhase = phase;
      for (const row of [...(target.listeners.get(event.type) ?? [])]) {
        if (row.capture !== capture || !(target.listeners.get(event.type) ?? []).includes(row)) continue;
        if (row.once) target.removeEventListener(event.type, row.callback, row.capture);
        event._passive = row.passive;
        if (typeof row.callback === 'function') row.callback.call(target, event);
        else row.callback.handleEvent(event);
        event._passive = false;
        if (event._immediate) break;
      }
      if (!capture && !event._immediate && typeof target[`on${event.type}`] === 'function') target[`on${event.type}`](event);
    };
    for (let i = path.length - 1; i > 0 && !event._stopped; i--) invoke(path[i], true, 1);
    if (!event._stopped) {
      invoke(this, true, 2);
      if (!event._immediate) invoke(this, false, 2);
    }
    if (event.bubbles) for (let i = 1; i < path.length && !event._stopped; i++) invoke(path[i], false, 3);
    event.currentTarget = null; event.eventPhase = 0; event._passive = false;
    return !event.defaultPrevented;
  }
}

const dataAttribute = key => `data-${String(key).replace(/[A-Z]/g, char => `-${char.toLowerCase()}`)}`;
const decode = value => value.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

export class FakeElement extends EventTarget {
  constructor(tagName, ownerDocument) {
    super(); this.tagName = tagName.toUpperCase(); this.localName = tagName.toLowerCase();
    this.nodeName = this.tagName; this.nodeType = 1; this.ownerDocument = ownerDocument;
    this.parentNode = null; this.children = []; this.attributes = {}; this._text = ''; this._innerHTML = '';
    this.style = { setProperty(name, value) { this[name] = String(value); }, getPropertyValue(name) { return this[name] ?? ''; }, removeProperty(name) { const value = this[name]; delete this[name]; return value ?? ''; } };
    this.dataset = new Proxy({}, {
      get: (_, key) => this.getAttribute(dataAttribute(key)) ?? undefined,
      set: (_, key, value) => { this.setAttribute(dataAttribute(key), value); return true; },
      deleteProperty: (_, key) => { this.removeAttribute(dataAttribute(key)); return true; },
      ownKeys: () => Object.keys(this.attributes).filter(key => key.startsWith('data-')).map(key => key.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase())),
      getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
    });
    this.classList = {
      contains: name => this.classes.has(name),
      add: (...names) => { const classes = this.classes; names.forEach(name => classes.add(name)); this.className = [...classes].join(' '); },
      remove: (...names) => { const classes = this.classes; names.forEach(name => classes.delete(name)); this.className = [...classes].join(' '); },
      toggle: (name, force) => { const enabled = force === undefined ? !this.classes.has(name) : !!force; this.classList[enabled ? 'add' : 'remove'](name); return enabled; },
    };
  }
  get classes() { return new Set(this.className.split(/\s+/).filter(Boolean)); }
  get className() { return this.getAttribute('class') ?? ''; }
  set className(value) { this.setAttribute('class', value); }
  get id() { return this.getAttribute('id') ?? ''; }
  set id(value) { this.setAttribute('id', value); }
  get disabled() { return this.hasAttribute('disabled'); }
  set disabled(value) { this.toggleAttribute('disabled', !!value); }
  get hidden() { return this.hasAttribute('hidden'); }
  set hidden(value) { this.toggleAttribute('hidden', !!value); }
  get type() { return this.getAttribute('type') ?? ''; }
  set type(value) { this.setAttribute('type', value); }
  get contentEditable() { return this.getAttribute('contenteditable') ?? 'inherit'; }
  set contentEditable(value) { this.setAttribute('contenteditable', value); }
  get isContentEditable() { return this.contentEditable === 'true' || this.contentEditable === '' || this.contentEditable === 'inherit' && !!this.parentElement?.isContentEditable; }
  get parentElement() { return this.parentNode?.nodeType === 1 ? this.parentNode : null; }
  get childNodes() { return this.children; }
  get firstChild() { return this.children[0] ?? null; }
  get firstElementChild() { return this.firstChild; }
  get isConnected() { return this.ownerDocument.contains(this); }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  set textContent(value) { this.replaceChildren(); this._text = String(value ?? ''); this._innerHTML = ''; }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(value) { this.replaceChildren(); this._text = ''; this._innerHTML = String(value); parseMarkup(this._innerHTML, this, this.ownerDocument); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null; }
  hasAttribute(name) { return Object.hasOwn(this.attributes, name); }
  removeAttribute(name) { delete this.attributes[name]; }
  toggleAttribute(name, force) { const enabled = force === undefined ? !this.hasAttribute(name) : force; if (enabled) this.setAttribute(name, ''); else this.removeAttribute(name); return enabled; }
  appendChild(child) { if (child.parentNode) child.parentNode.removeChild(child); child.parentNode = this; this.children.push(child); return child; }
  append(...children) { for (const child of children) { if (typeof child === 'string') this._text += child; else this.appendChild(child); } }
  prepend(...children) { for (const child of [...children].reverse()) { if (typeof child === 'string') this._text = child + this._text; else this.insertBefore(child, this.firstChild); } }
  insertBefore(child, reference) { if (reference === null) return this.appendChild(child); if (child.parentNode) child.parentNode.removeChild(child); const index = this.children.indexOf(reference); if (index < 0) throw new Error('Reference is not a child'); child.parentNode = this; this.children.splice(index, 0, child); return child; }
  removeChild(child) { const index = this.children.indexOf(child); if (index < 0) throw new Error('Node is not a child'); this.children.splice(index, 1); child.parentNode = null; return child; }
  replaceChildren(...children) { for (const child of this.children) child.parentNode = null; this.children = []; this._text = ''; this.append(...children); }
  remove() { this.parentNode?.removeChild(this); }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  matches(selector) { return matchesSelector(this, selector); }
  closest(selector) { for (let node = this; node?.nodeType === 1; node = node.parentElement) if (node.matches(selector)) return node; return null; }
  querySelectorAll(selector) { return descendants(this).filter(node => node.matches(selector)); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  _parentEventTarget() { return this.parentNode; }
  focus() {
    if (this.disabled) return;
    const previous = this.ownerDocument.activeElement;
    if (previous === this) return;
    if (previous) { previous.dispatchEvent(new FakeEvent('blur', { relatedTarget: this })); previous.dispatchEvent(new FakeEvent('focusout', { bubbles: true, relatedTarget: this })); }
    this.ownerDocument.activeElement = this;
    this.dispatchEvent(new FakeEvent('focus', { relatedTarget: previous }));
    this.dispatchEvent(new FakeEvent('focusin', { bubbles: true, relatedTarget: previous }));
  }
  blur() { if (this.ownerDocument.activeElement === this) this.ownerDocument.body.focus(); }
  click() { if (!this.disabled) this.dispatchEvent(new FakeEvent('click', { bubbles: true, cancelable: true, detail: 0 })); }
}

function descendants(root) { return root.children.flatMap(child => [child, ...descendants(child)]); }
function matchesSimple(element, selector) {
  if (selector === ':scope') return true;
  const not = [...selector.matchAll(/:not\(([^)]+)\)/g)];
  if (not.some(([, inner]) => matchesSimple(element, inner))) return false;
  selector = selector.replace(/:not\([^)]+\)/g, '');
  if (selector.includes(':disabled') && !element.disabled || selector.includes(':enabled') && element.disabled || selector.includes(':focus') && element.ownerDocument.activeElement !== element) return false;
  selector = selector.replace(/:(disabled|enabled|focus)/g, '');
  const attributes = [...selector.matchAll(/\[([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]+)))?\]/g)];
  if (attributes.some(([, name, a, b, c]) => !element.hasAttribute(name) || (a ?? b ?? c) !== undefined && element.getAttribute(name) !== (a ?? b ?? c))) return false;
  selector = selector.replace(/\[[^\]]+\]/g, '');
  const tag = selector.match(/^[\w-]+|^\*/)?.[0];
  if (tag && tag !== '*' && element.localName !== tag.toLowerCase()) return false;
  for (const [, kind, name] of selector.matchAll(/([.#])([\w-]+)/g)) if (kind === '#' ? element.id !== name : !element.classList.contains(name)) return false;
  return true;
}
function matchesSelector(element, selector) {
  return selector.split(',').some(part => {
    const pieces = part.trim().replace(/\s*>\s*/g, ' > ').split(/\s+/);
    if (!matchesSimple(element, pieces.pop())) return false;
    let ancestor = element.parentElement;
    while (pieces.length) {
      const piece = pieces.pop();
      if (piece === '>') { if (!ancestor || !matchesSimple(ancestor, pieces.pop())) return false; ancestor = ancestor.parentElement; }
      else { while (ancestor && !matchesSimple(ancestor, piece)) ancestor = ancestor.parentElement; if (!ancestor) return false; ancestor = ancestor.parentElement; }
    }
    return true;
  });
}
function parseMarkup(markup, root, document) {
  // This project's static HTML/SVG shell, not a general HTML parser. Skip script/style contents.
  markup = markup.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  const stack = [root];
  for (const token of markup.matchAll(/<!--[\s\S]*?-->|<![^>]*>|<\/([\w:-]+)\s*>|<([\w:-]+)\b([^>]*?)\/?\s*>|([^<]+)/g)) {
    if (token[1]) { const index = stack.findLastIndex(node => node.localName === token[1].toLowerCase()); if (index > 0) stack.length = index; }
    else if (token[2]) {
      const element = document.createElement(token[2]);
      for (const [, name, a, b, c] of token[3].matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) element.setAttribute(name, decode(a ?? b ?? c ?? ''));
      stack.at(-1).appendChild(element);
      if (!voidTags.has(element.localName) && !/\/\s*>$/.test(token[0])) stack.push(element);
    } else if (token[4]) stack.at(-1)._text += decode(token[4]);
  }
}

class FakeDocument extends EventTarget {
  constructor(window) { super(); this.defaultView = window; this.nodeType = 9; this.children = []; this._text = ''; this.activeElement = null; this.visibilityState = 'visible'; this.hidden = false; this.readyState = 'complete'; }
  createElement(tagName) { return new FakeElement(tagName, this); }
  createElementNS(_namespace, tagName) { return this.createElement(tagName); }
  appendChild(child) { if (child.parentNode) child.parentNode.removeChild(child); child.parentNode = this; this.children.push(child); return child; }
  removeChild(child) { const index = this.children.indexOf(child); if (index < 0) throw new Error('Node is not a child'); this.children.splice(index, 1); child.parentNode = null; return child; }
  querySelectorAll(selector) { return descendants(this).filter(node => node.matches(selector)); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  getElementById(id) { return descendants(this).find(node => node.id === id) ?? null; }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  get documentElement() { return this.querySelector('html'); }
  get body() { return this.querySelector('body'); }
  get head() { return this.querySelector('head'); }
  _parentEventTarget() { return this.defaultView; }
}

/** Share this object between startBundle calls to model reloads and competing tabs. */
export function createSharedState(savedState) {
  return { durable: new Map(savedState === undefined ? [] : [['current', structuredClone(savedState)]]),
    leases: new Map(), writes: 0, committedWrites: 0, writeLog: [], abortNext: false };
}

function createIndexedDB(shared) {
  return { open() {
    const request = {};
    const names = new Set(['game']);
    request.result = {
      objectStoreNames: { contains: name => names.has(name) }, createObjectStore(name) { names.add(name); }, close() {},
      transaction() {
        let terminal = false;
        const finish = abort => {
          if (terminal) return; terminal = true;
          if (abort) { transaction.error = new Error('injected IndexedDB abort'); transaction.onabort?.({ target: transaction }); }
          else transaction.oncomplete?.({ target: transaction });
        };
        const transaction = { error: null,
          objectStore() { return {
            openCursor(key) {
              const cursor = {};
              queueMicrotask(() => {
                if (terminal) return;
                cursor.result = shared.durable.has(key) ? { value: structuredClone(shared.durable.get(key)) } : null;
                cursor.onsuccess?.({ target: cursor }); queueMicrotask(() => finish(false));
              });
              return cursor;
            },
            put(value, key) {
              const write = { key, value: structuredClone(value), committed: false };
              shared.writes++; shared.writeLog.push(write);
              queueMicrotask(() => {
                if (terminal) return;
                if (shared.abortNext) { shared.abortNext = false; finish(true); }
                else { shared.durable.set(key, structuredClone(write.value)); write.committed = true; shared.committedWrites++; finish(false); }
              });
              return {};
            },
          }; },
          abort() { queueMicrotask(() => finish(true)); },
        };
        return transaction;
      },
    };
    queueMicrotask(() => request.onsuccess?.({ target: request }));
    return request;
  } };
}
function createLocks(shared) {
  return { async request(name, _options, callback) {
    if (shared.leases.has(name)) return callback(null);
    const lease = { name }; shared.leases.set(name, lease);
    try { return await callback(lease); }
    finally { if (shared.leases.get(name) === lease) shared.leases.delete(name); }
  } };
}

function createAudio(options, elapsed) {
  const settings = options === false ? { available: false } : options ?? {};
  const audio = { settings, contexts: [], oscillators: [], gains: [], calls: [], pendingResumes: [],
    constructorCalls: 0, resumeCalls: 0, closeCalls: 0, starts: [], stops: [],
    resolveResume() { for (const pending of this.pendingResumes.splice(0)) pending.resolve(); },
    rejectResume(error = new Error('injected AudioContext resume rejection')) { for (const pending of this.pendingResumes.splice(0)) pending.reject(error); },
  };
  function parameter(value = 0) {
    return { value, calls: [],
      setValueAtTime(value, time) { this.value = value; this.calls.push(['setValueAtTime', value, time]); return this; },
      exponentialRampToValueAtTime(value, time) { this.value = value; this.calls.push(['exponentialRampToValueAtTime', value, time]); return this; },
      linearRampToValueAtTime(value, time) { this.value = value; this.calls.push(['linearRampToValueAtTime', value, time]); return this; },
      setTargetAtTime(value, time, constant) { this.value = value; this.calls.push(['setTargetAtTime', value, time, constant]); return this; },
      cancelScheduledValues(time) { this.calls.push(['cancelScheduledValues', time]); return this; },
    };
  }
  const connections = node => Object.assign(node, { connections: [], disconnected: false,
    connect(target) { this.connections.push(target); return target; }, disconnect() { this.disconnected = true; this.connections = []; },
  });
  class AudioContext extends EventTarget {
    constructor() {
      super(); audio.constructorCalls++; audio.calls.push(['construct']);
      if (settings.failConstructor || settings.throwOnConstructor) throw new Error('injected AudioContext construction failure');
      this.state = settings.state ?? 'suspended'; this.destination = {}; audio.contexts.push(this);
    }
    get currentTime() { return elapsed() / 1000; }
    resume() {
      audio.resumeCalls++; audio.calls.push(['resume']);
      if (settings.failResume || settings.resume === 'reject') return Promise.reject(new Error('injected AudioContext resume rejection'));
      const resumed = () => { if (this.state !== 'closed') { this.state = 'running'; this.dispatchEvent(new FakeEvent('statechange')); } };
      if (settings.resume === 'pending') return new Promise((resolve, reject) => audio.pendingResumes.push({ resolve: () => { resumed(); resolve(); }, reject }));
      resumed(); return Promise.resolve();
    }
    close() { audio.closeCalls++; audio.calls.push(['close']); this.state = 'closed'; this.dispatchEvent(new FakeEvent('statechange')); return Promise.resolve(); }
    suspend() { this.state = 'suspended'; this.dispatchEvent(new FakeEvent('statechange')); return Promise.resolve(); }
    createGain() {
      if (settings.failGain) throw new Error('injected AudioContext gain failure');
      const gain = connections({ gain: parameter(1), context: this }); audio.gains.push(gain); return gain;
    }
    createOscillator() {
      if (settings.failOscillator) throw new Error('injected AudioContext oscillator failure');
      const oscillator = connections({ context: this, type: 'sine', frequency: parameter(440), detune: parameter(), starts: [], stops: [], onended: null,
        start(when = 0) { if (settings.failStart) throw new Error('injected oscillator start failure'); this.starts.push(when); audio.starts.push({ oscillator: this, when }); audio.calls.push(['start', when]); },
        stop(when = 0) { if (settings.failStop) throw new Error('injected oscillator stop failure'); this.stops.push(when); audio.stops.push({ oscillator: this, when }); audio.calls.push(['stop', when]); },
        end() { this.onended?.(new FakeEvent('ended')); },
      });
      audio.oscillators.push(oscillator); return oscillator;
    }
  }
  return { audio, AudioContext: settings.available === false ? undefined : AudioContext };
}

/** Flush microtasks/IDB callbacks without consuming a single controlled timer. */
export async function flush(turns = 40) { for (let i = 0; i < turns; i++) await Promise.resolve(); }

export async function startBundle(options = {}) {
  const artifactPath = resolve(options.artifactPath ?? 'dist/JanPon.html');
  const html = options.html ?? await readFile(artifactPath, 'utf8');
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
  if (!scripts.length || scripts.some(([, attributes]) => /\bsrc\s*=/.test(attributes))) throw new Error('Harness requires self-contained bundled HTML with inline JavaScript');
  const shared = options.shared ?? createSharedState(options.savedState);
  const timers = new Map(), timerHistory = []; let nextTimer = 0, elapsed = 0, reloads = 0;
  const epoch = options.now ?? 1700000000000;
  const window = new EventTarget();
  const document = new FakeDocument(window); parseMarkup(html, document, document); document.activeElement = document.body;
  function schedule(callback, duration = 0, ...args) {
    const delay = Math.max(0, Number(duration) || 0), id = ++nextTimer;
    const timer = { id, callback, args, delay, duration: delay, due: elapsed + delay };
    timers.set(id, timer); timerHistory.push(timer); return id;
  }
  const next = () => [...timers.values()].sort((a, b) => a.due - b.due || a.id - b.id)[0];
  async function runTimer(timer) {
    timers.delete(timer.id); elapsed = Math.max(elapsed, timer.due); timer.callback(...timer.args); await flush();
  }
  async function tick(ms) {
    await flush();
    if (ms === undefined) { const timer = next(); if (!timer) return false; await runTimer(timer); return true; }
    if (!Number.isFinite(ms) || ms < 0) throw new Error('tick requires a nonnegative finite duration');
    const target = elapsed + ms; let count = 0;
    while (next()?.due <= target) { if (++count > 10000) throw new Error('Timer limit exceeded'); await runTimer(next()); }
    elapsed = target; await flush(); return count;
  }
  async function drain(limit = 10000) {
    await flush(); let count = 0;
    while (next()) { if (++count > limit) throw new Error('Timer drain limit exceeded (possibly a repeating timer)'); await runTimer(next()); }
    await flush(); return count;
  }
  const { audio, AudioContext } = createAudio(options.audio, () => elapsed);
  const media = new EventTarget(); media.media = '(prefers-reduced-motion: reduce)'; media.matches = !!options.reducedMotion;
  media.addListener = callback => media.addEventListener('change', callback);
  media.removeListener = callback => media.removeEventListener('change', callback);
  const mediaQueries = [];
  function setReducedMotion(value) { if (media.matches === !!value) return; media.matches = !!value; media.dispatchEvent(new FakeEvent('change', { matches: media.matches, media: media.media })); }
  const location = { reload() { reloads++; options.onReload?.(); } };
  const navigator = { locks: createLocks(shared) };
  const indexedDB = options.indexedDB === false ? undefined : createIndexedDB(shared);
  class FakeDate extends Date {
    constructor(...args) { super(...(args.length ? args : [epoch + elapsed])); }
    static now() { return epoch + elapsed; }
  }
  const globals = { document, window, self: window, indexedDB, navigator, location, console,
    Event: FakeEvent, KeyboardEvent: FakeEvent, MouseEvent: FakeEvent, PointerEvent: FakeEvent,
    Element: FakeElement, HTMLElement: FakeElement, HTMLButtonElement: FakeElement, SVGElement: FakeElement,
    Node: FakeElement, EventTarget, AbortController, AbortSignal, Date: FakeDate,
    setTimeout: schedule, clearTimeout: id => timers.delete(id), queueMicrotask,
    performance: { now: () => elapsed },
    crypto: { getRandomValues(words) { words.fill(options.cryptoWord ?? 0); return words; } },
  };
  if (AudioContext) globals.AudioContext = AudioContext;
  if (options.matchMedia !== false) globals.matchMedia = query => { mediaQueries.push(query); return media; };
  Object.assign(window, globals); window.top = window; window.parent = window;
  const context = vm.createContext(globals);
  for (const [, attributes, script] of options.runBundle === false ? [] : scripts) {
    if (/\btype\s*=\s*["'](?:application\/json|application\/ld\+json)["']/.test(attributes)) continue;
    new vm.Script(script, { filename: artifactPath }).runInContext(context, { timeout: options.timeout ?? 5000 });
  }
  const targetElement = target => typeof target === 'string' ? document.querySelector(target) : target;
  function dispatch(target, type, init = {}) {
    target = targetElement(target); if (!target) throw new Error(`Missing event target for ${type}`);
    const event = new FakeEvent(type, { bubbles: true, cancelable: true, ...init }); target.dispatchEvent(event); return event;
  }
  const pressed = new Map();
  function keyDown(key, init = {}) {
    const target = targetElement(init.target) ?? document.activeElement ?? document;
    const code = init.code ?? (key === ' ' ? 'Space' : key === 'Enter' ? 'Enter' : key.length === 1 ? `Key${key.toUpperCase()}` : key);
    const event = dispatch(target, 'keydown', { isTrusted: true, key, code, ...init });
    if (!event.repeat) pressed.set(code, { target, canceled: event.defaultPrevented });
    if (!event.defaultPrevented && key === 'Enter' && target.localName === 'button') target.click();
    return event;
  }
  function keyUp(key, init = {}) {
    const target = targetElement(init.target) ?? document.activeElement ?? document;
    const code = init.code ?? (key === ' ' ? 'Space' : key === 'Enter' ? 'Enter' : key.length === 1 ? `Key${key.toUpperCase()}` : key);
    const event = dispatch(target, 'keyup', { isTrusted: true, key, code, ...init }), down = pressed.get(code); pressed.delete(code);
    if (!event.defaultPrevented && !down?.canceled && down?.target === target && key === ' ' && target.localName === 'button') target.click();
    return event;
  }
  const ui = { scope: HARNESS_SCOPE, artifactPath, html, context, window, document, shared, timers, timerHistory, audio, media, mediaQueries,
    machine: document.querySelector('.machine'), display: document.querySelector('.display'),
    hands: document.querySelectorAll('.controls button'), lamps: document.querySelectorAll('.lamp'),
    get ids() { return new Map(document.querySelectorAll('[id]').map(element => [element.id, element])); },
    get writes() { return shared.writes; }, get writeLog() { return shared.writeLog; },
    get savedState() { return structuredClone(shared.durable.get('current')); },
    get elapsed() { return elapsed; }, get now() { return epoch + elapsed; }, get reloads() { return reloads; },
    flush, tick, drain, dispatch, keyDown, keyUp,
    pressKey(key, init = {}) { const down = keyDown(key, init), up = keyUp(key, init); return { down, up }; },
    click(target, init = {}) {
      target = targetElement(target); if (!target) throw new Error('Missing click target');
      if (target.disabled) return null;
      dispatch(target, 'pointerdown', { isTrusted: true, pointerType: 'mouse', ...init }); target.focus?.();
      dispatch(target, 'pointerup', { isTrusted: true, pointerType: 'mouse', ...init });
      return dispatch(target, 'click', { isTrusted: true, detail: 1, ...init });
    },
    focus(target) { target = targetElement(target); if (!target) throw new Error('Missing focus target'); target.focus(); return target; },
    dispatchWindow(type, init = {}) { return dispatch(window, type, { bubbles: false, cancelable: false, ...init }); },
    pagehide(init = {}) { return this.dispatchWindow('pagehide', init); },
    pageshow(init = {}) { return this.dispatchWindow('pageshow', init); },
    setReducedMotion,
    abortNextWrite() { shared.abortNext = true; },
    async close() { this.pagehide(); await flush(); },
  };
  await flush();
  return ui;
}
