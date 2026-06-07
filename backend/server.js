require('dotenv').config({ quiet: true });
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const DEFAULT_WHATSAPP_PHONE = '559985127056';

// Configuração do Servidor HTTP para suportar o Socket.io
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' } // Simplificado para aceitar qualquer conexão de websocket
});

// Middlewares
const allowedOrigins = [
  'http://localhost:5173',
  'https://drmenergiasolar.com.br',
  'https://www.drmenergiasolar.com.br',
  ...String(process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
];
const corsOptions = {
  origin: (origin, callback) => {
    // Permite requisições sem 'origin' (ex: Postman, apps mobile)
    if (!origin) return callback(null, true);

    // Permite desenvolvimento local em qualquer porta (ex: 4173, 5173)
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }

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
const RESET_TOKEN_TTL_MINUTES = 24 * 60;
const EMAIL_VERIFICATION_TTL_MINUTES = 15;

// --- CONFIGURAÇÃO DO BANCO DE DADOS SQLITE ---
let db;
const DB_PATH = path.join(__dirname, 'database.db');
const TEMPLATE_DB_PATH = path.join(__dirname, 'database.template.db');

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

const ADMIN_PERMISSIONS = Object.fromEntries(
  Object.keys(DEFAULT_PERMISSIONS).map((permission) => [permission, true])
);

const INTERNAL_USERS = [
  {
    nome: 'Deivson DRM',
    username: 'deivson',
    email: 'deivson@drm.local',
    whatsapp: process.env.WHATSAPP_DEIVSON || DEFAULT_WHATSAPP_PHONE,
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
    nome: 'Rene Jr',
    username: 'renejr',
    email: 'renejr@drm.local',
    whatsapp: process.env.WHATSAPP_RENEJR || '5599985127056',
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
    whatsapp: process.env.WHATSAPP_GLEYSON || '5599984632324',
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
    nome: 'Carlito Lopes',
    username: 'carlito',
    email: 'carlito@drm.local',
    whatsapp: process.env.WHATSAPP_CARLITO || '559992276744',
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
    whatsapp: process.env.WHATSAPP_IVALDO || '',
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

const normalizeWhatsAppPhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55')) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
};

const buildWhatsAppLink = (phone, text) => {
  const normalizedPhone = normalizeWhatsAppPhone(phone) || DEFAULT_WHATSAPP_PHONE;
  const encoded = encodeURIComponent(text || 'Ola, vim do site e quero uma proposta de energia solar.');
  return `https://api.whatsapp.com/send?phone=${normalizedPhone}&text=${encoded}`;
};

const getAppUrl = () => String(process.env.APP_URL || 'http://127.0.0.1:5173').replace(/\/+$/, '');

const hashResetToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const createResetToken = () => crypto.randomBytes(32).toString('hex');

const normalizeEmail = (value = '') => String(value || '').trim().toLowerCase();

const isRealEmail = (value = '') => {
  const email = normalizeEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !email.endsWith('@drm.local');
};

const hasVerifiedEmail = (user = {}) => isRealEmail(user.email) && Boolean(user.emailVerified);

const requiresEmailVerification = (user = {}) => !hasVerifiedEmail(user);

const createEmailCode = () => String(crypto.randomInt(100000, 1000000));

const hashEmailCode = (code) => crypto.createHash('sha256').update(String(code || '')).digest('hex');

const getMailTransporter = () => {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error('SMTP não configurado. Defina SMTP_HOST, SMTP_USER e SMTP_PASS.');
  }

  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || 'true') === 'true',
    auth: { user, pass },
  });
};

const sendPasswordResetEmail = async ({ to, name, resetUrl }) => {
  const from = process.env.SMTP_FROM || `DRM ENERGIA SOLAR <${process.env.SMTP_USER}>`;
  const safeName = String(name || '').trim() || 'cliente';
  const htmlName = escapeHtml(safeName);
  const htmlResetUrl = escapeHtml(resetUrl);

  await getMailTransporter().sendMail({
    from,
    to,
    subject: 'Redefinição de senha - DRM ENERGIA SOLAR',
    text: [
      `Olá, ${safeName}.`,
      '',
      'Recebemos uma solicitação para redefinir sua senha no painel DRM ENERGIA SOLAR.',
      `Acesse o link abaixo para criar uma nova senha. O link expira em ${RESET_TOKEN_TTL_MINUTES} minutos:`,
      resetUrl,
      '',
      'Se você não solicitou essa alteração, ignore este e-mail.',
      '',
      'DRM ENERGIA SOLAR',
    ].join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111827">
        <h2 style="color:#f97316;margin-bottom:8px">DRM ENERGIA SOLAR</h2>
        <p>Olá, <strong>${htmlName}</strong>.</p>
        <p>Recebemos uma solicitação para redefinir sua senha no painel DRM ENERGIA SOLAR.</p>
        <p>Use o botão abaixo para criar uma nova senha. O link expira em <strong>${RESET_TOKEN_TTL_MINUTES} minutos</strong>.</p>
        <p style="margin:28px 0">
          <a href="${htmlResetUrl}" style="background:#f97316;color:#111827;padding:14px 20px;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block">Redefinir senha</a>
        </p>
        <p style="font-size:13px;color:#64748b">Se o botão não abrir, copie este link:</p>
        <p style="font-size:13px;word-break:break-all;color:#334155">${htmlResetUrl}</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0" />
        <p style="font-size:13px;color:#64748b">Se você não solicitou essa alteração, ignore este e-mail.</p>
      </div>
    `,
  });
};

const sendEmailVerificationCode = async ({ to, name, code }) => {
  const from = process.env.SMTP_FROM || `DRM ENERGIA SOLAR <${process.env.SMTP_USER}>`;
  const safeName = String(name || '').trim() || 'usuário';
  const htmlName = escapeHtml(safeName);
  const htmlCode = escapeHtml(code);

  await getMailTransporter().sendMail({
    from,
    to,
    subject: 'Código de verificação - DRM ENERGIA SOLAR',
    text: [
      `Olá, ${safeName}.`,
      '',
      'Use o código abaixo para confirmar seu e-mail no painel DRM ENERGIA SOLAR:',
      code,
      '',
      `O código expira em ${EMAIL_VERIFICATION_TTL_MINUTES} minutos.`,
      '',
      'Se você não solicitou essa verificação, ignore este e-mail.',
      '',
      'DRM ENERGIA SOLAR',
    ].join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111827">
        <h2 style="color:#f97316;margin-bottom:8px">DRM ENERGIA SOLAR</h2>
        <p>Olá, <strong>${htmlName}</strong>.</p>
        <p>Use o código abaixo para confirmar seu e-mail no painel:</p>
        <p style="font-size:30px;letter-spacing:8px;font-weight:900;margin:22px 0;color:#111827">${htmlCode}</p>
        <p>O código expira em <strong>${EMAIL_VERIFICATION_TTL_MINUTES} minutos</strong>.</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0" />
        <p style="font-size:13px;color:#64748b">Se você não solicitou essa verificação, ignore este e-mail.</p>
      </div>
    `,
  });
};

const findPasswordResetUser = async (identifier) => {
  const value = String(identifier || '').trim();
  if (!value) return null;

  const internalUser = await db.get(
    'SELECT id, nome, username, email, emailVerified FROM usuarios WHERE (email = ? OR username = ?) AND active = 1',
    normalizeEmail(value),
    normalizeEmail(value)
  );
  if (internalUser?.email && hasVerifiedEmail(internalUser)) {
    return { userType: 'interno', id: internalUser.id, name: internalUser.nome, email: internalUser.email };
  }

  const client = await db.get('SELECT id, nome, email, emailVerified FROM clientes WHERE email = ?', normalizeEmail(value));
  if (client?.email && hasVerifiedEmail(client)) {
    return { userType: 'cliente', id: client.id, name: client.nome, email: client.email };
  }

  return null;
};

const CLIENT_EXTRA_FIELDS = [
  'tipoPessoa',
  'cpfCnpj',
  'rgIe',
  'endereco',
  'numero',
  'bairro',
  'cep',
  'estado',
  'complemento',
  'unidadeConsumidora',
  'distribuidora',
  'enderecoInstalacao',
  'numeroInstalacao',
  'bairroInstalacao',
  'cepInstalacao',
  'cidadeInstalacao',
  'estadoInstalacao',
  'observacoes',
];

const normalizeClientPayload = (body = {}) => {
  const data = {
    nome: String(body.nome || '').trim(),
    whatsapp: String(body.whatsapp || '').trim(),
    cidade: String(body.cidade || '').trim(),
    email: String(body.email || '').trim() || null,
  };

  for (const field of CLIENT_EXTRA_FIELDS) {
    data[field] = String(body[field] || '').trim() || null;
  }

  return data;
};

const buildClientAddress = (client = {}) => (
  [
    client.endereco,
    client.numero ? `nº ${client.numero}` : '',
    client.bairro,
    client.cep ? `CEP ${client.cep}` : '',
    client.cidade,
    client.estado,
  ].filter(Boolean).join(', ') || 'Não informado'
);

const buildInstallAddress = (client = {}) => (
  [
    client.enderecoInstalacao || client.endereco,
    (client.numeroInstalacao || client.numero) ? `nº ${client.numeroInstalacao || client.numero}` : '',
    client.bairroInstalacao || client.bairro,
    (client.cepInstalacao || client.cep) ? `CEP ${client.cepInstalacao || client.cep}` : '',
    client.cidadeInstalacao || client.cidade,
    client.estadoInstalacao || client.estado,
  ].filter(Boolean).join(', ') || buildClientAddress(client)
);

const publicClient = (client = {}) => {
  const sanitized = { ...client };
  delete sanitized.password;
  return sanitized;
};

const getAuthUserRecord = async (user) => {
  if (user.userType === 'interno') {
    return db.get('SELECT * FROM usuarios WHERE id = ?', user.id);
  }
  return db.get('SELECT * FROM clientes WHERE id = ?', user.id);
};

const updateAuthUserEmailVerification = async (user, fields = {}) => {
  const table = user.userType === 'interno' ? 'usuarios' : 'clientes';
  const keys = Object.keys(fields);
  if (keys.length === 0) return;
  await db.run(
    `UPDATE ${table} SET ${keys.map(key => `${key} = ?`).join(', ')} WHERE id = ?`,
    ...keys.map(key => fields[key]),
    user.id
  );
};

