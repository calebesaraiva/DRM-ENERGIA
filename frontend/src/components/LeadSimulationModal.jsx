import { useState } from 'react';
import { createPortal } from 'react-dom';
import './LeadSimulationModal.css';
import { makeWhatsAppLink } from '../utils/whatsapp';
import { withApiBase } from '../utils/apiBase';

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
  const [isFallbackResult, setIsFallbackResult] = useState(false);
  const [ctaVariant, setCtaVariant] = useState(() => (Math.random() > 0.5 ? 'A' : 'B'));
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
    const Fm = 1.7;
    const G = 120;
    const Wp = 0.61;
    const Fv = 15;
    const Cf = 5750;

    const consumoEstimadoKwh = Math.max(0, conta * Fm);
    const potenciaNecessariaKwp = consumoEstimadoKwh / G;
    const numeroPaineis = Math.max(1, Math.ceil(potenciaNecessariaKwp / Wp));
    const potenciaInstaladaKwp = Number((numeroPaineis * Wp).toFixed(2));
    const precoFinal = Math.round((consumoEstimadoKwh * Fv + Cf) * 100) / 100;

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
    const economia = conta * 0.82;
    const novaConta = conta - economia;
    const consumoEstimadoKwh = conta * 1.7;
    const projeto = (consumoEstimadoKwh * 15) + 5750;

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

        if (response.status === 401 || response.status === 405 || response.status >= 500 || isHtmlError) {
          setResult(buildFallbackResult(simulation.contaEnergia));
          setAssignedWhatsAppUrl(makeWhatsAppLink('resultado_modal_fallback', 'Olá, acabei de fazer a simulação e quero fechar meu projeto solar.'));
          setAssignedOwnerName('');
          setIsFallbackResult(true);
          setStep(3);
          return;
        }

        throw new Error(`Não foi possível gerar sua simulação agora (erro ${response.status}).`);
      }

      setResult(data?.resultado || null);
      setAssignedWhatsAppUrl(data?.whatsapp?.url || makeWhatsAppLink('resultado_modal', 'Olá, acabei de fazer a simulação e quero fechar meu projeto solar.'));
      setAssignedOwnerName(data?.assignedOwner?.nome || '');
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
    setAssignedWhatsAppUrl('');
    setAssignedOwnerName('');
    setCtaVariant(Math.random() > 0.5 ? 'A' : 'B');
    onClose();
  };

  const ctaPrimary = ctaVariant === 'A' ? 'Falar com um especialista agora' : 'Garantir proposta prioritária';
  const ctaSecondary = ctaVariant === 'A' ? 'Receba sua proposta completa no WhatsApp' : 'Atendimento com prioridade ainda hoje';

  return createPortal(
    <div className="lead-modal-backdrop" role="presentation" onMouseDown={handleClose}>
      <div className={`lead-modal lead-step-${step}`} role="dialog" aria-modal="true" aria-labelledby="lead-modal-title" onMouseDown={(event) => event.stopPropagation()}>
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
            <div className="lead-conversion-stage" aria-label="Resumo da economia estimada">
              <div className="lead-solar-visual" aria-hidden="true">
                <div className="lead-sun-orbit">
                  <span className="lead-sun-core"></span>
                  <span className="lead-sun-ray ray-one"></span>
                  <span className="lead-sun-ray ray-two"></span>
                  <span className="lead-sun-ray ray-three"></span>
                </div>
                <div className="lead-panel-3d">
                  <span></span>
                  <span></span>
                  <span></span>
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
                <div className="lead-energy-beam"></div>
              </div>
              <div className="lead-result-price lead-result-price-conversion">
                <span>Economia estimada mensal</span>
                <strong>{formatMoney(preview.economia)}</strong>
                <small>Nova conta aproximada: {formatMoney(preview.novaConta)}</small>
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
            <p className="lead-trust-copy">Sem spam. Usamos seus dados apenas para te enviar a proposta personalizada.</p>
            <div className="lead-proof-strip">
              <span>+1300 clientes atendidos</span>
              <span>Equipe própria credenciada</span>
              <span>Retorno em poucos minutos</span>
            </div>
            <p className="lead-urgency-note"><span></span> Agenda técnica com vagas limitadas para esta semana.</p>
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
            <div className="lead-final-hero">
              <div className="lead-final-copy">
                <div className="lead-success-pill">
                  <span>ETAPA 3 DE 3</span>
                  <strong>Concluída</strong>
                </div>
                <div className="lead-proof-strip lead-proof-strip-final">
                  <span>+1300 projetos aprovados</span>
                  <span>Garantia e suporte local</span>
                  <span>Atendimento regional imediato</span>
                </div>
              </div>
              <div className="lead-final-visual" aria-hidden="true">
                <div className="lead-final-sun"></div>
                <div className="lead-final-panel">
                  <span></span>
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
                <div className="lead-final-house">
                  <span></span>
                </div>
                <div className="lead-final-spark spark-one"></div>
                <div className="lead-final-spark spark-two"></div>
                <div className="lead-final-spark spark-three"></div>
              </div>
            </div>
            {isFallbackResult && (
              <p className="lead-fallback-note">
                Mostrando estimativa instantânea. Nosso especialista vai validar e enviar a proposta final no WhatsApp.
              </p>
            )}
            <div className="lead-result-price lead-final-price">
              <div>
                <span>Valor aproximado do projeto</span>
                <strong>{formatMoney(result?.financeiro?.preco_final_cliente_rs || preview?.projeto || 0)}</strong>
              </div>
              <div className="lead-result-price-icon lead-final-price-icon" aria-hidden="true">☀</div>
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
                href={assignedWhatsAppUrl || makeWhatsAppLink('resultado_modal', 'Olá, acabei de fazer a simulação e quero fechar meu projeto solar.')}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="lead-whatsapp-icon" aria-hidden="true">
                  <svg viewBox="0 0 32 32" focusable="false">
                    <path d="M16.01 3.2c-7.04 0-12.77 5.73-12.77 12.77 0 2.25.59 4.45 1.72 6.39L3.13 29l6.8-1.78a12.7 12.7 0 0 0 6.08 1.55c7.04 0 12.77-5.73 12.77-12.77S23.05 3.2 16.01 3.2Zm0 23.4c-1.95 0-3.85-.53-5.51-1.53l-.4-.24-4.03 1.06 1.08-3.93-.26-.41a10.53 10.53 0 0 1-1.49-5.38c0-5.85 4.76-10.61 10.61-10.61s10.61 4.76 10.61 10.61-4.76 10.43-10.61 10.43Zm5.82-7.94c-.32-.16-1.88-.93-2.17-1.03-.29-.11-.5-.16-.72.16-.21.32-.82 1.03-1 1.24-.19.21-.37.24-.69.08-.32-.16-1.35-.5-2.57-1.59-.95-.85-1.59-1.9-1.78-2.22-.19-.32-.02-.49.14-.65.14-.14.32-.37.48-.56.16-.19.21-.32.32-.53.11-.21.05-.4-.03-.56-.08-.16-.72-1.73-.98-2.38-.26-.62-.52-.54-.72-.55h-.61c-.21 0-.56.08-.85.4-.29.32-1.11 1.09-1.11 2.65 0 1.56 1.14 3.07 1.3 3.28.16.21 2.24 3.42 5.43 4.79.76.33 1.35.52 1.81.67.76.24 1.46.21 2.01.13.61-.09 1.88-.77 2.14-1.51.27-.74.27-1.38.19-1.51-.08-.13-.29-.21-.61-.37Z" />
                  </svg>
                </span>
                <span className="lead-whatsapp-copy">
                  <strong>{ctaPrimary}</strong>
                  <small>{ctaSecondary}</small>
                </span>
                <span className="lead-whatsapp-arrow">›</span>
              </a>
              <button className="btn btn-outline" type="button" onClick={handleClose}>Fechar</button>
            </div>

            <p className="lead-safe-note">Seus dados estão seguros conosco.</p>
            {assignedOwnerName && <p className="lead-assigned-note">Seu atendimento foi direcionado para {assignedOwnerName}.</p>}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

export default LeadSimulationModal;
