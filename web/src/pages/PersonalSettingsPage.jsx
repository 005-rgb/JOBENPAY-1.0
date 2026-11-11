import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  User,
  Shield,
  Bell,
  KeyRound,
  QrCode,
  Laptop,
  Smartphone,
  Globe,
  CheckCircle2,
  AlertTriangle,
  Info,
  Copy,
  Check,
  Eye,
  EyeOff,
  LogOut,
  Building2,
  Mail,
  Briefcase,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import { apiClient } from '../api/client.js';
import { Button, Modal, Skeleton, useToast } from '../components/primitives.jsx';
import { GoogleAuthButton } from '../components/GoogleAuthButton.jsx';
import styles from './SecurityPage.module.css';

export function PersonalSettingsPage() {
  const [activeTab, setActiveTab] = useState('profile');
  const queryClient = useQueryClient();
  const { notify } = useToast();

  // 1. Query Profile
  const {
    data: profileData,
    isLoading: loadingProfile,
    refetch: refetchProfile,
  } = useQuery({
    queryKey: ['me', 'profile'],
    queryFn: async () => {
      const res = await apiClient.get('/me/profile');
      return res.user;
    },
  });

  // 2. Query Sessions
  const {
    data: sessionsData,
    isLoading: loadingSessions,
    refetch: refetchSessions,
  } = useQuery({
    queryKey: ['me', 'sessions'],
    queryFn: async () => {
      const res = await apiClient.get('/me/sessions');
      return res.sessions || [];
    },
  });

  // 3. Query Auth Config (for Google OAuth client ID)
  const { data: authConfig } = useQuery({
    queryKey: ['auth', 'config'],
    queryFn: async () => {
      try {
        return await apiClient.get('/auth/config');
      } catch {
        return { googleClientId: null };
      }
    },
  });
  const googleClientId = authConfig?.googleClientId || null;

  // State: Tab 1 (Profile)
  const [displayName, setDisplayName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');

  useEffect(() => {
    if (profileData) {
      setDisplayName(profileData.display_name || '');
      setJobTitle(profileData.job_title || '');
      setAvatarUrl(profileData.avatar_url || '');
    }
  }, [profileData]);

  // State: Tab 2 (Security - Password)
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [useGoogleVerify, setUseGoogleVerify] = useState(false);

  // State: Tab 2 (Security - 2FA)
  const [is2faModalOpen, setIs2faModalOpen] = useState(false);
  const [twoFaSetupData, setTwoFaSetupData] = useState(null);
  const [twoFaCode, setTwoFaCode] = useState('');
  const [copiedSecret, setCopiedSecret] = useState(false);

  // State: Tab 3 (Notifications)
  const [notifications, setNotifications] = useState({
    email_approvals: true,
    email_security: true,
    inapp_approvals: true,
    inapp_security: true,
  });

  useEffect(() => {
    if (profileData?.notification_preferences) {
      setNotifications(profileData.notification_preferences);
    }
  }, [profileData]);

  // Mutations
  const updateProfileMutation = useMutation({
    mutationFn: (payload) => apiClient.patch('/me/profile', payload),
    onSuccess: () => {
      notify({ message: 'Profile updated successfully.' });
      queryClient.invalidateQueries({ queryKey: ['me', 'profile'] });
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
    onError: (err) => {
      notify({ message: err.message || 'Failed to update profile.', kind: 'error' });
    },
  });

  const updatePasswordMutation = useMutation({
    mutationFn: (payload) => apiClient.post('/me/password', payload),
    onSuccess: (data) => {
      notify({ message: data.message || 'Password saved successfully.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      queryClient.invalidateQueries({ queryKey: ['me', 'profile'] });
    },
    onError: (err) => {
      notify({ message: err.message || 'Failed to update password.', kind: 'error' });
    },
  });

  const setup2faMutation = useMutation({
    mutationFn: () => apiClient.post('/me/2fa/setup'),
    onSuccess: (data) => {
      setTwoFaSetupData(data);
      setTwoFaCode('');
      setIs2faModalOpen(true);
    },
    onError: (err) => {
      notify({ message: err.message || 'Failed to initiate 2FA setup.', kind: 'error' });
    },
  });

  const verify2faMutation = useMutation({
    mutationFn: (payload) => apiClient.post('/me/2fa/verify', payload),
    onSuccess: (data) => {
      notify({ message: data.message || '2FA enabled successfully!' });
      setIs2faModalOpen(false);
      setTwoFaSetupData(null);
      setTwoFaCode('');
      queryClient.invalidateQueries({ queryKey: ['me', 'profile'] });
    },
    onError: (err) => {
      notify({ message: err.message || 'Verification failed.', kind: 'error' });
    },
  });

  const disable2faMutation = useMutation({
    mutationFn: () => apiClient.post('/me/2fa/disable'),
    onSuccess: () => {
      notify({ message: 'Two-factor authentication disabled.' });
      queryClient.invalidateQueries({ queryKey: ['me', 'profile'] });
    },
    onError: (err) => {
      notify({ message: err.message || 'Failed to disable 2FA.', kind: 'error' });
    },
  });

  const revokeSessionsMutation = useMutation({
    mutationFn: () => apiClient.delete('/me/sessions'),
    onSuccess: (data) => {
      notify({ message: data.message || 'All other devices logged out.' });
      queryClient.invalidateQueries({ queryKey: ['me', 'sessions'] });
    },
    onError: (err) => {
      notify({ message: err.message || 'Failed to revoke sessions.', kind: 'error' });
    },
  });

  const updateNotificationsMutation = useMutation({
    mutationFn: (payload) => apiClient.patch('/me/notifications', payload),
    onSuccess: () => {
      notify({ message: 'Notification preferences saved.' });
      queryClient.invalidateQueries({ queryKey: ['me', 'profile'] });
    },
    onError: (err) => {
      notify({ message: err.message || 'Failed to save preferences.', kind: 'error' });
    },
  });

  // Handlers
  const handleSaveProfile = (e) => {
    e.preventDefault();
    updateProfileMutation.mutate({
      display_name: displayName,
      job_title: jobTitle || null,
      avatar_url: avatarUrl || null,
    });
  };

  const handleSavePassword = (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      notify({ message: 'New password and confirm password do not match.', kind: 'error' });
      return;
    }
    const payload = { new_password: newPassword };
    if (profileData?.has_password && !useGoogleVerify) {
      payload.current_password = currentPassword;
    }
    updatePasswordMutation.mutate(payload);
  };

  const handleGooglePasswordReset = (credential) => {
    if (!newPassword || newPassword.length < 8) {
      notify({ message: 'Please enter a new password (minimum 8 characters) first.', kind: 'error' });
      return;
    }
    if (newPassword !== confirmPassword) {
      notify({ message: 'New password and confirm password do not match.', kind: 'error' });
      return;
    }
    updatePasswordMutation.mutate({
      new_password: newPassword,
      google_credential: credential,
    });
  };

  const handleCopySecret = (secret) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(secret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
      notify({ message: 'Secret key copied to clipboard.' });
    }
  };

  const handleVerify2fa = (e) => {
    e.preventDefault();
    if (!twoFaCode || twoFaCode.length !== 6) {
      notify({ message: 'Please enter a valid 6-digit code.', kind: 'error' });
      return;
    }
    verify2faMutation.mutate({ code: twoFaCode });
  };

  const handleSaveNotifications = (e) => {
    e.preventDefault();
    updateNotificationsMutation.mutate(notifications);
  };

  const userInitials = (displayName || profileData?.email || 'JP')
    .split(/[ .@_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');

  if (loadingProfile) {
    return (
      <div className={styles.container}>
        <Skeleton style={{ height: '40px', width: '280px', marginBottom: '12px' }} />
        <Skeleton style={{ height: '24px', width: '450px', marginBottom: '24px' }} />
        <Skeleton style={{ height: '360px', width: '100%', borderRadius: '12px' }} />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Page Header */}
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <div className={styles.titleRow}>
            <User size={26} color="var(--jp-brand, #2563eb)" />
            <h1 className={styles.title}>Personal Settings</h1>
            <span className={`${styles.envBadge} ${styles.envSandbox}`}>
              {profileData?.role || 'VIEWER'}
            </span>
          </div>
          <p className={styles.subtitle}>
            Manage your personal profile, credentials, two-factor authentication, and active logged-in sessions.
          </p>
        </div>
      </div>

      {/* Navigation Tabs (Strictly 3 Tabs: Profile, Security, Notifications) */}
      <div className={styles.tabsBar}>
        <button
          type="button"
          className={`${styles.tabButton} ${activeTab === 'profile' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('profile')}
        >
          <User size={16} />
          Profile
        </button>
        <button
          type="button"
          className={`${styles.tabButton} ${activeTab === 'security' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('security')}
        >
          <Shield size={16} />
          Security & Sessions
        </button>
        <button
          type="button"
          className={`${styles.tabButton} ${activeTab === 'notifications' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('notifications')}
        >
          <Bell size={16} />
          Notifications
        </button>
      </div>

      {/* TAB 1: PROFILE */}
      {activeTab === 'profile' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 340px) 1fr', gap: '24px', alignItems: 'start' }}>
          {/* Left: Avatar Card */}
          <div className={styles.sectionCard} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '28px 20px' }}>
            <div
              style={{
                width: '100px',
                height: '100px',
                borderRadius: '50%',
                background: avatarUrl ? `url(${avatarUrl}) center/cover no-repeat` : 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                fontSize: '32px',
                fontWeight: '700',
                border: '3px solid var(--jp-border, #334155)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                marginBottom: '16px',
              }}
            >
              {!avatarUrl && userInitials}
            </div>
            <h3 style={{ margin: '0 0 4px', fontSize: '18px', fontWeight: 'bold' }}>
              {displayName || 'Personal Account'}
            </h3>
            <p style={{ margin: '0 0 12px', fontSize: '13px', color: 'var(--jp-text-muted, #94a3b8)' }}>
              {jobTitle || 'Team Member'}
            </p>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '4px 10px', borderRadius: '9999px', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
              <CheckCircle2 size={13} />
              Verified Identity
            </div>
          </div>

          {/* Right: Profile Details Form */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionHeaderTitle}>
                <User size={18} /> Account Information
              </h2>
            </div>
            <div className={styles.sectionBody}>
              <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className={styles.formField}>
                    <label className={styles.fieldLabel}>Display Name</label>
                    <input
                      type="text"
                      className={styles.fieldInput}
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="e.g. John Doe"
                      required
                    />
                  </div>

                  <div className={styles.formField}>
                    <label className={styles.fieldLabel}>Job Title / Role</label>
                    <input
                      type="text"
                      className={styles.fieldInput}
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                      placeholder="e.g. Head of Finance"
                    />
                  </div>
                </div>

                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>Email Address</label>
                  <input
                    type="email"
                    className={styles.fieldInput}
                    value={profileData?.email || ''}
                    disabled
                    style={{ background: 'rgba(255, 255, 255, 0.04)', color: 'var(--jp-text-muted)', cursor: 'not-allowed' }}
                  />
                  <span className={styles.fieldHint} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <span>Your primary organization login email cannot be changed directly.</span>
                    {profileData?.google_linked && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '500' }}>
                        Google Linked
                      </span>
                    )}
                  </span>
                </div>

                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>Profile Photo URL</label>
                  <input
                    type="url"
                    className={styles.fieldInput}
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    placeholder="https://example.com/avatar.jpg"
                  />
                  <span className={styles.fieldHint}>
                    Enter a direct HTTPS image URL or leave blank to display your initials.
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', borderTop: '1px solid var(--jp-border, #334155)', paddingTop: '16px' }}>
                  <div>
                    <label className={styles.fieldLabel}>Organization</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '500', color: 'var(--jp-text)' }}>
                      <Building2 size={16} color="var(--jp-text-muted)" />
                      {profileData?.organization_name || 'JOBENPAY'}
                    </div>
                  </div>

                  <div>
                    <label className={styles.fieldLabel}>Role & Permissions</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '500', color: 'var(--jp-text)' }}>
                      <Briefcase size={16} color="var(--jp-text-muted)" />
                      {profileData?.role || 'VIEWER'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                  <Button
                    type="submit"
                    loading={updateProfileMutation.isPending}
                    style={{ minWidth: '140px' }}
                  >
                    Save Changes
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: SECURITY & SESSIONS */}
      {activeTab === 'security' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Section 1: Set / Update Password */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionHeaderTitle}>
                <KeyRound size={18} /> Account Password
              </h2>
            </div>
            <div className={styles.sectionBody}>
              {/* Google OAuth Banner if user has no local password */}
              {!profileData?.has_password ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '14px 16px',
                    background: 'rgba(245, 158, 11, 0.1)',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    borderRadius: '8px',
                    marginBottom: '20px',
                  }}
                >
                  <AlertTriangle size={20} color="#f59e0b" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#f59e0b', marginBottom: '2px' }}>
                      You signed in with Google
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--jp-text-muted, #94a3b8)', lineHeight: '1.4' }}>
                      Create a local password for backup access if you ever need to sign in directly with your email and password without Google OAuth.
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 14px',
                    background: 'rgba(16, 185, 129, 0.08)',
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                    borderRadius: '8px',
                    marginBottom: '20px',
                    fontSize: '12px',
                    color: '#10b981',
                  }}
                >
                  <CheckCircle2 size={16} />
                  Your account has a local password enabled. You can update it anytime below.
                </div>
              )}

              <form onSubmit={handleSavePassword} style={{ maxWidth: '480px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {profileData?.has_password && !useGoogleVerify && (
                  <div className={styles.formField}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label className={styles.fieldLabel}>Current Password</label>
                      {googleClientId && (
                        <button
                          type="button"
                          onClick={() => setUseGoogleVerify(true)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--jp-brand-teal, #0d9488)',
                            fontSize: '12px',
                            cursor: 'pointer',
                            padding: 0,
                            textDecoration: 'underline',
                          }}
                        >
                          Verify with Google instead
                        </button>
                      )}
                    </div>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showCurrentPass ? 'text' : 'password'}
                        className={styles.fieldInput}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="••••••••••••"
                        required
                        style={{ paddingRight: '40px' }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPass(!showCurrentPass)}
                        style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--jp-text-muted)', cursor: 'pointer' }}
                      >
                        {showCurrentPass ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                )}

                {profileData?.has_password && useGoogleVerify && (
                  <div style={{
                    padding: '12px 14px',
                    background: 'rgba(56, 189, 248, 0.08)',
                    border: '1px solid rgba(56, 189, 248, 0.25)',
                    borderRadius: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '13px', fontWeight: '600', color: '#38bdf8' }}>
                        Google Re-Authentication
                      </span>
                      <button
                        type="button"
                        onClick={() => setUseGoogleVerify(false)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--jp-text-muted)',
                          fontSize: '12px',
                          cursor: 'pointer',
                          padding: 0,
                          textDecoration: 'underline',
                        }}
                      >
                        Use Current Password
                      </button>
                    </div>
                    <p style={{ fontSize: '12px', color: 'var(--jp-text-muted)', margin: 0 }}>
                      No current password required. Enter your new password below, then click the Google button to verify your identity and save.
                    </p>
                  </div>
                )}

                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>
                    {profileData?.has_password ? 'New Password' : 'Create Local Password'}
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showNewPass ? 'text' : 'password'}
                      className={styles.fieldInput}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Minimum 8 characters"
                      required
                      style={{ paddingRight: '40px' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPass(!showNewPass)}
                      style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--jp-text-muted)', cursor: 'pointer' }}
                    >
                      {showNewPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>Confirm New Password</label>
                  <input
                    type="password"
                    className={styles.fieldInput}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat new password"
                    required
                  />
                  <span className={styles.fieldHint}>
                    Password must be at least 8 characters with at least one uppercase letter, one lowercase letter, and one number.
                  </span>
                </div>

                {profileData?.has_password && useGoogleVerify ? (
                  <div style={{ marginTop: '8px' }}>
                    <label className={styles.fieldLabel} style={{ marginBottom: '8px', display: 'block' }}>
                      Verify with Google & Apply Password
                    </label>
                    {googleClientId ? (
                      <GoogleAuthButton
                        clientId={googleClientId}
                        onSuccess={handleGooglePasswordReset}
                        onError={(err) => notify({ message: err.message || 'Google verification failed.', kind: 'error' })}
                        text="continue_with"
                      />
                    ) : (
                      <span style={{ fontSize: '12px', color: '#ef4444' }}>
                        Google client ID is not configured on this server.
                      </span>
                    )}
                  </div>
                ) : (
                  <div>
                    <Button
                      type="submit"
                      loading={updatePasswordMutation.isPending}
                      disabled={!newPassword || !confirmPassword || (profileData?.has_password && !currentPassword)}
                    >
                      {profileData?.has_password ? 'Update Password' : 'Save Local Password'}
                    </Button>
                  </div>
                )}
              </form>
            </div>
          </div>

          {/* Section 2: Two-Factor Authentication (2FA) */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionHeaderTitle}>
                <Shield size={18} /> Two-Factor Authentication (2FA)
              </h2>
            </div>
            <div className={styles.sectionBody}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                <div style={{ maxWidth: '600px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold' }}>Authenticator App (TOTP)</h3>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: '700',
                        padding: '2px 8px',
                        borderRadius: '9999px',
                        background: profileData?.totp_enabled ? 'rgba(16, 185, 129, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                        color: profileData?.totp_enabled ? '#10b981' : 'var(--jp-text-muted)',
                        border: `1px solid ${profileData?.totp_enabled ? 'rgba(16, 185, 129, 0.3)' : 'rgba(148, 163, 184, 0.3)'}`,
                      }}
                    >
                      {profileData?.totp_enabled ? 'ENABLED' : 'DISABLED'}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--jp-text-muted, #94a3b8)', lineHeight: '1.5' }}>
                    Generate one-time verification codes using Google Authenticator, 1Password, Authy, or Microsoft Authenticator to protect transactions and administrative actions.
                  </p>
                </div>

                <div>
                  {profileData?.totp_enabled ? (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        if (window.confirm('Are you sure you want to disable two-factor authentication?')) {
                          disable2faMutation.mutate();
                        }
                      }}
                      loading={disable2faMutation.isPending}
                      style={{ color: '#ef4444' }}
                    >
                      Disable 2FA
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      onClick={() => setup2faMutation.mutate()}
                      loading={setup2faMutation.isPending}
                    >
                      <QrCode size={16} style={{ marginRight: '6px' }} />
                      Enable 2FA
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Active Sessions & Logged-in Devices */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionHeader} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 className={styles.sectionHeaderTitle}>
                  <Globe size={18} /> Active Sessions & Devices
                </h2>
                <span className={styles.fieldHint}>
                  Review devices currently logged into your account and invalidate unfamiliar sessions.
                </span>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (window.confirm('Log out all other devices? This will invalidate all sessions except your current device.')) {
                    revokeSessionsMutation.mutate();
                  }
                }}
                loading={revokeSessionsMutation.isPending}
                style={{ color: '#ef4444' }}
              >
                <LogOut size={14} style={{ marginRight: '6px' }} />
                Log out all other devices
              </Button>
            </div>
            <div className={styles.sectionBody}>
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Device & Browser</th>
                      <th>IP Address</th>
                      <th>Last Active</th>
                      <th>Session Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingSessions ? (
                      <tr>
                        <td colSpan={4} style={{ textAlign: 'center', padding: '24px' }}>
                          <Skeleton style={{ height: '24px', width: '100%' }} />
                        </td>
                      </tr>
                    ) : sessionsData?.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ textAlign: 'center', padding: '24px', color: 'var(--jp-text-muted)' }}>
                          No active sessions found.
                        </td>
                      </tr>
                    ) : (
                      sessionsData?.map((session) => (
                        <tr key={session.id}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              {/iphone|android|mobile/i.test(session.os || '') ? (
                                <Smartphone size={18} color="var(--jp-text-muted)" />
                              ) : (
                                <Laptop size={18} color="var(--jp-text-muted)" />
                              )}
                              <div>
                                <div style={{ fontWeight: '600', fontSize: '13px' }}>
                                  {session.device_label || 'Web Browser'}
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--jp-text-muted)' }}>
                                  {session.browser} ({session.os})
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className={styles.mono} style={{ fontSize: '12px' }}>
                            {session.ip_address}
                          </td>
                          <td style={{ fontSize: '12px', color: 'var(--jp-text-muted)' }}>
                            {session.last_seen_at ? new Date(session.last_seen_at).toLocaleString() : 'Recent'}
                          </td>
                          <td>
                            {session.is_current ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 'bold', color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                                <CheckCircle2 size={12} /> CURRENT DEVICE
                              </span>
                            ) : (
                              <span style={{ fontSize: '11px', color: 'var(--jp-text-muted)' }}>
                                Active
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: NOTIFICATIONS */}
      {activeTab === 'notifications' && (
        <div className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionHeaderTitle}>
              <Bell size={18} /> Notification Preferences
            </h2>
            <span className={styles.fieldHint}>
              Configure alert channels for mandate approvals, payouts, and suspicious activity.
            </span>
          </div>
          <div className={styles.sectionBody}>
            <form onSubmit={handleSaveNotifications} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Notification Item 1 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--jp-border, #334155)', borderRadius: '8px' }}>
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '4px' }}>
                      Approvals & Payout Execution (Email)
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--jp-text-muted)' }}>
                      Receive email notifications when transactions exceed agent budget caps and require approval.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifications.email_approvals}
                    onChange={(e) => setNotifications({ ...notifications, email_approvals: e.target.checked })}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                </div>

                {/* Notification Item 2 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--jp-border, #334155)', borderRadius: '8px' }}>
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '4px' }}>
                      Approvals & Payout Execution (In-App)
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--jp-text-muted)' }}>
                      Display badge counters and live popovers in the dashboard navigation bar.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifications.inapp_approvals}
                    onChange={(e) => setNotifications({ ...notifications, inapp_approvals: e.target.checked })}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                </div>

                {/* Notification Item 3 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--jp-border, #334155)', borderRadius: '8px' }}>
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '4px' }}>
                      Security Alerts & Anomalies (Email)
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--jp-text-muted)' }}>
                      Receive immediate security notices on password changes, new logins, or rogue agent attempts.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifications.email_security}
                    onChange={(e) => setNotifications({ ...notifications, email_security: e.target.checked })}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                </div>

                {/* Notification Item 4 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--jp-border, #334155)', borderRadius: '8px' }}>
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '4px' }}>
                      Security Alerts & Hard Rule Violations (In-App)
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--jp-text-muted)' }}>
                      Show real-time toast alerts when DIP hard rules or mandate boundary checks fail.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifications.inapp_security}
                    onChange={(e) => setNotifications({ ...notifications, inapp_security: e.target.checked })}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                <Button
                  type="submit"
                  loading={updateNotificationsMutation.isPending}
                  style={{ minWidth: '160px' }}
                >
                  Save Preferences
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2FA SETUP MODAL */}
      <Modal
        open={is2faModalOpen}
        onOpenChange={setIs2faModalOpen}
        title="Set Up Two-Factor Authentication"
        description="Scan the QR code with your authenticator app (Google Authenticator, Authy, or 1Password) to link your account."
        footer={null}
      >
        {twoFaSetupData && (
          <form onSubmit={handleVerify2fa} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', padding: '12px 0' }}>
            {/* QR Code SVG Display */}
            <div
              style={{
                background: '#ffffff',
                padding: '16px',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
              }}
              dangerouslySetInnerHTML={{ __html: twoFaSetupData.qr_svg }}
            />

            {/* Manual Secret Key */}
            <div style={{ width: '100%', textAlign: 'center' }}>
              <span style={{ fontSize: '12px', color: 'var(--jp-text-muted)', display: 'block', marginBottom: '6px' }}>
                Or enter this code manually:
              </span>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  padding: '8px 14px',
                  borderRadius: '6px',
                  border: '1px solid var(--jp-border, #334155)',
                }}
              >
                <code className={styles.mono} style={{ fontSize: '14px', fontWeight: 'bold', letterSpacing: '1px' }}>
                  {twoFaSetupData.formatted_secret}
                </code>
                <button
                  type="button"
                  onClick={() => handleCopySecret(twoFaSetupData.secret)}
                  style={{ background: 'none', border: 'none', color: 'var(--jp-brand, #3b82f6)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                  title="Copy secret"
                >
                  {copiedSecret ? <Check size={16} color="#10b981" /> : <Copy size={16} />}
                </button>
              </div>
            </div>

            {/* Verification Code Input */}
            <div style={{ width: '100%' }}>
              <label className={styles.fieldLabel} style={{ textAlign: 'center', display: 'block', marginBottom: '8px' }}>
                Enter the 6-digit code from your app:
              </label>
              <input
                type="text"
                maxLength={6}
                value={twoFaCode}
                onChange={(e) => setTwoFaCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                autoFocus
                className={styles.fieldInput}
                style={{
                  textAlign: 'center',
                  fontSize: '24px',
                  fontWeight: 'bold',
                  letterSpacing: '8px',
                  padding: '12px',
                }}
                required
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', width: '100%', justifyContent: 'flex-end', marginTop: '8px' }}>
              <Button
                variant="secondary"
                onClick={() => setIs2faModalOpen(false)}
                type="button"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                loading={verify2faMutation.isPending}
                disabled={twoFaCode.length !== 6}
              >
                Verify & Enable 2FA
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

export default PersonalSettingsPage;
