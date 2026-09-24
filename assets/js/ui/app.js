// Main application screen: sidebar, quick capture, item grid, search.
import { t, lang } from '../i18n.js';
import { icon } from '../icons.js';
import { prefs, applyTheme } from '../prefs.js';
import { $, $$, esc, el, debounce, relTime, toast, copyText, confirmDialog, isTouch, compressImage, pickFile, closeAllModals } from '../util.js';
import { blankItem } from '../vault.js';
import { detect, autoTags, parseQuery, score, hostOf, siteInfo, youtubeId, isSafeUrl, normalizeUrl, titleFromUrl, extractUrls, fetchVideoTitle } from '../smart.js';
import { renderMarkdown, toggleCheck, checklistProgress } from '../markdown.js';
import { totpCode } from '../password.js';
import { openEditor } from './editor.js';
import { openMenu, closeMenu } from './menu.js';
import { renderSecurity } from './security.js';
import { openSettings } from './settings.js';
import { takeSharedItems } from '../idb.js';
import { logoSvg } from './brand.js';

const TYPES = ['note', 'link', 'password'];
const COLORS = ['', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'];
export { COLORS };

let vault;
let state;
let abort;
let renderQueued = false;
let captureType = null;

export function startApp(v) {
  vault = v;
  abort?.abort();
  abort = new AbortController();
  const signal = abort.signal;
  state = { view: 'all', tag: null, query: '', shown: 120 };

  $('#app').innerHTML = shellHtml();
  document.body.classList.remove('auth-mode');
  bindShell(signal);

  vault.addEventListener('change', queueRender, { signal });
  vault.addEventListener('ready', () => { queueRender(); handleIncoming(); }, { signal });
  vault.addEventListener('sync', renderSync, { signal });
  vault.addEventListener('write-error', (e) => {
    const code = e.detail?.code || '';
    toast(code.includes('permission') ? t('err.permission') : t('err.write'), { kind: 'error', duration: 6000 });
  }, { signal });
  vault.addEventListener('migrated', (e) => toast(t('migrated', { n: e.detail }), { kind: 'success' }), { signal });
  vault.addEventListener('password-changed-elsewhere', () => {
    toast(t('passwordChangedElsewhere'), { kind: 'info', duration: 7000 });
    vault.lock();
  }, { signal });
  vault.addEventListener('signed-out', () => toast(t('sessionEnded'), { kind: 'info', duration: 7000 }), { signal });
  vault.addEventListener('before-lock', () => { closeMenu(); closeAllModals(); }, { signal });
  // Detach every app-level listener (shortcuts, paste, drop, timers) once the vault is locked.
  vault.addEventListener('locked', () => abort.abort(), { signal });
  addEventListener('online', () => vault.setSyncStatus(), { signal });
  addEventListener('offline', () => vault.setSyncStatus(), { signal });
  startAutoLock(signal);
  startTotpTicker(signal);
  renderSync();
  queueRender();
  if (vault.ready) handleIncoming();
}

// ---- layout ---------------------------------------------------------------------------------

function navItem(view, ic, label) {
  return `<button class="nav-item" data-view="${view}">${icon(ic)}<span class="nav-label">${esc(label)}</span><span class="nav-count" data-count="${view}"></span></button>`;
}

function shellHtml() {
  return `
  <div class="shell">
    <aside class="sidebar" id="sidebar">
      <div class="brand">${logoSvg(34)}<div><div class="brand-name">${esc(t('appName'))}</div><div class="brand-tag">${esc(t('tagline'))}</div></div></div>
      <button class="btn btn-primary btn-new" id="newBtn">${icon('plus')}<span>${esc(t('new'))}</span></button>
      <nav class="nav">
        ${navItem('all', 'layers', t('view.all'))}
        ${navItem('note', 'note', t('view.note'))}
        ${navItem('link', 'link', t('view.link'))}
        ${navItem('password', 'password', t('view.password'))}
        ${navItem('favorites', 'star', t('view.favorites'))}
        ${navItem('security', 'shield', t('view.security'))}
        ${navItem('trash', 'trash', t('view.trash'))}
      </nav>
      <div class="nav-heading">${esc(t('tags'))}</div>
      <nav class="nav nav-tags" id="tagNav"></nav>
      <div class="sidebar-foot">
        <button class="sync-pill" id="syncPill"></button>
        <div class="sidebar-actions">
          <button class="icon-btn" id="settingsBtn" title="${esc(t('settings'))}" aria-label="${esc(t('settings'))}">${icon('settings')}</button>
          <button class="icon-btn" id="themeBtn" title="${esc(t('toggleTheme'))}" aria-label="${esc(t('toggleTheme'))}">${icon('moon')}</button>
          <button class="icon-btn" id="lockBtn" title="${esc(t('lock'))}" aria-label="${esc(t('lock'))}">${icon('lock')}</button>
        </div>
      </div>
    </aside>
    <div class="scrim" id="scrim"></div>
    <main class="main">
      <header class="topbar">
        <button class="icon-btn only-mobile" id="menuBtn" aria-label="${esc(t('menu'))}">${icon('menu')}</button>
        <h1 class="view-title" id="viewTitle"></h1>
        <div class="search" id="searchBox">
          ${icon('search')}
          <input type="search" id="search" placeholder="${esc(t('searchPlaceholder'))}" autocomplete="off" enterkeyhint="search">
          <kbd class="only-desktop">Ctrl K</kbd>
        </div>
        <button class="icon-btn only-mobile" id="searchToggle" aria-label="${esc(t('search'))}">${icon('search')}</button>
        <span class="sync-dot only-mobile" id="syncDot"></span>
        <div class="topbar-tools">
          <button class="icon-btn" id="sortBtn" title="${esc(t('sort'))}" aria-label="${esc(t('sort'))}">${icon('sort')}</button>
          <button class="icon-btn" id="layoutBtn" title="${esc(t('layout'))}" aria-label="${esc(t('layout'))}"></button>
        </div>
      </header>
      <section class="capture" id="capture">
        <div class="capture-box">
          <button class="capture-type" id="captureType" title="${esc(t('capture.typeHint'))}"></button>
          <textarea id="captureInput" rows="1" placeholder="${esc(t(matchMedia('(max-width: 600px)').matches ? 'capture.placeholderShort' : 'capture.placeholder'))}" enterkeyhint="done"></textarea>
          <button class="icon-btn" id="captureImage" title="${esc(t('addImage'))}" aria-label="${esc(t('addImage'))}">${icon('image')}</button>
          <button class="icon-btn" id="capturePaste" title="${esc(t('pasteClipboard'))}" aria-label="${esc(t('pasteClipboard'))}">${icon('clipboard')}</button>
          <button class="btn btn-primary btn-icon" id="captureSave" aria-label="${esc(t('save'))}" disabled>${icon('arrow-up')}</button>
        </div>
      </section>
      <section class="content" id="content"></section>
    </main>
    <nav class="bottom-nav">
      <button data-view="all">${icon('layers')}<span>${esc(t('view.allShort'))}</span></button>
      <button data-view="note">${icon('note')}<span>${esc(t('view.note'))}</span></button>
      <button class="bn-new" id="fabBtn" aria-label="${esc(t('new'))}">${icon('plus')}</button>
      <button data-view="link">${icon('link')}<span>${esc(t('view.link'))}</span></button>
      <button data-view="password">${icon('password')}<span>${esc(t('view.passwordShort'))}</span></button>
    </nav>
    <div class="drop-overlay" id="dropOverlay"><div>${icon('upload')}<span>${esc(t('dropHere'))}</span></div></div>
  </div>`;
}

function bindShell(signal) {
  const on = (target, type, fn, opts = {}) => target.addEventListener(type, fn, { signal, ...opts });

  $$('[data-view]').forEach((b) => on(b, 'click', () => setView(b.dataset.view)));
  on($('#tagNav'), 'click', (e) => {
    const b = e.target.closest('[data-tag]');
    if (b) setView('tag', b.dataset.tag);
  });
  on($('#newBtn'), 'click', (e) => newMenu(e.currentTarget));
  on($('#fabBtn'), 'click', (e) => newMenu(e.currentTarget));
  on($('#settingsBtn'), 'click', () => { closeDrawer(); openSettings(vault); });
  on($('#lockBtn'), 'click', () => vault.lock());
  on($('#themeBtn'), 'click', toggleTheme);
  on($('#syncPill'), 'click', () => openSettings(vault));
  on($('#menuBtn'), 'click', () => document.body.classList.add('drawer-open'));
  on($('#scrim'), 'click', closeDrawer);
  on($('#searchToggle'), 'click', () => {
    document.body.classList.toggle('search-open');
    if (document.body.classList.contains('search-open')) $('#search').focus();
  });
  on($('#search'), 'input', debounce((e) => {
    state.query = e.target.value;
    state.shown = 120;
    render();
  }, 90));
  on($('#search'), 'keydown', (e) => {
    if (e.key === 'Escape') {
      e.target.value = '';
      state.query = '';
      document.body.classList.remove('search-open');
      e.target.blur();
      render();
    }
  });
  on($('#layoutBtn'), 'click', () => {
    prefs.layout = prefs.layout === 'grid' ? 'list' : 'grid';
    render();
  });
  on($('#sortBtn'), 'click', (e) => sortMenu(e.currentTarget));

  // Quick capture
  const input = $('#captureInput');
  on(input, 'input', () => { autoGrow(input); updateCapture(); });
  on(input, 'keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !isTouch()) {
      e.preventDefault();
      saveCapture();
    }
    if (e.key === 'Escape') {
      input.value = '';
      captureType = null;
      updateCapture();
      input.blur();
    }
  });
  on(input, 'paste', (e) => {
    const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
    if (files.length) {
      e.preventDefault();
      createImageNote(files, input.value.trim());
      input.value = '';
      updateCapture();
    }
  });
  on($('#captureSave'), 'click', saveCapture);
  on($('#captureType'), 'click', () => {
    const current = captureType || detect($('#captureInput').value)?.type || 'note';
    captureType = TYPES[(TYPES.indexOf(current) + 1) % TYPES.length];
    updateCapture();
  });
  on($('#captureImage'), 'click', async () => {
    const files = await pickFile('image/*', true);
    if (files.length) createImageNote(files, input.value.trim());
  });
  on($('#capturePaste'), 'click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        input.value = text;
        autoGrow(input);
        updateCapture();
        input.focus();
      } else toast(t('clipboardEmpty'));
    } catch {
      toast(t('clipboardDenied'));
    }
  });
  updateCapture();

  // Content interactions (delegated)
  const content = $('#content');
  on(content, 'click', onContentClick);
  on(content, 'keydown', (e) => {
    if (e.key === 'Enter' && e.target.classList.contains('card')) openItem(e.target.dataset.id);
  });
  on(content, 'change', onContentChange);
  on(document, 'error', (e) => {
    if (e.target.matches?.('img.favicon')) e.target.replaceWith(el(letterAvatar(e.target.dataset.letter || '?')));
    if (e.target.matches?.('img.yt-thumb')) (e.target.closest('.card-image') || e.target).remove();
  }, { capture: true });

  on(window, 'resize', debounce(() => {
    if (columnCount() !== state.columns) render();
  }, 120));

  // Global shortcuts
  on(document, 'keydown', (e) => {
    if ($('.modal-layer')) return;
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      $('#search').focus();
      $('#search').select();
      return;
    }
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === '/') { e.preventDefault(); $('#search').focus(); }
    else if (key === 'n') { e.preventDefault(); openNew('note'); }
    else if (key === 'l') { e.preventDefault(); openNew('link'); }
    else if (key === 'p') { e.preventDefault(); openNew('password'); }
    else if (key === 'c') { e.preventDefault(); $('#captureInput').focus(); }
  });

  // Paste anywhere / drag & drop
  on(document, 'paste', (e) => {
    if ($('.modal-layer') || /INPUT|TEXTAREA/.test(document.activeElement?.tagName)) return;
    const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
    if (files.length) {
      e.preventDefault();
      createImageNote(files);
      return;
    }
    const text = e.clipboardData?.getData('text');
    if (text) {
      e.preventDefault();
      input.value = text;
      autoGrow(input);
      updateCapture();
      input.focus();
    }
  });
  let dragDepth = 0;
  on(document, 'dragenter', (e) => {
    if ($('.modal-layer') || !e.dataTransfer?.types?.some((x) => x === 'Files' || x === 'text/plain' || x === 'text/uri-list')) return;
    dragDepth++;
    document.body.classList.add('dragging');
  });
  on(document, 'dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) document.body.classList.remove('dragging');
  });
  on(document, 'dragover', (e) => {
    if (document.body.classList.contains('dragging')) e.preventDefault();
  });
  on(document, 'drop', (e) => {
    if (!document.body.classList.contains('dragging')) return;
    e.preventDefault();
    dragDepth = 0;
    document.body.classList.remove('dragging');
    const files = [...(e.dataTransfer.files || [])].filter((f) => f.type.startsWith('image/'));
    if (files.length) return createImageNote(files);
    const text = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
    if (text) {
      input.value = text.trim();
      autoGrow(input);
      updateCapture();
      input.focus();
    }
  });
}

