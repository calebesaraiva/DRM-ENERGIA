import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import SimulationForm from '../components/SimulationForm';
import './Dashboard.css';
import { withApiBase } from '../utils/apiBase';

function Dashboard() {
  const [simulationResults, setSimulationResults] = useState(null);
  const [isSaved, setIsSaved] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [user] = useState(() => JSON.parse(localStorage.getItem('user') || 'null'));
  const navigate = useNavigate();

  const handleLogout = () => {
    // Em um app real, você invalidaria o token aqui
    localStorage.removeItem('role');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login'); // Redireciona para a tela de login
  };

  const handleNewSimulation = () => {
    setSimulationResults(null);
    setIsSaved(false);
    setSaveMessage('');
  };

  const handleSetResults = (results) => {
    setSimulationResults(results);
    setIsSaved(false); // Reseta o status de "salvo" para a nova simulação
    setSaveMessage('');
  };

  const handleSaveOrcamento = async () => {
    if (!simulationResults || isSaved) return;

    setSaveMessage('Salvando...');
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(withApiBase('/api/salvar-orcamento'), {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(simulationResults),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Falha ao salvar o orçamento.');

      setIsSaved(true);
      setSaveMessage('Orçamento salvo com sucesso!');
    } catch (err) {
      setSaveMessage(err.message);
    }
  };

  return (
    <div className="dash-container">
      <header className="dash-header">
        <div className="container dash-header-content">
          <Link to="/">
            <img src="/assets/logo.png" alt="Logo" className="logo-img" style={{ height: '40px' }} />
          </Link>
          <div className="dash-user-actions">
            <div className="user-avatar">{user ? user.nome.charAt(0).toUpperCase() : '?'}</div>
            <button onClick={handleLogout} className="btn btn-outline btn-sm">Sair</button>
          </div>
        </div>
      </header>

      <main className="container dash-main">
        <div className="dash-grid">
          {/* Coluna do Formulário */}
          <div className="dash-card">
            <div className="card-header">
              <h2>Simule sua Economia</h2>
              <p>Preencha os dados abaixo para obter uma estimativa do seu sistema de energia solar.</p>
            </div>
            <SimulationForm onResults={handleSetResults} />
          </div>

          {/* Coluna dos Resultados */}
          <div className="dash-card results-card fade-in">
            {simulationResults ? (
              <div>
                <h3>Sua Estimativa Personalizada</h3>
                <div className="metrics-grid">
                  <div className="metric-box highlight">
                    <span className="metric-title">Valor do Projeto</span>
                    <div className="metric-value">
                      R$ {simulationResults.financeiro.preco_final_cliente_rs.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div className="metric-box">
                    <span className="metric-title">Potência Instalada</span>
                    <div className="metric-value">{simulationResults.dimensionamento.potencia_real_instalada_kwp} <span>kWp</span></div>
                  </div>
                  <div className="metric-box">
                    <span className="metric-title">Nº de Painéis</span>
                    <div className="metric-value">{simulationResults.dimensionamento.numero_paineis_necessarios}</div>
                  </div>
                </div>
                <div className="chat-teaser">
                  <h4>O que fazer agora?</h4>
                  <p>Salve seu orçamento para que nossos consultores possam analisá-lo ou entre em contato agora mesmo.</p>
                  <div className="results-actions" style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                    <button
                      onClick={handleSaveOrcamento}
                      className="btn btn-outline"
                      disabled={isSaved}
                    >
                      {isSaved ? 'Orçamento Salvo!' : 'Salvar Orçamento'}
                    </button>
                    <a
                      href="https://api.whatsapp.com/send/?phone=559985127056&text&type=phone_number&app_absent=0&utm_source=ig"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-primary"
                    >
                      Falar com Consultor
                    </a>
                  </div>
                  {saveMessage && <p className="save-message" style={{ marginTop: '1rem', fontSize: '0.9rem', color: 'var(--cor-texto-mutado)' }}>{saveMessage}</p>}
                </div>
                <button onClick={handleNewSimulation} className="btn-voltar" style={{ marginTop: '1.5rem' }}>Fazer nova simulação</button>
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">☀️</div>
                <h3>Aguardando sua simulação</h3>
                <p>Os resultados da sua economia aparecerão aqui assim que você preencher o formulário ao lado.</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default Dashboard;
