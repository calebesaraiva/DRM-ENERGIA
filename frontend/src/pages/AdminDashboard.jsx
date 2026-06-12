import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import io from 'socket.io-client'; // v2
import './AdminDashboard.css';
import { getApiBaseUrl, withApiBase } from '../utils/apiBase';
import AdminCommunicationCenter from '../components/AdminCommunicationCenter';
import PricingWorkbench from '../components/PricingWorkbench';
import CurrencyInput from '../components/CurrencyInput';
import { currencyInputToNumber } from '../utils/currency';

const socket = io(getApiBaseUrl() || undefined);

const permissionLabels = {
  dashboard: 'Painel geral',
  clientes: 'Clientes',
  leads: 'Leads',
  orcamentos: 'Orçamentos',
  contratos: 'Contratos',
  ordensServico: 'O.S',
  precosSistemas: 'Preço dos Sistemas',
  financeiro: 'Financeiro',
  equipeTecnica: 'Equipe técnica',
  usuarios: 'Usuários',
  permissoes: 'Permissões',
  verTodosLeads: 'Ver todos os leads',
  gerenciarClientes: 'Gerenciar clientes',
};

const permissionDescriptions = {
  dashboard: 'Visualiza a operação da empresa',
  clientes: 'Visualiza a base de clientes',
  leads: 'Recebe e acompanha leads',
  orcamentos: 'Visualiza simulações e propostas',
  contratos: 'Gera e acompanha contratos',
  ordensServico: 'Abre e acompanha ordens de serviço',
  precosSistemas: 'Calcula preço final dos sistemas',
  financeiro: 'Acessa números financeiros',
  equipeTecnica: 'Acessa rotinas técnicas',
  usuarios: 'Gerencia logins da equipe',
  permissoes: 'Altera permissões de acesso',
  verTodosLeads: 'Vê leads de toda a equipe',
  gerenciarClientes: 'Cadastra e altera clientes',
};

const roleLabels = {
  ADM: 'Administrador',
  EQUIPE_TECNICA_COMERCIAL: 'Equipe técnica/comercial',
  CONSULTOR: 'Consultor',
};

const siteEventLabels = {
  initial_load:        'Acesso ao site (1ª abertura)',
  route_change:        'Navegação entre páginas',
  simulation_cta:      'Clique em "Simular"',
  whatsapp_cta:        'Clique no botão WhatsApp',
  modal_auto_whatsapp: 'Simulação concluída → WhatsApp aberto',
  modal_success:       'Formulário de simulação preenchido',
  page_view:           'Visualização de página',
  whatsapp_click:      'Clique no WhatsApp',
  simulation_click:    'Iniciou simulação',
  simulation_completed:'Simulação finalizada',
};
const labelSiteEvent = (source) => siteEventLabels[source] || source.replace(/_/g, ' ');

const defaultContractConfig = {
  empresa: { nome: '', cnpj: '', telefone: '', email: '', endereco: '' },
  visual: { logoPosition: 'center', logoWidth: 150, primaryColor: '#F97316' },
  titulo: '',
  corpo: '',
};

const SidebarIcon = ({ name }) => {
  const icons = {
    clientes: (
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 11a4 4 0 1 0-3.2-6.4A5 5 0 0 1 15 9c0 .7-.1 1.4-.4 2H16Zm-8 0a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-3.3 0-6 1.7-6 3.8V19h12v-2.2C14 14.7 11.3 13 8 13Zm8 0c-.6 0-1.1.1-1.7.2 1.1.9 1.7 2.1 1.7 3.6V19h6v-2.2c0-2.1-2.7-3.8-6-3.8Z" /></svg>
    ),
    leads: (
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5.3 7 13 7 13s7-7.7 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5Z" /></svg>
    ),
    orcamentos: (
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h9l5 5v15H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm8 1.5V8h4.5L14 3.5ZM8 12h8v2H8v-2Zm0 4h8v2H8v-2Z" /></svg>
    ),
    contratos: (
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2h8l4 4v16H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm7 1.8V7h3.2L14 3.8ZM8 11h8v1.8H8V11Zm0 3.5h8v1.8H8v-1.8Zm0 3.5h5v1.8H8V18Z" /></svg>
    ),
    produtosPacotes: (
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Zm8 1.7 4.9-2.7L12 3.8 7.1 6.5 12 9.2Zm-6 6.1 5 2.8v-7.2L6 8.1v7.2Zm7 2.8 5-2.8V8.1l-5 2.8v7.2Z" /></svg>
    ),
    financeiro: (
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 15.5V19h-2v-1.5a4.2 4.2 0 0 1-3-1.6l1.4-1.4a2.8 2.8 0 0 0 2.4 1.1c1 0 1.7-.4 1.7-1.1 0-.8-.8-1.1-2.1-1.5-1.6-.5-3-1.2-3-3 0-1.5 1-2.7 2.6-3.1V5h2v1.4a4 4 0 0 1 2.6 1.2l-1.4 1.4a2.5 2.5 0 0 0-1.9-.8c-.9 0-1.5.4-1.5 1 0 .7.7 1 2 1.4 1.7.5 3.2 1.2 3.2 3.1 0 1.8-1.2 3.1-3 3.5Z" /></svg>
    ),
    usuarios: (
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a4 4 0 0 0-4 4v2H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2h-1V6a4 4 0 0 0-4-4Zm-2 6V6a2 2 0 1 1 4 0v2h-4Zm3 8.7V19h-2v-2.3a2 2 0 1 1 2 0Z" /></svg>
    ),
    dashboard: (
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13h6v7H4v-7Zm10-9h6v16h-6V4ZM4 4h6v7H4V4Z" /></svg>
    ),
    projetos: (
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z" /></svg>
    ),
    homologacao: (
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v4H4V4Zm1 6h14v10H5V10Zm3 2v2h8v-2H8Zm0 4v2h5v-2H8Zm9.7-3.2-3 3-1.4-1.4-1.3 1.3 2.7 2.7 4.3-4.3-1.3-1.3Z" /></svg>
    ),
    ordensServico: (
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm2 4h6V5H9v2Zm-.5 4h7v2h-7v-2Zm0 4h5v2h-5v-2Z" /></svg>
    ),
    precosSistemas: (
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 3 6v6c0 5 3.8 8.6 9 10 5.2-1.4 9-5 9-10V6l-9-4Zm1 15h-2v-1.4a4 4 0 0 1-2.6-1.3l1.3-1.4c.6.6 1.3.9 2.2.9.8 0 1.3-.3 1.3-.8 0-.6-.6-.8-1.8-1.2-1.4-.4-2.7-1-2.7-2.6 0-1.3.9-2.3 2.3-2.7V5h2v1.4c.9.2 1.6.6 2.2 1.1L14 9c-.5-.4-1-.6-1.7-.6-.7 0-1.1.3-1.1.7 0 .5.5.7 1.6 1 1.5.5 2.9 1 2.9 2.8 0 1.4-.9 2.4-2.7 2.8V17Z" /></svg>
    ),
    comunicacoes: (
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18v14H3V5Zm2 2v.7l7 4.7 7-4.7V7H5Zm14 10V10l-7 4.5L5 10v7h14Z" /></svg>
    ),
  };

  return icons[name] || icons.leads;
};

const LEADS_PER_PAGE = 8;

const LEAD_STATUS_PRESETS = ['Novo', 'Em atendimento', 'Em negociação', 'Fechando', 'Proposta enviada', 'Convertido', 'Perdido'];
const emptyManualLeadForm = {
  nome: '',
  telefone: '',
  email: '',
  cidade: '',
  origem: 'Manual',
  status: 'Novo',
  assignedUserId: '',
  observacoes: '',
};

const getOrcStatusClass = (status) => {
  switch (String(status || '')) {
    case 'Em atendimento': return 'orc-status-atendimento';
    case 'Proposta enviada': return 'orc-status-proposta';
    case 'Aguardando retorno': return 'orc-status-aguardando';
    case 'Venda concluída': return 'orc-status-venda';
    case 'Cancelado': return 'orc-status-cancelado';
    default: return 'orc-status-aberto';
  }
};

const getLeadStatusClass = (status) => {
  switch (String(status || '')) {
    case 'Novo': return 'lead-status-novo';
    case 'Em atendimento': return 'lead-status-atendimento';
    case 'Em negociação': return 'lead-status-negociacao';
    case 'Fechando': return 'lead-status-fechando';
    case 'Proposta enviada': return 'lead-status-proposta';
    case 'Sem retorno': return 'lead-status-sem-retorno';
    case 'Convertido': return 'lead-status-convertido';
    case 'Perdido': return 'lead-status-perdido';
    default: return 'lead-status-default';
  }
};

const ESTADOS_BR = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO',
  'MA','MT','MS','MG','PA','PB','PR','PE','PI',
  'RJ','RN','RS','RO','RR','SC','SP','SE','TO',
];

const maskCpf = (v) => {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
};

const maskWhatsapp = (v) => {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 7) return `(${d.slice(0,2)}) ${d.slice(2)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
};

const maskCep = (v) => {
  const d = v.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0,5)}-${d.slice(5)}`;
};

const money = (value) => Number(value || 0).toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});
const percent = (value) => `${((Number(value || 0)) * 100).toLocaleString('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})}%`;

const getResponsibleName = (name) => name || 'Aguardando distribuição';
const dateBr = (value) => value ? new Date(value).toLocaleDateString('pt-BR') : 'Sem data';
const contractNumber = (contrato = {}) => (
  `CT-${String(contrato.dataCriacao || '').slice(0, 4) || new Date().getFullYear()}-${String(contrato.id || '').padStart(4, '0')}`
);
const currencyToNumber = currencyInputToNumber;
const whatsappLeadMessage = (lead = {}) => encodeURIComponent(
  `Olá ${lead.nome || ''}! Sou da DRM Energia Solar. Vi sua simulação no nosso site e quero te passar as melhores condições para você economizar na conta de energia. Podemos conversar agora?`
);
const whatsappClientMessage = (cliente = {}) => encodeURIComponent(
  `Olá ${cliente.nome || ''}! Sou da DRM Energia Solar. Quero falar com você sobre sua proposta de energia solar e te ajudar com as próximas etapas.`
);

const emptyContractManual = {
  geracaoKwh: '',
  geracaoAnualKwh: '',
  potenciaKwp: '',
  numeroPaineis: '',
  painel: '',
  inversor: '',
  quantidadeCabo: '',
  valorSistema: '',
  valorEntrada: '',
  valorSaldo: '',
  prazoExecucao: '40',
  formaPagamentoTipo: 'avista',
  formaPagamento: '',
};

const contractToReviewForm = (contrato = {}) => ({
  clienteNome: contrato.clienteNome || '',
  clienteTelefone: contrato.clienteTelefone || '',
  clienteEmail: contrato.clienteEmail || '',
  clienteCidade: contrato.clienteCidade || '',
  valorProjeto: contrato.valorProjeto ?? contrato.dados?.manual?.valorSistema ?? '',
  valorEntrada: contrato.dados?.manual?.valorEntrada ?? contrato.equipamentoDados?.valorEntrada ?? '',
  valorSaldo: contrato.dados?.manual?.valorSaldo ?? contrato.equipamentoDados?.valorSaldo ?? '',
  potenciaKwp: contrato.dados?.manual?.potenciaKwp ?? contrato.equipamentoDados?.potenciaKwp ?? contrato.dados?.dimensionamento?.potencia_real_instalada_kwp ?? '',
  geracaoKwh: contrato.dados?.manual?.geracaoKwh ?? contrato.equipamentoDados?.geracaoKwh ?? contrato.dados?.dimensionamento?.geracao_estimada_kwh ?? '',
  geracaoAnualKwh: contrato.dados?.manual?.geracaoAnualKwh ?? contrato.equipamentoDados?.geracaoAnualKwh ?? contrato.dados?.dimensionamento?.geracao_anual_kwh ?? contrato.dados?.dimensionamento?.geracao_anual_estimada_kwh ?? '',
  numeroPaineis: contrato.dados?.manual?.numeroPaineis ?? contrato.equipamentoDados?.numeroPaineis ?? contrato.dados?.dimensionamento?.numero_paineis_necessarios ?? '',
  placaModelo: contrato.equipamentoDados?.placaModelo || contrato.dados?.manual?.painel || '',
  inversorModelo: contrato.equipamentoDados?.inversorModelo || contrato.dados?.manual?.inversor || '',
  quantidadeCabo: contrato.dados?.manual?.quantidadeCabo || contrato.equipamentoDados?.quantidadeCabo || '',
  prazoExecucao: contrato.dados?.manual?.prazoExecucao ?? contrato.equipamentoDados?.prazoExecucao ?? '',
  formaPagamentoTipo: contrato.dados?.manual?.formaPagamentoTipo || contrato.equipamentoDados?.formaPagamentoTipo || '',
  formaPagamento: contrato.dados?.manual?.formaPagamento || contrato.equipamentoDados?.formaPagamento || '',
});

const emptyEquipamentoForm = {
  nome: '',
  tipo: 'Kit solar',
  placaModelo: '',
  inversorModelo: '',
  potenciaPlacaW: '',
  potenciaInversorKw: '',
  geracaoKwh: '',
  geracaoAnualKwh: '',
  potenciaKwp: '',
  numeroPaineis: '',
  quantidadeCabo: '',
  valorSistema: '',
  valorEntrada: '',
  valorSaldo: '',
  prazoExecucao: '40',
  formaPagamentoTipo: 'avista',
  formaPagamento: '',
  observacoes: '',
  active: true,
};

const equipamentoTypeOptions = ['Kit solar', 'Pacote completo', 'Serviço', 'Material'];
const pagamentoTypeOptions = [
  { value: 'avista', label: 'À vista' },
  { value: 'financiado', label: 'Financiado' },
  { value: 'cartao', label: 'Cartão' },
  { value: 'misto', label: 'Misto' },
];

const equipamentoToForm = (item = {}) => ({
  ...emptyEquipamentoForm,
  ...Object.fromEntries(Object.keys(emptyEquipamentoForm).map(key => [key, item[key] ?? emptyEquipamentoForm[key]])),
  tipo: item.tipo || emptyEquipamentoForm.tipo,
  formaPagamentoTipo: item.formaPagamentoTipo || emptyEquipamentoForm.formaPagamentoTipo,
});

const firstFilled = (...values) => (
  values.find(value => value !== '' && typeof value !== 'undefined' && value !== null) ?? ''
);

const applyEquipamentoToManual = (manual = {}, equipamento = {}) => ({
  ...manual,
  geracaoKwh: firstFilled(manual.geracaoKwh, equipamento?.geracaoKwh),
  geracaoAnualKwh: firstFilled(manual.geracaoAnualKwh, equipamento?.geracaoAnualKwh),
  potenciaKwp: firstFilled(manual.potenciaKwp, equipamento?.potenciaKwp),
  numeroPaineis: firstFilled(manual.numeroPaineis, equipamento?.numeroPaineis),
  quantidadeCabo: firstFilled(manual.quantidadeCabo, equipamento?.quantidadeCabo),
  painel: firstFilled(manual.painel, equipamento?.placaModelo),
  inversor: firstFilled(manual.inversor, equipamento?.inversorModelo),
  valorSistema: firstFilled(manual.valorSistema, equipamento?.valorSistema),
  valorEntrada: firstFilled(manual.valorEntrada, equipamento?.valorEntrada),
  valorSaldo: firstFilled(manual.valorSaldo, equipamento?.valorSaldo),
  prazoExecucao: firstFilled(manual.prazoExecucao, equipamento?.prazoExecucao),
  formaPagamentoTipo: firstFilled(manual.formaPagamentoTipo, equipamento?.formaPagamentoTipo, 'avista'),
  formaPagamento: firstFilled(manual.formaPagamento, equipamento?.formaPagamento),
});

const emptyClientForm = {
  tipoPessoa: 'Pessoa física',
  nome: '',
  cpfCnpj: '',
  rgIe: '',
  whatsapp: '',
  email: '',
  endereco: '',
  numero: '',
  bairro: '',
  cep: '',
  cidade: '',
  estado: '',
  complemento: '',
  unidadeConsumidora: '',
  distribuidora: '',
  enderecoInstalacao: '',
  numeroInstalacao: '',
  bairroInstalacao: '',
  cepInstalacao: '',
  cidadeInstalacao: '',
  estadoInstalacao: '',
  observacoes: '',
};

const projectStages = [
  'Novo projeto',
  'Análise inicial',
  'Erro documentação',
  'Corrigir documentação',
  'Gerar ART',
  'Aguardar TRT',
  'Elaborar projeto',
  'Projeto para envio',
  'Projeto enviado',
  'Pendência da concessionária',
  'Corrigir projeto',
  'Reenviar projeto',
  'Aguardando parecer de acesso',
  'Parecer emitido',
  'Com obra',
  'Sem obra',
  'Aguardando finalização da obra',
  'Solicitar vistoria',
  'Aguardando protocolo de vistoria',
  'Vistoria em prazo',
  'Vistoria atrasada',
  'Vistoria reprovada',
  'Vistoria concluída',
  'Projeto concluído',
];
const projectOperationColumns = [
  {
    id: 'homologacao',
    label: 'Em homologação',
    matches: (projeto) => !projeto.checklist?.instalacao && !['Solicitar vistoria', 'Aguardando protocolo de vistoria', 'Vistoria em prazo', 'Vistoria atrasada', 'Vistoria reprovada', 'Vistoria concluída', 'Projeto concluído'].includes(projeto.etapa),
  },
  {
    id: 'vistoria',
    label: 'Vistoria',
    matches: (projeto) => !projeto.checklist?.instalacao && ['Solicitar vistoria', 'Aguardando protocolo de vistoria', 'Vistoria em prazo', 'Vistoria atrasada', 'Vistoria reprovada', 'Vistoria concluída'].includes(projeto.etapa),
  },
  {
    id: 'instalacao',
    label: 'Instalação',
    matches: (projeto) => projeto.etapa !== 'Projeto concluído' && Boolean(projeto.instalacaoAgendada || projeto.checklist?.instalacao),
  },
  {
    id: 'concluido',
    label: 'Concluídos',
    matches: (projeto) => projeto.etapa === 'Projeto concluído',
  },
];
const projectChecklistLabels = {
  documentacaoRecebida: 'Documentação recebida',
  documentacaoCorrigida: 'Documentação corrigida',
  vistoriaRealizada: 'Vistoria realizada',
  artGerada: 'ART gerada',
  trtPaga: 'TRT paga',
  projetoTecnico: 'Projeto técnico',
  projetoParaEnvio: 'Projeto pronto para envio',
  projetoEnviado: 'Projeto enviado',
  pendenciaConcessionaria: 'Pendência da concessionária',
  projetoCorrigido: 'Projeto corrigido',
  projetoReenviado: 'Projeto reenviado',
  parecerAcesso: 'Parecer de acesso emitido',
  obraConcessionaria: 'Obra da concessionária',
  vistoriaSolicitada: 'Vistoria solicitada',
  protocoloVistoria: 'Protocolo de vistoria recebido',
  vistoriaReprovada: 'Vistoria reprovada',
  homologacao: 'Homologação',
  instalacao: 'Instalação',
  vistoriaFinal: 'Vistoria final',
  medidorTrocado: 'Medidor trocado pela Equatorial',
  sistemaLigado: 'Sistema ligado',
};

const streetChecklistKeys = ['vistoriaRealizada', 'instalacao', 'vistoriaFinal', 'vistoriaSolicitada', 'protocoloVistoria', 'vistoriaReprovada', 'medidorTrocado', 'sistemaLigado'];
const officeChecklistKeys = ['documentacaoRecebida', 'documentacaoCorrigida', 'artGerada', 'trtPaga', 'projetoTecnico', 'projetoParaEnvio', 'projetoEnviado', 'pendenciaConcessionaria', 'projetoCorrigido', 'projetoReenviado', 'parecerAcesso', 'obraConcessionaria', 'homologacao'];
const emptyPendenciaForm = {
  tipo: 'Pendência da concessionária',
  descricao: '',
  origem: 'Concessionária',
  prazo: '',
  responsavel: '',
  observacoes: '',
};
const emptyEnvioHomologacaoForm = {
  protocolo: '',
  tipo: 'Envio inicial',
  status: 'Enviado',
  resposta: '',
};
const emptyPriceForm = {
  valorKitSolar: '',
  custoInstalacao: '',
  materialCA: '',
  deslocamento: '',
  custoAdicional: '',
  margemEmpresa: '',
  comissaoPercentual: '',
};

const emptyBudgetForm = {
  clienteId: '',
  equipamentoId: '',
  potenciaPlacaW: '600',
  placaModelo: '',
  numeroPaineis: '',
  potenciaInversorKw: '',
  inversorModelo: '',
  quantidadeInversores: '1',
  quantidadeCaboCc: '',
  areaPorPainelM2: '2.6',
  generationMode: 'manual',
  irradiacaoSolar: '',
  perdaPercentual: '20',
  geracaoKwh: '',
  valorSistema: '',
  valorEntrada: '',
  valorSaldo: '',
  formaPagamentoTipo: 'avista',
  condicoesPagamento: '',
  observacoes: '',
};

const budgetDraftStorageKey = 'drmAdminBudgetDraft';
const budgetDraftOpenStorageKey = 'drmAdminBudgetDraftOpen';
const getInitialBudgetForm = () => {
  try {
    return JSON.parse(localStorage.getItem(budgetDraftStorageKey) || 'null') || emptyBudgetForm;
  } catch {
    return emptyBudgetForm;
  }
};

const emptyUserForm = {
  nome: '',
  username: '',
  email: '',
  whatsapp: '',
  role: 'CONSULTOR',
  temporaryPassword: '',
};

const getInitialAdminUser = () => {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null') || { nome: 'DRM', email: '' };
  } catch {
    return { nome: 'DRM', email: '' };
  }
};

const resolveInitialTab = (user, pathname = '') => {
  if (pathname === '/admin/leads') return 'leads';
  if (!user) return 'leads';
  const firstTab = ['dashboard', 'leads', 'orcamentos', 'contratos', 'equipeTecnica', 'ordensServico', 'precosSistemas', 'clientes', 'financeiro', 'usuarios']
    .find(permission => user.role === 'ADM' || user.permissions?.[permission]);
  return firstTab === 'equipeTecnica' ? 'projetos' : firstTab || 'leads';
};

