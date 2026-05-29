import { useState } from 'react';
import { createPortal } from 'react-dom';
import './LeadSimulationModal.css';
import { makeWhatsAppLink } from '../utils/whatsapp';

const initialLead = { nome: '', telefone: '', email: '', cidade: '' };
const initialSimulation = { contaEnergia: '' };

function LeadSimulationModal({ isOpen, onClose }) {
  const [step, setStep] = useState(1);
  const [lead, setLead] = useState(initialLead);
  const [simulation, setSimulation] = useState(initialSimulation);
  const [result, setResult] = useState(null);
  const [preview, setPreview] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const formatMoney = (value) => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const handleLeadChange = (event) => {
    const { name, value } = event.target;
    setLead((prev) => ({ ...prev, [name]: value }));
  };

  const handleSimulationChange = (event) => {
    const { name, value } = event.target;
    setSimulation((prev) => ({ ...prev, [name]: value }));
  };

  const handlePreviewSubmit = (event) => {
    event.preventDefault();
    const conta = Number(simulation.contaEnergia || 0);
    const economia = conta * 0.82;
    const novaConta = conta - economia;
    const projeto = conta * 32;

    if (!conta || conta < 1) {
      setError('Informe um valor válido para a conta de energia.');
      return;
    }

    setError('');
    setPreview({ economia, novaConta, projeto });
    setStep(2);
  };

  const handleFinalSubmit = async (event) => {
    event.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/simulacao-publica`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead, simulacao: simulation }),
      });

      const contentType = response.headers.get('content-type') || '';
      const data = contentType.includes('application/json') ? await response.json() : null;

      if (!response.ok) {
        throw new Error(data?.message || 'Não foi possível gerar sua simulação agora.');
      }

      setResult(data?.resultado || null);
      setStep(3);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setStep(1);
    setLead(initialLead);
    setSimulation(initialSimulation);
    setPreview(null);
    setResult(null);
    setError('');
    onClose();
  };

  return createPortal(
    <div className="lead-modal-backdrop" role="presentation" onMouseDown={handleClose}>
      <div className="lead-modal" role="dialog" aria-modal="true" aria-labelledby="lead-modal-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="lead-modal-close" type="button" onClick={handleClose} aria-label="Fechar">x</button>

        <div className="lead-modal-header">
          <span className="lead-modal-step">Etapa {step} de 3</span>
          <h2 id="lead-modal-title">
            {step === 1 && 'Descubra sua economia em 30 segundos'}
            {step === 2 && 'Agora libere seu estudo completo'}
            {step === 3 && 'Estimativa pronta'}
          </h2>
          <p>
            {step === 1 && 'Informe sua conta média e cidade para ver a previsão inicial.'}
            {step === 2 && 'Preencha seus dados para receber proposta personalizada.'}
            {step === 3 && 'Sua simulação foi registrada. Vamos te atender com prioridade.'}
          </p>
        </div>

        {step === 1 && (
          <form className="lead-modal-form" onSubmit={handlePreviewSubmit}>
            <label>
              Valor médio da conta de energia (R$)
              <input type="number" name="contaEnergia" value={simulation.contaEnergia} onChange={handleSimulationChange} required min="1" placeholder="Ex: 450" />
            </label>
            <label>
              Cidade
              <input name="cidade" value={lead.cidade} onChange={handleLeadChange} required placeholder="Sua cidade" />
            </label>
            {error && <p className="lead-modal-error">{error}</p>}
            <button className="btn btn-primary w-full btn-simular" type="submit">Ver minha pré-economia</button>
          </form>
        )}

        {step === 2 && preview && (
          <form className="lead-modal-form" onSubmit={handleFinalSubmit}>
            <div className="lead-result-price">
              <span>Economia estimada mensal</span>
              <strong>{formatMoney(preview.economia)}</strong>
              <small>Nova conta aproximada: {formatMoney(preview.novaConta)}</small>
            </div>

            <label>
              Nome completo
              <input name="nome" value={lead.nome} onChange={handleLeadChange} required placeholder="Digite seu nome" />
            </label>
            <label>
              Telefone
              <input name="telefone" value={lead.telefone} onChange={handleLeadChange} required placeholder="(00) 90000-0000" />
            </label>
            <label>
              E-mail
              <input type="email" name="email" value={lead.email} onChange={handleLeadChange} required placeholder="seuemail@exemplo.com" />
            </label>

            {error && <p className="lead-modal-error">{error}</p>}

            <div className="lead-modal-actions">
              <button className="btn btn-outline" type="button" onClick={() => setStep(1)}>Voltar</button>
              <button className="btn btn-primary btn-simular" type="submit" disabled={isLoading}>{isLoading ? 'Gerando...' : 'Receber estudo completo'}</button>
            </div>
          </form>
        )}

        {step === 3 && (
          <div className="lead-result">
            <div className="lead-success-pill">
              <span>ETAPA 3 DE 3</span>
              <strong>Concluída</strong>
            </div>
            <div className="lead-result-price">
              <div>
                <span>Valor aproximado do projeto</span>
                <strong>{formatMoney(result?.financeiro?.preco_final_cliente_rs || preview?.projeto || 0)}</strong>
              </div>
              <div className="lead-result-price-icon" aria-hidden="true">☀</div>
            </div>

            <div className="lead-result-grid">
              <div className="lead-metric-card">
                <div className="lead-metric-icon">⚡</div>
                <span>Potência instalada</span>
                <strong>{result?.dimensionamento?.potencia_real_instalada_kwp || '-'} kWp</strong>
              </div>
              <div className="lead-metric-card">
                <div className="lead-metric-icon">▦</div>
                <span>Quantidade de painéis</span>
                <strong>{result?.dimensionamento?.numero_paineis_necessarios || '-'}</strong>
              </div>
              <div className="lead-metric-card">
                <div className="lead-metric-icon">↗</div>
                <span>Geração estimada</span>
                <strong>{result?.dimensionamento?.geracao_estimada_kwh || '-'} kWh</strong>
              </div>
            </div>

            <div className="lead-result-actions">
              <a
                className="lead-whatsapp-cta"
                href={makeWhatsAppLink('resultado_modal', 'Olá, acabei de fazer a simulação e quero fechar meu projeto solar.')}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="lead-whatsapp-icon">◉</span>
                <span className="lead-whatsapp-copy">
                  <strong>Falar com um especialista</strong>
                  <small>Receba sua proposta completa no WhatsApp</small>
                </span>
                <span className="lead-whatsapp-arrow">›</span>
              </a>
              <button className="btn btn-outline" type="button" onClick={handleClose}>Fechar</button>
            </div>

            <p className="lead-safe-note">Seus dados estão seguros conosco.</p>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

export default LeadSimulationModal;
