interface Item {
  type?: string;
  name: string;
  invocation?: string;
  description?: string;
  source?: string;
  argumentHint?: string | null;
  allowedTools?: string | null;
  model?: string | null;
  tools?: string | null;
}

interface Plugin {
  name: string;
  description?: string;
  category?: string | null;
  homepage?: string | null;
  skillsCount?: number;
  commandsCount?: number;
  agentsCount?: number;
  downloaded?: boolean;
}

interface Marketplace {
  name: string;
  description?: string;
  owner?: string | null;
  plugins: Plugin[];
}

interface Settings {
  additionalDirectoriesCount?: number;
  permissionsAllowCount?: number;
  alwaysThinkingEnabled?: boolean | null;
  effortLevel?: string | null;
}

interface Inventory {
  generatedAt: string;
  counts: { commands: number; skills: number; plugins: number; marketplaces: number; agents: number };
  commands: Item[];
  skills: Item[];
  marketplaces: Marketplace[];
  agents: Item[];
  settings: Settings;
}

type CardItem = {
  type: 'command' | 'skill' | 'plugin' | 'agent';
  name: string;
  invocation?: string;
  description?: string;
  source?: string;
  argumentHint?: string | null;
  allowedTools?: string | null;
  model?: string | null;
  tools?: string | null;
  category?: string | null;
  homepage?: string | null;
  marketplace?: string;
  skillsCount?: number;
  commandsCount?: number;
  agentsCount?: number;
  downloaded?: boolean;
};

declare global {
  interface Window { __INVENTORY__?: Inventory; }
}

const THEME_KEY = 'cheatsheet:theme';
const FAV_KEY = 'cheatsheet:favorites';
const INV_KEY = 'cheatsheet:inventory';
const INV_NAME_KEY = 'cheatsheet:inventory-name';
const SECTIONS_KEY = 'cheatsheet:sections-collapsed';

let activeFilter = 'all';
let activeQuery = '';
let loaded = false;
let currentModalKey: string | null = null;
let lastFocusedBeforeModal: HTMLElement | null = null;

const prefersReducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

const $$ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelectorAll<T>(sel);

const norm = (s: string) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const pad = (n: number) => String(n).padStart(2, '0');

// ---------- Favorites (LS) ----------
const loadFavs = (): Set<string> => {
  try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY) || '[]')); }
  catch { return new Set(); }
};
const saveFavs = (s: Set<string>) => {
  try { localStorage.setItem(FAV_KEY, JSON.stringify([...s])); } catch {}
};

// ---------- Render helpers ----------
const itemRegistry = new Map<string, CardItem>();

function flattenPlugins(inv: Inventory): CardItem[] {
  return inv.marketplaces.flatMap(m =>
    m.plugins.map<CardItem>(p => ({
      type: 'plugin',
      name: p.name,
      description: p.description || '',
      source: `marketplace:${m.name}`,
      marketplace: m.name,
      category: p.category ?? null,
      homepage: p.homepage ?? null,
      skillsCount: p.skillsCount,
      commandsCount: p.commandsCount,
      agentsCount: p.agentsCount,
      downloaded: p.downloaded,
    }))
  );
}

