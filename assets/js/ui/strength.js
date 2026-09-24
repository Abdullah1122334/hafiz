import { t } from '../i18n.js';
import { esc } from '../util.js';
import { strength } from '../password.js';

export function strengthHtml(pw) {
  if (!pw) return '';
  const { score } = strength(pw);
  return `<div class="strength s${score}" title="${esc(t('strength.label'))}">
    <div class="strength-bar">${[0, 1, 2, 3].map((i) => `<span class="${i < Math.max(score, 1) ? 'on' : ''}"></span>`).join('')}</div>
    <span class="strength-text">${esc(t('strength.' + score))}</span>
  </div>`;
}