const sanitizeUser = (user) => ({
  id: user.id,
  nome: user.nome,
  username: user.username,
  email: user.email,
  whatsapp: user.whatsapp || '',
  role: user.role,
  permissions: user.permissions,
  mustChangePassword: Boolean(user.mustChangePassword),
  emailVerified: hasVerifiedEmail(user),
  requiresEmailVerification: requiresEmailVerification(user),
});

const authRequired = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = (authHeader && authHeader.split(' ')[1]) || req.query.token;

  if (!token) {
    return res.status(401).json({ message: 'Login necessário.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const isEmailVerificationRoute = req.path.startsWith('/api/email-verification');

    if (decoded.userType === 'interno') {
      const user = await db.get('SELECT * FROM usuarios WHERE id = ? AND active = 1', decoded.id);
      if (!user) return res.status(401).json({ message: 'Usuário inválido.' });

      req.user = {
        ...user,
        userType: 'interno',
        permissions: parsePermissions(user.permissions),
      };
      if (requiresEmailVerification(req.user) && !isEmailVerificationRoute) {
        return res.status(403).json({ message: 'Confirme um e-mail válido para liberar o painel.', requiresEmailVerification: true });
      }
      return next();
    }

    const client = await db.get('SELECT * FROM clientes WHERE id = ?', decoded.id);
    if (!client) return res.status(401).json({ message: 'Usuário inválido.' });

    const permissions = decoded.role === 'ADM' ? ADMIN_PERMISSIONS : mergePermissions(decoded.permissions);
    req.user = {
      ...client,
      ...decoded,
      email: client.email,
      nome: client.nome,
      userType: decoded.userType || 'cliente',
      permissions,
    };
    if (requiresEmailVerification(req.user) && !isEmailVerificationRoute) {
      return res.status(403).json({ message: 'Confirme um e-mail válido para liberar o painel.', requiresEmailVerification: true });
    }
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
    .filter(user => user.role !== 'ADM' && can(user, 'leads') && normalizeWhatsAppPhone(user.whatsapp));
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

const equipamentoExtraColumns = {
  tipo: 'TEXT',
  geracaoKwh: 'REAL',
  geracaoAnualKwh: 'REAL',
  potenciaKwp: 'REAL',
  numeroPaineis: 'INTEGER',
  quantidadeCabo: 'TEXT',
  valorSistema: 'REAL',
  valorEntrada: 'REAL',
  valorSaldo: 'REAL',
  prazoExecucao: 'INTEGER',
  formaPagamentoTipo: 'TEXT',
  formaPagamento: 'TEXT',
};

const normalizeEquipamentoPayload = (body = {}) => ({
  nome: String(body.nome || '').trim(),
  tipo: String(body.tipo || 'Kit solar').trim() || 'Kit solar',
  placaModelo: String(body.placaModelo || '').trim(),
  inversorModelo: String(body.inversorModelo || '').trim(),
  potenciaPlacaW: body.potenciaPlacaW === '' || typeof body.potenciaPlacaW === 'undefined' ? null : Number(body.potenciaPlacaW),
  potenciaInversorKw: body.potenciaInversorKw === '' || typeof body.potenciaInversorKw === 'undefined' ? null : Number(body.potenciaInversorKw),
  geracaoKwh: body.geracaoKwh === '' || typeof body.geracaoKwh === 'undefined' ? null : Number(body.geracaoKwh),
  geracaoAnualKwh: body.geracaoAnualKwh === '' || typeof body.geracaoAnualKwh === 'undefined' ? null : Number(body.geracaoAnualKwh),
  potenciaKwp: body.potenciaKwp === '' || typeof body.potenciaKwp === 'undefined' ? null : Number(body.potenciaKwp),
  numeroPaineis: body.numeroPaineis === '' || typeof body.numeroPaineis === 'undefined' ? null : Number(body.numeroPaineis),
  quantidadeCabo: String(body.quantidadeCabo || '').trim() || null,
  valorSistema: body.valorSistema === '' || typeof body.valorSistema === 'undefined' ? null : Number(body.valorSistema),
  valorEntrada: body.valorEntrada === '' || typeof body.valorEntrada === 'undefined' ? null : Number(body.valorEntrada),
  valorSaldo: body.valorSaldo === '' || typeof body.valorSaldo === 'undefined' ? null : Number(body.valorSaldo),
  prazoExecucao: body.prazoExecucao === '' || typeof body.prazoExecucao === 'undefined' ? null : Number(body.prazoExecucao),
  formaPagamentoTipo: String(body.formaPagamentoTipo || '').trim() || null,
  formaPagamento: String(body.formaPagamento || '').trim() || null,
  observacoes: String(body.observacoes || '').trim() || null,
});

const mergeManualWithEquipamento = (manual = {}, equipamento = {}) => ({
  ...manual,
  geracaoKwh: manual.geracaoKwh || equipamento?.geracaoKwh || '',
  geracaoAnualKwh: manual.geracaoAnualKwh || equipamento?.geracaoAnualKwh || '',
  potenciaKwp: manual.potenciaKwp || equipamento?.potenciaKwp || '',
  numeroPaineis: manual.numeroPaineis || equipamento?.numeroPaineis || '',
  quantidadeCabo: manual.quantidadeCabo || equipamento?.quantidadeCabo || '',
  painel: manual.painel || equipamento?.placaModelo || '',
  inversor: manual.inversor || equipamento?.inversorModelo || '',
  valorSistema: manual.valorSistema || equipamento?.valorSistema || '',
  valorEntrada: manual.valorEntrada || equipamento?.valorEntrada || '',
  valorSaldo: manual.valorSaldo || equipamento?.valorSaldo || '',
  prazoExecucao: manual.prazoExecucao || equipamento?.prazoExecucao || '',
  formaPagamentoTipo: manual.formaPagamentoTipo || equipamento?.formaPagamentoTipo || '',
  formaPagamento: manual.formaPagamento || equipamento?.formaPagamento || '',
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

const parseOs = (os = {}) => ({
  ...os,
  fotos: Array.isArray(os.fotos) ? os.fotos : parseJsonField(os.fotos, []),
});

const isClientUser = (user = {}) => user.userType === 'cliente' || user.role === 'CLIENTE';

const requireClientUser = (req, res, next) => {
  if (isClientUser(req.user)) return next();
  return res.status(403).json({ message: 'Área exclusiva para clientes.' });
};

const getClienteContratoRows = async (cliente = {}) => {
  const phone = normalizeWhatsAppPhone(cliente.whatsapp);
  const phoneWithoutCountry = phone.startsWith('55') ? phone.slice(2) : phone;
  const rows = await db.all(
    `SELECT * FROM contratos
     WHERE clienteEmail = ?
        OR REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(clienteTelefone, ' ', ''), '-', ''), '(', ''), ')', ''), '+', '') IN (?, ?)
     ORDER BY id DESC`,
    normalizeEmail(cliente.email),
    phone,
    phoneWithoutCountry
  );
  return rows.map(parseContrato);
};

const DEFAULT_CONTRACT_TEMPLATE = {
  version: 'drm-service-materials-v3',
  empresa: {
    nome: 'DRM ENERGIA SOLAR LTDA',
    cnpj: '48.518.202/0001-56',
    telefone: '(99) 99167-5608',
    email: 'drmengenhariaeenergiasolar@gmail.com',
    endereco: 'Rua Gonçalves Dias, nº 1661, Bairro Centro, CEP 65900-545, Imperatriz/MA',
  },
  visual: {
    logoPosition: 'right',
    logoWidth: 86,
    primaryColor: '#F97316',
  },
  titulo: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS COM FORNECIMENTO DE MATERIAIS E INSTALAÇÃO DE SISTEMA SOLAR FOTOVOLTAICO',
  corpo: `
<h2>CLÁUSULA PRIMEIRA - DO OBJETO</h2>
<p>O presente contrato tem por objeto o fornecimento, instalação e comissionamento de sistema solar fotovoltaico com potência de <strong>{{projeto.potencia}}</strong> kWp, destinado à geração média mensal aproximada de <strong>{{projeto.geracao}}</strong> kWh, no imóvel do CONTRATANTE situado em <strong>{{cliente.enderecoInstalacao}}</strong>, conforme projeto técnico elaborado nos termos da Lei nº 14.300/2022 e da Resolução Normativa ANEEL nº 1.000/2021.</p>
<p>A instalação compreenderá fornecimento de módulos fotovoltaicos, inversor, estrutura adequada ao telhado, cabos, conectores, material elétrico, serviço de instalação, projeto solar, ART, acompanhamento junto à distribuidora e monitoramento do sistema via web, conforme quadro técnico deste contrato.</p>

<h2>CLÁUSULA SEGUNDA - DAS OBRIGAÇÕES DA CONTRATADA</h2>
<p>São obrigações da CONTRATADA: cumprir integralmente este contrato; responsabilizar-se pela execução técnica, qualidade, segurança e prazos; designar profissionais habilitados; obter, quando necessário, aprovações e protocolos junto à concessionária; observar as normas ABNT NBR 5410, NBR 16690, Lei nº 14.300/2022 e REN ANEEL nº 1.000/2021.</p>

<h2>CLÁUSULA TERCEIRA - DAS OBRIGAÇÕES DO CONTRATANTE</h2>
<p>Compete ao CONTRATANTE permitir acesso dos técnicos ao local, efetuar pagamentos nas condições ajustadas, fornecer dados e documentos necessários à execução e homologação, realizar adequações estruturais ou elétricas quando necessárias, não alterar o sistema sem autorização técnica e manter limpeza/manutenção preventiva conforme orientações da CONTRATADA.</p>

<h2>CLÁUSULA QUARTA - DO PREÇO E CONDIÇÕES DE PAGAMENTO</h2>
<p>Pelos serviços ora contratados, o CONTRATANTE pagará à CONTRATADA o valor total de <strong>{{contrato.valor}}</strong>, nas seguintes condições: <strong>{{contrato.formaPagamento}}</strong>.</p>
<p>O pagamento poderá ser realizado via PIX para o PIX/CNPJ nº 48.518.202/0001-56 (DRM ENERGIA SOLAR LTDA), transferência, financiamento ou outra condição expressamente registrada neste contrato.</p>

<h2>CLÁUSULA QUINTA - DO PRAZO DE EXECUÇÃO</h2>
<p>O prazo para conclusão dos serviços será de até <strong>{{contrato.prazoExecucao}}</strong> dias úteis, contados da assinatura deste contrato e do pagamento da primeira parcela. Caso haja necessidade de adequações elétricas, aumento de carga, pendências junto à concessionária ou terceiros, o prazo será suspenso até a solução do impedimento.</p>

<h2>CLÁUSULA SEXTA - DA GARANTIA</h2>
<p>A CONTRATADA garante os serviços de instalação pelo prazo de 5 (cinco) anos, conforme art. 618 do Código Civil. Os equipamentos seguirão a garantia de fábrica informada no quadro técnico, incluindo módulos e inversor. A geração média admitirá variação técnica de até ±10%.</p>
<p>Perderá a garantia o CONTRATANTE que modificar o sistema sem autorização, deixar de realizar limpeza/manutenção, alterar condições de sombreamento ou estrutura física do local.</p>

<h2>CLÁUSULA SÉTIMA - DA RESCISÃO</h2>
<p>O contrato poderá ser rescindido por comum acordo, inadimplemento mediante notificação prévia de 10 dias úteis, ou impossibilidade técnica comprovada. Em caso de rescisão por culpa do CONTRATANTE, este arcará com multa compensatória de 10% sobre o valor total, além de eventuais despesas comprovadas.</p>

<h2>CLÁUSULA OITAVA - DAS PENALIDADES E MORA</h2>
<p>O atraso injustificado no cumprimento de obrigações sujeitará a parte inadimplente ao pagamento de multa de 2% sobre o valor devido, juros moratórios de 1% ao mês e correção monetária pelo INPC.</p>

<h2>CLÁUSULA NONA - DA RESPONSABILIDADE CIVIL</h2>
<p>A CONTRATADA responderá por danos materiais diretos causados à estrutura do imóvel ou equipamentos existentes, desde que comprovada culpa ou dolo. Não responderá por danos indiretos, lucros cessantes ou fatores externos como quedas de energia, falhas da concessionária, intempéries, vandalismo ou furtos.</p>

<h2>CLÁUSULA DÉCIMA - DO RECEBIMENTO E ENCERRAMENTO</h2>
<p>Após a conclusão dos serviços, será realizada vistoria conjunta e emitido Termo de Entrega e Aceitação, que marcará o início dos prazos de garantia.</p>

<h2>CLÁUSULA DÉCIMA PRIMEIRA - DA NÃO HOMOLOGAÇÃO OU INVERSÃO DE FLUXO</h2>
<p>A homologação e conexão do sistema à rede são atos administrativos privativos da concessionária. A CONTRATADA acompanhará o processo, apresentará informações técnicas complementares e comunicará formalmente exigências ou impedimentos, mas não responderá por indeferimentos, atrasos, suspensões ou exigências decorrentes de insuficiência da rede, reforço de transformador, inversão de fluxo, alterações normativas ou morosidade da concessionária.</p>
<p>Caso haja exigência de adequações técnicas adicionais, caberá ao CONTRATANTE autorizar e custear as obras necessárias para atendimento aos padrões da distribuidora.</p>

<h2>CLÁUSULA DÉCIMA SEGUNDA - DO FORO</h2>
<p>Fica eleito o foro do domicílio do CONTRATANTE, nos termos do art. 101, I, do Código de Defesa do Consumidor, para dirimir controvérsias decorrentes deste contrato.</p>

<h2>CLÁUSULA DÉCIMA TERCEIRA - DA APROVAÇÃO INTERNA E HISTÓRICO</h2>
<p>Este contrato foi gerado no sistema DRM Solar, com snapshot dos dados do cliente, equipamentos, condições comerciais e responsável pela geração. A aprovação interna foi registrada por <strong>{{contrato.aprovadoPor}}</strong> em <strong>{{contrato.dataAprovacao}}</strong>.</p>
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
  const clienteSnapshot = parsed.dados?.cliente || {};
  const template = await getContractTemplate();
  const equipamento = parsed.equipamentoDados || {};
  const clientAddress = clienteSnapshot.enderecoCompleto || buildClientAddress(clienteSnapshot);
  const installAddress = clienteSnapshot.enderecoInstalacaoCompleto || buildInstallAddress(clienteSnapshot);
  const variables = {
    empresa: template.empresa,
    cliente: {
      nome: parsed.clienteNome,
      telefone: parsed.clienteTelefone || 'Não informado',
      email: parsed.clienteEmail || 'Não informado',
      cidade: parsed.clienteCidade || 'Não informado',
      cpfCnpj: clienteSnapshot.cpfCnpj || manual.cpfCnpj || 'Não informado',
      rgIe: clienteSnapshot.rgIe || 'Não informado',
      endereco: clientAddress,
      enderecoInstalacao: installAddress,
      unidadeConsumidora: clienteSnapshot.unidadeConsumidora || 'Não informado',
      distribuidora: clienteSnapshot.distribuidora || 'Não informado',
    },
    projeto: {
      potencia: manual.potenciaKwp || dimensionamento.potencia_real_instalada_kwp || 0,
      paineis: manual.numeroPaineis || dimensionamento.numero_paineis_necessarios || 0,
      geracao: manual.geracaoKwh || dimensionamento.geracao_estimada_kwh || 0,
      geracaoAnual: manual.geracaoAnualKwh || (Number(manual.geracaoKwh || dimensionamento.geracao_estimada_kwh || 0) * 12),
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
      entrada: manual.valorEntrada ? formatCurrency(manual.valorEntrada) : 'Não informado',
      saldo: manual.valorSaldo ? formatCurrency(manual.valorSaldo) : 'Não informado',
      prazoExecucao: manual.prazoExecucao || 40,
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
    ['Geração anual estimada', `${variables.projeto.geracaoAnual} kWh`],
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
      <strong>${escapeHtml(parsed.clienteNome)}</strong>, CPF/CNPJ <strong>${escapeHtml(variables.cliente.cpfCnpj)}</strong>,
      residente/sediado em <strong>${escapeHtml(variables.cliente.endereco)}</strong>, telefone <strong>${escapeHtml(parsed.clienteTelefone || 'não informado')}</strong>,
      e-mail <strong>${escapeHtml(parsed.clienteEmail || 'não informado')}</strong>,
      doravante denominado CONTRATANTE, firmam o presente contrato.
    </section>

    <div class="info-grid">
      <section>
        <h2>Dados do contratante</h2>
        <table class="info-table">
          ${renderInfoRows([
            ['Nome', variables.cliente.nome],
            ['CPF/CNPJ', variables.cliente.cpfCnpj],
            ['RG/IE', variables.cliente.rgIe],
            ['Telefone', variables.cliente.telefone],
            ['E-mail', variables.cliente.email],
            ['Cidade', variables.cliente.cidade],
            ['Endereço', variables.cliente.endereco],
            ['Instalação', variables.cliente.enderecoInstalacao],
            ['Unidade consumidora', variables.cliente.unidadeConsumidora],
            ['Distribuidora', variables.cliente.distribuidora],
          ])}
        </table>
      </section>
      <section>
        <h2>Condições comerciais</h2>
        <table class="info-table">
          ${renderInfoRows([
            ['Valor do sistema', variables.contrato.valor],
            ['Entrada', variables.contrato.entrada],
            ['Saldo', variables.contrato.saldo],
            ['Forma de pagamento', variables.contrato.formaPagamento],
            ['Prazo de execução', `${variables.contrato.prazoExecucao} dias úteis`],
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
      <div class="line">Testemunha 1<br />CPF:</div>
      <div class="line">Testemunha 2<br />CPF:</div>
    </div>

    <footer class="footer">
      <span>${escapeHtml(template.empresa.endereco || '')}</span>
      <span>${escapeHtml(template.empresa.telefone || '')} ${template.empresa.email ? `• ${escapeHtml(template.empresa.email)}` : ''}</span>
    </footer>
  </main>
</body>
</html>`;
};

const htmlToPlainText = (value = '') => String(value)
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<\/p>|<\/h1>|<\/h2>|<\/h3>|<\/li>/gi, '\n')
  .replace(/<li[^>]*>/gi, '- ')
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;/gi, "'")
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const buildContratoPdf = async (contrato) => {
  const parsed = parseContrato(contrato);
  const dimensionamento = parsed.dados?.dimensionamento || {};
  const manual = parsed.dados?.manual || {};
  const cliente = parsed.dados?.cliente || {};
  const equipamento = parsed.equipamentoDados || {};
  const template = await getContractTemplate();
  const logoPath = path.join(__dirname, '../frontend/public/assets/logo.png');
  const projectRows = [
    ['Potência instalada', `${manual.potenciaKwp || dimensionamento.potencia_real_instalada_kwp || 0} kWp`],
    ['Geração mensal estimada', `${manual.geracaoKwh || dimensionamento.geracao_estimada_kwh || 0} kWh`],
    ['Quantidade de painéis', manual.numeroPaineis || dimensionamento.numero_paineis_necessarios || 'Não informado'],
    ['Painel', manual.painel || equipamento.placaModelo || 'Não informado'],
    ['Inversor', manual.inversor || equipamento.inversorModelo || 'Não informado'],
    ['Valor do sistema', formatCurrency(manual.valorSistema || parsed.valorProjeto)],
    ['Forma de pagamento', manual.formaPagamento || 'Não informado'],
  ];
  const contractVariables = {
    empresa: template.empresa,
    cliente: {
      nome: parsed.clienteNome,
      telefone: parsed.clienteTelefone || 'Não informado',
      email: parsed.clienteEmail || 'Não informado',
      cidade: parsed.clienteCidade || 'Não informado',
      cpfCnpj: cliente.cpfCnpj || manual.cpfCnpj || 'Não informado',
      endereco: cliente.enderecoCompleto || buildClientAddress(cliente),
      enderecoInstalacao: cliente.enderecoInstalacaoCompleto || buildInstallAddress(cliente),
    },
    projeto: {
      potencia: manual.potenciaKwp || dimensionamento.potencia_real_instalada_kwp || 0,
      geracao: manual.geracaoKwh || dimensionamento.geracao_estimada_kwh || 0,
    },
    contrato: {
      valor: formatCurrency(manual.valorSistema || parsed.valorProjeto),
      formaPagamento: manual.formaPagamento || 'Não informado',
      prazoExecucao: manual.prazoExecucao || 40,
    },
  };
  const clauses = htmlToPlainText(renderTemplate(template.corpo || DEFAULT_CONTRACT_TEMPLATE.corpo, contractVariables));

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 44, info: { Title: `Contrato DRM Solar #${parsed.id}` } });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const orange = '#F97316';
    const dark = '#111827';
    const muted = '#64748B';
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const ensureSpace = (height = 80) => {
      if (doc.y + height > doc.page.height - doc.page.margins.bottom) doc.addPage();
    };
    const sectionTitle = (title) => {
      ensureSpace(45);
      doc.moveDown(0.7).font('Helvetica-Bold').fontSize(11).fillColor(orange).text(title.toUpperCase());
      doc.moveDown(0.25).strokeColor('#E2E8F0').moveTo(doc.x, doc.y).lineTo(doc.x + pageWidth, doc.y).stroke();
      doc.moveDown(0.55);
    };
    const infoRow = (label, value) => {
      ensureSpace(34);
      const startY = doc.y;
      doc.font('Helvetica-Bold').fontSize(8).fillColor(muted).text(String(label).toUpperCase(), doc.page.margins.left, startY, { width: 155 });
      doc.font('Helvetica').fontSize(9.5).fillColor(dark).text(String(value ?? 'Não informado'), doc.page.margins.left + 160, startY, { width: pageWidth - 160 });
      doc.y = Math.max(doc.y, startY + 22);
      doc.strokeColor('#EEF2F7').moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.margins.left + pageWidth, doc.y).stroke();
      doc.moveDown(0.4);
    };

    if (fs.existsSync(logoPath)) doc.image(logoPath, doc.page.margins.left, 34, { fit: [105, 58] });
    doc.font('Helvetica-Bold').fontSize(17).fillColor(dark).text(template.titulo || 'CONTRATO DE FORNECIMENTO E INSTALAÇÃO DE SISTEMA FOTOVOLTAICO', 175, 38, { width: pageWidth - 130, align: 'right' });
    doc.font('Helvetica-Bold').fontSize(9).fillColor(orange).text(`CONTRATO #${parsed.id} - ${parsed.status}`, 175, 82, { width: pageWidth - 130, align: 'right' });
    doc.moveTo(doc.page.margins.left, 108).lineTo(doc.page.margins.left + pageWidth, 108).lineWidth(2).strokeColor(orange).stroke();
    doc.y = 126;

    sectionTitle('Partes do contrato');
    infoRow('Contratada', `${template.empresa.nome} - CNPJ ${template.empresa.cnpj || 'Não informado'}`);
    infoRow('Contratante', `${parsed.clienteNome} - CPF/CNPJ ${contractVariables.cliente.cpfCnpj}`);
    infoRow('Contato', `${contractVariables.cliente.telefone} - ${contractVariables.cliente.email}`);
    infoRow('Endereço', contractVariables.cliente.endereco);
    infoRow('Local da instalação', contractVariables.cliente.enderecoInstalacao);

    sectionTitle('Resumo do sistema contratado');
    projectRows.forEach(([label, value]) => infoRow(label, value));

    sectionTitle('Condições e cláusulas');
    doc.font('Helvetica').fontSize(9).fillColor(dark).text(clauses, { align: 'justify', lineGap: 3 });

    ensureSpace(145);
    sectionTitle('Assinaturas');
    doc.font('Helvetica').fontSize(9).fillColor(dark).text(`${parsed.clienteCidade || 'Imperatriz'}, ${new Date().toLocaleDateString('pt-BR')}.`, { align: 'center' });
    doc.moveDown(2.5);
    const signatureY = doc.y;
    doc.strokeColor(dark).moveTo(doc.page.margins.left, signatureY).lineTo(doc.page.margins.left + 205, signatureY).stroke();
    doc.moveTo(doc.page.margins.left + pageWidth - 205, signatureY).lineTo(doc.page.margins.left + pageWidth, signatureY).stroke();
    doc.font('Helvetica-Bold').fontSize(8.5).text(template.empresa.nome, doc.page.margins.left, signatureY + 7, { width: 205, align: 'center' });
    doc.text(parsed.clienteNome, doc.page.margins.left + pageWidth - 205, signatureY + 7, { width: 205, align: 'center' });
    doc.font('Helvetica').fontSize(8).fillColor(muted).text('CONTRATADA', doc.page.margins.left, signatureY + 20, { width: 205, align: 'center' });
    doc.text('CONTRATANTE', doc.page.margins.left + pageWidth - 205, signatureY + 20, { width: 205, align: 'center' });

    doc.end();
  });
};

