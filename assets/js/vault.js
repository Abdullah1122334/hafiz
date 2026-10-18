// The unlocked vault: holds the decrypted items in memory and turns every change into an
// encrypted record for the storage backend (local or cloud).
import {
  KDF_ITERATIONS, deriveKeys, createVaultKey, unwrapVaultKey, rewrapVaultKey,
  encryptJSON, decryptJSON, randomId, toB64, randomBytes,
} from './crypto.js';
import { kv } from './idb.js';
import { LocalBackend } from './backends/local.js';

const TRASH_TTL = 30 * 24 * 3600 * 1000;

export function blankItem(type = 'note', fields = {}) {
  const now = Date.now();
  return {
    id: randomId(), type,
    title: '', content: '', url: '', username: '', password: '', totp: '',
    tags: [], images: [], history: [],
    pinned: false, favorite: false, color: '',
    createdAt: now, updatedAt: now, trashedAt: 0, passwordChangedAt: 0,
    ...fields,
  };
}

export class VaultError extends Error {
  constructor(code, cause) {
    super(code);
    this.code = code;
    this.cause = cause;
  }
}

function cloudSalt(email) {
  return 'hafiz:' + email.trim().toLowerCase();
}

function authError(err) {
  const map = {
    'auth/invalid-credential': 'wrongCredentials',
    'auth/wrong-password': 'wrongCredentials',
    'auth/user-not-found': 'wrongCredentials',
    'auth/invalid-login-credentials': 'wrongCredentials',
    'auth/email-already-in-use': 'emailInUse',
    'auth/invalid-email': 'invalidEmail',
    'auth/network-request-failed': 'network',
    'auth/too-many-requests': 'tooManyRequests',
    'auth/operation-not-allowed': 'providerDisabled',
    'auth/configuration-not-found': 'providerDisabled',
    'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'badConfig',
    'auth/invalid-api-key': 'badConfig',
  };
  return new VaultError(map[err?.code] || 'unknown', err);
}

export class Vault extends EventTarget {
  constructor(backend) {
    super();
    this.backend = backend;
    this.items = new Map();
    this.revs = new Map();
    this.blobCache = new Map();
    // Records that exist but can't be decrypted with any known key (shown as a warning).
    this.unreadable = new Set();
    // Raw encrypted records, and earlier vault keys that can still read older records. If the
    // vault key was ever replaced, items written with an old key are re-encrypted ("healed").
    this.records = new Map();
    this.oldKeys = [];
    this.key = null;
    this.kek = null;
    this.sync = { state: backend.kind === 'local' ? 'local' : 'connecting' };
    this.ready = false;
  }

  get isCloud() {
    return this.backend.kind === 'cloud';
  }

  get unlocked() {
    return !!this.key;
  }

  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  // ---- setup / unlock ---------------------------------------------------------------------

  async hasLocalVault() {
    return !!(await this.backend.getMeta());
  }

  async createLocal(password, opts) {
    const salt = toB64(randomBytes(16));
    const { kek } = await deriveKeys(password, salt);
    const { key, wrapped } = await createVaultKey(kek);
    await this.backend.setMeta({ v: 1, salt, iterations: KDF_ITERATIONS, wrapped, createdAt: Date.now() });
    this.kek = kek;
    await this.open(key, { ...opts, wrapped });
  }

  async unlockLocal(password, opts) {
    const meta = await this.backend.getMeta();
    const { kek } = await deriveKeys(password, meta.salt, meta.iterations);
    let key;
    try {
      key = await unwrapVaultKey(kek, meta.wrapped);
    } catch {
      throw new VaultError('wrongPassword');
    }
    this.kek = kek;
    await this.open(key, { ...opts, wrapped: meta.wrapped });
  }

  async signUp(email, password, opts) {
    const { kek, authSecret } = await deriveKeys(password, cloudSalt(email));
    try {
      await this.backend.signUp(email.trim(), authSecret);
    } catch (err) {
      throw authError(err);
    }
    const { key, wrapped } = await createVaultKey(kek);
    const meta = { v: 1, iterations: KDF_ITERATIONS, wrapped, createdAt: Date.now() };
    await this.backend.setMeta(meta);
    await kv.set('meta:' + this.backend.vaultId, meta);
    this.kek = kek;
    await this.open(key, { ...opts, wrapped, metaCt: wrapped.ct });
    await this.migrateLocal(password).catch(() => {});
  }

