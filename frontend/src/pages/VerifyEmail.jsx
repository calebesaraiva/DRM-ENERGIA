import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Login.css';
import { withApiBase } from '../utils/apiBase';

const getStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null') || {};
  } catch {
    return {};
  }
};

function VerifyEmail() {
  const navigate = useNavigate();
  const storedUser = useMemo(getStoredUser, []);
  const [email, setEmail] = useState(storedUser.emailVerified ? storedUser.email || '' : '');
  const [code, setCode] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [step, setStep] = useState('email');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const token = localStorage.getItem('token');

  const apiRequest = async (path, body) => {
    const response = await fetch(withApiBase(path), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Não foi possível concluir agora.');
    return data;
  };

  const handleSend = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');

    try {
      const data = await apiRequest('/api/email-verification/send', { email });
      setPendingEmail(data.pendingEmail || email);
      setStep('code');
      setMessage('Código enviado. Confira sua caixa de entrada.');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleConfirm = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');

    try {
      const data = await apiRequest('/api/email-verification/confirm', { code });
      localStorage.setItem('user', JSON.stringify(data.user));
      setMessage('E-mail confirmado. Abrindo o painel...');
      setTimeout(() => {
        if (data.user?.role === 'ADM' || data.user?.permissions?.dashboard) {
          navigate('/admin');
        } else {
          navigate('/dashboard');
        }
      }, 600);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-form-side">
        <div className="login-card-modern">
          <Link to="/" className="login-logo-link">
            <img src="/assets/logo.png" alt="DRM Logo" className="login-logo" />
          </Link>
          <h2 className="login-title">Verifique seu e-mail</h2>
          <p className="login-subtitle">Esse e-mail será usado para recuperar senha e proteger seu acesso.</p>
          {error && <p className="error-message" style={{ textAlign: 'center', marginBottom: '1rem' }}>{error}</p>}
          {message && <p className="register-message">{message}</p>}

          {step === 'email' ? (
            <form onSubmit={handleSend} className="login-form">
              <div className="input-group">
                <label htmlFor="email">E-mail de recuperação</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="seu@email.com"
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary btn-block">Enviar código</button>
            </form>
          ) : (
            <form onSubmit={handleConfirm} className="login-form">
              <div className="input-group">
                <label htmlFor="code">Código enviado para {pendingEmail}</label>
                <input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  maxLength="6"
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary btn-block">Confirmar e liberar acesso</button>
              <button type="button" className="btn btn-outline btn-block" onClick={() => setStep('email')}>Trocar e-mail</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default VerifyEmail;