const sendContratoPdf = async (res, contrato) => {
  const safeClientName = String(contrato.clienteNome || 'cliente')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  const fileName = `contrato-drm-${contrato.id}-${safeClientName || 'cliente'}.pdf`;
  const pdf = await buildContratoPdf(contrato);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Length', pdf.length);
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.send(pdf);
};

(async () => {
  if (!fs.existsSync(DB_PATH) && fs.existsSync(TEMPLATE_DB_PATH)) {
    fs.copyFileSync(TEMPLATE_DB_PATH, DB_PATH);
  }

  db = await open({
    filename: DB_PATH,
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
      whatsapp TEXT,
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
      tipo TEXT,
      placaModelo TEXT NOT NULL,
      inversorModelo TEXT NOT NULL,
      potenciaPlacaW INTEGER,
      potenciaInversorKw REAL,
      geracaoKwh REAL,
      geracaoAnualKwh REAL,
      potenciaKwp REAL,
      numeroPaineis INTEGER,
      quantidadeCabo TEXT,
      valorSistema REAL,
      valorEntrada REAL,
      valorSaldo REAL,
      prazoExecucao INTEGER,
      formaPagamentoTipo TEXT,
      formaPagamento TEXT,
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
      instalacaoAgendada TEXT,
      previsaoLigacao TEXT,
      equipamentoEntregueAt TEXT,
      medidorTrocadoAt TEXT,
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

    CREATE TABLE IF NOT EXISTS os_fotos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      osId INTEGER NOT NULL,
      dataUrl TEXT NOT NULL,
      descricao TEXT,
      criadoPorId INTEGER,
      criadoPorNome TEXT,
      createdAt TEXT,
      FOREIGN KEY (osId) REFERENCES ordens_servico(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS site_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      source TEXT,
      path TEXT,
      metadata TEXT,
      userAgent TEXT,
      ip TEXT,
      createdAt TEXT
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userType TEXT NOT NULL,
      userId INTEGER NOT NULL,
      email TEXT NOT NULL,
      tokenHash TEXT NOT NULL UNIQUE,
      expiresAt TEXT NOT NULL,
      usedAt TEXT,
      createdAt TEXT NOT NULL
    );
  `);

  const clienteColumns = await db.all('PRAGMA table_info(clientes)');
  const existingClienteColumns = clienteColumns.map(column => column.name);
  for (const field of CLIENT_EXTRA_FIELDS) {
    if (!existingClienteColumns.includes(field)) {
      await db.exec(`ALTER TABLE clientes ADD COLUMN ${field} TEXT`);
    }
  }
  const emailVerificationColumns = [
    ['emailVerified', 'INTEGER DEFAULT 0'],
    ['emailVerifiedAt', 'TEXT'],
    ['pendingEmail', 'TEXT'],
    ['emailVerificationCodeHash', 'TEXT'],
    ['emailVerificationExpiresAt', 'TEXT'],
  ];
  for (const [field, definition] of emailVerificationColumns) {
    if (!existingClienteColumns.includes(field)) {
      await db.exec(`ALTER TABLE clientes ADD COLUMN ${field} ${definition}`);
    }
  }

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

  const equipamentoColumns = await db.all('PRAGMA table_info(equipamentos)');
  const existingEquipamentoColumns = equipamentoColumns.map(column => column.name);
  for (const [field, definition] of Object.entries(equipamentoExtraColumns)) {
    if (!existingEquipamentoColumns.includes(field)) {
      await db.exec(`ALTER TABLE equipamentos ADD COLUMN ${field} ${definition}`);
    }
  }

  const projetoColumns = await db.all('PRAGMA table_info(projetos)');
  const existingProjetoColumns = projetoColumns.map(column => column.name);
  for (const [field, definition] of [
    ['instalacaoAgendada', 'TEXT'],
    ['previsaoLigacao', 'TEXT'],
    ['equipamentoEntregueAt', 'TEXT'],
    ['medidorTrocadoAt', 'TEXT'],
  ]) {
    if (!existingProjetoColumns.includes(field)) {
      await db.exec(`ALTER TABLE projetos ADD COLUMN ${field} ${definition}`);
    }
  }

  const usuarioColumns = await db.all('PRAGMA table_info(usuarios)');
  const existingUsuarioColumns = usuarioColumns.map(column => column.name);
  if (!existingUsuarioColumns.includes('whatsapp')) {
    await db.exec('ALTER TABLE usuarios ADD COLUMN whatsapp TEXT');
  }
  for (const [field, definition] of emailVerificationColumns) {
    if (!existingUsuarioColumns.includes(field)) {
      await db.exec(`ALTER TABLE usuarios ADD COLUMN ${field} ${definition}`);
    }
  }

  for (const user of INTERNAL_USERS) {
    const existingUser = await db.get('SELECT id FROM usuarios WHERE username = ?', user.username);
    if (!existingUser) {
      await db.run(
        `INSERT INTO usuarios
          (nome, username, email, whatsapp, password, role, permissions, mustChangePassword, active, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        user.nome,
        user.username,
        user.email,
        normalizeWhatsAppPhone(user.whatsapp),
        await bcrypt.hash(user.temporaryPassword, 10),
        user.role,
        JSON.stringify(mergePermissions(user.permissions)),
        user.mustChangePassword === false ? 0 : 1,
        new Date().toISOString()
      );
    } else if (user.whatsapp) {
      await db.run(
        'UPDATE usuarios SET whatsapp = ? WHERE username = ?',
        normalizeWhatsAppPhone(user.whatsapp),
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
        (nome, tipo, placaModelo, inversorModelo, potenciaPlacaW, potenciaInversorKw, quantidadeCabo, prazoExecucao, formaPagamentoTipo, observacoes, active, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      'Kit padrão DRM',
      'Kit solar',
      'Painel solar 610 W',
      'Inversor padrão conforme projeto',
      610,
      null,
      '40 metros',
      40,
      'avista',
      'Equipamento padrão inicial. Edite conforme os modelos usados pela empresa.',
      new Date().toISOString()
    );
  }

  const savedTemplate = await getSetting('contractTemplate', null);
  if (!savedTemplate || savedTemplate.version !== DEFAULT_CONTRACT_TEMPLATE.version) {
    await setSetting('contractTemplate', DEFAULT_CONTRACT_TEMPLATE);
  }

  await normalizeLeadDistribution();
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

app.post('/api/site-events', async (req, res) => {
  try {
    const type = String(req.body?.type || '').trim().slice(0, 60);
    const source = String(req.body?.source || 'site').trim().slice(0, 120);
    const path = String(req.body?.path || '').trim().slice(0, 220);
    const metadata = JSON.stringify(req.body?.metadata || {});

    if (!type) {
      return res.status(400).json({ message: 'Tipo do evento é obrigatório.' });
    }

    await db.run(
      `INSERT INTO site_events (type, source, path, metadata, userAgent, ip, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      type,
      source,
      path,
      metadata.slice(0, 2000),
      String(req.headers['user-agent'] || '').slice(0, 300),
      String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim().slice(0, 80),
      new Date().toISOString()
    );

    res.status(204).end();
  } catch (error) {
    console.error('ERRO AO REGISTRAR EVENTO DO SITE:', error);
    res.status(500).json({ message: 'Não foi possível registrar evento.' });
  }
});

app.post('/api/simulacao-publica', async (req, res) => {
  const { lead, simulacao } = req.body;
  const leadData = {
    nome: String(lead?.nome || '').trim(),
    telefone: String(lead?.telefone || '').trim(),
    email: String(lead?.email || '').trim(),
    cidade: String(lead?.cidade || '').trim(),
  };

  if (!leadData.nome || !leadData.telefone || !leadData.cidade) {
    return res.status(400).json({ message: 'Preencha nome, telefone e cidade para continuar.' });
  }

  try {
    const resultadoCompleto = calcularSimulacaoSolar(simulacao);
    const dataCadastro = new Date().toISOString().split('T')[0];
    const owner = await getNextLeadOwner();
    const whatsappMessage = [
      `Olá ${owner?.nome || 'DRM Energia Solar'}! Acabei de fazer minha simulação no site da DRM Energia Solar e quero receber minha proposta completa.`,
      '',
      `Meu nome: ${leadData.nome}`,
      `Cidade: ${leadData.cidade}`,
      `Conta média de energia: R$ ${simulacao?.contaEnergia || '-'}`,
      '',
      'Pode me atender agora e me explicar as melhores condições para instalar energia solar?'
    ].join('\n');
    const whatsappUrl = buildWhatsAppLink(owner?.whatsapp, whatsappMessage);

    const leadResult = await db.run(
      `INSERT INTO leads
        (nome, telefone, email, cidade, origem, status, dataCadastro, assignedUserId, assignedUserName)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      leadData.nome,
      leadData.telefone,
      leadData.email,
      leadData.cidade,
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
      leadData.nome,
      leadData.telefone,
      leadData.email,
      leadData.cidade,
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
      clienteNome: leadData.nome,
      clienteTelefone: leadData.telefone,
      clienteEmail: leadData.email,
      clienteCidade: leadData.cidade,
      assignedUserId: owner?.id || null,
      assignedUserName: owner?.nome || null,
      status: 'Lead novo',
      data: dataCadastro,
      ...resultadoCompleto
    };

    io.emit('novo_orcamento', novoOrcamento);
    io.emit('novo_lead', {
      id: leadResult.lastID,
      nome: leadData.nome,
      telefone: leadData.telefone,
      email: leadData.email,
      cidade: leadData.cidade,
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
      resultado: resultadoCompleto,
      assignedOwner: owner ? {
        id: owner.id,
        nome: owner.nome,
        whatsapp: normalizeWhatsAppPhone(owner.whatsapp),
      } : null,
      whatsapp: {
        phone: normalizeWhatsAppPhone(owner?.whatsapp) || DEFAULT_WHATSAPP_PHONE,
        url: whatsappUrl,
      },
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
  const identifier = String(email || '').trim();

  if (!identifier || !password) {
    return res.status(400).json({ message: 'E-mail e senha são obrigatórios.' });
  }

  try {
    const internalUser = await db.get(
      'SELECT * FROM usuarios WHERE (username = ? OR email = ?) AND active = 1',
      normalizeEmail(identifier),
      normalizeEmail(identifier)
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

    const user = await db.get('SELECT * FROM clientes WHERE email = ? OR email = ?', identifier, normalizeEmail(identifier));

    if (!user) {
      return res.status(401).json({ message: 'Credenciais inválidas.' }); // Usuário não encontrado
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: 'Credenciais inválidas.' }); // Senha incorreta
    }

    const role = 'CLIENTE';
    const permissions = mergePermissions();

    const token = jwt.sign(
      { id: user.id, nome: user.nome, email: user.email, role: role, permissions },
      JWT_SECRET,
      { expiresIn: '1d' } // O token expira em 1 dia
    );

    res.json({
      message: 'Login bem-sucedido!',
      token,
      user: {
        id: user.id,
        nome: user.nome,
        email: user.email,
        role,
        userType: 'cliente',
        permissions,
        emailVerified: hasVerifiedEmail(user),
        requiresEmailVerification: requiresEmailVerification(user),
      }
    });

  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ message: 'Erro interno no servidor.' });
  }
});

app.post('/api/email-verification/send', authRequired, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!isRealEmail(email)) {
    return res.status(400).json({ message: 'Informe um e-mail válido para receber o código.' });
  }

  try {
    const [internalOwner, clientOwner] = await Promise.all([
      db.get('SELECT id FROM usuarios WHERE email = ? AND id <> ?', email, req.user.userType === 'interno' ? req.user.id : 0),
      db.get('SELECT id FROM clientes WHERE email = ? AND id <> ?', email, req.user.userType === 'cliente' ? req.user.id : 0),
    ]);

    if (internalOwner || clientOwner) {
      return res.status(400).json({ message: 'Este e-mail já está cadastrado em outro acesso.' });
    }

    const code = createEmailCode();
    const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MINUTES * 60 * 1000).toISOString();
    await updateAuthUserEmailVerification(req.user, {
      pendingEmail: email,
      emailVerificationCodeHash: hashEmailCode(code),
      emailVerificationExpiresAt: expiresAt,
    });

    await sendEmailVerificationCode({
      to: email,
      name: req.user.nome || req.user.username,
      code,
    });

    res.json({ message: 'Código enviado para o e-mail informado.', pendingEmail: email });
  } catch (error) {
    console.error('Erro ao enviar código de verificação:', error);
    res.status(500).json({ message: 'Não foi possível enviar o código agora.' });
  }
});

app.post('/api/email-verification/confirm', authRequired, async (req, res) => {
  const code = String(req.body?.code || '').replace(/\D/g, '');
  if (code.length !== 6) {
    return res.status(400).json({ message: 'Informe o código de 6 dígitos.' });
  }

  try {
    const user = await getAuthUserRecord(req.user);
    if (!user?.pendingEmail || !user?.emailVerificationCodeHash || !user?.emailVerificationExpiresAt) {
      return res.status(400).json({ message: 'Solicite um código antes de confirmar.' });
    }

    if (new Date(user.emailVerificationExpiresAt) <= new Date()) {
      return res.status(400).json({ message: 'Código expirado. Solicite um novo código.' });
    }

    if (user.emailVerificationCodeHash !== hashEmailCode(code)) {
      return res.status(400).json({ message: 'Código inválido.' });
    }

    const verifiedAt = new Date().toISOString();
    await updateAuthUserEmailVerification(req.user, {
      email: user.pendingEmail,
      emailVerified: 1,
      emailVerifiedAt: verifiedAt,
      pendingEmail: null,
      emailVerificationCodeHash: null,
      emailVerificationExpiresAt: null,
    });

    const updated = await getAuthUserRecord(req.user);
    const permissions = req.user.userType === 'interno'
      ? parsePermissions(updated.permissions)
      : (req.user.role === 'ADM' ? ADMIN_PERMISSIONS : mergePermissions());
    const responseUser = req.user.userType === 'interno'
      ? sanitizeUser({ ...updated, permissions })
      : {
        id: updated.id,
        nome: updated.nome,
        email: updated.email,
        role: req.user.role,
        userType: 'cliente',
        permissions,
        emailVerified: true,
        requiresEmailVerification: false,
      };

    res.json({ message: 'E-mail verificado com sucesso.', user: responseUser });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT') {
      return res.status(400).json({ message: 'Este e-mail já está cadastrado em outro acesso.' });
    }
    console.error('Erro ao confirmar e-mail:', error);
    res.status(500).json({ message: 'Não foi possível confirmar o e-mail agora.' });
  }
});

