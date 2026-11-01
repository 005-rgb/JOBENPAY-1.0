export const PERMISSIONS = Object.freeze({
  VIEW: 'view',
  EXPORT: 'export',
  MANAGE_MEMBERS: 'manage_members',
  PAYPAL_CREDENTIALS: 'paypal_credentials',
  AGENTS: 'agents',
  DRAFT_MANDATE: 'draft_mandate',
  ACTIVATE_MANDATE: 'activate_mandate',
  SUSPEND_MANDATE: 'suspend_mandate',
  REVOKE_MANDATE: 'revoke_mandate',
  PAYEE_DRAFT: 'payee_draft',
  PAYEE_TRUST: 'payee_trust',
  UPLOAD: 'upload',
  SIMULATOR: 'simulator',
  APPROVE_REJECT: 'approve_reject',
  KILL_SWITCH: 'kill_switch',
  DELETE_DOCUMENT: 'delete_document',
  DELETE_ORG: 'delete_org',
});

export const PERMISSION_MATRIX = Object.freeze({
  OWNER: Object.values(PERMISSIONS),
  ADMIN: [
    PERMISSIONS.VIEW,
    PERMISSIONS.EXPORT,
    PERMISSIONS.MANAGE_MEMBERS,
    PERMISSIONS.AGENTS,
    PERMISSIONS.DRAFT_MANDATE,
    PERMISSIONS.ACTIVATE_MANDATE,
    PERMISSIONS.SUSPEND_MANDATE,
    PERMISSIONS.REVOKE_MANDATE,
    PERMISSIONS.PAYEE_DRAFT,
    PERMISSIONS.PAYEE_TRUST,
    PERMISSIONS.UPLOAD,
    PERMISSIONS.SIMULATOR,
    PERMISSIONS.APPROVE_REJECT,
    PERMISSIONS.KILL_SWITCH,
  ],
  APPROVER: [
    PERMISSIONS.VIEW,
    PERMISSIONS.EXPORT,
    PERMISSIONS.APPROVE_REJECT,
  ],
  OPERATOR: [
    PERMISSIONS.VIEW,
    PERMISSIONS.AGENTS,
    PERMISSIONS.DRAFT_MANDATE,
    PERMISSIONS.PAYEE_DRAFT,
    PERMISSIONS.UPLOAD,
    PERMISSIONS.SIMULATOR,
  ],
  VIEWER: [PERMISSIONS.VIEW, PERMISSIONS.EXPORT],
  JUDGE: [
    PERMISSIONS.VIEW,
    PERMISSIONS.EXPORT,
    PERMISSIONS.AGENTS,
    PERMISSIONS.DRAFT_MANDATE,
    PERMISSIONS.ACTIVATE_MANDATE,
    PERMISSIONS.SUSPEND_MANDATE,
    PERMISSIONS.REVOKE_MANDATE,
    PERMISSIONS.PAYEE_DRAFT,
    PERMISSIONS.PAYEE_TRUST,
    PERMISSIONS.UPLOAD,
    PERMISSIONS.SIMULATOR,
    PERMISSIONS.APPROVE_REJECT,
    PERMISSIONS.KILL_SWITCH,
    PERMISSIONS.DELETE_DOCUMENT,
  ],
});

export function effectiveRole(membership, orgSlug) {
  if (!membership) return null;
  if (!membership.is_judge) return membership.role;
  return /^jobenpay-demo(?:$|-)/.test(orgSlug || '') ? 'JUDGE' : null;
}

export function hasPermission(role, permission) {
  const normalizedRole = String(role || '').toUpperCase();
  const normalizedPermission = String(permission || '');
  const allowed = PERMISSION_MATRIX[normalizedRole] ?? [];
  return allowed.includes(normalizedPermission);
}
