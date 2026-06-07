import { useMemo, useState } from 'react';

const money = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function ClientFinancingSimulator({ systemValue = 0 }) {
  const [entry, setEntry] = useState('0');
  const [rate, setRate] = useState('1.49');
  const [months, setMonths] = useState('60');
  const result = useMemo(() => {
    const financed = Math.max(0, Number(systemValue || 0) - Number(entry || 0));
    const count = Math.max(1, Math.round(Number(months || 1)));
    const monthlyRate = Number(String(rate || 0).replace(',', '.')) / 100;
    const installment = monthlyRate > 0 ? financed * monthlyRate * ((1 + monthlyRate) ** count) / (((1 + monthlyRate) ** count) - 1) : financed / count;
    return { financed, count, installment, total: installment * count };
  }, [entry, months, rate, systemValue]);

  return (
    <section className="portal-card client-financing">
      <div className="portal-card-head"><div><span>Planejamento</span><h2>Simule seu financiamento</h2></div></div>
      <p>Faça uma estimativa de parcelas para planejar seu investimento. As condições oficiais dependem da análise da instituição financeira.</p>
      <div className="client-financing-inputs">
        <label>Entrada<input type="number" step="0.01" value={entry} onChange={event => setEntry(event.target.value)} /></label>
        <label>Taxa mensal estimada (%)<input type="number" step="0.01" value={rate} onChange={event => setRate(event.target.value)} /></label>
        <label>Quantidade de parcelas<input type="number" min="1" value={months} onChange={event => setMonths(event.target.value)} /></label>
      </div>
      <div className="client-financing-results">
        <article><span>Valor financiado</span><strong>{money(result.financed)}</strong></article>
        <article className="primary"><span>{result.count} parcelas estimadas</span><strong>{money(result.installment)}</strong></article>
        <article><span>Total estimado</span><strong>{money(result.total)}</strong></article>
      </div>
    </section>
  );
}

export default ClientFinancingSimulator;