function closeDrawer() {
  document.body.classList.remove('drawer-open');
}

function autoGrow(ta) {
  ta.style.height = 'auto';
  // An empty textarea's scrollHeight includes its placeholder, so only grow for real content.
  ta.style.height = ta.value ? Math.min(ta.scrollHeight, 220) + 'px' : '';
}

function toggleTheme() {
  const dark = document.documentElement.dataset.theme === 'dark';
  prefs.theme = dark ? 'light' : 'dark';
  applyTheme();
  renderThemeIcon();
}

function renderThemeIcon() {
  const b = $('#themeBtn');
  if (b) b.innerHTML = icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon');
}

function setView(view, tag = null) {
  state.view = view;
  state.tag = tag;
  state.shown = 120;
  closeDrawer();
  $('#content').scrollTop = 0;
  window.scrollTo({ top: 0 });
  render();
}

function newMenu(anchor) {
  openMenu(anchor, [
    { icon: 'note', label: t('newNote'), hint: 'N', onClick: () => openNew('note') },
    { icon: 'link', label: t('newLink'), hint: 'L', onClick: () => openNew('link') },
    { icon: 'password', label: t('newPassword'), hint: 'P', onClick: () => openNew('password') },
    { icon: 'image', label: t('newImage'), onClick: async () => {
      const files = await pickFile('image/*', true);
      if (files.length) createImageNote(files);
    } },
  ]);
}

