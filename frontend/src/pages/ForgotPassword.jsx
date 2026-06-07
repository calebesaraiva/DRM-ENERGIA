import { useState } from 'react';
import { Link } from 'react-router-dom';
import './Login.css';
import { withApiBase } from '../utils/apiBase';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setStatus('');
    setError('');

    if (!email.trim()) {
      setError('Informe seu e-mail ou usuário.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(withApiBase('/api/forgot-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.message || 'Não foi possível solicitar a recuperação.');
      }
      setStatus(data?.message || 'Se esse e-mail estiver cadastrado, enviaremos um link para redefinir sua senha.');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-image-side">
        <div className="login-image-overlay">
          <h2>Recupere seu acesso</h2>
          <p>Enviaremos um link seguro para você criar uma nova senha.</p>
        </div>
      </div>
      <div className="login-form-side">
        <div className="login-card-modern">
          <Link to="/" className="login-logo-link">
            <img src="/assets/logo.png" alt="DRM Logo" className="login-logo" />
          </Link>
          <h2 className="login-title">Esqueci minha senha</h2>
          {error && <p className="error-message" style={{ textAlign: 'center', marginBottom: '1rem' }}>{error}</p>}
          {status && <p className="success-message" style={{ textAlign: 'center', marginBottom: '1rem' }}>{status}</p>}
          <p className="login-subtitle">Digite seu e-mail ou usuário cadastrado.</p>

          <form onSubmit={handleSubmit} className="login-form">
            <div className="input-group">
              <label htmlFor="email">Usuário ou E-mail</label>
              <input
                type="text"
                id="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Digite seu usuário ou e-mail"
                autoComplete="username"
                required
              />
            </div>

            <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
              {loading ? 'Enviando...' : 'Enviar link de recuperação'}
            </button>
          </form>

          <div className="login-footer">
            <Link to="/portal-cliente" className="btn-voltar">Voltar para o portal</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
