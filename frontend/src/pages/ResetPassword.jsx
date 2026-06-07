import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import './Login.css';
import { withApiBase } from '../utils/apiBase';

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = useMemo(() => searchParams.get('token') || '', [searchParams]);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setStatus('');
    setError('');

    if (!token) {
      setError('Link de recuperação inválido. Solicite um novo e-mail.');
      return;
    }

    if (password.length < 6) {
      setError('A nova senha precisa ter pelo menos 6 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setError('As senhas não conferem.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(withApiBase('/api/reset-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.message || 'Não foi possível redefinir a senha.');
      }
      setStatus(data?.message || 'Senha redefinida com sucesso.');
      setTimeout(() => navigate('/portal-cliente'), 1200);
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
          <h2>Crie uma nova senha</h2>
          <p>Use uma senha segura para proteger seu painel DRM.</p>
        </div>
      </div>
      <div className="login-form-side">
        <div className="login-card-modern">
          <Link to="/" className="login-logo-link">
            <img src="/assets/logo.png" alt="DRM Logo" className="login-logo" />
          </Link>
          <h2 className="login-title">Redefinir senha</h2>
          {error && <p className="error-message" style={{ textAlign: 'center', marginBottom: '1rem' }}>{error}</p>}
          {status && <p className="success-message" style={{ textAlign: 'center', marginBottom: '1rem' }}>{status}</p>}
          <p className="login-subtitle">Informe sua nova senha de acesso.</p>

          <form onSubmit={handleSubmit} className="login-form">
            <div className="input-group">
              <label htmlFor="password">Nova senha</label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Digite a nova senha"
                autoComplete="new-password"
                required
              />
            </div>
            <div className="input-group">
              <label htmlFor="confirmPassword">Confirmar senha</label>
              <input
                type="password"
                id="confirmPassword"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Repita a nova senha"
                autoComplete="new-password"
                required
              />
            </div>

            <button type="submit" className="btn btn-primary btn-block" disabled={loading || !token}>
              {loading ? 'Salvando...' : 'Redefinir senha'}
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

export default ResetPassword;