  async signIn(email, password, opts) {
    const { kek, authSecret } = await deriveKeys(password, cloudSalt(email));
    try {
      await this.backend.signIn(email.trim(), authSecret);
    } catch (err) {
      throw authError(err);
    }
    let meta = await this.backend.getMeta();
    const cached = await kv.get('meta:' + this.backend.vaultId).catch(() => null);
    let key;
    let oldKeys = [];
    if (!meta) {
      ({ meta, key, oldKeys } = await this.restoreMissingKey(kek, cached, opts?.reset));
    } else {
      const found = await this.unwrapAll(kek, [meta, cached]);
      if (found.used !== meta) throw new VaultError('wrongPassword');
      [key, ...oldKeys] = found.keys;
    }
    await kv.set('meta:' + this.backend.vaultId, meta);
    this.kek = kek;
    await this.open(key, { ...opts, oldKeys, wrapped: meta.wrapped, metaCt: meta.wrapped.ct });
    await this.migrateLocal(password).catch(() => {});
  }

  // The server's vault-key document is gone. Rebuild it from any copy we can find — this
  // device's cache, or the copy every item carries — instead of starting an empty vault.
  async restoreMissingKey(kek, cached, reset = false) {
    const recs = await this.backend.listItems();
    const sample = recs.slice(0, 40);
    const countReadable = async (k) => {
      let n = 0;
      for (const r of sample) {
        try {
          await decryptJSON(k, r, r.id);
          n++;
        } catch { /* other key */ }
      }
      return n;
    };
    const seen = new Set();
    let best = null;
    const others = [];
    for (const w of [cached?.wrapped, ...recs.map((r) => r.wk)]) {
      if (!w?.ct || seen.has(w.ct)) continue;
      seen.add(w.ct);
      let k;
      try {
        k = await unwrapVaultKey(kek, w);
      } catch {
        continue;
      }
      const n = await countReadable(k);
      if (!best || n > best.n) {
        if (best) others.push(best.key);
        best = { key: k, wrapped: w, n };
      } else others.push(k);
    }
    const fresh = (wrapped) => ({ v: 1, iterations: KDF_ITERATIONS, wrapped, createdAt: Date.now() });
    if (best && (best.n > 0 || !recs.length)) {
      const meta = { ...fresh(best.wrapped), restoredAt: Date.now() };
      await this.backend.setMeta(meta);
      this.emit('key-restored');
      return { meta, key: best.key, oldKeys: others };
    }
    // Keys this device kept (remembered or stashed) can't rebuild the document, but they can
    // still read the items: start a new key and let healing re-encrypt everything.
    const deviceKeys = [];
    const remembered = await kv.get('remembered:' + this.backend.vaultId).catch(() => null);
    for (const k of [remembered, ...(await this.loadOldKeys())]) {
      if (k && (await countReadable(k)) > 0) deviceKeys.push(k);
    }
    if (!recs.length || deviceKeys.length || reset) {
      const created = await createVaultKey(kek);
      const meta = fresh(created.wrapped);
      await this.backend.setMeta(meta);
      return { meta, key: created.key, oldKeys: [...others, ...deviceKeys] };
    }
    throw new VaultError('vaultKeyMissing');
  }

  // Unwraps every distinct vault-key wrapping this KEK can open. The first one that works is
  // the current key; the rest are older keys kept for reading older records.
  async unwrapAll(kek, metas) {
    const keys = [];
    const seen = new Set();
    let used = null;
    for (const m of metas) {
      const ct = m?.wrapped?.ct;
      if (!ct || seen.has(ct)) continue;
      seen.add(ct);
      try {
        keys.push(await unwrapVaultKey(kek, m.wrapped));
        used ||= m;
      } catch { /* wrapped with another password */ }
    }
    return { keys, used };
  }

  async loadOldKeys() {
    return (await kv.get('oldkeys:' + this.backend.vaultId).catch(() => null)) || [];
  }

  async stashKey(key) {
    if (!key) return;
    const list = await this.loadOldKeys();
    await kv.set('oldkeys:' + this.backend.vaultId, [key, ...list].slice(0, 6));
  }

