import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './Login.css';

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
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: senha })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Falha no login.');
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('role', data.user.role);
      localStorage.setItem('user', JSON.stringify(data.user));

      if (data.user.mustChangePassword) {
        navigate('/alterar-senha');
      } else if (data.user.role === 'ADMIN' || data.user.role === 'ADM') {
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
              <a href="#" className="forgot-password">Esqueceu a senha?</a>
            </div>

            <button type="submit" className="btn btn-primary btn-block">Entrar no Painel</button>
          </form>
          
          <div className="login-footer">
            <p>Ainda não tem conta? <Link to="/register">Criar uma conta</Link></p>
            <Link to="/" className="btn-voltar">← Voltar para a página inicial</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
