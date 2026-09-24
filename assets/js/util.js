// Small DOM helpers shared across the UI.
import { t, lang } from './i18n.js';
import { icon } from './icons.js';
import { prefs } from './prefs.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
}

export function el(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
}

export function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export function locale() {
  return lang() === 'ar' ? 'ar-EG' : 'en-GB';
}

export function relTime(ts) {
  if (!ts) return '';
  const diff = (ts - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < 45) return t('time.now');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 7) return rtf.format(Math.round(diff / 86400), 'day');
  return new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', year: abs > 86400 * 300 ? 'numeric' : undefined }).format(ts);
}

export function fullDate(ts) {
  return ts ? new Intl.DateTimeFormat(locale(), { dateStyle: 'medium', timeStyle: 'short' }).format(ts) : '';
}

// ---- toasts ---------------------------------------------------------------------------------

export function toast(message, { action, onAction, kind = 'info', duration = 3200 } = {}) {
  const host = $('#toasts');
  const node = el(`<div class="toast toast-${kind}" role="status">
    <span class="toast-icon">${icon(kind === 'error' ? 'alert' : kind === 'success' ? 'check' : 'info')}</span>
    <span class="toast-msg">${esc(message)}</span>
    ${action ? `<button class="toast-action">${esc(action)}</button>` : ''}
  </div>`);
  const close = () => {
    node.classList.add('leaving');
    setTimeout(() => node.remove(), 200);
  };
  node.querySelector('.toast-action')?.addEventListener('click', () => {
    onAction?.();
    close();
  });
  host.append(node);
  while (host.children.length > 3) host.firstElementChild.remove();
  setTimeout(close, action ? Math.max(duration, 5500) : duration);
}

// ---- dialogs --------------------------------------------------------------------------------

const openModals = new Set();

// Closes every dialog through its normal path (so an open editor still saves its changes).
export function closeAllModals() {
  for (const close of [...openModals].reverse()) close();
}

export function openModal({ title, body, className = '', onClose, wide = false, focus = true }) {
  const layer = el(`<div class="modal-layer">
    <div class="modal-backdrop"></div>
    <div class="modal ${wide ? 'modal-wide' : ''} ${className}" role="dialog" aria-modal="true" aria-label="${esc(title || '')}">
      ${title ? `<header class="modal-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="${esc(t('close'))}">${icon('x')}</button></header>` : ''}
      <div class="modal-body"></div>
    </div>
  </div>`);
  const bodyEl = layer.querySelector('.modal-body');
  if (typeof body === 'string') bodyEl.innerHTML = body;
  else if (body) bodyEl.append(body);
  const prevFocus = document.activeElement;
  let closed = false;
  const close = (result) => {
    if (closed) return;
    closed = true;
    openModals.delete(close);
    layer.classList.add('leaving');
    document.removeEventListener('keydown', onKey, true);
    setTimeout(() => layer.remove(), 180);
    prevFocus?.focus?.({ preventScroll: true });
    onClose?.(result);
  };
  const onKey = (e) => {
    if (e.key === 'Escape' && layer === $$('.modal-layer').pop()) {
      e.stopPropagation();
      close();
    }
  };
  openModals.add(close);
  document.addEventListener('keydown', onKey, true);
  layer.querySelector('.modal-backdrop').addEventListener('click', () => close());
  layer.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => close()));
  document.body.append(layer);
  requestAnimationFrame(() => {
    layer.classList.add('open');
    if (!focus) return;
    const focusable = layer.querySelector('[autofocus], input, textarea, select, button:not([data-close])');
    focusable?.focus({ preventScroll: true });
  });
  return { layer, body: bodyEl, close };
}

export function confirmDialog({ title, message, confirm = t('ok'), danger = false }) {
  return new Promise((resolve) => {
    const m = openModal({
      title,
      body: `<p class="dialog-text">${esc(message)}</p>
        <div class="dialog-actions">
          <button class="btn btn-ghost" data-act="no">${esc(t('cancel'))}</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="yes" autofocus>${esc(confirm)}</button>
        </div>`,
      onClose: (r) => resolve(!!r),
    });
    m.body.querySelector('[data-act="no"]').onclick = () => m.close(false);
    m.body.querySelector('[data-act="yes"]').onclick = () => m.close(true);
  });
}

export function passwordDialog({ title, message, confirm = t('ok') }) {
  return new Promise((resolve) => {
    const m = openModal({
      title,
      body: `<form class="stack">
          ${message ? `<p class="dialog-text">${esc(message)}</p>` : ''}
          <div class="field"><input type="password" class="input" name="pw" autocomplete="current-password" autofocus required></div>
          <div class="dialog-actions">
            <button type="button" class="btn btn-ghost" data-act="no">${esc(t('cancel'))}</button>
            <button class="btn btn-primary">${esc(confirm)}</button>
          </div>
        </form>`,
      onClose: (r) => resolve(r || null),
    });
    m.body.querySelector('[data-act="no"]').onclick = () => m.close(null);
    m.body.querySelector('form').onsubmit = (e) => {
      e.preventDefault();
      m.close(m.body.querySelector('input').value);
    };
  });
}

// ---- clipboard ------------------------------------------------------------------------------

let clearTimer;
export async function copyText(text, { secret = false, label } = {}) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = el('<textarea style="position:fixed;opacity:0"></textarea>');
    ta.value = text;
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  const seconds = Number(prefs.clipClear) || 0;
  if (secret && seconds > 0) {
    clearTimeout(clearTimer);
    clearTimer = setTimeout(() => navigator.clipboard.writeText('').catch(() => {}), seconds * 1000);
    toast(t('copiedSecret', { what: label || t('copied'), s: seconds }), { kind: 'success' });
  } else {
    toast(label ? t('copiedWhat', { what: label }) : t('copied'), { kind: 'success', duration: 1800 });
  }
}

// ---- files ----------------------------------------------------------------------------------

export function downloadFile(name, content, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = el(`<a download="${esc(name)}" href="${url}"></a>`);
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function pickFile(accept, multiple = false) {
  return new Promise((resolve) => {
    const input = el(`<input type="file" accept="${esc(accept)}" ${multiple ? 'multiple' : ''} hidden>`);
    input.onchange = () => {
      resolve([...input.files]);
      input.remove();
    };
    document.body.append(input);
    input.click();
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// Shrinks a photo so it fits comfortably in the database, and makes a small thumbnail.
export async function compressImage(file) {
  const img = await loadImage(await fileToDataUrl(file));
  const draw = (max, quality) => {
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return { data: canvas.toDataURL('image/jpeg', quality), w, h };
  };
  let full = draw(1600, 0.82);
  for (const [max, q] of [[1400, 0.75], [1200, 0.7], [1000, 0.65], [800, 0.6]]) {
    if (full.data.length <= 650000) break;
    full = draw(max, q);
  }
  const thumb = draw(360, 0.7);
  return { data: full.data, thumb: thumb.data, w: full.w, h: full.h };
}

export function isTouch() {
  return matchMedia('(hover: none)').matches;
}
