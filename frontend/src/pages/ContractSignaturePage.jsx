import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { withApiBase } from '../utils/apiBase';
import './ContractSignaturePage.css';

const money = (value) => Number(value || 0).toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const dateBr = (value) => {
  if (!value) return 'Agora';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

function ContractSignaturePage() {
  const { token = '' } = useParams();
  const [contract, setContract] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [signerName, setSignerName] = useState('');
  const [signerBirthDate, setSignerBirthDate] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [hasSignatureStroke, setHasSignatureStroke] = useState(false);
  const [signatureMode, setSignatureMode] = useState('typed');
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [signedResult, setSignedResult] = useState(null);
  const canvasRef = useRef(null);
  const drawingRef = useRef({ isDrawing: false, lastX: 0, lastY: 0 });

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(280, Math.floor(rect.width || 640));
    const height = Math.max(180, Math.floor(rect.height || 240));
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = 2.8;
    ctx.strokeStyle = '#111827';
    setHasSignatureStroke(false);
  }, []);

  const loadContract = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(withApiBase(`/api/assinatura/contrato/${token}`), {
        cache: 'no-store',
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || 'Não foi possível carregar o contrato.');
      setContract(data);
      setSignerName(data?.clienteNome || '');
      setSignerBirthDate(data?.assinatura?.cliente?.birthDate || data?.clienteDataNascimento || '');
      setStatus('');
      setAcceptedTerms(false);
      setSignedResult(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadContract();
  }, [loadContract]);

  useEffect(() => {
    if (!contract || !signatureModalOpen || alreadySignedRef(contract)) return undefined;
    const timer = window.setTimeout(resizeCanvas, 30);
    const handleResize = () => resizeCanvas();
    window.addEventListener('resize', handleResize);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
    };
  }, [contract, resizeCanvas, signatureModalOpen]);

  useEffect(() => {
    if (!signatureModalOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [signatureModalOpen]);

  const getPoint = (event) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const source = event.touches?.[0] || event.changedTouches?.[0] || event;
    return { x: source.clientX - rect.left, y: source.clientY - rect.top };
  };

  const startDrawing = (event) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    event.preventDefault();
    const point = getPoint(event);
    drawingRef.current = { isDrawing: true, lastX: point.x, lastY: point.y };
  };

  const moveDrawing = (event) => {
    if (!drawingRef.current.isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    event.preventDefault();
    const point = getPoint(event);
    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(drawingRef.current.lastX, drawingRef.current.lastY);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    drawingRef.current.lastX = point.x;
    drawingRef.current.lastY = point.y;
    setHasSignatureStroke(true);
  };

  const stopDrawing = () => {
    drawingRef.current.isDrawing = false;
  };

  const clearCanvas = () => {
    resizeCanvas();
  };

  const useTypedSignature = () => {
    const name = signerName.trim();
    if (!name) {
      setStatus('Confira seu nome completo antes de gerar a assinatura.');
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    resizeCanvas();
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(280, Math.floor(rect.width || 640));
    const height = Math.max(180, Math.floor(rect.height || 240));
    const ctx = canvas.getContext('2d');
    const fontSize = Math.max(28, Math.min(54, Math.floor(width / Math.max(name.length * 0.58, 10))));
    ctx.fillStyle = '#111827';
    ctx.font = `italic ${fontSize}px "Segoe Script", "Brush Script MT", cursive`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, width / 2, height / 2, width - 36);
    setHasSignatureStroke(true);
    setStatus('Assinatura pronta. Confirme o aceite e toque em “Assinar contrato”.');
  };

  const changeSignatureMode = (mode) => {
    setSignatureMode(mode);
    setStatus('');
    window.setTimeout(resizeCanvas, 0);
  };

  const submitSignature = async () => {
    if (!signerName.trim()) {
      setStatus('Informe seu nome para concluir a assinatura.');
      return;
    }
    if (!acceptedTerms) {
      setStatus('Confirme o aceite do contrato para concluir a assinatura.');
      return;
    }
    if (!signerBirthDate) {
      setStatus('Informe sua data de nascimento para concluir a assinatura.');
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!hasSignatureStroke) {
      setStatus('Desenhe sua assinatura no quadro antes de enviar.');
      return;
    }
    setStatus('Enviando assinatura...');
    try {
      const response = await fetch(withApiBase(`/api/assinatura/contrato/${token}/cliente`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signerName,
          signerBirthDate,
          acceptedTerms,
          signatureDataUrl: canvas.toDataURL('image/png'),
          signatureMode,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || 'Não foi possível registrar sua assinatura.');
      setStatus(data?.message || 'Assinatura concluída.');
      setSignatureModalOpen(false);
      setSignedResult({
        message: data?.message || 'Assinatura concluída com sucesso.',
        downloadUrl: data?.downloadUrl ? withApiBase(data.downloadUrl) : '',
      });
    } catch (err) {
      setStatus(err.message);
    }
  };

  const openSignatureModal = () => {
    if (alreadySignedRef(contract)) return;
    setStatus('');
    setSignatureModalOpen(true);
  };

  const closeSignatureModal = () => {
    setSignatureModalOpen(false);
  };

  if (loading) {
    return <div className="contract-sign-page loading">Carregando contrato para assinatura...</div>;
  }

  if (error) {
    return (
      <div className="contract-sign-page">
        <div className="contract-sign-shell error">
          <span className="kicker">DRM Energia Solar</span>
          <h1>Não conseguimos abrir este link</h1>
          <p>{error}</p>
          <button type="button" onClick={loadContract}>Tentar novamente</button>
        </div>
      </div>
    );
  }

  const alreadySigned = alreadySignedRef(contract);
  const signatureCompleted = alreadySigned || Boolean(signedResult);
  const evidence = contract?.evidencias || {};
  const securityItems = [
    contract?.clienteTelefone ? `Link enviado para ${contract.clienteTelefone}` : 'Link individual com token único',
    evidence?.documentHash ? 'Hash SHA-256 vinculado ao contrato' : 'Documento vinculado ao link',
    'Registro de data, IP e navegador',
    'PDF final com comprovante da assinatura',
  ];

  const signaturePanel = (
    <div className="signature-card signature-modal-card">
      <div className="card-head">
        <div>
          <span>Assinatura do cliente</span>
          <h2>{signatureCompleted ? 'Assinatura registrada' : 'Área de assinatura'}</h2>
          {!signatureCompleted && (
            <p className="signature-intro">
              Confirme seus dados e assine em uma tela limpa, pensada para funcionar muito bem no celular.
            </p>
          )}
        </div>
      </div>

      <label>
        Nome completo
        <input
          value={signerName}
          onChange={(event) => setSignerName(event.target.value)}
          placeholder="Digite seu nome completo"
          disabled={signatureCompleted}
        />
      </label>

      <div className="signature-identity-grid">
        <label>
          CPF/CNPJ
          <input value={contract?.clienteCpfCnpj || 'Não informado'} disabled />
        </label>
        <label>
          Data de nascimento
          <input
            type="date"
            value={signerBirthDate}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(event) => setSignerBirthDate(event.target.value)}
            disabled={signatureCompleted}
            required
          />
        </label>
      </div>

      <div className="signature-meta-grid">
        <div className="signature-meta-card">
          <span>Contrato</span>
          <strong>{contract?.numero}</strong>
        </div>
        <div className="signature-meta-card">
          <span>Método</span>
          <strong>{signatureMode === 'typed' ? 'Nome confirmado + evidências' : 'Desenho + evidências'}</strong>
        </div>
      </div>

      {!signatureCompleted && (
        <div className="signature-mode-picker" role="group" aria-label="Forma de assinatura">
          <button
            type="button"
            className={signatureMode === 'typed' ? 'active' : ''}
            onClick={() => changeSignatureMode('typed')}
          >
            <strong>Assinar com meu nome</strong>
            <span>Mais fácil, basta confirmar</span>
          </button>
          <button
            type="button"
            className={signatureMode === 'drawn' ? 'active' : ''}
            onClick={() => changeSignatureMode('drawn')}
          >
            <strong>Desenhar assinatura</strong>
            <span>Use o dedo ou o mouse</span>
          </button>
        </div>
      )}

      <div className="signature-pad">
        <div className="signature-pad-head">
          <strong>{signatureMode === 'typed' ? 'Confirme sua assinatura' : 'Desenhe sua assinatura'}</strong>
          {!signatureCompleted && <button type="button" onClick={clearCanvas}>Limpar</button>}
        </div>
        {signatureCompleted ? (
          <div className="signature-finished">
            {contract?.assinatura?.cliente?.dataUrl && <img src={contract?.assinatura?.cliente?.dataUrl} alt="Assinatura do cliente" />}
            <small>{signedResult ? 'Assinatura concluída nesta sessão.' : `Assinado em ${dateBr(contract?.assinatura?.cliente?.signedAt)}`}</small>
          </div>
        ) : (
          <>
            <canvas
              ref={canvasRef}
              className="signature-canvas"
              onMouseDown={startDrawing}
              onMouseMove={moveDrawing}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={moveDrawing}
              onTouchEnd={stopDrawing}
            />
            <div className="signature-pad-foot">
              {signatureMode === 'typed' ? (
                <>
                  <span>Não precisa escrever na tela.</span>
                  <button type="button" className="make-typed-signature" onClick={useTypedSignature}>
                    Usar meu nome como assinatura
                  </button>
                </>
              ) : (
                <>
                  <span>Use o dedo no celular ou o mouse no computador.</span>
                  <span>Evite abreviar demais a assinatura.</span>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {!signatureCompleted && (
        <label className="signature-consent">
          <input
            type="checkbox"
            checked={acceptedTerms}
            onChange={(event) => setAcceptedTerms(event.target.checked)}
          />
          <span>
            Confirmo que li o contrato, concordo com seu conteúdo e autorizo o
            registro desta assinatura eletrônica com trilha de evidências.
          </span>
        </label>
      )}

      <div className="signature-legal-box">
        <strong>Segurança desta assinatura</strong>
        <p>
          Este fluxo registra nome informado, data e hora, IP, navegador e hash do
          contrato. Para o nível mais forte de validade técnica e verificabilidade,
          a evolução recomendada é integrar assinatura avançada `gov.br` ou
          certificado ICP-Brasil.
        </p>
      </div>

      {status && <p className="signature-feedback">{status}</p>}

      {!signatureCompleted && (
        <button type="button" className="submit-signature" onClick={submitSignature}>
          Assinar contrato
        </button>
      )}
    </div>
  );

  return (
    <div className="contract-sign-page">
      <div className="contract-sign-shell">
        <header className="contract-sign-header">
          <div>
            <span className="kicker">Assinatura digital</span>
            <h1>{contract?.numero}</h1>
            <p>{contract?.clienteNome}</p>
          </div>
          <Link to="/" className="back-home">Voltar ao site</Link>
        </header>

        <section className="contract-sign-hero">
          <div className="hero-card hero-card-primary">
            <span className="signature-status">{contract?.assinaturaStatus}</span>
            <strong>{money(contract?.valorProjeto)}</strong>
            <small>{contract?.resumo?.potenciaKwp || '--'} kWp • {contract?.resumo?.geracaoKwh || '--'} kWh/mês</small>
            <div className="hero-badges">
              <span>{contract?.clienteCidade || 'Imperatriz'}</span>
              <span>{contract?.resumo?.formaPagamento || 'Pagamento não informado'}</span>
            </div>
          </div>
          <div className="hero-card">
            <span>Validade e evidências</span>
            <strong>Link válido até {dateBr(contract?.expiresAt)}</strong>
            <small>
              Assinatura desenhada na tela com trilha de evidências do signatário e
              vínculo ao documento assinado.
            </small>
          </div>
        </section>

        <section className="trust-strip">
          {securityItems.map((item) => (
            <div key={item} className="trust-chip">{item}</div>
          ))}
        </section>

        {signedResult && (
          <section className="signature-success-banner">
            <strong>Assinatura concluída</strong>
            <p>{signedResult.message}</p>
            {signedResult.downloadUrl && (
              <a href={signedResult.downloadUrl} target="_blank" rel="noopener noreferrer" className="open-signature-button">
                Baixar contrato assinado
              </a>
            )}
          </section>
        )}

        <section className="contract-sign-grid">
          <div className="contract-preview-card">
            <div className="card-head">
              <div>
                <span>Prévia do documento</span>
                <h2>Revise antes de assinar</h2>
              </div>
              <div className="preview-actions">
                {!signatureCompleted && (
                  <button type="button" className="open-signature-button" onClick={openSignatureModal}>
                    Assinar agora
                  </button>
                )}
                <a href={withApiBase(contract?.downloadUrl || '')} target="_blank" rel="noopener noreferrer">Baixar PDF</a>
              </div>
            </div>
            <iframe title="Prévia do contrato" src={withApiBase(contract?.previewUrl || '')} />
          </div>

          <div className="signature-entry-card">
            <span>Assinatura do cliente</span>
            <strong>{signatureCompleted ? 'Assinatura registrada com sucesso' : 'Abrir área de assinatura'}</strong>
            <p>
              {signatureCompleted
                ? `Assinado em ${dateBr(contract?.assinatura?.cliente?.signedAt)}`
                : 'Toque para abrir uma área focada só na assinatura, ideal para mobile.'}
            </p>
            {!signatureCompleted ? (
              <button type="button" className="open-signature-button" onClick={openSignatureModal}>
                Abrir assinatura
              </button>
            ) : (
              <div className="signature-locked-state">
                <strong>Assinatura finalizada</strong>
                <span>O contrato já foi concluído e esta etapa não fica mais disponível para edição.</span>
              </div>
            )}
          </div>
        </section>
      </div>
      {!signatureCompleted && signatureModalOpen && (
        <div className="signature-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="signature-modal-title">
          <div className="signature-modal-frame">
            <div className="signature-modal-header">
              <div>
                <span>Assinatura digital</span>
                <h2 id="signature-modal-title">{alreadySigned ? 'Assinatura registrada' : 'Assine o contrato'}</h2>
                <p>{contract?.numero} • {contract?.clienteNome}</p>
              </div>
              <button type="button" className="signature-modal-close" onClick={closeSignatureModal} aria-label="Fechar assinatura">
                ×
              </button>
            </div>
            <div className="signature-modal-body">
              {signaturePanel}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function alreadySignedRef(contract) {
  return Boolean(contract?.assinatura?.cliente?.signedAt);
}

export default ContractSignaturePage;
