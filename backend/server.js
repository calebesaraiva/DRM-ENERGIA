const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3001;

// Configuração do Servidor HTTP para suportar o Socket.io
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' } // Simplificado para aceitar qualquer conexão de websocket
});

// Middlewares
const allowedOrigins = ['http://localhost:5173'];
const corsOptions = {
  origin: (origin, callback) => {
    // Permite requisições sem 'origin' (ex: Postman, apps mobile)
    if (!origin) return callback(null, true);

    // Permite URLs do ngrok
    if (/\.ngrok-free\.app$/.test(origin)) {
      return callback(null, true);
    }

    // Permite URLs do localtunnel
    if (/\.loca\.lt$/.test(origin)) {
      return callback(null, true);
    }

    // Permite URLs do Cloudflare Tunnel
    if (/\.trycloudflare\.com$/.test(origin)) {
      return callback(null, true);
    }

    // Permite domínios da Netlify
    if (/\.netlify\.app$/.test(origin)) {
      return callback(null, true);
    }

    // Permite origens da lista
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  }
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '25mb' }));
app.use('/assets', express.static(path.join(__dirname, '../frontend/public/assets')));

// Chave secreta para o JWT. Em produção, isso DEVE estar em uma variável de ambiente.
const JWT_SECRET = 'seu-segredo-super-secreto-e-dificil-de-adivinhar';

// --- CONFIGURAÇÃO DO BANCO DE DADOS SQLITE ---
let db;

const DEFAULT_PERMISSIONS = {
  dashboard: true,
  clientes: false,
  leads: false,
  orcamentos: false,
  contratos: false,
  ordensServico: false,
  precosSistemas: false,
  financeiro: false,
  equipeTecnica: false,
  usuarios: false,
  permissoes: false,
  verTodosLeads: false,
  gerenciarClientes: false,
};

const INTERNAL_USERS = [
  {
    nome: 'Deivson DRM',
    username: 'deivson',
    email: 'deivson@drm.local',
    role: 'ADM',
    temporaryPassword: 'Deivson@DRM#2026',
    permissions: {
      dashboard: true,
      clientes: true,
      leads: true,
      orcamentos: true,
      contratos: true,
      ordensServico: true,
      precosSistemas: true,
      financeiro: true,
      equipeTecnica: true,
      usuarios: true,
      permissoes: true,
      verTodosLeads: true,
      gerenciarClientes: true,
    },
  },
  {
    nome: 'Nexus Teste',
    username: 'nexus',
    email: 'nexus@drm.local',
    role: 'ADM',
    temporaryPassword: '1234',
    mustChangePassword: false,
    permissions: {
      dashboard: true,
      clientes: true,
      leads: true,
      orcamentos: true,
      contratos: true,
      ordensServico: true,
      precosSistemas: true,
      financeiro: true,
      equipeTecnica: true,
      usuarios: true,
      permissoes: true,
      verTodosLeads: true,
      gerenciarClientes: true,
    },
  },
  {
    nome: 'Rene Jr',
    username: 'renejr',
    email: 'renejr@drm.local',
    role: 'EQUIPE_TECNICA_COMERCIAL',
    temporaryPassword: 'ReneJr@DRM#2026',
    permissions: {
      dashboard: true,
      leads: true,
      orcamentos: true,
      contratos: true,
      ordensServico: true,
      precosSistemas: true,
      equipeTecnica: true,
    },
  },
  {
    nome: 'Gleyson',
    username: 'gleyson',
    email: 'gleyson@drm.local',
    role: 'CONSULTOR',
    temporaryPassword: 'Gleyson@DRM#2026',
    permissions: {
      dashboard: true,
      leads: true,
      orcamentos: true,
      contratos: true,
    },
  },
  {
    nome: 'Carlito',
    username: 'carlito',
    email: 'carlito@drm.local',
    role: 'CONSULTOR',
    temporaryPassword: 'Carlito@DRM#2026',
    permissions: {
      dashboard: true,
      leads: true,
      orcamentos: true,
      contratos: true,
    },
  },
  {
    nome: 'Ivaldo',
    username: 'ivaldo',
    email: 'ivaldo@drm.local',
    role: 'CONSULTOR',
    temporaryPassword: 'Ivaldo@DRM#2026',
    permissions: {
      dashboard: true,
      leads: true,
      orcamentos: true,
      contratos: true,
    },
  },
];

const mergePermissions = (permissions = {}) => ({
  ...DEFAULT_PERMISSIONS,
  ...permissions,
});

const parsePermissions = (value) => {
  try {
    return mergePermissions(value ? JSON.parse(value) : {});
  } catch {
    return mergePermissions();
  }
};

const can = (user, permission) => user?.permissions?.[permission] === true;

const sanitizeUser = (user) => ({
  id: user.id,
  nome: user.nome,
  username: user.username,
  email: user.email,
  role: user.role,
  permissions: user.permissions,
  mustChangePassword: Boolean(user.mustChangePassword),
});

const authRequired = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = (authHeader && authHeader.split(' ')[1]) || req.query.token;

  if (!token) {
    return res.status(401).json({ message: 'Login necessário.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.userType === 'interno') {
      const user = await db.get('SELECT * FROM usuarios WHERE id = ? AND active = 1', decoded.id);
      if (!user) return res.status(401).json({ message: 'Usuário inválido.' });

      req.user = {
        ...user,
        userType: 'interno',
        permissions: parsePermissions(user.permissions),
      };
      if (req.user.mustChangePassword && !['/api/change-password', '/api/me'].includes(req.path)) {
        return res.status(403).json({ message: 'Troque a senha temporária antes de acessar o painel.' });
      }
      return next();
    }

    req.user = { ...decoded, userType: decoded.userType || 'cliente', permissions: mergePermissions() };
    return next();
  } catch {
    return res.status(401).json({ message: 'Sessão inválida ou expirada.' });
  }
};

const requirePermission = (permission) => (req, res, next) => {
  if (req.user?.role === 'ADM' || can(req.user, permission)) return next();
  return res.status(403).json({ message: 'Você não tem permissão para acessar esta área.' });
};

const getSetting = async (key, fallback = null) => {
  const row = await db.get('SELECT value FROM settings WHERE key = ?', key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value);
  } catch {
    return row.value;
  }
};

const setSetting = async (key, value) => {
  await db.run(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    key,
    JSON.stringify(value)
  );
};

const getNextLeadOwner = async () => {
  const eligible = await getLeadOwners();

  if (eligible.length === 0) return null;

  const leadCounts = await db.all(
    `SELECT assignedUserId, COUNT(*) as total
     FROM leads
     WHERE assignedUserId IS NOT NULL
     GROUP BY assignedUserId`
  );
  const countsByUser = leadCounts.reduce((acc, row) => {
    acc[row.assignedUserId] = row.total;
    return acc;
  }, {});

  const lowestTotal = Math.min(...eligible.map(user => countsByUser[user.id] || 0));
  const leastLoaded = eligible.filter(user => (countsByUser[user.id] || 0) === lowestTotal);
  const currentIndex = Number(await getSetting('leadRoundRobinIndex', -1));
  const nextIndex = (currentIndex + 1) % leastLoaded.length;

  await setSetting('leadRoundRobinIndex', nextIndex);
  return leastLoaded[nextIndex];
};

const getLeadOwners = async () => {
  const users = await db.all('SELECT * FROM usuarios WHERE active = 1 ORDER BY id ASC');
  return users
    .map(user => ({ ...user, permissions: parsePermissions(user.permissions) }))
    .filter(user => user.role !== 'ADM' && can(user, 'leads'));
};

const normalizeLeadDistribution = async () => {
  const owners = await getLeadOwners();
  if (owners.length === 0) return;

  const unassignedLeads = await db.all(
    'SELECT id FROM leads WHERE assignedUserId IS NULL OR assignedUserName IS NULL OR assignedUserName = ? ORDER BY id ASC',
    'Sem responsável'
  );

  for (const lead of unassignedLeads) {
    const owner = await getNextLeadOwner();
    if (!owner) break;

    await db.run(
      'UPDATE leads SET assignedUserId = ?, assignedUserName = ? WHERE id = ?',
      owner.id,
      owner.nome,
      lead.id
    );
  }

  const unassignedOrcamentos = await db.all(
    `SELECT o.id, l.assignedUserId, l.assignedUserName
     FROM orcamentos o
     LEFT JOIN leads l ON l.id = o.leadId
     WHERE o.assignedUserId IS NULL OR o.assignedUserName IS NULL OR o.assignedUserName = ?
     ORDER BY o.id ASC`,
    'Sem responsável'
  );

  for (let index = 0; index < unassignedOrcamentos.length; index += 1) {
    const linkedOwner = unassignedOrcamentos[index].assignedUserId
      ? { id: unassignedOrcamentos[index].assignedUserId, nome: unassignedOrcamentos[index].assignedUserName }
      : owners[index % owners.length];

    await db.run(
      'UPDATE orcamentos SET assignedUserId = ?, assignedUserName = ? WHERE id = ?',
      linkedOwner.id,
      linkedOwner.nome,
      unassignedOrcamentos[index].id
    );
  }
};

