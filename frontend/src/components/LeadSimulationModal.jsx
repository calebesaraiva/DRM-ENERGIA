import React, { useState } from 'react';
import './LeadSimulationModal.css';

const initialLead = {
  nome: '',
  telefone: '',
  email: '',
  cidade: '',
};

const initialSimulation = {
  contaEnergia: '',
};

function LeadSimulationModal({ isOpen, onClose }) {
  const [step, setStep] = useState(1);
  const [lead, setLead] = useState(initialLead);
  const [simulation, setSimulation] = useState(initialSimulation);
  const [result, setResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const formatMoney = (value) => value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const handleLeadChange = (event) => {
    const { name, value } = event.target;
    setLead(prev => ({ ...prev, [name]: value }));
  };

  const handleSimulationChange = (event) => {
    const { name, value, type, checked } = event.target;
    setSimulation(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleLeadSubmit = (event) => {
    event.preventDefault();
    setError('');
    setStep(2);
  };

  const handleSimulationSubmit = async (event) => {
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
      const data = contentType.includes('application/json')
        ? await response.json()
        : null;

      if (!response.ok) {
        throw new Error(data?.message || 'Não foi possível gerar sua simulação. Verifique se o servidor está rodando e tente novamente.');
      }

      if (!data?.resultado) {
        throw new Error('A simulação não retornou um resultado válido. Tente novamente.');
      }

      setResult(data.resultado);
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
    setResult(null);
    setError('');
    onClose();
  };

  return (
    <div className="lead-modal-backdrop" role="presentation" onMouseDown={handleClose}>
      <div className="lead-modal" role="dialog" aria-modal="true" aria-labelledby="lead-modal-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="lead-modal-close" type="button" onClick={handleClose} aria-label="Fechar">x</button>

        <div className="lead-modal-header">
          <span className="lead-modal-step">Etapa {step} de 3</span>
          <h2 id="lead-modal-title">
            {step === 1 && 'Antes da simulação'}
            {step === 2 && 'Dados para o cálculo'}
            {step === 3 && 'Estimativa do projeto'}
          </h2>
          <p>
            {step === 1 && 'Informe seus dados para receber uma estimativa personalizada.'}
            {step === 2 && 'Agora informe apenas o valor médio pago na conta de energia, em reais (R$).'}
            {step === 3 && 'Sua simulação foi salva. Nossa equipe também poderá acompanhar pelo painel.'}
          </p>
        </div>

        {step === 1 && (
          <form className="lead-modal-form" onSubmit={handleLeadSubmit}>
            <label>
              Nome completo
              <input name="nome" value={lead.nome} onChange={handleLeadChange} required placeholder="Digite seu nome" />
            </label>
            <label>
              Número de telefone
              <input name="telefone" value={lead.telefone} onChange={handleLeadChange} required placeholder="(00) 90000-0000" />
            </label>
            <label>
              E-mail
              <input type="email" name="email" value={lead.email} onChange={handleLeadChange} required placeholder="seuemail@exemplo.com" />
            </label>
            <label>
              Cidade
              <input name="cidade" value={lead.cidade} onChange={handleLeadChange} required placeholder="Sua cidade" />
            </label>

            {error && <p className="lead-modal-error">{error}</p>}

            <button className="btn btn-primary w-full" type="submit">Continuar</button>
          </form>
        )}

        {step === 2 && (
          <form className="lead-modal-form" onSubmit={handleSimulationSubmit}>
            <label>
              Valor médio da conta de energia em reais (R$)
              <input
                type="number"
                name="contaEnergia"
                value={simulation.contaEnergia}
                onChange={handleSimulationChange}
                required
                min="1"
                placeholder="Ex: R$ 450"
              />
            </label>

            {error && <p className="lead-modal-error">{error}</p>}

            <div className="lead-modal-actions">
              <button className="btn btn-outline" type="button" onClick={() => setStep(1)}>Voltar</button>
              <button className="btn btn-primary" type="submit" disabled={isLoading}>
                {isLoading ? 'Calculando...' : 'Ver estimativa'}
              </button>
            </div>
          </form>
        )}

        {step === 3 && result && (
          <div className="lead-result">
            <div className="lead-result-price">
              <span>Valor aproximado do projeto</span>
              <strong>{formatMoney(result.financeiro.preco_final_cliente_rs)}</strong>
            </div>

            <div className="lead-result-grid">
              <div>
                <span>Potência instalada</span>
                <strong>{result.dimensionamento.potencia_real_instalada_kwp} kWp</strong>
              </div>
              <div>
                <span>Quantidade de painéis</span>
                <strong>{result.dimensionamento.numero_paineis_necessarios}</strong>
              </div>
              <div>
                <span>Geração estimada</span>
                <strong>{result.dimensionamento.geracao_estimada_kwh} kWh</strong>
              </div>
            </div>

            <div className="lead-result-actions">
              <a
                className="btn btn-primary"
                href="https://api.whatsapp.com/send/?phone=559985127056&text=Ol%C3%A1%2C%20fiz%20uma%20simula%C3%A7%C3%A3o%20no%20site%20e%20quero%20falar%20com%20um%20consultor.&type=phone_number&app_absent=0"
                target="_blank"
                rel="noopener noreferrer"
              >
                Falar no WhatsApp
              </a>
              <button className="btn btn-outline" type="button" onClick={handleClose}>Fechar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default LeadSimulationModal;
