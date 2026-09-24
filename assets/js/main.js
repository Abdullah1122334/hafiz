// Entry point: picks the storage backend (Firebase sync or this-device-only), then shows the
// lock screen or the app.
import { initI18n, t } from './i18n.js';
import { applyTheme } from './prefs.js';
import { esc, toast } from './util.js';
import { LocalBackend } from './backends/local.js';
import { Vault } from './vault.js';
import { showAuth } from './ui/auth.js';
import { startApp } from './ui/app.js';
import { savedConfig } from './ui/syncsetup.js';

async function loadConfig() {
  try {
    const mod = await import('../../firebase-config.js');
    const cfg = mod.firebaseConfig;
    if (cfg?.apiKey && cfg?.projectId && cfg?.appId) return { config: cfg, source: 'file' };
  } catch (err) {
    console.warn('firebase-config.js could not be loaded', err);
  }
  const saved = savedConfig();
  return saved ? { config: saved, source: 'app' } : null;
}

function fatal(message, detail) {
  document.body.classList.add('auth-mode');
  document.getElementById('app').innerHTML = `<div class="fatal">
    <h1>${esc(t('appName'))}</h1><p>${esc(message)}</p>${detail ? `<pre>${esc(detail)}</pre>` : ''}
    <button class="btn btn-primary" onclick="location.reload()">${esc(t('retry'))}</button>
  </div>`;
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  // Only reload when the user accepted an update (the first install also fires controllerchange).
  let updateAccepted = false;
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    const offerUpdate = (worker) => {
      toast(t('updateReady'), {
        action: t('reload'),
        duration: 15000,
        onAction: () => {
          updateAccepted = true;
          worker.postMessage('skip-waiting');
        },
      });
    };
    if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(w);
      });
    });
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
  }).catch((err) => console.warn('Service worker registration failed', err));
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updateAccepted) location.reload();
  });
}

async function boot() {
  applyTheme();
  initI18n();
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window.__installPrompt = e;
  });
  registerServiceWorker();

  if (!window.isSecureContext || !crypto?.subtle) {
    fatal(t('err.insecure'));
    return;
  }

  const cfg = await loadConfig();
  window.__syncSource = cfg?.source;
  let backend;
  if (cfg) {
    try {
      const { createCloudBackend } = await import('./backends/cloud.js');
      backend = await createCloudBackend(cfg.config);
    } catch (err) {
      console.error(err);
      fatal(t('err.firebaseInit'), String(err?.message || err));
      return;
    }
  } else {
    backend = new LocalBackend();
  }
  await backend.init();

  const vault = new Vault(backend);
  vault.addEventListener('unlocked', () => startApp(vault));
  vault.addEventListener('locked', () => showAuth(vault));

  const hasVault = backend.kind === 'cloud' ? !!backend.user : await vault.hasLocalVault();
  if (hasVault && (await vault.tryRememberedKey().catch(() => false))) return;
  await showAuth(vault);
}

boot().catch((err) => {
  console.error(err);
  fatal(t('err.unknown'), String(err?.stack || err));
});