const createProjetoFromContrato = async (contrato) => {
  if (!contrato || contrato.status !== 'Aprovado') return null;

  const existing = await db.get('SELECT * FROM projetos WHERE contratoId = ?', contrato.id);
  if (existing) return parseProjeto(existing);

  const checklist = {
    documentacaoRecebida: false,
    vistoriaRealizada: false,
    projetoTecnico: false,
    homologacao: false,
    instalacao: false,
    vistoriaFinal: false,
    sistemaLigado: false,
  };
  const now = new Date();
  const prazo = new Date(now);
  prazo.setDate(prazo.getDate() + 30);

  const result = await db.run(
    `INSERT INTO projetos
      (contratoId, clienteNome, clienteTelefone, clienteCidade, valorProjeto, etapa, prioridade, responsavelId, responsavelNome, checklist, observacoes, dataInicio, prazoPrevisto, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    contrato.id,
    contrato.clienteNome,
    contrato.clienteTelefone,
    contrato.clienteCidade,
    Number(contrato.valorProjeto) || 0,
    PROJECT_STAGES[0],
    'Normal',
    contrato.assignedUserId || contrato.criadoPorId || null,
    contrato.assignedUserName || contrato.criadoPorNome || null,
    JSON.stringify(checklist),
    'Projeto criado automaticamente após aprovação do contrato.',
    now.toISOString(),
    prazo.toISOString().split('T')[0],
    now.toISOString()
  );

  const projeto = parseProjeto(await db.get('SELECT * FROM projetos WHERE id = ?', result.lastID));
  io.emit('projeto_atualizado', projeto);
  return projeto;
};

const ensureProjetosForApprovedContracts = async () => {
  const contratosAprovados = await db.all('SELECT * FROM contratos WHERE status = ?', 'Aprovado');
  for (const contrato of contratosAprovados) {
    await createProjetoFromContrato(contrato);
  }
};

const seedDemoData = async () => {
  const demoVersion = 'finance-contract-demo-v1';
  if (await getSetting('demoSeedVersion', null) === demoVersion) return;

  const owners = await getLeadOwners();
  if (owners.length === 0) return;

  const equipamentosCount = await db.get('SELECT COUNT(*) as count FROM equipamentos');
  if (equipamentosCount.count < 3) {
    const kits = [
      ['Kit Growatt 5kW + 610W', 'Painel Monocristalino 610W Half Cell', 'Inversor Growatt 5kW', 610, 5],
      ['Kit Deye 8kW + 610W', 'Painel Monocristalino 610W N-Type', 'Inversor Deye 8kW', 610, 8],
      ['Kit Solis 10kW + 610W', 'Painel Monocristalino 610W Bifacial', 'Inversor Solis 10kW', 610, 10],
    ];
    for (const kit of kits) {
      await db.run(
        `INSERT INTO equipamentos
          (nome, placaModelo, inversorModelo, potenciaPlacaW, potenciaInversorKw, observacoes, active, createdAt)
         VALUES (?, ?, ?, ?, ?, 'Demonstração para contratos', 1, ?)`,
        ...kit,
        new Date().toISOString()
      );
    }
  }

  const despesasCount = await db.get('SELECT COUNT(*) as count FROM despesas_fixas');
  if (despesasCount.count === 0) {
    const despesas = [
      ['Aluguel', 2500, 'Estrutura'],
      ['Internet e sistemas', 480, 'Operacional'],
      ['Contabilidade', 650, 'Administrativo'],
      ['Marketing', 1200, 'Comercial'],
      ['Combustível e deslocamento', 1800, 'Operacional'],
    ];
    for (const despesa of despesas) {
      await db.run(
        'INSERT INTO despesas_fixas (nome, valor, categoria, active, createdAt) VALUES (?, ?, ?, 1, ?)',
        ...despesa,
        new Date().toISOString()
      );
    }
  }

  const current = new Date();
  const lastMonth = new Date(current.getFullYear(), current.getMonth() - 1, 12);
  const formatDate = (date) => date.toISOString().split('T')[0];
  const demos = [
    { nome: 'Cliente Demo Aprovado', telefone: '99991675608', email: 'aprovado.demo@drm.local', cidade: 'Imperatriz', conta: 550, status: 'Aprovado', owner: owners[0], date: current, manual: { geracaoKwh: '660', potenciaKwp: '5.49', quantidadeCabo: '42 metros', valorSistema: 14675, formaPagamentoTipo: 'misto', formaPagamento: 'Entrada de R$ 2.000,00 + restante financiado em banco parceiro.' } },
    { nome: 'Cliente Demo Pendente', telefone: '99990000111', email: 'pendente.demo@drm.local', cidade: 'Açailândia', conta: 700, status: 'Pendente', owner: owners[1 % owners.length], date: current, manual: { geracaoKwh: '850', potenciaKwp: '7.32', quantidadeCabo: '55 metros', valorSistema: 19250, formaPagamentoTipo: 'financiado', formaPagamento: 'Financiamento total aguardando aprovação.' } },
    { nome: 'Cliente Demo Recusado', telefone: '99990000222', email: 'recusado.demo@drm.local', cidade: 'João Lisboa', conta: 430, status: 'Recusado', owner: owners[2 % owners.length], date: current, manual: { geracaoKwh: '520', potenciaKwp: '4.27', quantidadeCabo: '36 metros', valorSistema: 12250, formaPagamentoTipo: 'cartao', formaPagamento: 'Cartão de crédito em 10x, recusado para revisão de margem.' } },
    { nome: 'Cliente Demo Mês Passado', telefone: '99990000333', email: 'passado.demo@drm.local', cidade: 'Davinópolis', conta: 1000, status: 'Aprovado', owner: owners[3 % owners.length], date: lastMonth, manual: { geracaoKwh: '1220', potenciaKwp: '10.37', quantidadeCabo: '80 metros', valorSistema: 20750, formaPagamentoTipo: 'avista', formaPagamento: 'À vista com desconto comercial.' } },
  ];

  const equipamentos = await db.all('SELECT * FROM equipamentos WHERE active = 1 ORDER BY id ASC');
  for (let index = 0; index < demos.length; index += 1) {
    const demo = demos[index];
    const exists = await db.get('SELECT id FROM contratos WHERE clienteEmail = ?', demo.email);
    if (exists) continue;

    const resultado = calcularSimulacaoSolar({ contaEnergia: demo.conta });
    const dataCadastro = formatDate(demo.date);
    const owner = demo.owner;
    const lead = await db.run(
      `INSERT INTO leads
        (nome, telefone, email, cidade, origem, status, dataCadastro, assignedUserId, assignedUserName)
       VALUES (?, ?, ?, ?, 'Demonstração', ?, ?, ?, ?)`,
      demo.nome,
      demo.telefone,
      demo.email,
      demo.cidade,
      demo.status === 'Pendente' ? 'Novo' : 'Em atendimento',
      dataCadastro,
      owner.id,
      owner.nome
    );
    const orc = await db.run(
      `INSERT INTO orcamentos
        (leadId, clienteNome, clienteTelefone, clienteEmail, clienteCidade, status, data, dimensionamento, financeiro, assignedUserId, assignedUserName)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      lead.lastID,
      demo.nome,
      demo.telefone,
      demo.email,
      demo.cidade,
      demo.status === 'Aprovado' ? 'Fechado' : 'Aberto',
      dataCadastro,
      JSON.stringify(resultado.dimensionamento),
      JSON.stringify(resultado.financeiro),
      owner.id,
      owner.nome
    );
    const equipamento = equipamentos[index % equipamentos.length];
    const manual = {
      ...demo.manual,
      painel: equipamento.placaModelo,
      inversor: equipamento.inversorModelo,
    };
    const contrato = await db.run(
      `INSERT INTO contratos
        (orcamentoId, clienteNome, clienteTelefone, clienteEmail, clienteCidade, valorProjeto, status, dados,
         criadoPorId, criadoPorNome, analisadoPorId, analisadoPorNome, observacaoAnalise, dataCriacao, dataAnalise,
         assignedUserId, assignedUserName, equipamentoId, equipamentoNome, equipamentoDados)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      orc.lastID,
      demo.nome,
      demo.telefone,
      demo.email,
      demo.cidade,
      manual.valorSistema,
      demo.status,
      JSON.stringify({ dimensionamento: resultado.dimensionamento, financeiro: resultado.financeiro, manual, statusOrigem: 'Demonstração' }),
      owner.id,
      owner.nome,
      demo.status === 'Pendente' ? null : 1,
      demo.status === 'Pendente' ? null : 'Deivson DRM',
      demo.status === 'Recusado' ? 'Demonstração recusada para testar revisão.' : (demo.status === 'Aprovado' ? 'Demonstração aprovada para testar impressão.' : null),
      demo.date.toISOString(),
      demo.status === 'Pendente' ? null : demo.date.toISOString(),
      owner.id,
      owner.nome,
      equipamento.id,
      equipamento.nome,
      JSON.stringify({ ...equipamento, placaModelo: manual.painel, inversorModelo: manual.inversor })
    );
  }

  await setSetting('demoSeedVersion', demoVersion);
};

const calcularSimulacaoSolar = (body) => {
  const { contaEnergia } = body;

  if (!contaEnergia || contaEnergia <= 0) {
    const error = new Error('Informações insuficientes ou inválidas para o cálculo.');
    error.statusCode = 400;
    throw error;
  }

  const mediaReais = Number(contaEnergia);
  const fatorConversaoContaKwh = 1.7;
  const consumoMensalKwh = mediaReais * fatorConversaoContaKwh;
  const potencia_painel_w = body.potencia_painel_w || 610;
  const fator_geracao_regiao = 120;
  const potencia_painel_kw = potencia_painel_w / 1000;

  const potencia_calculada = consumoMensalKwh / fator_geracao_regiao;
  const num_paineis = Math.ceil(potencia_calculada / potencia_painel_kw);
  const P_real = num_paineis * potencia_painel_kw;
  const geracao_estimada_kwh = P_real * fator_geracao_regiao;

  const preco_final_cliente = (15 * consumoMensalKwh) + 5750;

  return {
    dimensionamento: {
      valor_conta_reais: parseFloat(mediaReais.toFixed(2)),
      consumo_mensal_kwh: parseFloat(consumoMensalKwh.toFixed(2)),
      fator_conversao_conta_kwh: fatorConversaoContaKwh,
      potencia_calculada_kwp: parseFloat(potencia_calculada.toFixed(2)),
      potencia_real_instalada_kwp: parseFloat(P_real.toFixed(2)),
      numero_paineis_necessarios: num_paineis,
      potencia_painel_utilizado_w: potencia_painel_w,
      geracao_estimada_kwh: Math.round(geracao_estimada_kwh / 10) * 10,
      respostas_usuario: body
    },
    financeiro: {
      base_consumo_kwh: parseFloat(consumoMensalKwh.toFixed(2)),
      valor_por_kwh_rs: 15,
      custo_base_rs: 5750,
      formula_preco: 'Valor = (15 x kWh estimado) + 5750',
      preco_final_cliente_rs: parseFloat(preco_final_cliente.toFixed(2))
    }
  };
};

const parseJsonField = (value, fallback = {}) => {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const parseContrato = (contrato) => ({
  ...contrato,
  dados: parseJsonField(contrato.dados),
  equipamentoDados: parseJsonField(contrato.equipamentoDados),
});

const PROJECT_STAGES = [
  'Documentação',
  'Vistoria',
  'Projeto técnico',
  'Homologação',
  'Instalação',
  'Vistoria final',
  'Concluído',
];

const parseProjeto = (projeto) => ({
  ...projeto,
  checklist: parseJsonField(projeto.checklist, {}),
});

const DEFAULT_CONTRACT_TEMPLATE = {
  version: 'drm-pdf-standard-v2',
  empresa: {
    nome: 'DRM Energia Solar',
    cnpj: '',
    telefone: '(99) 99167-5608',
    email: '',
    endereco: 'Av Jacob, R. São Luís - Jardim Tropical, Imperatriz - MA, 65910-727',
  },
  visual: {
    logoPosition: 'right',
    logoWidth: 86,
    primaryColor: '#F97316',
  },
  titulo: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS',
  corpo: `
<h2>CLÁUSULA PRIMEIRA - DO OBJETO</h2>
<p>O presente contrato tem por objeto o fornecimento, instalação e comissionamento de sistema solar fotovoltaico, composto por módulos, inversor, estruturas, cabos e demais itens necessários à execução do projeto aprovado.</p>
<p>A CONTRATADA executará o sistema conforme os dados técnicos descritos neste instrumento e conforme disponibilidade dos modelos cadastrados no sistema.</p>

<h2>CLÁUSULA SEGUNDA - DAS CONDIÇÕES DE PAGAMENTO</h2>
<p>O valor total do sistema será de <strong>{{contrato.valor}}</strong>, conforme condição comercial informada a seguir: <strong>{{contrato.formaPagamento}}</strong>.</p>
<p>Havendo financiamento, cartão de crédito, pagamento à vista ou condição mista, prevalecerá a forma detalhada no quadro de condições comerciais deste contrato.</p>

<h2>CLÁUSULA TERCEIRA - DAS RESPONSABILIDADES</h2>
<p>A CONTRATADA fica responsável pela instalação do sistema fotovoltaico, observando as normas técnicas aplicáveis, condições de segurança e viabilidade do local de instalação.</p>
<p>O CONTRATANTE deverá fornecer as informações necessárias, permitir o acesso ao imóvel e disponibilizar documentação quando solicitada pela equipe técnica/comercial.</p>

<h2>CLÁUSULA QUARTA - DOS PRAZOS E GARANTIAS</h2>
<p>Os prazos de execução serão definidos conforme aprovação técnica, disponibilidade dos equipamentos e confirmação das condições de pagamento. Os equipamentos seguirão as garantias fornecidas pelos fabricantes.</p>

<h2>CLÁUSULA QUINTA - DA APROVAÇÃO INTERNA</h2>
<p>Este contrato foi gerado pelo sistema DRM Solar e aprovado por <strong>{{contrato.aprovadoPor}}</strong> em <strong>{{contrato.dataAprovacao}}</strong>.</p>
`,
};

const escapeHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const formatCurrency = (value) => Number(value || 0).toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const formatDateBr = (value = new Date()) => new Date(value).toLocaleDateString('pt-BR');

const getContractTemplate = async () => {
  const saved = await getSetting('contractTemplate', null);
  if (!saved || saved.version !== DEFAULT_CONTRACT_TEMPLATE.version) {
    return DEFAULT_CONTRACT_TEMPLATE;
  }
  return {
    ...DEFAULT_CONTRACT_TEMPLATE,
    ...(saved || {}),
    empresa: { ...DEFAULT_CONTRACT_TEMPLATE.empresa, ...(saved?.empresa || {}) },
    visual: { ...DEFAULT_CONTRACT_TEMPLATE.visual, ...(saved?.visual || {}) },
  };
};

const getNestedValue = (source, path) => path.split('.').reduce((acc, key) => acc?.[key], source);

const renderTemplate = (template, variables) => template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
  const value = getNestedValue(variables, key);
  return escapeHtml(value ?? '');
});

const getLogoDataUri = () => {
  try {
    const logoPath = path.join(__dirname, '../frontend/public/assets/logo.png');
    return `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`;
  } catch {
    return '';
  }
};

const buildContratoHtml = async (contrato) => {
  const parsed = parseContrato(contrato);
  const dimensionamento = parsed.dados?.dimensionamento || {};
  const manual = parsed.dados?.manual || {};
  const template = await getContractTemplate();
  const equipamento = parsed.equipamentoDados || {};
  const variables = {
    empresa: template.empresa,
    cliente: {
      nome: parsed.clienteNome,
      telefone: parsed.clienteTelefone || 'Não informado',
      email: parsed.clienteEmail || 'Não informado',
      cidade: parsed.clienteCidade || 'Não informado',
    },
    projeto: {
      potencia: manual.potenciaKwp || dimensionamento.potencia_real_instalada_kwp || 0,
      paineis: dimensionamento.numero_paineis_necessarios || 0,
      geracao: manual.geracaoKwh || dimensionamento.geracao_estimada_kwh || 0,
      quantidadeCabo: manual.quantidadeCabo || 'Não informado',
    },
    equipamento: {
      nome: parsed.equipamentoNome || equipamento.nome || 'Não informado',
      placaModelo: manual.painel || equipamento.placaModelo || 'Não informado',
      inversorModelo: manual.inversor || equipamento.inversorModelo || 'Não informado',
      potenciaPlacaW: equipamento.potenciaPlacaW || '',
      potenciaInversorKw: equipamento.potenciaInversorKw || '',
    },
    contrato: {
      id: parsed.id,
      valor: formatCurrency(manual.valorSistema || parsed.valorProjeto),
      formaPagamento: manual.formaPagamento || 'Não informado',
      status: parsed.status,
      aprovadoPor: parsed.analisadoPorNome || 'Administrador',
      dataAprovacao: parsed.dataAnalise ? new Date(parsed.dataAnalise).toLocaleDateString('pt-BR') : '',
    },
  };
  const logoAlign = ['left', 'center', 'right'].includes(template.visual.logoPosition) ? template.visual.logoPosition : 'center';
  const bodyHtml = renderTemplate(template.corpo || DEFAULT_CONTRACT_TEMPLATE.corpo, variables);
  const primaryColor = template.visual.primaryColor || '#F97316';
  const projectRows = [
    ['Geração em KWh', `${variables.projeto.geracao} kWh`],
    ['Potência em KWp', `${variables.projeto.potencia} kWp`],
    ['Painel', variables.equipamento.placaModelo],
    ['Inversor', variables.equipamento.inversorModelo],
    ['Quantidade de painéis', variables.projeto.paineis],
    ['Quantidade de cabo', variables.projeto.quantidadeCabo],
    ['Valor do sistema', variables.contrato.valor],
    ['Forma de pagamento', variables.contrato.formaPagamento],
  ];
  const materialRows = [
    ['MÓDULO FOTOVOLTAICO', variables.equipamento.placaModelo, variables.projeto.paineis],
    ['INVERSOR FOTOVOLTAICO', variables.equipamento.inversorModelo, 1],
    ['CABO SOLAR', variables.projeto.quantidadeCabo, 'Incluso'],
    ['CONECTOR MC4 MACHO/FÊMEA', 'Conectores para ligação do sistema', 'Incluso'],
    ['ESTRUTURA DE FIXAÇÃO', 'Estrutura metálica compatível com o telhado', 'Incluso'],
    ['STRINGBOX / PROTEÇÃO CC', 'Proteção elétrica do sistema', 'Incluso'],
    ['PROJETO E HOMOLOGAÇÃO', 'Documentação junto à concessionária', 'Incluso'],
    ['MÃO DE OBRA E COMISSIONAMENTO', 'Instalação, testes e acompanhamento inicial', 'Incluso'],
  ];
  const renderInfoRows = (rows) => rows.map(([label, value]) => `
    <tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value ?? 'Não informado')}</td></tr>
  `).join('');
  const renderMaterialRows = (rows) => rows.map(([title, description, unit]) => `
    <tr>
      <td><strong>${escapeHtml(title)}</strong><small>${escapeHtml(description ?? '')}</small></td>
      <td>${escapeHtml(unit ?? 'Incluso')}</td>
    </tr>
  `).join('');

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Contrato DRM Solar #${parsed.id}</title>
  <style>
    @page { size: A4; margin: 13mm 12mm 15mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #eef1f5;
      color: #1f2933;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 10.6px;
      line-height: 1.38;
    }
    .page {
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto 18px;
      padding: 10mm 12mm 12mm;
      background: #fff;
      position: relative;
      overflow: hidden;
      box-shadow: 0 12px 40px rgba(15, 23, 42, 0.12);
    }
    .page::before,
    .page::after {
      content: "";
      position: absolute;
      left: 0;
      right: 0;
      height: 8px;
      background: ${primaryColor};
    }
    .page::before { top: 0; }
    .page::after { bottom: 0; }
    .top {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: start;
      gap: 16px;
      padding-bottom: 8px;
      border-bottom: 2px solid ${primaryColor};
    }
    .logo { text-align: ${logoAlign}; }
    .logo img { width: ${Number(template.visual.logoWidth) || 86}px; max-width: 100%; height: auto; }
    h1 {
      margin: 4px 0 4px;
      color: #111827;
      font-size: 15px;
      font-weight: 900;
      letter-spacing: 0.2px;
      text-transform: uppercase;
    }
    .meta { color: #6b7280; font-size: 9.5px; font-weight: 700; text-transform: uppercase; }
    .contract-id {
      display: inline-flex;
      margin-top: 6px;
      padding: 4px 9px;
      border-radius: 999px;
      background: #fff7ed;
      color: #9a3412;
      font-size: 9.4px;
      font-weight: 900;
      border: 1px solid #fed7aa;
    }
    h2 {
      margin: 10px 0 6px;
      padding: 5px 8px;
      background: #fde2ce;
      color: #111827;
      border-left: 4px solid ${primaryColor};
      font-size: 10px;
      font-weight: 900;
      text-transform: uppercase;
    }
    p { margin: 0 0 6px; text-align: justify; }
    .intro {
      margin-top: 8px;
      padding: 8px 9px;
      border: 1px solid #f5c4a1;
      background: #fff7ed;
      font-size: 10.2px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin: 8px 0 10px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      page-break-inside: avoid;
    }
    th {
      padding: 6px 7px;
      background: #f8b98f;
      border: 1px solid #f0a36e;
      color: #111827;
      font-size: 9.4px;
      text-align: left;
      text-transform: uppercase;
    }
    td {
      padding: 6px 7px;
      border: 1px solid #e5e7eb;
      vertical-align: top;
    }
    .info-table td:first-child {
      width: 34%;
      background: #f8fafc;
      color: #475569;
      font-weight: 900;
      text-transform: uppercase;
      font-size: 9px;
    }
    .info-table td:last-child { font-weight: 700; }
    .material-table td:first-child { width: 84%; }
    .material-table td:last-child {
      text-align: center;
      font-weight: 800;
      color: #334155;
      background: #fbfdff;
    }
    .material-table small {
      display: block;
      margin-top: 2px;
      color: #dc2626;
      font-size: 8.5px;
      font-weight: 700;
    }
    .clauses { margin-top: 4px; }
    .signatures {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 34px;
      margin-top: 34px;
      page-break-inside: avoid;
    }
    .line {
      border-top: 1px solid #111827;
      padding-top: 7px;
      text-align: center;
      font-size: 9.8px;
      font-weight: 800;
    }
    .footer {
      position: absolute;
      left: 12mm;
      right: 12mm;
      bottom: 6mm;
      display: flex;
      justify-content: space-between;
      gap: 12px;
      color: #f97316;
      font-size: 8px;
      font-weight: 800;
    }
    @media print {
      body { background: #fff; }
      .page { width: auto; min-height: auto; margin: 0; padding: 0; box-shadow: none; }
      .page::before, .page::after { left: -12mm; right: -12mm; }
      .footer { position: fixed; }
    }
  </style>
</head>
<body>
  <main class="page">
    <header class="top">
      <div>
        <div class="meta">Contrato gerado pelo sistema DRM Solar</div>
        <h1>${escapeHtml(template.titulo || DEFAULT_CONTRACT_TEMPLATE.titulo)}</h1>
        <div class="meta">${escapeHtml(template.empresa.nome)} • ${escapeHtml(template.empresa.endereco || '')}</div>
        <span class="contract-id">Contrato #${parsed.id} • ${escapeHtml(parsed.status)}</span>
      </div>
      <div class="logo"><img src="${getLogoDataUri()}" alt="${escapeHtml(template.empresa.nome)}" /></div>
    </header>

    <section class="intro">
      Pelo presente instrumento particular, de um lado <strong>${escapeHtml(template.empresa.nome)}</strong>, inscrita no CNPJ
      <strong>${escapeHtml(template.empresa.cnpj || 'não informado')}</strong>, doravante denominada CONTRATADA, e de outro lado
      <strong>${escapeHtml(parsed.clienteNome)}</strong>, telefone <strong>${escapeHtml(parsed.clienteTelefone || 'não informado')}</strong>,
      e-mail <strong>${escapeHtml(parsed.clienteEmail || 'não informado')}</strong>, cidade <strong>${escapeHtml(parsed.clienteCidade || 'não informado')}</strong>,
      doravante denominado CONTRATANTE, firmam o presente contrato.
    </section>

    <div class="info-grid">
      <section>
        <h2>Dados do contratante</h2>
        <table class="info-table">
          ${renderInfoRows([
            ['Nome', variables.cliente.nome],
            ['Telefone', variables.cliente.telefone],
            ['E-mail', variables.cliente.email],
            ['Cidade', variables.cliente.cidade],
          ])}
        </table>
      </section>
      <section>
        <h2>Condições comerciais</h2>
        <table class="info-table">
          ${renderInfoRows([
            ['Valor do sistema', variables.contrato.valor],
            ['Forma de pagamento', variables.contrato.formaPagamento],
            ['Aprovado por', variables.contrato.aprovadoPor],
            ['Data de aprovação', variables.contrato.dataAprovacao || formatDateBr()],
          ])}
        </table>
      </section>
    </div>

    <section>
      <h2>Dados técnicos do sistema</h2>
      <table class="info-table">${renderInfoRows(projectRows)}</table>
    </section>

    <section>
      <h2>Descrição dos equipamentos e serviços inclusos</h2>
      <table class="material-table">
        <thead><tr><th>Descrição</th><th>Un.</th></tr></thead>
        <tbody>${renderMaterialRows(materialRows)}</tbody>
      </table>
    </section>

    <section class="clauses">${bodyHtml}</section>

    <div class="signatures">
      <div class="line">${escapeHtml(template.empresa.nome)}<br />CONTRATADA</div>
      <div class="line">${escapeHtml(parsed.clienteNome)}<br />CONTRATANTE</div>
    </div>

    <footer class="footer">
      <span>${escapeHtml(template.empresa.endereco || '')}</span>
      <span>${escapeHtml(template.empresa.telefone || '')} ${template.empresa.email ? `• ${escapeHtml(template.empresa.email)}` : ''}</span>
    </footer>
  </main>
</body>
</html>`;
};

