// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { generateEd25519Keys, signEd25519 } from '../server/src/lib/crypto.js';
import { computePolicyHash } from '../server/src/services/jpl_compiler.js';

const targetDir = path.resolve(process.cwd(), 'public/vectors/jpl');
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

const keys = generateEd25519Keys();

// 1. valid_policy_minimal
const vec1 = {
  vector_name: 'valid_policy_minimal',
  category: 'SCHEMA',
  expected_result: 'VALID',
  policy: {
    jpl_version: '1.0',
    policy_id: 'pol_01HX4Z8K9M2N3P4Q5R6S7T8V01',
    policy_name: 'Minimal Policy',
    rules: [
      {
        rule_id: 'rule_default_deny',
        priority: 1,
        conditions: [{ field: 'request.category', operator: 'eq', value: 'PAYOUT' }],
        outcome: 'PERMIT',
      },
    ],
    default_outcome: 'DENY',
  },
};

// 2. valid_policy_full
const baseVec2 = {
  jpl_version: '1.0',
  policy_id: 'pol_01HX4Z8K9M2N3P4Q5R6S7T8V02',
  policy_name: 'Full Payout Policy',
  metadata: {
    description: 'Comprehensive test policy',
    author: 'Compliance Team',
    created_at: '2026-11-07T10:00:00Z',
    tags: ['payout', 'conformance'],
  },
  rules: [
    {
      rule_id: 'rule_deny_blocked',
      priority: 1,
      description: 'Block payees that are marked BLOCKED',
      conditions: [{ field: 'counterparty.trust', operator: 'eq', value: 'BLOCKED' }],
      outcome: 'DENY',
      outcome_params: { reason_code: 'PAYEE_BLOCKED' },
    },
    {
      rule_id: 'rule_permit_trusted',
      priority: 10,
      description: 'Permit trusted payees',
      conditions: [{ field: 'counterparty.trust', operator: 'eq', value: 'TRUSTED' }],
      outcome: 'PERMIT',
      outcome_params: { reason_code: 'PAYEE_TRUSTED' },
    },
  ],
  default_outcome: 'DENY',
};
const hash2 = computePolicyHash(baseVec2);
const sig2 = signEd25519(keys.privateKey, hash2);
baseVec2.signature = {
  alg: 'Ed25519',
  kid: 'kid_test_key_01',
  sig: `base64:${sig2}`,
};
const vec2 = {
  vector_name: 'valid_policy_full',
  category: 'SCHEMA',
  expected_result: 'VALID',
  policy: baseVec2,
  public_key: keys.publicKey,
};

// 3. invalid_policy_missing_version
const vec3 = {
  vector_name: 'invalid_policy_missing_version',
  category: 'SCHEMA',
  expected_result: 'INVALID',
  policy: {
    policy_id: 'pol_01HX4Z8K9M2N3P4Q5R6S7T8V03',
    policy_name: 'Missing Version Policy',
    rules: [
      {
        rule_id: 'rule_1',
        priority: 1,
        conditions: [{ field: 'request.category', operator: 'eq', value: 'PAYOUT' }],
        outcome: 'PERMIT',
      },
    ],
    default_outcome: 'DENY',
  },
};

// 4. invalid_policy_unknown_operator
const vec4 = {
  vector_name: 'invalid_policy_unknown_operator',
  category: 'SCHEMA',
  expected_result: 'INVALID',
  policy: {
    jpl_version: '1.0',
    policy_id: 'pol_01HX4Z8K9M2N3P4Q5R6S7T8V04',
    policy_name: 'Unknown Operator Policy',
    rules: [
      {
        rule_id: 'rule_1',
        priority: 1,
        conditions: [{ field: 'request.category', operator: 'unknown_magic_op', value: 'PAYOUT' }],
        outcome: 'PERMIT',
      },
    ],
    default_outcome: 'DENY',
  },
};

