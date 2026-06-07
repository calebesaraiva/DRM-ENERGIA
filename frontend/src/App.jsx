import React, { Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';

// Import de componentes e helpers
import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import ErrorBoundary from './components/ErrorBoundary';
import ScrollToTop from './components/ScrollToTop.jsx';
import StickyCTA from './components/StickyCTA.jsx';
import { initSiteAnalytics, trackSiteEvent } from './utils/analytics';

// Lazy loading das páginas para melhor performance
const Home = React.lazy(() => import('./pages/Home'));
const AccessHub = React.lazy(() => import('./pages/AccessHub'));
const Login = React.lazy(() => import('./pages/Login'));
const Register = React.lazy(() => import('./pages/Register'));
const ForgotPassword = React.lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = React.lazy(() => import('./pages/ResetPassword'));
const VerifyEmail = React.lazy(() => import('./pages/VerifyEmail'));
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const AdminDashboard = React.lazy(() => import('./pages/AdminDashboard'));
const ChangePassword = React.lazy(() => import('./pages/ChangePassword'));

// Componente de fallback para o Suspense
const LoadingFallback = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: 'var(--cor-fundo)', color: 'var(--cor-texto)' }}>
    Carregando...
  </div>
);

function AppShell() {
  const location = useLocation();
  const isSystemRoute = ['/admin', '/dashboard', '/orcamento', '/alterar-senha', '/verificar-email', '/acesso'].some(path => location.pathname.startsWith(path));

  useEffect(() => {
    initSiteAnalytics();
  }, []);

  useEffect(() => {
    if (!isSystemRoute) {
      trackSiteEvent('page_view', 'route_change', { path: location.pathname });
    }
  }, [isSystemRoute, location.pathname]);

  return (
    <>
      {!isSystemRoute && <Header />}
      <ScrollToTop />
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/acesso" element={<AccessHub />} />
          <Route path="/portal-cliente" element={<Login accessType="cliente" />} />
          <Route path="/sistema-drm" element={<Login accessType="equipe" />} />
          <Route path="/login" element={<Login />} />
          <Route path="/recuperar-senha" element={<ForgotPassword />} />
          <Route path="/redefinir-senha" element={<ResetPassword />} />
          <Route path="/verificar-email" element={<VerifyEmail />} />
          <Route path="/register" element={<Register />} />
          <Route path="/alterar-senha" element={<ChangePassword />} />
          <Route path="/orcamento" element={<Dashboard />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/admin" element={<AdminDashboard />} />
        </Routes>
      </Suspense>
      {!isSystemRoute && <StickyCTA />}
      {!isSystemRoute && <Footer />}
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <AppShell />
      </Router>
    </ErrorBoundary>
  );
}

export default App;