function setText(id: string, text: string) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function animateCount(id: string, target: number, durationMs = 600) {
  const el = document.getElementById(id);
  if (!el) return;
  if (prefersReducedMotion() || target < 5) {
    el.textContent = pad(target);
    return;
  }
  const start = performance.now();
  const easeOutQuad = (t: number) => 1 - (1 - t) * (1 - t);
  const step = (now: number) => {
    const progress = Math.min(1, (now - start) / durationMs);
    const value = Math.round(target * easeOutQuad(progress));
    el.textContent = pad(value);
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function renderHero(inv: Inventory) {
  const stats = document.getElementById('hero-stats');
  if (stats) stats.hidden = false;
  const plugins = flattenPlugins(inv);
  animateCount('count-hero-commands', inv.counts.commands);
  animateCount('count-hero-skills', inv.counts.skills);
  animateCount('count-hero-plugins', plugins.length);
  animateCount('count-hero-agents', inv.counts.agents);
  const when = new Date(inv.generatedAt).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' });
  setText('hero-when', when);
  const m = inv.counts.marketplaces;
  setText('hero-markets', `${m} marketplace${m === 1 ? '' : 's'}`);
}

function renderFilterChips(inv: Inventory) {
  const plugins = flattenPlugins(inv);
  const total = inv.counts.commands + inv.counts.skills + plugins.length + inv.counts.agents;
  const map: Record<string, number> = {
    all: total,
    command: inv.counts.commands,
    skill: inv.counts.skills,
    plugin: plugins.length,
    agent: inv.counts.agents,
  };
  for (const [id, count] of Object.entries(map)) {
    document.querySelectorAll(`[data-filter-count="${id}"]`).forEach(el => {
      el.textContent = String(count);
    });
  }
}

function renderFooter(inv: Inventory) {
  const snapBlock = document.getElementById('footer-snapshot');
  if (snapBlock) snapBlock.hidden = false;
  const when = new Date(inv.generatedAt).toLocaleString('es-AR', { dateStyle: 'long', timeStyle: 'short' });
  setText('footer-when', when);
}

function buildCard(item: CardItem, index: number, favs: Set<string>): HTMLElement {
  const tpl = document.getElementById('card-tpl') as HTMLTemplateElement;
  const node = tpl.content.firstElementChild!.cloneNode(true) as HTMLElement;
  const { type, name, invocation, description = '', source = '' } = item;

  const favKey = `${type}:${name}`;
  itemRegistry.set(favKey, item);
  node.dataset.type = type;
  node.dataset.favKey = favKey;
  node.dataset.search = norm(`${name} ${description} ${source} ${type}`);
  node.style.setProperty('--i', String(Math.min(index, 40)));
  node.setAttribute('role', 'button');
  node.setAttribute('tabindex', '0');
  node.setAttribute('aria-label', `Ver detalles de ${invocation || name}`);

  const display = invocation || name;
  const sourceLabel = source && source !== 'local'
    ? source.startsWith('plugin:') ? source.slice(7)
    : source.startsWith('marketplace:') ? source.slice(12)
    : source
    : null;

  node.querySelector('.card-type-pill')!.textContent = type;
  node.querySelector('.card-name')!.textContent = display;
  const descEl = node.querySelector('.card-desc') as HTMLElement;
  if (description) { descEl.textContent = description; descEl.hidden = false; }
  else descEl.hidden = true;
  const sourceEl = node.querySelector('.card-source') as HTMLElement;
  if (sourceLabel) { sourceEl.textContent = sourceLabel; sourceEl.hidden = false; }
  else sourceEl.hidden = true;
  if (favs.has(node.dataset.favKey!)) {
    node.dataset.favorited = 'true';
    node.querySelector('[data-fav-toggle]')?.setAttribute('aria-pressed', 'true');
  }
  return node;
}

function renderCards(inv: Inventory) {
  const favs = loadFavs();
  itemRegistry.clear();
  const grids: Record<string, HTMLElement | null> = {
    command: document.getElementById('cards-command'),
    skill: document.getElementById('cards-skill'),
    plugin: document.getElementById('cards-plugin'),
    agent: document.getElementById('cards-agent'),
  };
  for (const g of Object.values(grids)) if (g) g.innerHTML = '';

  const plugins = flattenPlugins(inv);
  const groups: Array<[string, CardItem[]]> = [
    ['command', inv.commands.map<CardItem>(c => ({ ...c, type: 'command' }))],
    ['skill', inv.skills.map<CardItem>(s => ({ ...s, type: 'skill' }))],
    ['plugin', plugins],
    ['agent', inv.agents.map<CardItem>(a => ({ ...a, type: 'agent' }))],
  ];

  let idx = 0;
  for (const [kind, list] of groups) {
    const grid = grids[kind];
    if (!grid) continue;
    for (const item of list) {
      grid.appendChild(buildCard(item, idx++, favs));
    }
  }
  updateFavCount(favs);
}

function updateFavCount(favs?: Set<string>) {
  const s = favs || loadFavs();
  document.querySelectorAll('[data-filter-count="favorites"]').forEach(el => {
    el.textContent = String(s.size);
  });
}

// ---------- Modal ----------
const TYPE_LABELS: Record<string, string> = {
  command: 'Slash command',
  skill: 'Skill',
  plugin: 'Plugin',
  agent: 'Agent',
};

function addMetaRow(container: HTMLElement, label: string, valueNode: Node | string) {
  const tpl = document.getElementById('modal-meta-row-tpl') as HTMLTemplateElement | null;
  if (!tpl) return;
  const row = tpl.content.firstElementChild!.cloneNode(true) as HTMLElement;
  (row.querySelector('[data-meta-label]') as HTMLElement).textContent = label;
  const valEl = row.querySelector('[data-meta-value]') as HTMLElement;
  if (typeof valueNode === 'string') valEl.textContent = valueNode;
  else valEl.appendChild(valueNode);
  container.appendChild(row);
}

function renderMeta(container: HTMLElement, item: CardItem) {
  container.innerHTML = '';
  const { type } = item;

  if (type === 'command' || type === 'agent') {
    if (item.argumentHint) addMetaRow(container, 'argument-hint', item.argumentHint);
    if (item.allowedTools) {
      const chips = document.createElement('div');
      chips.className = 'modal-meta-chips';
      String(item.allowedTools)
        .split(/[,\s]+/)
        .filter(Boolean)
        .forEach(t => {
          const chip = document.createElement('span');
          chip.textContent = t;
          chips.appendChild(chip);
        });
      addMetaRow(container, 'allowed-tools', chips);
    }
  }
  if (type === 'skill' || type === 'agent') {
    if (item.tools) {
      const chips = document.createElement('div');
      chips.className = 'modal-meta-chips';
      String(item.tools)
        .split(/[,\s]+/)
        .filter(Boolean)
        .forEach(t => {
          const chip = document.createElement('span');
          chip.textContent = t;
          chips.appendChild(chip);
        });
      addMetaRow(container, 'tools', chips);
    }
  }
  if (type !== 'plugin' && item.model) {
    addMetaRow(container, 'model', item.model);
  }
  if (type === 'plugin') {
    if (item.category) addMetaRow(container, 'category', item.category);
    if (item.homepage) {
      const a = document.createElement('a');
      a.href = item.homepage;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = item.homepage;
      addMetaRow(container, 'homepage', a);
    }
    if (item.marketplace) addMetaRow(container, 'marketplace', item.marketplace);
    addMetaRow(container, 'estado', item.downloaded ? 'Descargado localmente' : 'No descargado');
  }
}

function renderCounts(container: HTMLElement, item: CardItem) {
  container.innerHTML = '';
  if (item.type !== 'plugin') { container.hidden = true; return; }
  container.hidden = false;
  const rows: Array<[string, number]> = [
    ['skills', item.skillsCount ?? 0],
    ['commands', item.commandsCount ?? 0],
    ['agents', item.agentsCount ?? 0],
  ];
  rows.forEach(([label, count]) => {
    const block = document.createElement('div');
    const labelEl = document.createElement('span');
    labelEl.className = 'modal-count-label';
    labelEl.textContent = label;
    const valueEl = document.createElement('span');
    valueEl.className = 'modal-count-value';
    valueEl.textContent = pad(count);
    block.appendChild(labelEl);
    block.appendChild(valueEl);
    container.appendChild(block);
  });
}

function openModal(favKey: string) {
  const item = itemRegistry.get(favKey);
  const root = document.getElementById('modal-root');
  if (!item || !root) return;

  lastFocusedBeforeModal = document.activeElement as HTMLElement | null;
  currentModalKey = favKey;

  root.dataset.type = item.type;
  (root.querySelector('[data-modal-type]') as HTMLElement).textContent = TYPE_LABELS[item.type] ?? item.type;
  const title = root.querySelector('[data-modal-title]') as HTMLElement;
  title.textContent = item.invocation || item.name;
  const desc = root.querySelector('[data-modal-desc]') as HTMLElement;
  if (item.description) { desc.textContent = item.description; desc.hidden = false; }
  else { desc.textContent = ''; desc.hidden = true; }
  renderMeta(root.querySelector('[data-modal-meta]') as HTMLElement, item);
  renderCounts(root.querySelector('[data-modal-counts]') as HTMLElement, item);
  const sourceEl = root.querySelector('[data-modal-source]') as HTMLElement;
  const sourceLabel = item.source && item.source !== 'local' ? item.source : '';
  if (sourceLabel) { sourceEl.textContent = `Fuente: ${sourceLabel}`; sourceEl.hidden = false; }
  else sourceEl.hidden = true;

  const fav = root.querySelector('[data-modal-fav]') as HTMLButtonElement;
  const favs = loadFavs();
  const isFav = favs.has(favKey);
  fav.setAttribute('aria-pressed', isFav ? 'true' : 'false');
  root.setAttribute('data-favorited', isFav ? 'true' : 'false');

  root.removeAttribute('hidden');
  root.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  // force reflow so the transition from initial state runs
  void root.offsetHeight;
  root.classList.add('is-open');

  requestAnimationFrame(() => {
    const closeBtn = root.querySelector('.modal-close') as HTMLElement | null;
    closeBtn?.focus();
  });
}

function closeModal() {
  const root = document.getElementById('modal-root');
  if (!root || root.hasAttribute('hidden')) return;
  root.classList.remove('is-open');
  document.body.classList.remove('modal-open');
  const duration = prefersReducedMotion() ? 100 : 260;
  window.setTimeout(() => {
    root.setAttribute('hidden', '');
    root.setAttribute('aria-hidden', 'true');
  }, duration);
  currentModalKey = null;
  if (lastFocusedBeforeModal && document.body.contains(lastFocusedBeforeModal)) {
    lastFocusedBeforeModal.focus({ preventScroll: true });
  }
  lastFocusedBeforeModal = null;
}

function trapFocus(e: KeyboardEvent) {
  const root = document.getElementById('modal-root');
  if (!root || root.hasAttribute('hidden')) return;
  if (e.key !== 'Tab') return;
  const focusables = Array.from(
    root.querySelectorAll<HTMLElement>('button, a[href], [tabindex]:not([tabindex="-1"])')
  ).filter(el => !el.hasAttribute('disabled') && el.offsetParent !== null);
  if (focusables.length === 0) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault(); last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault(); first.focus();
  }
}

// ---------- Empty state ----------
function updateFooterStatus(name: string | null) {
  const empty = document.getElementById('footer-status-empty');
  const loaded = document.getElementById('footer-status-loaded');
  const nameEl = document.getElementById('footer-current-name');
  const resetBtn = document.getElementById('upload-reset') as HTMLButtonElement | null;
  if (name) {
    if (empty) empty.hidden = true;
    if (loaded) loaded.hidden = false;
    if (nameEl) nameEl.textContent = name;
    if (resetBtn) resetBtn.hidden = false;
  } else {
    if (empty) empty.hidden = false;
    if (loaded) loaded.hidden = true;
    if (resetBtn) resetBtn.hidden = true;
  }
}

function showEmptyState() {
  document.getElementById('empty-state')?.removeAttribute('hidden');
  document.getElementById('sections-root')?.setAttribute('hidden', '');
  const heroStats = document.getElementById('hero-stats');
  if (heroStats) heroStats.hidden = true;
  const snapBlock = document.getElementById('footer-snapshot');
  if (snapBlock) snapBlock.hidden = true;
  updateFooterStatus(null);
  ['commands', 'skills', 'plugins', 'agents'].forEach(k => setText(`count-hero-${k}`, '00'));
  setText('hero-when', '—');
  setText('hero-markets', '0 marketplaces');
  ['all', 'command', 'skill', 'plugin', 'agent'].forEach(id => {
    document.querySelectorAll(`[data-filter-count="${id}"]`).forEach(el => {
      el.textContent = '0';
    });
  });
  updateFavCount();
}

function hideEmptyState() {
  document.getElementById('empty-state')?.setAttribute('hidden', '');
  document.getElementById('sections-root')?.removeAttribute('hidden');
}

// ---------- Filters + search ----------
const hideTimers = new WeakMap<HTMLElement, number>();

function setCardVisible(card: HTMLElement, visible: boolean) {
  const pending = hideTimers.get(card);
  if (pending !== undefined) {
    clearTimeout(pending);
    hideTimers.delete(card);
  }
  if (visible) {
    if (card.hasAttribute('hidden')) {
      card.removeAttribute('hidden');
      // force reflow so removing is-hiding triggers the transition
      void card.offsetHeight;
    }
    card.classList.remove('is-hiding');
  } else {
    if (card.hasAttribute('hidden')) return;
    card.classList.add('is-hiding');
    const fallback = prefersReducedMotion() ? 110 : 210;
    const timer = window.setTimeout(() => {
      if (card.classList.contains('is-hiding')) card.hidden = true;
      hideTimers.delete(card);
    }, fallback);
    hideTimers.set(card, timer);
  }
}

function applyFilters() {
  const cards = $$('[data-card]');
  const sections = $$('[data-section]');
  let totalVisible = 0;
  cards.forEach(card => {
    const typeMatch =
      activeFilter === 'all' ? true
      : activeFilter === 'favorites' ? card.dataset.favorited === 'true'
      : card.dataset.type === activeFilter;
    const queryMatch = !activeQuery || (card.dataset.search || '').includes(activeQuery);
    const visible = typeMatch && queryMatch;
    setCardVisible(card, visible);
    if (visible) totalVisible++;
  });
  sections.forEach(section => {
    const anyVisible = Array.from(section.querySelectorAll<HTMLElement>('[data-card]'))
      .some(c => !c.hasAttribute('hidden') && !c.classList.contains('is-hiding'));
    const parent = section.closest('section');
    if (parent) (parent as HTMLElement).style.display = anyVisible ? '' : 'none';
  });
  const noRes = document.getElementById('no-results');
  if (noRes) noRes.classList.toggle('hidden', totalVisible > 0);
}

// ---------- Upload ----------
function validateInventoryShape(obj: any): obj is Inventory {
  return obj && Array.isArray(obj.commands) && Array.isArray(obj.skills)
    && Array.isArray(obj.agents) && Array.isArray(obj.marketplaces)
    && obj.counts && typeof obj.counts === 'object';
}

function persistInventory(inv: Inventory, name: string | null) {
  try {
    localStorage.setItem(INV_KEY, JSON.stringify(inv));
    if (name) localStorage.setItem(INV_NAME_KEY, name);
    else localStorage.removeItem(INV_NAME_KEY);
  } catch (e) {
    console.warn('[cheatsheet] no se pudo persistir el inventario en localStorage', e);
  }
}

function readPersistedInventory(): { inv: Inventory; name: string | null } | null {
  try {
    const raw = localStorage.getItem(INV_KEY);
    if (!raw) return null;
    const inv = JSON.parse(raw);
    if (!validateInventoryShape(inv)) return null;
    const name = localStorage.getItem(INV_NAME_KEY);
    return { inv, name };
  } catch { return null; }
}

function clearPersistedInventory() {
  try {
    localStorage.removeItem(INV_KEY);
    localStorage.removeItem(INV_NAME_KEY);
  } catch {}
}

function loadInventory(inv: Inventory, sourceLabel: string | null, { persist = true } = {}) {
  window.__INVENTORY__ = inv;
  loaded = true;
  if (persist) persistInventory(inv, sourceLabel);
  hideEmptyState();
  renderHero(inv);
  renderFilterChips(inv);
  renderFooter(inv);
  renderCards(inv);
  updateFooterStatus(sourceLabel);
  applyFilters();
}

function resetToEmpty() {
  window.__INVENTORY__ = undefined;
  loaded = false;
  clearPersistedInventory();
  ['command', 'skill', 'plugin', 'agent'].forEach(k => {
    const g = document.getElementById(`cards-${k}`);
    if (g) g.innerHTML = '';
  });
  $$('[data-section]').forEach(s => {
    const parent = s.closest('section');
    if (parent) (parent as HTMLElement).style.display = '';
  });
  showEmptyState();
}

function handleFile(file: File) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      if (!validateInventoryShape(parsed)) {
        throw new Error('El archivo no tiene la forma esperada (commands, skills, agents, marketplaces).');
      }
      loadInventory(parsed, file.name);
    } catch (err: any) {
      const msg = err?.message || 'No se pudo leer el archivo';
      const errEl = document.getElementById('upload-error');
      if (errEl) {
        errEl.textContent = msg;
        errEl.hidden = false;
        setTimeout(() => { errEl.hidden = true; }, 4000);
      } else {
        alert(msg);
      }
    }
  };
  reader.readAsText(file);
}