  // Unlock when already signed in to the cloud account on this device (works offline too).
  async unlockCloud(password, opts) {
    const email = this.backend.user.email;
    const { kek, authSecret } = await deriveKeys(password, cloudSalt(email));
    const metaKey = 'meta:' + this.backend.vaultId;
    const cached = await kv.get(metaKey);
    // The server copy wins (it may be newer); the cached one still helps read older records.
    const server = await this.backend.getMeta().catch(() => null);
    const { keys, used } = await this.unwrapAll(kek, [server, cached]);
    if (!keys.length) {
      // No key opened. Tell a wrong password apart from a missing key document.
      try {
        await this.backend.signIn(email, authSecret);
      } catch (err) {
        throw err?.code === 'auth/network-request-failed' ? new VaultError('network') : new VaultError('wrongPassword');
      }
      let onServer;
      try {
        onServer = await this.backend.getMeta({ server: true });
      } catch {
        throw new VaultError('network');
      }
      if (onServer) throw new VaultError('wrongPassword');
      const restored = await this.restoreMissingKey(kek, cached, opts?.reset);
      await kv.set(metaKey, restored.meta);
      this.kek = kek;
      await this.open(restored.key, { ...opts, oldKeys: restored.oldKeys, wrapped: restored.meta.wrapped, metaCt: restored.meta.wrapped.ct });
      return;
    }
    await kv.set(metaKey, used);
    // The server lost its copy but this device still has it: put it back.
    if (!server && navigator.onLine) {
      const exists = await this.backend.getMeta({ server: true }).catch(() => undefined);
      if (exists === null) {
        await this.backend.setMeta({ ...used, restoredAt: Date.now() }).catch(() => {});
        this.emit('key-restored');
      }
    }
    this.kek = kek;
    const [key, ...oldKeys] = keys;
    await this.open(key, { ...opts, oldKeys, wrapped: used.wrapped, metaCt: used.wrapped.ct });
  }

  async tryRememberedKey() {
    const key = await kv.get('remembered:' + this.backend.vaultId).catch(() => null);
    if (!key) return false;
    const cachedMeta = await kv.get('meta:' + this.backend.vaultId).catch(() => null);
    await this.open(key, { remember: true, wrapped: cachedMeta?.wrapped });
    return true;
  }

  async forgetDevice() {
    await kv.del('remembered:' + this.backend.vaultId);
  }

  async isRemembered() {
    return !!(await kv.get('remembered:' + this.backend.vaultId).catch(() => null));
  }

  async open(key, { remember = false, oldKeys = [], metaCt, wrapped } = {}) {
    this.key = key;
    // Every record also carries the (password-protected) vault key, so the key can be rebuilt
    // from the data itself if its own document is ever lost.
    this.wrapped = wrapped || null;
    this.triedWraps = new Set();
    this.items.clear();
    this.revs.clear();
    this.unreadable.clear();
    this.records.clear();
    this.oldKeys = [...oldKeys, ...(await this.loadOldKeys())];
    this.metaCt = metaCt ?? (await kv.get('meta:' + this.backend.vaultId).catch(() => null))?.wrapped?.ct;
    this.ready = false;
    if (remember) await kv.set('remembered:' + this.backend.vaultId, key);
    this.queue = Promise.resolve();
    this.unsubscribe = this.backend.subscribe(
      (changes) => { this.queue = this.queue.then(() => this.applyChanges(changes)); },
      (status) => this.setSyncStatus(status),
    );
    // Never leave the UI on "decrypting": if the first snapshot is slow (offline first launch,
    // flaky network), show what we have and let items stream in as they arrive.
    clearTimeout(this.readyTimer);
    this.readyTimer = setTimeout(() => {
      this.queue = this.queue.then(() => this.applyChanges({ upserts: [], removals: [] }));
    }, 6000);
    if (this.isCloud) {
      this.unwatchMeta = this.backend.watchMeta((meta) => this.onRemoteMeta(meta));
      // Firebase ends sessions e.g. after a password change elsewhere: go back to sign-in.
      this.unwatchAuth = this.backend.watchAuth((user) => {
        if (!user && this.key) {
          this.emit('signed-out');
          this.lock({ silent: true }).then(() => this.emit('locked'));
        }
      });
    }
    this.emit('unlocked');
  }

