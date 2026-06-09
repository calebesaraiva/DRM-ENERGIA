import { useState } from 'react';
import { makeWhatsAppLink } from '../utils/whatsapp';
import WhatsAppIcon from './WhatsAppIcon';
import './Hero.css';

const energyOptions = [
  {
    id: 'ate300',
    label: 'Até R$300/mês',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M9 22V12h6v10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    id: '300a700',
    label: 'De R$300 a R$700/mês',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="2" y="7" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M12 12v4M10 14h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id: 'acima700',
    label: 'Acima de R$700/mês',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="12" cy="14" r="3" stroke="currentColor" strokeWidth="1.8"/>
      </svg>
    ),
  },
  {
    id: 'empresa',
    label: 'Empresa, fazenda ou comércio',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M8 21h8M12 17v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
  },
];

const Hero = ({ onOpenSimulation = () => {} }) => {
  const [selected, setSelected] = useState(null);

  const handleSimulate = () => {
    onOpenSimulation();
  };

  const handleOptionClick = (id) => {
    setSelected(id);
    onOpenSimulation();
  };

  const heroSimularLink = makeWhatsAppLink('hero_simular');

  return (
    <section className="hero-lp">
      <div className="hero-lp-bg" />
      <div className="hero-lp-overlay" />

      <div className="container hero-lp-inner">
        {/* LEFT */}
        <div className="hero-lp-left">
          <span className="hero-lp-badge">+1300 projetos entregues</span>

          <h1 className="hero-lp-title">
            Reduza sua conta de luz<br />
            em <span className="hero-lp-accent">até 82%</span> com<br />
            <span className="hero-lp-accent">energia solar</span>
          </h1>

          <p className="hero-lp-sub">
            A DRM cuida de todo o processo: projeto, instalação<br className="hero-br" />
            e homologação com a concessionária.
          </p>

          <div className="hero-lp-stats">
            <div className="hero-stat">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7"/><path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>
              <div><strong>+1300</strong><span>projetos entregues</span></div>
            </div>
            <div className="hero-stat">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.7"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>
              <div><strong>Equipe</strong><span>credenciada</span></div>
            </div>
            <div className="hero-stat">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
              <div><strong>Homologação</strong><span>inclusa</span></div>
            </div>
            <div className="hero-stat">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" stroke="currentColor" strokeWidth="1.7"/><circle cx="12" cy="10" r="3" stroke="currentColor" strokeWidth="1.7"/></svg>
              <div><strong>Atendimento</strong><span>MA, TO e PA</span></div>
            </div>
          </div>

          <div className="hero-lp-actions">
            <button type="button" className="btn-lp-green" onClick={handleSimulate}>
              <WhatsAppIcon />
              Simular economia agora
            </button>
            <a href="#projetos" className="btn-lp-outline">
              Ver projetos entregues
            </a>
          </div>
        </div>

        {/* RIGHT — simulator card */}
        <div className="hero-sim-card">
          <div className="hero-sim-head">
            <p className="hero-sim-title">Simule sua economia agora</p>
            <p className="hero-sim-sub">É rápido e gratuito!</p>
          </div>
          <p className="hero-sim-label">Quanto você paga de energia hoje?</p>
          <ul className="hero-sim-options">
            {energyOptions.map((opt) => (
              <li key={opt.id}>
                <button
                  type="button"
                  className={`hero-sim-opt ${selected === opt.id ? 'selected' : ''}`}
                  onClick={() => handleOptionClick(opt.id)}
                >
                  <span className="hero-sim-opt-icon">{opt.icon}</span>
                  <span className="hero-sim-opt-label">{opt.label}</span>
                  <svg className="hero-sim-opt-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="hero-sim-cta" onClick={handleSimulate}>
            <WhatsAppIcon />
            Quero calcular minha economia
          </button>
        </div>
      </div>
    </section>
  );
};

export default Hero;
