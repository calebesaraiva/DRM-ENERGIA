import { useState } from 'react';
import './HowItWorks.css';
import { makeWhatsAppLink } from '../utils/whatsapp';
import WhatsAppIcon from './WhatsAppIcon';

const steps = [
  { number: '01', title: 'Simulação gratuita', desc: 'Você informa seu consumo e recebe uma previsão de economia.' },
  { number: '02', title: 'Projeto personalizado', desc: 'A engenharia define o sistema ideal para seu imóvel.' },
  { number: '03', title: 'Proposta e condições', desc: 'Apresentamos o investimento, retorno e formas de pagamento.' },
  { number: '04', title: 'Instalação', desc: 'Nossa equipe instala seu sistema com segurança e qualidade.' },
  { number: '05', title: 'Homologação', desc: 'Cuidamos de toda a documentação e aprovação com a concessionária.' },
  { number: '06', title: 'Economia ativa', desc: 'Seu sistema começa a gerar energia e você economiza todos os meses.' },
];

const faqs = [
  { q: 'Quanto custa instalar energia solar?', a: 'O valor varia conforme o tamanho do sistema, que é dimensionado pelo seu consumo. Entre em contato para receber um orçamento personalizado e gratuito.' },
  { q: 'Posso financiar o sistema?', a: 'Sim! Trabalhamos com diversas linhas de financiamento. Em muitos casos, a parcela é menor que o valor da sua conta atual de energia.' },
  { q: 'Em quanto tempo começa a economizar?', a: 'Já no primeiro mês após a ativação do sistema você começa a ver a redução na sua conta de energia.' },
  { q: 'Funciona em dias nublados?', a: 'Sim. Os painéis ainda geram energia em dias nublados ou com chuva, embora com menor eficiência. O sistema é dimensionado considerando a média anual de irradiação solar da sua região.' },
  { q: 'Precisa de bateria?', a: 'Na maioria dos casos não. O sistema é conectado à rede elétrica (on-grid), que funciona como uma "bateria virtual" através dos créditos de energia.' },
  { q: 'A DRM cuida da homologação?', a: 'Sim! Cuidamos de toda a documentação junto à concessionária, sem burocracia para você.' },
  { q: 'Qual é a vida útil dos painéis?', a: 'Os painéis solares têm vida útil média de 25 a 30 anos, com garantia de desempenho do fabricante.' },
  { q: 'Como faço para receber uma simulação?', a: 'Basta clicar em qualquer botão do site ou falar com um de nossos consultores pelo WhatsApp. A simulação é gratuita!' },
];

const FaqItem = ({ q, a }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className={`faq-item ${open ? 'faq-open' : ''}`}>
      <button type="button" className="faq-question" onClick={() => setOpen((o) => !o)}>
        <span>{q}</span>
        <span className="faq-icon">{open ? '−' : '+'}</span>
      </button>
      {open && <div className="faq-answer">{a}</div>}
    </div>
  );
};

const HowItWorks = () => (
  <>
    {/* HOW IT WORKS */}
    <section className="hiw-section" id="como-funciona">
      <div className="container">
        <div className="hiw-header">
          <span className="section-label">SIMPLES E RÁPIDO</span>
          <h2 className="section-title">Como funciona?</h2>
          <p className="section-desc">Nós cuidamos de tudo, do projeto à homologação.</p>
        </div>

        <div className="hiw-steps">
          {steps.map((step, i) => (
            <div key={step.number} className="hiw-step">
              <div className="hiw-step-top">
                <div className="hiw-step-num">{step.number}</div>
                {i < steps.length - 1 && <div className="hiw-connector" />}
              </div>
              <h4 className="hiw-step-title">{step.title}</h4>
              <p className="hiw-step-desc">{step.desc}</p>
            </div>
          ))}
        </div>

        <div className="hiw-cta">
          <a
            className="btn-lp-green"
            href={makeWhatsAppLink('secao_como_funciona')}
            target="_blank"
            rel="noopener noreferrer"
          >
            <WhatsAppIcon />
            Receber estudo gratuito no WhatsApp
          </a>
        </div>
      </div>
    </section>

    {/* FAQ */}
    <section className="faq-section" id="duvidas">
      <div className="container faq-inner">
        <div className="faq-left">
          <span className="section-label">DÚVIDAS FREQUENTES</span>
          <h2 className="section-title faq-title">Perguntas mais comuns</h2>
          <p className="faq-sub">Ainda tem dúvidas?<br />Fale com um consultor no WhatsApp.</p>
          <a
            href={makeWhatsAppLink('rodape')}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-lp-green"
          >
            <WhatsAppIcon />
            Falar no WhatsApp
          </a>
        </div>

        <div className="faq-right">
          <div className="faq-cols">
            <div className="faq-col">
              {faqs.slice(0, 4).map((item) => (
                <FaqItem key={item.q} q={item.q} a={item.a} />
              ))}
            </div>
            <div className="faq-col">
              {faqs.slice(4).map((item) => (
                <FaqItem key={item.q} q={item.q} a={item.a} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>

    {/* DARK CTA */}
    <section className="dark-cta">
      <div className="container dark-cta-inner">
        <div className="dark-cta-text">
          <h2 className="dark-cta-title">
            Sua próxima conta de energia<br />
            pode ser <span className="dark-cta-accent">muito mais leve</span>
          </h2>
          <p className="dark-cta-sub">
            Fale com um consultor da DRM e receba uma simulação gratuita para seu imóvel, comércio ou fazenda.
          </p>
        </div>
        <div className="dark-cta-actions">
          <a
            href={makeWhatsAppLink('cta_fixo')}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-lp-green"
          >
            <WhatsAppIcon />
            Chamar no WhatsApp agora
          </a>
          <p className="dark-cta-note">Atendimento rápido e personalizado</p>
        </div>
      </div>
      <div className="dark-cta-bottom">
        <a
          href={makeWhatsAppLink('hero_simular')}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-lp-green dark-cta-wide"
        >
          <WhatsAppIcon />
          Simular economia no WhatsApp
        </a>
      </div>
    </section>
  </>
);

export default HowItWorks;