const AdminDashboard = () => {
  const initialUser = getInitialAdminUser();
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(() => resolveInitialTab(initialUser, location.pathname));
  const [clientes, setClientes] = useState([]);
  const [clientSearch, setClientSearch] = useState('');
  const [leads, setLeads] = useState([]);
  const [leadSearch, setLeadSearch] = useState('');
  const [leadOwnerFilter, setLeadOwnerFilter] = useState('todos');
  const [leadStatusFilter, setLeadStatusFilter] = useState('todos');
  const [leadSourceFilter, setLeadSourceFilter] = useState('todos');
  const [showManualLeadForm, setShowManualLeadForm] = useState(false);
  const [manualLeadForm, setManualLeadForm] = useState(emptyManualLeadForm);
  const [orcamentoSearch, setOrcamentoSearch] = useState('');
  const [orcClientSearch, setOrcClientSearch] = useState('');
  const [orcClientPage, setOrcClientPage] = useState(1);
  const [selectedOrcClient, setSelectedOrcClient] = useState(null);
  const [contratoStatusFilter, setContratoStatusFilter] = useState('todos');
  const [contratoSearch, setContratoSearch] = useState('');
  const [contratoDateFrom, setContratoDateFrom] = useState('');
  const [contratoDateTo, setContratoDateTo] = useState('');
  const [contratoPage, setContratoPage] = useState(1);
  const [osStatusFilter, setOsStatusFilter] = useState('todos');
  const [userSearch, setUserSearch] = useState('');
  const [newUserForm, setNewUserForm] = useState(emptyUserForm);
  const [usuarios, setUsuarios] = useState([]);
  const [financeiro, setFinanceiro] = useState(null);
  const [resumo, setResumo] = useState(null);
  const [projetos, setProjetos] = useState([]);
  const [projectPhotos, setProjectPhotos] = useState({});
  const [projectSearch, setProjectSearch] = useState('');
  const [selectedProjeto, setSelectedProjeto] = useState(null);
  const [pendenciaForm, setPendenciaForm] = useState(emptyPendenciaForm);
  const [envioHomologacaoForm, setEnvioHomologacaoForm] = useState(emptyEnvioHomologacaoForm);
  const [atividades, setAtividades] = useState([]);
  const [novoCliente, setNovoCliente] = useState(emptyClientForm);
  const [clientView, setClientView] = useState('list');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [orcamentos, setOrcamentos] = useState([]);
  const [selectedOrcamento, setSelectedOrcamento] = useState(null);
  const [budgetForm, setBudgetForm] = useState(getInitialBudgetForm);
  const [isBudgetFormOpen, setIsBudgetFormOpen] = useState(() => localStorage.getItem(budgetDraftOpenStorageKey) === '1');
  const [budgetStatus, setBudgetStatus] = useState('');
  const [contratos, setContratos] = useState([]);
  const [procuracoes, setProcuracoes] = useState([]);
  const [homologacaoModal, setHomologacaoModal] = useState(null);
  const [homologacaoForm, setHomologacaoForm] = useState({
    titularMesmoContrato: true,
    nome: '',
    cpfCnpj: '',
    endereco: '',
  });
  const [homologacaoLoading, setHomologacaoLoading] = useState(false);
  const [ordensServico, setOrdensServico] = useState([]);
  const [selectedContrato, setSelectedContrato] = useState(null);
  const [contractReviewForm, setContractReviewForm] = useState(contractToReviewForm());
  const [reviewNote, setReviewNote] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [equipamentos, setEquipamentos] = useState([]);
  const [equipamentoForm, setEquipamentoForm] = useState(emptyEquipamentoForm);
  const [editingEquipamentoId, setEditingEquipamentoId] = useState(null);
  const [produtoSearch, setProdutoSearch] = useState('');
  const equipamentoNomeRef = useRef(null);
  const [selectedEquipamentos, setSelectedEquipamentos] = useState({});
  const [contractModal, setContractModal] = useState({ open: false, orcamento: null, manual: emptyContractManual, equipamentoId: '' });
  const [contractConfig, setContractConfig] = useState(defaultContractConfig);
  const [despesaForm, setDespesaForm] = useState({ nome: '', valor: '', categoria: '' });
  const [activityForm, setActivityForm] = useState({ leadId: '', tipo: 'Ligação', origem: 'Ligação', descricao: '', resultado: '', proximoRetorno: '' });
  const [leadsPage, setLeadsPage] = useState(1);
  const [osForm, setOsForm] = useState({ clienteNome: '', clienteTelefone: '', contratoId: '', origem: 'WhatsApp', problema: '', categoria: 'Suporte', prioridade: 'Normal', responsavelId: '', observacoes: '' });
  const [priceForm, setPriceForm] = useState(emptyPriceForm);
  const [priceResult, setPriceResult] = useState(null);
  const [priceError, setPriceError] = useState('');
  const [quickModal, setQuickModal] = useState(null);
  const [adminUser] = useState(initialUser);
  const [error, setError] = useState('');
  const [comunicacoes, setComunicacoes] = useState(null);
  const [tabelasPrecos, setTabelasPrecos] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [clientEtapaFilter, setClientEtapaFilter] = useState('todos');
  const [suspensaoModal, setSuspensaoModal] = useState(null);
  const [suspensaoForm, setSuspensaoForm] = useState({ motivo: '', dataPrevisaoRetorno: '', ultimoContato: '', proximaAcao: '' });
  const [homoView, setHomoView] = useState('fila');
  const [homoDetalheTab, setHomoDetalheTab] = useState('cliente');
  const [homoStatusFilter, setHomoStatusFilter] = useState('todos');
  const [homoDocUpload, setHomoDocUpload] = useState({ tipo: 'cliente', nome: '', descricao: '', arquivo: null });
  const [homoDocUploadLoading, setHomoDocUploadLoading] = useState(false);

  const headers = useMemo(() => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('token')}`,
  }), []);

  const hasPermission = useCallback((permission) => (
    adminUser.role === 'ADM' || adminUser.permissions?.[permission]
  ), [adminUser.permissions, adminUser.role]);

  const isMasterAdmin = adminUser.role === 'ADM' && String(adminUser.username || '').toLowerCase() === 'deivson';

  const showToast = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random();
    const icons = { success: '✓', error: '✕', warning: '!', info: 'i' };
    setToasts(prev => [...prev, { id, message, type, icon: icons[type] || 'i' }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4800);
  }, []);

  const navigationGroups = [
    {
      title: 'Início',
      tabs: [
        { id: 'dashboard', label: 'Painel geral', permission: 'dashboard' },
      ],
    },
    {
      title: 'Comercial',
      tabs: [
        { id: 'clientes', label: 'Clientes', permission: 'clientes' },
        { id: 'leads', label: 'Leads', permission: 'leads' },
        { id: 'orcamentos', label: 'Orçamentos', permission: 'orcamentos' },
        { id: 'contratos', label: 'Contratos', permission: 'contratos' },
        { id: 'procuracoes', label: 'Procurações', permission: 'contratos' },
      ],
    },
    {
      title: 'Operação',
      tabs: [
        { id: 'homologacao', label: 'Homologação', permission: 'equipeTecnica' },
        { id: 'projetos', label: 'Instalações', permission: 'equipeTecnica' },
        { id: 'ordensServico', label: 'O.S e suporte', permission: 'ordensServico' },
      ],
    },
    {
      title: 'Catálogo e preços',
      tabs: [
        { id: 'produtosPacotes', label: 'Produtos e kits', permission: 'contratos' },
        { id: 'precosSistemas', label: 'Preço dos sistemas', permission: 'precosSistemas' },
      ],
    },
    {
      title: 'Gestão',
      tabs: [
        { id: 'financeiro', label: 'Financeiro', permission: 'financeiro' },
        { id: 'comunicacoes', label: 'Comunicações', permission: 'usuarios' },
        { id: 'usuarios', label: 'Acessos', permission: 'usuarios' },
      ],
    },
  ].map(group => ({
    ...group,
    tabs: group.tabs.filter(tab => hasPermission(tab.permission)),
  })).filter(group => group.tabs.length);

  const tabs = navigationGroups.flatMap(group => group.tabs);

  const quickActions = [
    { id: 'qa-novo-orcamento', label: 'Novo orçamento', tab: 'orcamentos', action: 'newBudget', permission: 'orcamentos', badge: clientes.length },
    { id: 'qa-leads', label: 'Cadastrar lead', tab: 'leads', action: 'newLead', permission: 'leads', badge: leads.filter(item => item.status === 'Novo').length },
    { id: 'qa-contratos', label: 'Aprovar contrato', tab: 'contratos', permission: 'contratos', badge: contratos.filter(item => item.status === 'Pendente').length },
    { id: 'qa-homologacao', label: 'Homologação', tab: 'homologacao', permission: 'equipeTecnica', badge: projetos.filter(item => ['Pendência da concessionária', 'Reenviar projeto', 'Aguardando parecer de acesso', 'Vistoria reprovada'].includes(item.etapa)).length },
    { id: 'qa-os', label: 'O.S abertas', tab: 'ordensServico', permission: 'ordensServico', badge: ordensServico.filter(item => item.status === 'Aberta').length },
  ].filter(action => hasPermission(action.permission));

  const leadSummary = useMemo(() => {
    const countsByOwner = leads.reduce((acc, lead) => {
      const name = getResponsibleName(lead.assignedUserName);
      acc[name] = (acc[name] || 0) + 1;
      return acc;
    }, {});

    const statusCounts = leads.reduce((acc, lead) => {
      const status = lead.status || 'Sem status';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});
    const manual = leads.filter(lead => lead.tipoCadastro === 'manual').length;
    const site = leads.length - manual;

    const leadUsers = usuarios
      .filter(user => user.role !== 'ADM' && user.permissions?.leads)
      .map(user => ({
        id: user.id,
        nome: user.nome,
        role: user.role,
        total: countsByOwner[user.nome] || 0,
      }));

    if (leadUsers.length === 0 && leads.length > 0) {
      Object.entries(countsByOwner).forEach(([nome, total]) => {
        leadUsers.push({ id: nome, nome, role: 'Responsável', total });
      });
    }

    return {
      total: leads.length,
      novos: statusCounts.Novo || 0,
      emAtendimento: statusCounts['Em atendimento'] || 0,
      emNegociacao: statusCounts['Em negociação'] || 0,
      fechando: statusCounts.Fechando || 0,
      site,
      manual,
      porResponsavel: leadUsers,
    };
  }, [leads, usuarios]);

  const leadStatusOptions = useMemo(() => {
    const statuses = Array.from(new Set([...LEAD_STATUS_PRESETS, ...leads.map(lead => lead.status || 'Sem status')]));
    return statuses.filter(Boolean);
  }, [leads]);

  const filteredLeads = useMemo(() => {
    const search = leadSearch.trim().toLowerCase();
    const canSeeAllLeads = hasPermission('verTodosLeads');

    return leads.filter(lead => {
      if (canSeeAllLeads && leadOwnerFilter !== 'todos' && String(lead.assignedUserId || lead.assignedUserName || '') !== String(leadOwnerFilter)) {
        return false;
      }

      if (leadStatusFilter !== 'todos' && String(lead.status || 'Sem status') !== leadStatusFilter) {
        return false;
      }

      if (leadSourceFilter !== 'todos') {
        const source = lead.tipoCadastro === 'manual' ? 'manual' : 'site';
        if (source !== leadSourceFilter) return false;
      }

      if (!search) return true;

      return [lead.nome, lead.telefone, lead.email, lead.cidade, lead.assignedUserName, lead.status, lead.origem]
        .some(value => String(value || '').toLowerCase().includes(search));
    });
  }, [leadOwnerFilter, leadSearch, leadStatusFilter, leadSourceFilter, leads, hasPermission]);

  const paginatedLeads = useMemo(() => {
    const start = (leadsPage - 1) * LEADS_PER_PAGE;
    return filteredLeads.slice(start, start + LEADS_PER_PAGE);
  }, [filteredLeads, leadsPage]);

  const leadsTotalPages = Math.max(1, Math.ceil(filteredLeads.length / LEADS_PER_PAGE));

  const clientSummary = useMemo(() => {
    const search = clientSearch.trim().toLowerCase();
    const filtered = clientes.filter(cliente => {
      const etapa = cliente.etapaComercial || 'Em negociação';
      if (clientEtapaFilter !== 'todos' && etapa !== clientEtapaFilter) return false;
      if (!search) return true;
      return [cliente.nome, cliente.whatsapp, cliente.cidade, cliente.email, cliente.cpfCnpj, cliente.unidadeConsumidora, cliente.distribuidora]
        .some(value => String(value || '').toLowerCase().includes(search));
    });

    const withWhatsApp = clientes.filter(cliente => String(cliente.whatsapp || '').replace(/\D/g, '').length >= 10).length;
    const withCity = clientes.filter(cliente => String(cliente.cidade || '').trim()).length;
    const vendaSuspensa = clientes.filter(c => (c.etapaComercial || 'Em negociação') === 'Venda suspensa').length;
    const emNegociacao = clientes.filter(c => (c.etapaComercial || 'Em negociação') === 'Em negociação').length;
    const vendaConcluida = clientes.filter(c => c.etapaComercial === 'Venda concluída').length;

    return { filtered, withWhatsApp, withCity, vendaSuspensa, emNegociacao, vendaConcluida };
  }, [clientes, clientSearch, clientEtapaFilter]);

  const activeUsersTotal = useMemo(
    () => usuarios.filter(user => user.active).length,
    [usuarios]
  );

  const pendingPasswordTotal = useMemo(
    () => usuarios.filter(user => user.mustChangePassword).length,
    [usuarios]
  );

  const contratoSummary = useMemo(() => ({
    total: contratos.length,
    pendentes: contratos.filter(contrato => contrato.status === 'Pendente').length,
    aprovados: contratos.filter(contrato => contrato.status === 'Aprovado').length,
    recusados: contratos.filter(contrato => contrato.status === 'Recusado').length,
  }), [contratos]);

  const filteredOrcamentos = useMemo(() => {
    const search = orcamentoSearch.trim().toLowerCase();
    if (!search) return orcamentos;

    return orcamentos.filter(orcamento => [
      orcamento.clienteNome,
      orcamento.clienteTelefone,
      orcamento.clienteEmail,
      orcamento.clienteCidade,
      orcamento.assignedUserName,
      orcamento.id,
    ].some(value => String(value || '').toLowerCase().includes(search)));
  }, [orcamentoSearch, orcamentos]);

  const ORC_CLIENTS_PER_PAGE = 10;

  const filteredOrcClientes = useMemo(() => {
    const q = orcClientSearch.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter(c =>
      [c.nome, c.whatsapp, c.cpfCnpj, c.email].some(v => String(v || '').toLowerCase().includes(q))
    );
  }, [orcClientSearch, clientes]);

  const paginatedOrcClientes = useMemo(() => {
    const start = (orcClientPage - 1) * ORC_CLIENTS_PER_PAGE;
    return filteredOrcClientes.slice(start, start + ORC_CLIENTS_PER_PAGE);
  }, [filteredOrcClientes, orcClientPage]);

  const orcClientTotalPages = Math.max(1, Math.ceil(filteredOrcClientes.length / ORC_CLIENTS_PER_PAGE));

  const clientOrcamentos = useMemo(
    () => selectedOrcClient ? orcamentos.filter(o => String(o.clienteId) === String(selectedOrcClient.id)) : [],
    [selectedOrcClient, orcamentos]
  );

  const budgetClient = useMemo(
    () => clientes.find(cliente => String(cliente.id) === String(budgetForm.clienteId)) || null,
    [budgetForm.clienteId, clientes]
  );

  const budgetCalculations = useMemo(() => {
    const potenciaPlacaW = Number(String(budgetForm.potenciaPlacaW || '0').replace(',', '.')) || 0;
    const numeroPaineis = Number(String(budgetForm.numeroPaineis || '0').replace(',', '.')) || 0;
    const areaPorPainelM2 = Number(String(budgetForm.areaPorPainelM2 || '2.6').replace(',', '.')) || 2.6;
    const potenciaKwp = (potenciaPlacaW * numeroPaineis) / 1000;
    const areaOcupadaM2 = numeroPaineis * areaPorPainelM2;
    const irradiacaoSolar = Number(String(budgetForm.irradiacaoSolar || '0').replace(',', '.')) || 0;
    const perdaPercentual = Number(String(budgetForm.perdaPercentual || '20').replace(',', '.')) || 0;
    const geracaoCalculada = potenciaKwp && irradiacaoSolar
      ? potenciaKwp * irradiacaoSolar * 30 * (1 - perdaPercentual / 100)
      : 0;
    const geracaoKwh = budgetForm.generationMode === 'auto'
      ? geracaoCalculada
      : Number(String(budgetForm.geracaoKwh || '0').replace(',', '.')) || 0;
    return {
      potenciaKwp: Number(potenciaKwp.toFixed(2)),
      areaOcupadaM2: Number(areaOcupadaM2.toFixed(2)),
      geracaoCalculada: Number(geracaoCalculada.toFixed(2)),
      geracaoKwh: Number(geracaoKwh.toFixed(2)),
      geracaoAnualKwh: Number((geracaoKwh * 12).toFixed(2)),
    };
  }, [budgetForm]);

  const CONTRATOS_PER_PAGE = 10;

  const filteredContratos = useMemo(() => {
    let list = contratoStatusFilter === 'todos' ? contratos : contratos.filter(c => c.status === contratoStatusFilter);
    if (contratoSearch.trim()) {
      const q = contratoSearch.trim().toLowerCase();
      list = list.filter(c => {
        const num = `CT-${String(c.dataCriacao || '').slice(0, 4)}-${String(c.id).padStart(4, '0')}`.toLowerCase();
        return String(c.clienteNome || '').toLowerCase().includes(q) || num.includes(q);
      });
    }
    if (contratoDateFrom) list = list.filter(c => (c.dataCriacao || '') >= contratoDateFrom);
    if (contratoDateTo)   list = list.filter(c => (c.dataCriacao || '') <= contratoDateTo);
    return list;
  }, [contratoStatusFilter, contratoSearch, contratoDateFrom, contratoDateTo, contratos]);

  const paginatedContratos = useMemo(() => {
    const start = (contratoPage - 1) * CONTRATOS_PER_PAGE;
    return filteredContratos.slice(start, start + CONTRATOS_PER_PAGE);
  }, [filteredContratos, contratoPage]);

  const contratoTotalPages = Math.max(1, Math.ceil(filteredContratos.length / CONTRATOS_PER_PAGE));

  const filteredProdutosPacotes = useMemo(() => {
    const search = produtoSearch.trim().toLowerCase();
    if (!search) return equipamentos;

    return equipamentos.filter(item => [
      item.nome,
      item.tipo,
      item.placaModelo,
      item.inversorModelo,
      item.observacoes,
      item.formaPagamento,
    ].some(value => String(value || '').toLowerCase().includes(search)));
  }, [equipamentos, produtoSearch]);

  const activeProdutosTotal = useMemo(
    () => equipamentos.filter(item => item.active).length,
    [equipamentos]
  );

  const filteredProjetos = useMemo(() => {
    const term = projectSearch.trim().toLowerCase();
    if (!term) return projetos;

    return projetos.filter(projeto => [
      projeto.clienteNome,
      projeto.clienteTelefone,
      projeto.clienteCidade,
      projeto.responsavelNome,
      projeto.etapa,
      projeto.contratoId,
      projeto.id,
    ].some(value => String(value || '').toLowerCase().includes(term)));
  }, [projectSearch, projetos]);

  const selectedProjectPhotos = selectedProjeto ? (projectPhotos[selectedProjeto.id] || []) : [];
  const homologacaoSummary = useMemo(() => {
    const abertas = projetos.filter(projeto => projeto.etapa !== 'Projeto concluído');
    const pendencias = projetos.reduce((total, projeto) => (
      total + (projeto.pendenciasHomologacao || []).filter(item => !['Corrigida', 'Concluída', 'Cancelada'].includes(item.status)).length
    ), 0);
    return {
      ativos: abertas.length,
      pendencias,
      enviados: projetos.filter(projeto => (projeto.enviosHomologacao || []).length > 0).length,
      parecer: projetos.filter(projeto => ['Aguardando parecer de acesso', 'Parecer emitido', 'Com obra', 'Sem obra'].includes(projeto.etapa)).length,
      vistoria: projetos.filter(projeto => String(projeto.etapa || '').includes('Vistoria')).length,
      concluidos: projetos.filter(projeto => projeto.etapa === 'Projeto concluído').length,
    };
  }, [projetos]);

  const filteredHomologacaoProjetos = useMemo(() => filteredProjetos, [filteredProjetos]);

  const osSummary = useMemo(() => ({
    total: ordensServico.length,
    abertas: ordensServico.filter(item => item.status === 'Aberta').length,
    andamento: ordensServico.filter(item => item.status === 'Em atendimento').length,
    resolvidas: ordensServico.filter(item => item.status === 'Resolvida').length,
  }), [ordensServico]);

  const filteredOrdensServico = useMemo(() => {
    if (osStatusFilter === 'todos') return ordensServico;
    return ordensServico.filter(os => os.status === osStatusFilter);
  }, [ordensServico, osStatusFilter]);

  const filteredUsuarios = useMemo(() => {
    const search = userSearch.trim().toLowerCase();
    if (!search) return usuarios;

    return usuarios.filter(user => [
      user.nome,
      user.username,
      user.email,
      user.whatsapp,
      roleLabels[user.role] || user.role,
    ].some(value => String(value || '').toLowerCase().includes(search)));
  }, [userSearch, usuarios]);

  const request = useCallback(async (path, options = {}) => {
    const response = await fetch(withApiBase(path), {
      ...options,
      headers: { ...headers, ...(options.headers || {}) },
    });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('role');
        navigate('/sistema-drm');
      }
      if (data.requiresEmailVerification) {
        const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
        localStorage.setItem('user', JSON.stringify({ ...currentUser, requiresEmailVerification: true }));
        navigate('/verificar-email');
      }
      throw new Error(data.message || 'Falha ao carregar dados.');
    }
    return data;
  }, [headers, navigate]);

  const loadData = useCallback(async (user) => {
    const calls = [];

    if (user.role === 'ADM' || user.permissions?.clientes) {
      calls.push(request('/api/admin/clientes').then(setClientes));
    }
    if (user.role === 'ADM' || user.permissions?.dashboard) {
      calls.push(request('/api/admin/resumo').then(setResumo));
    }
    if (user.role === 'ADM' || user.permissions?.leads) {
      calls.push(request('/api/admin/leads').then(setLeads));
      calls.push(request('/api/admin/atividades').then(setAtividades));
    }
    if (user.role === 'ADM' || user.permissions?.orcamentos) {
      calls.push(request('/api/admin/orcamentos').then(setOrcamentos));
    }
    if (user.role === 'ADM' || user.permissions?.contratos) {
      calls.push(request('/api/admin/contratos').then(setContratos));
      calls.push(request('/api/admin/procuracoes').then(setProcuracoes));
      calls.push(request('/api/admin/equipamentos').then(setEquipamentos));
      calls.push(request('/api/admin/contrato-config').then(setContractConfig));
    }
    if (user.role === 'ADM' || user.permissions?.equipeTecnica) {
      calls.push(request('/api/admin/projetos').then(async (items) => {
        setProjetos(items);
        const photos = await Promise.all(items.map(projeto => (
          request(`/api/admin/projetos/${projeto.id}/fotos`)
            .then(fotos => [projeto.id, fotos])
            .catch(() => [projeto.id, []])
        )));
        setProjectPhotos(Object.fromEntries(photos));
      }));
    }
    if (user.role === 'ADM' || user.permissions?.ordensServico) {
      calls.push(request('/api/admin/ordens-servico').then(setOrdensServico));
    }
    if (user.role === 'ADM' || user.permissions?.usuarios) {
      calls.push(request('/api/admin/usuarios').then(setUsuarios));
      calls.push(request('/api/admin/comunicacoes').then(setComunicacoes));
    }
    if (user.role === 'ADM' || user.permissions?.financeiro) {
      calls.push(request('/api/admin/financeiro').then(setFinanceiro));
    }
    if (user.role === 'ADM' || user.permissions?.precosSistemas) {
      calls.push(request('/api/admin/tabelas-precos').then(setTabelasPrecos));
    }

    const results = await Promise.allSettled(calls);
    const failed = results.find(result => result.status === 'rejected');
    if (failed) throw failed.reason;
  }, [request]);

  useEffect(() => { setLeadsPage(1); }, [leadSearch, leadStatusFilter, leadOwnerFilter, leadSourceFilter]);
  useEffect(() => { setOrcClientPage(1); }, [orcClientSearch]);
  useEffect(() => { setContratoPage(1); }, [contratoStatusFilter, contratoSearch, contratoDateFrom, contratoDateTo]);
  useEffect(() => {
    if (!isBudgetFormOpen) return;
    localStorage.setItem(budgetDraftOpenStorageKey, '1');
    localStorage.setItem(budgetDraftStorageKey, JSON.stringify(budgetForm));
  }, [budgetForm, isBudgetFormOpen]);

  useEffect(() => {
    if (!selectedContrato || typeof document === 'undefined') return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [selectedContrato]);

  useEffect(() => {
    if (!showManualLeadForm || typeof document === 'undefined') return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showManualLeadForm]);

  useEffect(() => {
    const loggedInUser = JSON.parse(localStorage.getItem('user'));
    const token = localStorage.getItem('token');

    if (!loggedInUser || !token) {
      navigate('/sistema-drm');
      return;
    }

    if (loggedInUser.requiresEmailVerification) {
      navigate('/verificar-email');
      return;
    }

    loadData(loggedInUser).catch(err => {
      setError(err.message);
      showToast(err.message, 'error');
    });

    const handleNewOrcamento = (novoOrcamento) => {
      const canSee = loggedInUser.permissions?.verTodosLeads || novoOrcamento.assignedUserId === loggedInUser.id;
      if (canSee) setOrcamentos(prev => [novoOrcamento, ...prev]);
    };

    const handleNewLead = (novoLead) => {
      const canSee = loggedInUser.role === 'ADM' || loggedInUser.permissions?.verTodosLeads || novoLead.assignedUserId === loggedInUser.id;
      if (canSee) setLeads(prev => [novoLead, ...prev.filter(lead => lead.id !== novoLead.id)]);
    };

    const handleContratoAtualizado = (contrato) => {
      const canSee = loggedInUser.role === 'ADM' || loggedInUser.permissions?.verTodosLeads || contrato.assignedUserId === loggedInUser.id || contrato.criadoPorId === loggedInUser.id;
      if (!canSee) return;
      setContratos(prev => {
        const exists = prev.some(item => item.id === contrato.id);
        return exists ? prev.map(item => item.id === contrato.id ? contrato : item) : [contrato, ...prev];
      });
      setSelectedContrato(prev => prev?.id === contrato.id ? contrato : prev);
    };

    const handleProjetoAtualizado = (projeto) => {
      const canSee = loggedInUser.role === 'ADM' || loggedInUser.permissions?.verTodosLeads || projeto.responsavelId === loggedInUser.id;
      if (!canSee) return;
      setProjetos(prev => {
        const exists = prev.some(item => item.id === projeto.id);
        return exists ? prev.map(item => item.id === projeto.id ? projeto : item) : [projeto, ...prev];
      });
      setSelectedProjeto(prev => prev?.id === projeto.id ? projeto : prev);
    };

    const handleAtividadeCriada = (atividade) => {
      const canSee = loggedInUser.role === 'ADM' || loggedInUser.permissions?.verTodosLeads || atividade.criadoPorId === loggedInUser.id;
      if (canSee) setAtividades(prev => [atividade, ...prev].slice(0, 120));
    };

    const handleProjetoFotoCriada = (foto) => {
      setProjectPhotos(prev => ({
        ...prev,
        [foto.projetoId]: (prev[foto.projetoId] || []).some(item => item.id === foto.id)
          ? prev[foto.projetoId]
          : [foto, ...(prev[foto.projetoId] || [])],
      }));
    };

    const handleOsAtualizada = (os) => {
      const canSee = loggedInUser.role === 'ADM' || loggedInUser.permissions?.verTodosLeads || os.responsavelId === loggedInUser.id || os.responsavelId === null;
      if (!canSee) return;
      setOrdensServico(prev => {
        const exists = prev.some(item => item.id === os.id);
        return exists ? prev.map(item => item.id === os.id ? os : item) : [os, ...prev];
      });
    };

    socket.on('novo_orcamento', handleNewOrcamento);
    socket.on('novo_lead', handleNewLead);
    socket.on('contrato_atualizado', handleContratoAtualizado);
    socket.on('projeto_atualizado', handleProjetoAtualizado);
    socket.on('atividade_criada', handleAtividadeCriada);
    socket.on('projeto_foto_criada', handleProjetoFotoCriada);
    socket.on('os_atualizada', handleOsAtualizada);

    return () => {
      socket.off('novo_orcamento', handleNewOrcamento);
      socket.off('novo_lead', handleNewLead);
      socket.off('contrato_atualizado', handleContratoAtualizado);
      socket.off('projeto_atualizado', handleProjetoAtualizado);
      socket.off('atividade_criada', handleAtividadeCriada);
      socket.off('projeto_foto_criada', handleProjetoFotoCriada);
      socket.off('os_atualizada', handleOsAtualizada);
    };
  }, [loadData, navigate]);

  const handleSair = () => {
    localStorage.removeItem('role');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/');
  };

  const updateLeadStatus = async (leadId, status) => {
    await request(`/api/admin/leads/${leadId}`, {
      method: 'PUT',
      body: JSON.stringify({ status, ultimoContato: new Date().toISOString().split('T')[0] }),
    });
    setLeads(prev => prev.map(lead => lead.id === leadId ? { ...lead, status } : lead));
  };

  const closeManualLeadModal = () => {
    setShowManualLeadForm(false);
    setManualLeadForm(emptyManualLeadForm);
  };

  const cadastrarLeadManual = async (event) => {
    event.preventDefault();
    try {
      const lead = await request('/api/admin/leads', {
        method: 'POST',
        body: JSON.stringify(manualLeadForm),
      });
      setLeads(prev => [lead, ...prev.filter(item => item.id !== lead.id)]);
      setManualLeadForm(emptyManualLeadForm);
      setShowManualLeadForm(false);
      setLeadSourceFilter('manual');
      request('/api/admin/resumo').then(setResumo).catch(() => {});
      showToast(`Lead manual #${lead.id} cadastrado com sucesso.`, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const registrarAtividade = async (event) => {
    event.preventDefault();
    if (!activityForm.leadId) return;
    try {
      const atividade = await request(`/api/admin/leads/${activityForm.leadId}/atividades`, {
        method: 'POST',
        body: JSON.stringify(activityForm),
      });
      setAtividades(prev => [atividade, ...prev].slice(0, 120));
      setLeads(prev => prev.map(lead => (
        lead.id === Number(activityForm.leadId)
          ? { ...lead, ultimoContato: new Date().toISOString().split('T')[0], proximoRetorno: activityForm.proximoRetorno || lead.proximoRetorno, observacoes: activityForm.resultado || lead.observacoes }
          : lead
      )));
      setActivityForm({ leadId: '', tipo: 'Ligação', origem: 'Ligação', descricao: '', resultado: '', proximoRetorno: '' });
      request('/api/admin/resumo').then(setResumo).catch(() => {});
      showToast('Atividade registrada com sucesso.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const updateProjeto = async (projetoId, payload) => {
    try {
      const projeto = await request(`/api/admin/projetos/${projetoId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      setProjetos(prev => prev.map(item => item.id === projeto.id ? projeto : item));
      setSelectedProjeto(prev => prev?.id === projeto.id ? projeto : prev);
      request('/api/admin/resumo').then(setResumo).catch(() => {});
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const registerHomologacaoPendencia = async (event) => {
    event.preventDefault();
    if (!selectedProjeto) return;
    const projeto = await request(`/api/admin/projetos/${selectedProjeto.id}/pendencias`, {
      method: 'POST',
      body: JSON.stringify(pendenciaForm),
    });
    setProjetos(prev => prev.map(item => item.id === projeto.id ? projeto : item));
    setSelectedProjeto(projeto);
    setPendenciaForm(emptyPendenciaForm);
    request('/api/admin/resumo').then(setResumo).catch(() => {});
  };

  const updateHomologacaoPendencia = async (pendenciaId, payload) => {
    if (!selectedProjeto) return;
    const projeto = await request(`/api/admin/projetos/${selectedProjeto.id}/pendencias/${pendenciaId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    setProjetos(prev => prev.map(item => item.id === projeto.id ? projeto : item));
    setSelectedProjeto(projeto);
    request('/api/admin/resumo').then(setResumo).catch(() => {});
  };

  const registerHomologacaoEnvio = async (event) => {
    event.preventDefault();
    if (!selectedProjeto) return;
    const projeto = await request(`/api/admin/projetos/${selectedProjeto.id}/envios-homologacao`, {
      method: 'POST',
      body: JSON.stringify(envioHomologacaoForm),
    });
    setProjetos(prev => prev.map(item => item.id === projeto.id ? projeto : item));
    setSelectedProjeto(projeto);
    setEnvioHomologacaoForm(emptyEnvioHomologacaoForm);
    request('/api/admin/resumo').then(setResumo).catch(() => {});
  };

  const uploadProjetoFotos = async (projetoId, files) => {
    const selectedFiles = Array.from(files || []).slice(0, 8);
    for (const file of selectedFiles) {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const foto = await request(`/api/admin/projetos/${projetoId}/fotos`, {
        method: 'POST',
        body: JSON.stringify({
          dataUrl,
          descricao: file.name,
          categoria: 'Vistoria',
        }),
      });
      setProjectPhotos(prev => ({
        ...prev,
        [projetoId]: [foto, ...(prev[projetoId] || [])],
      }));
    }
  };

  const createOrdemServico = async (event) => {
    event.preventDefault();
    try {
      const os = await request('/api/admin/ordens-servico', {
        method: 'POST',
        body: JSON.stringify(osForm),
      });
      setOrdensServico(prev => [os, ...prev]);
      setOsForm({ clienteNome: '', clienteTelefone: '', contratoId: '', origem: 'WhatsApp', problema: '', categoria: 'Suporte', prioridade: 'Normal', responsavelId: '', observacoes: '' });
      showToast('O.S. criada com sucesso.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const updateOrdemServico = async (osId, payload) => {
    const os = await request(`/api/admin/ordens-servico/${osId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    setOrdensServico(prev => prev.map(item => item.id === os.id ? os : item));
  };

  const updatePriceCurrency = (field, value) => {
    setPriceForm(prev => ({ ...prev, [field]: String(value || '').replace(/\D/g, '') }));
    setPriceError('');
  };

  const updatePricePercent = (value) => {
    const normalized = String(value || '').replace(',', '.');
    if (Number(normalized) < 0) return;
    setPriceForm(prev => ({ ...prev, comissaoPercentual: normalized }));
    setPriceError('');
  };

  const calcularPrecoSistema = (event) => {
    event.preventDefault();
    const values = {
      valorKitSolar: currencyToNumber(priceForm.valorKitSolar),
      custoInstalacao: currencyToNumber(priceForm.custoInstalacao),
      materialCA: currencyToNumber(priceForm.materialCA),
      deslocamento: currencyToNumber(priceForm.deslocamento),
      custoAdicional: currencyToNumber(priceForm.custoAdicional),
      margemEmpresa: currencyToNumber(priceForm.margemEmpresa),
      comissaoPercentual: Number(String(priceForm.comissaoPercentual || '0').replace(',', '.')),
    };

    if (Object.values(values).some(value => Number.isNaN(value) || value < 0)) {
      setPriceError('Não é permitido informar valores negativos ou inválidos.');
      return;
    }
    if (values.comissaoPercentual >= 100) {
      setPriceError('A comissão precisa ser menor que 100%.');
      return;
    }

    const custoBase = values.valorKitSolar + values.custoInstalacao + values.materialCA + values.deslocamento + values.custoAdicional + values.margemEmpresa;
    const precoFinal = custoBase / (1 - (values.comissaoPercentual / 100));
    const valorComissao = precoFinal - custoBase;
    setPriceResult({ ...values, custoBase, precoFinal, valorComissao });
  };

  const limparPrecoSistema = () => {
    setPriceForm(emptyPriceForm);
    setPriceResult(null);
    setPriceError('');
  };

  const renderProdutosPacotes = () => (
    <div className="products-catalog-layout">
      <aside className="products-catalog-list">
        <div className="catalog-list-header">
          <div>
            <strong>Catálogo</strong>
            <span>{filteredProdutosPacotes.length} de {equipamentos.length} item{equipamentos.length === 1 ? '' : 's'}</span>
          </div>
          <button type="button" className="btn btn-primary btn-sm-admin" onClick={startNewEquipamento}>Novo item</button>
        </div>
        <input
          className="catalog-search"
          value={produtoSearch}
          onChange={(event) => setProdutoSearch(event.target.value)}
          placeholder="Buscar por nome, placa, inversor..."
        />
        <div className="catalog-items">
          {filteredProdutosPacotes.map(item => (
            <button
              type="button"
              key={item.id}
              className={`catalog-item ${editingEquipamentoId === item.id ? 'active' : ''} ${item.active ? '' : 'disabled'}`}
              onClick={() => editEquipamento(item)}
            >
              <div>
                <strong>{item.nome}</strong>
                <span>{item.tipo || 'Kit solar'} • {item.valorSistema ? money(item.valorSistema) : 'sem valor'}</span>
              </div>
              <small>{item.potenciaKwp ? `${item.potenciaKwp} kWp` : 'Sem potência'} · {item.geracaoKwh ? `${item.geracaoKwh} kWh/mês` : 'Sem geração'}</small>
            </button>
          ))}
          {filteredProdutosPacotes.length === 0 && (
            <div className="catalog-empty">
              <strong>Nenhum item encontrado</strong>
              <span>Limpe a busca ou crie um novo produto.</span>
            </div>
          )}
        </div>
      </aside>

      <form className="product-editor" onSubmit={saveEquipamento}>
        <div className="product-editor-header">
          <div>
            <span className="section-kicker">{editingEquipamentoId ? `Editando #${editingEquipamentoId}` : 'Novo cadastro'}</span>
            <h3>{editingEquipamentoId ? 'Editar produto/pacote' : 'Criar produto/pacote'}</h3>
          </div>
          <div className="product-editor-actions">
            {editingEquipamentoId && (
              <>
                <button type="button" className="btn btn-outline btn-sm-admin" onClick={() => duplicateEquipamento(equipamentos.find(item => item.id === editingEquipamentoId))}>Duplicar</button>
                <button type="button" className="btn btn-outline btn-sm-admin" onClick={() => toggleEquipamentoActive(equipamentos.find(item => item.id === editingEquipamentoId))}>
                  {equipamentos.find(item => item.id === editingEquipamentoId)?.active ? 'Desativar' : 'Ativar'}
                </button>
              </>
            )}
            <button type="button" className="btn btn-outline btn-sm-admin" onClick={startNewEquipamento}>Limpar</button>
          </div>
        </div>

        <section className="product-editor-section">
          <div className="editor-section-title">
            <strong>Identificação</strong>
            <span>Como o item aparece para a equipe na seleção do contrato.</span>
          </div>
          <div className="equipment-form product-editor-grid">
            <label className="span-2">
              Nome do produto ou pacote
              <input ref={equipamentoNomeRef} placeholder="Ex: Kit residencial 5,49 kWp" value={equipamentoForm.nome} onChange={(e) => setEquipamentoForm(prev => ({ ...prev, nome: e.target.value }))} required />
            </label>
            <div className="span-2">
              <span className="field-label">Tipo</span>
              <div className="segmented-options">
                {equipamentoTypeOptions.map(option => (
                  <button
                    type="button"
                    key={option}
                    className={equipamentoForm.tipo === option ? 'active' : ''}
                    onClick={() => setEquipamentoForm(prev => ({ ...prev, tipo: option }))}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="product-editor-section">
          <div className="editor-section-title">
            <strong>Dados técnicos</strong>
            <span>Essas informações entram no quadro técnico do contrato.</span>
          </div>
          <div className="equipment-form product-editor-grid">
            <label>
              Modelo da placa
              <input placeholder="Ex: Painel solar 610 W" value={equipamentoForm.placaModelo} onChange={(e) => setEquipamentoForm(prev => ({ ...prev, placaModelo: e.target.value }))} required />
            </label>
            <label>
              Modelo do inversor
              <input placeholder="Ex: Inversor 5 kW" value={equipamentoForm.inversorModelo} onChange={(e) => setEquipamentoForm(prev => ({ ...prev, inversorModelo: e.target.value }))} required />
            </label>
            <label>
              Potência placa W
              <input type="number" value={equipamentoForm.potenciaPlacaW} onChange={(e) => setEquipamentoForm(prev => ({ ...prev, potenciaPlacaW: e.target.value }))} />
            </label>
            <label>
              Potência inversor kW
              <input type="number" step="0.01" value={equipamentoForm.potenciaInversorKw} onChange={(e) => setEquipamentoForm(prev => ({ ...prev, potenciaInversorKw: e.target.value }))} />
            </label>
            <label>
              Potência do sistema kWp
              <input type="number" step="0.01" value={equipamentoForm.potenciaKwp} onChange={(e) => setEquipamentoForm(prev => ({ ...prev, potenciaKwp: e.target.value }))} />
            </label>
            <label>
              Quantidade de placas
              <input type="number" value={equipamentoForm.numeroPaineis} onChange={(e) => setEquipamentoForm(prev => ({ ...prev, numeroPaineis: e.target.value }))} />
            </label>
            <label>
              Geração mensal kWh
              <input type="number" step="0.01" value={equipamentoForm.geracaoKwh} onChange={(e) => setEquipamentoForm(prev => ({ ...prev, geracaoKwh: e.target.value }))} />
            </label>
            <label>
              Geração anual kWh
              <input type="number" step="0.01" value={equipamentoForm.geracaoAnualKwh} onChange={(e) => setEquipamentoForm(prev => ({ ...prev, geracaoAnualKwh: e.target.value }))} />
            </label>
            <label className="span-2">
              Quantidade de cabo
              <input placeholder="Ex: 45 metros" value={equipamentoForm.quantidadeCabo} onChange={(e) => setEquipamentoForm(prev => ({ ...prev, quantidadeCabo: e.target.value }))} />
            </label>
          </div>
        </section>

        <section className="product-editor-section">
          <div className="editor-section-title">
            <strong>Comercial e contrato</strong>
            <span>Valores e condições que serão puxados automaticamente.</span>
          </div>
          <div className="equipment-form product-editor-grid">
            <label>
              Valor do sistema
              <CurrencyInput value={equipamentoForm.valorSistema} onValueChange={(value) => setEquipamentoForm(prev => ({ ...prev, valorSistema: value }))} />
            </label>
            <label>
              Entrada
              <CurrencyInput value={equipamentoForm.valorEntrada} onValueChange={(value) => setEquipamentoForm(prev => ({ ...prev, valorEntrada: value }))} />
            </label>
            <label>
              Saldo
              <CurrencyInput value={equipamentoForm.valorSaldo} onValueChange={(value) => setEquipamentoForm(prev => ({ ...prev, valorSaldo: value }))} />
            </label>
            <label>
              Prazo de execução
              <input type="number" value={equipamentoForm.prazoExecucao} onChange={(e) => setEquipamentoForm(prev => ({ ...prev, prazoExecucao: e.target.value }))} />
            </label>
            <div className="span-2">
              <span className="field-label">Tipo de pagamento</span>
              <div className="segmented-options">
                {pagamentoTypeOptions.map(option => (
                  <button
                    type="button"
                    key={option.value}
                    className={equipamentoForm.formaPagamentoTipo === option.value ? 'active' : ''}
                    onClick={() => setEquipamentoForm(prev => ({ ...prev, formaPagamentoTipo: option.value }))}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="span-2">
              Forma de pagamento detalhada
              <textarea placeholder="Ex: Entrada de R$ 5.000,00 + saldo financiado em até 60x..." value={equipamentoForm.formaPagamento} onChange={(e) => setEquipamentoForm(prev => ({ ...prev, formaPagamento: e.target.value }))} />
            </label>
            <label className="span-2">
              Observações internas
              <textarea placeholder="Use para detalhes de fornecedor, validade, exceções comerciais ou instalação." value={equipamentoForm.observacoes} onChange={(e) => setEquipamentoForm(prev => ({ ...prev, observacoes: e.target.value }))} />
            </label>
          </div>
        </section>

        <div className="product-editor-footer">
          <div>
            <strong>{equipamentoForm.valorSistema ? money(equipamentoForm.valorSistema) : 'Sem valor definido'}</strong>
            <span>{equipamentoForm.potenciaKwp || '0'} kWp • {equipamentoForm.geracaoKwh || '0'} kWh/mês</span>
          </div>
          <button className="btn btn-primary" type="submit">{editingEquipamentoId ? 'Salvar alterações' : 'Criar item'}</button>
        </div>
      </form>
    </div>
  );

  const updatePermissions = async (userId, permissions, active, extra = {}) => {
    await request(`/api/admin/usuarios/${userId}/permissoes`, {
      method: 'PUT',
      body: JSON.stringify({ permissions, active, ...extra }),
    });
    setUsuarios(prev => prev.map(user => user.id === userId ? { ...user, permissions, active, ...extra } : user));
  };

  const createUsuario = async (event) => {
    event.preventDefault();
    try {
    const user = await request('/api/admin/usuarios', {
      method: 'POST',
      body: JSON.stringify({
        ...newUserForm,
        permissions: {
          dashboard: true,
          leads: true,
          orcamentos: true,
          contratos: true,
          ...(newUserForm.role === 'EQUIPE_TECNICA_COMERCIAL' ? {
            ordensServico: true,
            precosSistemas: true,
            equipeTecnica: true,
          } : {}),
          ...(newUserForm.role === 'ADM' ? {
            clientes: true,
            ordensServico: true,
            precosSistemas: true,
            financeiro: true,
            equipeTecnica: true,
            usuarios: true,
            permissoes: true,
            verTodosLeads: true,
            gerenciarClientes: true,
          } : {}),
        },
      }),
    });
    setUsuarios(prev => [...prev, user]);
    setNewUserForm(emptyUserForm);
    showToast('Usuário criado com sucesso.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const createCliente = async (event) => {
    event.preventDefault();
    try {
      const cliente = await request('/api/admin/clientes', {
        method: 'POST',
        body: JSON.stringify(novoCliente),
      });
      setClientes(prev => [cliente, ...prev]);
      setNovoCliente(emptyClientForm);
      setClientView('list');
      showToast('Cliente cadastrado com sucesso.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const updateClienteEtapa = async (clienteId, etapa, form = {}) => {
    if (etapa === 'Venda suspensa' && !form.motivo?.trim()) {
      showToast('O motivo da suspensão é obrigatório.', 'error');
      return;
    }
    try {
      const updated = await request(`/api/admin/clientes/${clienteId}/etapa-comercial`, {
        method: 'PUT',
        body: JSON.stringify({ etapaComercial: etapa, motivoSuspensao: form.motivo, dataPrevisaoRetorno: form.dataPrevisaoRetorno, ultimoContatoComercial: form.ultimoContato, proximaAcaoComercial: form.proximaAcao }),
      });
      setClientes(prev => prev.map(c => c.id === clienteId ? { ...c, ...updated } : c));
      setSuspensaoModal(null);
      setSuspensaoForm({ motivo: '', dataPrevisaoRetorno: '', ultimoContato: '', proximaAcao: '' });
      showToast(`Etapa atualizada: ${etapa}`, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const uploadProjetoDocumento = async (projetoId, tipo, docData) => {
    setHomoDocUploadLoading(true);
    try {
      const updated = await request(`/api/admin/projetos/${projetoId}/documentos`, {
        method: 'POST',
        body: JSON.stringify({ tipo, ...docData }),
      });
      setProjetos(prev => prev.map(p => p.id === projetoId ? updated : p));
      setSelectedProjeto(updated);
      setHomoDocUpload({ tipo: 'cliente', nome: '', descricao: '', arquivo: null });
      showToast('Documento adicionado.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setHomoDocUploadLoading(false);
    }
  };

  const updateProjetoDocumento = async (projetoId, docId, tipo, data) => {
    try {
      const updated = await request(`/api/admin/projetos/${projetoId}/documentos/${docId}`, {
        method: 'PUT',
        body: JSON.stringify({ tipo, ...data }),
      });
      setProjetos(prev => prev.map(p => p.id === projetoId ? updated : p));
      setSelectedProjeto(updated);
      showToast('Documento atualizado.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const deleteProjetoDocumento = async (projetoId, docId, tipo) => {
    try {
      await request(`/api/admin/projetos/${projetoId}/documentos/${docId}?tipo=${tipo}`, { method: 'DELETE' });
      const updated = await request(`/api/admin/projetos/${projetoId}`);
      setProjetos(prev => prev.map(p => p.id === projetoId ? updated : p));
      setSelectedProjeto(updated);
      showToast('Documento removido.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const updateProjetoDetalhes = async (projetoId, data) => {
    try {
      const updated = await request(`/api/admin/projetos/${projetoId}/detalhes-homologacao`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      setProjetos(prev => prev.map(p => p.id === projetoId ? updated : p));
      setSelectedProjeto(updated);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const openBudgetFormForClient = (cliente = null) => {
    setBudgetStatus('');
    setBudgetForm({
      ...emptyBudgetForm,
      clienteId: cliente?.id ? String(cliente.id) : '',
      placaModelo: equipamentos.find(item => item.active)?.placaModelo || '',
      inversorModelo: equipamentos.find(item => item.active)?.inversorModelo || '',
      potenciaPlacaW: equipamentos.find(item => item.active)?.potenciaPlacaW || emptyBudgetForm.potenciaPlacaW,
      potenciaInversorKw: equipamentos.find(item => item.active)?.potenciaInversorKw || '',
      equipamentoId: equipamentos.find(item => item.active)?.id ? String(equipamentos.find(item => item.active).id) : '',
    });
    setIsBudgetFormOpen(true);
    setActiveTab('orcamentos');
  };

  const applyEquipmentToBudget = (equipamentoId) => {
    const equipamento = equipamentos.find(item => String(item.id) === String(equipamentoId));
    setBudgetForm(prev => ({
      ...prev,
      equipamentoId,
      placaModelo: equipamento?.placaModelo || prev.placaModelo,
      inversorModelo: equipamento?.inversorModelo || prev.inversorModelo,
      potenciaPlacaW: equipamento?.potenciaPlacaW || prev.potenciaPlacaW,
      potenciaInversorKw: equipamento?.potenciaInversorKw || prev.potenciaInversorKw,
      numeroPaineis: equipamento?.numeroPaineis || prev.numeroPaineis,
      quantidadeCaboCc: equipamento?.quantidadeCabo || prev.quantidadeCaboCc,
      geracaoKwh: equipamento?.geracaoKwh || prev.geracaoKwh,
      valorSistema: equipamento?.valorSistema || prev.valorSistema,
      formaPagamentoTipo: equipamento?.formaPagamentoTipo || prev.formaPagamentoTipo,
      condicoesPagamento: equipamento?.formaPagamento || prev.condicoesPagamento,
    }));
  };

  const createManualBudget = async (event) => {
    event.preventDefault();
    setBudgetStatus('Salvando orçamento...');
    try {
      const orcamento = await request('/api/admin/orcamentos', {
        method: 'POST',
        body: JSON.stringify({
          clienteId: budgetForm.clienteId,
          status: 'Orçamento interno',
          dimensionamento: {
            potencia_placa_w: budgetForm.potenciaPlacaW,
            placa_modelo: budgetForm.placaModelo,
            numero_paineis_necessarios: budgetForm.numeroPaineis,
            potencia_real_instalada_kwp: budgetCalculations.potenciaKwp,
            area_ocupada_m2: budgetCalculations.areaOcupadaM2,
            potencia_inversor_kw: budgetForm.potenciaInversorKw,
            inversor_modelo: budgetForm.inversorModelo,
            quantidade_inversores: budgetForm.quantidadeInversores,
            quantidade_cabo_cc: budgetForm.quantidadeCaboCc,
            irradiacao_solar: budgetForm.irradiacaoSolar,
            perda_percentual: budgetForm.perdaPercentual,
            geracao_estimada_kwh: budgetCalculations.geracaoKwh,
            geracao_anual_kwh: budgetCalculations.geracaoAnualKwh,
            cidade_base: budgetClient?.cidade,
            observacoes: budgetForm.observacoes,
            modelo_orcamento: 'Solaris',
          },
          financeiro: {
            preco_final_cliente_rs: budgetForm.valorSistema,
            entrada_rs: budgetForm.valorEntrada,
            saldo_rs: budgetForm.valorSaldo,
            forma_pagamento: budgetForm.formaPagamentoTipo,
            forma_pagamento_tipo: budgetForm.formaPagamentoTipo,
            condicoes_pagamento: budgetForm.condicoesPagamento,
          },
        }),
      });
      setOrcamentos(prev => [orcamento, ...prev.filter(item => item.id !== orcamento.id)]);
      setSelectedOrcamento(orcamento);
      localStorage.removeItem(budgetDraftStorageKey);
      localStorage.removeItem(budgetDraftOpenStorageKey);
      setBudgetForm(emptyBudgetForm);
      setBudgetStatus('Orçamento criado. Agora você pode gerar o contrato a partir dele.');
      setIsBudgetFormOpen(false);
      request('/api/admin/resumo').then(setResumo).catch(() => {});
    } catch (err) {
      setBudgetStatus(err.message);
    }
  };

  const handleQuickAction = (action) => {
    setQuickModal(null);
    if (action.action === 'newBudget') {
      openBudgetFormForClient();
      return;
    }
    if (action.action === 'newLead') {
      setActiveTab('leads');
      setShowManualLeadForm(true);
      return;
    }
    setActiveTab(action.tab);
  };

  const buildContractManualFromOrcamento = (orcamento, equipamento) => {
    const geracaoMensal = orcamento.dimensionamento?.geracao_estimada_kwh || '';
    const geracaoAnual = orcamento.dimensionamento?.geracao_anual_kwh || orcamento.dimensionamento?.geracao_anual_estimada_kwh || (geracaoMensal ? Number(geracaoMensal) * 12 : '');
    const baseManual = {
      ...emptyContractManual,
      geracaoKwh: geracaoMensal,
      geracaoAnualKwh: geracaoAnual,
      potenciaKwp: orcamento.dimensionamento?.potencia_real_instalada_kwp || '',
      numeroPaineis: orcamento.dimensionamento?.numero_paineis_necessarios || '',
      painel: orcamento.dimensionamento?.placa_modelo || '',
      inversor: orcamento.dimensionamento?.inversor_modelo || '',
      quantidadeCabo: orcamento.dimensionamento?.quantidade_cabo_cc || '',
      valorSistema: orcamento.financeiro?.preco_final_cliente_rs || '',
      valorEntrada: orcamento.financeiro?.entrada_rs ?? '',
      valorSaldo: orcamento.financeiro?.saldo_rs ?? '',
      formaPagamentoTipo: orcamento.financeiro?.forma_pagamento_tipo || orcamento.financeiro?.forma_pagamento || 'avista',
      formaPagamento: orcamento.financeiro?.condicoes_pagamento || '',
      observacao: orcamento.dimensionamento?.observacoes || '',
    };
    return applyEquipamentoToManual(baseManual, equipamento);
  };

  const openContractModal = async (orcamento) => {
    const equipamento = equipamentos.find(item => item.id === Number(selectedEquipamentos[orcamento.id])) || equipamentos.find(item => item.active);
    const manual = buildContractManualFromOrcamento(orcamento, equipamento);
    await gerarContratoPorOrcamento(orcamento, equipamento?.id || '', manual);
  };

  const getClientContract = (cliente) => contratos.find(contrato => (
    Number(contrato.dados?.cliente?.id) === Number(cliente.id)
  ));

  const openClientContractModal = (cliente) => {
    const existingContract = getClientContract(cliente);
    if (existingContract) {
      setActiveTab('contratos');
      abrirRevisaoContrato(existingContract);
      showToast(`Abrindo contrato ${contractNumber(existingContract)} - ${existingContract.status}.`, 'info');
      return;
    }

    const equipamento = equipamentos.find(item => item.active);
    setQuickModal(null);
    setContractModal({
      open: true,
      orcamento: {
        id: cliente.id,
        source: 'cliente',
        clienteId: cliente.id,
        clienteNome: cliente.nome,
        clienteTelefone: cliente.whatsapp,
        clienteEmail: cliente.email,
        clienteCidade: cliente.cidade,
        clienteData: cliente,
      },
      equipamentoId: equipamento?.id || '',
      manual: applyEquipamentoToManual({ ...emptyContractManual, formaPagamentoTipo: 'avista' }, equipamento),
    });
  };

  const openHomologacaoModal = (cliente) => {
    const contrato = getClientContract(cliente);
    if (!contrato) {
      showToast('Gere o contrato deste cliente antes de iniciar a homologação.', 'warning');
      return;
    }
    const existing = procuracoes.find(item => Number(item.contratoId) === Number(contrato.id));
    if (existing) {
      setActiveTab('procuracoes');
      showToast(`Este contrato já possui a procuração PR-${String(existing.id).padStart(4, '0')} (${existing.status}).`, 'info');
      return;
    }
    setHomologacaoForm({
      titularMesmoContrato: true,
      nome: '',
      cpfCnpj: '',
      endereco: '',
    });
    setHomologacaoModal({
      cliente,
      contrato,
      titularContrato: { ...cliente, ...(contrato.dados?.cliente || {}) },
    });
  };

  const gerarProcuracao = async (event) => {
    event.preventDefault();
    if (!homologacaoModal) return;
    const { cliente, contrato } = homologacaoModal;
    setHomologacaoLoading(true);
    try {
      const procuracao = await request('/api/admin/procuracoes', {
        method: 'POST',
        body: JSON.stringify({
          clienteId: cliente.id,
          contratoId: contrato.id,
          titularMesmoContrato: homologacaoForm.titularMesmoContrato,
          titular: homologacaoForm.titularMesmoContrato ? undefined : {
            nome: homologacaoForm.nome,
            cpfCnpj: homologacaoForm.cpfCnpj,
            endereco: homologacaoForm.endereco,
          },
        }),
      });
      setProcuracoes(prev => prev.some(item => item.id === procuracao.id) ? prev.map(item => item.id === procuracao.id ? procuracao : item) : [procuracao, ...prev]);
      setHomologacaoModal(null);
      setActiveTab('procuracoes');
      showToast(
        procuracao.status === 'Pendente'
          ? `Homologação iniciada. A procuração foi vinculada ao ${contractNumber(contrato)} e enviada para aprovação.`
          : `A procuração vinculada ao ${contractNumber(contrato)} já está ${String(procuracao.status).toLowerCase()}.`,
        procuracao.status === 'Pendente' ? 'success' : 'info'
      );
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setHomologacaoLoading(false);
    }
  };

  const revisarProcuracao = async (procuracao, status) => {
    const motivo = status === 'Recusado' ? window.prompt('Informe o motivo da recusa:') : '';
    if (status === 'Recusado' && !motivo?.trim()) return;
    try {
      const updated = await request(`/api/admin/procuracoes/${procuracao.id}/revisao`, {
        method: 'PUT',
        body: JSON.stringify({ status, observacaoAnalise: motivo || '' }),
      });
      setProcuracoes(prev => prev.map(item => item.id === updated.id ? updated : item));
      showToast(`Procuração #${updated.id} ${status === 'Aprovado' ? 'aprovada' : 'recusada'} com sucesso.`, status === 'Aprovado' ? 'success' : 'warning');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const getProcuracaoDownloadUrl = (id) => (
    `${withApiBase(`/api/admin/procuracoes/${id}/download`)}?token=${localStorage.getItem('token')}`
  );
  const getProcuracaoPreviewUrl = (id) => (
    `${withApiBase(`/api/admin/procuracoes/${id}/preview`)}?token=${localStorage.getItem('token')}`
  );

  const updateContractManual = (field, value) => {
    setContractModal(prev => ({ ...prev, manual: { ...prev.manual, [field]: value } }));
  };

  const handleContratoGerado = (contrato) => {
    setContratos(prev => {
      const exists = prev.some(item => item.id === contrato.id);
      return exists ? prev.map(item => item.id === contrato.id ? contrato : item) : [contrato, ...prev];
    });
    setSelectedContrato(null);
    setContractModal({ open: false, orcamento: null, manual: emptyContractManual, equipamentoId: '' });
    setActiveTab('contratos');
    showToast(`Contrato ${contractNumber(contrato)} gerado com os dados do orçamento.`, 'success');
  };

  const gerarContratoPorOrcamento = async (orcamento, equipamentoId, manual) => {
    try {
      const contrato = await request('/api/admin/contratos', {
        method: 'POST',
        body: JSON.stringify({ orcamentoId: orcamento.id, equipamentoId, manual }),
      });
      handleContratoGerado(contrato);
      return contrato;
    } catch (err) {
      showToast(`Não foi possível gerar o contrato: ${err.message}`, 'error');
      return null;
    }
  };

  const gerarContrato = async (event) => {
    event.preventDefault();
    const { orcamento, equipamentoId, manual } = contractModal;
    if (!orcamento) return;

    const isClientContract = orcamento.source === 'cliente';
    const contrato = await request(isClientContract ? '/api/admin/contratos-direto' : '/api/admin/contratos', {
      method: 'POST',
      body: JSON.stringify(isClientContract
        ? { clienteId: orcamento.clienteId, equipamentoId, manual }
        : { orcamentoId: orcamento.id, equipamentoId, manual }),
    });
    handleContratoGerado(contrato);
  };

  const closeContractReview = () => {
    setSelectedContrato(null);
    setContractReviewForm(contractToReviewForm());
    setReviewNote('');
    setReviewError('');
  };

  const abrirRevisaoContrato = (contrato) => {
    setSelectedContrato(contrato);
    setContractReviewForm(contractToReviewForm(contrato));
    setReviewNote('');
    setReviewError('');
  };

  const updateContractReviewField = (field, value) => {
    setContractReviewForm(prev => ({ ...prev, [field]: value }));
    if (reviewError) setReviewError('');
  };

  const canEditReviewedContract = (contrato = selectedContrato) => (
    adminUser.role === 'ADM' && contrato && (contrato.status !== 'Aprovado' || isMasterAdmin)
  );

  const saveContractReview = async (contrato = selectedContrato, options = {}) => {
    if (!contrato || !canEditReviewedContract(contrato)) return contrato;
    if (!String(contractReviewForm.clienteNome || '').trim()) {
      setReviewError('Informe o nome do cliente antes de salvar.');
      return null;
    }

    try {
      const updated = await request(`/api/admin/contratos/${contrato.id}`, {
        method: 'PUT',
        body: JSON.stringify(contractReviewForm),
      });
      setContratos(prev => prev.map(item => item.id === updated.id ? updated : item));
      setSelectedContrato(updated);
      setContractReviewForm(contractToReviewForm(updated));
      if (!options.silent) showToast(`Contrato ${contractNumber(updated)} salvo com sucesso.`, 'success');
      return updated;
    } catch (err) {
      showToast(`Não foi possível salvar o contrato ${contractNumber(contrato)}: ${err.message}`, 'error');
      return null;
    }
  };

  const revisarContrato = async (contratoId, status) => {
    const normalizedReviewNote = reviewNote.trim();
    if (status === 'Recusado' && !normalizedReviewNote) {
      setReviewError('Informe o motivo da recusa antes de recusar o contrato.');
      return;
    }

    setReviewError('');
    const currentContract = selectedContrato || contratos.find(item => item.id === contratoId);

    try {
      if (!currentContract) throw new Error('Contrato não encontrado.');
      if (selectedContrato) {
        const saved = await saveContractReview(currentContract, { silent: true });
        if (!saved) return;
      }

      const contrato = await request(`/api/admin/contratos/${contratoId}/revisao`, {
        method: 'PUT',
        body: JSON.stringify({ status, observacaoAnalise: normalizedReviewNote }),
      });
      setContratos(prev => prev.map(item => item.id === contrato.id ? contrato : item));
      setSelectedContrato(null);
      setReviewNote('');
      setReviewError('');
      showToast(
        `Contrato ${contractNumber(contrato)} ${status === 'Aprovado' ? 'aprovado' : 'recusado'} com sucesso.`,
        status === 'Aprovado' ? 'success' : 'warning'
      );
    } catch (err) {
      showToast(`Não foi possível finalizar o contrato ${contractNumber(currentContract)}: ${err.message}`, 'error');
    }
  };

  const getContratoDownloadUrl = (contratoId) => (
    `${withApiBase(`/api/admin/contratos/${contratoId}/download`)}?token=${localStorage.getItem('token')}`
  );

  const getOrcamentoDownloadUrl = (orcamentoId) => (
    `${withApiBase(`/api/admin/orcamentos/${orcamentoId}/download`)}?token=${localStorage.getItem('token')}`
  );

  const renderContractReviewField = (label, field, options = {}) => {
    const value = contractReviewForm[field] ?? '';
    const editable = canEditReviewedContract();
    return (
      <label className="ctr-review-field">
        <span>{label}</span>
        {editable ? (
          options.type === 'textarea' ? (
            <textarea value={value} onChange={(event) => updateContractReviewField(field, event.target.value)} />
          ) : options.type === 'select' ? (
            <select value={value} onChange={(event) => updateContractReviewField(field, event.target.value)}>
              {(options.options || []).map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          ) : (
            options.money ? (
              <CurrencyInput
                value={value}
                onValueChange={(nextValue) => updateContractReviewField(field, nextValue)}
              />
            ) : <input
              type={options.type || 'text'}
              inputMode={options.inputMode}
              value={value}
              onChange={(event) => updateContractReviewField(field, event.target.value)}
            />
          )
        ) : (
          <strong>{options.format ? options.format(value) : (value || '—')}</strong>
        )}
      </label>
    );
  };

  const startNewEquipamento = () => {
    setEditingEquipamentoId(null);
    setEquipamentoForm(emptyEquipamentoForm);
    setProdutoSearch('');
    setTimeout(() => {
      equipamentoNomeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      equipamentoNomeRef.current?.focus();
    }, 50);
  };

  const editEquipamento = (item) => {
    setEditingEquipamentoId(item.id);
    setEquipamentoForm(equipamentoToForm(item));
    setTimeout(() => {
      equipamentoNomeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  };

  const duplicateEquipamento = (item) => {
    if (!item) return;
    setEditingEquipamentoId(null);
    setEquipamentoForm({
      ...equipamentoToForm(item),
      nome: `${item.nome || 'Produto'} - cópia`,
      active: true,
    });
  };

  const saveEquipamento = async (event) => {
    event.preventDefault();
    const isEditing = Boolean(editingEquipamentoId);
    try {
      const equipamento = await request(isEditing ? `/api/admin/equipamentos/${editingEquipamentoId}` : '/api/admin/equipamentos', {
        method: isEditing ? 'PUT' : 'POST',
        body: JSON.stringify(equipamentoForm),
      });
      setEquipamentos(prev => {
        const exists = prev.some(item => item.id === equipamento.id);
        return exists ? prev.map(item => item.id === equipamento.id ? equipamento : item) : [equipamento, ...prev];
      });
      setEditingEquipamentoId(equipamento.id);
      setEquipamentoForm(equipamentoToForm(equipamento));
      showToast(isEditing ? 'Produto atualizado.' : 'Produto criado com sucesso.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const toggleEquipamentoActive = async (item) => {
    if (!item) return;
    const equipamento = await request(`/api/admin/equipamentos/${item.id}`, {
      method: 'PUT',
      body: JSON.stringify({ ...item, active: !item.active }),
    });
    setEquipamentos(prev => prev.map(current => current.id === equipamento.id ? equipamento : current));
    if (editingEquipamentoId === equipamento.id) setEquipamentoForm(equipamentoToForm(equipamento));
  };

  const saveContractConfig = async (event) => {
    event.preventDefault();
    try {
      const config = await request('/api/admin/contrato-config', {
        method: 'PUT',
        body: JSON.stringify(contractConfig),
      });
      setContractConfig(config);
      showToast('Configuração do contrato salva.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const createDespesaFixa = async (event) => {
    event.preventDefault();
    try {
      await request('/api/admin/despesas-fixas', {
        method: 'POST',
        body: JSON.stringify(despesaForm),
      });
      setDespesaForm({ nome: '', valor: '', categoria: '' });
      const updated = await request('/api/admin/financeiro');
      setFinanceiro(updated);
      showToast('Despesa fixa adicionada.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const updateDespesaFixa = async (item, payload) => {
    await request(`/api/admin/despesas-fixas/${item.id}`, {
      method: 'PUT',
      body: JSON.stringify({ ...item, ...payload }),
    });
    setFinanceiro(await request('/api/admin/financeiro'));
  };

  return (
    <div className={`admin-layout ${isSidebarOpen ? 'sidebar-open' : ''}`}>
      {/* Toast notifications */}
      <div className="toast-container" aria-live="polite">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast toast-${toast.type}`} role="alert">
            <span className="toast-icon">{toast.icon}</span>
            <span className="toast-body"><span className="toast-title">{toast.message}</span></span>
            <button className="toast-close" onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))} aria-label="Fechar">×</button>
          </div>
        ))}
      </div>

      {isSidebarOpen && <div className="sidebar-overlay" onClick={() => setIsSidebarOpen(false)}></div>}
      <aside className="admin-sidebar">
        <div className="sidebar-header">
          <Link to="/">
            <img src="/assets/logo.png" alt="DRM Admin" className="sidebar-logo-img" />
          </Link>
          <span className="sidebar-badge">{adminUser.role}</span>
          <button type="button" className="sidebar-close-button" onClick={() => setIsSidebarOpen(false)} aria-label="Fechar menu">×</button>
        </div>

        <nav className="sidebar-nav">
          {navigationGroups.map(group => (
            <div className="nav-group" key={group.title}>
              <span className="nav-group-label">{group.title}</span>
              {group.tabs.map(tab => (
                <button
                  key={tab.id}
                  className={`nav-item ${activeTab === tab.id ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setIsSidebarOpen(false);
                  }}
                >
                  <span className="icon"><SidebarIcon name={tab.id} /></span>
                  <span className="nav-label">{tab.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="admin-user-info">
            <div className="avatar">{adminUser.nome.charAt(0)}</div>
            <div className="info">
              <strong>{adminUser.nome}</strong>
              <span>{adminUser.username || adminUser.email}</span>
            </div>
          </div>
        </div>
      </aside>

      <main className="admin-main-content">
        <header className="admin-topbar">
          <button className="mobile-menu-toggle" onClick={() => setIsSidebarOpen(true)}>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
          </button>
          <div className="topbar-main">
            <h2>{tabs.find(tab => tab.id === activeTab)?.label || 'Painel'}</h2>
            <div className="quick-action-bar" aria-label="Ações rápidas">
              {quickActions.map(action => (
                <button
                  key={action.id}
                  className={`quick-action-btn ${activeTab === action.tab ? 'active' : ''}`}
                  onClick={() => handleQuickAction(action)}
                  type="button"
                >
                  <span className="quick-action-icon"><SidebarIcon name={action.tab} /></span>
                  <span>{action.label}</span>
                  {Number(action.badge || 0) > 0 && <em>{action.badge}</em>}
                </button>
              ))}
            </div>
          </div>
          <div className="topbar-actions">
            <span className="system-status">DRM Solar</span>
            <button onClick={handleSair} className="topbar-logout">Sair</button>
          </div>
        </header>

        <div className="admin-body fade-in">
          {error && <p className="error-message">{error}</p>}

          {activeTab === 'dashboard' && !resumo && (
            <div className="admin-card">
              <div className="card-header-flex compact">
                <div>
                  <h3>Carregando painel geral</h3>
                  <p className="muted-text">Se você estava usando um acesso antigo, faça login novamente com um usuário oficial e confirme o e-mail.</p>
                </div>
                <button type="button" className="btn btn-outline btn-sm-admin" onClick={handleSair}>Entrar novamente</button>
              </div>
            </div>
          )}

          {activeTab === 'dashboard' && resumo && (
            <div className="crm-dashboard">
              <div className="section-heading">
                <div>
                  <span className="section-kicker">Controle geral</span>
                  <h3>Painel de ação</h3>
                  <p>Comece pelo que exige resposta hoje: leads novos, retornos, contratos pendentes e projetos críticos.</p>
                </div>
                <div className="section-stats">
                  <div><strong>{money(resumo.kpis?.valorAprovadoMes)}</strong><span>vendido no mês</span></div>
                  <div><strong>{resumo.kpis?.retornosSemana || 0}</strong><span>retornos 7 dias</span></div>
                  <div><strong>{resumo.kpis?.projetosAtivos || 0}</strong><span>projetos ativos</span></div>
                </div>
              </div>

              <div className="dashboard-action-strip">
                <button type="button" className="dashboard-action-card urgent" onClick={() => setActiveTab('leads')}>
                  <span>Atender agora</span>
                  <strong>{resumo.kpis?.novos || 0}</strong>
                  <small>lead{(resumo.kpis?.novos || 0) === 1 ? '' : 's'} novo{(resumo.kpis?.novos || 0) === 1 ? '' : 's'}</small>
                </button>
                <button type="button" className="dashboard-action-card" onClick={() => setActiveTab('leads')}>
                  <span>Retornos</span>
                  <strong>{resumo.proximosRetornos?.length || 0}</strong>
                  <small>agendado{(resumo.proximosRetornos?.length || 0) === 1 ? '' : 's'}</small>
                </button>
                <button type="button" className="dashboard-action-card warning" onClick={() => setActiveTab('contratos')}>
                  <span>Aprovar contratos</span>
                  <strong>{resumo.kpis?.contratosPendentes || 0}</strong>
                  <small>pendente{(resumo.kpis?.contratosPendentes || 0) === 1 ? '' : 's'}</small>
                </button>
                <button type="button" className="dashboard-action-card" onClick={() => setActiveTab('projetos')}>
                  <span>Projetos críticos</span>
                  <strong>{resumo.projetosCriticos?.length || 0}</strong>
                  <small>com atenção</small>
                </button>
                <button type="button" className="dashboard-action-card warning" onClick={() => setActiveTab('ordensServico')}>
                  <span>O.S abertas</span>
                  <strong>{resumo.kpis?.osAbertas || 0}</strong>
                  <small>{resumo.kpis?.osEmAtendimento || 0} em atendimento</small>
                </button>
                <button type="button" className="dashboard-action-card urgent" onClick={() => setActiveTab('usuarios')}>
                  <span>Acessos sem e-mail</span>
                  <strong>{resumo.kpis?.acessosSemRecuperacao || 0}</strong>
                  <small>usuário{(resumo.kpis?.acessosSemRecuperacao || 0) !== 1 ? 's' : ''} sem e-mail cadastrado</small>
                </button>
              </div>

              <div className="crm-kpi-grid">
                <button type="button" className="crm-kpi-card primary" onClick={() => setActiveTab('leads')}><span>Leads captados</span><strong>{resumo.kpis?.leads || 0}</strong><p>{resumo.kpis?.novos || 0} aguardando primeiro atendimento.</p></button>
                <button type="button" className="crm-kpi-card" onClick={() => setActiveTab('orcamentos')}><span>Orçamentos</span><strong>{resumo.kpis?.orcamentos || 0}</strong><p>Simulações registradas no sistema.</p></button>
                <button type="button" className="crm-kpi-card" onClick={() => setActiveTab('contratos')}><span>Contratos</span><strong>{resumo.kpis?.contratos || 0}</strong><p>{resumo.kpis?.contratosPendentes || 0} pendentes, {resumo.kpis?.contratosAprovados || 0} aprovados.</p></button>
                <button type="button" className="crm-kpi-card" onClick={() => setActiveTab('contratos')}><span>Valor pendente</span><strong>{money(resumo.kpis?.valorPendenteContratos)}</strong><p>Em contratos aguardando aprovação.</p></button>
              </div>

              <div className="ops-insight-grid">
                <button type="button" className="ops-insight-card" onClick={() => setActiveTab('contratos')}>
                  <span>Contratos por status</span>
                  <strong>{resumo.operacao?.contratosTotal || 0} totais</strong>
                  <p>{resumo.operacao?.contratosPendentes || 0} pendentes • {resumo.operacao?.contratosAprovados || 0} aprovados • {resumo.operacao?.contratosRecusados || 0} recusados</p>
                </button>
                <button type="button" className="ops-insight-card" onClick={() => setActiveTab('ordensServico')}>
                  <span>Pendências técnicas</span>
                  <strong>{resumo.operacao?.ordensServicoAbertas || 0} O.S abertas</strong>
                  <p>{resumo.operacao?.ordensServicoEmAtendimento || 0} já em atendimento pela equipe.</p>
                </button>
                <button type="button" className="ops-insight-card" onClick={() => setActiveTab('usuarios')}>
                  <span>Usuários com e-mail</span>
                  <strong>{resumo.operacao?.acessosComRecuperacao || 0} ativos</strong>
                  <p>{resumo.operacao?.acessosSemRecuperacao || 0} usuário{(resumo.operacao?.acessosSemRecuperacao || 0) !== 1 ? 's' : ''} ainda precisam cadastrar e-mail de recuperação.</p>
                </button>
                <button type="button" className="ops-insight-card" onClick={() => setActiveTab('usuarios')}>
                  <span>Aguardando primeiro acesso</span>
                  <strong>{resumo.operacao?.senhasTemporarias || 0}</strong>
                  <p>Usuários que ainda não trocaram a senha temporária.</p>
                </button>
              </div>

              {adminUser.permissions?.verTodosLeads || adminUser.role === 'ADM' ? (
                <>
                  <div className="section-heading analytics-heading">
                    <div>
                      <span className="section-kicker">Métricas do site</span>
                      <h3>Cliques e conversão da LP</h3>
                      <p>Acompanhe visitas, intenção de simular e procura pelo WhatsApp nos últimos 30 dias.</p>
                    </div>
                    <div className="section-stats">
                      <div><strong>{resumo.siteAnalytics?.visitas7d || 0}</strong><span>visitas 7 dias</span></div>
                      <div><strong>{resumo.siteAnalytics?.whatsapp7d || 0}</strong><span>WhatsApp 7 dias</span></div>
                      <div><strong>{resumo.siteAnalytics?.concluidas7d || 0}</strong><span>simulações 7 dias</span></div>
                    </div>
                  </div>

                  <div className="crm-kpi-grid analytics-kpi-grid">
                    <div className="crm-kpi-card analytics-card"><span>Visitas no site</span><strong>{resumo.kpis?.visitasSite30d || 0}</strong><p>Total de páginas abertas nos últimos 30 dias.</p></div>
                    <div className="crm-kpi-card analytics-card"><span>Cliques no WhatsApp</span><strong>{resumo.kpis?.clicksWhatsApp30d || 0}</strong><p>{percent(resumo.siteAnalytics?.conversaoWhatsApp30d)} de conversão por visita.</p></div>
                    <div className="crm-kpi-card analytics-card"><span>Cliques em simular</span><strong>{resumo.kpis?.clicksSimular30d || 0}</strong><p>Pessoas que abriram intenção de calcular economia.</p></div>
                    <div className="crm-kpi-card analytics-card"><span>Simulações concluídas</span><strong>{resumo.kpis?.simulacoesConcluidas30d || 0}</strong><p>{percent(resumo.siteAnalytics?.conversaoSimulacao30d)} concluem após clicar em simular.</p></div>
                  </div>

                  <div className="rr-leads-panel">
                    <div className="section-heading rr-leads-heading">
                      <div>
                        <span className="section-kicker">Meta Ads</span>
                        <h3>Captura via /rleads</h3>
                        <p>Rodízio automático no servidor para os anúncios que apontam direto para o WhatsApp.</p>
                      </div>
                      <div className="section-stats">
                        <div><strong>{resumo.roundRobinLeads?.total || 0}</strong><span>leads totais</span></div>
                        <div><strong>{resumo.roundRobinLeads?.last24h || 0}</strong><span>últimas 24h</span></div>
                        <div><strong>{resumo.roundRobinLeads?.status?.ok ? 'OK' : 'Atenção'}</strong><span>distribuição</span></div>
                      </div>
                    </div>

                    <div className="rr-status-card">
                      <div>
                        <strong>{resumo.roundRobinLeads?.status?.message || 'Aguardando primeiros acessos.'}</strong>
                        <span>Próximo vendedor: {resumo.roundRobinLeads?.nextSeller?.phone || 'não definido'} • rota ativa em /rleads</span>
                      </div>
                      <span className={`status-badge ${resumo.roundRobinLeads?.status?.ok ? 'success' : 'warning'}`}>
                        {resumo.roundRobinLeads?.enabled ? 'online' : 'offline'}
                      </span>
                    </div>

                    <div className="rr-seller-grid">
                      {(resumo.roundRobinLeads?.bySeller || []).map(seller => (
                        <div className="rr-seller-card" key={seller.phone}>
                          <div className="rr-seller-top">
                            <span>Vendedor {seller.position}</span>
                            <strong>{seller.total || 0}</strong>
                          </div>
                          <p>{seller.phone}</p>
                          <div className="pipeline-bar orange"><span style={{ width: `${Math.min((seller.percent || 0) * 100, 100)}%` }}></span></div>
                          <small>{percent(seller.percent || 0)} dos redirecionamentos</small>
                        </div>
                      ))}
                    </div>

                    <div className="admin-card rr-recent-card">
                      <div className="card-header-flex compact">
                        <h3>Últimos acessos /rleads</h3>
                        <span className="status-badge success">{resumo.roundRobinLeads?.recent?.length || 0}</span>
                      </div>
                      <div className="mobile-list">
                        {(resumo.roundRobinLeads?.recent || []).slice(0, 8).map(item => (
                          <div className="mobile-list-item rr-recent-item" key={item.id}>
                            <div>
                              <strong>Vendedor {item.sellerPosition} • {item.sellerPhone}</strong>
                              <span>{item.ip || 'IP não identificado'} • {item.referer || 'Sem referer'}</span>
                              {Object.keys(item.utmParams || {}).length > 0 && <small>{Object.entries(item.utmParams).map(([key, value]) => `${key}=${value}`).join(' • ')}</small>}
                            </div>
                            <em>{item.createdAt ? new Date(item.createdAt).toLocaleString('pt-BR') : 'Sem data'}</em>
                          </div>
                        ))}
                        {(resumo.roundRobinLeads?.recent || []).length === 0 && <p className="muted-text">Os acessos da campanha aparecerão aqui em tempo real após usar /rleads.</p>}
                      </div>
                    </div>
                  </div>
                </>
              ) : null}

              <div className="crm-grid">
                <div className="admin-card">
                  <div className="card-header-flex compact">
                    <h3>Funil comercial</h3>
                    <span className="status-badge warning">tempo real</span>
                  </div>
                  <div className="pipeline-list">
                    {Object.entries(resumo.leadsPorStatus || {}).map(([status, total]) => (
                      <div className="pipeline-item" key={status}>
                        <div><strong>{status}</strong><span>{total} lead{total === 1 ? '' : 's'}</span></div>
                        <div className="pipeline-bar"><span style={{ width: `${Math.min((total / Math.max(resumo.kpis?.leads || 1, 1)) * 100, 100)}%` }}></span></div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="admin-card">
                  <div className="card-header-flex compact">
                    <h3>{adminUser.permissions?.verTodosLeads || adminUser.role === 'ADM' ? 'Origem dos cliques' : 'Projetos por etapa'}</h3>
                    {adminUser.permissions?.verTodosLeads || adminUser.role === 'ADM'
                      ? <span className="status-badge success">30 dias</span>
                      : <button className="btn btn-outline btn-sm-admin" onClick={() => setActiveTab('projetos')}>Abrir projetos</button>}
                  </div>
                  <div className="pipeline-list">
                    {(adminUser.permissions?.verTodosLeads || adminUser.role === 'ADM'
                      ? (resumo.siteAnalytics?.topSources || [])
                      : (resumo.projetosPorEtapa || [])
                    ).map(item => (
                      <div className="pipeline-item" key={item.source || item.etapa}>
                        <div>
                          <strong>{item.source ? labelSiteEvent(item.source) : item.etapa}</strong>
                          <span>{item.total} {item.source ? 'evento' : 'projeto'}{item.total === 1 ? '' : 's'}</span>
                        </div>
                        <div className="pipeline-bar orange"><span style={{ width: `${Math.min((item.total / Math.max(resumo.siteAnalytics?.totalEventos30d || resumo.kpis?.projetosAtivos || 1, 1)) * 100, 100)}%` }}></span></div>
                      </div>
                    ))}
                    {(adminUser.permissions?.verTodosLeads || adminUser.role === 'ADM') && (resumo.siteAnalytics?.topSources || []).length === 0 && <p className="muted-text">As métricas começam a aparecer após os primeiros acessos.</p>}
                  </div>
                </div>
              </div>

              <div className="crm-grid">
                <div className="admin-card">
                  <div className="card-header-flex compact">
                    <h3>Próximos retornos</h3>
                    <span className="status-badge success">{resumo.proximosRetornos?.length || 0}</span>
                  </div>
                  <div className="mobile-list">
                    {(resumo.proximosRetornos || []).slice(0, 5).map(lead => (
                      <div className="mobile-list-item" key={lead.id}>
                        <div><strong>{lead.nome}</strong><span>{lead.cidade || 'Cidade não informada'} • {getResponsibleName(lead.assignedUserName)}</span></div>
                        <em>{dateBr(lead.proximoRetorno)}</em>
                      </div>
                    ))}
                    {(resumo.proximosRetornos || []).length === 0 && <p className="muted-text">Nenhum retorno agendado.</p>}
                    {(resumo.proximosRetornos || []).length > 5 && <button type="button" className="btn btn-outline btn-sm-admin dashboard-list-action" onClick={() => setActiveTab('leads')}>Ver todos os retornos</button>}
                  </div>
                </div>

                <div className="admin-card">
                  <div className="card-header-flex compact">
                    <h3>Projetos críticos</h3>
                    <span className="status-badge warning">prazos</span>
                  </div>
                  <div className="mobile-list">
                    {(resumo.projetosCriticos || []).slice(0, 5).map(projeto => (
                      <div className="mobile-list-item" key={projeto.id}>
                        <div><strong>{projeto.clienteNome}</strong><span>{projeto.etapa} • {getResponsibleName(projeto.responsavelNome)}</span></div>
                        <em>{dateBr(projeto.prazoPrevisto)}</em>
                      </div>
                    ))}
                    {(resumo.projetosCriticos || []).length === 0 && <p className="muted-text">Nenhum projeto crítico.</p>}
                    {(resumo.projetosCriticos || []).length > 5 && <button type="button" className="btn btn-outline btn-sm-admin dashboard-list-action" onClick={() => setActiveTab('projetos')}>Ver todos os projetos</button>}
                  </div>
                </div>
              </div>

              <div className="admin-card">
                <div className="card-header-flex compact">
                  <h3>Últimas atividades da equipe</h3>
                  <span className="status-badge success">{resumo.atividadesRecentes?.length || 0}</span>
                </div>
                <div className="activity-feed">
                  {(resumo.atividadesRecentes || []).map(atividade => (
                    <div className="activity-feed-item" key={atividade.id}>
                      <strong>{atividade.tipo} • {atividade.clienteNome}</strong>
                      <span>{atividade.descricao}</span>
                      <em>{atividade.criadoPorNome} em {dateBr(atividade.createdAt)}</em>
                    </div>
                  ))}
                  {(resumo.atividadesRecentes || []).length === 0 && <p className="muted-text">Ainda não há atividades registradas.</p>}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'clientes' && (
            <div className="admin-section client-screen">
              {/* Modal de Suspensão */}
              {suspensaoModal && (
                <div className="contract-modal-backdrop">
                  <div className="suspensao-modal">
                    <div className="suspensao-modal-header">
                      <div>
                        <h3>Suspender Venda</h3>
                        <p>{suspensaoModal.nome}</p>
                      </div>
                      <button type="button" className="lead-modal-close" onClick={() => { setSuspensaoModal(null); setSuspensaoForm({ motivo: '', dataPrevisaoRetorno: '', ultimoContato: '', proximaAcao: '' }); }}>×</button>
                    </div>
                    <div className="suspensao-modal-body">
                      <div className="cc-field">
                        <label className="cc-label">Motivo da suspensão <span className="cc-required">*</span></label>
                        <textarea
                          className="cc-input cc-textarea"
                          placeholder="Descreva o motivo: cliente pausou, não respondeu, pediu para aguardar..."
                          value={suspensaoForm.motivo}
                          onChange={e => setSuspensaoForm(prev => ({ ...prev, motivo: e.target.value }))}
                          rows={3}
                        />
                      </div>
                      <div className="suspensao-modal-row">
                        <div className="cc-field">
                          <label className="cc-label">Data prevista de retorno</label>
                          <input type="date" className="cc-input" value={suspensaoForm.dataPrevisaoRetorno} onChange={e => setSuspensaoForm(prev => ({ ...prev, dataPrevisaoRetorno: e.target.value }))} />
                        </div>
                        <div className="cc-field">
                          <label className="cc-label">Último contato</label>
                          <input type="date" className="cc-input" value={suspensaoForm.ultimoContato} onChange={e => setSuspensaoForm(prev => ({ ...prev, ultimoContato: e.target.value }))} />
                        </div>
                      </div>
                      <div className="cc-field">
                        <label className="cc-label">Próxima ação</label>
                        <select className="cc-input" value={suspensaoForm.proximaAcao} onChange={e => setSuspensaoForm(prev => ({ ...prev, proximaAcao: e.target.value }))}>
                          <option value="">Selecione a próxima ação</option>
                          <option value="Ligar">Ligar</option>
                          <option value="Mandar mensagem">Mandar mensagem</option>
                          <option value="Enviar nova proposta">Enviar nova proposta</option>
                          <option value="Aguardar cliente">Aguardar cliente</option>
                        </select>
                      </div>
                    </div>
                    <div className="suspensao-modal-footer">
                      <button type="button" className="cc-btn-cancel" onClick={() => { setSuspensaoModal(null); setSuspensaoForm({ motivo: '', dataPrevisaoRetorno: '', ultimoContato: '', proximaAcao: '' }); }}>Cancelar</button>
                      <button type="button" className="btn btn-danger" onClick={() => updateClienteEtapa(suspensaoModal.id, 'Venda suspensa', suspensaoForm)} disabled={!suspensaoForm.motivo.trim()}>Confirmar Suspensão</button>
                    </div>
                  </div>
                </div>
              )}

              {clientView === 'new' ? (
                <div className="cc-page">
                  <div className="cc-page-header">
                    <div className="cc-page-title">
                      <svg className="cc-page-icon" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M16 11a4 4 0 1 0-3.2-6.4A5 5 0 0 1 15 9c0 .7-.1 1.4-.4 2H16Zm-8 0a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-3.3 0-6 1.7-6 3.8V19h12v-2.2C14 14.7 11.3 13 8 13Zm8 0c-.6 0-1.1.1-1.7.2 1.1.9 1.7 2.1 1.7 3.6V19h6v-2.2c0-2.1-2.7-3.8-6-3.8Z" />
                      </svg>
                      <h3>{novoCliente.id ? 'Editar Cliente' : 'Cadastrar Cliente'} <span className="cc-badge">{novoCliente.id ? '(Dados do cliente)' : '(Cadastro Básico)'}</span></h3>
                    </div>
                    <nav className="cc-breadcrumb" aria-label="Navegação">
                      <button type="button" className="cc-breadcrumb-link" onClick={() => { setClientView('list'); setNovoCliente(emptyClientForm); }}>Clientes</button>
                      <span className="cc-breadcrumb-sep">&gt;</span>
                      <span>{novoCliente.id ? 'Editar Cliente' : 'Cadastrar Cliente'}</span>
                    </nav>
                  </div>

                  <div className="admin-card cc-card">
                    <form onSubmit={createCliente} className="cc-form">
                      <div className="cc-fields">
                        <div className="cc-field">
                          <label className="cc-label">Nome completo <span className="cc-required">*</span></label>
                          <input className="cc-input" placeholder="Digite o nome completo do cliente" value={novoCliente.nome} onChange={(e) => setNovoCliente(prev => ({ ...prev, nome: e.target.value }))} required />
                        </div>
                        <div className="cc-field">
                          <label className="cc-label">CPF <span className="cc-required">*</span></label>
                          <input className="cc-input" placeholder="000.000.000-00" value={novoCliente.cpfCnpj} onChange={(e) => setNovoCliente(prev => ({ ...prev, cpfCnpj: maskCpf(e.target.value) }))} />
                        </div>
                        <div className="cc-address-block">
                          <p className="cc-section-label">Endereço completo <span className="cc-required">*</span></p>
                          <div className="cc-row cc-row-rua">
                            <div className="cc-field">
                              <label className="cc-label">Rua <span className="cc-required">*</span></label>
                              <input className="cc-input" placeholder="Digite o nome da rua" value={novoCliente.endereco} onChange={(e) => setNovoCliente(prev => ({ ...prev, endereco: e.target.value }))} />
                            </div>
                            <div className="cc-field">
                              <label className="cc-label">Número <span className="cc-required">*</span></label>
                              <input className="cc-input" placeholder="Digite o número" value={novoCliente.numero} onChange={(e) => setNovoCliente(prev => ({ ...prev, numero: e.target.value }))} />
                            </div>
                          </div>
                          <div className="cc-row cc-row-2">
                            <div className="cc-field">
                              <label className="cc-label">Bairro <span className="cc-required">*</span></label>
                              <input className="cc-input" placeholder="Digite o bairro" value={novoCliente.bairro} onChange={(e) => setNovoCliente(prev => ({ ...prev, bairro: e.target.value }))} />
                            </div>
                            <div className="cc-field">
                              <label className="cc-label">Complemento</label>
                              <input className="cc-input" placeholder="Digite o complemento" value={novoCliente.complemento} onChange={(e) => setNovoCliente(prev => ({ ...prev, complemento: e.target.value }))} />
                            </div>
                          </div>
                          <div className="cc-row cc-row-3">
                            <div className="cc-field">
                              <label className="cc-label">CEP <span className="cc-required">*</span></label>
                              <input className="cc-input" placeholder="00000-000" value={novoCliente.cep} onChange={(e) => setNovoCliente(prev => ({ ...prev, cep: maskCep(e.target.value) }))} />
                            </div>
                            <div className="cc-field">
                              <label className="cc-label">Cidade <span className="cc-required">*</span></label>
                              <input className="cc-input" placeholder="Digite a cidade" value={novoCliente.cidade} onChange={(e) => setNovoCliente(prev => ({ ...prev, cidade: e.target.value }))} required />
                            </div>
                            <div className="cc-field">
                              <label className="cc-label">Estado <span className="cc-required">*</span></label>
                              <select className="cc-input" value={novoCliente.estado} onChange={(e) => setNovoCliente(prev => ({ ...prev, estado: e.target.value }))}>
                                <option value="">Selecione</option>
                                {ESTADOS_BR.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                              </select>
                            </div>
                          </div>
                        </div>
                        <div className="cc-field">
                          <label className="cc-label">WhatsApp <span className="cc-required">*</span></label>
                          <input className="cc-input" placeholder="(00) 00000-0000" value={novoCliente.whatsapp} onChange={(e) => setNovoCliente(prev => ({ ...prev, whatsapp: maskWhatsapp(e.target.value) }))} required />
                        </div>
                        <div className="cc-field">
                          <label className="cc-label">E-mail</label>
                          <input className="cc-input" type="email" placeholder="exemplo@email.com" value={novoCliente.email} onChange={(e) => setNovoCliente(prev => ({ ...prev, email: e.target.value }))} />
                        </div>
                        <div className="cc-field">
                          <label className="cc-label">Observações</label>
                          <textarea className="cc-input cc-textarea" placeholder="Digite observações adicionais sobre o cliente (opcional)" value={novoCliente.observacoes} onChange={(e) => setNovoCliente(prev => ({ ...prev, observacoes: e.target.value }))} />
                        </div>
                      </div>
                      <div className="cc-footer">
                        <button type="button" className="cc-btn-cancel" onClick={() => { setClientView('list'); setNovoCliente(emptyClientForm); }}>
                          <span aria-hidden="true">✕</span> Cancelar
                        </button>
                        <button type="submit" className="cc-btn-save">
                          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7l-4-4Zm-5 16a3 3 0 1 1 0-6 3 3 0 0 1 0 6Zm3-10H5V5h10v4Z" fill="currentColor" /></svg>
                          Salvar Cliente
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              ) : (
                <>
                  {/* ── Cabeçalho com stats ── */}
                  <div className="clients-page-header">
                    <div className="clients-header-left">
                      <span className="section-kicker">Base comercial</span>
                      <h3>Clientes</h3>
                      <p>Cadastre, encontre e gerencie etapas comerciais sem sair da tela.</p>
                    </div>
                    <div className="clients-stats-row">
                      <div className="cst-card">
                        <strong>{clientes.length}</strong>
                        <span>Total</span>
                      </div>
                      <div className="cst-card cst-negociacao">
                        <strong>{clientSummary.emNegociacao}</strong>
                        <span>Em negociação</span>
                      </div>
                      <div className="cst-card cst-concluida">
                        <strong>{clientSummary.vendaConcluida}</strong>
                        <span>Concluídas</span>
                      </div>
                      <div className="cst-card cst-suspensa">
                        <strong>{clientSummary.vendaSuspensa}</strong>
                        <span>Suspensas</span>
                      </div>
                    </div>
                  </div>

                  {/* Vendas Suspensas info area */}
                  {clientEtapaFilter === 'Venda suspensa' && clientSummary.vendaSuspensa > 0 && (
                    <div className="admin-card vendas-suspensas-info">
                      <div className="vendas-suspensas-header">
                        <div>
                          <h4>Vendas Suspensas</h4>
                          <p className="muted-text">Clientes que pausaram, sumiram ou pediram para aguardar. Acompanhe e retome contato.</p>
                        </div>
                        <span className="etapa-chip etapa-suspensa">{clientSummary.vendaSuspensa} suspenso{clientSummary.vendaSuspensa !== 1 ? 's' : ''}</span>
                      </div>
                      {/* Group by consultant */}
                      {(() => {
                        const suspensas = clientes.filter(c => (c.etapaComercial || 'Em negociação') === 'Venda suspensa');
                        const byConsultor = suspensas.reduce((acc, c) => {
                          const key = c.consultorNome || 'Sem consultor';
                          acc[key] = [...(acc[key] || []), c];
                          return acc;
                        }, {});
                        return Object.entries(byConsultor).map(([consultor, clientesSusp]) => (
                          <div key={consultor} className="vendas-suspensas-consultor">
                            <strong className="consultor-label">{consultor}</strong>
                            <div className="vendas-suspensas-list">
                              {clientesSusp.map(cs => (
                                <div key={cs.id} className="venda-suspensa-item">
                                  <div className="venda-suspensa-info">
                                    <strong>{cs.nome}</strong>
                                    <span>{cs.whatsapp || 'Sem WhatsApp'} • {[cs.cidade, cs.estado].filter(Boolean).join('/')}</span>
                                    <em className="motivo-suspensao">{cs.motivoSuspensao || 'Motivo não informado'}</em>
                                    {cs.dataPrevisaoRetorno && <span className="retorno-date">Retorno: {dateBr(cs.dataPrevisaoRetorno)}</span>}
                                    {cs.proximaAcaoComercial && <span className="proxima-acao">Próxima ação: {cs.proximaAcaoComercial}</span>}
                                  </div>
                                  <div className="venda-suspensa-acoes">
                                    {cs.whatsapp && (
                                      <a className="btn btn-primary btn-sm-admin" href={`https://wa.me/55${String(cs.whatsapp).replace(/\D/g,'').startsWith('55') ? String(cs.whatsapp).replace(/\D/g,'').slice(2) : String(cs.whatsapp).replace(/\D/g,'')}?text=${whatsappClientMessage(cs)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                                    )}
                                    <button type="button" className="btn btn-outline btn-sm-admin" style={{color:'#16a34a',borderColor:'#16a34a'}} onClick={() => updateClienteEtapa(cs.id, 'Em negociação', {})}>Retomar</button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                  )}

                  <div className="admin-card clients-table-card">
                    <div className="clients-table-toolbar">
                      <div className="clients-toolbar-left">
                        <div className="clients-search-wrap">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><circle cx="10" cy="10" r="7"/><line x1="21" y1="21" x2="15" y2="15"/></svg>
                          <input
                            placeholder="Buscar por nome, WhatsApp, cidade ou e-mail..."
                            value={clientSearch}
                            onChange={(event) => setClientSearch(event.target.value)}
                          />
                        </div>
                        <div className="clients-filter-tabs">
                          {[['todos','Todos'],['Em negociação','Em negociação'],['Venda concluída','Concluídas'],['Venda suspensa','Suspensas']].map(([val, label]) => (
                            <button key={val} type="button"
                              className={`cft-btn ${clientEtapaFilter === val ? 'active' : ''} ${val === 'Venda suspensa' ? 'cft-suspensa' : val === 'Venda concluída' ? 'cft-concluida' : val === 'Em negociação' ? 'cft-negociacao' : ''}`}
                              onClick={() => setClientEtapaFilter(val)}>{label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="clients-toolbar-right">
                        <span className="clients-count">{clientSummary.filtered.length} cliente{clientSummary.filtered.length !== 1 ? 's' : ''}</span>
                        {hasPermission('gerenciarClientes') && (
                          <button type="button" className="btn btn-primary" onClick={() => { setNovoCliente(emptyClientForm); setClientView('new'); }}>
                            + Cadastrar
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="table-container">
                      <table className="modern-table client-table-v2">
                        <thead>
                          <tr>
                            <th style={{width:'42px'}}>#</th>
                            <th>Cliente</th>
                            <th>WhatsApp</th>
                            <th>Cidade / UF</th>
                            <th>Cadastro</th>
                            <th>Etapa</th>
                            <th style={{width:'1%'}}>Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {clientSummary.filtered.map(c => {
                            const whatsappDigits = String(c.whatsapp || '').replace(/\D/g, '');
                            const whatsappHref = whatsappDigits ? `https://wa.me/55${whatsappDigits.startsWith('55') ? whatsappDigits.slice(2) : whatsappDigits}?text=${whatsappClientMessage(c)}` : '';
                            const etapa = c.etapaComercial || 'Em negociação';
                            const existingContract = getClientContract(c);
                            const dataFormatada = c.dataCadastro ? c.dataCadastro.slice(0,10).split('-').reverse().join('/') : '—';
                            return (
                              <tr key={c.id} className="client-row">
                                <td className="col-id text-muted">{c.id}</td>
                                <td className="col-nome">
                                  <span className="client-name">{c.nome}</span>
                                </td>
                                <td className="col-wp">
                                  {c.whatsapp ? (
                                    <a href={whatsappHref || '#'} target="_blank" rel="noopener noreferrer" className="wp-cell-link" title="Abrir WhatsApp">
                                      <svg width="15" height="15" viewBox="0 0 24 24" fill="#25d366" flexShrink="0"><path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.37 5.07L2 22l5.12-1.34A9.94 9.94 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2Zm5.16 14.09c-.22.61-1.27 1.17-1.75 1.21-.44.04-.9.17-2.97-.62-2.51-.97-4.12-3.5-4.24-3.66-.12-.16-1-1.33-1-2.54 0-1.21.64-1.8.86-2.05.22-.25.48-.31.64-.31.16 0 .32.01.46.01.15 0 .35-.06.54.41.2.5.69 1.71.75 1.83.06.12.1.26.02.42-.08.16-.12.26-.24.4-.12.14-.25.32-.36.43-.12.11-.24.23-.1.45.14.22.62.97 1.33 1.57.91.79 1.68 1.03 1.9 1.15.22.12.35.1.48-.06.13-.16.55-.64.7-.86.15-.22.3-.18.5-.11.2.07 1.28.6 1.5.71.22.11.36.17.41.27.05.1.05.57-.17 1.18Z"/></svg>
                                      {c.whatsapp}
                                    </a>
                                  ) : <span className="text-muted">—</span>}
                                </td>
                                <td>{[c.cidade, c.estado].filter(Boolean).join(' / ') || '—'}</td>
                                <td className="text-muted">{dataFormatada}</td>
                                <td>
                                  <div className="etapa-cell">
                                    <span className={`etapa-chip ${etapa === 'Venda concluída' ? 'etapa-concluida' : etapa === 'Venda suspensa' ? 'etapa-suspensa' : 'etapa-negociacao'}`}>{etapa}</span>
                                    <div className="etapa-change-btns">
                                      {etapa !== 'Venda concluída' && <button type="button" className="etapa-micro-btn concluir" title="Marcar como Venda Concluída" onClick={() => updateClienteEtapa(c.id, 'Venda concluída', {})}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg></button>}
                                      {etapa !== 'Em negociação' && <button type="button" className="etapa-micro-btn negociar" title="Retomar Negociação" onClick={() => updateClienteEtapa(c.id, 'Em negociação', {})}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.9"/></svg></button>}
                                      {etapa !== 'Venda suspensa' && <button type="button" className="etapa-micro-btn suspender" title="Suspender Venda (pausar negociação)" onClick={() => { setSuspensaoModal(c); setSuspensaoForm({ motivo: '', dataPrevisaoRetorno: '', ultimoContato: '', proximaAcao: '' }); }}><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg></button>}
                                    </div>
                                  </div>
                                </td>
                                <td>
                                  <div className="client-actions">
                                    {hasPermission('orcamentos') && (
                                      <button type="button" className="ca-btn ca-primary" onClick={() => openBudgetFormForClient(c)}>Orçamento</button>
                                    )}
                                    {hasPermission('contratos') && (
                                      <button
                                        type="button"
                                        className="ca-btn ca-outline"
                                        title={existingContract ? `${contractNumber(existingContract)} - ${existingContract.status}` : 'Gerar contrato'}
                                        onClick={() => openClientContractModal(c)}
                                      >
                                        {existingContract ? 'Ver contrato' : 'Contrato'}
                                      </button>
                                    )}
                                    {hasPermission('contratos') && (
                                      <button type="button" className="ca-btn ca-outline" onClick={() => openHomologacaoModal(c)}>Procuração</button>
                                    )}
                                    {hasPermission('gerenciarClientes') && (
                                      <button type="button" className="ca-btn ca-ghost" title="Editar dados do cliente" onClick={() => { setNovoCliente({ ...emptyClientForm, ...c, password: '' }); setClientView('new'); }}>
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                        Editar
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {clientSummary.filtered.length === 0 && (
                        <div className="empty-state-orcamento client-empty-state">
                          <div className="icon">CL</div>
                          <h4>Nenhum cliente encontrado</h4>
                          <p>Ajuste a busca ou o filtro de etapa.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'leads' && (
            <div className="admin-section leads-screen">

              {/* ── 1. Resumo geral ── */}
              <div className="admin-card leads-resumo-card">
                <div className="leads-resumo-header">
                  <div>
                    <h3>Resumo geral</h3>
                    <p>Leads do site e cadastros manuais ficam separados para a equipe enxergar a origem.</p>
                  </div>
                  <div className="leads-header-actions">
                    {hasPermission('verTodosLeads') && (
                      <button type="button" className="btn btn-outline btn-sm-admin" onClick={() => setLeadOwnerFilter('todos')}>Ver todos os leads</button>
                    )}
                    <button type="button" className="btn btn-primary btn-sm-admin" onClick={() => setShowManualLeadForm(true)}>
                      + Cadastrar lead
                    </button>
                  </div>
                </div>
                <div className="leads-stats-grid">
                  <div className="lead-stat-item">
                    <div className="lead-stat-icon lead-stat-icon-orange">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 11a4 4 0 1 0-3.2-6.4A5 5 0 0 1 15 9c0 .7-.1 1.4-.4 2H16Zm-8 0a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-3.3 0-6 1.7-6 3.8V19h12v-2.2C14 14.7 11.3 13 8 13Zm8 0c-.6 0-1.1.1-1.7.2 1.1.9 1.7 2.1 1.7 3.6V19h6v-2.2c0-2.1-2.7-3.8-6-3.8Z" /></svg>
                    </div>
                    <div>
                      <p className="lead-stat-label">TOTAL CAPTADO</p>
                      <strong className="lead-stat-num">{leadSummary.total}</strong>
                      <p className="lead-stat-desc">Todos os leads da visão atual.</p>
                    </div>
                  </div>
                  <button type="button" className={`lead-stat-item lead-stat-button ${leadSourceFilter === 'site' ? 'active' : ''}`} onClick={() => setLeadSourceFilter('site')}>
                    <div className="lead-stat-icon lead-stat-icon-blue">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm6.9 9h-3.1a15 15 0 0 0-1.1-5A8.1 8.1 0 0 1 18.9 11ZM12 4.1c.7 1 1.5 3.1 1.8 6.9h-3.6c.3-3.8 1.1-5.9 1.8-6.9ZM4.1 13h3.1c.1 1.8.5 3.5 1.1 5A8.1 8.1 0 0 1 4.1 13Zm3.1-2H4.1A8.1 8.1 0 0 1 8.3 6a15 15 0 0 0-1.1 5ZM12 19.9c-.7-1-1.5-3.1-1.8-6.9h3.6c-.3 3.8-1.1 5.9-1.8 6.9ZM15.7 18a15 15 0 0 0 1.1-5h3.1a8.1 8.1 0 0 1-4.2 5Z" /></svg>
                    </div>
                    <div>
                      <p className="lead-stat-label">SITE</p>
                      <strong className="lead-stat-num">{leadSummary.site}</strong>
                      <p className="lead-stat-desc">Captados pela LP/simulação.</p>
                    </div>
                  </button>
                  <button type="button" className={`lead-stat-item lead-stat-button ${leadSourceFilter === 'manual' ? 'active' : ''}`} onClick={() => setLeadSourceFilter('manual')}>
                    <div className="lead-stat-icon lead-stat-icon-orange">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h10l6 6v10H4V4Zm9 1.5V11h5.5L13 5.5ZM7 14h10v2H7v-2Zm0 4h7v2H7v-2Z" /></svg>
                    </div>
                    <div>
                      <p className="lead-stat-label">MANUAL</p>
                      <strong className="lead-stat-num">{leadSummary.manual}</strong>
                      <p className="lead-stat-desc">Cadastrados pela equipe.</p>
                    </div>
                  </button>
                  <div className="lead-stat-item">
                    <div className="lead-stat-icon lead-stat-icon-green">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-9 0a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4Zm9 0c-.3 0-.7 0-1 .1 1.2.8 2 2 2 3.9V20h6v-2c0-2.7-5.3-4-7-4Z" /></svg>
                    </div>
                    <div>
                      <p className="lead-stat-label">NOVOS</p>
                      <strong className="lead-stat-num">{leadSummary.novos}</strong>
                      <p className="lead-stat-desc">Aguardando atendimento.</p>
                    </div>
                  </div>
                  <div className="lead-stat-item">
                    <div className="lead-stat-icon lead-stat-icon-purple">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a9 9 0 0 0-9 9c0 2.4 1 4.7 2.6 6.3l-1.4 1.4A11 11 0 0 1 1 11 11 11 0 0 1 12 0a11 11 0 0 1 11 11 11 11 0 0 1-3.2 7.7l-1.4-1.4A9 9 0 0 0 21 11a9 9 0 0 0-9-9Zm0 4a5 5 0 0 0-5 5 5 5 0 0 0 5 5 5 5 0 0 0 5-5 5 5 0 0 0-5-5Zm0 2a3 3 0 0 1 3 3 3 3 0 0 1-3 3 3 3 0 0 1-3-3 3 3 0 0 1 3-3Z" /></svg>
                    </div>
                    <div>
                      <p className="lead-stat-label">EM ATENDIMENTO</p>
                      <strong className="lead-stat-num">{leadSummary.emAtendimento}</strong>
                      <p className="lead-stat-desc">Já assumidos pela equipe.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── 2. Distribuição por consultor ── */}
              {hasPermission('verTodosLeads') && leadSummary.porResponsavel.length > 0 && (
                <div className="admin-card">
                  <div className="consultant-summary-header">
                    <div>
                      <h4>Distribuição por consultor</h4>
                      <p>Clique em um consultor para ver somente os leads atribuídos a ele.</p>
                    </div>
                  </div>
                  <div className="consultant-summary-grid">
                    {leadSummary.porResponsavel.map(user => (
                      <button
                        type="button"
                        key={user.id}
                        className={`consultant-card ${String(leadOwnerFilter) === String(user.id) || String(leadOwnerFilter) === String(user.nome) ? 'active' : ''}`}
                        onClick={() => setLeadOwnerFilter(user.id)}
                      >
                        <span>{user.role === 'EQUIPE_TECNICA_COMERCIAL' ? 'Equipe técnica/comercial' : 'Consultor'}</span>
                        <strong>{user.nome}</strong>
                        <p>{user.total} lead{user.total === 1 ? '' : 's'} recebido{user.total === 1 ? '' : 's'}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── 3. Buscar leads ── */}
              <div className="admin-card leads-search-card">
                <h4 className="leads-search-title">Buscar leads</h4>
                <div className="leads-search-row">
                  <div className="leads-search-input-wrap">
                    <svg className="leads-search-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 2a8 8 0 1 0 4.9 14.3l4.4 4.4 1.4-1.4-4.4-4.4A8 8 0 0 0 10 2Zm0 2a6 6 0 1 1 0 12A6 6 0 0 1 10 4Z" /></svg>
                    <input
                      className="leads-search-input"
                      placeholder="Buscar lead por nome, telefone, cidade, status da negociação..."
                      value={leadSearch}
                      onChange={(event) => setLeadSearch(event.target.value)}
                    />
                  </div>
                  <div className="leads-filter-group" aria-label="Filtros de status">
                    <button type="button" className={`leads-filter-btn ${leadStatusFilter === 'todos' ? 'active' : ''}`} onClick={() => setLeadStatusFilter('todos')}>
                      Todos
                    </button>
                    {leadStatusOptions.map(status => (
                      <button type="button" key={status} className={`leads-filter-btn ${leadStatusFilter === status ? 'active' : ''}`} onClick={() => setLeadStatusFilter(status)}>
                        {status}
                      </button>
                    ))}
                  </div>
                  <div className="leads-filter-group" aria-label="Filtros de origem">
                    <button type="button" className={`leads-filter-btn ${leadSourceFilter === 'todos' ? 'active' : ''}`} onClick={() => setLeadSourceFilter('todos')}>Todas origens</button>
                    <button type="button" className={`leads-filter-btn ${leadSourceFilter === 'site' ? 'active' : ''}`} onClick={() => setLeadSourceFilter('site')}>Site</button>
                    <button type="button" className={`leads-filter-btn ${leadSourceFilter === 'manual' ? 'active' : ''}`} onClick={() => setLeadSourceFilter('manual')}>Manual</button>
                  </div>
                </div>
              </div>

              {/* ── 4. Registrar contato ── */}
              <div className="admin-card leads-rc-card">
                <h4>Registrar contato</h4>
                <p className="leads-rc-subtitle">Salve ligação, WhatsApp, visita e próximo retorno para não perder nenhum cliente.</p>
                <form className="rc-form" onSubmit={registrarAtividade}>
                  <div className="rc-form-grid">
                    <div className="rc-field">
                      <label className="rc-label">Lead</label>
                      <select className="rc-input" value={activityForm.leadId} onChange={(event) => setActivityForm(prev => ({ ...prev, leadId: event.target.value }))} required>
                        <option value="">Escolha o lead</option>
                        {filteredLeads.map(lead => <option key={lead.id} value={lead.id}>{lead.nome} — {lead.telefone}</option>)}
                      </select>
                    </div>
                    <div className="rc-field">
                      <label className="rc-label">Tipo de contato</label>
                      <select className="rc-input" value={activityForm.tipo} onChange={(event) => setActivityForm(prev => ({ ...prev, tipo: event.target.value }))}>
                        <option value="">Escolha o tipo</option>
                        <option>Ligação</option>
                        <option>WhatsApp</option>
                        <option>Visita</option>
                        <option>Proposta</option>
                        <option>Reunião</option>
                        <option>Pós-venda</option>
                      </select>
                    </div>
                    <div className="rc-field">
                      <label className="rc-label">Origem</label>
                      <select className="rc-input" value={activityForm.origem} onChange={(event) => setActivityForm(prev => ({ ...prev, origem: event.target.value }))}>
                        <option>Ligação</option>
                        <option>WhatsApp</option>
                        <option>E-mail</option>
                        <option>Presencial</option>
                        <option>Indicação</option>
                        <option>Site</option>
                      </select>
                    </div>
                    <div className="rc-field">
                      <label className="rc-label">O que foi feito</label>
                      <input className="rc-input" placeholder="Descreva o contato realizado" value={activityForm.descricao} onChange={(event) => setActivityForm(prev => ({ ...prev, descricao: event.target.value }))} required />
                    </div>
                    <div className="rc-field">
                      <label className="rc-label">Resultado / Observação</label>
                      <input className="rc-input" placeholder="Resultado ou observação" value={activityForm.resultado} onChange={(event) => setActivityForm(prev => ({ ...prev, resultado: event.target.value }))} />
                    </div>
                    <div className="rc-field">
                      <label className="rc-label">Data</label>
                      <input className="rc-input rc-input-date" type="date" value={activityForm.proximoRetorno} onChange={(event) => setActivityForm(prev => ({ ...prev, proximoRetorno: event.target.value }))} />
                    </div>
                  </div>
                  <div className="rc-form-footer">
                    <button className="btn btn-primary rc-save-btn" type="submit">Salvar contato</button>
                  </div>
                </form>
              </div>

              {/* ── 5. Lista de atendimento ── */}
              <div className="admin-card leads-list-card">
                <div className="list-section-header">
                  <div>
                    <h4>Lista de atendimento</h4>
                    <p>{filteredLeads.length} lead{filteredLeads.length === 1 ? '' : 's'} na visão atual. Consultores veem apenas os próprios leads.</p>
                  </div>
                  <button type="button" className="btn btn-primary btn-sm-admin" onClick={() => setShowManualLeadForm(true)}>+ Cadastrar lead</button>
                </div>
                <div className="table-container leads-table-container">
                  <table className="modern-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>NOME</th>
                        <th>TELEFONE</th>
                        <th>E-MAIL</th>
                        <th>CIDADE</th>
                        <th>ORIGEM</th>
                        <th>RESPONSÁVEL</th>
                        <th>STATUS</th>
                        <th>RETORNO</th>
                        <th>AÇÕES</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedLeads.map(lead => (
                        <tr key={lead.id}>
                          <td data-label="ID">#{lead.id}</td>
                          <td data-label="NOME" className="font-medium">{lead.nome}</td>
                          <td data-label="TELEFONE">{lead.telefone}</td>
                          <td data-label="E-MAIL">{lead.email}</td>
                          <td data-label="CIDADE">{lead.cidade}</td>
                          <td data-label="ORIGEM">
                            <div className="lead-origin-cell">
                              <span className={`lead-source-badge ${lead.tipoCadastro === 'manual' ? 'lead-source-manual' : 'lead-source-site'}`}>
                                {lead.tipoCadastro === 'manual' ? 'Manual' : 'Site'}
                              </span>
                              <small>{lead.origem || (lead.tipoCadastro === 'manual' ? 'Manual' : 'Site')}</small>
                            </div>
                          </td>
                          <td data-label="RESPONSÁVEL">{getResponsibleName(lead.assignedUserName)}</td>
                          <td data-label="STATUS">
                            <span className={`lead-status-badge ${getLeadStatusClass(lead.status)}`}>{lead.status || 'Novo'}</span>
                          </td>
                          <td data-label="RETORNO">{lead.proximoRetorno ? dateBr(lead.proximoRetorno) : 'Sem retorno'}</td>
                          <td data-label="AÇÕES">
                            <div className="table-actions">
                              <select
                                className="lead-status-select"
                                value={lead.status || 'Novo'}
                                onChange={(event) => updateLeadStatus(lead.id, event.target.value)}
                                title="Alterar filtro/status do lead"
                              >
                                {LEAD_STATUS_PRESETS.map(status => <option key={status}>{status}</option>)}
                              </select>
                              <a
                                className="leads-wa-btn"
                                href={`https://wa.me/55${String(lead.telefone || '').replace(/\D/g, '')}?text=${whatsappLeadMessage(lead)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label="WhatsApp"
                              >
                                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.5 14.4c-.3-.1-1.7-.8-1.9-.9-.3-.1-.5-.1-.7.1-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6.1-.3-.2-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.4-.5.3-.5v-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5H8c-.2 0-.5.1-.7.3-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3 4.8 4.2.7.3 1.2.4 1.6.5.7.2 1.3.2 1.8.1.5-.1 1.7-.7 1.9-1.3.2-.6.2-1.2.1-1.3-.1-.1-.3-.2-.5-.3ZM12 2C6.5 2 2 6.5 2 12c0 1.9.5 3.6 1.4 5.1L2 22l5.1-1.3A10 10 0 0 0 12 22c5.5 0 10-4.5 10-10S17.5 2 12 2Z" /></svg>
                              </a>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredLeads.length === 0 && (
                    <div className="empty-state-orcamento lead-empty-state">
                      <div className="icon">LD</div>
                      <h4>Nenhum lead encontrado</h4>
                      <p>Ajuste a busca, mude o status ou volte para todos os leads.</p>
                    </div>
                  )}
                </div>

                {filteredLeads.length > LEADS_PER_PAGE && (
                  <div className="leads-pagination">
                    <p>Exibindo {Math.min((leadsPage - 1) * LEADS_PER_PAGE + 1, filteredLeads.length)} a {Math.min(leadsPage * LEADS_PER_PAGE, filteredLeads.length)} de {filteredLeads.length} leads</p>
                    <div className="leads-pagination-btns">
                      {Array.from({ length: leadsTotalPages }, (_, i) => i + 1).map(page => (
                        <button
                          key={page}
                          type="button"
                          className={`leads-page-btn ${page === leadsPage ? 'active' : ''}`}
                          onClick={() => setLeadsPage(page)}
                        >{page}</button>
                      ))}
                      {leadsPage < leadsTotalPages && (
                        <button type="button" className="leads-page-btn" onClick={() => setLeadsPage(p => p + 1)}>›</button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'orcamentos' && (
            <div className="orc-layout">

              {/* ── LEFT: Client selector ── */}
              <div className="admin-card orc-client-panel">
                <h4 className="orc-panel-title">1. Selecionar Cliente</h4>
                <p className="orc-panel-sub">Busque e selecione um cliente para visualizar ou criar orçamentos.</p>

                <div className="orc-search-wrap">
                  <svg className="orc-search-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 2a8 8 0 1 0 4.9 14.3l4.4 4.4 1.4-1.4-4.4-4.4A8 8 0 0 0 10 2Zm0 2a6 6 0 1 1 0 12A6 6 0 0 1 10 4Z" fill="currentColor"/></svg>
                  <input
                    className="orc-search-input"
                    placeholder="Buscar por nome, contato ou CPF..."
                    value={orcClientSearch}
                    onChange={(e) => setOrcClientSearch(e.target.value)}
                  />
                </div>

                <div className="orc-client-list-header">
                  <p className="orc-client-list-title">Lista de Clientes</p>
                  <p className="orc-client-list-sub">Selecione um cliente para ver seus orçamentos.</p>
                </div>

                <div className="orc-client-table">
                  <div className="orc-client-thead">NOME COMPLETO</div>
                  {paginatedOrcClientes.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      className={`orc-client-row ${selectedOrcClient?.id === c.id ? 'active' : ''}`}
                      onClick={() => { setSelectedOrcClient(c); setIsBudgetFormOpen(false); setSelectedOrcamento(null); }}
                    >
                      <span>{c.nome}</span>
                      <svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16"><path d="M9 18l6-6-6-6" strokeWidth="2" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </button>
                  ))}
                  {paginatedOrcClientes.length === 0 && (
                    <div className="orc-client-empty">Nenhum cliente encontrado.</div>
                  )}
                </div>

                <div className="orc-client-pagination">
                  <span>Exibindo {filteredOrcClientes.length === 0 ? 0 : Math.min((orcClientPage - 1) * ORC_CLIENTS_PER_PAGE + 1, filteredOrcClientes.length)} a {Math.min(orcClientPage * ORC_CLIENTS_PER_PAGE, filteredOrcClientes.length)} de {filteredOrcClientes.length} clientes</span>
                  <div className="orc-pagination-btns">
                    <button type="button" className="orc-page-btn orc-page-nav" disabled={orcClientPage <= 1} onClick={() => setOrcClientPage(p => Math.max(1, p - 1))}>‹</button>
                    {Array.from({ length: orcClientTotalPages }, (_, i) => i + 1)
                      .filter(p => p === 1 || p === orcClientTotalPages || Math.abs(p - orcClientPage) <= 1)
                      .reduce((acc, p, idx, arr) => {
                        if (idx > 0 && p - arr[idx - 1] > 1) acc.push('...');
                        acc.push(p);
                        return acc;
                      }, [])
                      .map((item, idx) => item === '...'
                        ? <span key={`dots-${idx}`} className="orc-page-dots">…</span>
                        : <button key={item} type="button" className={`orc-page-btn ${item === orcClientPage ? 'active' : ''}`} onClick={() => setOrcClientPage(item)}>{item}</button>
                      )}
                    <button type="button" className="orc-page-btn orc-page-nav" disabled={orcClientPage >= orcClientTotalPages} onClick={() => setOrcClientPage(p => Math.min(orcClientTotalPages, p + 1))}>›</button>
                  </div>
                </div>
              </div>

              {/* ── RIGHT: Client budgets ── */}
              <div className="orc-right-panel">
                {!selectedOrcClient ? (
                  <div className="admin-card orc-empty-state">
                    <div className="orc-empty-icon">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm-1 1.5L18.5 9H13V3.5ZM8 17h8v1.5H8V17Zm0-3.5h8v1.5H8v-1.5Zm0-3.5h5v1.5H8V10Z" fill="currentColor"/></svg>
                    </div>
                    <h4>Orçamentos do cliente</h4>
                    <p>Selecione um cliente ao lado para visualizar os orçamentos realizados.</p>
                  </div>
                ) : isBudgetFormOpen ? (
                  <form className="admin-card orc-budget-form" onSubmit={createManualBudget}>
                    <div className="card-header-flex">
                      <div>
                        <span className="section-kicker">Novo orçamento</span>
                        <h4>Proposta para {selectedOrcClient.nome}</h4>
                      </div>
                      <button type="button" className="btn btn-outline btn-sm-admin" onClick={() => setIsBudgetFormOpen(false)}>← Voltar</button>
                    </div>
                    <div className="budget-form-grid">
                      <label>
                        Kit/catálogo base
                        <select value={budgetForm.equipamentoId} onChange={(event) => applyEquipmentToBudget(event.target.value)}>
                          <option value="">Preencher manualmente</option>
                          {equipamentos.filter(item => item.active).map(item => (
                            <option key={item.id} value={item.id}>{item.nome}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Potência da placa
                        <select value={budgetForm.potenciaPlacaW} onChange={(event) => setBudgetForm(prev => ({ ...prev, potenciaPlacaW: event.target.value }))}>
                          {[550, 560, 570, 580, 590, 600, 605, 610, 615, 620, 630, 650, 700].map(value => <option key={value} value={value}>{value} W</option>)}
                        </select>
                      </label>
                      <label>
                        Modelo da placa
                        <input value={budgetForm.placaModelo} onChange={(event) => setBudgetForm(prev => ({ ...prev, placaModelo: event.target.value }))} placeholder="Ex: JA Solar 610 W" required />
                      </label>
                      <label>
                        Quantidade de placas
                        <input type="number" min="1" value={budgetForm.numeroPaineis} onChange={(event) => setBudgetForm(prev => ({ ...prev, numeroPaineis: event.target.value }))} required />
                      </label>
                      <label>
                        Potência do inversor
                        <input type="number" min="0" step="0.01" value={budgetForm.potenciaInversorKw} onChange={(event) => setBudgetForm(prev => ({ ...prev, potenciaInversorKw: event.target.value }))} placeholder="Ex: 8" required />
                      </label>
                      <label>
                        Modelo do inversor
                        <input value={budgetForm.inversorModelo} onChange={(event) => setBudgetForm(prev => ({ ...prev, inversorModelo: event.target.value }))} placeholder="Ex: Growatt 8 kW" required />
                      </label>
                      <label>
                        Quantidade de inversores
                        <input type="number" min="1" value={budgetForm.quantidadeInversores} onChange={(event) => setBudgetForm(prev => ({ ...prev, quantidadeInversores: event.target.value }))} />
                      </label>
                      <label>
                        Cabo CC
                        <input value={budgetForm.quantidadeCaboCc} onChange={(event) => setBudgetForm(prev => ({ ...prev, quantidadeCaboCc: event.target.value }))} placeholder="Ex: 60 m cabo solar 6 mm" />
                      </label>
                      <label>
                        Área por placa
                        <input type="number" min="0" step="0.01" value={budgetForm.areaPorPainelM2} onChange={(event) => setBudgetForm(prev => ({ ...prev, areaPorPainelM2: event.target.value }))} />
                      </label>
                      <label>
                        Geração
                        <select value={budgetForm.generationMode} onChange={(event) => setBudgetForm(prev => ({ ...prev, generationMode: event.target.value }))}>
                          <option value="manual">Informar manualmente</option>
                          <option value="auto">Calcular por irradiação</option>
                        </select>
                      </label>
                      {budgetForm.generationMode === 'auto' ? (
                        <>
                          <label>
                            Irradiação solar
                            <input type="number" step="0.01" value={budgetForm.irradiacaoSolar} onChange={(event) => setBudgetForm(prev => ({ ...prev, irradiacaoSolar: event.target.value }))} placeholder="Ex: 5.2" required />
                          </label>
                          <label>
                            Perda média
                            <select value={budgetForm.perdaPercentual} onChange={(event) => setBudgetForm(prev => ({ ...prev, perdaPercentual: event.target.value }))}>
                              <option value="15">15%</option>
                              <option value="20">20%</option>
                              <option value="25">25%</option>
                            </select>
                          </label>
                        </>
                      ) : (
                        <label className="span-2">
                          Geração mensal kWh
                          <input type="number" min="0" step="0.01" value={budgetForm.geracaoKwh} onChange={(event) => setBudgetForm(prev => ({ ...prev, geracaoKwh: event.target.value }))} required />
                        </label>
                      )}
                      <label>
                        Valor do sistema
                        <CurrencyInput value={budgetForm.valorSistema} onValueChange={(value) => setBudgetForm(prev => ({ ...prev, valorSistema: value }))} required />
                      </label>
                      <label>
                        Entrada
                        <CurrencyInput value={budgetForm.valorEntrada} onValueChange={(value) => setBudgetForm(prev => ({ ...prev, valorEntrada: value }))} placeholder="Opcional" />
                      </label>
                      <label>
                        Saldo
                        <CurrencyInput value={budgetForm.valorSaldo} onValueChange={(value) => setBudgetForm(prev => ({ ...prev, valorSaldo: value }))} placeholder="Opcional" />
                      </label>
                      <label>
                        Forma de pagamento
                        <select value={budgetForm.formaPagamentoTipo} onChange={(event) => setBudgetForm(prev => ({ ...prev, formaPagamentoTipo: event.target.value }))}>
                          {pagamentoTypeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </label>
                      <label className="span-2">
                        Condições
                        <textarea value={budgetForm.condicoesPagamento} onChange={(event) => setBudgetForm(prev => ({ ...prev, condicoesPagamento: event.target.value }))} placeholder="Ex: entrada + saldo financiado, validade da proposta, parcelas..." required />
                      </label>
                      <label className="span-2">
                        Observações
                        <textarea value={budgetForm.observacoes} onChange={(event) => setBudgetForm(prev => ({ ...prev, observacoes: event.target.value }))} placeholder="Detalhes técnicos, observações comerciais ou premissas da proposta." />
                      </label>
                    </div>
                    <div className="budget-result-strip">
                      <div><span>Potência</span><strong>{budgetCalculations.potenciaKwp} kWp</strong></div>
                      <div><span>Área</span><strong>{budgetCalculations.areaOcupadaM2} m²</strong></div>
                      <div><span>Geração</span><strong>{budgetCalculations.geracaoKwh} kWh/mês</strong></div>
                      <div><span>Valor</span><strong>{money(budgetForm.valorSistema)}</strong></div>
                    </div>
                    <div className="actions-footer">
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => {
                          localStorage.removeItem(budgetDraftStorageKey);
                          localStorage.removeItem(budgetDraftOpenStorageKey);
                          setBudgetForm(emptyBudgetForm);
                        }}
                      >
                        Limpar
                      </button>
                      <button type="submit" className="btn btn-primary">Salvar orçamento</button>
                    </div>
                    {budgetStatus && <p className="muted-text">{budgetStatus}</p>}
                  </form>
                ) : (
                  <div className="admin-card orc-detail-card">
                    {/* ── Client info header ── */}
                    <div className="orc-detail-top">
                      <p className="orc-selected-label">Cliente selecionado</p>
                      <div className="orc-detail-client-row">
                        <div className="orc-detail-avatar">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12Zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8Z" fill="currentColor"/></svg>
                        </div>
                        <div className="orc-detail-info">
                          <h3>{selectedOrcClient.nome}</h3>
                          {selectedOrcClient.whatsapp && <p>Telefone: {selectedOrcClient.whatsapp}</p>}
                          {selectedOrcClient.cpfCnpj && <p>CPF: {selectedOrcClient.cpfCnpj}</p>}
                          {selectedOrcClient.cidade && <p>Cidade: {selectedOrcClient.cidade}{selectedOrcClient.estado ? ` - ${selectedOrcClient.estado}` : ''}</p>}
                        </div>
                        {hasPermission('orcamentos') && (
                          <button type="button" className="orc-novo-btn" onClick={() => openBudgetFormForClient(selectedOrcClient)}>
                            + Novo orçamento
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="orc-detail-divider" />

                    {/* ── Budget table ── */}
                    <div className="orc-budgets-section">
                      <h4 className="orc-budgets-title">Orçamentos do cliente</h4>
                      <p className="orc-budgets-sub">Lista de todos os orçamentos realizados para este cliente.</p>

                      {clientOrcamentos.length === 0 ? (
                        <div className="orc-list-empty">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm-1 1.5L18.5 9H13V3.5ZM8 17h8v1.5H8V17Zm0-3.5h8v1.5H8v-1.5Zm0-3.5h5v1.5H8V10Z" fill="currentColor"/></svg>
                          <p>Nenhum orçamento para este cliente ainda.</p>
                          {hasPermission('orcamentos') && (
                            <button type="button" className="orc-novo-btn" onClick={() => openBudgetFormForClient(selectedOrcClient)}>+ Criar primeiro orçamento</button>
                          )}
                        </div>
                      ) : (
                        <>
                          <div className="orc-table-wrap">
                            <table className="orc-table">
                              <thead>
                                <tr>
                                  <th>ID</th>
                                  <th>DATA</th>
                                  <th>VALOR</th>
                                  <th>STATUS</th>
                                  <th>AÇÕES</th>
                                </tr>
                              </thead>
                              <tbody>
                                {clientOrcamentos.map(orc => (
                                  <tr
                                    key={orc.id}
                                    className={selectedOrcamento?.id === orc.id ? 'orc-row-selected' : ''}
                                    onClick={() => setSelectedOrcamento(prev => prev?.id === orc.id ? null : orc)}
                                  >
                                    <td className="orc-td-id">#{orc.id}</td>
                                    <td>{orc.data}</td>
                                    <td className="orc-td-valor">{money(orc.financeiro?.preco_final_cliente_rs)}</td>
                                    <td>
                                      <span className={`orc-status-badge ${getOrcStatusClass(orc.status)}`}>
                                        {orc.status || 'Aberto'}
                                      </span>
                                    </td>
                                    <td>
                                      <div className="orc-table-actions" onClick={e => e.stopPropagation()}>
                                        {hasPermission('contratos') && (
                                          <button
                                            type="button"
                                            className="orc-action-btn"
                                            title="Emitir contrato"
                                            onClick={() => openContractModal(orc)}
                                          >
                                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm-1 1.5L18.5 9H13V3.5ZM8 17h8v1H8v-1Zm0-3h8v1H8v-1Zm0-3h5v1H8v-1Z" fill="currentColor"/></svg>
                                          </button>
                                        )}
                                        <a
                                          className="orc-action-btn"
                                          href={getOrcamentoDownloadUrl(orc.id)}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          title="Baixar orçamento PDF"
                                        >
                                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20h14v-2H5v2Zm7-18v12l-5-5-1.4 1.4L12 17l6.4-6.6L17 9l-5 5V2h-2Z" fill="currentColor"/></svg>
                                        </a>
                                        <a
                                          className="orc-action-btn orc-action-wa"
                                          href={`https://wa.me/55${String(selectedOrcClient.whatsapp || '').replace(/\D/g, '')}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          title="Enviar via WhatsApp"
                                        >
                                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.5 14.4c-.3-.1-1.7-.8-1.9-.9-.3-.1-.5-.1-.7.1-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6.1-.3-.2-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.4-.5.3-.5v-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5H8c-.2 0-.5.1-.7.3-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3 4.8 4.2.7.3 1.2.4 1.6.5.7.2 1.3.2 1.8.1.5-.1 1.7-.7 1.9-1.3.2-.6.2-1.2.1-1.3-.1-.1-.3-.2-.5-.3ZM12 2C6.5 2 2 6.5 2 12c0 1.9.5 3.6 1.4 5.1L2 22l5.1-1.3A10 10 0 0 0 12 22c5.5 0 10-4.5 10-10S17.5 2 12 2Z" fill="currentColor"/></svg>
                                        </a>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <p className="orc-table-count">Exibindo 1 a {clientOrcamentos.length} de {clientOrcamentos.length} orçamento{clientOrcamentos.length !== 1 ? 's' : ''}</p>
                        </>
                      )}
                    </div>

                    {/* ── Bottom action bar ── */}
                    {selectedOrcamento && (
                      <div className="orc-actions-bar">
                        {hasPermission('contratos') && (
                          <>
                            {equipamentos.filter(i => i.active).length > 0 && (
                              <select
                                className="orc-bar-equip-select"
                                value={selectedEquipamentos[selectedOrcamento.id] || ''}
                                onChange={(event) => setSelectedEquipamentos(prev => ({ ...prev, [selectedOrcamento.id]: event.target.value }))}
                              >
                                <option value="">Equipamento padrão</option>
                                {equipamentos.filter(item => item.active).map(item => (
                                  <option key={item.id} value={item.id}>{item.nome}</option>
                                ))}
                              </select>
                            )}
                            <button type="button" className="orc-bar-btn" onClick={() => openContractModal(selectedOrcamento)}>
                              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm-1 1.5L18.5 9H13V3.5ZM8 17h8v1H8v-1Zm0-3h8v1H8v-1Zm0-3h5v1H8v-1Z" fill="currentColor"/></svg>
                              Emitir Contrato
                            </button>
                          </>
                        )}
                        <a className="orc-bar-btn" href={getOrcamentoDownloadUrl(selectedOrcamento.id)} target="_blank" rel="noopener noreferrer">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20h14v-2H5v2Zm7-18v12l-5-5-1.4 1.4L12 17l6.4-6.6L17 9l-5 5V2h-2Z" fill="currentColor"/></svg>
                          Baixar Orçamento (PDF)
                        </a>
                        <a className="orc-bar-btn orc-bar-btn-wa" href={`https://wa.me/55${String(selectedOrcClient.whatsapp || '').replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.5 14.4c-.3-.1-1.7-.8-1.9-.9-.3-.1-.5-.1-.7.1-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6.1-.3-.2-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.4-.5.3-.5v-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5H8c-.2 0-.5.1-.7.3-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3 4.8 4.2.7.3 1.2.4 1.6.5.7.2 1.3.2 1.8.1.5-.1 1.7-.7 1.9-1.3.2-.6.2-1.2.1-1.3-.1-.1-.3-.2-.5-.3ZM12 2C6.5 2 2 6.5 2 12c0 1.9.5 3.6 1.4 5.1L2 22l5.1-1.3A10 10 0 0 0 12 22c5.5 0 10-4.5 10-10S17.5 2 12 2Z" fill="currentColor"/></svg>
                          Enviar via WhatsApp
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'procuracoes' && (
            <div className="admin-section procuracoes-screen">
              <div className="section-heading">
                <div>
                  <span className="section-kicker">Documentos</span>
                  <h3>Procurações</h3>
                  <p>Documentos gerados com os dados do cliente e liberados somente após aprovação.</p>
                </div>
                <div className="section-stats">
                  <div><strong>{procuracoes.length}</strong><span>total</span></div>
                  <div><strong>{procuracoes.filter(item => item.status === 'Pendente').length}</strong><span>pendentes</span></div>
                  <div><strong>{procuracoes.filter(item => item.status === 'Aprovado').length}</strong><span>aprovadas</span></div>
                </div>
              </div>

              <div className="admin-card ctr-table-card">
                <div className="ctr-table-wrap">
                  <table className="ctr-table">
                    <thead><tr><th>Nº</th><th>CONTRATO</th><th>TITULAR DA CONTA</th><th>CPF/CNPJ</th><th>GERADA EM</th><th>VALIDADE</th><th>STATUS</th><th>AÇÕES</th></tr></thead>
                    <tbody>
                      {procuracoes.map(item => (
                        <tr key={item.id}>
                          <td className="ctr-td-num">PR-{String(item.id).padStart(4, '0')}</td>
                          <td className="ctr-td-num">{item.contratoId ? `CT-${String(item.contratoId).padStart(4, '0')}` : 'Legado'}</td>
                          <td className="ctr-td-cliente">{item.clienteNome}</td>
                          <td>{item.clienteCpfCnpj || 'Não informado'}</td>
                          <td>{dateBr(item.dataCriacao)}</td>
                          <td>{dateBr(item.validadeAte)}</td>
                          <td><span className={`ctr-status-badge ${item.status === 'Aprovado' ? 'ctr-status-aprovado' : item.status === 'Recusado' ? 'ctr-status-recusado' : 'ctr-status-pendente'}`}>{item.status}</span></td>
                          <td>
                            <div className="ctr-table-actions">
                              {adminUser.role === 'ADM' && item.status === 'Pendente' && (
                                <>
                                  <a className="btn btn-outline btn-sm-admin" href={getProcuracaoPreviewUrl(item.id)} target="_blank" rel="noopener noreferrer">Revisar PDF</a>
                                  <button type="button" className="ctr-action-text ctr-action-review" onClick={() => revisarProcuracao(item, 'Aprovado')}>Aprovar</button>
                                  <button type="button" className="ctr-action-text" onClick={() => revisarProcuracao(item, 'Recusado')}>Recusar</button>
                                </>
                              )}
                              {item.status === 'Aprovado' && (
                                <a className="btn btn-outline btn-sm-admin" href={getProcuracaoDownloadUrl(item.id)} target="_blank" rel="noopener noreferrer">Baixar</a>
                              )}
                              {item.status === 'Recusado' && <span className="ctr-action-waiting">{item.observacaoAnalise || 'Recusada'}</span>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!procuracoes.length && <div className="ctr-empty"><p>Nenhuma procuração gerada. Use o botão Procuração na lista de clientes.</p></div>}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'contratos' && (
            <div className="ctr-screen">
              <h3 className="ctr-page-title">Contratos</h3>

              {/* ── Stats cards ── */}
              <div className="ctr-stats-grid">
                <div className="ctr-stat-card">
                  <div className="ctr-stat-num">{contratoSummary.total}</div>
                  <div className="ctr-stat-label">CONTRATOS</div>
                  <div className="ctr-stat-desc">Total de contratos gerados</div>
                </div>
                <div className="ctr-stat-card ctr-stat-card-blue">
                  <div className="ctr-stat-row">
                    <div className="ctr-stat-num">{contratoSummary.pendentes}</div>
                    <div className="ctr-stat-icon ctr-icon-blue">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm1 15h-2v-2h2v2Zm0-4h-2V7h2v6Z" fill="currentColor"/></svg>
                    </div>
                  </div>
                  <div className="ctr-stat-label">PENDENTES DE APROVAÇÃO</div>
                  <div className="ctr-stat-desc">Aguardando validação do Sr. DRM</div>
                </div>
                <div className="ctr-stat-card ctr-stat-card-red">
                  <div className="ctr-stat-row">
                    <div className="ctr-stat-num">{contratoSummary.recusados}</div>
                    <div className="ctr-stat-icon ctr-icon-red">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2Zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59Z" fill="currentColor"/></svg>
                    </div>
                  </div>
                  <div className="ctr-stat-label">REJEITADOS</div>
                  <div className="ctr-stat-desc">Precisam de ajustes</div>
                </div>
                <div className="ctr-stat-card ctr-stat-card-green">
                  <div className="ctr-stat-row">
                    <div className="ctr-stat-num">{contratoSummary.aprovados}</div>
                    <div className="ctr-stat-icon ctr-icon-green">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm-2 15-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9Z" fill="currentColor"/></svg>
                    </div>
                  </div>
                  <div className="ctr-stat-label">APROVADOS</div>
                  <div className="ctr-stat-desc">Contratos disponíveis</div>
                </div>
              </div>

              {/* ── Filters bar ── */}
              <div className="admin-card ctr-filters-card">
                <div className="ctr-filters-row">
                  <div className="ctr-filter-group">
                    <label className="ctr-filter-label">Filtros</label>
                    <div className="ctr-filter-status-wrap">
                      <span className="ctr-filter-status-label">Status</span>
                      <select
                        className="ctr-filter-select"
                        value={contratoStatusFilter}
                        onChange={(e) => setContratoStatusFilter(e.target.value)}
                      >
                        <option value="todos">Todos</option>
                        <option value="Pendente">Pendente</option>
                        <option value="Aprovado">Aprovado</option>
                        <option value="Recusado">Recusado</option>
                      </select>
                    </div>
                  </div>
                  <div className="ctr-filter-dates">
                    <div className="ctr-filter-date-field">
                      <label className="ctr-filter-label">Data inicial</label>
                      <div className="ctr-date-input-wrap">
                        <input
                          type="date"
                          className="ctr-date-input"
                          value={contratoDateFrom}
                          onChange={(e) => setContratoDateFrom(e.target.value)}
                          placeholder="dd/mm/aaaa"
                        />
                      </div>
                    </div>
                    <div className="ctr-filter-date-field">
                      <label className="ctr-filter-label">Data final</label>
                      <div className="ctr-date-input-wrap">
                        <input
                          type="date"
                          className="ctr-date-input"
                          value={contratoDateTo}
                          onChange={(e) => setContratoDateTo(e.target.value)}
                          placeholder="dd/mm/aaaa"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="ctr-filter-search-wrap">
                    <input
                      className="ctr-filter-search"
                      placeholder="Buscar por cliente ou número do contrato..."
                      value={contratoSearch}
                      onChange={(e) => setContratoSearch(e.target.value)}
                    />
                    <svg className="ctr-search-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 2a8 8 0 1 0 4.9 14.3l4.4 4.4 1.4-1.4-4.4-4.4A8 8 0 0 0 10 2Zm0 2a6 6 0 1 1 0 12A6 6 0 0 1 10 4Z" fill="currentColor"/></svg>
                  </div>
                </div>
              </div>

              {/* ── Table ── */}
              <div className="admin-card ctr-table-card">
                <div className="ctr-table-wrap">
                  <table className="ctr-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Nº CONTRATO</th>
                        <th>CLIENTE</th>
                        <th>DATA DO CONTRATO</th>
                        <th>VALOR TOTAL</th>
                        <th>STATUS</th>
                        <th>RESPONSÁVEL</th>
                        <th>AÇÕES</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedContratos.map((contrato, idx) => {
                        const year = String(contrato.dataCriacao || '').slice(0, 4) || new Date().getFullYear();
                        const numContrato = `CT-${year}-${String(contrato.id).padStart(4, '0')}`;
                        const dataFormatada = dateBr(contrato.dataCriacao);
                        return (
                          <tr
                            key={contrato.id}
                            onClick={() => abrirRevisaoContrato(contrato)}
                          >
                            <td className="ctr-td-id">#{String((contratoPage - 1) * CONTRATOS_PER_PAGE + idx + 1).padStart(4, '0').replace(/^0+/, '') || 1}</td>
                            <td className="ctr-td-num">{numContrato}</td>
                            <td className="ctr-td-cliente">{contrato.clienteNome}</td>
                            <td>{dataFormatada}</td>
                            <td className="ctr-td-valor">{money(contrato.valorProjeto)}</td>
                            <td>
                              <span className={`ctr-status-badge ${contrato.status === 'Aprovado' ? 'ctr-status-aprovado' : contrato.status === 'Recusado' ? 'ctr-status-recusado' : 'ctr-status-pendente'}`}>
                                {contrato.status}
                              </span>
                            </td>
                            <td>{getResponsibleName(contrato.assignedUserName) || contrato.criadoPorNome}</td>
                            <td>
                              <div className="ctr-table-actions" onClick={e => e.stopPropagation()}>
                                {adminUser.role === 'ADM' && contrato.status === 'Pendente' && (
                                  <button
                                    type="button"
                                    className="ctr-action-text ctr-action-review"
                                    onClick={() => abrirRevisaoContrato(contrato)}
                                  >
                                    Revisar
                                  </button>
                                )}
                                {contrato.status === 'Pendente' && adminUser.role !== 'ADM' && (
                                  <span className="ctr-action-waiting">Aguardando aprovação</span>
                                )}
                                {contrato.status === 'Aprovado' && (
                                  <a
                                    className="orc-action-btn"
                                    href={getContratoDownloadUrl(contrato.id)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="Baixar contrato PDF"
                                  >
                                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20h14v-2H5v2Zm7-18v12l-5-5-1.4 1.4L12 17l6.4-6.6L17 9l-5 5V2h-2Z" fill="currentColor"/></svg>
                                  </a>
                                )}
                                {contrato.status === 'Recusado' && (
                                  <span className="ctr-action-waiting">Revisar dados</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {paginatedContratos.length === 0 && (
                    <div className="ctr-empty">
                      <p>Nenhum contrato encontrado para os filtros selecionados.</p>
                    </div>
                  )}
                </div>

                {/* Pagination */}
                <div className="ctr-pagination">
                  <span>Exibindo {filteredContratos.length === 0 ? 0 : Math.min((contratoPage - 1) * CONTRATOS_PER_PAGE + 1, filteredContratos.length)} a {Math.min(contratoPage * CONTRATOS_PER_PAGE, filteredContratos.length)} de {filteredContratos.length} contrato{filteredContratos.length !== 1 ? 's' : ''}</span>
                  <div className="orc-pagination-btns">
                    <button type="button" className="orc-page-btn orc-page-nav" disabled={contratoPage <= 1} onClick={() => setContratoPage(p => Math.max(1, p - 1))}>‹</button>
                    {Array.from({ length: contratoTotalPages }, (_, i) => i + 1)
                      .filter(p => p === 1 || p === contratoTotalPages || Math.abs(p - contratoPage) <= 1)
                      .reduce((acc, p, idx, arr) => {
                        if (idx > 0 && p - arr[idx - 1] > 1) acc.push('...');
                        acc.push(p);
                        return acc;
                      }, [])
                      .map((item, idx) => item === '...'
                        ? <span key={`dots-${idx}`} className="orc-page-dots">…</span>
                        : <button key={item} type="button" className={`orc-page-btn ${item === contratoPage ? 'active' : ''}`} onClick={() => setContratoPage(item)}>{item}</button>
                      )}
                    <button type="button" className="orc-page-btn orc-page-nav" disabled={contratoPage >= contratoTotalPages} onClick={() => setContratoPage(p => Math.min(contratoTotalPages, p + 1))}>›</button>
                  </div>
                </div>
              </div>

              {/* ── Contract review modal ── */}
              {selectedContrato && typeof document !== 'undefined' && createPortal((
                <div className="contract-modal-backdrop ctr-review-backdrop">
                  <div className="contract-modal ctr-review-modal" role="dialog" aria-modal="true" aria-labelledby="contract-review-title">
                    <div className="contract-modal-header">
                      <div>
                        <span>Revisão do contrato</span>
                        <h3 id="contract-review-title">{contractNumber(selectedContrato)}</h3>
                        <p>{selectedContrato.clienteNome}</p>
                      </div>
                      <div className="ctr-detail-header-right">
                        <span className={`ctr-status-badge ${selectedContrato.status === 'Aprovado' ? 'ctr-status-aprovado' : selectedContrato.status === 'Recusado' ? 'ctr-status-recusado' : 'ctr-status-pendente'}`}>
                          {selectedContrato.status}
                        </span>
                        <button type="button" className="lead-modal-close" onClick={closeContractReview} aria-label="Fechar">×</button>
                      </div>
                    </div>

                    <div className="ctr-review-sections">
                      <section className="ctr-review-section">
                        <h4>Cliente</h4>
                        <div className="ctr-review-edit-grid">
                          {renderContractReviewField('Nome', 'clienteNome')}
                          {renderContractReviewField('Telefone', 'clienteTelefone', { inputMode: 'tel' })}
                          {renderContractReviewField('E-mail', 'clienteEmail', { type: 'email' })}
                          {renderContractReviewField('Cidade', 'clienteCidade')}
                          <label className="ctr-review-field"><span>Responsável</span><strong>{getResponsibleName(selectedContrato.assignedUserName || selectedContrato.criadoPorNome)}</strong></label>
                          <label className="ctr-review-field"><span>Data</span><strong>{dateBr(selectedContrato.dataCriacao)}</strong></label>
                        </div>
                      </section>

                      <section className="ctr-review-section">
                        <h4>Sistema e valores</h4>
                        <div className="ctr-review-edit-grid">
                          {renderContractReviewField('Valor total', 'valorProjeto', { money: true, format: money })}
                          {renderContractReviewField('Entrada', 'valorEntrada', { money: true, format: money })}
                          {renderContractReviewField('Saldo', 'valorSaldo', { money: true, format: money })}
                          {renderContractReviewField('Potência kWp', 'potenciaKwp', { type: 'number', inputMode: 'decimal' })}
                          {renderContractReviewField('Geração mensal kWh', 'geracaoKwh', { type: 'number', inputMode: 'decimal' })}
                          {renderContractReviewField('Geração anual kWh', 'geracaoAnualKwh', { type: 'number', inputMode: 'decimal' })}
                          {renderContractReviewField('Placas', 'numeroPaineis', { type: 'number', inputMode: 'numeric' })}
                          {renderContractReviewField('Modelo placa', 'placaModelo')}
                          {renderContractReviewField('Inversor', 'inversorModelo')}
                          {renderContractReviewField('Cabo', 'quantidadeCabo')}
                          {renderContractReviewField('Prazo dias', 'prazoExecucao', { type: 'number', inputMode: 'numeric' })}
                          {renderContractReviewField('Tipo pagamento', 'formaPagamentoTipo', {
                            type: 'select',
                            options: [
                              { value: '', label: 'Não informado' },
                              { value: 'avista', label: 'À vista' },
                              { value: 'financiado', label: 'Financiado' },
                              { value: 'cartao', label: 'Cartão' },
                              { value: 'misto', label: 'Misto' },
                            ],
                          })}
                          <div className="ctr-review-span-2">
                            {renderContractReviewField('Condição de pagamento', 'formaPagamento', { type: 'textarea' })}
                          </div>
                        </div>
                      </section>

                      {selectedContrato.observacaoAnalise && (
                        <div className="contract-note">
                          <span>Observação da análise</span>
                          <p>{selectedContrato.observacaoAnalise}</p>
                        </div>
                      )}
                    </div>

                    {adminUser.role === 'ADM' && selectedContrato.status === 'Pendente' && (
                      <div className="review-box ctr-review-box">
                        <label htmlFor="review-note">Observação da revisão</label>
                        <textarea
                          id="review-note"
                          placeholder="Para aprovar, a observação é opcional. Para recusar, informe o motivo do ajuste."
                          value={reviewNote}
                          onChange={(event) => { setReviewNote(event.target.value); if (reviewError) setReviewError(''); }}
                        />
                        {reviewError && <p className="review-error">{reviewError}</p>}
                        <div className="contract-modal-actions">
                          <button type="button" className="btn btn-outline" onClick={closeContractReview}>Cancelar</button>
                          <button type="button" className="btn btn-outline" onClick={() => saveContractReview(selectedContrato)}>Salvar alterações</button>
                          <button type="button" className="btn btn-outline ctr-modal-reject" onClick={() => revisarContrato(selectedContrato.id, 'Recusado')}>Recusar</button>
                          <button type="button" className="btn btn-primary" onClick={() => revisarContrato(selectedContrato.id, 'Aprovado')}>Aprovar contrato</button>
                        </div>
                      </div>
                    )}

                    {selectedContrato.status === 'Aprovado' && (
                      <div className="approved-actions">
                        <div><strong>Contrato liberado</strong><span>{isMasterAdmin ? 'Admin master pode salvar ajustes finais.' : 'Contrato aprovado disponível somente para download.'}</span></div>
                        <div className="approved-actions-buttons">
                          {canEditReviewedContract(selectedContrato) && <button type="button" className="btn btn-outline" onClick={() => saveContractReview(selectedContrato)}>Salvar alterações</button>}
                          <a className="btn btn-outline" href={getContratoDownloadUrl(selectedContrato.id)} target="_blank" rel="noopener noreferrer">Baixar contrato</a>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ), document.body)}

              {/* ── Bottom legend ── */}
              <div className="ctr-legend">
                <div className="ctr-legend-item">
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="ctr-legend-icon ctr-legend-green"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm-2 15-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9Z" fill="currentColor"/></svg>
                  <div><strong>Aprovado</strong><p>Contrato validado pelo Sr. DRM e disponível para download/envio.</p></div>
                </div>
                <div className="ctr-legend-item">
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="ctr-legend-icon ctr-legend-blue"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm1 15h-2v-2h2v2Zm0-4h-2V7h2v6Z" fill="currentColor"/></svg>
                  <div><strong>Pendente</strong><p>Contrato aguardando validação do Sr. DRM.</p></div>
                </div>
                <div className="ctr-legend-item">
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="ctr-legend-icon ctr-legend-red"><path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2Zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59Z" fill="currentColor"/></svg>
                  <div><strong>Rejeitado</strong><p>Contrato recusado e retornado para ajustes.</p></div>
                </div>
                <div className="ctr-legend-item">
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="ctr-legend-icon ctr-legend-gray"><path d="M5 20h14v-2H5v2Zm7-18v12l-5-5-1.4 1.4L12 17l6.4-6.6L17 9l-5 5V2h-2Z" fill="currentColor"/></svg>
                  <div><strong>Baixar (PDF)</strong><p>Download do contrato em formato PDF.</p></div>
                </div>
                <div className="ctr-legend-item">
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="ctr-legend-icon ctr-legend-wa"><path d="M17.5 14.4c-.3-.1-1.7-.8-1.9-.9-.3-.1-.5-.1-.7.1-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6.1-.3-.2-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.4-.5.3-.5v-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5H8c-.2 0-.5.1-.7.3-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3 4.8 4.2.7.3 1.2.4 1.6.5.7.2 1.3.2 1.8.1.5-.1 1.7-.7 1.9-1.3.2-.6.2-1.2.1-1.3-.1-.1-.3-.2-.5-.3ZM12 2C6.5 2 2 6.5 2 12c0 1.9.5 3.6 1.4 5.1L2 22l5.1-1.3A10 10 0 0 0 12 22c5.5 0 10-4.5 10-10S17.5 2 12 2Z" fill="currentColor"/></svg>
                  <div><strong>Enviar via WhatsApp</strong><p>Envio o contrato diretamente para o cliente.</p></div>
                </div>
              </div>

              {/* ── ADM only: contract template editor ── */}
              {adminUser.role === 'ADM' && (
                <div className="contract-admin-grid">
                  <div className="admin-card catalog-shortcut-card">
                    <div className="catalog-shortcut-top">
                      <div className="catalog-shortcut-info">
                        <h3>Produtos e pacotes</h3>
                        <p className="muted-text">Gerencie kits e equipamentos no menu lateral.</p>
                      </div>
                      <button type="button" className="btn btn-outline btn-sm-admin" onClick={() => setActiveTab('produtosPacotes')}>Abrir catálogo →</button>
                    </div>
                    <div className="catalog-shortcut-chips">
                      <span className="catalog-chip"><strong>{activeProdutosTotal}</strong> ativos</span>
                      <span className="catalog-chip"><strong>{equipamentos.filter(item => item.valorSistema).length}</strong> com valor</span>
                      <span className="catalog-chip"><strong>{equipamentos.length}</strong> total</span>
                    </div>
                  </div>

                  <form className="admin-card contract-template-editor" onSubmit={saveContractConfig}>
                    <div className="card-header-flex">
                      <div>
                        <h3>Editor do contrato</h3>
                        <p className="muted-text">Edite cabeçalho, empresa, posição da logo e cláusulas. Use as variáveis para preencher os dados automaticamente.</p>
                      </div>
                      <button className="btn btn-primary" type="submit">Salvar modelo</button>
                    </div>
                    <div className="contract-editor-grid">
                      <input placeholder="Nome da empresa" value={contractConfig.empresa?.nome || ''} onChange={(e) => setContractConfig(prev => ({ ...prev, empresa: { ...prev.empresa, nome: e.target.value } }))} />
                      <input placeholder="CNPJ" value={contractConfig.empresa?.cnpj || ''} onChange={(e) => setContractConfig(prev => ({ ...prev, empresa: { ...prev.empresa, cnpj: e.target.value } }))} />
                      <input placeholder="Telefone" value={contractConfig.empresa?.telefone || ''} onChange={(e) => setContractConfig(prev => ({ ...prev, empresa: { ...prev.empresa, telefone: e.target.value } }))} />
                      <input placeholder="E-mail" value={contractConfig.empresa?.email || ''} onChange={(e) => setContractConfig(prev => ({ ...prev, empresa: { ...prev.empresa, email: e.target.value } }))} />
                      <input className="span-2" placeholder="Endereço da empresa" value={contractConfig.empresa?.endereco || ''} onChange={(e) => setContractConfig(prev => ({ ...prev, empresa: { ...prev.empresa, endereco: e.target.value } }))} />
                      <input className="span-2" placeholder="Título do contrato" value={contractConfig.titulo || ''} onChange={(e) => setContractConfig(prev => ({ ...prev, titulo: e.target.value }))} />
                      <select value={contractConfig.visual?.logoPosition || 'center'} onChange={(e) => setContractConfig(prev => ({ ...prev, visual: { ...prev.visual, logoPosition: e.target.value } }))}>
                        <option value="left">Logo à esquerda</option>
                        <option value="center">Logo centralizada</option>
                        <option value="right">Logo à direita</option>
                      </select>
                      <input type="number" placeholder="Largura da logo" value={contractConfig.visual?.logoWidth || 150} onChange={(e) => setContractConfig(prev => ({ ...prev, visual: { ...prev.visual, logoWidth: e.target.value } }))} />
                    </div>
                    <div className="template-help">
                      Variáveis: {'{{cliente.nome}}'}, {'{{cliente.telefone}}'}, {'{{cliente.cidade}}'}, {'{{contrato.valor}}'}, {'{{contrato.formaPagamento}}'}, {'{{projeto.potencia}}'}, {'{{projeto.geracao}}'}, {'{{projeto.quantidadeCabo}}'}, {'{{projeto.paineis}}'}, {'{{equipamento.placaModelo}}'}, {'{{equipamento.inversorModelo}}'}
                    </div>
                    <textarea
                      className="contract-template-textarea"
                      value={contractConfig.corpo || ''}
                      onChange={(e) => setContractConfig(prev => ({ ...prev, corpo: e.target.value }))}
                    />
                  </form>
                </div>
              )}
            </div>
          )}

          {activeTab === 'produtosPacotes' && (
            <div className="admin-section">
              <div className="section-heading">
                <div>
                  <span className="section-kicker">Catálogo</span>
                  <h3>Produtos e Pacotes</h3>
                  <p>Cadastre os itens que entram no contrato para a equipe apenas selecionar e revisar.</p>
                </div>
                <div className="section-stats">
                  <div><strong>{equipamentos.length}</strong><span>itens</span></div>
                  <div><strong>{equipamentos.filter(item => item.active).length}</strong><span>ativos</span></div>
                  <div><strong>{equipamentos.filter(item => item.valorSistema).length}</strong><span>com valor</span></div>
                </div>
              </div>
              {renderProdutosPacotes()}
            </div>
          )}

          {activeTab === 'homologacao' && (
            <div className="admin-section homologation-screen">
              <div className="section-heading homologation-heading">
                <div>
                  <span className="section-kicker">Workflow operacional</span>
                  <h3>Homologação</h3>
                  <p>Acompanhe e gerencie todo o processo de homologação junto à concessionária.</p>
                </div>
                {selectedProjeto && homoView === 'detalhes' && (
                  <button type="button" className="btn btn-outline" onClick={() => { setHomoView('fila'); setSelectedProjeto(null); }}>
                    ← Voltar para fila
                  </button>
                )}
              </div>

              {/* KPI Row */}
              <div className="homo-kpi-row">
                <div className="homo-kpi-card">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                  <div><strong>{homologacaoSummary.ativos}</strong><span>Ativos</span></div>
                </div>
                <div className="homo-kpi-card kpi-warning">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  <div><strong>{homologacaoSummary.pendencias}</strong><span>Pendências</span></div>
                </div>
                <div className="homo-kpi-card kpi-blue">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                  <div><strong>{homologacaoSummary.enviados}</strong><span>Enviados</span></div>
                </div>
                <div className="homo-kpi-card kpi-purple">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                  <div><strong>{homologacaoSummary.parecer}</strong><span>Pareceres emitidos</span></div>
                </div>
                <div className="homo-kpi-card kpi-green">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                  <div><strong>{homologacaoSummary.concluidos}</strong><span>Ligações concluídas</span></div>
                </div>
              </div>

              {/* FILA VIEW */}
              {homoView === 'fila' && (
                <div className="homo-fila-layout">
                  <div className="homo-fila-main">
                    <div className="admin-card">
                      <div className="homo-fila-header">
                        <div>
                          <h3>Fila de homologação</h3>
                          <p className="muted-text">{filteredHomologacaoProjetos.length} processo{filteredHomologacaoProjetos.length !== 1 ? 's' : ''}</p>
                        </div>
                        <div className="homo-fila-controls">
                          <div className="homo-search-wrap">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="10" cy="10" r="7"/><line x1="21" y1="21" x2="15" y2="15"/></svg>
                            <input value={projectSearch} onChange={e => setProjectSearch(e.target.value)} placeholder="Buscar cliente, protocolo ou cidade..." />
                          </div>
                          <select className="homo-filter-select" value={homoStatusFilter} onChange={e => setHomoStatusFilter(e.target.value)}>
                            <option value="todos">Todos os status</option>
                            <option value="ativo">Ativos</option>
                            <option value="pendente">Com pendências</option>
                            <option value="enviado">Enviados</option>
                            <option value="concluido">Concluídos</option>
                          </select>
                        </div>
                      </div>

                      <div className="table-container">
                        <table className="modern-table homo-fila-table">
                          <thead>
                            <tr>
                              <th>Protocolo</th>
                              <th>Cliente</th>
                              <th>Cidade</th>
                              <th>Responsável</th>
                              <th>Status documental</th>
                              <th>Etapa atual</th>
                              <th>Última atualização</th>
                              <th>Próxima ação</th>
                              <th>Ações</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredHomologacaoProjetos.filter(p => {
                              if (homoStatusFilter === 'ativo') return p.etapa !== 'Projeto concluído';
                              if (homoStatusFilter === 'pendente') return (p.pendenciasHomologacao || []).some(pd => !['Corrigida','Concluída','Cancelada'].includes(pd.status));
                              if (homoStatusFilter === 'enviado') return (p.enviosHomologacao || []).length > 0;
                              if (homoStatusFilter === 'concluido') return p.etapa === 'Projeto concluído';
                              return true;
                            }).map(projeto => {
                              const openPend = (projeto.pendenciasHomologacao || []).filter(pd => !['Corrigida','Concluída','Cancelada'].includes(pd.status)).length;
                              const statusDoc = projeto.statusDocumental || (openPend > 0 ? 'Pendente' : (projeto.enviosHomologacao || []).length > 0 ? 'Enviado' : 'Em análise');
                              const statusDocClass = statusDoc === 'Completo' ? 'homo-badge-completo' : statusDoc === 'Pendente' ? 'homo-badge-pendente' : statusDoc === 'Enviado' ? 'homo-badge-enviado' : 'homo-badge-analise';
                              const etapaClass = projeto.etapa === 'Projeto concluído' ? 'homo-etapa-concluido' : openPend > 0 ? 'homo-etapa-pendente' : 'homo-etapa-andamento';
                              const nextAction = openPend > 0 ? 'Corrigir pendência' : projeto.etapa === 'Projeto para envio' ? 'Protocolar envio' : projeto.etapa === 'Aguardando parecer de acesso' ? 'Aguardar parecer' : projeto.etapa === 'Projeto concluído' ? 'Finalizado' : 'Ver detalhes';
                              return (
                                <tr key={projeto.id} className="homo-row-clickable" onClick={() => { setSelectedProjeto(projeto); setHomoView('detalhes'); setHomoDetalheTab('cliente'); }}>
                                  <td className="homo-protocolo">SP-{String(projeto.contratoId || projeto.id).padStart(4,'0')}</td>
                                  <td className="font-medium homo-nome">{projeto.clienteNome}</td>
                                  <td>{projeto.clienteCidade || '—'}</td>
                                  <td>{getResponsibleName(projeto.responsavelNome)}</td>
                                  <td><span className={`homo-badge ${statusDocClass}`}>{statusDoc}</span></td>
                                  <td><span className={`homo-etapa-badge ${etapaClass}`}>{projeto.etapa}</span></td>
                                  <td className="homo-date">{projeto.updatedAt ? new Date(projeto.updatedAt).toLocaleDateString('pt-BR') : '—'}</td>
                                  <td className="homo-next-action">{nextAction}</td>
                                  <td>
                                    <button type="button" className="btn btn-outline btn-sm-admin" onClick={e => { e.stopPropagation(); setSelectedProjeto(projeto); setHomoView('detalhes'); setHomoDetalheTab('cliente'); }}>
                                      Ver processo
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        {filteredHomologacaoProjetos.length === 0 && (
                          <div className="empty-state-orcamento">
                            <span className="icon">HM</span>
                            <h4>Nenhum processo encontrado</h4>
                            <p>Ajuste a busca ou os filtros para ver projetos de homologação.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="homo-fila-sidebar">
                    <div className="admin-card homo-resumo-card">
                      <h4>Resumo da fila</h4>
                      <div className="homo-resumo-list">
                        <div className="homo-resumo-item"><span className="homo-dot dot-green"></span><span>Ativos</span><strong>{homologacaoSummary.ativos}</strong></div>
                        <div className="homo-resumo-item"><span className="homo-dot dot-orange"></span><span>Pendentes</span><strong>{homologacaoSummary.pendencias}</strong></div>
                        <div className="homo-resumo-item"><span className="homo-dot dot-blue"></span><span>Enviados</span><strong>{homologacaoSummary.enviados}</strong></div>
                        <div className="homo-resumo-item"><span className="homo-dot dot-purple"></span><span>Parecer emitido</span><strong>{homologacaoSummary.parecer}</strong></div>
                        <div className="homo-resumo-item"><span className="homo-dot dot-success"></span><span>Ligação concluída</span><strong>{homologacaoSummary.concluidos}</strong></div>
                        <div className="homo-resumo-divider"></div>
                        <div className="homo-resumo-item homo-resumo-total"><span>Total de processos</span><strong>{projetos.length}</strong></div>
                      </div>
                    </div>
                    <div className="admin-card homo-legenda-card">
                      <h4>Legenda — Status documental</h4>
                      <div className="homo-legenda-list">
                        <div><span className="homo-badge homo-badge-completo">Completo</span><span>Documentação completa</span></div>
                        <div><span className="homo-badge homo-badge-pendente">Pendente</span><span>Aguardando correção</span></div>
                        <div><span className="homo-badge homo-badge-analise">Em análise</span><span>Faltam documentos</span></div>
                        <div><span className="homo-badge homo-badge-enviado">Enviado</span><span>Enviado para análise</span></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* DETALHES VIEW */}
              {homoView === 'detalhes' && selectedProjeto && (
                <div className="homo-detalhes-screen">
                  {/* Top strip */}
                  <div className="admin-card homo-detalhes-strip">
                    <div className="homo-strip-item"><span>Cliente</span><strong>{selectedProjeto.clienteNome}</strong></div>
                    <div className="homo-strip-item"><span>Cidade</span><strong>{selectedProjeto.clienteCidade || '—'}</strong></div>
                    <div className="homo-strip-item"><span>Protocolo</span><strong>SP-{String(selectedProjeto.contratoId || selectedProjeto.id).padStart(4,'0')}</strong></div>
                    <div className="homo-strip-item">
                      <span>Etapa atual</span>
                      <span className={`homo-etapa-badge ${selectedProjeto.etapa === 'Projeto concluído' ? 'homo-etapa-concluido' : 'homo-etapa-andamento'}`}>{selectedProjeto.etapa}</span>
                    </div>
                    <div className="homo-strip-item"><span>Responsável técnico</span><strong>{selectedProjeto.responsavelTecnicoNome || selectedProjeto.responsavelNome || '—'}</strong></div>
                    <div className="homo-strip-item"><span>Concessionária</span>
                      <input className="homo-strip-input" defaultValue={selectedProjeto.concessionaria || ''} onBlur={e => e.target.value !== (selectedProjeto.concessionaria || '') && updateProjetoDetalhes(selectedProjeto.id, { concessionaria: e.target.value })} placeholder="Ex: CPFL, Equatorial..." />
                    </div>
                    <div className="homo-strip-item"><span>SLA atual</span>
                      <input className="homo-strip-input" defaultValue={selectedProjeto.slaAtual || ''} onBlur={e => e.target.value !== (selectedProjeto.slaAtual || '') && updateProjetoDetalhes(selectedProjeto.id, { slaAtual: e.target.value })} placeholder="Ex: 5 dias úteis" />
                    </div>
                  </div>

                  <div className="homo-detalhes-layout">
                    {/* Left column */}
                    <div className="homo-detalhes-left">
                      {/* Dados do cliente + sistema */}
                      <div className="admin-card homo-dados-card">
                        <div className="homo-dados-sections">
                          <div>
                            <div className="homo-dados-header"><h4>Dados do cliente</h4></div>
                            <div className="homo-dados-grid">
                              <div><span>Nome</span><p>{selectedProjeto.clienteNome}</p></div>
                              <div><span>Cidade</span><p>{selectedProjeto.clienteCidade || '—'}</p></div>
                              <div><span>Telefone</span><p>{selectedProjeto.clienteTelefone || '—'}</p></div>
                            </div>
                          </div>
                          <div>
                            <div className="homo-dados-header"><h4>Dados do sistema / obra</h4></div>
                            <div className="homo-dados-grid">
                              <div><span>Contrato</span><p>#{selectedProjeto.contratoId || '—'}</p></div>
                              <div><span>Valor</span><p>{money(selectedProjeto.valorProjeto)}</p></div>
                              <div><span>Prazo previsto</span><p>{dateBr(selectedProjeto.prazoPrevisto)}</p></div>
                              <div><span>Previsão ligação</span><p>{dateBr(selectedProjeto.previsaoLigacao)}</p></div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Tabs */}
                      <div className="admin-card homo-tabs-card">
                        <div className="homo-tabs">
                          {[['cliente','Documentos do cliente'],['projetista','Documentos do projetista'],['protocolos','Protocolos e concessionária'],['observacoes','Observações internas']].map(([tab, label]) => (
                            <button key={tab} type="button" className={`homo-tab ${homoDetalheTab === tab ? 'active' : ''}`} onClick={() => setHomoDetalheTab(tab)}>{label}</button>
                          ))}
                        </div>

                        {/* Documents tab content */}
                        {(homoDetalheTab === 'cliente' || homoDetalheTab === 'projetista') && (() => {
                          const tipo = homoDetalheTab === 'cliente' ? 'cliente' : 'projetista';
                          const docs = tipo === 'cliente' ? (selectedProjeto.documentosCliente || []) : (selectedProjeto.documentosProjetista || []);
                          return (
                            <div className="homo-docs-panel">
                              <div className="table-container">
                                <table className="modern-table homo-docs-table">
                                  <thead>
                                    <tr><th>Documento</th><th>Arquivo</th><th>Responsável</th><th>Data</th><th>Status</th><th>Ações</th></tr>
                                  </thead>
                                  <tbody>
                                    {docs.map(doc => (
                                      <tr key={doc.id}>
                                        <td>
                                          <strong>{doc.nome}</strong>
                                          {doc.descricao && <p className="muted-text" style={{fontSize:'0.75rem',margin:0}}>{doc.descricao}</p>}
                                        </td>
                                        <td className="homo-arquivo-cell">
                                          {doc.dataUrl ? (
                                            <a href={doc.dataUrl} target="_blank" rel="noopener noreferrer" className="homo-file-link">{doc.arquivo || 'Ver arquivo'}</a>
                                          ) : <span className="muted-text">—</span>}
                                        </td>
                                        <td>{doc.responsavel || '—'}</td>
                                        <td>{doc.data || '—'}</td>
                                        <td>
                                          <select className="homo-status-select" value={doc.status} onChange={e => updateProjetoDocumento(selectedProjeto.id, doc.id, tipo, { status: e.target.value })}>
                                            <option>Pendente</option>
                                            <option>Concluído</option>
                                            <option>Não enviado</option>
                                            <option>Incompleto</option>
                                          </select>
                                        </td>
                                        <td>
                                          <div className="table-actions">
                                            <label className="btn btn-outline btn-sm-admin homo-upload-btn" title="Substituir arquivo">
                                              Substituir
                                              <input type="file" style={{display:'none'}} accept=".pdf,.jpg,.jpeg,.png" onChange={e => {
                                                const file = e.target.files[0];
                                                if (!file) return;
                                                const reader = new FileReader();
                                                reader.onload = ev => updateProjetoDocumento(selectedProjeto.id, doc.id, tipo, { dataUrl: ev.target.result, arquivo: file.name, status: 'Concluído' });
                                                reader.readAsDataURL(file);
                                                e.target.value = '';
                                              }} />
                                            </label>
                                            <button type="button" className="btn btn-outline btn-sm-admin" style={{color:'#dc2626'}} onClick={() => deleteProjetoDocumento(selectedProjeto.id, doc.id, tipo)}>Remover</button>
                                          </div>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                                {docs.length === 0 && <p className="muted-text" style={{padding:'1rem'}}>Nenhum documento nesta categoria.</p>}
                              </div>
                              <div className="homo-add-doc-area">
                                <h5>Adicionar documento</h5>
                                <div className="homo-add-doc-form">
                                  <input className="cc-input" placeholder="Nome do documento" value={homoDocUpload.nome} onChange={e => setHomoDocUpload(prev => ({ ...prev, nome: e.target.value }))} />
                                  <input className="cc-input" placeholder="Descrição (opcional)" value={homoDocUpload.descricao} onChange={e => setHomoDocUpload(prev => ({ ...prev, descricao: e.target.value }))} />
                                  <label className="homo-file-upload-btn">
                                    {homoDocUpload.arquivo ? homoDocUpload.arquivo.name : 'Selecionar arquivo'}
                                    <input type="file" style={{display:'none'}} accept=".pdf,.jpg,.jpeg,.png" onChange={e => setHomoDocUpload(prev => ({ ...prev, arquivo: e.target.files[0] || null }))} />
                                  </label>
                                  <button type="button" className="btn btn-primary" disabled={!homoDocUpload.nome.trim() || homoDocUploadLoading}
                                    onClick={() => {
                                      if (!homoDocUpload.arquivo) {
                                        uploadProjetoDocumento(selectedProjeto.id, tipo, { nome: homoDocUpload.nome, descricao: homoDocUpload.descricao });
                                      } else {
                                        const reader = new FileReader();
                                        reader.onload = ev => uploadProjetoDocumento(selectedProjeto.id, tipo, { nome: homoDocUpload.nome, descricao: homoDocUpload.descricao, dataUrl: ev.target.result, arquivo: homoDocUpload.arquivo.name });
                                        reader.readAsDataURL(homoDocUpload.arquivo);
                                      }
                                    }}>
                                    {homoDocUploadLoading ? 'Enviando...' : 'Adicionar'}
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })()}

                        {/* Protocolos e concessionária */}
                        {homoDetalheTab === 'protocolos' && (
                          <div className="homo-docs-panel">
                            <div className="homo-protocol-section">
                              <h5>Envios / Protocolos registrados</h5>
                              <div className="homologation-list">
                                {(selectedProjeto.enviosHomologacao || []).map(envio => (
                                  <article key={envio.id}>
                                    <strong>#{envio.numero} • {envio.tipo}</strong>
                                    <span>{envio.protocolo || 'Sem protocolo'} • {envio.status}</span>
                                    <p>{envio.resposta || 'Sem resposta registrada.'}</p>
                                  </article>
                                ))}
                                {(selectedProjeto.enviosHomologacao || []).length === 0 && <p className="muted-text">Nenhum envio registrado.</p>}
                              </div>
                            </div>
                            <div className="homo-protocol-section">
                              <h5>Documentos da concessionária</h5>
                              <div className="table-container">
                                <table className="modern-table homo-docs-table">
                                  <thead>
                                    <tr><th>Documento</th><th>Arquivo</th><th>Responsável</th><th>Data</th><th>Status</th><th>Ações</th></tr>
                                  </thead>
                                  <tbody>
                                    {(selectedProjeto.documentosConcessionaria || []).map(doc => (
                                      <tr key={doc.id}>
                                        <td><strong>{doc.nome}</strong></td>
                                        <td>{doc.dataUrl ? <a href={doc.dataUrl} target="_blank" rel="noopener noreferrer" className="homo-file-link">{doc.arquivo || 'Ver'}</a> : '—'}</td>
                                        <td>{doc.responsavel || '—'}</td>
                                        <td>{doc.data || '—'}</td>
                                        <td><span className={`homo-badge ${doc.status === 'Concluído' ? 'homo-badge-completo' : 'homo-badge-pendente'}`}>{doc.status}</span></td>
                                        <td>
                                          <label className="btn btn-outline btn-sm-admin">Subir
                                            <input type="file" style={{display:'none'}} onChange={e => {
                                              const file = e.target.files[0]; if (!file) return;
                                              const reader = new FileReader();
                                              reader.onload = ev => updateProjetoDocumento(selectedProjeto.id, doc.id, 'concessionaria', { dataUrl: ev.target.result, arquivo: file.name, status: 'Concluído' });
                                              reader.readAsDataURL(file); e.target.value = '';
                                            }} />
                                          </label>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                                {(selectedProjeto.documentosConcessionaria || []).length === 0 && <p className="muted-text" style={{padding:'1rem'}}>Nenhum documento da concessionária.</p>}
                              </div>
                              <div className="homo-add-doc-area">
                                <h5>Adicionar documento da concessionária</h5>
                                <div className="homo-add-doc-form">
                                  <input className="cc-input" placeholder="Ex: Parecer de acesso, Protocolo..." value={homoDocUpload.tipo === 'concessionaria' ? homoDocUpload.nome : ''} onChange={e => setHomoDocUpload({ tipo: 'concessionaria', nome: e.target.value, descricao: '', arquivo: null })} />
                                  <label className="homo-file-upload-btn">
                                    {homoDocUpload.tipo === 'concessionaria' && homoDocUpload.arquivo ? homoDocUpload.arquivo.name : 'Selecionar arquivo'}
                                    <input type="file" style={{display:'none'}} accept=".pdf,.jpg,.jpeg,.png" onChange={e => setHomoDocUpload(prev => ({ ...prev, tipo: 'concessionaria', arquivo: e.target.files[0] || null }))} />
                                  </label>
                                  <button type="button" className="btn btn-primary" disabled={!(homoDocUpload.tipo === 'concessionaria' && homoDocUpload.nome.trim())}
                                    onClick={() => {
                                      if (!homoDocUpload.arquivo) {
                                        uploadProjetoDocumento(selectedProjeto.id, 'concessionaria', { nome: homoDocUpload.nome });
                                      } else {
                                        const reader = new FileReader();
                                        reader.onload = ev => uploadProjetoDocumento(selectedProjeto.id, 'concessionaria', { nome: homoDocUpload.nome, dataUrl: ev.target.result, arquivo: homoDocUpload.arquivo.name });
                                        reader.readAsDataURL(homoDocUpload.arquivo);
                                      }
                                    }}>Adicionar</button>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Observações internas */}
                        {homoDetalheTab === 'observacoes' && (
                          <div className="homo-docs-panel homo-obs-panel">
                            <h5>Anotações internas</h5>
                            <p className="muted-text">Adicione observações sobre o andamento, pendências ou orientações internas.</p>
                            <textarea
                              className="cc-input cc-textarea homo-obs-textarea"
                              placeholder="Adicione observações sobre o andamento, pendências ou orientações..."
                              defaultValue={selectedProjeto.observacoesInternas || ''}
                              onBlur={e => { if (e.target.value !== (selectedProjeto.observacoesInternas || '')) updateProjetoDetalhes(selectedProjeto.id, { observacoesInternas: e.target.value }); }}
                              rows={8}
                            />
                          </div>
                        )}
                      </div>

                      {/* Timeline */}
                      <div className="admin-card homo-timeline-card">
                        <h4>Linha do tempo do processo</h4>
                        <div className="homo-timeline-steps">
                          {[
                            { key:'documentacaoRecebida', label:'Doc. recebida' },
                            { key:'artGerada', label:'ART gerada' },
                            { key:'trtPaga', label:'ART/TRT paga' },
                            { key:'projetoTecnico', label:'Projeto elaborado' },
                            { key:'projetoEnviado', label:'Projeto enviado' },
                            { key:'parecerAcesso', label:'Parecer emitido' },
                            { key:'homologacao', label:'Ped. de ligação' },
                            { key:'sistemaLigado', label:'Ligação concluída' },
                          ].map((step, i) => {
                            const done = Boolean(selectedProjeto.checklist?.[step.key]);
                            return (
                              <div key={step.key} className={`homo-timeline-step ${done ? 'done' : ''}`}>
                                <button type="button" className="homo-step-circle" onClick={() => updateProjeto(selectedProjeto.id, { checklist: { ...(selectedProjeto.checklist || {}), [step.key]: !done } })} title={done ? 'Marcar como pendente' : 'Marcar como concluído'}>
                                  {done ? '✓' : String(i+1)}
                                </button>
                                <span>{step.label}</span>
                                {done && <small>{dateBr(selectedProjeto.updatedAt)}</small>}
                              </div>
                            );
                          })}
                        </div>
                        <div className="homologation-timeline-list" style={{marginTop:'1rem'}}>
                          {(selectedProjeto.timeline || []).slice(0,8).map(item => (
                            <article key={item.id}>
                              <i></i>
                              <div>
                                <strong>{item.titulo}</strong>
                                <p>{item.descricao}</p>
                                <span>{dateBr(item.data)} • {item.responsavel || 'Equipe DRM'}</span>
                              </div>
                            </article>
                          ))}
                          {(selectedProjeto.timeline || []).length === 0 && <p className="muted-text">Os movimentos aparecerão aqui automaticamente.</p>}
                        </div>
                      </div>
                    </div>

                    {/* Right column */}
                    <div className="homo-detalhes-right">
                      {/* Status geral */}
                      <div className="admin-card homo-status-card">
                        <h4>Status geral</h4>
                        <div className="homo-status-list">
                          <div className="homo-status-item">
                            <span>Documentos do cliente</span>
                            <span className={`homo-badge ${(selectedProjeto.documentosCliente || []).some(d => d.status !== 'Concluído') ? 'homo-badge-pendente' : (selectedProjeto.documentosCliente || []).length > 0 ? 'homo-badge-completo' : 'homo-badge-analise'}`}>
                              {(selectedProjeto.documentosCliente || []).some(d => d.status !== 'Concluído') ? 'Pendente' : (selectedProjeto.documentosCliente || []).length > 0 ? 'Completo' : 'Vazio'}
                            </span>
                          </div>
                          <div className="homo-status-item">
                            <span>Documentos do projetista</span>
                            <span className={`homo-badge ${(selectedProjeto.documentosProjetista || []).some(d => d.status !== 'Concluído') ? 'homo-badge-pendente' : (selectedProjeto.documentosProjetista || []).length > 0 ? 'homo-badge-completo' : 'homo-badge-analise'}`}>
                              {(selectedProjeto.documentosProjetista || []).some(d => d.status !== 'Concluído') ? 'Pendente' : (selectedProjeto.documentosProjetista || []).length > 0 ? 'Completo' : 'Vazio'}
                            </span>
                          </div>
                          <div className="homo-status-item">
                            <span>Protocolos e concessionária</span>
                            <span className={`homo-badge ${(selectedProjeto.enviosHomologacao || []).length > 0 ? 'homo-badge-enviado' : 'homo-badge-analise'}`}>
                              {(selectedProjeto.enviosHomologacao || []).length > 0 ? 'Em andamento' : 'Aguardando'}
                            </span>
                          </div>
                          <div className="homo-status-item">
                            <span>Parecer e ligação</span>
                            <span className={`homo-badge ${selectedProjeto.checklist?.sistemaLigado ? 'homo-badge-completo' : selectedProjeto.checklist?.parecerAcesso ? 'homo-badge-enviado' : 'homo-badge-pendente'}`}>
                              {selectedProjeto.checklist?.sistemaLigado ? 'Ligação concluída' : selectedProjeto.checklist?.parecerAcesso ? 'Parecer emitido' : 'Pendente'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Fluxo de homologação */}
                      <div className="admin-card homo-fluxo-card">
                        <h4>Fluxo de homologação</h4>
                        <div className="homo-fluxo-list">
                          {officeChecklistKeys.map((key, i) => {
                            const done = Boolean(selectedProjeto.checklist?.[key]);
                            return (
                              <label key={key} className={`homo-fluxo-item ${done ? 'done' : ''}`}>
                                <input type="checkbox" checked={done} onChange={e => updateProjeto(selectedProjeto.id, { checklist: { ...(selectedProjeto.checklist || {}), [key]: e.target.checked } })} />
                                <span className="homo-fluxo-num">{i+1}</span>
                                <span>{projectChecklistLabels[key]}</span>
                                <span className={`homo-fluxo-status ${done ? 'done' : ''}`}>{done ? 'Concluído' : 'Pendente'}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      {/* Ações rápidas */}
                      <div className="admin-card homo-acoes-card">
                        <h4>Ações rápidas</h4>
                        <div className="homo-acoes-list">
                          <button type="button" className="homo-acao-btn" onClick={() => updateProjeto(selectedProjeto.id, { etapa: 'Gerar ART', checklist: { ...(selectedProjeto.checklist || {}), documentacaoRecebida: true } })}>
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                            Gerar ART / TRT
                          </button>
                          <button type="button" className="homo-acao-btn" onClick={() => updateProjeto(selectedProjeto.id, { etapa: 'Projeto para envio', checklist: { ...(selectedProjeto.checklist || {}), artGerada: true, trtPaga: true, projetoTecnico: true } })}>
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                            Enviar projeto
                          </button>
                          <button type="button" className="homo-acao-btn" onClick={() => updateProjeto(selectedProjeto.id, { etapa: 'Aguardando parecer de acesso', checklist: { ...(selectedProjeto.checklist || {}), projetoEnviado: true } })}>
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                            Registrar protocolo
                          </button>
                          <button type="button" className="homo-acao-btn" onClick={() => updateProjeto(selectedProjeto.id, { etapa: 'Projeto concluído', checklist: { ...(selectedProjeto.checklist || {}), sistemaLigado: true } })}>
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                            Concluir ligação
                          </button>
                        </div>
                        <div className="homo-etapa-control">
                          <label>
                            <span>Alterar etapa</span>
                            <select value={selectedProjeto.etapa} onChange={e => updateProjeto(selectedProjeto.id, { etapa: e.target.value })}>
                              {projectStages.map(s => <option key={s}>{s}</option>)}
                            </select>
                          </label>
                          <label>
                            <span>Prazo previsto</span>
                            <input type="date" value={selectedProjeto.prazoPrevisto || ''} onChange={e => updateProjeto(selectedProjeto.id, { prazoPrevisto: e.target.value })} />
                          </label>
                          <label>
                            <span>Previsão concessionária</span>
                            <input type="date" value={selectedProjeto.previsaoLigacao || ''} onChange={e => updateProjeto(selectedProjeto.id, { previsaoLigacao: e.target.value })} />
                          </label>
                        </div>
                      </div>

                      {/* Pendências */}
                      <div className="admin-card homo-pend-card">
                        <h4>Pendências <span className="homo-pend-count">{(selectedProjeto.pendenciasHomologacao || []).filter(pd => !['Corrigida','Concluída','Cancelada'].includes(pd.status)).length}</span></h4>
                        <form onSubmit={registerHomologacaoPendencia}>
                          <div className="homo-pend-form">
                            <input value={pendenciaForm.tipo} onChange={e => setPendenciaForm(prev => ({ ...prev, tipo: e.target.value }))} placeholder="Tipo de pendência" className="cc-input" />
                            <input type="date" value={pendenciaForm.prazo} onChange={e => setPendenciaForm(prev => ({ ...prev, prazo: e.target.value }))} className="cc-input" />
                            <textarea value={pendenciaForm.descricao} onChange={e => setPendenciaForm(prev => ({ ...prev, descricao: e.target.value }))} placeholder="Descreva a exigência..." className="cc-input" style={{gridColumn:'1/-1'}} required rows={2} />
                            <button className="btn btn-primary" type="submit" style={{gridColumn:'1/-1'}}>Registrar pendência</button>
                          </div>
                        </form>
                        <div className="homologation-list" style={{marginTop:'0.75rem'}}>
                          {(selectedProjeto.pendenciasHomologacao || []).slice(0,5).map(pendencia => (
                            <article key={pendencia.id} className={['Corrigida','Concluída','Cancelada'].includes(pendencia.status) ? 'resolved' : ''}>
                              <strong>{pendencia.tipo}</strong>
                              <span>{pendencia.status} • {dateBr(pendencia.prazo)}</span>
                              <p>{pendencia.descricao}</p>
                              {!['Corrigida','Concluída','Cancelada'].includes(pendencia.status) && (
                                <button type="button" className="btn btn-outline btn-sm-admin" onClick={() => updateHomologacaoPendencia(pendencia.id, { status: 'Corrigida', observacoes: 'Correção registrada.' })}>Marcar corrigida</button>
                              )}
                            </article>
                          ))}
                        </div>
                      </div>

                      {/* Envio/Protocolo */}
                      <div className="admin-card homo-envio-card">
                        <h4>Registro de envio / protocolo</h4>
                        <form onSubmit={registerHomologacaoEnvio}>
                          <div className="homo-pend-form">
                            <select value={envioHomologacaoForm.tipo} onChange={e => setEnvioHomologacaoForm(prev => ({ ...prev, tipo: e.target.value }))} className="cc-input">
                              <option>Envio inicial</option>
                              <option>Reenvio</option>
                            </select>
                            <input value={envioHomologacaoForm.protocolo} onChange={e => setEnvioHomologacaoForm(prev => ({ ...prev, protocolo: e.target.value }))} placeholder="Nº do protocolo" className="cc-input" />
                            <textarea value={envioHomologacaoForm.resposta} onChange={e => setEnvioHomologacaoForm(prev => ({ ...prev, resposta: e.target.value }))} placeholder="Retorno da concessionária ou observação..." className="cc-input" style={{gridColumn:'1/-1'}} rows={2} />
                            <button className="btn btn-primary" type="submit" style={{gridColumn:'1/-1'}}>Registrar envio</button>
                          </div>
                        </form>
                        <div className="homologation-list" style={{marginTop:'0.75rem'}}>
                          {(selectedProjeto.enviosHomologacao || []).slice(0,3).map(envio => (
                            <article key={envio.id}>
                              <strong>#{envio.numero} • {envio.tipo}</strong>
                              <span>{envio.protocolo || 'Sem protocolo'} • {envio.status}</span>
                              <p>{envio.resposta || '—'}</p>
                            </article>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'projetos' && (
            <div className="admin-section">
              {!selectedProjeto && (
                <>
                  <div className="section-heading">
                    <div>
                      <span className="section-kicker">Operação</span>
                      <h3>Instalações e campo</h3>
                      <p>Pesquise o cliente, abra a instalação e registre agenda, fotos e observações em poucos toques.</p>
                    </div>
                    <div className="section-stats">
                      <div><strong>{projetos.length}</strong><span>projetos</span></div>
                      <div><strong>{projetos.filter(item => item.etapa !== 'Projeto concluído').length}</strong><span>ativos</span></div>
                      <div><strong>{projetos.filter(item => item.etapa === 'Projeto concluído').length}</strong><span>concluídos</span></div>
                    </div>
                  </div>

                  <div className="project-search-panel">
                    <div>
                      <h4>Pesquisar projeto</h4>
                      <p>Digite nome do cliente, telefone ou número do contrato.</p>
                    </div>
                    <input
                      value={projectSearch}
                      onChange={(event) => setProjectSearch(event.target.value)}
                      placeholder="Ex: nome do cliente, #12, 99991..."
                    />
                    <span>{filteredProjetos.length} resultado{filteredProjetos.length === 1 ? '' : 's'}</span>
                  </div>

                  <div className="project-board simple-project-board">
                    {projectOperationColumns.map(column => (
                      <div className="project-column" key={column.id}>
                        <div className="project-column-header">
                          <strong>{column.label}</strong>
                          <span>{filteredProjetos.filter(column.matches).length}</span>
                        </div>
                        {filteredProjetos.filter(column.matches).map(projeto => (
                          <button className="project-card" key={projeto.id} onClick={() => setSelectedProjeto(projeto)}>
                            <div className="project-card-top">
                              <strong>{projeto.clienteNome}</strong>
                              <span>{projeto.prioridade || 'Normal'}</span>
                            </div>
                            <p>Contrato #{projeto.contratoId} • {getResponsibleName(projeto.responsavelNome)}</p>
                            <p>Prazo {dateBr(projeto.prazoPrevisto)} • {projectPhotos[projeto.id]?.length || 0} foto{(projectPhotos[projeto.id]?.length || 0) === 1 ? '' : 's'}</p>
                            <strong className="project-value">{money(projeto.valorProjeto)}</strong>
                            <span className="project-open-hint">Abrir projeto</span>
                          </button>
                        ))}
                        {filteredProjetos.filter(column.matches).length === 0 && (
                          <div className="empty-inline">
                            <strong>Nada nessa etapa</strong>
                            <span>Nenhum projeto encontrado aqui.</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {selectedProjeto && (
                <div className="project-detail-page">
                  <div className="project-detail-toolbar">
                    <button type="button" className="btn btn-outline" onClick={() => setSelectedProjeto(null)}>
                      Voltar para instalações
                    </button>
                    <div>
                      <span className="section-kicker">Cadastro da instalação</span>
                      <h3>{selectedProjeto.clienteNome}</h3>
                      <p>Atualize agenda, etapa, checklist, fotos e observações do cliente.</p>
                    </div>
                  </div>

                  <div className="project-detail-modal project-detail-inline">
                    <div className="contract-modal-header">
                      <div>
                        <span className="section-kicker">Contrato #{selectedProjeto.contratoId}</span>
                        <h3>{selectedProjeto.clienteNome}</h3>
                        <p>{selectedProjeto.clienteCidade || 'Cidade não informada'} • {getResponsibleName(selectedProjeto.responsavelNome)}</p>
                      </div>
                    </div>

                    <div className="project-detail-grid">
                      <div className="detalhe-item highlight"><span className="detalhe-titulo">Valor</span><span className="detalhe-valor">{money(selectedProjeto.valorProjeto)}</span></div>
                      <div className="detalhe-item"><span className="detalhe-titulo">Etapa</span><span className="detalhe-valor">{selectedProjeto.etapa}</span></div>
                      <div className="detalhe-item"><span className="detalhe-titulo">Prazo</span><span className="detalhe-valor">{dateBr(selectedProjeto.prazoPrevisto)}</span></div>
                      <div className="detalhe-item"><span className="detalhe-titulo">Prioridade</span><span className="detalhe-valor">{selectedProjeto.prioridade || 'Normal'}</span></div>
                      <div className="detalhe-item"><span className="detalhe-titulo">Pendências</span><span className="detalhe-valor">{selectedProjeto.pendenciasHomologacao?.filter(item => !['Corrigida', 'Concluída', 'Cancelada'].includes(item.status)).length || 0} abertas</span></div>
                      <div className="detalhe-item"><span className="detalhe-titulo">Envios</span><span className="detalhe-valor">{selectedProjeto.enviosHomologacao?.length || 0}</span></div>
                    </div>

                    <div className="project-modal-controls">
                      <label>
                        Etapa atual
                        <select value={selectedProjeto.etapa} onChange={(event) => updateProjeto(selectedProjeto.id, { etapa: event.target.value })}>
                          {projectStages.map(option => <option key={option}>{option}</option>)}
                        </select>
                      </label>
                      <label>
                        Prazo previsto
                        <input type="date" value={selectedProjeto.prazoPrevisto || ''} onChange={(event) => updateProjeto(selectedProjeto.id, { prazoPrevisto: event.target.value })} />
                      </label>
                      <label>
                        Instalação agendada
                        <input type="datetime-local" value={selectedProjeto.instalacaoAgendada ? String(selectedProjeto.instalacaoAgendada).slice(0, 16) : ''} onChange={(event) => updateProjeto(selectedProjeto.id, { instalacaoAgendada: event.target.value })} />
                      </label>
                      <label>
                        Previsão Equatorial
                        <input type="date" value={selectedProjeto.previsaoLigacao || ''} onChange={(event) => updateProjeto(selectedProjeto.id, { previsaoLigacao: event.target.value })} />
                      </label>
                      <label>
                        Medidor trocado em
                        <input type="date" value={selectedProjeto.medidorTrocadoAt ? String(selectedProjeto.medidorTrocadoAt).slice(0, 10) : ''} onChange={(event) => updateProjeto(selectedProjeto.id, { medidorTrocadoAt: event.target.value })} />
                      </label>
                    </div>

                    <div className="quick-actions">
                      <button type="button" onClick={() => updateProjeto(selectedProjeto.id, { etapa: 'Análise inicial', checklist: { ...(selectedProjeto.checklist || {}), vistoriaRealizada: true } })}>Vistoria feita</button>
                      <button type="button" onClick={() => updateProjeto(selectedProjeto.id, { etapa: 'Projeto para envio', checklist: { ...(selectedProjeto.checklist || {}), projetoTecnico: true, projetoParaEnvio: true } })}>Projeto pronto</button>
                      <button type="button" onClick={() => updateProjeto(selectedProjeto.id, { etapa: 'Parecer emitido', checklist: { ...(selectedProjeto.checklist || {}), parecerAcesso: true, homologacao: true } })}>Parecer emitido</button>
                      <button type="button" onClick={() => updateProjeto(selectedProjeto.id, { etapa: 'Projeto concluído', checklist: { ...(selectedProjeto.checklist || {}), sistemaLigado: true } })}>Concluir</button>
                    </div>

                    <div className="project-role-grid">
                      <div className="project-modal-section">
                        <h4>Equipe na rua</h4>
                        <p className="muted-text">Use no cliente: fotos, vistoria, instalação e observações rápidas.</p>
                        <div className="project-checklist modal-checklist simple-checklist">
                          {streetChecklistKeys.map(key => (
                            <label key={key}>
                              <input
                                type="checkbox"
                                checked={Boolean(selectedProjeto.checklist?.[key])}
                                onChange={(event) => updateProjeto(selectedProjeto.id, { checklist: { ...(selectedProjeto.checklist || {}), [key]: event.target.checked } })}
                              />
                              <span>{projectChecklistLabels[key]}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="vistoria-photos project-modal-section">
                      <div className="vistoria-photos-head">
                        <div>
                          <strong>Fotos anexadas da vistoria</strong>
                          <span>Use fotos do local antes da instalação para registrar telhado, paredes, quadro e qualquer avaria já existente.</span>
                        </div>
                        <label className="photo-upload-btn">
                          Enviar fotos
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            multiple
                            onChange={(event) => {
                              uploadProjetoFotos(selectedProjeto.id, event.target.files);
                              event.target.value = '';
                            }}
                          />
                        </label>
                      </div>
                      <div className="vistoria-photo-grid modal-photo-grid">
                        {selectedProjectPhotos.map(foto => (
                          <a key={foto.id} href={foto.dataUrl} target="_blank" rel="noopener noreferrer" className="vistoria-photo">
                            <img src={foto.dataUrl} alt={foto.descricao || 'Foto da vistoria'} />
                          </a>
                        ))}
                        {selectedProjectPhotos.length === 0 && (
                          <p>Nenhuma foto registrada ainda.</p>
                        )}
                      </div>
                    </div>

                    <div className="project-modal-section">
                      <h4>Observações da equipe</h4>
                      <textarea
                        placeholder="Ex: telha já trincada no lado direito, quadro sem tampa, parede com infiltração..."
                        defaultValue={selectedProjeto.observacoes || ''}
                        onBlur={(event) => {
                          if (event.target.value !== (selectedProjeto.observacoes || '')) updateProjeto(selectedProjeto.id, { observacoes: event.target.value });
                        }}
                      />
                    </div>

                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'financeiro' && financeiro && (
            <div className="finance-dashboard">
              <div className="section-heading">
                <div>
                  <span className="section-kicker">Gestão financeira</span>
                  <h3>Dashboard financeiro</h3>
                  <p>Metas calculadas com base nos custos fixos, contratos aprovados e comparação mensal.</p>
                </div>
                <div className="section-stats">
                  <div><strong>{money(financeiro.valorAprovadoMes)}</strong><span>mês atual</span></div>
                  <div><strong>{money(financeiro.valorAprovadoMesPassado)}</strong><span>mês passado</span></div>
                  <div><strong>{(financeiro.comparativo?.variacaoPercentual || 0).toFixed(1)}%</strong><span>variação</span></div>
                </div>
              </div>

              <div className="finance-kpi-grid">
                <div className="finance-kpi primary"><span>Receita aprovada total</span><strong>{money(financeiro.valorAprovadoTotal)}</strong><p>Contratos aprovados no sistema.</p></div>
                <div className="finance-kpi"><span>Propostas em aberto</span><strong>{money(financeiro.valorPendente)}</strong><p>Valor pendente de aprovação.</p></div>
                <div className="finance-kpi"><span>Custo fixo mensal</span><strong>{money(financeiro.custoFixoMensal)}</strong><p>Aluguel, sistemas, marketing e operação.</p></div>
                <div className="finance-kpi"><span>Ticket médio</span><strong>{money(financeiro.ticketMedio)}</strong><p>Média dos orçamentos gerados.</p></div>
              </div>

              <div className="finance-grid">
                <div className="admin-card">
                  <div className="card-header-flex">
                    <div>
                      <h3>Metas do mês</h3>
                      <p className="muted-text">Calculadas automaticamente a partir dos custos fixos cadastrados.</p>
                    </div>
                  </div>
                  {[
                    ['Mínima', financeiro.metas?.minima, financeiro.metas?.percentualMinima],
                    ['Recomendada', financeiro.metas?.recomendada, financeiro.metas?.percentualRecomendada],
                    ['Meta ideal', financeiro.metas?.ideal, financeiro.metas?.percentualIdeal],
                  ].map(([label, value, percent]) => (
                    <div className="goal-row" key={label}>
                      <div><strong>{label}</strong><span>{money(value)}</span></div>
                      <div className="goal-bar"><span style={{ width: `${Math.min(percent || 0, 100)}%` }}></span></div>
                      <em>{Math.round(percent || 0)}%</em>
                    </div>
                  ))}
                </div>

                <div className="admin-card">
                  <div className="card-header-flex">
                    <div>
                      <h3>Rendimento por pessoa</h3>
                      <p className="muted-text">Contratos aprovados, pendentes e recusados por responsável.</p>
                    </div>
                  </div>
                  <div className="team-performance">
                    {(financeiro.rendimentoEquipe || []).map(item => {
                      const max = Math.max(...(financeiro.rendimentoEquipe || []).map(row => row.valorAprovado), 1);
                      return (
                        <div className="performance-row" key={item.nome}>
                          <div>
                            <strong>{item.nome}</strong>
                            <span>{item.aprovado} aprovados • {item.pendente} pendentes • {item.recusado} recusados</span>
                          </div>
                          <div className="performance-bar"><span style={{ width: `${(item.valorAprovado / max) * 100}%` }}></span></div>
                          <em>{money(item.valorAprovado)}</em>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="finance-grid">
                <div className="admin-card">
                  <div className="card-header-flex">
                    <div>
                      <h3>Custos fixos</h3>
                      <p className="muted-text">Registre aluguel, internet, marketing e outros custos mensais.</p>
                    </div>
                  </div>
                  <form className="fixed-cost-form" onSubmit={createDespesaFixa}>
                    <input placeholder="Nome. Ex: Aluguel" value={despesaForm.nome} onChange={(event) => setDespesaForm(prev => ({ ...prev, nome: event.target.value }))} required />
                    <CurrencyInput placeholder="Valor" value={despesaForm.valor} onValueChange={(value) => setDespesaForm(prev => ({ ...prev, valor: value }))} required />
                    <input placeholder="Categoria" value={despesaForm.categoria} onChange={(event) => setDespesaForm(prev => ({ ...prev, categoria: event.target.value }))} />
                    <button className="btn btn-primary" type="submit">Registrar</button>
                  </form>
                  <div className="fixed-cost-list">
                    {(financeiro.despesasFixas || []).map(item => (
                      <div key={item.id} className={`fixed-cost-item editable ${item.active ? '' : 'inactive'}`}>
                        <input
                          defaultValue={item.nome}
                          aria-label={`Nome do custo ${item.nome}`}
                          onBlur={event => event.target.value !== item.nome && updateDespesaFixa(item, { nome: event.target.value })}
                        />
                        <input
                          defaultValue={item.categoria || 'Geral'}
                          aria-label={`Categoria do custo ${item.nome}`}
                          onBlur={event => event.target.value !== (item.categoria || 'Geral') && updateDespesaFixa(item, { categoria: event.target.value })}
                        />
                        <CurrencyInput
                          value={item.valor}
                          aria-label={`Valor do custo ${item.nome}`}
                          onValueChange={(nextValue) => setFinanceiro(prev => ({
                            ...prev,
                            despesasFixas: prev.despesasFixas.map(row => row.id === item.id ? { ...row, valor: nextValue } : row),
                          }))}
                          onCommit={(nextValue) => updateDespesaFixa(item, { valor: currencyInputToNumber(nextValue) })}
                        />
                        <button type="button" className="btn btn-outline btn-sm-admin" onClick={() => updateDespesaFixa(item, { active: !item.active })}>
                          {item.active ? 'Desativar' : 'Ativar'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="admin-card finance-chart-card">
                  <h3>Comparação mensal</h3>
                  <div className="month-compare">
                    <div>
                      <span>Mês passado</span>
                      <div className="vertical-bar"><i style={{ height: `${Math.min(((financeiro.valorAprovadoMesPassado || 0) / Math.max(financeiro.valorAprovadoMes || 1, financeiro.valorAprovadoMesPassado || 1)) * 100, 100)}%` }}></i></div>
                      <strong>{money(financeiro.valorAprovadoMesPassado)}</strong>
                    </div>
                    <div>
                      <span>Mês atual</span>
                      <div className="vertical-bar current"><i style={{ height: `${Math.min(((financeiro.valorAprovadoMes || 0) / Math.max(financeiro.valorAprovadoMes || 1, financeiro.valorAprovadoMesPassado || 1)) * 100, 100)}%` }}></i></div>
                      <strong>{money(financeiro.valorAprovadoMes)}</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === '__precosSistemasLegacy' && (
            <div className="price-dashboard">
              <div className="section-heading">
                <div>
                  <span className="section-kicker">Precificação</span>
                  <h3>Preço dos Sistemas</h3>
                  <p>Calcule o preço final de venda somando os custos do sistema e aplicando a comissão no final.</p>
                </div>
                {priceResult && (
                  <div className="section-stats">
                    <div><strong>{money(priceResult.custoBase)}</strong><span>custo base</span></div>
                    <div><strong>{money(priceResult.valorComissao)}</strong><span>comissão</span></div>
                    <div><strong>{money(priceResult.precoFinal)}</strong><span>preço final</span></div>
                  </div>
                )}
              </div>

              <div className="price-grid">
                <form className="admin-card price-form-card" onSubmit={calcularPrecoSistema}>
                  <div className="card-header-flex">
                    <div>
                      <h3>Dados do sistema</h3>
                      <p className="muted-text">Preencha os valores em reais e a comissão em porcentagem.</p>
                    </div>
                  </div>

                  <div className="price-form-grid">
                    <label>Valor do kit solar<CurrencyInput value={priceForm.valorKitSolar} onValueChange={(value) => updatePriceCurrency('valorKitSolar', value)} placeholder="0" /></label>
                    <label>Custo de instalação<CurrencyInput value={priceForm.custoInstalacao} onValueChange={(value) => updatePriceCurrency('custoInstalacao', value)} placeholder="0" /></label>
                    <label>Material CA<CurrencyInput value={priceForm.materialCA} onValueChange={(value) => updatePriceCurrency('materialCA', value)} placeholder="0" /></label>
                    <label>Deslocamento<CurrencyInput value={priceForm.deslocamento} onValueChange={(value) => updatePriceCurrency('deslocamento', value)} placeholder="0" /></label>
                    <label>Custo adicional<CurrencyInput value={priceForm.custoAdicional} onValueChange={(value) => updatePriceCurrency('custoAdicional', value)} placeholder="0" /></label>
                    <label>Margem da empresa<CurrencyInput value={priceForm.margemEmpresa} onValueChange={(value) => updatePriceCurrency('margemEmpresa', value)} placeholder="0" /></label>
                    <label className="commission-field">Comissão em %<input type="number" min="0" max="99.99" step="0.01" value={priceForm.comissaoPercentual} onChange={(event) => updatePricePercent(event.target.value)} placeholder="Ex: 10" /></label>
                  </div>

                  {priceError && <p className="review-error">{priceError}</p>}

                  <div className="actions-footer">
                    <button className="btn btn-outline" type="button" onClick={limparPrecoSistema}>Limpar</button>
                    <button className="btn btn-primary" type="submit">Calcular preço</button>
                  </div>
                </form>

                <div className="admin-card price-result-card">
                  <div className="price-result-highlight">
                    <span>Preço final de venda</span>
                    <strong>{priceResult ? money(priceResult.precoFinal) : 'R$ 0,00'}</strong>
                    <p>{priceResult ? `Comissão aplicada: ${priceResult.comissaoPercentual}%` : 'Preencha os custos e clique em calcular.'}</p>
                  </div>

                  <div className="price-summary">
                    {[
                      ['Kit solar', priceResult?.valorKitSolar],
                      ['Instalação / mão de obra', priceResult?.custoInstalacao],
                      ['Material CA', priceResult?.materialCA],
                      ['Deslocamento', priceResult?.deslocamento],
                      ['Custo adicional', priceResult?.custoAdicional],
                      ['Margem da empresa', priceResult?.margemEmpresa],
                      ['Custo base', priceResult?.custoBase],
                      ['Valor da comissão', priceResult?.valorComissao],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <span>{label}</span>
                        <strong>{money(value || 0)}</strong>
                      </div>
                    ))}
                  </div>

                  <div className="formula-box">
                    <strong>Fórmula</strong>
                    <span>Preço final = custo base / (1 - comissão %)</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'precosSistemas' && (
            <PricingWorkbench items={tabelasPrecos} request={request} onItemsChange={setTabelasPrecos} />
          )}

          {activeTab === 'ordensServico' && (
            <div className="admin-section">
              <div className="section-heading">
                <div>
                  <span className="section-kicker">Suporte técnico</span>
                  <h3>Ordens de serviço</h3>
                  <p>Registre problemas vindos do WhatsApp, do site ou do pós-venda e acompanhe a solução.</p>
                </div>
                <div className="section-stats">
                  <div><strong>{osSummary.total}</strong><span>total</span></div>
                  <div><strong>{osSummary.abertas}</strong><span>abertas</span></div>
                  <div><strong>{osSummary.andamento}</strong><span>andamento</span></div>
                </div>
              </div>

              <form className="os-create-panel" onSubmit={createOrdemServico}>
                <div>
                  <h4>Abrir O.S</h4>
                  <p>Para cliente chamando no WhatsApp ou equipe técnica relatando problema.</p>
                </div>
                <input placeholder="Nome do cliente" value={osForm.clienteNome} onChange={(event) => setOsForm(prev => ({ ...prev, clienteNome: event.target.value }))} required />
                <input placeholder="Telefone" value={osForm.clienteTelefone} onChange={(event) => setOsForm(prev => ({ ...prev, clienteTelefone: event.target.value }))} />
                <input placeholder="Nº contrato" value={osForm.contratoId} onChange={(event) => setOsForm(prev => ({ ...prev, contratoId: event.target.value }))} />
                <select value={osForm.origem} onChange={(event) => setOsForm(prev => ({ ...prev, origem: event.target.value }))}>
                  <option>WhatsApp</option>
                  <option>Site</option>
                  <option>Equipe técnica</option>
                  <option>Pós-venda</option>
                </select>
                <select value={osForm.prioridade} onChange={(event) => setOsForm(prev => ({ ...prev, prioridade: event.target.value }))}>
                  <option>Normal</option>
                  <option>Alta</option>
                  <option>Urgente</option>
                </select>
                <select value={osForm.responsavelId} onChange={(event) => setOsForm(prev => ({ ...prev, responsavelId: event.target.value }))}>
                  <option value="">Sem responsável</option>
                  {usuarios.filter(user => user.active && (user.role === 'ADM' || user.permissions?.equipeTecnica || user.permissions?.ordensServico)).map(user => (
                    <option key={user.id} value={user.id}>{user.nome}</option>
                  ))}
                </select>
                <textarea placeholder="Problema relatado pelo cliente" value={osForm.problema} onChange={(event) => setOsForm(prev => ({ ...prev, problema: event.target.value }))} required />
                <textarea placeholder="Observações internas" value={osForm.observacoes} onChange={(event) => setOsForm(prev => ({ ...prev, observacoes: event.target.value }))} />
                <button className="btn btn-primary" type="submit">Abrir O.S</button>
              </form>

              <div className="ops-toolbar">
                <div>
                  <strong>Visão da operação</strong>
                  <span>{filteredOrdensServico.length} chamado{filteredOrdensServico.length === 1 ? '' : 's'} na visão atual.</span>
                </div>
                <div className="lead-filter-pills" aria-label="Filtros de O.S">
                  {['todos', 'Aberta', 'Em atendimento', 'Aguardando cliente', 'Resolvida'].map(status => (
                    <button
                      type="button"
                      key={status}
                      className={osStatusFilter === status ? 'active' : ''}
                      onClick={() => setOsStatusFilter(status)}
                    >
                      {status === 'todos' ? 'Todos' : status}
                    </button>
                  ))}
                </div>
              </div>

              <div className="os-grid">
                {['Aberta', 'Em atendimento', 'Aguardando cliente', 'Resolvida'].map(status => (
                  <div className="os-column" key={status}>
                    <div className="project-column-header">
                      <strong>{status}</strong>
                      <span>{filteredOrdensServico.filter(os => os.status === status).length}</span>
                    </div>
                    {filteredOrdensServico.filter(os => os.status === status).map(os => (
                      <div className="os-card" key={os.id}>
                        <div className="project-card-top">
                          <strong>O.S #{os.id}</strong>
                          <span className={os.prioridade === 'Urgente' ? 'danger-chip' : ''}>{os.prioridade}</span>
                        </div>
                        <h4>{os.clienteNome}</h4>
                        <p>{os.origem} • {os.clienteTelefone || 'Sem telefone'} {os.contratoId ? `• Contrato #${os.contratoId}` : ''}</p>
                        <div className="os-problem">
                          <span>Problema</span>
                          <strong>{os.problema}</strong>
                        </div>
                        {os.observacoes && <p className="os-note">{os.observacoes}</p>}
                        <select value={os.status} onChange={(event) => updateOrdemServico(os.id, { status: event.target.value })}>
                          <option>Aberta</option>
                          <option>Em atendimento</option>
                          <option>Aguardando cliente</option>
                          <option>Resolvida</option>
                          <option>Cancelada</option>
                        </select>
                        <textarea
                          placeholder="Solução / retorno técnico"
                          defaultValue={os.solucao || ''}
                          onBlur={(event) => {
                            if (event.target.value !== (os.solucao || '')) updateOrdemServico(os.id, { solucao: event.target.value });
                          }}
                        />
                        <div className="table-actions">
                          {os.clienteTelefone && (
                            <a className="btn btn-outline btn-sm-admin" href={`https://wa.me/55${String(os.clienteTelefone || '').replace(/\D/g, '')}?text=${encodeURIComponent(`Olá! Sou da DRM Energia Solar. Estamos acompanhando sua O.S #${os.id} e vou te atualizar sobre o atendimento.`)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                          )}
                          <button className="btn btn-primary btn-sm-admin" onClick={() => updateOrdemServico(os.id, { status: 'Resolvida' })}>Resolver</button>
                        </div>
                      </div>
                    ))}
                    {filteredOrdensServico.filter(os => os.status === status).length === 0 && (
                      <div className="empty-inline">
                        <strong>Sem O.S</strong>
                        <span>Nenhum chamado aqui.</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'usuarios' && (
            <div className="admin-section">
              <div className="section-heading">
                <div>
                  <span className="section-kicker">Controle de acesso</span>
                  <h3>Usuários e permissões</h3>
                  <p>Defina exatamente quais áreas cada pessoa pode visualizar dentro do sistema.</p>
                </div>
                <div className="section-stats">
                  <div>
                    <strong>{usuarios.length}</strong>
                    <span>logins</span>
                  </div>
                  <div>
                    <strong>{activeUsersTotal}</strong>
                    <span>ativos</span>
                  </div>
                  <div>
                    <strong>{pendingPasswordTotal}</strong>
                    <span>trocas pendentes</span>
                  </div>
                </div>
              </div>

              <form className="user-create-panel" onSubmit={createUsuario}>
                <div>
                  <h4>Adicionar consultor ao rodízio</h4>
                  <p>Informe nome e WhatsApp. Se tiver permissão de leads e estiver ativo, já entra automaticamente na distribuição.</p>
                </div>
                <input
                  placeholder="Nome do consultor"
                  value={newUserForm.nome}
                  onChange={(event) => setNewUserForm(prev => ({ ...prev, nome: event.target.value }))}
                  required
                />
                <input
                  placeholder="Usuário. Ex: joao"
                  value={newUserForm.username}
                  onChange={(event) => setNewUserForm(prev => ({ ...prev, username: event.target.value }))}
                  required
                />
                <input
                  type="email"
                  placeholder="E-mail de recuperação"
                  value={newUserForm.email}
                  onChange={(event) => setNewUserForm(prev => ({ ...prev, email: event.target.value }))}
                  required
                />
                <input
                  placeholder="WhatsApp com DDD"
                  value={newUserForm.whatsapp}
                  onChange={(event) => setNewUserForm(prev => ({ ...prev, whatsapp: event.target.value }))}
                  required
                />
                <select value={newUserForm.role} onChange={(event) => setNewUserForm(prev => ({ ...prev, role: event.target.value }))}>
                  <option value="CONSULTOR">Consultor</option>
                  <option value="EQUIPE_TECNICA_COMERCIAL">Equipe técnica/comercial</option>
                  <option value="ADM">Administrador</option>
                </select>
                <input
                  placeholder="Senha temporária opcional"
                  value={newUserForm.temporaryPassword}
                  onChange={(event) => setNewUserForm(prev => ({ ...prev, temporaryPassword: event.target.value }))}
                />
                <button className="btn btn-primary" type="submit">Adicionar ao rodízio</button>
              </form>

              <div className="user-permissions-list">
                <div className="ops-toolbar">
                  <div>
                    <strong>Equipe cadastrada</strong>
                    <span>{filteredUsuarios.length} de {usuarios.length} usuário{usuarios.length === 1 ? '' : 's'} exibido{usuarios.length === 1 ? '' : 's'}.</span>
                  </div>
                  <div className="lead-search-box">
                    <input
                      placeholder="Buscar por nome, usuário, e-mail, WhatsApp ou perfil"
                      value={userSearch}
                      onChange={(event) => setUserSearch(event.target.value)}
                    />
                  </div>
                </div>
                {filteredUsuarios.map(user => (
                  <div key={user.id} className="permission-card">
                    <div className="permission-card-header">
                      <div className="permission-user-main">
                        <div className="permission-avatar">{user.nome.charAt(0)}</div>
                        <div>
                          <h4>{user.nome}</h4>
                          <p>{user.username}</p>
                        </div>
                      </div>
                      <div className="permission-meta">
                        <select
                          className="role-select"
                          value={user.role}
                          onChange={(event) => updatePermissions(user.id, user.permissions, user.active, { role: event.target.value })}
                        >
                          <option value="ADM">Administrador</option>
                          <option value="EQUIPE_TECNICA_COMERCIAL">Equipe técnica/comercial</option>
                          <option value="CONSULTOR">Consultor</option>
                        </select>
                        {user.mustChangePassword && <span className="pending-chip">Troca pendente</span>}
                        {!user.emailVerified && <span className="pending-chip">E-mail pendente</span>}
                        <label className="permission-toggle status-toggle">
                          <input
                            type="checkbox"
                            checked={user.active}
                            onChange={(event) => updatePermissions(user.id, user.permissions, event.target.checked)}
                          />
                          Ativo
                        </label>
                      </div>
                    </div>
                    <div className="permission-contact-row">
                      <label>
                        <span>WhatsApp para rodízio</span>
                        <input
                          value={user.whatsapp || ''}
                          placeholder="Ex: 559999999999"
                          onChange={(event) => setUsuarios(prev => prev.map(item => item.id === user.id ? { ...item, whatsapp: event.target.value } : item))}
                          onBlur={(event) => updatePermissions(user.id, user.permissions, user.active, { whatsapp: event.target.value, role: user.role, nome: user.nome })}
                        />
                      </label>
                      <small>{user.role !== 'ADM' && user.permissions?.leads && user.active && user.whatsapp ? 'Participando do rodízio de leads.' : 'Não participa do rodízio sem WhatsApp, permissão de leads e usuário ativo.'}</small>
                    </div>
                    <div className="permissions-grid">
                      {Object.entries(permissionLabels).map(([key, label]) => (
                        <label key={key} className="permission-toggle">
                          <input
                            type="checkbox"
                            checked={Boolean(user.permissions?.[key])}
                            onChange={(event) => updatePermissions(user.id, { ...user.permissions, [key]: event.target.checked }, user.active)}
                          />
                          <span>
                            <strong>{label}</strong>
                            <small>{permissionDescriptions[key]}</small>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                {filteredUsuarios.length === 0 && (
                  <div className="empty-state-orcamento lead-empty-state">
                    <div className="icon">AC</div>
                    <h4>Nenhum usuário encontrado</h4>
                    <p>Limpe a busca para voltar a ver todos os acessos.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'comunicacoes' && comunicacoes && (
            <AdminCommunicationCenter
              data={comunicacoes}
              adminEmail={adminUser.email}
              request={request}
              onRefresh={() => request('/api/admin/comunicacoes').then(setComunicacoes)}
            />
          )}
        </div>
      </main>

      {showManualLeadForm && (
        <div className="contract-modal-backdrop manual-lead-backdrop">
          <div className="manual-lead-modal" role="dialog" aria-modal="true" aria-labelledby="manual-lead-title">
            <div className="manual-lead-header">
              <div>
                <span className="section-kicker">Cadastro rápido</span>
                <h4 id="manual-lead-title">Cadastrar lead manual</h4>
                <p>Indicação, ligação recebida, WhatsApp direto ou contato presencial entram separados dos leads do site.</p>
              </div>
              <button type="button" className="lead-modal-close" onClick={closeManualLeadModal} aria-label="Fechar">×</button>
            </div>
            <form className="manual-lead-form" onSubmit={cadastrarLeadManual}>
              <div className="rc-field">
                <label className="rc-label">Nome completo</label>
                <input className="rc-input" value={manualLeadForm.nome} onChange={(event) => setManualLeadForm(prev => ({ ...prev, nome: event.target.value }))} placeholder="Nome do cliente" autoFocus required />
              </div>
              <div className="rc-field">
                <label className="rc-label">WhatsApp</label>
                <input className="rc-input" value={manualLeadForm.telefone} onChange={(event) => setManualLeadForm(prev => ({ ...prev, telefone: event.target.value }))} placeholder="(99) 99999-9999" required />
              </div>
              <div className="rc-field">
                <label className="rc-label">Cidade / UF</label>
                <input className="rc-input" value={manualLeadForm.cidade} onChange={(event) => setManualLeadForm(prev => ({ ...prev, cidade: event.target.value }))} placeholder="Imperatriz - MA" />
              </div>
              <div className="rc-field">
                <label className="rc-label">E-mail</label>
                <input className="rc-input" type="email" value={manualLeadForm.email} onChange={(event) => setManualLeadForm(prev => ({ ...prev, email: event.target.value }))} placeholder="cliente@email.com" />
              </div>
              <div className="rc-field">
                <label className="rc-label">Origem</label>
                <select className="rc-input" value={manualLeadForm.origem} onChange={(event) => setManualLeadForm(prev => ({ ...prev, origem: event.target.value }))}>
                  <option>Manual</option>
                  <option>Indicação</option>
                  <option>Ligação recebida</option>
                  <option>WhatsApp direto</option>
                  <option>Visita presencial</option>
                  <option>Evento</option>
                </select>
              </div>
              <div className="rc-field">
                <label className="rc-label">Status</label>
                <select className="rc-input" value={manualLeadForm.status} onChange={(event) => setManualLeadForm(prev => ({ ...prev, status: event.target.value }))}>
                  {LEAD_STATUS_PRESETS.map(status => <option key={status}>{status}</option>)}
                </select>
              </div>
              {hasPermission('verTodosLeads') && (
                <div className="rc-field">
                  <label className="rc-label">Responsável</label>
                  <select className="rc-input" value={manualLeadForm.assignedUserId} onChange={(event) => setManualLeadForm(prev => ({ ...prev, assignedUserId: event.target.value }))}>
                    <option value="">Eu mesmo</option>
                    {usuarios.filter(item => item.active !== 0 && item.permissions?.leads).map(item => (
                      <option key={item.id} value={item.id}>{item.nome}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="rc-field manual-lead-notes">
                <label className="rc-label">Observação inicial</label>
                <textarea className="rc-input" value={manualLeadForm.observacoes} onChange={(event) => setManualLeadForm(prev => ({ ...prev, observacoes: event.target.value }))} placeholder="Ex: cliente pediu retorno no fim da tarde" />
              </div>
              <div className="manual-lead-actions">
                <button type="button" className="btn btn-outline" onClick={closeManualLeadModal}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Salvar lead manual</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {quickModal && (
        <div className="contract-modal-backdrop">
          <div className="quick-modal">
            <div className="contract-modal-header">
              <div>
                <span className="section-kicker">Ação rápida</span>
                <h3>{quickActions.find(action => action.tab === quickModal)?.label}</h3>
                <p>Use sem sair da tela atual.</p>
              </div>
              <button type="button" className="lead-modal-close" onClick={() => setQuickModal(null)}>×</button>
            </div>

            {quickModal === 'leads' && (
              <div className="quick-modal-list">
                {leads.slice(0, 8).map(lead => (
                  <div className="quick-modal-item" key={lead.id}>
                    <div>
                      <strong>{lead.nome}</strong>
                      <span>{lead.telefone || 'Sem telefone'} • {lead.status || 'Novo'}</span>
                    </div>
                    <div className="table-actions">
                      <button className="btn btn-outline btn-sm-admin" onClick={() => updateLeadStatus(lead.id, 'Em atendimento')}>Atender</button>
                      {lead.telefone && <a className="btn btn-primary btn-sm-admin" href={`https://wa.me/55${String(lead.telefone || '').replace(/\D/g, '')}?text=${whatsappLeadMessage(lead)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {quickModal === 'orcamentos' && (
              <div className="quick-modal-list">
                {orcamentos.slice(0, 8).map(orc => (
                  <div className="quick-modal-item" key={orc.id}>
                    <div>
                      <strong>{orc.clienteNome}</strong>
                      <span>{money(orc.financeiro?.preco_final_cliente_rs)} • {orc.dimensionamento?.potencia_real_instalada_kwp || 0} kWp</span>
                    </div>
                    {hasPermission('contratos') && <button className="btn btn-primary btn-sm-admin" onClick={() => { setQuickModal(null); openContractModal(orc); }}>Gerar contrato</button>}
                  </div>
                ))}
              </div>
            )}

            {quickModal === 'novoContrato' && (
              <div className="quick-modal-list">
                {clientes.slice(0, 10).map(cliente => (
                  <div className="quick-modal-item" key={cliente.id}>
                    <div>
                      <strong>{cliente.nome}</strong>
                      <span>{cliente.cpfCnpj || 'Sem CPF/CNPJ'} • {cliente.cidade || 'Sem cidade'}</span>
                    </div>
                    <button className="btn btn-primary btn-sm-admin" onClick={() => { setQuickModal(null); openBudgetFormForClient(cliente); }}>Fazer orçamento</button>
                  </div>
                ))}
                {clientes.length === 0 && (
                  <div className="empty-state-orcamento client-empty-state">
                    <div className="icon">CT</div>
                    <h4>Nenhum cliente cadastrado</h4>
                    <p>Cadastre o cliente completo para gerar o contrato sem digitar dados manuais.</p>
                  </div>
                )}
              </div>
            )}

            {quickModal === 'contratos' && (
              <div className="quick-modal-list">
                {contratos.filter(item => item.status === 'Pendente').slice(0, 8).map(contrato => (
                  <div className="quick-modal-item" key={contrato.id}>
                    <div>
                      <strong>{contrato.clienteNome}</strong>
                      <span>{money(contrato.valorProjeto)} • criado por {contrato.criadoPorNome}</span>
                    </div>
                    <div className="table-actions">
                      <button className="btn btn-primary btn-sm-admin" onClick={() => revisarContrato(contrato.id, 'Aprovado')}>Aprovar</button>
                      <button className="btn btn-outline btn-sm-admin" onClick={() => { setSelectedContrato(contrato); setQuickModal(null); setActiveTab('contratos'); }}>Ver detalhes</button>
                    </div>
                  </div>
                ))}
                {contratos.filter(item => item.status === 'Pendente').length === 0 && <p className="muted-text">Nenhum contrato pendente.</p>}
              </div>
            )}

            {quickModal === 'projetos' && (
              <div className="quick-modal-list">
                {projetos.filter(item => item.etapa !== 'Projeto concluído').slice(0, 8).map(projeto => (
                  <div className="quick-modal-item quick-project-item" key={projeto.id}>
                    <div className="quick-project-head">
                      <div>
                      <strong>{projeto.clienteNome}</strong>
                      <span>Contrato #{projeto.contratoId} • {projeto.etapa} • {projectPhotos[projeto.id]?.length || 0} fotos</span>
                      </div>
                      <button className="btn btn-outline btn-sm-admin" onClick={() => { setSelectedProjeto(projeto); setQuickModal(null); }}>Detalhes</button>
                    </div>
                    <div className="quick-project-actions">
                      <button type="button" onClick={() => updateProjeto(projeto.id, { etapa: 'Análise inicial', checklist: { ...(projeto.checklist || {}), vistoriaRealizada: true } })}>Vistoria feita</button>
                      <button type="button" onClick={() => updateProjeto(projeto.id, { etapa: 'Solicitar vistoria', checklist: { ...(projeto.checklist || {}), homologacao: true, parecerAcesso: true } })}>Liberar vistoria</button>
                      <button type="button" onClick={() => updateProjeto(projeto.id, { etapa: 'Projeto concluído', checklist: { ...(projeto.checklist || {}), sistemaLigado: true } })}>Concluir</button>
                      <label>
                        Enviar fotos
                        <input type="file" accept="image/*" capture="environment" multiple onChange={(event) => { uploadProjetoFotos(projeto.id, event.target.files); event.target.value = ''; }} />
                      </label>
                    </div>
                    <textarea
                      placeholder="Observação rápida da visita"
                      defaultValue={projeto.observacoes || ''}
                      onBlur={(event) => {
                        if (event.target.value !== (projeto.observacoes || '')) updateProjeto(projeto.id, { observacoes: event.target.value });
                      }}
                    />
                  </div>
                ))}
              </div>
            )}

            {quickModal === 'ordensServico' && (
              <>
                <form className="quick-os-form" onSubmit={(event) => { createOrdemServico(event); setQuickModal(null); }}>
                  <input placeholder="Nome do cliente" value={osForm.clienteNome} onChange={(event) => setOsForm(prev => ({ ...prev, clienteNome: event.target.value }))} required />
                  <input placeholder="Telefone" value={osForm.clienteTelefone} onChange={(event) => setOsForm(prev => ({ ...prev, clienteTelefone: event.target.value }))} />
                  <select value={osForm.prioridade} onChange={(event) => setOsForm(prev => ({ ...prev, prioridade: event.target.value }))}>
                    <option>Normal</option>
                    <option>Alta</option>
                    <option>Urgente</option>
                  </select>
                  <textarea placeholder="Problema relatado pelo cliente" value={osForm.problema} onChange={(event) => setOsForm(prev => ({ ...prev, problema: event.target.value }))} required />
                  <button className="btn btn-primary" type="submit">Abrir O.S</button>
                </form>
                <div className="quick-modal-list">
                  {ordensServico.filter(os => os.status !== 'Resolvida' && os.status !== 'Cancelada').slice(0, 4).map(os => (
                    <div className="quick-modal-item quick-project-item" key={os.id}>
                      <div className="quick-project-head">
                        <div>
                          <strong>O.S #{os.id} • {os.clienteNome}</strong>
                          <span>{os.status} • {os.prioridade} • {os.problema}</span>
                        </div>
                        {os.clienteTelefone && <a className="btn btn-outline btn-sm-admin" href={`https://wa.me/55${String(os.clienteTelefone || '').replace(/\D/g, '')}?text=${encodeURIComponent(`Olá! Sou da DRM Energia Solar. Estou entrando em contato sobre sua O.S #${os.id} para dar continuidade ao atendimento.`)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
                      </div>
                      <div className="quick-project-actions">
                        <button type="button" onClick={() => updateOrdemServico(os.id, { status: 'Em atendimento' })}>Atender</button>
                        <button type="button" onClick={() => updateOrdemServico(os.id, { status: 'Aguardando cliente' })}>Aguardar cliente</button>
                        <button type="button" onClick={() => updateOrdemServico(os.id, { status: 'Resolvida' })}>Resolver</button>
                      </div>
                      <textarea
                        placeholder="Solução / retorno técnico"
                        defaultValue={os.solucao || ''}
                        onBlur={(event) => {
                          if (event.target.value !== (os.solucao || '')) updateOrdemServico(os.id, { solucao: event.target.value });
                        }}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}

            {quickModal === 'financeiro' && financeiro && (
              <div className="quick-metrics">
                <div><span>Mês atual</span><strong>{money(financeiro.valorAprovadoMes)}</strong></div>
                <div><span>Custo fixo</span><strong>{money(financeiro.custoFixoMensal)}</strong></div>
                <div><span>Meta recomendada</span><strong>{money(financeiro.metas?.recomendada)}</strong></div>
              </div>
            )}

            {quickModal === 'precosSistemas' && (
              <form className="quick-os-form" onSubmit={calcularPrecoSistema}>
                <CurrencyInput value={priceForm.valorKitSolar} onValueChange={(value) => updatePriceCurrency('valorKitSolar', value)} placeholder="Valor do kit solar" />
                <CurrencyInput value={priceForm.custoInstalacao} onValueChange={(value) => updatePriceCurrency('custoInstalacao', value)} placeholder="Custo de instalação" />
                <CurrencyInput value={priceForm.materialCA} onValueChange={(value) => updatePriceCurrency('materialCA', value)} placeholder="Material CA" />
                <CurrencyInput value={priceForm.deslocamento} onValueChange={(value) => updatePriceCurrency('deslocamento', value)} placeholder="Deslocamento" />
                <CurrencyInput value={priceForm.custoAdicional} onValueChange={(value) => updatePriceCurrency('custoAdicional', value)} placeholder="Custo adicional" />
                <CurrencyInput value={priceForm.margemEmpresa} onValueChange={(value) => updatePriceCurrency('margemEmpresa', value)} placeholder="Margem da empresa" />
                <input type="number" min="0" max="99.99" step="0.01" value={priceForm.comissaoPercentual} onChange={(event) => updatePricePercent(event.target.value)} placeholder="Comissão %" />
                {priceError && <p className="review-error">{priceError}</p>}
                <button className="btn btn-primary" type="submit">Calcular preço</button>
                {priceResult && (
                  <div className="quick-metrics">
                    <div><span>Custo base</span><strong>{money(priceResult.custoBase)}</strong></div>
                    <div><span>Comissão</span><strong>{money(priceResult.valorComissao)}</strong></div>
                    <div><span>Preço final</span><strong>{money(priceResult.precoFinal)}</strong></div>
                  </div>
                )}
              </form>
            )}

            {quickModal === 'usuarios' && (
              <div className="quick-metrics">
                <div><span>Usuários ativos</span><strong>{activeUsersTotal}</strong></div>
                <div><span>Troca pendente</span><strong>{pendingPasswordTotal}</strong></div>
                <div><span>Acessos</span><strong>{usuarios.length}</strong></div>
              </div>
            )}
          </div>
        </div>
      )}

      {homologacaoModal && (
        <div className="contract-modal-backdrop">
          <form className="contract-modal homologacao-modal" onSubmit={gerarProcuracao}>
            <div className="contract-modal-header">
              <div>
                <span className="section-kicker">Homologação • {contractNumber(homologacaoModal.contrato)}</span>
                <h3>Quem é o titular da conta de energia?</h3>
                <p>A procuração ficará vinculada a este contrato e será enviada uma única vez para aprovação.</p>
              </div>
              <button type="button" className="lead-modal-close" aria-label="Fechar" onClick={() => setHomologacaoModal(null)}>×</button>
            </div>

            <div className="homologacao-contract-summary">
              <div>
                <span>Cliente do contrato</span>
                <strong>{homologacaoModal.titularContrato.nome}</strong>
              </div>
              <div>
                <span>Status do contrato</span>
                <strong>{homologacaoModal.contrato.status}</strong>
              </div>
            </div>

            <div className="homologacao-holder-options">
              <button
                type="button"
                className={homologacaoForm.titularMesmoContrato ? 'active' : ''}
                onClick={() => setHomologacaoForm(prev => ({ ...prev, titularMesmoContrato: true }))}
              >
                <strong>Sim, é o mesmo titular</strong>
                <span>Reutilizar os dados completos do contrato.</span>
              </button>
              <button
                type="button"
                className={!homologacaoForm.titularMesmoContrato ? 'active' : ''}
                onClick={() => setHomologacaoForm(prev => ({ ...prev, titularMesmoContrato: false }))}
              >
                <strong>Não, é outro titular</strong>
                <span>Informar os dados que constam na concessionária.</span>
              </button>
            </div>

            {homologacaoForm.titularMesmoContrato ? (
              <div className="homologacao-data-preview">
                <span>Dados que serão usados na procuração</span>
                <strong>{homologacaoModal.titularContrato.nome}</strong>
                <p>CPF/CNPJ: {homologacaoModal.titularContrato.cpfCnpj || 'não informado'}</p>
                <p>Endereço: {[homologacaoModal.titularContrato.endereco, homologacaoModal.titularContrato.numero, homologacaoModal.titularContrato.bairro, homologacaoModal.titularContrato.cidade, homologacaoModal.titularContrato.estado].filter(Boolean).join(', ') || 'não informado'}</p>
              </div>
            ) : (
              <div className="contract-modal-grid homologacao-fields">
                <label className="span-2">
                  Nome completo do titular
                  <input
                    value={homologacaoForm.nome}
                    onChange={(event) => setHomologacaoForm(prev => ({ ...prev, nome: event.target.value }))}
                    placeholder="Exatamente como consta na conta de energia"
                    required
                  />
                </label>
                <label className="span-2">
                  CPF do titular
                  <input
                    value={homologacaoForm.cpfCnpj}
                    onChange={(event) => setHomologacaoForm(prev => ({ ...prev, cpfCnpj: event.target.value }))}
                    inputMode="numeric"
                    placeholder="000.000.000-00"
                    required
                  />
                </label>
                <label className="span-2">
                  Endereço conforme a concessionária
                  <textarea
                    value={homologacaoForm.endereco}
                    onChange={(event) => setHomologacaoForm(prev => ({ ...prev, endereco: event.target.value }))}
                    placeholder="Rua, número, bairro e demais informações exatamente como aparecem na conta"
                    required
                  />
                </label>
              </div>
            )}

            <div className="homologacao-notice">
              A procuração ficará conectada ao {contractNumber(homologacaoModal.contrato)} e seguirá para aprovação do responsável.
            </div>

            <div className="contract-modal-actions">
              <button type="button" className="btn btn-outline" onClick={() => setHomologacaoModal(null)}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={homologacaoLoading}>
                {homologacaoLoading ? 'Gerando...' : 'Confirmar e gerar procuração'}
              </button>
            </div>
          </form>
        </div>
      )}

      {contractModal.open && (
        <div className="contract-modal-backdrop">
          <form className="contract-modal" onSubmit={gerarContrato}>
            <div className="contract-modal-header">
              <div>
                <span className="section-kicker">Dados variáveis do contrato</span>
                <h3>{contractModal.orcamento?.clienteNome}</h3>
                <p>Cliente, empresa e dados de contato entram automaticamente. Preencha somente o que muda em cada contrato.</p>
              </div>
              <button type="button" className="lead-modal-close" onClick={() => setContractModal({ open: false, orcamento: null, manual: emptyContractManual, equipamentoId: '' })}>×</button>
            </div>

            <div className="contract-modal-grid">
              <label>
                Geração em kWh
                <input value={contractModal.manual.geracaoKwh} onChange={(event) => updateContractManual('geracaoKwh', event.target.value)} placeholder="Ex: 660" required />
              </label>
              <label>
                Geração anual em kWh
                <input value={contractModal.manual.geracaoAnualKwh} onChange={(event) => updateContractManual('geracaoAnualKwh', event.target.value)} placeholder="Ex: 7920" />
              </label>
              <label>
                Potência em kWp
                <input value={contractModal.manual.potenciaKwp} onChange={(event) => updateContractManual('potenciaKwp', event.target.value)} placeholder="Ex: 5.49" required />
              </label>
              <label>
                Quantidade de placas
                <input value={contractModal.manual.numeroPaineis} onChange={(event) => updateContractManual('numeroPaineis', event.target.value)} placeholder="Ex: 10" />
              </label>
              <label>
                Banco de placa/inversor
                <select
                  value={contractModal.equipamentoId}
                  onChange={(event) => {
                    const equipamento = equipamentos.find(item => item.id === Number(event.target.value));
                    setContractModal(prev => ({
                      ...prev,
                      equipamentoId: event.target.value,
                      manual: equipamento ? applyEquipamentoToManual(prev.manual, equipamento) : prev.manual,
                    }));
                  }}
                >
                  <option value="">Selecionar manualmente</option>
                  {equipamentos.filter(item => item.active).map(item => (
                    <option key={item.id} value={item.id}>{item.nome}</option>
                  ))}
                </select>
              </label>
              <label>
                Quantidade de cabo
                <input value={contractModal.manual.quantidadeCabo} onChange={(event) => updateContractManual('quantidadeCabo', event.target.value)} placeholder="Ex: 40 metros" required />
              </label>
              <label className="span-2">
                Painel
                <input value={contractModal.manual.painel} onChange={(event) => updateContractManual('painel', event.target.value)} placeholder="Modelo do painel" required />
              </label>
              <label className="span-2">
                Inversor
                <input value={contractModal.manual.inversor} onChange={(event) => updateContractManual('inversor', event.target.value)} placeholder="Modelo do inversor" required />
              </label>
              <label>
                Valor do sistema
                <CurrencyInput value={contractModal.manual.valorSistema} onValueChange={(value) => updateContractManual('valorSistema', value)} placeholder="Ex: 14675" required />
              </label>
              <label>
                Entrada
                <CurrencyInput value={contractModal.manual.valorEntrada} onValueChange={(value) => updateContractManual('valorEntrada', value)} placeholder="Ex: 2000" />
              </label>
              <label>
                Saldo
                <CurrencyInput value={contractModal.manual.valorSaldo} onValueChange={(value) => updateContractManual('valorSaldo', value)} placeholder="Ex: 12675" />
              </label>
              <label>
                Prazo de execução
                <input type="number" min="1" step="1" value={contractModal.manual.prazoExecucao} onChange={(event) => updateContractManual('prazoExecucao', event.target.value)} placeholder="40" required />
              </label>
              <label>
                Tipo de pagamento
                <select value={contractModal.manual.formaPagamentoTipo} onChange={(event) => updateContractManual('formaPagamentoTipo', event.target.value)}>
                  <option value="avista">À vista</option>
                  <option value="financiado">Financiado</option>
                  <option value="cartao">Cartão de crédito</option>
                  <option value="misto">Misto / mesclado</option>
                </select>
              </label>
              <label className="span-2">
                Forma de pagamento detalhada
                <textarea
                  value={contractModal.manual.formaPagamento}
                  onChange={(event) => updateContractManual('formaPagamento', event.target.value)}
                  placeholder="Ex: Entrada de R$ 2.000,00 + restante financiado / parte no cartão / à vista com desconto..."
                  required
                />
              </label>
            </div>

            <div className="contract-modal-actions">
              <button type="button" className="btn btn-outline" onClick={() => setContractModal({ open: false, orcamento: null, manual: emptyContractManual, equipamentoId: '' })}>Cancelar</button>
              <button type="submit" className="btn btn-primary">Salvar e gerar contrato</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
