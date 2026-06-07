import { useMemo, useState } from 'react';

const audienceLabels = {
  clientes_verificados: 'Clientes verificados',
  clientes_novos: 'Clientes novos (30 dias)',
  clientes_antigos: 'Clientes antigos',
  todos_clientes: 'Todos os clientes',
  leads: 'Leads com e-mail',
  equipe: 'Equipe DRM',
};

const dateTimeBr = value => value ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Aguardando';

function AdminCommunicationCenter({ data, adminEmail, request, onRefresh }) {
  const templates = useMemo(() => data?.templates || [], [data?.templates]);
  const [templateId, setTemplateId] = useState(templates[0]?.id || '');
  const template = useMemo(() => templates.find(item => item.id === templateId) || templates[0] || {}, [templateId, templates]);
  const [form, setForm] = useState(() => ({ ...template }));
  const [testEmail, setTestEmail] = useState(adminEmail || '');
  const [status, setStatus] = useState('');
  const [sending, setSending] = useState(false);

  const selectTemplate = id => {
    setTemplateId(id);
    const selected = templates.find(item => item.id === id);
    if (selected) setForm({ ...selected });
    setStatus('');
  };

  const sendTest = async () => {
    setSending(true);
    setStatus('Enviando prévia...');
    try {
      const result = await request('/api/admin/comunicacoes/teste', {
        method: 'POST',
        body: JSON.stringify({ ...form, to: testEmail }),
      });
      setStatus(result.message);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setSending(false);
    }
  };

  const sendCampaign = async () => {
    const total = data?.audienceCounts?.[form.audience] || 0;
    if (!window.confirm(`Confirmar o envio para ${total} destinatário${total === 1 ? '' : 's'}?`)) return;
    setSending(true);
    setStatus('Realizando disparo...');
    try {
      const result = await request('/api/admin/comunicacoes/disparar', {
        method: 'POST',
        body: JSON.stringify({ ...form, templateId }),
      });
      setStatus(result.message);
      await onRefresh();
    } catch (error) {
      setStatus(error.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="admin-section communication-admin">
      <div className="section-heading">
        <div>
          <span className="section-kicker">Comunicação inteligente</span>
          <h3>Central de mensagens</h3>
          <p>Prepare, confira e envie comunicações segmentadas para clientes, interessados e equipe DRM.</p>
        </div>
        <div className="section-stats">
          <div><strong>{data?.audienceCounts?.clientes_verificados || 0}</strong><span>clientes verificados</span></div>
          <div><strong>{data?.audienceCounts?.leads || 0}</strong><span>leads com e-mail</span></div>
          <div><strong>{data?.history?.length || 0}</strong><span>disparos recentes</span></div>
        </div>
      </div>

      <div className="communication-admin-layout">
        <aside className="message-template-list">
          <strong>Mensagens prontas</strong>
          <span>Escolha um ponto de partida e personalize antes do envio.</span>
          {templates.map(item => (
            <button type="button" className={templateId === item.id ? 'active' : ''} onClick={() => selectTemplate(item.id)} key={item.id}>
              <strong>{item.title}</strong>
              <small>{audienceLabels[item.audience]}</small>
            </button>
          ))}
        </aside>

        <section className="message-editor-panel">
          <div className="message-editor-head">
            <div><span className="section-kicker">Editor e prévia</span><h3>{form.title || 'Nova comunicação'}</h3></div>
            <div className="recipient-counter"><strong>{data?.audienceCounts?.[form.audience] || 0}</strong><span>destinatários válidos</span></div>
          </div>
          <div className="message-editor-grid">
            <label>Público
              <select value={form.audience || ''} onChange={event => setForm(prev => ({ ...prev, audience: event.target.value }))}>
                {Object.entries(audienceLabels).map(([value, label]) => <option value={value} key={value}>{label} ({data?.audienceCounts?.[value] || 0})</option>)}
              </select>
            </label>
            <label>Assunto do e-mail
              <input value={form.subject || ''} onChange={event => setForm(prev => ({ ...prev, subject: event.target.value }))} />
            </label>
            <label className="span-2">Título principal
              <input value={form.heading || ''} onChange={event => setForm(prev => ({ ...prev, heading: event.target.value }))} />
            </label>
            <label className="span-2">Mensagem
              <textarea value={form.message || ''} onChange={event => setForm(prev => ({ ...prev, message: event.target.value }))} />
            </label>
            <label>Texto do botão
              <input value={form.ctaLabel || ''} onChange={event => setForm(prev => ({ ...prev, ctaLabel: event.target.value }))} />
            </label>
            <label>Destino do botão
              <input value={form.ctaUrl || ''} onChange={event => setForm(prev => ({ ...prev, ctaUrl: event.target.value }))} />
            </label>
          </div>
          <div className="email-live-preview">
            <span>Comunicação DRM Energia Solar</span>
            <h4>{form.heading}</h4>
            <p>Olá, Cliente. {form.message}</p>
            <strong>{form.ctaLabel}</strong>
          </div>
          <div className="message-send-bar">
            <input type="email" value={testEmail} onChange={event => setTestEmail(event.target.value)} placeholder="E-mail para receber a prévia" />
            <button type="button" className="btn btn-outline" disabled={sending} onClick={sendTest}>Enviar prévia</button>
            <button type="button" className="btn btn-primary" disabled={sending || !(data?.audienceCounts?.[form.audience])} onClick={sendCampaign}>Confirmar disparo</button>
          </div>
          {status && <p className="message-send-status">{status}</p>}
        </section>
      </div>

      <section className="admin-card communication-history">
        <div className="card-header-flex"><div><h3>Histórico de disparos</h3><p className="muted-text">Registro dos últimos envios feitos pelo painel.</p></div></div>
        <div className="table-container"><table className="modern-table"><thead><tr><th>Data</th><th>Assunto</th><th>Público</th><th>Resultado</th><th>Responsável</th></tr></thead>
          <tbody>{(data?.history || []).map(item => <tr key={item.id}><td>{dateTimeBr(item.sentAt || item.createdAt)}</td><td>{item.subject}</td><td>{audienceLabels[item.audience] || item.audience}</td><td><span className={`status-badge ${item.failedCount ? 'warning' : 'success'}`}>{item.sentCount} enviados · {item.failedCount} falhas</span></td><td>{item.createdByName}</td></tr>)}</tbody>
        </table></div>
      </section>
    </div>
  );
}

export default AdminCommunicationCenter;
