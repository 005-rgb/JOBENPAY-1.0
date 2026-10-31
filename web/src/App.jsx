import React from 'react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import AppShell, { FixtureMain } from './components/AppShell.jsx';
import { Button, EmptyState, Skeleton, ToastProvider } from './components/primitives.jsx';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
      staleTime: 30000,
    },
  },
});

async function fetchCurrentUser() {
  const response = await fetch('/api/v1/auth/me', { credentials: 'same-origin' });
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body?.error?.message || 'Unable to load the current session.');
    error.status = response.status;
    throw error;
  }
  return body;
}

function AuthenticatedShell() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, error, isPending, refetch } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: fetchCurrentUser,
  });

  if (isPending) {
    return <main aria-label={t('components.loading')}><Skeleton /></main>;
  }

  if (error || !data) {
    return (
      <main className="session-state" role="main">
        <EmptyState
          description={error?.message || t('app.signInRequired')}
          title={t('app.signInRequired')}
          action={<Button onClick={() => error?.status === 401 ? navigate('/login') : refetch()}>{error?.status === 401 ? t('app.signIn') : t('app.retry')}</Button>}
        />
      </main>
    );
  }

  return (
    <AppShell
      aiMode={data.aiMode}
      csrfToken={data.csrfToken}
      frozen={data.frozen}
      org={data.org}
      role={data.role}
      user={data.user}
    />
  );
}

function ParityPage({ variant }) {
  const { t } = useTranslation();
  return (
    <AppShell
      aiMode="live"
      fixture
      org={{ name: 'JOBENPAY Demo' }}
      pageTitle={variant === 's1' ? t('app.fixtureUserTitle') : t('app.newPayee')}
      role="OWNER"
      user={{ display_name: 'David Guntoro', email: 'owner@example.test' }}
    >
      <FixtureMain type={variant} t={t} />
    </AppShell>
  );
}

function AppRoutes() {
  const parityEnabled = import.meta.env.DEV || import.meta.env.VITE_PARITY === '1';
  return (
    <Routes>
      {parityEnabled ? (
        <>
          <Route path="/__parity/s1" element={<ParityPage variant="s1" />} />
          <Route path="/__parity/s2" element={<ParityPage variant="s2" />} />
        </>
      ) : null}
      <Route path="*" element={<AuthenticatedShell />} />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}
