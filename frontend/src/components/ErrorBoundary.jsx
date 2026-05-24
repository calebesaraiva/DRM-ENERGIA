import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Erro capturado pelo ErrorBoundary:", error, errorInfo);
    
    // Auto-reload on chunk load error (common on SPAs after deploy or dev server restart)
    const isChunkLoadError = error?.message?.includes('Failed to fetch dynamically imported module') || 
                             error?.message?.includes('Importing a module script failed') ||
                             error?.name === 'ChunkLoadError';
                             
    if (isChunkLoadError) {
      const hasReloaded = sessionStorage.getItem('chunk_load_reloaded');
      if (!hasReloaded) {
        sessionStorage.setItem('chunk_load_reloaded', 'true');
        window.location.reload();
      }
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', textAlign: 'center', minHeight: '60vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
          <h2>Algo deu errado.</h2>
          <p>Houve um erro que impediu esta página de carregar.</p>
          <p style={{ color: 'red', margin: '1rem 0', fontSize: '0.9rem', maxWidth: '80%', wordBreak: 'break-word' }}>
            Detalhe: {this.state.error?.message || 'Erro desconhecido'}
          </p>
          <button 
            onClick={() => window.location.reload()} 
            style={{ padding: '0.8rem 1.5rem', backgroundColor: '#FFC700', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            Tentar Novamente
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;