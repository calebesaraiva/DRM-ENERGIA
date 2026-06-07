const guideCards = [
  {
    kicker: 'Como funciona',
    title: 'Da luz do sol até a sua tomada',
    text: 'Os módulos produzem corrente contínua, o inversor converte essa energia para uso no imóvel e o medidor registra consumo e créditos.',
    items: ['Placas captam a luz', 'Inversor converte a energia', 'Casa consome primeiro', 'Excedente vira crédito'],
  },
  {
    kicker: 'Cuidados',
    title: 'Pequenos cuidados, alta performance',
    text: 'O sistema trabalha sozinho. Inspeções simples preservam a geração esperada e a vida útil dos equipamentos.',
    items: ['Evite novas sombras', 'Não use produtos químicos', 'Mantenha o inversor ventilado', 'Solicite limpeza técnica'],
  },
  {
    kicker: 'Fique de olho',
    title: 'Sinais que merecem atenção',
    text: 'Variações diárias são normais. A DRM deve ser acionada quando uma condição diferente permanece por vários dias.',
    items: ['Alerta vermelho no inversor', 'Queda prolongada de geração', 'Cabos soltos ou danificados', 'Conta sem créditos após ligação'],
  },
];

const faqs = [
  ['O sistema gera energia à noite?', 'Não. À noite, o imóvel usa créditos acumulados ou energia da rede da distribuidora.'],
  ['Dias nublados param a geração?', 'Não. A geração diminui, mas os módulos continuam produzindo com a luminosidade disponível.'],
  ['Posso lavar as placas?', 'A limpeza deve ser feita com segurança e sem produtos abrasivos. Dê preferência à avaliação técnica.'],
  ['O que muda na conta de energia?', 'Após a ligação, a conta passa a demonstrar energia injetada, consumida e saldo de créditos.'],
  ['Quanto tempo duram os equipamentos?', 'Módulos têm longa vida útil e o inversor exige ventilação e acompanhamento de alertas.'],
];

function CompleteSystemGuide({ monthlyGeneration = 0, power = '--' }) {
  const annual = Math.round(Number(monthlyGeneration || 0) * 12);
  const estimatedCo2 = Math.round(annual * 0.075);

  return (
    <section className="education-view complete-guide">
      <div className="education-intro">
        <div>
          <span>Academia solar DRM</span>
          <h2>Conheça cada detalhe da energia que agora trabalha por você.</h2>
          <p>Um guia completo para acompanhar, cuidar e entender seu sistema sem linguagem complicada.</p>
        </div>
        <div className="solar-system-orbit" aria-hidden="true">
          <b></b><i></i><i></i><i></i><span></span>
        </div>
      </div>

      <div className="energy-flow" aria-label="Fluxo de funcionamento do sistema solar">
        <div><strong>1</strong><span>Sol</span><p>Luz chega aos módulos.</p></div><i></i>
        <div><strong>2</strong><span>Placas</span><p>Energia é produzida.</p></div><i></i>
        <div><strong>3</strong><span>Inversor</span><p>Corrente é convertida.</p></div><i></i>
        <div><strong>4</strong><span>Sua casa</span><p>Consumo e créditos.</p></div>
      </div>

      <div className="education-grid">
        {guideCards.map(section => (
          <article className="education-card" key={section.title}>
            <span>{section.kicker}</span><h3>{section.title}</h3><p>{section.text}</p>
            <ul>{section.items.map(item => <li key={item}>{item}</li>)}</ul>
          </article>
        ))}
      </div>

      <section className="system-pulse">
        <div className="pulse-copy">
          <span>Potencial do seu sistema</span>
          <h3>{power} kWp transformando luz em economia.</h3>
          <p>Com geração estimada de {monthlyGeneration || '--'} kWh por mês, seu sistema pode produzir cerca de {annual || '--'} kWh ao ano.</p>
          <div className="impact-metrics">
            <div><strong>{annual || '--'}</strong><span>kWh estimados / ano</span></div>
            <div><strong>{estimatedCo2 || '--'}</strong><span>kg de CO₂ evitados / ano*</span></div>
          </div>
          <small>*Estimativa educativa baseada na geração projetada. O resultado real varia conforme clima, consumo e condições do sistema.</small>
        </div>
        <div className="generation-visual" aria-hidden="true">
          <div className="generation-sun"></div>
          <div className="generation-wave"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
          <div className="generation-panel"><b></b><b></b><b></b><b></b><b></b><b></b></div>
        </div>
      </section>

      <section className="care-calendar">
        <div className="tracking-panel-head"><span>Rotina recomendada</span><h3>Calendário de cuidado</h3></div>
        <div>
          <article><strong>Toda semana</strong><p>Observe no aplicativo se a geração está ocorrendo e se não há alertas.</p><span>Monitorar</span></article>
          <article><strong>Todo mês</strong><p>Compare a produção com meses semelhantes e confira os créditos na conta.</p><span>Comparar</span></article>
          <article><strong>A cada 6 meses</strong><p>Observe sombras, sujeira excessiva, vegetação e condições visuais dos módulos.</p><span>Inspecionar</span></article>
          <article><strong>Quando necessário</strong><p>Acione a DRM para avaliação, limpeza técnica ou alerta persistente.</p><span>Solicitar suporte</span></article>
        </div>
      </section>

      <section className="bill-guide">
        <div>
          <span>Entenda sua conta</span>
          <h3>Depois da ligação, três números contam a história.</h3>
          <p>A nomenclatura pode variar, mas a lógica é simples: veja quanto consumiu, quanto enviou à rede e quantos créditos possui.</p>
        </div>
        <div className="bill-lines">
          <article><i></i><strong>Energia consumida</strong><p>O total usado pelo imóvel.</p></article>
          <article><i></i><strong>Energia injetada</strong><p>O excedente enviado à rede.</p></article>
          <article><i></i><strong>Saldo de créditos</strong><p>Energia disponível para compensação.</p></article>
        </div>
      </section>

      <section className="solar-faq">
        <div className="tracking-panel-head"><span>Dúvidas frequentes</span><h3>Respostas rápidas</h3></div>
        <div>{faqs.map(([question, answer]) => <details key={question}><summary>{question}<span>+</span></summary><p>{answer}</p></details>)}</div>
      </section>

      <section className="solar-glossary">
        <div className="tracking-panel-head"><span>Glossário</span><h3>Solar sem complicação</h3></div>
        <div>
          <article><strong>kWp</strong><p>Potência máxima instalada dos módulos.</p></article>
          <article><strong>kWh</strong><p>Quantidade de energia gerada ou consumida.</p></article>
          <article><strong>Inversor</strong><p>Equipamento que torna a energia utilizável.</p></article>
          <article><strong>Homologação</strong><p>Aprovação do sistema pela distribuidora.</p></article>
        </div>
      </section>
    </section>
  );
}

export default CompleteSystemGuide;