app.get('/api/me', authRequired, async (req, res) => {
  if (req.user.userType === 'interno') {
    return res.json({ user: sanitizeUser(req.user) });
  }

  const permissions = req.user.role === 'ADM' ? ADMIN_PERMISSIONS : mergePermissions();
  res.json({ user: { id: req.user.id, nome: req.user.nome, email: req.user.email, role: req.user.role, userType: 'cliente', permissions, emailVerified: hasVerifiedEmail(req.user), requiresEmailVerification: requiresEmailVerification(req.user) } });
});

app.get('/api/cliente/portal', authRequired, requireClientUser, async (req, res) => {
  const cliente = await db.get('SELECT * FROM clientes WHERE id = ?', req.user.id);
  if (!cliente) return res.status(404).json({ message: 'Cliente não encontrado.' });

  const contratos = await getClienteContratoRows(cliente);
  const contratoIds = contratos.map(item => item.id);
  const phone = normalizeWhatsAppPhone(cliente.whatsapp);
  const phoneWithoutCountry = phone.startsWith('55') ? phone.slice(2) : phone;
  const phoneFilter = `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(clienteTelefone, ' ', ''), '-', ''), '(', ''), ')', ''), '+', '') IN (?, ?)`;
  const projetos = contratoIds.length
    ? (await db.all(`SELECT * FROM projetos WHERE contratoId IN (${contratoIds.map(() => '?').join(',')}) ORDER BY updatedAt DESC, id DESC`, ...contratoIds)).map(parseProjeto)
    : [];
  const ordensServico = contratoIds.length
    ? await db.all(`SELECT * FROM ordens_servico WHERE contratoId IN (${contratoIds.map(() => '?').join(',')}) OR ${phoneFilter} ORDER BY id DESC`, ...contratoIds, phone, phoneWithoutCountry)
    : await db.all(`SELECT * FROM ordens_servico WHERE ${phoneFilter} OR clienteNome = ? ORDER BY id DESC`, phone, phoneWithoutCountry, cliente.nome);
  const osIds = ordensServico.map(item => item.id);
  const fotos = osIds.length
    ? await db.all(`SELECT * FROM os_fotos WHERE osId IN (${osIds.map(() => '?').join(',')}) ORDER BY id DESC`, ...osIds)
    : [];
  const fotosByOs = fotos.reduce((acc, foto) => {
    acc[foto.osId] = acc[foto.osId] || [];
    acc[foto.osId].push(foto);
    return acc;
  }, {});

  res.json({
    cliente: publicClient(cliente),
    contratos,
    projetos,
    ordensServico: ordensServico.map(os => parseOs({ ...os, fotos: fotosByOs[os.id] || [] })),
  });
});

