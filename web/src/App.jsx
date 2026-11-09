import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

import AppShell, { FixtureMain } from './components/AppShell.jsx';
import { AuthProvider, useAuth } from './auth/AuthProvider.jsx';
import { EnvironmentProvider } from './context/EnvironmentContext.jsx';
import { RequireAuth, RequireRole } from './auth/RequireAuth.jsx';
import BrandLoadingScreen from './components/BrandLoadingScreen.jsx';
import { ToastProvider } from './components/primitives.jsx';
import { useTranslation } from 'react-i18next';

const TransactionsPage = lazy(() => import('./pages/TransactionsPage.jsx'));
const TransactionDetailPage = lazy(() => import('./pages/TransactionDetailPage.jsx'));
const NewTransactionPage = lazy(() => import('./pages/NewTransactionPage.jsx'));
const PayoutPage = lazy(() => import('./pages/PayoutPage.jsx'));
const SalePage = lazy(() => import('./pages/SalePage.jsx'));
const InvoicePage = lazy(() => import('./pages/InvoicePage.jsx'));
const Down_PaymentPage = lazy(() => import('./pages/Down_PaymentPage.jsx'));
const RecurringPage = lazy(() => import('./pages/RecurringPage.jsx'));
const SplitPage = lazy(() => import('./pages/SplitPage.jsx'));
const BulkPage = lazy(() => import('./pages/BulkPage.jsx'));
const TransferPage = lazy(() => import('./pages/TransferPage.jsx'));
const ScheduledPage = lazy(() => import('./pages/ScheduledPage.jsx'));
const FinancingPage = lazy(() => import('./pages/FinancingPage.jsx'));
const DebitPage = lazy(() => import('./pages/DebitPage.jsx'));
const DisputePage = lazy(() => import('./pages/DisputePage.jsx'));
const RefundPage = lazy(() => import('./pages/RefundPage.jsx'));
const VoidPage = lazy(() => import('./pages/VoidPage.jsx'));
const PartialPage = lazy(() => import('./pages/PartialPage.jsx'));
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
const LandingPage = lazy(() => import('./pages/Landing.jsx'));
const LoginPage = lazy(() => import('./pages/FeaturePages.jsx').then((pages) => ({ default: pages.LoginPage })));
const SignupPage = lazy(() => import('./pages/SignupPage.jsx'));
const CheckEmailPage = lazy(() => import('./pages/CheckEmailPage.jsx'));
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmailPage.jsx'));
const TermsPage = lazy(() => import('./pages/LegalPages.jsx').then((m) => ({ default: m.TermsPage })));
const PrivacyPage = lazy(() => import('./pages/LegalPages.jsx').then((m) => ({ default: m.PrivacyPage })));
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
const OrganizationPage = lazy(() => import('./pages/OrganizationPage.jsx'));
const MembersPage = lazy(() => import('./pages/MembersPage.jsx'));
const ProofsPage = lazy(() => import('./pages/ProtocolPages.jsx').then((p) => ({ default: p.ProofsPage })));
const HandshakesPage = lazy(() => import('./pages/ProtocolPages.jsx').then((p) => ({ default: p.HandshakesPage })));
const ProtocolConformancePage = lazy(() => import('./pages/ProtocolPages.jsx').then((p) => ({ default: p.ProtocolConformancePage })));
const IntentAnchorBuilderPage = lazy(() => import('./pages/DipPages.jsx').then((p) => ({ default: p.IntentAnchorBuilderPage })));
const IntentAnchorsPage = lazy(() => import('./pages/DipPages.jsx').then((p) => ({ default: p.IntentAnchorsPage })));
const DipPage = lazy(() => import('./pages/DipPages.jsx').then((p) => ({ default: p.DipPage })));
const CplPage = lazy(() => import('./pages/CplPages.jsx').then((p) => ({ default: p.CplPage })));
const JplPage = lazy(() => import('./pages/JplPages.jsx').then((p) => ({ default: p.JplPage })));
const OpsPage = lazy(() => import('./pages/OpsPages.jsx'));
const PaymentsPage = lazy(() => import('./pages/PaymentsPage.jsx'));
const SecurityHardeningPage = lazy(() => import('./pages/SecurityPage.jsx'));

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
  const { t } = useTranslation();
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
      <Suspense fallback={<BrandLoadingScreen message={t('app.loadingWorkspaceHint')} />}>
        <Routes>
          <Route element={<DashboardPage />} path="/" />
          <Route element={<DashboardPage />} path="/dashboard" />
          <Route element={<TransactionsPage />} path="/transactions" />
          <Route element={<NewTransactionPage />} path="/transactions/new" />
          <Route element={<TransactionDetailPage />} path="/transactions/:id" />
          <Route element={<PayoutPage />} path="/payouts" />
          <Route element={<PayoutPage />} path="/payouts/:id" />
          <Route element={<SalePage />} path="/sales" />
          <Route element={<SalePage />} path="/sales/:id" />
          <Route element={<InvoicePage />} path="/invoices" />
          <Route element={<InvoicePage />} path="/invoices/:id" />
          <Route element={<Down_PaymentPage />} path="/down-payments" />
          <Route element={<Down_PaymentPage />} path="/down-payments/:id" />
          <Route element={<RecurringPage />} path="/recurring" />
          <Route element={<SplitPage />} path="/splits" />
          <Route element={<BulkPage />} path="/bulk" />
          <Route element={<TransferPage />} path="/transfer" />
          <Route element={<TransferPage />} path="/transfers" />
          <Route element={<ScheduledPage />} path="/scheduled" />
          <Route element={<FinancingPage />} path="/financing" />
          <Route element={<DebitPage />} path="/debit" />
          <Route element={<DisputePage />} path="/disputes" />
          <Route element={<RefundPage />} path="/refunds" />
          <Route element={<RefundPage />} path="/refunds/:id" />
          <Route element={<VoidPage />} path="/voids" />
          <Route element={<VoidPage />} path="/voids/:id" />
          <Route element={<PartialPage />} path="/partials" />
          <Route element={<PartialPage />} path="/partials/:id" />

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
          <Route element={<RequireRole roles={['OWNER', 'ADMIN']}><OrganizationPage /></RequireRole>} path="/organization" />
          <Route element={<RequireRole roles={['OWNER', 'ADMIN']}><MembersPage /></RequireRole>} path="/members" />
          <Route element={<ProofsPage />} path="/proofs" />
          <Route element={<HandshakesPage />} path="/handshakes" />
          <Route element={<ProtocolConformancePage />} path="/protocol/conformance" />
          <Route element={<IntentAnchorsPage />} path="/intents" />
          <Route element={<IntentAnchorBuilderPage />} path="/intents/new" />
          <Route element={<DipPage />} path="/dip" />
          <Route element={<CplPage />} path="/cpl" />
          <Route element={<JplPage />} path="/jpl" />
          <Route element={<RequireRole roles={['OWNER', 'ADMIN', 'APPROVER', 'OPERATOR', 'VIEWER', 'JUDGE']}><SecurityHardeningPage tab="pqc" /></RequireRole>} path="/security" />
          <Route element={<RequireRole roles={['OWNER', 'ADMIN', 'APPROVER', 'OPERATOR', 'VIEWER', 'JUDGE']}><SecurityHardeningPage /></RequireRole>} path="/security/:tab" />
          <Route element={<OpsPage tab="overview" />} path="/ops" />
          <Route element={<OpsPage tab="slo" />} path="/ops/slo" />
          <Route element={<OpsPage tab="circuit-breakers" />} path="/ops/circuit-breakers" />
          <Route element={<OpsPage tab="runbooks" />} path="/ops/runbooks" />
          <Route element={<OpsPage tab="secrets" />} path="/ops/secrets" />
          <Route element={<PaymentsPage tab="overview" />} path="/payments" />
          <Route element={<PaymentsPage tab="vault" />} path="/payments/vault" />
          <Route element={<PaymentsPage tab="transactions" />} path="/payments/transactions" />
          <Route element={<PaymentsPage tab="simulator" />} path="/payments/simulator" />
          <Route element={<PaymentsPage tab="webhooks" />} path="/payments/webhooks" />
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

