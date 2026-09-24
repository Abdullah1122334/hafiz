// Backups and imports: encrypted .json backups, plain JSON, and password CSVs exported from
// Chrome / Edge / Google Password Manager, Firefox or Bitwarden.
import { encryptBackup, decryptBackup } from './crypto.js';
import { blankItem } from './vault.js';
import { hostOf, siteInfo, normalizeUrl } from './smart.js';

function today() {
  return new Date().toISOString().slice(0, 10);
}

export async function buildEncryptedBackup(vault, password) {
  const items = vault.list();
  const blobs = {};
  for (const it of items) {
    for (const img of it.images || []) {
      try {
        blobs[img.id] = await vault.loadBlob(img.id);
      } catch { /* not available offline: the thumbnail is still kept */ }
    }
  }
  const file = await encryptBackup(password, { app: 'hafiz', version: 1, exportedAt: Date.now(), items, blobs });
  return { name: `hafiz-backup-${today()}.json`, content: JSON.stringify(file) };
}

export function buildPlainExport(vault) {
  const items = vault.list().map(({ images, ...rest }) => ({ ...rest, images: (images || []).map(({ thumb, ...i }) => i) }));
  return { name: `hafiz-export-${today()}.json`, content: JSON.stringify({ app: 'hafiz', version: 1, exportedAt: Date.now(), items }, null, 2) };
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);
  return rows;
}

function csvToItems(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (...names) => head.findIndex((h) => names.includes(h));
  const c = {
    title: col('name', 'title'),
    url: col('url', 'login_uri', 'website', 'origin'),
    username: col('username', 'login_username', 'login', 'email'),
    password: col('password', 'login_password'),
    notes: col('note', 'notes', 'extra', 'comments'),
    totp: col('login_totp', 'totp', 'otpauth'),
    type: col('type'),
  };
  if (c.password < 0) throw new Error('csv-no-password-column');
  const get = (r, k) => (c[k] >= 0 ? (r[c[k]] || '').trim() : '');
  return rows.slice(1).map((r) => {
    const url = get(r, 'url');
    const kind = get(r, 'type');
    if (kind === 'note') return blankItem('note', { title: get(r, 'title'), content: get(r, 'notes') });
    return blankItem('password', {
      title: get(r, 'title') && get(r, 'title') !== hostOf(url) ? get(r, 'title') : siteInfo(url).name || get(r, 'title'),
      url: url ? normalizeUrl(url) : '',
      username: get(r, 'username'),
      password: get(r, 'password'),
      totp: get(r, 'totp'),
      content: get(r, 'notes'),
    });
  }).filter((i) => i.password || i.username || i.content);
}

// Returns { kind, needsPassword, run(password?) -> count }
export async function prepareImport(vault, file) {
  const text = await file.text();
  const trimmed = text.trim();
  if (/\.csv$/i.test(file.name) || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) {
    const items = csvToItems(text);
    return { kind: 'csv', count: items.length, run: () => importItems(vault, items, {}, { dedupe: true }) };
  }
  const data = JSON.parse(trimmed);
  if (data.format === 'hafiz-backup') {
    return {
      kind: 'backup',
      needsPassword: true,
      run: async (password) => {
        const payload = await decryptBackup(password, data);
        return importItems(vault, payload.items || [], payload.blobs || {});
      },
    };
  }
  const items = Array.isArray(data) ? data : data.items;
  if (!Array.isArray(items)) throw new Error('unknown-format');
  return { kind: 'json', count: items.length, run: () => importItems(vault, items, {}) };
}

async function importItems(vault, items, blobs, { dedupe = false } = {}) {
  const existingKeys = new Set(
    vault.list().filter((i) => i.type === 'password').map((i) => `${hostOf(i.url)}|${i.username}|${i.password}`),
  );
  let count = 0;
  for (const raw of items) {
    if (!raw || !['note', 'link', 'password'].includes(raw.type)) continue;
    const current = raw.id && vault.get(raw.id);
    if (current && current.updatedAt >= (raw.updatedAt || 0)) continue;
    if (dedupe && raw.type === 'password' && existingKeys.has(`${hostOf(raw.url)}|${raw.username}|${raw.password}`)) continue;
    const images = [];
    for (const img of raw.images || []) {
      const data = blobs[img.id];
      if (data) images.push({ ...img, id: await vault.saveBlob(data), thumb: img.thumb || data });
      else if (img.thumb) images.push({ ...img, id: await vault.saveBlob(img.thumb) });
    }
    const item = blankItem(raw.type, { ...raw, images, tags: Array.isArray(raw.tags) ? raw.tags : [] });
    if (typeof raw.id === 'string' && /^[\w-]{1,64}$/.test(raw.id)) item.id = raw.id;
    await vault.save(item, { touch: !raw.updatedAt });
    count++;
  }
  return count;
}
