import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import io from 'socket.io-client';
import './AdminDashboard.css';

const socket = io(import.meta.env.VITE_API_BASE_URL);

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
    ordensServico: (
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm2 4h6V5H9v2Zm-.5 4h7v2h-7v-2Zm0 4h5v2h-5v-2Z" /></svg>
    ),
    precosSistemas: (
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 3 6v6c0 5 3.8 8.6 9 10 5.2-1.4 9-5 9-10V6l-9-4Zm1 15h-2v-1.4a4 4 0 0 1-2.6-1.3l1.3-1.4c.6.6 1.3.9 2.2.9.8 0 1.3-.3 1.3-.8 0-.6-.6-.8-1.8-1.2-1.4-.4-2.7-1-2.7-2.6 0-1.3.9-2.3 2.3-2.7V5h2v1.4c.9.2 1.6.6 2.2 1.1L14 9c-.5-.4-1-.6-1.7-.6-.7 0-1.1.3-1.1.7 0 .5.5.7 1.6 1 1.5.5 2.9 1 2.9 2.8 0 1.4-.9 2.4-2.7 2.8V17Z" /></svg>
    ),
  };

  return icons[name] || icons.leads;
};

const money = (value) => Number(value || 0).toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const getResponsibleName = (name) => name || 'Aguardando distribuição';
const dateBr = (value) => value ? new Date(value).toLocaleDateString('pt-BR') : 'Sem data';
const currencyToNumber = (value) => Number(String(value || '').replace(/\D/g, '')) / 100;
const maskCurrency = (value) => money(currencyToNumber(value));

const emptyContractManual = {
  geracaoKwh: '',
  potenciaKwp: '',
  painel: '',
  inversor: '',
  quantidadeCabo: '',
  valorSistema: '',
  formaPagamentoTipo: 'avista',
  formaPagamento: '',
};

const projectStages = ['Documentação', 'Vistoria', 'Projeto técnico', 'Homologação', 'Instalação', 'Vistoria final', 'Concluído'];
const projectChecklistLabels = {
  documentacaoRecebida: 'Documentação recebida',
  vistoriaRealizada: 'Vistoria realizada',
  projetoTecnico: 'Projeto técnico',
  homologacao: 'Homologação',
  instalacao: 'Instalação',
  vistoriaFinal: 'Vistoria final',
  sistemaLigado: 'Sistema ligado',
};

