import './HowItWorks.css';
import { makeWhatsAppLink } from '../utils/whatsapp';
import WhatsAppIcon from './WhatsAppIcon';

const HowItWorks = ({ onOpenSimulation }) => {
  const steps = [
    { number: '01', title: 'Simulação Gratuita', desc: 'Você informa seu consumo e recebe uma previsão de economia.' },
    { number: '02', title: 'Projeto Personalizado', desc: 'A engenharia define o sistema ideal para seu imóvel.' },
    { number: '03', title: 'Instalação e Homologação', desc: 'A equipe instala e cuida da burocracia com a concessionária.' }
  ];

  return (
    <section className="how-it-works">
      <div className="container">
        <div className="hiw-content">
          <div className="hiw-text">
            <span className="section-subtitle">Simples e Rápido</span>
            <h2 className="section-title">Como Funciona?</h2>
            <p className="section-desc text-left">Nós cuidamos de tudo, do projeto à homologação.</p>
            <div className="section-cta-row">
              <button type="button" className="btn btn-primary mt-4" onClick={() => onOpenSimulation?.()}>Receber estudo gratuito</button>
              <a href={makeWhatsAppLink('secao_como_funciona')} className="btn btn-outline btn-whatsapp mt-4" target="_blank" rel="noopener noreferrer">
                <WhatsAppIcon />
                Falar com especialista
              </a>
            </div>
          </div>

          <div className="hiw-steps">
            {steps.map((step) => (
              <div key={step.number} className="step-card">
                <div className="step-number">{step.number}</div>
                <div className="step-info">
                  <h4>{step.title}</h4>
                  <p>{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
