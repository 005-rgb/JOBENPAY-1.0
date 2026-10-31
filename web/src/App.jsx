import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

import AppShell, { FixtureMain } from './components/AppShell.jsx';
import { AuthProvider, useAuth } from './auth/AuthProvider.jsx';
import { RequireAuth, RequireRole } from './auth/RequireAuth.jsx';
import { ToastProvider } from './components/primitives.jsx';
import {
  AgentDetailPage,
  AgentsPage,
  ComingSoonPage,
  DashboardPage,
  LoginPage,
  PayeeDetailPage,
  PayeesPage,
  PaypalSettingsPage,
  SecurityPage,
} from './pages/FeaturePages.jsx';
import { useTranslation } from 'react-i18next';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
      staleTime: 30000,
    },
  },
});

function AuthenticatedApp() {
  const auth = useAuth();
  return (
    <AppShell
      aiMode={auth.data?.aiMode || 'live'}
      csrfToken={auth.csrfToken}
      frozen={Boolean(auth.org?.frozen || auth.data?.frozen)}
      onLogout={auth.logout}
      org={auth.org}
      role={auth.role}
      user={auth.user}
    >
      <Routes>
        <Route element={<DashboardPage />} path="/" />
        <Route element={<DashboardPage />} path="/dashboard" />
        <Route element={<RequireRole roles={['OWNER', 'ADMIN', 'OPERATOR']}><AgentsPage /></RequireRole>} path="/agents" />
        <Route element={<RequireRole roles={['OWNER', 'ADMIN', 'OPERATOR']}><AgentsPage initialCreate /></RequireRole>} path="/agents/new" />
        <Route element={<RequireRole roles={['OWNER', 'ADMIN', 'OPERATOR']}><AgentDetailPage /></RequireRole>} path="/agents/:id" />
        <Route element={<PayeesPage />} path="/payees" />
        <Route element={<PayeesPage initialCreate />} path="/payees/new" />
        <Route element={<PayeeDetailPage />} path="/payees/:id" />
        <Route element={<PaypalSettingsPage />} path="/settings/paypal" />
        <Route element={<SecurityPage />} path="/settings/security" />
        <Route element={<ComingSoonPage />} path="*" />
      </Routes>
    </AppShell>
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
          <Route element={<ParityPage variant="s1" />} path="/__parity/s1" />
          <Route element={<ParityPage variant="s2" />} path="/__parity/s2" />
        </>
      ) : null}
      <Route element={<LoginPage />} path="/login" />
      <Route
        element={(
          <RequireAuth>
            <AuthenticatedApp />
          </RequireAuth>
        )}
        path="/*"
      />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <AppRoutes />
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