(async () => {
  db = await open({
    filename: './database.db',
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      whatsapp TEXT,
      cidade TEXT,
      email TEXT UNIQUE,
      password TEXT,
      dataCadastro TEXT
    );

    CREATE TABLE IF NOT EXISTS orcamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clienteId INTEGER,
      clienteNome TEXT,
      status TEXT,
      data TEXT,
      dimensionamento TEXT,
      financeiro TEXT,
      FOREIGN KEY (clienteId) REFERENCES clientes(id)
    );

    CREATE TABLE IF NOT EXISTS portfolio (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      description TEXT,
      imageUrl TEXT
    );

    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      telefone TEXT,
      email TEXT,
      cidade TEXT,
      origem TEXT,
      status TEXT,
      dataCadastro TEXT
    );

    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL,
      permissions TEXT,
      mustChangePassword INTEGER DEFAULT 1,
      active INTEGER DEFAULT 1,
      createdAt TEXT
    );

    CREATE TABLE IF NOT EXISTS contratos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      orcamentoId INTEGER,
      clienteNome TEXT NOT NULL,
      clienteTelefone TEXT,
      clienteEmail TEXT,
      clienteCidade TEXT,
      valorProjeto REAL,
      status TEXT DEFAULT 'Pendente',
      dados TEXT,
      criadoPorId INTEGER,
      criadoPorNome TEXT,
      analisadoPorId INTEGER,
      analisadoPorNome TEXT,
      observacaoAnalise TEXT,
      dataCriacao TEXT,
      dataAnalise TEXT,
      assignedUserId INTEGER,
      assignedUserName TEXT,
      equipamentoId INTEGER,
      equipamentoNome TEXT,
      equipamentoDados TEXT,
      FOREIGN KEY (orcamentoId) REFERENCES orcamentos(id)
    );

    CREATE TABLE IF NOT EXISTS equipamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      placaModelo TEXT NOT NULL,
      inversorModelo TEXT NOT NULL,
      potenciaPlacaW INTEGER,
      potenciaInversorKw REAL,
      observacoes TEXT,
      active INTEGER DEFAULT 1,
      createdAt TEXT
    );

    CREATE TABLE IF NOT EXISTS despesas_fixas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      valor REAL NOT NULL,
      categoria TEXT,
      active INTEGER DEFAULT 1,
      createdAt TEXT
    );

    CREATE TABLE IF NOT EXISTS atividades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      leadId INTEGER,
      clienteNome TEXT,
      tipo TEXT,
      descricao TEXT,
      resultado TEXT,
      proximoRetorno TEXT,
      criadoPorId INTEGER,
      criadoPorNome TEXT,
      createdAt TEXT,
      FOREIGN KEY (leadId) REFERENCES leads(id)
    );

    CREATE TABLE IF NOT EXISTS projetos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contratoId INTEGER UNIQUE,
      clienteNome TEXT NOT NULL,
      clienteTelefone TEXT,
      clienteCidade TEXT,
      valorProjeto REAL,
      etapa TEXT,
      prioridade TEXT,
      responsavelId INTEGER,
      responsavelNome TEXT,
      checklist TEXT,
      observacoes TEXT,
      dataInicio TEXT,
      prazoPrevisto TEXT,
      updatedAt TEXT,
      FOREIGN KEY (contratoId) REFERENCES contratos(id)
    );

    CREATE TABLE IF NOT EXISTS projeto_fotos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      projetoId INTEGER NOT NULL,
      dataUrl TEXT NOT NULL,
      descricao TEXT,
      categoria TEXT,
      criadoPorId INTEGER,
      criadoPorNome TEXT,
      createdAt TEXT,
      FOREIGN KEY (projetoId) REFERENCES projetos(id)
    );

    CREATE TABLE IF NOT EXISTS ordens_servico (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clienteNome TEXT NOT NULL,
      clienteTelefone TEXT,
      contratoId INTEGER,
      origem TEXT,
      problema TEXT NOT NULL,
      categoria TEXT,
      prioridade TEXT,
      status TEXT,
      responsavelId INTEGER,
      responsavelNome TEXT,
      solucao TEXT,
      observacoes TEXT,
      dataAbertura TEXT,
      dataAtualizacao TEXT,
      dataFechamento TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  const orcamentoColumns = await db.all('PRAGMA table_info(orcamentos)');
  const existingOrcamentoColumns = orcamentoColumns.map(column => column.name);
  if (!existingOrcamentoColumns.includes('leadId')) {
    await db.exec('ALTER TABLE orcamentos ADD COLUMN leadId INTEGER');
  }
  if (!existingOrcamentoColumns.includes('clienteTelefone')) {
    await db.exec('ALTER TABLE orcamentos ADD COLUMN clienteTelefone TEXT');
  }
  if (!existingOrcamentoColumns.includes('clienteEmail')) {
    await db.exec('ALTER TABLE orcamentos ADD COLUMN clienteEmail TEXT');
  }
  if (!existingOrcamentoColumns.includes('clienteCidade')) {
    await db.exec('ALTER TABLE orcamentos ADD COLUMN clienteCidade TEXT');
  }
  if (!existingOrcamentoColumns.includes('assignedUserId')) {
    await db.exec('ALTER TABLE orcamentos ADD COLUMN assignedUserId INTEGER');
  }
  if (!existingOrcamentoColumns.includes('assignedUserName')) {
    await db.exec('ALTER TABLE orcamentos ADD COLUMN assignedUserName TEXT');
  }

  const leadColumns = await db.all('PRAGMA table_info(leads)');
  const existingLeadColumns = leadColumns.map(column => column.name);
  if (!existingLeadColumns.includes('assignedUserId')) {
    await db.exec('ALTER TABLE leads ADD COLUMN assignedUserId INTEGER');
  }
  if (!existingLeadColumns.includes('assignedUserName')) {
    await db.exec('ALTER TABLE leads ADD COLUMN assignedUserName TEXT');
  }
  if (!existingLeadColumns.includes('ultimoContato')) {
    await db.exec('ALTER TABLE leads ADD COLUMN ultimoContato TEXT');
  }
  if (!existingLeadColumns.includes('observacoes')) {
    await db.exec('ALTER TABLE leads ADD COLUMN observacoes TEXT');
  }
  if (!existingLeadColumns.includes('proximoRetorno')) {
    await db.exec('ALTER TABLE leads ADD COLUMN proximoRetorno TEXT');
  }
  if (!existingLeadColumns.includes('motivoPerda')) {
    await db.exec('ALTER TABLE leads ADD COLUMN motivoPerda TEXT');
  }

  const contratoColumns = await db.all('PRAGMA table_info(contratos)');
  const existingContratoColumns = contratoColumns.map(column => column.name);
  if (!existingContratoColumns.includes('equipamentoId')) {
    await db.exec('ALTER TABLE contratos ADD COLUMN equipamentoId INTEGER');
  }
  if (!existingContratoColumns.includes('equipamentoNome')) {
    await db.exec('ALTER TABLE contratos ADD COLUMN equipamentoNome TEXT');
  }
  if (!existingContratoColumns.includes('equipamentoDados')) {
    await db.exec('ALTER TABLE contratos ADD COLUMN equipamentoDados TEXT');
  }

  for (const user of INTERNAL_USERS) {
    const existingUser = await db.get('SELECT id FROM usuarios WHERE username = ?', user.username);
    if (!existingUser) {
      await db.run(
        `INSERT INTO usuarios
          (nome, username, email, password, role, permissions, mustChangePassword, active, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        user.nome,
        user.username,
        user.email,
        await bcrypt.hash(user.temporaryPassword, 10),
        user.role,
        JSON.stringify(mergePermissions(user.permissions)),
        user.mustChangePassword === false ? 0 : 1,
        new Date().toISOString()
      );
    } else if (user.username === 'nexus') {
      await db.run(
        'UPDATE usuarios SET password = ?, role = ?, permissions = ?, mustChangePassword = 0, active = 1 WHERE username = ?',
        await bcrypt.hash(user.temporaryPassword, 10),
        user.role,
        JSON.stringify(mergePermissions(user.permissions)),
        user.username
      );
    }
  }

  const savedUsers = await db.all('SELECT id, permissions FROM usuarios');
  for (const savedUser of savedUsers) {
    let rawPermissions = {};
    try {
      rawPermissions = savedUser.permissions ? JSON.parse(savedUser.permissions) : {};
    } catch {}

    if (rawPermissions.orcamentos === true && typeof rawPermissions.contratos === 'undefined') {
      await db.run(
        'UPDATE usuarios SET permissions = ? WHERE id = ?',
        JSON.stringify(mergePermissions({ ...rawPermissions, contratos: true })),
        savedUser.id
      );
    }
    if (rawPermissions.equipeTecnica === true && rawPermissions.ordensServico !== true) {
      await db.run(
        'UPDATE usuarios SET permissions = ? WHERE id = ?',
        JSON.stringify(mergePermissions({ ...rawPermissions, ordensServico: true })),
        savedUser.id
      );
    }
    if ((rawPermissions.financeiro === true || rawPermissions.equipeTecnica === true) && rawPermissions.precosSistemas !== true) {
      await db.run(
        'UPDATE usuarios SET permissions = ? WHERE id = ?',
        JSON.stringify(mergePermissions({ ...rawPermissions, precosSistemas: true })),
        savedUser.id
      );
    }
  }

  const equipamentosCount = await db.get('SELECT COUNT(*) as count FROM equipamentos');
  if (equipamentosCount.count === 0) {
    await db.run(
      `INSERT INTO equipamentos
        (nome, placaModelo, inversorModelo, potenciaPlacaW, potenciaInversorKw, observacoes, active, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
      'Kit padrão DRM',
      'Painel solar 610 W',
      'Inversor padrão conforme projeto',
      610,
      null,
      'Equipamento padrão inicial. Edite conforme os modelos usados pela empresa.',
      new Date().toISOString()
    );
  }

  const savedTemplate = await getSetting('contractTemplate', null);
  if (!savedTemplate || savedTemplate.version !== DEFAULT_CONTRACT_TEMPLATE.version) {
    await setSetting('contractTemplate', DEFAULT_CONTRACT_TEMPLATE);
  }

  await normalizeLeadDistribution();
  await seedDemoData();
  await ensureProjetosForApprovedContracts();

  // Popula o portfólio com dados de exemplo se estiver vazio
  const portfolioCount = await db.get('SELECT COUNT(*) as count FROM portfolio');
  if (portfolioCount.count === 0) {
    console.log('Populando a tabela de portfólio...');
    const projetosPortfolio = [
      { title: 'Residência Cliente 1', description: 'Sistema com excelente captação solar, gerando alta economia.', imageUrl: '/assets/cliente1.jpg' },
      { title: 'Projeto Cliente 2', description: 'Instalação otimizada para o telhado, garantindo eficiência máxima.', imageUrl: '/assets/cliente2.jpg' },
      { title: 'Projeto Cliente 3', description: 'Sistema robusto para suprir alta demanda energética.', imageUrl: '/assets/cliente3.jpg' },
      { title: 'Instalação Comercial', description: 'Solução completa para empresas que buscam reduzir custos com energia.', imageUrl: '/assets/cliente4.jpg' },
      { title: 'Projeto Rural Sustentável', description: 'Autonomia energética para propriedades rurais, com alta durabilidade.', imageUrl: '/assets/cliente5.jpg' }
    ];
    const stmt = await db.prepare('INSERT INTO portfolio (title, description, imageUrl) VALUES (?, ?, ?)');
    for (const proj of projetosPortfolio) {
      await stmt.run(proj.title, proj.description, proj.imageUrl);
    }
    await stmt.finalize();
    console.log('Tabela de portfólio populada.');
  }

  // Garante que o usuário admin exista e tenha a senha correta
  const adminEmail = 'SOLAR@';
  const adminPassword = 'solar610';
  const hashedPassword = await bcrypt.hash(adminPassword, 10);
  const adminUser = await db.get('SELECT id FROM clientes WHERE email = ?', adminEmail);

  if (!adminUser) {
    console.log('Usuário admin não encontrado, criando...');
    await db.run(
      'INSERT INTO clientes (nome, email, password, dataCadastro) VALUES (?, ?, ?, ?)',
      'SOLAR@', adminEmail, hashedPassword, new Date().toISOString().split('T')[0]
    );
    console.log('Usuário admin criado com sucesso.');
  } else {
    console.log('Usuário admin encontrado. Garantindo que a senha esteja atualizada.');
    await db.run('UPDATE clientes SET password = ? WHERE email = ?', hashedPassword, adminEmail);
    console.log('Senha do admin atualizada.');
  }
})();

// --- ROTAS DA API ---

app.get('/', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'API da DRM Energia Solar está no ar!' });
});

