import { useState } from 'react';
import { createPortal } from 'react-dom';
import './LeadSimulationModal.css';
import { makeWhatsAppLink } from '../utils/whatsapp';
import { withApiBase } from '../utils/apiBase';

const initialLead = { nome: '', telefone: '', email: '', cidade: '' };
const initialSimulation = { contaEnergia: '' };
const citySuggestions = [
  'Imperatriz - MA',
  'Açailândia - MA',
  'João Lisboa - MA',
  'Cidelândia - MA',
  'Davinópolis - MA',
  'Governador Edison Lobão - MA',
  'São Luís - MA',
  'Balsas - MA',
  'Bacabal - MA',
  'Timon - MA',
  'Araguaína - TO',
  'Palmas - TO',
  'Marabá - PA',
  'Parauapebas - PA',
];

function LeadSimulationModal({ isOpen, onClose }) {
  const [step, setStep] = useState(1);
  const [lead, setLead] = useState(initialLead);
  const [simulation, setSimulation] = useState(initialSimulation);
  const [result, setResult] = useState(null);
  const [preview, setPreview] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isFallbackResult, setIsFallbackResult] = useState(false);

  if (!isOpen) return null;

  const formatMoney = (value) => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const formatNumber = (value, digits = 0) => Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

  const buildFallbackResult = (contaEnergia) => {
    const conta = Number(contaEnergia || 0);
    const geracaoEstimadaKwh = Math.max(0, Math.round(conta * 6.4));
    const potenciaInstaladaKwp = Math.max(0.5, Number((geracaoEstimadaKwh / 120).toFixed(2)));
    const numeroPaineis = Math.max(1, Math.round((potenciaInstaladaKwp * 1000) / 550));
    const precoFinal = Math.round(conta * 100.61 * 100) / 100;

    return {
      financeiro: { preco_final_cliente_rs: precoFinal },
      dimensionamento: {
        potencia_real_instalada_kwp: potenciaInstaladaKwp,
        numero_paineis_necessarios: numeroPaineis,
        geracao_estimada_kwh: geracaoEstimadaKwh,
      },
    };
  };

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
      const endpoint = withApiBase('/api/simulacao-publica');
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead, simulacao: simulation }),
      });

      const contentType = response.headers.get('content-type') || '';
      let data = null;
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        data = text ? { message: text } : null;
      }

      if (!response.ok) {
        const rawMessage = String(data?.message || '').trim();
        const isHtmlError = rawMessage.startsWith('<') || rawMessage.includes('<html');

        if (response.status === 405 || response.status >= 500 || isHtmlError) {
          setResult(buildFallbackResult(simulation.contaEnergia));
          setIsFallbackResult(true);
          setStep(3);
          return;
        }

        throw new Error(`Não foi possível gerar sua simulação agora (erro ${response.status}).`);
      }

      setResult(data?.resultado || null);
      setIsFallbackResult(false);
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
    setIsFallbackResult(false);
    onClose();
  };

  return createPortal(
    <div className="lead-modal-backdrop" role="presentation" onMouseDown={handleClose}>
      <div className="lead-modal" role="dialog" aria-modal="true" aria-labelledby="lead-modal-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="lead-modal-close" type="button" onClick={handleClose} aria-label="Fechar">✕</button>

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
              <input
                name="cidade"
                value={lead.cidade}
                onChange={handleLeadChange}
                required
                placeholder="Sua cidade"
                list="lead-city-suggestions"
                autoComplete="address-level2"
              />
              <datalist id="lead-city-suggestions">
                {citySuggestions.map((city) => (
                  <option key={city} value={city} />
                ))}
              </datalist>
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
            {error && (
              <a
                className="lead-error-help"
                href={makeWhatsAppLink(
                  'erro_simulacao_modal',
                  `Olá! Tive erro ao gerar simulação no site. Nome: ${lead.nome || '-'}, Cidade: ${lead.cidade || '-'}, Conta: R$ ${simulation.contaEnergia || '-'}`
                )}
                target="_blank"
                rel="noopener noreferrer"
              >
                Falar com especialista agora pelo WhatsApp
              </a>
            )}

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
            {isFallbackResult && (
              <p className="lead-fallback-note">
                Mostrando estimativa instantânea. Nosso especialista vai validar e enviar a proposta final no WhatsApp.
              </p>
            )}
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
                <strong>
                  {result?.dimensionamento?.potencia_real_instalada_kwp
                    ? `${formatNumber(result.dimensionamento.potencia_real_instalada_kwp, 2)} kWp`
                    : '-'}
                </strong>
              </div>
              <div className="lead-metric-card">
                <div className="lead-metric-icon">▦</div>
                <span>Quantidade de painéis</span>
                <strong>{result?.dimensionamento?.numero_paineis_necessarios ? formatNumber(result.dimensionamento.numero_paineis_necessarios) : '-'}</strong>
              </div>
              <div className="lead-metric-card">
                <div className="lead-metric-icon">↗</div>
                <span>Geração estimada</span>
                <strong>
                  {result?.dimensionamento?.geracao_estimada_kwh
                    ? `${formatNumber(result.dimensionamento.geracao_estimada_kwh)} kWh`
                    : '-'}
                </strong>
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
