import { useState } from 'react';
import { createPortal } from 'react-dom';
import './LeadSimulationModal.css';
import { makeWhatsAppLink } from '../utils/whatsapp';
import { withApiBase } from '../utils/apiBase';
import { trackSiteEvent } from '../utils/analytics';
import CurrencyInput from './CurrencyInput';

const initialLead = { nome: '', telefone: '', cidade: '' };
const initialSimulation = { contaEnergia: '' };

const citySuggestions = [
  'Imperatriz - MA', 'Açailândia - MA', 'João Lisboa - MA', 'Cidelândia - MA',
  'Davinópolis - MA', 'Governador Edison Lobão - MA', 'São Luís - MA', 'Balsas - MA',
  'Bacabal - MA', 'Timon - MA', 'Araguaína - TO', 'Palmas - TO', 'Marabá - PA', 'Parauapebas - PA',
];

const CONTA_OPTIONS = [
  {
    id: 'ate300', label: 'Até R$300', value: 250,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M13 2L4.09 12.11c-.38.43-.57.65-.57.89 0 .24.09.46.27.63.18.17.43.27.71.27H12l-1 8.89L20.9 11.9c.39-.44.58-.65.58-.9 0-.24-.09-.46-.27-.63A.92.92 0 0020.5 10H14l1-8z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: '300a700', label: 'R$300 a R$700', value: 500,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M18 20V10M12 20V4M6 20v-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: '700a1500', label: 'R$700 a R$1.500', value: 1100,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.8" />
        <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.8" />
        <rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.8" />
        <rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    ),
  },
  {
    id: 'acima1500', label: 'Acima de R$1.500', value: 2000,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M7 17L17 7M17 7H7M17 7v10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

function StepsBar({ step }) {
  return (
    <div className="lead-steps-bar">
      <div className="lead-step-item">
        <div className={`lead-step-dot ${step >= 1 ? 'active' : ''}`}>1</div>
        <span className="lead-step-label">Conta</span>
      </div>
      <div className={`lead-step-line ${step >= 2 ? 'done' : ''}`} />
      <div className="lead-step-item">
        <div className={`lead-step-dot ${step >= 2 ? 'active' : ''}`}>2</div>
        <span className="lead-step-label">Imóvel</span>
      </div>
      <div className={`lead-step-line ${step >= 3 ? 'done' : ''}`} />
      <div className="lead-step-item">
        <div className={`lead-step-dot ${step >= 3 ? 'active' : ''}`}>3</div>
        <span className="lead-step-label">Resultado</span>
      </div>
    </div>
  );
}

function LeadSimulationModal({ isOpen, onClose }) {
  const [step, setStep] = useState(1);
  const [lead, setLead] = useState(initialLead);
  const [simulation, setSimulation] = useState(initialSimulation);
  const [selectedOption, setSelectedOption] = useState(null);
  const [result, setResult] = useState(null);
  const [preview, setPreview] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [assignedWhatsAppUrl, setAssignedWhatsAppUrl] = useState('');
  const [assignedOwnerName, setAssignedOwnerName] = useState('');

  if (!isOpen) return null;

  const formatMoney = (value) => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const formatNumber = (value, digits = 0) => Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: digits, maximumFractionDigits: digits,
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
      const masked = digits.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
      setLead((prev) => ({ ...prev, [name]: masked }));
      return;
    }
    setLead((prev) => ({ ...prev, [name]: value }));
  };

  const handleOptionSelect = (opt) => {
    setSelectedOption(opt.id);
    setSimulation((prev) => ({ ...prev, contaEnergia: String(opt.value) }));
    setError('');
  };

  const handleCustomContaChange = (val) => {
    setSelectedOption(null);
    setSimulation((prev) => ({ ...prev, contaEnergia: val }));
  };

  const handlePreviewSubmit = (event) => {
    event.preventDefault();
    const conta = Number(simulation.contaEnergia || 0);
    if (!conta || conta < 1) {
      setError('Selecione uma faixa ou informe o valor da sua conta de energia.');
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
    const waMsg = `Olá! Acabei de simular no site da DRM Energia Solar.\nNome: ${lead.nome || '-'}\nCidade: ${lead.cidade || '-'}\nConta média: R$ ${simulation.contaEnergia || '-'}\nGostaria de receber minha proposta!`;
    const immediateUrl = makeWhatsAppLink('resultado_modal_auto', waMsg);
    window.open(immediateUrl, '_blank');

    const fallback = buildFallbackResult(simulation.contaEnergia);
    setResult(fallback);
    setAssignedWhatsAppUrl(immediateUrl);
    setStep(3);

    localStorage.setItem('leadSimulationCompleted', '1');
    window.dispatchEvent(new Event('lead-simulation-completed'));
    trackSiteEvent('simulation_completed', 'modal_auto_whatsapp', { cidade: lead.cidade, conta: simulation.contaEnergia });

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
    } catch {
      // Silencioso — WhatsApp já aberto
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setStep(1);
    setLead(initialLead);
    setSimulation(initialSimulation);
    setSelectedOption(null);
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

        {/* ── STEP 1: two-panel layout ── */}
        {step === 1 && (
          <div className="lead-two-col">
            {/* Painel esquerdo decorativo */}
            <div className="lead-left-panel">
              <span className="lead-left-badge">
                <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13" aria-hidden="true">
                  <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
                </svg>
                Simulação gratuita
              </span>
              <h3 className="lead-left-title">
                Descubra quanto sua conta pode cair com <span>energia solar</span>
              </h3>
              <p className="lead-left-sub">Veja uma prévia da sua economia em menos de 30 segundos.</p>
              <ul className="lead-left-features">
                <li>
                  <span className="lead-left-icon">
                    <svg viewBox="0 0 24 24" fill="none" width="16" height="16" aria-hidden="true">
                      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      <path d="M22 4L12 14.01l-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <div><strong>+1300</strong><span>projetos entregues</span></div>
                </li>
                <li>
                  <span className="lead-left-icon">
                    <svg viewBox="0 0 24 24" fill="none" width="16" height="16" aria-hidden="true">
                      <path d="M18 20V10M12 20V4M6 20v-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <div><strong>até 82%</strong><span>de economia</span></div>
                </li>
                <li>
                  <span className="lead-left-icon">
                    <svg viewBox="0 0 24 24" fill="none" width="16" height="16" aria-hidden="true">
                      <path d="M3 18v-6a9 9 0 0118 0v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      <path d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3v5zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3v5z" stroke="currentColor" strokeWidth="2" />
                    </svg>
                  </span>
                  <div><strong>atendimento com</strong><span>consultor real</span></div>
                </li>
              </ul>
              <div className="lead-left-example">
                <p className="lead-left-example-title">
                  Exemplo de economia mensal
                  <span title="Simulação baseada em conta de R$650" aria-label="informação"> ⓘ</span>
                </p>
                <div className="lead-left-example-grid">
                  <div>
                    <span>Conta atual</span>
                    <strong>R$ 650</strong>
                  </div>
                  <div>
                    <span>Conta estimada</span>
                    <strong>R$ 170</strong>
                  </div>
                  <div>
                    <span>Economia</span>
                    <strong className="eco">R$ 480<small>/mês</small></strong>
                  </div>
                </div>
                <p className="lead-left-example-footer">
                  <svg viewBox="0 0 24 24" fill="none" width="13" height="13" aria-hidden="true">
                    <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" />
                    <path d="M7 11V7a5 5 0 0110 0v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                  Sem compromisso. Seus dados estão seguros.
                </p>
              </div>
            </div>

            {/* Painel direito — formulário */}
            <div className="lead-right-panel">
              <span className="lead-modal-step">Etapa 1 de 3</span>
              <StepsBar step={step} />
              <h2 id="lead-modal-title" className="lead-right-title">
                Descubra quanto você pode economizar na sua conta
              </h2>
              <p className="lead-right-sub">Simulação gratuita, rápida e sem compromisso.</p>

              <form className="lead-modal-form" onSubmit={handlePreviewSubmit}>
                <p className="lead-field-label">Quanto você paga de energia por mês?</p>
                <div className="lead-options-grid">
                  {CONTA_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      className={`lead-option-card ${selectedOption === opt.id ? 'selected' : ''}`}
                      onClick={() => handleOptionSelect(opt)}
                    >
                      <span className="lead-option-icon">{opt.icon}</span>
                      <span className="lead-option-label">{opt.label}</span>
                    </button>
                  ))}
                </div>

                <p className="lead-or-label">ou digite o valor exato</p>
                <div className="lead-money-input-wrap">
                  <span className="lead-money-prefix">R$</span>
                  <CurrencyInput
                    placeholder="450"
                    value={simulation.contaEnergia}
                    onValueChange={handleCustomContaChange}
                    className="lead-money-input"
                    aria-label="Valor da conta de energia"
                  />
                </div>

                <p className="lead-field-label lead-field-label--city">Em qual cidade está o imóvel?</p>
                <div className="lead-city-input-wrap">
                  <input
                    name="cidade"
                    value={lead.cidade}
                    onChange={handleLeadChange}
                    required
                    placeholder="Ex: Imperatriz"
                    list="lead-city-suggestions"
                    autoComplete="address-level2"
                    className="lead-city-input"
                  />
                  <span className="lead-city-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
                      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" stroke="currentColor" strokeWidth="1.5" fill="none" />
                    </svg>
                  </span>
                  <datalist id="lead-city-suggestions">
                    {citySuggestions.map((city) => (<option key={city} value={city} />))}
                  </datalist>
                </div>

                {error && <p className="lead-modal-error">{error}</p>}

                <button className="lead-cta-primary" type="submit">
                  Continuar simulação
                  <svg viewBox="0 0 24 24" fill="none" width="18" height="18" aria-hidden="true">
                    <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <p className="lead-time-note">
                  <svg viewBox="0 0 24 24" fill="none" width="14" height="14" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8" />
                    <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                  Leva menos de 30 segundos
                </p>
              </form>
            </div>
          </div>
        )}

        {/* ── STEP 2 ── */}
        {step === 2 && preview && (
          <>
            <div className="lead-modal-header">
              <span className="lead-modal-step">Etapa 2 de 3</span>
              <StepsBar step={step} />
              <h2 id="lead-modal-title">Libere seu estudo completo</h2>
              <p>Preencha seus dados para receber sua proposta personalizada.</p>
            </div>
            <form className="lead-modal-form" onSubmit={handleFinalSubmit}>
              <div className="lead-preview-row">
                <div className="lead-preview-item lead-preview-economy">
                  <span>Economia/mês</span>
                  <strong>{formatMoney(preview.economia)}</strong>
                </div>
                <div className="lead-preview-item">
                  <span>Nova conta</span>
                  <strong>{formatMoney(preview.novaConta)}</strong>
                </div>
                <div className="lead-preview-item">
                  <span>Investimento</span>
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
          </>
        )}

        {/* ── STEP 3 ── */}
        {step === 3 && (
          <div className="lead-result">
            <div className="lead-modal-header" style={{ marginBottom: '0.75rem' }}>
              <span className="lead-modal-step">Etapa 3 de 3</span>
              <StepsBar step={step} />
              <h2 id="lead-modal-title">Estimativa pronta!</h2>
              <p>WhatsApp aberto! Nosso consultor vai te atender com prioridade.</p>
            </div>

            <div className="lead-whatsapp-sent-badge">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" width="20" height="20">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
              </svg>
              <span>WhatsApp aberto com sucesso!</span>
            </div>

            <div className="lead-result-price lead-final-price">
              <div>
                <span>Valor aproximado do projeto</span>
                <strong>{formatMoney(result?.financeiro?.preco_final_cliente_rs || preview?.projeto || 0)}</strong>
              </div>
              <div className="lead-result-price-icon lead-final-price-icon lead-icon-sun" aria-hidden="true" />
            </div>

            <div className="lead-result-grid">
              <div className="lead-metric-card">
                <div className="lead-metric-icon lead-icon-bolt" aria-hidden="true" />
                <span>Potência instalada</span>
                <strong>
                  {result?.dimensionamento?.potencia_real_instalada_kwp
                    ? `${formatNumber(result.dimensionamento.potencia_real_instalada_kwp, 2)} kWp`
                    : '-'}
                </strong>
              </div>
              <div className="lead-metric-card">
                <div className="lead-metric-icon lead-icon-panels" aria-hidden="true" />
                <span>Quantidade de painéis</span>
                <strong>{result?.dimensionamento?.numero_paineis_necessarios ? formatNumber(result.dimensionamento.numero_paineis_necessarios) : '-'}</strong>
              </div>
              <div className="lead-metric-card">
                <div className="lead-metric-icon lead-icon-generation" aria-hidden="true" />
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
                  <svg viewBox="0 0 24 24" fill="currentColor" focusable="false">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                  </svg>
                </span>
                <span className="lead-whatsapp-copy">
                  <strong>Falar com especialista agora</strong>
                  <small>{assignedOwnerName ? `Atendimento: ${assignedOwnerName}` : 'Receba sua proposta completa no WhatsApp'}</small>
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
