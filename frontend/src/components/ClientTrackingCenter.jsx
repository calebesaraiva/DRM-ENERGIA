const dateBr = (value, withTime = false) => {
  if (!value) return 'A definir';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'A definir';
  return date.toLocaleString('pt-BR', withTime
    ? { dateStyle: 'short', timeStyle: 'short' }
    : { dateStyle: 'short' });
};

const stageNotes = {
  contrato: 'Documentação comercial aprovada e projeto liberado para execução.',
  equipamento: 'Kit separado, transportado e conferido no endereço da instalação.',
  instalacao: 'Equipe técnica executa a montagem, proteção e testes do sistema.',
  equatorial: 'Distribuidora troca o medidor e libera a geração conectada à rede.',
};

function ClientTrackingCenter({
  contrato,
  projeto,
  progressSteps,
  complaints,
  onDownloadContract,
  lastSync,
}) {
  const completed = progressSteps.filter(step => step.done).length;
  const progress = Math.round((completed / progressSteps.length) * 100);
  const nextStep = progressSteps.find(step => !step.done);
  const photos = projeto?.fotos || [];
  const activities = [
    contrato?.dataCriacao && { date: contrato.dataCriacao, title: 'Contrato criado', text: 'A jornada do seu sistema começou.' },
    contrato?.dataAnalise && { date: contrato.dataAnalise, title: 'Contrato analisado', text: `Status definido como ${contrato.status}.` },
    projeto?.dataInicio && { date: projeto.dataInicio, title: 'Projeto iniciado', text: `Etapa atual: ${projeto.etapa || 'Em andamento'}.` },
    projeto?.equipamentoEntregueAt && { date: projeto.equipamentoEntregueAt, title: 'Equipamento entregue', text: 'Confirmação de recebimento registrada.' },
    projeto?.medidorTrocadoAt && { date: projeto.medidorTrocadoAt, title: 'Medidor trocado', text: 'Etapa da Equatorial confirmada.' },
    ...complaints.map(item => ({
      date: item.dataAtualizacao || item.dataAbertura,
      title: `Atendimento O.S #${item.id}`,
      text: `${item.status} - ${item.observacoes || item.categoria || 'Solicitação'}`,
    })),
  ].filter(Boolean).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8);

  return (
    <section className="tracking-view">
      <div className="tracking-command">
        <div className="tracking-radar" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
          <b style={{ '--progress': `${progress * 3.6}deg` }}>{progress}%</b>
        </div>
        <div className="tracking-command-copy">
          <span>Central de acompanhamento</span>
          <h2>{nextStep ? `Próximo marco: ${nextStep.label}` : 'Seu sistema concluiu todos os marcos principais.'}</h2>
          <p>{nextStep ? stageNotes[nextStep.key] : 'Acompanhe a geração e conte com a DRM para o suporte pós-instalação.'}</p>
          <div className="tracking-live"><i></i> Dados sincronizados às {lastSync.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
        </div>
        <div className="tracking-summary">
          <div><span>Etapa atual</span><strong>{projeto?.etapa || contrato?.status || 'Em análise'}</strong></div>
          <div><span>Responsável DRM</span><strong>{projeto?.responsavelNome || contrato?.assignedUserName || contrato?.criadoPorNome || 'Equipe DRM'}</strong></div>
          <div><span>Última atualização</span><strong>{dateBr(projeto?.updatedAt || contrato?.dataAnalise || contrato?.dataCriacao, true)}</strong></div>
        </div>
      </div>

      <div className="tracking-stage-rail">
        {progressSteps.map((step, index) => (
          <article className={`${step.done ? 'done' : ''} ${nextStep?.key === step.key ? 'current' : ''}`} key={step.key}>
            <div className="stage-orbit"><span>{step.done ? 'OK' : index + 1}</span></div>
            <div>
              <small>{step.done ? 'Concluído' : nextStep?.key === step.key ? 'Em foco agora' : 'Próximo'}</small>
              <strong>{step.label}</strong>
              <p>{step.detail}</p>
            </div>
          </article>
        ))}
      </div>

      <div className="tracking-grid">
        <section className="tracking-panel activity-panel">
          <div className="tracking-panel-head"><span>Movimentações</span><h3>Diário do projeto</h3></div>
          {activities.length ? (
            <div className="activity-stream">
              {activities.map((activity, index) => (
                <article key={`${activity.title}-${activity.date}-${index}`}>
                  <i></i>
                  <div><strong>{activity.title}</strong><p>{activity.text}</p><small>{dateBr(activity.date, true)}</small></div>
                </article>
              ))}
            </div>
          ) : <p className="tracking-empty">As atualizações da equipe aparecerão aqui.</p>}
        </section>

        <section className="tracking-panel details-panel">
          <div className="tracking-panel-head"><span>Projeto</span><h3>Informações operacionais</h3></div>
          <dl>
            <div><dt>Cidade</dt><dd>{projeto?.clienteCidade || contrato?.clienteCidade || 'A definir'}</dd></div>
            <div><dt>Prioridade</dt><dd>{projeto?.prioridade || 'Normal'}</dd></div>
            <div><dt>Início</dt><dd>{dateBr(projeto?.dataInicio || contrato?.dataCriacao)}</dd></div>
            <div><dt>Entrega prevista</dt><dd>{dateBr(projeto?.prazoPrevisto)}</dd></div>
            <div><dt>Instalação</dt><dd>{dateBr(projeto?.instalacaoAgendada, true)}</dd></div>
            <div><dt>Ligação</dt><dd>{dateBr(projeto?.previsaoLigacao)}</dd></div>
          </dl>
          {contrato?.status === 'Aprovado' && <button type="button" onClick={onDownloadContract}>Baixar contrato em PDF</button>}
        </section>
      </div>

      <section className="project-photo-journal">
        <div className="tracking-panel-head">
          <span>Registro visual</span>
          <h3>Diário de fotos da equipe</h3>
          <p>Fotos adicionadas pela DRM durante entrega, instalação e vistoria aparecem automaticamente aqui.</p>
        </div>
        {photos.length ? (
          <div className="project-photo-grid">
            {photos.slice(0, 12).map(photo => (
              <figure key={photo.id}>
                <img src={photo.dataUrl} alt={photo.descricao || photo.categoria || 'Registro do projeto'} />
                <figcaption><strong>{photo.categoria || 'Atualização'}</strong><span>{photo.descricao || dateBr(photo.createdAt, true)}</span></figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <div className="photo-journal-empty">
            <div aria-hidden="true"><span></span><span></span><span></span></div>
            <strong>O álbum do seu projeto está sendo preparado.</strong>
            <p>Quando a equipe registrar novas imagens, elas surgirão nesta área.</p>
          </div>
        )}
      </section>
    </section>
  );
}

export default ClientTrackingCenter;
