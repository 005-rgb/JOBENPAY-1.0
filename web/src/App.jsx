import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

import AppShell, { FixtureMain } from './components/AppShell.jsx';
import { AuthProvider, useAuth } from './auth/AuthProvider.jsx';
import { RequireAuth, RequireRole } from './auth/RequireAuth.jsx';
import { Skeleton, ToastProvider } from './components/primitives.jsx';
import { useTranslation } from 'react-i18next';

const ApprovalDetailPage = lazy(() => import('./pages/F04Pages.jsx').then((pages) => ({ default: pages.ApprovalDetailPage })));
const ApprovalsPage = lazy(() => import('./pages/F04Pages.jsx').then((pages) => ({ default: pages.ApprovalsPage })));
const AgentDetailPage = lazy(() => import('./pages/FeaturePages.jsx').then((pages) => ({ default: pages.AgentDetailPage })));
const AgentsPage = lazy(() => import('./pages/FeaturePages.jsx').then((pages) => ({ default: pages.AgentsPage })));
const ComingSoonPage = lazy(() => import('./pages/FeaturePages.jsx').then((pages) => ({ default: pages.ComingSoonPage })));
const DashboardPage = lazy(() => import('./pages/FeaturePages.jsx').then((pages) => ({ default: pages.DashboardPage })));
const DocumentDetailPage = lazy(() => import('./pages/F04Pages.jsx').then((pages) => ({ default: pages.DocumentDetailPage })));
const DocumentsPage = lazy(() => import('./pages/F04Pages.jsx').then((pages) => ({ default: pages.DocumentsPage })));
const AuditPage = lazy(() => import('./pages/F05Pages.jsx').then((pages) => ({ default: pages.AuditPage })));
const DeveloperPage = lazy(() => import('./pages/F05Pages.jsx').then((pages) => ({ default: pages.DeveloperPage })));
const LedgerPage = lazy(() => import('./pages/F05Pages.jsx').then((pages) => ({ default: pages.LedgerPage })));
const LoginPage = lazy(() => import('./pages/FeaturePages.jsx').then((pages) => ({ default: pages.LoginPage })));
const MandateBuilderPage = lazy(() => import('./pages/F04Pages.jsx').then((pages) => ({ default: pages.MandateBuilderPage })));
const MandateDetailPage = lazy(() => import('./pages/F04Pages.jsx').then((pages) => ({ default: pages.MandateDetailPage })));
const MandatesPage = lazy(() => import('./pages/F04Pages.jsx').then((pages) => ({ default: pages.MandatesPage })));
const PayeeDetailPage = lazy(() => import('./pages/FeaturePages.jsx').then((pages) => ({ default: pages.PayeeDetailPage })));
const PayeesPage = lazy(() => import('./pages/FeaturePages.jsx').then((pages) => ({ default: pages.PayeesPage })));
const PaypalSettingsPage = lazy(() => import('./pages/FeaturePages.jsx').then((pages) => ({ default: pages.PaypalSettingsPage })));
const RequestDetailPage = lazy(() => import('./pages/F04Pages.jsx').then((pages) => ({ default: pages.RequestDetailPage })));
const RequestsPage = lazy(() => import('./pages/F04Pages.jsx').then((pages) => ({ default: pages.RequestsPage })));
const SecurityPage = lazy(() => import('./pages/FeaturePages.jsx').then((pages) => ({ default: pages.SecurityPage })));
const SimulatorPage = lazy(() => import('./pages/F05Pages.jsx').then((pages) => ({ default: pages.SimulatorPage })));

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
      <Suspense fallback={<main aria-busy="true"><Skeleton className="pageSkeleton" /></main>}>
        <Routes>
          <Route element={<DashboardPage />} path="/" />
          <Route element={<DashboardPage />} path="/dashboard" />
          <Route element={<RequireRole roles={['OWNER', 'ADMIN', 'OPERATOR', 'JUDGE']}><AgentsPage /></RequireRole>} path="/agents" />
          <Route element={<RequireRole roles={['OWNER', 'ADMIN', 'OPERATOR', 'JUDGE']}><AgentsPage initialCreate /></RequireRole>} path="/agents/new" />
          <Route element={<RequireRole roles={['OWNER', 'ADMIN', 'OPERATOR', 'JUDGE']}><AgentDetailPage /></RequireRole>} path="/agents/:id" />
          <Route element={<MandatesPage />} path="/mandates" />
          <Route element={<RequireRole roles={['OWNER', 'ADMIN', 'OPERATOR', 'JUDGE']}><MandateBuilderPage /></RequireRole>} path="/mandates/new" />
          <Route element={<MandateDetailPage />} path="/mandates/:id" />
          <Route element={<DocumentsPage />} path="/documents" />
          <Route element={<DocumentsPage />} path="/documents/new" />
          <Route element={<DocumentDetailPage />} path="/documents/:id" />
          <Route element={<RequestsPage />} path="/requests" />
          <Route element={<RequestDetailPage />} path="/requests/:id" />
          <Route element={<ApprovalsPage />} path="/approvals" />
          <Route element={<ApprovalDetailPage />} path="/approvals/:id" />
          <Route element={<RequireRole roles={['OWNER', 'ADMIN', 'APPROVER', 'OPERATOR', 'VIEWER', 'JUDGE']}><LedgerPage /></RequireRole>} path="/ledger/*" />
          <Route element={<RequireRole roles={['OWNER', 'ADMIN', 'APPROVER', 'OPERATOR', 'VIEWER', 'JUDGE']}><AuditPage /></RequireRole>} path="/audit" />
          <Route element={<RequireRole roles={['OWNER', 'ADMIN', 'OPERATOR', 'JUDGE']}><SimulatorPage /></RequireRole>} path="/simulator" />
          <Route element={<DeveloperPage />} path="/developer" />
          <Route element={<PayeesPage />} path="/payees" />
          <Route element={<PayeesPage initialCreate />} path="/payees/new" />
          <Route element={<PayeeDetailPage />} path="/payees/:id" />
          <Route element={<PaypalSettingsPage />} path="/settings/paypal" />
          <Route element={<SecurityPage />} path="/settings/security" />
          <Route element={<ComingSoonPage />} path="*" />
        </Routes>
      </Suspense>
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
      <Route element={<Suspense fallback={<main aria-busy="true"><Skeleton className="pageSkeleton" /></main>}><LoginPage /></Suspense>} path="/login" />
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
