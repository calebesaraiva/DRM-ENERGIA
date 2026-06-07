import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Header.css';

const Header = () => {
  const [scrolled, setScrolled] = useState(false);
  const [role, setRole] = useState(() => localStorage.getItem('role'));
  const navigate = useNavigate();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('role');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setRole(null);
    navigate('/');
  };

  return (
    <header className={`header ${scrolled ? 'scrolled' : ''}`}>
      <div className="container header-content">
        <Link to="/" className="logo-link">
          <img src="/assets/logo.png" alt="DRM Energia Solar" className="logo-img" />
        </Link>
        <nav className="main-nav">
          <ul className="nav-links">
            <li><a href="#contato">Contato</a></li>
          </ul>
          {role ? (
            <div className="user-actions">
              <Link to={['ADMIN', 'ADM', 'CONSULTOR', 'EQUIPE_TECNICA_COMERCIAL'].includes(role) ? '/admin' : '/dashboard'} className="btn btn-primary login-btn">Meu Painel</Link>
              <button onClick={handleLogout} className="btn btn-outline logout-btn">Sair</button>
            </div>
          ) : (
            <div className="access-actions">
              <Link to="/login?tipo=cliente" className="client-panel-link">Portal do Cliente</Link>
              <Link to="/acesso" className="btn btn-primary login-btn">Acessar painéis</Link>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
};

export default Header;