// ---------- Download command (built at runtime from current URL) ----------
function buildDownloadCommand(): string {
  const base = new URL('.', location.href).href;
  return `curl -sSL ${base}build-inventory.mjs -o claude-cheatsheet.mjs && node claude-cheatsheet.mjs > cheatsheet.json`;
}

function wireCopyButtons() {
  const cmd = buildDownloadCommand();
  document.querySelectorAll<HTMLElement>('[data-download-cmd]').forEach(el => {
    el.textContent = cmd;
  });
  document.querySelectorAll<HTMLButtonElement>('[data-copy-cmd]').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(cmd);
        const prev = btn.textContent;
        btn.textContent = '✓ Copiado';
        setTimeout(() => { btn.textContent = prev; }, 1500);
      } catch {
        // no-op
      }
    });
  });
}

// ---------- Collapsible sections ----------
function loadCollapsedSections(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(SECTIONS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed ? parsed : {};
  } catch { return {}; }
}
function saveCollapsedSections(state: Record<string, boolean>) {
  try { localStorage.setItem(SECTIONS_KEY, JSON.stringify(state)); } catch {}
}

function applyCollapsedSections() {
  const state = loadCollapsedSections();
  document.querySelectorAll<HTMLElement>('[data-section-wrap]').forEach(wrap => {
    const kind = wrap.dataset.kind!;
    const collapsed = state[kind] === true;
    wrap.dataset.collapsed = collapsed ? 'true' : 'false';
    const toggle = wrap.querySelector<HTMLButtonElement>('.section-toggle');
    toggle?.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  });
}

