// End-to-end encryption for Hafiz.
//
// master password --PBKDF2-SHA256(600k)--> master key
//   master key --HKDF("hafiz/enc")--> KEK   (wraps the vault key, never leaves memory)
//   master key --HKDF("hafiz/auth")--> auth secret (used as the Firebase account password)
// vault key (random AES-256-GCM) encrypts every item. Only ciphertext is ever stored or synced,
// so neither Firebase nor anyone reading the database can see your data.

const enc = new TextEncoder();
const dec = new TextDecoder();
const subtle = globalThis.crypto.subtle;

export const KDF_ITERATIONS = 600000;

export function toB64(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < arr.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, arr.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

export function fromB64(str) {
  const s = atob(str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function randomBytes(n) {
  return crypto.getRandomValues(new Uint8Array(n));
}

export function randomId() {
  const b = randomBytes(12);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

export async function deriveKeys(password, salt, iterations = KDF_ITERATIONS) {
  const base = await subtle.importKey('raw', enc.encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  const master = await subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations },
    base,
    256,
  );
  const hkdf = await subtle.importKey('raw', master, 'HKDF', false, ['deriveBits', 'deriveKey']);
  const kek = await subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc.encode('hafiz/enc') },
    hkdf,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  const authBits = await subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc.encode('hafiz/auth') },
    hkdf,
    256,
  );
  return { kek, authSecret: toB64(authBits) };
}

async function encryptBytes(key, bytes, aad) {
  const iv = randomBytes(12);
  const params = { name: 'AES-GCM', iv };
  if (aad) params.additionalData = enc.encode(aad);
  const ct = await subtle.encrypt(params, key, bytes);
  return { iv: toB64(iv), ct: toB64(ct) };
}

async function decryptBytes(key, { iv, ct }, aad) {
  const params = { name: 'AES-GCM', iv: fromB64(iv) };
  if (aad) params.additionalData = enc.encode(aad);
  return new Uint8Array(await subtle.decrypt(params, key, fromB64(ct)));
}

function importVaultKey(raw) {
  return subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

// Creates a brand-new vault key, returned both as a usable CryptoKey and wrapped by the KEK.
export async function createVaultKey(kek) {
  const raw = randomBytes(32);
  const wrapped = await encryptBytes(kek, raw, 'hafiz/vault-key');
  const key = await importVaultKey(raw);
  raw.fill(0);
  return { key, wrapped };
}

// Throws if the password (KEK) is wrong: AES-GCM authentication fails.
export async function unwrapVaultKey(kek, wrapped) {
  const raw = await decryptBytes(kek, wrapped, 'hafiz/vault-key');
  const key = await importVaultKey(raw);
  raw.fill(0);
  return key;
}

// Re-wraps the same vault key under a new KEK (used when changing the master password).
export async function rewrapVaultKey(oldKek, newKek, wrapped) {
  const raw = await decryptBytes(oldKek, wrapped, 'hafiz/vault-key');
  const out = await encryptBytes(newKek, raw, 'hafiz/vault-key');
  raw.fill(0);
  return out;
}

// `aad` binds a ciphertext to its record id, so records cannot be swapped around in the database.
export function encryptJSON(key, obj, aad) {
  return encryptBytes(key, enc.encode(JSON.stringify(obj)), aad);
}

export async function decryptJSON(key, payload, aad) {
  return JSON.parse(dec.decode(await decryptBytes(key, payload, aad)));
}

// Password-based encryption for portable backup files.
export async function encryptBackup(password, obj) {
  const salt = toB64(randomBytes(16));
  const { kek } = await deriveKeys(password, salt);
  const payload = await encryptJSON(kek, obj, 'hafiz/backup');
  return { format: 'hafiz-backup', version: 1, kdf: { name: 'PBKDF2-SHA256', iterations: KDF_ITERATIONS, salt }, ...payload };
}

export async function decryptBackup(password, file) {
  const { kek } = await deriveKeys(password, file.kdf.salt, file.kdf.iterations);
  return decryptJSON(kek, { iv: file.iv, ct: file.ct }, 'hafiz/backup');
}
