import test from 'node:test';
import assert from 'node:assert/strict';

import { effectiveRole, hasPermission, PERMISSIONS } from '../../src/auth/permissions.js';

const expectedPermissions = {
  OWNER: [
    'VIEW', 'EXPORT', 'MANAGE_MEMBERS', 'PAYPAL_CREDENTIALS', 'AGENTS', 'DRAFT_MANDATE',
    'ACTIVATE_MANDATE', 'SUSPEND_MANDATE', 'REVOKE_MANDATE', 'PAYEE_DRAFT', 'PAYEE_TRUST',
    'UPLOAD', 'SIMULATOR', 'APPROVE_REJECT', 'KILL_SWITCH', 'DELETE_DOCUMENT', 'DELETE_ORG',
  ],
  ADMIN: [
    'VIEW', 'EXPORT', 'MANAGE_MEMBERS', 'AGENTS', 'DRAFT_MANDATE', 'ACTIVATE_MANDATE',
    'SUSPEND_MANDATE', 'REVOKE_MANDATE', 'PAYEE_DRAFT', 'PAYEE_TRUST', 'UPLOAD', 'SIMULATOR',
    'APPROVE_REJECT', 'KILL_SWITCH',
  ],
  APPROVER: ['VIEW', 'EXPORT', 'APPROVE_REJECT'],
  OPERATOR: ['VIEW', 'AGENTS', 'DRAFT_MANDATE', 'PAYEE_DRAFT', 'UPLOAD', 'SIMULATOR'],
  VIEWER: ['VIEW', 'EXPORT'],
  JUDGE: [
    'VIEW', 'EXPORT', 'AGENTS', 'DRAFT_MANDATE', 'ACTIVATE_MANDATE', 'SUSPEND_MANDATE',
    'REVOKE_MANDATE', 'PAYEE_DRAFT', 'PAYEE_TRUST', 'UPLOAD', 'SIMULATOR',
    'APPROVE_REJECT', 'KILL_SWITCH', 'DELETE_DOCUMENT',
  ],
};

test('permission matrix matches PRD 13.3 for every role and Tier A permission', () => {
  const permissionNames = Object.keys(PERMISSIONS);

  for (const [role, allowedNames] of Object.entries(expectedPermissions)) {
    for (const permissionName of permissionNames) {
      const expected = allowedNames.includes(permissionName);
      assert.equal(
        hasPermission(role, PERMISSIONS[permissionName]),
        expected,
        `${role} ${expected ? 'must allow' : 'must deny'} ${permissionName}`,
      );
    }
  }
});

test('permission lookup rejects unknown roles and permissions', () => {
  assert.equal(hasPermission('UNKNOWN', PERMISSIONS.VIEW), false);
  assert.equal(hasPermission('OWNER', 'unknown'), false);
});

test('JUDGE is scoped to the demo organization', () => {
  const judgeMembership = { role: 'OWNER', is_judge: true };
  assert.equal(effectiveRole(judgeMembership, 'jobenpay-demo'), 'JUDGE');
  assert.equal(effectiveRole(judgeMembership, 'another-org'), null);
  assert.equal(effectiveRole({ role: 'OWNER', is_judge: false }, 'another-org'), 'OWNER');
});
