// @ts-check
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  UserPlus,
  Shield,
  Trash2,
  Mail,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Search,
  Filter,
  X,
  UserCheck,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../api/client.js';
import StepUpDialog from '../components/StepUpDialog.jsx';
import styles from './TransactionPages.module.css';

export default function MembersPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');

  // Modals & Dialogs
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('OPERATOR');

  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [newRole, setNewRole] = useState('VIEWER');

  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState(null);

  const [feedback, setFeedback] = useState({ type: '', message: '' });

  // 1. Fetch Members
  const {
    data: membersData,
    isLoading: isMembersLoading,
    error: membersError,
  } = useQuery({
    queryKey: ['members'],
    queryFn: () => apiClient.get('/members'),
  });

  // 2. Fetch Invitations
  const {
    data: invitationsData,
    isLoading: isInvitationsLoading,
  } = useQuery({
    queryKey: ['members', 'invitations'],
    queryFn: () => apiClient.get('/members/invitations'),
  });

  const members = membersData?.members || [];
  const invitations = invitationsData?.invitations || [];

  // Mutations
  const inviteMutation = useMutation({
    mutationFn: (body) => apiClient.post('/members/invite', body),
    onSuccess: () => {
      setFeedback({ type: 'success', message: 'Invitation sent successfully.' });
      setInviteModalOpen(false);
      setInviteEmail('');
      queryClient.invalidateQueries({ queryKey: ['members', 'invitations'] });
      setTimeout(() => setFeedback({ type: '', message: '' }), 4000);
    },
    onError: (err) => {
      setFeedback({ type: 'error', message: err.message || 'Failed to send invitation.' });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }) => apiClient.patch(`/members/${userId}/role`, { role }),
    onSuccess: () => {
      setFeedback({ type: 'success', message: 'Member role updated successfully.' });
      setRoleModalOpen(false);
      setSelectedMember(null);
      queryClient.invalidateQueries({ queryKey: ['members'] });
      setTimeout(() => setFeedback({ type: '', message: '' }), 4000);
    },
    onError: (err) => {
      setFeedback({ type: 'error', message: err.message || 'Failed to update member role.' });
    },
  });

  const removeMutation = useMutation({
    mutationFn: ({ userId, stepUpGrant }) =>
      apiClient.delete(`/members/${userId}`, undefined, { stepUpGrant }),
    onSuccess: () => {
      setFeedback({ type: 'success', message: 'Member removed successfully.' });
      setMemberToRemove(null);
      setStepUpOpen(false);
      queryClient.invalidateQueries({ queryKey: ['members'] });
      setTimeout(() => setFeedback({ type: '', message: '' }), 4000);
    },
    onError: (err) => {
      setFeedback({ type: 'error', message: err.message || 'Failed to remove member.' });
    },
  });

  const revokeInvitationMutation = useMutation({
    mutationFn: (invitationId) => apiClient.delete(`/members/invitations/${invitationId}`),
    onSuccess: () => {
      setFeedback({ type: 'success', message: 'Invitation revoked.' });
      queryClient.invalidateQueries({ queryKey: ['members', 'invitations'] });
      setTimeout(() => setFeedback({ type: '', message: '' }), 4000);
    },
    onError: (err) => {
      setFeedback({ type: 'error', message: err.message || 'Failed to revoke invitation.' });
    },
  });

  // Filtered members
  const filteredMembers = members.filter((m) => {
    const matchesSearch =
      !searchQuery.trim() ||
      (m.display_name && m.display_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (m.email && m.email.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesRole = roleFilter === 'ALL' || m.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const handleOpenRemove = (member) => {
    if (member.role === 'OWNER') {
      setFeedback({ type: 'error', message: 'The organization owner cannot be removed.' });
      return;
    }
    setMemberToRemove(member);
    setStepUpOpen(true);
  };

  const handleStepUpConfirm = async (grantId) => {
    if (!memberToRemove) return;
    try {
      await removeMutation.mutateAsync({ userId: memberToRemove.user_id, stepUpGrant: grantId });
    } catch {
      // Handled in onError
    }
  };

  return (
    <div className={styles.pageStack}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitleGroup}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Users size={24} style={{ color: 'var(--jp-text)' }} />
            <h1 className={styles.pageTitle}>Team Members & Permissions</h1>
          </div>
          <p className={styles.pageSubtitle}>
            Manage workspace roles (Owner, Admin, Approver, Operator, Viewer) and access privileges.
          </p>
        </div>

        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.primaryLink}
            onClick={() => setInviteModalOpen(true)}
            style={{ border: 'none', cursor: 'pointer' }}
          >
            <UserPlus size={16} />
            <span>Invite Member</span>
          </button>
        </div>
      </div>

      {feedback.message && (
        <div className={feedback.type === 'success' ? styles.successBanner : styles.errorBanner}>
          {feedback.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--jp-text-muted)' }} />
          <input
            className={styles.fieldInput}
            style={{ paddingLeft: '36px' }}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or email..."
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Filter size={16} style={{ color: 'var(--jp-text-muted)' }} />
          <select
            className={styles.fieldSelect}
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            style={{ minWidth: '140px' }}
          >
            <option value="ALL">All Roles</option>
            <option value="OWNER">Owner</option>
            <option value="ADMIN">Admin</option>
            <option value="APPROVER">Approver</option>
            <option value="OPERATOR">Operator</option>
            <option value="VIEWER">Viewer</option>
          </select>
        </div>
      </div>

      {/* Active Members Table */}
      <div className={styles.tableCard}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--jp-border)' }}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold' }}>Active Members ({filteredMembers.length})</h3>
        </div>

        <div className={styles.tableScroll}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last Login</th>
                <th>Joined</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isMembersLoading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '32px' }}>
                    <Loader2 className="animate-spin" size={24} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '8px' }} />
                    Loading team members...
                  </td>
                </tr>
              ) : filteredMembers.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: 'var(--jp-text-muted)' }}>
                    No members found matching your search.
                  </td>
                </tr>
              ) : (
                filteredMembers.map((member) => (
                  <tr key={member.user_id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            background: 'var(--jp-blue-dark)',
                            color: 'white',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 'bold',
                            fontSize: '13px',
                          }}
                        >
                          {(member.display_name || member.email || 'U')[0].toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: '600' }}>{member.display_name || 'Unnamed User'}</div>
                          <div style={{ fontSize: '12px', color: 'var(--jp-text-muted)' }}>{member.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span
                        className={styles.statusPill}
                        style={{
                          background: member.role === 'OWNER' ? 'rgba(99, 102, 241, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                          color: member.role === 'OWNER' ? '#818cf8' : '#38bdf8',
                          fontWeight: 'bold',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                        }}
                      >
                        {member.role}
                      </span>
                    </td>
                    <td>
                      <span
                        className={styles.statusPill}
                        style={{
                          background: member.status === 'ACTIVE' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                          color: member.status === 'ACTIVE' ? '#10b981' : '#f87171',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                        }}
                      >
                        {member.status || 'ACTIVE'}
                      </span>
                    </td>
                    <td style={{ fontSize: '13px', color: 'var(--jp-text-muted)' }}>
                      {member.last_login_at ? new Date(member.last_login_at).toLocaleString() : 'Never'}
                    </td>
                    <td style={{ fontSize: '13px', color: 'var(--jp-text-muted)' }}>
                      {member.joined_at ? new Date(member.joined_at).toLocaleDateString() : '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {member.role !== 'OWNER' && (
                        <div style={{ display: 'inline-flex', gap: '8px' }}>
                          <button
                            type="button"
                            className={styles.secondaryLink}
                            onClick={() => {
                              setSelectedMember(member);
                              setNewRole(member.role);
                              setRoleModalOpen(true);
                            }}
                            style={{ padding: '4px 8px', fontSize: '12px', border: '1px solid var(--jp-border)' }}
                          >
                            Edit Role
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenRemove(member)}
                            style={{
                              padding: '4px 8px',
                              fontSize: '12px',
                              background: 'transparent',
                              border: '1px solid #ef4444',
                              color: '#ef4444',
                              borderRadius: '4px',
                              cursor: 'pointer',
                            }}
                          >
                            <Trash2 size={13} style={{ verticalAlign: 'middle' }} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pending Invitations Table */}
      <div className={styles.tableCard}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--jp-border)' }}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold' }}>
            Pending Invitations ({invitations.length})
          </h3>
        </div>

        <div className={styles.tableScroll}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th>Invited Email</th>
                <th>Assigned Role</th>
                <th>Expires At</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isInvitationsLoading ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '24px' }}>
                    Loading invitations...
                  </td>
                </tr>
              ) : invitations.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: 'var(--jp-text-muted)' }}>
                    No pending invitations.
                  </td>
                </tr>
              ) : (
                invitations.map((inv) => (
                  <tr key={inv.invitation_id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Mail size={16} style={{ color: 'var(--jp-text-muted)' }} />
                        <span style={{ fontWeight: '500' }}>{inv.email}</span>
                      </div>
                    </td>
                    <td>
                      <span style={{ fontWeight: 'bold', fontSize: '11px', color: '#38bdf8' }}>
                        {inv.role}
                      </span>
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--jp-text-muted)' }}>
                      {new Date(inv.expires_at).toLocaleString()}
                    </td>
                    <td>
                      <span style={{ fontSize: '12px', color: '#f59e0b' }}>
                        {inv.status || 'PENDING'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() => revokeInvitationMutation.mutate(inv.invitation_id)}
                        disabled={revokeInvitationMutation.isPending}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#ef4444',
                          cursor: 'pointer',
                          fontSize: '12px',
                        }}
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invite Member Modal */}
      {inviteModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
        >
          <div
            className={styles.formCard}
            style={{ maxWidth: '440px', width: '100%', background: 'var(--jp-surface-card)', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold' }}>Invite New Team Member</h3>
              <button
                type="button"
                onClick={() => setInviteModalOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--jp-text-muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                inviteMutation.mutate({ email: inviteEmail.trim(), role: inviteRole });
              }}
              className={styles.pageStack}
            >
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="inviteEmail">Email Address *</label>
                <input
                  id="inviteEmail"
                  type="email"
                  className={styles.fieldInput}
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colleague@example.com"
                  required
                />
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="inviteRole">Role</label>
                <select
                  id="inviteRole"
                  className={styles.fieldSelect}
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                >
                  <option value="ADMIN">Admin (Full administrative access)</option>
                  <option value="APPROVER">Approver (Can approve/reject payment intents)</option>
                  <option value="OPERATOR">Operator (Can propose payments and run simulator)</option>
                  <option value="VIEWER">Viewer (Read-only visibility)</option>
                </select>
              </div>

              <div className={styles.formActions} style={{ justifyContent: 'flex-end', marginTop: '12px' }}>
                <button
                  type="button"
                  className={styles.secondaryLink}
                  onClick={() => setInviteModalOpen(false)}
                  style={{ border: '1px solid var(--jp-border)', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.primaryLink}
                  disabled={inviteMutation.isPending || !inviteEmail.trim()}
                  style={{ border: 'none', cursor: inviteMutation.isPending ? 'not-allowed' : 'pointer' }}
                >
                  {inviteMutation.isPending ? <Loader2 className="animate-spin" size={16} /> : <UserPlus size={16} />}
                  <span>Send Invitation</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change Role Modal */}
      {roleModalOpen && selectedMember && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
        >
          <div
            className={styles.formCard}
            style={{ maxWidth: '420px', width: '100%', background: 'var(--jp-surface-card)', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold' }}>Change Member Role</h3>
              <button
                type="button"
                onClick={() => setRoleModalOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--jp-text-muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--jp-text-muted)', marginBottom: '16px' }}>
              Updating role for <strong>{selectedMember.display_name || selectedMember.email}</strong>.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateRoleMutation.mutate({ userId: selectedMember.user_id, role: newRole });
              }}
              className={styles.pageStack}
            >
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="newRoleSelect">Assign Role</label>
                <select
                  id="newRoleSelect"
                  className={styles.fieldSelect}
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                >
                  <option value="ADMIN">Admin</option>
                  <option value="APPROVER">Approver</option>
                  <option value="OPERATOR">Operator</option>
                  <option value="VIEWER">Viewer</option>
                </select>
              </div>

              <div className={styles.formActions} style={{ justifyContent: 'flex-end', marginTop: '12px' }}>
                <button
                  type="button"
                  className={styles.secondaryLink}
                  onClick={() => setRoleModalOpen(false)}
                  style={{ border: '1px solid var(--jp-border)', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.primaryLink}
                  disabled={updateRoleMutation.isPending || newRole === selectedMember.role}
                  style={{ border: 'none', cursor: updateRoleMutation.isPending ? 'not-allowed' : 'pointer' }}
                >
                  {updateRoleMutation.isPending ? <Loader2 className="animate-spin" size={16} /> : <UserCheck size={16} />}
                  <span>Update Role</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Strong Customer Authentication for Removing Member */}
      <StepUpDialog
        open={stepUpOpen}
        purpose="REMOVE_MEMBER"
        onOpenChange={setStepUpOpen}
        onConfirm={handleStepUpConfirm}
        description={`Removing member "${memberToRemove?.display_name || memberToRemove?.email}" will permanently revoke their access. Enter your password to confirm.`}
      />
    </div>
  );
}
