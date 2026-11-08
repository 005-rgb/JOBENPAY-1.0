// @ts-check
import crypto from 'node:crypto';
import { canonicalJson } from '../../../shared/canonical.js';
import { AppError } from '../lib/errors.js';
import { JplPolicySchema } from '../../../shared/jpl_schema.js';
import { verifyEd25519 } from '../lib/crypto.js';

const FIELD_PATH_REGEX = /^[a-z][a-z0-9_.]*$/;

export const SUPPORTED_OPERATORS = new Set([
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
  'in', 'not_in', 'contains', 'not_contains',
  'matches', 'not_matches',
  'exists', 'not_exists',
  'between', 'not_between',
  'subset_of', 'superset_of', 'intersects',
]);

/**
 * Resolves a dot-delimited field path from an input object safely.
 * PRD 1.8 §3.4: Field path uses dot notation. Missing field -> undefined.
 * @param {any} obj
 * @param {string} path
 * @returns {any}
 */
export function resolveFieldPath(obj, path) {
  if (!obj || typeof obj !== 'object' || typeof path !== 'string') return undefined;
  if (!FIELD_PATH_REGEX.test(path)) {
    throw new AppError('INVALID_FIELD_PATH', 422, `INVALID_FIELD_PATH: Invalid field path format: ${path}`);
  }

  const parts = path.split('.');
  let curr = obj;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (curr === null || curr === undefined || typeof curr !== 'object') {
      return undefined;
    }
    curr = curr[p];
  }
  return curr;
}

/**
 * Compiles a single condition into an executable evaluator closure.
 * PRD 1.8 §3.3 & §4.3: Fail-closed evaluation of 18 operators.
 * @param {object} cond
 * @returns {(input: any) => boolean}
 */
export function compileCondition(cond) {
  const { field, operator, value, case_sensitive = true } = cond;

  if (!FIELD_PATH_REGEX.test(field)) {
    throw new AppError('INVALID_FIELD_PATH', 422, `INVALID_FIELD_PATH: Invalid field path format: ${field}`);
  }

  if (!SUPPORTED_OPERATORS.has(operator)) {
    throw new AppError('INVALID_OPERATOR', 422, `INVALID_OPERATOR: Unsupported JPL operator: ${operator}`);
  }

  return function evaluateCond(input) {
    try {
      const fieldVal = resolveFieldPath(input, field);

      switch (operator) {
        case 'exists':
          return fieldVal !== null && fieldVal !== undefined;

        case 'not_exists':
          return fieldVal === null || fieldVal === undefined;

        case 'eq': {
          if (fieldVal === null || fieldVal === undefined) return false;
          if (typeof fieldVal === 'string' && typeof value === 'string' && !case_sensitive) {
            return fieldVal.toLowerCase() === value.toLowerCase();
          }
          return fieldVal === value;
        }

        case 'neq': {
          if (fieldVal === null || fieldVal === undefined) return false;
          if (typeof fieldVal === 'string' && typeof value === 'string' && !case_sensitive) {
            return fieldVal.toLowerCase() !== value.toLowerCase();
          }
          return fieldVal !== value;
        }

        case 'gt':
          return typeof fieldVal === 'number' && typeof value === 'number' && fieldVal > value;

        case 'gte':
          return typeof fieldVal === 'number' && typeof value === 'number' && fieldVal >= value;

        case 'lt':
          return typeof fieldVal === 'number' && typeof value === 'number' && fieldVal < value;

        case 'lte':
          return typeof fieldVal === 'number' && typeof value === 'number' && fieldVal <= value;

        case 'in':
          return Array.isArray(value) && fieldVal !== null && fieldVal !== undefined && value.includes(fieldVal);

        case 'not_in':
          return Array.isArray(value) && fieldVal !== null && fieldVal !== undefined && !value.includes(fieldVal);

        case 'contains': {
          if (fieldVal === null || fieldVal === undefined) return false;
          if (typeof fieldVal === 'string' && typeof value === 'string') {
            return case_sensitive
              ? fieldVal.includes(value)
              : fieldVal.toLowerCase().includes(value.toLowerCase());
          }
          if (Array.isArray(fieldVal)) {
            return fieldVal.includes(value);
          }
          return false;
        }

        case 'not_contains': {
          if (fieldVal === null || fieldVal === undefined) return false;
          if (typeof fieldVal === 'string' && typeof value === 'string') {
            return case_sensitive
              ? !fieldVal.includes(value)
              : !fieldVal.toLowerCase().includes(value.toLowerCase());
          }
          if (Array.isArray(fieldVal)) {
            return !fieldVal.includes(value);
          }
          return false;
        }

        case 'matches': {
          if (typeof fieldVal !== 'string') return false;
          try {
            const flags = case_sensitive ? '' : 'i';
            const regex = new RegExp(String(value), flags);
            return regex.test(fieldVal);
          } catch {
            return false;
          }
        }

        case 'not_matches': {
          if (typeof fieldVal !== 'string') return false;
          try {
            const flags = case_sensitive ? '' : 'i';
            const regex = new RegExp(String(value), flags);
            return !regex.test(fieldVal);
          } catch {
            return false;
          }
        }

        case 'between': {
          if (typeof fieldVal !== 'number' || !Array.isArray(value) || value.length !== 2) return false;
          const [min, max] = value;
          if (typeof min !== 'number' || typeof max !== 'number') return false;
          return fieldVal >= min && fieldVal <= max;
        }

        case 'not_between': {
          if (typeof fieldVal !== 'number' || !Array.isArray(value) || value.length !== 2) return false;
          const [min, max] = value;
          if (typeof min !== 'number' || typeof max !== 'number') return false;
          return fieldVal < min || fieldVal > max;
        }

        case 'subset_of': {
          if (!Array.isArray(fieldVal) || !Array.isArray(value)) return false;
          return fieldVal.every((item) => value.includes(item));
        }

        case 'superset_of': {
          if (!Array.isArray(fieldVal) || !Array.isArray(value)) return false;
          return value.every((item) => fieldVal.includes(item));
        }

        case 'intersects': {
          if (!Array.isArray(fieldVal) || !Array.isArray(value)) return false;
          return fieldVal.some((item) => value.includes(item));
        }
      }
    } catch {
      return false; // Fail-closed
    }
  };
}