// 5. invalid_policy_duplicate_rule_id
const vec5 = {
  vector_name: 'invalid_policy_duplicate_rule_id',
  category: 'SCHEMA',
  expected_result: 'INVALID',
  policy: {
    jpl_version: '1.0',
    policy_id: 'pol_01HX4Z8K9M2N3P4Q5R6S7T8V05',
    policy_name: 'Duplicate Rule Policy',
    rules: [
      {
        rule_id: 'rule_duplicate_id',
        priority: 1,
        conditions: [{ field: 'request.category', operator: 'eq', value: 'PAYOUT' }],
        outcome: 'PERMIT',
      },
      {
        rule_id: 'rule_duplicate_id',
        priority: 2,
        conditions: [{ field: 'request.category', operator: 'eq', value: 'SALE' }],
        outcome: 'DENY',
      },
    ],
    default_outcome: 'DENY',
  },
};

// 6. eval_permit_simple
const vec6 = {
  vector_name: 'eval_permit_simple',
  category: 'SEMANTICS',
  expected_result: 'PERMIT',
  policy: {
    jpl_version: '1.0',
    policy_id: 'pol_01HX4Z8K9M2N3P4Q5R6S7T8V06',
    policy_name: 'Simple Permit Policy',
    rules: [
      {
        rule_id: 'rule_permit_match',
        priority: 1,
        conditions: [{ field: 'request.amount_minor', operator: 'lt', value: 50000 }],
        outcome: 'PERMIT',
      },
    ],
    default_outcome: 'DENY',
  },
  input: { request: { amount_minor: 25000 } },
};

// 7. eval_deny_simple
const vec7 = {
  vector_name: 'eval_deny_simple',
  category: 'SEMANTICS',
  expected_result: 'DENY',
  policy: {
    jpl_version: '1.0',
    policy_id: 'pol_01HX4Z8K9M2N3P4Q5R6S7T8V07',
    policy_name: 'Simple Deny Policy',
    rules: [
      {
        rule_id: 'rule_deny_match',
        priority: 1,
        conditions: [{ field: 'request.amount_minor', operator: 'gte', value: 50000 }],
        outcome: 'DENY',
        outcome_params: { reason_code: 'CAP_EXCEEDED' },
      },
    ],
    default_outcome: 'PERMIT',
  },
  input: { request: { amount_minor: 60000 } },
};

// 8. eval_explicit_deny_precedence
const vec8 = {
  vector_name: 'eval_explicit_deny_precedence',
  category: 'SEMANTICS',
  expected_result: 'DENY',
  policy: {
    jpl_version: '1.0',
    policy_id: 'pol_01HX4Z8K9M2N3P4Q5R6S7T8V08',
    policy_name: 'Explicit Deny Precedence Policy',
    rules: [
      {
        rule_id: 'rule_permit_higher_prio',
        priority: 1,
        conditions: [{ field: 'request.category', operator: 'eq', value: 'PAYOUT' }],
        outcome: 'PERMIT',
      },
      {
        rule_id: 'rule_deny_lower_prio',
        priority: 2,
        conditions: [{ field: 'org.frozen', operator: 'eq', value: true }],
        outcome: 'DENY',
        outcome_params: { reason_code: 'ORG_FROZEN' },
      },
    ],
    default_outcome: 'REQUIRE_APPROVAL',
  },
  input: { request: { category: 'PAYOUT' }, org: { frozen: true } },
};

// 9. eval_default_outcome
const vec9 = {
  vector_name: 'eval_default_outcome',
  category: 'SEMANTICS',
  expected_result: 'REQUIRE_APPROVAL',
  policy: {
    jpl_version: '1.0',
    policy_id: 'pol_01HX4Z8K9M2N3P4Q5R6S7T8V09',
    policy_name: 'Default Outcome Policy',
    rules: [
      {
        rule_id: 'rule_no_match',
        priority: 1,
        conditions: [{ field: 'request.category', operator: 'eq', value: 'FINANCING' }],
        outcome: 'PERMIT',
      },
    ],
    default_outcome: 'REQUIRE_APPROVAL',
  },
  input: { request: { category: 'DEBIT' } },
};