function sortMenu(anchor) {
  const opts = [['updated', t('sort.updated')], ['created', t('sort.created')], ['title', t('sort.title')], ['type', t('sort.type')]];
  openMenu(anchor, opts.map(([key, label]) => ({
    icon: prefs.sort === key ? 'check' : null,
    label,
    onClick: () => { prefs.sort = key; render(); },
  })));
}

export function openNew(type, fields = {}) {
  const tags = state?.tag ? [state.tag] : [];
  openEditor(vault, blankItem(type, { tags, ...fields }), { isNew: true });
}

function openItem(id) {
  const item = vault.get(id);
  if (item) openEditor(vault, item);
}

// ---- quick capture --------------------------------------------------------------------------

function updateCapture() {
  const text = $('#captureInput').value;
  if (!text.trim()) captureType = null;
  const type = captureType || detect(text)?.type || 'note';
  const btn = $('#captureType');
  btn.innerHTML = `${icon(text.trim() ? type : 'zap')}<span>${esc(text.trim() ? t('type.' + type) : t('capture.smart'))}</span>`;
  btn.className = `capture-type t-${text.trim() ? type : 'smart'}`;
  $('#captureSave').disabled = !text.trim();
}

function draftFromText(text, forced) {
  const auto = detect(text);
  const type = forced || auto.type;
  if (type === auto.type) return auto;
  if (type === 'note') return { type, content: text };
  if (type === 'link') {
    const url = normalizeUrl(extractUrls(text)[0] || text.split(/\s+/)[0]);
    return { type, url, title: titleFromUrl(url) };
  }
  return { type, password: text.split('\n')[0].trim(), title: '' };
}

