import { useMemo, useState } from 'react';
import './UpdateNoticeModal.css';

const UPDATE_NOTICE_ID = 'drm-update-fluxo-completo-ci-deploy-2026-08-11';

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
          <h2 id="update-notice-title">Pacote de estabilidade liberado</h2>
        </div>
        <div className="update-notice-body">
          <p>
            Liberamos melhorias para deixar o uso diário mais estável nos cadastros, contratos, equipe técnica, controle de acesso e publicação do site.
          </p>
          <ul>
            <li>Consultores conseguem cadastrar clientes e gerar contratos normalmente.</li>
            <li>Equipe técnica e O.S carregam responsáveis sem depender do acesso administrativo.</li>
            <li>Deivson pode resetar senhas temporárias diretamente no painel de usuários.</li>
            <li>O fluxo completo agora é testado antes de publicar novas correções.</li>
            <li>Deploy automático só roda depois que as validações do GitHub passam.</li>
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