  async onRemoteMeta(meta) {
    const key = 'meta:' + this.backend.vaultId;
    const previous = await kv.get(key);
    await kv.set(key, meta);
    const ct = meta?.wrapped?.ct;
    if (this.kek) {
      let serverKey;
      try {
        serverKey = await unwrapVaultKey(this.kek, meta.wrapped);
      } catch {
        // The master password was changed on another device: re-authenticate.
        this.emit('password-changed-elsewhere');
        return;
      }
      if (ct && this.metaCt && ct !== this.metaCt && this.key) {
        // The vault key was re-wrapped or replaced elsewhere. Switch to the server's key and keep
        // ours to read (and re-encrypt) anything written with it.
        await this.stashKey(this.key);
        this.oldKeys.unshift(this.key);
        this.key = serverKey;
        this.metaCt = ct;
        this.wrapped = meta.wrapped;
        if (await this.isRemembered()) await kv.set('remembered:' + this.backend.vaultId, serverKey);
        this.queue = this.queue.then(() => this.heal());
      }
    } else if (previous?.wrapped?.ct && previous.wrapped.ct !== ct) {
      // Opened with a remembered key and the wrapping changed (password changed, or the key was
      // replaced): ask for the password again, but keep this key so older records stay readable.
      await this.stashKey(this.key);
      await this.forgetDevice();
      this.emit('password-changed-elsewhere');
    }
  }

  async lock({ forget = true, silent = false } = {}) {
    // Lets the UI flush open editors while the key is still available.
    this.emit('before-lock');
    if (forget) await kv.del('remembered:' + this.backend.vaultId).catch(() => {});
    clearTimeout(this.readyTimer);
    this.unsubscribe?.();
    this.unwatchMeta?.();
    this.unwatchAuth?.();
    this.unsubscribe = this.unwatchMeta = this.unwatchAuth = null;
    this.key = this.kek = null;
    this.items.clear();
    this.revs.clear();
    this.records.clear();
    this.oldKeys = [];
    this.blobCache.clear();
    if (!silent) this.emit('locked');
  }

  async signOut() {
    await this.lock({ silent: true });
    if (this.isCloud) await this.backend.signOut().catch(() => {});
    this.emit('locked');
  }

  // ---- sync -------------------------------------------------------------------------------

  setSyncStatus(s = this.rawSync || { state: this.backend.kind }) {
    this.rawSync = s;
    let state;
    if (s.state === 'local') state = 'local';
    else if (s.state === 'error') state = 'error';
    else if (!navigator.onLine) state = 'offline';
    else if (s.pending) state = 'syncing';
    else if (s.fromCache) state = 'connecting';
    else state = 'synced';
    this.sync = { ...s, state };
    this.emit('sync', this.sync);
  }

  async applyChanges({ upserts, removals }) {
    if (!this.key) return;
    let changed = false;
    let needsHeal = false;
    for (const rec of upserts) {
      if (this.revs.get(rec.id) === rec.iv) continue;
      this.records.set(rec.id, rec);
      let found = await this.decryptRecord(rec);
      if (!found && rec.wk?.ct && this.kek && !this.triedWraps.has(rec.wk.ct)) {
        this.triedWraps.add(rec.wk.ct);
        try {
          this.oldKeys.push(await unwrapVaultKey(this.kek, rec.wk));
          found = await this.decryptRecord(rec);
        } catch { /* wrapped with another password */ }
      }
      if (found) {
        this.items.set(rec.id, { ...blankItem(found.item.type), ...found.item, id: rec.id });
        this.revs.set(rec.id, rec.iv);
        this.unreadable.delete(rec.id);
        needsHeal ||= found.old;
        changed = true;
      } else {
        console.warn('Could not decrypt record', rec.id);
        if (!this.unreadable.has(rec.id)) changed = true;
        this.unreadable.add(rec.id);
      }
    }
    for (const id of removals) {
      changed = this.items.delete(id) || this.unreadable.delete(id) || changed;
      this.revs.delete(id);
      this.records.delete(id);
    }
    if (needsHeal) setTimeout(() => this.heal(), 0);
    if (!this.ready) {
      this.ready = true;
      this.emit('ready');
      this.purgeOldTrash();
      setTimeout(() => this.backfillWraps(), 3000);
    }
    if (changed) this.emit('change');
  }

  // ---- items ------------------------------------------------------------------------------

  list() {
    return [...this.items.values()];
  }

  get(id) {
    return this.items.get(id);
  }