app.get('/api/portfolio', async (req, res) => {
  const projetos = await db.all('SELECT * FROM portfolio');
  res.json(projetos);
});

app.post('/api/calcular', async (req, res) => {
  try {
    res.json(calcularSimulacaoSolar(req.body));
  } catch (error) {
    console.error('ERRO NO CÁLCULO DA SIMULAÇÃO:', error);
    res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : 'Ocorreu um erro interno no servidor ao processar a simulação.' });
  }
});

app.post('/api/simulacao-publica', async (req, res) => {
  const { lead, simulacao } = req.body;

  if (!lead?.nome || !lead?.telefone || !lead?.email || !lead?.cidade) {
    return res.status(400).json({ message: 'Preencha nome, telefone, e-mail e cidade para continuar.' });
  }

  try {
    const resultadoCompleto = calcularSimulacaoSolar(simulacao);
    const dataCadastro = new Date().toISOString().split('T')[0];
    const owner = await getNextLeadOwner();

    const leadResult = await db.run(
      `INSERT INTO leads
        (nome, telefone, email, cidade, origem, status, dataCadastro, assignedUserId, assignedUserName)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      lead.nome.trim(),
      lead.telefone.trim(),
      lead.email.trim(),
      lead.cidade.trim(),
      'Simulação do site',
      'Novo',
      dataCadastro,
      owner?.id || null,
      owner?.nome || null
    );

    const orcamentoResult = await db.run(
      `INSERT INTO orcamentos
        (leadId, clienteNome, clienteTelefone, clienteEmail, clienteCidade, status, data, dimensionamento, financeiro, assignedUserId, assignedUserName)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      leadResult.lastID,
      lead.nome.trim(),
      lead.telefone.trim(),
      lead.email.trim(),
      lead.cidade.trim(),
      'Lead novo',
      dataCadastro,
      JSON.stringify(resultadoCompleto.dimensionamento),
      JSON.stringify(resultadoCompleto.financeiro),
      owner?.id || null,
      owner?.nome || null
    );

    const novoOrcamento = {
      id: orcamentoResult.lastID,
      leadId: leadResult.lastID,
      clienteNome: lead.nome.trim(),
      clienteTelefone: lead.telefone.trim(),
      clienteEmail: lead.email.trim(),
      clienteCidade: lead.cidade.trim(),
      assignedUserId: owner?.id || null,
      assignedUserName: owner?.nome || null,
      status: 'Lead novo',
      data: dataCadastro,
      ...resultadoCompleto
    };

    io.emit('novo_orcamento', novoOrcamento);
    io.emit('novo_lead', {
      id: leadResult.lastID,
      nome: lead.nome.trim(),
      telefone: lead.telefone.trim(),
      email: lead.email.trim(),
      cidade: lead.cidade.trim(),
      origem: 'Simulação do site',
      status: 'Novo',
      dataCadastro,
      assignedUserId: owner?.id || null,
      assignedUserName: owner?.nome || null
    });

    res.status(201).json({
      message: 'Simulação salva com sucesso!',
      leadId: leadResult.lastID,
      orcamento: novoOrcamento,
      resultado: resultadoCompleto
    });
  } catch (error) {
    console.error('ERRO NA SIMULAÇÃO PÚBLICA:', error);
    res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : 'Erro ao salvar a simulação.' });
  }
});