function wireCollapsibleSections() {
  applyCollapsedSections();
  document.querySelectorAll<HTMLElement>('[data-section-wrap]').forEach(wrap => {
    const toggle = wrap.querySelector<HTMLButtonElement>('.section-toggle');
    const kind = wrap.dataset.kind!;
    toggle?.addEventListener('click', () => {
      const state = loadCollapsedSections();
      const next = wrap.dataset.collapsed !== 'true';
      state[kind] = next;
      saveCollapsedSections(state);
      wrap.dataset.collapsed = next ? 'true' : 'false';
      toggle.setAttribute('aria-expanded', next ? 'false' : 'true');
    });
  });
}

// ---------- Section reveal stagger (IntersectionObserver) ----------
function setupSectionReveal() {
  if (prefersReducedMotion()) {
    document.querySelectorAll<HTMLElement>('[data-reveal]').forEach(el => el.classList.add('is-revealed'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add('is-revealed');
        io.unobserve(e.target);
      }
    }
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.05 });
  document.querySelectorAll<HTMLElement>('[data-reveal]').forEach(el => io.observe(el));
}

// ---------- Sticky bar compact mode ----------
function setupStickyCompact() {
  const sentinel = document.getElementById('sticky-sentinel');
  const bar = document.querySelector<HTMLElement>('.sticky-bar');
  if (!sentinel || !bar) return;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      bar.classList.toggle('is-compact', !e.isIntersecting);
    }
  }, { threshold: 0 });
  io.observe(sentinel);
}

