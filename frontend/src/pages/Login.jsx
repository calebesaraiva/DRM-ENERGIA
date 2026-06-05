import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './Login.css';
import { withApiBase } from '../utils/apiBase';

const Login = () => {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

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

      if (data.user.requiresEmailVerification) {
        navigate('/verificar-email');
        return;
      }

      if (data.user.role === 'ADMIN' || data.user.role === 'ADM') {
        navigate('/admin');
      } else {
        navigate(data.user.permissions?.dashboard ? '/admin' : '/dashboard');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-image-side">
        <div className="login-image-overlay">
          <h2>Bem-vindo de volta!</h2>
          <p>Acesse seu painel e acompanhe sua simulação ou converse com nosso time de especialistas.</p>
        </div>
      </div>
      <div className="login-form-side">
        <div className="login-card-modern">
          <Link to="/" className="login-logo-link">
            <img src="/assets/logo.png" alt="DRM Logo" className="login-logo" />
          </Link>
          <h2 className="login-title">Acesse sua conta</h2>
          {error && <p className="error-message" style={{ textAlign: 'center', marginBottom: '1rem' }}>{error}</p>}
          <p className="login-subtitle">Insira suas credenciais para continuar</p>
          
          <form onSubmit={handleLogin} className="login-form">
            <div className="input-group">
              <label htmlFor="email">Usuário ou E-mail</label>
              <input 
                type="text" 
                id="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Digite seu usuário ou e-mail"
                required 
              />
            </div>
            <div className="input-group">
              <label htmlFor="senha">Senha</label>
              <input 
                type="password" 
                id="senha" 
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="Sua senha secreta"
                required 
              />
            </div>
            
            <div className="login-options">
              <label className="remember-me">
                <input type="checkbox" /> Lembrar de mim
              </label>
              <Link to="/recuperar-senha" className="forgot-password">Esqueceu a senha?</Link>
            </div>

            <button type="submit" className="btn btn-primary btn-block">Entrar no Painel</button>
          </form>
          
          <div className="login-footer">
            <p className="login-security-note">Acesso restrito ao painel DRM.</p>
            <Link to="/" className="btn-voltar">← Voltar para a página inicial</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
