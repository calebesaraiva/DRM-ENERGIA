import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { makeWhatsAppLink } from '../utils/whatsapp';
import WhatsAppIcon from './WhatsAppIcon';
import './Header.css';

const Header = () => {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const [role, setRole] = useState(() => localStorage.getItem('role'));
  const navigate = useNavigate();
  const accessRef = useRef(null);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (accessRef.current && !accessRef.current.contains(e.target)) {
        setAccessOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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

          {/* Mobile-only: acesso direto sem dropdown */}
          {!role && (
            <div className="mobile-access-section">
              <p className="mobile-access-label">Acessar sistema</p>
              <Link to="/portal-cliente" className="mobile-access-link" onClick={() => setMenuOpen(false)}>
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="1.8"/></svg>
                Portal do Cliente
              </Link>
              <Link to="/sistema-drm" className="mobile-access-link" onClick={() => setMenuOpen(false)}>
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.8"/><path d="M8 21h8M12 17v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
                Equipe DRM
              </Link>
            </div>
          )}

          <div className="header-right">
            {role ? (
              <>
                <Link
                  to={['ADMIN', 'ADM', 'CONSULTOR', 'EQUIPE_TECNICA_COMERCIAL'].includes(role) ? '/admin' : '/dashboard'}
                  className="btn-header-portal"
                >
                  Meu Painel
                </Link>
                <button onClick={handleLogout} className="btn-header-portal">Sair</button>
              </>
            ) : (
              <>
                {/* Dropdown Entrar */}
                <div className="header-access-wrap" ref={accessRef}>
                  <button
                    type="button"
                    className={`btn-header-access ${accessOpen ? 'open' : ''}`}
                    onClick={() => setAccessOpen((o) => !o)}
                    aria-haspopup="true"
                    aria-expanded={accessOpen}
                  >
                    Entrar
                    <svg className="access-chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                  {accessOpen && (
                    <div className="header-access-dropdown">
                      <Link
                        to="/portal-cliente"
                        className="access-option"
                        onClick={() => { setAccessOpen(false); setMenuOpen(false); }}
                      >
                        <span className="access-option-icon">
                          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                            <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="1.8"/>
                          </svg>
                        </span>
                        <span>
                          <strong>Portal do Cliente</strong>
                          <small>Acompanhe seu projeto</small>
                        </span>
                      </Link>
                      <Link
                        to="/sistema-drm"
                        className="access-option"
                        onClick={() => { setAccessOpen(false); setMenuOpen(false); }}
                      >
                        <span className="access-option-icon">
                          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.8"/>
                            <path d="M8 21h8M12 17v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                          </svg>
                        </span>
                        <span>
                          <strong>Equipe DRM</strong>
                          <small>Sistema interno</small>
                        </span>
                      </Link>
                    </div>
                  )}
                </div>

                <a
                  href={makeWhatsAppLink('header_cta')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-header-whatsapp"
                >
                  <WhatsAppIcon />
                  Falar no WhatsApp
                </a>
              </>
            )}
          </div>
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
