import React from 'react';
import './Benefits.css';

const Benefits = () => {
  const benefitsList = [
    {
      id: 1,
      title: "Economia Imediata",
      description: "Reduza sua conta de luz em até 82% logo no primeiro mês após a instalação do sistema.",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="benefit-icon">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    },
    {
      id: 2,
      title: "Energia Limpa",
      description: "Contribua para um mundo melhor utilizando uma fonte de energia 100% renovável e inesgotável.",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="benefit-icon">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
        </svg>
      )
    },
    {
      id: 3,
      title: "Valorização do Imóvel",
      description: "Propriedades com sistemas de energia solar instalados valorizam em média de 3% a 10% no mercado.",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="benefit-icon">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
        </svg>
      )
    },
    {
      id: 4,
      title: "Baixa Manutenção",
      description: "Os painéis possuem longa vida útil (mais de 25 anos) e requerem apenas limpeza ocasional.",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="benefit-icon">
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.835M11.42 15.17l-3.976-3.98c-.396-.396-1.042-.396-1.44-.001l-1.38 1.38c-.394.394-.394 1.034.001 1.43l3.976 3.98m3.82-2.81l-3.82 2.81m6.056-11.408a4.5 4.5 0 00-6.364 0l-1.414 1.414a4.5 4.5 0 000 6.364l1.414 1.414a4.5 4.5 0 006.364 0l1.414-1.414a4.5 4.5 0 000-6.364l-1.414-1.414z" />
        </svg>
      )
    }
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
                {benefit.icon}
              </div>
              <h3 className="benefit-title">{benefit.title}</h3>
              <p className="benefit-desc">{benefit.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Benefits;
