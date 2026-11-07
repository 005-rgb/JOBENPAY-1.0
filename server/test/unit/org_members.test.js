/**
 * server/test/unit/org_members.test.js
 * ADENDUM-01 (PRD 1.4) — Organization & Member Management Test Suite
 * Tests 100% coverage of organization_service and member_service, plus API contracts & RBAC.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pool from '../../src/db/pool.js';
import { startTestApp } from '../helpers/testApp.js';
import { createSession } from '../../src/repositories/sessions.js';
import { AppError } from '../../src/lib/errors.js';
import {
  getOrgProfile,
  updateOrgProfile,
  updateOrgLogo,
} from '../../src/services/organization_service.js';
import {
  listMembers,
  inviteMember,
  updateMemberRole,
  removeMember,
  listInvitations,
  revokeInvitation,
} from '../../src/services/member_service.js';
import { validateStepUp } from '../../src/services/sca_service.js';

async function createOrgAndUser(slugPrefix, role = 'OWNER') {
  const orgId = crypto.randomUUID();
  const slug = `${slugPrefix}-${orgId.slice(0, 8)}`;
  await pool.query(
    'INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3)',
    [orgId, `Org ${slugPrefix}`, slug],
  );

  const userId = crypto.randomUUID();
  const email = `${role.toLowerCase()}-${slug}@jobenpay.test`;
  await pool.query(
    'INSERT INTO users (id, email, password_hash, display_name, email_verified_at) VALUES ($1, $2, $3, $4, now())',
    [userId, email, 'hash123', `${role} User`],
  );

  await pool.query(
    'INSERT INTO memberships (org_id, user_id, role, is_judge) VALUES ($1, $2, $3, $4)',
    [orgId, userId, role, false],
  );

  const csrfToken = crypto.randomUUID();
  const sessionResult = await createSession(orgId, {
    userId,
    currentOrgId: orgId,
    csrfSecret: csrfToken,
    expiresAt: new Date(Date.now() + 2 * 3600 * 1000),
  });

  return {
    orgId,
    userId,
    email,
    sessionId: sessionResult.session.id,
    headers: {
      'content-type': 'application/json',
      'Cookie': `jp_sid=${sessionResult.token}`,
      'x-csrf-token': csrfToken,
    },
  };
}

async function createStepUpGrant(userId, sessionId, purpose) {
  const grantId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO step_up_grants (id, user_id, session_id, purpose, expires_at)
     VALUES ($1, $2, $3, $4, now() + interval '10 minutes')`,
    [grantId, userId, sessionId, purpose],
  );
  return grantId;
}

test('ADENDUM-01 (PRD 1.4) Organization & Member Management Suite', async (t) => {
  const { server, url } = await startTestApp();

  // -------------------------------------------------------------
  // 5.1 Organization Tests
  // -------------------------------------------------------------
  await t.test('test_get_org_profile: GET /api/v1/org/profile returns valid profile data', async () => {
    const { headers, orgId } = await createOrgAndUser('org-profile-get', 'OWNER');

    const res = await fetch(`${url}/api/v1/org/profile`, {
      method: 'GET',
      headers,
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.org_id, orgId);
    assert.ok(data.display_name);
    assert.equal(typeof data.address, 'object');
  });

  await t.test('test_update_org_profile: PATCH /api/v1/org/profile updates display_name and address', async () => {
    const { headers, orgId } = await createOrgAndUser('org-profile-patch', 'ADMIN');

    const updatePayload = {
      display_name: 'Acme Corporation HQ',
      legal_name: 'Acme Corporation LLC',
      website_url: 'https://acme.example.test',
      support_email: 'support@acme.example.test',
      tax_id: '12.345.678.9-012.000',
      address: {
        street: 'Jl. Sudirman No. 1',
        city: 'Jakarta',
        state: 'DKI Jakarta',
        postal_code: '10220',
        country: 'ID',
      },
    };

    const res = await fetch(`${url}/api/v1/org/profile`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(updatePayload),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.display_name, 'Acme Corporation HQ');
    assert.equal(data.legal_name, 'Acme Corporation LLC');
    assert.equal(data.address.city, 'Jakarta');
  });

  await t.test('test_update_billing_email_requires_sca: PATCH billing_email without grant returns 403', async () => {
    const { headers } = await createOrgAndUser('org-billing-nosca', 'OWNER');

    const res = await fetch(`${url}/api/v1/org/profile`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ billing_email: 'new-billing@acme.example.test' }),
    });

    assert.equal(res.status, 403);
    const err = await res.json();
    assert.equal(err.code || err.error?.code, 'STEP_UP_REQUIRED');
  });

  await t.test('test_update_billing_email_with_sca: PATCH billing_email with valid grant returns 200', async () => {
    const { headers, userId, sessionId } = await createOrgAndUser('org-billing-sca', 'OWNER');
    const grantId = await createStepUpGrant(userId, sessionId, 'UPDATE_BILLING_EMAIL');

    const res = await fetch(`${url}/api/v1/org/profile`, {
      method: 'PATCH',
      headers: {
        ...headers,
        'x-step-up-grant': grantId,
      },
      body: JSON.stringify({
        billing_email: 'authorized-billing@acme.example.test',
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.billing_email, 'authorized-billing@acme.example.test');
  });

  await t.test('test_org_profile_audit_log: updates write ORG_PROFILE_UPDATED to ledger & audit', async () => {
    const { headers, orgId, userId } = await createOrgAndUser('org-audit-log', 'OWNER');

    await fetch(`${url}/api/v1/org/profile`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ display_name: 'Audit Verified Org' }),
    });

    const auditRes = await pool.query(
      `SELECT * FROM audit_events WHERE org_id = $1 AND action = 'ORG_PROFILE_UPDATED' ORDER BY created_at DESC LIMIT 1`,
      [orgId],
    );
    assert.equal(auditRes.rows.length, 1);
    assert.equal(auditRes.rows[0].actor_id, userId);

    const ledgerRes = await pool.query(
      `SELECT * FROM ledger_entries WHERE org_id = $1 AND type = 'ORG_PROFILE_UPDATED' ORDER BY seq DESC LIMIT 1`,
      [orgId],
    );
    assert.equal(ledgerRes.rows.length, 1);
  });

  await t.test('test_org_profile_rbac: VIEWER accessing /org/profile is rejected with 403', async () => {
    const { headers } = await createOrgAndUser('org-viewer', 'VIEWER');

    const resGet = await fetch(`${url}/api/v1/org/profile`, {
      method: 'GET',
      headers,
    });
    assert.equal(resGet.status, 403);

    const resPatch = await fetch(`${url}/api/v1/org/profile`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ display_name: 'Hacked' }),
    });
    assert.equal(resPatch.status, 403);
  });

  await t.test('test_update_org_logo: POST /api/v1/org/logo updates logo successfully', async () => {
    const { headers, orgId } = await createOrgAndUser('org-logo-update', 'OWNER');

    const res = await fetch(`${url}/api/v1/org/logo`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ logo_url: 'https://cdn.example.test/logos/acme.png' }),
    });

    assert.equal(res.status, 200);
    const profile = await getOrgProfile(orgId);
    assert.equal(profile.logo_url, 'https://cdn.example.test/logos/acme.png');
  });

  // -------------------------------------------------------------
  // 5.2 Member Tests
  // -------------------------------------------------------------
  await t.test('test_list_members: GET /api/v1/members returns member list with user metadata', async () => {
    const { headers, orgId, email } = await createOrgAndUser('members-list', 'OWNER');

    const res = await fetch(`${url}/api/v1/members`, {
      method: 'GET',
      headers,
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.members));
    assert.equal(data.total, 1);
    assert.equal(data.members[0].email, email);
    assert.equal(data.members[0].role, 'OWNER');
    assert.equal(data.members[0].status, 'ACTIVE');
  });

  await t.test('test_invite_member_success: POST /api/v1/members/invite enqueues invite and records pending', async () => {
    const { headers, orgId } = await createOrgAndUser('member-invite-ok', 'OWNER');

    const res = await fetch(`${url}/api/v1/members/invite`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        email: 'collaborator@jobenpay.test',
        role: 'OPERATOR',
      }),
    });

    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.status, 'PENDING');
    assert.equal(data.email, 'collaborator@jobenpay.test');
    assert.equal(data.role, 'OPERATOR');

    // Verify invitation in database
    const invRes = await pool.query(
      `SELECT * FROM invitations WHERE org_id = $1 AND email = $2`,
      [orgId, 'collaborator@jobenpay.test'],
    );
    assert.equal(invRes.rows.length, 1);
    assert.equal(invRes.rows[0].status, 'PENDING');
  });

  await t.test('test_invite_existing_member: POST /api/v1/members/invite for existing member returns 409', async () => {
    const { headers, email } = await createOrgAndUser('member-invite-dup', 'OWNER');

    const res = await fetch(`${url}/api/v1/members/invite`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        email,
        role: 'VIEWER',
      }),
    });

    assert.equal(res.status, 409);
    const err = await res.json();
    assert.equal(err.code || err.error?.code, 'ALREADY_MEMBER');
  });

  await t.test('test_invite_owner_role_fails: Inviting with role OWNER returns 403', async () => {
    const { headers } = await createOrgAndUser('member-invite-owner', 'OWNER');

    const res = await fetch(`${url}/api/v1/members/invite`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        email: 'newowner@jobenpay.test',
        role: 'OWNER',
      }),
    });

    assert.equal(res.status, 403);
    const err = await res.json();
    assert.equal(err.code || err.error?.code, 'CANNOT_INVITE_OWNER');
  });

  await t.test('test_change_member_role: PATCH /api/v1/members/:id/role updates role successfully', async () => {
    const { headers, orgId } = await createOrgAndUser('member-role-change', 'OWNER');

    // Add a secondary member
    const targetUserId = crypto.randomUUID();
    await pool.query(
      'INSERT INTO users (id, email, password_hash, display_name) VALUES ($1, $2, $3, $4)',
      [targetUserId, `target-${targetUserId.slice(0, 8)}@jobenpay.test`, 'pwd', 'Target Member'],
    );
    await pool.query(
      'INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, $3)',
      [orgId, targetUserId, 'OPERATOR'],
    );

    const res = await fetch(`${url}/api/v1/members/${targetUserId}/role`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ role: 'APPROVER' }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.role, 'APPROVER');

    // Check database
    const memRes = await pool.query(
      'SELECT role FROM memberships WHERE org_id = $1 AND user_id = $2',
      [orgId, targetUserId],
    );
    assert.equal(memRes.rows[0].role, 'APPROVER');
  });

  await t.test('test_cannot_change_owner_role: Changing role of OWNER returns 403', async () => {
    const { headers, orgId, userId } = await createOrgAndUser('member-no-change-owner', 'OWNER');

    const res = await fetch(`${url}/api/v1/members/${userId}/role`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ role: 'ADMIN' }),
    });

    assert.equal(res.status, 403);
    const err = await res.json();
    assert.equal(err.code || err.error?.code, 'CANNOT_CHANGE_OWNER_ROLE');
  });

  await t.test('test_remove_member: DELETE /api/v1/members/:id removes non-owner member', async () => {
    const { headers, orgId } = await createOrgAndUser('member-remove-ok', 'OWNER');

    const targetUserId = crypto.randomUUID();
    await pool.query(
      'INSERT INTO users (id, email, password_hash, display_name) VALUES ($1, $2, $3, $4)',
      [targetUserId, `removable-${targetUserId.slice(0, 8)}@jobenpay.test`, 'pwd', 'Removable'],
    );
    await pool.query(
      'INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, $3)',
      [orgId, targetUserId, 'VIEWER'],
    );

    const res = await fetch(`${url}/api/v1/members/${targetUserId}`, {
      method: 'DELETE',
      headers,
    });

    assert.equal(res.status, 204);

    const check = await pool.query(
      'SELECT 1 FROM memberships WHERE org_id = $1 AND user_id = $2',
      [orgId, targetUserId],
    );
    assert.equal(check.rows.length, 0);
  });

  await t.test('test_cannot_remove_owner: Attempting to delete OWNER returns 403', async () => {
    const { headers, orgId, userId } = await createOrgAndUser('member-no-remove-owner', 'OWNER');

    const res = await fetch(`${url}/api/v1/members/${userId}`, {
      method: 'DELETE',
      headers,
    });

    assert.equal(res.status, 403);
    const err = await res.json();
    assert.equal(err.code || err.error?.code, 'CANNOT_REMOVE_OWNER');
  });

  await t.test('test_list_and_revoke_invitations: GET & DELETE /api/v1/members/invitations/:id', async () => {
    const { headers, orgId } = await createOrgAndUser('member-inv-lifecycle', 'OWNER');

    // Invite
    const invRes = await fetch(`${url}/api/v1/members/invite`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email: 'to-revoke@jobenpay.test', role: 'VIEWER' }),
    });
    const invData = await invRes.json();
    const invitationId = invData.invitation_id;

    // List invitations
    const listRes = await fetch(`${url}/api/v1/members/invitations`, {
      method: 'GET',
      headers,
    });
    assert.equal(listRes.status, 200);
    const listData = await listRes.json();
    assert.ok(Array.isArray(listData.invitations));
    assert.ok(listData.invitations.some((i) => i.invitation_id === invitationId));

    // Revoke invitation
    const revokeRes = await fetch(`${url}/api/v1/members/invitations/${invitationId}`, {
      method: 'DELETE',
      headers,
    });
    assert.equal(revokeRes.status, 200);
    const revokeData = await revokeRes.json();
    assert.equal(revokeData.status, 'REVOKED');
  });

  await t.test('test_member_rbac: VIEWER accessing member mutations is rejected with 403', async () => {
    const { headers } = await createOrgAndUser('member-viewer-rbac', 'VIEWER');

    const resList = await fetch(`${url}/api/v1/members`, { method: 'GET', headers });
    assert.equal(resList.status, 403);

    const resInvite = await fetch(`${url}/api/v1/members/invite`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email: 'a@b.com', role: 'VIEWER' }),
    });
    assert.equal(resInvite.status, 403);
  });

  // -------------------------------------------------------------
  // 5.3 Service Edge Cases (100% Coverage Verification)
  // -------------------------------------------------------------
  await t.test('test_service_coverage_edge_cases', async () => {
    const orgId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    await pool.query('INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3)', [orgId, 'Coverage Org', `cov-${orgId.slice(0, 8)}`]);
    await pool.query('INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)', [userId, `cov-${orgId.slice(0, 8)}@test.com`, 'pwd']);
    await pool.query('INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, $3)', [orgId, userId, 'OWNER']);

    // organization_service validation errors
    await assert.rejects(() => getOrgProfile(null), (err) => err.code === 'VALIDATION_FAILED');
    await assert.rejects(() => getOrgProfile(crypto.randomUUID()), (err) => err.code === 'ORG_NOT_FOUND');
    await assert.rejects(() => updateOrgProfile(null, userId, {}), (err) => err.code === 'VALIDATION_FAILED');
    await assert.rejects(() => updateOrgProfile(orgId, null, {}), (err) => err.code === 'VALIDATION_FAILED');
    await assert.rejects(() => updateOrgProfile(orgId, userId, null), (err) => err.code === 'VALIDATION_FAILED');
    await assert.rejects(() => updateOrgProfile(crypto.randomUUID(), userId, {}), (err) => err.code === 'ORG_NOT_FOUND');

    await assert.rejects(() => updateOrgLogo(null, userId, 'http://logo.png'), (err) => err.code === 'VALIDATION_FAILED');
    await assert.rejects(() => updateOrgLogo(orgId, userId, null), (err) => err.code === 'VALIDATION_FAILED');
    await assert.rejects(() => updateOrgLogo(crypto.randomUUID(), userId, 'http://logo.png'), (err) => err.code === 'ORG_NOT_FOUND');

    // member_service validation errors
    await assert.rejects(() => listMembers(null), (err) => err.code === 'VALIDATION_FAILED');
    await assert.rejects(() => inviteMember(null, userId, 'a@b.com', 'ADMIN'), (err) => err.code === 'VALIDATION_FAILED');
    await assert.rejects(() => inviteMember(orgId, userId, null, 'ADMIN'), (err) => err.code === 'VALIDATION_FAILED');
    await assert.rejects(() => inviteMember(orgId, userId, 'a@b.com', null), (err) => err.code === 'VALIDATION_FAILED');
    await assert.rejects(() => inviteMember(orgId, userId, 'a@b.com', 'INVALID_ROLE'), (err) => err.code === 'VALIDATION_FAILED');

    await assert.rejects(() => updateMemberRole(null, userId, 'ADMIN', userId), (err) => err.code === 'VALIDATION_FAILED');
    await assert.rejects(() => updateMemberRole(orgId, userId, null, userId), (err) => err.code === 'VALIDATION_FAILED');
    await assert.rejects(() => updateMemberRole(orgId, userId, 'OWNER', userId), (err) => err.code === 'CANNOT_PROMOTE_TO_OWNER');
    await assert.rejects(() => updateMemberRole(orgId, userId, 'INVALID_ROLE', userId), (err) => err.code === 'VALIDATION_FAILED');
    await assert.rejects(() => updateMemberRole(orgId, crypto.randomUUID(), 'ADMIN', userId), (err) => err.code === 'MEMBER_NOT_FOUND');

    await assert.rejects(() => removeMember(null, userId, userId), (err) => err.code === 'VALIDATION_FAILED');
    await assert.rejects(() => removeMember(orgId, crypto.randomUUID(), userId), (err) => err.code === 'MEMBER_NOT_FOUND');

    await assert.rejects(() => listInvitations(null), (err) => err.code === 'VALIDATION_FAILED');
    await assert.rejects(() => revokeInvitation(null, crypto.randomUUID(), userId), (err) => err.code === 'VALIDATION_FAILED');
    await assert.rejects(() => revokeInvitation(orgId, crypto.randomUUID(), userId), (err) => err.code === 'INVITATION_NOT_FOUND');

    // sca_service step-up validation errors
    await assert.rejects(() => validateStepUp(userId, 'PURPOSE', null), (err) => err.code === 'STEP_UP_REQUIRED');
    await assert.rejects(() => validateStepUp(userId, 'PURPOSE', crypto.randomUUID()), (err) => err.code === 'STEP_UP_INVALID');

    // Test with explicit dbClient
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const p = await getOrgProfile(orgId, client);
      assert.ok(p);
      const m = await listMembers(orgId, client);
      assert.ok(m);
      const invList = await listInvitations(orgId, client);
      assert.ok(Array.isArray(invList));
      const up = await updateOrgProfile(orgId, userId, { display_name: 'Client DB Org' }, client);
      assert.equal(up.display_name, 'Client DB Org');
      const upLogo = await updateOrgLogo(orgId, userId, 'https://client-logo.png', client);
      assert.equal(upLogo.logo_url, 'https://client-logo.png');
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });
});
