import './Footer.css';

const Footer = () => {
  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

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
            <div className="contact-list">
              <p><span className="contact-icon">◉</span><strong>WhatsApp:</strong> (99) 99167-5608</p>
              <p>
                <span className="contact-icon">◎</span><strong>Instagram:</strong>
                <a href="https://www.instagram.com/drm.energia.solar/" target="_blank" rel="noopener noreferrer" className="footer-link-inline">
                  @drm.energia.solar
                </a>
              </p>
              <p><span className="contact-icon">◌</span><strong>Endereço:</strong> Av Jacob, Posto São Luís 2 - Jardim Tropical, Imperatriz - MA, 65910-727</p>
            </div>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="footer-copy">
            &copy; {new Date().getFullYear()} DRM Energia Solar. Todos os direitos reservados.
          </div>
        </div>
      </div>
      <button type="button" className="back-to-top" onClick={scrollToTop} aria-label="Voltar ao topo">
        ↑
      </button>
    </footer>
  );
};

export default Footer;
