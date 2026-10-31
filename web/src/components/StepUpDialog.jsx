import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { apiClient } from '../api/client.js';
import { Button, FloatingInput, Modal } from './primitives.jsx';

export default function StepUpDialog({ open, purpose, onOpenChange, onConfirm, description }) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const setOpen = (nextOpen) => {
    if (!nextOpen) {
      setPassword('');
      setError('');
    }
    onOpenChange(nextOpen);
  };

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const grant = await apiClient.post('/auth/step-up', { purpose, password });
      await onConfirm(grant.grantId);
      setPassword('');
      setOpen(false);
    } catch (requestError) {
      setError(requestError.code === 'FORBIDDEN' ? t('app.wrongPassword') : requestError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      description={description || t('app.stepUpDescription')}
      footer={(
        <>
          <Button onClick={() => setOpen(false)} variant="secondary">{t('app.cancel')}</Button>
          <Button disabled={!password} form="step-up-form" loading={loading} type="submit">{t('app.confirm')}</Button>
        </>
      )}
      onOpenChange={setOpen}
      open={open}
      title={t('app.stepUpTitle')}
    >
      <form id="step-up-form" onSubmit={submit}>
        <FloatingInput
          autoComplete="current-password"
          error={error}
          label={t('app.password')}
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </form>
    </Modal>
  );
}
