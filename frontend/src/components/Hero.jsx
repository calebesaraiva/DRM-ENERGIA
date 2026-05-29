import './Hero.css';

const Hero = ({ onOpenSimulation = () => {} }) => {
  return (
    <section className="hero">
      <div className="hero-bg-image"></div>
      <div className="hero-overlay"></div>
      <div className="hero-aurora"></div>

      <div className="container hero-content">
        <div className="hero-text-box">
          <span className="hero-badge">Energia Inteligente</span>
          <h1 className="hero-title highlight">Transforme a luz do sol em economia real</h1>
          <p className="hero-description">Gere sua própria energia limpa com a DRM. Reduza sua conta de luz em até 82% e valorize seu imóvel com sistemas solares de alta performance.</p>
          <div className="hero-proof">
            <article>
              <strong>+600</strong>
              <span>projetos entregues</span>
            </article>
            <article>
              <strong>4.9/5</strong>
              <span>avaliação média de clientes</span>
            </article>
            <article>
              <strong>até 82%</strong>
              <span>de economia na conta</span>
            </article>
          </div>
          <div className="hero-actions">
            <button type="button" className="btn btn-primary btn-lg btn-simular" onClick={() => onOpenSimulation()}>Simular economia agora</button>
            <a href="#projetos" className="btn btn-outline btn-lg btn-white">Ver Projetos</a>
          </div>
        </div>

        <div className="solar-orbit-scene" aria-hidden="true">
          <div className="core"></div>
          <div className="orbit orbit-1"><span></span></div>
          <div className="orbit orbit-2"><span></span></div>
          <div className="orbit orbit-3"><span></span></div>
          <div className="ring-shadow"></div>
        </div>
      </div>

      <div className="hero-wave">
        <svg data-name="Layer 1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 120" preserveAspectRatio="none">
          <path d="M321.39,56.44c58-10.79,114.16-30.13,172-41.86,82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53,26.09,214.34,3V120H0V95.8C59.71,118.08,130.83,123.63,195,109.51c59.4-13.1,117.8-38.38,176.39-53.07Z" className="shape-fill"></path>
        </svg>
      </div>
    </section>
  );
};

export default Hero;
