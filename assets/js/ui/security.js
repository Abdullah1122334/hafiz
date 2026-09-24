// "Security check": finds weak, reused and old passwords and scores the vault.
import { t } from '../i18n.js';
import { icon } from '../icons.js';
import { esc, copyText } from '../util.js';
import { strength } from '../password.js';
import { generatorHtml, bindGenerator } from './generator.js';
import { siteIcon, displayTitle } from './app.js';

const YEAR = 365 * 24 * 3600 * 1000;

export function analyze(items) {
  const pw = items.filter((i) => i.type === 'password' && !i.trashedAt && i.password);
  const weak = pw.filter((i) => strength(i.password).score <= 1);
  const byPw = new Map();
  for (const i of pw) byPw.set(i.password, [...(byPw.get(i.password) || []), i]);
  const reusedGroups = [...byPw.values()].filter((g) => g.length > 1);
  const reused = reusedGroups.flat();
  const old = pw.filter((i) => (i.passwordChangedAt || i.createdAt) < Date.now() - YEAR);
  const with2fa = items.filter((i) => i.type === 'password' && !i.trashedAt && i.totp);
  const bad = new Set([...weak, ...reused]);
  let score = 100;
  if (pw.length) {
    score = Math.round(100 * (1 - (bad.size + old.filter((i) => !bad.has(i)).length * 0.3) / pw.length));
    score = Math.max(0, Math.min(100, score));
  }
  return { pw, weak, reused, reusedGroups, old, with2fa, score };
}

function row(item, reason, kind) {
  return `<button class="sec-row" data-open="${item.id}">
    ${siteIcon(item.url, displayTitle(item))}
    <span class="sec-row-text"><strong>${esc(displayTitle(item))}</strong><span class="muted small">${esc(item.username || '')}</span></span>
    <span class="badge ${kind}">${esc(reason)}</span>
  </button>`;
}

export function renderSecurity(container, vault, { open }) {
  const a = analyze(vault.list());
  const level = a.score >= 85 ? 'good' : a.score >= 60 ? 'fair' : 'poor';
  const tile = (ic, n, label, kind = '') => `<div class="stat ${kind}">${icon(ic)}<strong>${n}</strong><span>${esc(label)}</span></div>`;
  const section = (title, rows, empty) => `<section class="sec-section"><h3>${esc(title)}</h3>${rows || `<p class="muted sec-ok">${icon('check')}${esc(empty)}</p>`}</section>`;

  container.innerHTML = `<div class="security">
    <section class="sec-hero ${level}">
      <div class="score-ring" style="--p:${a.score / 100}"><strong>${a.pw.length ? a.score : '—'}</strong></div>
      <div class="sec-hero-text">
        <h2>${esc(a.pw.length ? t('sec.level.' + level) : t('sec.noPasswords'))}</h2>
        <p>${esc(a.pw.length ? t('sec.summary', { n: a.pw.length, bad: new Set([...a.weak, ...a.reused]).size }) : t('sec.noPasswordsHint'))}</p>
      </div>
    </section>
    <div class="stat-grid">
      ${tile('password', a.pw.length, t('sec.total'))}
      ${tile('alert', a.weak.length, t('sec.weak'), a.weak.length ? 'bad' : 'ok')}
      ${tile('copy', a.reused.length, t('sec.reused'), a.reused.length ? 'bad' : 'ok')}
      ${tile('clock', a.old.length, t('sec.old'), a.old.length ? 'warn' : 'ok')}
      ${tile('shield', a.with2fa.length, t('sec.with2fa'), 'ok')}
    </div>
    <div class="sec-columns">
      <div>
        ${section(t('sec.weakTitle'), a.weak.map((i) => row(i, t('strength.' + strength(i.password).score), 'bad')).join(''), t('sec.noWeak'))}
        ${section(t('sec.reusedTitle'), a.reusedGroups.map((g) => g.map((i) => row(i, t('sec.usedTimes', { n: g.length }), 'bad')).join('')).join('<hr class="sec-sep">'), t('sec.noReused'))}
        ${section(t('sec.oldTitle'), a.old.map((i) => row(i, t('sec.olderThanYear'), 'warn')).join(''), t('sec.noOld'))}
      </div>
      <div>
        <section class="sec-section">
          <h3>${esc(t('gen.title'))}</h3>
          <div class="gen-host">${generatorHtml()}</div>
        </section>
        <section class="sec-section sec-info">
          <h3>${icon('lock')}${esc(t('sec.howTitle'))}</h3>
          <ul>
            <li>${esc(t('sec.how1'))}</li>
            <li>${esc(t('sec.how2'))}</li>
            <li>${esc(t('sec.how3'))}</li>
          </ul>
        </section>
      </div>
    </div>
  </div>`;

  bindGenerator(container.querySelector('.gen-host'), { onCopy: (v) => copyText(v, { secret: true, label: t('password') }) });
  container.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => open(b.dataset.open)));
}
