import crypto from 'node:crypto';

const AES_KEY_BYTES = 32;
const AES_IV_BYTES = 12;
const AES_TAG_BYTES = 16;

export function keyMaterial(value, length = AES_KEY_BYTES) {
  if (typeof value !== 'string') {
    throw new Error('Encryption key must be a string.');
  }

  const utf8 = Buffer.from(value, 'utf8');
  const base64 = Buffer.from(value, 'base64');
  const raw = utf8.length === length ? utf8 : base64.length === length ? base64 : null;

  if (!raw) {
    throw new Error(`Expected ${length} bytes but received ${utf8.length} utf8 and ${base64.length} base64.`);
  }

  return raw;
}

export function encrypt({ key, plaintext, aad = '' }) {
  const keyBytes = keyMaterial(key, AES_KEY_BYTES);
  const iv = crypto.randomBytes(AES_IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBytes, iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const encrypted = Buffer.concat([cipher.update(Buffer.from(plaintext, 'utf8'), 'binary'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decrypt({ key, payload, aad = '' }) {
  const keyBytes = keyMaterial(key, AES_KEY_BYTES);
  const raw = Buffer.from(payload, 'base64');
  if (raw.length <= AES_IV_BYTES + AES_TAG_BYTES) {
    throw new Error('Ciphertext is too short.');
  }

  const iv = raw.subarray(0, AES_IV_BYTES);
  const tag = raw.subarray(AES_IV_BYTES, AES_IV_BYTES + AES_TAG_BYTES);
  const ct = raw.subarray(AES_IV_BYTES + AES_TAG_BYTES);
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBytes, iv);
  decipher.setAuthTag(tag);
  decipher.setAAD(Buffer.from(aad, 'utf8'));

  try {
    const decrypted = Buffer.concat([decipher.update(ct), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (error) {
    if (error && /AAD|auth tag|bad decrypt|unsupported/i.test(error.message)) {
      throw new Error('AAD mismatch or ciphertext corruption detected.');
    }
    throw error;
  }
}

export function hmacSha256(pepper, value) {
  return crypto.createHmac('sha256', Buffer.from(pepper, 'base64')).update(String(value), 'utf8').digest('hex');
}

export function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('base64');
  const hash = crypto.scryptSync(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 256 * 1024 * 1024,
  });
  return `scrypt$32768$8$1$${salt}$${hash.toString('base64')}`;
}

export async function verifyPassword(password, hashString) {
  const parts = String(hashString).split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false;
  }
  const [, n, r, p, salt, expectedBase64] = parts;
  const expected = Buffer.from(expectedBase64, 'base64');
  const candidate = crypto.scryptSync(password, salt, expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 256 * 1024 * 1024,
  });
  try {
    return crypto.timingSafeEqual(expected, candidate);
  } catch {
    return false;
  }
}

export function signEd25519Key(privateKeyBase64, message) {
  const privateKey = crypto.createPrivateKey({
    key: privateKeyDerToPem(privateKeyBase64),
    format: 'pem',
    type: 'pkcs8',
  });
  return crypto.sign(null, Buffer.from(message, 'utf8'), privateKey).toString('base64');
}

export function verifyEd25519Key(publicKeyBase64, signatureBase64, message) {
  const publicKey = crypto.createPublicKey({
    key: publicKeyDerToPem(publicKeyBase64),
    format: 'pem',
    type: 'spki',
  });
  return crypto.verify(null, Buffer.from(message, 'utf8'), publicKey, Buffer.from(signatureBase64, 'base64'));
}

export function verifyEd25519(publicKeyBase64, signatureBase64, message) {
  return verifyEd25519Key(publicKeyBase64, signatureBase64, message);
}

export function kidFromPublicKey(publicKeyBase64) {
  const raw = Buffer.from(publicKeyBase64, 'base64');
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

export function signEd25519(privateKeyBase64, message) {
  return signEd25519Key(privateKeyBase64, message);
}

signEd25519.generateKeyPair = async (_format = 'pkcs8') => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    publicKey: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
    privateKey: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
  };
};

signEd25519.sign = signEd25519Key;
signEd25519.verify = verifyEd25519;

export function generateEd25519Keys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    publicKey: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
    privateKey: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
  };
}

function privateKeyDerToPem(privateKeyBase64) {
  const der = Buffer.from(privateKeyBase64, 'base64');
  return wrapPem('PRIVATE KEY', der);
}

function publicKeyDerToPem(publicKeyBase64) {
  const der = Buffer.from(publicKeyBase64, 'base64');
  return wrapPem('PUBLIC KEY', der);
}

function wrapPem(label, data) {
  const lines = data.toString('base64').match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----\n`;
}