// ---------- Wire all listeners (once) ----------
function wireEvents() {
  const search = document.getElementById('search') as HTMLInputElement | null;
  search?.addEventListener('input', (e) => {
    activeQuery = norm((e.target as HTMLInputElement).value.trim());
    if (loaded) applyFilters();
  });

  const filterButtons = $$('[data-filter]');
  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.filter || 'all';
      filterButtons.forEach(b => {
        const on = b === btn;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      if (loaded) applyFilters();
    });
  });

  document.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement | null;
    const inField = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
    // Modal keyboard (takes priority): Esc closes, Tab traps
    const modal = document.getElementById('modal-root');
    if (modal && !modal.hasAttribute('hidden')) {
      if (e.key === 'Escape') { e.preventDefault(); closeModal(); return; }
      if (e.key === 'Tab') { trapFocus(e); return; }
    }
    if (e.key === '/' && !inField) { e.preventDefault(); search?.focus(); }
    if (e.key === 'Escape' && search && document.activeElement === search) {
      search.value = ''; activeQuery = ''; if (loaded) applyFilters(); search.blur();
    }
  });

  $$<HTMLButtonElement>('[data-theme-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cur = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
      const nxt = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = nxt;
      try { localStorage.setItem(THEME_KEY, nxt); } catch {}
    });
  });

  // Favorites (event delegation) — also handles the modal's fav button
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const cardFav = target.closest('[data-fav-toggle]');
    const modalFav = target.closest('[data-modal-fav]');
    const btn = cardFav || modalFav;
    if (!btn) return;
    e.stopPropagation();
    let key: string | null = null;
    let card: HTMLElement | null = null;
    if (cardFav) {
      card = btn.closest('[data-card]') as HTMLElement | null;
      key = card?.dataset.favKey ?? null;
    } else if (modalFav) {
      key = currentModalKey;
      if (key) card = document.querySelector<HTMLElement>(`[data-card][data-fav-key="${CSS.escape(key)}"]`);
    }
    if (!key) return;
    const favs = loadFavs();
    const on = !favs.has(key);
    if (on) favs.add(key); else favs.delete(key);
    saveFavs(favs);
    if (card) {
      card.dataset.favorited = on ? 'true' : 'false';
      card.querySelector('[data-fav-toggle]')?.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    const modal = document.getElementById('modal-root');
    if (modal && !modal.hasAttribute('hidden') && currentModalKey === key) {
      modal.setAttribute('data-favorited', on ? 'true' : 'false');
      modal.querySelector('[data-modal-fav]')?.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    (btn as HTMLElement).classList.remove('is-popping');
    void (btn as HTMLElement).offsetHeight;
    (btn as HTMLElement).classList.add('is-popping');
    updateFavCount(favs);
    if (activeFilter === 'favorites') applyFilters();
  });

  // Card click / Enter / Space → open modal
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-fav-toggle]')) return;
    const card = target.closest('[data-card]') as HTMLElement | null;
    if (!card) return;
    const key = card.dataset.favKey;
    if (key) openModal(key);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const t = e.target as HTMLElement | null;
    if (!t || !t.matches('[data-card]')) return;
    e.preventDefault();
    const key = t.dataset.favKey;
    if (key) openModal(key);
  });

  // Modal close triggers
  document.querySelectorAll('[data-modal-close]').forEach(el => {
    el.addEventListener('click', () => closeModal());
  });

  const upload = document.getElementById('upload-input') as HTMLInputElement | null;
  upload?.addEventListener('change', (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) handleFile(f);
    (e.target as HTMLInputElement).value = '';
  });

  document.querySelectorAll<HTMLElement>('[data-upload-trigger]').forEach(el => {
    el.addEventListener('click', () => upload?.click());
  });

  document.getElementById('upload-reset')?.addEventListener('click', resetToEmpty);

  document.body.addEventListener('dragover', (e) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    document.body.classList.add('is-dragging');
  });
  document.body.addEventListener('dragleave', (e) => {
    if (e.relatedTarget) return;
    document.body.classList.remove('is-dragging');
  });
  document.body.addEventListener('drop', (e) => {
    e.preventDefault();
    document.body.classList.remove('is-dragging');
    const f = e.dataTransfer?.files?.[0];
    if (f) handleFile(f);
  });
}

// ---------- Boot ----------
wireEvents();
wireCopyButtons();
wireCollapsibleSections();
setupStickyCompact();
setupSectionReveal();
const persisted = readPersistedInventory();
if (persisted) {
  loadInventory(persisted.inv, persisted.name, { persist: false });
} else if (window.__INVENTORY__) {
  loadInventory(window.__INVENTORY__, null);
} else {
  showEmptyState();
}
