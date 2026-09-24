// Lets the user paste their Firebase web config inside the app (alternative to editing
// firebase-config.js). The config is public information, not a secret.
import { t } from '../i18n.js';
import { icon } from '../icons.js';
import { esc, openModal, toast, confirmDialog } from '../util.js';

export function parseFirebaseConfig(text) {
  const src = String(text || '').trim();
  let cfg = null;
  try {
    cfg = JSON.parse(src);
  } catch {
    cfg = {};
    for (const m of src.matchAll(/["']?(\w+)["']?\s*:\s*["']([^"']+)["']/g)) cfg[m[1]] = m[2];
  }
  const required = ['apiKey', 'authDomain', 'projectId', 'appId'];
  if (!cfg || !required.every((k) => typeof cfg[k] === 'string' && cfg[k].length > 3)) return null;
  const out = {};
  for (const k of [...required, 'storageBucket', 'messagingSenderId', 'databaseId']) if (cfg[k]) out[k] = cfg[k];
  return out;
}

export function savedConfig() {
  try {
    return JSON.parse(localStorage.getItem('hafiz.firebase') || 'null');
  } catch {
    return null;
  }
}

export function openSyncSetup({ source } = {}) {
  const fromFile = source === 'file';
  const current = savedConfig();
  const m = openModal({
    title: t('syncSetup.title'),
    wide: true,
    body: `<div class="stack">
      <p class="dialog-text">${esc(t('syncSetup.intro'))}</p>
      <ol class="steps">
        <li>${esc(t('syncSetup.s1'))} <a href="https://console.firebase.google.com/" target="_blank" rel="noopener">console.firebase.google.com</a></li>
        <li>${esc(t('syncSetup.s2'))}</li>
        <li>${esc(t('syncSetup.s3'))}</li>
        <li>${esc(t('syncSetup.s4'))}</li>
        <li>${esc(t('syncSetup.s5'))}</li>
      </ol>
      ${fromFile ? `<div class="banner">${icon('info')}<span>${esc(t('syncSetup.fromFile'))}</span></div>` : `
      <label class="label" for="fbcfg">${esc(t('syncSetup.paste'))}</label>
      <textarea id="fbcfg" class="textarea mono" dir="ltr" rows="9" spellcheck="false" placeholder='const firebaseConfig = {
  apiKey: "…",
  authDomain: "…",
  projectId: "…",
  appId: "…"
};'>${current ? esc(JSON.stringify(current, null, 2)) : ''}</textarea>
      <p class="muted small">${esc(t('syncSetup.note'))}</p>
      <div class="dialog-actions">
        ${current ? `<button class="btn btn-ghost danger-text" data-act="remove">${icon('trash')}${esc(t('syncSetup.remove'))}</button>` : ''}
        <div class="spacer"></div>
        <button class="btn btn-ghost" data-close>${esc(t('cancel'))}</button>
        <button class="btn btn-primary" data-act="save">${icon('cloud')}${esc(t('syncSetup.save'))}</button>
      </div>`}
    </div>`,
  });
  m.body.querySelector('[data-act="save"]')?.addEventListener('click', () => {
    const cfg = parseFirebaseConfig(m.body.querySelector('#fbcfg').value);
    if (!cfg) {
      toast(t('syncSetup.invalid'), { kind: 'error' });
      return;
    }
    localStorage.setItem('hafiz.firebase', JSON.stringify(cfg));
    toast(t('syncSetup.saved'), { kind: 'success' });
    setTimeout(() => location.reload(), 600);
  });
  m.body.querySelector('[data-act="remove"]')?.addEventListener('click', async () => {
    if (!(await confirmDialog({ title: t('syncSetup.remove'), message: t('syncSetup.removeConfirm'), confirm: t('syncSetup.remove'), danger: true }))) return;
    localStorage.removeItem('hafiz.firebase');
    location.reload();
  });
  m.body.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => m.close()));
}