app.get('/api/cliente/contratos/:id/download', authRequired, requireClientUser, async (req, res) => {
  const cliente = await db.get('SELECT * FROM clientes WHERE id = ?', req.user.id);
  if (!cliente) return res.status(404).send('Cliente não encontrado.');

  const contratos = await getClienteContratoRows(cliente);
  const contrato = contratos.find(item => Number(item.id) === Number(req.params.id));
  if (!contrato) return res.status(403).send('Contrato não pertence a este cliente.');
  if (contrato.status !== 'Aprovado') return res.status(403).send('O contrato estará disponível após aprovação.');

  await sendContratoPdf(res, contrato);
});

app.post('/api/cliente/reclamacoes', authRequired, requireClientUser, async (req, res) => {
  const cliente = await db.get('SELECT * FROM clientes WHERE id = ?', req.user.id);
  if (!cliente) return res.status(404).json({ message: 'Cliente não encontrado.' });

  const { contratoId = null, assunto = 'Atendimento ao cliente', problema, prioridade = 'Normal', fotos = [] } = req.body;
  if (!String(problema || '').trim()) {
    return res.status(400).json({ message: 'Descreva o que aconteceu para abrir a reclamação.' });
  }

  const contratos = await getClienteContratoRows(cliente);
  const authorizedContract = contratoId ? contratos.find(item => Number(item.id) === Number(contratoId)) : contratos[0];
  if (contratoId && !authorizedContract) {
    return res.status(403).json({ message: 'Contrato não pertence a este cliente.' });
  }

  const now = new Date().toISOString();
  const result = await db.run(
    `INSERT INTO ordens_servico
      (clienteNome, clienteTelefone, contratoId, origem, problema, categoria, prioridade, status, responsavelId, responsavelNome, observacoes, dataAbertura, dataAtualizacao)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    cliente.nome,
    cliente.whatsapp,
    authorizedContract?.id || null,
    'Portal do cliente',
    problema,
    'Reclamação',
    prioridade,
    'Aberta',
    authorizedContract?.assignedUserId || null,
    authorizedContract?.assignedUserName || null,
    assunto,
    now,
    now
  );

  const validFotos = Array.isArray(fotos) ? fotos.filter(item => String(item?.dataUrl || item || '').startsWith('data:image/')).slice(0, 6) : [];
  for (const item of validFotos) {
    const dataUrl = typeof item === 'string' ? item : item.dataUrl;
    const descricao = typeof item === 'string' ? '' : String(item.descricao || '');
    await db.run(
      `INSERT INTO os_fotos (osId, dataUrl, descricao, criadoPorId, criadoPorNome, createdAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      result.lastID,
      dataUrl,
      descricao,
      cliente.id,
      cliente.nome,
      now
    );
  }

  const os = await db.get('SELECT * FROM ordens_servico WHERE id = ?', result.lastID);
  const osFotos = await db.all('SELECT * FROM os_fotos WHERE osId = ? ORDER BY id DESC', result.lastID);
  const parsed = parseOs({ ...os, fotos: osFotos });
  io.emit('os_atualizada', parsed);
  res.status(201).json(parsed);
});