async function saveCapture() {
  const input = $('#captureInput');
  const text = input.value.trim();
  if (!text) return;
  const draft = draftFromText(text, captureType);
  const item = blankItem(draft.type, draft);
  item.tags = autoTags(item, t);
  if (state.tag && !item.tags.includes(state.tag)) item.tags.push(state.tag);
  input.value = '';
  captureType = null;
  autoGrow(input);
  updateCapture();
  if (item.type === 'password' && !item.title) {
    openEditor(vault, item, { isNew: true, focus: 'title' });
    return;
  }
  await vault.save(item);
  enrichLink(vault, item);
  flash(item.id);
  toast(t('savedAs', { type: t('type.' + item.type) }), {
    kind: 'success',
    action: t('edit'),
    onAction: () => openItem(item.id),
  });
}

async function createImageNote(files, text = '') {
  toast(t('processingImages'));
  const images = [];
  for (const file of files.slice(0, 10)) {
    try {
      const img = await compressImage(file);
      images.push({ id: await vault.saveBlob(img.data), thumb: img.thumb, w: img.w, h: img.h });
    } catch (err) {
      console.error(err);
      toast(t('err.image'), { kind: 'error' });
    }
  }
  if (!images.length) return;
  const item = blankItem('note', { content: text, images, tags: state.tag ? [state.tag] : [] });
  item.tags = autoTags(item, t);
  await vault.save(item);
  flash(item.id);
  toast(t('savedAs', { type: t('type.image') }), { kind: 'success', action: t('edit'), onAction: () => openItem(item.id) });
}

function flash(id) {
  requestAnimationFrame(() => setTimeout(() => $(`.card[data-id="${id}"]`)?.classList.add('flash'), 60));
}

// ---- incoming shares / shortcuts --------------------------------------------------------------

async function handleIncoming() {
  const params = new URLSearchParams(location.search);
  const newType = params.get('new');
  const shared = params.has('share') ? await takeSharedItems() : [];
  if (params.has('text') || params.has('url') || params.has('title')) {
    shared.push({ title: params.get('title') || '', text: params.get('text') || '', url: params.get('url') || '', files: [] });
  }
  if (newType || params.has('share') || shared.length) history.replaceState(null, '', location.pathname);
  if (TYPES.includes(newType)) openNew(newType);
  for (const s of shared) {
    const files = (s.files || []).filter((f) => f.type?.startsWith('image/'));
    const parts = [s.title, s.text, s.url].map((x) => (x || '').trim()).filter(Boolean);
    const unique = parts.filter((p, i) => !parts.some((q, j) => j !== i && q.length > p.length && q.includes(p)));
    const text = [...new Set(unique)].join('\n');
    if (files.length) {
      await createImageNote(files, text);
      continue;
    }
    if (!text) continue;
    const draft = detect(s.url && !s.text ? s.url : text);
    if (draft.type === 'link' && s.title && !s.url.includes(s.title)) draft.title = s.title;
    if (draft.type === 'note' && s.url && extractUrls(text).length === 1 && text.length < 300) {
      Object.assign(draft, { type: 'link', url: normalizeUrl(s.url || extractUrls(text)[0]), title: s.title || titleFromUrl(s.url), content: s.text && s.text !== s.url ? s.text.replace(s.url, '').trim() : '' });
    }
    const item = blankItem(draft.type, draft);
    item.tags = autoTags(item, t);
    await vault.save(item);
    enrichLink(vault, item);
    toast(t('sharedSaved', { type: t('type.' + item.type) }), { kind: 'success', action: t('edit'), onAction: () => openItem(item.id) });
  }
}

// ---- auto-lock ------------------------------------------------------------------------------

