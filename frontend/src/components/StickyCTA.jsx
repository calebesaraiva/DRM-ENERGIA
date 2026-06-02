import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { makeWhatsAppLink } from '../utils/whatsapp';
import WhatsAppIcon from './WhatsAppIcon';
import './StickyCTA.css';

const StickyCTA = ({ onOpenSimulation }) => {
  const [showDesktop, setShowDesktop] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hasSimulated, setHasSimulated] = useState(() => localStorage.getItem('leadSimulationCompleted') === '1');
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
    const onScroll = () => setShowDesktop(window.scrollY > 240);
    onScroll();
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const syncSimulationState = () => setHasSimulated(localStorage.getItem('leadSimulationCompleted') === '1');

    window.addEventListener('storage', syncSimulationState);
    window.addEventListener('lead-simulation-completed', syncSimulationState);

    return () => {
      window.removeEventListener('storage', syncSimulationState);
      window.removeEventListener('lead-simulation-completed', syncSimulationState);
    };
  }, []);

  return (
    <>
      <div className={`sticky-cta ${showDesktop ? 'show-desktop' : ''}`}>
        {!hasSimulated && (
          <button className="btn btn-primary sticky-btn btn-simular" type="button" onClick={handleOpenSimulation}>
            Simular economia
          </button>
        )}
        <a className="btn btn-outline btn-whatsapp sticky-btn" href={makeWhatsAppLink('cta_fixo')} target="_blank" rel="noopener noreferrer">
          <WhatsAppIcon />
          WhatsApp agora
        </a>
      </div>

      <button type="button" className="mobile-cta-trigger btn btn-primary btn-simular" onClick={() => setMobileOpen(true)}>
        {hasSimulated ? 'WhatsApp agora' : 'Simular/WhatsApp'}
      </button>

      {mobileOpen && (
        <div className="mobile-cta-popup-backdrop" onClick={() => setMobileOpen(false)} role="presentation">
          <div className="mobile-cta-popup" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <button className="mobile-cta-close" onClick={() => setMobileOpen(false)} type="button" aria-label="Fechar">x</button>
            <h4>Escolha sua ação</h4>
            <p>{hasSimulated ? 'Sua simulação já foi feita. Continue direto com um consultor no WhatsApp.' : 'Atendimento imediato com simulação ou consultor no WhatsApp.'}</p>
            {!hasSimulated && (
              <button className="btn btn-primary btn-simular sticky-btn" type="button" onClick={() => { handleOpenSimulation(); setMobileOpen(false); }}>
                Simular economia
              </button>
            )}
            <a className="btn btn-outline btn-whatsapp sticky-btn mobile-wa-btn" href={makeWhatsAppLink('popup_mobile')} target="_blank" rel="noopener noreferrer" onClick={() => setMobileOpen(false)}>
              <WhatsAppIcon />
              WhatsApp agora
            </a>
          </div>
        </div>
      )}
    </>
  );
};

export default StickyCTA;