app.post('/api/cliente/equipamento-entregue', authRequired, requireClientUser, async (req, res) => {
  const cliente = await db.get('SELECT * FROM clientes WHERE id = ?', req.user.id);
  if (!cliente) return res.status(404).json({ message: 'Cliente não encontrado.' });

  const { projetoId, contratoId, observacoes = '' } = req.body;
  const contratos = await getClienteContratoRows(cliente);
  const authorizedIds = contratos.map(item => Number(item.id));
  if (authorizedIds.length === 0) return res.status(404).json({ message: 'Nenhum contrato encontrado para este cliente.' });

  const projeto = projetoId
    ? await db.get('SELECT * FROM projetos WHERE id = ?', projetoId)
    : await db.get('SELECT * FROM projetos WHERE contratoId = ?', contratoId || authorizedIds[0]);
  if (!projeto || !authorizedIds.includes(Number(projeto.contratoId))) {
    return res.status(403).json({ message: 'Projeto não pertence a este cliente.' });
  }

  const now = new Date().toISOString();
  const checklist = { ...parseJsonField(projeto.checklist, {}), equipamentoEntregue: true };
  const nextObservacoes = [
    projeto.observacoes,
    observacoes ? `Cliente confirmou entrega em ${new Date(now).toLocaleString('pt-BR')}: ${observacoes}` : `Cliente confirmou entrega em ${new Date(now).toLocaleString('pt-BR')}`,
  ].filter(Boolean).join('\n');

  await db.run(
    `UPDATE projetos
     SET equipamentoEntregueAt = ?, checklist = ?, observacoes = ?, updatedAt = ?
     WHERE id = ?`,
    now,
    JSON.stringify(checklist),
    nextObservacoes,
    now,
    projeto.id
  );

  const updated = parseProjeto(await db.get('SELECT * FROM projetos WHERE id = ?', projeto.id));
  io.emit('projeto_atualizado', updated);
  res.json(updated);
});

app.post('/api/cliente/medidor-trocado', authRequired, requireClientUser, async (req, res) => {
  const cliente = await db.get('SELECT * FROM clientes WHERE id = ?', req.user.id);
  if (!cliente) return res.status(404).json({ message: 'Cliente não encontrado.' });

  const { projetoId, contratoId, observacoes = '' } = req.body;
  const contratos = await getClienteContratoRows(cliente);
  const authorizedIds = contratos.map(item => Number(item.id));
  if (authorizedIds.length === 0) return res.status(404).json({ message: 'Nenhum contrato encontrado para este cliente.' });

  const projeto = projetoId
    ? await db.get('SELECT * FROM projetos WHERE id = ?', projetoId)
    : await db.get('SELECT * FROM projetos WHERE contratoId = ?', contratoId || authorizedIds[0]);
  if (!projeto || !authorizedIds.includes(Number(projeto.contratoId))) {
    return res.status(403).json({ message: 'Projeto não pertence a este cliente.' });
  }

  const now = new Date().toISOString();
  const checklist = { ...parseJsonField(projeto.checklist, {}), medidorTrocado: true };
  const nextObservacoes = [
    projeto.observacoes,
    observacoes
      ? `Cliente confirmou troca do medidor pela Equatorial em ${new Date(now).toLocaleString('pt-BR')}: ${observacoes}`
      : `Cliente confirmou troca do medidor pela Equatorial em ${new Date(now).toLocaleString('pt-BR')}`,
  ].filter(Boolean).join('\n');

  await db.run(
    `UPDATE projetos
     SET medidorTrocadoAt = ?, checklist = ?, observacoes = ?, updatedAt = ?
     WHERE id = ?`,
    now,
    JSON.stringify(checklist),
    nextObservacoes,
    now,
    projeto.id
  );

  const updated = parseProjeto(await db.get('SELECT * FROM projetos WHERE id = ?', projeto.id));
  io.emit('projeto_atualizado', updated);
  res.json(updated);
});

app.post('/api/forgot-password', async (req, res) => {
  const identifier = String(req.body?.email || req.body?.identifier || '').trim();
  const genericMessage = 'Se esse e-mail estiver cadastrado, enviaremos um link para redefinir sua senha.';

  if (!identifier) {
    return res.status(400).json({ message: 'Informe seu e-mail ou usuário.' });
  }

  try {
    const resetUser = await findPasswordResetUser(identifier);
    if (resetUser) {
      const token = createResetToken();
      const tokenHash = hashResetToken(token);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);
      const resetUrl = `${getAppUrl()}/redefinir-senha?token=${encodeURIComponent(token)}`;

      await db.run(
        `INSERT INTO password_reset_tokens
          (userType, userId, email, tokenHash, expiresAt, usedAt, createdAt)
         VALUES (?, ?, ?, ?, ?, NULL, ?)`,
        resetUser.userType,
        resetUser.id,
        resetUser.email,
        tokenHash,
        expiresAt.toISOString(),
        now.toISOString()
      );

      await sendPasswordResetEmail({
        to: resetUser.email,
        name: resetUser.name,
        resetUrl,
      });
    }

    res.json({ message: genericMessage });
  } catch (error) {
    console.error('Erro ao solicitar recuperação de senha:', error);
    res.status(500).json({ message: 'Não foi possível enviar o e-mail de recuperação agora.' });
  }
});

