import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import './Login.css';
import { withApiBase } from '../utils/apiBase';
import PasswordField from '../components/PasswordField';

const Login = ({ accessType: forcedAccessType = null }) => {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const accessType = forcedAccessType || (searchParams.get('tipo') === 'equipe' ? 'equipe' : 'cliente');
  const isTeamAccess = accessType === 'equipe';

  // Se já existe uma sessão válida salva, não força login de novo:
  // ao apertar "voltar" ou recarregar, manda direto para a área do usuário.
  useEffect(() => {
    try {
      const token = localStorage.getItem('token');
      const user = JSON.parse(localStorage.getItem('user') || 'null');
      if (!token || !user) return;

      const part = token.split('.')[1];
      if (part) {
        const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
        if (payload?.exp && payload.exp * 1000 <= Date.now()) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          localStorage.removeItem('role');
          return;
        }
      }

      if (user.mustChangePassword) { navigate('/alterar-senha', { replace: true }); return; }
      if (user.requiresEmailVerification) { navigate('/verificar-email', { replace: true }); return; }

      const isInternalUser = user.userType === 'interno'
        || ['ADMIN', 'ADM', 'CONSULTOR', 'EQUIPE_TECNICA_COMERCIAL'].includes(user.role);
      navigate(isInternalUser ? '/admin' : '/dashboard', { replace: true });
    } catch {
      /* token malformado — deixa na tela de login */
    }
  }, [navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');

    if (!email || !senha) {
      setError('Por favor, preencha e-mail e senha.');
      return;
    }

    try {
      const response = await fetch(withApiBase('/api/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: senha })
      });
      const contentType = response.headers.get('content-type') || '';
      let data = null;
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        data = text ? { message: text } : null;
      }

      if (!response.ok) {
        throw new Error(data?.message || 'Falha no login.');
      }

      if (!data?.token || !data?.user) {
        throw new Error('A API de login retornou resposta inválida. Verifique se o backend está online.');
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('role', data.user.role);
      localStorage.setItem('user', JSON.stringify(data.user));

      const isInternalUser = data.user.userType === 'interno' || ['ADMIN', 'ADM', 'CONSULTOR', 'EQUIPE_TECNICA_COMERCIAL'].includes(data.user.role);
      if (isTeamAccess && !isInternalUser) {
        localStorage.removeItem('token');
        localStorage.removeItem('role');
        localStorage.removeItem('user');
        throw new Error('Este acesso é exclusivo da equipe DRM. Use o Portal do Cliente.');
      }

      if (!isTeamAccess && isInternalUser) {
        localStorage.removeItem('token');
        localStorage.removeItem('role');
        localStorage.removeItem('user');
        throw new Error('Este acesso é exclusivo para clientes. Use o Sistema DRM.');
      }

      if (isInternalUser) {
        if (data.user.mustChangePassword) {
          navigate('/alterar-senha');
          return;
        }
        if (data.user.requiresEmailVerification) {
          navigate('/verificar-email');
          return;
        }
        navigate('/admin');
      } else {
        if (data.user.requiresEmailVerification) {
          navigate('/verificar-email');
          return;
        }
        navigate('/dashboard');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className={`login-wrapper ${isTeamAccess ? 'team-login' : 'client-login'}`}>
      <div className="login-image-side">
        <div className="login-image-overlay">
          <span>{isTeamAccess ? 'Sistema interno DRM' : 'Portal do Cliente DRM'}</span>
          <h2>{isTeamAccess ? 'Operação conectada, do lead à instalação.' : 'Seu projeto solar na palma da mão.'}</h2>
          <p>{isTeamAccess ? 'Entre para gerenciar clientes, contratos, produtos, projetos, ordens de serviço e financeiro.' : 'Acompanhe contrato, financiamento, entrega, instalação, previsão da Equatorial e atendimento.'}</p>
        </div>
      </div>
      <div className="login-form-side">
        <div className="login-card-modern">
          <Link to="/" className="login-logo-link">
            <img src="/assets/logo.png" alt="DRM Logo" className="login-logo" />
          </Link>
          <span className="login-mode-label">{isTeamAccess ? 'Acesso interno' : 'Acesso do cliente'}</span>
          <h2 className="login-title">{isTeamAccess ? 'Entrar no Sistema DRM' : 'Entrar no Portal do Cliente'}</h2>
          {error && <p className="error-message" style={{ textAlign: 'center', marginBottom: '1rem' }}>{error}</p>}
          <p className="login-subtitle">{isTeamAccess ? 'Use seu usuário interno ou e-mail corporativo.' : 'Use o e-mail cadastrado para acompanhar seu projeto.'}</p>
          
          <form onSubmit={handleLogin} className="login-form">
            <div className="input-group">
              <label htmlFor="email">Usuário ou E-mail</label>
              <input 
                type="text" 
                id="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={isTeamAccess ? 'Usuário ou e-mail da equipe' : 'E-mail do cliente'}
                required 
              />
            </div>
            <PasswordField
                label="Senha"
                id="senha"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="Digite sua senha"
                required 
            />
            
            <div className="login-options">
              <label className="remember-me">
                <input type="checkbox" /> Lembrar de mim
              </label>
              <Link to="/recuperar-senha" className="forgot-password">Esqueceu a senha?</Link>
            </div>

            <button type="submit" className="btn btn-primary btn-block">{isTeamAccess ? 'Entrar no sistema interno' : 'Acessar meu portal'}</button>
          </form>
          
          <div className="login-footer">
            <p className="login-security-note">{isTeamAccess ? 'Área exclusiva da equipe DRM.' : 'Seu acesso é protegido por verificação de e-mail.'}</p>
            <div className="login-footer-links">
              <Link to="/" className="btn-voltar">Voltar para o site</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
