import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './Login.css';
import { withApiBase } from '../utils/apiBase';
import PasswordField from '../components/PasswordField';

function ChangePassword() {
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');

    if (newPassword !== confirmPassword) {
      setError('As senhas não conferem.');
      return;
    }

    try {
      const response = await fetch(withApiBase('/api/change-password'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const contentType = response.headers.get('content-type') || '';
      let data = null;
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        data = text ? { message: text } : null;
      }
      if (!response.ok) throw new Error(data?.message || 'Não foi possível alterar a senha.');

      const user = JSON.parse(localStorage.getItem('user'));
      localStorage.setItem('user', JSON.stringify({ ...user, mustChangePassword: false }));
      setMessage('Senha alterada com sucesso.');
      setTimeout(() => navigate('/admin'), 700);
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
          <h2 className="login-title">Crie sua senha fixa</h2>
          <p className="login-subtitle">Por segurança, troque a senha temporária no primeiro acesso.</p>
          {error && <p className="error-message" style={{ textAlign: 'center', marginBottom: '1rem' }}>{error}</p>}
          {message && <p className="register-message">{message}</p>}
          <form onSubmit={handleSubmit}>
            <PasswordField label="Senha temporária" id="currentPassword" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
            <PasswordField label="Nova senha fixa" id="newPassword" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
            <PasswordField label="Confirmar nova senha" id="confirmPassword" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
            <button type="submit" className="btn btn-primary btn-block">Salvar senha</button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default ChangePassword;
