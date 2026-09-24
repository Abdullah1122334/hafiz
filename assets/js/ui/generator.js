// Password generator panel.
import { t } from '../i18n.js';
import { icon } from '../icons.js';
import { esc } from '../util.js';
import { generatePassword } from '../password.js';
import { strengthHtml } from './strength.js';

const KEY = 'hafiz.generator';

function loadOpts() {
  try {
    return { length: 20, lower: true, upper: true, digits: true, symbols: true, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { length: 20, lower: true, upper: true, digits: true, symbols: true };
  }
}

export function generatorHtml({ useLabel } = {}) {
  const o = loadOpts();
  const toggle = (name, label) => `<label class="check"><input type="checkbox" data-opt="${name}" ${o[name] ? 'checked' : ''}><span>${esc(label)}</span></label>`;
  return `<div class="generator">
    <div class="gen-output">
      <output class="mono gen-value" data-gen-value></output>
      <button type="button" class="icon-btn" data-gen="regen" title="${esc(t('regenerate'))}" aria-label="${esc(t('regenerate'))}">${icon('sync')}</button>
      <button type="button" class="icon-btn" data-gen="copy" title="${esc(t('copy'))}" aria-label="${esc(t('copy'))}">${icon('copy')}</button>
    </div>
    <div data-gen-strength></div>
    <div class="gen-row">
      <label class="gen-len"><span>${esc(t('gen.length'))}</span><output data-gen-len>${o.length}</output></label>
      <input type="range" min="8" max="64" value="${o.length}" data-opt="length">
    </div>
    <div class="gen-opts">
      ${toggle('upper', 'A-Z')}${toggle('lower', 'a-z')}${toggle('digits', '0-9')}${toggle('symbols', '!@#$')}
    </div>
    ${useLabel ? `<button type="button" class="btn btn-primary btn-block" data-gen="use">${icon('check')}${esc(useLabel)}</button>` : ''}
  </div>`;
}

export function bindGenerator(root, { onUse, onCopy } = {}) {
  const out = root.querySelector('[data-gen-value]');
  const regen = () => {
    const o = loadOpts();
    for (const input of root.querySelectorAll('[data-opt]')) {
      o[input.dataset.opt] = input.type === 'checkbox' ? input.checked : Number(input.value);
    }
    if (!o.lower && !o.upper && !o.digits && !o.symbols) {
      o.lower = true;
      root.querySelector('[data-opt="lower"]').checked = true;
    }
    localStorage.setItem(KEY, JSON.stringify(o));
    root.querySelector('[data-gen-len]').textContent = o.length;
    out.textContent = generatePassword(o);
    root.querySelector('[data-gen-strength]').innerHTML = strengthHtml(out.textContent);
  };
  root.querySelectorAll('[data-opt]').forEach((i) => i.addEventListener('input', regen));
  root.querySelector('[data-gen="regen"]').addEventListener('click', regen);
  root.querySelector('[data-gen="copy"]').addEventListener('click', () => onCopy?.(out.textContent));
  root.querySelector('[data-gen="use"]')?.addEventListener('click', () => onUse?.(out.textContent));
  regen();
  return { value: () => out.textContent, regen };
}
