// Anchored popover menu used for "new", "more" and sort actions.
import { icon } from '../icons.js';
import { esc, el } from '../util.js';
import { t } from '../i18n.js';

let current;

export function closeMenu() {
  current?.();
  current = null;
}

export function openMenu(anchor, entries) {
  closeMenu();
  const menu = el(`<div class="menu" role="menu"></div>`);
  entries.forEach((entry, i) => {
    if (entry.divider) {
      menu.append(el('<div class="menu-divider"></div>'));
    } else if (entry.colors) {
      const row = el(`<div class="menu-colors" role="group" aria-label="${esc(t('color'))}"></div>`);
      for (const c of entry.colors) {
        const sw = el(`<button class="swatch ${c ? 'c-' + c : 'c-none'} ${entry.value === c ? 'on' : ''}" title="${esc(t('colors.' + (c || 'none')))}" aria-label="${esc(t('colors.' + (c || 'none')))}"></button>`);
        sw.addEventListener('click', () => {
          closeMenu();
          entry.onPick(c);
        });
        row.append(sw);
      }
      menu.append(row);
    } else {
      const b = el(`<button class="menu-item ${entry.danger ? 'danger' : ''}" role="menuitem" data-i="${i}">
        <span class="menu-icon">${entry.icon ? icon(entry.icon) : ''}</span>
        <span class="menu-label">${esc(entry.label)}</span>
        ${entry.hint ? `<kbd>${esc(entry.hint)}</kbd>` : ''}
      </button>`);
      b.addEventListener('click', () => {
        closeMenu();
        entry.onClick?.();
      });
      menu.append(b);
    }
  });
  document.body.append(menu);

  const r = anchor.getBoundingClientRect();
  const mw = menu.offsetWidth;
  const mh = menu.offsetHeight;
  const rtl = document.documentElement.dir === 'rtl';
  let left = rtl ? r.left : r.right - mw;
  left = Math.max(8, Math.min(left, innerWidth - mw - 8));
  let top = r.bottom + 6;
  if (top + mh > innerHeight - 8) top = Math.max(8, r.top - mh - 6);
  menu.style.left = left + 'px';
  menu.style.top = top + 'px';
  requestAnimationFrame(() => menu.classList.add('open'));
  menu.querySelector('button')?.focus({ preventScroll: true });

  const onDown = (e) => {
    if (!menu.contains(e.target) && !anchor.contains(e.target)) closeMenu();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeMenu();
      anchor.focus?.();
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const items = [...menu.querySelectorAll('button')];
      const idx = items.indexOf(document.activeElement);
      items[(idx + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    }
  };
  const onScroll = (e) => {
    if (!menu.contains(e.target)) closeMenu();
  };
  setTimeout(() => document.addEventListener('pointerdown', onDown, true));
  document.addEventListener('keydown', onKey, true);
  addEventListener('resize', closeMenu);
  document.addEventListener('scroll', onScroll, true);
  current = () => {
    document.removeEventListener('pointerdown', onDown, true);
    document.removeEventListener('keydown', onKey, true);
    removeEventListener('resize', closeMenu);
    document.removeEventListener('scroll', onScroll, true);
    menu.remove();
  };
}
