import React from 'react';
import './HowItWorks.css';

const HowItWorks = () => {
  const steps = [
    {
      number: "01",
      title: "Simulação Gratuita",
      desc: "Você nos informa o valor da sua fatura e preparamos um estudo de viabilidade sem compromisso."
    },
    {
      number: "02",
      title: "Projeto Personalizado",
      desc: "Nossos engenheiros desenham o sistema ideal para o seu telhado, garantindo a maior eficiência."
    },
    {
      number: "03",
      title: "Instalação e Homologação",
      desc: "Nossa equipe instala os equipamentos e cuida de toda a burocracia com a concessionária de energia."
    }
  ];

  return (
    <section className="how-it-works">
      <div className="container">
        <div className="hiw-content">
          <div className="hiw-text">
            <span className="section-subtitle">Simples e Rápido</span>
            <h2 className="section-title">Como Funciona?</h2>
            <p className="section-desc text-left">
              O processo para você começar a gerar sua própria energia é descomplicado. Nós cuidamos de tudo, do projeto à homologação.
            </p>
            <a href="#contato" className="btn btn-primary mt-4">Falar com Especialista</a>
          </div>
          
          <div className="hiw-steps">
            {steps.map((step, index) => (
              <div key={index} className="step-card">
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
