import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './Login.css';

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
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Não foi possível alterar a senha.');

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
            <div className="input-group">
              <label htmlFor="currentPassword">Senha temporária</label>
              <input id="currentPassword" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
            </div>
            <div className="input-group">
              <label htmlFor="newPassword">Nova senha fixa</label>
              <input id="newPassword" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
            </div>
            <div className="input-group">
              <label htmlFor="confirmPassword">Confirmar nova senha</label>
              <input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
            </div>
            <button type="submit" className="btn btn-primary btn-block">Salvar senha</button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default ChangePassword;
