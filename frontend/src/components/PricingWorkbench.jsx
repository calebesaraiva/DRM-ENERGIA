import { useMemo, useState } from 'react';

const money = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const number = value => Number(String(value || 0).replace(',', '.')) || 0;

const emptyForm = {
  nome: '', geracaoKwh: '', numeroPaineis: '', potenciaKwp: '', potenciaInversorKw: '',
  placaModelo: '', inversorModelo: '', valorKitSolar: '', custoInstalacao: '', materialCA: '',
  deslocamento: '', custoAdicional: '', margemEmpresa: '', comissaoPercentual: '', observacoes: '',
};

function PricingWorkbench({ items, request, onItemsChange }) {
  const [form, setForm] = useState(emptyForm);
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState('');
  const [view, setView] = useState('consultor');
  const [finance, setFinance] = useState({ entrada: '0', taxaMensal: '1.49', parcelas: '60' });

  const calculate = event => {
    event?.preventDefault();
    const values = Object.fromEntries(['valorKitSolar', 'custoInstalacao', 'materialCA', 'deslocamento', 'custoAdicional', 'margemEmpresa', 'comissaoPercentual'].map(key => [key, number(form[key])]));
    if (values.comissaoPercentual >= 100) return setStatus('A comissão precisa ser menor que 100%.');
    const custoBase = values.valorKitSolar + values.custoInstalacao + values.materialCA + values.deslocamento + values.custoAdicional + values.margemEmpresa;
    const precoFinal = custoBase / (1 - values.comissaoPercentual / 100);
    setResult({ ...values, custoBase, precoFinal, valorComissao: precoFinal - custoBase });
    setStatus('Preço calculado. Revise os dados técnicos e salve na tabela.');
  };

  const save = async () => {
    if (!result) return setStatus('Calcule o preço antes de salvar.');
    const created = await request('/api/admin/tabelas-precos', {
      method: 'POST',
      body: JSON.stringify({ ...form, ...result }),
    });
    onItemsChange([created, ...items]);
    setStatus('Sistema salvo na tabela de preços.');
    setForm(emptyForm);
    setResult(null);
  };

  const toggle = async item => {
    const updated = await request(`/api/admin/tabelas-precos/${item.id}`, { method: 'PUT', body: JSON.stringify({ ...item, active: !item.active }) });
    onItemsChange(items.map(current => current.id === updated.id ? updated : current));
  };

  const financing = useMemo(() => {
    const value = Math.max(0, number(result?.precoFinal || finance.valorSistema) - number(finance.entrada));
    const months = Math.max(1, Math.round(number(finance.parcelas)));
    const rate = number(finance.taxaMensal) / 100;
    const installment = rate > 0 ? value * rate * ((1 + rate) ** months) / (((1 + rate) ** months) - 1) : value / months;
    return { value, months, installment, total: installment * months, interest: installment * months - value };
  }, [finance, result]);

  const activeItems = items.filter(item => item.active);

  const copyTable = async () => {
    const text = view === 'cliente'
      ? activeItems.map(item => `${item.geracaoKwh} kWh/mês — ${money(item.precoFinal)}`).join('\n')
      : activeItems.map(item => `${item.nome} | ${item.geracaoKwh} kWh | ${item.numeroPaineis || '--'} painéis | ${item.potenciaKwp || '--'} kWp | inversor ${item.potenciaInversorKw || '--'} kW | ${money(item.precoFinal)}`).join('\n');
    await navigator.clipboard.writeText(`TABELA DRM ENERGIA SOLAR\n\n${text}`);
    setStatus(`Tabela para ${view === 'cliente' ? 'clientes' : 'consultores'} copiada e pronta para enviar.`);
  };

  return (
    <div className="pricing-workbench">
      <div className="section-heading">
        <div><span className="section-kicker">Precificação completa</span><h3>Preço dos Sistemas</h3><p>Monte sistemas, salve cálculos e gere tabelas prontas para equipe e clientes.</p></div>
        <div className="section-stats"><div><strong>{activeItems.length}</strong><span>sistemas ativos</span></div><div><strong>{money(activeItems.reduce((sum, item) => sum + Number(item.precoFinal || 0), 0))}</strong><span>valor da tabela</span></div></div>
      </div>

      <div className="pricing-builder">
        <form className="admin-card pricing-builder-form" onSubmit={calculate}>
          <div className="card-header-flex"><div><h3>Novo sistema</h3><p className="muted-text">Dados técnicos, custos e comissão.</p></div></div>
          <div className="pricing-input-grid">
            <label className="span-2">Nome do sistema<input required value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} placeholder="Ex: Sistema residencial 800 kWh" /></label>
            <label>Geração mensal (kWh)<input required type="number" value={form.geracaoKwh} onChange={e => setForm(p => ({ ...p, geracaoKwh: e.target.value }))} /></label>
            <label>Quantidade de painéis<input type="number" value={form.numeroPaineis} onChange={e => setForm(p => ({ ...p, numeroPaineis: e.target.value }))} /></label>
            <label>Potência do sistema (kWp)<input type="number" step="0.01" value={form.potenciaKwp} onChange={e => setForm(p => ({ ...p, potenciaKwp: e.target.value }))} /></label>
            <label>Potência do inversor (kW)<input type="number" step="0.01" value={form.potenciaInversorKw} onChange={e => setForm(p => ({ ...p, potenciaInversorKw: e.target.value }))} /></label>
            <label>Modelo das placas<input value={form.placaModelo} onChange={e => setForm(p => ({ ...p, placaModelo: e.target.value }))} /></label>
            <label>Modelo do inversor<input value={form.inversorModelo} onChange={e => setForm(p => ({ ...p, inversorModelo: e.target.value }))} /></label>
            {[
              ['valorKitSolar', 'Valor do kit solar'], ['custoInstalacao', 'Custo de instalação'], ['materialCA', 'Material CA'],
              ['deslocamento', 'Deslocamento'], ['custoAdicional', 'Custo adicional'], ['margemEmpresa', 'Margem da empresa'],
            ].map(([key, label]) => <label key={key}>{label}<input type="number" step="0.01" value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} /></label>)}
            <label>Comissão (%)<input type="number" min="0" max="99.99" step="0.01" value={form.comissaoPercentual} onChange={e => setForm(p => ({ ...p, comissaoPercentual: e.target.value }))} /></label>
            <label className="span-2">Observações<input value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))} /></label>
          </div>
          <div className="actions-footer"><button className="btn btn-outline" type="button" onClick={() => { setForm(emptyForm); setResult(null); }}>Limpar</button><button className="btn btn-primary" type="submit">Calcular sistema</button></div>
          {status && <p className="pricing-status">{status}</p>}
        </form>

        <aside className="admin-card pricing-result-panel">
          <span>Preço final calculado</span><strong>{money(result?.precoFinal)}</strong>
          <div><span>Custo base</span><strong>{money(result?.custoBase)}</strong></div>
          <div><span>Comissão</span><strong>{money(result?.valorComissao)}</strong></div>
          <button className="btn btn-primary" type="button" disabled={!result} onClick={save}>Salvar na tabela</button>
        </aside>
      </div>

      <section className="admin-card price-table-card">
        <div className="card-header-flex"><div><h3>Tabela de sistemas</h3><p className="muted-text">Alterne a visualização conforme o público.</p></div><div className="price-table-actions"><div className="price-view-toggle"><button className={view === 'consultor' ? 'active' : ''} onClick={() => setView('consultor')}>Consultor</button><button className={view === 'cliente' ? 'active' : ''} onClick={() => setView('cliente')}>Cliente</button></div><button type="button" className="btn btn-outline btn-sm-admin" disabled={!activeItems.length} onClick={copyTable}>Copiar tabela</button></div></div>
        <div className="table-container"><table className="modern-table"><thead><tr>{view === 'consultor' ? <><th>Sistema</th><th>Geração</th><th>Painéis</th><th>kWp</th><th>Inversor</th><th>Custo base</th><th>Preço final</th><th>Ação</th></> : <><th>Geração mensal</th><th>Valor do sistema</th></>}</tr></thead>
          <tbody>{activeItems.map(item => <tr key={item.id}>{view === 'consultor' ? <><td data-label="Sistema">{item.nome}</td><td data-label="Geração">{item.geracaoKwh} kWh</td><td data-label="Painéis">{item.numeroPaineis || '--'}</td><td data-label="Potência">{item.potenciaKwp || '--'} kWp</td><td data-label="Inversor">{item.potenciaInversorKw || '--'} kW</td><td data-label="Custo base">{money(item.custoBase)}</td><td data-label="Preço final">{money(item.precoFinal)}</td><td data-label="Ação"><button className="btn btn-outline btn-sm-admin" onClick={() => toggle(item)}>Desativar</button></td></> : <><td data-label="Geração mensal"><strong>{item.geracaoKwh} kWh/mês</strong></td><td data-label="Valor do sistema"><strong>{money(item.precoFinal)}</strong></td></>}</tr>)}</tbody>
        </table>{!activeItems.length && <div className="pricing-empty">Calcule e salve o primeiro sistema para gerar as tabelas.</div>}</div>
      </section>

      <section className="admin-card financing-simulator">
        <div className="card-header-flex"><div><span className="section-kicker">Simulação ao cliente</span><h3>Parcelas do financiamento</h3><p className="muted-text">Estimativa pela Tabela Price. A condição final depende da instituição financeira.</p></div></div>
        <div className="financing-grid">
          <label>Valor do sistema<input type="number" step="0.01" value={finance.valorSistema || (result ? result.precoFinal.toFixed(2) : '')} onChange={e => setFinance(p => ({ ...p, valorSistema: e.target.value }))} /></label>
          <label>Entrada<input type="number" value={finance.entrada} onChange={e => setFinance(p => ({ ...p, entrada: e.target.value }))} /></label>
          <label>Taxa mensal (%)<input type="number" step="0.01" value={finance.taxaMensal} onChange={e => setFinance(p => ({ ...p, taxaMensal: e.target.value }))} /></label>
          <label>Quantidade de parcelas<input type="number" min="1" value={finance.parcelas} onChange={e => setFinance(p => ({ ...p, parcelas: e.target.value }))} /></label>
        </div>
        <div className="financing-results"><article><span>Valor financiado</span><strong>{money(financing.value)}</strong></article><article className="primary"><span>{financing.months} parcelas estimadas</span><strong>{money(financing.installment)}</strong></article><article><span>Total estimado</span><strong>{money(financing.total)}</strong></article><article><span>Juros estimados</span><strong>{money(financing.interest)}</strong></article></div>
      </section>
    </div>
  );
}

export default PricingWorkbench;
