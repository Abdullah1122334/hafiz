// Stores encrypted records in this browser only (used when sync is not configured).
import * as idb from '../idb.js';

export class LocalBackend {
  constructor() {
    this.kind = 'local';
    this.vaultId = 'local';
    this.channel = 'BroadcastChannel' in self ? new BroadcastChannel('hafiz-local') : null;
  }

  async init() {}

  getMeta() {
    return idb.kv.get('local-meta');
  }

  setMeta(meta) {
    return idb.kv.set('local-meta', meta);
  }

  // Calls onChange({ upserts, removals }) with encrypted records; other tabs are kept in step.
  subscribe(onChange, onStatus) {
    let active = true;
    idb.all('items').then((rows) => {
      if (active) onChange({ upserts: rows.map(([, rec]) => rec), removals: [] });
    });
    const listener = (e) => {
      if (!active) return;
      if (e.data.type === 'put') onChange({ upserts: [e.data.rec], removals: [] });
      if (e.data.type === 'del') onChange({ upserts: [], removals: [e.data.id] });
    };
    this.channel?.addEventListener('message', listener);
    onStatus({ state: 'local' });
    return () => {
      active = false;
      this.channel?.removeEventListener('message', listener);
    };
  }

  async putItem(rec) {
    await idb.set('items', rec.id, rec);
    this.channel?.postMessage({ type: 'put', rec });
  }

  async deleteItem(id) {
    await idb.del('items', id);
    this.channel?.postMessage({ type: 'del', id });
  }

  putBlob(id, rec) {
    return idb.set('blobs', id, rec);
  }

  getBlob(id) {
    return idb.get('blobs', id);
  }

  deleteBlob(id) {
    return idb.del('blobs', id);
  }

  async allRecords() {
    return (await idb.all('items')).map(([, rec]) => rec);
  }

  async wipe() {
    await Promise.all([idb.clear('items'), idb.clear('blobs'), idb.kv.del('local-meta')]);
  }
}
