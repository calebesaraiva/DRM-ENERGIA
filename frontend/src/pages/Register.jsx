import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './Register.css';
import { withApiBase } from '../utils/apiBase';

function Register() {
  const [formData, setFormData] = useState({
    nome: '',
    whatsapp: '',
    email: '',
    password: '',
    cidade: ''
  });
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(withApiBase('/api/register'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });
      const data = await response.json();
      if (response.ok) {
        setMessage('Cadastro realizado com sucesso!');
        setTimeout(() => {
          navigate('/login');
        }, 2000);
      } else {
        setMessage(data.message || 'Erro ao cadastrar.');
      }
    } catch (error) {
      console.error('Erro no cadastro:', error);
      setMessage('Erro de conexão com o servidor.');
    }
  };

  return (
    <div className="register-container">
      <div className="register-card">
        <h2>Criar Conta</h2>
        {message && <div className="register-message">{message}</div>}
        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label htmlFor="nome">Nome Completo</label>
            <input type="text" id="nome" name="nome" value={formData.nome} onChange={handleChange} required placeholder="Seu nome completo" />
          </div>
          <div className="input-group">
            <label htmlFor="whatsapp">Whatsapp</label>
            <input type="tel" id="whatsapp" name="whatsapp" value={formData.whatsapp} onChange={handleChange} required placeholder="(00) 90000-0000" />
          </div>
          <div className="input-group">
            <label htmlFor="cidade">Cidade - UF</label>
            <input type="text" id="cidade" name="cidade" value={formData.cidade} onChange={handleChange} required placeholder="Ex: São Paulo - SP" />
          </div>
          <div className="input-group">
            <label htmlFor="email">E-mail</label>
            <input type="email" id="email" name="email" value={formData.email} onChange={handleChange} required placeholder="seu@email.com" />
          </div>
          <div className="input-group">
            <label htmlFor="password">Senha</label>
            <input type="password" id="password" name="password" value={formData.password} onChange={handleChange} required placeholder="Crie uma senha segura" />
          </div>
          <button type="submit" className="register-button">Cadastrar</button>
        </form>
        <p className="login-link">
          Já tem uma conta? <Link to="/login">Faça Login</Link>
        </p>
        <Link to="/" className="btn-voltar" style={{ marginTop: '1rem', display: 'inline-block' }}>← Voltar para a página inicial</Link>
      </div>
    </div>
  );
}

export default Register;
