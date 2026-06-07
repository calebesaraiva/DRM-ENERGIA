import { useMemo, useState } from 'react';

const dateTimeBr = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

function ClientCommunicationCenter({
  notifications = [],
  contracts = [],
  project,
  requests = [],
  feedback,
  referrals = [],
  onReadNotifications,
  onDownloadContract,
  onSendMessage,
  onSendFeedback,
  onSendReferral,
}) {
  const [message, setMessage] = useState({ assunto: '', mensagem: '' });
  const [messageStatus, setMessageStatus] = useState('');
  const [rating, setRating] = useState(Number(feedback?.rating || 0));
  const [comment, setComment] = useState(feedback?.comment || '');
  const [ratingStatus, setRatingStatus] = useState('');
  const [referral, setReferral] = useState({ nome: '', telefone: '', cidade: '' });
  const [referralStatus, setReferralStatus] = useState('');
  const unread = notifications.filter(item => !item.readAt).length;
  const serviceRequests = useMemo(() => requests.filter(item => item.categoria === 'Mensagem'), [requests]);

  const submitMessage = async (event) => {
    event.preventDefault();
    setMessageStatus('Enviando...');
    try {
      await onSendMessage(message);
      setMessage({ assunto: '', mensagem: '' });
      setMessageStatus('Mensagem recebida pela equipe DRM.');
    } catch (error) {
      setMessageStatus(error.message);
    }
  };

  const submitRating = async (event) => {
    event.preventDefault();
    setRatingStatus('Enviando...');
    try {
      await onSendFeedback({ rating, comment });
      setRatingStatus('Obrigado. Sua avaliação foi registrada.');
    } catch (error) {
      setRatingStatus(error.message);
    }
  };

  const submitReferral = async (event) => {
    event.preventDefault();
    setReferralStatus('Enviando...');
    try {
      await onSendReferral(referral);
      setReferral({ nome: '', telefone: '', cidade: '' });
      setReferralStatus('Indicação enviada. A equipe DRM cuidará do contato.');
    } catch (error) {
      setReferralStatus(error.message);
    }
  };

  return (
    <section className="communication-center">
      <div className="communication-hero">
        <div>
          <span>Central do cliente</span>
          <h2>Tudo que precisa da DRM, em um único lugar.</h2>
          <p>Receba novidades do projeto, fale com a equipe, consulte documentos e acompanhe cada solicitação.</p>
        </div>
        <div className="communication-summary">
          <article><strong>{unread}</strong><span>avisos novos</span></article>
          <article><strong>{contracts.length}</strong><span>documentos</span></article>
          <article><strong>{requests.length}</strong><span>atendimentos</span></article>
        </div>
      </div>

      <div className="communication-grid">
        <section className="portal-card notification-panel">
          <div className="portal-card-head">
            <div><span>Atualizações automáticas</span><h2>Notificações</h2></div>
            {unread > 0 && <button type="button" onClick={onReadNotifications}>Marcar como lidas</button>}
          </div>
          <div className="notification-list">
            {notifications.length ? notifications.map(item => (
              <article className={item.readAt ? '' : 'unread'} key={item.id}>
                <i aria-hidden="true"></i>
                <div><strong>{item.title}</strong><p>{item.message}</p><span>{dateTimeBr(item.createdAt)}</span></div>
              </article>
            )) : <div className="communication-empty">As novidades importantes do seu projeto aparecerão aqui.</div>}
          </div>
        </section>

        <section className="portal-card document-center">
          <div className="portal-card-head"><div><span>Arquivos seguros</span><h2>Central de documentos</h2></div></div>
          <div className="document-list">
            {contracts.map(contract => (
              <article key={contract.id}>
                <div><strong>Contrato DRM #{contract.id}</strong><span>{contract.status === 'Aprovado' ? 'PDF disponível' : 'Aguardando aprovação'}</span></div>
                <button type="button" disabled={contract.status !== 'Aprovado'} onClick={() => onDownloadContract(contract)}>Baixar PDF</button>
              </article>
            ))}
            <article>
              <div><strong>Diário visual da instalação</strong><span>{project?.fotos?.length || 0} foto{project?.fotos?.length === 1 ? '' : 's'} publicada{project?.fotos?.length === 1 ? '' : 's'}</span></div>
              <span className="document-state">{project?.fotos?.length ? 'Atualizado' : 'Aguardando equipe'}</span>
            </article>
          </div>
        </section>

        <form className="portal-card communication-form" onSubmit={submitMessage}>
          <div className="portal-card-head"><div><span>Canal direto</span><h2>Falar com a equipe DRM</h2></div></div>
          <input value={message.assunto} onChange={event => setMessage(prev => ({ ...prev, assunto: event.target.value }))} placeholder="Assunto da mensagem" />
          <textarea required value={message.mensagem} onChange={event => setMessage(prev => ({ ...prev, mensagem: event.target.value }))} placeholder="Escreva sua dúvida ou mensagem para nossa equipe." />
          <button type="submit">Enviar mensagem</button>
          {messageStatus && <small>{messageStatus}</small>}
          {serviceRequests.length > 0 && <p className="communication-form-note">{serviceRequests.length} mensagem{serviceRequests.length === 1 ? '' : 's'} registrada{serviceRequests.length === 1 ? '' : 's'} no atendimento.</p>}
        </form>

        <form className="portal-card communication-form rating-form" onSubmit={submitRating}>
          <div className="portal-card-head"><div><span>Sua experiência</span><h2>Avalie a DRM</h2></div></div>
          <div className="rating-picker" aria-label="Escolha uma nota">
            {[1, 2, 3, 4, 5].map(value => <button type="button" className={value <= rating ? 'active' : ''} onClick={() => setRating(value)} key={value} aria-label={`${value} estrelas`}>★</button>)}
          </div>
          <textarea value={comment} onChange={event => setComment(event.target.value)} placeholder="Conte o que mais gostou ou o que podemos melhorar." />
          <button type="submit" disabled={!rating}>Enviar avaliação</button>
          {ratingStatus && <small>{ratingStatus}</small>}
        </form>

        <form className="portal-card communication-form referral-form" onSubmit={submitReferral}>
          <div className="portal-card-head"><div><span>Energia para quem importa</span><h2>Indique alguém</h2></div></div>
          <p>Conhece alguém que quer economizar na conta de energia? Envie o contato e nossa equipe fará uma apresentação cuidadosa.</p>
          <input required value={referral.nome} onChange={event => setReferral(prev => ({ ...prev, nome: event.target.value }))} placeholder="Nome da pessoa" />
          <input required value={referral.telefone} onChange={event => setReferral(prev => ({ ...prev, telefone: event.target.value }))} placeholder="WhatsApp com DDD" />
          <input value={referral.cidade} onChange={event => setReferral(prev => ({ ...prev, cidade: event.target.value }))} placeholder="Cidade" />
          <button type="submit">Enviar indicação</button>
          {referralStatus && <small>{referralStatus}</small>}
          {referrals.length > 0 && <p className="communication-form-note">{referrals.length} indicação{referrals.length === 1 ? '' : 'ões'} enviada{referrals.length === 1 ? '' : 's'}.</p>}
        </form>
      </div>
    </section>
  );
}

export default ClientCommunicationCenter;
