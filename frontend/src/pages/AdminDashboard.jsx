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

const socket = io(getApiBaseUrl() || undefined, {
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
});
const isLocalRuntime = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);

const permissionLabels = {
  dashboard: 'Painel geral',
  clientes: 'Clientes',
  leads: 'Leads',
  orcamentos: 'Orçamentos',
  contratos: 'Contratos',
  ordensServico: 'O.S',
  whatsapp: 'WhatsApp',
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
  clientes: 'Visualiza, cadastra e altera clientes',
  leads: 'Recebe e acompanha leads',
  orcamentos: 'Visualiza simulações e propostas',
  contratos: 'Gera e acompanha contratos',
  ordensServico: 'Abre e acompanha ordens de serviço',
  whatsapp: 'Atende conversas conectadas ao WhatsApp',
  precosSistemas: 'Calcula preço final dos sistemas',
  financeiro: 'Acessa números financeiros',
  equipeTecnica: 'Acessa rotinas técnicas',
  usuarios: 'Gerencia logins da equipe',
  permissoes: 'Altera permissões de acesso',
  verTodosLeads: 'Vê leads de toda a equipe',
  gerenciarClientes: 'Cadastra e altera clientes',
};

const normalizePanelPermissions = (permissions = {}) => {
  const next = { ...permissions };
  if (next.clientes) next.gerenciarClientes = true;
  if (next.gerenciarClientes) next.clientes = true;
  if (next.whatsapp) next.leads = true;
  if (next.permissoes) next.usuarios = true;
  if (next.orcamentos) next.clientes = true;
  if (next.contratos) {
    next.clientes = true;
    next.orcamentos = true;
  }
  if (next.equipeTecnica) {
    next.ordensServico = true;
    next.precosSistemas = true;
  }
  if (next.clientes) next.gerenciarClientes = true;
  return next;
};

const permissionPresets = [
  {
    id: 'comercial',
    label: 'Comercial completo',
    permissions: {
      dashboard: true,
      clientes: true,
      leads: true,
      whatsapp: true,
      orcamentos: true,
      contratos: true,
      precosSistemas: true,
    },
  },
  {
    id: 'consultor',
    label: 'Consultor WhatsApp',
    permissions: {
      dashboard: true,
      leads: true,
      whatsapp: true,
      orcamentos: true,
      contratos: true,
    },
  },
  {
    id: 'tecnico',
    label: 'Técnico',
    permissions: {
      dashboard: true,
      clientes: true,
      equipeTecnica: true,
      ordensServico: true,
      contratos: true,
      precosSistemas: true,
    },
  },
  {
    id: 'limpar',
    label: 'Limpar acesso',
    permissions: { dashboard: true },
  },
];

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
    whatsapp: (
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2A10 10 0 0 0 3.6 17.4L2.3 22l4.8-1.2A10 10 0 1 0 12 2Zm5.4 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-1.7-.1-.4-.1-.9-.3-1.6-.5-2.8-1.2-4.6-4-4.8-4.2-.1-.2-1.1-1.5-1.1-2.9 0-1.4.7-2.1 1-2.4.2-.2.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .6l-.3.5-.4.5c-.1.1-.2.3-.1.5.2.3.7 1.1 1.6 1.9 1.1.9 2 1.3 2.3 1.4.3.1.5.1.6-.1l.9-1.1c.2-.3.4-.3.7-.2.2.1 1.6.8 1.9.9.3.1.4.2.5.3.1.2.1.8-.1 1.4Z" /></svg>
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
const defaultQuickActionIds = ['qa-novo-orcamento', 'qa-leads', 'qa-contratos', 'qa-homologacao', 'qa-os'];
const OS_STATUS_FLOW = [
  'Aguardando triagem', 'Planejada', 'Agendada', 'Em atendimento',
  'Com pendência', 'Concluída', 'Encerrada', 'Cancelada',
  'Aberta', 'Em análise', 'Aguardando agendamento', 'Equipe a caminho',
  'Aguardando material', 'Retorno necessário', 'Serviço concluído', 'Validada pelo cliente',
];
const OS_OCORRENCIA_MAP = {
  'Geração e desempenho': ['Falha total','Geração abaixo do esperado','Queda repentina','Oscilação','Sistema desligando','Análise de desempenho','Outro'],
  'Inversor e monitoramento': ['Sem comunicação','Offline','Código de erro','Alarme','Não inicializa','Falha no Wi-Fi','Troca de rede/senha','Troca de equipamento','Suporte de monitoramento'],
  'Módulos fotovoltaicos': ['Módulo quebrado','Módulo trincado','Limpeza','Sombreamento novo','Suspeita de perda'],
  'Estrutura e telhado': ['Vazamento','Telha quebrada','Estrutura solta','Fixação solta','Retorno de instalação'],
  'Instalação elétrica': ['Disjuntor desarmando','DPS danificado','Cabo aquecendo','Aterramento','Adequação elétrica'],
  'Concessionária e homologação': ['Troca de medidor','Vistoria reprovada','Documento pendente','Divergência na fatura','Contestação'],
  'Manutenção e vistoria': ['Preventiva','Corretiva','Vistoria técnica','Limpeza','Testes elétricos'],
  'Atendimento administrativo': ['Garantia','Segunda via','Titularidade','Relatório','Visita técnica particular'],
  'Outro': ['Outro — descreva no campo abaixo'],
};
const OS_PRIORITY_OPTIONS = ['Baixa', 'Normal', 'Alta', 'Urgente'];
const OS_MOTIVO_OPTIONS = [
  'Manutenção preventiva',
  'Manutenção corretiva',
  'Falha de geração',
  'Inversor sem comunicação',
  'Inversor com erro',
  'Troca de equipamento',
  'Vazamento no telhado',
  'Problema na estrutura',
  'Problema elétrico',
  'Vistoria técnica',
  'Limpeza dos módulos',
  'Adequação do padrão',
  'Suporte de monitoramento',
  'Solicitação da concessionária',
  'Retorno de instalação',
  'Outro',
];
const OS_ASSINATURA_OPTIONS = [
  { value: 'cliente_acompanhou', label: 'Cliente acompanhou' },
  { value: 'cliente_aprovou', label: 'Cliente aprovou' },
  { value: 'cliente_recusou', label: 'Cliente recusou aprovação' },
];
const createEmptyOsForm = () => ({
  clienteNome: '',
  clienteTelefone: '',
  contratoId: '',
  origem: 'WhatsApp',
  problema: '',
  categoria: 'Falha de geração',
  prioridade: 'Normal',
  responsavelId: '',
  observacoes: '',
  cpfCnpj: '',
  endereco: '',
  cidade: '',
  sistemaResumo: '',
  dataInstalacao: '',
  consultor: '',
  motivo: 'Falha de geração',
  descricaoProblema: '',
  dataDesejada: '',
  prazoMaximo: '',
  tecnicoEquipe: '',
  materiaisPrevios: '',
  contatoLocal: '',
  observacoesInternas: '',
  tipoOcorrencia: '',
});
const createDefaultOsDados = (os = {}) => {
  const dados = os?.dados || {};
  return {
    cliente: {
      cpfCnpj: '',
      endereco: '',
      cidade: '',
      contratoNumero: os?.contratoId || '',
      sistema: '',
      dataInstalacao: '',
      consultor: '',
      ...(dados.cliente || {}),
    },
    motivo: dados.motivo || os?.categoria || 'Falha de geração',
    descricaoProblema: dados.descricaoProblema || os?.problema || '',
    atendimento: {
      prioridade: os?.prioridade || 'Normal',
      dataDesejada: '',
      prazoMaximo: '',
      tecnicoEquipe: os?.responsavelNome || '',
      materiaisPrevios: '',
      contatoLocal: '',
      observacoesInternas: os?.observacoes || '',
      ...(dados.atendimento || {}),
    },
    checklist: {
      verificarInversor: false,
      fotografarTela: false,
      registrarCodigoErro: false,
      verificarDisjuntores: false,
      medirTensaoCc: false,
      medirTensaoCa: false,
      verificarComunicacao: false,
      verificarAplicativo: false,
      registrarGeracaoAtual: false,
      informarDiagnostico: false,
      indicarNecessidadeRetorno: false,
      ...(dados.checklist || {}),
    },
    relatorio: {
      diagnostico: '',
      servicoRealizado: '',
      pecasMateriais: '',
      equipamentosSubstituidos: '',
      numeroSerie: '',
      testes: '',
      resultado: '',
      necessidadeRetorno: '',
      recomendacao: '',
      observacoesFinais: '',
      ...(dados.relatorio || {}),
    },
    assinatura: {
      servicoRealizado: 'cliente_acompanhou',
      motivoRecusa: '',
      nomeCliente: os?.clienteNome || '',
      ...(dados.assinatura || {}),
    },
    materiais: {
      solicitacao: '',
      liberacao: '',
      retirada: '',
      utilizado: '',
      custo: '',
      numeroSerieFotos: '',
      ...(dados.materiais || {}),
    },
  };
};
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

const getPanelWhatsAppUrl = (phone, message = '') => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  let normalized = digits.startsWith('55') ? digits : `55${digits}`;
  if (normalized.length === 14 && normalized.charAt(4) === '9') {
    normalized = normalized.slice(0, 4) + normalized.slice(5);
  }
  return `https://wa.me/${normalized}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
};

const MAX_PROJECT_DOCUMENT_BYTES = 15 * 1024 * 1024;
const PROJECT_DOCUMENT_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const isValidProjectDocumentFile = (file) => (
  Boolean(file)
  && PROJECT_DOCUMENT_TYPES.has(String(file.type || '').toLowerCase())
  && file.size <= MAX_PROJECT_DOCUMENT_BYTES
);

const getOrcStatusClass = (status) => {
  switch (String(status || '')) {
    case 'Orçamento aprovado': return 'orc-status-venda';
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

const getLeadInitials = (nome = '') => {
  const parts = nome.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (nome.slice(0, 2) || 'LD').toUpperCase();
};
const AVATAR_COLORS = ['#f97316','#3b82f6','#10b981','#8b5cf6','#ef4444','#f59e0b','#06b6d4','#ec4899'];
const getLeadAvatarColor = (nome = '') => {
  let hash = 0;
  for (const ch of String(nome)) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};
const getLeadSourceLabel = (lead) => {
  const o = String(lead.origem || '').toLowerCase();
  if (o.includes('facebook') || o.includes('fb')) return 'FACEBOOK';
  if (o.includes('whatsapp') || o.includes('zap')) return 'WHATSAPP';
  if (o.includes('indica')) return 'INDICAÇÃO';
  if (lead.tipoCadastro === 'manual') return 'MANUAL';
  if (o.includes('site') || lead.tipoCadastro === 'site') return 'SITE';
  if (lead.origem) return String(lead.origem).toUpperCase();
  return lead.tipoCadastro === 'manual' ? 'MANUAL' : 'SITE';
};
const getLeadSourceKey = (lead) => {
  const label = getLeadSourceLabel(lead).toLowerCase();
  if (label === 'facebook') return 'facebook';
  if (label === 'whatsapp') return 'whatsapp';
  if (label.includes('indica')) return 'indicacao';
  if (label === 'manual') return 'manual';
  return 'site';
};
const formatRetornoDate = (value) => {
  if (!value) return '–';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const dDay = new Date(d); dDay.setHours(0, 0, 0, 0);
  if (dDay.getTime() === today.getTime()) return 'Hoje';
  if (dDay.getTime() === tomorrow.getTime()) return 'Amanhã';
  return dDay.toLocaleDateString('pt-BR');
};
const getLeadPriority = (proximoRetorno) => {
  if (!proximoRetorno) return 'Baixa';
  const d = new Date(proximoRetorno); d.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  if (d <= today) return 'Alta';
  if (d.getTime() === tomorrow.getTime()) return 'Média';
  return 'Baixa';
};
const daysSinceContact = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
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

const maskCpfCnpj = (value) => {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 14);
  if (digits.length <= 11) return maskCpf(digits);
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
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
const getContractConsultantLabel = (contrato = {}) => (
  contrato.consultorNome || contrato.assignedUserName || contrato.criadoPorNome || 'Sem consultor'
);
const dateBr = (value) => value ? new Date(value).toLocaleDateString('pt-BR') : 'Sem data';
const getInstStatusForNew = (p = {}) => {
  if (p.medidorTrocadoAt || p.checklist?.sistemaLigado || p.etapa === 'Projeto concluído') return 'Concluída';
  if (p.instalacaoConcluidaAt || p.checklist?.instalacao) return 'Concluída';
  if (p.instalacaoAgendada) return 'Instalação agendada';
  if (p.equipamentoEntregueAt || p.checklist?.equipamentoEntregue) return 'Equipamento entregue';
  if (p.equipamentoEnviadoAt) return 'Em transporte';
  return 'Aguardando envio';
};
const contractNumber = (contrato = {}) => (
  `CT-${String(contrato.dataCriacao || '').slice(0, 4) || new Date().getFullYear()}-${String(contrato.id || '').padStart(4, '0')}`
);
const currencyToNumber = currencyInputToNumber;
const whatsappLeadMessage = (lead = {}) => (
  `Olá ${lead.nome || ''}! Sou da DRM Energia Solar. Vi sua simulação no nosso site e quero te passar as melhores condições para você economizar na conta de energia. Podemos conversar agora?`
);
const whatsappClientMessage = (cliente = {}) => (
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
  consultorId: contrato.consultorId ?? '',
  consultorNome: contrato.consultorNome || contrato.assignedUserName || contrato.criadoPorNome || '',
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

const getContractSignatureMeta = (contrato = {}) => {
  const assinatura = contrato?.dados?.assinatura || {};
  const drmSigned = Boolean(assinatura?.drm?.dataUrl && assinatura?.drm?.signedAt);
  const clienteSigned = Boolean(assinatura?.cliente?.dataUrl && assinatura?.cliente?.signedAt);
  if (drmSigned && clienteSigned) return { label: 'Assinado digitalmente', tone: 'success' };
  if (drmSigned) return { label: 'Aguardando assinatura do cliente', tone: 'warning' };
  if (clienteSigned) return { label: 'Cliente assinou, falta DRM', tone: 'info' };
  if (assinatura?.link?.token) return { label: 'Link de assinatura gerado', tone: 'info' };
  return { label: 'Pendente de assinaturas', tone: 'muted' };
};

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
  consultorNome: '',
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

const installationStages = [
  'Equipamento enviado',
  'Equipamento entregue',
  'Instalação agendada',
  'Instalação concluída',
  'Pedido de ligação realizado',
  'Ligação realizada pela concessionária',
];

const getInstallationStage = (projeto = {}) => {
  if (projeto.medidorTrocadoAt || projeto.checklist?.sistemaLigado || projeto.etapa === 'Projeto concluído') {
    return 'Ligação realizada pela concessionária';
  }
  if (projeto.pedidoLigacaoAt) {
    return 'Pedido de ligação realizado';
  }
  if (projeto.instalacaoConcluidaAt || projeto.checklist?.instalacao || projeto.checklist?.vistoriaFinal) {
    return 'Instalação concluída';
  }
  if (projeto.instalacaoAgendada) {
    return 'Instalação agendada';
  }
  if (projeto.equipamentoEntregueAt || projeto.checklist?.equipamentoEntregue) {
    return 'Equipamento entregue';
  }
  return 'Equipamento enviado';
};

const projectOperationColumns = [
  {
    id: 'equipamento-enviado',
    label: 'Equipamento enviado',
    matches: (projeto) => getInstallationStage(projeto) === 'Equipamento enviado',
  },
  {
    id: 'equipamento-entregue',
    label: 'Equipamento entregue',
    matches: (projeto) => getInstallationStage(projeto) === 'Equipamento entregue',
  },
  {
    id: 'instalacao-agendada',
    label: 'Instalação agendada',
    matches: (projeto) => getInstallationStage(projeto) === 'Instalação agendada',
  },
  {
    id: 'instalacao-concluida',
    label: 'Instalação concluída',
    matches: (projeto) => getInstallationStage(projeto) === 'Instalação concluída',
  },
  {
    id: 'pedido-ligacao',
    label: 'Pedido de ligação realizado',
    matches: (projeto) => getInstallationStage(projeto) === 'Pedido de ligação realizado',
  },
  {
    id: 'ligacao-realizada',
    label: 'Ligação realizada',
    matches: (projeto) => getInstallationStage(projeto) === 'Ligação realizada pela concessionária',
  },
];
const projectChecklistLabels = {
  documentacaoRecebida: 'Documentação recebida',
  documentacaoCorrigida: 'Documentação corrigida',
  vistoriaRealizada: 'Vistoria realizada',
  equipamentoEntregue: 'Equipamento entregue',
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
  homologacao: 'Pedido de ligação realizado',
  instalacao: 'Instalação',
  vistoriaFinal: 'Vistoria final',
  medidorTrocado: 'Medidor trocado pela Equatorial',
  sistemaLigado: 'Sistema ligado',
};

const streetChecklistKeys = ['equipamentoEntregue', 'instalacao', 'vistoriaFinal', 'homologacao', 'medidorTrocado', 'sistemaLigado'];
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
  modo: 'cliente',
  clienteId: '',
  clienteNome: '',
  clienteCpfCnpj: '',
  clienteCidade: '',
  clienteTelefone: '',
  clienteEmail: '',
  equipamentoId: '',
  potenciaPlacaW: '600',
  placaModelo: '',
  numeroPaineis: '',
  potenciaInversorKw: '',
  inversorMarca: '',
  inversorModelo: '',
  quantidadeInversores: '1',
  inversoresAdicionais: [],
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
  const firstTab = ['dashboard', 'leads', 'whatsapp', 'orcamentos', 'contratos', 'equipeTecnica', 'ordensServico', 'precosSistemas', 'clientes', 'financeiro', 'usuarios']
    .find(permission => user.role === 'ADM' || user.permissions?.[permission]);
  return firstTab === 'equipeTecnica' ? 'projetos' : firstTab || 'leads';
};

const AdminDashboard = () => {
  const initialUser = getInitialAdminUser();
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(() => resolveInitialTab(initialUser, location.pathname));
  const [panelHistory, setPanelHistory] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [clientSearch, setClientSearch] = useState('');
  const [leads, setLeads] = useState([]);
  const [leadOwners, setLeadOwners] = useState([]);
  const [leadSearch, setLeadSearch] = useState('');
  const [leadOwnerFilter, setLeadOwnerFilter] = useState('todos');
  const [leadTabFilter, setLeadTabFilter] = useState('todos');
  const [openLeadMenu, setOpenLeadMenu] = useState(null);
  const [showManualLeadForm, setShowManualLeadForm] = useState(false);
  const [manualLeadForm, setManualLeadForm] = useState(emptyManualLeadForm);
  const [whatsappStatus, setWhatsappStatus] = useState(null);
  const [whatsappConversations, setWhatsappConversations] = useState([]);
  const [selectedWhatsappConversation, setSelectedWhatsappConversation] = useState(null);
  const [whatsappMessages, setWhatsappMessages] = useState([]);
  const [whatsappMediaPreview, setWhatsappMediaPreview] = useState(null);
  const [whatsappReply, setWhatsappReply] = useState('');
  const [whatsappRecording, setWhatsappRecording] = useState(false);
  const [whatsappRecordedAudio, setWhatsappRecordedAudio] = useState(null);
  const [whatsappRecordingSeconds, setWhatsappRecordingSeconds] = useState(0);
  const [whatsappLoading, setWhatsappLoading] = useState(false);
  const [whatsappFilter, setWhatsappFilter] = useState('aguardando');
  const [whatsappSearch, setWhatsappSearch] = useState('');
  const [whatsappMobileChatOpen, setWhatsappMobileChatOpen] = useState(false);
  const [waChatActionsOpen, setWaChatActionsOpen] = useState(false);
  const [whatsappTransferOpen, setWhatsappTransferOpen] = useState(false);
  const [whatsappTransferUserId, setWhatsappTransferUserId] = useState('');
  const [whatsappConnectOpen, setWhatsappConnectOpen] = useState(false);
  const [whatsappConnectLoading, setWhatsappConnectLoading] = useState(false);
  const [whatsappSetupOpen, setWhatsappSetupOpen] = useState(false);
  const [whatsappSetupNumber, setWhatsappSetupNumber] = useState('');
  const [whatsappSetupLoading, setWhatsappSetupLoading] = useState(false);
  const [whatsappSetupError, setWhatsappSetupError] = useState('');
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
  // ── Instalações redesign state ─────────────────────────────────────────────
  const [instSearch, setInstSearch] = useState('');
  const [instCidadeFilter, setInstCidadeFilter] = useState('');
  const [instInstaladorFilter, setInstInstaladorFilter] = useState('');
  const [instStatusFilter, setInstStatusFilter] = useState('');
  const [instDataFilter, setInstDataFilter] = useState('');
  const [instPage, setInstPage] = useState(1);
  const [instNovaOpen, setInstNovaOpen] = useState(false);
  const [instAgendaTab, setInstAgendaTab] = useState('hoje');
  const [instSelectedId, setInstSelectedId] = useState(null);
  const [instActionsOpen, setInstActionsOpen] = useState(null);
  const [instChecklistState, setInstChecklistState] = useState({});
  const INST_PER_PAGE = 10;
  const INST_STATUS_FLOW = ['Aguardando envio','Em transporte','Entrega agendada','Equipamento entregue','Materiais com pendência','Aguardando instalação','Instalação agendada','Reagendada','Em instalação','Aguardando conferência técnica','Concluída','Cancelada'];
  // ── End Instalações redesign state ─────────────────────────────────────────
  // ── Esteira Sistemas FV state ───────────────────────────────────────────────
  const [sistemasFv, setSistemasFv] = useState([]);
  const [sfvFilter, setSfvFilter] = useState('todos');
  const [sfvSearch, setSfvSearch] = useState('');
  const [sfvConsultorFilter, setSfvConsultorFilter] = useState('');
  const [sfvCidadeFilter, setSfvCidadeFilter] = useState('');
  const [sfvView, setSfvView] = useState('kanban');
  const [sfvSelected, setSfvSelected] = useState(null);
  const [sfvHistorico, setSfvHistorico] = useState([]);
  const [sfvUpdateOpen, setSfvUpdateOpen] = useState(false);
  const [sfvUpdateForm, setSfvUpdateForm] = useState({ etapaAtual: '', status: '', proximaAcao: '', prazoAtual: '', responsavelAtual: '', observacoes: '' });
  const [sfvFichaTab, setSfvFichaTab] = useState('resumo');
  // ── End Esteira Sistemas FV state ───────────────────────────────────────────
  const [pendenciaForm, setPendenciaForm] = useState(emptyPendenciaForm);
  const [envioHomologacaoForm, setEnvioHomologacaoForm] = useState(emptyEnvioHomologacaoForm);
  const [novoCliente, setNovoCliente] = useState(emptyClientForm);
  const [clientView, setClientView] = useState('list');
  const [selectedCliente, setSelectedCliente] = useState(null);
  const [clientFichaTab, setClientFichaTab] = useState('resumo');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [orcamentos, setOrcamentos] = useState([]);
  const [selectedOrcamento, setSelectedOrcamento] = useState(null);
  const [budgetForm, setBudgetForm] = useState(getInitialBudgetForm);
  const [isBudgetFormOpen, setIsBudgetFormOpen] = useState(() => localStorage.getItem(budgetDraftOpenStorageKey) === '1');
  const [budgetStatus, setBudgetStatus] = useState('');
  const [budgetFieldErrors, setBudgetFieldErrors] = useState({});
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
  const [contractSignatureModal, setContractSignatureModal] = useState({ open: false, contract: null, signerName: '', signatureLink: '' });
  const [equipamentos, setEquipamentos] = useState([]);
  const [equipamentoForm, setEquipamentoForm] = useState(emptyEquipamentoForm);
  const [editingEquipamentoId, setEditingEquipamentoId] = useState(null);
  const [produtoSearch, setProdutoSearch] = useState('');
  const [produtoTipoFilter, setProdutoTipoFilter] = useState('todos');
  const [produtoStatusFilter, setProdutoStatusFilter] = useState('todos');
  const [produtoSubTab, setProdutoSubTab] = useState('placas');
  // Placas
  const [placas, setPlacas] = useState([]);
  const [placaForm, setPlacaForm] = useState({ modelo: '', potencia_w: '', status: 'ativo' });
  const [editingPlacaId, setEditingPlacaId] = useState(null);
  const [placaSearch, setPlacaSearch] = useState('');
  const [placaStatusFilter, setPlacaStatusFilter] = useState('todos');
  // Marcas / Modelos de inversor
  const [marcasInversor, setMarcasInversor] = useState([]);
  const [modelosInversor, setModelosInversor] = useState([]);
  const [selectedMarcaId, setSelectedMarcaId] = useState(null);
  const [marcaForm, setMarcaForm] = useState({ nome_marca: '', status: 'ativo' });
  const [editingMarcaId, setEditingMarcaId] = useState(null);
  const [showMarcaForm, setShowMarcaForm] = useState(false);
  const [modeloForm, setModeloForm] = useState({ marca_id: '', nome_modelo: '', status: 'ativo' });
  const [editingModeloId, setEditingModeloId] = useState(null);
  // Inversor Híbrido
  const [marcasHibrido, setMarcasHibrido] = useState([]);
  const [modelosHibrido, setModelosHibrido] = useState([]);
  const [bateriasHibrido, setBateriasHibrido] = useState([]);
  const [selectedMarcaHibridoId, setSelectedMarcaHibridoId] = useState(null);
  const [selectedModeloHibridoId, setSelectedModeloHibridoId] = useState(null);
  const [marcaHibridoForm, setMarcaHibridoForm] = useState({ nome_marca: '', status: 'ativo' });
  const [showMarcaHibridoForm, setShowMarcaHibridoForm] = useState(false);
  const [modeloHibridoForm, setModeloHibridoForm] = useState({ marca_id: '', nome_modelo: '', status: 'ativo' });
  const [showModeloHibridoForm, setShowModeloHibridoForm] = useState(false);
  const [bateriaForm, setBateriaForm] = useState({ modelo_hibrido_id: '', nome_bateria: '', capacidade_kwh: '', status: 'ativo' });
  const [showBateriaForm, setShowBateriaForm] = useState(false);
  const [hibridoCadForm, setHibridoCadForm] = useState({ marca_id: '', modelo_hibrido_id: '', nome_bateria: '', capacidade_kwh: '', status: 'ativo' });
  const equipamentoNomeRef = useRef(null);
  const signatureCanvasRef = useRef(null);
  const signatureDrawingRef = useRef({ isDrawing: false, lastX: 0, lastY: 0 });
  const contractSignatureCanvasRef = useRef(null);
  const contractSignatureDrawingRef = useRef({ isDrawing: false, lastX: 0, lastY: 0 });
  const whatsappMessagesEndRef = useRef(null);
  const whatsappMediaRecorderRef = useRef(null);
  const whatsappRecordingStreamRef = useRef(null);
  const whatsappRecordingTimerRef = useRef(null);
  const [selectedEquipamentos, setSelectedEquipamentos] = useState({});
  const [contractModal, setContractModal] = useState({ open: false, orcamento: null, manual: emptyContractManual, equipamentoId: '' });
  const [contractConfig, setContractConfig] = useState(defaultContractConfig);
  const [despesaForm, setDespesaForm] = useState({ nome: '', valor: '', categoria: '' });
  const [activityForm, setActivityForm] = useState({ leadId: '', tipo: 'Ligação', origem: 'Ligação', descricao: '', resultado: '', proximoRetorno: '' });
  const [leadsPage, setLeadsPage] = useState(1);
  const [osForm, setOsForm] = useState(createEmptyOsForm);
  const [selectedOsId, setSelectedOsId] = useState(null);
  const [osSearch, setOsSearch] = useState('');
  const [osPriorityFilter, setOsPriorityFilter] = useState('todas');
  const [osResponsavelFilter, setOsResponsavelFilter] = useState('todos');
  const [osCidadeFilter, setOsCidadeFilter] = useState('todas');
  const [osTipoFilter, setOsTipoFilter] = useState('todos');
  const [osDataFrom, setOsDataFrom] = useState('');
  const [osDataTo, setOsDataTo] = useState('');
  const [osSistemaFilter, setOsSistemaFilter] = useState('');
  const [osContratoFilter, setOsContratoFilter] = useState('');
  const [osAtrasadasOnly, setOsAtrasadasOnly] = useState(false);
  const [osClienteMode, setOsClienteMode] = useState('existente');
  const [osClienteSearch, setOsClienteSearch] = useState('');
  const [osDrawerOpen, setOsDrawerOpen] = useState(false);
  const [osDrawerStep, setOsDrawerStep] = useState(1);
  const [osInnerTab, setOsInnerTab] = useState('ordensServico');
  const [osPanelTab, setOsPanelTab] = useState('Resumo');
  const [osShowMoreFilters, setOsShowMoreFilters] = useState(false);
  const [osPage, setOsPage] = useState(1);
  const [osEvidenceUploadType, setOsEvidenceUploadType] = useState('Foto antes do serviço');
  const [priceForm, setPriceForm] = useState(emptyPriceForm);
  const [priceResult, setPriceResult] = useState(null);
  const [priceError, setPriceError] = useState('');
  const [quickModal, setQuickModal] = useState(null);
  const [adminUser] = useState(initialUser);
  const [quickActionPrefs, setQuickActionPrefs] = useState(() => (
    Array.isArray(initialUser.quickActions) ? initialUser.quickActions : null
  ));
  const [quickActionEditorOpen, setQuickActionEditorOpen] = useState(false);
  const [quickActionDraft, setQuickActionDraft] = useState(() => (
    Array.isArray(initialUser.quickActions) ? initialUser.quickActions : defaultQuickActionIds
  ));
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
  const [homoDocUpload, setHomoDocUpload] = useState({ tipo: 'cliente', nome: '', descricao: '', localizacaoCliente: '', arquivo: null });
  const [homoDocUploadLoading, setHomoDocUploadLoading] = useState(false);
  const [projetoDocumentPreview, setProjetoDocumentPreview] = useState(null);

  const getPanelSnapshot = useCallback(() => ({
    activeTab,
    clientView,
    homoView,
    homoDetalheTab,
    selectedProjetoId: selectedProjeto?.id || null,
    selectedOrcClientId: selectedOrcClient?.id || null,
    selectedOrcamentoId: selectedOrcamento?.id || null,
    selectedContratoId: selectedContrato?.id || null,
    isBudgetFormOpen,
    leadTabFilter,
    whatsappFilter,
  }), [
    activeTab,
    clientView,
    homoDetalheTab,
    homoView,
    isBudgetFormOpen,
    leadTabFilter,
    selectedContrato?.id,
    selectedOrcClient?.id,
    selectedOrcamento?.id,
    selectedProjeto?.id,
    whatsappFilter,
  ]);

  const restorePanelSnapshot = useCallback((snapshot = {}) => {
    setActiveTab(snapshot.activeTab || 'dashboard');
    setClientView(snapshot.clientView || 'list');
    setHomoView(snapshot.homoView || 'fila');
    setHomoDetalheTab(snapshot.homoDetalheTab || 'cliente');
    setLeadTabFilter(snapshot.leadTabFilter || 'todos');
    setWhatsappFilter(snapshot.whatsappFilter || 'aguardando');
    setSelectedProjeto(snapshot.selectedProjetoId ? projetos.find(item => Number(item.id) === Number(snapshot.selectedProjetoId)) || null : null);
    setSelectedOrcClient(snapshot.selectedOrcClientId ? clientes.find(item => Number(item.id) === Number(snapshot.selectedOrcClientId)) || null : null);
    setSelectedOrcamento(snapshot.selectedOrcamentoId ? orcamentos.find(item => Number(item.id) === Number(snapshot.selectedOrcamentoId)) || null : null);
    setSelectedContrato(snapshot.selectedContratoId ? contratos.find(item => Number(item.id) === Number(snapshot.selectedContratoId)) || null : null);
    setIsBudgetFormOpen(Boolean(snapshot.isBudgetFormOpen));
    setQuickModal(null);
    setShowManualLeadForm(false);
    setWhatsappTransferOpen(false);
    setWaChatActionsOpen(false);
    setIsSidebarOpen(false);
  }, [clientes, contratos, orcamentos, projetos]);

  const rememberPanelStep = useCallback(() => {
    const current = getPanelSnapshot();
    setPanelHistory(prev => {
      const last = prev[prev.length - 1];
      if (last && JSON.stringify(last) === JSON.stringify(current)) return prev;
      return [...prev.slice(-24), current];
    });
  }, [getPanelSnapshot]);

  const navigatePanel = useCallback((changes = {}) => {
    rememberPanelStep();
    restorePanelSnapshot({ ...getPanelSnapshot(), ...changes });
  }, [getPanelSnapshot, rememberPanelStep, restorePanelSnapshot]);

  const handlePanelBack = useCallback(() => {
    const last = panelHistory[panelHistory.length - 1];
    if (last) {
      restorePanelSnapshot(last);
      setPanelHistory(prev => prev.slice(0, -1));
      return;
    }

    if (activeTab === 'homologacao' && (homoView !== 'fila' || selectedProjeto)) {
      setHomoView('fila');
      setSelectedProjeto(null);
      return;
    }
    if (activeTab === 'projetos' && selectedProjeto) {
      setSelectedProjeto(null);
      return;
    }
    if (activeTab === 'clientes' && clientView !== 'list') {
      setClientView('list');
      setNovoCliente(emptyClientForm);
      return;
    }
    if (activeTab === 'orcamentos' && (isBudgetFormOpen || selectedOrcamento || selectedOrcClient)) {
      setIsBudgetFormOpen(false);
      setSelectedOrcamento(null);
      setSelectedOrcClient(null);
      return;
    }
    if (activeTab !== 'dashboard') setActiveTab('dashboard');
  }, [activeTab, clientView, homoView, isBudgetFormOpen, panelHistory, restorePanelSnapshot, selectedOrcClient, selectedOrcamento, selectedProjeto]);

  const canPanelGoBack = panelHistory.length > 0
    || activeTab !== 'dashboard'
    || clientView !== 'list'
    || Boolean(selectedProjeto)
    || Boolean(selectedOrcClient)
    || Boolean(selectedOrcamento)
    || isBudgetFormOpen;

  const headers = useMemo(() => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('token')}`,
  }), []);

  const hasPermission = useCallback((permission) => (
    adminUser.role === 'ADM'
    || adminUser.permissions?.[permission]
    || (permission === 'gerenciarClientes' && adminUser.permissions?.clientes)
  ), [adminUser.permissions, adminUser.role]);

  const isMasterAdmin = adminUser.role === 'ADM' && String(adminUser.username || '').toLowerCase() === 'deivson';
  const canArchiveWhatsappNotLead = isMasterAdmin || String(adminUser.username || '').toLowerCase() === 'renejr';
  const isConsultorOnly = adminUser.role !== 'ADM' && String(adminUser.username || '').toLowerCase() !== 'renejr';
  const leadAssignableUsers = useMemo(
    () => usuarios.filter(user => user.active !== 0 && user.permissions?.leads && String(user.username || '').toLowerCase() !== 'deivson'),
    [usuarios]
  );
  const whatsappTransferUsers = useMemo(
    () => usuarios.filter(user => user.active !== 0 && user.permissions?.whatsapp && String(user.username || '').toLowerCase() !== 'deivson'),
    [usuarios]
  );

  const showToast = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random();
    const icons = { success: '✓', error: '✕', warning: '!', info: 'i' };
    setToasts(prev => [...prev, { id, message, type, icon: icons[type] || 'i' }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4800);
  }, []);

  const openProjetoDocumento = useCallback((documento) => {
    if (!documento?.dataUrl) {
      showToast('Este documento não possui um arquivo disponível.', 'error');
      return;
    }

    try {
      const [metadata, encodedData] = String(documento.dataUrl).split(',', 2);
      const mimeType = metadata.match(/^data:([^;]+);base64$/i)?.[1];
      if (!mimeType || !encodedData) throw new Error('Formato inválido');

      const binary = window.atob(encodedData);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }

      const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
      setProjetoDocumentPreview({
        url,
        mimeType,
        name: documento.arquivo || documento.nome || 'Documento',
      });
    } catch {
      showToast('Não foi possível abrir este documento. Substitua o arquivo e tente novamente.', 'error');
    }
  }, [showToast]);

  const closeProjetoDocumentPreview = useCallback(() => {
    setProjetoDocumentPreview(current => {
      if (current?.url) URL.revokeObjectURL(current.url);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!projetoDocumentPreview) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') closeProjetoDocumentPreview();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeProjetoDocumentPreview, projetoDocumentPreview]);

  const playNewLeadAlert = useCallback(() => {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const audioContext = new AudioContextClass();
      const gain = audioContext.createGain();
      gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.18, audioContext.currentTime + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 2);
      gain.connect(audioContext.destination);

      [0, 0.38, 0.76, 1.14, 1.52].forEach((offset) => {
        const oscillator = audioContext.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, audioContext.currentTime + offset);
        oscillator.connect(gain);
        oscillator.start(audioContext.currentTime + offset);
        oscillator.stop(audioContext.currentTime + offset + 0.22);
      });
      setTimeout(() => audioContext.close().catch(() => {}), 2300);
      if (navigator.vibrate) navigator.vibrate([180, 80, 180]);
    } catch {
      // O navegador pode bloquear áudio antes da primeira interação do usuário.
    }
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
        { id: 'whatsapp', label: 'WhatsApp', permission: 'whatsapp' },
        { id: 'orcamentos', label: 'Orçamentos', permission: 'orcamentos' },
        { id: 'contratos', label: 'Contratos', permission: 'contratos' },
        ...(!isConsultorOnly ? [{ id: 'procuracoes', label: 'Procurações', permission: 'contratos' }] : []),
      ],
    },
    {
      title: 'Operação',
      tabs: [
        { id: 'homologacao', label: 'Homologação', permission: 'equipeTecnica' },
        { id: 'projetos', label: 'Instalações', permission: 'equipeTecnica' },
        { id: 'esteiraSistemasFV', label: 'Esteira de Sistemas FV', permission: 'equipeTecnica' },
        { id: 'ordensServico', label: 'O.S e suporte', permission: 'ordensServico' },
      ],
    },
    {
      title: 'Catálogo e preços',
      tabs: [
        { id: 'produtosPacotes', label: 'Produtos', permission: 'contratos' },
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

  const availableQuickActions = [
    { id: 'qa-dashboard', label: 'Painel geral', tab: 'dashboard', permission: 'dashboard', group: 'Principal', description: 'Resumo da operação e indicadores.' },
    { id: 'qa-clientes', label: 'Clientes', tab: 'clientes', permission: 'clientes', group: 'Comercial', description: 'Base comercial e cadastro de clientes.', badge: clientes.length },
    { id: 'qa-leads-lista', label: 'Leads', tab: 'leads', permission: 'leads', group: 'Comercial', description: 'Lista e filtros dos leads captados.', badge: leads.filter(item => item.status === 'Novo').length },
    { id: 'qa-leads', label: 'Cadastrar lead', tab: 'leads', action: 'newLead', permission: 'leads', group: 'Ações diretas', description: 'Abre o cadastro rápido de lead.', badge: leads.filter(item => item.status === 'Novo').length },
    { id: 'qa-whatsapp', label: 'WhatsApp', tab: 'whatsapp', permission: 'whatsapp', group: 'Comercial', description: 'Atender conversas no painel.', badge: whatsappConversations.reduce((total, item) => total + Number(item.unreadCount || 0), 0) },
    { id: 'qa-orcamentos', label: 'Orçamentos', tab: 'orcamentos', permission: 'orcamentos', group: 'Comercial', description: 'Consultar propostas por cliente.', badge: orcamentos.length },
    { id: 'qa-novo-orcamento', label: 'Novo orçamento', tab: 'orcamentos', action: 'newBudget', permission: 'orcamentos', group: 'Ações diretas', description: 'Criar orçamento de forma rápida.', badge: clientes.length },
    { id: 'qa-contratos-lista', label: 'Contratos', tab: 'contratos', permission: 'contratos', group: 'Comercial', description: 'Consultar contratos gerados.', badge: contratos.length },
    { id: 'qa-contratos', label: 'Aprovar contrato', tab: 'contratos', permission: 'contratos', group: 'Ações diretas', description: 'Ir para contratos pendentes.', badge: contratos.filter(item => item.status === 'Pendente').length },
    { id: 'qa-procuracoes', label: 'Procurações', tab: 'procuracoes', permission: 'contratos', group: 'Comercial', description: 'Documentos de procuração e aprovação.', badge: procuracoes.filter(item => item.status === 'Pendente').length },
    { id: 'qa-homologacao', label: 'Homologação', tab: 'homologacao', permission: 'equipeTecnica', group: 'Operação', description: 'Rotina de documentação técnica.', badge: projetos.filter(item => ['Pendência da concessionária', 'Reenviar projeto', 'Aguardando parecer de acesso', 'Vistoria reprovada'].includes(item.etapa)).length },
    { id: 'qa-instalacoes', label: 'Instalações', tab: 'projetos', permission: 'equipeTecnica', group: 'Operação', description: 'Projetos e andamento de instalação.', badge: projetos.filter(item => getInstallationStage(item) !== 'Ligação realizada pela concessionária').length },
    { id: 'qa-os', label: 'O.S abertas', tab: 'ordensServico', permission: 'ordensServico', group: 'Operação', description: 'Abrir e acompanhar suporte técnico.', badge: ordensServico.filter(item => item.status === 'Aberta').length },
    { id: 'qa-produtos', label: 'Produtos', tab: 'produtosPacotes', permission: 'contratos', group: 'Catálogo', description: 'Placas e inversores cadastrados.', badge: placas.filter(p => p.status === 'ativo').length + marcasInversor.filter(m => m.status === 'ativo').length },
    { id: 'qa-precos', label: 'Preço dos sistemas', tab: 'precosSistemas', permission: 'precosSistemas', group: 'Catálogo', description: 'Calculadora e tabelas de preço.' },
    { id: 'qa-financeiro', label: 'Financeiro', tab: 'financeiro', permission: 'financeiro', group: 'Gestão', description: 'Números financeiros e despesas.' },
    { id: 'qa-comunicacoes', label: 'Comunicações', tab: 'comunicacoes', permission: 'usuarios', group: 'Gestão', description: 'Mensagens, e-mail e disparos.' },
    { id: 'qa-usuarios', label: 'Acessos', tab: 'usuarios', permission: 'usuarios', group: 'Gestão', description: 'Usuários, permissões e senhas.', badge: usuarios.length },
  ].filter(action => hasPermission(action.permission));
  const quickActions = availableQuickActions.filter(action => (
    quickActionPrefs === null ? defaultQuickActionIds.includes(action.id) : quickActionPrefs.includes(action.id)
  ));
  const quickActionEditorGroups = availableQuickActions.reduce((acc, action) => {
    const group = action.group || 'Outros';
    acc[group] = acc[group] || [];
    acc[group].push(action);
    return acc;
  }, {});

  const filteredWhatsappConversations = useMemo(() => {
    const search = whatsappSearch.trim().toLowerCase();
    const byFilter = whatsappConversations.filter(item => {
      if (whatsappFilter === 'aguardando') return item.status === 'Aguardando atendimento';
      if (whatsappFilter === 'atendimento') return item.status === 'Em atendimento';
      if (whatsappFilter === 'minhas') return Number(item.assignedUserId) === Number(adminUser.id);
      if (whatsappFilter === 'finalizadas') return item.status === 'Finalizada';
      return true;
    });

    if (!search) return byFilter;
    return byFilter.filter(item => [
      item.clienteNome,
      item.clienteTelefone,
      item.assignedUserName,
      item.status,
      item.lastMessage,
    ].some(value => String(value || '').toLowerCase().includes(search)));
  }, [adminUser.id, whatsappConversations, whatsappFilter, whatsappSearch]);

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
      atendimento: (statusCounts['Novo'] || 0) + (statusCounts['Em atendimento'] || 0),
      negociacao: (statusCounts['Em negociação'] || 0) + (statusCounts['Fechando'] || 0) + (statusCounts['Proposta enviada'] || 0),
      suspensos: (statusCounts['Suspenso'] || 0) + (statusCounts['Sem retorno'] || 0),
      convertidos: statusCounts['Convertido'] || 0,
      antigos: leads.filter(l => !['Convertido', 'Perdido'].includes(l.status) && (daysSinceContact(l.ultimoContato) ?? 0) >= 7).length,
    };
  }, [leads, usuarios]);

  const filteredLeads = useMemo(() => {
    const search = leadSearch.trim().toLowerCase();
    const canSeeAllLeads = isMasterAdmin;

    return leads.filter(lead => {
      if (canSeeAllLeads && leadOwnerFilter !== 'todos' && String(lead.assignedUserId || lead.assignedUserName || '') !== String(leadOwnerFilter)) {
        return false;
      }

      if (leadTabFilter === 'atendimento') {
        if (!['Novo', 'Em atendimento'].includes(lead.status || 'Novo')) return false;
      } else if (leadTabFilter === 'negociacao') {
        if (!['Em negociação', 'Fechando', 'Proposta enviada'].includes(lead.status)) return false;
      } else if (leadTabFilter === 'suspensos') {
        if (!['Suspenso', 'Sem retorno', 'Perdido'].includes(lead.status)) return false;
      } else if (leadTabFilter === 'antigos') {
        if (['Convertido', 'Perdido'].includes(lead.status)) return false;
        const days = daysSinceContact(lead.ultimoContato);
        if (days === null || days < 7) return false;
      } else if (leadTabFilter === 'convertidos') {
        if (lead.status !== 'Convertido') return false;
      }

      if (!search) return true;
      return [lead.nome, lead.telefone, lead.email, lead.cidade, lead.assignedUserName, lead.status, lead.origem]
        .some(value => String(value || '').toLowerCase().includes(search));
    });
  }, [leadOwnerFilter, leadSearch, leadTabFilter, leads, isMasterAdmin]);

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

  const contractConsultantOptions = useMemo(() => {
    const base = usuarios
      .filter(user => user.active && user.role !== 'CLIENTE')
      .map(user => ({
        value: String(user.id),
        label: user.nome,
        nome: user.nome,
      }));
    const currentName = String(contractReviewForm.consultorNome || '').trim();
    if (currentName && !base.some(option => option.nome === currentName)) {
      base.unshift({
        value: contractReviewForm.consultorId ? String(contractReviewForm.consultorId) : '',
        label: `${currentName} (atual)`,
        nome: currentName,
      });
    }
    return [
      { value: '', label: 'Selecione o consultor', nome: '' },
      ...base,
    ];
  }, [usuarios, contractReviewForm.consultorId, contractReviewForm.consultorNome]);

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

  const CLIENTE_REQUIRED_FIELDS = ['nome', 'cpfCnpj', 'whatsapp', 'cidade', 'endereco', 'cep', 'estado'];
  const clientesAptos = useMemo(() => {
    const clienteComContrato = new Set(
      contratos.map(ct => Number(ct.dados?.cliente?.id)).filter(Boolean)
    );
    return clientes.filter(c =>
      CLIENTE_REQUIRED_FIELDS.every(f => String(c[f] || '').trim() !== '') &&
      !clienteComContrato.has(Number(c.id))
    );
  }, [clientes, contratos]);

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
    () => selectedOrcClient
      ? orcamentos
          .filter(o => String(o.clienteId) === String(selectedOrcClient.id))
          .sort((a, b) => Number(b.id || 0) - Number(a.id || 0))
      : [],
    [selectedOrcClient, orcamentos]
  );

  const quickBudgets = useMemo(
    () => orcamentos
      .filter(o => String(o.tipo || '').toLowerCase() === 'rapido' || !o.clienteId)
      .sort((a, b) => Number(b.id || 0) - Number(a.id || 0)),
    [orcamentos]
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

  const placaModelsFromEquip = useMemo(
    () => placas.filter(p => p.status === 'ativo').map(p => p.modelo),
    [placas]
  );

  const inversorBrandsFromEquip = useMemo(
    () => marcasInversor.filter(m => m.status === 'ativo').map(m => m.nome_marca),
    [marcasInversor]
  );

  const getInversorPowerValue = useCallback((model = '') => {
    const text = String(model || '').toLowerCase().replace(',', '.');
    const matches = [...text.matchAll(/(\d+(?:\.\d+)?)\s*(k(?:w|va|tl)?|kwp|w)\b/g)];
    const kwMatch = matches.find(match => match[2].startsWith('k'));
    if (kwMatch) return Number(kwMatch[1]);
    const wattMatch = matches.find(match => match[2] === 'w');
    if (wattMatch) return Number(wattMatch[1]) / 1000;
    const loose = text.match(/\b(\d+(?:\.\d+)?)\b/);
    return loose ? Number(loose[1]) : Number.POSITIVE_INFINITY;
  }, []);

  const sortInversorModels = useCallback((models = []) => (
    [...models].sort((a, b) => {
      const powerDiff = getInversorPowerValue(a) - getInversorPowerValue(b);
      if (Number.isFinite(powerDiff) && powerDiff !== 0) return powerDiff;
      return String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' });
    })
  ), [getInversorPowerValue]);

  const inversorModelsForBrand = useMemo(() => {
    if (!budgetForm.inversorMarca) return [];
    const marca = marcasInversor.find(m => m.nome_marca === budgetForm.inversorMarca);
    if (!marca) return [];
    const models = modelosInversor
      .filter(m => m.marca_id === marca.id && m.status === 'ativo')
      .map(m => m.nome_modelo);
    return sortInversorModels(models);
  }, [marcasInversor, modelosInversor, budgetForm.inversorMarca, sortInversorModels]);

  const getModelsForBrand = useCallback((brandName) => {
    if (!brandName) return [];
    const marca = marcasInversor.find(m => m.nome_marca === brandName);
    if (!marca) return [];
    return sortInversorModels(modelosInversor.filter(m => m.marca_id === marca.id && m.status === 'ativo').map(m => m.nome_modelo));
  }, [marcasInversor, modelosInversor, sortInversorModels]);

  const placasFiltradas = useMemo(() => {
    return placas
      .filter(p => {
        const matchSearch = !placaSearch || p.modelo.toLowerCase().includes(placaSearch.toLowerCase());
        const matchStatus = placaStatusFilter === 'todos' || p.status === placaStatusFilter;
        return matchSearch && matchStatus;
      })
      .sort((a, b) => a.modelo.localeCompare(b.modelo));
  }, [placas, placaSearch, placaStatusFilter]);

  const modelosForSelectedMarca = useMemo(
    () => modelosInversor.filter(m => m.marca_id === selectedMarcaId),
    [modelosInversor, selectedMarcaId]
  );

  const modelosHibridoForMarca = useMemo(
    () => modelosHibrido.filter(m => m.marca_id === selectedMarcaHibridoId),
    [modelosHibrido, selectedMarcaHibridoId]
  );

  const bateriasForModelo = useMemo(
    () => bateriasHibrido.filter(b => b.modelo_hibrido_id === selectedModeloHibridoId),
    [bateriasHibrido, selectedModeloHibridoId]
  );

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
    return equipamentos.filter(item => {
      const matchSearch = !search || [item.nome, item.tipo, item.placaModelo, item.inversorModelo, item.observacoes].some(v => String(v || '').toLowerCase().includes(search));
      const matchTipo = produtoTipoFilter === 'todos' || item.tipo === produtoTipoFilter;
      const matchStatus = produtoStatusFilter === 'todos' || (produtoStatusFilter === 'ativo' ? item.active : !item.active);
      return matchSearch && matchTipo && matchStatus;
    });
  }, [equipamentos, produtoSearch, produtoTipoFilter, produtoStatusFilter]);

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

  // ── Instalações redesign useMemos ──────────────────────────────────────────
  const INST_STATUS_FLOW_MEMO = ['Aguardando envio','Em transporte','Entrega agendada','Equipamento entregue','Materiais com pendência','Aguardando instalação','Instalação agendada','Reagendada','Em instalação','Aguardando conferência técnica','Concluída','Cancelada'];

  const instSummary = useMemo(() => ({
    total: projetos.length,
    emTransporte: projetos.filter(p => getInstStatusForNew(p) === 'Em transporte').length,
    entregue: projetos.filter(p => getInstStatusForNew(p) === 'Equipamento entregue').length,
    aguardandoAgendamento: projetos.filter(p => getInstStatusForNew(p) === 'Aguardando instalação').length,
    agendada: projetos.filter(p => getInstStatusForNew(p) === 'Instalação agendada').length,
    emInstalacao: projetos.filter(p => getInstStatusForNew(p) === 'Em instalação').length,
    reagendada: projetos.filter(p => getInstStatusForNew(p) === 'Reagendada').length,
    concluida: projetos.filter(p => getInstStatusForNew(p) === 'Concluída').length,
  }), [projetos]);

  const filteredInstalacoes = useMemo(() => {
    const term = instSearch.trim().toLowerCase();
    return projetos.filter(p => {
      const status = getInstStatusForNew(p);
      const matchesSearch = !term || [
        p.clienteNome, p.clienteTelefone, String(p.contratoId || ''), p.clienteCidade, p.responsavelNome
      ].some(v => String(v || '').toLowerCase().includes(term));
      const matchesCidade = !instCidadeFilter || (p.clienteCidade || '') === instCidadeFilter;
      const matchesInstalador = !instInstaladorFilter || String(p.responsavelId || '') === instInstaladorFilter;
      const matchesStatus = !instStatusFilter || status === instStatusFilter;
      const matchesData = !instDataFilter || (p.instalacaoAgendada || '').startsWith(instDataFilter);
      return matchesSearch && matchesCidade && matchesInstalador && matchesStatus && matchesData;
    });
  }, [projetos, instSearch, instCidadeFilter, instInstaladorFilter, instStatusFilter, instDataFilter]);

  const paginatedInstalacoes = useMemo(
    () => filteredInstalacoes.slice((instPage - 1) * INST_PER_PAGE, instPage * INST_PER_PAGE),
    [filteredInstalacoes, instPage]
  );

  const instCidades = useMemo(
    () => Array.from(new Set(projetos.map(p => p.clienteCidade || '').filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [projetos]
  );

  const instProxima = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0);
    return projetos
      .filter(p => p.instalacaoAgendada && getInstStatusForNew(p) === 'Instalação agendada')
      .sort((a,b) => new Date(a.instalacaoAgendada) - new Date(b.instalacaoAgendada))
      .find(p => new Date(p.instalacaoAgendada) >= today) || null;
  }, [projetos]);

  const instAgendaList = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    return projetos.filter(p => {
      if (!p.instalacaoAgendada) return false;
      const d = new Date(p.instalacaoAgendada); d.setHours(0,0,0,0);
      if (instAgendaTab === 'hoje') return d.getTime() === today.getTime();
      return d.getTime() === tomorrow.getTime();
    }).sort((a,b) => new Date(a.instalacaoAgendada) - new Date(b.instalacaoAgendada));
  }, [projetos, instAgendaTab]);
  // ── End Instalações redesign useMemos ──────────────────────────────────────

  // ── Esteira Sistemas FV useMemos ────────────────────────────────────────────
  const SFV_ETAPAS = ['Venda concluída', 'Documentos', 'Homologação', 'Entrega', 'Instalação', 'Ligação', 'Concluído'];
  const sfvStatusColor = { 'No prazo': '#22c55e', 'Atenção': '#f97316', 'Atrasado': '#ef4444', 'Concessionária': '#3b82f6', 'Pausado': '#94a3b8' };
  const sfvEtapaColor = { 'Venda concluída': '#f97316', 'Documentos': '#8b5cf6', 'Homologação': '#3b82f6', 'Entrega': '#f59e0b', 'Instalação': '#10b981', 'Ligação': '#06b6d4', 'Concluído': '#22c55e' };

  const filteredSistemasFv = useMemo(() => {
    let items = sistemasFv;
    if (sfvFilter === 'vendas') items = items.filter(s => s.etapaAtual === 'Venda concluída');
    else if (sfvFilter === 'homologacao') items = items.filter(s => s.etapaAtual === 'Homologação');
    else if (sfvFilter === 'entrega') items = items.filter(s => s.etapaAtual === 'Entrega');
    else if (sfvFilter === 'instalacao') items = items.filter(s => s.etapaAtual === 'Instalação');
    else if (sfvFilter === 'ligacao') items = items.filter(s => s.etapaAtual === 'Ligação');
    else if (sfvFilter === 'concluido') items = items.filter(s => s.etapaAtual === 'Concluído');
    else if (sfvFilter === 'atrasados') items = items.filter(s => ['Atrasado', 'Atenção'].includes(s.status));
    if (sfvSearch) {
      const q = sfvSearch.toLowerCase();
      items = items.filter(s => (s.clienteNome || '').toLowerCase().includes(q) || (s.cidade || '').toLowerCase().includes(q) || (s.consultorNome || '').toLowerCase().includes(q));
    }
    if (sfvConsultorFilter) items = items.filter(s => s.consultorNome === sfvConsultorFilter);
    if (sfvCidadeFilter) items = items.filter(s => s.cidade === sfvCidadeFilter);
    return items;
  }, [sistemasFv, sfvFilter, sfvSearch, sfvConsultorFilter, sfvCidadeFilter]);

  const sfvResumo = useMemo(() => {
    const porEtapa = {};
    for (const e of SFV_ETAPAS) porEtapa[e] = 0;
    let atrasados = 0;
    for (const s of sistemasFv) {
      porEtapa[s.etapaAtual] = (porEtapa[s.etapaAtual] || 0) + 1;
      if (['Atrasado', 'Atenção'].includes(s.status)) atrasados++;
    }
    return { porEtapa, atrasados };
  }, [sistemasFv]);

  const sfvConsultores = useMemo(() => [...new Set(sistemasFv.map(s => s.consultorNome).filter(Boolean))].sort(), [sistemasFv]);
  const sfvCidades = useMemo(() => [...new Set(sistemasFv.map(s => s.cidade).filter(Boolean))].sort(), [sistemasFv]);
  // ── End Esteira Sistemas FV useMemos ────────────────────────────────────────

  const osSummary = useMemo(() => {
    const overdueStatuses = new Set(['Aberta', 'Em análise', 'Aguardando triagem', 'Aguardando agendamento', 'Agendada', 'Em atendimento', 'Aguardando material', 'Retorno necessário', 'Com pendência', 'Planejada', 'Equipe a caminho']);
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      total: ordensServico.length,
      abertas: ordensServico.filter(item => item.status === 'Aberta').length,
      aguardandoAgendamento: ordensServico.filter(item => item.status === 'Aguardando agendamento').length,
      agendadas: ordensServico.filter(item => ['Agendada', 'Aguardando agendamento'].includes(item.status)).length,
      andamento: ordensServico.filter(item => ['Equipe a caminho', 'Em atendimento'].includes(item.status)).length,
      aguardandoMaterial: ordensServico.filter(item => item.status === 'Aguardando material').length,
      concluidas: ordensServico.filter(item => ['Serviço concluído', 'Validada pelo cliente', 'Encerrada', 'Concluída'].includes(item.status)).length,
      canceladas: ordensServico.filter(item => item.status === 'Cancelada').length,
      triagem: ordensServico.filter(o => ['Aguardando triagem', 'Aberta'].includes(o.status)).length,
      planejada: ordensServico.filter(o => ['Planejada', 'Em análise'].includes(o.status)).length,
      comPendencia: ordensServico.filter(o => ['Com pendência', 'Aguardando material', 'Retorno necessário'].includes(o.status)).length,
      concluidasNoMes: ordensServico.filter(o => {
        if (!['Concluída', 'Serviço concluído', 'Validada pelo cliente', 'Encerrada'].includes(o.status)) return false;
        const d = new Date(o.dataAbertura);
        return d >= firstOfMonth && d <= now;
      }).length,
      atrasadas: ordensServico.filter((item) => {
        const dados = createDefaultOsDados(item);
        const limite = dados.atendimento?.prazoMaximo || dados.atendimento?.dataDesejada;
        if (!limite || !overdueStatuses.has(item.status)) return false;
        return new Date(limite).setHours(0, 0, 0, 0) < new Date().setHours(0, 0, 0, 0);
      }).length,
    };
  }, [ordensServico]);

  const filteredOrdensServico = useMemo(() => {
    const overdueStatuses = new Set(['Aberta', 'Em análise', 'Aguardando agendamento', 'Agendada', 'Em atendimento', 'Aguardando material', 'Retorno necessário']);
    return ordensServico.filter((os) => {
      const dados = createDefaultOsDados(os);
      const normalizedSearch = osSearch.trim().toLowerCase();
      const matchesStatus = osStatusFilter === 'todos' || os.status === osStatusFilter;
      const matchesPriority = osPriorityFilter === 'todas' || os.prioridade === osPriorityFilter;
      const matchesResponsavel = osResponsavelFilter === 'todos' || String(os.responsavelId || '') === osResponsavelFilter;
      const cidade = String(dados.cliente?.cidade || '').trim();
      const matchesCidade = osCidadeFilter === 'todas' || cidade === osCidadeFilter;
      const matchesTipo = osTipoFilter === 'todos' || (dados.motivo || os.categoria) === osTipoFilter;
      const matchesDataFrom = !osDataFrom || (os.dataAbertura || '') >= osDataFrom;
      const matchesDataTo = !osDataTo || (os.dataAbertura || '') <= osDataTo;
      const matchesSistema = !osSistemaFilter.trim() || String(dados.cliente?.sistema || '').toLowerCase().includes(osSistemaFilter.trim().toLowerCase());
      const matchesContrato = !osContratoFilter.trim() || String(dados.cliente?.contratoNumero || os.contratoId || '').toLowerCase().includes(osContratoFilter.trim().toLowerCase());
      const matchesAtrasadas = !osAtrasadasOnly || (() => {
        const limite = dados.atendimento?.prazoMaximo || dados.atendimento?.dataDesejada;
        if (!limite || !overdueStatuses.has(os.status)) return false;
        return new Date(limite).setHours(0, 0, 0, 0) < new Date().setHours(0, 0, 0, 0);
      })();
      const haystack = [
        os.numeroOs,
        os.clienteNome,
        os.clienteTelefone,
        os.problema,
        os.categoria,
        os.responsavelNome,
        dados.cliente?.cidade,
        dados.motivo,
      ].join(' ').toLowerCase();
      const matchesSearch = !normalizedSearch || haystack.includes(normalizedSearch);
      return matchesStatus && matchesPriority && matchesResponsavel && matchesCidade && matchesTipo && matchesDataFrom && matchesDataTo && matchesSistema && matchesContrato && matchesAtrasadas && matchesSearch;
    });
  }, [ordensServico, osCidadeFilter, osPriorityFilter, osResponsavelFilter, osSearch, osStatusFilter, osTipoFilter, osDataFrom, osDataTo, osSistemaFilter, osContratoFilter, osAtrasadasOnly]);

  const paginatedOrdensServico = useMemo(
    () => filteredOrdensServico.slice((osPage - 1) * 10, osPage * 10),
    [filteredOrdensServico, osPage]
  );

  const selectedOs = useMemo(
    () => ordensServico.find((item) => item.id === selectedOsId) || filteredOrdensServico[0] || ordensServico[0] || null,
    [filteredOrdensServico, ordensServico, selectedOsId]
  );

  const selectedOsDados = useMemo(() => createDefaultOsDados(selectedOs), [selectedOs]);

  const osCities = useMemo(() => (
    Array.from(new Set(ordensServico.map((item) => String(createDefaultOsDados(item).cliente?.cidade || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  ), [ordensServico]);

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
      if (data.mustChangePassword) {
        const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
        localStorage.setItem('user', JSON.stringify({ ...currentUser, mustChangePassword: true }));
        navigate('/alterar-senha');
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
    const calls = [
      request('/api/admin/quick-actions').then(data => {
        setQuickActionPrefs(Array.isArray(data.quickActions) ? data.quickActions : null);
        setQuickActionDraft(Array.isArray(data.quickActions) ? data.quickActions : defaultQuickActionIds);
      }).catch(() => {}),
    ];

    if (user.role === 'ADM' || user.permissions?.clientes) {
      calls.push(request('/api/admin/clientes').then(setClientes));
    }
    if (user.role === 'ADM' || user.permissions?.dashboard) {
      calls.push(request('/api/admin/resumo').then(setResumo));
    }
    if (user.role === 'ADM' || user.permissions?.leads) {
      calls.push(request('/api/admin/leads').then(setLeads));
      calls.push(request('/api/admin/lead-owners').then(setLeadOwners));
    }
    if (user.role === 'ADM' || user.permissions?.whatsapp) {
      calls.push(request('/api/admin/whatsapp/status').then(setWhatsappStatus));
      calls.push(request('/api/admin/whatsapp/conversations').then(setWhatsappConversations));
    }
    if (user.role === 'ADM' || user.permissions?.orcamentos) {
      calls.push(request('/api/admin/orcamentos').then(setOrcamentos));
    }
    if (user.role === 'ADM' || user.permissions?.contratos) {
      calls.push(request('/api/admin/contratos').then(setContratos));
      calls.push(request('/api/admin/procuracoes').then(setProcuracoes));
      calls.push(request('/api/admin/equipamentos').then(setEquipamentos));
      calls.push(request('/api/admin/placas').then(setPlacas));
      calls.push(request('/api/admin/marcas-inversor').then(setMarcasInversor));
      calls.push(request('/api/admin/modelos-inversor').then(setModelosInversor));
      calls.push(request('/api/admin/marcas-inversor-hibrido').then(setMarcasHibrido));
      calls.push(request('/api/admin/modelos-inversor-hibrido').then(setModelosHibrido));
      calls.push(request('/api/admin/baterias-litio').then(setBateriasHibrido));
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
      calls.push(request('/api/admin/sistemas-fv').then(setSistemasFv).catch(() => {}));
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

  // Reset pagination whenever a filter changes so the result cannot land on an empty page.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setLeadsPage(1); }, [leadSearch, leadTabFilter, leadOwnerFilter]);
  useEffect(() => {
    if (!openLeadMenu) return;
    const close = () => setOpenLeadMenu(null);
    document.addEventListener('click', close, true);
    return () => document.removeEventListener('click', close, true);
  }, [openLeadMenu]);
  useEffect(() => {
    if (!waChatActionsOpen) return;
    const closeOnOutsidePointer = (event) => {
      if (event.target instanceof Element && event.target.closest('.wa-more-wrap')) return;
      setWaChatActionsOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer, true);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer, true);
  }, [waChatActionsOpen]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setOrcClientPage(1); }, [orcClientSearch]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
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
    if (!whatsappConnectOpen || typeof document === 'undefined') return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [whatsappConnectOpen]);

  useEffect(() => {
    if (!whatsappConnectOpen || !hasPermission('whatsapp')) return undefined;
    let cancelled = false;
    const refreshStatus = () => {
      request('/api/admin/whatsapp/status')
        .then((status) => {
          if (!cancelled) setWhatsappStatus(status);
        })
        .catch(() => {});
    };
    refreshStatus();
    const timer = setInterval(refreshStatus, whatsappStatus?.connected ? 3000 : (whatsappStatus?.qr ? 1200 : 800));
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [hasPermission, request, whatsappConnectOpen, whatsappStatus?.connected, whatsappStatus?.qr]);

  useEffect(() => {
    if (!selectedWhatsappConversation) return;
    whatsappMessagesEndRef.current?.scrollIntoView({ block: 'end' });
  }, [selectedWhatsappConversation, whatsappMessages.length]);

  useEffect(() => () => {
    clearInterval(whatsappRecordingTimerRef.current);
    whatsappRecordingStreamRef.current?.getTracks().forEach(track => track.stop());
  }, []);

  useEffect(() => {
    const loggedInUser = JSON.parse(localStorage.getItem('user'));
    const token = localStorage.getItem('token');

    if (!loggedInUser || !token) {
      navigate('/sistema-drm');
      return;
    }

    if (isLocalRuntime && (loggedInUser.mustChangePassword || loggedInUser.requiresEmailVerification)) {
      localStorage.setItem('user', JSON.stringify({ ...loggedInUser, mustChangePassword: false, requiresEmailVerification: false }));
    } else if (loggedInUser.mustChangePassword) {
      navigate('/alterar-senha');
      return;
    } else if (loggedInUser.requiresEmailVerification) {
      navigate('/verificar-email');
      return;
    }

    if (loggedInUser.needsWhatsappSetup) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWhatsappSetupNumber(loggedInUser.whatsapp || '');
      setWhatsappSetupOpen(true);
    }

    loadData(loggedInUser).catch(err => {
      setError(err.message);
      showToast(err.message, 'error');
    });

    const handleNewOrcamento = (novoOrcamento) => {
      const canSee = (loggedInUser.role === 'ADM' && String(loggedInUser.username || '').toLowerCase() === 'deivson') || novoOrcamento.assignedUserId === loggedInUser.id;
      if (canSee) setOrcamentos(prev => [novoOrcamento, ...prev]);
    };

    const handleOrcamentoExcluido = ({ id } = {}) => {
      if (!id) return;
      setOrcamentos(prev => prev.filter(orcamento => Number(orcamento.id) !== Number(id)));
      setSelectedOrcamento(prev => (Number(prev?.id) === Number(id) ? null : prev));
    };

    const handleNewLead = (novoLead) => {
      const canSee = (loggedInUser.role === 'ADM' && String(loggedInUser.username || '').toLowerCase() === 'deivson')
        || Number(novoLead.assignedUserId) === Number(loggedInUser.id);
      setLeads(prev => (
        canSee
          ? [novoLead, ...prev.filter(lead => lead.id !== novoLead.id)]
          : prev.filter(lead => lead.id !== novoLead.id)
      ));
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
      setSelectedOsId(prev => prev || os.id);
    };

    const handleWhatsappConversation = (conversation) => {
      // Conversa arquivada (não é lead) some da lista para todos em tempo real.
      if (conversation.status === 'Arquivada') {
        setWhatsappConversations(prev => prev.filter(item => item.id !== conversation.id));
        setSelectedWhatsappConversation(prev => prev?.id === conversation.id ? null : prev);
        setWhatsappMobileChatOpen(prev => selectedWhatsappConversation?.id === conversation.id ? false : prev);
        return;
      }
      const canSee = (loggedInUser.role === 'ADM' && String(loggedInUser.username || '').toLowerCase() === 'deivson')
        || Number(conversation.assignedUserId) === Number(loggedInUser.id);
      if (!canSee) {
        setWhatsappConversations(prev => prev.filter(item => item.id !== conversation.id));
        setSelectedWhatsappConversation(prev => prev?.id === conversation.id ? null : prev);
        setWhatsappMobileChatOpen(prev => selectedWhatsappConversation?.id === conversation.id ? false : prev);
        return;
      }
      setWhatsappConversations(prev => {
        const exists = prev.some(item => item.id === conversation.id);
        const next = exists ? prev.map(item => item.id === conversation.id ? conversation : item) : [conversation, ...prev];
        return next.sort((a, b) => String(b.lastMessageAt || b.updatedAt || '').localeCompare(String(a.lastMessageAt || a.updatedAt || '')));
      });
      setSelectedWhatsappConversation(prev => prev?.id === conversation.id ? conversation : prev);
    };

    const handleWhatsappMessage = ({ message, conversation }) => {
      handleWhatsappConversation(conversation);
      setWhatsappMessages(prev => (
        selectedWhatsappConversation?.id === message.conversationId && !prev.some(item => item.id === message.id)
          ? [...prev, message]
          : prev
      ));
    };

    const handleWhatsappMessageStatus = ({ message, conversation }) => {
      handleWhatsappConversation(conversation);
      setWhatsappMessages(prev => prev.map(item => item.id === message.id ? message : item));
    };

    const handleWhatsappRuntimeStatus = (status) => {
      setWhatsappStatus(prev => ({ ...(prev || {}), ...status }));
    };

    const handleWhatsappNewLeadWaiting = ({ conversation } = {}) => {
      if (conversation) handleWhatsappConversation(conversation);
      playNewLeadAlert();
      showToast(`Lead novo aguardando atendimento: ${conversation?.clienteNome || conversation?.clienteTelefone || 'WhatsApp'}`, 'warning');
    };

    const handleSocketConnect = () => {
      loadData(loggedInUser).catch(() => {});
    };

    const handleSocketReconnect = () => {
      loadData(loggedInUser).catch(() => {});
    };

    socket.on('novo_orcamento', handleNewOrcamento);
    socket.on('orcamento_excluido', handleOrcamentoExcluido);
    socket.on('novo_lead', handleNewLead);
    socket.on('contrato_atualizado', handleContratoAtualizado);
    socket.on('projeto_atualizado', handleProjetoAtualizado);
    socket.on('projeto_foto_criada', handleProjetoFotoCriada);
    socket.on('os_atualizada', handleOsAtualizada);
    socket.on('whatsapp_conversation_updated', handleWhatsappConversation);
    socket.on('whatsapp_conversation_archived', ({ id, ids } = {}) => {
      const archivedIds = Array.isArray(ids) && ids.length ? ids : [id].filter(Boolean);
      if (archivedIds.length === 0) return;
      setWhatsappConversations(prev => prev.filter(item => !archivedIds.includes(item.id)));
      setSelectedWhatsappConversation(prev => archivedIds.includes(prev?.id) ? null : prev);
      setWhatsappMobileChatOpen(prev => archivedIds.includes(selectedWhatsappConversation?.id) ? false : prev);
    });
    socket.on('whatsapp_message_created', handleWhatsappMessage);
    socket.on('whatsapp_message_status_updated', handleWhatsappMessageStatus);
    socket.on('whatsapp_runtime_status', handleWhatsappRuntimeStatus);
    socket.on('whatsapp_new_lead_waiting', handleWhatsappNewLeadWaiting);
    socket.on('connect', handleSocketConnect);
    socket.io.on('reconnect', handleSocketReconnect);

    return () => {
      socket.off('novo_orcamento', handleNewOrcamento);
      socket.off('orcamento_excluido', handleOrcamentoExcluido);
      socket.off('novo_lead', handleNewLead);
      socket.off('contrato_atualizado', handleContratoAtualizado);
      socket.off('projeto_atualizado', handleProjetoAtualizado);
      socket.off('projeto_foto_criada', handleProjetoFotoCriada);
      socket.off('os_atualizada', handleOsAtualizada);
      socket.off('whatsapp_conversation_updated', handleWhatsappConversation);
      socket.off('whatsapp_conversation_archived');
      socket.off('whatsapp_message_created', handleWhatsappMessage);
      socket.off('whatsapp_message_status_updated', handleWhatsappMessageStatus);
      socket.off('whatsapp_runtime_status', handleWhatsappRuntimeStatus);
      socket.off('whatsapp_new_lead_waiting', handleWhatsappNewLeadWaiting);
      socket.off('connect', handleSocketConnect);
      socket.io.off('reconnect', handleSocketReconnect);
    };
  }, [loadData, navigate, playNewLeadAlert, selectedWhatsappConversation?.id, showToast]);

  const handleSair = () => {
    localStorage.removeItem('role');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/');
  };

  const openWhatsappConversation = async (conversation) => {
    setSelectedWhatsappConversation(conversation);
    setWhatsappMobileChatOpen(true);
    setWhatsappLoading(true);
    try {
      const messages = await request(`/api/admin/whatsapp/conversations/${conversation.id}/messages`);
      setWhatsappMessages(messages);
      setWhatsappConversations(prev => prev.map(item => item.id === conversation.id ? { ...item, unreadCount: 0 } : item));
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setWhatsappLoading(false);
    }
  };

  const openLeadInWhatsapp = async (lead) => {
    const phone = String(lead.telefone || '').replace(/\D/g, '');
    if (!phone) {
      showToast('Este lead não possui um WhatsApp válido cadastrado.', 'error');
      return;
    }
    const canUseInternal = adminUser.role === 'ADM' || adminUser.permissions?.whatsapp;
    if (!canUseInternal) {
      window.open(getPanelWhatsAppUrl(phone, whatsappLeadMessage(lead)), '_blank');
      return;
    }
    const existing = whatsappConversations.find(c => {
      const cp = String(c.clienteTelefone || '').replace(/\D/g, '');
      return cp === phone || cp === phone.replace(/^55/, '') || ('55' + cp) === phone;
    });
    if (existing) {
      navigatePanel({ activeTab: 'whatsapp' });
      await openWhatsappConversation(existing);
    } else {
      setWhatsappSearch(lead.telefone || '');
      setWhatsappFilter('todas');
      navigatePanel({ activeTab: 'whatsapp', whatsappFilter: 'todas' });
      showToast(`Nenhuma conversa encontrada para ${lead.nome}. Aguarde o lead entrar em contato ou inicie pelo WhatsApp.`, 'info');
    }
  };

  const claimWhatsappConversation = async (conversation = selectedWhatsappConversation) => {
    if (!conversation) return;
    setWhatsappLoading(true);
    try {
      const updated = await request(`/api/admin/whatsapp/conversations/${conversation.id}/claim`, { method: 'POST' });
      setSelectedWhatsappConversation(updated);
      setWhatsappConversations(prev => prev.map(item => item.id === updated.id ? updated : item));
      const messages = await request(`/api/admin/whatsapp/conversations/${updated.id}/messages`);
      setWhatsappMessages(messages);
      showToast(`Atendimento iniciado com ${updated.clienteNome || updated.clienteTelefone}.`, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setWhatsappLoading(false);
    }
  };

  const closeWhatsappConversation = async () => {
    if (!selectedWhatsappConversation) return;
    setWhatsappLoading(true);
    try {
      const updated = await request(`/api/admin/whatsapp/conversations/${selectedWhatsappConversation.id}/close`, { method: 'POST' });
      setSelectedWhatsappConversation(updated);
      setWhatsappConversations(prev => prev.map(item => item.id === updated.id ? updated : item));
      showToast('Atendimento finalizado.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setWhatsappLoading(false);
    }
  };

  const transferWhatsappConversation = async (event) => {
    event.preventDefault();
    if (!selectedWhatsappConversation || !whatsappTransferUserId) return;
    setWhatsappLoading(true);
    try {
      const data = await request(`/api/admin/whatsapp/conversations/${selectedWhatsappConversation.id}/transfer`, {
        method: 'POST',
        body: JSON.stringify({ assignedUserId: whatsappTransferUserId }),
      });
      const updated = data.conversation;
      setSelectedWhatsappConversation(updated);
      setWhatsappConversations(prev => prev.map(item => item.id === updated.id ? updated : item));
      setWhatsappTransferOpen(false);
      setWhatsappTransferUserId('');
      setWaChatActionsOpen(false);
      showToast(
        data.notification?.sent
          ? `Lead transferido para ${updated.assignedUserName}. O consultor foi avisado no WhatsApp.`
          : `Lead transferido para ${updated.assignedUserName}, mas o aviso privado não pôde ser enviado.`,
        data.notification?.sent ? 'success' : 'warning'
      );
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setWhatsappLoading(false);
    }
  };

  const archiveWhatsappConversation = async () => {
    if (!selectedWhatsappConversation) return;
    if (!window.confirm('Marcar esta conversa como "Não é lead"? Ela será removida da lista de atendimento para todos.')) return;
    const archivedId = selectedWhatsappConversation.id;
    const archivedConversation = selectedWhatsappConversation;
    setWhatsappLoading(true);
    setWhatsappConversations(prev => prev.filter(item => item.id !== archivedId));
    setSelectedWhatsappConversation(null);
    setWhatsappMessages([]);
    setWhatsappMobileChatOpen(false);
    setWaChatActionsOpen(false);
    try {
      const archived = await request(`/api/admin/whatsapp/conversations/${archivedId}/archive`, { method: 'POST' });
      const archivedIds = Array.isArray(archived?.archivedIds) && archived.archivedIds.length ? archived.archivedIds : [archivedId];
      const conversations = await request('/api/admin/whatsapp/conversations');
      setWhatsappConversations(conversations.filter(item => !archivedIds.includes(item.id)));
      showToast('Conversa arquivada (não é lead).', 'success');
    } catch (err) {
      setWhatsappConversations(prev => (
        prev.some(item => item.id === archivedId) ? prev : [archivedConversation, ...prev]
      ));
      setSelectedWhatsappConversation(archivedConversation);
      showToast(err.message, 'error');
    } finally {
      setWhatsappLoading(false);
    }
  };

  const openWhatsappConnectModal = async () => {
    setWhatsappConnectOpen(true);
    setWhatsappConnectLoading(true);
    try {
      const status = await request('/api/admin/whatsapp/connect', {
        method: 'POST',
        body: JSON.stringify({ force: false }),
      });
      setWhatsappStatus(status);
      if (status?.connected) {
        showToast(
          `Já existe um número conectado${status.phone ? ` (${status.phone})` : ''}. Use o botão "Desconectar número atual" para iniciar a troca.`,
          'info'
        );
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setWhatsappConnectLoading(false);
    }
  };

  const submitWhatsappSetup = async (event) => {
    event?.preventDefault?.();
    setWhatsappSetupError('');
    const digits = String(whatsappSetupNumber || '').replace(/\D/g, '');
    if (digits.length < 10) {
      setWhatsappSetupError('Informe o número com DDD. Ex: 99 99999-9999');
      return;
    }
    setWhatsappSetupLoading(true);
    try {
      const { user } = await request('/api/me/whatsapp', {
        method: 'PUT',
        body: JSON.stringify({ whatsapp: whatsappSetupNumber }),
      });
      const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
      localStorage.setItem('user', JSON.stringify({ ...currentUser, ...user }));
      setWhatsappSetupOpen(false);
      showToast('Número de WhatsApp confirmado!', 'success');
    } catch (err) {
      setWhatsappSetupError(err.message || 'Não foi possível salvar o número.');
    } finally {
      setWhatsappSetupLoading(false);
    }
  };

  const refreshWhatsappQr = async () => {
    if (whatsappStatus?.connected) {
      showToast(
        `O número${whatsappStatus.phone ? ` ${whatsappStatus.phone}` : ''} já está conectado. Use "Desconectar número atual" antes de conectar outro.`,
        'warning'
      );
      return;
    }
    setWhatsappConnectLoading(true);
    try {
      const status = await request('/api/admin/whatsapp/connect', {
        method: 'POST',
        body: JSON.stringify({ force: true }),
      });
      setWhatsappStatus(status);
      showToast('Novo QR Code gerado.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setWhatsappConnectLoading(false);
    }
  };

  const disconnectWhatsapp = async () => {
    setWhatsappConnectLoading(true);
    try {
      const status = await request('/api/admin/whatsapp/disconnect', { method: 'POST' });
      setWhatsappStatus(status);
      showToast('WhatsApp desconectado.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setWhatsappConnectLoading(false);
    }
  };

  const sendWhatsappReply = async (event) => {
    event.preventDefault();
    if (!selectedWhatsappConversation || !whatsappReply.trim()) return;
    const text = whatsappReply.trim();
    setWhatsappReply('');
    setWhatsappLoading(true);
    try {
      const data = await request(`/api/admin/whatsapp/conversations/${selectedWhatsappConversation.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ text }),
      });
      setWhatsappMessages(prev => [...prev.filter(item => item.id !== data.message.id), data.message]);
      setSelectedWhatsappConversation(data.conversation);
      setWhatsappConversations(prev => {
        const exists = prev.some(item => item.id === data.conversation.id);
        return exists ? prev.map(item => item.id === data.conversation.id ? data.conversation : item) : [data.conversation, ...prev];
      });
      if (data.provider?.configured === false) {
        showToast('Mensagem salva. Conecte o WhatsApp por QR Code para envio real.', 'warning');
      }
    } catch (err) {
      setWhatsappReply(text);
      showToast(err.message, 'error');
    } finally {
      setWhatsappLoading(false);
    }
  };

  const clearWhatsappRecording = () => {
    if (whatsappRecordedAudio?.url) URL.revokeObjectURL(whatsappRecordedAudio.url);
    setWhatsappRecordedAudio(null);
    setWhatsappRecordingSeconds(0);
  };

  const stopWhatsappRecording = () => {
    whatsappMediaRecorderRef.current?.stop();
    setWhatsappRecording(false);
    clearInterval(whatsappRecordingTimerRef.current);
    whatsappRecordingTimerRef.current = null;
    whatsappRecordingStreamRef.current?.getTracks().forEach(track => track.stop());
    whatsappRecordingStreamRef.current = null;
  };

  const startWhatsappRecording = async () => {
    if (!canReplyWhatsapp || whatsappLoading) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      showToast('Este navegador não permite gravar áudio.', 'error');
      return;
    }
    try {
      clearWhatsappRecording();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredType = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm']
        .find(type => MediaRecorder.isTypeSupported(type));
      const recorder = preferredType ? new MediaRecorder(stream, { mimeType: preferredType }) : new MediaRecorder(stream);
      const chunks = [];
      recorder.ondataavailable = event => {
        if (event.data?.size) chunks.push(event.data);
      };
      recorder.onstop = () => {
        if (!chunks.length) return;
        const blob = new Blob(chunks, { type: recorder.mimeType || preferredType || 'audio/webm' });
        setWhatsappRecordedAudio({ blob, url: URL.createObjectURL(blob), mimeType: blob.type || 'audio/webm' });
      };
      whatsappMediaRecorderRef.current = recorder;
      whatsappRecordingStreamRef.current = stream;
      recorder.start(250);
      setWhatsappRecording(true);
      setWhatsappRecordingSeconds(0);
      whatsappRecordingTimerRef.current = setInterval(() => {
        setWhatsappRecordingSeconds(seconds => {
          if (seconds >= 119) {
            setTimeout(stopWhatsappRecording, 0);
            return 120;
          }
          return seconds + 1;
        });
      }, 1000);
    } catch (err) {
      showToast(err.name === 'NotAllowedError' ? 'Permita o acesso ao microfone para gravar áudio.' : 'Não foi possível iniciar a gravação.', 'error');
    }
  };

  const sendWhatsappAudio = async () => {
    if (!selectedWhatsappConversation || !whatsappRecordedAudio?.blob) return;
    setWhatsappLoading(true);
    try {
      const audioBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
        reader.onerror = reject;
        reader.readAsDataURL(whatsappRecordedAudio.blob);
      });
      const data = await request(`/api/admin/whatsapp/conversations/${selectedWhatsappConversation.id}/audio`, {
        method: 'POST',
        body: JSON.stringify({ audioBase64, mimeType: whatsappRecordedAudio.mimeType }),
      });
      setWhatsappMessages(prev => [...prev.filter(item => item.id !== data.message.id), data.message]);
      setSelectedWhatsappConversation(data.conversation);
      setWhatsappConversations(prev => prev.map(item => item.id === data.conversation.id ? data.conversation : item));
      clearWhatsappRecording();
      showToast('Áudio enviado pelo WhatsApp.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setWhatsappLoading(false);
    }
  };

  const handleWhatsappReplyKeyDown = (event) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    if (whatsappLoading || !whatsappReply.trim() || !canReplyWhatsapp) return;
    sendWhatsappReply(event);
  };

  const updateLeadStatus = async (leadId, status) => {
    await request(`/api/admin/leads/${leadId}`, {
      method: 'PUT',
      body: JSON.stringify({ status, ultimoContato: new Date().toISOString().split('T')[0] }),
    });
    setLeads(prev => prev.map(lead => lead.id === leadId ? { ...lead, status } : lead));
  };

  const assignLeadOwner = async (leadId, assignedUserId) => {
    if (!assignedUserId) return;
    try {
      const updatedLead = await request(`/api/admin/leads/${leadId}/responsavel`, {
        method: 'PUT',
        body: JSON.stringify({ assignedUserId }),
      });
      setLeads(prev => prev.map(lead => lead.id === leadId ? updatedLead : lead));
      request('/api/admin/whatsapp/conversations').then(setWhatsappConversations).catch(() => {});
      showToast(`Lead #${updatedLead.id} designado para ${updatedLead.assignedUserName}.`, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
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
      setLeadTabFilter('todos');
      request('/api/admin/resumo').then(setResumo).catch(() => {});
      showToast(
        lead.assignedUserName
          ? `Lead manual #${lead.id} cadastrado para ${lead.assignedUserName}.`
          : `Lead manual #${lead.id} cadastrado com sucesso.`,
        'success'
      );
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const registrarAtividade = async (event) => {
    event.preventDefault();
    if (!activityForm.leadId) return;
    try {
      await request(`/api/admin/leads/${activityForm.leadId}/atividades`, {
        method: 'POST',
        body: JSON.stringify(activityForm),
      });
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

  const buildInstallationStagePayload = (projeto, stage) => {
    const now = new Date();
    const iso = now.toISOString();
    const dateOnly = iso.slice(0, 10);
    const checklist = { ...(projeto.checklist || {}) };

    if (stage === 'Equipamento enviado') {
      return {
        equipamentoEnviadoAt: projeto.equipamentoEnviadoAt || iso,
        checklist,
      };
    }

    if (stage === 'Equipamento entregue') {
      return {
        equipamentoEnviadoAt: projeto.equipamentoEnviadoAt || iso,
        equipamentoEntregueAt: projeto.equipamentoEntregueAt || iso,
        checklist: { ...checklist, equipamentoEntregue: true },
      };
    }

    if (stage === 'Instalação agendada') {
      return {
        equipamentoEnviadoAt: projeto.equipamentoEnviadoAt || iso,
        equipamentoEntregueAt: projeto.equipamentoEntregueAt || iso,
        instalacaoAgendada: projeto.instalacaoAgendada || iso.slice(0, 16),
        checklist: { ...checklist, equipamentoEntregue: true },
      };
    }

    if (stage === 'Instalação concluída') {
      return {
        equipamentoEnviadoAt: projeto.equipamentoEnviadoAt || iso,
        equipamentoEntregueAt: projeto.equipamentoEntregueAt || iso,
        instalacaoAgendada: projeto.instalacaoAgendada || iso.slice(0, 16),
        instalacaoConcluidaAt: projeto.instalacaoConcluidaAt || iso,
        checklist: { ...checklist, equipamentoEntregue: true, instalacao: true, vistoriaFinal: true },
      };
    }

    if (stage === 'Pedido de ligação realizado') {
      return {
        equipamentoEnviadoAt: projeto.equipamentoEnviadoAt || iso,
        equipamentoEntregueAt: projeto.equipamentoEntregueAt || iso,
        instalacaoAgendada: projeto.instalacaoAgendada || iso.slice(0, 16),
        instalacaoConcluidaAt: projeto.instalacaoConcluidaAt || iso,
        pedidoLigacaoAt: projeto.pedidoLigacaoAt || dateOnly,
        checklist: { ...checklist, equipamentoEntregue: true, instalacao: true, vistoriaFinal: true, homologacao: true },
      };
    }

    if (stage === 'Ligação realizada pela concessionária') {
      return {
        equipamentoEnviadoAt: projeto.equipamentoEnviadoAt || iso,
        equipamentoEntregueAt: projeto.equipamentoEntregueAt || iso,
        instalacaoAgendada: projeto.instalacaoAgendada || iso.slice(0, 16),
        instalacaoConcluidaAt: projeto.instalacaoConcluidaAt || iso,
        pedidoLigacaoAt: projeto.pedidoLigacaoAt || dateOnly,
        medidorTrocadoAt: projeto.medidorTrocadoAt || dateOnly,
        checklist: { ...checklist, equipamentoEntregue: true, instalacao: true, vistoriaFinal: true, homologacao: true, sistemaLigado: true, medidorTrocado: true },
      };
    }

    return {};
  };

  const updateProjetoInstalacao = async (projeto, stage) => {
    if (!projeto || !stage) return;
    await updateProjeto(projeto.id, buildInstallationStagePayload(projeto, stage));
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
      const payload = {
        clienteNome: osForm.clienteNome,
        clienteTelefone: osForm.clienteTelefone,
        contratoId: osForm.contratoId,
        origem: osForm.origem,
        problema: osForm.descricaoProblema || osForm.problema,
        categoria: osForm.motivo || osForm.categoria,
        prioridade: osForm.prioridade,
        responsavelId: osForm.responsavelId,
        observacoes: osForm.observacoes || osForm.observacoesInternas,
        dados: {
          cliente: {
            cpfCnpj: osForm.cpfCnpj,
            endereco: osForm.endereco,
            cidade: osForm.cidade,
            contratoNumero: osForm.contratoId,
            sistema: osForm.sistemaResumo,
            dataInstalacao: osForm.dataInstalacao,
            consultor: osForm.consultor,
          },
          motivo: osForm.motivo,
          descricaoProblema: osForm.descricaoProblema || osForm.problema,
          atendimento: {
            prioridade: osForm.prioridade,
            dataDesejada: osForm.dataDesejada,
            prazoMaximo: osForm.prazoMaximo,
            tecnicoEquipe: osForm.tecnicoEquipe,
            materiaisPrevios: osForm.materiaisPrevios,
            contatoLocal: osForm.contatoLocal,
            observacoesInternas: osForm.observacoesInternas || osForm.observacoes,
          },
        },
      };
      const os = await request('/api/admin/ordens-servico', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setOrdensServico(prev => [os, ...prev]);
      setSelectedOsId(os.id);
      setOsForm(createEmptyOsForm());
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
    setSelectedOsId(os.id);
    return os;
  };

  const updateSelectedOsDados = async (nextDados, extraPayload = {}) => {
    if (!selectedOs) return null;
    return updateOrdemServico(selectedOs.id, {
      ...extraPayload,
      dados: nextDados,
      prioridade: nextDados.atendimento?.prioridade || selectedOs.prioridade,
      categoria: nextDados.motivo || selectedOs.categoria,
      observacoes: nextDados.atendimento?.observacoesInternas || selectedOs.observacoes,
      solucao: nextDados.relatorio?.resultado || selectedOs.solucao,
    });
  };

  const updateSelectedOsField = async (section, field, value, extraPayload = {}) => {
    if (!selectedOs) return;
    const nextDados = createDefaultOsDados(selectedOs);
    if (field === null && typeof value === 'object') {
      nextDados[section] = { ...(nextDados[section] || {}), ...value };
    } else if (section) {
      nextDados[section] = { ...(nextDados[section] || {}), [field]: value };
    }
    await updateSelectedOsDados(nextDados, extraPayload);
  };

  const uploadOsEvidencias = async (osId, files, tipo = osEvidenceUploadType) => {
    const selectedFiles = Array.from(files || []).slice(0, 8);
    if (!selectedFiles.length) return;
    try {
      let updated = null;
      for (const file of selectedFiles) {
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        updated = await request(`/api/admin/ordens-servico/${osId}/evidencias`, {
          method: 'POST',
          body: JSON.stringify({
            dataUrl,
            descricao: file.name,
            tipo,
            mimeType: file.type,
          }),
        });
      }
      if (updated) {
        setOrdensServico(prev => prev.map(item => item.id === updated.id ? updated : item));
        setSelectedOsId(updated.id);
      }
      showToast('Evidência adicionada com sucesso.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const removeOsEvidencia = async (osId, evidenciaId) => {
    try {
      const updated = await request(`/api/admin/ordens-servico/${osId}/evidencias/${evidenciaId}`, { method: 'DELETE' });
      setOrdensServico(prev => prev.map(item => item.id === updated.id ? updated : item));
      setSelectedOsId(updated.id);
      showToast('Evidência removida.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const openOsEvidencePreview = (evidencia) => {
    if (!evidencia?.dataUrl) {
      showToast('Esta evidência não possui arquivo disponível.', 'error');
      return;
    }
    openProjetoDocumento({
      dataUrl: evidencia.dataUrl,
      arquivo: evidencia.descricao || evidencia.tipo || 'Evidência',
      nome: evidencia.descricao || evidencia.tipo || 'Evidência',
    });
  };

  const printOsReport = () => {
    if (!selectedOs) return;
    const details = createDefaultOsDados(selectedOs);
    const reportWindow = window.open('', '_blank', 'width=980,height=760');
    if (!reportWindow) {
      showToast('Libere pop-up para visualizar o relatório.', 'warning');
      return;
    }
    const html = `
      <html lang="pt-BR">
        <head>
          <title>Relatório ${selectedOs.numeroOs}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 32px; color: #0f172a; }
            h1, h2 { margin: 0 0 12px; }
            h1 { color: #f97316; }
            .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin: 20px 0; }
            .card { border: 1px solid #e2e8f0; border-radius: 14px; padding: 16px; }
            strong { display: block; margin-bottom: 6px; }
            p { margin: 0; white-space: pre-wrap; line-height: 1.5; }
          </style>
        </head>
        <body>
          <h1>DRM Energia Solar</h1>
          <h2>Relatório técnico ${selectedOs.numeroOs}</h2>
          <div class="grid">
            <div class="card"><strong>Cliente</strong><p>${selectedOs.clienteNome}</p></div>
            <div class="card"><strong>Status</strong><p>${selectedOs.status}</p></div>
            <div class="card"><strong>Motivo</strong><p>${details.motivo}</p></div>
            <div class="card"><strong>Prioridade</strong><p>${details.atendimento.prioridade}</p></div>
          </div>
          <div class="card"><strong>Descrição do problema</strong><p>${details.descricaoProblema || 'Não informado.'}</p></div>
          <div class="card"><strong>Diagnóstico</strong><p>${details.relatorio.diagnostico || 'Não informado.'}</p></div>
          <div class="card"><strong>Serviço realizado</strong><p>${details.relatorio.servicoRealizado || 'Não informado.'}</p></div>
          <div class="card"><strong>Resultado do atendimento</strong><p>${details.relatorio.resultado || selectedOs.solucao || 'Não informado.'}</p></div>
          <div class="card"><strong>Recomendação técnica</strong><p>${details.relatorio.recomendacao || 'Não informado.'}</p></div>
        </body>
      </html>
    `;
    reportWindow.document.open();
    reportWindow.document.write(html);
    reportWindow.document.close();
    reportWindow.focus();
    reportWindow.print();
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
    <div className="pkit-body">
      <aside className="pkit-catalog-panel">
        <div className="pkit-catalog-hd">
          <strong>Catálogo</strong>
          <button
            type="button"
            className={`pkit-active-toggle ${produtoStatusFilter === 'ativo' ? 'on' : ''}`}
            onClick={() => setProdutoStatusFilter(prev => prev === 'ativo' ? 'todos' : 'ativo')}
          >
            <span className="pkit-dot" />
            {produtoStatusFilter === 'ativo' ? 'Mostrando itens ativos' : 'Todos os itens'}
          </button>
        </div>
        <div className="pkit-catalog-items">
          {filteredProdutosPacotes.map(item => (
            <button
              type="button"
              key={item.id}
              className={`pkit-catalog-item ${editingEquipamentoId === item.id ? 'selected' : ''} ${!item.active ? 'inactive' : ''}`}
              onClick={() => editEquipamento(item)}
            >
              <div className="pkit-item-top">
                <strong>{item.nome}</strong>
                <span className={`pkit-badge ${item.active ? 'pkit-badge-ativo' : 'pkit-badge-inativo'}`}>
                  {item.active ? 'Ativo' : 'Inativo'}
                </span>
              </div>
              <div className="pkit-item-specs">
                {item.placaModelo && <span>Placa: {item.placaModelo}</span>}
                {item.inversorModelo && <><span className="pkit-sep">·</span><span>Inversor: {item.inversorModelo}</span></>}
                {item.quantidadeCabo && <><span className="pkit-sep">·</span><span>Cabo: {item.quantidadeCabo} m</span></>}
              </div>
            </button>
          ))}
          {filteredProdutosPacotes.length === 0 && (
            <div className="catalog-empty">
              <strong>Nenhum item encontrado</strong>
              <span>Ajuste os filtros ou crie um novo cadastro.</span>
            </div>
          )}
        </div>
        {equipamentos.length > 0 && (
          <button type="button" className="pkit-ver-todos" onClick={() => { setProdutoSearch(''); setProdutoTipoFilter('todos'); setProdutoStatusFilter('todos'); }}>
            Ver todos os itens →
          </button>
        )}
      </aside>

      <form className="product-editor pkit-form-panel" onSubmit={saveEquipamento}>
        <div className="product-editor-header">
          <div>
            <span className="section-kicker">{editingEquipamentoId ? `Editando #${editingEquipamentoId}` : 'Novo cadastro'}</span>
            <h3>Cadastro técnico</h3>
          </div>
          <div className="product-editor-actions">
            {editingEquipamentoId && (
              <>
                <button type="button" className="btn btn-outline btn-sm-admin" onClick={() => duplicateEquipamento(equipamentos.find(i => i.id === editingEquipamentoId))}>Duplicar</button>
                <button type="button" className="btn btn-outline btn-sm-admin" onClick={() => toggleEquipamentoActive(equipamentos.find(i => i.id === editingEquipamentoId))}>
                  {equipamentos.find(i => i.id === editingEquipamentoId)?.active ? 'Desativar' : 'Ativar'}
                </button>
              </>
            )}
          </div>
        </div>

        <section className="product-editor-section">
          <div className="pkit-section-title">Identificação</div>
          <div className="equipment-form product-editor-grid">
            <label>
              Nome do cadastro *
              <input ref={equipamentoNomeRef} placeholder="Ex: Kit residencial 5,49 kWp" value={equipamentoForm.nome} onChange={e => setEquipamentoForm(prev => ({ ...prev, nome: e.target.value }))} required />
            </label>
            <label>
              Status *
              <select value={equipamentoForm.active ? 'ativo' : 'inativo'} onChange={e => setEquipamentoForm(prev => ({ ...prev, active: e.target.value === 'ativo' }))}>
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
            </label>
          </div>
        </section>

        <section className="product-editor-section">
          <div className="pkit-section-title">Dados da placa</div>
          <div className="equipment-form product-editor-grid">
            <label>
              Modelo da placa *
              <input placeholder="Ex: Canadian Solar 610W" value={equipamentoForm.placaModelo} onChange={e => setEquipamentoForm(prev => ({ ...prev, placaModelo: e.target.value }))} required />
            </label>
            <label>
              Potência da placa (W) *
              <input type="number" placeholder="Ex: 610" value={equipamentoForm.potenciaPlacaW} onChange={e => setEquipamentoForm(prev => ({ ...prev, potenciaPlacaW: e.target.value }))} />
            </label>
          </div>
        </section>

        <section className="product-editor-section">
          <div className="pkit-section-title">Dados do inversor</div>
          <div className="equipment-form product-editor-grid">
            <label>
              Modelo do inversor *
              <input placeholder="Ex: Growatt MIN 5KTL-X" value={equipamentoForm.inversorModelo} onChange={e => setEquipamentoForm(prev => ({ ...prev, inversorModelo: e.target.value }))} required />
            </label>
            <label>
              Potência do inversor (kW) *
              <input type="number" step="0.01" placeholder="Ex: 5" value={equipamentoForm.potenciaInversorKw} onChange={e => setEquipamentoForm(prev => ({ ...prev, potenciaInversorKw: e.target.value }))} />
            </label>
          </div>
        </section>

        <section className="product-editor-section">
          <div className="pkit-section-title">Cabo</div>
          <div className="equipment-form product-editor-grid">
            <label>
              Quantidade de cabo (m) *
              <input placeholder="Ex: 45" value={equipamentoForm.quantidadeCabo} onChange={e => setEquipamentoForm(prev => ({ ...prev, quantidadeCabo: e.target.value }))} />
            </label>
            <label>
              Observação interna
              <textarea placeholder="Informações adicionais, compatibilidades, observações..." value={equipamentoForm.observacoes} onChange={e => setEquipamentoForm(prev => ({ ...prev, observacoes: e.target.value }))} rows={3} style={{ resize: 'none' }} />
            </label>
          </div>
        </section>

        <div className="product-editor-footer">
          <button type="button" className="btn btn-outline" onClick={startNewEquipamento}>Limpar</button>
          <button className="btn btn-primary" type="submit">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: '0.35rem' }}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            Salvar cadastro
          </button>
        </div>
      </form>
    </div>
  );

  const updatePermissions = async (userId, permissions, active, extra = {}) => {
    const normalizedPermissions = normalizePanelPermissions(permissions);
    await request(`/api/admin/usuarios/${userId}/permissoes`, {
      method: 'PUT',
      body: JSON.stringify({ permissions: normalizedPermissions, active, ...extra }),
    });
    setUsuarios(prev => prev.map(user => user.id === userId ? { ...user, permissions: normalizedPermissions, active, ...extra } : user));
  };

  const createUsuario = async (event) => {
    event.preventDefault();
    try {
    const user = await request('/api/admin/usuarios', {
      method: 'POST',
      body: JSON.stringify({
        ...newUserForm,
        permissions: normalizePanelPermissions({
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
        }),
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
      setHomoDocUpload({ tipo: 'cliente', nome: '', descricao: '', localizacaoCliente: '', arquivo: null });
      showToast('Documento adicionado.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setHomoDocUploadLoading(false);
    }
  };

  const validateProjetoDocumentFile = (file) => {
    if (isValidProjectDocumentFile(file)) return true;
    showToast('Envie um arquivo PDF, JPG ou PNG com no máximo 15 MB.', 'error');
    return false;
  };

  const getClientLocationHref = (value = '') => {
    const location = String(value || '').trim();
    if (!location) return '';
    if (/^https?:\/\//i.test(location)) return location;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
  };

  const attachCurrentLocationToHomoDoc = () => {
    if (!navigator.geolocation) {
      showToast('Este dispositivo não liberou captura de localização.', 'error');
      return;
    }
    showToast('Buscando localização do cliente...', 'info');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const mapsUrl = `https://www.google.com/maps?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
        setHomoDocUpload(prev => ({ ...prev, localizacaoCliente: mapsUrl }));
        showToast('Localização anexada ao documento.', 'success');
      },
      () => showToast('Não foi possível capturar a localização. Verifique a permissão do navegador.', 'error'),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
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
    rememberPanelStep();
    setBudgetStatus('');
    setBudgetFieldErrors({});
    const firstEquip = equipamentos.find(e => e.active);
    const inversorMarca = firstEquip?.inversorModelo ? (firstEquip.inversorModelo.split(' ')[0] || '') : '';
    setBudgetForm({
      ...emptyBudgetForm,
      modo: cliente?.id ? 'cliente' : 'rapido',
      clienteId: cliente?.id ? String(cliente.id) : '',
      clienteNome: cliente?.nome || '',
      clienteCpfCnpj: cliente?.cpfCnpj || '',
      clienteCidade: cliente?.cidade || '',
      clienteTelefone: cliente?.whatsapp || '',
      clienteEmail: cliente?.email || '',
      placaModelo: firstEquip?.placaModelo || '',
      inversorMarca,
      inversorModelo: firstEquip?.inversorModelo || '',
      potenciaPlacaW: firstEquip?.potenciaPlacaW || emptyBudgetForm.potenciaPlacaW,
      potenciaInversorKw: firstEquip?.potenciaInversorKw || '',
      equipamentoId: firstEquip?.id ? String(firstEquip.id) : '',
    });
    setSelectedOrcClient(cliente || null);
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

    const errors = {};
    if (!budgetForm.clienteNome?.trim()) errors.clienteNome = true;
    const cpfCnpjDigits = String(budgetForm.clienteCpfCnpj || '').replace(/\D/g, '');
    if (cpfCnpjDigits && ![11, 14].includes(cpfCnpjDigits.length)) errors.clienteCpfCnpj = true;
    if (!budgetForm.clienteCidade?.trim()) errors.clienteCidade = true;
    if (!budgetForm.geracaoKwh || Number(budgetForm.geracaoKwh) <= 0) errors.geracaoKwh = true;
    if (!budgetForm.valorSistema || Number(budgetForm.valorSistema) <= 0) errors.valorSistema = true;
    if (!budgetForm.placaModelo) errors.placaModelo = true;
    if (!budgetForm.numeroPaineis || Number(budgetForm.numeroPaineis) < 1) errors.numeroPaineis = true;
    if (!budgetForm.inversorMarca) errors.inversorMarca = true;
    if (!budgetForm.inversorModelo) errors.inversorModelo = true;
    if (!budgetForm.quantidadeInversores || Number(budgetForm.quantidadeInversores) < 1) errors.quantidadeInversores = true;
    if (Object.keys(errors).length > 0) {
      setBudgetFieldErrors(errors);
      setBudgetStatus('Preencha todos os campos obrigatórios.');
      return;
    }
    setBudgetFieldErrors({});
    setBudgetStatus('Salvando orçamento...');
    try {
      const orcamento = await request('/api/admin/orcamentos', {
        method: 'POST',
        body: JSON.stringify({
          clienteId: budgetForm.clienteId,
          clienteNome: budgetForm.clienteNome,
          clienteCpfCnpj: budgetForm.clienteCpfCnpj,
          clienteCidade: budgetForm.clienteCidade,
          clienteTelefone: budgetForm.clienteTelefone,
          clienteEmail: budgetForm.clienteEmail,
          tipo: 'rapido',
          status: 'Novo orçamento',
          dimensionamento: {
            potencia_placa_w: budgetForm.potenciaPlacaW,
            placa_modelo: budgetForm.placaModelo,
            numero_paineis_necessarios: budgetForm.numeroPaineis,
            potencia_real_instalada_kwp: budgetCalculations.potenciaKwp,
            area_ocupada_m2: budgetCalculations.areaOcupadaM2,
            potencia_inversor_kw: budgetForm.potenciaInversorKw,
            inversor_marca: budgetForm.inversorMarca,
            inversor_modelo: budgetForm.inversorModelo,
            quantidade_inversores: budgetForm.quantidadeInversores,
            inversores_adicionais: budgetForm.inversoresAdicionais.filter(i => i.marca && i.modelo),
            quantidade_cabo_cc: budgetForm.quantidadeCaboCc,
            irradiacao_solar: budgetForm.irradiacaoSolar,
            perda_percentual: budgetForm.perdaPercentual,
            geracao_estimada_kwh: Number(budgetForm.geracaoKwh) || budgetCalculations.geracaoKwh,
            geracao_anual_kwh: (Number(budgetForm.geracaoKwh) || budgetCalculations.geracaoKwh) * 12,
            cidade_base: budgetClient?.cidade || budgetForm.clienteCidade,
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
      setBudgetStatus('Orçamento criado com sucesso.');
      setIsBudgetFormOpen(false);
      if (!orcamento.clienteId) setSelectedOrcClient(null);
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
      navigatePanel({ activeTab: 'leads' });
      setShowManualLeadForm(true);
      return;
    }
    navigatePanel({ activeTab: action.tab });
  };

  const openQuickActionEditor = () => {
    const availableIds = availableQuickActions.map(action => action.id);
    const current = quickActionPrefs === null ? availableIds : quickActionPrefs.filter(id => availableIds.includes(id));
    setQuickActionDraft(current.length ? current : availableIds);
    setQuickActionEditorOpen(true);
  };

  const toggleQuickActionDraft = (actionId) => {
    setQuickActionDraft(prev => (
      prev.includes(actionId)
        ? prev.filter(id => id !== actionId)
        : [...prev, actionId]
    ));
  };

  const saveQuickActionPrefs = async () => {
    if (quickActionDraft.length === 0) {
      showToast('Selecione pelo menos uma ação rápida.', 'warning');
      return;
    }
    try {
      const data = await request('/api/admin/quick-actions', {
        method: 'PUT',
        body: JSON.stringify({ quickActions: quickActionDraft }),
      });
      setQuickActionPrefs(Array.isArray(data.quickActions) ? data.quickActions : null);
      const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
      localStorage.setItem('user', JSON.stringify({ ...currentUser, quickActions: data.quickActions }));
      setQuickActionEditorOpen(false);
      showToast('Ações rápidas atualizadas.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
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

  const aprovarOrcamentoParaContrato = async (orcamento) => {
    try {
      const updated = orcamento.status === 'Orçamento aprovado'
        ? orcamento
        : await request(`/api/admin/orcamentos/${orcamento.id}`, {
            method: 'PUT',
            body: JSON.stringify({ status: 'Orçamento aprovado' }),
          });
      setOrcamentos(prev => prev.map(item => item.id === updated.id ? updated : item));
      setSelectedOrcamento(updated);
      showToast(`Orçamento #${updated.id} aprovado. Gerando contrato com o kit escolhido.`, 'success');
      await openContractModal(updated);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const excluirOrcamentoTeste = async (orcamento) => {
    if (!orcamento?.id) return;
    const nomeCliente = orcamento.clienteNome || 'cliente sem nome';
    const confirmed = window.confirm(
      `Excluir o orçamento #${orcamento.id} de ${nomeCliente}?\n\nUse isso apenas para orçamentos fake/teste. Se ele já tiver contrato vinculado, o sistema vai bloquear.`
    );
    if (!confirmed) return;

    try {
      await request(`/api/admin/orcamentos/${orcamento.id}`, { method: 'DELETE' });
      setOrcamentos(prev => prev.filter(item => Number(item.id) !== Number(orcamento.id)));
      setSelectedOrcamento(prev => (Number(prev?.id) === Number(orcamento.id) ? null : prev));
      showToast(`Orçamento #${orcamento.id} excluído da lista.`, 'success');
      request('/api/admin/resumo').then(setResumo).catch(() => {});
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const getClientContract = (cliente) => contratos.find(contrato => (
    Number(contrato.dados?.cliente?.id) === Number(cliente.id)
  ));

  const openClientContractModal = (cliente) => {
    const existingContract = getClientContract(cliente);
    if (existingContract) {
      navigatePanel({ activeTab: 'contratos', selectedContratoId: existingContract.id });
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
      navigatePanel({ activeTab: 'procuracoes' });
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
      navigatePanel({ activeTab: 'procuracoes' });
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
    navigatePanel({ activeTab: 'contratos' });
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

  const updateContractConsultant = (nextId) => {
    const selectedOption = contractConsultantOptions.find(option => option.value === String(nextId));
    setContractReviewForm(prev => ({
      ...prev,
      consultorId: nextId,
      consultorNome: selectedOption?.nome || prev.consultorNome || '',
    }));
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

  const copyToClipboard = async (text, successMessage = 'Copiado com sucesso.') => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const input = document.createElement('textarea');
        input.value = text;
        input.setAttribute('readonly', '');
        input.style.position = 'absolute';
        input.style.left = '-9999px';
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      showToast(successMessage, 'success');
    } catch {
      showToast('Não consegui copiar automaticamente. Copie manualmente o link exibido.', 'warning');
    }
  };

  const resizeContractSignatureCanvas = useCallback(() => {
    const canvas = contractSignatureCanvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(320, Math.floor(rect.width || 640));
    const height = Math.max(160, Math.floor(rect.height || 220));
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = '#111827';
  }, []);

  useEffect(() => {
    if (!contractSignatureModal.open) return undefined;
    const timer = window.setTimeout(resizeContractSignatureCanvas, 40);
    const handleResize = () => resizeContractSignatureCanvas();
    window.addEventListener('resize', handleResize);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
    };
  }, [contractSignatureModal.open, resizeContractSignatureCanvas]);

  const clearContractSignatureCanvas = () => {
    const canvas = contractSignatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    const displayCtx = canvas.getContext('2d');
    displayCtx.lineJoin = 'round';
    displayCtx.lineCap = 'round';
    displayCtx.lineWidth = 2.2;
    displayCtx.strokeStyle = '#111827';
  };

  const getContractCanvasPoint = (event) => {
    const canvas = contractSignatureCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const source = event.touches?.[0] || event.changedTouches?.[0] || event;
    return {
      x: source.clientX - rect.left,
      y: source.clientY - rect.top,
    };
  };

  const startContractSignature = (event) => {
    const canvas = contractSignatureCanvasRef.current;
    if (!canvas) return;
    event.preventDefault();
    const ctx = canvas.getContext('2d');
    const point = getContractCanvasPoint(event);
    contractSignatureDrawingRef.current = { isDrawing: true, lastX: point.x, lastY: point.y };
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
  };

  const moveContractSignature = (event) => {
    if (!contractSignatureDrawingRef.current.isDrawing) return;
    const canvas = contractSignatureCanvasRef.current;
    if (!canvas) return;
    event.preventDefault();
    const ctx = canvas.getContext('2d');
    const point = getContractCanvasPoint(event);
    ctx.beginPath();
    ctx.moveTo(contractSignatureDrawingRef.current.lastX, contractSignatureDrawingRef.current.lastY);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    contractSignatureDrawingRef.current.lastX = point.x;
    contractSignatureDrawingRef.current.lastY = point.y;
  };

  const stopContractSignature = () => {
    contractSignatureDrawingRef.current.isDrawing = false;
  };

  const openDrmSignatureModal = (contrato) => {
    setContractSignatureModal({
      open: true,
      contract: contrato,
      signerName: adminUser.nome || 'DRM Energia Solar',
      signatureLink: '',
    });
  };

  const closeDrmSignatureModal = () => {
    setContractSignatureModal({ open: false, contract: null, signerName: '', signatureLink: '' });
  };

  const signContractAsDrm = async () => {
    const contrato = contractSignatureModal.contract;
    if (!contrato?.id) return;
    const canvas = contractSignatureCanvasRef.current;
    if (!canvas) return;
    try {
      const updated = await request(`/api/admin/contratos/${contrato.id}/assinar-drm`, {
        method: 'POST',
        body: JSON.stringify({
          signerName: contractSignatureModal.signerName,
          signatureDataUrl: canvas.toDataURL('image/png'),
        }),
      });
      setContratos(prev => prev.map(item => item.id === updated.id ? updated : item));
      setSelectedContrato(current => (current?.id === updated.id ? updated : current));
      closeDrmSignatureModal();
      showToast(`Assinatura DRM registrada no ${contractNumber(updated)}.`, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const generateContractSignatureLink = async (contrato) => {
    try {
      const data = await request(`/api/admin/contratos/${contrato.id}/assinatura-link`, {
        method: 'POST',
      });
      setContratos(prev => prev.map(item => item.id === data.contrato.id ? data.contrato : item));
      setSelectedContrato(current => (current?.id === data.contrato.id ? data.contrato : current));
      setContractSignatureModal(prev => ({ ...prev, signatureLink: data.signatureUrl || '' }));
      await copyToClipboard(data.signatureUrl, 'Link de assinatura copiado.');
      return data.signatureUrl;
    } catch (err) {
      showToast(err.message, 'error');
      return '';
    }
  };

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

  const savePlaca = async (event) => {
    event.preventDefault();
    if (!placaForm.modelo.trim()) return;
    const isEditing = Boolean(editingPlacaId);
    try {
      const placa = await request(
        isEditing ? `/api/admin/placas/${editingPlacaId}` : '/api/admin/placas',
        { method: isEditing ? 'PUT' : 'POST', body: JSON.stringify(placaForm) }
      );
      setPlacas(prev => {
        const exists = prev.some(p => p.id === placa.id);
        return exists ? prev.map(p => p.id === placa.id ? placa : p) : [...prev, placa];
      });
      setPlacaForm({ modelo: '', potencia_w: '', status: 'ativo' });
      setEditingPlacaId(null);
      showToast(isEditing ? 'Placa atualizada.' : 'Placa cadastrada com sucesso.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const saveMarca = async (event) => {
    event.preventDefault();
    if (!marcaForm.nome_marca.trim()) return;
    const isEditing = Boolean(editingMarcaId);
    try {
      const marca = await request(
        isEditing ? `/api/admin/marcas-inversor/${editingMarcaId}` : '/api/admin/marcas-inversor',
        { method: isEditing ? 'PUT' : 'POST', body: JSON.stringify(marcaForm) }
      );
      setMarcasInversor(prev => {
        const exists = prev.some(m => m.id === marca.id);
        return exists ? prev.map(m => m.id === marca.id ? marca : m) : [...prev, marca];
      });
      setMarcaForm({ nome_marca: '', status: 'ativo' });
      setEditingMarcaId(null);
      setShowMarcaForm(false);
      if (!isEditing) setSelectedMarcaId(marca.id);
      showToast(isEditing ? 'Marca atualizada.' : 'Marca cadastrada com sucesso.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const saveModelo = async (event) => {
    event.preventDefault();
    if (!modeloForm.marca_id || !modeloForm.nome_modelo.trim()) return;
    const isEditing = Boolean(editingModeloId);
    try {
      const modelo = await request(
        isEditing ? `/api/admin/modelos-inversor/${editingModeloId}` : '/api/admin/modelos-inversor',
        { method: isEditing ? 'PUT' : 'POST', body: JSON.stringify(modeloForm) }
      );
      setModelosInversor(prev => {
        const exists = prev.some(m => m.id === modelo.id);
        return exists ? prev.map(m => m.id === modelo.id ? modelo : m) : [...prev, modelo];
      });
      setModeloForm({ marca_id: selectedMarcaId || '', nome_modelo: '', status: 'ativo' });
      setEditingModeloId(null);
      showToast(isEditing ? 'Modelo atualizado.' : 'Modelo cadastrado com sucesso.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const saveMarcaHibrido = async (event) => {
    event.preventDefault();
    if (!marcaHibridoForm.nome_marca.trim()) return;
    try {
      const marca = await request('/api/admin/marcas-inversor-hibrido', { method: 'POST', body: JSON.stringify(marcaHibridoForm) });
      setMarcasHibrido(prev => [...prev, marca]);
      setMarcaHibridoForm({ nome_marca: '', status: 'ativo' });
      setShowMarcaHibridoForm(false);
      setSelectedMarcaHibridoId(marca.id);
      showToast('Marca híbrida cadastrada.', 'success');
    } catch (err) { showToast(err.message, 'error'); }
  };

  const saveModeloHibrido = async (event) => {
    event.preventDefault();
    if (!modeloHibridoForm.marca_id || !modeloHibridoForm.nome_modelo.trim()) return;
    try {
      const modelo = await request('/api/admin/modelos-inversor-hibrido', { method: 'POST', body: JSON.stringify(modeloHibridoForm) });
      setModelosHibrido(prev => [...prev, modelo]);
      setModeloHibridoForm({ marca_id: selectedMarcaHibridoId || '', nome_modelo: '', status: 'ativo' });
      setShowModeloHibridoForm(false);
      setSelectedModeloHibridoId(modelo.id);
      showToast('Modelo híbrido cadastrado.', 'success');
    } catch (err) { showToast(err.message, 'error'); }
  };

  const saveBateria = async (event) => {
    event.preventDefault();
    if (!bateriaForm.modelo_hibrido_id || !bateriaForm.nome_bateria.trim()) return;
    try {
      const bateria = await request('/api/admin/baterias-litio', { method: 'POST', body: JSON.stringify(bateriaForm) });
      setBateriasHibrido(prev => [...prev, bateria]);
      setBateriaForm({ modelo_hibrido_id: selectedModeloHibridoId || '', nome_bateria: '', capacidade_kwh: '', status: 'ativo' });
      setShowBateriaForm(false);
      showToast('Bateria cadastrada.', 'success');
    } catch (err) { showToast(err.message, 'error'); }
  };

  const saveHibridoCad = async (event) => {
    event.preventDefault();
    const { marca_id, modelo_hibrido_id, nome_bateria, capacidade_kwh, status } = hibridoCadForm;
    if (!modelo_hibrido_id || !nome_bateria.trim()) return;
    try {
      const bateria = await request('/api/admin/baterias-litio', {
        method: 'POST',
        body: JSON.stringify({ modelo_hibrido_id, nome_bateria, capacidade_kwh, status }),
      });
      setBateriasHibrido(prev => [...prev, bateria]);
      setHibridoCadForm(prev => ({ ...prev, nome_bateria: '', capacidade_kwh: '' }));
      showToast('Bateria cadastrada com sucesso.', 'success');
    } catch (err) { showToast(err.message, 'error'); }
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

  const selectedWhatsappIsPending = selectedWhatsappConversation?.status === 'Aguardando atendimento' && !selectedWhatsappConversation?.assignedUserId;
  const selectedWhatsappIsMine = Number(selectedWhatsappConversation?.assignedUserId) === Number(adminUser.id);
  const canReplyWhatsapp = Boolean(selectedWhatsappConversation)
    && whatsappStatus?.connected
    && selectedWhatsappConversation.status !== 'Arquivada'
    && (selectedWhatsappIsMine || isMasterAdmin)
    && !selectedWhatsappIsPending;
  const getWhatsappMediaUrl = (message) => (
    message?.mediaUrl
      ? withApiBase(String(message.mediaUrl).replace(/^\/uploads\/whatsapp\//, '/api/whatsapp/media/'))
      : ''
  );
  const getWhatsappMediaLabel = (message) => {
    const labels = {
      image: 'Imagem',
      video: 'Video',
      audio: 'Audio',
      document: 'Documento',
      sticker: 'Figurinha',
    };
    return labels[message?.messageType] || 'Midia';
  };
  const formatWhatsappFileSize = (value) => {
    const size = Number(value || 0);
    if (!size) return '';
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1).replace('.', ',')} KB`;
    return `${(size / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
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
          <Link to="/" aria-label="Voltar para a página inicial da DRM">
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
                    navigatePanel({ activeTab: tab.id });
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

      <main className={`admin-main-content ${activeTab === 'whatsapp' ? 'whatsapp-active' : ''}`}>
        <header className="admin-topbar">
          <button className="mobile-menu-toggle" onClick={() => setIsSidebarOpen(true)} aria-label="Abrir menu">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
          </button>
          <div className="topbar-main">
            <div className="panel-title-row">
              <button
                type="button"
                className="panel-back-button"
                onClick={handlePanelBack}
                disabled={!canPanelGoBack}
                aria-label="Voltar para a tela anterior do painel"
                title="Voltar"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.4 5.4 14 4l-8 8 8 8 1.4-1.4L9.8 13H21v-2H9.8l5.6-5.6Z" fill="currentColor"/></svg>
              </button>
              <h2>{tabs.find(tab => tab.id === activeTab)?.label || 'Painel'}</h2>
            </div>
            <div className="quick-action-row">
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
              <button
                type="button"
                className="quick-action-edit-button"
                onClick={openQuickActionEditor}
                title="Editar ações rápidas"
              >
                <span className="quick-action-icon">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17.3V21h3.7L18.8 9.9l-3.7-3.7L4 17.3Zm17.7-11.2c.4-.4.4-1 0-1.4l-2.4-2.4a1 1 0 0 0-1.4 0L16 4.2l3.7 3.7 2-1.8Z" /></svg>
                </span>
                <span>Editar</span>
              </button>
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

              {/* ── VISÃO GERAL ─────────────────────────────────────────── */}
              <div className="pg-section-label">VISÃO GERAL</div>
              <div className="pg-vg-row">
                <button type="button" className="pg-vg-card" onClick={() => navigatePanel({ activeTab: 'contratos' })}>
                  <div className="pg-vg-top"><span className="pg-vg-dot" style={{background:'#f97316'}} /><span className="pg-vg-label">VENDIDO NO MÊS</span></div>
                  <strong className="pg-vg-value">{money(resumo.kpis?.valorAprovadoMes)}</strong>
                  <span className="pg-vg-sub">contratos aprovados</span>
                </button>
                <button type="button" className="pg-vg-card" onClick={() => navigatePanel({ activeTab: 'leads' })}>
                  <div className="pg-vg-top"><span className="pg-vg-dot" style={{background:'#8b5cf6'}} /><span className="pg-vg-label">RETORNOS 7 DIAS</span></div>
                  <strong className="pg-vg-value">{resumo.kpis?.retornosSemana || 0}</strong>
                  <span className="pg-vg-sub">sem agenda</span>
                </button>
                <button type="button" className="pg-vg-card" onClick={() => navigatePanel({ activeTab: 'projetos' })}>
                  <div className="pg-vg-top"><span className="pg-vg-dot" style={{background:'#3b82f6'}} /><span className="pg-vg-label">PROJETOS ATIVOS</span></div>
                  <strong className="pg-vg-value">{resumo.kpis?.projetosAtivos || 0}</strong>
                  <span className="pg-vg-sub">em andamento</span>
                </button>
                <button type="button" className="pg-vg-card" onClick={() => navigatePanel({ activeTab: 'contratos' })}>
                  <div className="pg-vg-top"><span className="pg-vg-dot" style={{background:'#22c55e'}} /><span className="pg-vg-label">VALOR PENDENTE</span></div>
                  <strong className="pg-vg-value">{money(resumo.kpis?.valorPendenteContratos)}</strong>
                  <span className="pg-vg-sub">contratos</span>
                </button>
              </div>

              {/* ── ATENDER AGORA ──────────────────────────────────────── */}
              <div className="pg-section-label">ATENDER AGORA</div>
              <div className="pg-aa-row">
                <button type="button" className="pg-aa-card" style={{borderLeftColor:'#f97316'}} onClick={() => navigatePanel({ activeTab: 'leads' })}>
                  <span className="pg-aa-label">LEADS NOVOS</span>
                  <strong className="pg-aa-number">{resumo.kpis?.novos || 0}</strong>
                </button>
                <button type="button" className="pg-aa-card" style={{borderLeftColor:'#8b5cf6'}} onClick={() => navigatePanel({ activeTab: 'leads' })}>
                  <span className="pg-aa-label">RETORNOS</span>
                  <strong className="pg-aa-number">{resumo.proximosRetornos?.length || 0}</strong>
                </button>
                <button type="button" className="pg-aa-card" style={{borderLeftColor:'#f59e0b'}} onClick={() => navigatePanel({ activeTab: 'contratos' })}>
                  <span className="pg-aa-label">CONTRATOS PEND.</span>
                  <strong className="pg-aa-number">{resumo.kpis?.contratosPendentes || 0}</strong>
                </button>
                <button type="button" className="pg-aa-card" style={{borderLeftColor:'#ef4444'}} onClick={() => navigatePanel({ activeTab: 'projetos' })}>
                  <span className="pg-aa-label">PROJETOS CRÍTICOS</span>
                  <strong className="pg-aa-number">{resumo.projetosCriticos?.length || 0}</strong>
                </button>
                <button type="button" className="pg-aa-card" style={{borderLeftColor:'#ec4899'}} onClick={() => navigatePanel({ activeTab: 'ordensServico' })}>
                  <span className="pg-aa-label">O.S ABERTAS</span>
                  <strong className="pg-aa-number">{resumo.kpis?.osAbertas || 0}</strong>
                </button>
              </div>

              {/* ── 3-COLUMN SECTION GRID ──────────────────────────────── */}
              <div className="pg-3col-grid">
                {/* COMERCIAL */}
                <div className="pg-3col-section">
                  <div className="pg-3col-head">
                    <span className="pg-3col-title pg-orange">COMERCIAL</span>
                    <button type="button" className="pg-ver-detalhes" onClick={() => navigatePanel({ activeTab: 'leads' })}>Ver detalhes ›</button>
                  </div>
                  <div className="pg-mini-grid">
                    <button type="button" className="pg-mini-card" style={{borderLeftColor:'#f97316'}} onClick={() => navigatePanel({ activeTab: 'leads' })}>
                      <span>LEADS CAPTADOS</span><strong>{resumo.kpis?.leads || 0}</strong>
                    </button>
                    <button type="button" className="pg-mini-card" style={{borderLeftColor:'#f97316'}} onClick={() => navigatePanel({ activeTab: 'orcamentos' })}>
                      <span>ORÇAMENTOS</span><strong>{resumo.kpis?.orcamentos || 0}</strong>
                    </button>
                    <button type="button" className="pg-mini-card" style={{borderLeftColor:'#f97316'}} onClick={() => navigatePanel({ activeTab: 'contratos' })}>
                      <span>CONTRATOS</span><strong>{resumo.kpis?.contratos || 0}</strong>
                    </button>
                    <button type="button" className="pg-mini-card" style={{borderLeftColor:'#f97316'}} onClick={() => navigatePanel({ activeTab: 'leads' })}>
                      <span>FUNIL</span><strong>{resumo.kpis?.leads || 0}</strong>
                    </button>
                  </div>
                </div>

                {/* OPERAÇÃO */}
                <div className="pg-3col-section">
                  <div className="pg-3col-head">
                    <span className="pg-3col-title pg-blue">OPERAÇÃO</span>
                    <button type="button" className="pg-ver-detalhes" onClick={() => navigatePanel({ activeTab: 'projetos' })}>Ver detalhes ›</button>
                  </div>
                  <div className="pg-mini-grid">
                    <button type="button" className="pg-mini-card" style={{borderLeftColor:'#3b82f6'}} onClick={() => navigatePanel({ activeTab: 'projetos' })}>
                      <span>PROJETOS CRIT.</span><strong>{resumo.projetosCriticos?.length || 0}</strong>
                    </button>
                    <button type="button" className="pg-mini-card" style={{borderLeftColor:'#3b82f6'}} onClick={() => navigatePanel({ activeTab: 'contratos' })}>
                      <span>HOMOLOG.</span><strong>{resumo.operacao?.contratosAprovados || 0}</strong>
                    </button>
                    <button type="button" className="pg-mini-card" style={{borderLeftColor:'#3b82f6'}} onClick={() => navigatePanel({ activeTab: 'instalacoes' })}>
                      <span>INSTALAÇÕES</span><strong>{resumo.kpis?.projetosAtivos || 0}</strong>
                    </button>
                    <button type="button" className="pg-mini-card" style={{borderLeftColor:'#3b82f6'}} onClick={() => navigatePanel({ activeTab: 'ordensServico' })}>
                      <span>PEND. TÉCNICAS</span><strong>{resumo.operacao?.ordensServicoAbertas || 0}</strong>
                    </button>
                  </div>
                </div>

                {/* MARKETING + ACESSOS */}
                <div className="pg-3col-section">
                  <div className="pg-3col-head">
                    <span className="pg-3col-title pg-green">MARKETING + ACESSOS</span>
                    <button type="button" className="pg-ver-detalhes" onClick={() => navigatePanel({ activeTab: 'usuarios' })}>Ver detalhes ›</button>
                  </div>
                  <div className="pg-mini-grid">
                    <div className="pg-mini-card" style={{borderLeftColor:'#22c55e'}}>
                      <span>VISITAS 30D</span><strong>{resumo.kpis?.visitasSite30d || 0}</strong>
                    </div>
                    <div className="pg-mini-card" style={{borderLeftColor:'#22c55e'}}>
                      <span>WHATSAPP</span><strong>{resumo.kpis?.clicksWhatsApp30d || 0}</strong>
                    </div>
                    <div className="pg-mini-card" style={{borderLeftColor:'#22c55e'}}>
                      <span>SIMULAR</span><strong>{resumo.kpis?.clicksSimular30d || 0}</strong>
                    </div>
                    <button type="button" className="pg-mini-card" style={{borderLeftColor:'#ef4444'}} onClick={() => navigatePanel({ activeTab: 'usuarios' })}>
                      <span>SEM E-MAIL</span><strong>{resumo.kpis?.acessosSemRecuperacao || 0}</strong>
                    </button>
                  </div>
                </div>
              </div>

              {/* ── PERFORMANCE POR CONSULTOR ──────────────────────────── */}
              {Array.isArray(resumo.vendasConsultores?.porAno) && resumo.vendasConsultores.porAno.length > 0 && (
                <div className="admin-card consultor-sales-panel">
                  <div className="section-heading consultor-sales-heading">
                    <div>
                      <span className="section-kicker">Performance comercial</span>
                      <h3>Vendas por consultor</h3>
                      <p>Faturamento e produção separados por consultor.</p>
                    </div>
                    <div className="section-stats">
                      <div><strong>{money(resumo.vendasConsultores?.totalMes || 0)}</strong><span>mês atual</span></div>
                      <div><strong>{money(resumo.vendasConsultores?.totalAno || 0)}</strong><span>ano atual</span></div>
                      <div><strong>{resumo.vendasConsultores?.porAno?.length || 0}</strong><span>consultores</span></div>
                    </div>
                  </div>
                  <div className="consultor-sales-grid">
                    <section className="consultor-sales-card">
                      <div className="consultor-sales-card-header">
                        <div><span>Ranking mensal</span><strong>{resumo.vendasConsultores?.referenciaMes || 'Mês atual'}</strong></div>
                      </div>
                      <div className="consultor-sales-list">
                        {(resumo.vendasConsultores?.porMes || []).map(item => {
                          const width = resumo.vendasConsultores?.totalMes ? Math.max((Number(item.mes?.valor || 0) / Number(resumo.vendasConsultores.totalMes || 1)) * 100, item.mes?.valor ? 12 : 0) : 0;
                          return (
                            <div className="consultor-sales-item" key={`mes-${item.nome}`}>
                              <div className="consultor-sales-row"><strong>{item.nome}</strong><span>{item.mes?.quantidade || 0} venda{(item.mes?.quantidade || 0) === 1 ? '' : 's'}</span></div>
                              <div className="consultor-sales-bar"><span style={{ width: `${Math.min(width, 100)}%` }}></span></div>
                              <div className="consultor-sales-row is-summary"><small>{money(item.mes?.valor || 0)}</small><small>{resumo.vendasConsultores?.totalMes ? percent((item.mes?.valor || 0) / resumo.vendasConsultores.totalMes) : '0,0%'}</small></div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                    <section className="consultor-sales-card">
                      <div className="consultor-sales-card-header">
                        <div><span>Ranking anual</span><strong>{resumo.vendasConsultores?.referenciaAno || 'Ano atual'}</strong></div>
                      </div>
                      <div className="consultor-sales-list">
                        {(resumo.vendasConsultores?.porAno || []).map(item => {
                          const width = resumo.vendasConsultores?.totalAno ? Math.max((Number(item.ano?.valor || 0) / Number(resumo.vendasConsultores.totalAno || 1)) * 100, item.ano?.valor ? 12 : 0) : 0;
                          return (
                            <div className="consultor-sales-item" key={`ano-${item.nome}`}>
                              <div className="consultor-sales-row"><strong>{item.nome}</strong><span>{item.ano?.quantidade || 0} venda{(item.ano?.quantidade || 0) === 1 ? '' : 's'}</span></div>
                              <div className="consultor-sales-bar annual"><span style={{ width: `${Math.min(width, 100)}%` }}></span></div>
                              <div className="consultor-sales-row is-summary"><small>{money(item.ano?.valor || 0)}</small><small>{resumo.vendasConsultores?.totalAno ? percent((item.ano?.valor || 0) / resumo.vendasConsultores.totalAno) : '0,0%'}</small></div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  </div>
                </div>
              )}

              {/* ── PROJETOS CRÍTICOS + ÚLTIMAS ATIVIDADES ─────────────── */}
              <div className="pg-bottom-row">
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
                    {(resumo.projetosCriticos || []).length > 5 && <button type="button" className="btn btn-outline btn-sm-admin dashboard-list-action" onClick={() => navigatePanel({ activeTab: 'projetos' })}>Ver todos os projetos</button>}
                  </div>
                </div>
                <div className="admin-card">
                  <div className="card-header-flex compact">
                    <h3>Últimas atividades</h3>
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

              {/* ── META ADS (acesso restrito) ──────────────────────────── */}
              {(adminUser.permissions?.verTodosLeads || adminUser.role === 'ADM') && (
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
                    <span className={`status-badge ${resumo.roundRobinLeads?.status?.ok ? 'success' : 'warning'}`}>{resumo.roundRobinLeads?.enabled ? 'online' : 'offline'}</span>
                  </div>
                  <div className="rr-seller-grid">
                    {(resumo.roundRobinLeads?.bySeller || []).map(seller => (
                      <div className="rr-seller-card" key={seller.phone}>
                        <div className="rr-seller-top"><span>Vendedor {seller.position}</span><strong>{seller.total || 0}</strong></div>
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
              )}
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
                      <button type="button" className="cc-breadcrumb-link" onClick={() => { handlePanelBack(); setNovoCliente(emptyClientForm); }}>Clientes</button>
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
                        <div className="cc-field">
                          <label className="cc-label">Consultor responsável</label>
                          <select className="cc-input" value={novoCliente.consultorNome} onChange={(e) => setNovoCliente(prev => ({ ...prev, consultorNome: e.target.value }))}>
                            <option value="">Selecione o consultor</option>
                            {usuarios.map(u => <option key={u.id} value={u.nome}>{u.nome}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="cc-footer">
                        <button type="button" className="cc-btn-cancel" onClick={() => { handlePanelBack(); setNovoCliente(emptyClientForm); }}>
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
                                      <a className="btn btn-primary btn-sm-admin" href={getPanelWhatsAppUrl(cs.whatsapp, whatsappClientMessage(cs))} target="_blank" rel="noopener noreferrer">WhatsApp</a>
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

                  <div className={`clients-split-view${selectedCliente ? ' with-ficha' : ''}`}>
                    <div className="clients-table-section">
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
                              <button type="button" className="btn btn-primary" onClick={() => { rememberPanelStep(); setNovoCliente(emptyClientForm); setClientView('new'); }}>
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
                                <th>Consultor</th>
                              </tr>
                            </thead>
                            <tbody>
                              {clientSummary.filtered.map(c => {
                                const whatsappHref = getPanelWhatsAppUrl(c.whatsapp, whatsappClientMessage(c));
                                const etapa = c.etapaComercial || 'Em negociação';
                                const dataFormatada = c.dataCadastro ? c.dataCadastro.slice(0,10).split('-').reverse().join('/') : '—';
                                return (
                                  <tr key={c.id} className={`client-row${selectedCliente?.id === c.id ? ' selected' : ''}`}>
                                    <td className="col-id text-muted">{c.id}</td>
                                    <td className="col-nome">
                                      <button type="button" className="client-name-link" onClick={() => { setSelectedCliente(c); setClientFichaTab('resumo'); }}>{c.nome}</button>
                                    </td>
                                    <td className="col-wp">
                                      {c.whatsapp ? (
                                        <a href={whatsappHref || '#'} target="_blank" rel="noopener noreferrer" className="wp-cell-link" title="Abrir WhatsApp">
                                          <svg width="15" height="15" viewBox="0 0 24 24" fill="#25d366" style={{ flexShrink: 0 }}><path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.37 5.07L2 22l5.12-1.34A9.94 9.94 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2Zm5.16 14.09c-.22.61-1.27 1.17-1.75 1.21-.44.04-.9.17-2.97-.62-2.51-.97-4.12-3.5-4.24-3.66-.12-.16-1-1.33-1-2.54 0-1.21.64-1.8.86-2.05.22-.25.48-.31.64-.31.16 0 .32.01.46.01.15 0 .35-.06.54.41.2.5.69 1.71.75 1.83.06.12.1.26.02.42-.08.16-.12.26-.24.4-.12.14-.25.32-.36.43-.12.11-.24.23-.1.45.14.22.62.97 1.33 1.57.91.79 1.68 1.03 1.9 1.15.22.12.35.1.48-.06.13-.16.55-.64.7-.86.15-.22.3-.18.5-.11.2.07 1.28.6 1.5.71.22.11.36.17.41.27.05.1.05.57-.17 1.18Z"/></svg>
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
                                    <td className="col-consultor text-muted">{c.consultorNome || '—'}</td>
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
                    </div>

                    {selectedCliente && (() => {
                      const fichaEtapa = selectedCliente.etapaComercial || 'Em negociação';
                      const fichaContract = getClientContract(selectedCliente);
                      return (
                        <aside className="client-ficha-panel">
                          <div className="ficha-header">
                            <div className="ficha-header-top">
                              <div className="ficha-title-wrap">
                                <strong className="ficha-nome">{selectedCliente.nome}</strong>
                                <span className={`etapa-chip ${fichaEtapa === 'Venda concluída' ? 'etapa-concluida' : fichaEtapa === 'Venda suspensa' ? 'etapa-suspensa' : 'etapa-negociacao'}`}>{fichaEtapa}</span>
                              </div>
                              <button type="button" className="ficha-close-btn" aria-label="Fechar ficha" onClick={() => setSelectedCliente(null)}>×</button>
                            </div>
                            <div className="ficha-meta-grid">
                              <div className="ficha-meta-cell">
                                <span>WhatsApp</span>
                                <strong>{selectedCliente.whatsapp || '—'}</strong>
                              </div>
                              <div className="ficha-meta-cell">
                                <span>Cidade / UF</span>
                                <strong>{[selectedCliente.cidade, selectedCliente.estado].filter(Boolean).join(' / ') || '—'}</strong>
                              </div>
                              <div className="ficha-meta-cell">
                                <span>Cadastro</span>
                                <strong>{selectedCliente.dataCadastro ? selectedCliente.dataCadastro.slice(0,10).split('-').reverse().join('/') : '—'}</strong>
                              </div>
                              <div className="ficha-meta-cell">
                                <span>Consultor</span>
                                <strong>{selectedCliente.consultorNome || '—'}</strong>
                              </div>
                            </div>
                          </div>
                          <div className="ficha-tabs">
                            {[['resumo','Resumo'],['documentos','Documentos'],['historico','Histórico'],['obs','Obs.']].map(([key, label]) => (
                              <button key={key} type="button" className={`ficha-tab-btn${clientFichaTab === key ? ' active' : ''}`} onClick={() => setClientFichaTab(key)}>{label}</button>
                            ))}
                          </div>
                          <div className="ficha-tab-body">
                            {clientFichaTab === 'resumo' && (
                              <div className="ficha-resumo">
                                <div className="ficha-actions-grid">
                                  {hasPermission('orcamentos') && (
                                    <button type="button" className="ficha-action-card" onClick={() => openBudgetFormForClient(selectedCliente)}>
                                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12h8M8 8h5M8 16h3"/></svg>
                                      <span>Orçamento</span>
                                    </button>
                                  )}
                                  {hasPermission('contratos') && (
                                    <button type="button" className="ficha-action-card" onClick={() => openClientContractModal(selectedCliente)}>
                                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                                      <span>{fichaContract ? 'Ver contrato' : 'Contrato'}</span>
                                    </button>
                                  )}
                                  {hasPermission('contratos') && (
                                    <button type="button" className="ficha-action-card" onClick={() => openHomologacaoModal(selectedCliente)}>
                                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                                      <span>Procuração</span>
                                    </button>
                                  )}
                                </div>
                                <div className="ficha-etapa-section">
                                  <p className="ficha-section-label">Alterar etapa</p>
                                  <div className="ficha-etapa-btns">
                                    {fichaEtapa !== 'Venda concluída' && (
                                      <button type="button" className="ficha-etapa-btn concluir" onClick={() => { updateClienteEtapa(selectedCliente.id, 'Venda concluída', {}); setSelectedCliente(prev => ({ ...prev, etapaComercial: 'Venda concluída' })); }}>
                                        ✓ Marcar como concluída
                                      </button>
                                    )}
                                    {fichaEtapa !== 'Em negociação' && (
                                      <button type="button" className="ficha-etapa-btn negociar" onClick={() => { updateClienteEtapa(selectedCliente.id, 'Em negociação', {}); setSelectedCliente(prev => ({ ...prev, etapaComercial: 'Em negociação' })); }}>
                                        ↺ Retomar negociação
                                      </button>
                                    )}
                                    {fichaEtapa !== 'Venda suspensa' && (
                                      <button type="button" className="ficha-etapa-btn suspender" onClick={() => { setSuspensaoModal(selectedCliente); setSuspensaoForm({ motivo: '', dataPrevisaoRetorno: '', ultimoContato: '', proximaAcao: '' }); }}>
                                        ⏸ Suspender venda
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                            {clientFichaTab === 'documentos' && (
                              <div className="ficha-empty-tab"><p>Nenhum documento anexado.</p></div>
                            )}
                            {clientFichaTab === 'historico' && (
                              <div className="ficha-empty-tab"><p>Histórico não disponível.</p></div>
                            )}
                            {clientFichaTab === 'obs' && (
                              <div className="ficha-obs">
                                <p>{selectedCliente.observacoes || 'Sem observações registradas.'}</p>
                              </div>
                            )}
                          </div>
                          {hasPermission('gerenciarClientes') && (
                            <div className="ficha-footer">
                              <button type="button" className="ficha-edit-btn" onClick={() => { rememberPanelStep(); setNovoCliente({ ...emptyClientForm, ...selectedCliente, password: '' }); setClientView('new'); }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                Editar dados do cliente
                              </button>
                            </div>
                          )}
                        </aside>
                      );
                    })()}
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'whatsapp' && (
            <div className={`admin-section whatsapp-screen wa-redesign ${whatsappMobileChatOpen ? 'mobile-chat-open' : ''}`}>
              <div className="whatsapp-layout">
                <aside className="wi2" aria-label="Lista de conversas">
                  {/* ── Header da inbox ── */}
                  <div className="wi2-head">
                    <h3>Conversas</h3>
                    <div className="wi2-head-actions">
                      <button type="button" className="wi2-icon-btn" title="Atualizar" onClick={() => loadData(adminUser).catch(err => showToast(err.message, 'error'))}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
                      </button>
                      <button type="button" className="wi2-icon-btn" title="Conexão WhatsApp" onClick={openWhatsappConnectModal}>
                        <span className={`wi2-conn-dot ${whatsappStatus?.connected ? 'on' : 'off'}`}></span>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.56 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                      </button>
                    </div>
                  </div>

                  {/* ── Busca ── */}
                  <div className="wi2-search-wrap">
                    <svg className="wi2-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                    <input
                      className="wi2-search"
                      type="search"
                      value={whatsappSearch}
                      onChange={(event) => setWhatsappSearch(event.target.value)}
                      placeholder="Buscar conversas..."
                    />
                  </div>

                  {/* ── Filtros ── */}
                  <div className="wi2-tabs">
                    <button type="button" className={whatsappFilter === 'todas' ? 'active' : ''} onClick={() => setWhatsappFilter('todas')}>Todas</button>
                    <button type="button" className={whatsappFilter === 'aguardando' ? 'active' : ''} onClick={() => setWhatsappFilter('aguardando')}>Não atribuídas</button>
                    <button type="button" className={whatsappFilter === 'atendimento' ? 'active' : ''} onClick={() => setWhatsappFilter('atendimento')}>Em atendimento</button>
                    <button type="button" className={whatsappFilter === 'minhas' ? 'active' : ''} onClick={() => setWhatsappFilter('minhas')}>Minhas</button>
                    <button type="button" className={whatsappFilter === 'finalizadas' ? 'active' : ''} onClick={() => setWhatsappFilter('finalizadas')}>Finalizadas</button>
                  </div>

                  {/* ── Lista ── */}
                  <div className="wi2-list">
                    {whatsappLoading && !selectedWhatsappConversation && filteredWhatsappConversations.length === 0 && (
                      Array.from({ length: 5 }).map((_, i) => (
                        <div className="wi2-skeleton" key={i}><span/><div><b/><i/></div></div>
                      ))
                    )}
                    {filteredWhatsappConversations.map(conversation => {
                      const lastDate = conversation.lastMessageAt || conversation.updatedAt || conversation.createdAt;
                      const isPending = conversation.status === 'Aguardando atendimento' || !conversation.assignedUserId;
                      const isFinalizada = conversation.status === 'Finalizada';
                      const statusLabel = isFinalizada ? 'Finalizada' : isPending ? 'Aguardando' : 'Em atendimento';
                      const statusClass = isFinalizada ? 'fin' : isPending ? 'pend' : 'ativo';
                      const initials = String(conversation.clienteNome || conversation.clienteTelefone || 'W').charAt(0).toUpperCase();
                      const AVATAR_COLORS_WI = ['#22c55e','#3b82f6','#f97316','#8b5cf6','#ef4444','#06b6d4','#f59e0b','#ec4899'];
                      const avatarColor = AVATAR_COLORS_WI[initials.charCodeAt(0) % AVATAR_COLORS_WI.length];
                      return (
                        <button
                          key={conversation.id}
                          type="button"
                          className={`wi2-item ${isPending ? 'pending' : ''} ${selectedWhatsappConversation?.id === conversation.id ? 'active' : ''}`}
                          onClick={() => openWhatsappConversation(conversation)}
                        >
                          <div className="wi2-item-avatar-wrap">
                            <span className="wi2-item-avatar" style={{ background: avatarColor + '22', color: avatarColor }}>{initials}</span>
                            <span className={`wi2-item-dot ${statusClass}`}></span>
                          </div>
                          <div className="wi2-item-body">
                            <div className="wi2-item-top">
                              <strong>{conversation.clienteNome || conversation.clienteTelefone}</strong>
                              <time>{lastDate ? new Date(lastDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}</time>
                            </div>
                            <div className="wi2-item-mid">
                              <span className="wi2-item-phone">{conversation.clienteTelefone}</span>
                              <span className={`wi2-item-status ${statusClass}`}>{statusLabel}</span>
                            </div>
                            <p className="wi2-item-preview">{conversation.lastMessage || 'Nenhuma mensagem ainda'}</p>
                            {conversation.assignedUserName && !isPending && (
                              <span className="wi2-item-agent">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                                {conversation.assignedUserName}
                              </span>
                            )}
                          </div>
                          {Number(conversation.unreadCount || 0) > 0 && (
                            <span className="wi2-unread">{conversation.unreadCount}</span>
                          )}
                        </button>
                      );
                    })}
                    {filteredWhatsappConversations.length === 0 && !whatsappLoading && (
                      <div className="wi2-empty">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                        <strong>Nenhuma conversa</strong>
                        <p>Nenhuma conversa nessa fila ainda.</p>
                      </div>
                    )}
                  </div>
                </aside>

                <section className="whatsapp-chat wc2" aria-label="Janela de conversa">
                  {selectedWhatsappConversation ? (
                    <>
                      {/* ── Header ── */}
                      <div className="wc2-head">
                        <button type="button" className="wc2-back" onClick={() => { setWhatsappMobileChatOpen(false); setWaChatActionsOpen(false); }} aria-label="Voltar">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                        </button>
                        <span className="wc2-avatar">{String(selectedWhatsappConversation.clienteNome || selectedWhatsappConversation.clienteTelefone || 'W').charAt(0).toUpperCase()}</span>
                        <div className="wc2-title">
                          <strong>{selectedWhatsappConversation.clienteNome || selectedWhatsappConversation.clienteTelefone}</strong>
                          <span>{selectedWhatsappConversation.clienteTelefone} • {selectedWhatsappConversation.assignedUserName || 'Fila compartilhada'}</span>
                        </div>
                        {/* Status badge — visível no desktop */}
                        <span className={`wc2-head-badge ${selectedWhatsappConversation.status === 'Finalizada' ? 'fin' : selectedWhatsappIsPending ? 'pend' : 'ativo'}`}>
                          <i></i>
                          {selectedWhatsappConversation.status === 'Finalizada' ? 'Finalizada' : selectedWhatsappIsPending ? 'Aguardando' : 'Pronto para iniciar'}
                        </span>
                        {/* Botão assumir — visível no desktop quando pendente */}
                        {selectedWhatsappIsPending && (
                          <button type="button" className="wc2-assumir-desktop" onClick={() => claimWhatsappConversation()} disabled={whatsappLoading}>
                            Assumir atendimento
                          </button>
                        )}
                        {/* Finalizar — visível no desktop */}
                        {!selectedWhatsappIsPending && selectedWhatsappConversation.status !== 'Finalizada' && (selectedWhatsappIsMine || isMasterAdmin) && (
                          <button type="button" className="wc2-finalizar-desktop" onClick={closeWhatsappConversation} disabled={whatsappLoading}>
                            Finalizar
                          </button>
                        )}
                        <div className="wa-more-wrap">
                          <button
                            type="button"
                            className="wc2-more-btn"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              setWaChatActionsOpen(value => !value);
                            }}
                            aria-label="Mais ações"
                          >
                            <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
                          </button>
                          {waChatActionsOpen && (
                            <div className="wa-more-dropdown" onClick={(event) => event.stopPropagation()}>
                              {selectedWhatsappIsPending && (
                                <button type="button" onClick={() => { claimWhatsappConversation(); setWaChatActionsOpen(false); }} disabled={whatsappLoading}>Assumir atendimento</button>
                              )}
                              {isMasterAdmin && (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    setWhatsappTransferUserId(selectedWhatsappConversation.assignedUserId || '');
                                    setWhatsappTransferOpen(true);
                                    setWaChatActionsOpen(false);
                                  }}
                                >
                                  Transferir
                                </button>
                              )}
                              {!selectedWhatsappIsPending && selectedWhatsappConversation.status !== 'Finalizada' && (selectedWhatsappIsMine || isMasterAdmin) && (
                                <button type="button" onClick={() => { closeWhatsappConversation(); setWaChatActionsOpen(false); }} disabled={whatsappLoading}>Finalizar atendimento</button>
                              )}
                              <button type="button" onClick={() => { navigatePanel({ activeTab: 'orcamentos' }); setWaChatActionsOpen(false); }}>Criar orçamento</button>
                              <a href={getPanelWhatsAppUrl(selectedWhatsappConversation.clienteTelefone)} target="_blank" rel="noopener noreferrer" onClick={() => setWaChatActionsOpen(false)}>Abrir no WhatsApp</a>
                              {canArchiveWhatsappNotLead && (
                                <button
                                  type="button"
                                  className="wa-more-danger"
                                  onMouseDown={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    archiveWhatsappConversation();
                                  }}
                                  disabled={whatsappLoading}
                                >
                                  Não é lead (arquivar)
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* ── Mensagens ── */}
                      <div className="wc2-messages">
                        {/* Status badge */}
                        <div className="wc2-status-row">
                          <span className={`wc2-status-badge ${selectedWhatsappConversation.status === 'Finalizada' ? 'finalizada' : selectedWhatsappIsPending ? 'pendente' : 'ativo'}`}>
                            <i className="wc2-status-dot"></i>
                            {selectedWhatsappConversation.status === 'Finalizada' ? 'Finalizada' : selectedWhatsappIsPending ? 'Aguardando atendimento' : 'Pronto para iniciar'}
                          </span>
                        </div>

                        {/* Card de assumir (quando pendente) */}
                        {selectedWhatsappIsPending && (
                          <div className="wc2-claim-card">
                            <div className="wc2-claim-icon">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z"/><path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>
                            </div>
                            <div className="wc2-claim-body">
                              <strong>Assuma este atendimento</strong>
                              <p>Assuma o atendimento para responder com o número oficial da DRM.</p>
                            </div>
                            <button type="button" className="wc2-claim-btn" onClick={() => claimWhatsappConversation()} disabled={whatsappLoading}>
                              Assumir atendimento
                            </button>
                          </div>
                        )}

                        {/* Loading skeleton */}
                        {whatsappLoading && whatsappMessages.length === 0 && (
                          <div className="wa-chat-loading"><span></span><span></span><span></span></div>
                        )}

                        {/* Mensagens */}
                        {whatsappMessages.map((message, index) => {
                          const currentDate = message.createdAt ? new Date(message.createdAt).toLocaleDateString('pt-BR') : '';
                          const previousDate = whatsappMessages[index - 1]?.createdAt ? new Date(whatsappMessages[index - 1].createdAt).toLocaleDateString('pt-BR') : '';
                          const isSystem = String(message.senderName || '').toLowerCase().includes('drm energia solar') || String(message.text || '').includes('*DRM ENERGIA SOLAR*');
                          const mediaUrl = getWhatsappMediaUrl(message);
                          const mediaLabel = getWhatsappMediaLabel(message);
                          const hasMedia = Boolean(message.mediaUrl || ['image', 'video', 'audio', 'document', 'sticker'].includes(message.messageType));
                          const textIsMediaLabel = ['Imagem recebida', 'Video recebido', 'Vídeo recebido', 'Audio recebido', 'Áudio recebido', 'Documento recebido', 'Figurinha recebida', 'Midia recebida', 'Mídia recebida'].includes(String(message.text || '').trim());
                          return (
                            <div key={message.id} className="wa-message-group">
                              {currentDate && currentDate !== previousDate && <div className="wa-date-separator">{currentDate}</div>}
                              <div className={`wc2-msg ${message.direction === 'outgoing' ? 'sent' : 'received'} ${isSystem ? 'system' : ''}`}>
                                {hasMedia && (
                                  <div className={`wc2-media ${message.messageType || 'media'}`}>
                                    {mediaUrl && message.messageType === 'image' && (
                                      <button type="button" className="wc2-media-image-link" onClick={() => setWhatsappMediaPreview({ url: mediaUrl, name: message.fileName || 'Imagem recebida' })}>
                                        <img src={mediaUrl} alt={message.fileName || 'Imagem recebida'} loading="lazy" />
                                      </button>
                                    )}
                                    {mediaUrl && message.messageType === 'sticker' && (
                                      <button type="button" className="wc2-media-sticker-link" onClick={() => setWhatsappMediaPreview({ url: mediaUrl, name: message.fileName || 'Figurinha recebida' })}>
                                        <img src={mediaUrl} alt={message.fileName || 'Figurinha recebida'} loading="lazy" />
                                      </button>
                                    )}
                                    {mediaUrl && message.messageType === 'video' && (
                                      <video src={mediaUrl} controls preload="metadata" />
                                    )}
                                    {mediaUrl && message.messageType === 'audio' && (
                                      <audio src={mediaUrl} controls preload="metadata" />
                                    )}
                                    {(!mediaUrl || message.messageType === 'document') && (
                                      <a
                                        className="wc2-media-file"
                                        href={mediaUrl || undefined}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        aria-disabled={!mediaUrl}
                                        onClick={(event) => { if (!mediaUrl) event.preventDefault(); }}
                                      >
                                        <span className="wc2-media-file-icon">
                                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/></svg>
                                        </span>
                                        <span>
                                          <strong>{message.fileName || mediaLabel}</strong>
                                          <small>{message.mimeType || mediaLabel}{message.fileSize ? ` • ${formatWhatsappFileSize(message.fileSize)}` : ''}</small>
                                        </span>
                                      </a>
                                    )}
                                  </div>
                                )}
                                {message.text && (!hasMedia || !textIsMediaLabel) && <p>{message.text}</p>}
                                <time>
                                  {message.createdAt ? new Date(message.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}
                                  {message.direction === 'outgoing' && (
                                    <svg viewBox="0 0 16 11" className={`wc2-check ${message.status === 'read' ? 'read' : ''}`}><path d="M11.071.603 4.285 7.389l-2.87-2.87-.945.944 3.815 3.815 7.73-7.73-.944-.945Z"/><path d="M14.8.603 8.014 7.389l-.534-.534-.944.945.944.944.944.944 7.73-7.73-.944-.945-.41-.41Z" opacity=".5"/></svg>
                                  )}
                                </time>
                              </div>
                            </div>
                          );
                        })}

                        <div ref={whatsappMessagesEndRef}></div>

                        {/* Empty state + ações rápidas */}
                        {!whatsappLoading && whatsappMessages.length === 0 && (
                          <div className="wc2-empty">
                            <div className="wc2-empty-illustration">
                              <svg viewBox="0 0 80 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <rect x="4" y="14" width="46" height="34" rx="8" fill="#f1f5f9"/>
                                <circle cx="18" cy="31" r="3" fill="#cbd5e1"/>
                                <circle cx="27" cy="31" r="3" fill="#cbd5e1"/>
                                <circle cx="36" cy="31" r="3" fill="#cbd5e1"/>
                                <rect x="28" y="6" width="46" height="34" rx="8" fill="#fff7ed"/>
                                <circle cx="42" cy="23" r="3" fill="#fb923c"/>
                                <circle cx="51" cy="23" r="3" fill="#fb923c"/>
                                <circle cx="60" cy="23" r="3" fill="#fb923c"/>
                              </svg>
                            </div>
                            <strong>Conversa pronta para iniciar</strong>
                            <p>Ainda não há mensagens nesta conversa.<br/>Assuma o atendimento para começar.</p>

                            {canReplyWhatsapp && (
                              <div className="wc2-quick-actions">
                                <span className="wc2-qa-label">Ações rápidas</span>
                                <div className="wc2-qa-row">
                                  <button type="button" className="wc2-qa-btn" onClick={() => setWhatsappReply('Olá! Sou da DRM Energia Solar. Como posso te ajudar hoje?')}>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                                    Mensagem padrão
                                  </button>
                                  <button type="button" className="wc2-qa-btn" onClick={() => setWhatsappReply('Para continuarmos, preciso do seu nome completo, cidade e o tipo de imóvel (residência ou empresa). Pode me enviar?')}>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                                    Solicitar dados
                                  </button>
                                  <button type="button" className="wc2-qa-btn" onClick={() => setWhatsappReply('Olá! Tudo bem? 😊 Aqui é da DRM Energia Solar. Vi que você tem interesse em energia solar. Vamos conversar?')}>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/><path d="M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>
                                    Enviar saudação
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* ── Compose ── */}
                      <form className="wc2-compose" onSubmit={sendWhatsappReply}>
                        {whatsappRecording ? (
                          <div className="wc2-audio-recorder recording">
                            <span className="wc2-recording-dot"></span>
                            <strong>Gravando áudio</strong>
                            <time>{Math.floor(whatsappRecordingSeconds / 60)}:{String(whatsappRecordingSeconds % 60).padStart(2, '0')}</time>
                            <button type="button" onClick={stopWhatsappRecording}>Parar</button>
                          </div>
                        ) : whatsappRecordedAudio ? (
                          <div className="wc2-audio-recorder preview">
                            <audio src={whatsappRecordedAudio.url} controls />
                            <button type="button" className="wc2-audio-cancel" onClick={clearWhatsappRecording}>Cancelar</button>
                            <button type="button" className="wc2-audio-send" onClick={sendWhatsappAudio} disabled={whatsappLoading}>Enviar áudio</button>
                          </div>
                        ) : (
                          <>
                            <button type="button" className="wc2-tool wc2-mic" title="Gravar áudio" aria-label="Gravar áudio" disabled={!canReplyWhatsapp || whatsappLoading} onClick={startWhatsappRecording}>
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8"/></svg>
                            </button>
                            <textarea
                              value={whatsappReply}
                              onChange={(event) => setWhatsappReply(event.target.value)}
                              onKeyDown={handleWhatsappReplyKeyDown}
                              placeholder="Digite uma mensagem..."
                              rows={1}
                              disabled={!canReplyWhatsapp}
                              aria-label="Mensagem"
                            />
                            <button type="submit" className="wc2-send" disabled={whatsappLoading || !whatsappReply.trim() || !canReplyWhatsapp} aria-label="Enviar mensagem">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                            </button>
                          </>
                        )}
                      </form>
                    </>
                  ) : (
                    <div className="wc2-no-chat">
                      <div className="wc2-empty-illustration">
                        <svg viewBox="0 0 80 64" fill="none"><rect x="4" y="14" width="46" height="34" rx="8" fill="#f1f5f9"/><circle cx="18" cy="31" r="3" fill="#cbd5e1"/><circle cx="27" cy="31" r="3" fill="#cbd5e1"/><circle cx="36" cy="31" r="3" fill="#cbd5e1"/><rect x="28" y="6" width="46" height="34" rx="8" fill="#fff7ed"/><circle cx="42" cy="23" r="3" fill="#fb923c"/><circle cx="51" cy="23" r="3" fill="#fb923c"/><circle cx="60" cy="23" r="3" fill="#fb923c"/></svg>
                      </div>
                      <strong>Selecione uma conversa</strong>
                      <p>Escolha um contato na lista ao lado para iniciar o atendimento.</p>
                    </div>
                  )}
                </section>
              </div>
            </div>
          )}

          {activeTab === 'leads' && (
            <div className="admin-section leads-screen leads-screen-v2">

              {/* ── Summary cards ── */}
              <div className="lsv2-summary-wrap">
                <div className="lsv2-summary-scroll">
                  <button type="button" className={`lsv2-sum-card ${leadTabFilter === 'atendimento' ? 'active' : ''}`} onClick={() => setLeadTabFilter('atendimento')}>
                    <div className="lsv2-sum-icon lsv2-icon-orange">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3C7 3 3 7 3 12v2a2 2 0 0 0 2 2h1a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1H5v-1a7 7 0 0 1 14 0v1h-1a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h1a2 2 0 0 0 2-2v-2c0-5-4-9-9-9Z"/></svg>
                    </div>
                    <span className="lsv2-sum-label">Precisam de atendimento</span>
                    <strong className="lsv2-sum-num lsv2-orange">{leadSummary.atendimento}</strong>
                  </button>
                  <button type="button" className={`lsv2-sum-card ${leadTabFilter === 'negociacao' ? 'active' : ''}`} onClick={() => setLeadTabFilter('negociacao')}>
                    <div className="lsv2-sum-icon lsv2-icon-blue">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2ZM9 11H7V9h2v2Zm4 0h-2V9h2v2Zm4 0h-2V9h2v2Z"/></svg>
                    </div>
                    <span className="lsv2-sum-label">Em negociação</span>
                    <strong className="lsv2-sum-num lsv2-blue">{leadSummary.negociacao}</strong>
                  </button>
                  <button type="button" className={`lsv2-sum-card ${leadTabFilter === 'suspensos' ? 'active' : ''}`} onClick={() => setLeadTabFilter('suspensos')}>
                    <div className="lsv2-sum-icon lsv2-icon-gray">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2Zm-1 15V7h2v10h-2Z"/></svg>
                    </div>
                    <span className="lsv2-sum-label">Suspensos</span>
                    <strong className="lsv2-sum-num lsv2-gray">{leadSummary.suspensos}</strong>
                  </button>
                  <button type="button" className={`lsv2-sum-card ${leadTabFilter === 'antigos' ? 'active' : ''}`} onClick={() => setLeadTabFilter('antigos')}>
                    <div className="lsv2-sum-icon lsv2-icon-red">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2Zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm1-13h-2v6l5.2 3.2.8-1.4-4-2.4V7Z"/></svg>
                    </div>
                    <span className="lsv2-sum-label">Sem contato há semanas</span>
                    <strong className="lsv2-sum-num lsv2-red">{leadSummary.antigos}</strong>
                  </button>
                  <button type="button" className={`lsv2-sum-card ${leadTabFilter === 'convertidos' ? 'active' : ''}`} onClick={() => setLeadTabFilter('convertidos')}>
                    <div className="lsv2-sum-icon lsv2-icon-green">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2Zm-2 14.5-4-4 1.4-1.4L10 13.7l6.6-6.6 1.4 1.4-8 8Z"/></svg>
                    </div>
                    <span className="lsv2-sum-label">Convertidos</span>
                    <strong className="lsv2-sum-num lsv2-green">{leadSummary.convertidos}</strong>
                  </button>
                </div>
              </div>

              {/* ── Tab bar ── */}
              <div className="lsv2-tab-bar">
                <button type="button" className={`lsv2-tab ${leadTabFilter === 'todos' ? 'active' : ''}`} onClick={() => setLeadTabFilter('todos')}>Todos</button>
                <button type="button" className={`lsv2-tab ${leadTabFilter === 'atendimento' ? 'active' : ''}`} onClick={() => setLeadTabFilter('atendimento')}>Atendimento <span className="lsv2-tab-count">{leadSummary.atendimento}</span></button>
                <button type="button" className={`lsv2-tab ${leadTabFilter === 'negociacao' ? 'active' : ''}`} onClick={() => setLeadTabFilter('negociacao')}>Negociação <span className="lsv2-tab-count">{leadSummary.negociacao}</span></button>
                <button type="button" className={`lsv2-tab ${leadTabFilter === 'suspensos' ? 'active' : ''}`} onClick={() => setLeadTabFilter('suspensos')}>Suspensos <span className="lsv2-tab-count">{leadSummary.suspensos}</span></button>
                <button type="button" className={`lsv2-tab ${leadTabFilter === 'antigos' ? 'active' : ''}`} onClick={() => setLeadTabFilter('antigos')}>Antigos <span className="lsv2-tab-count lsv2-tc-red">{leadSummary.antigos}</span></button>
                <button type="button" className={`lsv2-tab ${leadTabFilter === 'convertidos' ? 'active' : ''}`} onClick={() => setLeadTabFilter('convertidos')}>Convertidos <span className="lsv2-tab-count lsv2-tc-green">{leadSummary.convertidos}</span></button>
              </div>

              {/* ── Search + owner filter ── */}
              <div className="lsv2-search-bar">
                <div className="lsv2-search-wrap">
                  <svg className="lsv2-search-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 2a8 8 0 1 0 4.9 14.3l4.4 4.4 1.4-1.4-4.4-4.4A8 8 0 0 0 10 2Zm0 2a6 6 0 1 1 0 12A6 6 0 0 1 10 4Z"/></svg>
                  <input
                    className="lsv2-search-input"
                    placeholder="Buscar por nome, telefone ou cidade..."
                    value={leadSearch}
                    onChange={(e) => setLeadSearch(e.target.value)}
                  />
                </div>
                {isMasterAdmin && leadSummary.porResponsavel.length > 0 && (
                  <select className="lsv2-owner-select" value={leadOwnerFilter} onChange={(e) => setLeadOwnerFilter(e.target.value)} aria-label="Filtrar por responsável">
                    <option value="todos">Todos</option>
                    {leadSummary.porResponsavel.map(u => (
                      <option key={u.id} value={u.id}>{u.nome} ({u.total})</option>
                    ))}
                  </select>
                )}
              </div>

              {/* ── Registrar contato ── */}
              <details className="admin-card leads-rc-card leads-activity-drawer">
                <summary>
                  <span>Registrar contato</span>
                  <small>Ligação, WhatsApp, visita ou retorno</small>
                </summary>
                <form className="rc-form" onSubmit={registrarAtividade}>
                  <div className="rc-form-grid">
                    <div className="rc-field">
                      <label className="rc-label">Lead</label>
                      <select className="rc-input" value={activityForm.leadId} onChange={(event) => setActivityForm(prev => ({ ...prev, leadId: event.target.value }))} required>
                        <option value="">Escolha o lead</option>
                        {leads.map(lead => <option key={lead.id} value={lead.id}>{lead.nome} — {lead.telefone}</option>)}
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
                        <option>Tráfego pago</option>
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
              </details>

              {/* ── Lead card list ── */}
              <div className="lsv2-card-list">
                {paginatedLeads.length === 0 && (
                  <div className="empty-state-orcamento lead-empty-state">
                    <div className="icon">LD</div>
                    <h4>Nenhum lead encontrado</h4>
                    <p>Ajuste a busca ou mude o filtro.</p>
                  </div>
                )}
                {paginatedLeads.map(lead => (
                  <div key={lead.id} className="lsv2-card">
                    <div className="lsv2-card-avatar" style={{ background: getLeadAvatarColor(lead.nome) }}>
                      {getLeadInitials(lead.nome)}
                    </div>

                    <div className="lsv2-card-body">
                      <div className="lsv2-card-identity">
                        <div className="lsv2-card-name">{lead.nome}</div>
                        <div className="lsv2-card-phone">
                          {lead.telefone || 'Sem telefone'}
                          {lead.telefone && (
                            <svg className="lsv2-phone-wa-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M17.5 14.4c-.3-.1-1.7-.8-1.9-.9-.3-.1-.5-.1-.7.1-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6.1-.3-.2-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.4-.5.3-.5v-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5H8c-.2 0-.5.1-.7.3-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3 4.8 4.2.7.3 1.2.4 1.6.5.7.2 1.3.2 1.8.1.5-.1 1.7-.7 1.9-1.3.2-.6.2-1.2.1-1.3-.1-.1-.3-.2-.5-.3ZM12 2C6.5 2 2 6.5 2 12c0 1.9.5 3.6 1.4 5.1L2 22l5.1-1.3A10 10 0 0 0 12 22c5.5 0 10-4.5 10-10S17.5 2 12 2Z"/></svg>
                          )}
                        </div>
                        <div className="lsv2-card-location">
                          {lead.cidade || 'Cidade não informada'}
                          <span className={`lsv2-source-tag lsv2-src-${getLeadSourceKey(lead)}`}>{getLeadSourceLabel(lead)}</span>
                        </div>
                      </div>

                      <div className="lsv2-card-meta">
                        <div className="lsv2-meta-block">
                          <span className="lsv2-meta-label">Consultor</span>
                          {isMasterAdmin ? (
                            <select
                              className="lsv2-owner-inline"
                              value={lead.assignedUserId || ''}
                              onChange={(event) => assignLeadOwner(lead.id, event.target.value)}
                              aria-label={`Designar responsável para ${lead.nome}`}
                            >
                              <option value="">Sem responsável</option>
                              {leadAssignableUsers.map(user => (
                                <option key={user.id} value={user.id}>{user.nome}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="lsv2-meta-val">{getResponsibleName(lead.assignedUserName)}</span>
                          )}
                        </div>
                        <div className="lsv2-meta-block">
                          <span className="lsv2-meta-label">Etapa</span>
                          <span className={`lead-status-badge lsv2-etapa-badge ${getLeadStatusClass(lead.status)}`}>{lead.status || 'Novo'}</span>
                        </div>
                      </div>

                      <div className="lsv2-card-dates">
                        <div className="lsv2-meta-block">
                          <span className="lsv2-meta-label">Último contato</span>
                          <span className="lsv2-meta-val">{lead.ultimoContato ? dateBr(lead.ultimoContato) : '–'}</span>
                        </div>
                        <div className="lsv2-meta-block">
                          <span className="lsv2-meta-label">Próximo retorno</span>
                          <div className="lsv2-retorno-row">
                            <span className={`lsv2-retorno-val ${getLeadPriority(lead.proximoRetorno) === 'Alta' ? 'lsv2-retorno-urgent' : getLeadPriority(lead.proximoRetorno) === 'Média' ? 'lsv2-retorno-medium' : ''}`}>
                              {formatRetornoDate(lead.proximoRetorno)}
                            </span>
                            <span className={`lsv2-priority lsv2-pri-${getLeadPriority(lead.proximoRetorno).toLowerCase()}`}>
                              {getLeadPriority(lead.proximoRetorno)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="lsv2-card-actions">
                      <button
                        type="button"
                        className="lsv2-action-btn lsv2-wa"
                        onClick={() => openLeadInWhatsapp(lead)}
                        aria-label="Abrir chat WhatsApp"
                        title="Abrir conversa no chat interno"
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.5 14.4c-.3-.1-1.7-.8-1.9-.9-.3-.1-.5-.1-.7.1-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6.1-.3-.2-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.4-.5.3-.5v-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5H8c-.2 0-.5.1-.7.3-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3 4.8 4.2.7.3 1.2.4 1.6.5.7.2 1.3.2 1.8.1.5-.1 1.7-.7 1.9-1.3.2-.6.2-1.2.1-1.3-.1-.1-.3-.2-.5-.3ZM12 2C6.5 2 2 6.5 2 12c0 1.9.5 3.6 1.4 5.1L2 22l5.1-1.3A10 10 0 0 0 12 22c5.5 0 10-4.5 10-10S17.5 2 12 2Z"/></svg>
                      </button>
                      {lead.telefone && (
                        <a
                          className="lsv2-action-btn lsv2-call"
                          href={`tel:${String(lead.telefone || '').replace(/\D/g, '')}`}
                          aria-label="Ligar"
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8c1.4 2.8 3.8 5.2 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2Z"/></svg>
                        </a>
                      )}
                      <div className="lsv2-more-wrap">
                        <button
                          type="button"
                          className="lsv2-action-btn lsv2-more"
                          onClick={() => setOpenLeadMenu(openLeadMenu === lead.id ? null : lead.id)}
                          aria-label="Mais opções"
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
                        </button>
                        {openLeadMenu === lead.id && (
                          <div className="lsv2-more-menu">
                            <div className="lsv2-more-title">Alterar etapa</div>
                            {LEAD_STATUS_PRESETS.map(s => (
                              <button key={s} type="button" className={`lsv2-more-item ${lead.status === s ? 'active' : ''}`} onClick={() => { updateLeadStatus(lead.id, s); setOpenLeadMenu(null); }}>{s}</button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* ── Antigos sem contato ── */}
              {leadTabFilter === 'todos' && leadSummary.antigos > 0 && (
                <div className="admin-card lsv2-antigos-section">
                  <div className="lsv2-antigos-header">
                    <div className="lsv2-antigos-left">
                      <div className="lsv2-antigos-icon-wrap">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2Zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm1-13h-2v6l5.2 3.2.8-1.4-4-2.4V7Z"/></svg>
                      </div>
                      <span className="lsv2-antigos-title">Antigos sem contato</span>
                      <span className="lsv2-antigos-badge">{leadSummary.antigos}</span>
                    </div>
                    <button type="button" className="lsv2-antigos-ver-todos" onClick={() => setLeadTabFilter('antigos')}>
                      Ver todos <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/></svg>
                    </button>
                  </div>
                  <p className="lsv2-antigos-sub">Leads sem contato há mais de 7 dias. Retome agora!</p>
                  <div className="lsv2-antigos-scroll">
                    {leads
                      .filter(l => !['Convertido', 'Perdido'].includes(l.status) && (daysSinceContact(l.ultimoContato) ?? 0) >= 7)
                      .sort((a, b) => (daysSinceContact(b.ultimoContato) ?? 0) - (daysSinceContact(a.ultimoContato) ?? 0))
                      .slice(0, 6)
                      .map(lead => (
                        <div key={lead.id} className="lsv2-antigo-card">
                          <div className="lsv2-antigo-avatar" style={{ background: getLeadAvatarColor(lead.nome) }}>
                            {getLeadInitials(lead.nome)}
                          </div>
                          <div className="lsv2-antigo-name">{lead.nome}</div>
                          <div className="lsv2-antigo-city">{lead.telefone}</div>
                          <div className="lsv2-antigo-city">{lead.cidade}</div>
                          <button
                            type="button"
                            className="lsv2-antigo-call"
                            onClick={() => openLeadInWhatsapp(lead)}
                            aria-label="Abrir chat"
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.5 14.4c-.3-.1-1.7-.8-1.9-.9-.3-.1-.5-.1-.7.1-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6.1-.3-.2-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.4-.5.3-.5v-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5H8c-.2 0-.5.1-.7.3-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3 4.8 4.2.7.3 1.2.4 1.6.5.7.2 1.3.2 1.8.1.5-.1 1.7-.7 1.9-1.3.2-.6.2-1.2.1-1.3-.1-.1-.3-.2-.5-.3ZM12 2C6.5 2 2 6.5 2 12c0 1.9.5 3.6 1.4 5.1L2 22l5.1-1.3A10 10 0 0 0 12 22c5.5 0 10-4.5 10-10S17.5 2 12 2Z"/></svg>
                          </button>
                          <div className="lsv2-antigo-days">Sem contato há {daysSinceContact(lead.ultimoContato)} dias</div>
                        </div>
                      ))
                    }
                  </div>
                </div>
              )}

              {/* ── Pagination ── */}
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

              {/* ── FAB ── */}
              <button type="button" className="lsv2-fab" onClick={() => setShowManualLeadForm(true)} aria-label="Cadastrar novo lead">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 11h-6V5h-2v6H5v2h6v6h2v-6h6v-2Z"/></svg>
                <span>Lead</span>
              </button>

            </div>
          )}

          {activeTab === 'orcamentos' && isBudgetFormOpen && (
            <div className="orc-rapido-page">
              <form className="orc-rapido-card" onSubmit={createManualBudget} noValidate>

                {/* Header */}
                <div className="orc-rapido-header">
                  <div className="orc-rapido-title-area">
                    <div className="orc-rapido-icon-wrap">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2v11h3v9l7-12h-4l4-8z" fill="currentColor"/></svg>
                    </div>
                    <div>
                      <h2 className="orc-rapido-title">ORÇAMENTO RÁPIDO</h2>
                      <p className="orc-rapido-subtitle">Preencha apenas os dados essenciais para um orçamento sem compromisso.</p>
                    </div>
                  </div>
                  <div className="orc-rapido-badge">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2ZM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8ZM12.5 7H11v6l5.25 3.15.75-1.23-4.5-2.67V7Z" fill="currentColor"/></svg>
                    Rápido, simples e sem compromisso
                  </div>
                </div>

                {/* Form body */}
                <div className="orc-rapido-body">

                  {/* Row 1 — 4 columns */}
                  <div className="orc-rapido-row-4 orc-rapido-row-client">
                    <div className={`orc-rapido-field${budgetFieldErrors.clienteNome ? ' field-error' : ''}`}>
                      <label>1. Nome do cliente</label>
                      <input
                        type="text"
                        value={budgetForm.clienteNome}
                        onChange={e => { setBudgetForm(prev => ({ ...prev, clienteNome: e.target.value })); setBudgetFieldErrors(prev => ({ ...prev, clienteNome: false })); }}
                        placeholder="Ex: João da Silva"
                      />
                    </div>
                    <div className={`orc-rapido-field${budgetFieldErrors.clienteCpfCnpj ? ' field-error' : ''}`}>
                      <label>2. CPF/CNPJ <span className="orc-optional-label">(opcional)</span></label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={budgetForm.clienteCpfCnpj}
                        onChange={e => {
                          setBudgetForm(prev => ({ ...prev, clienteCpfCnpj: maskCpfCnpj(e.target.value) }));
                          setBudgetFieldErrors(prev => ({ ...prev, clienteCpfCnpj: false }));
                        }}
                        placeholder="CPF ou CNPJ"
                      />
                    </div>
                    <div className={`orc-rapido-field${budgetFieldErrors.clienteCidade ? ' field-error' : ''}`}>
                      <label>3. Cidade</label>
                      <input
                        type="text"
                        value={budgetForm.clienteCidade}
                        onChange={e => { setBudgetForm(prev => ({ ...prev, clienteCidade: e.target.value })); setBudgetFieldErrors(prev => ({ ...prev, clienteCidade: false })); }}
                        placeholder="Ex: Imperatriz"
                      />
                    </div>
                    <div className={`orc-rapido-field${budgetFieldErrors.geracaoKwh ? ' field-error' : ''}`}>
                      <label>4. Geração do sistema (kWh)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={budgetForm.geracaoKwh}
                        onChange={e => { setBudgetForm(prev => ({ ...prev, geracaoKwh: e.target.value })); setBudgetFieldErrors(prev => ({ ...prev, geracaoKwh: false })); }}
                        placeholder="Ex: 610"
                      />
                    </div>
                    <div className={`orc-rapido-field${budgetFieldErrors.valorSistema ? ' field-error' : ''}`}>
                      <label>5. Valor do projeto</label>
                      <div className="orc-rapido-currency-wrap">
                        <span className="orc-rapido-currency-prefix">R$</span>
                        <CurrencyInput
                          value={budgetForm.valorSistema}
                          onValueChange={value => { setBudgetForm(prev => ({ ...prev, valorSistema: value })); setBudgetFieldErrors(prev => ({ ...prev, valorSistema: false })); }}
                          placeholder="Ex: 24.900,00"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Row 2 — placa */}
                  <div className="orc-rapido-row-placa">
                    <div className={`orc-rapido-field${budgetFieldErrors.placaModelo ? ' field-error' : ''}`}>
                      <label>6. Modelo da placa</label>
                      <select
                        value={budgetForm.placaModelo}
                        onChange={e => {
                          const model = e.target.value;
                          const placa = placas.find(p => p.modelo === model);
                          setBudgetForm(prev => ({
                            ...prev,
                            placaModelo: model,
                            potenciaPlacaW: placa?.potencia_w ? String(placa.potencia_w) : prev.potenciaPlacaW,
                          }));
                          setBudgetFieldErrors(prev => ({ ...prev, placaModelo: false }));
                        }}
                      >
                        <option value="">Selecione o modelo</option>
                        {placaModelsFromEquip.map(model => (
                          <option key={model} value={model}>{model}</option>
                        ))}
                      </select>
                    </div>
                    <div className={`orc-rapido-field${budgetFieldErrors.numeroPaineis ? ' field-error' : ''}`}>
                      <label>7. Quantidade de placas</label>
                      <input
                        type="number"
                        min="1"
                        value={budgetForm.numeroPaineis}
                        onChange={e => { setBudgetForm(prev => ({ ...prev, numeroPaineis: e.target.value })); setBudgetFieldErrors(prev => ({ ...prev, numeroPaineis: false })); }}
                        placeholder="Ex: 14"
                      />
                    </div>
                  </div>

                  {/* Row 3 — inversor */}
                  <div className="orc-rapido-row-inversor">
                    <div className={`orc-rapido-field${budgetFieldErrors.inversorMarca ? ' field-error' : ''}`}>
                      <label>8. Marca do inversor</label>
                      <select
                        value={budgetForm.inversorMarca}
                        onChange={e => {
                          const brand = e.target.value;
                          setBudgetForm(prev => ({ ...prev, inversorMarca: brand, inversorModelo: '' }));
                          setBudgetFieldErrors(prev => ({ ...prev, inversorMarca: false, inversorModelo: false }));
                        }}
                      >
                        <option value="">Selecione a marca</option>
                        {inversorBrandsFromEquip.map(brand => (
                          <option key={brand} value={brand}>{brand}</option>
                        ))}
                      </select>
                    </div>

                    <div className="orc-rapido-arrow" aria-hidden="true">
                      <svg viewBox="0 0 56 16" width="56" height="16"><circle cx="4" cy="8" r="2" fill="#f97316"/><circle cx="13" cy="8" r="2" fill="#f97316"/><circle cx="22" cy="8" r="2" fill="#f97316"/><circle cx="31" cy="8" r="2" fill="#f97316"/><path d="M38 8h10M44 3l6 5-6 5" stroke="#f97316" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>

                    <div className={`orc-rapido-field${budgetFieldErrors.inversorModelo ? ' field-error' : ''}`}>
                      <label>9. Modelo do inversor</label>
                      <div className="orc-rapido-locked-wrap">
                        <select
                          value={budgetForm.inversorModelo}
                          onChange={e => { setBudgetForm(prev => ({ ...prev, inversorModelo: e.target.value })); setBudgetFieldErrors(prev => ({ ...prev, inversorModelo: false })); }}
                          disabled={!budgetForm.inversorMarca}
                        >
                          <option value="">{budgetForm.inversorMarca ? 'Selecione o modelo' : 'Selecione a marca primeiro'}</option>
                          {inversorModelsForBrand.map(model => (
                            <option key={model} value={model}>{model}</option>
                          ))}
                        </select>
                        {!budgetForm.inversorMarca && (
                          <svg className="orc-rapido-lock" viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" fill="currentColor"/>
                          </svg>
                        )}
                      </div>
                    </div>

                    <div className={`orc-rapido-field${budgetFieldErrors.quantidadeInversores ? ' field-error' : ''}`}>
                      <label>10. Quantidade de inversores</label>
                      <input
                        type="number"
                        min="1"
                        value={budgetForm.quantidadeInversores}
                        onChange={e => { setBudgetForm(prev => ({ ...prev, quantidadeInversores: e.target.value })); setBudgetFieldErrors(prev => ({ ...prev, quantidadeInversores: false })); }}
                        placeholder="Ex: 1"
                      />
                    </div>
                  </div>

                  {/* Inversores adicionais */}
                  {budgetForm.inversoresAdicionais.map((inv, idx) => (
                    <div key={idx} className="orc-rapido-row-inversor orc-rapido-inv-extra">
                      <div className="orc-rapido-field">
                        <label>Marca (inv. {idx + 2})</label>
                        <select
                          value={inv.marca}
                          onChange={e => {
                            const newInvs = budgetForm.inversoresAdicionais.map((it, i) => i === idx ? { ...it, marca: e.target.value, modelo: '' } : it);
                            setBudgetForm(prev => ({ ...prev, inversoresAdicionais: newInvs }));
                          }}
                        >
                          <option value="">Selecione a marca</option>
                          {inversorBrandsFromEquip.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                      </div>
                      <div className="orc-rapido-arrow" aria-hidden="true">
                        <svg viewBox="0 0 56 16" width="40" height="14"><circle cx="4" cy="8" r="2" fill="#f97316"/><circle cx="13" cy="8" r="2" fill="#f97316"/><circle cx="22" cy="8" r="2" fill="#f97316"/><path d="M28 8h10M34 3l6 5-6 5" stroke="#f97316" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </div>
                      <div className="orc-rapido-field">
                        <label>Modelo (inv. {idx + 2})</label>
                        <select
                          value={inv.modelo}
                          disabled={!inv.marca}
                          onChange={e => {
                            const newInvs = budgetForm.inversoresAdicionais.map((it, i) => i === idx ? { ...it, modelo: e.target.value } : it);
                            setBudgetForm(prev => ({ ...prev, inversoresAdicionais: newInvs }));
                          }}
                        >
                          <option value="">{inv.marca ? 'Selecione o modelo' : 'Selecione a marca primeiro'}</option>
                          {getModelsForBrand(inv.marca).map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </div>
                      <div className="orc-rapido-field orc-rapido-field-qty">
                        <label>Qtd</label>
                        <input
                          type="number"
                          min="1"
                          value={inv.quantidade}
                          onChange={e => {
                            const newInvs = budgetForm.inversoresAdicionais.map((it, i) => i === idx ? { ...it, quantidade: e.target.value } : it);
                            setBudgetForm(prev => ({ ...prev, inversoresAdicionais: newInvs }));
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        className="orc-rapido-inv-remove"
                        title="Remover este inversor"
                        onClick={() => setBudgetForm(prev => ({ ...prev, inversoresAdicionais: prev.inversoresAdicionais.filter((_, i) => i !== idx) }))}
                      >
                        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  ))}

                  {/* Botão adicionar inversor */}
                  <div className="orc-rapido-add-inv-wrap">
                    <button
                      type="button"
                      className="orc-rapido-add-inv-btn"
                      onClick={() => setBudgetForm(prev => ({ ...prev, inversoresAdicionais: [...prev.inversoresAdicionais, { marca: '', modelo: '', quantidade: '1' }] }))}
                    >
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      Adicionar outro inversor
                    </button>
                  </div>

                </div>{/* /orc-rapido-body */}

                {/* Footer */}
                <div className="orc-rapido-footer">
                  <div className="orc-rapido-disclaimer">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" fill="#f97316"/></svg>
                    <div>
                      <strong>Orçamentos sem compromisso.</strong>
                      <span> Você pode ajustar os dados depois.</span>
                    </div>
                  </div>
                  <div className="orc-rapido-actions">
                    <button
                      type="button"
                      className="orc-rapido-btn-clear"
                      onClick={() => {
                        setBudgetForm(emptyBudgetForm);
                        setBudgetFieldErrors({});
                        setBudgetStatus('');
                        localStorage.removeItem(budgetDraftStorageKey);
                        localStorage.removeItem(budgetDraftOpenStorageKey);
                      }}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" fill="currentColor"/></svg>
                      Limpar
                    </button>
                    <button type="submit" className="orc-rapido-btn-submit">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13zm-5 8v-2h8v2H8zm0-4v-2h8v2H8z" fill="currentColor"/></svg>
                      Gerar orçamento
                    </button>
                  </div>
                </div>

                {budgetStatus && (
                  <p className={`orc-rapido-status ${budgetStatus.includes('criado') || budgetStatus.includes('sucesso') ? 'orc-status-success' : 'orc-status-error'}`}>
                    {budgetStatus}
                  </p>
                )}

              </form>
            </div>
          )}

          {activeTab === 'orcamentos' && !isBudgetFormOpen && (
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
                  {paginatedOrcClientes.map(c => {
                    const totalOrcamentosCliente = orcamentos.filter(o => String(o.clienteId) === String(c.id)).length;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={`orc-client-row ${selectedOrcClient?.id === c.id ? 'active' : ''}`}
                        onClick={() => {
                          if (selectedOrcClient?.id !== c.id) rememberPanelStep();
                          setSelectedOrcClient(c);
                          setSelectedOrcamento(null);
                        }}
                      >
                        <span>{c.nome}</span>
                        <em>{totalOrcamentosCliente}</em>
                        <svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16"><path d="M9 18l6-6-6-6" strokeWidth="2" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </button>
                    );
                  })}
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
                    <h4>Orçamentos rápidos</h4>
                    <p>Selecione um cliente ao lado para o fluxo completo ou use o botão Novo orçamento para criar uma proposta rápida com poucos dados.</p>
                    <div className="quick-budget-empty-actions">
                      <button type="button" className="btn btn-primary" onClick={() => openBudgetFormForClient()}>Novo orçamento rápido</button>
                    </div>
                    {quickBudgets.length > 0 && (
                      <div className="quick-budget-list">
                        {quickBudgets.slice(0, 8).map((orc) => (
                          <div className="quick-budget-card" key={orc.id}>
                            <div>
                              <span className="quick-budget-badge">Rápido</span>
                              <strong>
                                {orc.clienteNome}
                                {orc.clienteCpfCnpj ? ` • ${orc.clienteCpfCnpj}` : ''}
                              </strong>
                              <p>{orc.clienteCidade || 'Cidade não informada'} • {orc.dimensionamento?.potencia_real_instalada_kwp || 0} kWp</p>
                            </div>
                            <div className="quick-budget-card-actions">
                              {hasPermission('contratos') && (
                                <button type="button" className="btn btn-outline btn-sm-admin" onClick={() => aprovarOrcamentoParaContrato(orc)}>
                                  Gerar contrato
                                </button>
                              )}
                              <a className="btn btn-outline btn-sm-admin" href={getOrcamentoDownloadUrl(orc.id)} target="_blank" rel="noopener noreferrer">Baixar PDF</a>
                              {hasPermission('orcamentos') && (
                                <button
                                  type="button"
                                  className="btn btn-outline btn-sm-admin quick-budget-delete"
                                  onClick={() => excluirOrcamentoTeste(orc)}
                                >
                                  Excluir teste
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
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
                                  <th>SISTEMA</th>
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
                                    onClick={() => {
                                      if (selectedOrcamento?.id === orc.id) {
                                        setSelectedOrcamento(null);
                                        return;
                                      }
                                      rememberPanelStep();
                                      setSelectedOrcamento(orc);
                                    }}
                                  >
                                    <td className="orc-td-id">#{orc.id}</td>
                                    <td>{orc.data}</td>
                                    <td>
                                      <div className="orc-system-cell">
                                        <strong>{orc.dimensionamento?.potencia_real_instalada_kwp || 0} kWp</strong>
                                        <span>{orc.dimensionamento?.numero_paineis_necessarios || 0} placas • {orc.dimensionamento?.inversor_modelo || 'Inversor'}</span>
                                      </div>
                                    </td>
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
                                            className="orc-action-btn orc-action-approve"
                                            title="Aprovar orçamento e gerar contrato"
                                            onClick={() => aprovarOrcamentoParaContrato(orc)}
                                          >
                                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.2 16.6-4.1-4.1-1.4 1.4 5.5 5.5L20.5 8.1l-1.4-1.4-9.9 9.9Z" fill="currentColor"/></svg>
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
                                          href={getPanelWhatsAppUrl(selectedOrcClient.whatsapp)}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          title="Enviar via WhatsApp"
                                        >
                                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.5 14.4c-.3-.1-1.7-.8-1.9-.9-.3-.1-.5-.1-.7.1-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6.1-.3-.2-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.4-.5.3-.5v-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5H8c-.2 0-.5.1-.7.3-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3 4.8 4.2.7.3 1.2.4 1.6.5.7.2 1.3.2 1.8.1.5-.1 1.7-.7 1.9-1.3.2-.6.2-1.2.1-1.3-.1-.1-.3-.2-.5-.3ZM12 2C6.5 2 2 6.5 2 12c0 1.9.5 3.6 1.4 5.1L2 22l5.1-1.3A10 10 0 0 0 12 22c5.5 0 10-4.5 10-10S17.5 2 12 2Z" fill="currentColor"/></svg>
                                        </a>
                                        {hasPermission('orcamentos') && (
                                          <button
                                            type="button"
                                            className="orc-action-btn orc-action-delete"
                                            title="Excluir orçamento de teste"
                                            onClick={() => excluirOrcamentoTeste(orc)}
                                          >
                                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4V2h8v2h5v2H3V4h5Zm-2 4h12l-1 14H7L6 8Zm4 3v8h2v-8h-2Zm4 0v8h2v-8h-2Z" fill="currentColor"/></svg>
                                          </button>
                                        )}
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
                            <button type="button" className="orc-bar-btn orc-bar-btn-approve" onClick={() => aprovarOrcamentoParaContrato(selectedOrcamento)}>
                              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.2 16.6-4.1-4.1-1.4 1.4 5.5 5.5L20.5 8.1l-1.4-1.4-9.9 9.9Z" fill="currentColor"/></svg>
                              Aprovar orçamento
                            </button>
                          </>
                        )}
                        <a className="orc-bar-btn" href={getOrcamentoDownloadUrl(selectedOrcamento.id)} target="_blank" rel="noopener noreferrer">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20h14v-2H5v2Zm7-18v12l-5-5-1.4 1.4L12 17l6.4-6.6L17 9l-5 5V2h-2Z" fill="currentColor"/></svg>
                          Baixar Orçamento (PDF)
                        </a>
                        <a className="orc-bar-btn orc-bar-btn-wa" href={getPanelWhatsAppUrl(selectedOrcClient.whatsapp)} target="_blank" rel="noopener noreferrer">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.5 14.4c-.3-.1-1.7-.8-1.9-.9-.3-.1-.5-.1-.7.1-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6.1-.3-.2-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.4-.5.3-.5v-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5H8c-.2 0-.5.1-.7.3-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3 4.8 4.2.7.3 1.2.4 1.6.5.7.2 1.3.2 1.8.1.5-.1 1.7-.7 1.9-1.3.2-.6.2-1.2.1-1.3-.1-.1-.3-.2-.5-.3ZM12 2C6.5 2 2 6.5 2 12c0 1.9.5 3.6 1.4 5.1L2 22l5.1-1.3A10 10 0 0 0 12 22c5.5 0 10-4.5 10-10S17.5 2 12 2Z" fill="currentColor"/></svg>
                          Enviar via WhatsApp
                        </a>
                        {hasPermission('orcamentos') && (
                          <button type="button" className="orc-bar-btn orc-bar-btn-delete" onClick={() => excluirOrcamentoTeste(selectedOrcamento)}>
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4V2h8v2h5v2H3V4h5Zm-2 4h12l-1 14H7L6 8Zm4 3v8h2v-8h-2Zm4 0v8h2v-8h-2Z" fill="currentColor"/></svg>
                            Excluir teste
                          </button>
                        )}
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
              {/* ── Page header ── */}
              <div className="ctr-page-header">
                <div>
                  <h3 className="ctr-page-title">Contratos</h3>
                  <p className="ctr-page-subtitle">Somente clientes com cadastro completo podem gerar contrato.</p>
                </div>
              </div>

              {/* ── 4-step flow indicator ── */}
              <div className="ctr-flow-steps">
                <div className="ctr-flow-step ctr-flow-step-done">
                  <div className="ctr-flow-step-num">1</div>
                  <div className="ctr-flow-step-label">Venda realizada</div>
                </div>
                <div className="ctr-flow-arrow">›</div>
                <div className="ctr-flow-step ctr-flow-step-done">
                  <div className="ctr-flow-step-num">2</div>
                  <div className="ctr-flow-step-label">Cadastro completo</div>
                </div>
                <div className="ctr-flow-arrow">›</div>
                <div className="ctr-flow-step ctr-flow-step-active">
                  <div className="ctr-flow-step-num">3</div>
                  <div className="ctr-flow-step-label">Emitir contrato</div>
                </div>
                <div className="ctr-flow-arrow">›</div>
                <div className="ctr-flow-step">
                  <div className="ctr-flow-step-num">4</div>
                  <div className="ctr-flow-step-label">Documentos para homologação</div>
                </div>
              </div>

              {/* ── Stats cards ── */}
              <div className="ctr-stats-grid">
                <div className="ctr-stat-card">
                  <div className="ctr-stat-num">{contratoSummary.total}</div>
                  <div className="ctr-stat-label">TOTAL DE CONTRATOS</div>
                  <div className="ctr-stat-desc">Contratos gerados no sistema</div>
                </div>
                <div className="ctr-stat-card ctr-stat-card-blue">
                  <div className="ctr-stat-row">
                    <div className="ctr-stat-num">{contratoSummary.pendentes}</div>
                    <div className="ctr-stat-icon ctr-icon-blue">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm1 15h-2v-2h2v2Zm0-4h-2V7h2v6Z" fill="currentColor"/></svg>
                    </div>
                  </div>
                  <div className="ctr-stat-label">AGUARDANDO ASSINATURA</div>
                  <div className="ctr-stat-desc">Contratos pendentes de aprovação</div>
                </div>
                <div className="ctr-stat-card ctr-stat-card-green">
                  <div className="ctr-stat-row">
                    <div className="ctr-stat-num">{contratoSummary.aprovados}</div>
                    <div className="ctr-stat-icon ctr-icon-green">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm-2 15-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9Z" fill="currentColor"/></svg>
                    </div>
                  </div>
                  <div className="ctr-stat-label">ASSINADOS</div>
                  <div className="ctr-stat-desc">Contratos aprovados e assinados</div>
                </div>
                <div className="ctr-stat-card ctr-stat-card-orange">
                  <div className="ctr-stat-row">
                    <div className="ctr-stat-num">{clientesAptos.length}</div>
                    <div className="ctr-stat-icon ctr-icon-orange">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12Zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8Z" fill="currentColor"/></svg>
                    </div>
                  </div>
                  <div className="ctr-stat-label">CLIENTES APTOS</div>
                  <div className="ctr-stat-desc">Cadastro completo, sem contrato</div>
                </div>
              </div>

              {/* ── Filters bar ── */}
              <div className="admin-card ctr-filters-card">
                <div className="ctr-filters-row">
                  {!isConsultorOnly && (
                    <>
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
                    </>
                  )}
                  <div className="ctr-filter-search-wrap">
                    <input
                      className="ctr-filter-search"
                      placeholder="Buscar pelo nome do cliente..."
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
                        <th>Nº CONTRATO</th>
                        <th>CLIENTE</th>
                        <th>CIDADE</th>
                        <th>SISTEMA</th>
                        <th>VALOR TOTAL</th>
                        <th>STATUS</th>
                        <th>DATA DE EMISSÃO</th>
                        <th>AÇÕES</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedContratos.map((contrato) => {
                        const year = String(contrato.dataCriacao || '').slice(0, 4) || new Date().getFullYear();
                        const numContrato = `CT-${year}-${String(contrato.id).padStart(4, '0')}`;
                        const dataFormatada = dateBr(contrato.dataCriacao);
                        const potencia = contrato.dados?.manual?.potenciaKwp ?? contrato.dados?.dimensionamento?.potencia_real_instalada_kwp ?? '';
                        const sistemaLabel = potencia ? `${potencia} kWp` : '—';
                        const statusLabel = isConsultorOnly
                          ? (contrato.status === 'Aprovado' ? 'Assinado' : contrato.status === 'Pendente' ? 'Aguardando assinatura' : contrato.status)
                          : contrato.status;
                        const statusClass = contrato.status === 'Aprovado' ? 'ctr-status-aprovado' : contrato.status === 'Recusado' ? 'ctr-status-recusado' : 'ctr-status-pendente';
                        return (
                          <tr
                            key={contrato.id}
                            onClick={() => abrirRevisaoContrato(contrato)}
                          >
                            <td className="ctr-td-num">{numContrato}</td>
                            <td className="ctr-td-cliente">{contrato.clienteNome}</td>
                            <td>{contrato.clienteCidade || '—'}</td>
                            <td>{sistemaLabel}</td>
                            <td className="ctr-td-valor">{money(contrato.valorProjeto)}</td>
                            <td>
                              <span className={`ctr-status-badge ${statusClass}`}>
                                {statusLabel}
                              </span>
                            </td>
                            <td>{dataFormatada}</td>
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
                      <p>Nenhum contrato encontrado.</p>
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
                          <label className="ctr-review-field">
                            <span>Consultor da venda</span>
                            {canEditReviewedContract(selectedContrato) ? (
                              <select
                                value={String(contractReviewForm.consultorId ?? '')}
                                onChange={(event) => updateContractConsultant(event.target.value)}
                              >
                                {contractConsultantOptions.map(option => (
                                  <option key={`${option.value}-${option.nome || 'blank'}`} value={option.value}>{option.label}</option>
                                ))}
                              </select>
                            ) : (
                              <strong>{contractReviewForm.consultorNome || 'Sem consultor'}</strong>
                            )}
                          </label>
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
                        <div>
                          <strong>Contrato liberado</strong>
                          <span>{isMasterAdmin ? 'Admin master pode salvar ajustes finais.' : 'Contrato aprovado disponível somente para download.'}</span>
                          <small className={`contract-signature-chip tone-${getContractSignatureMeta(selectedContrato).tone}`}>{getContractSignatureMeta(selectedContrato).label}</small>
                          <small className="contract-signature-chip tone-success">Assinatura DRM aplicada automaticamente na aprovação</small>
                        </div>
                        <div className="approved-actions-buttons">
                          {canEditReviewedContract(selectedContrato) && <button type="button" className="btn btn-outline" onClick={() => saveContractReview(selectedContrato)}>Salvar alterações</button>}
                          {adminUser.role === 'ADM' && <button type="button" className="btn btn-outline" onClick={() => generateContractSignatureLink(selectedContrato)}>Gerar link do cliente</button>}
                          {selectedContrato.dados?.assinatura?.link?.token && (
                            <>
                              <button
                                type="button"
                                className="btn btn-outline"
                                onClick={() => copyToClipboard(
                                  `${window.location.origin}/assinatura/contrato/${selectedContrato.dados.assinatura.link.token}`,
                                  'Link de assinatura copiado.'
                                )}
                              >
                                Copiar link
                              </button>
                              {selectedContrato.clienteTelefone && (
                                <a
                                  className="btn btn-outline"
                                  href={getPanelWhatsAppUrl(
                                    selectedContrato.clienteTelefone,
                                    `Olá ${selectedContrato.clienteNome || ''}! Aqui está o link para assinar seu contrato digital da DRM Energia Solar: ${window.location.origin}/assinatura/contrato/${selectedContrato.dados.assinatura.link.token}`
                                  )}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  Enviar para cliente
                                </a>
                              )}
                            </>
                          )}
                          <a className="btn btn-outline" href={getContratoDownloadUrl(selectedContrato.id)} target="_blank" rel="noopener noreferrer">Baixar contrato</a>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ), document.body)}

              {contractSignatureModal.open && typeof document !== 'undefined' && createPortal((
                <div className="contract-modal-backdrop ctr-review-backdrop">
                  <div className="contract-modal ctr-review-modal contract-signature-modal" role="dialog" aria-modal="true" aria-labelledby="contract-signature-title">
                    <div className="contract-modal-header">
                      <div>
                        <span>Assinatura DRM</span>
                        <h3 id="contract-signature-title">{contractSignatureModal.contract ? contractNumber(contractSignatureModal.contract) : 'Contrato'}</h3>
                        <p>Assine pela DRM e depois gere o link para o cliente concluir a assinatura digital.</p>
                      </div>
                      <button type="button" className="lead-modal-close" onClick={closeDrmSignatureModal} aria-label="Fechar">×</button>
                    </div>
                    <div className="contract-signature-form">
                      <label className="ctr-review-field">
                        <span>Responsável pela assinatura</span>
                        <input value={contractSignatureModal.signerName} onChange={(event) => setContractSignatureModal(prev => ({ ...prev, signerName: event.target.value }))} placeholder="Nome de quem está assinando pela DRM" />
                      </label>
                      <div className="contract-signature-pad">
                        <div className="contract-signature-pad-head">
                          <strong>Assinatura</strong>
                          <button type="button" className="btn btn-outline btn-sm-admin" onClick={clearContractSignatureCanvas}>Limpar</button>
                        </div>
                        <canvas
                          ref={contractSignatureCanvasRef}
                          className="contract-signature-canvas"
                          onMouseDown={startContractSignature}
                          onMouseMove={moveContractSignature}
                          onMouseUp={stopContractSignature}
                          onMouseLeave={stopContractSignature}
                          onTouchStart={startContractSignature}
                          onTouchMove={moveContractSignature}
                          onTouchEnd={stopContractSignature}
                        />
                      </div>
                      {contractSignatureModal.signatureLink && (
                        <div className="contract-signature-link-box">
                          <span>Link do cliente</span>
                          <strong>{contractSignatureModal.signatureLink}</strong>
                        </div>
                      )}
                      <div className="contract-modal-actions">
                        <button type="button" className="btn btn-outline" onClick={closeDrmSignatureModal}>Cancelar</button>
                        <button type="button" className="btn btn-outline" onClick={() => contractSignatureModal.contract && generateContractSignatureLink(contractSignatureModal.contract)}>Gerar link</button>
                        <button type="button" className="btn btn-primary" onClick={signContractAsDrm}>Salvar assinatura DRM</button>
                      </div>
                    </div>
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
                      <button type="button" className="btn btn-outline btn-sm-admin" onClick={() => navigatePanel({ activeTab: 'produtosPacotes' })}>Abrir catálogo →</button>
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
            <div className="prod-page">
              <div className="prod-hd">
                <h2 className="prod-title">Produtos</h2>
                <p className="prod-subtitle">Cadastre os modelos de placas e as marcas/modelos de inversores utilizados nos orçamentos e contratos.</p>
              </div>

              {/* Banner informativo */}
              <div className="prod-info-banner">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                A aba Produtos agora possui três grupos: <strong>Placas, Inversores e Inversor híbrido.</strong>
              </div>

              {/* Sub-abas */}
              <div className="prod-tabs">
                <button type="button" className={`prod-tab${produtoSubTab === 'placas' ? ' active' : ''}`} onClick={() => setProdutoSubTab('placas')}>
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
                  Placas
                </button>
                <button type="button" className={`prod-tab${produtoSubTab === 'inversores' ? ' active' : ''}`} onClick={() => setProdutoSubTab('inversores')}>
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
                  Inversores
                </button>
                <button type="button" className={`prod-tab${produtoSubTab === 'hibrido' ? ' active' : ''}`} onClick={() => setProdutoSubTab('hibrido')}>
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                  Inversor híbrido
                </button>
              </div>

              {/* ─── ABA PLACAS ─── */}
              {produtoSubTab === 'placas' && (
                <>
                  {/* Barra de busca */}
                  <div className="prod-search-bar">
                    <div className="prod-search-wrap">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="10" cy="10" r="7"/><line x1="21" y1="21" x2="15" y2="15"/></svg>
                      <input
                        placeholder="Buscar modelo de placa..."
                        value={placaSearch}
                        onChange={e => setPlacaSearch(e.target.value)}
                      />
                    </div>
                    <select
                      className="prod-status-select"
                      value={placaStatusFilter}
                      onChange={e => setPlacaStatusFilter(e.target.value)}
                    >
                      <option value="todos">Todos os status</option>
                      <option value="ativo">Ativo</option>
                      <option value="inativo">Inativo</option>
                    </select>
                    <button
                      type="button"
                      className="btn btn-primary prod-nova-btn"
                      onClick={() => { setEditingPlacaId(null); setPlacaForm({ modelo: '', potencia_w: '', status: 'ativo' }); }}
                    >
                      + Nova placa
                    </button>
                  </div>

                  {/* Layout duas colunas */}
                  <div className="prod-placas-layout">
                    {/* Catálogo */}
                    <div className="prod-catalog-card">
                      <div className="prod-catalog-title">Catálogo</div>
                      {placasFiltradas.length === 0 && (
                        <div className="prod-catalog-empty">Nenhuma placa encontrada.</div>
                      )}
                      {placasFiltradas.map(p => (
                        <button
                          key={p.id}
                          type="button"
                          className={`prod-catalog-item${editingPlacaId === p.id ? ' selected' : ''}`}
                          onClick={() => {
                            setEditingPlacaId(p.id);
                            setPlacaForm({ modelo: p.modelo, potencia_w: p.potencia_w || '', status: p.status });
                          }}
                        >
                          <span className="prod-catalog-item-name">{p.modelo}</span>
                          <span className={`prod-badge${p.status === 'ativo' ? ' prod-badge-ativo' : ' prod-badge-inativo'}`}>
                            {p.status === 'ativo' ? 'Ativo' : 'Inativo'}
                          </span>
                          <svg className="prod-catalog-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                        </button>
                      ))}
                      <div className="prod-catalog-note">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                        Nesta seção são cadastrados apenas modelos de placas solares.
                      </div>
                    </div>

                    {/* Formulário */}
                    <form className="prod-form-card" onSubmit={savePlaca}>
                      <div className="prod-form-accent-title">
                        <span className="prod-form-accent-bar" />
                        {editingPlacaId ? 'Editar cadastro' : 'Novo cadastro'}
                      </div>

                      <div className="prod-form-row-2">
                        <label className="prod-form-label">
                          Modelo da placa *
                          <input
                            required
                            placeholder="Ex: Canadian Solar 610W"
                            value={placaForm.modelo}
                            onChange={e => setPlacaForm(prev => ({ ...prev, modelo: e.target.value }))}
                          />
                        </label>
                        <label className="prod-form-label">
                          Potência da placa (W)
                          <input
                            type="number"
                            placeholder="Ex: 610"
                            value={placaForm.potencia_w}
                            onChange={e => setPlacaForm(prev => ({ ...prev, potencia_w: e.target.value }))}
                          />
                        </label>
                      </div>

                      <label className="prod-form-label" style={{ maxWidth: 280 }}>
                        Status *
                        <select
                          value={placaForm.status}
                          onChange={e => setPlacaForm(prev => ({ ...prev, status: e.target.value }))}
                        >
                          <option value="ativo">Ativo</option>
                          <option value="inativo">Inativo</option>
                        </select>
                      </label>

                      <div className="prod-form-btns">
                        <button
                          type="button"
                          className="prod-btn-limpar"
                          onClick={() => { setEditingPlacaId(null); setPlacaForm({ modelo: '', potencia_w: '', status: 'ativo' }); }}
                        >
                          Limpar
                        </button>
                        <button type="submit" className="prod-btn-salvar">
                          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                          Salvar cadastro
                        </button>
                      </div>
                    </form>
                  </div>
                </>
              )}

              {/* ─── ABA INVERSORES ─── */}
              {produtoSubTab === 'inversores' && (
                <>
                  <div className="prod-inv-header">
                    <div>
                      <h3 className="prod-inv-header-title">Como funciona a aba Inversores</h3>
                      <p className="prod-inv-header-sub">Nesta aba você cadastra marcas e modelos de inversores.</p>
                    </div>
                  </div>

                  <div className="prod-inv-outer">
                    {/* Esquerda: catálogos */}
                    <div className="prod-inv-left-area">
                      {/* Coluna marcas */}
                      <div className="prod-inv-col prod-inv-brands-col">
                        <div className="prod-inv-col-hd"><strong>Catálogo de marcas</strong></div>
                        {marcasInversor.length === 0 && <div className="prod-catalog-empty">Nenhuma marca.</div>}
                        {marcasInversor.map(m => (
                          <button key={m.id} type="button"
                            className={`prod-inv-brand-item${selectedMarcaId === m.id ? ' selected' : ''}`}
                            onClick={() => { setSelectedMarcaId(m.id); setModeloForm(prev => ({ ...prev, marca_id: m.id })); setEditingModeloId(null); }}>
                            <span>{m.nome_marca}</span>
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                          </button>
                        ))}
                        {showMarcaForm ? (
                          <form className="prod-inv-marca-mini" onSubmit={saveMarca}>
                            <input autoFocus required placeholder="Nome da marca" value={marcaForm.nome_marca} onChange={e => setMarcaForm(prev => ({ ...prev, nome_marca: e.target.value }))} />
                            <div className="prod-inv-marca-mini-btns">
                              <button type="submit" className="prod-inv-mini-save">Salvar</button>
                              <button type="button" className="prod-inv-mini-cancel" onClick={() => { setShowMarcaForm(false); setMarcaForm({ nome_marca: '', status: 'ativo' }); }}>Cancelar</button>
                            </div>
                          </form>
                        ) : (
                          <button type="button" className="prod-inv-nova-marca-btn" onClick={() => { setShowMarcaForm(true); setMarcaForm({ nome_marca: '', status: 'ativo' }); }}>+ Nova marca</button>
                        )}
                      </div>

                      <div className="prod-inv-arrow-sm">→</div>

                      {/* Coluna modelos */}
                      <div className="prod-inv-col prod-inv-models-col">
                        <div className="prod-inv-col-hd">
                          <strong>Modelos da marca</strong>
                          {selectedMarcaId && <span className="prod-inv-marca-selecionada">{marcasInversor.find(m => m.id === selectedMarcaId)?.nome_marca}</span>}
                        </div>
                        {!selectedMarcaId && <div className="prod-catalog-empty">Selecione uma marca.</div>}
                        {selectedMarcaId && modelosForSelectedMarca.length === 0 && <div className="prod-catalog-empty">Nenhum modelo.</div>}
                        {modelosForSelectedMarca.map(m => (
                          <button key={m.id} type="button"
                            className={`prod-inv-model-item${editingModeloId === m.id ? ' selected' : ''}`}
                            onClick={() => { setEditingModeloId(m.id); setModeloForm({ marca_id: m.marca_id, nome_modelo: m.nome_modelo, status: m.status }); }}>
                            <span>{m.nome_modelo}</span>
                            <span className={`prod-badge${m.status === 'ativo' ? ' prod-badge-ativo' : ' prod-badge-inativo'}`}>{m.status === 'ativo' ? 'Ativo' : 'Inativo'}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Direita: formulário + guia */}
                    <div className="prod-inv-right-area">
                      <form className="prod-inv-form" onSubmit={saveModelo}>
                        <div className="prod-form-accent-title"><span className="prod-form-accent-bar" />Novo cadastro de inversor</div>
                        <label className="prod-form-label">
                          Marca do inversor *
                          <select required value={modeloForm.marca_id} onChange={e => { setModeloForm(prev => ({ ...prev, marca_id: Number(e.target.value) })); setSelectedMarcaId(Number(e.target.value)); }}>
                            <option value="">Selecione a marca</option>
                            {marcasInversor.map(m => <option key={m.id} value={m.id}>{m.nome_marca}</option>)}
                          </select>
                        </label>
                        <label className="prod-form-label">
                          Modelo do inversor *
                          <input required placeholder="Ex: MIN 5000TL-X" value={modeloForm.nome_modelo} onChange={e => setModeloForm(prev => ({ ...prev, nome_modelo: e.target.value }))} />
                        </label>
                        <label className="prod-form-label">
                          Status *
                          <select value={modeloForm.status} onChange={e => setModeloForm(prev => ({ ...prev, status: e.target.value }))}>
                            <option value="ativo">Ativo</option>
                            <option value="inativo">Inativo</option>
                          </select>
                        </label>
                        <div className="prod-form-btns">
                          <button type="button" className="prod-btn-limpar" onClick={() => { setEditingModeloId(null); setModeloForm({ marca_id: selectedMarcaId || '', nome_modelo: '', status: 'ativo' }); }}>Limpar</button>
                          <button type="submit" className="prod-btn-salvar">
                            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                            Salvar cadastro
                          </button>
                        </div>
                      </form>
                      <div className="prod-inv-guide">
                        {[['Busque por marca ou modelo','Use a busca para encontrar rapidamente.'],['Selecione a marca','Veja os modelos cadastrados da marca escolhida.'],['Cadastre ou edite','Adicione novos modelos de inversores com status.']].map(([t,d],i) => (
                          <div key={i} className="prod-inv-guide-step">
                            <div className="prod-inv-guide-icon"><span>{i+1}</span></div>
                            <div><strong>{t}</strong><p>{d}</p></div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* ─── ABA INVERSOR HÍBRIDO ─── */}
              {produtoSubTab === 'hibrido' && (
                <>
                  <div className="prod-inv-header">
                    <div>
                      <h3 className="prod-inv-header-title">Inversor híbrido</h3>
                      <p className="prod-inv-header-sub">Cadastre marcas, modelos e baterias de lítio compatíveis.</p>
                    </div>
                  </div>

                  <div className="prod-inv-outer">
                    {/* Esquerda: 3 catálogos */}
                    <div className="prod-inv-left-area prod-inv-left-3col">
                      {/* Marcas */}
                      <div className="prod-inv-col">
                        <div className="prod-inv-col-hd"><strong>Catálogo de marcas</strong></div>
                        {marcasHibrido.length === 0 && <div className="prod-catalog-empty">Nenhuma marca.</div>}
                        {marcasHibrido.map(m => (
                          <button key={m.id} type="button"
                            className={`prod-inv-brand-item${selectedMarcaHibridoId === m.id ? ' selected' : ''}`}
                            onClick={() => { setSelectedMarcaHibridoId(m.id); setSelectedModeloHibridoId(null); setHibridoCadForm(prev => ({ ...prev, marca_id: m.id, modelo_hibrido_id: '' })); }}>
                            <span>{m.nome_marca}</span>
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                          </button>
                        ))}
                        {showMarcaHibridoForm ? (
                          <form className="prod-inv-marca-mini" onSubmit={saveMarcaHibrido}>
                            <input autoFocus required placeholder="Nome da marca" value={marcaHibridoForm.nome_marca} onChange={e => setMarcaHibridoForm(prev => ({ ...prev, nome_marca: e.target.value }))} />
                            <div className="prod-inv-marca-mini-btns">
                              <button type="submit" className="prod-inv-mini-save">Salvar</button>
                              <button type="button" className="prod-inv-mini-cancel" onClick={() => { setShowMarcaHibridoForm(false); setMarcaHibridoForm({ nome_marca: '', status: 'ativo' }); }}>Cancelar</button>
                            </div>
                          </form>
                        ) : (
                          <button type="button" className="prod-inv-nova-marca-btn" onClick={() => setShowMarcaHibridoForm(true)}>+ Nova marca</button>
                        )}
                      </div>

                      <div className="prod-inv-arrow-sm">→</div>

                      {/* Modelos híbridos */}
                      <div className="prod-inv-col">
                        <div className="prod-inv-col-hd">
                          <strong>Modelos do inversor híbrido</strong>
                          {selectedMarcaHibridoId && <span className="prod-inv-marca-selecionada">{marcasHibrido.find(m => m.id === selectedMarcaHibridoId)?.nome_marca}</span>}
                        </div>
                        {!selectedMarcaHibridoId && <div className="prod-catalog-empty">Selecione uma marca.</div>}
                        {selectedMarcaHibridoId && modelosHibridoForMarca.length === 0 && <div className="prod-catalog-empty">Nenhum modelo.</div>}
                        {modelosHibridoForMarca.map(m => (
                          <button key={m.id} type="button"
                            className={`prod-inv-model-item${selectedModeloHibridoId === m.id ? ' selected' : ''}`}
                            onClick={() => { setSelectedModeloHibridoId(m.id); setHibridoCadForm(prev => ({ ...prev, modelo_hibrido_id: m.id })); }}>
                            <span>{m.nome_modelo}</span>
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                          </button>
                        ))}
                        {selectedMarcaHibridoId && (showModeloHibridoForm ? (
                          <form className="prod-inv-marca-mini" onSubmit={saveModeloHibrido}>
                            <input autoFocus required placeholder="Nome do modelo" value={modeloHibridoForm.nome_modelo} onChange={e => setModeloHibridoForm(prev => ({ ...prev, nome_modelo: e.target.value, marca_id: selectedMarcaHibridoId }))} />
                            <div className="prod-inv-marca-mini-btns">
                              <button type="submit" className="prod-inv-mini-save">Salvar</button>
                              <button type="button" className="prod-inv-mini-cancel" onClick={() => setShowModeloHibridoForm(false)}>Cancelar</button>
                            </div>
                          </form>
                        ) : (
                          <button type="button" className="prod-inv-nova-marca-btn" onClick={() => setShowModeloHibridoForm(true)}>+ Novo modelo</button>
                        ))}
                      </div>

                      <div className="prod-inv-arrow-sm">→</div>

                      {/* Baterias compatíveis */}
                      <div className="prod-inv-col">
                        <div className="prod-inv-col-hd">
                          <strong>Baterias de lítio compatíveis</strong>
                          {selectedModeloHibridoId && <span className="prod-inv-marca-selecionada">{modelosHibrido.find(m => m.id === selectedModeloHibridoId)?.nome_modelo}</span>}
                        </div>
                        {!selectedModeloHibridoId && <div className="prod-catalog-empty">Selecione um modelo.</div>}
                        {selectedModeloHibridoId && bateriasForModelo.length === 0 && <div className="prod-catalog-empty">Nenhuma bateria.</div>}
                        {bateriasForModelo.map(b => (
                          <div key={b.id} className="prod-inv-model-item" style={{ cursor: 'default' }}>
                            <span>{b.nome_bateria}{b.capacidade_kwh ? ` ${b.capacidade_kwh} kWh` : ''}</span>
                            <span className={`prod-badge${b.status === 'ativo' ? ' prod-badge-ativo' : ' prod-badge-inativo'}`}>{b.status === 'ativo' ? 'Ativo' : 'Inativo'}</span>
                          </div>
                        ))}
                        {selectedModeloHibridoId && (showBateriaForm ? (
                          <form className="prod-inv-marca-mini" onSubmit={saveBateria}>
                            <input autoFocus required placeholder="Nome da bateria" value={bateriaForm.nome_bateria} onChange={e => setBateriaForm(prev => ({ ...prev, nome_bateria: e.target.value, modelo_hibrido_id: selectedModeloHibridoId }))} />
                            <input type="number" step="0.01" placeholder="Capacidade kWh" value={bateriaForm.capacidade_kwh} onChange={e => setBateriaForm(prev => ({ ...prev, capacidade_kwh: e.target.value }))} />
                            <div className="prod-inv-marca-mini-btns">
                              <button type="submit" className="prod-inv-mini-save">Salvar</button>
                              <button type="button" className="prod-inv-mini-cancel" onClick={() => setShowBateriaForm(false)}>Cancelar</button>
                            </div>
                          </form>
                        ) : (
                          <button type="button" className="prod-inv-nova-marca-btn" onClick={() => setShowBateriaForm(true)}>+ Nova bateria</button>
                        ))}
                      </div>
                    </div>

                    {/* Direita: formulário + guia */}
                    <div className="prod-inv-right-area">
                      <form className="prod-inv-form" onSubmit={saveHibridoCad}>
                        <div className="prod-form-accent-title"><span className="prod-form-accent-bar" />Novo cadastro híbrido</div>
                        <label className="prod-form-label">
                          Marca do inversor híbrido *
                          <select required value={hibridoCadForm.marca_id} onChange={e => { const id = Number(e.target.value); setSelectedMarcaHibridoId(id); setSelectedModeloHibridoId(null); setHibridoCadForm(prev => ({ ...prev, marca_id: id, modelo_hibrido_id: '' })); }}>
                            <option value="">Selecione a marca</option>
                            {marcasHibrido.map(m => <option key={m.id} value={m.id}>{m.nome_marca}</option>)}
                          </select>
                        </label>
                        <label className="prod-form-label">
                          Modelo do inversor híbrido *
                          <select required value={hibridoCadForm.modelo_hibrido_id} onChange={e => { const id = Number(e.target.value); setSelectedModeloHibridoId(id); setHibridoCadForm(prev => ({ ...prev, modelo_hibrido_id: id })); }}>
                            <option value="">Selecione o modelo</option>
                            {modelosHibridoForMarca.map(m => <option key={m.id} value={m.id}>{m.nome_modelo}</option>)}
                          </select>
                        </label>
                        <label className="prod-form-label">
                          Bateria de lítio compatível *
                          <input required placeholder="Ex: Dyness 5,12 kWh" value={hibridoCadForm.nome_bateria} onChange={e => setHibridoCadForm(prev => ({ ...prev, nome_bateria: e.target.value }))} />
                        </label>
                        <label className="prod-form-label">
                          Capacidade da bateria (kWh)
                          <input type="number" step="0.01" placeholder="Ex: 5,12" value={hibridoCadForm.capacidade_kwh} onChange={e => setHibridoCadForm(prev => ({ ...prev, capacidade_kwh: e.target.value }))} />
                        </label>
                        <label className="prod-form-label">
                          Status *
                          <select value={hibridoCadForm.status} onChange={e => setHibridoCadForm(prev => ({ ...prev, status: e.target.value }))}>
                            <option value="ativo">Ativo</option>
                            <option value="inativo">Inativo</option>
                          </select>
                        </label>
                        <div className="prod-form-btns">
                          <button type="button" className="prod-btn-limpar" onClick={() => setHibridoCadForm({ marca_id: '', modelo_hibrido_id: '', nome_bateria: '', capacidade_kwh: '', status: 'ativo' })}>Limpar</button>
                          <button type="submit" className="prod-btn-salvar">
                            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                            Salvar cadastro
                          </button>
                        </div>
                      </form>
                      <div className="prod-inv-guide">
                        {[['Cadastre a marca','Adicione a marca do inversor híbrido.'],['Cadastre o modelo híbrido','Vincule o modelo à marca cadastrada.'],['Vincule as baterias compatíveis','Adicione baterias compatíveis com o modelo.']].map(([t,d],i) => (
                          <div key={i} className="prod-inv-guide-step">
                            <div className="prod-inv-guide-icon"><span>{i+1}</span></div>
                            <div><strong>{t}</strong><p>{d}</p></div>
                          </div>
                        ))}
                        <div className="prod-inv-guide-note">
                          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                          Esses cadastros serão utilizados nos fluxos futuros de orçamentos e propostas.
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
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
                  <button type="button" className="btn btn-outline" onClick={handlePanelBack}>
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
                                <tr key={projeto.id} className="homo-row-clickable" onClick={() => { rememberPanelStep(); setSelectedProjeto(projeto); setHomoView('detalhes'); setHomoDetalheTab('cliente'); }}>
                                  <td className="homo-protocolo">SP-{String(projeto.contratoId || projeto.id).padStart(4,'0')}</td>
                                  <td className="font-medium homo-nome">{projeto.clienteNome}</td>
                                  <td>{projeto.clienteCidade || '—'}</td>
                                  <td>{getResponsibleName(projeto.responsavelNome)}</td>
                                  <td><span className={`homo-badge ${statusDocClass}`}>{statusDoc}</span></td>
                                  <td><span className={`homo-etapa-badge ${etapaClass}`}>{projeto.etapa}</span></td>
                                  <td className="homo-date">{projeto.updatedAt ? new Date(projeto.updatedAt).toLocaleDateString('pt-BR') : '—'}</td>
                                  <td className="homo-next-action">{nextAction}</td>
                                  <td>
                                    <button type="button" className="btn btn-outline btn-sm-admin" onClick={e => { e.stopPropagation(); rememberPanelStep(); setSelectedProjeto(projeto); setHomoView('detalhes'); setHomoDetalheTab('cliente'); }}>
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
                                          {doc.localizacaoCliente && (
                                            <p className="homo-location-line">
                                              <span>Localização:</span>
                                              <a href={getClientLocationHref(doc.localizacaoCliente)} target="_blank" rel="noopener noreferrer">
                                                Abrir no mapa
                                              </a>
                                            </p>
                                          )}
                                        </td>
                                        <td className="homo-arquivo-cell">
                                          {doc.dataUrl ? (
                                            <button type="button" className="homo-file-link" onClick={() => openProjetoDocumento(doc)}>
                                              {doc.arquivo || 'Ver arquivo'}
                                            </button>
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
                                                if (!validateProjetoDocumentFile(file)) {
                                                  e.target.value = '';
                                                  return;
                                                }
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
                                  <div className="homo-location-field">
                                    <input
                                      className="cc-input"
                                      placeholder="Localização do cliente (link do Maps ou endereço)"
                                      value={homoDocUpload.localizacaoCliente}
                                      onChange={e => setHomoDocUpload(prev => ({ ...prev, localizacaoCliente: e.target.value }))}
                                    />
                                    <button type="button" className="btn btn-outline btn-sm-admin" onClick={attachCurrentLocationToHomoDoc}>
                                      Usar GPS
                                    </button>
                                  </div>
                                  <label className="homo-file-upload-btn">
                                    {homoDocUpload.arquivo ? homoDocUpload.arquivo.name : 'Selecionar arquivo'}
                                    <input type="file" style={{display:'none'}} accept=".pdf,.jpg,.jpeg,.png" onChange={e => {
                                      const file = e.target.files[0] || null;
                                      if (file && !validateProjetoDocumentFile(file)) {
                                        e.target.value = '';
                                        return;
                                      }
                                      setHomoDocUpload(prev => ({ ...prev, arquivo: file }));
                                    }} />
                                  </label>
                                  <button
                                    type="button"
                                    className="btn btn-primary"
                                    disabled={!(homoDocUpload.nome.trim() || homoDocUpload.localizacaoCliente.trim()) || homoDocUploadLoading}
                                    onClick={() => {
                                      const normalizedName = homoDocUpload.nome.trim() || 'Localização do cliente';
                                      const docPayload = {
                                        nome: normalizedName,
                                        descricao: homoDocUpload.descricao,
                                        localizacaoCliente: homoDocUpload.localizacaoCliente,
                                      };
                                      if (!homoDocUpload.arquivo) {
                                        uploadProjetoDocumento(selectedProjeto.id, tipo, docPayload);
                                      } else {
                                        const reader = new FileReader();
                                        reader.onload = ev => uploadProjetoDocumento(selectedProjeto.id, tipo, { ...docPayload, dataUrl: ev.target.result, arquivo: homoDocUpload.arquivo.name });
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
                                        <td>{doc.dataUrl ? <button type="button" className="homo-file-link" onClick={() => openProjetoDocumento(doc)}>{doc.arquivo || 'Ver'}</button> : '—'}</td>
                                        <td>{doc.responsavel || '—'}</td>
                                        <td>{doc.data || '—'}</td>
                                        <td><span className={`homo-badge ${doc.status === 'Concluído' ? 'homo-badge-completo' : 'homo-badge-pendente'}`}>{doc.status}</span></td>
                                        <td>
                                          <label className="btn btn-outline btn-sm-admin">Subir
                                            <input type="file" style={{display:'none'}} onChange={e => {
                                              const file = e.target.files[0]; if (!file) return;
                                              if (!validateProjetoDocumentFile(file)) {
                                                e.target.value = '';
                                                return;
                                              }
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
                                  <input className="cc-input" placeholder="Ex: Parecer de acesso, Protocolo..." value={homoDocUpload.tipo === 'concessionaria' ? homoDocUpload.nome : ''} onChange={e => setHomoDocUpload({ tipo: 'concessionaria', nome: e.target.value, descricao: '', localizacaoCliente: '', arquivo: null })} />
                                  <label className="homo-file-upload-btn">
                                    {homoDocUpload.tipo === 'concessionaria' && homoDocUpload.arquivo ? homoDocUpload.arquivo.name : 'Selecionar arquivo'}
                                    <input type="file" style={{display:'none'}} accept=".pdf,.jpg,.jpeg,.png" onChange={e => {
                                      const file = e.target.files[0] || null;
                                      if (file && !validateProjetoDocumentFile(file)) {
                                        e.target.value = '';
                                        return;
                                      }
                                      setHomoDocUpload(prev => ({ ...prev, tipo: 'concessionaria', arquivo: file }));
                                    }} />
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
            <div className="os-page inst-page">
              {/* Page Header */}
              <div className="os-page-hd">
                <div>
                  <h3>Instalações</h3>
                  <p>Organize entregas, fila de instalação, agenda, equipes e evidências do campo.</p>
                </div>
                <button type="button" className="btn btn-primary" onClick={() => setInstNovaOpen(true)}>
                  + Nova instalação
                </button>
              </div>

              {/* KPI Chips */}
              <div className="os-kpis">
                <button type="button" className={`os-kpi${!instStatusFilter ? ' active' : ''}`} onClick={() => { setInstStatusFilter(''); setInstPage(1); }}>
                  <span className="os-kpi-icon">📋</span>
                  <div className="os-kpi-body"><span className="os-kpi-num">{instSummary.total}</span><span className="os-kpi-label">Projetos</span></div>
                </button>
                <button type="button" className={`os-kpi${instStatusFilter === 'Em transporte' ? ' active' : ''}`} onClick={() => { setInstStatusFilter('Em transporte'); setInstPage(1); }}>
                  <span className="os-kpi-icon">🚚</span>
                  <div className="os-kpi-body"><span className="os-kpi-num">{instSummary.emTransporte}</span><span className="os-kpi-label">Equipamento enviado</span></div>
                </button>
                <button type="button" className={`os-kpi${instStatusFilter === 'Equipamento entregue' ? ' active' : ''}`} onClick={() => { setInstStatusFilter('Equipamento entregue'); setInstPage(1); }}>
                  <span className="os-kpi-icon">📦</span>
                  <div className="os-kpi-body"><span className="os-kpi-num">{instSummary.entregue}</span><span className="os-kpi-label">Equipamento entregue</span></div>
                </button>
                <button type="button" className={`os-kpi${instStatusFilter === 'Aguardando instalação' ? ' active' : ''}`} onClick={() => { setInstStatusFilter('Aguardando instalação'); setInstPage(1); }}>
                  <span className="os-kpi-icon">⏰</span>
                  <div className="os-kpi-body"><span className="os-kpi-num">{instSummary.aguardandoAgendamento}</span><span className="os-kpi-label">Aguardando agendamento</span></div>
                </button>
                <button type="button" className={`os-kpi${instStatusFilter === 'Instalação agendada' ? ' active' : ''}`} onClick={() => { setInstStatusFilter('Instalação agendada'); setInstPage(1); }}>
                  <span className="os-kpi-icon">📅</span>
                  <div className="os-kpi-body"><span className="os-kpi-num">{instSummary.agendada}</span><span className="os-kpi-label">Instalação agendada</span></div>
                </button>
                <button type="button" className={`os-kpi${instStatusFilter === 'Em instalação' ? ' active' : ''}`} onClick={() => { setInstStatusFilter('Em instalação'); setInstPage(1); }}>
                  <span className="os-kpi-icon">🔧</span>
                  <div className="os-kpi-body"><span className="os-kpi-num">{instSummary.emInstalacao}</span><span className="os-kpi-label">Em andamento</span></div>
                </button>
                <button type="button" className={`os-kpi${instStatusFilter === 'Reagendada' ? ' active' : ''}`} onClick={() => { setInstStatusFilter('Reagendada'); setInstPage(1); }}>
                  <span className="os-kpi-icon">🔄</span>
                  <div className="os-kpi-body"><span className="os-kpi-num">{instSummary.reagendada}</span><span className="os-kpi-label">Reagendadas</span></div>
                </button>
                <button type="button" className={`os-kpi success${instStatusFilter === 'Concluída' ? ' active' : ''}`} onClick={() => { setInstStatusFilter('Concluída'); setInstPage(1); }}>
                  <span className="os-kpi-icon">✅</span>
                  <div className="os-kpi-body"><span className="os-kpi-num">{instSummary.concluida}</span><span className="os-kpi-label">Concluídas</span></div>
                </button>
              </div>

              {/* Filter Bar */}
              <div className="os-hfilter">
                <input
                  type="text"
                  placeholder="Pesquisar cliente, contrato ou telefone"
                  value={instSearch}
                  onChange={(e) => { setInstSearch(e.target.value); setInstPage(1); }}
                />
                <select value={instCidadeFilter} onChange={(e) => { setInstCidadeFilter(e.target.value); setInstPage(1); }}>
                  <option value="">Cidade</option>
                  {instCidades.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={instInstaladorFilter} onChange={(e) => { setInstInstaladorFilter(e.target.value); setInstPage(1); }}>
                  <option value="">Instalador</option>
                  {usuarios.filter(u => u.active && (u.role === 'ADM' || u.permissions?.equipeTecnica)).map(u => (
                    <option key={u.id} value={String(u.id)}>{u.nome}</option>
                  ))}
                </select>
                <select value={instStatusFilter} onChange={(e) => { setInstStatusFilter(e.target.value); setInstPage(1); }}>
                  <option value="">Status</option>
                  {INST_STATUS_FLOW_MEMO.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <input
                  type="date"
                  value={instDataFilter}
                  onChange={(e) => { setInstDataFilter(e.target.value); setInstPage(1); }}
                  title="Data da instalação"
                />
                <button type="button" className="os-clear-btn" onClick={() => { setInstSearch(''); setInstCidadeFilter(''); setInstInstaladorFilter(''); setInstStatusFilter(''); setInstDataFilter(''); setInstPage(1); }}>
                  Limpar
                </button>
                <div style={{marginLeft:'auto'}}>
                  <button type="button" className="btn btn-primary" onClick={() => setInstNovaOpen(true)}>+ Nova instalação</button>
                </div>
              </div>

              {/* Table */}
              <div className="os-table-wrap inst-table-wrap">
                <table className="os-tbl">
                  <thead>
                    <tr>
                      <th></th>
                      <th>Cliente / Contrato</th>
                      <th>Cidade / UF</th>
                      <th>Placas</th>
                      <th>Inversor</th>
                      <th>Endereço</th>
                      <th>Entrega</th>
                      <th>Pres. instalação</th>
                      <th>Equipe / Instalador</th>
                      <th>Status</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedInstalacoes.map((p, idx) => {
                      const instStatus = getInstStatusForNew(p);
                      const initials = (p.clienteNome || '??').slice(0,2).toUpperCase();
                      const avatarColors = ['#e87c1e','#3b82f6','#10b981','#8b5cf6','#f59e0b','#ef4444','#06b6d4','#ec4899'];
                      const avatarColor = avatarColors[idx % avatarColors.length];
                      const mapsUrl = p.clienteEndereco ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.clienteEndereco)}` : null;
                      const entregaOk = Boolean(p.equipamentoEntregueAt || p.checklist?.equipamentoEntregue);
                      return (
                        <tr key={p.id} className={instSelectedId === p.id ? 'is-selected' : ''} onClick={() => setInstSelectedId(prev => prev === p.id ? null : p.id)}>
                          <td onClick={e => e.stopPropagation()}>
                            <div className="inst-avatar" style={{background: avatarColor}}>{initials}</div>
                          </td>
                          <td>
                            <div className="os-td-name">{p.clienteNome}</div>
                            <div className="os-td-phone">#{p.contratoId}{p.clienteTelefone ? ` • ${p.clienteTelefone}` : ''}</div>
                          </td>
                          <td>{p.clienteCidade || '—'}</td>
                          <td>
                            <div className="inst-placas-num">{p.quantidadePlacas || '—'}</div>
                            {p.quantidadePlacas ? <div className="os-td-phone">placas</div> : null}
                          </td>
                          <td>
                            <div className="os-td-name">{p.inversor || p.potenciaInversor || '—'}</div>
                            <div className="os-td-phone">{p.modeloInversor || ''}</div>
                          </td>
                          <td>
                            {mapsUrl
                              ? <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="inst-maps-link" onClick={e => e.stopPropagation()}>📍 {p.clienteEndereco}</a>
                              : <span style={{color:'#94a3b8'}}>—</span>
                            }
                          </td>
                          <td>
                            {p.equipamentoEnviadoAt ? (
                              <div>
                                <div>{dateBr(p.equipamentoEnviadoAt)}</div>
                                {entregaOk && <span className="inst-check">✅</span>}
                              </div>
                            ) : '—'}
                          </td>
                          <td>
                            {p.instalacaoAgendada ? (
                              <div>
                                <div>{dateBr(p.instalacaoAgendada)}</div>
                                <div className="os-td-phone">{new Date(p.instalacaoAgendada).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</div>
                              </div>
                            ) : '—'}
                          </td>
                          <td>
                            <div>
                              <span style={{marginRight:'0.3rem'}}>👥</span>
                              <span className="os-td-name">{p.responsavelNome || '—'}</span>
                            </div>
                          </td>
                          <td>
                            <span className={`inst-badge inst-badge-${instStatus.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'')}`}>{instStatus}</span>
                          </td>
                          <td onClick={e => e.stopPropagation()} style={{position:'relative'}}>
                            <button
                              type="button"
                              className="os-three-dot"
                              onClick={(e) => { e.stopPropagation(); setInstActionsOpen(prev => prev === p.id ? null : p.id); }}
                            >···</button>
                            {instActionsOpen === p.id && (
                              <div className="inst-actions-dropdown">
                                <button type="button" onClick={() => { setSelectedProjeto(p); setInstActionsOpen(null); rememberPanelStep(); }}>Ver detalhes</button>
                                <button type="button" onClick={() => { updateProjeto(p.id, { equipamentoEntregueAt: new Date().toISOString() }); setInstActionsOpen(null); }}>Confirmar entrega</button>
                                <button type="button" onClick={() => { const d = prompt('Data/hora da instalação (AAAA-MM-DDTHH:MM):'); if (d) updateProjeto(p.id, { instalacaoAgendada: d }); setInstActionsOpen(null); }}>Agendar</button>
                                <button type="button" onClick={() => { const d = prompt('Nova data/hora (AAAA-MM-DDTHH:MM):'); if (d) updateProjeto(p.id, { instalacaoAgendada: d }); setInstActionsOpen(null); }}>Reagendar</button>
                                <button type="button" onClick={() => setInstActionsOpen(null)}>Registrar pendência</button>
                                <button type="button" onClick={() => setInstActionsOpen(null)}>Histórico</button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!filteredInstalacoes.length && (
                  <div className="os-tbl-empty">
                    <strong>Nenhuma instalação encontrada</strong>
                    <span>Ajuste os filtros ou cadastre uma nova instalação.</span>
                  </div>
                )}
                <div className="os-tbl-footer">
                  <span>
                    Mostrando {filteredInstalacoes.length === 0 ? 0 : (instPage - 1) * INST_PER_PAGE + 1} a {Math.min(instPage * INST_PER_PAGE, filteredInstalacoes.length)} de {filteredInstalacoes.length} resultados
                  </span>
                  <div className="os-pagination">
                    <button type="button" className="os-pg-btn" disabled={instPage <= 1} onClick={() => setInstPage(p => p - 1)}>‹</button>
                    {Array.from({length: Math.max(1, Math.ceil(filteredInstalacoes.length / INST_PER_PAGE))}, (_, i) => i + 1).map(pg => (
                      <button key={pg} type="button" className={`os-pg-btn${instPage === pg ? ' active' : ''}`} onClick={() => setInstPage(pg)}>{pg}</button>
                    ))}
                    <button type="button" className="os-pg-btn" disabled={instPage >= Math.ceil(filteredInstalacoes.length / INST_PER_PAGE)} onClick={() => setInstPage(p => p + 1)}>›</button>
                  </div>
                </div>
              </div>

              {/* Bottom 3-panel section */}
              <div className="inst-bottom-panels">
                {/* Panel 1: Agenda */}
                <div className="inst-panel">
                  <div className="inst-panel-hd">
                    <strong>Agenda de instalações</strong>
                    <div className="inst-agenda-tabs">
                      <button type="button" className={instAgendaTab === 'hoje' ? 'active' : ''} onClick={() => setInstAgendaTab('hoje')}>Hoje</button>
                      <button type="button" className={instAgendaTab === 'amanha' ? 'active' : ''} onClick={() => setInstAgendaTab('amanha')}>Amanhã</button>
                    </div>
                  </div>
                  <div className="inst-agenda-list">
                    {instAgendaList.length === 0 && (
                      <div className="inst-empty-state">
                        <span>📅</span>
                        <p>Nenhuma instalação {instAgendaTab === 'hoje' ? 'hoje' : 'amanhã'}.</p>
                      </div>
                    )}
                    {instAgendaList.map(p => (
                      <div key={p.id} className="inst-agenda-item">
                        <div className="inst-agenda-time">
                          {p.instalacaoAgendada ? new Date(p.instalacaoAgendada).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '--:--'}
                        </div>
                        <div className="inst-agenda-info">
                          <div className="inst-agenda-name">{p.clienteNome}</div>
                          <div className="inst-agenda-addr">{p.clienteEndereco || p.clienteCidade || '—'}</div>
                          <div className="inst-agenda-modules">{p.quantidadePlacas ? `${p.quantidadePlacas} módulos` : ''}</div>
                        </div>
                        <button type="button" className="inst-agenda-ver" onClick={() => { setSelectedProjeto(p); rememberPanelStep(); }}>Ver detalhes</button>
                      </div>
                    ))}
                  </div>
                  {instAgendaList.length > 0 && (
                    <div className="inst-panel-footer">
                      <button type="button" className="inst-panel-link">Ver agenda completa &rsaquo;</button>
                    </div>
                  )}
                </div>

                {/* Panel 2: Checklist e evidências */}
                <div className="inst-panel">
                  <div className="inst-panel-hd">
                    <strong>Checklist e evidências</strong>
                  </div>
                  <div className="inst-checklist-list">
                    {[
                      { key: 'fachada', label: 'Fachada' },
                      { key: 'telhado', label: 'Telhado' },
                      { key: 'medidor', label: 'Medidor da concessionária' },
                      { key: 'antesInstalacao', label: 'Antes da instalação' },
                      { key: 'depoisInstalacao', label: 'Depois da instalação' },
                      { key: 'inversor', label: 'Inversor' },
                      { key: 'quadroEletrico', label: 'Quadro elétrico' },
                    ].map(item => (
                      <label key={item.key} className="inst-check-row">
                        <input
                          type="checkbox"
                          checked={Boolean(instChecklistState[item.key])}
                          onChange={e => setInstChecklistState(prev => ({ ...prev, [item.key]: e.target.checked }))}
                        />
                        <span>{item.label}</span>
                      </label>
                    ))}
                  </div>
                  <div className="inst-photo-gallery">
                    {['Fachada','Telhado','Medidor','Área de instalação','Inversor'].map(lbl => (
                      <div key={lbl} className="inst-photo-thumb">
                        <div className="inst-photo-placeholder">🖼</div>
                        <span>{lbl}</span>
                      </div>
                    ))}
                    <button type="button" className="inst-photo-add">
                      <span>+</span>
                      <span>Adicionar foto</span>
                    </button>
                  </div>
                </div>

                {/* Panel 3: Próxima instalação */}
                <div className="inst-panel">
                  <div className="inst-panel-hd">
                    <strong>Próxima instalação</strong>
                  </div>
                  {instProxima ? (
                    <div className="inst-proxima">
                      <div className="inst-proxima-tag">
                        {(() => {
                          const today = new Date(); today.setHours(0,0,0,0);
                          const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate()+1);
                          const d = new Date(instProxima.instalacaoAgendada); d.setHours(0,0,0,0);
                          if (d.getTime() === today.getTime()) return 'Hoje';
                          if (d.getTime() === tomorrow.getTime()) return 'Amanhã';
                          return dateBr(instProxima.instalacaoAgendada);
                        })()}
                      </div>
                      <div className="inst-proxima-name">{instProxima.clienteNome}</div>
                      <div className="inst-proxima-addr">📍 {instProxima.clienteEndereco || instProxima.clienteCidade || '—'}</div>
                      <div className="inst-proxima-sys">
                        {instProxima.quantidadePlacas ? `${instProxima.quantidadePlacas} módulos` : ''}
                        {instProxima.inversor ? ` • ${instProxima.inversor}` : ''}
                      </div>
                      <div className="inst-proxima-team">
                        <span>👥</span>
                        <span>{instProxima.responsavelNome || '—'}</span>
                        {instProxima.clienteTelefone && <span> • {instProxima.clienteTelefone}</span>}
                      </div>
                      {instProxima.observacoes && (
                        <div className="inst-proxima-obs">
                          <div className="inst-proxima-obs-label">Observações da equipe</div>
                          <p>{instProxima.observacoes}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="inst-empty-state">
                      <span>📅</span>
                      <p>Nenhuma instalação agendada.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Detail view (reuses existing project detail, shown below panels) */}
              {selectedProjeto && (
                <div className="project-detail-page inst-detail-overlay">
                  <div className="project-detail-toolbar">
                    <button type="button" className="btn btn-outline" onClick={() => { setSelectedProjeto(null); setInstSelectedId(null); }}>
                      ← Voltar para instalações
                    </button>
                    <div>
                      <span className="section-kicker">Contrato #{selectedProjeto.contratoId}</span>
                      <h3>{selectedProjeto.clienteNome}</h3>
                      <p>{selectedProjeto.clienteCidade || 'Cidade não informada'} • {getResponsibleName(selectedProjeto.responsavelNome)}</p>
                    </div>
                  </div>

                  <div className="project-detail-modal project-detail-inline">
                    <div className="project-detail-grid">
                      <div className="detalhe-item highlight"><span className="detalhe-titulo">Valor</span><span className="detalhe-valor">{money(selectedProjeto.valorProjeto)}</span></div>
                      <div className="detalhe-item"><span className="detalhe-titulo">Status</span><span className="detalhe-valor">{getInstallationStage(selectedProjeto)}</span></div>
                      <div className="detalhe-item"><span className="detalhe-titulo">Prazo</span><span className="detalhe-valor">{dateBr(selectedProjeto.prazoPrevisto)}</span></div>
                      <div className="detalhe-item"><span className="detalhe-titulo">Prioridade</span><span className="detalhe-valor">{selectedProjeto.prioridade || 'Normal'}</span></div>
                      <div className="detalhe-item"><span className="detalhe-titulo">Equipamento enviado</span><span className="detalhe-valor">{dateBr(selectedProjeto.equipamentoEnviadoAt) || 'Pendente'}</span></div>
                      <div className="detalhe-item"><span className="detalhe-titulo">Ligação</span><span className="detalhe-valor">{dateBr(selectedProjeto.medidorTrocadoAt) || 'Aguardando concessionária'}</span></div>
                    </div>

                    <div className="project-modal-controls">
                      <label>
                        Status atual
                        <select value={getInstallationStage(selectedProjeto)} onChange={(event) => updateProjetoInstalacao(selectedProjeto, event.target.value)}>
                          {installationStages.map(option => <option key={option}>{option}</option>)}
                        </select>
                      </label>
                      <label>
                        Prazo previsto
                        <input type="date" value={selectedProjeto.prazoPrevisto || ''} onChange={(event) => updateProjeto(selectedProjeto.id, { prazoPrevisto: event.target.value })} />
                      </label>
                      <label>
                        Equipamento enviado em
                        <input type="datetime-local" value={selectedProjeto.equipamentoEnviadoAt ? String(selectedProjeto.equipamentoEnviadoAt).slice(0, 16) : ''} onChange={(event) => updateProjeto(selectedProjeto.id, { equipamentoEnviadoAt: event.target.value })} />
                      </label>
                      <label>
                        Equipamento entregue em
                        <input type="datetime-local" value={selectedProjeto.equipamentoEntregueAt ? String(selectedProjeto.equipamentoEntregueAt).slice(0, 16) : ''} onChange={(event) => updateProjeto(selectedProjeto.id, { equipamentoEntregueAt: event.target.value, checklist: { ...(selectedProjeto.checklist || {}), equipamentoEntregue: Boolean(event.target.value) } })} />
                      </label>
                      <label>
                        Instalação agendada
                        <input type="datetime-local" value={selectedProjeto.instalacaoAgendada ? String(selectedProjeto.instalacaoAgendada).slice(0, 16) : ''} onChange={(event) => updateProjeto(selectedProjeto.id, { instalacaoAgendada: event.target.value })} />
                      </label>
                      <label>
                        Instalação concluída em
                        <input type="date" value={selectedProjeto.instalacaoConcluidaAt ? String(selectedProjeto.instalacaoConcluidaAt).slice(0, 10) : ''} onChange={(event) => updateProjeto(selectedProjeto.id, { instalacaoConcluidaAt: event.target.value, checklist: { ...(selectedProjeto.checklist || {}), instalacao: Boolean(event.target.value), vistoriaFinal: Boolean(event.target.value) } })} />
                      </label>
                      <label>
                        Pedido de ligação em
                        <input type="date" value={selectedProjeto.pedidoLigacaoAt ? String(selectedProjeto.pedidoLigacaoAt).slice(0, 10) : ''} onChange={(event) => updateProjeto(selectedProjeto.id, { pedidoLigacaoAt: event.target.value, checklist: { ...(selectedProjeto.checklist || {}), homologacao: Boolean(event.target.value) } })} />
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
                      <button type="button" onClick={() => updateProjetoInstalacao(selectedProjeto, 'Equipamento enviado')}>Marcar envio</button>
                      <button type="button" onClick={() => updateProjetoInstalacao(selectedProjeto, 'Equipamento entregue')}>Marcar entrega</button>
                      <button type="button" onClick={() => updateProjetoInstalacao(selectedProjeto, 'Instalação concluída')}>Concluir instalação</button>
                      <button type="button" onClick={() => updateProjetoInstalacao(selectedProjeto, 'Ligação realizada pela concessionária')}>Confirmar ligação</button>
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
                          <button
                            key={foto.id}
                            type="button"
                            className="vistoria-photo"
                            onClick={() => openProjetoDocumento({ dataUrl: foto.dataUrl, arquivo: foto.descricao || 'Foto da vistoria' })}
                          >
                            <img src={foto.dataUrl} alt={foto.descricao || 'Foto da vistoria'} />
                          </button>
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

              {/* Nova Instalação modal */}
              {instNovaOpen && (
                <div className="inst-modal-backdrop" onClick={() => setInstNovaOpen(false)}>
                  <div className="inst-modal" onClick={e => e.stopPropagation()}>
                    <div className="inst-modal-hd">
                      <strong>Nova Instalação</strong>
                      <button type="button" className="os-panel-close" onClick={() => setInstNovaOpen(false)}>✕</button>
                    </div>
                    <div className="inst-modal-body">
                      <p style={{color:'#64748b',fontSize:'0.9rem'}}>Selecione um contrato existente para criar o registro de instalação.</p>
                      <div className="os-info-grid" style={{marginTop:'1rem'}}>
                        <div className="os-info-item">
                          <label>Cliente / Contrato</label>
                          <select style={{width:'100%',height:38,borderRadius:10,border:'1px solid #dce2ea',padding:'0 0.75rem',fontSize:'0.87rem',background:'#f8fafc'}}>
                            <option value="">Selecione um contrato...</option>
                            {contratos.filter(c => c.status === 'Aprovado').map(c => (
                              <option key={c.id} value={c.id}>{c.clienteNome} — #{c.id}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div style={{marginTop:'1.5rem',display:'flex',justifyContent:'flex-end',gap:'0.5rem'}}>
                        <button type="button" className="btn btn-outline" onClick={() => setInstNovaOpen(false)}>Cancelar</button>
                        <button type="button" className="btn btn-primary" onClick={() => setInstNovaOpen(false)}>Criar instalação</button>
                      </div>
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
            <div className="os-page">
              {/* Page Header */}
              <div className="os-page-hd">
                <div>
                  <h3>O.S. e suporte</h3>
                  <p>Gerencie chamados, atendimentos técnicos e pós-venda.</p>
                </div>
                <button type="button" className="btn btn-primary" onClick={() => { setOsDrawerOpen(true); setOsDrawerStep(1); setOsForm(createEmptyOsForm()); setOsClienteMode('existente'); setOsClienteSearch(''); }}>
                  + Nova O.S.
                </button>
              </div>
              {/* KPI Indicators */}
              <div className="os-kpis">
                <button type="button" className={`os-kpi${osStatusFilter === 'Aguardando triagem' ? ' active' : ''}`} onClick={() => { setOsStatusFilter('Aguardando triagem'); setOsAtrasadasOnly(false); setOsPage(1); }}>
                  <span className="os-kpi-icon">📋</span>
                  <div className="os-kpi-body">
                    <span className="os-kpi-num">{osSummary.triagem}</span>
                    <span className="os-kpi-label">Aguardando triagem</span>
                  </div>
                </button>
                <button type="button" className={`os-kpi${osStatusFilter === 'Agendada' ? ' active' : ''}`} onClick={() => { setOsStatusFilter('Agendada'); setOsAtrasadasOnly(false); setOsPage(1); }}>
                  <span className="os-kpi-icon">📅</span>
                  <div className="os-kpi-body">
                    <span className="os-kpi-num">{osSummary.agendadas}</span>
                    <span className="os-kpi-label">Agendadas</span>
                  </div>
                </button>
                <button type="button" className={`os-kpi${['Em atendimento','Equipe a caminho'].includes(osStatusFilter) ? ' active' : ''}`} onClick={() => { setOsStatusFilter('Em atendimento'); setOsAtrasadasOnly(false); setOsPage(1); }}>
                  <span className="os-kpi-icon">🔧</span>
                  <div className="os-kpi-body">
                    <span className="os-kpi-num">{osSummary.andamento}</span>
                    <span className="os-kpi-label">Em atendimento</span>
                  </div>
                </button>
                <button type="button" className={`os-kpi${osStatusFilter === 'Com pendência' ? ' active' : ''}`} onClick={() => { setOsStatusFilter('Com pendência'); setOsAtrasadasOnly(false); setOsPage(1); }}>
                  <span className="os-kpi-icon">⏸️</span>
                  <div className="os-kpi-body">
                    <span className="os-kpi-num">{osSummary.comPendencia}</span>
                    <span className="os-kpi-label">Com pendência</span>
                  </div>
                </button>
                <button type="button" className={`os-kpi danger${osAtrasadasOnly ? ' active' : ''}`} onClick={() => { setOsStatusFilter('todos'); setOsAtrasadasOnly(prev => !prev); setOsPage(1); }}>
                  <span className="os-kpi-icon">⚠️</span>
                  <div className="os-kpi-body">
                    <span className="os-kpi-num">{osSummary.atrasadas}</span>
                    <span className="os-kpi-label">Atrasadas</span>
                  </div>
                </button>
                <button type="button" className={`os-kpi success${osStatusFilter === 'Concluída' ? ' active' : ''}`} onClick={() => { setOsStatusFilter('Concluída'); setOsAtrasadasOnly(false); setOsPage(1); }}>
                  <span className="os-kpi-icon">✅</span>
                  <div className="os-kpi-body">
                    <span className="os-kpi-num">{osSummary.concluidasNoMes}</span>
                    <span className="os-kpi-label">Concluídas no mês</span>
                  </div>
                </button>
              </div>

              {/* Horizontal Filter Bar */}
              <div className="os-hfilter">
                <input
                  type="text"
                  placeholder="Pesquisar cliente, telefone ou O.S."
                  value={osSearch}
                  onChange={(event) => { setOsSearch(event.target.value); setOsPage(1); }}
                />
                <select value={osStatusFilter} onChange={(event) => { setOsStatusFilter(event.target.value); setOsAtrasadasOnly(false); setOsPage(1); }}>
                  <option value="todos">Status</option>
                  {OS_STATUS_FLOW.map(status => <option key={status} value={status}>{status}</option>)}
                </select>
                <select value={osTipoFilter} onChange={(event) => { setOsTipoFilter(event.target.value); setOsPage(1); }}>
                  <option value="todos">Categoria</option>
                  {OS_MOTIVO_OPTIONS.map(tipo => <option key={tipo} value={tipo}>{tipo}</option>)}
                </select>
                <select value={osPriorityFilter} onChange={(event) => { setOsPriorityFilter(event.target.value); setOsPage(1); }}>
                  <option value="todas">Prioridade</option>
                  {OS_PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <select value={osResponsavelFilter} onChange={(event) => { setOsResponsavelFilter(event.target.value); setOsPage(1); }}>
                  <option value="todos">Técnico</option>
                  {usuarios.filter(u => u.active && (u.role === 'ADM' || u.permissions?.equipeTecnica || u.permissions?.ordensServico)).map(u => (
                    <option key={u.id} value={u.id}>{u.nome}</option>
                  ))}
                </select>
                <select value={osCidadeFilter} onChange={(event) => { setOsCidadeFilter(event.target.value); setOsPage(1); }}>
                  <option value="todas">Cidade</option>
                  {osCities.map(city => <option key={city} value={city}>{city}</option>)}
                </select>
                <div className="os-hfilter-divider" />
                <div className="os-hfilter-period">
                  <input type="date" value={osDataFrom} onChange={(event) => { setOsDataFrom(event.target.value); setOsPage(1); }} title="De" />
                  <span>–</span>
                  <input type="date" value={osDataTo} onChange={(event) => { setOsDataTo(event.target.value); setOsPage(1); }} title="Até" />
                </div>
                <div className="os-hfilter-divider" />
                <button type="button" className="os-more-filter-btn" onClick={() => setOsShowMoreFilters(prev => !prev)}>
                  Mais filtros {osShowMoreFilters ? '▲' : '▼'}
                </button>
                <button type="button" className="os-clear-btn" onClick={() => { setOsSearch(''); setOsStatusFilter('todos'); setOsPriorityFilter('todas'); setOsResponsavelFilter('todos'); setOsCidadeFilter('todas'); setOsTipoFilter('todos'); setOsDataFrom(''); setOsDataTo(''); setOsSistemaFilter(''); setOsContratoFilter(''); setOsAtrasadasOnly(false); setOsPage(1); }}>
                  Limpar filtros
                </button>
              </div>
              {osShowMoreFilters && (
                <div className="os-more-filters-panel">
                  <input
                    placeholder="Sistema / Potência"
                    value={osSistemaFilter}
                    onChange={(event) => { setOsSistemaFilter(event.target.value); setOsPage(1); }}
                  />
                  <input
                    placeholder="Contrato"
                    value={osContratoFilter}
                    onChange={(event) => { setOsContratoFilter(event.target.value); setOsPage(1); }}
                  />
                  <label>
                    <input type="checkbox" checked={osAtrasadasOnly} onChange={(event) => { setOsAtrasadasOnly(event.target.checked); setOsPage(1); }} />
                    Só atrasadas
                  </label>
                </div>
              )}

              {/* Inner Tabs */}
              <div className="os-inner-tabs">
                {[
                  { key: 'ordensServico', label: 'Ordens de serviço' },
                  { key: 'agenda', label: 'Agenda técnica' },
                  { key: 'materiais', label: 'Materiais' },
                  { key: 'relatorios', label: 'Relatórios' },
                ].map(tab => (
                  <button key={tab.key} type="button" className={`os-inner-tab${osInnerTab === tab.key ? ' active' : ''}`} onClick={() => setOsInnerTab(tab.key)}>
                    {tab.label}
                  </button>
                ))}
              </div>

              {osInnerTab !== 'ordensServico' && (
                <div className="os-tab-placeholder">
                  <strong>Em breve</strong>
                  <span>Esta funcionalidade está sendo desenvolvida.</span>
                </div>
              )}

              {osInnerTab === 'ordensServico' && (
                <div className="os-split">
                  {/* OS Table */}
                  <div className={`os-list-pane${selectedOsId ? ' narrowed' : ''}`}>
                    <div className="os-table-wrap">
                      <table className="os-tbl">
                        <thead>
                          <tr>
                            <th>O.S.</th>
                            <th>Cliente</th>
                            <th>Cidade/UF</th>
                            <th>Categoria</th>
                            <th>Prioridade</th>
                            <th>Responsável</th>
                            <th>Status</th>
                            <th>Abertura</th>
                            <th>Prazo</th>
                            <th>Últ. atualiz.</th>
                            <th>Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            const pageItems = filteredOrdensServico.slice((osPage - 1) * 10, osPage * 10);
                            if (!pageItems.length) return null;
                            return pageItems.map((os) => {
                              const details = createDefaultOsDados(os);
                              const prazo = details.atendimento?.prazoMaximo || details.atendimento?.dataDesejada || '';
                              const isOverdue = prazo && !['Concluída','Encerrada','Cancelada','Serviço concluído','Validada pelo cliente'].includes(os.status) && new Date(prazo).setHours(0,0,0,0) < new Date().setHours(0,0,0,0);
                              return (
                                <tr
                                  key={os.id}
                                  className={selectedOsId === os.id ? 'is-selected' : ''}
                                  onClick={() => { setSelectedOsId(os.id); setOsPanelTab('Resumo'); }}
                                >
                                  <td style={{fontWeight:600,color:'#e87c1e'}}>{os.numeroOs || '—'}</td>
                                  <td>
                                    <div className="os-td-name">{os.clienteNome || '—'}</div>
                                    <div className="os-td-phone">{os.clienteTelefone || ''}</div>
                                  </td>
                                  <td>{details.cliente?.cidade || '—'}</td>
                                  <td>{details.motivo || os.categoria || '—'}</td>
                                  <td>
                                    <span className={`status-chip${os.prioridade === 'Urgente' ? ' danger' : os.prioridade === 'Alta' ? ' warning' : ''}`}>{os.prioridade || 'Normal'}</span>
                                  </td>
                                  <td>{os.responsavelNome || details.atendimento?.tecnicoEquipe || '—'}</td>
                                  <td>
                                    <span className={`status-chip${['Em atendimento','Equipe a caminho'].includes(os.status) ? ' status-em-atendimento' : ['Encerrada','Serviço concluído','Validada pelo cliente','Concluída'].includes(os.status) ? ' status-concluida' : os.status === 'Cancelada' ? ' danger' : os.status === 'Agendada' ? ' status-agendada' : ''}`}>{os.status}</span>
                                  </td>
                                  <td>
                                    <div>{dateBr(os.dataAbertura)}</div>
                                    <div className="os-td-phone">{os.dataAbertura ? new Date(os.dataAbertura).toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'}) : ''}</div>
                                  </td>
                                  <td style={isOverdue ? {color:'#dc2626',fontWeight:700} : {}}>{prazo ? dateBr(prazo) : '—'}</td>
                                  <td>{os.dataUltimaAtualizacao ? dateBr(os.dataUltimaAtualizacao) : '—'}</td>
                                  <td onClick={(e) => e.stopPropagation()}>
                                    {(() => {
                                      return (
                                        <div style={{position:'relative',display:'inline-block'}}>
                                          <button
                                            type="button"
                                            className="os-three-dot"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setSelectedOsId(prev => prev === os.id ? null : os.id);
                                            }}
                                            title="Ações"
                                          >
                                            ···
                                          </button>
                                        </div>
                                      );
                                    })()}
                                  </td>
                                </tr>
                              );
                            });
                          })()}
                        </tbody>
                      </table>
                      {!filteredOrdensServico.length && (
                        <div className="os-tbl-empty">
                          <strong>Nenhuma O.S encontrada</strong>
                          <span>Ajuste os filtros ou abra uma nova ordem.</span>
                        </div>
                      )}
                    </div>
                    <div className="os-tbl-footer">
                      <span>{filteredOrdensServico.length} orde{filteredOrdensServico.length === 1 ? 'm' : 'ns'}</span>
                      <div className="os-pagination">
                        <button type="button" className="os-pg-btn" disabled={osPage <= 1} onClick={() => setOsPage(prev => prev - 1)}>‹</button>
                        {Array.from({length: Math.ceil(filteredOrdensServico.length / 10)}, (_, i) => i + 1).map(p => (
                          <button key={p} type="button" className={`os-pg-btn${osPage === p ? ' active' : ''}`} onClick={() => setOsPage(p)}>{p}</button>
                        ))}
                        <button type="button" className="os-pg-btn" disabled={osPage >= Math.ceil(filteredOrdensServico.length / 10)} onClick={() => setOsPage(prev => prev + 1)}>›</button>
                      </div>
                    </div>
                  </div>

                  {/* Detail Side Panel */}
                  {selectedOsId && selectedOs && (
                    <div className="os-detail-pane" key={selectedOs.id}>
                      <div className="os-panel-hd">
                        <div>
                          <div className="os-panel-number">{selectedOs.numeroOs}</div>
                          <span className={`status-chip${['Em atendimento','Equipe a caminho'].includes(selectedOs.status) ? ' status-em-atendimento' : ['Encerrada','Serviço concluído','Validada pelo cliente','Concluída'].includes(selectedOs.status) ? ' status-concluida' : selectedOs.status === 'Cancelada' ? ' danger' : selectedOs.status === 'Agendada' ? ' status-agendada' : ''}`}>{selectedOs.status}</span>
                        </div>
                        <button type="button" className="os-panel-close" onClick={() => setSelectedOsId(null)}>✕</button>
                      </div>
                      <div className="os-panel-client">
                        <strong>{selectedOs.clienteNome}</strong>
                        <div className="os-panel-client-row">
                          <span>📞</span>
                          <span>{selectedOs.clienteTelefone || 'Sem telefone'}</span>
                        </div>
                        <div className="os-panel-client-row">
                          <span>📍</span>
                          <span>{selectedOsDados.cliente?.cidade || '—'}</span>
                        </div>
                      </div>
                      <div className="os-panel-meta">
                        <div className="os-panel-meta-item">
                          <span>Categoria</span>
                          <span>{selectedOsDados.motivo || selectedOs.categoria || '—'}</span>
                        </div>
                        <div className="os-panel-meta-item">
                          <span>Prioridade</span>
                          <span>{selectedOs.prioridade || 'Normal'}</span>
                        </div>
                        <div className="os-panel-meta-item">
                          <span>Responsável</span>
                          <span>{selectedOs.responsavelNome || '—'}</span>
                        </div>
                        <div className="os-panel-meta-item">
                          <span>Abertura</span>
                          <span>{dateBr(selectedOs.dataAbertura)}</span>
                        </div>
                      </div>
                      <div className="os-panel-tabs">
                        {['Resumo','Histórico','Evidências','Materiais','Comunicação'].map(tab => (
                          <button key={tab} type="button" className={`os-panel-tab${osPanelTab === tab ? ' active' : ''}`} onClick={() => setOsPanelTab(tab)}>
                            {tab}
                          </button>
                        ))}
                      </div>
                      <div className="os-panel-body">
                        {osPanelTab === 'Resumo' && (
                          <div>
                            <div className="os-info-item" style={{marginBottom:'0.75rem'}}>
                              <label>Descrição do problema</label>
                              <textarea
                                defaultValue={selectedOsDados.descricaoProblema}
                                placeholder="Descrição detalhada do problema"
                                onBlur={(event) => updateSelectedOsDados({ ...selectedOsDados, descricaoProblema: event.target.value }, { problema: event.target.value })}
                              />
                            </div>
                            <div className="os-info-grid">
                              <div className="os-info-item">
                                <label>Sistema</label>
                                <input defaultValue={selectedOsDados.cliente?.sistema} placeholder="Sistema" onBlur={(event) => updateSelectedOsField('cliente', 'sistema', event.target.value)} />
                              </div>
                              <div className="os-info-item">
                                <label>Contrato</label>
                                <input defaultValue={selectedOsDados.cliente?.contratoNumero || selectedOs.contratoId} placeholder="Contrato" onBlur={(event) => updateSelectedOsField('cliente', 'contratoNumero', event.target.value)} />
                              </div>
                              <div className="os-info-item">
                                <label>Data instalação</label>
                                <input type="date" defaultValue={selectedOsDados.cliente?.dataInstalacao} onBlur={(event) => updateSelectedOsField('cliente', 'dataInstalacao', event.target.value)} />
                              </div>
                              <div className="os-info-item">
                                <label>Consultor</label>
                                <input defaultValue={selectedOsDados.cliente?.consultor} placeholder="Consultor" onBlur={(event) => updateSelectedOsField('cliente', 'consultor', event.target.value)} />
                              </div>
                            </div>
                            <div style={{marginBottom:'0.5rem'}}>
                              <label style={{fontSize:'0.72rem',fontWeight:700,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'0.04em',display:'block',marginBottom:'0.35rem'}}>Fluxo de status</label>
                              <div className="os-status-flow-row">
                                {['Aguardando triagem','Planejada','Agendada','Em atendimento','Com pendência','Concluída','Encerrada'].map(status => (
                                  <button key={status} type="button" className={`os-sflow-btn${selectedOs.status === status ? ' active' : ''}`} onClick={() => updateOrdemServico(selectedOs.id, { status })}>
                                    {status}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                        {osPanelTab === 'Histórico' && (
                          <div>
                            <div style={{display:'flex',gap:'0.75rem',marginBottom:'0.75rem',alignItems:'flex-start'}}>
                              <div style={{width:10,height:10,borderRadius:'50%',background:'#e87c1e',flexShrink:0,marginTop:4}}></div>
                              <div>
                                <div style={{fontWeight:600,fontSize:'0.87rem'}}>O.S. criada</div>
                                <div style={{fontSize:'0.78rem',color:'#64748b'}}>{dateBr(selectedOs.dataAbertura)}</div>
                              </div>
                            </div>
                          </div>
                        )}
                        {osPanelTab === 'Evidências' && (
                          <div>
                            <div className="os-evidence-upload" style={{marginBottom:'0.75rem'}}>
                              <select value={osEvidenceUploadType} onChange={(event) => setOsEvidenceUploadType(event.target.value)}>
                                <option>Foto antes do serviço</option>
                                <option>Foto durante o serviço</option>
                                <option>Foto depois do serviço</option>
                                <option>Vídeo do problema</option>
                                <option>Foto do inversor</option>
                                <option>Documento técnico</option>
                              </select>
                              <label className="btn btn-outline os-upload-btn">
                                Selecionar arquivo
                                <input type="file" accept=".pdf,image/jpeg,image/png" multiple hidden onChange={(event) => { uploadOsEvidencias(selectedOs.id, event.target.files); event.target.value = ''; }} />
                              </label>
                            </div>
                            <div className="os-evidence-grid">
                              {(selectedOs.fotos || []).map((foto) => (
                                <article key={foto.id} className="os-evidence-card">
                                  <button type="button" className="os-evidence-preview" onClick={() => openOsEvidencePreview(foto)}>
                                    {String(foto.mimeType || '').startsWith('image/') ? (
                                      <img src={foto.dataUrl} alt={foto.descricao || foto.tipo || 'Evidência'} />
                                    ) : (
                                      <span className="os-evidence-file">PDF</span>
                                    )}
                                  </button>
                                  <div><strong>{foto.tipo || 'Evidência'}</strong><span>{foto.descricao || 'Arquivo enviado'}</span></div>
                                  <div className="table-actions">
                                    <button type="button" className="btn btn-outline btn-sm-admin" onClick={() => openOsEvidencePreview(foto)}>Ver</button>
                                    <button type="button" className="btn btn-danger btn-sm-admin" onClick={() => removeOsEvidencia(selectedOs.id, foto.id)}>Remover</button>
                                  </div>
                                </article>
                              ))}
                              {!selectedOs.fotos?.length && (
                                <div className="empty-inline"><strong>Sem evidências</strong><span>Envie fotos e documentos.</span></div>
                              )}
                            </div>
                          </div>
                        )}
                        {osPanelTab === 'Materiais' && (
                          <div>
                            <div className="os-info-item">
                              <label>Materiais prévios</label>
                              <textarea defaultValue={selectedOsDados.atendimento?.materiaisPrevios} placeholder="Materiais necessários" onBlur={(event) => updateSelectedOsField('atendimento', 'materiaisPrevios', event.target.value)} />
                            </div>
                            <div className="os-info-item" style={{marginTop:'0.5rem'}}>
                              <label>Peças / materiais utilizados</label>
                              <textarea defaultValue={selectedOsDados.relatorio?.pecasMateriais} placeholder="O que foi utilizado" onBlur={(event) => updateSelectedOsField('relatorio', 'pecasMateriais', event.target.value)} />
                            </div>
                          </div>
                        )}
                        {osPanelTab === 'Comunicação' && (
                          <div>
                            {selectedOs.clienteTelefone ? (
                              <a
                                className="btn btn-primary"
                                style={{display:'block',marginBottom:'0.75rem',textAlign:'center',textDecoration:'none'}}
                                href={getPanelWhatsAppUrl(selectedOs.clienteTelefone, `Olá! Sou da DRM Energia Solar. Estamos acompanhando sua ${selectedOs.numeroOs}.`)}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                💬 Abrir WhatsApp
                              </a>
                            ) : (
                              <p style={{color:'#94a3b8',fontSize:'0.87rem'}}>Sem telefone cadastrado.</p>
                            )}
                            <div className="os-info-item">
                              <label>Observações internas</label>
                              <textarea
                                defaultValue={selectedOsDados.atendimento?.observacoesInternas}
                                placeholder="Notas internas..."
                                onBlur={(event) => updateSelectedOsDados({ ...selectedOsDados, atendimento: { ...selectedOsDados.atendimento, observacoesInternas: event.target.value } }, { observacoes: event.target.value })}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="os-panel-actions">
                        <button type="button" className="btn btn-primary btn-sm-admin" onClick={() => updateOrdemServico(selectedOs.id, { status: 'Em atendimento' })}>Iniciar atendimento</button>
                        <button type="button" className="btn btn-outline btn-sm-admin" onClick={() => updateOrdemServico(selectedOs.id, { status: 'Concluída' })}>Concluir</button>
                        <button type="button" className="btn btn-outline btn-sm-admin" onClick={() => updateOrdemServico(selectedOs.id, { status: 'Encerrada' })}>Encerrar O.S.</button>
                        <button type="button" className="btn btn-danger btn-sm-admin" onClick={() => updateOrdemServico(selectedOs.id, { status: 'Cancelada' })}>Cancelar</button>
                        <button type="button" className="btn btn-outline btn-sm-admin" onClick={printOsReport}>Gerar PDF</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'esteiraSistemasFV' && (
            <div className="admin-section sfv-section">
              {/* Header */}
              <div className="sfv-header">
                <div>
                  <h3 className="sfv-title">Esteira de Sistemas FV</h3>
                  <p className="sfv-subtitle">Acompanhe cada sistema fotovoltaico da venda até a ligação pela concessionária.</p>
                </div>
                <div className="sfv-header-actions">
                  <button
                    type="button"
                    className={`sfv-view-btn${sfvView === 'kanban' ? ' active' : ''}`}
                    onClick={() => setSfvView('kanban')}
                  >Kanban</button>
                  <button
                    type="button"
                    className={`sfv-view-btn${sfvView === 'tabela' ? ' active' : ''}`}
                    onClick={() => setSfvView('tabela')}
                  >Tabela</button>
                </div>
              </div>

              {/* Stats cards */}
              <div className="sfv-stats-row">
                {[
                  { label: 'Vendas fechadas', key: 'Venda concluída', color: '#f97316' },
                  { label: 'Em homologação', key: 'Homologação', color: '#3b82f6' },
                  { label: 'Entrega agendada', key: 'Entrega', color: '#f59e0b' },
                  { label: 'Instalação agendada', key: 'Instalação', color: '#10b981' },
                  { label: 'Aguardando ligação', key: 'Ligação', color: '#06b6d4' },
                  { label: 'Sistemas ligados', key: 'Concluído', color: '#22c55e' },
                  { label: 'Atrasados/atenção', key: '__atrasados__', color: '#ef4444' },
                ].map(({ label, key, color }) => (
                  <button
                    key={key}
                    type="button"
                    className={`sfv-stat-card${(sfvFilter === (key === '__atrasados__' ? 'atrasados' : key === 'Venda concluída' ? 'vendas' : key.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,''))) ? ' active' : ''}`}
                    style={{ borderTopColor: color }}
                    onClick={() => setSfvFilter(key === '__atrasados__' ? 'atrasados' : key === 'Venda concluída' ? 'vendas' : key === 'Homologação' ? 'homologacao' : key === 'Entrega' ? 'entrega' : key === 'Instalação' ? 'instalacao' : key === 'Ligação' ? 'ligacao' : key === 'Concluído' ? 'concluido' : 'todos')}
                  >
                    <strong className="sfv-stat-num" style={{ color }}>
                      {key === '__atrasados__' ? sfvResumo.atrasados : (sfvResumo.porEtapa[key] || 0)}
                    </strong>
                    <span className="sfv-stat-label">{label}</span>
                  </button>
                ))}
              </div>

              {/* Filter tabs */}
              <div className="sfv-filter-tabs">
                {[
                  { id: 'todos', label: 'Todos' },
                  { id: 'vendas', label: 'Vendas' },
                  { id: 'homologacao', label: 'Homologação' },
                  { id: 'entrega', label: 'Entrega' },
                  { id: 'instalacao', label: 'Instalação' },
                  { id: 'ligacao', label: 'Ligação' },
                  { id: 'concluido', label: 'Concluído' },
                  { id: 'atrasados', label: 'Atrasados' },
                ].map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`sfv-ftab${sfvFilter === tab.id ? ' active' : ''}`}
                    onClick={() => setSfvFilter(tab.id)}
                  >{tab.label}</button>
                ))}
              </div>

              {/* Filter bar */}
              <div className="sfv-filter-bar">
                <input
                  type="text"
                  className="sfv-search"
                  placeholder="Pesquisar cliente, cidade ou consultor..."
                  value={sfvSearch}
                  onChange={e => setSfvSearch(e.target.value)}
                />
                <select className="sfv-select" value={sfvConsultorFilter} onChange={e => setSfvConsultorFilter(e.target.value)}>
                  <option value="">Consultor</option>
                  {sfvConsultores.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select className="sfv-select" value={sfvCidadeFilter} onChange={e => setSfvCidadeFilter(e.target.value)}>
                  <option value="">Cidade</option>
                  {sfvCidades.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <button type="button" className="btn btn-outline sfv-clear-btn" onClick={() => { setSfvSearch(''); setSfvConsultorFilter(''); setSfvCidadeFilter(''); setSfvFilter('todos'); }}>
                  Limpar filtros
                </button>
                <span className="sfv-count">{filteredSistemasFv.length} sistema{filteredSistemasFv.length !== 1 ? 's' : ''}</span>
              </div>

              {/* Main content + right panel */}
              <div className="sfv-body-layout">
                <div className="sfv-main">
                  {/* KANBAN VIEW */}
                  {sfvView === 'kanban' && (
                    <div className="sfv-kanban">
                      {SFV_ETAPAS.map(etapa => {
                        const cards = filteredSistemasFv.filter(s => s.etapaAtual === etapa);
                        const col = sfvEtapaColor[etapa] || '#94a3b8';
                        return (
                          <div key={etapa} className="sfv-kanban-col">
                            <div className="sfv-col-head" style={{ borderTopColor: col }}>
                              <span className="sfv-col-title">{etapa}</span>
                              <span className="sfv-col-count" style={{ background: col }}>{cards.length}</span>
                            </div>
                            <div className="sfv-col-cards">
                              {cards.length === 0 && (
                                <div className="sfv-col-empty">Nenhum sistema</div>
                              )}
                              {cards.map(s => {
                                const isOverdue = s.prazoAtual && new Date(s.prazoAtual) < new Date();
                                return (
                                  <button
                                    key={s.id}
                                    type="button"
                                    className={`sfv-card${sfvSelected?.id === s.id ? ' selected' : ''}`}
                                    onClick={() => { setSfvSelected(s); setSfvFichaTab('resumo'); setSfvHistorico([]); request(`/api/admin/sistemas-fv/${s.id}/historico`).then(setSfvHistorico).catch(() => {}); }}
                                  >
                                    <div className="sfv-card-name">{s.clienteNome}</div>
                                    <div className="sfv-card-meta">
                                      {s.cidade && <span>{s.cidade}{s.estado ? ` - ${s.estado}` : ''}</span>}
                                      {s.potenciaKwp && <span>{Number(s.potenciaKwp).toFixed(1)} kWp</span>}
                                    </div>
                                    {s.consultorNome && <div className="sfv-card-consultor">{s.consultorNome}</div>}
                                    <div className="sfv-card-footer">
                                      {s.prazoAtual && (
                                        <span className={`sfv-card-prazo${isOverdue ? ' overdue' : ''}`}>
                                          {new Date(s.prazoAtual).toLocaleDateString('pt-BR')}
                                        </span>
                                      )}
                                      <span className="sfv-status-badge" style={{ background: sfvStatusColor[s.status] || '#94a3b8' }}>
                                        {s.status}
                                      </span>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* TABLE VIEW */}
                  {sfvView === 'tabela' && (
                    <div className="sfv-table-wrap">
                      <table className="sfv-table">
                        <thead>
                          <tr>
                            <th>Cliente</th>
                            <th>Cidade/UF</th>
                            <th>Consultor</th>
                            <th>Potência</th>
                            <th>Etapa atual</th>
                            <th>Responsável</th>
                            <th>Próxima ação</th>
                            <th>Prazo</th>
                            <th>Status</th>
                            <th>Última atualização</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredSistemasFv.length === 0 && (
                            <tr><td colSpan={10} className="sfv-tbl-empty">Nenhum sistema encontrado</td></tr>
                          )}
                          {filteredSistemasFv.map(s => {
                            const isOverdue = s.prazoAtual && new Date(s.prazoAtual) < new Date();
                            return (
                              <tr
                                key={s.id}
                                className={sfvSelected?.id === s.id ? 'sfv-tbl-selected' : ''}
                                onClick={() => { setSfvSelected(s); setSfvFichaTab('resumo'); setSfvHistorico([]); request(`/api/admin/sistemas-fv/${s.id}/historico`).then(setSfvHistorico).catch(() => {}); }}
                              >
                                <td className="sfv-tbl-name">{s.clienteNome}</td>
                                <td>{[s.cidade, s.estado].filter(Boolean).join('/')  || '—'}</td>
                                <td>{s.consultorNome || '—'}</td>
                                <td>{s.potenciaKwp ? `${Number(s.potenciaKwp).toFixed(1)} kWp` : '—'}</td>
                                <td>
                                  <span className="sfv-etapa-badge" style={{ background: sfvEtapaColor[s.etapaAtual] || '#94a3b8' }}>
                                    {s.etapaAtual}
                                  </span>
                                </td>
                                <td>{s.responsavelAtual || '—'}</td>
                                <td className="sfv-tbl-acao">{s.proximaAcao || '—'}</td>
                                <td style={isOverdue ? { color: '#ef4444', fontWeight: 700 } : {}}>
                                  {s.prazoAtual ? new Date(s.prazoAtual).toLocaleDateString('pt-BR') : '—'}
                                </td>
                                <td>
                                  <span className="sfv-status-badge" style={{ background: sfvStatusColor[s.status] || '#94a3b8' }}>
                                    {s.status}
                                  </span>
                                </td>
                                <td>{s.updatedAt ? new Date(s.updatedAt).toLocaleDateString('pt-BR') : '—'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* RIGHT PANEL — ficha rápida */}
                {sfvSelected && (
                  <aside className="sfv-ficha">
                    <div className="sfv-ficha-head">
                      <div>
                        <div className="sfv-ficha-nome">{sfvSelected.clienteNome}</div>
                        <span className="sfv-status-badge" style={{ background: sfvStatusColor[sfvSelected.status] || '#94a3b8' }}>
                          {sfvSelected.status}
                        </span>
                      </div>
                      <button type="button" className="sfv-ficha-close" onClick={() => setSfvSelected(null)}>✕</button>
                    </div>

                    <div className="sfv-ficha-meta">
                      <div className="sfv-ficha-meta-item">
                        <span>Cidade</span>
                        <strong>{[sfvSelected.cidade, sfvSelected.estado].filter(Boolean).join(' - ') || '—'}</strong>
                      </div>
                      <div className="sfv-ficha-meta-item">
                        <span>Telefone</span>
                        <strong>{sfvSelected.clienteTelefone || '—'}</strong>
                      </div>
                      <div className="sfv-ficha-meta-item">
                        <span>Potência</span>
                        <strong>{sfvSelected.potenciaKwp ? `${Number(sfvSelected.potenciaKwp).toFixed(1)} kWp` : '—'}</strong>
                      </div>
                      <div className="sfv-ficha-meta-item">
                        <span>Valor vendido</span>
                        <strong>{sfvSelected.valorVenda ? `R$ ${Number(sfvSelected.valorVenda).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}</strong>
                      </div>
                      <div className="sfv-ficha-meta-item">
                        <span>Consultor</span>
                        <strong>{sfvSelected.consultorNome || '—'}</strong>
                      </div>
                      <div className="sfv-ficha-meta-item">
                        <span>Responsável</span>
                        <strong>{sfvSelected.responsavelAtual || '—'}</strong>
                      </div>
                    </div>

                    {/* Etapa progress */}
                    <div className="sfv-etapa-progress">
                      <div className="sfv-etapa-label">Etapa atual</div>
                      <div className="sfv-etapa-badge-lg" style={{ background: sfvEtapaColor[sfvSelected.etapaAtual] || '#94a3b8' }}>
                        {sfvSelected.etapaAtual}
                      </div>
                      <div className="sfv-etapa-steps">
                        {SFV_ETAPAS.map((etapa, idx) => {
                          const currentIdx = SFV_ETAPAS.indexOf(sfvSelected.etapaAtual);
                          const done = idx < currentIdx;
                          const active = idx === currentIdx;
                          return (
                            <div key={etapa} className={`sfv-step${done ? ' done' : active ? ' active' : ''}`}>
                              <div className="sfv-step-dot" style={active || done ? { background: sfvEtapaColor[etapa] } : {}} />
                              <span className="sfv-step-label">{etapa}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Prazo e próxima ação */}
                    <div className="sfv-ficha-info">
                      <div className="sfv-ficha-info-row">
                        <span>Prazo</span>
                        <strong style={sfvSelected.prazoAtual && new Date(sfvSelected.prazoAtual) < new Date() ? { color: '#ef4444' } : {}}>
                          {sfvSelected.prazoAtual ? new Date(sfvSelected.prazoAtual).toLocaleDateString('pt-BR') : '—'}
                        </strong>
                      </div>
                      {sfvSelected.proximaAcao && (
                        <div className="sfv-ficha-info-row">
                          <span>Próxima ação</span>
                          <strong>{sfvSelected.proximaAcao}</strong>
                        </div>
                      )}
                      {sfvSelected.observacoes && (
                        <div className="sfv-ficha-obs">
                          <span>Observações</span>
                          <p>{sfvSelected.observacoes}</p>
                        </div>
                      )}
                    </div>

                    {/* Histórico */}
                    {sfvHistorico.length > 0 && (
                      <div className="sfv-historico">
                        <div className="sfv-historico-title">Histórico</div>
                        {sfvHistorico.map(h => (
                          <div key={h.id} className="sfv-hist-item">
                            <div className="sfv-hist-etapa">{h.etapa}</div>
                            <div className="sfv-hist-meta">
                              <span>{h.criadoPorNome || '—'}</span>
                              <span>{h.createdAt ? new Date(h.createdAt).toLocaleDateString('pt-BR') : ''}</span>
                            </div>
                            {h.observacoes && <div className="sfv-hist-obs">{h.observacoes}</div>}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Update button */}
                    <button
                      type="button"
                      className="btn btn-primary sfv-update-btn"
                      onClick={() => {
                        setSfvUpdateForm({
                          etapaAtual: sfvSelected.etapaAtual || '',
                          status: sfvSelected.status || 'No prazo',
                          proximaAcao: sfvSelected.proximaAcao || '',
                          prazoAtual: sfvSelected.prazoAtual || '',
                          responsavelAtual: sfvSelected.responsavelAtual || '',
                          observacoes: '',
                        });
                        setSfvUpdateOpen(true);
                      }}
                    >
                      Atualizar etapa
                    </button>
                  </aside>
                )}
              </div>

              {/* Atualizar etapa modal */}
              {sfvUpdateOpen && sfvSelected && (
                <div className="sfv-modal-overlay" onClick={() => setSfvUpdateOpen(false)}>
                  <div className="sfv-modal" onClick={e => e.stopPropagation()}>
                    <div className="sfv-modal-head">
                      <h4>Atualizar etapa — {sfvSelected.clienteNome}</h4>
                      <button type="button" className="sfv-ficha-close" onClick={() => setSfvUpdateOpen(false)}>✕</button>
                    </div>
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        try {
                          const updated = await request(`/api/admin/sistemas-fv/${sfvSelected.id}`, {
                            method: 'PUT',
                            body: JSON.stringify(sfvUpdateForm),
                          });
                          setSistemasFv(prev => prev.map(s => s.id === updated.id ? updated : s));
                          setSfvSelected(updated);
                          const hist = await request(`/api/admin/sistemas-fv/${updated.id}/historico`).catch(() => []);
                          setSfvHistorico(hist);
                          setSfvUpdateOpen(false);
                          showToast('Etapa atualizada com sucesso.', 'success');
                        } catch (err) {
                          showToast(err.message || 'Erro ao atualizar.', 'error');
                        }
                      }}
                    >
                      <div className="sfv-modal-form">
                        <label>
                          Etapa atual
                          <select value={sfvUpdateForm.etapaAtual} onChange={e => setSfvUpdateForm(prev => ({ ...prev, etapaAtual: e.target.value }))}>
                            {SFV_ETAPAS.map(et => <option key={et} value={et}>{et}</option>)}
                          </select>
                        </label>
                        <label>
                          Status
                          <select value={sfvUpdateForm.status} onChange={e => setSfvUpdateForm(prev => ({ ...prev, status: e.target.value }))}>
                            {['No prazo', 'Atenção', 'Atrasado', 'Concessionária', 'Pausado'].map(st => <option key={st} value={st}>{st}</option>)}
                          </select>
                        </label>
                        <label>
                          Prazo
                          <input type="date" value={sfvUpdateForm.prazoAtual} onChange={e => setSfvUpdateForm(prev => ({ ...prev, prazoAtual: e.target.value }))} />
                        </label>
                        <label>
                          Responsável
                          <input type="text" value={sfvUpdateForm.responsavelAtual} onChange={e => setSfvUpdateForm(prev => ({ ...prev, responsavelAtual: e.target.value }))} placeholder="Nome do responsável" />
                        </label>
                        <label className="sfv-span2">
                          Próxima ação
                          <input type="text" value={sfvUpdateForm.proximaAcao} onChange={e => setSfvUpdateForm(prev => ({ ...prev, proximaAcao: e.target.value }))} placeholder="O que deve ser feito agora?" />
                        </label>
                        <label className="sfv-span2">
                          Observações (registro no histórico)
                          <textarea value={sfvUpdateForm.observacoes} onChange={e => setSfvUpdateForm(prev => ({ ...prev, observacoes: e.target.value }))} placeholder="Detalhe o que aconteceu..." rows={3} />
                        </label>
                      </div>
                      <div className="sfv-modal-actions">
                        <button type="button" className="btn btn-outline" onClick={() => setSfvUpdateOpen(false)}>Cancelar</button>
                        <button type="submit" className="btn btn-primary">Salvar atualização</button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
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
                    <div className="permission-presets">
                      <span>Modelos rápidos</span>
                      <div>
                        {permissionPresets.map(preset => (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => updatePermissions(user.id, normalizePanelPermissions(preset.permissions), user.active, { role: user.role, nome: user.nome, whatsapp: user.whatsapp })}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="permissions-grid">
                      {Object.entries(permissionLabels).map(([key, label]) => (
                        <label key={key} className="permission-toggle">
                          <input
                            type="checkbox"
                            checked={Boolean(user.permissions?.[key])}
                            onChange={(event) => {
                              const checked = event.target.checked;
                              const nextPermissions = { ...user.permissions, [key]: checked };
                              if (key === 'clientes') nextPermissions.gerenciarClientes = checked;
                              if (key === 'gerenciarClientes' && checked) nextPermissions.clientes = true;
                              updatePermissions(user.id, nextPermissions, user.active);
                            }}
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

      {projetoDocumentPreview && (
        <div className="project-document-preview" role="dialog" aria-modal="true" aria-label={`Prévia de ${projetoDocumentPreview.name}`}>
          <header className="project-document-preview-head">
            <button type="button" className="btn btn-outline" onClick={closeProjetoDocumentPreview}>Voltar</button>
            <strong title={projetoDocumentPreview.name}>{projetoDocumentPreview.name}</strong>
            <a className="btn btn-primary" href={projetoDocumentPreview.url} download={projetoDocumentPreview.name}>Baixar</a>
          </header>
          <div className="project-document-preview-body">
            {projetoDocumentPreview.mimeType.startsWith('image/') ? (
              <img src={projetoDocumentPreview.url} alt={projetoDocumentPreview.name} />
            ) : (
              <iframe src={projetoDocumentPreview.url} title={projetoDocumentPreview.name} />
            )}
          </div>
        </div>
      )}

      {whatsappMediaPreview && (
        <div className="whatsapp-media-preview" role="dialog" aria-modal="true" aria-label="Prévia da imagem" onClick={() => setWhatsappMediaPreview(null)}>
          <div className="whatsapp-media-preview-head">
            <button type="button" onClick={() => setWhatsappMediaPreview(null)} aria-label="Voltar para a conversa">
              <span aria-hidden="true">←</span> Voltar
            </button>
            <strong>{whatsappMediaPreview.name}</strong>
            <button type="button" className="whatsapp-media-preview-close" onClick={() => setWhatsappMediaPreview(null)} aria-label="Fechar prévia">×</button>
          </div>
          <div className="whatsapp-media-preview-body" onClick={(event) => event.stopPropagation()}>
            <img src={whatsappMediaPreview.url} alt={whatsappMediaPreview.name} />
          </div>
        </div>
      )}

      {whatsappTransferOpen && selectedWhatsappConversation && (
        <div className="contract-modal-backdrop whatsapp-transfer-backdrop" onMouseDown={() => !whatsappLoading && setWhatsappTransferOpen(false)}>
          <form
            className="whatsapp-transfer-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="whatsapp-transfer-title"
            onSubmit={transferWhatsappConversation}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="whatsapp-transfer-head">
              <div>
                <span>TRANSFERIR LEAD</span>
                <h3 id="whatsapp-transfer-title">{selectedWhatsappConversation.clienteNome || selectedWhatsappConversation.clienteTelefone}</h3>
                <p>Escolha quem receberá esta conversa e o lead vinculado.</p>
              </div>
              <button type="button" onClick={() => setWhatsappTransferOpen(false)} disabled={whatsappLoading} aria-label="Fechar">×</button>
            </div>
            <div className="whatsapp-transfer-list">
              {whatsappTransferUsers.map(user => (
                <label key={user.id} className={String(whatsappTransferUserId) === String(user.id) ? 'selected' : ''}>
                  <input
                    type="radio"
                    name="whatsapp-transfer-user"
                    value={user.id}
                    checked={String(whatsappTransferUserId) === String(user.id)}
                    onChange={(event) => setWhatsappTransferUserId(event.target.value)}
                  />
                  <span className="whatsapp-transfer-avatar">{String(user.nome || user.username || 'C').charAt(0).toUpperCase()}</span>
                  <span className="whatsapp-transfer-person">
                    <strong>{user.nome}</strong>
                    <small>{user.whatsapp || 'Sem WhatsApp privado cadastrado'}</small>
                  </span>
                  <span className="whatsapp-transfer-check">✓</span>
                </label>
              ))}
              {whatsappTransferUsers.length === 0 && (
                <p className="whatsapp-transfer-empty">Nenhum consultor ativo com permissão de WhatsApp.</p>
              )}
            </div>
            <div className="whatsapp-transfer-foot">
              <button type="button" className="btn btn-outline" onClick={() => setWhatsappTransferOpen(false)} disabled={whatsappLoading}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={whatsappLoading || !whatsappTransferUserId}>
                {whatsappLoading ? 'Transferindo...' : 'Transferir e avisar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {whatsappSetupOpen && (
        <div className="contract-modal-backdrop whatsapp-connect-backdrop">
          <div className="wa-setup-modal" role="dialog" aria-modal="true" aria-labelledby="wa-setup-title">
            <div className="wa-setup-icon">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            </div>
            <h3 id="wa-setup-title">Cadastre seu WhatsApp</h3>
            <p>Para receber avisos quando o cliente que você atende responder, confirme o número de WhatsApp que é seu (com DDD).</p>
            <form onSubmit={submitWhatsappSetup}>
              <input
                type="tel"
                className="wa-setup-input"
                placeholder="Ex: 99 99999-9999"
                value={whatsappSetupNumber}
                onChange={(e) => setWhatsappSetupNumber(e.target.value)}
                autoFocus
              />
              {whatsappSetupError && <span className="wa-setup-error">{whatsappSetupError}</span>}
              <button type="submit" className="wa-setup-btn" disabled={whatsappSetupLoading}>
                {whatsappSetupLoading ? 'Verificando número...' : 'Confirmar número'}
              </button>
            </form>
            <span className="wa-setup-hint">Vamos verificar se o número existe no WhatsApp antes de salvar.</span>
          </div>
        </div>
      )}

      {whatsappConnectOpen && typeof document !== 'undefined' && createPortal((
        <div
          className="contract-modal-backdrop whatsapp-connect-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setWhatsappConnectOpen(false);
          }}
        >
          <div
            className="whatsapp-connect-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="whatsapp-connect-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="whatsapp-connect-header">
              <div>
                <span className="section-kicker">Conexão WhatsApp</span>
                <h3 id="whatsapp-connect-title">{whatsappStatus?.connected ? 'Número oficial conectado' : 'Conectar número oficial'}</h3>
                <p>
                  {whatsappStatus?.connected
                    ? 'Se vocês forem trocar o número oficial, desconecte o atual primeiro. Só depois gere o QR Code do novo aparelho.'
                    : 'Escaneie o QR Code com o WhatsApp que será usado por todos os vendedores no chatbox.'}
                </p>
              </div>
              <button type="button" className="lead-modal-close" onClick={() => setWhatsappConnectOpen(false)} aria-label="Fechar">×</button>
            </div>

            <div className="whatsapp-connect-body">
              <div className="whatsapp-qr-panel">
                {whatsappStatus?.connected ? (
                  <div className="whatsapp-connected-state">
                    <span className="wa-connect-icon">✓</span>
                    <h4>WhatsApp conectado</h4>
                    <p>{whatsappStatus.phone ? `Número conectado: ${whatsappStatus.phone}` : 'Sessão ativa e pronta para atendimento.'}</p>
                  </div>
                ) : whatsappStatus?.qr ? (
                  <img
                    key={whatsappStatus.qr}
                    src={whatsappStatus.qr}
                    alt="QR Code para conectar WhatsApp"
                    className="whatsapp-qr-image"
                    loading="eager"
                  />
                ) : (
                  <div className="whatsapp-qr-loading">
                    <span className="wa-connect-icon">QR</span>
                    <h4>{whatsappConnectLoading ? 'Gerando QR Code...' : 'QR Code ainda não gerado'}</h4>
                    <p>Estamos atualizando automaticamente. Assim que o QR for liberado, ele aparece aqui sem precisar fechar o modal.</p>
                  </div>
                )}
              </div>

              <div className="whatsapp-connect-info">
                <div className={`whatsapp-connect-status ${whatsappStatus?.connected ? 'online' : ''}`}>
                  <strong>{whatsappStatus?.connected ? 'Online' : whatsappStatus?.status || 'Desconectado'}</strong>
                  <span>{whatsappStatus?.message || 'Aguardando início da conexão.'}</span>
                </div>
                {whatsappStatus?.connected && (
                  <div className="whatsapp-connect-alert">
                    <strong>Número atual em uso</strong>
                    <span>
                      {whatsappStatus.phone
                        ? `${whatsappStatus.phone} está ativo no painel.`
                        : 'Já existe um número oficial ativo no painel.'}
                    </span>
                    <small>Para trocar com segurança, clique em "Desconectar número atual" e só então gere o QR do novo número.</small>
                  </div>
                )}
                <div className="whatsapp-connect-steps">
                  <div><strong>1</strong><span>Abra o WhatsApp no celular oficial da DRM.</span></div>
                  <div><strong>2</strong><span>Vá em Aparelhos conectados e escolha conectar um aparelho.</span></div>
                  <div><strong>3</strong><span>Escaneie o QR Code. Depois disso, todos atendem pelo painel.</span></div>
                </div>
                <div className="whatsapp-connect-meta">
                  <span>Modo: QR Code server-side</span>
                  <span>Fila: número único para vários vendedores</span>
                  {whatsappStatus?.lastUpdate && <span>Atualizado: {new Date(whatsappStatus.lastUpdate).toLocaleString('pt-BR')}</span>}
                </div>
              </div>
            </div>

            <div className="whatsapp-connect-footer">
              <button type="button" className="btn btn-outline" onClick={() => setWhatsappConnectOpen(false)}>Fechar</button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={refreshWhatsappQr}
                disabled={whatsappConnectLoading || whatsappStatus?.connected}
                title={whatsappStatus?.connected ? 'Desconecte o número atual antes de gerar o QR do novo aparelho.' : 'Gerar QR Code para conectar o número oficial'}
              >
                {whatsappConnectLoading ? 'Gerando...' : (whatsappStatus?.connected ? 'Aguardando desconexão do atual' : 'Gerar QR do novo número')}
              </button>
              {isMasterAdmin && whatsappStatus?.connected && (
                <button type="button" className="btn btn-outline danger-outline" onClick={disconnectWhatsapp} disabled={whatsappConnectLoading}>
                  {whatsappConnectLoading ? 'Desconectando...' : 'Desconectar número atual'}
                </button>
              )}
            </div>
          </div>
        </div>
      ), document.body)}

      {quickActionEditorOpen && (
        <div className="contract-modal-backdrop quick-action-editor-backdrop">
          <div className="quick-action-editor-modal" role="dialog" aria-modal="true" aria-labelledby="quick-action-editor-title">
            <div className="quick-action-editor-header">
              <div>
                <span className="section-kicker">Ações rápidas</span>
                <h3 id="quick-action-editor-title">Personalizar barra superior</h3>
                <p>{quickActionDraft.length} de {availableQuickActions.length} atalhos selecionados.</p>
              </div>
              <button type="button" className="lead-modal-close" onClick={() => setQuickActionEditorOpen(false)} aria-label="Fechar">×</button>
            </div>
            <div className="quick-action-editor-list">
              {Object.entries(quickActionEditorGroups).map(([group, actions]) => (
                <div className="quick-action-option-group" key={group}>
                  <div className="quick-action-option-group-title">
                    <strong>{group}</strong>
                    <span>{actions.filter(action => quickActionDraft.includes(action.id)).length}/{actions.length}</span>
                  </div>
                  <div className="quick-action-option-grid">
                    {actions.map(action => (
                      <label key={action.id} className={`quick-action-option ${quickActionDraft.includes(action.id) ? 'active' : ''}`}>
                        <input
                          type="checkbox"
                          checked={quickActionDraft.includes(action.id)}
                          onChange={() => toggleQuickActionDraft(action.id)}
                        />
                        <span className="quick-action-option-icon"><SidebarIcon name={action.tab} /></span>
                        <span>
                          <strong>{action.label}</strong>
                          <small>{action.description || permissionDescriptions[action.permission] || 'Atalho do painel'}</small>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="quick-action-editor-footer">
              <button type="button" className="btn btn-outline" onClick={() => setQuickActionDraft(availableQuickActions.map(action => action.id))}>Marcar todos</button>
              <button type="button" className="btn btn-outline" onClick={() => setQuickActionDraft(defaultQuickActionIds.filter(id => availableQuickActions.some(action => action.id === id)))}>Padrão</button>
              <button type="button" className="btn btn-outline" onClick={() => setQuickActionEditorOpen(false)}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={saveQuickActionPrefs}>Salvar preferências</button>
            </div>
          </div>
        </div>
      )}

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
                  <option>Tráfego pago</option>
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
              <div className="rc-field">
                <label className="rc-label">Designar para</label>
                <select className="rc-input" value={manualLeadForm.assignedUserId} onChange={(event) => setManualLeadForm(prev => ({ ...prev, assignedUserId: event.target.value }))}>
                  <option value="">Eu mesmo</option>
                  {leadOwners.map(item => (
                    <option key={item.id} value={item.id}>{item.nome}</option>
                  ))}
                </select>
              </div>
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

      {osDrawerOpen && (
        <div className="os-drawer-overlay" onClick={(e) => { if (e.target === e.currentTarget) { setOsDrawerOpen(false); } }}>
          <div className="os-drawer">
            <div className="os-drawer-header">
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div className="os-drawer-title">Nova Ordem de Serviço</div>
                <button type="button" className="os-panel-close" onClick={() => setOsDrawerOpen(false)} style={{fontSize:'1.3rem'}}>✕</button>
              </div>
              <div className="os-drawer-steps-row">
                {[
                  {n:1,label:'Cliente e sistema'},
                  {n:2,label:'Ocorrência'},
                  {n:3,label:'Planejamento'},
                  {n:4,label:'Evidências'},
                  {n:5,label:'Revisão'},
                ].map((step, idx, arr) => (
                  <div key={step.n} className="os-drawer-step-item">
                    <div className={`os-drawer-step-circle${osDrawerStep === step.n ? ' active' : osDrawerStep > step.n ? ' done' : ''}`}>{osDrawerStep > step.n ? '✓' : step.n}</div>
                    <span className={`os-drawer-step-label${osDrawerStep === step.n ? ' active' : ''}`}>{step.label}</span>
                    {idx < arr.length - 1 && <div className={`os-drawer-step-connector${osDrawerStep > step.n ? ' done' : ''}`} />}
                  </div>
                ))}
              </div>
            </div>
            <div className="os-drawer-body">
              {osDrawerStep === 1 && (
                <div>
                  <div className="os-step-section">
                    <div className="os-step-section-title">Dados do cliente</div>
                    <div className="os-cliente-mode-toggle" style={{marginBottom:'0.75rem'}}>
                      <div className="os-mode-pills">
                        <button type="button" className={`os-mode-pill${osClienteMode === 'existente' ? ' active' : ''}`} onClick={() => setOsClienteMode('existente')}>Usar cliente cadastrado</button>
                        <button type="button" className={`os-mode-pill${osClienteMode === 'novo' ? ' active' : ''}`} onClick={() => { setOsClienteMode('novo'); setOsClienteSearch(''); }}>Cadastro manual</button>
                      </div>
                    </div>
                    {osClienteMode === 'existente' ? (
                      <div className="os-cliente-search-wrap">
                        <input
                          placeholder="Buscar cliente por nome, telefone ou CPF..."
                          value={osClienteSearch}
                          onChange={(event) => setOsClienteSearch(event.target.value)}
                          autoComplete="off"
                        />
                        {osClienteSearch.trim().length > 0 && (() => {
                          const q = osClienteSearch.trim().toLowerCase();
                          const matches = clientes.filter(c => [c.nome, c.whatsapp, c.cpfCnpj, c.cidade].some(v => String(v || '').toLowerCase().includes(q))).slice(0, 8);
                          return matches.length > 0 ? (
                            <ul className="os-cliente-dropdown">
                              {matches.map(c => (
                                <li key={c.id}>
                                  <button type="button" onClick={() => {
                                    setOsForm(prev => ({ ...prev, clienteNome: c.nome || '', clienteTelefone: c.whatsapp || '', cpfCnpj: c.cpfCnpj || '', cidade: c.cidade || '', endereco: c.endereco || '' }));
                                    setOsClienteSearch(c.nome || '');
                                  }}>
                                    <strong>{c.nome}</strong>
                                    <span>{c.whatsapp || '—'} • {c.cidade || '—'}</span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="os-cliente-empty">Nenhum cliente encontrado. <button type="button" className="os-link-btn" onClick={() => setOsClienteMode('novo')}>Cadastro manual</button></div>
                          );
                        })()}
                        {osForm.clienteNome && (
                          <div className="os-cliente-selected">
                            <div className="os-cliente-selected-info">
                              <strong>{osForm.clienteNome}</strong>
                              <span>{osForm.clienteTelefone || '—'} • {osForm.cidade || '—'}</span>
                            </div>
                            <button type="button" className="btn btn-outline btn-sm-admin" onClick={() => { setOsForm(prev => ({ ...prev, clienteNome: '', clienteTelefone: '', cpfCnpj: '', cidade: '', endereco: '' })); setOsClienteSearch(''); }}>Trocar</button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="os-step-grid">
                        <div className="os-step-field">
                          <label>Nome completo *</label>
                          <input placeholder="João da Silva" value={osForm.clienteNome} onChange={(e) => setOsForm(prev => ({ ...prev, clienteNome: e.target.value }))} />
                        </div>
                        <div className="os-step-field">
                          <label>Telefone / WhatsApp</label>
                          <input placeholder="(99) 99999-9999" value={osForm.clienteTelefone} onChange={(e) => setOsForm(prev => ({ ...prev, clienteTelefone: e.target.value }))} />
                        </div>
                        <div className="os-step-field">
                          <label>CPF / CNPJ</label>
                          <input placeholder="000.000.000-00" value={osForm.cpfCnpj} onChange={(e) => setOsForm(prev => ({ ...prev, cpfCnpj: e.target.value }))} />
                        </div>
                        <div className="os-step-field">
                          <label>Cidade</label>
                          <input placeholder="Ex: Imperatriz - MA" value={osForm.cidade} onChange={(e) => setOsForm(prev => ({ ...prev, cidade: e.target.value }))} />
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="os-step-section">
                    <div className="os-step-section-title">Informações do sistema</div>
                    <div className="os-step-grid">
                      <div className="os-step-field">
                        <label>Contrato / referência</label>
                        <input placeholder="Nº do contrato" value={osForm.contratoId} onChange={(e) => setOsForm(prev => ({ ...prev, contratoId: e.target.value }))} />
                      </div>
                      <div className="os-step-field">
                        <label>Sistema instalado</label>
                        <input placeholder="Ex: 5kWp, 12 painéis" value={osForm.sistemaResumo} onChange={(e) => setOsForm(prev => ({ ...prev, sistemaResumo: e.target.value }))} />
                      </div>
                      <div className="os-step-field">
                        <label>Data da instalação</label>
                        <input type="date" value={osForm.dataInstalacao} onChange={(e) => setOsForm(prev => ({ ...prev, dataInstalacao: e.target.value }))} />
                      </div>
                      <div className="os-step-field">
                        <label>Consultor responsável</label>
                        <input placeholder="Nome do consultor" value={osForm.consultor} onChange={(e) => setOsForm(prev => ({ ...prev, consultor: e.target.value }))} />
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {osDrawerStep === 2 && (
                <div>
                  <div className="os-step-section">
                    <div className="os-step-section-title">Categoria</div>
                    <div className="os-cat-grid">
                      {Object.keys(OS_OCORRENCIA_MAP).map(cat => (
                        <button key={cat} type="button" className={`os-cat-btn${osForm.motivo === cat ? ' active' : ''}`} onClick={() => setOsForm(prev => ({ ...prev, motivo: cat, categoria: cat }))}>
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>
                  {osForm.motivo && OS_OCORRENCIA_MAP[osForm.motivo] && (
                    <div className="os-step-section">
                      <div className="os-step-section-title">Tipo da ocorrência</div>
                      <div className="os-type-list">
                        {OS_OCORRENCIA_MAP[osForm.motivo].map(tipo => (
                          <button key={tipo} type="button" className={`os-type-chip${osForm.tipoOcorrencia === tipo ? ' active' : ''}`} onClick={() => setOsForm(prev => ({ ...prev, tipoOcorrencia: tipo }))}>
                            {tipo}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="os-step-section">
                    <div className="os-step-section-title">Descrição do problema *</div>
                    <div className="os-step-field span-2">
                      <textarea
                        placeholder="Descreva com detalhes o que o cliente relatou..."
                        value={osForm.descricaoProblema}
                        onChange={(e) => setOsForm(prev => ({ ...prev, descricaoProblema: e.target.value, problema: e.target.value }))}
                        style={{minHeight:120}}
                      />
                    </div>
                  </div>
                </div>
              )}
              {osDrawerStep === 3 && (
                <div>
                  <div className="os-step-section">
                    <div className="os-step-section-title">Prioridade</div>
                    <div className="os-priority-row">
                      {OS_PRIORITY_OPTIONS.map((priority) => (
                        <label key={priority} className={`os-radio-pill ${osForm.prioridade === priority ? 'active' : ''}`}>
                          <input type="radio" name="os-drawer-priority" checked={osForm.prioridade === priority} onChange={() => setOsForm(prev => ({ ...prev, prioridade: priority }))} />
                          <span>{priority}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="os-step-section">
                    <div className="os-step-section-title">Agendamento e atribuição</div>
                    <div className="os-step-grid">
                      <div className="os-step-field">
                        <label>Data desejada</label>
                        <input type="date" value={osForm.dataDesejada} onChange={(e) => setOsForm(prev => ({ ...prev, dataDesejada: e.target.value }))} />
                      </div>
                      <div className="os-step-field">
                        <label>Prazo máximo</label>
                        <input type="date" value={osForm.prazoMaximo} onChange={(e) => setOsForm(prev => ({ ...prev, prazoMaximo: e.target.value }))} />
                      </div>
                      <div className="os-step-field">
                        <label>Técnico / equipe</label>
                        <select value={osForm.responsavelId} onChange={(e) => setOsForm(prev => ({ ...prev, responsavelId: e.target.value }))}>
                          <option value="">Selecionar</option>
                          {usuarios.filter(u => u.active && (u.role === 'ADM' || u.permissions?.equipeTecnica || u.permissions?.ordensServico)).map(u => (
                            <option key={u.id} value={u.id}>{u.nome}</option>
                          ))}
                        </select>
                      </div>
                      <div className="os-step-field">
                        <label>Canal de origem</label>
                        <select value={osForm.origem} onChange={(e) => setOsForm(prev => ({ ...prev, origem: e.target.value }))}>
                          <option>WhatsApp</option>
                          <option>Site</option>
                          <option>Equipe técnica</option>
                          <option>Pós-venda</option>
                          <option>Cliente recorrente</option>
                        </select>
                      </div>
                      <div className="os-step-field">
                        <label>Materiais prévios</label>
                        <input placeholder="Ex: Fusível CC, MC4..." value={osForm.materiaisPrevios} onChange={(e) => setOsForm(prev => ({ ...prev, materiaisPrevios: e.target.value }))} />
                      </div>
                      <div className="os-step-field">
                        <label>Contato no local</label>
                        <input placeholder="Nome e telefone" value={osForm.contatoLocal} onChange={(e) => setOsForm(prev => ({ ...prev, contatoLocal: e.target.value }))} />
                      </div>
                      <div className="os-step-field span-2">
                        <label>Observações internas</label>
                        <textarea placeholder="Notas para a equipe..." value={osForm.observacoesInternas} onChange={(e) => setOsForm(prev => ({ ...prev, observacoesInternas: e.target.value, observacoes: e.target.value }))} />
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {osDrawerStep === 4 && (
                <div>
                  <div className="os-step-section">
                    <div className="os-step-section-title">Evidências iniciais (opcional)</div>
                    <div className="os-upload-zone">
                      <div style={{fontSize:'2rem'}}>📎</div>
                      <p>Arraste arquivos aqui ou clique para selecionar</p>
                      <p style={{fontSize:'0.78rem',color:'#94a3b8'}}>PDF, JPG, PNG aceitos</p>
                    </div>
                  </div>
                </div>
              )}
              {osDrawerStep === 5 && (
                <div>
                  <div className="os-step-section">
                    <div className="os-step-section-title">Revisão da O.S.</div>
                    <div className="os-review-block">
                      <div className="os-review-block-title">Cliente</div>
                      <div className="os-review-row"><span>Nome</span><span>{osForm.clienteNome || '—'}</span></div>
                      <div className="os-review-row"><span>Telefone</span><span>{osForm.clienteTelefone || '—'}</span></div>
                      <div className="os-review-row"><span>Cidade</span><span>{osForm.cidade || '—'}</span></div>
                      <div className="os-review-row"><span>Sistema</span><span>{osForm.sistemaResumo || '—'}</span></div>
                    </div>
                    <div className="os-review-block">
                      <div className="os-review-block-title">Ocorrência</div>
                      <div className="os-review-row"><span>Categoria</span><span>{osForm.motivo || '—'}</span></div>
                      <div className="os-review-row"><span>Tipo</span><span>{osForm.tipoOcorrencia || '—'}</span></div>
                      <div className="os-review-row"><span>Descrição</span><span>{osForm.descricaoProblema || '—'}</span></div>
                    </div>
                    <div className="os-review-block">
                      <div className="os-review-block-title">Planejamento</div>
                      <div className="os-review-row"><span>Prioridade</span><span>{osForm.prioridade}</span></div>
                      <div className="os-review-row"><span>Data desejada</span><span>{osForm.dataDesejada ? dateBr(osForm.dataDesejada) : '—'}</span></div>
                      <div className="os-review-row"><span>Prazo máximo</span><span>{osForm.prazoMaximo ? dateBr(osForm.prazoMaximo) : '—'}</span></div>
                      <div className="os-review-row"><span>Canal</span><span>{osForm.origem}</span></div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="os-drawer-footer">
              <div className="os-drawer-footer-left">
                {osDrawerStep > 1 && (
                  <button type="button" className="btn btn-outline" onClick={() => setOsDrawerStep(prev => prev - 1)}>Voltar</button>
                )}
                <button type="button" className="btn btn-outline" onClick={() => setOsDrawerOpen(false)}>Salvar rascunho</button>
              </div>
              <div className="os-drawer-footer-right">
                {osDrawerStep < 5 ? (
                  <button type="button" className="btn btn-primary" onClick={() => {
                    if (osDrawerStep === 2 && (!osForm.motivo || !osForm.descricaoProblema.trim())) {
                      alert('Selecione uma categoria e preencha a descrição do problema.');
                      return;
                    }
                    setOsDrawerStep(prev => prev + 1);
                  }}>Avançar</button>
                ) : (
                  <button type="button" className="btn btn-primary" onClick={(e) => { createOrdemServico(e); setOsDrawerOpen(false); }}>Abrir O.S.</button>
                )}
              </div>
            </div>
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
                      {lead.telefone && <a className="btn btn-primary btn-sm-admin" href={getPanelWhatsAppUrl(lead.telefone, whatsappLeadMessage(lead))} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
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
                      <button className="btn btn-primary btn-sm-admin" onClick={() => { navigatePanel({ activeTab: 'contratos', selectedContratoId: contrato.id }); abrirRevisaoContrato(contrato); setQuickModal(null); }}>Revisar</button>
                    </div>
                  </div>
                ))}
                {contratos.filter(item => item.status === 'Pendente').length === 0 && <p className="muted-text">Nenhum contrato pendente.</p>}
              </div>
            )}

            {quickModal === 'projetos' && (
              <div className="quick-modal-list">
                {projetos.filter(item => getInstallationStage(item) !== 'Ligação realizada pela concessionária').slice(0, 8).map(projeto => (
                  <div className="quick-modal-item quick-project-item" key={projeto.id}>
                    <div className="quick-project-head">
                      <div>
                      <strong>{projeto.clienteNome}</strong>
                      <span>Contrato #{projeto.contratoId} • {getInstallationStage(projeto)} • {projectPhotos[projeto.id]?.length || 0} fotos</span>
                      </div>
                      <button className="btn btn-outline btn-sm-admin" onClick={() => { navigatePanel({ activeTab: 'projetos', selectedProjetoId: projeto.id }); setSelectedProjeto(projeto); setQuickModal(null); }}>Detalhes</button>
                    </div>
                    <div className="quick-project-actions">
                      <button type="button" onClick={() => updateProjetoInstalacao(projeto, 'Equipamento entregue')}>Confirmar entrega</button>
                      <button type="button" onClick={() => updateProjetoInstalacao(projeto, 'Instalação agendada')}>Agendar instalação</button>
                      <button type="button" onClick={() => updateProjetoInstalacao(projeto, 'Ligação realizada pela concessionária')}>Concluir</button>
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
                        {os.clienteTelefone && <a className="btn btn-outline btn-sm-admin" href={getPanelWhatsAppUrl(os.clienteTelefone, `Olá! Sou da DRM Energia Solar. Estou entrando em contato sobre sua O.S #${os.id} para dar continuidade ao atendimento.`)} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
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
