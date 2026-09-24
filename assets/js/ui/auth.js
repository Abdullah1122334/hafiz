// Welcome, sign-in / create account, and lock screens.
import { t, lang, setLang } from '../i18n.js';
import { icon } from '../icons.js';
import { prefs, applyTheme } from '../prefs.js';
import { $, esc } from '../util.js';
import { strength } from '../password.js';
import { strengthHtml } from './strength.js';
import { logoSvg } from './brand.js';
import { openSyncSetup } from './syncsetup.js';

let vaultRef;

export async function showAuth(vault) {
  vaultRef = vault;
  document.body.classList.add('auth-mode');
  document.body.classList.remove('drawer-open', 'search-open');
  document.querySelectorAll('.modal-layer, .menu').forEach((n) => n.remove());
  let mode;
  if (vault.isCloud) mode = vault.backend.user ? 'unlock-cloud' : 'signin';
  else mode = (await vault.hasLocalVault()) ? 'unlock-local' : 'create-local';
  render(mode);
}

function pwField(name, label, autocomplete, extra = '') {
  return `<div class="field">
    <label class="label" for="f-${name}">${esc(label)}</label>
    <div class="input-group">
      <input class="input" id="f-${name}" name="${name}" type="password" autocomplete="${autocomplete}" required dir="auto" ${extra}>
      <button type="button" class="icon-btn" data-reveal="${name}" aria-label="${esc(t('reveal'))}">${icon('eye')}</button>
    </div>
  </div>`;
}

function rememberBox() {
  return `<label class="check remember"><input type="checkbox" name="remember"><span>${esc(t('auth.remember'))}</span></label>
    <p class="muted small remember-hint">${esc(t('auth.rememberHint'))}</p>`;
}

function formFor(mode) {
  const title = {
    'create-local': t('auth.createTitle'),
    'unlock-local': t('auth.unlockTitle'),
    'unlock-cloud': t('auth.unlockTitle'),
    signin: t('auth.signinTitle'),
    signup: t('auth.signupTitle'),
  }[mode];
  const sub = {
    'create-local': t('auth.createSub'),
    'unlock-local': t('auth.unlockSub'),
    'unlock-cloud': t('auth.unlockSub'),
    signin: t('auth.signinSub'),
    signup: t('auth.signupSub'),
  }[mode];
  const isNew = mode === 'create-local' || mode === 'signup';
  const email = vaultRef.backend.user?.email;
  let html = `<div class="auth-brand-mobile">${logoSvg(44)}<span>${esc(t('appName'))}</span></div>`;
  if (mode === 'signin' || mode === 'signup') {
    html += `<div class="seg auth-tabs" role="tablist">
      <button type="button" data-mode="signin" aria-selected="${mode === 'signin'}">${esc(t('auth.signin'))}</button>
      <button type="button" data-mode="signup" aria-selected="${mode === 'signup'}">${esc(t('auth.signup'))}</button>
    </div>`;
  }
  html += `<h2>${esc(title)}</h2><p class="auth-sub">${esc(sub)}</p><form class="stack" novalidate>`;
  if (mode === 'unlock-cloud') html += `<div class="account-chip">${icon('user')}<span dir="ltr">${esc(email)}</span></div>`;
  if (mode === 'signin' || mode === 'signup') {
    html += `<div class="field"><label class="label" for="f-email">${esc(t('email'))}</label><input class="input" id="f-email" name="email" type="email" autocomplete="username" inputmode="email" required dir="ltr"></div>`;
  }
  html += pwField('password', t('auth.masterPassword'), isNew ? 'new-password' : 'current-password', mode.startsWith('unlock') ? 'autofocus' : '');
  if (isNew) {
    html += `<div class="pw-strength"></div>${pwField('confirm', t('confirmPassword'), 'new-password')}
      <div class="notice">${icon('alert')}<div><strong>${esc(t('auth.warnTitle'))}</strong><span>${esc(t('auth.warn'))}</span></div></div>
      <label class="check"><input type="checkbox" name="ack" required><span>${esc(t('auth.ack'))}</span></label>`;
  }
  html += rememberBox();
  html += `<p class="form-error" role="alert" hidden></p>
    <button class="btn btn-primary btn-block btn-lg" type="submit">${icon(isNew ? 'sparkles' : 'lock')}<span>${esc(isNew ? (mode === 'signup' ? t('auth.signupBtn') : t('auth.createBtn')) : mode === 'signin' ? t('auth.signinBtn') : t('auth.unlockBtn'))}</span></button>
  </form>`;
  if (mode === 'unlock-cloud') html += `<button class="link-btn" data-act="signout">${icon('logout')}${esc(t('auth.switchAccount'))}</button>`;
  if (!vaultRef.isCloud) {
    html += `<div class="sync-card">
      ${icon('sync')}
      <div><strong>${esc(t('auth.syncTitle'))}</strong><span>${esc(t('auth.syncText'))}</span></div>
      <button class="btn btn-ghost btn-sm" data-act="sync-setup">${esc(t('auth.syncBtn'))}</button>
    </div>`;
  } else if (localStorage.getItem('hafiz.firebase')) {
    html += `<button class="link-btn" data-act="sync-setup">${icon('settings')}${esc(t('set.syncConfig'))}</button>`;
  }
  return html;
}

