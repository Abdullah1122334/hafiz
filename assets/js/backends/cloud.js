// Firebase (Auth + Firestore) backend. Firestore keeps an offline cache on the device and
// syncs in real time, so anything saved on the phone shows up on the PC within a second or two.
// Everything written here is already encrypted by vault.js.

let fb;

export async function createCloudBackend(config) {
  fb = await import('../../../vendor/firebase.js');
  // databaseId is optional: projects whose Firestore database isn't named "(default)" set it.
  const { databaseId = '(default)', ...appConfig } = config;
  const app = fb.initializeApp(appConfig);
  const auth = fb.initializeAuth(app, {
    persistence: [fb.indexedDBLocalPersistence, fb.browserLocalPersistence],
  });
  let db;
  try {
    db = fb.initializeFirestore(app, {
      localCache: fb.persistentLocalCache({ tabManager: fb.persistentMultipleTabManager() }),
    }, databaseId);
  } catch (err) {
    console.warn('Offline cache unavailable, falling back to memory cache', err);
    db = fb.initializeFirestore(app, {}, databaseId);
  }
  // Developer hook for testing against the local Firebase emulators.
  if (localStorage.getItem('hafiz.emulator') === '1') {
    fb.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    fb.connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }
  return new CloudBackend(auth, db);
}

class CloudBackend {
  constructor(auth, db) {
    this.kind = 'cloud';
    this.auth = auth;
    this.db = db;
  }

  init() {
    return new Promise((resolve) => {
      const stop = fb.onAuthStateChanged(this.auth, () => {
        stop();
        resolve();
      });
    });
  }

  get user() {
    return this.auth.currentUser;
  }

  get vaultId() {
    return this.user?.uid;
  }

  signIn(email, secret) {
    return fb.signInWithEmailAndPassword(this.auth, email, secret);
  }

  signUp(email, secret) {
    return fb.createUserWithEmailAndPassword(this.auth, email, secret);
  }

  signOut() {
    return fb.signOut(this.auth);
  }

  async changeSecret(oldSecret, newSecret) {
    const cred = fb.EmailAuthProvider.credential(this.user.email, oldSecret);
    await fb.reauthenticateWithCredential(this.user, cred);
    await fb.updatePassword(this.user, newSecret);
  }

  path(...parts) {
    return ['users', this.user.uid, ...parts];
  }

  async getMeta({ server = false } = {}) {
    const ref = fb.doc(this.db, ...this.path('meta', 'vault'));
    const snap = server ? await fb.getDocFromServer(ref) : await fb.getDoc(ref);
    return snap.exists() ? snap.data() : null;
  }

  setMeta(meta) {
    return fb.setDoc(fb.doc(this.db, ...this.path('meta', 'vault')), meta);
  }

  async hasItems() {
    const snap = await fb.getDocs(fb.collection(this.db, ...this.path('items')));
    return !snap.empty;
  }

  watchAuth(cb) {
    return fb.onAuthStateChanged(this.auth, cb);
  }

  watchMeta(cb) {
    return fb.onSnapshot(fb.doc(this.db, ...this.path('meta', 'vault')), (snap) => {
      if (snap.exists()) cb(snap.data());
    }, () => {});
  }

  subscribe(onChange, onStatus) {
    const col = fb.collection(this.db, ...this.path('items'));
    return fb.onSnapshot(
      col,
      { includeMetadataChanges: true },
      (snap) => {
        const upserts = [];
        const removals = [];
        for (const ch of snap.docChanges()) {
          if (ch.type === 'removed') removals.push(ch.doc.id);
          else upserts.push({ id: ch.doc.id, ...ch.doc.data() });
        }
        // Always report, even when empty: a brand-new account's first snapshot has no changes
        // but still means "loaded".
        onChange({ upserts, removals });
        onStatus({ state: 'cloud', fromCache: snap.metadata.fromCache, pending: snap.metadata.hasPendingWrites });
      },
      (error) => onStatus({ state: 'error', error }),
    );
  }

  // Firestore resolves writes only once the server acknowledges them; offline writes are queued
  // in the local cache and sent automatically when the connection comes back.
  putItem(rec) {
    const { id, ...data } = rec;
    return fb.setDoc(fb.doc(this.db, ...this.path('items', id)), data);
  }

  deleteItem(id) {
    return fb.deleteDoc(fb.doc(this.db, ...this.path('items', id)));
  }

  putBlob(id, rec) {
    return fb.setDoc(fb.doc(this.db, ...this.path('blobs', id)), rec);
  }

  async getBlob(id) {
    const snap = await fb.getDoc(fb.doc(this.db, ...this.path('blobs', id)));
    return snap.exists() ? snap.data() : null;
  }

  deleteBlob(id) {
    return fb.deleteDoc(fb.doc(this.db, ...this.path('blobs', id)));
  }
}
