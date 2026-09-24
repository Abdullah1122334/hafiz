// Password generator, strength estimation and TOTP (2FA) codes.

const SETS = {
  lower: 'abcdefghijkmnopqrstuvwxyz',
  upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
  digits: '23456789',
  symbols: '!@#$%^&*-_=+?.:~',
};
const AMBIGUOUS = { lower: 'l', upper: 'IO', digits: '01', symbols: '' };

function randomInt(max) {
  // Rejection sampling avoids modulo bias.
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf); while (buf[0] >= limit);
  return buf[0] % max;
}

export function generatePassword({ length = 20, lower = true, upper = true, digits = true, symbols = true, ambiguous = false } = {}) {
  const chosen = Object.entries({ lower, upper, digits, symbols })
    .filter(([, on]) => on)
    .map(([name]) => SETS[name] + (ambiguous ? AMBIGUOUS[name] : ''));
  if (!chosen.length) chosen.push(SETS.lower);
  const all = chosen.join('');
  const out = chosen.map((set) => set[randomInt(set.length)]); // at least one of each class
  while (out.length < length) out.push(all[randomInt(all.length)]);
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.slice(0, length).join('');
}

const COMMON = new Set(`123456 123456789 12345678 password qwerty 12345 1234567890 1234567 111111 123123 abc123
password1 1234 iloveyou 000000 qwerty123 dragon monkey letmein football admin welcome 654321 sunshine master
princess 123321 666666 1q2w3e4r 1qaz2wsx qwertyuiop superman asdfghjkl 7777777 987654321 passw0rd trustno1
zaq12wsx 112233 michael shadow baseball mustang 121212 aa123456 azerty 159753 access starwars hello freedom
whatever qazwsx ninja 11111111 88888888 pass123 admin123 p@ssw0rd 123qwe egypt 01000000000 mohamed ahmed
123456a a123456 q1w2e3r4`.split(/\s+/));

// Returns { score: 0..4, bits } using a conservative entropy estimate.
export function strength(pw) {
  if (!pw) return { score: 0, bits: 0 };
  if (COMMON.has(pw.toLowerCase())) return { score: 0, bits: 5 };
  // "P@ssw0rd123!" is still "password": undo common substitutions and trailing digits/symbols.
  const base = pw.toLowerCase()
    .replace(/[@4]/g, 'a').replace(/0/g, 'o').replace(/[1!|]/g, 'i').replace(/3/g, 'e').replace(/[$5]/g, 's').replace(/7/g, 't')
    .replace(/[^a-z]+$/, '').replace(/^[^a-z]+/, '');
  const deleet = [base, base.replace(/i/g, 'l')];
  if (deleet.some((b) => b.length >= 4 && (COMMON.has(b) || [...COMMON].some((c) => c.length >= 5 && /^[a-z]+$/.test(c) && b.startsWith(c))))) {
    return { score: 1, bits: 20 };
  }
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/\d/.test(pw)) pool += 10;
  if (/[^A-Za-z0-9]/.test(pw)) pool += 33;
  if (/[^\x00-\x7F]/.test(pw)) pool += 40;
  let len = 0;
  let prev = '';
  let run = 0;
  for (const ch of pw) {
    // Repeats and simple sequences add little entropy.
    const code = ch.charCodeAt(0);
    const seq = prev && Math.abs(code - prev.charCodeAt(0)) <= 1;
    run = seq ? run + 1 : 0;
    len += run >= 2 ? 0.25 : seq ? 0.6 : 1;
    prev = ch;
  }
  if (/^[a-z]+\d{1,4}$/i.test(pw) || /^\d+$/.test(pw)) len *= 0.6;
  const bits = Math.round(len * Math.log2(Math.max(pool, 2)));
  const score = bits < 28 ? 0 : bits < 40 ? 1 : bits < 60 ? 2 : bits < 80 ? 3 : 4;
  return { score, bits };
}

// ---- TOTP (RFC 6238) ------------------------------------------------------------------------

function base32Decode(input) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = input.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const c of clean) {
    const idx = alphabet.indexOf(c);
    if (idx < 0) throw new Error('bad base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

export function parseTotp(input) {
  const s = String(input || '').trim();
  if (!s) return null;
  try {
    if (/^otpauth:\/\//i.test(s)) {
      const u = new URL(s);
      const secret = u.searchParams.get('secret');
      if (!secret) return null;
      const algo = (u.searchParams.get('algorithm') || 'SHA1').toUpperCase().replace('SHA', 'SHA-');
      return {
        key: base32Decode(secret),
        digits: parseInt(u.searchParams.get('digits') || '6', 10),
        period: parseInt(u.searchParams.get('period') || '30', 10),
        algo: ['SHA-1', 'SHA-256', 'SHA-512'].includes(algo) ? algo : 'SHA-1',
      };
    }
    const key = base32Decode(s);
    return key.length >= 5 ? { key, digits: 6, period: 30, algo: 'SHA-1' } : null;
  } catch {
    return null;
  }
}

export async function totpCode(input, now = Date.now()) {
  const p = typeof input === 'string' ? parseTotp(input) : input;
  if (!p) return null;
  const counter = Math.floor(now / 1000 / p.period);
  const msg = new ArrayBuffer(8);
  const view = new DataView(msg);
  view.setUint32(0, Math.floor(counter / 0x100000000));
  view.setUint32(4, counter >>> 0);
  const key = await crypto.subtle.importKey('raw', p.key, { name: 'HMAC', hash: p.algo }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
  const off = mac[mac.length - 1] & 15;
  const bin = ((mac[off] & 127) << 24) | (mac[off + 1] << 16) | (mac[off + 2] << 8) | mac[off + 3];
  const code = String(bin % 10 ** p.digits).padStart(p.digits, '0');
  const remaining = p.period - (Math.floor(now / 1000) % p.period);
  return { code, remaining, period: p.period };
}
