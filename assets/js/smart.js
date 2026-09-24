// The "smart" part of Hafiz: figures out what you pasted, names and tags it for you,
// and searches Arabic and English text forgivingly (typos, hamza forms, diacritics...).

const URL_RE = /^(?:https?:\/\/|www\.)[^\s]+$/i;
const BARE_DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?::\d+)?(?:[/?#][^\s]*)?$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_IN_TEXT_RE = /\bhttps?:\/\/[^\s<>"']+/gi;
const HASHTAG_RE = /(^|[\s(])#([\p{L}\p{N}_][\p{L}\p{N}_-]*)/gu;

export function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // Latin accents
    .replace(/[ً-ٰٟـ]/g, '') // Arabic diacritics + tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

export function normalizeUrl(input) {
  let s = String(input || '').trim();
  if (!s) return '';
  if (/^www\./i.test(s) || (!/^[a-z][a-z0-9+.-]*:/i.test(s) && BARE_DOMAIN_RE.test(s))) s = 'https://' + s;
  return s;
}

export function hostOf(url) {
  try {
    return new URL(normalizeUrl(url)).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function isSafeUrl(url) {
  try {
    return ['http:', 'https:'].includes(new URL(normalizeUrl(url)).protocol);
  } catch {
    return false;
  }
}

export function youtubeId(url) {
  try {
    const u = new URL(normalizeUrl(url));
    const h = u.hostname.replace(/^(www|m)\./, '');
    if (h === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
    if (h === 'youtube.com' || h === 'music.youtube.com') {
      if (u.searchParams.get('v')) return u.searchParams.get('v');
      const m = u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{6,})/);
      if (m) return m[1];
    }
  } catch { /* not a url */ }
  return null;
}

const SITES = {
  'youtube.com': ['YouTube', 'video'], 'youtu.be': ['YouTube', 'video'], 'vimeo.com': ['Vimeo', 'video'],
  'tiktok.com': ['TikTok', 'video'], 'netflix.com': ['Netflix', 'video'], 'twitch.tv': ['Twitch', 'video'],
  'facebook.com': ['Facebook', 'social'], 'fb.com': ['Facebook', 'social'], 'instagram.com': ['Instagram', 'social'],
  'twitter.com': ['X', 'social'], 'x.com': ['X', 'social'], 'linkedin.com': ['LinkedIn', 'social'],
  'reddit.com': ['Reddit', 'social'], 'snapchat.com': ['Snapchat', 'social'], 'threads.net': ['Threads', 'social'],
  'web.whatsapp.com': ['WhatsApp', 'social'], 'whatsapp.com': ['WhatsApp', 'social'], 't.me': ['Telegram', 'social'],
  'telegram.org': ['Telegram', 'social'], 'discord.com': ['Discord', 'social'],
  'github.com': ['GitHub', 'dev'], 'gitlab.com': ['GitLab', 'dev'], 'stackoverflow.com': ['Stack Overflow', 'dev'],
  'npmjs.com': ['npm', 'dev'], 'developer.mozilla.org': ['MDN', 'dev'], 'vercel.com': ['Vercel', 'dev'],
  'amazon.com': ['Amazon', 'shopping'], 'amazon.eg': ['Amazon', 'shopping'], 'amazon.sa': ['Amazon', 'shopping'],
  'noon.com': ['Noon', 'shopping'], 'jumia.com.eg': ['Jumia', 'shopping'], 'aliexpress.com': ['AliExpress', 'shopping'],
  'ebay.com': ['eBay', 'shopping'], 'temu.com': ['Temu', 'shopping'], 'shein.com': ['SHEIN', 'shopping'],
  'docs.google.com': ['Google Docs', 'docs'], 'drive.google.com': ['Google Drive', 'docs'],
  'dropbox.com': ['Dropbox', 'docs'], 'notion.so': ['Notion', 'docs'], 'onedrive.live.com': ['OneDrive', 'docs'],
  'mail.google.com': ['Gmail', 'mail'], 'gmail.com': ['Gmail', 'mail'], 'outlook.com': ['Outlook', 'mail'],
  'outlook.live.com': ['Outlook', 'mail'], 'yahoo.com': ['Yahoo', 'mail'],
  'wikipedia.org': ['Wikipedia', 'reading'], 'medium.com': ['Medium', 'reading'],
  'coursera.org': ['Coursera', 'learning'], 'udemy.com': ['Udemy', 'learning'], 'edx.org': ['edX', 'learning'],
  'chatgpt.com': ['ChatGPT', 'ai'], 'claude.ai': ['Claude', 'ai'], 'gemini.google.com': ['Gemini', 'ai'],
  'paypal.com': ['PayPal', 'finance'], 'instapay.eg': ['InstaPay', 'finance'], 'binance.com': ['Binance', 'finance'],
  'maps.google.com': ['Google Maps', 'places'], 'maps.app.goo.gl': ['Google Maps', 'places'],
  'google.com': ['Google', null], 'microsoft.com': ['Microsoft', null], 'apple.com': ['Apple', null],
  'spotify.com': ['Spotify', 'music'], 'open.spotify.com': ['Spotify', 'music'], 'soundcloud.com': ['SoundCloud', 'music'],
};

export function siteInfo(url) {
  const host = hostOf(url);
  if (!host) return { host: '', name: '', category: null };
  const parts = host.split('.');
  for (let i = 0; i < parts.length - 1; i++) {
    const cand = parts.slice(i).join('.');
    if (SITES[cand]) return { host, name: SITES[cand][0], category: SITES[cand][1] };
  }
  const core = parts.length > 2 && parts[parts.length - 2].length <= 3 ? parts[parts.length - 3] : parts[parts.length - 2];
  return { host, name: core ? core.charAt(0).toUpperCase() + core.slice(1) : host, category: null };
}

const GENERIC_SEGMENTS = new Set(['watch', 'index', 'home', 'video', 'videos', 'v', 'p', 'post', 'posts', 'status',
  'share', 's', 'r', 'reel', 'reels', 'shorts', 'embed', 'live', 'en', 'ar', 'en-us', 'ar-eg', 'amp', 'dp', 'gp',
  'product', 'item', 'itm', 'd', 'u', 'view', 'edit', 'file', 'folders', 'photo', 'photos', 'story']);

export function titleFromUrl(url) {
  const info = siteInfo(url);
  if (!info.host) return '';
  if (youtubeId(url)) return `${info.name} · ${info.name === 'YouTube' ? 'Video' : ''}`.replace(/ · $/, '');
  try {
    const u = new URL(normalizeUrl(url));
    const segs = u.pathname.split('/').filter(Boolean).map((s) => { try { return decodeURIComponent(s); } catch { return s; } });
    const last = segs.filter((s) => !/^[\w-]{20,}$/.test(s) && !/^\d+$/.test(s) && !GENERIC_SEGMENTS.has(s.toLowerCase())).pop();
    if (last && last.length > 2 && !/\.(php|html?|aspx?)$/i.test(last)) {
      const words = last.replace(/[-_+]+/g, ' ').replace(/\.[a-z0-9]{2,5}$/i, '').trim();
      if (words && words.length <= 70) return `${info.name} · ${words.charAt(0).toUpperCase()}${words.slice(1)}`;
    }
  } catch { /* ignore */ }
  return info.name;
}

export function titleFromText(text) {
  const line = String(text || '').split('\n').map((l) => l.trim()).find(Boolean) || '';
  const clean = line.replace(/^#+\s*|^[-*]\s+(\[[ xX]\]\s*)?/g, '').trim();
  return clean.length > 60 ? clean.slice(0, 57).trimEnd() + '…' : clean;
}

export function extractHashtags(text) {
  const tags = new Set();
  for (const m of String(text || '').matchAll(HASHTAG_RE)) tags.add(m[2].toLowerCase());
  return [...tags];
}

export function extractUrls(text) {
  return [...String(text || '').matchAll(URL_IN_TEXT_RE)].map((m) => m[0].replace(/[).,;!?]+$/, ''));
}

function charClasses(s) {
  return [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(s)).length;
}

function looksLikePassword(s) {
  if (!s || /\s/.test(s) || s.length < 6 || s.length > 128) return false;
  if (EMAIL_RE.test(s) || URL_RE.test(s) || BARE_DOMAIN_RE.test(s)) return false;
  if (/^[\p{L}]+$/u.test(s) && charClasses(s) < 2) return false; // a plain word
  if (/^\+?\d[\d-]{5,}$/.test(s)) return false; // phone number
  return charClasses(s) >= 3 || (charClasses(s) >= 2 && s.length >= 10);
}

// Figures out what a piece of pasted/typed text is and returns a ready-to-save draft.
export function detect(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  if (/^otpauth:\/\//i.test(text)) {
    try {
      const u = new URL(text);
      const label = decodeURIComponent(u.pathname.replace(/^\/+/, ''));
      const [issuer, account] = label.includes(':') ? label.split(':') : [u.searchParams.get('issuer') || label, ''];
      return { type: 'password', title: u.searchParams.get('issuer') || issuer, username: account || '', totp: text };
    } catch { /* fall through */ }
  }

  if (lines.length === 1 && (URL_RE.test(text) || BARE_DOMAIN_RE.test(text)) && !EMAIL_RE.test(text)) {
    const url = normalizeUrl(text);
    return { type: 'link', url, title: titleFromUrl(url) };
  }

  // "email password", "user:pass", "user | pass", or two lines: login + password
  let login;
  let pass;
  if (lines.length === 2 && !/\s/.test(lines[0]) && looksLikePassword(lines[1])) [login, pass] = lines;
  else if (lines.length === 1) {
    const m = text.match(/^(\S+?)\s*(?:\s|:|\||\/|,)\s*(\S+)$/);
    if (m && (EMAIL_RE.test(m[1]) || /^[\w.-]{3,}$/.test(m[1])) && looksLikePassword(m[2]) && m[1] !== m[2]) {
      [, login, pass] = m;
    }
  }
  if (login && pass) {
    const title = EMAIL_RE.test(login) ? siteInfo(login.split('@')[1]).name || login : login;
    return { type: 'password', title, username: login, password: pass };
  }
  if (lines.length === 1 && looksLikePassword(text)) return { type: 'password', title: '', password: text };

  const urls = extractUrls(text);
  if (lines.length === 2 && urls.length === 1 && urls[0] === lines[1] && !URL_RE.test(lines[0])) {
    return { type: 'link', url: urls[0], title: lines[0] };
  }
  // A short first line followed by more text reads as "title + body", like a paper note.
  const rows = text.split(/\r?\n/);
  const first = rows[0].trim();
  if (rows.length > 1 && first.length <= 70 && !/^([-*•]|\d+[.)])\s/.test(first) && !/https?:\/\//i.test(first)) {
    const body = rows.slice(1).join('\n').replace(/^\s*\n/, '').trimEnd();
    if (body.trim()) return { type: 'note', title: first.replace(/^#+\s+/, ''), content: body };
  }
  return { type: 'note', content: text, title: '' };
}

// Best-effort real titles for video links (only used when link previews are enabled).
export async function fetchVideoTitle(url) {
  const u = normalizeUrl(url);
  if (!youtubeId(u) && !/(^|\.)vimeo\.com$/.test(hostOf(u))) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(u)}`, { signal: ctrl.signal, referrerPolicy: 'no-referrer', credentials: 'omit' });
    const data = await res.json();
    return typeof data.title === 'string' && data.title.trim() ? data.title.trim().slice(0, 200) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Tags added automatically so things are organised without effort.
export function autoTags(item, t, { category = true } = {}) {
  const tags = new Set(item.tags || []);
  for (const tag of extractHashtags(`${item.title}\n${item.content}`)) tags.add(tag);
  if (category && item.type === 'link' && !(item.tags || []).length) {
    const cat = siteInfo(item.url).category;
    if (cat) tags.add(t('cat.' + cat).toLowerCase());
  }
  return [...tags];
}

// ---- search ---------------------------------------------------------------------------------

function editDistanceWithin(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
}

export function parseQuery(q) {
  const tokens = normalize(q).split(/\s+/).filter(Boolean);
  const out = { terms: [], tags: [], type: null };
  const types = { note: 'note', notes: 'note', link: 'link', links: 'link', password: 'password', passwords: 'password' };
  for (const tok of tokens) {
    if (tok.startsWith('#') && tok.length > 1) out.tags.push(tok.slice(1));
    else if (tok.startsWith('type:') && types[tok.slice(5)]) out.type = types[tok.slice(5)];
    else out.terms.push(tok);
  }
  return out;
}

function indexOf(item) {
  if (!item._idx || item._idxAt !== item.updatedAt) {
    const title = normalize(item.title);
    const body = normalize([item.content, item.url, item.username, hostOf(item.url), (item.tags || []).join(' ')].join(' '));
    Object.defineProperty(item, '_idx', { value: { title, body, words: (title + ' ' + body).split(/[^\p{L}\p{N}]+/u).filter(Boolean) }, configurable: true, writable: true });
    Object.defineProperty(item, '_idxAt', { value: item.updatedAt, configurable: true, writable: true });
  }
  return item._idx;
}

// Returns a relevance score, or 0 when the item doesn't match.
export function score(item, query) {
  if (query.type && item.type !== query.type) return 0;
  if (query.tags.length) {
    const tags = (item.tags || []).map(normalize);
    if (!query.tags.every((q) => tags.some((tg) => tg.startsWith(q)))) return 0;
  }
  if (!query.terms.length) return 1;
  const idx = indexOf(item);
  let total = 0;
  for (const full of query.terms) {
    let s = 0;
    // Arabic definite article: "اللبن" should find "لبن".
    const term = full.length > 4 && full.startsWith('ال') && !idx.title.includes(full) && !idx.body.includes(full) ? full.slice(2) : full;
    if (idx.title.startsWith(term)) s = 12;
    else if (idx.title.includes(term)) s = 9;
    else if (idx.body.includes(term)) s = 5;
    else if (term.length >= 4) {
      const max = term.length >= 8 ? 2 : 1;
      if (idx.words.some((w) => editDistanceWithin(term, w.slice(0, term.length + max), max))) s = 2;
    }
    if (!s) return 0;
    total += s;
  }
  return total;
}
