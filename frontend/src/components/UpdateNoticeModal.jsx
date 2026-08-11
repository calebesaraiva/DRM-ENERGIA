import { useMemo, useState } from 'react';
import './UpdateNoticeModal.css';

const UPDATE_NOTICE_ID = 'drm-update-central-pendencias-scroll-2026-08-11';
const CLIENT_UPDATE_NOTICE_ID = 'drm-update-fluxo-completo-ci-deploy-2026-08-11';

const UpdateNoticeModal = ({ user, audience = 'equipe' }) => {
  const isClientAudience = audience === 'cliente';
  const noticeId = isClientAudience ? CLIENT_UPDATE_NOTICE_ID : UPDATE_NOTICE_ID;
  const storageKey = useMemo(() => {
    const userKey = user?.id || user?.email || user?.username || audience || 'geral';
    return `drm:update-notice:${noticeId}:${userKey}`;
  }, [audience, noticeId, user?.email, user?.id, user?.username]);

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
          <h2 id="update-notice-title">{isClientAudience ? 'Pacote de estabilidade liberado' : 'Central de pendências atualizada'}</h2>
        </div>
        <div className="update-notice-body">
          <p>
            {isClientAudience
              ? 'Liberamos melhorias para deixar o acompanhamento do seu projeto mais estável e seguro.'
              : 'Liberamos uma melhoria no painel administrativo para deixar o controle de colaboradores mais claro e seguro.'}
          </p>
          {isClientAudience ? (
            <ul>
              <li>Portal do cliente com acompanhamento do projeto e documentos.</li>
              <li>Melhorias de estabilidade no acesso e nas notificações.</li>
              <li>Correções gerais nos fluxos internos que impactam atendimento.</li>
            </ul>
          ) : (
            <ul>
              <li>O sino agora mostra apenas uma prévia curta dos avisos.</li>
              <li>Os nomes com pendência abrem uma ficha completa do colaborador.</li>
              <li>A ficha mostra senha temporária, e-mail, WhatsApp, status e funções liberadas.</li>
              <li>Foi adicionada ação para bloquear ou liberar funções até regularizar o perfil.</li>
              <li>Corrigimos o comportamento de scroll com a barra de notificações aberta.</li>
            </ul>
          )}
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
