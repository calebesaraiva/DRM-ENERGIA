import './Footer.css';
import { makeWhatsAppLink } from '../utils/whatsapp';
import WhatsAppIcon from './WhatsAppIcon';

const Footer = () => {
  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  const address = 'Av Jacob, Posto São Luís 2 - Jardim Tropical, Imperatriz - MA, 65910-727';

  return (
    <footer className="footer" id="contato">
      <div className="container">
        <div className="footer-top">
          <div className="footer-brand">
            <div className="footer-logo-card">
              <img src="/assets/logo.png" alt="DRM Energia Solar" className="footer-logo" />
            </div>
            <p className="footer-desc">Energia solar com projeto personalizado, instalação própria e acompanhamento até sua conta ficar mais leve.</p>
            <div className="footer-trust">
              <span>+1300 projetos</span>
              <span>Equipe credenciada</span>
              <span>Suporte regional</span>
            </div>
          </div>
          
          <div className="footer-contato">
            <span className="footer-kicker">Atendimento DRM</span>
            <h4>Fale com quem resolve</h4>
            <div className="contact-list">
              <a className="contact-card contact-card-whatsapp" href={makeWhatsAppLink('rodape')} target="_blank" rel="noopener noreferrer">
                <span className="contact-icon contact-icon-whatsapp"><WhatsAppIcon /></span>
                <span><strong>WhatsApp</strong><small>(99) 99167-5608</small></span>
              </a>
              <a className="contact-card" href="https://www.instagram.com/drm.energia.solar/" target="_blank" rel="noopener noreferrer">
                <span className="contact-icon">◎</span>
                <span><strong>Instagram</strong><small>@drm.energia.solar</small></span>
              </a>
              <a className="contact-card" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`} target="_blank" rel="noopener noreferrer">
                <span className="contact-icon">⌖</span>
                <span><strong>Endereço</strong><small>{address}</small></span>
              </a>
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