async function startAutoLock(signal) {
  let last = Date.now();
  let hiddenAt = 0;
  const remembered = await vault.isRemembered();
  const bump = () => { last = Date.now(); };
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart']) addEventListener(ev, bump, { signal, passive: true });
  const check = () => {
    const minutes = Number(prefs.autoLock);
    if (remembered || !minutes || !vault.unlocked) return;
    if (Date.now() - last > minutes * 60000) vault.lock();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hiddenAt = Date.now();
    else if (hiddenAt) {
      last = Math.min(last, hiddenAt);
      check();
    }
  }, { signal });
  const timer = setInterval(check, 15000);
  signal.addEventListener('abort', () => clearInterval(timer));
}

// ---- TOTP ticker ----------------------------------------------------------------------------

function startTotpTicker(signal) {
  const tick = async () => {
    for (const node of $$('[data-totp-id]')) {
      const item = vault.get(node.dataset.totpId);
      const r = item && (await totpCode(item.totp).catch(() => null));
      if (!r) continue;
      node.querySelector('.totp-code').textContent = r.code.replace(/(\d{3})(?=\d)/, '$1 ');
      node.querySelector('.totp-ring').style.setProperty('--p', r.remaining / r.period);
      node.dataset.code = r.code;
      node.classList.toggle('expiring', r.remaining <= 5);
    }
  };
  tick();
  const timer = setInterval(tick, 1000);
  signal.addEventListener('abort', () => clearInterval(timer));
}

// ---- rendering ------------------------------------------------------------------------------

function queueRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    render();
  });
}

function renderSync() {
  const s = vault.sync.state;
  const map = {
    local: ['device', t('sync.local')],
    connecting: ['sync', t('sync.connecting')],
    syncing: ['sync', t('sync.syncing')],
    synced: ['cloud-check', t('sync.synced')],
    offline: ['cloud-off', t('sync.offline')],
    error: ['alert', t('sync.error')],
  };
  const [ic, label] = map[s] || map.connecting;
  const pill = $('#syncPill');
  if (!pill) return;
  pill.className = `sync-pill s-${s}`;
  pill.innerHTML = `${icon(ic)}<span>${esc(label)}</span>`;
  pill.title = vault.isCloud ? vault.backend.user?.email || '' : t('sync.localHint');
  const dot = $('#syncDot');
  dot.className = `sync-dot only-mobile s-${s}`;
  dot.title = label;
  dot.innerHTML = icon(ic);
}

function filtered() {
  const q = parseQuery(state.query);
  const searching = !!state.query.trim();
  let items = vault.list().filter((i) => (state.view === 'trash' ? i.trashedAt : !i.trashedAt));
  if (TYPES.includes(state.view)) items = items.filter((i) => i.type === state.view);
  if (state.view === 'favorites') items = items.filter((i) => i.favorite);
  if (state.view === 'tag') items = items.filter((i) => (i.tags || []).includes(state.tag));
  if (searching) {
    return items
      .map((i) => [i, score(i, q)])
      .filter(([, s]) => s > 0)
      .sort((a, b) => b[1] - a[1] || b[0].updatedAt - a[0].updatedAt)
      .map(([i]) => i);
  }
  const collator = new Intl.Collator(lang(), { sensitivity: 'base', numeric: true });
  const sorters = {
    updated: (a, b) => b.updatedAt - a.updatedAt,
    created: (a, b) => b.createdAt - a.createdAt,
    title: (a, b) => collator.compare(displayTitle(a), displayTitle(b)),
    type: (a, b) => TYPES.indexOf(a.type) - TYPES.indexOf(b.type) || b.updatedAt - a.updatedAt,
  };
  if (state.view === 'trash') return items.sort((a, b) => b.trashedAt - a.trashedAt);
  return items.sort(sorters[prefs.sort] || sorters.updated);
}

