import './Benefits.css';
import { makeWhatsAppLink } from '../utils/whatsapp';
import WhatsAppIcon from './WhatsAppIcon';

const benefitsList = [
  {
    id: 1,
    title: 'Economia imediata',
    description: 'Reduza sua conta de luz em até 82% logo no primeiro mês.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id: 2,
    title: 'Financiamento facilitado',
    description: 'Parcelas que cabem no seu bolso e podem ser menores que a conta.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="12" cy="14" r="2" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    id: 3,
    title: 'Valorização do imóvel',
    description: 'Imóveis com energia solar instalada valorizam no mercado.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M9 22V12h6v10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    id: 4,
    title: 'Energia limpa',
    description: 'Fonte 100% renovável e sustentável para o futuro do planeta.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M2 20c3.6-5.3 8.4-8 14-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M12 4c0 5-4 8-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M12 4c0 5 4 8 8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id: 5,
    title: 'Baixa manutenção',
    description: 'Painéis com longa vida útil e manutenção simples.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M19.07 4.93a10 10 0 010 14.14M4.93 4.93a10 10 0 000 14.14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M12 2v2M12 20v2M2 12h2M20 12h2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id: 6,
    title: 'Homologação inclusa',
    description: 'A DRM cuida de toda a burocracia com a concessionária.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
];

const Benefits = ({ onOpenSimulation }) => (
  <section className="benefits-section" id="beneficios">
    <div className="container">
      <div className="section-header benefits-header">
        <span className="section-label">VANTAGENS</span>
        <h2 className="section-title">Por que escolher energia solar?</h2>
        <p className="section-desc">Um investimento inteligente que traz benefícios financeiros e ambientais imediatos.</p>
      </div>

      <div className="benefits-grid">
        {benefitsList.map((b) => (
          <div key={b.id} className="benefit-card">
            <span className="benefit-icon">{b.icon}</span>
            <h3 className="benefit-title">{b.title}</h3>
            <p className="benefit-desc">{b.description}</p>
          </div>
        ))}
      </div>

      <div className="benefits-cta">
        <button
          type="button"
          className="btn-lp-orange"
          onClick={() => onOpenSimulation?.()}
        >
          <WhatsAppIcon />
          Quero reduzir minha conta
        </button>
        <a
          className="btn-lp-green-outline"
          href={makeWhatsAppLink('secao_beneficios')}
          target="_blank"
          rel="noopener noreferrer"
        >
          <WhatsAppIcon />
          Tirar dúvidas no WhatsApp
        </a>
      </div>
    </div>
  </section>
);

export default Benefits;
