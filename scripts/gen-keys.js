import crypto from 'node:crypto';

console.log('JOBENPAY_ENC_KEY=' + crypto.randomBytes(32).toString('base64'));
const ed25519PrivateKey = crypto.generateKeyPairSync('ed25519').privateKey;
console.log('JOBENPAY_LEDGER_SIGNING_KEY=' + ed25519PrivateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'));
console.log('JOBENPAY_HMAC_PEPPER=' + crypto.randomBytes(32).toString('base64'));
