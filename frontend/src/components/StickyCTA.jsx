import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { makeWhatsAppLink } from '../utils/whatsapp';
import WhatsAppIcon from './WhatsAppIcon';
import './StickyCTA.css';

const StickyCTA = ({ onOpenSimulation }) => {
  const [show, setShow] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const handleOpenSimulation = () => {
    if (typeof onOpenSimulation === 'function') {
      onOpenSimulation();
      return;
    }
    if (location.pathname !== '/') {
      localStorage.setItem('openSimulationOnHome', '1');
      navigate('/');
      return;
    }
    localStorage.setItem('openSimulationOnHome', '1');
    window.dispatchEvent(new Event('open-simulation-request'));
  };

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 300);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className={`sticky-cta ${show ? 'sticky-cta--visible' : ''}`} aria-hidden={!show}>
      {/* Desktop: barra horizontal */}
      <div className="sticky-desktop">
        <button type="button" className="sticky-btn-simulate" onClick={handleOpenSimulation}>
          Simular minha economia
        </button>
        <a
          className="sticky-btn-whatsapp"
          href={makeWhatsAppLink('cta_fixo')}
          target="_blank"
          rel="noopener noreferrer"
        >
          <WhatsAppIcon />
          WhatsApp agora
        </a>
      </div>

      {/* Mobile: 2 botões full-width na base */}
      <div className="sticky-mobile">
        <button type="button" className="sticky-mobile-simulate" onClick={handleOpenSimulation}>
          Simular minha economia
        </button>
        <a
          className="sticky-mobile-whatsapp"
          href={makeWhatsAppLink('cta_fixo_mobile')}
          target="_blank"
          rel="noopener noreferrer"
        >
          <WhatsAppIcon />
          WhatsApp
        </a>
      </div>
    </div>
  );
};

export default StickyCTA;
