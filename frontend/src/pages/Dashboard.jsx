import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Dashboard.css';
import { withApiBase } from '../utils/apiBase';
import SolarJourneyScene from '../components/SolarJourneyScene';
import ClientTrackingCenter from '../components/ClientTrackingCenter';
import CompleteSystemGuide from '../components/CompleteSystemGuide';
import ClientCommunicationCenter from '../components/ClientCommunicationCenter';
import ClientFinancingSimulator from '../components/ClientFinancingSimulator';

const money = (value) => Number(value || 0).toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const dateBr = (value, options = {}) => {
  if (!value) return 'A definir';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).split('T')[0].split('-').reverse().join('/');
  return date.toLocaleDateString('pt-BR', options);
};

const dateTimeBr = (value) => {
  if (!value) return 'Aguardando agendamento';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return dateBr(value);
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

const statusClass = (status = '') => {
  const normalized = status.toLowerCase();
  if (normalized.includes('aprov') || normalized.includes('resol')) return 'success';
  if (normalized.includes('recus') || normalized.includes('cancel')) return 'danger';
  if (normalized.includes('pend') || normalized.includes('aguard')) return 'warning';
  return 'info';
};

const daysUntil = (value) => {
  if (!value) return null;
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return null;
  const days = Math.ceil((target.getTime() - Date.now()) / 86400000);
  if (days === 0) return 'Hoje';
  if (days < 0) return `${Math.abs(days)} dia${Math.abs(days) === 1 ? '' : 's'} atrás`;
  return `Faltam ${days} dia${days === 1 ? '' : 's'}`;
};

const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

function Dashboard() {
  const [portal, setPortal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedContratoId, setSelectedContratoId] = useState('');
  const [complaintForm, setComplaintForm] = useState({ assunto: '', problema: '', prioridade: 'Normal', fotos: [] });
  const [complaintStatus, setComplaintStatus] = useState('');
  const [deliveryNote, setDeliveryNote] = useState('');
  const [deliveryStatus, setDeliveryStatus] = useState('');
  const [meterNote, setMeterNote] = useState('');
  const [meterStatus, setMeterStatus] = useState('');
  const [activeView, setActiveView] = useState('project');
  const [lastSync, setLastSync] = useState(new Date());
  const navigate = useNavigate();

  const user = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null');
    } catch {
      return null;
    }
  }, []);

  const request = useCallback(async (path, options = {}) => {
    const token = localStorage.getItem('token');
    const response = await fetch(withApiBase(path), {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('role');
        navigate('/portal-cliente');
      }
      if (data?.requiresEmailVerification) navigate('/verificar-email');
      throw new Error(data?.message || 'Não foi possível carregar agora.');
    }
    return data;
  }, [navigate]);

  const loadPortal = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await request('/api/cliente/portal');
      setPortal(data);
      setLastSync(new Date());
      setSelectedContratoId(prev => prev || String(data.contratos?.[0]?.id || ''));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    const timer = window.setTimeout(loadPortal, 0);
    return () => window.clearTimeout(timer);
  }, [loadPortal]);

  useEffect(() => {
    const interval = window.setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const data = await request('/api/cliente/portal');
        setPortal(data);
        setLastSync(new Date());
      } catch {
        // Keep the current portal visible if a background refresh fails.
      }
    }, 60000);
    return () => window.clearInterval(interval);
  }, [request]);

  const handleLogout = () => {
    localStorage.removeItem('role');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/portal-cliente');
  };

  const selectedContrato = useMemo(() => {
    const contratos = portal?.contratos || [];
    return contratos.find(item => String(item.id) === String(selectedContratoId)) || contratos[0] || null;
  }, [portal, selectedContratoId]);

  const selectedProjeto = useMemo(() => {
    if (!selectedContrato) return portal?.projetos?.[0] || null;
    return (portal?.projetos || []).find(item => Number(item.contratoId) === Number(selectedContrato.id)) || null;
  }, [portal, selectedContrato]);

  const selectedComplaints = useMemo(() => (
    (portal?.ordensServico || []).filter(item => !selectedContrato || Number(item.contratoId) === Number(selectedContrato.id))
  ), [portal, selectedContrato]);

  const currentManual = selectedContrato?.dados?.manual || {};
  const currentEquipamento = selectedContrato?.equipamentoDados || {};
  const financingText = currentManual.formaPagamento || selectedContrato?.dados?.financeiro?.forma_pagamento || 'Condição financeira ainda não registrada no portal.';
  const signedAt = selectedContrato?.dataAnalise || selectedContrato?.dataCriacao;
  const contractualDeadline = currentManual.prazoExecucao || currentEquipamento.prazoExecucao || 40;
  const progressSteps = [
    { key: 'contrato', label: 'Contrato DRM', done: selectedContrato?.status === 'Aprovado', detail: selectedContrato?.status === 'Aprovado' ? `Aprovado em ${dateBr(signedAt)}` : selectedContrato?.status || 'Pendente' },
    { key: 'equipamento', label: 'Entrega do equipamento', done: Boolean(selectedProjeto?.equipamentoEntregueAt), detail: selectedProjeto?.equipamentoEntregueAt ? dateBr(selectedProjeto.equipamentoEntregueAt) : dateBr(selectedProjeto?.prazoPrevisto) },
    { key: 'instalacao', label: 'Instalação', done: selectedProjeto?.checklist?.instalacao, detail: dateTimeBr(selectedProjeto?.instalacaoAgendada) },
    { key: 'equatorial', label: 'Troca do medidor / ligação Equatorial', done: Boolean(selectedProjeto?.medidorTrocadoAt || selectedProjeto?.checklist?.medidorTrocado || selectedProjeto?.checklist?.sistemaLigado), detail: selectedProjeto?.medidorTrocadoAt ? dateBr(selectedProjeto.medidorTrocadoAt) : dateBr(selectedProjeto?.previsaoLigacao) },
  ];

  const handleFiles = async (event) => {
    const files = Array.from(event.target.files || []).slice(0, 6);
    const fotos = await Promise.all(files.map(async (file) => ({
      name: file.name,
      dataUrl: await readFileAsDataUrl(file),
    })));
    setComplaintForm(prev => ({ ...prev, fotos: [...prev.fotos, ...fotos].slice(0, 6) }));
    event.target.value = '';
  };

  const submitComplaint = async (event) => {
    event.preventDefault();
    setComplaintStatus('Enviando reclamação...');
    try {
      await request('/api/cliente/reclamacoes', {
        method: 'POST',
        body: JSON.stringify({
          contratoId: selectedContrato?.id,
          assunto: complaintForm.assunto || 'Solicitação pelo portal',
          problema: complaintForm.problema,
          prioridade: complaintForm.prioridade,
          fotos: complaintForm.fotos,
        }),
      });
      setComplaintForm({ assunto: '', problema: '', prioridade: 'Normal', fotos: [] });
      setComplaintStatus('Reclamação aberta. A equipe DRM recebeu sua solicitação.');
      await loadPortal();
    } catch (err) {
      setComplaintStatus(err.message);
    }
  };

  const confirmDelivery = async () => {
    if (!selectedProjeto && !selectedContrato) return;
    setDeliveryStatus('Registrando confirmação...');
    try {
      await request('/api/cliente/equipamento-entregue', {
        method: 'POST',
        body: JSON.stringify({
          projetoId: selectedProjeto?.id,
          contratoId: selectedContrato?.id,
          observacoes: deliveryNote,
        }),
      });
      setDeliveryNote('');
      setDeliveryStatus('Entrega confirmada. Obrigado por avisar a DRM.');
      await loadPortal();
    } catch (err) {
      setDeliveryStatus(err.message);
    }
  };

  const downloadContract = (contract = selectedContrato) => {
    if (!contract?.id) return;
    const token = localStorage.getItem('token');
    window.location.href = withApiBase(`/api/cliente/contratos/${contract.id}/download?token=${encodeURIComponent(token || '')}`);
  };

  const markNotificationsRead = async () => {
    await request('/api/cliente/notificacoes/lidas', { method: 'PUT' });
    setPortal(prev => ({ ...prev, notifications: (prev?.notifications || []).map(item => ({ ...item, readAt: item.readAt || new Date().toISOString() })) }));
  };

  const sendMessage = async (payload) => {
    await request('/api/cliente/mensagens', {
      method: 'POST',
      body: JSON.stringify({ ...payload, contratoId: selectedContrato?.id }),
    });
    await loadPortal();
  };

  const sendFeedback = async (payload) => {
    await request('/api/cliente/avaliacao', {
      method: 'POST',
      body: JSON.stringify({ ...payload, contratoId: selectedContrato?.id }),
    });
    await loadPortal();
  };

  const sendReferral = async (payload) => {
    await request('/api/cliente/indicacoes', { method: 'POST', body: JSON.stringify(payload) });
    await loadPortal();
  };

  const confirmMeterChange = async () => {
    if (!selectedProjeto && !selectedContrato) return;
    setMeterStatus('Registrando confirmação...');
    try {
      await request('/api/cliente/medidor-trocado', {
        method: 'POST',
        body: JSON.stringify({
          projetoId: selectedProjeto?.id,
          contratoId: selectedContrato?.id,
          observacoes: meterNote,
        }),
      });
      setMeterNote('');
      setMeterStatus('Troca do medidor confirmada. A equipe DRM foi avisada.');
      await loadPortal();
    } catch (err) {
      setMeterStatus(err.message);
    }
  };

  if (loading) {
    return <div className="client-portal-loading">Carregando seu portal DRM...</div>;
  }

  return (
    <div className="client-portal">
      <header className="portal-topbar">
        <Link to="/" className="portal-logo-link">
          <img src="/assets/logo.png" alt="DRM Energia Solar" />
        </Link>
        <div className="portal-user-box">
          <div>
            <span>Portal do cliente</span>
            <strong>{portal?.cliente?.nome || user?.nome || 'Cliente DRM'}</strong>
          </div>
          <button type="button" onClick={handleLogout}>Sair</button>
        </div>
      </header>

      <main className="portal-main">
        {error ? (
          <section className="portal-empty-panel">
            <h1>Não conseguimos carregar seu portal</h1>
            <p>{error}</p>
            <button type="button" onClick={loadPortal}>Tentar novamente</button>
          </section>
        ) : (
          <>
            <section className="portal-hero">
              <div>
                <span className="portal-kicker">DRM Energia Solar</span>
                <h1>Seu projeto solar, acompanhado do contrato à ligação.</h1>
                <p>Acompanhe prazos, instalação, financiamento, documentos e atendimento em um só lugar.</p>
              </div>
              <div className="portal-hero-card">
                <span>Status atual</span>
                <strong>{selectedProjeto?.etapa || selectedContrato?.status || 'Aguardando contrato'}</strong>
                <p>Contrato #{selectedContrato?.id || '--'} • {money(selectedContrato?.valorProjeto)}</p>
              </div>
            </section>

            <nav className="portal-view-tabs" aria-label="Áreas do portal">
              <button type="button" className={activeView === 'project' ? 'active' : ''} onClick={() => setActiveView('project')}>
                Meu projeto
              </button>
              <button type="button" className={activeView === 'tracking' ? 'active' : ''} onClick={() => setActiveView('tracking')}>
                Acompanhamento
              </button>
              <button type="button" className={activeView === 'education' ? 'active' : ''} onClick={() => setActiveView('education')}>
                Guia completo
              </button>
              <button type="button" className={activeView === 'communication' ? 'active' : ''} onClick={() => setActiveView('communication')}>
                Central DRM {(portal?.notifications || []).some(item => !item.readAt) ? '•' : ''}
              </button>
            </nav>

            {activeView === 'project' ? (
              <>
            {portal?.contratos?.length > 1 && (
              <section className="portal-contract-switcher">
                {portal.contratos.map(contrato => (
                  <button
                    type="button"
                    key={contrato.id}
                    className={String(selectedContrato?.id) === String(contrato.id) ? 'active' : ''}
                    onClick={() => setSelectedContratoId(String(contrato.id))}
                  >
                    Contrato #{contrato.id}
                    <span>{money(contrato.valorProjeto)}</span>
                  </button>
                ))}
              </section>
            )}

            <SolarJourneyScene
              delivered={Boolean(selectedProjeto?.equipamentoEntregueAt)}
              installationDone={Boolean(selectedProjeto?.checklist?.instalacao)}
              connected={Boolean(selectedProjeto?.medidorTrocadoAt || selectedProjeto?.checklist?.sistemaLigado)}
              startDate={selectedProjeto?.dataInicio || selectedContrato?.dataCriacao}
              deadline={selectedProjeto?.prazoPrevisto}
              destination={selectedProjeto?.clienteCidade || selectedContrato?.clienteCidade || 'Cidade de destino'}
            />

            <section className="portal-grid">
              <div className="portal-card contract-card">
                <div className="portal-card-head">
                  <div>
                    <span>Contrato DRM</span>
                    <h2>Contrato e financiamento</h2>
                  </div>
                  <span className={`portal-badge ${statusClass(selectedContrato?.status)}`}>{selectedContrato?.status || 'Sem contrato'}</span>
                </div>
                <div className="contract-metrics">
                  <div><span>Valor</span><strong>{money(selectedContrato?.valorProjeto)}</strong></div>
                  <div><span>Sistema</span><strong>{currentManual.potenciaKwp || selectedContrato?.dados?.dimensionamento?.potencia_real_instalada_kwp || '--'} kWp</strong></div>
                  <div><span>Geração</span><strong>{currentManual.geracaoKwh || selectedContrato?.dados?.dimensionamento?.geracao_estimada_kwh || '--'} kWh/mês</strong></div>
                </div>
                <div className="portal-detail-list">
                  <div><span>Contrato assinado / aprovado em</span><strong>{dateBr(signedAt)}</strong></div>
                  <div><span>Prazo contratual</span><strong>Até {contractualDeadline} dias úteis após assinatura e condições iniciais</strong></div>
                  <div><span>Placas</span><strong>{currentManual.painel || currentEquipamento.placaModelo || 'A definir'}</strong></div>
                  <div><span>Inversor</span><strong>{currentManual.inversor || currentEquipamento.inversorModelo || 'A definir'}</strong></div>
                  <div><span>Financiamento / pagamento</span><strong>{financingText}</strong></div>
                </div>
                {selectedContrato?.status === 'Aprovado' && (
                  <button type="button" className="contract-download-button" onClick={downloadContract}>Baixar contrato em PDF</button>
                )}
              </div>

              <div className="portal-card">
                <div className="portal-card-head">
                  <div>
                    <span>Agenda</span>
                    <h2>Prazos importantes</h2>
                  </div>
                </div>
                <div className="deadline-list">
                  <div><span>Assinatura / aprovação</span><strong>{dateBr(signedAt)}</strong><small>Marco inicial do contrato</small></div>
                  <div><span>Entrega do equipamento</span><strong>{selectedProjeto?.equipamentoEntregueAt ? `Entregue em ${dateBr(selectedProjeto.equipamentoEntregueAt)}` : dateBr(selectedProjeto?.prazoPrevisto)}</strong><small>{selectedProjeto?.equipamentoEntregueAt ? 'Entrega confirmada' : daysUntil(selectedProjeto?.prazoPrevisto) || 'Aguardando previsão'}</small></div>
                  <div><span>Instalação</span><strong>{dateTimeBr(selectedProjeto?.instalacaoAgendada)}</strong><small>{daysUntil(selectedProjeto?.instalacaoAgendada) || 'Aguardando agendamento'}</small></div>
                  <div><span>Troca do medidor / ligação Equatorial</span><strong>{selectedProjeto?.medidorTrocadoAt ? `Confirmada em ${dateBr(selectedProjeto.medidorTrocadoAt)}` : dateBr(selectedProjeto?.previsaoLigacao)}</strong><small>{selectedProjeto?.medidorTrocadoAt ? 'Etapa confirmada' : daysUntil(selectedProjeto?.previsaoLigacao) || 'Aguardando previsão'}</small></div>
                </div>
              </div>
            </section>

            <section className="portal-card timeline-card">
              <div className="portal-card-head">
                <div>
                  <span>Andamento</span>
                  <h2>Linha do tempo do projeto</h2>
                </div>
              </div>
              <div className="portal-timeline">
                {progressSteps.map(step => (
                  <div className={`timeline-step ${step.done ? 'done' : ''}`} key={step.key}>
                    <span className="timeline-dot"></span>
                    <div>
                      <strong>{step.label}</strong>
                      <p>{step.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <ClientFinancingSimulator systemValue={selectedContrato?.valorProjeto || currentManual.valorSistema || 0} />

            <section className="portal-grid lower">
              <div className="portal-card delivery-card">
                <div className="portal-card-head">
                  <div>
                    <span>Confirmação</span>
                    <h2>Equipamento entregue?</h2>
                  </div>
                  {selectedProjeto?.equipamentoEntregueAt && <span className="portal-badge success">Confirmado</span>}
                </div>
                <p>Avise a equipe DRM quando o kit solar chegar na sua casa para acelerarmos os próximos passos.</p>
                <textarea
                  value={deliveryNote}
                  onChange={(event) => setDeliveryNote(event.target.value)}
                  placeholder="Observação opcional. Ex: chegou completo, deixei na garagem..."
                />
                <button type="button" onClick={confirmDelivery} disabled={Boolean(selectedProjeto?.equipamentoEntregueAt)}>
                  {selectedProjeto?.equipamentoEntregueAt ? 'Entrega já confirmada' : 'Confirmar entrega'}
                </button>
                {deliveryStatus && <small>{deliveryStatus}</small>}
              </div>

              <div className="portal-card delivery-card meter-card">
                <div className="portal-card-head">
                  <div>
                    <span>Equatorial</span>
                    <h2>Medidor foi trocado?</h2>
                  </div>
                  {selectedProjeto?.medidorTrocadoAt && <span className="portal-badge success">Confirmado</span>}
                </div>
                <p>Confirme quando a Equatorial realizar a troca do medidor para avisar a DRM e concluir esta etapa.</p>
                <textarea
                  value={meterNote}
                  onChange={(event) => setMeterNote(event.target.value)}
                  placeholder="Observação opcional. Ex: medidor trocado hoje pela manhã..."
                />
                <button type="button" onClick={confirmMeterChange} disabled={Boolean(selectedProjeto?.medidorTrocadoAt)}>
                  {selectedProjeto?.medidorTrocadoAt ? 'Troca já confirmada' : 'Confirmar troca do medidor'}
                </button>
                {meterStatus && <small>{meterStatus}</small>}
              </div>

              <form className="portal-card complaint-card" onSubmit={submitComplaint}>
                <div className="portal-card-head">
                  <div>
                    <span>Atendimento</span>
                    <h2>Fazer reclamação</h2>
                  </div>
                </div>
                <input
                  value={complaintForm.assunto}
                  onChange={(event) => setComplaintForm(prev => ({ ...prev, assunto: event.target.value }))}
                  placeholder="Assunto. Ex: atraso, dúvida, material, instalação"
                />
                <select value={complaintForm.prioridade} onChange={(event) => setComplaintForm(prev => ({ ...prev, prioridade: event.target.value }))}>
                  <option>Normal</option>
                  <option>Alta</option>
                  <option>Urgente</option>
                </select>
                <textarea
                  value={complaintForm.problema}
                  onChange={(event) => setComplaintForm(prev => ({ ...prev, problema: event.target.value }))}
                  placeholder="Conte o que aconteceu com o máximo de detalhes."
                  required
                />
                <label className="photo-drop">
                  <span className="photo-drop-icon" aria-hidden="true">+</span>
                  <span><strong>Adicionar fotos à reclamação</strong><small>Envie até 6 imagens para ajudar a equipe a entender melhor.</small></span>
                  <input type="file" accept="image/*" multiple onChange={handleFiles} />
                </label>
                {complaintForm.fotos.length > 0 && (
                  <div className="complaint-preview-grid">
                    {complaintForm.fotos.map((foto, index) => <img key={`${foto.name}-${index}`} src={foto.dataUrl} alt={foto.name || `Foto ${index + 1}`} />)}
                  </div>
                )}
                <button type="submit">Abrir reclamação</button>
                {complaintStatus && <small>{complaintStatus}</small>}
              </form>
            </section>

            <section className="portal-card complaints-history">
              <div className="portal-card-head">
                <div>
                  <span>Histórico</span>
                  <h2>Suas solicitações</h2>
                </div>
              </div>
              {selectedComplaints.length > 0 ? selectedComplaints.map(os => (
                <article className="complaint-row" key={os.id}>
                  <div>
                    <strong>O.S #{os.id} • {os.observacoes || os.categoria}</strong>
                    <p>{os.problema}</p>
                    <span>{dateTimeBr(os.dataAbertura)} • {os.fotos?.length || 0} foto{(os.fotos?.length || 0) === 1 ? '' : 's'}</span>
                  </div>
                  <span className={`portal-badge ${statusClass(os.status)}`}>{os.status}</span>
                </article>
              )) : (
                <div className="portal-no-complaints">Nenhuma reclamação aberta para este contrato.</div>
              )}
            </section>
              </>
            ) : activeView === 'tracking' ? (
              <ClientTrackingCenter
                contrato={selectedContrato}
                projeto={selectedProjeto}
                progressSteps={progressSteps}
                complaints={selectedComplaints}
                onDownloadContract={downloadContract}
                lastSync={lastSync}
              />
            ) : activeView === 'education' ? (
              <CompleteSystemGuide
                monthlyGeneration={currentManual.geracaoKwh || selectedContrato?.dados?.dimensionamento?.geracao_estimada_kwh}
                power={currentManual.potenciaKwp || selectedContrato?.dados?.dimensionamento?.potencia_real_instalada_kwp}
              />
            ) : (
              <ClientCommunicationCenter
                notifications={portal?.notifications || []}
                contracts={portal?.contratos || []}
                project={selectedProjeto}
                requests={selectedComplaints}
                feedback={portal?.feedback}
                referrals={portal?.referrals || []}
                onReadNotifications={markNotificationsRead}
                onDownloadContract={downloadContract}
                onSendMessage={sendMessage}
                onSendFeedback={sendFeedback}
                onSendReferral={sendReferral}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default Dashboard;
