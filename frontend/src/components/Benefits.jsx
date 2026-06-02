import './Benefits.css';
import { makeWhatsAppLink } from '../utils/whatsapp';
import WhatsAppIcon from './WhatsAppIcon';

const Benefits = ({ onOpenSimulation }) => {
  const benefitsList = [
    { id: 1, title: 'Economia Imediata', description: 'Reduza sua conta de luz em até 82% logo no primeiro mês após a instalação do sistema.' },
    { id: 2, title: 'Energia Limpa', description: 'Contribua para um mundo melhor utilizando uma fonte de energia 100% renovável e inesgotável.' },
    { id: 3, title: 'Valorização do Imóvel', description: 'Propriedades com energia solar instalada valorizam no mercado.' },
    { id: 4, title: 'Baixa Manutenção', description: 'Painéis com longa vida útil e manutenção simples.' }
  ];

  return (
    <section className="benefits-section">
      <div className="container">
        <div className="section-header">
          <span className="section-subtitle">Vantagens</span>
          <h2 className="section-title">Por que escolher Energia Solar?</h2>
          <p className="section-desc">Um investimento inteligente que traz benefícios financeiros e ambientais imediatos.</p>
        </div>

        <div className="benefits-grid">
          {benefitsList.map((benefit) => (
            <div key={benefit.id} className="benefit-card">
              <div className="icon-wrapper">
                <span className="benefit-number">0{benefit.id}</span>
              </div>
              <div>
                <h3 className="benefit-title">{benefit.title}</h3>
                <p className="benefit-desc">{benefit.description}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="section-cta-row">
          <button className="btn btn-primary" type="button" onClick={() => onOpenSimulation?.()}>Quero reduzir minha conta</button>
          <a className="btn btn-outline btn-whatsapp" href={makeWhatsAppLink('secao_beneficios')} target="_blank" rel="noopener noreferrer">
            <WhatsAppIcon />
            Tirar dúvidas no WhatsApp
          </a>
        </div>
      </div>
    </section>
  );
};

export default Benefits;
