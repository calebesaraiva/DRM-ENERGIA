import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { makeWhatsAppLink } from '../utils/whatsapp';
import WhatsAppIcon from './WhatsAppIcon';
import './Header.css';

const Header = () => {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [role, setRole] = useState(() => localStorage.getItem('role'));
  const navigate = useNavigate();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
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

  const navLinks = [
    { label: 'Benefícios', href: '#beneficios' },
    { label: 'Projetos', href: '#projetos' },
    { label: 'Como funciona', href: '#como-funciona' },
    { label: 'Dúvidas', href: '#duvidas' },
    { label: 'Sobre nós', href: '#contato' },
  ];

  return (
    <header className={`header ${scrolled ? 'scrolled' : ''}`}>
      <div className="container header-content">
        <Link to="/" className="logo-link">
          <img src="/assets/logo.png" alt="DRM Energia Solar" className="logo-img" />
        </Link>

        <nav className={`main-nav ${menuOpen ? 'nav-open' : ''}`}>
          <ul className="nav-links">
            {navLinks.map((link) => (
              <li key={link.href}>
                <a href={link.href} onClick={() => setMenuOpen(false)}>{link.label}</a>
              </li>
            ))}
          </ul>

          {role ? (
            <div className="header-right">
              <Link to={['ADMIN', 'ADM', 'CONSULTOR', 'EQUIPE_TECNICA_COMERCIAL'].includes(role) ? '/admin' : '/dashboard'} className="btn btn-outline header-portal-btn">Meu Painel</Link>
              <button onClick={handleLogout} className="btn btn-outline header-portal-btn">Sair</button>
            </div>
          ) : (
            <div className="header-right">
              <a href={makeWhatsAppLink('header_cta')} target="_blank" rel="noopener noreferrer" className="btn btn-header-whatsapp">
                <WhatsAppIcon />
                Falar no WhatsApp
              </a>
            </div>
          )}
        </nav>

        <button
          className={`hamburger ${menuOpen ? 'is-open' : ''}`}
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Menu"
          type="button"
        >
          <span />
          <span />
          <span />
        </button>
      </div>

      {menuOpen && <div className="nav-backdrop" onClick={() => setMenuOpen(false)} />}
    </header>
  );
};

export default Header;
