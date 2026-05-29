import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';

// Import de componentes e helpers
import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import ErrorBoundary from './components/ErrorBoundary';
import ScrollToTop from './components/ScrollToTop.jsx';
import StickyCTA from './components/StickyCTA.jsx';

// Lazy loading das páginas para melhor performance
const Home = React.lazy(() => import('./pages/Home'));
const Login = React.lazy(() => import('./pages/Login'));
const Register = React.lazy(() => import('./pages/Register'));
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
  const isSystemRoute = ['/admin', '/dashboard', '/orcamento', '/alterar-senha'].some(path => location.pathname.startsWith(path));

  return (
    <>
      {!isSystemRoute && <Header />}
      <ScrollToTop />
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
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