function RootPage() {
  const auth = useAuth();
  const { t } = useTranslation();

  if (auth.isPending) {
    return <BrandLoadingScreen fullScreen label={t('app.loadingWorkspace')} />;
  }

  if (auth.user) {
    return <AuthenticatedApp />;
  }

  return (
    <Suspense fallback={<BrandLoadingScreen fullScreen />}>
      <LandingPage />
    </Suspense>
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
      <Route element={<RootPage />} path="/" />
      <Route element={<Suspense fallback={<BrandLoadingScreen fullScreen />}><LoginPage /></Suspense>} path="/login" />
      <Route element={<Suspense fallback={<BrandLoadingScreen fullScreen />}><SignupPage /></Suspense>} path="/signup" />
      <Route element={<Suspense fallback={<BrandLoadingScreen fullScreen />}><CheckEmailPage /></Suspense>} path="/signup/check-email" />
      <Route element={<Suspense fallback={<BrandLoadingScreen fullScreen />}><VerifyEmailPage /></Suspense>} path="/verify-email" />
      <Route element={<Suspense fallback={<BrandLoadingScreen fullScreen />}><TermsPage /></Suspense>} path="/terms" />
      <Route element={<Suspense fallback={<BrandLoadingScreen fullScreen />}><PrivacyPage /></Suspense>} path="/privacy" />
      <Route element={<Suspense fallback={<BrandLoadingScreen fullScreen />}><ProtocolConformancePage /></Suspense>} path="/protocol/conformance" />
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
          <EnvironmentProvider>
            <ToastProvider>
              <AppRoutes />
            </ToastProvider>
          </EnvironmentProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