// 10. eval_field_missing
const vec10 = {
  vector_name: 'eval_field_missing',
  category: 'SEMANTICS',
  expected_result: 'DENY',
  policy: {
    jpl_version: '1.0',
    policy_id: 'pol_01HX4Z8K9M2N3P4Q5R6S7T8V10',
    policy_name: 'Missing Field Fail Closed Policy',
    rules: [
      {
        rule_id: 'rule_on_missing_field',
        priority: 1,
        conditions: [{ field: 'unresolved.deeply.nested.field', operator: 'eq', value: 'test' }],
        outcome: 'PERMIT',
      },
    ],
    default_outcome: 'DENY',
  },
  input: { request: { category: 'PAYOUT' } },
};

// 11. eval_type_mismatch
const vec11 = {
  vector_name: 'eval_type_mismatch',
  category: 'SEMANTICS',
  expected_result: 'DENY',
  policy: {
    jpl_version: '1.0',
    policy_id: 'pol_01HX4Z8K9M2N3P4Q5R6S7T8V11',
    policy_name: 'Type Mismatch Fail Closed Policy',
    rules: [
      {
        rule_id: 'rule_numeric_compare_on_string',
        priority: 1,
        conditions: [{ field: 'request.amount_minor', operator: 'gt', value: 1000 }],
        outcome: 'PERMIT',
      },
    ],
    default_outcome: 'DENY',
  },
  input: { request: { amount_minor: 'one_thousand_string_value' } },
};

// 12. eval_operator_in
const vec12 = {
  vector_name: 'eval_operator_in',
  category: 'SEMANTICS',
  expected_result: 'PERMIT',
  policy: {
    jpl_version: '1.0',
    policy_id: 'pol_01HX4Z8K9M2N3P4Q5R6S7T8V12',
    policy_name: 'In Operator Policy',
    rules: [
      {
        rule_id: 'rule_in_categories',
        priority: 1,
        conditions: [{ field: 'request.category', operator: 'in', value: ['SALE', 'PAYOUT', 'INVOICE'] }],
        outcome: 'PERMIT',
      },
    ],
    default_outcome: 'DENY',
  },
  input: { request: { category: 'PAYOUT' } },
};

// 13. eval_operator_between
const vec13 = {
  vector_name: 'eval_operator_between',
  category: 'SEMANTICS',
  expected_result: 'PERMIT',
  policy: {
    jpl_version: '1.0',
    policy_id: 'pol_01HX4Z8K9M2N3P4Q5R6S7T8V13',
    policy_name: 'Between Operator Policy',
    rules: [
      {
        rule_id: 'rule_between_range',
        priority: 1,
        conditions: [{ field: 'request.amount_minor', operator: 'between', value: [1000, 50000] }],
        outcome: 'PERMIT',
      },
    ],
    default_outcome: 'DENY',
  },
  input: { request: { amount_minor: 25000 } },
};

// 14. eval_operator_matches
const vec14 = {
  vector_name: 'eval_operator_matches',
  category: 'SEMANTICS',
  expected_result: 'PERMIT',
  policy: {
    jpl_version: '1.0',
    policy_id: 'pol_01HX4Z8K9M2N3P4Q5R6S7T8V14',
    policy_name: 'Matches Operator Policy',
    rules: [
      {
        rule_id: 'rule_matches_vendor',
        priority: 1,
        conditions: [{ field: 'counterparty.name', operator: 'matches', value: '^acme-(corp|ltd)$' }],
        outcome: 'PERMIT',
      },
    ],
    default_outcome: 'DENY',
  },
  input: { counterparty: { name: 'acme-corp' } },
};

// 15. eval_operator_subset_of
const vec15 = {
  vector_name: 'eval_operator_subset_of',
  category: 'SEMANTICS',
  expected_result: 'PERMIT',
  policy: {
    jpl_version: '1.0',
    policy_id: 'pol_01HX4Z8K9M2N3P4Q5R6S7T8V15',
    policy_name: 'Subset Operator Policy',
    rules: [
      {
        rule_id: 'rule_subset_check',
        priority: 1,
        conditions: [{ field: 'agent.permissions', operator: 'subset_of', value: ['READ', 'PROPOSE', 'SIMULATE', 'PAY'] }],
        outcome: 'PERMIT',
      },
    ],
    default_outcome: 'DENY',
  },
  input: { agent: { permissions: ['READ', 'PROPOSE'] } },
};

