// @ts-check
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Lock,
  Save,
  Globe,
  Mail,
  MapPin,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Shield,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../api/client.js';
import { useToast } from '../components/primitives.jsx';
import StepUpDialog from '../components/StepUpDialog.jsx';
import styles from './TransactionPages.module.css';

export default function OrganizationPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { notify } = useToast();

  const [displayName, setDisplayName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [supportEmail, setSupportEmail] = useState('');
  const [billingEmail, setBillingEmail] = useState('');
  const [initialBillingEmail, setInitialBillingEmail] = useState('');
  const [taxId, setTaxId] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('ID');

  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [pendingPayload, setPendingPayload] = useState(null);
  const [feedback, setFeedback] = useState({ type: '', message: '' });

  const { data: profile, isLoading, error } = useQuery({
    queryKey: ['org', 'profile'],
    queryFn: () => apiClient.get('/org/profile'),
  });

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || '');
      setLegalName(profile.legal_name || '');
      setLogoUrl(profile.logo_url || '');
      setWebsiteUrl(profile.website_url || '');
      setSupportEmail(profile.support_email || '');
      setBillingEmail(profile.billing_email || '');
      setInitialBillingEmail(profile.billing_email || '');
      const addr = profile.address || {};
      setStreet(addr.street || '');
      setCity(addr.city || '');
      setStateName(addr.state || '');
      setPostalCode(addr.postal_code || '');
      setCountry(addr.country || 'ID');
    }
  }, [profile]);

  const updateMutation = useMutation({
    mutationFn: ({ payload, stepUpGrant }) =>
      apiClient.patch('/org/profile', payload, { stepUpGrant }),
    onSuccess: (data) => {
      setFeedback({ type: 'success', message: 'Organization profile updated successfully.' });
      notify({ message: 'Organization profile saved successfully.' });
      setInitialBillingEmail(data.billing_email || billingEmail);
      queryClient.invalidateQueries({ queryKey: ['org', 'profile'] });
      setTimeout(() => setFeedback({ type: '', message: '' }), 4000);
    },
    onError: (err) => {
      setFeedback({ type: 'error', message: err.message || 'Failed to update organization profile.' });
      notify({ message: err.message || 'Failed to update profile.', kind: 'error' });
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setFeedback({ type: '', message: '' });

    const payload = {
      display_name: displayName.trim() || undefined,
      legal_name: legalName.trim() || undefined,
      logo_url: logoUrl.trim() || undefined,
      website_url: websiteUrl.trim() || undefined,
      support_email: supportEmail.trim() || undefined,
      billing_email: billingEmail.trim() || undefined,
      tax_id: taxId.trim() || undefined,
      address: {
        street: street.trim(),
        city: city.trim(),
        state: stateName.trim(),
        postal_code: postalCode.trim(),
        country: country.trim(),
      },
    };

    // If billing email changed, step-up SCA authentication is strictly required
    if (billingEmail.trim() !== (initialBillingEmail || '').trim()) {
      setPendingPayload(payload);
      setStepUpOpen(true);
      return;
    }

    updateMutation.mutate({ payload });
  };

  const handleStepUpConfirm = async (grantId) => {
    if (!pendingPayload) return;
    try {
      await updateMutation.mutateAsync({ payload: pendingPayload, stepUpGrant: grantId });
      setPendingPayload(null);
      setStepUpOpen(false);
    } catch {
      // Handled by mutation onError
    }
  };

  if (isLoading) {
    return (
      <div className={styles.emptyCard}>
        <Loader2 className="animate-spin" size={32} />
        <p className={styles.emptyDesc}>Loading organization profile...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.pageStack}>
        <div className={styles.errorBanner}>
          <AlertCircle size={20} />
          <div>
            <strong>Failed to Load Organization Profile</strong>
            <p style={{ margin: '4px 0 0 0' }}>{error.message}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.pageStack}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitleGroup}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Building2 size={24} style={{ color: 'var(--jp-text)' }} />
            <h1 className={styles.pageTitle}>Organization Profile</h1>
          </div>
          <p className={styles.pageSubtitle}>
            Manage legal entity details, billing contacts, and organizational trust settings.
          </p>
        </div>
      </div>

      {feedback.message && (
        <div className={feedback.type === 'success' ? styles.successBanner : styles.errorBanner}>
          {feedback.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{feedback.message}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className={styles.pageStack}>
        <div className={styles.twoColumnLayout}>
          {/* Section 1: Entity & Contact */}
          <div className={styles.formCard}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <FileText size={18} style={{ color: 'var(--jp-text-muted)' }} />
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold' }}>Company Details</h3>
            </div>

            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="displayName">Display Name *</label>
                <input
                  id="displayName"
                  className={styles.fieldInput}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Acme Corp"
                  required
                />
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="legalName">Legal Registered Name</label>
                <input
                  id="legalName"
                  className={styles.fieldInput}
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  placeholder="Acme Corporation LLC"
                />
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="websiteUrl">
                  <Globe size={14} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                  Website URL
                </label>
                <input
                  id="websiteUrl"
                  type="url"
                  className={styles.fieldInput}
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://acme.com"
                />
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="supportEmail">
                  <Mail size={14} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                  Support Email
                </label>
                <input
                  id="supportEmail"
                  type="email"
                  className={styles.fieldInput}
                  value={supportEmail}
                  onChange={(e) => setSupportEmail(e.target.value)}
                  placeholder="support@acme.com"
                />
              </div>

              <div className={`${styles.field} ${styles.fullWidth}`}>
                <label className={styles.fieldLabel} htmlFor="billingEmail" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Lock size={14} style={{ color: '#f59e0b' }} />
                  Billing Email (Requires Password Step-Up)
                </label>
                <input
                  id="billingEmail"
                  type="email"
                  className={styles.fieldInput}
                  value={billingEmail}
                  onChange={(e) => setBillingEmail(e.target.value)}
                  placeholder="billing@acme.com"
                />
                <span style={{ fontSize: '11px', color: 'var(--jp-text-muted)', marginTop: '4px' }}>
                  Changing the billing email requires Strong Customer Authentication (SCA).
                </span>
              </div>
            </div>
          </div>

          {/* Section 2: Address & Tax */}
          <div className={styles.formCard}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <MapPin size={18} style={{ color: 'var(--jp-text-muted)' }} />
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold' }}>Address & Tax ID</h3>
            </div>

            <div className={styles.formGrid}>
              <div className={`${styles.field} ${styles.fullWidth}`}>
                <label className={styles.fieldLabel} htmlFor="taxId">Tax Identification Number (TIN / NPWP)</label>
                <input
                  id="taxId"
                  className={styles.fieldInput}
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                  placeholder="12.345.678.9-012.000"
                />
                <span style={{ fontSize: '11px', color: 'var(--jp-text-muted)', marginTop: '4px' }}>
                  Stored encrypted with AES-256-GCM.
                </span>
              </div>

              <div className={`${styles.field} ${styles.fullWidth}`}>
                <label className={styles.fieldLabel} htmlFor="street">Street Address</label>
                <input
                  id="street"
                  className={styles.fieldInput}
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  placeholder="Jl. Sudirman No. 1"
                />
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="city">City</label>
                <input
                  id="city"
                  className={styles.fieldInput}
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Jakarta"
                />
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="state">State / Province</label>
                <input
                  id="state"
                  className={styles.fieldInput}
                  value={stateName}
                  onChange={(e) => setStateName(e.target.value)}
                  placeholder="DKI Jakarta"
                />
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="postalCode">Postal Code</label>
                <input
                  id="postalCode"
                  className={styles.fieldInput}
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  placeholder="10220"
                />
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="country">Country</label>
                <select
                  id="country"
                  className={styles.fieldSelect}
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                >
                  <option value="ID">Indonesia (ID)</option>
                  <option value="US">United States (US)</option>
                  <option value="SG">Singapore (SG)</option>
                  <option value="AU">Australia (AU)</option>
                  <option value="GB">United Kingdom (GB)</option>
                  <option value="DE">Germany (DE)</option>
                  <option value="JP">Japan (JP)</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.formActions} style={{ justifyContent: 'flex-end', marginTop: '16px' }}>
          <button
            type="submit"
            className={styles.primaryLink}
            disabled={updateMutation.isPending}
            style={{ border: 'none', cursor: updateMutation.isPending ? 'not-allowed' : 'pointer' }}
          >
            {updateMutation.isPending ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            <span>{updateMutation.isPending ? 'Saving...' : 'Save Profile'}</span>
          </button>
        </div>
      </form>

      <StepUpDialog
        open={stepUpOpen}
        purpose="UPDATE_BILLING_EMAIL"
        onOpenChange={setStepUpOpen}
        onConfirm={handleStepUpConfirm}
        description="Changing the organization's billing email requires Strong Customer Authentication. Confirm your password to proceed."
      />
    </div>
  );
}
