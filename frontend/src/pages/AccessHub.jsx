import { Link } from 'react-router-dom';
import './AccessHub.css';

const AccessHub = () => (
  <main className="access-hub">
    <section className="access-hero">
      <Link to="/" className="access-logo">
        <img src="/assets/logo.png" alt="DRM Energia Solar" />
      </Link>
      <div className="access-copy">
        <span>Área DRM Energia Solar</span>
        <h1>Escolha como você quer acessar a DRM.</h1>
        <p>Cliente acompanha contrato, entrega, instalação e atendimento. A equipe entra no sistema interno para operar vendas, contratos e projetos.</p>
      </div>
      <div className="access-status">
        <strong>Online</strong>
        <span>Portal e sistema disponíveis</span>
      </div>
    </section>

    <section className="access-options" aria-label="Escolha de acesso">
      <Link to="/portal-cliente" className="access-card access-card-client">
        <div>
          <span className="access-card-kicker">Para clientes DRM</span>
          <h2>Portal do Cliente</h2>
          <p>Acompanhe contrato, financiamento, prazos, instalação, previsão da Equatorial e abra solicitações com fotos.</p>
        </div>
        <ul>
          <li>Contrato e financiamento</li>
          <li>Entrega e instalação</li>
          <li>Reclamações com anexos</li>
        </ul>
        <strong>Acessar meu portal</strong>
      </Link>

      <Link to="/sistema-drm" className="access-card access-card-team">
        <div>
          <span className="access-card-kicker">Uso interno</span>
          <h2>Sistema DRM</h2>
          <p>Ambiente da equipe para gerenciar clientes, leads, orçamentos, contratos, produtos, projetos e financeiro.</p>
        </div>
        <ul>
          <li>CRM e contratos</li>
          <li>Projetos e O.S.</li>
          <li>Produtos e financeiro</li>
        </ul>
        <strong>Entrar no sistema</strong>
      </Link>
    </section>

    <footer className="access-footer">
      <Link to="/">Voltar para o site</Link>
      <Link to="/recuperar-senha">Recuperar senha</Link>
    </footer>
  </main>
);

export default AccessHub;