function render(mode) {
  const features = [
    ['zap', t('feat.smart'), t('feat.smartText')],
    ['sync', t('feat.sync'), t('feat.syncText')],
    ['lock', t('feat.secure'), t('feat.secureText')],
    ['shield', t('feat.passwords'), t('feat.passwordsText')],
  ];
  $('#app').innerHTML = `<div class="auth">
    <aside class="auth-art">
      <div class="auth-art-inner">
        <div class="auth-logo">${logoSvg(52)}<span>${esc(t('appName'))}</span></div>
        <h1>${esc(t('auth.hero'))}</h1>
        <p>${esc(t('auth.heroSub'))}</p>
        <ul class="features">${features.map(([ic, h, p]) => `<li><span class="feat-icon">${icon(ic)}</span><div><strong>${esc(h)}</strong><span>${esc(p)}</span></div></li>`).join('')}</ul>
      </div>
    </aside>
    <main class="auth-main">
      <div class="auth-card">${formFor(mode)}</div>
      <div class="auth-foot">
        <button class="link-btn" data-act="lang">${icon('languages')}${lang() === 'ar' ? 'English' : 'العربية'}</button>
        <button class="link-btn" data-act="theme">${icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon')}${esc(t('toggleTheme'))}</button>
      </div>
    </main>
  </div>`;
  document.title = t('appName');
  bind(mode);
}

function bind(mode) {
  const root = $('#app');
  const form = root.querySelector('form');
  const err = root.querySelector('.form-error');
  const submit = form.querySelector('[type="submit"]');
  const isNew = mode === 'create-local' || mode === 'signup';

  root.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => render(b.dataset.mode)));
  root.querySelectorAll('[data-reveal]').forEach((b) => b.addEventListener('click', () => {
    const input = form.querySelector(`[name="${b.dataset.reveal}"]`);
    input.type = input.type === 'password' ? 'text' : 'password';
    b.innerHTML = icon(input.type === 'password' ? 'eye' : 'eye-off');
  }));
  form.password.addEventListener('input', () => {
    const box = form.querySelector('.pw-strength');
    if (box) box.innerHTML = strengthHtml(form.password.value);
  });
  root.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'lang') {
      setLang(lang() === 'ar' ? 'en' : 'ar');
      render(mode);
    } else if (act === 'theme') {
      prefs.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      applyTheme();
      render(mode);
    } else if (act === 'sync-setup') {
      openSyncSetup({ source: window.__syncSource });
    } else if (act === 'signout') {
      await vaultRef.signOut();
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    const show = (msg) => {
      err.textContent = msg;
      err.hidden = false;
      submit.disabled = false;
      submit.classList.remove('loading');
    };
    const pw = form.password.value;
    const email = form.email?.value.trim();
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return show(t('err.invalidEmail'));
    if (!pw) return show(t('err.enterPassword'));
    if (isNew) {
      if (pw.length < 8) return show(t('err.tooShort'));
      if (strength(pw).score < 2) return show(t('err.tooWeak'));
      if (pw !== form.confirm.value) return show(t('err.mismatch'));
      if (!form.ack.checked) return show(t('err.ack'));
    }
    const opts = { remember: form.remember.checked };
    submit.disabled = true;
    submit.classList.add('loading');
    try {
      if (mode === 'create-local') await vaultRef.createLocal(pw, opts);
      else if (mode === 'unlock-local') await vaultRef.unlockLocal(pw, opts);
      else if (mode === 'unlock-cloud') await vaultRef.unlockCloud(pw, opts);
      else if (mode === 'signin') await vaultRef.signIn(email, pw, opts);
      else if (mode === 'signup') await vaultRef.signUp(email, pw, opts);
    } catch (ex) {
      if (!ex.code || ex.code === 'unknown') console.error(ex);
      if (mode === 'signin' && ex.code === 'wrongCredentials') return show(t('err.wrongCredentials'));
      show(t('err.' + (ex.code || 'unknown')));
      form.password.select();
    }
  });

  requestAnimationFrame(() => {
    const first = form.email || form.password;
    if (!matchMedia('(hover: none)').matches || mode.startsWith('unlock')) first.focus();
  });
}