// Rota para salvar um orçamento que já foi calculado
app.post('/api/salvar-orcamento', async (req, res) => {
  const orcamentoData = req.body;
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  let clienteId = null;
  let clienteNome = 'Simulação Online';

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      clienteId = decoded.id;
      const user = await db.get('SELECT nome FROM clientes WHERE id = ?', clienteId);
      if (user) {
        clienteNome = user.nome;
      }
    } catch (err) {
      console.log("Token inválido ao salvar orçamento, salvando como anônimo.");
    }
  }

  try {
    const result = await db.run(
      'INSERT INTO orcamentos (clienteId, clienteNome, status, data, dimensionamento, financeiro) VALUES (?, ?, ?, ?, ?, ?)',
      clienteId,
      clienteNome,
      'Aberto',
      new Date().toISOString().split('T')[0],
      JSON.stringify(orcamentoData.dimensionamento),
      JSON.stringify(orcamentoData.financeiro)
    );

    const novoOrcamento = {
      id: result.lastID,
      clienteId,
      clienteNome,
      status: 'Aberto',
      data: new Date().toISOString().split('T')[0],
      ...orcamentoData,
    };

    // Emite o objeto completo do novo orçamento para o admin
    io.emit('novo_orcamento', novoOrcamento);

    res.status(201).json({ message: 'Orçamento salvo com sucesso!', orcamento: novoOrcamento });

  } catch (error) {
    console.error('ERRO AO SALVAR ORÇAMENTO:', error);
    res.status(500).json({ message: 'Ocorreu um erro interno no servidor ao salvar o orçamento.' });
  }
});

// Rota de Cadastro de Novos Usuários
app.post('/api/register', async (req, res) => {
  const { nome, whatsapp, cidade, email, password } = req.body;

  // Validação básica (em um app real, seria mais robusta)
  if (!nome || !whatsapp || !cidade || !email || !password) {
    return res.status(400).json({ message: 'Todos os campos são obrigatórios.' });
  }
  
  try {
    // Criptografa a senha antes de salvar
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await db.run(
      'INSERT INTO clientes (nome, whatsapp, cidade, email, password, dataCadastro) VALUES (?, ?, ?, ?, ?, ?)',
      nome, whatsapp, cidade, email, hashedPassword, new Date().toISOString().split('T')[0]
    );
    res.status(201).json({ message: 'Cadastro realizado com sucesso!', clienteId: result.lastID });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT') {
      return res.status(400).json({ message: 'Este e-mail já está cadastrado.' });
    }
    console.error('Erro no cadastro:', error);
    res.status(500).json({ message: 'Erro interno ao realizar o cadastro.' });
  }
});

// Rota de Login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'E-mail e senha são obrigatórios.' });
  }

  try {
    const internalUser = await db.get(
      'SELECT * FROM usuarios WHERE (username = ? OR email = ?) AND active = 1',
      email,
      email
    );

    if (internalUser) {
      const isInternalMatch = await bcrypt.compare(password, internalUser.password);
      if (!isInternalMatch) {
        return res.status(401).json({ message: 'Credenciais inválidas.' });
      }

      const permissions = parsePermissions(internalUser.permissions);
      const token = jwt.sign(
        { id: internalUser.id, email: internalUser.email, username: internalUser.username, role: internalUser.role, userType: 'interno' },
        JWT_SECRET,
        { expiresIn: '1d' }
      );

      return res.json({
        message: 'Login bem-sucedido!',
        token,
        user: sanitizeUser({ ...internalUser, permissions })
      });
    }

    const user = await db.get('SELECT * FROM clientes WHERE email = ?', email);

    if (!user) {
      return res.status(401).json({ message: 'Credenciais inválidas.' }); // Usuário não encontrado
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: 'Credenciais inválidas.' }); // Senha incorreta
    }

    const role = user.email === 'SOLAR@' ? 'ADMIN' : 'CLIENTE';

    const token = jwt.sign(
      { id: user.id, email: user.email, role: role },
      JWT_SECRET,
      { expiresIn: '1d' } // O token expira em 1 dia
    );

    res.json({
      message: 'Login bem-sucedido!',
      token,
      user: { id: user.id, nome: user.nome, email: user.email, role: role }
    });

  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ message: 'Erro interno no servidor.' });
  }
});

app.get('/api/me', authRequired, async (req, res) => {
  if (req.user.userType === 'interno') {
    return res.json({ user: sanitizeUser(req.user) });
  }

  res.json({ user: { id: req.user.id, email: req.user.email, role: req.user.role, userType: 'cliente', permissions: mergePermissions() } });
});

app.post('/api/change-password', authRequired, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ message: 'A nova senha precisa ter pelo menos 6 caracteres.' });
  }

  if (req.user.userType !== 'interno') {
    return res.status(403).json({ message: 'Troca obrigatória disponível apenas para usuários internos.' });
  }

  const user = await db.get('SELECT * FROM usuarios WHERE id = ?', req.user.id);
  const isMatch = await bcrypt.compare(currentPassword || '', user.password);
  if (!isMatch) {
    return res.status(401).json({ message: 'Senha temporária/atual incorreta.' });
  }

  await db.run(
    'UPDATE usuarios SET password = ?, mustChangePassword = 0 WHERE id = ?',
    await bcrypt.hash(newPassword, 10),
    req.user.id
  );

  res.json({ message: 'Senha alterada com sucesso.' });
});