/**
 * Computes deterministic RFC 8785 canonical hash of policy (excluding signature).
 * @param {object} policy
 * @returns {string} sha256:hex
 */
export function computePolicyHash(policy) {
  const copy = { ...policy };
  delete copy.signature;
  const canonical = canonicalJson(copy);
  const hash = crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
  return `sha256:${hash}`;
}

/**
 * Compiles a JPL policy into executable rules.
 * PRD 1.8 §5: Deterministic compilation and rule priority sorting.
 * @param {object|string} rawPolicy
 * @param {object} [options]
 * @param {boolean} [options.skipSignatureVerification=false]
 * @param {string} [options.publicKey]
 * @returns {object} Compiled policy
 */
export function compile(rawPolicy, options = {}) {
  let policy = rawPolicy;
  if (typeof policy === 'string') {
    try {
      policy = JSON.parse(policy);
    } catch (e) {
      throw new AppError('INVALID_POLICY_SCHEMA', 422, `INVALID_POLICY_SCHEMA: Malformed JSON: ${e.message}`);
    }
  }

  // Schema validation
  const parseResult = JplPolicySchema.safeParse(policy);
  if (!parseResult.success) {
    const firstIssue = parseResult.error.issues[0]?.message || 'Schema validation failed';
    throw new AppError('INVALID_POLICY_SCHEMA', 422, `INVALID_POLICY_SCHEMA: Policy schema invalid: ${firstIssue}`);
  }

  // Version support check (PRD 1.8 §4.4: 1.0, and 0.9 backward compatibility)
  if (policy.jpl_version !== '1.0' && policy.jpl_version !== '0.9') {
    throw new AppError('UNSUPPORTED_JPL_VERSION', 422, `UNSUPPORTED_JPL_VERSION: Unsupported JPL version: ${policy.jpl_version}`);
  }

  // Check duplicate rule_id
  const seenRuleIds = new Set();
  for (const rule of policy.rules) {
    if (seenRuleIds.has(rule.rule_id)) {
      throw new AppError('DUPLICATE_RULE_ID', 422, `DUPLICATE_RULE_ID: Duplicate rule_id detected: ${rule.rule_id}`);
    }
    seenRuleIds.add(rule.rule_id);
  }

  // Compute canonical hash
  const policy_hash = computePolicyHash(policy);

  // Signature verification if present
  if (policy.signature && !options.skipSignatureVerification && options.publicKey) {
    const rawSig = policy.signature.sig.replace(/^base64:/, '');
    const valid = verifyEd25519(options.publicKey, rawSig, policy_hash);
    if (!valid) {
      throw new AppError('INVALID_POLICY_SIGNATURE', 422, 'INVALID_POLICY_SIGNATURE: Policy signature verification failed');
    }
  }

  // Compile individual rules
  const compiledRules = policy.rules.map((rule) => {
    const compiledConditions = rule.conditions.map(compileCondition);
    return {
      rule_id: rule.rule_id,
      priority: rule.priority,
      description: rule.description,
      outcome: rule.outcome,
      outcome_params: rule.outcome_params || {},
      conditions: rule.conditions,
      evaluate: (input) => compiledConditions.every((condFn) => condFn(input)),
    };
  });

  // Sort rules ascending by priority (1 = highest priority)
  compiledRules.sort((a, b) => a.priority - b.priority);

  return {
    jpl_version: policy.jpl_version,
    policy_id: policy.policy_id,
    policy_name: policy.policy_name,
    metadata: policy.metadata || {},
    rules: compiledRules,
    default_outcome: policy.default_outcome,
    policy_hash,
    signature: policy.signature,
  };
}
