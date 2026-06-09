import { useState } from 'react';
import { createPortal } from 'react-dom';
import './LeadSimulationModal.css';
import { makeWhatsAppLink } from '../utils/whatsapp';
import { withApiBase } from '../utils/apiBase';
import { trackSiteEvent } from '../utils/analytics';

const initialLead = { nome: '', telefone: '', cidade: '' };
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
  const [assignedWhatsAppUrl, setAssignedWhatsAppUrl] = useState('');
  const [assignedOwnerName, setAssignedOwnerName] = useState('');

  if (!isOpen) return null;

  const formatMoney = (value) => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const formatNumber = (value, digits = 0) => Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

  const buildFallbackResult = (contaEnergia) => {
    const conta = Number(contaEnergia || 0);
    const consumoEstimadoKwh = Math.max(0, conta * 1.7);
    const potenciaNecessariaKwp = consumoEstimadoKwh / 120;
    const numeroPaineis = Math.max(1, Math.ceil(potenciaNecessariaKwp / 0.61));
    const potenciaInstaladaKwp = Number((numeroPaineis * 0.61).toFixed(2));
    const precoFinal = Math.round((consumoEstimadoKwh * 15 + 5750) * 100) / 100;
    return {
      financeiro: { preco_final_cliente_rs: precoFinal },
      dimensionamento: {
        potencia_real_instalada_kwp: potenciaInstaladaKwp,
        numero_paineis_necessarios: numeroPaineis,
        geracao_estimada_kwh: Math.round(consumoEstimadoKwh),
      },
    };
  };

  const handleLeadChange = (event) => {
    const { name, value } = event.target;
    if (name === 'telefone') {
      const digits = value.replace(/\D/g, '').slice(0, 11);
      const masked = digits
        .replace(/^(\d{2})(\d)/, '($1) $2')
        .replace(/(\d{5})(\d)/, '$1-$2');
      setLead((prev) => ({ ...prev, [name]: masked }));
      return;
    }
    setLead((prev) => ({ ...prev, [name]: value }));
  };

  const handleSimulationChange = (event) => {
    const { name, value } = event.target;
    setSimulation((prev) => ({ ...prev, [name]: value }));
  };

  const handlePreviewSubmit = (event) => {
    event.preventDefault();
    const conta = Number(simulation.contaEnergia || 0);
    if (!conta || conta < 1) {
      setError('Informe um valor válido para a conta de energia.');
      return;
    }
    const economia = conta * 0.82;
    const novaConta = conta - economia;
    const projeto = (conta * 1.7 * 15) + 5750;
    setError('');
    setPreview({ economia, novaConta, projeto });
    setStep(2);
  };

  const handleFinalSubmit = async (event) => {
    event.preventDefault();
    setError('');

    // Build WhatsApp message and open immediately (tied to user click — sem risco de popup blocker)
    const waMsg = `Olá! Acabei de simular no site da DRM Energia Solar.\nNome: ${lead.nome || '-'}\nCidade: ${lead.cidade || '-'}\nConta média: R$ ${simulation.contaEnergia || '-'}\nGostaria de receber minha proposta!`;
    const immediateUrl = makeWhatsAppLink('resultado_modal_auto', waMsg);
    window.open(immediateUrl, '_blank');

    // Mostrar step 3 imediatamente com resultado estimado
    const fallback = buildFallbackResult(simulation.contaEnergia);
    setResult(fallback);
    setAssignedWhatsAppUrl(immediateUrl);
    setStep(3);

    localStorage.setItem('leadSimulationCompleted', '1');
    window.dispatchEvent(new Event('lead-simulation-completed'));
    trackSiteEvent('simulation_completed', 'modal_auto_whatsapp', { cidade: lead.cidade, conta: simulation.contaEnergia });

    // Salvar lead em background — não bloqueia a UX
    setIsLoading(true);
    try {
      const response = await fetch(withApiBase('/api/simulacao-publica'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead, simulacao: simulation }),
      });
      const ct = response.headers.get('content-type') || '';
      if (response.ok && ct.includes('application/json')) {
        const data = await response.json();
        if (data?.resultado) setResult(data.resultado);
        if (data?.whatsapp?.url) setAssignedWhatsAppUrl(data.whatsapp.url);
        if (data?.assignedOwner?.nome) setAssignedOwnerName(data.assignedOwner.nome);
      }
    } catch (_) {
      // Silencioso — WhatsApp já aberto
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
    setAssignedWhatsAppUrl('');
    setAssignedOwnerName('');
    onClose();
  };

  return createPortal(
    <div className="lead-modal-backdrop" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className={`lead-modal lead-step-${step}`} role="dialog" aria-modal="true" aria-labelledby="lead-modal-title">
        <button className="lead-modal-close" type="button" onClick={handleClose} aria-label="Fechar">✕</button>

        <div className="lead-modal-header">
          <span className="lead-modal-step">Etapa {step} de 3</span>
          <div className="lead-modal-progress" aria-hidden="true">
            <span className={step >= 1 ? 'active' : ''}></span>
            <span className={step >= 2 ? 'active' : ''}></span>
            <span className={step >= 3 ? 'active' : ''}></span>
          </div>
          <h2 id="lead-modal-title">
            {step === 1 && 'Descubra sua economia em 30 segundos'}
            {step === 2 && 'Libere seu estudo completo'}
            {step === 3 && 'Estimativa pronta!'}
          </h2>
          <p>
            {step === 1 && 'Informe sua conta média e cidade para ver a previsão inicial.'}
            {step === 2 && 'Preencha seus dados para receber sua proposta personalizada.'}
            {step === 3 && 'WhatsApp aberto! Nosso consultor vai te atender com prioridade.'}
          </p>
        </div>

        {/* ── STEP 1 ── */}
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

        {/* ── STEP 2 ── */}
        {step === 2 && preview && (
          <form className="lead-modal-form" onSubmit={handleFinalSubmit}>
            {/* Preview compacto */}
            <div className="lead-preview-row">
              <div className="lead-preview-item lead-preview-economy">
                <span>Economia estimada/mês</span>
                <strong>{formatMoney(preview.economia)}</strong>
              </div>
              <div className="lead-preview-item">
                <span>Nova conta</span>
                <strong>{formatMoney(preview.novaConta)}</strong>
              </div>
              <div className="lead-preview-item">
                <span>Investimento aprox.</span>
                <strong>{formatMoney(preview.projeto)}</strong>
              </div>
            </div>

            <label>
              Nome completo
              <input name="nome" value={lead.nome} onChange={handleLeadChange} required placeholder="Digite seu nome" />
            </label>
            <label>
              Telefone
              <input name="telefone" value={lead.telefone} onChange={handleLeadChange} required placeholder="(00) 90000-0000" inputMode="tel" autoComplete="tel" />
            </label>

            <p className="lead-urgency-note"><span></span> Vagas limitadas esta semana. Receba sua proposta agora!</p>

            {error && <p className="lead-modal-error">{error}</p>}

            <div className="lead-modal-actions">
              <button className="btn btn-outline" type="button" onClick={() => setStep(1)}>Voltar</button>
              <button className="btn btn-primary btn-simular" type="submit" disabled={isLoading}>
                {isLoading ? 'Gerando...' : 'Receber proposta no WhatsApp'}
              </button>
            </div>
          </form>
        )}

        {/* ── STEP 3 ── */}
        {step === 3 && (
          <div className="lead-result">
            <div className="lead-whatsapp-sent-badge">
              <svg viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
                <path d="M16.01 3.2c-7.04 0-12.77 5.73-12.77 12.77 0 2.25.59 4.45 1.72 6.39L3.13 29l6.8-1.78a12.7 12.7 0 0 0 6.08 1.55c7.04 0 12.77-5.73 12.77-12.77S23.05 3.2 16.01 3.2Zm5.82 17.46c-.32-.16-1.88-.93-2.17-1.03-.29-.11-.5-.16-.72.16-.21.32-.82 1.03-1 1.24-.19.21-.37.24-.69.08-.32-.16-1.35-.5-2.57-1.59-.95-.85-1.59-1.9-1.78-2.22-.19-.32-.02-.49.14-.65.14-.14.32-.37.48-.56.16-.19.21-.32.32-.53.11-.21.05-.4-.03-.56-.08-.16-.72-1.73-.98-2.38-.26-.62-.52-.54-.72-.55h-.61c-.21 0-.56.08-.85.4-.29.32-1.11 1.09-1.11 2.65 0 1.56 1.14 3.07 1.3 3.28.16.21 2.24 3.42 5.43 4.79.76.33 1.35.52 1.81.67.76.24 1.46.21 2.01.13.61-.09 1.88-.77 2.14-1.51.27-.74.27-1.38.19-1.51-.08-.13-.29-.21-.61-.37Z" />
              </svg>
              <span>WhatsApp aberto com sucesso!</span>
            </div>

            <div className="lead-result-price lead-final-price">
              <div>
                <span>Valor aproximado do projeto</span>
                <strong>{formatMoney(result?.financeiro?.preco_final_cliente_rs || preview?.projeto || 0)}</strong>
              </div>
              <div className="lead-result-price-icon lead-final-price-icon lead-icon-sun" aria-hidden="true"></div>
            </div>

            <div className="lead-result-grid">
              <div className="lead-metric-card">
                <div className="lead-metric-icon lead-icon-bolt" aria-hidden="true"></div>
                <span>Potência instalada</span>
                <strong>
                  {result?.dimensionamento?.potencia_real_instalada_kwp
                    ? `${formatNumber(result.dimensionamento.potencia_real_instalada_kwp, 2)} kWp`
                    : '-'}
                </strong>
              </div>
              <div className="lead-metric-card">
                <div className="lead-metric-icon lead-icon-panels" aria-hidden="true"></div>
                <span>Quantidade de painéis</span>
                <strong>{result?.dimensionamento?.numero_paineis_necessarios ? formatNumber(result.dimensionamento.numero_paineis_necessarios) : '-'}</strong>
              </div>
              <div className="lead-metric-card">
                <div className="lead-metric-icon lead-icon-generation" aria-hidden="true"></div>
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
                href={assignedWhatsAppUrl || makeWhatsAppLink('resultado_modal', 'Olá, acabei de fazer a simulação e quero fechar meu projeto solar.')}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="lead-whatsapp-icon" aria-hidden="true">
                  <svg viewBox="0 0 32 32" focusable="false">
                    <path d="M16.01 3.2c-7.04 0-12.77 5.73-12.77 12.77 0 2.25.59 4.45 1.72 6.39L3.13 29l6.8-1.78a12.7 12.7 0 0 0 6.08 1.55c7.04 0 12.77-5.73 12.77-12.77S23.05 3.2 16.01 3.2Zm5.82 17.46c-.32-.16-1.88-.93-2.17-1.03-.29-.11-.5-.16-.72.16-.21.32-.82 1.03-1 1.24-.19.21-.37.24-.69.08-.32-.16-1.35-.5-2.57-1.59-.95-.85-1.59-1.9-1.78-2.22-.19-.32-.02-.49.14-.65.14-.14.32-.37.48-.56.16-.19.21-.32.32-.53.11-.21.05-.4-.03-.56-.08-.16-.72-1.73-.98-2.38-.26-.62-.52-.54-.72-.55h-.61c-.21 0-.56.08-.85.4-.29.32-1.11 1.09-1.11 2.65 0 1.56 1.14 3.07 1.3 3.28.16.21 2.24 3.42 5.43 4.79.76.33 1.35.52 1.81.67.76.24 1.46.21 2.01.13.61-.09 1.88-.77 2.14-1.51.27-.74.27-1.38.19-1.51-.08-.13-.29-.21-.61-.37Z" />
                  </svg>
                </span>
                <span className="lead-whatsapp-copy">
                  <strong>Falar com especialista agora</strong>
                  <small>
                    {assignedOwnerName ? `Atendimento: ${assignedOwnerName}` : 'Receba sua proposta completa no WhatsApp'}
                  </small>
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
