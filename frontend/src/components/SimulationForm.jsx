import { useState } from 'react';
import './SimulationForm.css';
import { withApiBase } from '../utils/apiBase';
import CurrencyInput from './CurrencyInput';

function SimulationForm({ onResults }) {
  const [formData, setFormData] = useState({
    contaEnergia: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(withApiBase('/api/calcular'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Falha no cálculo. Tente novamente.');
      }

      onResults(data); // Passa os resultados para o componente pai

    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="simulation-form">
      <div className="form-group">
        <label htmlFor="contaEnergia" className="form-label">Quanto você paga atualmente na conta de energia em reais (R$)?</label>
        <CurrencyInput
          id="contaEnergia"
          name="contaEnergia"
          value={formData.contaEnergia}
          onValueChange={(value) => setFormData(prev => ({ ...prev, contaEnergia: value }))}
          placeholder="Ex: R$ 400"
          required
          className="form-input"
        />
      </div>

      {error && <p className="error-message">{error}</p>}

      <button type="submit" className="btn btn-primary w-full" disabled={isLoading}>
        {isLoading ? 'Calculando...' : 'Simular Economia'}
      </button>
    </form>
  );
}

export default SimulationForm;
