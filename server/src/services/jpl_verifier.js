// @ts-check
import { JplPolicySchema } from '../../../shared/jpl_schema.js';
import { computePolicyHash } from './jpl_compiler.js';
import { verifyEd25519 } from '../lib/crypto.js';

/**
 * Verifies a JPL policy against schema, hash, and cryptographic signature.
 * PRD 1.8 §7: Multi-point cryptographic policy verification.
 * @param {object|string} rawPolicy
 * @param {object} [options]
 * @param {string} [options.expectedHash]
 * @param {string} [options.publicKey]
 * @returns {object} { valid: boolean, policy_id: string, policy_hash: string, checks: Array }
 */
export function verify(rawPolicy, options = {}) {
  let policy = rawPolicy;
  if (typeof policy === 'string') {
    try {
      policy = JSON.parse(policy);
    } catch (e) {
      return {
        valid: false,
        policy_id: null,
        policy_hash: null,
        checks: [{ name: 'JSON_SYNTAX', passed: false, message: e.message }],
      };
    }
  }

  const checks = [];

  // 1. JSON Schema Validation
  const schemaResult = JplPolicySchema.safeParse(policy);
  if (!schemaResult.success) {
    const errorMsg = schemaResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
    checks.push({ name: 'SCHEMA_VALIDATION', passed: false, message: errorMsg });
    return {
      valid: false,
      policy_id: policy?.policy_id || null,
      policy_hash: null,
      checks,
    };
  }
  checks.push({ name: 'SCHEMA_VALIDATION', passed: true });

  // 2. Canonical Hash Verification
  const policyHash = computePolicyHash(policy);
  if (options.expectedHash) {
    const hashMatches = policyHash === options.expectedHash;
    checks.push({
      name: 'HASH_VERIFICATION',
      passed: hashMatches,
      hash: policyHash,
      expected: options.expectedHash,
      message: hashMatches ? 'Hash verified' : 'Hash mismatch',
    });
  } else {
    checks.push({
      name: 'HASH_COMPUTATION',
      passed: true,
      hash: policyHash,
    });
  }

  // 3. Signature Verification
  if (policy.signature) {
    const { alg, kid, sig } = policy.signature;
    if (alg !== 'Ed25519') {
      checks.push({ name: 'SIGNATURE_ALGORITHM', passed: false, message: `Unsupported algorithm: ${alg}` });
    } else {
      checks.push({ name: 'SIGNATURE_ALGORITHM', passed: true });

      const rawSig = sig.replace(/^base64:/, '');
      const sigBuffer = Buffer.from(rawSig, 'base64');
      const validFormat = sigBuffer.length === 64;

      if (!validFormat) {
        checks.push({ name: 'SIGNATURE_FORMAT', passed: false, message: 'Invalid Ed25519 signature byte length' });
      } else {
        checks.push({ name: 'SIGNATURE_FORMAT', passed: true });

        if (options.publicKey) {
          const sigValid = verifyEd25519(options.publicKey, rawSig, policyHash);
          checks.push({
            name: 'SIGNATURE_VERIFICATION',
            passed: sigValid,
            kid,
            message: sigValid ? 'Ed25519 signature valid' : 'Ed25519 signature invalid',
          });
        } else {
          checks.push({
            name: 'SIGNATURE_VERIFICATION',
            passed: true,
            kid,
            message: 'Signature present and well-formed (no public key supplied for cryptographic check)',
          });
        }
      }
    }
  } else {
    checks.push({
      name: 'SIGNATURE_PRESENT',
      passed: true,
      message: 'Policy unsigned (optional)',
    });
  }

  const allPassed = checks.every((c) => c.passed);

  return {
    valid: allPassed,
    policy_id: policy.policy_id,
    policy_hash: policyHash,
    checks,
  };
}