// Rotas do Admin
app.get('/api/admin/clientes', authRequired, requirePermission('clientes'), async (req, res) => {
  const clientes = await db.all('SELECT id, nome, whatsapp, cidade, dataCadastro FROM clientes ORDER BY id DESC');
  res.json(clientes);
});

app.post('/api/admin/clientes', authRequired, requirePermission('gerenciarClientes'), async (req, res) => {
  const { nome, whatsapp, cidade, email, password } = req.body;
  if (!nome || !whatsapp || !cidade || !email) {
    return res.status(400).json({ message: 'Nome, WhatsApp, cidade e e-mail são obrigatórios.' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password || 'Cliente@DRM#2026', 10);
    const result = await db.run(
      'INSERT INTO clientes (nome, whatsapp, cidade, email, password, dataCadastro) VALUES (?, ?, ?, ?, ?, ?)',
      nome,
      whatsapp,
      cidade,
      email,
      hashedPassword,
      new Date().toISOString().split('T')[0]
    );
    res.status(201).json({ id: result.lastID, nome, whatsapp, cidade, email, dataCadastro: new Date().toISOString().split('T')[0] });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT') {
      return res.status(400).json({ message: 'Este e-mail já está cadastrado.' });
    }
    res.status(500).json({ message: 'Erro ao cadastrar cliente.' });
  }
});

app.put('/api/admin/clientes/:id', authRequired, requirePermission('gerenciarClientes'), async (req, res) => {
  const { nome, whatsapp, cidade } = req.body;
  await db.run(
    'UPDATE clientes SET nome = COALESCE(?, nome), whatsapp = COALESCE(?, whatsapp), cidade = COALESCE(?, cidade) WHERE id = ?',
    nome || null,
    whatsapp || null,
    cidade || null,
    req.params.id
  );
  res.json({ message: 'Cliente atualizado.' });
});

app.get('/api/admin/leads', authRequired, requirePermission('leads'), async (req, res) => {
  const leads = can(req.user, 'verTodosLeads')
    ? await db.all('SELECT * FROM leads ORDER BY id DESC')
    : await db.all('SELECT * FROM leads WHERE assignedUserId = ? ORDER BY id DESC', req.user.id);
  res.json(leads);
});

app.get('/api/admin/orcamentos', authRequired, requirePermission('orcamentos'), async (req, res) => {
  const orcamentos = can(req.user, 'verTodosLeads')
    ? await db.all('SELECT * FROM orcamentos ORDER BY id DESC')
    : await db.all('SELECT * FROM orcamentos WHERE assignedUserId = ? ORDER BY id DESC', req.user.id);
  // Converte os campos JSON de string para objeto
  const parsedOrcamentos = orcamentos.map(o => ({...o, dimensionamento: parseJsonField(o.dimensionamento), financeiro: parseJsonField(o.financeiro)}));
  res.json(parsedOrcamentos);
});

app.get('/api/admin/contrato-config', authRequired, requirePermission('contratos'), async (req, res) => {
  res.json(await getContractTemplate());
});

app.put('/api/admin/contrato-config', authRequired, requirePermission('contratos'), async (req, res) => {
  if (req.user.role !== 'ADM') {
    return res.status(403).json({ message: 'Somente o administrador pode editar o modelo de contrato.' });
  }

  const current = await getContractTemplate();
  const next = {
    ...current,
    ...req.body,
    version: DEFAULT_CONTRACT_TEMPLATE.version,
    empresa: { ...current.empresa, ...(req.body.empresa || {}) },
    visual: { ...current.visual, ...(req.body.visual || {}) },
  };
  await setSetting('contractTemplate', next);
  res.json(next);
});

app.get('/api/admin/equipamentos', authRequired, requirePermission('contratos'), async (req, res) => {
  const equipamentos = await db.all('SELECT * FROM equipamentos ORDER BY active DESC, id DESC');
  res.json(equipamentos.map(item => ({ ...item, active: Boolean(item.active) })));
});

