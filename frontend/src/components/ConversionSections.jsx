import { makeWhatsAppLink } from '../utils/whatsapp';
import WhatsAppIcon from './WhatsAppIcon';
import './ConversionSections.css';

export const TrustBar = () => (
  <section className="trust-bar">
    <div className="container trust-grid">
      <div><strong>+1300</strong><span>projetos entregues</span></div>
      <div><strong>até 82%</strong><span>de economia na conta</span></div>
      <div><strong>25 anos</strong><span>de vida útil dos paineis</span></div>
      <div><strong>100%</strong><span>homologação cuidada pela DRM</span></div>
    </div>
  </section>
);

export const OfferBanner = ({ onOpenSimulation }) => {
  const deadlineRaw = import.meta.env.VITE_OFFER_DEADLINE || '2026-06-30';
  const date = new Date(`${deadlineRaw}T00:00:00`);
  const deadline = Number.isNaN(date.getTime())
    ? deadlineRaw
    : date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return (
    <section className="offer-banner">
      <div className="container offer-wrap">
        <p><strong>Condição especial:</strong> projeto + homologação com atendimento prioritário até <strong>{deadline}</strong>.</p>
        <div className="offer-actions">
          <button type="button" className="btn btn-primary" onClick={() => onOpenSimulation?.()}>Quero minha condição</button>
          <a className="btn btn-outline btn-whatsapp" href={makeWhatsAppLink('oferta_prazo')} target="_blank" rel="noopener noreferrer">
            <WhatsAppIcon />
            Falar com consultor
          </a>
        </div>
      </div>
    </section>
  );
};

export const SocialProof = () => (
  <section className="social-proof">
    <div className="container">
      <div className="section-header">
        <span className="section-subtitle">Clientes Reais</span>
        <h2 className="section-title">Antes e depois da conta de energia</h2>
      </div>
      <div className="before-after-grid">
        <article className="proof-card">
          <h3>Família Santos - Imperatriz</h3>
          <p>Antes: R$ 782 | Depois: R$ 143</p>
          <strong>Economia média: R$ 639/mês</strong>
        </article>
        <article className="proof-card">
          <h3>Mercado Central - Açailândia</h3>
          <p>Antes: R$ 2.140 | Depois: R$ 488</p>
          <strong>Economia média: R$ 1.652/mês</strong>
        </article>
        <article className="proof-card">
          <h3>Clínica Vida - João Lisboa</h3>
          <p>Antes: R$ 1.320 | Depois: R$ 276</p>
          <strong>Economia média: R$ 1.044/mês</strong>
        </article>
      </div>
      <a className="btn btn-primary btn-whatsapp btn-whatsapp-primary" href={makeWhatsAppLink('prova_social')} target="_blank" rel="noopener noreferrer">
        <WhatsAppIcon />
        Quero resultado assim
      </a>
    </div>
  </section>
);

export const ObjectionBreakers = ({ onOpenSimulation }) => (
  <section className="objections">
    <div className="container">
      <div className="section-header">
        <span className="section-subtitle">Sem Dúvidas</span>
        <h2 className="section-title">Quebramos as principais objeções</h2>
      </div>
      <div className="objection-grid">
        <article className="objection-card">
          <div className="objection-icon-wrap">
            <svg className="objection-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 3L20 7V12C20 16.5 16.9 20.74 12 22C7.1 20.74 4 16.5 4 12V7L12 3Z" stroke="currentColor" strokeWidth="1.7"/>
              <path d="M8.5 12H15.5M12 8.5V15.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
            </svg>
            <span>01</span>
          </div>
          <h4>Financiamento</h4>
          <p>Parcelas alinhadas para caber dentro da economia gerada.</p>
        </article>
        <article className="objection-card">
          <div className="objection-icon-wrap">
            <svg className="objection-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 3L20 7V12C20 16.5 16.9 20.74 12 22C7.1 20.74 4 16.5 4 12V7L12 3Z" stroke="currentColor" strokeWidth="1.7"/>
              <path d="M8.5 12.5L11 15L15.5 10.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>02</span>
          </div>
          <h4>Garantia</h4>
          <p>Equipamentos com garantia de fábrica e suporte técnico contínuo.</p>
        </article>
        <article className="objection-card">
          <div className="objection-icon-wrap">
            <svg className="objection-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 7V12L15 14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="12" cy="12" r="8.2" stroke="currentColor" strokeWidth="1.7"/>
            </svg>
            <span>03</span>
          </div>
          <h4>Instalação rápida</h4>
          <p>Cronograma claro, equipe própria e acompanhamento até a ligação final.</p>
        </article>
        <article className="objection-card">
          <div className="objection-icon-wrap">
            <svg className="objection-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M8 6H18M8 12H18M8 18H18M5 6H5.01M5 12H5.01M5 18H5.01" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
            </svg>
            <span>04</span>
          </div>
          <h4>Burocracia Zero</h4>
          <p>A DRM cuida da homologação com a concessionária para você.</p>
        </article>
      </div>
      <div className="objection-cta">
        <button type="button" className="btn btn-primary btn-simular" onClick={() => onOpenSimulation?.()}>Receber estudo gratuito</button>
      </div>
    </div>
  </section>
);
