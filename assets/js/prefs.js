// Per-device preferences (not synced, not secret).
const DEFAULTS = {
  theme: 'system',
  lang: 'ar',
  autoLock: 15,
  clipClear: 30,
  previews: true,
  layout: 'grid',
  sort: 'updated',
};

function read(key) {
  try {
    const v = localStorage.getItem('hafiz.' + key);
    return v === null ? DEFAULTS[key] : JSON.parse(v);
  } catch {
    return DEFAULTS[key];
  }
}

export const prefs = new Proxy({}, {
  get: (_, key) => read(key),
  set: (_, key, value) => {
    try {
      localStorage.setItem('hafiz.' + key, JSON.stringify(value));
    } catch { /* storage unavailable */ }
    return true;
  },
});

const media = matchMedia('(prefers-color-scheme: dark)');

export function applyTheme() {
  const mode = prefs.theme;
  const dark = mode === 'dark' || (mode === 'system' && media.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0f1117' : '#f5f6fa');
}

media.addEventListener('change', applyTheme);