function render() {
  if (!vault?.unlocked || !$('#content')) return;
  renderThemeIcon();
  renderNav();
  $('#layoutBtn').innerHTML = icon(prefs.layout === 'grid' ? 'list' : 'grid');
  $('#layoutBtn').title = prefs.layout === 'grid' ? t('layout.list') : t('layout.grid');
  const title = state.view === 'tag' ? '#' + state.tag : t('view.' + state.view);
  $('#viewTitle').textContent = title;
  document.title = `${title} · ${t('appName')}`;
  const isSecurity = state.view === 'security';
  $('#capture').hidden = isSecurity || state.view === 'trash';
  $('#searchBox').classList.toggle('disabled', isSecurity);
  $('.topbar-tools').hidden = isSecurity || state.view === 'trash';
  const content = $('#content');
  if (isSecurity) {
    renderSecurity(content, vault, { open: openItem });
    return;
  }
  if (!vault.ready) {
    content.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>${esc(t('loadingItems'))}</p></div>`;
    return;
  }
  const items = filtered();
  const searching = !!state.query.trim();
  let html = '';
  if (state.view === 'trash' && items.length) {
    html += `<div class="banner">${icon('info')}<span>${esc(t('trashNote'))}</span><button class="btn btn-ghost btn-sm" data-action="empty-trash">${icon('trash')}${esc(t('emptyTrash'))}</button></div>`;
  }
  if (searching) html += `<div class="result-count">${esc(t('results', { n: items.length }))}</div>`;
  if (!items.length) {
    content.innerHTML = html + emptyState(searching);
    return;
  }
  const visible = items.slice(0, state.shown);
  const pinned = searching || state.view === 'trash' ? [] : visible.filter((i) => i.pinned);
  const others = pinned.length ? visible.filter((i) => !i.pinned) : visible;
  const layout = prefs.layout;
  if (pinned.length) html += `<h2 class="section-label">${icon('pin')}${esc(t('pinned'))}</h2><div class="cards ${layout}" data-group="pinned"></div>`;
  if (pinned.length && others.length) html += `<h2 class="section-label">${esc(t('others'))}</h2>`;
  if (others.length) html += `<div class="cards ${layout}" data-group="others"></div>`;
  if (items.length > state.shown) html += `<div class="more-wrap"><button class="btn btn-ghost" data-action="show-more">${esc(t('showMore', { n: items.length - state.shown }))}</button></div>`;
  content.innerHTML = html;
  if (pinned.length) layoutCards(content.querySelector('[data-group="pinned"]'), pinned);
  if (others.length) layoutCards(content.querySelector('[data-group="others"]'), others);
}

function columnCount() {
  const w = $('#content')?.clientWidth || innerWidth;
  if (prefs.layout === 'list') return 1;
  return Math.max(1, Math.min(5, Math.floor((w + 16) / 276)));
}

// Masonry: each card goes into the currently shortest column, keeping reading order row-first.
function layoutCards(container, items) {
  const n = columnCount();
  state.columns = n;
  const cols = Array.from({ length: n }, () => el('<div class="col"></div>'));
  container.append(...cols);
  const heights = new Array(n).fill(0);
  for (const item of items) {
    const card = el(cardHtml(item));
    let target = 0;
    for (let i = 1; i < n; i++) if (heights[i] < heights[target] - 4) target = i;
    cols[target].append(card);
    heights[target] += n > 1 ? card.offsetHeight + 14 : 0;
    const md = card.querySelector('.card-md');
    if (md && md.scrollHeight > md.clientHeight + 2) md.classList.add('clamped');
  }
}

function renderNav() {
  const live = vault.list().filter((i) => !i.trashedAt);
  const counts = {
    all: live.length,
    note: live.filter((i) => i.type === 'note').length,
    link: live.filter((i) => i.type === 'link').length,
    password: live.filter((i) => i.type === 'password').length,
    favorites: live.filter((i) => i.favorite).length,
    trash: vault.list().length - live.length,
    security: '',
  };
  for (const node of $$('[data-count]')) node.textContent = counts[node.dataset.count] || '';
  for (const node of $$('[data-view]')) node.classList.toggle('active', node.dataset.view === state.view && state.view !== 'tag');
  const tagCounts = new Map();
  for (const i of live) for (const tag of i.tags || []) tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
  const tags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  $('#tagNav').innerHTML = tags.length
    ? tags.map(([tag, n]) => `<button class="nav-item ${state.view === 'tag' && state.tag === tag ? 'active' : ''}" data-tag="${esc(tag)}">${icon('hash')}<span class="nav-label">${esc(tag)}</span><span class="nav-count">${n}</span></button>`).join('')
    : `<p class="nav-empty">${esc(t('noTagsYet'))}</p>`;
}

function emptyState(searching) {
  if (searching) {
    return `<div class="empty">${icon('search', 'empty-icon')}<h3>${esc(t('empty.search'))}</h3><p>${esc(t('empty.searchHint'))}</p></div>`;
  }
  const v = state.view;
  const key = ['trash', 'favorites', 'note', 'link', 'password', 'tag'].includes(v) ? v : 'all';
  const ic = { trash: 'trash', favorites: 'star', note: 'note', link: 'link', password: 'password', tag: 'hash', all: 'sparkles' }[key];
  const cta = TYPES.includes(v) ? `<button class="btn btn-primary" data-action="new" data-type="${v}">${icon('plus')}${esc(t('new' + v[0].toUpperCase() + v.slice(1)))}</button>` : '';
  const tips = key === 'all'
    ? `<ul class="empty-tips">
        <li>${icon('zap')}<span>${esc(t('tip.capture'))}</span></li>
        <li>${icon('device')}<span>${esc(t('tip.share'))}</span></li>
        <li>${icon('lock')}<span>${esc(t('tip.encrypted'))}</span></li>
      </ul>`
    : '';
  return `<div class="empty">${icon(ic, 'empty-icon')}<h3>${esc(t('empty.' + key))}</h3><p>${esc(t('empty.' + key + 'Hint'))}</p>${cta}${tips}</div>`;
}

// ---- cards ----------------------------------------------------------------------------------

export function displayTitle(item) {
  if (item.title) return item.title;
  if (item.type === 'link') return titleFromUrl(item.url) || item.url;
  if (item.type === 'password') return siteInfo(item.url).name || item.username || t('untitled');
  return '';
}

function letterAvatar(letter) {
  return `<span class="avatar-letter">${esc((letter || '?').toUpperCase())}</span>`;
}

export function siteIcon(url, fallbackText, size = 'md') {
  const host = hostOf(url);
  const letter = (fallbackText || host || '?').trim().charAt(0);
  if (host && prefs.previews) {
    return `<span class="site-icon ${size}"><img class="favicon" loading="lazy" referrerpolicy="no-referrer" alt="" data-letter="${esc(letter)}" src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64"></span>`;
  }
  return `<span class="site-icon ${size}">${letterAvatar(letter)}</span>`;
}