  async save(item, { touch = true } = {}) {
    if (!this.key) throw new VaultError('locked');
    const prev = this.items.get(item.id);
    const next = { ...item };
    if (touch) next.updatedAt = Date.now();
    if (next.type === 'password' && prev && prev.password && prev.password !== next.password) {
      next.history = [{ password: prev.password, date: Date.now() }, ...(prev.history || [])].slice(0, 10);
      next.passwordChangedAt = Date.now();
    }
    if (next.type === 'password' && !next.passwordChangedAt && next.password) next.passwordChangedAt = Date.now();
    const { id, ...payload } = next;
    const enc = await encryptJSON(this.key, payload, id);
    const rec = { id, iv: enc.iv, ct: enc.ct, updatedAt: next.updatedAt, v: 1 };
    if (this.wrapped) rec.wk = { iv: this.wrapped.iv, ct: this.wrapped.ct };
    this.items.set(id, next);
    this.revs.set(id, rec.iv);
    this.records.set(id, rec);
    this.emit('change');
    this.track(this.backend.putItem(rec));
    // Remove attachments that are no longer referenced.
    if (prev?.images?.length) {
      const keep = new Set((next.images || []).map((i) => i.id));
      for (const img of prev.images) if (!keep.has(img.id)) this.deleteBlob(img.id);
    }
    return next;
  }

  // Background write: the UI never waits for the network, errors surface as events.
  track(promise) {
    Promise.resolve(promise).catch((err) => {
      console.error(err);
      this.emit('write-error', err);
    });
  }

  trash(id) {
    const it = this.items.get(id);
    if (it) return this.save({ ...it, trashedAt: Date.now(), pinned: false }, { touch: false });
  }

  restore(id) {
    const it = this.items.get(id);
    if (it) return this.save({ ...it, trashedAt: 0 }, { touch: false });
  }

  async destroy(id) {
    const it = this.items.get(id);
    if (!it) return;
    for (const img of it.images || []) this.deleteBlob(img.id);
    this.items.delete(id);
    this.revs.delete(id);
    this.records.delete(id);
    this.emit('change');
    this.track(this.backend.deleteItem(id));
  }

  // Permanently removes records no known key can open (e.g. after a lost vault key).
  async purgeUnreadable() {
    const ids = [...this.unreadable];
    for (const id of ids) {
      this.unreadable.delete(id);
      this.records.delete(id);
      this.revs.delete(id);
      this.track(this.backend.deleteItem(id));
    }
    this.emit('change');
    return ids.length;
  }

  async emptyTrash() {
    for (const it of this.list()) if (it.trashedAt) await this.destroy(it.id);
  }

  purgeOldTrash() {
    const cutoff = Date.now() - TRASH_TTL;
    for (const it of this.list()) if (it.trashedAt && it.trashedAt < cutoff) this.destroy(it.id);
  }

  // ---- attachments ------------------------------------------------------------------------

  async saveBlob(dataUrl) {
    const id = 'b' + randomId();
    const enc = await encryptJSON(this.key, { data: dataUrl }, id);
    this.blobCache.set(id, dataUrl);
    this.track(this.backend.putBlob(id, { iv: enc.iv, ct: enc.ct, updatedAt: Date.now(), v: 1 }));
    return id;
  }

  async loadBlob(id) {
    if (this.blobCache.has(id)) return this.blobCache.get(id);
    const rec = await this.backend.getBlob(id);
    if (!rec) return null;
    const { data } = await this.decryptWithAnyKey(rec, id);
    this.blobCache.set(id, data);
    return data;
  }

  // ---- key recovery -----------------------------------------------------------------------

  async decryptWithAnyKey(rec, aad) {
    for (const key of [this.key, ...this.oldKeys]) {
      try {
        return { ...(await decryptJSON(key, rec, aad)), __old: key !== this.key };
      } catch { /* try the next key */ }
    }
    throw new VaultError('unreadable');
  }

  async decryptRecord(rec) {
    try {
      const { __old, ...item } = await this.decryptWithAnyKey(rec, rec.id);
      return { item, old: __old };
    } catch {
      return null;
    }
  }

  // One-time upgrade: give items saved before records carried the key a copy of it.
  async backfillWraps() {
    if (!this.wrapped || !this.key || this.backend.kind !== 'cloud') return;
    for (const [id, rec] of [...this.records]) {
      if (rec.wk?.ct || !this.items.has(id) || !this.key) continue;
      try {
        await decryptJSON(this.key, rec, id);
      } catch {
        continue; // only an old key reads it; heal() handles those
      }
      await this.save(this.items.get(id), { touch: false });
    }
  }