// 16. signature_valid
const baseVec16 = {
  jpl_version: '1.0',
  policy_id: 'pol_01HX4Z8K9M2N3P4Q5R6S7T8V16',
  policy_name: 'Valid Signature Policy',
  rules: [
    {
      rule_id: 'rule_1',
      priority: 1,
      conditions: [{ field: 'request.category', operator: 'eq', value: 'PAYOUT' }],
      outcome: 'PERMIT',
    },
  ],
  default_outcome: 'DENY',
};
const hash16 = computePolicyHash(baseVec16);
const sig16 = signEd25519(keys.privateKey, hash16);
baseVec16.signature = {
  alg: 'Ed25519',
  kid: 'kid_test_key_01',
  sig: `base64:${sig16}`,
};
const vec16 = {
  vector_name: 'signature_valid',
  category: 'VERIFY',
  expected_result: 'VALID',
  policy: baseVec16,
  public_key: keys.publicKey,
  expected_hash: hash16,
};

// 17. signature_invalid
const baseVec17 = {
  jpl_version: '1.0',
  policy_id: 'pol_01HX4Z8K9M2N3P4Q5R6S7T8V17',
  policy_name: 'Invalid Signature Policy',
  rules: [
    {
      rule_id: 'rule_1',
      priority: 1,
      conditions: [{ field: 'request.category', operator: 'eq', value: 'PAYOUT' }],
      outcome: 'PERMIT',
    },
  ],
  default_outcome: 'DENY',
  signature: {
    alg: 'Ed25519',
    kid: 'kid_test_key_01',
    sig: 'base64:' + Buffer.alloc(64, 9).toString('base64'),
  },
};
const vec17 = {
  vector_name: 'signature_invalid',
  category: 'VERIFY',
  expected_result: 'INVALID',
  policy: baseVec17,
  public_key: keys.publicKey,
};

// 18. hash_mismatch
const vec18 = {
  vector_name: 'hash_mismatch',
  category: 'VERIFY',
  expected_result: 'INVALID',
  policy: baseVec16,
  public_key: keys.publicKey,
  expected_hash: 'sha256:' + 'f'.repeat(64),
};

// 19. unsupported_version
const vec19 = {
  vector_name: 'unsupported_version',
  category: 'VERSION',
  expected_result: 'ERROR',
  policy: {
    jpl_version: '2.0',
    policy_id: 'pol_01HX4Z8K9M2N3P4Q5R6S7T8V19',
    policy_name: 'Future Version Policy',
    rules: [
      {
        rule_id: 'rule_1',
        priority: 1,
        conditions: [{ field: 'request.category', operator: 'eq', value: 'PAYOUT' }],
        outcome: 'PERMIT',
      },
    ],
    default_outcome: 'DENY',
  },
};

// 20. backward_compatible_v0_9
const vec20 = {
  vector_name: 'backward_compatible_v0_9',
  category: 'VERSION',
  expected_result: 'VALID',
  policy: {
    jpl_version: '0.9',
    policy_id: 'pol_01HX4Z8K9M2N3P4Q5R6S7T8V20',
    policy_name: 'Legacy v0.9 Policy',
    rules: [
      {
        rule_id: 'rule_1',
        priority: 1,
        conditions: [{ field: 'request.category', operator: 'eq', value: 'PAYOUT' }],
        outcome: 'PERMIT',
      },
    ],
    default_outcome: 'DENY',
  },
};

const allVectors = [
  vec1, vec2, vec3, vec4, vec5,
  vec6, vec7, vec8, vec9, vec10,
  vec11, vec12, vec13, vec14, vec15,
  vec16, vec17, vec18, vec19, vec20,
];

for (let i = 0; i < allVectors.length; i++) {
  const v = allVectors[i];
  const num = String(i + 1).padStart(2, '0');
  const filename = `${num}_${v.vector_name}.json`;
  fs.writeFileSync(path.join(targetDir, filename), JSON.stringify(v, null, 2), 'utf8');
}

console.log(`Generated all 20 JPL conformance vectors in ${targetDir}`);