app.post('/api/reset-password', async (req, res) => {
  const token = String(req.body?.token || '').trim();
  const newPassword = String(req.body?.password || req.body?.newPassword || '');

  if (!token) {
    return res.status(400).json({ message: 'Token de recuperação não informado.' });
  }

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ message: 'A nova senha precisa ter pelo menos 6 caracteres.' });
  }

  try {
    const tokenHash = hashResetToken(token);
    const reset = await db.get(
      `SELECT * FROM password_reset_tokens
       WHERE tokenHash = ? AND usedAt IS NULL AND expiresAt > ?
       ORDER BY id DESC LIMIT 1`,
      tokenHash,
      new Date().toISOString()
    );

    if (!reset) {
      return res.status(400).json({ message: 'Link inválido ou expirado. Solicite um novo e-mail de recuperação.' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    if (reset.userType === 'interno') {
      await db.run(
        'UPDATE usuarios SET password = ?, mustChangePassword = 0 WHERE id = ?',
        hashedPassword,
        reset.userId
      );
    } else {
      await db.run(
        'UPDATE clientes SET password = ? WHERE id = ?',
        hashedPassword,
        reset.userId
      );
    }

    await db.run(
      'UPDATE password_reset_tokens SET usedAt = ? WHERE id = ?',
      new Date().toISOString(),
      reset.id
    );

    res.json({ message: 'Senha redefinida com sucesso. Você já pode acessar o painel.' });
  } catch (error) {
    console.error('Erro ao redefinir senha:', error);
    res.status(500).json({ message: 'Não foi possível redefinir a senha agora.' });
  }
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
  const clientes = await db.all('SELECT * FROM clientes ORDER BY id DESC');
  res.json(clientes.map(publicClient));
});

app.post('/api/admin/clientes', authRequired, requirePermission('gerenciarClientes'), async (req, res) => {
  const data = normalizeClientPayload(req.body);
  if (!data.nome || !data.whatsapp || !data.cidade) {
    return res.status(400).json({ message: 'Nome, WhatsApp e cidade são obrigatórios.' });
  }

  try {
    const hashedPassword = await bcrypt.hash(req.body.password || 'Cliente@DRM#2026', 10);
    const columns = ['nome', 'whatsapp', 'cidade', 'email', 'password', 'dataCadastro', ...CLIENT_EXTRA_FIELDS];
    const result = await db.run(
      `INSERT INTO clientes (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      data.nome,
      data.whatsapp,
      data.cidade,
      data.email,
      hashedPassword,
      new Date().toISOString().split('T')[0],
      ...CLIENT_EXTRA_FIELDS.map(field => data[field])
    );
    const cliente = await db.get('SELECT * FROM clientes WHERE id = ?', result.lastID);
    res.status(201).json(publicClient(cliente));
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT') {
      return res.status(400).json({ message: 'Este e-mail já está cadastrado.' });
    }
    res.status(500).json({ message: 'Erro ao cadastrar cliente.' });
  }
});

app.put('/api/admin/clientes/:id', authRequired, requirePermission('gerenciarClientes'), async (req, res) => {
  const data = normalizeClientPayload(req.body);
  const fields = ['nome', 'whatsapp', 'cidade', 'email', ...CLIENT_EXTRA_FIELDS];
  await db.run(
    `UPDATE clientes SET ${fields.map(field => `${field} = ?`).join(', ')} WHERE id = ?`,
    ...fields.map(field => data[field]),
    req.params.id
  );
  const cliente = await db.get('SELECT * FROM clientes WHERE id = ?', req.params.id);
  res.json(cliente ? publicClient(cliente) : { message: 'Cliente atualizado.' });
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
  const data = normalizeEquipamentoPayload(req.body);
  if (!data.nome || !data.placaModelo || !data.inversorModelo) {
    return res.status(400).json({ message: 'Nome, modelo da placa e modelo do inversor são obrigatórios.' });
  }

  const result = await db.run(
    `INSERT INTO equipamentos
      (nome, tipo, placaModelo, inversorModelo, potenciaPlacaW, potenciaInversorKw, geracaoKwh, geracaoAnualKwh,
       potenciaKwp, numeroPaineis, quantidadeCabo, valorSistema, valorEntrada, valorSaldo, prazoExecucao,
       formaPagamentoTipo, formaPagamento, observacoes, active, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    data.nome,
    data.tipo,
    data.placaModelo,
    data.inversorModelo,
    data.potenciaPlacaW,
    data.potenciaInversorKw,
    data.geracaoKwh,
    data.geracaoAnualKwh,
    data.potenciaKwp,
    data.numeroPaineis,
    data.quantidadeCabo,
    data.valorSistema,
    data.valorEntrada,
    data.valorSaldo,
    data.prazoExecucao,
    data.formaPagamentoTipo,
    data.formaPagamento,
    data.observacoes,
    new Date().toISOString()
  );
  const equipamento = await db.get('SELECT * FROM equipamentos WHERE id = ?', result.lastID);
  res.status(201).json({ ...equipamento, active: Boolean(equipamento.active) });
});

app.put('/api/admin/equipamentos/:id', authRequired, requirePermission('contratos'), async (req, res) => {
  const data = normalizeEquipamentoPayload(req.body);
  const { active } = req.body;
  await db.run(
    `UPDATE equipamentos
     SET nome = COALESCE(?, nome),
         tipo = COALESCE(?, tipo),
         placaModelo = COALESCE(?, placaModelo),
         inversorModelo = COALESCE(?, inversorModelo),
         potenciaPlacaW = ?,
         potenciaInversorKw = ?,
         geracaoKwh = ?,
         geracaoAnualKwh = ?,
         potenciaKwp = ?,
         numeroPaineis = ?,
         quantidadeCabo = ?,
         valorSistema = ?,
         valorEntrada = ?,
         valorSaldo = ?,
         prazoExecucao = ?,
         formaPagamentoTipo = ?,
         formaPagamento = ?,
         observacoes = COALESCE(?, observacoes),
         active = ?
     WHERE id = ?`,
    data.nome || null,
    data.tipo || null,
    data.placaModelo || null,
    data.inversorModelo || null,
    data.potenciaPlacaW,
    data.potenciaInversorKw,
    data.geracaoKwh,
    data.geracaoAnualKwh,
    data.potenciaKwp,
    data.numeroPaineis,
    data.quantidadeCabo,
    data.valorSistema,
    data.valorEntrada,
    data.valorSaldo,
    data.prazoExecucao,
    data.formaPagamentoTipo,
    data.formaPagamento,
    data.observacoes || null,
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
  const manualFinal = mergeManualWithEquipamento(manual, equipamento);
  const now = new Date().toISOString();
  const dados = {
    dimensionamento,
    financeiro,
    manual: manualFinal,
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
    Number(manualFinal.valorSistema || financeiro.preco_final_cliente_rs) || 0,
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
      placaModelo: manualFinal.painel || equipamento?.placaModelo || '',
      inversorModelo: manualFinal.inversor || equipamento?.inversorModelo || '',
    })
  );

  const contrato = await db.get('SELECT * FROM contratos WHERE id = ?', result.lastID);
  const parsedContrato = parseContrato(contrato);
  io.emit('contrato_atualizado', parsedContrato);
  res.status(201).json(parsedContrato);
});

app.post('/api/admin/contratos-direto', authRequired, requirePermission('contratos'), async (req, res) => {
  const { clienteId, equipamentoId, manual = {} } = req.body;
  if (!clienteId) return res.status(400).json({ message: 'Selecione um cliente para gerar o contrato.' });

  const cliente = await db.get('SELECT * FROM clientes WHERE id = ?', clienteId);
  if (!cliente) return res.status(404).json({ message: 'Cliente não encontrado.' });

  const equipamento = equipamentoId
    ? await db.get('SELECT * FROM equipamentos WHERE id = ?', equipamentoId)
    : await db.get('SELECT * FROM equipamentos WHERE active = 1 ORDER BY id DESC LIMIT 1');
  const manualFinal = mergeManualWithEquipamento(manual, equipamento);

  const potenciaKwp = Number(manualFinal.potenciaKwp || 0);
  const potenciaPlacaW = Number(equipamento?.potenciaPlacaW || 0);
  const numeroPaineis = Number(manualFinal.numeroPaineis || 0) || (
    potenciaKwp && potenciaPlacaW ? Math.ceil(potenciaKwp / (potenciaPlacaW / 1000)) : 0
  );
  const geracaoMensal = Number(manualFinal.geracaoKwh || 0);
  const valorSistema = Number(manualFinal.valorSistema || 0);
  const now = new Date().toISOString();
  const clienteSnapshot = {
    ...cliente,
    enderecoCompleto: buildClientAddress(cliente),
    enderecoInstalacaoCompleto: buildInstallAddress(cliente),
  };
  delete clienteSnapshot.password;

  const dados = {
    dimensionamento: {
      potencia_real_instalada_kwp: potenciaKwp,
      numero_paineis_necessarios: numeroPaineis,
      potencia_painel_utilizado_w: potenciaPlacaW || null,
      geracao_estimada_kwh: geracaoMensal,
      geracao_anual_estimada_kwh: Number(manualFinal.geracaoAnualKwh || 0) || (geracaoMensal * 12),
      respostas_usuario: { origem: 'cliente_cadastrado' },
    },
    financeiro: {
      preco_final_cliente_rs: valorSistema,
      forma_pagamento_tipo: manualFinal.formaPagamentoTipo || '',
      forma_pagamento: manualFinal.formaPagamento || '',
      entrada_rs: Number(manualFinal.valorEntrada || 0),
      saldo_rs: Number(manualFinal.valorSaldo || 0),
    },
    manual: manualFinal,
    cliente: clienteSnapshot,
    statusOrigem: 'Cliente cadastrado',
    observacao: 'Contrato gerado diretamente a partir do cadastro completo do cliente.',
  };

  const result = await db.run(
    `INSERT INTO contratos
      (orcamentoId, clienteNome, clienteTelefone, clienteEmail, clienteCidade, valorProjeto, status, dados,
       criadoPorId, criadoPorNome, dataCriacao, assignedUserId, assignedUserName, equipamentoId, equipamentoNome, equipamentoDados)
     VALUES (NULL, ?, ?, ?, ?, ?, 'Pendente', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    cliente.nome,
    cliente.whatsapp,
    cliente.email,
    cliente.cidade,
    valorSistema,
    JSON.stringify(dados),
    req.user.id,
    req.user.nome,
    now,
    req.user.id,
    req.user.nome,
    equipamento?.id || null,
    equipamento?.nome || null,
    JSON.stringify({
      ...(equipamento || {}),
      placaModelo: manualFinal.painel || equipamento?.placaModelo || '',
      inversorModelo: manualFinal.inversor || equipamento?.inversorModelo || '',
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

  await sendContratoPdf(res, contrato);
});

app.get('/api/admin/usuarios', authRequired, requirePermission('usuarios'), async (req, res) => {
  const usuarios = await db.all('SELECT id, nome, username, email, whatsapp, role, permissions, mustChangePassword, active, emailVerified, createdAt FROM usuarios ORDER BY id ASC');
  res.json(usuarios.map(user => ({ ...user, permissions: parsePermissions(user.permissions), mustChangePassword: Boolean(user.mustChangePassword), active: Boolean(user.active), emailVerified: hasVerifiedEmail(user) })));
});

app.post('/api/admin/usuarios', authRequired, requirePermission('usuarios'), async (req, res) => {
  const { nome, username, email, whatsapp, role, permissions, temporaryPassword } = req.body;
  const normalizedName = String(nome || '').trim();
  const normalizedUsername = String(username || '').trim().toLowerCase();
  const normalizedEmail = normalizeEmail(email);
  const normalizedWhatsApp = normalizeWhatsAppPhone(whatsapp);
  const normalizedRole = ['ADM', 'EQUIPE_TECNICA_COMERCIAL', 'CONSULTOR'].includes(role) ? role : 'CONSULTOR';
  const password = String(temporaryPassword || `${normalizedUsername}@DRM#2026`).trim();
  if (!isRealEmail(normalizedEmail)) {
    return res.status(400).json({ message: 'Informe um e-mail válido para recuperação de senha.' });
  }
  const mergedPermissions = mergePermissions(permissions || {
    dashboard: true,
    leads: true,
    orcamentos: true,
    contratos: true,
  });

  if (!normalizedName || !normalizedUsername || !normalizedWhatsApp) {
    return res.status(400).json({ message: 'Informe nome, usuário e WhatsApp para cadastrar no rodízio.' });
  }

  const exists = await db.get('SELECT id FROM usuarios WHERE username = ? OR email = ?', normalizedUsername, normalizedEmail);
  if (exists) {
    return res.status(409).json({ message: 'Já existe um usuário com este usuário ou e-mail.' });
  }

  const result = await db.run(
    `INSERT INTO usuarios
      (nome, username, email, whatsapp, password, role, permissions, mustChangePassword, active, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?)`,
    normalizedName,
    normalizedUsername,
    normalizedEmail,
    normalizedWhatsApp,
    await bcrypt.hash(password, 10),
    normalizedRole,
    JSON.stringify(mergedPermissions),
    new Date().toISOString()
  );

  res.status(201).json({
    id: result.lastID,
    nome: normalizedName,
    username: normalizedUsername,
    email: normalizedEmail,
    whatsapp: normalizedWhatsApp,
    role: normalizedRole,
    permissions: mergedPermissions,
    mustChangePassword: true,
    emailVerified: false,
    active: true,
    temporaryPassword: password,
  });
});

app.put('/api/admin/usuarios/:id/permissoes', authRequired, requirePermission('permissoes'), async (req, res) => {
  const { permissions, active, whatsapp, nome, role } = req.body;
  const user = await db.get('SELECT * FROM usuarios WHERE id = ?', req.params.id);
  if (!user) return res.status(404).json({ message: 'Usuário não encontrado.' });
  const nextRole = ['ADM', 'EQUIPE_TECNICA_COMERCIAL', 'CONSULTOR'].includes(role) ? role : user.role;

  await db.run(
    'UPDATE usuarios SET nome = ?, role = ?, permissions = ?, active = ?, whatsapp = ? WHERE id = ?',
    String(nome || user.nome).trim(),
    nextRole,
    JSON.stringify(mergePermissions(permissions)),
    active === false ? 0 : 1,
    typeof whatsapp === 'undefined' ? user.whatsapp : normalizeWhatsAppPhone(whatsapp),
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

  const { etapa, prioridade, responsavelId, observacoes, prazoPrevisto, checklist, instalacaoAgendada, previsaoLigacao, equipamentoEntregueAt, medidorTrocadoAt } = req.body;
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
         instalacaoAgendada = COALESCE(?, instalacaoAgendada),
         previsaoLigacao = COALESCE(?, previsaoLigacao),
         equipamentoEntregueAt = COALESCE(?, equipamentoEntregueAt),
         medidorTrocadoAt = COALESCE(?, medidorTrocadoAt),
         updatedAt = ?
     WHERE id = ?`,
    etapa || null,
    prioridade || null,
    responsavelId || null,
    responsavelNome,
    checklist ? JSON.stringify(checklist) : null,
    observacoes || null,
    prazoPrevisto || null,
    instalacaoAgendada || null,
    previsaoLigacao || null,
    equipamentoEntregueAt || null,
    medidorTrocadoAt || null,
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
  const [leads, orcamentos, contratos, projetos, atividades, siteEvents, clientesResumo, usuariosResumo, ordensServico] = await Promise.all([
    canSeeAll ? db.all('SELECT * FROM leads') : db.all('SELECT * FROM leads WHERE assignedUserId = ?', req.user.id),
    canSeeAll ? db.all('SELECT * FROM orcamentos') : db.all('SELECT * FROM orcamentos WHERE assignedUserId = ?', req.user.id),
    canSeeAll ? db.all('SELECT * FROM contratos') : db.all('SELECT * FROM contratos WHERE assignedUserId = ? OR criadoPorId = ?', req.user.id, req.user.id),
    canSeeAll ? db.all('SELECT * FROM projetos') : db.all('SELECT * FROM projetos WHERE responsavelId = ?', req.user.id),
    canSeeAll ? db.all('SELECT * FROM atividades ORDER BY id DESC LIMIT 8') : db.all('SELECT * FROM atividades WHERE criadoPorId = ? ORDER BY id DESC LIMIT 8', req.user.id),
    canSeeAll
      ? db.all(`
          SELECT type, source, path, createdAt
          FROM site_events
          WHERE datetime(createdAt) >= datetime('now', '-30 days')
          ORDER BY id DESC
        `)
      : Promise.resolve([]),
    canSeeAll ? db.all('SELECT id, nome, email, emailVerified FROM clientes') : Promise.resolve([]),
    canSeeAll ? db.all('SELECT id, nome, username, email, emailVerified, active, mustChangePassword FROM usuarios') : Promise.resolve([]),
    canSeeAll ? db.all('SELECT * FROM ordens_servico') : db.all('SELECT * FROM ordens_servico WHERE responsavelId = ? OR responsavelId IS NULL', req.user.id),
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
  const analyticsByType = siteEvents.reduce((acc, event) => {
    acc[event.type] = (acc[event.type] || 0) + 1;
    return acc;
  }, {});
  const analyticsBySource = siteEvents.reduce((acc, event) => {
    const source = event.source || 'site';
    acc[source] = (acc[source] || 0) + 1;
    return acc;
  }, {});
  const last7DaysEvents = siteEvents.filter(event => {
    const date = new Date(event.createdAt);
    const start = new Date(hoje);
    start.setDate(start.getDate() - 7);
    return date >= start;
  });
  const topSources = Object.entries(analyticsBySource)
    .map(([source, total]) => ({ source, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);
  const contratosPorStatus = contratos.reduce((acc, contrato) => {
    const status = contrato.status || 'Sem status';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  const valorPendenteContratos = contratos
    .filter(contrato => contrato.status === 'Pendente')
    .reduce((sum, contrato) => sum + Number(contrato.valorProjeto || 0), 0);
  const emailsPendentesClientes = clientesResumo.filter(cliente => requiresEmailVerification(cliente)).length;
  const emailsPendentesUsuarios = usuariosResumo.filter(user => user.active !== 0 && requiresEmailVerification(user)).length;
  const recuperacaoLiberadaClientes = clientesResumo.filter(cliente => hasVerifiedEmail(cliente)).length;
  const recuperacaoLiberadaUsuarios = usuariosResumo.filter(user => user.active !== 0 && hasVerifiedEmail(user)).length;
  const osAbertas = ordensServico.filter(os => os.status === 'Aberta').length;
  const osEmAtendimento = ordensServico.filter(os => os.status === 'Em atendimento').length;

  res.json({
    kpis: {
      leads: leads.length,
      novos: leadsPorStatus.Novo || 0,
      orcamentos: orcamentos.length,
      contratos: contratos.length,
      contratosPendentes: contratos.filter(contrato => contrato.status === 'Pendente').length,
      contratosAprovados: contratos.filter(contrato => contrato.status === 'Aprovado').length,
      contratosRecusados: contratos.filter(contrato => contrato.status === 'Recusado').length,
      valorPendenteContratos,
      osAbertas,
      osEmAtendimento,
      projetosAtivos: projetos.filter(projeto => projeto.etapa !== 'Concluído').length,
      valorAprovadoMes,
      retornosSemana: leads.filter(lead => isBetween(lead.proximoRetorno, fimSemana)).length,
      clientesSemEmailVerificado: emailsPendentesClientes,
      usuariosSemEmailVerificado: emailsPendentesUsuarios,
      acessosSemRecuperacao: emailsPendentesClientes + emailsPendentesUsuarios,
      acessosComRecuperacao: recuperacaoLiberadaClientes + recuperacaoLiberadaUsuarios,
      visitasSite30d: analyticsByType.page_view || 0,
      clicksWhatsApp30d: analyticsByType.whatsapp_click || 0,
      clicksSimular30d: analyticsByType.simulation_click || 0,
      simulacoesConcluidas30d: analyticsByType.simulation_completed || 0,
    },
    contratosPorStatus,
    operacao: {
      contratosTotal: contratos.length,
      contratosPendentes: contratos.filter(contrato => contrato.status === 'Pendente').length,
      contratosAprovados: contratos.filter(contrato => contrato.status === 'Aprovado').length,
      contratosRecusados: contratos.filter(contrato => contrato.status === 'Recusado').length,
      valorPendenteContratos,
      ordensServicoAbertas: osAbertas,
      ordensServicoEmAtendimento: osEmAtendimento,
      emailsPendentesClientes,
      emailsPendentesUsuarios,
      acessosSemRecuperacao: emailsPendentesClientes + emailsPendentesUsuarios,
      acessosComRecuperacao: recuperacaoLiberadaClientes + recuperacaoLiberadaUsuarios,
      senhasTemporarias: usuariosResumo.filter(user => user.active !== 0 && user.mustChangePassword).length,
    },
    siteAnalytics: {
      totalEventos30d: siteEvents.length,
      visitas7d: last7DaysEvents.filter(event => event.type === 'page_view').length,
      whatsapp7d: last7DaysEvents.filter(event => event.type === 'whatsapp_click').length,
      simular7d: last7DaysEvents.filter(event => event.type === 'simulation_click').length,
      concluidas7d: last7DaysEvents.filter(event => event.type === 'simulation_completed').length,
      conversaoWhatsApp30d: (analyticsByType.page_view || 0) ? ((analyticsByType.whatsapp_click || 0) / analyticsByType.page_view) : 0,
      conversaoSimulacao30d: (analyticsByType.simulation_click || 0) ? ((analyticsByType.simulation_completed || 0) / analyticsByType.simulation_click) : 0,
      porTipo: analyticsByType,
      topSources,
      eventosRecentes: siteEvents.slice(0, 8),
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
