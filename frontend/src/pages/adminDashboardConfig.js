export const permissionLabels = {
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

export const permissionDescriptions = {
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

export const normalizePanelPermissions = (permissions = {}) => {
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

export const permissionPresets = [
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

export const CLIENTE_REQUIRED_FIELDS = ['nome', 'cpfCnpj', 'whatsapp', 'cidade', 'endereco', 'cep', 'estado'];
export const SFV_ETAPAS = ['Venda concluída', 'Sistema enviado', 'Prazo para entrega', 'Sistema entregue', 'Sistema instalado', 'Sistema ligado', 'Concluído'];
export const SFV_FILTER_STAGE = {
  vendas: 'Venda concluída',
  enviado: 'Sistema enviado',
  prazo: 'Prazo para entrega',
  entregue: 'Sistema entregue',
  instalado: 'Sistema instalado',
  ligado: 'Sistema ligado',
  concluido: 'Concluído',
};

export const roleLabels = {
  ADM: 'Administrador',
  EQUIPE_TECNICA_COMERCIAL: 'Equipe técnica/comercial',
  CONSULTOR: 'Consultor',
};

export const defaultContractConfig = {
  empresa: { nome: '', cnpj: '', telefone: '', email: '', endereco: '' },
  visual: { logoPosition: 'center', logoWidth: 150, primaryColor: '#F97316' },
  titulo: '',
  corpo: '',
};