function tagsHtml(item) {
  const tags = item.tags || [];
  if (!tags.length) return '';
  const shown = tags.slice(0, 3).map((tg) => `<span class="tag">#${esc(tg)}</span>`).join('');
  return `<div class="card-tags">${shown}${tags.length > 3 ? `<span class="tag tag-more">+${tags.length - 3}</span>` : ''}</div>`;
}

function cardHtml(item) {
  const title = displayTitle(item);
  const trashed = !!item.trashedAt;
  let lead;
  let sub = '';
  let body = '';
  let quick = '';

  if (item.type === 'note') {
    lead = `<span class="type-badge t-note">${icon('note')}</span>`;
    sub = relTime(item.updatedAt);
    const imgs = item.images || [];
    if (imgs.length) {
      body += `<div class="card-image"><img src="${imgs[0].thumb}" alt="" loading="lazy">${imgs.length > 1 ? `<span class="img-count">${icon('image')}${imgs.length}</span>` : ''}</div>`;
    }
    if (item.content) {
      const progress = checklistProgress(item.content);
      body += `<div class="card-md md">${renderMarkdown(item.content.slice(0, 1600), { interactive: !trashed })}</div>`;
      if (progress) body += `<div class="progress" title="${progress.done}/${progress.total}"><span style="width:${(progress.done / progress.total) * 100}%"></span><em>${progress.done}/${progress.total}</em></div>`;
    }
    quick = item.content ? `<button class="icon-btn sm" data-action="copy-content" title="${esc(t('copy'))}">${icon('copy')}</button>` : '';
  } else if (item.type === 'link') {
    lead = siteIcon(item.url, title);
    sub = hostOf(item.url) || item.url;
    const yt = prefs.previews && youtubeId(item.url);
    if (yt) body += `<div class="card-image video"><img class="yt-thumb" src="https://i.ytimg.com/vi/${encodeURIComponent(yt)}/mqdefault.jpg" alt="" loading="lazy" referrerpolicy="no-referrer"><span class="play"></span></div>`;
    if (item.content) body += `<div class="card-md md small">${renderMarkdown(item.content.slice(0, 600))}</div>`;
    quick = `<button class="icon-btn sm" data-action="copy-url" title="${esc(t('copyLink'))}">${icon('copy')}</button>`
      + (isSafeUrl(item.url) ? `<a class="icon-btn sm" href="${esc(normalizeUrl(item.url))}" target="_blank" rel="noopener noreferrer" data-action="open" title="${esc(t('openLink'))}">${icon('external')}</a>` : '');
  } else {
    lead = siteIcon(item.url, title);
    sub = hostOf(item.url);
    body += `<div class="secret-rows">`;
    if (item.username) body += `<div class="secret-row">${icon('user')}<span class="secret-val">${esc(item.username)}</span><button class="icon-btn sm" data-action="copy-user" title="${esc(t('copyUsername'))}">${icon('copy')}</button></div>`;
    if (item.password) body += `<div class="secret-row">${icon('key')}<span class="secret-val mono dots" data-secret>••••••••••</span><button class="icon-btn sm" data-action="reveal" title="${esc(t('reveal'))}">${icon('eye')}</button><button class="icon-btn sm" data-action="copy-pass" title="${esc(t('copyPassword'))}">${icon('copy')}</button></div>`;
    if (item.totp) body += `<div class="secret-row totp" data-totp-id="${item.id}"><span class="totp-ring"></span><span class="secret-val mono totp-code">••• •••</span><button class="icon-btn sm" data-action="copy-totp" title="${esc(t('copyCode'))}">${icon('copy')}</button></div>`;
    body += `</div>`;
    if (isSafeUrl(item.url)) quick = `<a class="icon-btn sm" href="${esc(normalizeUrl(item.url))}" target="_blank" rel="noopener noreferrer" data-action="open" title="${esc(t('openLink'))}">${icon('external')}</a>`;
  }

  const actions = trashed
    ? `<button class="btn btn-ghost btn-sm" data-action="restore">${icon('restore')}${esc(t('restore'))}</button><button class="icon-btn sm danger" data-action="destroy" title="${esc(t('deleteForever'))}">${icon('trash')}</button>`
    : `${quick}<button class="icon-btn sm fav ${item.favorite ? 'on' : ''}" data-action="favorite" title="${esc(t('favorite'))}" aria-pressed="${item.favorite}">${icon('star')}</button><button class="icon-btn sm" data-action="more" title="${esc(t('more'))}">${icon('more')}</button>`;

  return `<article class="card card-${item.type} ${item.color ? 'c-' + item.color : ''} ${item.pinned ? 'is-pinned' : ''}" data-id="${item.id}" tabindex="0">
    <div class="card-head">
      ${lead}
      <div class="card-titles">
        ${title ? `<h3 class="card-title">${esc(title)}</h3>` : ''}
        ${sub ? `<div class="card-sub">${esc(sub)}</div>` : ''}
      </div>
      ${item.pinned && !trashed ? `<span class="pin-mark" title="${esc(t('pinned'))}">${icon('pin')}</span>` : ''}
    </div>
    ${body}
    ${tagsHtml(item)}
    <div class="card-actions">${actions}</div>
  </article>`;
}