  // Re-encrypts, with the current key, every record (and its images) that only an old key can
  // read, so all devices can open them again.
  async heal() {
    if (this.healing || !this.key) return;
    this.healing = true;
    let healed = 0;
    try {
      for (const [id, rec] of [...this.records]) {
        if (!this.key) break;
        try {
          await decryptJSON(this.key, rec, id);
          continue;
        } catch { /* needs healing */ }
        const found = await this.decryptRecord(rec);
        if (!found) continue;
        const item = { ...blankItem(found.item.type), ...found.item, id };
        for (const img of item.images || []) {
          try {
            const blob = await this.backend.getBlob(img.id);
            if (!blob) continue;
            const { data } = await this.decryptWithAnyKey(blob, img.id);
            const enc = await encryptJSON(this.key, { data }, img.id);
            this.track(this.backend.putBlob(img.id, { iv: enc.iv, ct: enc.ct, updatedAt: Date.now(), v: 1 }));
          } catch { /* image unavailable; the thumbnail inside the item is kept */ }
        }
        this.items.set(id, item);
        this.unreadable.delete(id);
        await this.save(item, { touch: false });
        healed++;
      }
    } finally {
      this.healing = false;
    }
    if (healed) this.emit('healed', healed);
  }

  deleteBlob(id) {
    this.blobCache.delete(id);
    this.track(this.backend.deleteBlob(id));
  }

  // ---- account ----------------------------------------------------------------------------

  async changePassword(oldPassword, newPassword) {
    if (this.isCloud) {
      const salt = cloudSalt(this.backend.user.email);
      const [oldK, newK] = [await deriveKeys(oldPassword, salt), await deriveKeys(newPassword, salt)];
      const meta = await this.backend.getMeta({ server: true }).catch(() => {
        throw new VaultError('network');
      });
      let wrapped;
      try {
        wrapped = await rewrapVaultKey(oldK.kek, newK.kek, meta.wrapped);
      } catch {
        throw new VaultError('wrongPassword');
      }
      try {
        await this.backend.changeSecret(oldK.authSecret, newK.authSecret);
      } catch (err) {
        throw authError(err);
      }
      const next = { ...meta, wrapped, changedAt: Date.now() };
      this.kek = newK.kek;
      this.metaCt = wrapped.ct;
      this.wrapped = wrapped;
      await this.backend.setMeta(next);
      await kv.set('meta:' + this.backend.vaultId, next);
    } else {
      const meta = await this.backend.getMeta();
      const oldK = await deriveKeys(oldPassword, meta.salt, meta.iterations);
      const salt = toB64(randomBytes(16));
      const newK = await deriveKeys(newPassword, salt);
      let wrapped;
      try {
        wrapped = await rewrapVaultKey(oldK.kek, newK.kek, meta.wrapped);
      } catch {
        throw new VaultError('wrongPassword');
      }
      this.kek = newK.kek;
      await this.backend.setMeta({ ...meta, salt, iterations: KDF_ITERATIONS, wrapped, changedAt: Date.now() });
    }
  }

  // When sync is switched on, move anything saved in local-only mode into the account.
  async localItemCount() {
    if (!this.isCloud) return 0;
    const local = new LocalBackend();
    if (!(await local.getMeta())) return 0;
    return (await local.allRecords()).length;
  }

  async migrateLocal(password) {
    if (!this.isCloud) return 0;
    const local = new LocalBackend();
    const meta = await local.getMeta();
    if (!meta) return 0;
    const { kek } = await deriveKeys(password, meta.salt, meta.iterations);
    let localKey;
    try {
      localKey = await unwrapVaultKey(kek, meta.wrapped);
    } catch {
      throw new VaultError('wrongPassword');
    }
    const records = await local.allRecords();
    let count = 0;
    for (const rec of records) {
      const item = { ...(await decryptJSON(localKey, rec, rec.id)), id: rec.id };
      const images = [];
      for (const img of item.images || []) {
        const blob = await local.getBlob(img.id);
        if (!blob) continue;
        const { data } = await decryptJSON(localKey, blob, img.id);
        images.push({ ...img, id: await this.saveBlob(data) });
      }
      await this.save({ ...item, images }, { touch: false });
      count++;
    }
    await local.wipe();
    if (count) this.emit('migrated', count);
    return count;
  }

}

export { cloudSalt };