const streetChecklistKeys = ['vistoriaRealizada', 'instalacao', 'vistoriaFinal', 'sistemaLigado'];
const officeChecklistKeys = ['documentacaoRecebida', 'projetoTecnico', 'homologacao'];
const emptyPriceForm = {
  valorKitSolar: '',
  custoInstalacao: '',
  materialCA: '',
  deslocamento: '',
  custoAdicional: '',
  margemEmpresa: '',
  comissaoPercentual: '',
};

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('leads');
  const [clientes, setClientes] = useState([]);
  const [leads, setLeads] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [financeiro, setFinanceiro] = useState(null);
  const [resumo, setResumo] = useState(null);
  const [projetos, setProjetos] = useState([]);
  const [projectPhotos, setProjectPhotos] = useState({});
  const [projectSearch, setProjectSearch] = useState('');
  const [selectedProjeto, setSelectedProjeto] = useState(null);
  const [atividades, setAtividades] = useState([]);
  const [novoCliente, setNovoCliente] = useState({ nome: '', whatsapp: '', cidade: '', email: '' });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [orcamentos, setOrcamentos] = useState([]);
  const [selectedOrcamento, setSelectedOrcamento] = useState(null);
  const [contratos, setContratos] = useState([]);
  const [ordensServico, setOrdensServico] = useState([]);
  const [selectedContrato, setSelectedContrato] = useState(null);
  const [reviewNote, setReviewNote] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [equipamentos, setEquipamentos] = useState([]);
  const [equipamentoForm, setEquipamentoForm] = useState({ nome: '', placaModelo: '', inversorModelo: '', potenciaPlacaW: '', potenciaInversorKw: '', observacoes: '' });
  const [selectedEquipamentos, setSelectedEquipamentos] = useState({});
  const [contractModal, setContractModal] = useState({ open: false, orcamento: null, manual: emptyContractManual, equipamentoId: '' });
  const [contractConfig, setContractConfig] = useState(defaultContractConfig);
  const [despesaForm, setDespesaForm] = useState({ nome: '', valor: '', categoria: '' });
  const [activityForm, setActivityForm] = useState({ leadId: '', tipo: 'Ligação', descricao: '', resultado: '', proximoRetorno: '' });
  const [osForm, setOsForm] = useState({ clienteNome: '', clienteTelefone: '', contratoId: '', origem: 'WhatsApp', problema: '', categoria: 'Suporte', prioridade: 'Normal', responsavelId: '', observacoes: '' });
  const [priceForm, setPriceForm] = useState(emptyPriceForm);
  const [priceResult, setPriceResult] = useState(null);
  const [priceError, setPriceError] = useState('');
  const [quickModal, setQuickModal] = useState(null);
  const [adminUser, setAdminUser] = useState({ nome: 'DRM', email: '' });
  const [error, setError] = useState('');

  const headers = useMemo(() => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('token')}`,
  }), []);

  const hasPermission = (permission) => adminUser.role === 'ADM' || adminUser.permissions?.[permission];

  const tabs = [
    { id: 'dashboard', label: 'Painel geral', permission: 'dashboard' },
    { id: 'clientes', label: 'Clientes', permission: 'clientes' },
    { id: 'leads', label: 'Leads', permission: 'leads' },
    { id: 'orcamentos', label: 'Orçamentos', permission: 'orcamentos' },
    { id: 'contratos', label: 'Contratos', permission: 'contratos' },
    { id: 'projetos', label: 'Projetos', permission: 'equipeTecnica' },
    { id: 'ordensServico', label: 'O.S', permission: 'ordensServico' },
    { id: 'precosSistemas', label: 'Preço dos Sistemas', permission: 'precosSistemas' },
    { id: 'financeiro', label: 'Financeiro', permission: 'financeiro' },
    { id: 'usuarios', label: 'Acessos', permission: 'usuarios' },
  ].filter(tab => hasPermission(tab.permission));

  const quickActions = [
    { id: 'qa-leads', label: 'Atender lead', tab: 'leads', permission: 'leads' },
    { id: 'qa-orcamentos', label: 'Ver orçamentos', tab: 'orcamentos', permission: 'orcamentos' },
    { id: 'qa-contratos', label: 'Aprovar contrato', tab: 'contratos', permission: 'contratos', badge: contratos.filter(item => item.status === 'Pendente').length },
    { id: 'qa-projetos', label: 'Projeto/visita', tab: 'projetos', permission: 'equipeTecnica', badge: projetos.filter(item => item.etapa !== 'Concluído').length },
    { id: 'qa-os', label: 'Abrir O.S', tab: 'ordensServico', permission: 'ordensServico', badge: ordensServico.filter(item => item.status === 'Aberta').length },
    { id: 'qa-precos', label: 'Calcular preço', tab: 'precosSistemas', permission: 'precosSistemas' },
    { id: 'qa-financeiro', label: 'Financeiro', tab: 'financeiro', permission: 'financeiro' },
    { id: 'qa-acessos', label: 'Acessos', tab: 'usuarios', permission: 'usuarios' },
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
      porResponsavel: leadUsers,
    };
  }, [leads, usuarios]);

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
  const osSummary = useMemo(() => ({
    total: ordensServico.length,
    abertas: ordensServico.filter(item => item.status === 'Aberta').length,
    andamento: ordensServico.filter(item => item.status === 'Em atendimento').length,
    resolvidas: ordensServico.filter(item => item.status === 'Resolvida').length,
  }), [ordensServico]);

  const request = async (path, options = {}) => {
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}${path}`, {
      ...options,
      headers: { ...headers, ...(options.headers || {}) },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Falha ao carregar dados.');
    return data;
  };

  const loadData = async (user) => {
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
    }
    if (user.role === 'ADM' || user.permissions?.financeiro) {
      calls.push(request('/api/admin/financeiro').then(setFinanceiro));
    }

    await Promise.allSettled(calls);
  };

  useEffect(() => {
    const loggedInUser = JSON.parse(localStorage.getItem('user'));
    const token = localStorage.getItem('token');

    if (!loggedInUser || !token) {
      navigate('/login');
      return;
    }

    if (loggedInUser.mustChangePassword) {
      navigate('/alterar-senha');
      return;
    }

    setAdminUser(loggedInUser);
    const firstTab = ['dashboard', 'leads', 'orcamentos', 'contratos', 'equipeTecnica', 'ordensServico', 'precosSistemas', 'clientes', 'financeiro', 'usuarios']
      .find(permission => loggedInUser.role === 'ADM' || loggedInUser.permissions?.[permission]);
    setActiveTab(firstTab === 'equipeTecnica' ? 'projetos' : firstTab || 'leads');
    loadData(loggedInUser).catch(err => setError(err.message));

    const handleNewOrcamento = (novoOrcamento) => {
      const canSee = loggedInUser.permissions?.verTodosLeads || novoOrcamento.assignedUserId === loggedInUser.id;
      if (canSee) setOrcamentos(prev => [novoOrcamento, ...prev]);
    };

    const handleNewLead = (novoLead) => {
      const canSee = loggedInUser.permissions?.verTodosLeads || novoLead.assignedUserId === loggedInUser.id;
      if (canSee) setLeads(prev => [novoLead, ...prev]);
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
  }, [navigate]);

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

  const registrarAtividade = async (event) => {
    event.preventDefault();
    if (!activityForm.leadId) return;
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
    setActivityForm({ leadId: '', tipo: 'Ligação', descricao: '', resultado: '', proximoRetorno: '' });
    request('/api/admin/resumo').then(setResumo).catch(() => {});
  };

  const updateProjeto = async (projetoId, payload) => {
    const projeto = await request(`/api/admin/projetos/${projetoId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    setProjetos(prev => prev.map(item => item.id === projeto.id ? projeto : item));
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
    const os = await request('/api/admin/ordens-servico', {
      method: 'POST',
      body: JSON.stringify(osForm),
    });
    setOrdensServico(prev => [os, ...prev]);
    setOsForm({ clienteNome: '', clienteTelefone: '', contratoId: '', origem: 'WhatsApp', problema: '', categoria: 'Suporte', prioridade: 'Normal', responsavelId: '', observacoes: '' });
  };

  const updateOrdemServico = async (osId, payload) => {
    const os = await request(`/api/admin/ordens-servico/${osId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    setOrdensServico(prev => prev.map(item => item.id === os.id ? os : item));
  };

  const updatePriceCurrency = (field, value) => {
    setPriceForm(prev => ({ ...prev, [field]: maskCurrency(value) }));
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

  const updatePermissions = async (userId, permissions, active) => {
    await request(`/api/admin/usuarios/${userId}/permissoes`, {
      method: 'PUT',
      body: JSON.stringify({ permissions, active }),
    });
    setUsuarios(prev => prev.map(user => user.id === userId ? { ...user, permissions, active } : user));
  };

  const createCliente = async (event) => {
    event.preventDefault();
    const cliente = await request('/api/admin/clientes', {
      method: 'POST',
      body: JSON.stringify(novoCliente),
    });
    setClientes(prev => [cliente, ...prev]);
    setNovoCliente({ nome: '', whatsapp: '', cidade: '', email: '' });
  };

  const openContractModal = (orcamento) => {
    const equipamento = equipamentos.find(item => item.id === Number(selectedEquipamentos[orcamento.id])) || equipamentos.find(item => item.active);
    setContractModal({
      open: true,
      orcamento,
      equipamentoId: equipamento?.id || '',
      manual: {
        ...emptyContractManual,
        geracaoKwh: orcamento.dimensionamento?.geracao_estimada_kwh || '',
        potenciaKwp: orcamento.dimensionamento?.potencia_real_instalada_kwp || '',
        painel: equipamento?.placaModelo || '',
        inversor: equipamento?.inversorModelo || '',
        valorSistema: orcamento.financeiro?.preco_final_cliente_rs || '',
        formaPagamentoTipo: 'avista',
      },
    });
  };

  const updateContractManual = (field, value) => {
    setContractModal(prev => ({ ...prev, manual: { ...prev.manual, [field]: value } }));
  };

  const gerarContrato = async (event) => {
    event.preventDefault();
    const { orcamento, equipamentoId, manual } = contractModal;
    if (!orcamento) return;

    const contrato = await request('/api/admin/contratos', {
      method: 'POST',
      body: JSON.stringify({ orcamentoId: orcamento.id, equipamentoId, manual }),
    });
    setContratos(prev => {
      const exists = prev.some(item => item.id === contrato.id);
      return exists ? prev.map(item => item.id === contrato.id ? contrato : item) : [contrato, ...prev];
    });
    setSelectedContrato(contrato);
    setContractModal({ open: false, orcamento: null, manual: emptyContractManual, equipamentoId: '' });
    setActiveTab('contratos');
  };

  const revisarContrato = async (contratoId, status) => {
    const normalizedReviewNote = reviewNote.trim();
    if (status === 'Recusado' && !normalizedReviewNote) {
      setReviewError('Informe o motivo da recusa antes de recusar o contrato.');
      return;
    }

    setReviewError('');
    const contrato = await request(`/api/admin/contratos/${contratoId}/revisao`, {
      method: 'PUT',
      body: JSON.stringify({ status, observacaoAnalise: normalizedReviewNote }),
    });
    setContratos(prev => prev.map(item => item.id === contrato.id ? contrato : item));
    setSelectedContrato(contrato);
    setReviewNote('');
    setReviewError('');
  };

  const getContratoDownloadUrl = (contratoId) => (
    `${import.meta.env.VITE_API_BASE_URL}/api/admin/contratos/${contratoId}/download?token=${localStorage.getItem('token')}`
  );

  const createEquipamento = async (event) => {
    event.preventDefault();
    const equipamento = await request('/api/admin/equipamentos', {
      method: 'POST',
      body: JSON.stringify(equipamentoForm),
    });
    setEquipamentos(prev => [equipamento, ...prev]);
    setEquipamentoForm({ nome: '', placaModelo: '', inversorModelo: '', potenciaPlacaW: '', potenciaInversorKw: '', observacoes: '' });
  };

  const saveContractConfig = async (event) => {
    event.preventDefault();
    const config = await request('/api/admin/contrato-config', {
      method: 'PUT',
      body: JSON.stringify(contractConfig),
    });
    setContractConfig(config);
  };

  const createDespesaFixa = async (event) => {
    event.preventDefault();
    await request('/api/admin/despesas-fixas', {
      method: 'POST',
      body: JSON.stringify(despesaForm),
    });
    setDespesaForm({ nome: '', valor: '', categoria: '' });
    const updated = await request('/api/admin/financeiro');
    setFinanceiro(updated);
  };

  return (
    <div className={`admin-layout ${isSidebarOpen ? 'sidebar-open' : ''}`}>
      {isSidebarOpen && <div className="sidebar-overlay" onClick={() => setIsSidebarOpen(false)}></div>}
      <aside className="admin-sidebar">
        <div className="sidebar-header">
          <Link to="/">
            <img src="/assets/logo.png" alt="DRM Admin" className="sidebar-logo-img" />
          </Link>
          <span className="sidebar-badge">{adminUser.role}</span>
        </div>

        <nav className="sidebar-nav">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`nav-item ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="icon"><SidebarIcon name={tab.id} /></span> {tab.label}
            </button>
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
                  className={`quick-action-btn ${quickModal === action.tab ? 'active' : ''}`}
                  onClick={() => setQuickModal(action.tab)}
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

          {activeTab === 'dashboard' && resumo && (
            <div className="crm-dashboard">
              <div className="section-heading">
                <div>
                  <span className="section-kicker">Controle geral</span>
                  <h3>Visão do dono da empresa</h3>
                  <p>Tudo que precisa de atenção hoje: vendas, contratos, projetos, retornos e equipe.</p>
                </div>
                <div className="section-stats">
                  <div><strong>{money(resumo.kpis?.valorAprovadoMes)}</strong><span>vendido no mês</span></div>
                  <div><strong>{resumo.kpis?.retornosSemana || 0}</strong><span>retornos 7 dias</span></div>
                  <div><strong>{resumo.kpis?.projetosAtivos || 0}</strong><span>projetos ativos</span></div>
                </div>
              </div>

              <div className="crm-kpi-grid">
                <div className="crm-kpi-card primary"><span>Leads captados</span><strong>{resumo.kpis?.leads || 0}</strong><p>{resumo.kpis?.novos || 0} aguardando primeiro atendimento.</p></div>
                <div className="crm-kpi-card"><span>Orçamentos</span><strong>{resumo.kpis?.orcamentos || 0}</strong><p>Simulações registradas no sistema.</p></div>
                <div className="crm-kpi-card"><span>Contratos pendentes</span><strong>{resumo.kpis?.contratosPendentes || 0}</strong><p>Precisam de aprovação do ADM.</p></div>
                <div className="crm-kpi-card"><span>Contratos aprovados</span><strong>{resumo.kpis?.contratosAprovados || 0}</strong><p>Viraram projeto de execução.</p></div>
              </div>

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
                    <h3>Projetos por etapa</h3>
                    <button className="btn btn-outline btn-sm-admin" onClick={() => setActiveTab('projetos')}>Abrir projetos</button>
                  </div>
                  <div className="pipeline-list">
                    {(resumo.projetosPorEtapa || []).map(item => (
                      <div className="pipeline-item" key={item.etapa}>
                        <div><strong>{item.etapa}</strong><span>{item.total} projeto{item.total === 1 ? '' : 's'}</span></div>
                        <div className="pipeline-bar orange"><span style={{ width: `${Math.min((item.total / Math.max(resumo.kpis?.projetosAtivos || 1, 1)) * 100, 100)}%` }}></span></div>
                      </div>
                    ))}
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
                    {(resumo.proximosRetornos || []).map(lead => (
                      <div className="mobile-list-item" key={lead.id}>
                        <div><strong>{lead.nome}</strong><span>{lead.cidade || 'Cidade não informada'} • {getResponsibleName(lead.assignedUserName)}</span></div>
                        <em>{dateBr(lead.proximoRetorno)}</em>
                      </div>
                    ))}
                    {(resumo.proximosRetornos || []).length === 0 && <p className="muted-text">Nenhum retorno agendado.</p>}
                  </div>
                </div>

                <div className="admin-card">
                  <div className="card-header-flex compact">
                    <h3>Projetos críticos</h3>
                    <span className="status-badge warning">prazos</span>
                  </div>
                  <div className="mobile-list">
                    {(resumo.projetosCriticos || []).map(projeto => (
                      <div className="mobile-list-item" key={projeto.id}>
                        <div><strong>{projeto.clienteNome}</strong><span>{projeto.etapa} • {getResponsibleName(projeto.responsavelNome)}</span></div>
                        <em>{dateBr(projeto.prazoPrevisto)}</em>
                      </div>
                    ))}
                    {(resumo.projetosCriticos || []).length === 0 && <p className="muted-text">Nenhum projeto crítico.</p>}
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
            <div className="admin-card">
              <div className="card-header-flex">
                <h3>Clientes cadastrados</h3>
                <span className="status-badge success">{clientes.length} clientes</span>
              </div>
              {hasPermission('gerenciarClientes') && (
                <form className="admin-inline-form" onSubmit={createCliente}>
                  <input placeholder="Nome" value={novoCliente.nome} onChange={(e) => setNovoCliente(prev => ({ ...prev, nome: e.target.value }))} required />
                  <input placeholder="WhatsApp" value={novoCliente.whatsapp} onChange={(e) => setNovoCliente(prev => ({ ...prev, whatsapp: e.target.value }))} required />
                  <input placeholder="Cidade" value={novoCliente.cidade} onChange={(e) => setNovoCliente(prev => ({ ...prev, cidade: e.target.value }))} required />
                  <input placeholder="E-mail" type="email" value={novoCliente.email} onChange={(e) => setNovoCliente(prev => ({ ...prev, email: e.target.value }))} required />
                  <button className="btn btn-primary" type="submit">Cadastrar cliente</button>
                </form>
              )}
              <div className="table-container">
                <table className="modern-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Cliente</th>
                      <th>Whatsapp</th>
                      <th>Localização</th>
                      <th>Cadastro</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientes.map(c => (
                      <tr key={c.id}>
                        <td data-label="ID">#{c.id}</td>
                        <td data-label="Cliente" className="font-medium">{c.nome}</td>
                        <td data-label="WhatsApp">{c.whatsapp}</td>
                        <td data-label="Localização">{c.cidade}</td>
                        <td data-label="Cadastro">{c.dataCadastro}</td>
                        <td data-label="Status"><span className="status-badge success">Ativo</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'leads' && (
            <div className="admin-card">
              <div className="card-header-flex">
                <h3>{hasPermission('verTodosLeads') ? 'Todos os leads' : 'Meus leads'}</h3>
                <span className="status-badge success">{leads.length} leads</span>
              </div>
              <div className="leads-summary">
                <div className="lead-summary-card lead-summary-card-total">
                  <span>Total captado</span>
                  <strong>{leadSummary.total}</strong>
                  <p>Leads recebidos pelo site.</p>
                </div>
                <div className="lead-summary-card">
                  <span>Novos</span>
                  <strong>{leadSummary.novos}</strong>
                  <p>Aguardando atendimento.</p>
                </div>
                <div className="lead-summary-card">
                  <span>Em atendimento</span>
                  <strong>{leadSummary.emAtendimento}</strong>
                  <p>Já assumidos pela equipe.</p>
                </div>
              </div>

              {hasPermission('verTodosLeads') && (
                <div className="consultant-summary">
                  <div className="consultant-summary-header">
                    <h4>Distribuição por consultor</h4>
                    <p>O sistema divide os novos leads em rodízio para manter a distribuição justa.</p>
                  </div>
                  <div className="consultant-summary-grid">
                    {leadSummary.porResponsavel.map(user => (
                      <div key={user.id} className="consultant-card">
                        <span>{user.role === 'EQUIPE_TECNICA_COMERCIAL' ? 'Equipe técnica/comercial' : 'Consultor'}</span>
                        <strong>{user.nome}</strong>
                        <p>{user.total} lead{user.total === 1 ? '' : 's'} recebido{user.total === 1 ? '' : 's'}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <form className="activity-panel" onSubmit={registrarAtividade}>
                <div>
                  <h4>Registrar contato</h4>
                  <p>Salve ligação, WhatsApp, visita e próximo retorno para não perder nenhum cliente.</p>
                </div>
                <select value={activityForm.leadId} onChange={(event) => setActivityForm(prev => ({ ...prev, leadId: event.target.value }))} required>
                  <option value="">Escolha o lead</option>
                  {leads.map(lead => <option key={lead.id} value={lead.id}>{lead.nome} - {lead.telefone}</option>)}
                </select>
                <select value={activityForm.tipo} onChange={(event) => setActivityForm(prev => ({ ...prev, tipo: event.target.value }))}>
                  <option>Ligação</option>
                  <option>WhatsApp</option>
                  <option>Visita</option>
                  <option>Proposta</option>
                  <option>Pós-venda</option>
                </select>
                <input placeholder="O que foi feito?" value={activityForm.descricao} onChange={(event) => setActivityForm(prev => ({ ...prev, descricao: event.target.value }))} required />
                <input placeholder="Resultado / observação" value={activityForm.resultado} onChange={(event) => setActivityForm(prev => ({ ...prev, resultado: event.target.value }))} />
                <input type="date" value={activityForm.proximoRetorno} onChange={(event) => setActivityForm(prev => ({ ...prev, proximoRetorno: event.target.value }))} />
                <button className="btn btn-primary" type="submit">Salvar contato</button>
              </form>

              <div className="list-section-header">
                <div>
                  <h4>Lista de atendimento</h4>
                  <p>Contatos captados pelo simulador, com responsável e ação rápida.</p>
                </div>
              </div>
              <div className="table-container leads-table-container">
                <table className="modern-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Nome</th>
                      <th>Telefone</th>
                      <th>E-mail</th>
                      <th>Cidade</th>
                      <th>Responsável</th>
                      <th>Status</th>
                      <th>Retorno</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map(lead => (
                      <tr key={lead.id}>
                        <td data-label="ID">#{lead.id}</td>
                        <td data-label="Nome" className="font-medium">{lead.nome}</td>
                        <td data-label="Telefone">{lead.telefone}</td>
                        <td data-label="E-mail">{lead.email}</td>
                        <td data-label="Cidade">{lead.cidade}</td>
                        <td data-label="Responsável">{getResponsibleName(lead.assignedUserName)}</td>
                        <td data-label="Status"><span className="status-badge success">{lead.status}</span></td>
                        <td data-label="Retorno">{lead.proximoRetorno ? dateBr(lead.proximoRetorno) : 'Sem retorno'}</td>
                        <td data-label="Ações">
                          <div className="table-actions">
                            <button className="btn btn-outline btn-sm-admin" onClick={() => updateLeadStatus(lead.id, 'Em atendimento')}>Atender</button>
                            <button className="btn btn-outline btn-sm-admin" onClick={() => updateLeadStatus(lead.id, 'Proposta enviada')}>Proposta</button>
                            <a className="btn btn-primary btn-sm-admin" href={`https://wa.me/55${String(lead.telefone || '').replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="activity-feed compact-feed">
                {atividades.slice(0, 5).map(atividade => (
                  <div className="activity-feed-item" key={atividade.id}>
                    <strong>{atividade.tipo} • {atividade.clienteNome}</strong>
                    <span>{atividade.descricao}</span>
                    <em>{atividade.criadoPorNome} em {dateBr(atividade.createdAt)}</em>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'orcamentos' && (
            <div className="orcamentos-view-grid">
              <div className="admin-card list-orcamentos">
                <h3>Simulações</h3>
                <div className="orcamentos-scroll">
                  {orcamentos.map(orc => (
                    <div
                      key={orc.id}
                      className={`orcamento-item ${selectedOrcamento?.id === orc.id ? 'active' : ''}`}
                      onClick={() => setSelectedOrcamento(orc)}
                    >
                      <div className="orc-info">
                        <strong>{orc.clienteNome}</strong>
                        <span className="kwp-tag">{orc.dimensionamento.potencia_real_instalada_kwp} kWp • {getResponsibleName(orc.assignedUserName)}</span>
                      </div>
                      <span className="orc-date">{orc.data}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="admin-card orcamento-detalhes">
                {selectedOrcamento ? (
                  <>
                    <h3>Detalhes da Simulação #{selectedOrcamento.id}</h3>
                    <div className="lead-contact-summary">
                      <div><span>Nome</span><strong>{selectedOrcamento.clienteNome}</strong></div>
                      <div><span>Telefone</span><strong>{selectedOrcamento.clienteTelefone || 'Não informado'}</strong></div>
                      <div><span>E-mail</span><strong>{selectedOrcamento.clienteEmail || 'Não informado'}</strong></div>
                      <div><span>Cidade</span><strong>{selectedOrcamento.clienteCidade || 'Não informado'}</strong></div>
                    </div>
                    <div className="detalhes-grid">
                      <div className="detalhe-item highlight">
                        <span className="detalhe-titulo">Preço Final Cliente</span>
                        <span className="detalhe-valor">{money(selectedOrcamento.financeiro.preco_final_cliente_rs)}</span>
                      </div>
                      <div className="detalhe-item"><span className="detalhe-titulo">Potência Instalada</span><span className="detalhe-valor">{selectedOrcamento.dimensionamento.potencia_real_instalada_kwp} kWp</span></div>
                      <div className="detalhe-item"><span className="detalhe-titulo">Nº de Painéis</span><span className="detalhe-valor">{selectedOrcamento.dimensionamento.numero_paineis_necessarios}</span></div>
                      <div className="detalhe-item"><span className="detalhe-titulo">Geração Estimada</span><span className="detalhe-valor">{selectedOrcamento.dimensionamento.geracao_estimada_kwh} kWh</span></div>
                      <div className="detalhe-item"><span className="detalhe-titulo">Conta Informada</span><span className="detalhe-valor">{money(selectedOrcamento.dimensionamento.valor_conta_reais)}</span></div>
                      <div className="detalhe-item"><span className="detalhe-titulo">Responsável</span><span className="detalhe-valor">{getResponsibleName(selectedOrcamento.assignedUserName)}</span></div>
                    </div>
                    {hasPermission('contratos') && (
                      <div className="contract-generation-panel">
                        <div>
                          <span className="section-kicker">Equipamento do contrato</span>
                          <h4>Selecione placa e inversor</h4>
                          <p>O modelo selecionado será preenchido automaticamente no contrato.</p>
                        </div>
                        <select
                          value={selectedEquipamentos[selectedOrcamento.id] || ''}
                          onChange={(event) => setSelectedEquipamentos(prev => ({ ...prev, [selectedOrcamento.id]: event.target.value }))}
                        >
                          <option value="">Usar equipamento padrão</option>
                          {equipamentos.filter(item => item.active).map(item => (
                            <option key={item.id} value={item.id}>{item.nome} • {item.placaModelo} • {item.inversorModelo}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="actions-footer">
                      {hasPermission('contratos') && (
                        <button className="btn btn-outline" onClick={() => openContractModal(selectedOrcamento)}>Gerar contrato</button>
                      )}
                      <a href={`https://wa.me/55${String(selectedOrcamento.clienteTelefone || '').replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="btn btn-primary">Contato</a>
                    </div>
                  </>
                ) : (
                  <div className="empty-state-orcamento">
                    <span className="icon">OR</span>
                    <h4>Selecione uma simulação</h4>
                    <p>Clique em um item da lista para ver os detalhes.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'contratos' && (
            <div className="admin-section">
              <div className="section-heading">
                <div>
                  <span className="section-kicker">Aprovação comercial</span>
                  <h3>Contratos</h3>
                  <p>A equipe pode gerar contratos, mas somente o Deivson/ADM aprova ou recusa antes de seguir com o cliente.</p>
                </div>
                <div className="section-stats">
                  <div>
                    <strong>{contratoSummary.total}</strong>
                    <span>contratos</span>
                  </div>
                  <div>
                    <strong>{contratoSummary.pendentes}</strong>
                    <span>pendentes</span>
                  </div>
                  <div>
                    <strong>{contratoSummary.aprovados}</strong>
                    <span>aprovados</span>
                  </div>
                </div>
              </div>

              <div className="contratos-grid">
                <div className="admin-card list-orcamentos">
                  <div className="card-header-flex compact">
                    <h3>Fila de análise</h3>
                    <span className="status-badge warning">{contratoSummary.pendentes} pendentes</span>
                  </div>
                  <div className="orcamentos-scroll contratos-scroll">
                    {contratos.map(contrato => (
                      <button
                        key={contrato.id}
                        className={`contrato-item ${selectedContrato?.id === contrato.id ? 'active' : ''}`}
                        onClick={() => setSelectedContrato(contrato)}
                      >
                        <div>
                          <strong>{contrato.clienteNome}</strong>
                          <span>{money(contrato.valorProjeto)} • {contrato.criadoPorNome}</span>
                        </div>
                        <span className={`status-badge ${contrato.status === 'Aprovado' ? 'success' : contrato.status === 'Recusado' ? 'danger' : 'warning'}`}>
                          {contrato.status}
                        </span>
                      </button>
                    ))}
                    {contratos.length === 0 && (
                      <div className="empty-inline">
                        <strong>Nenhum contrato gerado</strong>
                        <span>Abra uma simulação e clique em “Gerar contrato”.</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="admin-card contrato-detalhes">
                  {selectedContrato ? (
                    <>
                      <div className="contract-header">
                        <div>
                          <span className="section-kicker">Contrato #{selectedContrato.id}</span>
                          <h3>{selectedContrato.clienteNome}</h3>
                          <p>Gerado por {selectedContrato.criadoPorNome} e aguardando validação administrativa.</p>
                        </div>
                        <span className={`status-badge ${selectedContrato.status === 'Aprovado' ? 'success' : selectedContrato.status === 'Recusado' ? 'danger' : 'warning'}`}>
                          {selectedContrato.status}
                        </span>
                      </div>

                      <div className="lead-contact-summary">
                        <div><span>Telefone</span><strong>{selectedContrato.clienteTelefone || 'Não informado'}</strong></div>
                        <div><span>E-mail</span><strong>{selectedContrato.clienteEmail || 'Não informado'}</strong></div>
                        <div><span>Cidade</span><strong>{selectedContrato.clienteCidade || 'Não informado'}</strong></div>
                        <div><span>Responsável</span><strong>{getResponsibleName(selectedContrato.assignedUserName)}</strong></div>
                      </div>

                      <div className="detalhes-grid">
                        <div className="detalhe-item highlight"><span className="detalhe-titulo">Valor do contrato</span><span className="detalhe-valor">{money(selectedContrato.valorProjeto)}</span></div>
                        <div className="detalhe-item"><span className="detalhe-titulo">Potência</span><span className="detalhe-valor">{selectedContrato.dados?.manual?.potenciaKwp || selectedContrato.dados?.dimensionamento?.potencia_real_instalada_kwp || 0} kWp</span></div>
                        <div className="detalhe-item"><span className="detalhe-titulo">Painéis</span><span className="detalhe-valor">{selectedContrato.dados?.dimensionamento?.numero_paineis_necessarios || 0}</span></div>
                        <div className="detalhe-item"><span className="detalhe-titulo">Geração estimada</span><span className="detalhe-valor">{selectedContrato.dados?.manual?.geracaoKwh || selectedContrato.dados?.dimensionamento?.geracao_estimada_kwh || 0} kWh</span></div>
                        <div className="detalhe-item"><span className="detalhe-titulo">Placa</span><span className="detalhe-valor">{selectedContrato.equipamentoDados?.placaModelo || 'Não informado'}</span></div>
                        <div className="detalhe-item"><span className="detalhe-titulo">Inversor</span><span className="detalhe-valor">{selectedContrato.equipamentoDados?.inversorModelo || 'Não informado'}</span></div>
                        <div className="detalhe-item"><span className="detalhe-titulo">Cabo</span><span className="detalhe-valor">{selectedContrato.dados?.manual?.quantidadeCabo || 'Não informado'}</span></div>
                        <div className="detalhe-item"><span className="detalhe-titulo">Pagamento</span><span className="detalhe-valor">{selectedContrato.dados?.manual?.formaPagamento || 'Não informado'}</span></div>
                      </div>

                      {selectedContrato.observacaoAnalise && (
                        <div className="contract-note">
                          <span>Observação da análise</span>
                          <p>{selectedContrato.observacaoAnalise}</p>
                        </div>
                      )}

                      {adminUser.role === 'ADM' && selectedContrato.status === 'Pendente' && (
                        <div className="review-box">
                          <label htmlFor="review-note">Observação para a equipe</label>
                          <textarea
                            id="review-note"
                            placeholder="Ex: revisar condição de pagamento, documentação ok, valor aprovado..."
                            value={reviewNote}
                            onChange={(event) => {
                              setReviewNote(event.target.value);
                              if (reviewError) setReviewError('');
                            }}
                          />
                          {reviewError && <p className="review-error">{reviewError}</p>}
                          <div className="actions-footer">
                            <button className="btn btn-outline" onClick={() => revisarContrato(selectedContrato.id, 'Recusado')}>Recusar</button>
                            <button className="btn btn-primary" onClick={() => revisarContrato(selectedContrato.id, 'Aprovado')}>Aprovar contrato</button>
                          </div>
                        </div>
                      )}

                      {selectedContrato.status === 'Aprovado' && (
                        <div className="approved-actions">
                          <div>
                            <strong>Contrato liberado</strong>
                            <span>Agora o arquivo pode ser baixado e enviado para o cliente.</span>
                          </div>
                          <div className="approved-actions-buttons">
                            <a className="btn btn-outline" href={getContratoDownloadUrl(selectedContrato.id)} target="_blank" rel="noopener noreferrer">
                              Baixar contrato
                            </a>
                            <a
                              className="btn btn-primary"
                              href={`https://wa.me/55${String(selectedContrato.clienteTelefone || '').replace(/\D/g, '')}?text=${encodeURIComponent('Olá! Seu contrato DRM Solar foi aprovado. Vou te enviar o arquivo para conferência.')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Enviar ao cliente
                            </a>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="empty-state-orcamento">
                      <span className="icon">CT</span>
                      <h4>Selecione um contrato</h4>
                      <p>Escolha um contrato na fila para ver detalhes e análise.</p>
                    </div>
                  )}
                </div>
              </div>

              {adminUser.role === 'ADM' && (
                <div className="contract-admin-grid">
                  <div className="admin-card">
                    <div className="card-header-flex">
                      <div>
                        <h3>Equipamentos</h3>
                        <p className="muted-text">Cadastre os modelos usados com frequência e selecione no contrato pela setinha.</p>
                      </div>
                      <span className="status-badge success">{equipamentos.length} itens</span>
                    </div>
                    <form className="equipment-form" onSubmit={createEquipamento}>
                      <input placeholder="Nome do kit" value={equipamentoForm.nome} onChange={(e) => setEquipamentoForm(prev => ({ ...prev, nome: e.target.value }))} required />
                      <input placeholder="Modelo da placa" value={equipamentoForm.placaModelo} onChange={(e) => setEquipamentoForm(prev => ({ ...prev, placaModelo: e.target.value }))} required />
                      <input placeholder="Modelo do inversor" value={equipamentoForm.inversorModelo} onChange={(e) => setEquipamentoForm(prev => ({ ...prev, inversorModelo: e.target.value }))} required />
                      <input placeholder="Potência placa W" type="number" value={equipamentoForm.potenciaPlacaW} onChange={(e) => setEquipamentoForm(prev => ({ ...prev, potenciaPlacaW: e.target.value }))} />
                      <input placeholder="Potência inversor kW" type="number" step="0.01" value={equipamentoForm.potenciaInversorKw} onChange={(e) => setEquipamentoForm(prev => ({ ...prev, potenciaInversorKw: e.target.value }))} />
                      <input placeholder="Observações" value={equipamentoForm.observacoes} onChange={(e) => setEquipamentoForm(prev => ({ ...prev, observacoes: e.target.value }))} />
                      <button className="btn btn-primary" type="submit">Adicionar</button>
                    </form>
                    <div className="equipment-list">
                      {equipamentos.map(item => (
                        <div className="equipment-item" key={item.id}>
                          <strong>{item.nome}</strong>
                          <span>{item.placaModelo} • {item.inversorModelo}</span>
                        </div>
                      ))}
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

          {activeTab === 'projetos' && (
            <div className="admin-section">
              <div className="section-heading">
                <div>
                  <span className="section-kicker">Operação</span>
                  <h3>Projetos e instalações</h3>
                  <p>Pesquise o cliente, abra o projeto e registre etapa, fotos e observações em poucos toques.</p>
                </div>
                <div className="section-stats">
                  <div><strong>{projetos.length}</strong><span>projetos</span></div>
                  <div><strong>{projetos.filter(item => item.etapa !== 'Concluído').length}</strong><span>ativos</span></div>
                  <div><strong>{projetos.filter(item => item.etapa === 'Concluído').length}</strong><span>concluídos</span></div>
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
                  placeholder="Ex: Cliente Demo, #12, 99991..."
                />
                <span>{filteredProjetos.length} resultado{filteredProjetos.length === 1 ? '' : 's'}</span>
              </div>

              <div className="project-board simple-project-board">
                {projectStages.map(stage => (
                  <div className="project-column" key={stage}>
                    <div className="project-column-header">
                      <strong>{stage}</strong>
                      <span>{filteredProjetos.filter(projeto => projeto.etapa === stage).length}</span>
                    </div>
                    {filteredProjetos.filter(projeto => projeto.etapa === stage).map(projeto => (
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
                    {filteredProjetos.filter(projeto => projeto.etapa === stage).length === 0 && (
                      <div className="empty-inline">
                        <strong>Nada nessa etapa</strong>
                        <span>Nenhum projeto encontrado aqui.</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {selectedProjeto && (
                <div className="contract-modal-backdrop" onClick={() => setSelectedProjeto(null)}>
                  <div className="project-detail-modal" onClick={(event) => event.stopPropagation()}>
                    <div className="contract-modal-header">
                      <div>
                        <span className="section-kicker">Contrato #{selectedProjeto.contratoId}</span>
                        <h3>{selectedProjeto.clienteNome}</h3>
                        <p>{selectedProjeto.clienteCidade || 'Cidade não informada'} • {getResponsibleName(selectedProjeto.responsavelNome)}</p>
                      </div>
                      <button type="button" className="lead-modal-close" onClick={() => setSelectedProjeto(null)}>×</button>
                    </div>

                    <div className="project-detail-grid">
                      <div className="detalhe-item highlight"><span className="detalhe-titulo">Valor</span><span className="detalhe-valor">{money(selectedProjeto.valorProjeto)}</span></div>
                      <div className="detalhe-item"><span className="detalhe-titulo">Etapa</span><span className="detalhe-valor">{selectedProjeto.etapa}</span></div>
                      <div className="detalhe-item"><span className="detalhe-titulo">Prazo</span><span className="detalhe-valor">{dateBr(selectedProjeto.prazoPrevisto)}</span></div>
                      <div className="detalhe-item"><span className="detalhe-titulo">Prioridade</span><span className="detalhe-valor">{selectedProjeto.prioridade || 'Normal'}</span></div>
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
                    </div>

                    <div className="quick-actions">
                      <button type="button" onClick={() => updateProjeto(selectedProjeto.id, { etapa: 'Vistoria', checklist: { ...(selectedProjeto.checklist || {}), vistoriaRealizada: true } })}>Vistoria feita</button>
                      <button type="button" onClick={() => updateProjeto(selectedProjeto.id, { etapa: 'Projeto técnico', checklist: { ...(selectedProjeto.checklist || {}), projetoTecnico: true } })}>Projeto pronto</button>
                      <button type="button" onClick={() => updateProjeto(selectedProjeto.id, { etapa: 'Instalação', checklist: { ...(selectedProjeto.checklist || {}), homologacao: true } })}>Liberado instalar</button>
                      <button type="button" onClick={() => updateProjeto(selectedProjeto.id, { etapa: 'Concluído', checklist: { ...(selectedProjeto.checklist || {}), sistemaLigado: true } })}>Concluir</button>
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

                      <div className="project-modal-section">
                        <h4>Escritório</h4>
                        <p className="muted-text">Use para documentação, projeto técnico e homologação.</p>
                        <div className="project-checklist modal-checklist simple-checklist">
                          {officeChecklistKeys.map(key => (
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
                    <input placeholder="Valor" type="number" step="0.01" value={despesaForm.valor} onChange={(event) => setDespesaForm(prev => ({ ...prev, valor: event.target.value }))} required />
                    <input placeholder="Categoria" value={despesaForm.categoria} onChange={(event) => setDespesaForm(prev => ({ ...prev, categoria: event.target.value }))} />
                    <button className="btn btn-primary" type="submit">Registrar</button>
                  </form>
                  <div className="fixed-cost-list">
                    {(financeiro.despesasFixas || []).map(item => (
                      <div key={item.id} className="fixed-cost-item">
                        <div><strong>{item.nome}</strong><span>{item.categoria || 'Geral'}</span></div>
                        <strong>{money(item.valor)}</strong>
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

          {activeTab === 'precosSistemas' && (
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
                    <label>Valor do kit solar<input value={priceForm.valorKitSolar} onChange={(event) => updatePriceCurrency('valorKitSolar', event.target.value)} placeholder="R$ 0,00" inputMode="numeric" /></label>
                    <label>Custo de instalação<input value={priceForm.custoInstalacao} onChange={(event) => updatePriceCurrency('custoInstalacao', event.target.value)} placeholder="R$ 0,00" inputMode="numeric" /></label>
                    <label>Material CA<input value={priceForm.materialCA} onChange={(event) => updatePriceCurrency('materialCA', event.target.value)} placeholder="R$ 0,00" inputMode="numeric" /></label>
                    <label>Deslocamento<input value={priceForm.deslocamento} onChange={(event) => updatePriceCurrency('deslocamento', event.target.value)} placeholder="R$ 0,00" inputMode="numeric" /></label>
                    <label>Custo adicional<input value={priceForm.custoAdicional} onChange={(event) => updatePriceCurrency('custoAdicional', event.target.value)} placeholder="R$ 0,00" inputMode="numeric" /></label>
                    <label>Margem da empresa<input value={priceForm.margemEmpresa} onChange={(event) => updatePriceCurrency('margemEmpresa', event.target.value)} placeholder="R$ 0,00" inputMode="numeric" /></label>
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

              <div className="os-grid">
                {['Aberta', 'Em atendimento', 'Aguardando cliente', 'Resolvida'].map(status => (
                  <div className="os-column" key={status}>
                    <div className="project-column-header">
                      <strong>{status}</strong>
                      <span>{ordensServico.filter(os => os.status === status).length}</span>
                    </div>
                    {ordensServico.filter(os => os.status === status).map(os => (
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
                            <a className="btn btn-outline btn-sm-admin" href={`https://wa.me/55${String(os.clienteTelefone || '').replace(/\D/g, '')}?text=${encodeURIComponent(`Olá! Estamos acompanhando sua O.S #${os.id} na DRM Solar.`)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                          )}
                          <button className="btn btn-primary btn-sm-admin" onClick={() => updateOrdemServico(os.id, { status: 'Resolvida' })}>Resolver</button>
                        </div>
                      </div>
                    ))}
                    {ordensServico.filter(os => os.status === status).length === 0 && (
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

              <div className="user-permissions-list">
                {usuarios.map(user => (
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
                        <span className="role-chip">{roleLabels[user.role] || user.role}</span>
                        {user.mustChangePassword && <span className="pending-chip">Troca pendente</span>}
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
              </div>
            </div>
          )}
        </div>
      </main>

      {quickModal && (
        <div className="contract-modal-backdrop" onClick={() => setQuickModal(null)}>
          <div className="quick-modal" onClick={(event) => event.stopPropagation()}>
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
                      {lead.telefone && <a className="btn btn-primary btn-sm-admin" href={`https://wa.me/55${String(lead.telefone || '').replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
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
                {projetos.filter(item => item.etapa !== 'Concluído').slice(0, 8).map(projeto => (
                  <div className="quick-modal-item quick-project-item" key={projeto.id}>
                    <div className="quick-project-head">
                      <div>
                      <strong>{projeto.clienteNome}</strong>
                      <span>Contrato #{projeto.contratoId} • {projeto.etapa} • {projectPhotos[projeto.id]?.length || 0} fotos</span>
                      </div>
                      <button className="btn btn-outline btn-sm-admin" onClick={() => { setSelectedProjeto(projeto); setQuickModal(null); }}>Detalhes</button>
                    </div>
                    <div className="quick-project-actions">
                      <button type="button" onClick={() => updateProjeto(projeto.id, { etapa: 'Vistoria', checklist: { ...(projeto.checklist || {}), vistoriaRealizada: true } })}>Vistoria feita</button>
                      <button type="button" onClick={() => updateProjeto(projeto.id, { etapa: 'Instalação', checklist: { ...(projeto.checklist || {}), homologacao: true } })}>Liberar instalação</button>
                      <button type="button" onClick={() => updateProjeto(projeto.id, { etapa: 'Concluído', checklist: { ...(projeto.checklist || {}), sistemaLigado: true } })}>Concluir</button>
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
                        {os.clienteTelefone && <a className="btn btn-outline btn-sm-admin" href={`https://wa.me/55${String(os.clienteTelefone || '').replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
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
                <input value={priceForm.valorKitSolar} onChange={(event) => updatePriceCurrency('valorKitSolar', event.target.value)} placeholder="Valor do kit solar" inputMode="numeric" />
                <input value={priceForm.custoInstalacao} onChange={(event) => updatePriceCurrency('custoInstalacao', event.target.value)} placeholder="Custo de instalação" inputMode="numeric" />
                <input value={priceForm.materialCA} onChange={(event) => updatePriceCurrency('materialCA', event.target.value)} placeholder="Material CA" inputMode="numeric" />
                <input value={priceForm.deslocamento} onChange={(event) => updatePriceCurrency('deslocamento', event.target.value)} placeholder="Deslocamento" inputMode="numeric" />
                <input value={priceForm.custoAdicional} onChange={(event) => updatePriceCurrency('custoAdicional', event.target.value)} placeholder="Custo adicional" inputMode="numeric" />
                <input value={priceForm.margemEmpresa} onChange={(event) => updatePriceCurrency('margemEmpresa', event.target.value)} placeholder="Margem da empresa" inputMode="numeric" />
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

      {contractModal.open && (
        <div className="contract-modal-backdrop" onClick={() => setContractModal({ open: false, orcamento: null, manual: emptyContractManual, equipamentoId: '' })}>
          <form className="contract-modal" onSubmit={gerarContrato} onClick={(event) => event.stopPropagation()}>
            <div className="contract-modal-header">
              <div>
                <span className="section-kicker">Dados variáveis do contrato</span>
                <h3>{contractModal.orcamento?.clienteNome}</h3>
                <p>Cliente, empresa e dados de contato entram automático. Preencha só o que muda em cada contrato.</p>
              </div>
              <button type="button" className="lead-modal-close" onClick={() => setContractModal({ open: false, orcamento: null, manual: emptyContractManual, equipamentoId: '' })}>×</button>
            </div>

            <div className="contract-modal-grid">
              <label>
                Geração em kWh
                <input value={contractModal.manual.geracaoKwh} onChange={(event) => updateContractManual('geracaoKwh', event.target.value)} placeholder="Ex: 660" required />
              </label>
              <label>
                Potência em kWp
                <input value={contractModal.manual.potenciaKwp} onChange={(event) => updateContractManual('potenciaKwp', event.target.value)} placeholder="Ex: 5.49" required />
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
                      manual: {
                        ...prev.manual,
                        painel: equipamento?.placaModelo || prev.manual.painel,
                        inversor: equipamento?.inversorModelo || prev.manual.inversor,
                      },
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
                <input type="number" step="0.01" value={contractModal.manual.valorSistema} onChange={(event) => updateContractManual('valorSistema', event.target.value)} placeholder="Ex: 14675" required />
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