async function onContentClick(e) {
  const actionEl = e.target.closest('[data-action]');
  const card = e.target.closest('.card');
  const item = card && vault.get(card.dataset.id);
  if (e.target.matches('input[type="checkbox"][data-line]')) return;
  if (e.target.closest('.card-md a')) return;
  if (!actionEl) {
    if (card) openItem(card.dataset.id);
    return;
  }
  const action = actionEl.dataset.action;
  if (action === 'open') return;
  e.preventDefault();
  e.stopPropagation();
  switch (action) {
    case 'more':
      return itemMenu(actionEl, item);
    case 'favorite':
      return vault.save({ ...item, favorite: !item.favorite }, { touch: false });
    case 'copy-content':
      return copyText(item.content, { label: t('type.note') });
    case 'copy-url':
      return copyText(normalizeUrl(item.url), { label: t('link') });
    case 'copy-user':
      return copyText(item.username, { label: t('username') });
    case 'copy-pass':
      return copyText(item.password, { secret: true, label: t('password') });
    case 'copy-totp': {
      const code = actionEl.closest('[data-totp-id]')?.dataset.code;
      if (code) copyText(code, { label: t('code') });
      return;
    }
    case 'reveal': {
      const span = card.querySelector('[data-secret]');
      const shown = span.classList.toggle('revealed');
      span.textContent = shown ? item.password : '••••••••••';
      span.classList.toggle('dots', !shown);
      actionEl.innerHTML = icon(shown ? 'eye-off' : 'eye');
      return;
    }
    case 'restore':
      await vault.restore(item.id);
      return toast(t('restored'), { kind: 'success' });
    case 'destroy':
      if (await confirmDialog({ title: t('deleteForever'), message: t('confirmDestroy'), confirm: t('delete'), danger: true })) vault.destroy(item.id);
      return;
    case 'empty-trash':
      if (await confirmDialog({ title: t('emptyTrash'), message: t('confirmEmptyTrash'), confirm: t('emptyTrash'), danger: true })) vault.emptyTrash();
      return;
    case 'show-more':
      state.shown += 200;
      return render();
    case 'new':
      return openNew(actionEl.dataset.type);
  }
}

function onContentChange(e) {
  const box = e.target;
  if (!box.matches('input[type="checkbox"][data-line]')) return;
  const card = box.closest('.card');
  const item = vault.get(card.dataset.id);
  if (!item) return;
  vault.save({ ...item, content: toggleCheck(item.content, Number(box.dataset.line)) });
}

export function itemMenu(anchor, item, { onDone } = {}) {
  openMenu(anchor, [
    { icon: 'pin', label: item.pinned ? t('unpin') : t('pin'), onClick: () => vault.save({ ...item, pinned: !item.pinned }, { touch: false }) },
    { icon: 'star', label: item.favorite ? t('unfavorite') : t('favorite'), onClick: () => vault.save({ ...item, favorite: !item.favorite }, { touch: false }) },
    { colors: COLORS, value: item.color, onPick: (c) => vault.save({ ...item, color: c }, { touch: false }) },
    { icon: 'copy', label: t('duplicate'), onClick: () => {
      // Attachments are not shared between copies, so deleting one never breaks the other.
      const { id, createdAt, updatedAt, history, images, ...rest } = item;
      vault.save(blankItem(item.type, { ...rest, pinned: false, title: item.title ? `${item.title} (${t('copySuffix')})` : '' }));
      toast(t('duplicated'), { kind: 'success' });
    } },
    { divider: true },
    { icon: 'trash', label: t('moveToTrash'), danger: true, onClick: () => trashWithUndo(item.id, onDone) },
  ]);
}

// Replaces an automatic video-link title with the real one, if it can be looked up.
export async function enrichLink(v, item) {
  if (item.type !== 'link' || !prefs.previews || item.title !== titleFromUrl(item.url)) return;
  const title = await fetchVideoTitle(item.url);
  const current = v.get(item.id);
  if (title && current && current.title === item.title) v.save({ ...current, title }, { touch: false });
}

export async function trashWithUndo(id, onDone) {
  await vault.trash(id);
  onDone?.();
  toast(t('movedToTrash'), { action: t('undo'), onAction: () => vault.restore(id) });
}

