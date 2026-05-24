import React from 'react';
import { Link } from 'react-router-dom';
import './Footer.css';

const Footer = () => {
  return (
    <footer className="footer" id="contato">
      <div className="container">
        <div className="footer-top">
          <div className="footer-brand">
            <img src="/assets/logo.png" alt="DRM Energia Solar" className="footer-logo" />
            <p className="footer-desc">A DRM Energia Solar é especialista em soluções de energia renovável. Nossa missão é trazer economia sustentável para sua casa ou empresa.</p>
          </div>
          
          <div className="footer-contato">
            <h4>Contato</h4>
            <p><strong>WhatsApp:</strong> (99) 99167-5608</p>
            <p>
              <strong>Instagram:</strong>
              <a href="https://www.instagram.com/drm.energia.solar/" target="_blank" rel="noopener noreferrer" style={{ color: '#d1d5db', textDecoration: 'none', marginLeft: '5px' }}>
                @drm.energia.solar
              </a>
            </p>
            <p><strong>Endereço:</strong> Av Jacob, R. São Luís - Jardim Tropical, Imperatriz - MA, 65910-727</p>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="footer-copy">
            &copy; {new Date().getFullYear()} DRM Energia Solar. Todos os direitos reservados.
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
