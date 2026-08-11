import { useMemo, useState } from 'react';
import './UpdateNoticeModal.css';

const UPDATE_NOTICE_ID = 'drm-update-consultores-2026-08-10';

const UpdateNoticeModal = ({ user, audience = 'equipe' }) => {
  const storageKey = useMemo(() => {
    const userKey = user?.id || user?.email || user?.username || audience || 'geral';
    return `drm:update-notice:${UPDATE_NOTICE_ID}:${userKey}`;
  }, [audience, user?.email, user?.id, user?.username]);

  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(storageKey) !== 'seen';
    } catch {
      return true;
    }
  });

  const closeNotice = () => {
    try {
      localStorage.setItem(storageKey, 'seen');
    } catch {
      // The modal can still close if browser storage is unavailable.
    }
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div className="update-notice-backdrop" role="presentation">
      <section className="update-notice-modal" role="dialog" aria-modal="true" aria-labelledby="update-notice-title">
        <div className="update-notice-header">
          <span>Nota de atualização</span>
          <h2 id="update-notice-title">Correção liberada no sistema DRM</h2>
        </div>
        <div className="update-notice-body">
          <p>
            Corrigimos o fluxo que impedia consultores de cadastrar clientes e gerar contratos quando a lista de responsáveis não carregava no painel.
          </p>
          <ul>
            <li>Cadastro de clientes com consultor responsável funcionando.</li>
            <li>Geração de contrato direto pelo cliente usando o consultor logado como padrão.</li>
            <li>Lista de consultores liberada para quem tem acesso a clientes ou contratos.</li>
          </ul>
          <p className="update-notice-note">
            Quem estiver com senha temporária ainda precisa trocar a senha no primeiro acesso para liberar o painel.
          </p>
        </div>
        <div className="update-notice-actions">
          <button type="button" onClick={closeNotice}>Entendi</button>
        </div>
      </section>
    </div>
  );
};

export default UpdateNoticeModal;