app.post('/api/admin/equipamentos', authRequired, requirePermission('contratos'), async (req, res) => {
  const { nome, placaModelo, inversorModelo, potenciaPlacaW, potenciaInversorKw, observacoes } = req.body;
  if (!nome || !placaModelo || !inversorModelo) {
    return res.status(400).json({ message: 'Nome, modelo da placa e modelo do inversor são obrigatórios.' });
  }

  const result = await db.run(
    `INSERT INTO equipamentos
      (nome, placaModelo, inversorModelo, potenciaPlacaW, potenciaInversorKw, observacoes, active, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
    nome,
    placaModelo,
    inversorModelo,
    potenciaPlacaW || null,
    potenciaInversorKw || null,
    observacoes || null,
    new Date().toISOString()
  );
  const equipamento = await db.get('SELECT * FROM equipamentos WHERE id = ?', result.lastID);
  res.status(201).json({ ...equipamento, active: Boolean(equipamento.active) });
});

app.put('/api/admin/equipamentos/:id', authRequired, requirePermission('contratos'), async (req, res) => {
  const { nome, placaModelo, inversorModelo, potenciaPlacaW, potenciaInversorKw, observacoes, active } = req.body;
  await db.run(
    `UPDATE equipamentos
     SET nome = COALESCE(?, nome),
         placaModelo = COALESCE(?, placaModelo),
         inversorModelo = COALESCE(?, inversorModelo),
         potenciaPlacaW = ?,
         potenciaInversorKw = ?,
         observacoes = COALESCE(?, observacoes),
         active = ?
     WHERE id = ?`,
    nome || null,
    placaModelo || null,
    inversorModelo || null,
    potenciaPlacaW || null,
    potenciaInversorKw || null,
    observacoes || null,
    active === false ? 0 : 1,
    req.params.id
  );
  const equipamento = await db.get('SELECT * FROM equipamentos WHERE id = ?', req.params.id);
  res.json({ ...equipamento, active: Boolean(equipamento.active) });
});

app.get('/api/admin/contratos', authRequired, requirePermission('contratos'), async (req, res) => {
  const contratos = can(req.user, 'verTodosLeads')
    ? await db.all('SELECT * FROM contratos ORDER BY id DESC')
    : await db.all(
      'SELECT * FROM contratos WHERE assignedUserId = ? OR criadoPorId = ? ORDER BY id DESC',
      req.user.id,
      req.user.id
    );

  res.json(contratos.map(parseContrato));
});

app.post('/api/admin/contratos', authRequired, requirePermission('contratos'), async (req, res) => {
  const { orcamentoId, equipamentoId, manual = {} } = req.body;
  if (!orcamentoId) return res.status(400).json({ message: 'Selecione um orçamento para gerar o contrato.' });

  const orcamento = await db.get('SELECT * FROM orcamentos WHERE id = ?', orcamentoId);
  if (!orcamento) return res.status(404).json({ message: 'Orçamento não encontrado.' });

  if (!can(req.user, 'verTodosLeads') && orcamento.assignedUserId !== req.user.id) {
    return res.status(403).json({ message: 'Você não pode gerar contrato para orçamento de outro responsável.' });
  }

  const existing = await db.get('SELECT * FROM contratos WHERE orcamentoId = ?', orcamentoId);
  if (existing) return res.json(parseContrato(existing));

  const dimensionamento = parseJsonField(orcamento.dimensionamento);
  const financeiro = parseJsonField(orcamento.financeiro);
  const equipamento = equipamentoId
    ? await db.get('SELECT * FROM equipamentos WHERE id = ?', equipamentoId)
    : await db.get('SELECT * FROM equipamentos WHERE active = 1 ORDER BY id DESC LIMIT 1');
  const now = new Date().toISOString();
  const dados = {
    dimensionamento,
    financeiro,
    manual,
    statusOrigem: orcamento.status,
    observacao: 'Contrato gerado no sistema e aguardando aprovação do responsável administrativo.',
  };

  const result = await db.run(
    `INSERT INTO contratos
      (orcamentoId, clienteNome, clienteTelefone, clienteEmail, clienteCidade, valorProjeto, status, dados,
       criadoPorId, criadoPorNome, dataCriacao, assignedUserId, assignedUserName, equipamentoId, equipamentoNome, equipamentoDados)
     VALUES (?, ?, ?, ?, ?, ?, 'Pendente', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    orcamento.id,
    orcamento.clienteNome,
    orcamento.clienteTelefone,
    orcamento.clienteEmail,
    orcamento.clienteCidade,
    Number(manual.valorSistema || financeiro.preco_final_cliente_rs) || 0,
    JSON.stringify(dados),
    req.user.id,
    req.user.nome,
    now,
    orcamento.assignedUserId,
    orcamento.assignedUserName,
    equipamento?.id || null,
    equipamento?.nome || null,
    JSON.stringify({
      ...(equipamento || {}),
      placaModelo: manual.painel || equipamento?.placaModelo || '',
      inversorModelo: manual.inversor || equipamento?.inversorModelo || '',
    })
  );

  const contrato = await db.get('SELECT * FROM contratos WHERE id = ?', result.lastID);
  const parsedContrato = parseContrato(contrato);
  io.emit('contrato_atualizado', parsedContrato);
  res.status(201).json(parsedContrato);
});

app.put('/api/admin/contratos/:id/revisao', authRequired, requirePermission('contratos'), async (req, res) => {
  if (req.user.role !== 'ADM') {
    return res.status(403).json({ message: 'Somente o Deivson/administrador pode aprovar ou recusar contratos.' });
  }

  const { status, observacaoAnalise } = req.body;
  if (!['Aprovado', 'Recusado'].includes(status)) {
    return res.status(400).json({ message: 'Informe se o contrato foi aprovado ou recusado.' });
  }

  const normalizedObservation = String(observacaoAnalise || '').trim();
  if (status === 'Recusado' && !normalizedObservation) {
    return res.status(400).json({ message: 'Informe o motivo da recusa do contrato.' });
  }

  const contrato = await db.get('SELECT * FROM contratos WHERE id = ?', req.params.id);
  if (!contrato) return res.status(404).json({ message: 'Contrato não encontrado.' });

  await db.run(
    `UPDATE contratos
     SET status = ?, analisadoPorId = ?, analisadoPorNome = ?, observacaoAnalise = ?, dataAnalise = ?
     WHERE id = ?`,
    status,
    req.user.id,
    req.user.nome,
    normalizedObservation || null,
    new Date().toISOString(),
    req.params.id
  );

  const updated = parseContrato(await db.get('SELECT * FROM contratos WHERE id = ?', req.params.id));
  if (updated.status === 'Aprovado') {
    await createProjetoFromContrato(updated);
  }
  io.emit('contrato_atualizado', updated);
  res.json(updated);
});

app.get('/api/admin/contratos/:id/download', authRequired, requirePermission('contratos'), async (req, res) => {
  const contrato = await db.get('SELECT * FROM contratos WHERE id = ?', req.params.id);
  if (!contrato) return res.status(404).send('Contrato não encontrado.');

  if (!can(req.user, 'verTodosLeads') && contrato.assignedUserId !== req.user.id && contrato.criadoPorId !== req.user.id) {
    return res.status(403).send('Você não pode baixar este contrato.');
  }

  if (contrato.status !== 'Aprovado') {
    return res.status(403).send('Este contrato só pode ser baixado após aprovação do Deivson/ADM.');
  }

  const fileName = `contrato-drm-${contrato.id}-${String(contrato.clienteNome || 'cliente').replace(/[^\w-]+/g, '-').toLowerCase()}.html`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.send(await buildContratoHtml(contrato));
});

app.get('/api/admin/usuarios', authRequired, requirePermission('usuarios'), async (req, res) => {
  const usuarios = await db.all('SELECT id, nome, username, email, role, permissions, mustChangePassword, active, createdAt FROM usuarios ORDER BY id ASC');
  res.json(usuarios.map(user => ({ ...user, permissions: parsePermissions(user.permissions), mustChangePassword: Boolean(user.mustChangePassword), active: Boolean(user.active) })));
});

app.put('/api/admin/usuarios/:id/permissoes', authRequired, requirePermission('permissoes'), async (req, res) => {
  const { permissions, active } = req.body;
  const user = await db.get('SELECT * FROM usuarios WHERE id = ?', req.params.id);
  if (!user) return res.status(404).json({ message: 'Usuário não encontrado.' });

  await db.run(
    'UPDATE usuarios SET permissions = ?, active = ? WHERE id = ?',
    JSON.stringify(mergePermissions(permissions)),
    active === false ? 0 : 1,
    req.params.id
  );

  res.json({ message: 'Permissões atualizadas.' });
});

app.post('/api/admin/usuarios/:id/reset-password', authRequired, requirePermission('usuarios'), async (req, res) => {
  const user = INTERNAL_USERS.find(item => item.username === req.body.username) || null;
  const target = await db.get('SELECT * FROM usuarios WHERE id = ?', req.params.id);
  if (!target) return res.status(404).json({ message: 'Usuário não encontrado.' });

  const temporaryPassword = user?.temporaryPassword || `${target.username}@DRM#2026`;
  await db.run(
    'UPDATE usuarios SET password = ?, mustChangePassword = 1 WHERE id = ?',
    await bcrypt.hash(temporaryPassword, 10),
    req.params.id
  );

  res.json({ message: 'Senha temporária redefinida.', temporaryPassword });
});

app.put('/api/admin/leads/:id', authRequired, requirePermission('leads'), async (req, res) => {
  const lead = await db.get('SELECT * FROM leads WHERE id = ?', req.params.id);
  if (!lead) return res.status(404).json({ message: 'Lead não encontrado.' });
  if (!can(req.user, 'verTodosLeads') && lead.assignedUserId !== req.user.id) {
    return res.status(403).json({ message: 'Este lead pertence a outro usuário.' });
  }

  const { status, observacoes, ultimoContato } = req.body;
  const { proximoRetorno, motivoPerda } = req.body;
  await db.run(
    'UPDATE leads SET status = COALESCE(?, status), observacoes = COALESCE(?, observacoes), ultimoContato = COALESCE(?, ultimoContato), proximoRetorno = COALESCE(?, proximoRetorno), motivoPerda = COALESCE(?, motivoPerda) WHERE id = ?',
    status || null,
    observacoes || null,
    ultimoContato || null,
    proximoRetorno || null,
    motivoPerda || null,
    req.params.id
  );

  res.json({ message: 'Lead atualizado.' });
});

app.post('/api/admin/leads/:id/atividades', authRequired, requirePermission('leads'), async (req, res) => {
  const lead = await db.get('SELECT * FROM leads WHERE id = ?', req.params.id);
  if (!lead) return res.status(404).json({ message: 'Lead não encontrado.' });
  if (!can(req.user, 'verTodosLeads') && lead.assignedUserId !== req.user.id) {
    return res.status(403).json({ message: 'Este lead pertence a outro usuário.' });
  }

  const { tipo = 'Contato', descricao, resultado = '', proximoRetorno } = req.body;
  if (!String(descricao || '').trim()) {
    return res.status(400).json({ message: 'Descreva a atividade realizada.' });
  }

  const now = new Date().toISOString();
  const result = await db.run(
    `INSERT INTO atividades
      (leadId, clienteNome, tipo, descricao, resultado, proximoRetorno, criadoPorId, criadoPorNome, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    lead.id,
    lead.nome,
    tipo,
    descricao,
    resultado,
    proximoRetorno || null,
    req.user.id,
    req.user.nome,
    now
  );

  await db.run(
    'UPDATE leads SET ultimoContato = ?, proximoRetorno = COALESCE(?, proximoRetorno), observacoes = COALESCE(?, observacoes) WHERE id = ?',
    now.split('T')[0],
    proximoRetorno || null,
    resultado || null,
    lead.id
  );

  const atividade = await db.get('SELECT * FROM atividades WHERE id = ?', result.lastID);
  io.emit('atividade_criada', atividade);
  res.status(201).json(atividade);
});

app.get('/api/admin/atividades', authRequired, requirePermission('leads'), async (req, res) => {
  const atividades = can(req.user, 'verTodosLeads')
    ? await db.all('SELECT * FROM atividades ORDER BY id DESC LIMIT 120')
    : await db.all('SELECT * FROM atividades WHERE criadoPorId = ? ORDER BY id DESC LIMIT 120', req.user.id);
  res.json(atividades);
});

app.get('/api/admin/projetos', authRequired, requirePermission('equipeTecnica'), async (req, res) => {
  const projetos = can(req.user, 'verTodosLeads')
    ? await db.all('SELECT * FROM projetos ORDER BY updatedAt DESC, id DESC')
    : await db.all('SELECT * FROM projetos WHERE responsavelId = ? ORDER BY updatedAt DESC, id DESC', req.user.id);
  res.json(projetos.map(parseProjeto));
});

app.put('/api/admin/projetos/:id', authRequired, requirePermission('equipeTecnica'), async (req, res) => {
  const projeto = await db.get('SELECT * FROM projetos WHERE id = ?', req.params.id);
  if (!projeto) return res.status(404).json({ message: 'Projeto não encontrado.' });
  if (!can(req.user, 'verTodosLeads') && projeto.responsavelId !== req.user.id) {
    return res.status(403).json({ message: 'Este projeto pertence a outro responsável.' });
  }

  const { etapa, prioridade, responsavelId, observacoes, prazoPrevisto, checklist } = req.body;
  if (etapa && !PROJECT_STAGES.includes(etapa)) {
    return res.status(400).json({ message: 'Etapa de projeto inválida.' });
  }

  let responsavelNome = null;
  if (responsavelId) {
    const user = await db.get('SELECT nome FROM usuarios WHERE id = ?', responsavelId);
    responsavelNome = user?.nome || null;
  }

  await db.run(
    `UPDATE projetos
     SET etapa = COALESCE(?, etapa),
         prioridade = COALESCE(?, prioridade),
         responsavelId = COALESCE(?, responsavelId),
         responsavelNome = COALESCE(?, responsavelNome),
         checklist = COALESCE(?, checklist),
         observacoes = COALESCE(?, observacoes),
         prazoPrevisto = COALESCE(?, prazoPrevisto),
         updatedAt = ?
     WHERE id = ?`,
    etapa || null,
    prioridade || null,
    responsavelId || null,
    responsavelNome,
    checklist ? JSON.stringify(checklist) : null,
    observacoes || null,
    prazoPrevisto || null,
    new Date().toISOString(),
    req.params.id
  );

  const updated = parseProjeto(await db.get('SELECT * FROM projetos WHERE id = ?', req.params.id));
  io.emit('projeto_atualizado', updated);
  res.json(updated);
});

const getAuthorizedProjeto = async (req, res) => {
  const projeto = await db.get('SELECT * FROM projetos WHERE id = ?', req.params.id);
  if (!projeto) {
    res.status(404).json({ message: 'Projeto não encontrado.' });
    return null;
  }
  if (!can(req.user, 'verTodosLeads') && projeto.responsavelId !== req.user.id) {
    res.status(403).json({ message: 'Este projeto pertence a outro responsável.' });
    return null;
  }
  return projeto;
};

app.get('/api/admin/projetos/:id/fotos', authRequired, requirePermission('equipeTecnica'), async (req, res) => {
  const projeto = await getAuthorizedProjeto(req, res);
  if (!projeto) return;

  const fotos = await db.all('SELECT * FROM projeto_fotos WHERE projetoId = ? ORDER BY id DESC', projeto.id);
  res.json(fotos);
});

app.post('/api/admin/projetos/:id/fotos', authRequired, requirePermission('equipeTecnica'), async (req, res) => {
  const projeto = await getAuthorizedProjeto(req, res);
  if (!projeto) return;

  const { dataUrl, descricao = '', categoria = 'Vistoria' } = req.body;
  if (!String(dataUrl || '').startsWith('data:image/')) {
    return res.status(400).json({ message: 'Envie uma foto válida da vistoria.' });
  }

  const result = await db.run(
    `INSERT INTO projeto_fotos
      (projetoId, dataUrl, descricao, categoria, criadoPorId, criadoPorNome, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    projeto.id,
    dataUrl,
    descricao,
    categoria,
    req.user.id,
    req.user.nome,
    new Date().toISOString()
  );

  const foto = await db.get('SELECT * FROM projeto_fotos WHERE id = ?', result.lastID);
  io.emit('projeto_foto_criada', foto);
  res.status(201).json(foto);
});

const canAccessOs = (user, os) => (
  can(user, 'verTodosLeads') || os.responsavelId === user.id || os.responsavelId === null
);

app.get('/api/admin/ordens-servico', authRequired, requirePermission('ordensServico'), async (req, res) => {
  const rows = can(req.user, 'verTodosLeads')
    ? await db.all('SELECT * FROM ordens_servico ORDER BY id DESC')
    : await db.all('SELECT * FROM ordens_servico WHERE responsavelId = ? OR responsavelId IS NULL ORDER BY id DESC', req.user.id);
  res.json(rows);
});

app.post('/api/admin/ordens-servico', authRequired, requirePermission('ordensServico'), async (req, res) => {
  const {
    clienteNome,
    clienteTelefone = '',
    contratoId = null,
    origem = 'WhatsApp',
    problema,
    categoria = 'Suporte',
    prioridade = 'Normal',
    responsavelId = null,
    observacoes = '',
  } = req.body;

  if (!String(clienteNome || '').trim() || !String(problema || '').trim()) {
    return res.status(400).json({ message: 'Informe cliente e problema da O.S.' });
  }

  let responsavel = null;
  if (responsavelId) {
    responsavel = await db.get('SELECT id, nome FROM usuarios WHERE id = ?', responsavelId);
  }

  const now = new Date().toISOString();
  const result = await db.run(
    `INSERT INTO ordens_servico
      (clienteNome, clienteTelefone, contratoId, origem, problema, categoria, prioridade, status, responsavelId, responsavelNome, observacoes, dataAbertura, dataAtualizacao)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    clienteNome,
    clienteTelefone,
    contratoId || null,
    origem,
    problema,
    categoria,
    prioridade,
    'Aberta',
    responsavel?.id || null,
    responsavel?.nome || null,
    observacoes,
    now,
    now
  );

  const os = await db.get('SELECT * FROM ordens_servico WHERE id = ?', result.lastID);
  io.emit('os_atualizada', os);
  res.status(201).json(os);
});

app.put('/api/admin/ordens-servico/:id', authRequired, requirePermission('ordensServico'), async (req, res) => {
  const os = await db.get('SELECT * FROM ordens_servico WHERE id = ?', req.params.id);
  if (!os) return res.status(404).json({ message: 'O.S não encontrada.' });
  if (!canAccessOs(req.user, os)) return res.status(403).json({ message: 'Você não pode alterar esta O.S.' });

  const { status, prioridade, responsavelId, solucao, observacoes, categoria } = req.body;
  let responsavelNome = null;
  if (responsavelId) {
    const user = await db.get('SELECT nome FROM usuarios WHERE id = ?', responsavelId);
    responsavelNome = user?.nome || null;
  }
  const nextStatus = status || os.status;
  const now = new Date().toISOString();

  await db.run(
    `UPDATE ordens_servico
     SET status = COALESCE(?, status),
         prioridade = COALESCE(?, prioridade),
         categoria = COALESCE(?, categoria),
         responsavelId = COALESCE(?, responsavelId),
         responsavelNome = COALESCE(?, responsavelNome),
         solucao = COALESCE(?, solucao),
         observacoes = COALESCE(?, observacoes),
         dataAtualizacao = ?,
         dataFechamento = ?
     WHERE id = ?`,
    status || null,
    prioridade || null,
    categoria || null,
    responsavelId || null,
    responsavelNome,
    solucao || null,
    observacoes || null,
    now,
    nextStatus === 'Resolvida' || nextStatus === 'Cancelada' ? now : os.dataFechamento,
    req.params.id
  );

  const updated = await db.get('SELECT * FROM ordens_servico WHERE id = ?', req.params.id);
  io.emit('os_atualizada', updated);
  res.json(updated);
});

app.get('/api/admin/resumo', authRequired, requirePermission('dashboard'), async (req, res) => {
  const canSeeAll = can(req.user, 'verTodosLeads');
  const [leads, orcamentos, contratos, projetos, atividades] = await Promise.all([
    canSeeAll ? db.all('SELECT * FROM leads') : db.all('SELECT * FROM leads WHERE assignedUserId = ?', req.user.id),
    canSeeAll ? db.all('SELECT * FROM orcamentos') : db.all('SELECT * FROM orcamentos WHERE assignedUserId = ?', req.user.id),
    canSeeAll ? db.all('SELECT * FROM contratos') : db.all('SELECT * FROM contratos WHERE assignedUserId = ? OR criadoPorId = ?', req.user.id, req.user.id),
    canSeeAll ? db.all('SELECT * FROM projetos') : db.all('SELECT * FROM projetos WHERE responsavelId = ?', req.user.id),
    canSeeAll ? db.all('SELECT * FROM atividades ORDER BY id DESC LIMIT 8') : db.all('SELECT * FROM atividades WHERE criadoPorId = ? ORDER BY id DESC LIMIT 8', req.user.id),
  ]);

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const fimSemana = new Date(hoje);
  fimSemana.setDate(fimSemana.getDate() + 7);
  const isBetween = (dateValue, end) => {
    if (!dateValue) return false;
    const date = new Date(dateValue);
    return date >= hoje && date <= end;
  };

  const valorAprovadoMes = contratos.reduce((total, contrato) => {
    const data = new Date(contrato.dataAnalise || contrato.dataCriacao || 0);
    const sameMonth = data.getMonth() === hoje.getMonth() && data.getFullYear() === hoje.getFullYear();
    return contrato.status === 'Aprovado' && sameMonth ? total + Number(contrato.valorProjeto || 0) : total;
  }, 0);
  const leadsPorStatus = leads.reduce((acc, lead) => {
    const status = lead.status || 'Novo';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  const projetosPorEtapa = PROJECT_STAGES.map(etapa => ({
    etapa,
    total: projetos.filter(projeto => projeto.etapa === etapa).length,
  }));

  res.json({
    kpis: {
      leads: leads.length,
      novos: leadsPorStatus.Novo || 0,
      orcamentos: orcamentos.length,
      contratosPendentes: contratos.filter(contrato => contrato.status === 'Pendente').length,
      contratosAprovados: contratos.filter(contrato => contrato.status === 'Aprovado').length,
      projetosAtivos: projetos.filter(projeto => projeto.etapa !== 'Concluído').length,
      valorAprovadoMes,
      retornosSemana: leads.filter(lead => isBetween(lead.proximoRetorno, fimSemana)).length,
    },
    leadsPorStatus,
    projetosPorEtapa,
    proximosRetornos: leads
      .filter(lead => lead.proximoRetorno)
      .sort((a, b) => new Date(a.proximoRetorno) - new Date(b.proximoRetorno))
      .slice(0, 8),
    projetosCriticos: projetos
      .filter(projeto => projeto.etapa !== 'Concluído')
      .sort((a, b) => new Date(a.prazoPrevisto || '2999-01-01') - new Date(b.prazoPrevisto || '2999-01-01'))
      .slice(0, 6)
      .map(parseProjeto),
    atividadesRecentes: atividades,
  });
});

app.get('/api/admin/financeiro', authRequired, requirePermission('financeiro'), async (req, res) => {
  const rows = await db.all('SELECT financeiro, status, data, assignedUserName FROM orcamentos');
  const contratos = await db.all('SELECT valorProjeto, status, dataAnalise, dataCriacao, criadoPorNome, assignedUserName FROM contratos');
  const despesas = await db.all('SELECT * FROM despesas_fixas ORDER BY active DESC, valor DESC');
  const now = new Date();
  const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastKey = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}`;
  const monthKey = (dateValue) => {
    if (!dateValue) return '';
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return String(dateValue).slice(0, 7);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  };

  const resumo = rows.reduce((acc, row) => {
    try {
      const financeiro = JSON.parse(row.financeiro);
      const valor = Number(financeiro.preco_final_cliente_rs) || 0;
      acc.valorTotalOrcado += valor;
      acc.totalOrcamentos += 1;
      if (row.status && row.status.toLowerCase().includes('fechado')) acc.valorFechado += valor;
      if (monthKey(row.data) === currentKey) acc.valorOrcadoMes += valor;
    } catch {}
    return acc;
  }, { totalOrcamentos: 0, valorTotalOrcado: 0, valorFechado: 0, valorOrcadoMes: 0 });

  const contratosResumo = contratos.reduce((acc, contrato) => {
    const valor = Number(contrato.valorProjeto) || 0;
    const key = monthKey(contrato.dataAnalise || contrato.dataCriacao);
    if (contrato.status === 'Aprovado') {
      acc.valorAprovadoTotal += valor;
      if (key === currentKey) acc.valorAprovadoMes += valor;
      if (key === lastKey) acc.valorAprovadoMesPassado += valor;
    }
    if (contrato.status === 'Pendente') acc.valorPendente += valor;
    const pessoa = contrato.assignedUserName || contrato.criadoPorNome || 'Sem responsável';
    if (!acc.porPessoa[pessoa]) acc.porPessoa[pessoa] = { nome: pessoa, aprovado: 0, pendente: 0, recusado: 0, valorAprovado: 0 };
    if (contrato.status === 'Aprovado') {
      acc.porPessoa[pessoa].aprovado += 1;
      acc.porPessoa[pessoa].valorAprovado += valor;
    } else if (contrato.status === 'Pendente') {
      acc.porPessoa[pessoa].pendente += 1;
    } else if (contrato.status === 'Recusado') {
      acc.porPessoa[pessoa].recusado += 1;
    }
    return acc;
  }, { valorAprovadoTotal: 0, valorAprovadoMes: 0, valorAprovadoMesPassado: 0, valorPendente: 0, porPessoa: {} });

  const despesasAtivas = despesas.filter(item => item.active);
  const custoFixoMensal = despesasAtivas.reduce((sum, item) => sum + (Number(item.valor) || 0), 0);
  const metaMinima = custoFixoMensal * 1.5;
  const metaRecomendada = custoFixoMensal * 2.5;
  const metaIdeal = custoFixoMensal * 4;
  const baseComparacao = contratosResumo.valorAprovadoMesPassado || 1;
  const variacaoMes = ((contratosResumo.valorAprovadoMes - contratosResumo.valorAprovadoMesPassado) / baseComparacao) * 100;

  res.json({
    ...resumo,
    ...contratosResumo,
    despesasFixas: despesas.map(item => ({ ...item, active: Boolean(item.active) })),
    custoFixoMensal,
    metas: {
      minima: metaMinima,
      recomendada: metaRecomendada,
      ideal: metaIdeal,
      percentualMinima: metaMinima ? Math.min((contratosResumo.valorAprovadoMes / metaMinima) * 100, 100) : 0,
      percentualRecomendada: metaRecomendada ? Math.min((contratosResumo.valorAprovadoMes / metaRecomendada) * 100, 100) : 0,
      percentualIdeal: metaIdeal ? Math.min((contratosResumo.valorAprovadoMes / metaIdeal) * 100, 100) : 0,
    },
    comparativo: {
      mesAtual: contratosResumo.valorAprovadoMes,
      mesPassado: contratosResumo.valorAprovadoMesPassado,
      variacaoPercentual: variacaoMes,
    },
    rendimentoEquipe: Object.values(contratosResumo.porPessoa).sort((a, b) => b.valorAprovado - a.valorAprovado),
    ticketMedio: resumo.totalOrcamentos ? resumo.valorTotalOrcado / resumo.totalOrcamentos : 0,
  });
});

app.post('/api/admin/despesas-fixas', authRequired, requirePermission('financeiro'), async (req, res) => {
  const { nome, valor, categoria } = req.body;
  if (!nome || !valor) return res.status(400).json({ message: 'Nome e valor são obrigatórios.' });

  const result = await db.run(
    'INSERT INTO despesas_fixas (nome, valor, categoria, active, createdAt) VALUES (?, ?, ?, 1, ?)',
    nome,
    Number(valor),
    categoria || 'Geral',
    new Date().toISOString()
  );
  const despesa = await db.get('SELECT * FROM despesas_fixas WHERE id = ?', result.lastID);
  res.status(201).json({ ...despesa, active: Boolean(despesa.active) });
});

app.put('/api/admin/despesas-fixas/:id', authRequired, requirePermission('financeiro'), async (req, res) => {
  const { nome, valor, categoria, active } = req.body;
  await db.run(
    `UPDATE despesas_fixas
     SET nome = COALESCE(?, nome), valor = COALESCE(?, valor), categoria = COALESCE(?, categoria), active = ?
     WHERE id = ?`,
    nome || null,
    typeof valor === 'undefined' ? null : Number(valor),
    categoria || null,
    active === false ? 0 : 1,
    req.params.id
  );
  const despesa = await db.get('SELECT * FROM despesas_fixas WHERE id = ?', req.params.id);
  res.json({ ...despesa, active: Boolean(despesa.active) });
});

// --- WEBSOCKETS (Chat em Tempo Real) ---
io.on('connection', (socket) => {
  console.log('Novo usuário conectado:', socket.id);

  socket.on('enviar_mensagem', (data) => {
    // Reenvia a mensagem para todos (em produção, criaríamos "salas" por orcamento/cliente)
    io.emit('receber_mensagem', data);
  });

  socket.on('disconnect', () => {
    console.log('Usuário desconectado:', socket.id);
  });
});

// --- INICIAR SERVIDOR ---
server.listen(PORT, () => {
  console.log(`Backend rodando em http://localhost:${PORT}`);
});
