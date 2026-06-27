require('dotenv').config({ quiet: true });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
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
const { execFile, spawn } = require('child_process');
const { promisify } = require('util');
const ffmpegPath = require('ffmpeg-static');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const pino = require('pino');
const {
  default: makeWASocket,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} = require('@whiskeysockets/baileys');

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const DEFAULT_WHATSAPP_PHONE = '559985127056';
const WHATSAPP_AUTH_DIR = path.join(__dirname, 'whatsapp-session');
const WHATSAPP_MEDIA_DIR = path.join(__dirname, 'uploads', 'whatsapp');
const WHATSAPP_MEDIA_ARCHIVE_REMOTE = process.env.WHATSAPP_MEDIA_ARCHIVE_REMOTE || 'gdrive:DRM-Solar-Backups/media/whatsapp';
const WHATSAPP_CONTACTS_CACHE_FILE = path.join(__dirname, 'whatsapp-contacts-cache.json');
const execFileAsync = promisify(execFile);
const ROUND_ROBIN_SELLERS = [
  { position: 1, phone: '5599984632324', name: 'Vendedor 1' },
  { position: 2, phone: '5599992276744', name: 'Vendedor 2' },
  { position: 3, phone: '5599985127056', name: 'Vendedor 3' },
];

const whatsappKnownContacts = new Map();
let whatsappContactsCacheSaveTimer = null;

const schedulePersistWhatsAppContacts = () => {
  if (whatsappContactsCacheSaveTimer) clearTimeout(whatsappContactsCacheSaveTimer);
  whatsappContactsCacheSaveTimer = setTimeout(() => {
    whatsappContactsCacheSaveTimer = null;
    try {
      const payload = JSON.stringify(
        [...whatsappKnownContacts.entries()].map(([phone, contact]) => [phone, contact]),
        null,
        2
      );
      fs.writeFileSync(WHATSAPP_CONTACTS_CACHE_FILE, payload, 'utf8');
    } catch (error) {
      console.error('Erro ao persistir cache de contatos do WhatsApp:', error?.message || error);
    }
  }, 500);
};

const loadPersistedWhatsAppContacts = () => {
  try {
    if (!fs.existsSync(WHATSAPP_CONTACTS_CACHE_FILE)) return;
    const raw = fs.readFileSync(WHATSAPP_CONTACTS_CACHE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    for (const item of parsed) {
      if (!Array.isArray(item) || item.length < 2) continue;
      const phone = normalizeWhatsAppPhone(item[0]);
      const contact = item[1] && typeof item[1] === 'object' ? item[1] : null;
      if (!phone || !contact) continue;
      whatsappKnownContacts.set(phone, {
        id: String(contact.id || '').trim(),
        lid: String(contact.lid || '').trim(),
        phoneNumber: String(contact.phoneNumber || '').trim(),
        name: String(contact.name || '').trim(),
        notify: String(contact.notify || '').trim(),
        verifiedName: String(contact.verifiedName || '').trim(),
        short: String(contact.short || '').trim(),
      });
    }
  } catch (error) {
    console.error('Erro ao carregar cache de contatos do WhatsApp:', error?.message || error);
  }
};

// Configuração do Servidor HTTP para suportar o Socket.io
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' } // Simplificado para aceitar qualquer conexão de websocket
});

// Middlewares
// Produção fica atrás de um único Nginx. Confiar em qualquer proxy permite
// falsificar o IP e contornar o rate limit do login.
app.set('trust proxy', 1);
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
// Cabeçalhos de segurança. crossOriginResourcePolicy desligado para não
// bloquear o carregamento de assets/imagens por outras origens (front separado).
app.use(helmet({ crossOriginResourcePolicy: false, contentSecurityPolicy: false }));
app.use(cors(corsOptions));
app.use(express.json({ limit: '25mb' }));
app.use('/assets', express.static(path.join(__dirname, '../frontend/public/assets')));

const sendWhatsappMedia = (req, res) => {
  const fileName = path.basename(String(req.params.fileName || ''));
  if (!fileName || fileName !== req.params.fileName) return res.status(400).send('Arquivo inválido.');
  const filePath = path.join(WHATSAPP_MEDIA_DIR, fileName);
  res.sendFile(filePath, (error) => {
    if (!error || res.headersSent) return;

    const remotePath = `${WHATSAPP_MEDIA_ARCHIVE_REMOTE}/${fileName}`;
    const rclone = spawn('rclone', ['cat', remotePath]);
    let hasOutput = false;

    rclone.stdout.on('data', () => {
      hasOutput = true;
    });
    rclone.stdout.on('error', () => {});
    rclone.stderr.on('data', () => {});
    rclone.on('spawn', () => {
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
      rclone.stdout.pipe(res);
    });
    rclone.on('close', (code) => {
      if (code !== 0 && !hasOutput && !res.headersSent) res.status(404).send('Mídia não encontrada.');
    });
  });
};

app.get('/uploads/whatsapp/:fileName', sendWhatsappMedia);
app.get('/api/whatsapp/media/:fileName', sendWhatsappMedia);

// Limita tentativas de login para mitigar força bruta (por IP).
const loginRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Muitas tentativas de login. Aguarde um minuto e tente novamente.' },
});

// Chave secreta para o JWT. DEVE vir de variável de ambiente em produção.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('ERRO: variável de ambiente JWT_SECRET não definida. Configure-a antes de iniciar o servidor.');
  process.exit(1);
}
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
  whatsapp: false,
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
    whatsapp: process.env.WHATSAPP_DEIVSON || '559991675608',
    role: 'ADM',
    temporaryPassword: 'Deivson@DRM#2026',
    permissions: {
      dashboard: true,
      clientes: true,
      leads: true,
      orcamentos: true,
      contratos: true,
      ordensServico: true,
      whatsapp: true,
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
      clientes: true,
      leads: true,
      orcamentos: true,
      contratos: true,
      ordensServico: true,
      whatsapp: true,
      precosSistemas: true,
      equipeTecnica: true,
      gerenciarClientes: true,
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
      whatsapp: true,
    },
  },
  {
    nome: 'Carlito Lopes',
    username: 'carlito',
    email: 'carlito@drm.local',
    whatsapp: process.env.WHATSAPP_CARLITO || '5599992276744',
    role: 'CONSULTOR',
    temporaryPassword: 'Carlito@DRM#2026',
    permissions: {
      dashboard: true,
      leads: true,
      orcamentos: true,
      contratos: true,
      whatsapp: true,
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
      whatsapp: true,
    },
  },
];

const mergePermissions = (permissions = {}) => ({
  ...DEFAULT_PERMISSIONS,
  ...permissions,
});

const normalizePermissions = (permissions = {}) => {
  const merged = mergePermissions(permissions);
  if (merged.clientes) merged.gerenciarClientes = true;
  if (merged.gerenciarClientes) merged.clientes = true;
  if (merged.whatsapp) merged.leads = true;
  if (merged.permissoes) merged.usuarios = true;
  if (merged.orcamentos) merged.clientes = true;
  if (merged.contratos) {
    merged.clientes = true;
    merged.orcamentos = true;
  }
  if (merged.equipeTecnica) {
    merged.ordensServico = true;
    merged.precosSistemas = true;
  }
  if (merged.clientes) merged.gerenciarClientes = true;
  return merged;
};

const parsePermissions = (value) => {
  try {
    return normalizePermissions(value ? JSON.parse(value) : {});
  } catch {
    return normalizePermissions();
  }
};

const parseQuickActions = (value) => {
  try {
    const parsed = value ? JSON.parse(value) : null;
    return Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string') : null;
  } catch {
    return null;
  }
};

const can = (user, permission) => user?.permissions?.[permission] === true;
const MASTER_ADMIN_USERNAME = String(process.env.MASTER_ADMIN_USERNAME || 'deivson').toLowerCase();
const isMasterAdminUser = (user) => user?.role === 'ADM' && String(user?.username || '').toLowerCase() === MASTER_ADMIN_USERNAME;

const normalizeWhatsAppPhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55')) {
    // Brazilian numbers with country code should be 12 (landline) or 13 (mobile) digits.
    // If 14 digits starting with '559X' the user probably entered an extra 9 after DDD.
    // e.g. "55989981418025" (14 digits) → "5598981418025" (13 digits)
    if (digits.length === 14 && digits.charAt(4) === '9') {
      return digits.slice(0, 4) + digits.slice(5);
    }
    return digits;
  }
  if (digits.length === 10 || digits.length === 11 || digits.length === 12) return `55${digits}`;
  return digits;
};

const normalizeWhatsAppRemoteJid = (value) => {
  const jid = String(value || '').trim();
  if (!jid) return '';
  if (jid.includes('@')) return jid;
  return `${normalizeWhatsAppPhone(jid)}@s.whatsapp.net`;
};

const getPhoneFromWhatsAppJid = (jid) => normalizeWhatsAppPhone(String(jid || '').split('@')[0].split(':')[0]);
const formatLeadPhoneForNotice = (value) => {
  const phone = normalizeWhatsAppPhone(value);
  return phone.startsWith('55') ? phone.slice(2) : phone;
};
const getPhonesFromWhatsAppContact = (contact = {}) => {
  const values = [contact?.phoneNumber, contact?.id, contact?.lid];
  return [...new Set(values.map(value => normalizeWhatsAppPhone(value)).filter(Boolean))];
};

const isBlockedWhatsAppJid = (jid = '') => {
  const value = String(jid || '');
  return !value
    || value === 'status@broadcast'
    || value.endsWith('@g.us')
    || value.endsWith('@broadcast')
    || value.endsWith('@newsletter');
};

// Gera variantes de um número brasileiro (com/sem 55, com/sem 9º dígito)
// para casar leads/conversas independente de como o número foi cadastrado.
const whatsAppPhoneVariants = (value) => {
  const p = normalizeWhatsAppPhone(value);
  const variants = new Set();
  if (!p) return [];
  variants.add(p);
  variants.add(p.replace(/^55/, ''));
  if (p.startsWith('55') && p.length >= 12) {
    const ddd = p.slice(2, 4);
    const local = p.slice(4);
    if (local.length === 9 && local.startsWith('9')) {
      const without9 = local.slice(1);
      variants.add(`55${ddd}${without9}`);
      variants.add(`${ddd}${without9}`);
    } else if (local.length === 8) {
      const with9 = `9${local}`;
      variants.add(`55${ddd}${with9}`);
      variants.add(`${ddd}${with9}`);
    }
  }
  return [...variants].filter(Boolean);
};

const buildNormalizedPhoneInSql = (column, count) => (
  `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(${column}, ''), ' ', ''), '-', ''), '(', ''), ')', ''), '+', '') IN (${Array.from({ length: count }, () => '?').join(', ')})`
);

const isKnownBusinessPhone = async (phoneVariants = []) => {
  if (!phoneVariants.length) return false;
  const whereUsuarios = buildNormalizedPhoneInSql('whatsapp', phoneVariants.length);
  const whereClientes = buildNormalizedPhoneInSql('whatsapp', phoneVariants.length);
  const whereContratos = buildNormalizedPhoneInSql('clienteTelefone', phoneVariants.length);
  const [usuario, cliente, contrato] = await Promise.all([
    db.get(`SELECT id FROM usuarios WHERE ${whereUsuarios} LIMIT 1`, ...phoneVariants),
    db.get(`SELECT id FROM clientes WHERE ${whereClientes} LIMIT 1`, ...phoneVariants),
    db.get(`SELECT id FROM contratos WHERE ${whereContratos} LIMIT 1`, ...phoneVariants),
  ]);
  return Boolean(usuario || cliente || contrato);
};

const rememberWhatsAppContacts = (contacts = []) => {
  let changed = false;
  for (const contact of Array.isArray(contacts) ? contacts : []) {
    const phones = getPhonesFromWhatsAppContact(contact);
    if (!phones.length) continue;
    for (const phone of phones) {
      const previous = whatsappKnownContacts.get(phone) || {};
      const nextContact = {
        ...previous,
        id: String(contact?.id || previous.id || '').trim(),
        lid: String(contact?.lid || previous.lid || '').trim(),
        phoneNumber: String(contact?.phoneNumber || previous.phoneNumber || '').trim(),
        name: String(contact?.name || previous.name || '').trim(),
        notify: String(contact?.notify || previous.notify || '').trim(),
        verifiedName: String(contact?.verifiedName || previous.verifiedName || '').trim(),
        short: String(contact?.short || previous.short || '').trim(),
      };
      const previousSerialized = JSON.stringify(previous || {});
      const nextSerialized = JSON.stringify(nextContact);
      if (previousSerialized !== nextSerialized) {
        whatsappKnownContacts.set(phone, nextContact);
        changed = true;
      }
    }
  }
  if (changed) schedulePersistWhatsAppContacts();
};

const isSavedWhatsAppContact = (phoneVariants = []) => {
  for (const variant of phoneVariants) {
    const phone = normalizeWhatsAppPhone(variant);
    const contact = phone ? whatsappKnownContacts.get(phone) : null;
    if (contact && (contact.name || contact.notify || contact.verifiedName || contact.short || contact.phoneNumber || contact.lid || contact.id)) return true;
  }
  return false;
};

// Um contato individual real tem telefone de 10 a 13 dígitos. IDs de grupo,
// canal/newsletter e artefatos de LID têm 14+ dígitos e não são telefones —
// nunca devem virar conversa.
const isPlausibleContactPhone = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 13;
};

const getIncomingContactAddress = (key = {}) => {
  const primaryJid = String(key.remoteJid || '');
  if (isBlockedWhatsAppJid(primaryJid)) {
    return { phone: '', remoteJid: '', allowNewLead: false };
  }
  const phoneJid = [
    primaryJid,
    key.remoteJidAlt,
    key.participantAlt,
    key.senderPn,
    key.participant,
  ].map(value => String(value || '')).find(jid => jid.endsWith('@s.whatsapp.net') && isPlausibleContactPhone(getPhoneFromWhatsAppJid(jid)));
  if (!phoneJid) return { phone: '', remoteJid: primaryJid, allowNewLead: false };
  return {
    phone: getPhoneFromWhatsAppJid(phoneJid),
    remoteJid: phoneJid,
    allowNewLead: primaryJid.endsWith('@s.whatsapp.net'),
  };
};

const mapBaileysMessageStatus = (status) => {
  const code = Number(status);
  if (code >= 4) return 'lida';
  if (code === 3) return 'entregue';
  if (code === 2) return 'enviada';
  if (code === 1) return 'pendente';
  if (code === 0) return 'erro';
  return 'enviada';
};

const getConsultantDisplayName = (user = {}) => String(user.nome || user.username || 'Consultor DRM').trim();

const formatWhatsAppPanelMessage = (text, consultantName) => [
  '*DRM ENERGIA SOLAR*',
  `Consultor: ${consultantName}`,
  '',
  text,
].join('\n');

const buildWhatsAppClaimNotice = (consultantName) => [
  '*DRM ENERGIA SOLAR*',
  '',
  `Olá! Meu nome é ${consultantName} e a partir de agora vou cuidar do seu atendimento. 😊`,
].join('\n');

const buildWhatsAppCloseNotice = (consultantName) => [
  '*DRM ENERGIA SOLAR*',
  '',
  `Seu atendimento foi finalizado por ${consultantName}.`,
  'Obrigado pelo contato! Se precisar de algo, é só chamar que iniciamos um novo atendimento. 🙏',
].join('\n');

const buildWhatsAppNewLeadNotice = ({ nome = '', telefone = '', mensagem = '', teste = false } = {}) => [
  '*DRM ENERGIA SOLAR*',
  '',
  teste ? 'Teste de aviso de lead novo.' : 'Chegou um lead novo aguardando atendimento.',
  '',
  `Cliente: ${nome || 'Sem nome'}`,
  `WhatsApp: ${formatLeadPhoneForNotice(telefone) || 'Sem telefone'}`,
  mensagem ? `Mensagem: ${String(mensagem).slice(0, 280)}` : '',
  '',
  'Abra o painel > WhatsApp e inicie o atendimento.',
].filter(Boolean).join('\n');

const buildWhatsAppLink = (phone, text) => {
  const normalizedPhone = normalizeWhatsAppPhone(phone) || DEFAULT_WHATSAPP_PHONE;
  const encoded = encodeURIComponent(text || 'Ola, vim do site e quero uma proposta de energia solar.');
  return `https://api.whatsapp.com/send?phone=${normalizedPhone}&text=${encoded}`;
};

const whatsappRuntime = {
  socket: null,
  starting: false,
  connected: false,
  acceptIncomingAfter: 0,
  qr: '',
  qrDataUrl: '',
  status: 'desconectado',
  message: 'WhatsApp ainda não conectado.',
  phone: '',
  lastUpdate: '',
};

const emitWhatsAppRuntimeStatus = () => {
  io.emit('whatsapp_runtime_status', getWhatsAppProviderStatus());
};

const buildWhatsAppQrDataUrl = async (qrText) => {
  const svg = await QRCode.toString(qrText, {
    type: 'svg',
    margin: 1,
    width: 360,
    errorCorrectionLevel: 'M',
  });
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

const getWhatsAppJid = (phone) => `${normalizeWhatsAppPhone(phone)}@s.whatsapp.net`;

const getBaileysMessageTimestampMs = (message = {}) => {
  const timestamp = message.messageTimestamp;
  if (!timestamp) return 0;
  if (typeof timestamp === 'number') return timestamp * 1000;
  if (typeof timestamp === 'bigint') return Number(timestamp) * 1000;
  if (typeof timestamp?.toNumber === 'function') return timestamp.toNumber() * 1000;
  if (typeof timestamp?.low === 'number') return timestamp.low * 1000;
  return 0;
};

const isSupportedIncomingWhatsAppJid = (remoteJid = '') => {
  if (isBlockedWhatsAppJid(remoteJid)) return false;
  return remoteJid.endsWith('@s.whatsapp.net') || remoteJid.endsWith('@lid') || remoteJid.endsWith('@pn');
};

const unwrapWhatsAppMessageContent = (content = {}) => {
  let current = content || {};
  for (let i = 0; i < 6; i += 1) {
    const next = current.ephemeralMessage?.message
      || current.viewOnceMessage?.message
      || current.viewOnceMessageV2?.message
      || current.viewOnceMessageV2Extension?.message
      || current.documentWithCaptionMessage?.message
      || current.editedMessage?.message
      || current.deviceSentMessage?.message
      || null;
    if (!next || next === current) break;
    current = next;
  }
  return current;
};

const extractIncomingWhatsAppText = (content = {}) => {
  const text = content.conversation
    || content.extendedTextMessage?.text
    || content.imageMessage?.caption
    || content.videoMessage?.caption
    || content.buttonsResponseMessage?.selectedDisplayText
    || content.listResponseMessage?.title
    || content.templateButtonReplyMessage?.selectedDisplayText
    || '';

  if (String(text).trim()) return String(text).trim();
  return '';
};

const getWhatsAppMediaInfo = (content = {}) => {
  const entries = [
    ['image', content.imageMessage],
    ['video', content.videoMessage],
    ['audio', content.audioMessage],
    ['document', content.documentMessage],
    ['sticker', content.stickerMessage],
  ];
  const entry = entries.find(([, value]) => value);
  if (!entry) return null;
  const [type, media] = entry;
  return {
    type,
    mimeType: media.mimetype || '',
    fileName: media.fileName || media.title || '',
    fileSize: Number(media.fileLength || media.fileLength?.low || 0) || null,
    caption: media.caption || '',
  };
};

const getMediaExtension = (mimeType = '', type = '') => {
  const clean = String(mimeType || '').split(';')[0].toLowerCase();
  const known = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'application/pdf': 'pdf',
  };
  if (known[clean]) return known[clean];
  const subtype = clean.split('/')[1];
  if (subtype && /^[a-z0-9.+-]+$/.test(subtype)) return subtype.replace('jpeg', 'jpg').replace(/\+/g, '-');
  return type || 'bin';
};

const buildWhatsAppMediaText = (mediaInfo) => {
  if (!mediaInfo) return '';
  const labels = {
    image: 'Imagem recebida',
    video: 'Vídeo recebido',
    audio: 'Áudio recebido',
    document: 'Documento recebido',
    sticker: 'Figurinha recebida',
  };
  const base = labels[mediaInfo.type] || 'Mídia recebida';
  return mediaInfo.caption ? `${base}: ${mediaInfo.caption}` : base;
};

const saveIncomingWhatsAppMedia = async (message, mediaInfo) => {
  if (!message || !mediaInfo) return null;
  try {
    fs.mkdirSync(WHATSAPP_MEDIA_DIR, { recursive: true });
    const normalizedMessage = {
      ...message,
      message: unwrapWhatsAppMessageContent(message.message || {}),
    };
    const buffer = await downloadMediaMessage(
      normalizedMessage,
      'buffer',
      {},
      {
        logger: pino({ level: 'silent' }),
        reuploadRequest: whatsappRuntime.socket?.updateMediaMessage?.bind(whatsappRuntime.socket),
      }
    );
    if (!buffer?.length) return null;
    const ext = getMediaExtension(mediaInfo.mimeType, mediaInfo.type);
    const fileName = `${Date.now()}-${crypto.randomBytes(12).toString('hex')}.${ext}`;
    const absolutePath = path.join(WHATSAPP_MEDIA_DIR, fileName);
    await fs.promises.writeFile(absolutePath, buffer);
    return {
      mediaUrl: `/api/whatsapp/media/${fileName}`,
      fileSize: buffer.length,
    };
  } catch (error) {
    console.error('Erro ao baixar mídia do WhatsApp:', error.message || error);
    return null;
  }
};

const handleIncomingWhatsAppWebMessage = async (message) => {
  try {
    const { phone, remoteJid, allowNewLead } = getIncomingContactAddress(message.key || {});
    if (message.key?.fromMe || !isSupportedIncomingWhatsAppJid(message.key?.remoteJid || remoteJid) || !phone) {
      return;
    }

    const timestampMs = getBaileysMessageTimestampMs(message);
    if (whatsappRuntime.acceptIncomingAfter && timestampMs && timestampMs < whatsappRuntime.acceptIncomingAfter) {
      return;
    }

    if (!phone || !isPlausibleContactPhone(phone)) return;

    const content = unwrapWhatsAppMessageContent(message.message || {});
    const mediaInfo = getWhatsAppMediaInfo(content);
    const mediaFile = await saveIncomingWhatsAppMedia(message, mediaInfo);
    const text = extractIncomingWhatsAppText(content) || buildWhatsAppMediaText(mediaInfo);
    if (!text) return;

    const phoneVariants = whatsAppPhoneVariants(phone);
    const savedWhatsAppContact = isSavedWhatsAppContact(phoneVariants);
    const knownBusinessPhone = await isKnownBusinessPhone(phoneVariants);
    const conversationPlaceholders = phoneVariants.map(() => '?').join(', ');
    const previousConversation = await db.get(
      `SELECT * FROM whatsapp_conversations WHERE clienteTelefone IN (${conversationPlaceholders}) ORDER BY updatedAt DESC LIMIT 1`,
      ...phoneVariants
    );
    const leadPlaceholders = phoneVariants.map(() => '?').join(', ');
    let lead = await db.get(`SELECT * FROM leads WHERE telefone IN (${leadPlaceholders})`, ...phoneVariants);
    const rescuedUnknownLidLead = !allowNewLead
      && !previousConversation
      && !lead
      && !savedWhatsAppContact
      && !knownBusinessPhone;
    const effectiveAllowNewLead = !savedWhatsAppContact
      && !knownBusinessPhone
      && (allowNewLead || rescuedUnknownLidLead);
    // Grupo nunca entra aqui porque é bloqueado antes. Além disso, contatos
    // salvos e números já conhecidos no sistema não podem disparar lead novo
    // nem consumir o rodízio dos consultores.
    if (!effectiveAllowNewLead && !previousConversation) return;

    let owner = previousConversation?.assignedUserId
      ? { id: previousConversation.assignedUserId, nome: previousConversation.assignedUserName }
      : null;
    let createdLeadNow = false;

    if (!lead && effectiveAllowNewLead) {
      owner = await getNextLeadOwner();
      const result = await db.run(
        `INSERT INTO leads
          (nome, telefone, email, cidade, origem, status, dataCadastro, assignedUserId, assignedUserName, observacoes, tipoCadastro, criadoPorId, criadoPorNome)
         VALUES (?, ?, '', '', 'WhatsApp QR', 'Novo', ?, ?, ?, 'Mensagem recebida pelo WhatsApp conectado via QR Code.', 'site', NULL, 'WhatsApp')`,
        message.pushName || phone,
        phone,
        new Date().toISOString().split('T')[0],
        owner.id,
        owner.nome
      );
      lead = await db.get('SELECT * FROM leads WHERE id = ?', result.lastID);
      createdLeadNow = true;
      io.emit('novo_lead', lead);
    } else if (lead?.assignedUserId) {
      owner = { id: lead.assignedUserId, nome: lead.assignedUserName };
    } else if (lead) {
      owner = await getNextLeadOwner();
      await db.run('UPDATE leads SET assignedUserId = ?, assignedUserName = ? WHERE id = ?', owner.id, owner.nome, lead.id);
      lead = await db.get('SELECT * FROM leads WHERE id = ?', lead.id);
      io.emit('novo_lead', lead);
    }

    const shouldNotifyNewLead = createdLeadNow;
    const conversation = await upsertWhatsAppConversation({
      leadId: lead?.id || previousConversation?.leadId || null,
      nome: lead?.nome || previousConversation?.clienteNome || message.pushName || phone,
      telefone: phone,
      remoteJid,
      assignedUserId: owner?.id || lead?.assignedUserId || null,
      assignedUserName: owner?.nome || lead?.assignedUserName || '',
      status: 'Aguardando atendimento',
    });
    const savedMessage = await createWhatsAppMessage({
      conversationId: conversation.id,
      direction: 'incoming',
      messageType: mediaInfo?.type || 'text',
      text,
      mediaUrl: mediaFile?.mediaUrl || '',
      mimeType: mediaInfo?.mimeType || '',
      fileName: mediaInfo?.fileName || '',
      fileSize: mediaFile?.fileSize || mediaInfo?.fileSize || null,
      providerMessageId: message.key?.id || '',
      status: 'recebida',
      rawPayload: message,
    });
    const updatedConversation = await getWhatsAppConversationById(conversation.id);
    io.emit('whatsapp_message_created', { message: savedMessage, conversation: updatedConversation });
    io.emit('whatsapp_conversation_updated', updatedConversation);
    if (shouldNotifyNewLead && updatedConversation?.status === 'Aguardando atendimento') {
      try {
        const notificationResults = await notifyConsultantsAboutNewWhatsAppLead({ conversation: updatedConversation, text });
        console.log('[WhatsApp] Aviso de lead novo enviado:', JSON.stringify({
          conversationId: updatedConversation.id,
          leadId: updatedConversation.leadId,
          assignedUserId: updatedConversation.assignedUserId,
          results: notificationResults,
        }));
      } catch (error) {
        console.error('Erro ao enviar avisos de lead novo:', error);
      }
      io.emit('whatsapp_new_lead_waiting', { conversation: updatedConversation });
    }
  } catch (error) {
    console.error('Erro ao processar mensagem WhatsApp QR:', error);
  }
};

const startWhatsAppQrSession = async ({ force = false } = {}) => {
  if (whatsappRuntime.starting) return getWhatsAppProviderStatus();
  if (whatsappRuntime.socket && whatsappRuntime.connected) return getWhatsAppProviderStatus();
  if (whatsappRuntime.socket && !force) return getWhatsAppProviderStatus();

  whatsappRuntime.starting = true;
  whatsappRuntime.status = 'conectando';
  whatsappRuntime.message = 'Preparando sessão do WhatsApp. Aguarde o QR Code aparecer.';
  whatsappRuntime.lastUpdate = new Date().toISOString();
  emitWhatsAppRuntimeStatus();

  try {
    if (force && whatsappRuntime.socket && !whatsappRuntime.connected) {
      try {
        whatsappRuntime.socket.end?.();
        whatsappRuntime.socket.ws?.close?.();
      } catch {}
      whatsappRuntime.socket = null;
      whatsappRuntime.connected = false; // evita estado fantasma (connected sem socket)
    }

    fs.mkdirSync(WHATSAPP_AUTH_DIR, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(WHATSAPP_AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();
    const socket = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      browser: ['DRM Energia Solar', 'Chrome', '1.0.0'],
      logger: pino({ level: 'silent' }),
      syncFullHistory: true,
      markOnlineOnConnect: false,
    });

    whatsappRuntime.socket = socket;
    socket.ev.on('creds.update', saveCreds);
    socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        whatsappRuntime.qr = qr;
        whatsappRuntime.qrDataUrl = await buildWhatsAppQrDataUrl(qr);
        whatsappRuntime.connected = false;
        whatsappRuntime.status = 'aguardando_qrcode';
        whatsappRuntime.message = 'Escaneie o QR Code com o WhatsApp do número oficial.';
        whatsappRuntime.lastUpdate = new Date().toISOString();
        emitWhatsAppRuntimeStatus();
      }

      if (connection === 'open') {
        whatsappRuntime.acceptIncomingAfter = Date.now() - 60000;
        whatsappRuntime.connected = true;
        whatsappRuntime.qr = '';
        whatsappRuntime.qrDataUrl = '';
        whatsappRuntime.status = 'conectado';
        whatsappRuntime.phone = normalizeWhatsAppPhone(socket.user?.id?.split(':')[0] || socket.user?.id?.split('@')[0] || '');
        whatsappRuntime.message = 'WhatsApp conectado. Os vendedores já podem atender pelo sistema.';
        whatsappRuntime.lastUpdate = new Date().toISOString();
        emitWhatsAppRuntimeStatus();
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        whatsappRuntime.connected = false;
        whatsappRuntime.socket = null;
        whatsappRuntime.status = shouldReconnect ? 'reconectando' : 'desconectado';
        whatsappRuntime.message = shouldReconnect
          ? 'Conexão caiu. Tentando reconectar automaticamente.'
          : 'Sessão desconectada. Gere um novo QR Code para conectar.';
        whatsappRuntime.lastUpdate = new Date().toISOString();
        emitWhatsAppRuntimeStatus();
        if (shouldReconnect) {
          setTimeout(() => startWhatsAppQrSession().catch(error => console.error('Erro ao reconectar WhatsApp:', error)), 2500);
        }
      }
    });

    socket.ev.on('messages.upsert', async ({ messages = [], type }) => {
      if (type !== 'notify') return;
      for (const message of messages) {
        await handleIncomingWhatsAppWebMessage(message);
      }
    });

    socket.ev.on('contacts.upsert', (contacts = []) => {
      rememberWhatsAppContacts(contacts);
    });

    socket.ev.on('contacts.update', (contacts = []) => {
      rememberWhatsAppContacts(contacts);
    });

    socket.ev.on('messaging-history.set', ({ contacts = [] } = {}) => {
      rememberWhatsAppContacts(contacts);
    });

    socket.ev.on('messages.update', async (updates = []) => {
      for (const update of updates) {
        const providerMessageId = update.key?.id || '';
        if (!providerMessageId || update.update?.status === undefined) continue;
        try {
          const status = mapBaileysMessageStatus(update.update.status);
          await db.run('UPDATE whatsapp_messages SET status = ? WHERE providerMessageId = ?', status, providerMessageId);
          const message = await db.get('SELECT * FROM whatsapp_messages WHERE providerMessageId = ?', providerMessageId);
          if (message) {
            const conversation = await getWhatsAppConversationById(message.conversationId);
            io.emit('whatsapp_message_status_updated', { message, conversation });
          }
        } catch (error) {
          console.error('Erro ao atualizar status da mensagem WhatsApp:', error);
        }
      }
    });
  } catch (error) {
    console.error('Erro ao iniciar WhatsApp QR:', error);
    whatsappRuntime.connected = false;
    whatsappRuntime.status = 'erro';
    whatsappRuntime.message = error.message || 'Não foi possível iniciar a conexão por QR Code.';
    whatsappRuntime.lastUpdate = new Date().toISOString();
  } finally {
    whatsappRuntime.starting = false;
    emitWhatsAppRuntimeStatus();
  }

  return getWhatsAppProviderStatus();
};

const disconnectWhatsAppQrSession = async () => {
  try {
    if (whatsappRuntime.socket) {
      await whatsappRuntime.socket.logout().catch(() => {});
      whatsappRuntime.socket.end?.();
      whatsappRuntime.socket.ws?.close?.();
    }
  } catch (error) {
    console.error('Erro ao desconectar WhatsApp:', error);
  }
  whatsappRuntime.socket = null;
  whatsappRuntime.connected = false;
  whatsappRuntime.qr = '';
  whatsappRuntime.qrDataUrl = '';
  whatsappRuntime.status = 'desconectado';
  whatsappRuntime.message = 'WhatsApp desconectado. Clique em conectar para gerar novo QR Code.';
  whatsappRuntime.phone = '';
  whatsappRuntime.lastUpdate = new Date().toISOString();
  whatsappKnownContacts.clear();
  if (whatsappContactsCacheSaveTimer) {
    clearTimeout(whatsappContactsCacheSaveTimer);
    whatsappContactsCacheSaveTimer = null;
  }
  fs.rmSync(WHATSAPP_CONTACTS_CACHE_FILE, { force: true });
  fs.rmSync(WHATSAPP_AUTH_DIR, { recursive: true, force: true });
  emitWhatsAppRuntimeStatus();
  return getWhatsAppProviderStatus();
};

const getWhatsAppProviderStatus = () => {
  const token = process.env.WHATSAPP_CLOUD_TOKEN || process.env.META_WHATSAPP_TOKEN || '';
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.META_WHATSAPP_PHONE_NUMBER_ID || '';
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || process.env.META_WHATSAPP_VERIFY_TOKEN || '';
  const businessPhone = normalizeWhatsAppPhone(process.env.WHATSAPP_BUSINESS_PHONE || process.env.META_WHATSAPP_BUSINESS_PHONE || '');
  // Só está realmente conectado se houver socket ativo (evita estado fantasma).
  const reallyConnected = Boolean(whatsappRuntime.connected && whatsappRuntime.socket);
  return {
    mode: 'qrcode',
    connected: reallyConnected,
    qrConnected: reallyConnected,
    qr: whatsappRuntime.qrDataUrl,
    rawQr: whatsappRuntime.qr,
    status: whatsappRuntime.status,
    message: whatsappRuntime.message,
    phone: whatsappRuntime.phone || businessPhone,
    lastUpdate: whatsappRuntime.lastUpdate,
    starting: whatsappRuntime.starting,
    cloudConnected: Boolean(token && phoneNumberId),
    webhookReady: Boolean(verifyToken),
    businessPhone,
    phoneNumberId: phoneNumberId ? `${phoneNumberId.slice(0, 4)}...${phoneNumberId.slice(-4)}` : '',
    missing: [
      !token ? 'WHATSAPP_CLOUD_TOKEN' : null,
      !phoneNumberId ? 'WHATSAPP_PHONE_NUMBER_ID' : null,
      !verifyToken ? 'WHATSAPP_VERIFY_TOKEN' : null,
    ].filter(Boolean),
  };
};

const canAccessWhatsAppConversation = (user, conversation = {}) => (
  isMasterAdminUser(user)
    || Number(conversation.assignedUserId) === Number(user?.id)
);

const getWhatsAppConversationById = async (id) => db.get('SELECT * FROM whatsapp_conversations WHERE id = ?', id);

const upsertWhatsAppConversation = async ({
  leadId = null,
  nome = '',
  telefone = '',
  remoteJid = '',
  assignedUserId = null,
  assignedUserName = '',
  status = 'Aguardando atendimento',
} = {}) => {
  const phone = normalizeWhatsAppPhone(telefone);
  if (!phone) return null;

  const phoneVariants = whatsAppPhoneVariants(phone);
  const placeholders = phoneVariants.map(() => '?').join(', ');
  let conversation = await db.get(
    `SELECT * FROM whatsapp_conversations WHERE clienteTelefone IN (${placeholders}) ORDER BY updatedAt DESC LIMIT 1`,
    ...phoneVariants
  );
  const now = new Date().toISOString();
  if (conversation) {
    const nextLeadId = conversation.leadId || leadId || null;
    // 'Arquivada' = "não é lead": permanece oculta mesmo que o contato mande
    // novas mensagens. Apenas 'Finalizada' (atendimento concluído) pode reabrir.
    const shouldReopen = conversation.status === 'Finalizada' && status === 'Aguardando atendimento';
    const nextOwnerId = shouldReopen ? (assignedUserId || null) : (conversation.assignedUserId || assignedUserId || null);
    const nextOwnerName = shouldReopen ? (assignedUserName || null) : (conversation.assignedUserName || assignedUserName || null);
    const nextStatus = shouldReopen ? 'Aguardando atendimento' : (conversation.status || status);
    await db.run(
      `UPDATE whatsapp_conversations
       SET leadId = ?, clienteNome = ?, remoteJid = COALESCE(NULLIF(?, ''), remoteJid), assignedUserId = ?, assignedUserName = ?, status = ?, updatedAt = ?
       WHERE id = ?`,
      nextLeadId,
      conversation.clienteNome || nome || phone,
      normalizeWhatsAppRemoteJid(remoteJid),
      nextOwnerId,
      nextOwnerName,
      nextStatus,
      now,
      conversation.id
    );
    return getWhatsAppConversationById(conversation.id);
  }

  const result = await db.run(
    `INSERT INTO whatsapp_conversations
      (leadId, clienteNome, clienteTelefone, remoteJid, assignedUserId, assignedUserName, status, lastMessage, lastMessageAt, unreadCount, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, '', ?, 0, ?, ?)`,
    leadId,
    nome || phone,
    phone,
    normalizeWhatsAppRemoteJid(remoteJid || phone),
    assignedUserId,
    assignedUserName,
    status,
    now,
    now,
    now
  );
  return getWhatsAppConversationById(result.lastID);
};

const createWhatsAppMessage = async ({
  conversationId,
  direction = 'incoming',
  messageType = 'text',
  text = '',
  mediaUrl = '',
  mimeType = '',
  fileName = '',
  fileSize = null,
  providerMessageId = '',
  status = 'recebida',
  senderId = null,
  senderName = '',
  rawPayload = null,
} = {}) => {
  const now = new Date().toISOString();
  const result = await db.run(
    `INSERT INTO whatsapp_messages
      (conversationId, direction, messageType, text, mediaUrl, mimeType, fileName, fileSize, providerMessageId, status, senderId, senderName, createdAt, rawPayload)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    conversationId,
    direction,
    messageType,
    text,
    mediaUrl,
    mimeType,
    fileName,
    fileSize,
    providerMessageId,
    status,
    senderId,
    senderName,
    now,
    rawPayload ? JSON.stringify(rawPayload) : null
  );
  await db.run(
    `UPDATE whatsapp_conversations
     SET lastMessage = ?, lastMessageAt = ?, unreadCount = unreadCount + ?, updatedAt = ?
     WHERE id = ?`,
    text,
    now,
    direction === 'incoming' ? 1 : 0,
    now,
    conversationId
  );
  return db.get('SELECT * FROM whatsapp_messages WHERE id = ?', result.lastID);
};

const sendAndStoreWhatsAppMessage = async ({ conversation, text, user, system = false }) => {
  const consultantName = getConsultantDisplayName(user);
  const outboundText = system ? text : formatWhatsAppPanelMessage(text, consultantName);
  const providerResult = await sendWhatsAppTextMessage(conversation.clienteTelefone, outboundText, {
    remoteJid: conversation.remoteJid,
  });
  const message = await createWhatsAppMessage({
    conversationId: conversation.id,
    direction: 'outgoing',
    text: outboundText,
    providerMessageId: providerResult.providerMessageId,
    status: providerResult.status,
    senderId: user?.id || null,
    senderName: system ? 'DRM Energia Solar' : consultantName,
    rawPayload: providerResult.payload || providerResult,
  });
  const updatedConversation = await getWhatsAppConversationById(conversation.id);
  io.emit('whatsapp_message_created', { message, conversation: updatedConversation });
  io.emit('whatsapp_conversation_updated', updatedConversation);
  return { message, conversation: updatedConversation, provider: providerResult };
};

const resolveWhatsAppJid = async (socket, rawJid) => {
  // Para conversas existentes (remoteJid já veio do WhatsApp), confia no JID.
  if (!rawJid || rawJid.includes('@g.us')) return rawJid;

  const phone = rawJid.split('@')[0].split(':')[0];
  if (!phone) return rawJid;
  const expectedVariants = new Set(whatsAppPhoneVariants(phone));

  try {
    // Pergunta ao servidor do WhatsApp qual é o JID canônico real do número.
    // Resolve a ambiguidade do 9º dígito em números brasileiros.
    const results = await socket.onWhatsApp(phone);
    const match = Array.isArray(results) ? results.find(r => r?.exists && r?.jid) : null;
    if (match?.jid) {
      const matchedPhone = normalizeWhatsAppPhone(getPhoneFromWhatsAppJid(match.jid));
      if (matchedPhone && expectedVariants.size && !expectedVariants.has(matchedPhone)) {
        console.warn(`[WhatsApp] Ignorando JID canônico divergente para ${rawJid}: ${match.jid}`);
        return rawJid;
      }
      if (match.jid !== rawJid) {
        console.log(`[WhatsApp] JID canônico resolvido: ${rawJid} -> ${match.jid}`);
      }
      return match.jid;
    }
    console.warn(`[WhatsApp] Número ${phone} NÃO existe no WhatsApp (onWhatsApp retornou vazio).`);
  } catch (error) {
    console.warn(`[WhatsApp] Falha ao resolver JID via onWhatsApp para ${phone}:`, error?.message || error);
  }
  return rawJid;
};

const sendWhatsAppTextMessage = async (to, text, options = {}) => {
  // Auto-recuperação: se a sessão caiu no estado fantasma (sem socket), tenta
  // reconectar uma vez antes de desistir.
  if (!whatsappRuntime.socket && !whatsappRuntime.starting) {
    try {
      await startWhatsAppQrSession({ force: true });
      await new Promise(resolve => setTimeout(resolve, 4000));
    } catch (error) {
      console.error('Falha ao reconectar WhatsApp automaticamente:', error?.message || error);
    }
  }

  if (whatsappRuntime.connected && whatsappRuntime.socket) {
    const rawJid = normalizeWhatsAppRemoteJid(options.remoteJid || to);
    if (!rawJid) {
      throw new Error('Contato do WhatsApp inválido para envio.');
    }
    const jid = (options.remoteJid || options.exactPhone)
      ? rawJid
      : await resolveWhatsAppJid(whatsappRuntime.socket, rawJid);
    const result = await whatsappRuntime.socket.sendMessage(jid, { text });
    return {
      configured: true,
      mode: 'qrcode',
      status: 'enviada',
      providerMessageId: result?.key?.id || '',
      payload: result,
    };
  }

  const token = process.env.WHATSAPP_CLOUD_TOKEN || process.env.META_WHATSAPP_TOKEN || '';
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.META_WHATSAPP_PHONE_NUMBER_ID || '';
  if (!token || !phoneNumberId) {
    const error = new Error('WhatsApp não conectado. Abra o modal de conexão e escaneie o QR Code antes de enviar.');
    error.statusCode = 409;
    throw error;
  }

  const response = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizeWhatsAppPhone(to),
      type: 'text',
      text: { preview_url: false, body: text },
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || 'Falha ao enviar mensagem pela API do WhatsApp.';
    const error = new Error(message);
    error.payload = data;
    throw error;
  }
  return {
    configured: true,
    status: 'enviada',
    providerMessageId: data?.messages?.[0]?.id || '',
    payload: data,
  };
};

const sendWhatsAppAudioMessage = async (to, media, mimeType = 'audio/mp4', options = {}) => {
  if (!whatsappRuntime.socket && !whatsappRuntime.starting) {
    await startWhatsAppQrSession({ force: true });
    await new Promise(resolve => setTimeout(resolve, 4000));
  }
  if (!whatsappRuntime.connected || !whatsappRuntime.socket) {
    const error = new Error('WhatsApp não conectado. Conecte pelo QR Code antes de enviar áudio.');
    error.statusCode = 409;
    throw error;
  }
  const rawJid = normalizeWhatsAppRemoteJid(options.remoteJid || to);
  if (!rawJid) throw new Error('Contato do WhatsApp inválido para envio.');
  const jid = options.remoteJid ? rawJid : await resolveWhatsAppJid(whatsappRuntime.socket, rawJid);
  const result = await whatsappRuntime.socket.sendMessage(jid, {
    audio: media,
    mimetype: mimeType,
    ptt: false,
  });
  return {
    configured: true,
    mode: 'qrcode',
    status: 'enviada',
    providerMessageId: result?.key?.id || '',
    payload: result,
  };
};

const convertAudioToWhatsAppVoice = async (buffer, inputMimeType = 'audio/webm') => {
  if (!ffmpegPath) throw new Error('Conversor de áudio indisponível no servidor.');
  fs.mkdirSync(WHATSAPP_MEDIA_DIR, { recursive: true });
  const token = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
  const inputPath = path.join(WHATSAPP_MEDIA_DIR, `${token}.${getMediaExtension(inputMimeType, 'webm')}`);
  const outputPath = path.join(WHATSAPP_MEDIA_DIR, `${token}.m4a`);
  try {
    await fs.promises.writeFile(inputPath, buffer);
    await execFileAsync(ffmpegPath, [
      '-y',
      '-i', inputPath,
      '-vn',
      '-c:a', 'aac',
      '-b:a', '64k',
      '-ar', '44100',
      '-ac', '1',
      '-movflags', '+faststart',
      outputPath,
    ], { timeout: 30000, windowsHide: true });
    return {
      buffer: await fs.promises.readFile(outputPath),
      mimeType: 'audio/mp4',
      fileName: path.basename(outputPath),
      absolutePath: outputPath,
    };
  } finally {
    await fs.promises.rm(inputPath, { force: true }).catch(() => {});
  }
};

const getNewLeadNotificationRecipients = async (conversation = {}, options = {}) => {
  const recipients = [];
  const seenPhones = new Set();
  const pushRecipient = (user, roleLabel) => {
    const phone = normalizeWhatsAppPhone(user?.whatsapp);
    if (!phone || seenPhones.has(phone)) return;
    seenPhones.add(phone);
    recipients.push({
      phone,
      nome: user?.nome || user?.username || roleLabel || 'Equipe DRM',
      role: roleLabel || user?.role || '',
    });
  };

  let assignedUser = null;
  if (conversation?.assignedUserId) {
    assignedUser = await db.get('SELECT id, nome, username, whatsapp, role FROM usuarios WHERE id = ? AND active = 1', conversation.assignedUserId);
  } else if (options?.assignedUsername) {
    assignedUser = await db.get('SELECT id, nome, username, whatsapp, role FROM usuarios WHERE username = ? AND active = 1', options.assignedUsername);
  }
  if (!assignedUser && options?.fallbackToRoundRobin) {
    assignedUser = await getNextLeadOwner();
  }
  if (assignedUser) pushRecipient(assignedUser, 'consultor');

  const masterUser = await db.get('SELECT id, nome, username, whatsapp, role FROM usuarios WHERE lower(username) = ? AND active = 1', MASTER_ADMIN_USERNAME);
  if (masterUser) pushRecipient(masterUser, 'master');

  return recipients;
};

const notifyConsultantsAboutNewWhatsAppLead = async ({ conversation, text = '', test = false } = {}) => {
  const notice = buildWhatsAppNewLeadNotice({
    nome: conversation?.clienteNome,
    telefone: conversation?.clienteTelefone,
    mensagem: text,
    teste: test,
  });
  const recipients = await getNewLeadNotificationRecipients(conversation, {
    assignedUsername: conversation?.assignedUsername,
    fallbackToRoundRobin: test,
  });
  if (!recipients.length) {
    throw new Error('Nenhum destinatário válido para o aviso de lead novo.');
  }
  const results = await Promise.allSettled(
    recipients.map(item => sendWhatsAppTextMessage(item.phone, notice))
  );
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(`Erro ao avisar ${recipients[index]?.phone} sobre lead novo:`, result.reason?.message || result.reason);
    }
  });
  return results.map((result, index) => ({
    phone: recipients[index]?.phone,
    nome: recipients[index]?.nome || '',
    role: recipients[index]?.role || '',
    ok: result.status === 'fulfilled',
    status: result.status === 'fulfilled' ? result.value?.status : 'erro',
    error: result.status === 'rejected' ? result.reason?.message || 'Falha ao enviar aviso.' : '',
  }));
};

// Aviso ao consultor responsável quando o cliente em atendimento responde.
// Throttle por conversa para não enviar um aviso a cada mensagem de uma rajada.
const consultantReplyNotifiedAt = new Map();
const CONSULTANT_REPLY_NOTIFY_THROTTLE_MS = 2 * 60 * 1000;

const buildConsultantReplyNotice = ({ consultantName, clienteNome, telefone, mensagem }) => [
  '*DRM ENERGIA SOLAR*',
  '',
  `Olá, ${consultantName}! O cliente que você está atendendo respondeu.`,
  '',
  `Cliente: ${clienteNome || 'Sem nome'}`,
  `WhatsApp: ${telefone || '-'}`,
  mensagem ? `Mensagem: ${String(mensagem).slice(0, 280)}` : '',
  '',
  'Abra o painel > WhatsApp para continuar o atendimento.',
].filter(Boolean).join('\n');

const buildConsultantTransferNotice = ({ consultantName, clienteNome, telefone, transferredBy }) => [
  '*DRM ENERGIA SOLAR*',
  '',
  `Olá, ${consultantName}! Você recebeu um novo lead.`,
  '',
  `Cliente: ${clienteNome || 'Sem nome'}`,
  `WhatsApp: ${telefone || '-'}`,
  `Transferido por: ${transferredBy || 'Deivson DRM'}`,
  '',
  'Abra o painel > WhatsApp para iniciar o atendimento.',
].filter(Boolean).join('\n');

const notifyConsultantAboutTransfer = async ({ consultant, conversation, transferredBy }) => {
  const consultantPhone = normalizeWhatsAppPhone(consultant?.whatsapp);
  const businessPhone = normalizeWhatsAppPhone(whatsappRuntime.phone || DEFAULT_WHATSAPP_PHONE);
  if (!consultantPhone || consultantPhone === businessPhone) return { sent: false, reason: 'Número privado não disponível.' };

  const result = await sendWhatsAppTextMessage(consultantPhone, buildConsultantTransferNotice({
    consultantName: getConsultantDisplayName(consultant),
    clienteNome: conversation?.clienteNome,
    telefone: conversation?.clienteTelefone,
    transferredBy,
  }));
  return { sent: true, result };
};

const sendConsultantReplyEmail = async ({ to, consultantName, clienteNome, telefone, mensagem }) => {
  const from = process.env.SMTP_FROM || `DRM ENERGIA SOLAR <${process.env.SMTP_USER}>`;
  const safeName = escapeHtml(consultantName || 'consultor');
  const safeCliente = escapeHtml(clienteNome || 'Cliente');
  const safeTel = escapeHtml(telefone || '-');
  const safeMsg = escapeHtml(String(mensagem || '').slice(0, 500));

  await getMailTransporter().sendMail({
    from,
    to,
    subject: `Cliente respondeu: ${clienteNome || telefone || 'atendimento WhatsApp'}`,
    text: [
      `Olá, ${consultantName}.`,
      '',
      'O cliente que você está atendendo respondeu pelo WhatsApp.',
      '',
      `Cliente: ${clienteNome || 'Sem nome'}`,
      `WhatsApp: ${telefone || '-'}`,
      mensagem ? `Mensagem: ${String(mensagem).slice(0, 500)}` : '',
      '',
      'Abra o painel > WhatsApp para continuar o atendimento.',
      '',
      'DRM ENERGIA SOLAR',
    ].filter(Boolean).join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111827">
        <h2 style="color:#f97316;margin-bottom:8px">DRM ENERGIA SOLAR</h2>
        <p>Olá, <strong>${safeName}</strong>.</p>
        <p>O cliente que você está atendendo respondeu pelo WhatsApp:</p>
        <p style="margin:6px 0"><strong>Cliente:</strong> ${safeCliente}<br/><strong>WhatsApp:</strong> ${safeTel}</p>
        ${safeMsg ? `<blockquote style="margin:16px 0;padding:12px 16px;background:#f8fafc;border-left:4px solid #f97316;color:#334155">${safeMsg}</blockquote>` : ''}
        <p>Abra o painel &gt; WhatsApp para continuar o atendimento.</p>
      </div>
    `,
  });
};

const notifyAssignedConsultantAboutReply = async ({ conversation, text = '' }) => {
  if (!conversation?.assignedUserId) return;

  const last = consultantReplyNotifiedAt.get(conversation.id) || 0;
  if (Date.now() - last < CONSULTANT_REPLY_NOTIFY_THROTTLE_MS) return;
  consultantReplyNotifiedAt.set(conversation.id, Date.now());

  const consultant = await db.get('SELECT * FROM usuarios WHERE id = ? AND active = 1', conversation.assignedUserId);
  if (!consultant) return;

  const consultantName = getConsultantDisplayName(consultant);
  const payload = {
    consultantName,
    clienteNome: conversation.clienteNome,
    telefone: conversation.clienteTelefone,
    mensagem: text,
  };

  // WhatsApp privado do consultor — evita enviar para o próprio número conectado.
  const consultantPhone = normalizeWhatsAppPhone(consultant.whatsapp);
  const businessPhone = normalizeWhatsAppPhone(whatsappRuntime.phone || DEFAULT_WHATSAPP_PHONE);
  if (consultantPhone && consultantPhone !== businessPhone) {
    try {
      await sendWhatsAppTextMessage(consultantPhone, buildConsultantReplyNotice(payload));
    } catch (error) {
      console.error(`Erro ao avisar consultor ${consultant.username} por WhatsApp:`, error?.message || error);
    }
  }

  // Aviso por e-mail desativado a pedido — o consultor é notificado só pelo WhatsApp.
};

const getAppUrl = () => String(process.env.APP_URL || 'http://127.0.0.1:5173').replace(/\/+$/, '');

const hashResetToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const createResetToken = () => crypto.randomBytes(32).toString('hex');

const normalizeEmail = (value = '') => String(value || '').trim().toLowerCase();
const isLocalDevelopment = process.env.NODE_ENV !== 'production';

const isRealEmail = (value = '') => {
  const email = normalizeEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !email.endsWith('@drm.local');
};

const hasVerifiedEmail = (user = {}) => isRealEmail(user.email) && Boolean(user.emailVerified);

// Verificação de e-mail é exigida apenas para clientes que se cadastram sozinhos.
// Equipe interna é provisionada pelo admin (pode usar e-mail @drm.local) e não deve
// ficar bloqueada do painel — pode verificar depois para habilitar reset de senha.
const isInternalStaffUser = (user = {}) => user.userType === 'interno'
  || ['ADM', 'CONSULTOR', 'EQUIPE_TECNICA_COMERCIAL'].includes(user.role);

const requiresEmailVerification = (user = {}) => {
  if (isLocalDevelopment || hasVerifiedEmail(user)) return false;
  const email = normalizeEmail(user.email);
  const hasLocalProvisionedEmail = email.endsWith('@drm.local');
  if (isInternalStaffUser(user)) return isRealEmail(email) && !hasLocalProvisionedEmail;
  return true;
};
const shouldForcePasswordChange = (user = {}) => !isLocalDevelopment && Boolean(user.mustChangePassword);

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

const COMMUNICATION_TEMPLATES = [
  {
    id: 'portal-welcome',
    audience: 'clientes_verificados',
    title: 'Boas-vindas ao Portal do Cliente',
    subject: 'Seu Portal do Cliente DRM Energia Solar está disponível',
    heading: 'Seu projeto solar ganhou uma nova experiência.',
    message: 'Acompanhe contrato, prazos, entrega, instalação, Equatorial, documentos, notificações e atendimento em um único lugar.',
    ctaLabel: 'Acessar meu portal',
    ctaUrl: '/portal-cliente',
  },
  {
    id: 'project-update',
    audience: 'clientes_verificados',
    title: 'Atualização importante do projeto',
    subject: 'Temos uma atualização sobre seu projeto solar',
    heading: 'Novidades no seu projeto DRM.',
    message: 'Nossa equipe atualizou informações importantes do seu projeto. Acesse o portal para acompanhar os detalhes e os próximos passos.',
    ctaLabel: 'Ver atualização',
    ctaUrl: '/portal-cliente',
  },
  {
    id: 'old-client-invite',
    audience: 'clientes_antigos',
    title: 'Convite para clientes antigos',
    subject: 'A DRM preparou uma novidade para você',
    heading: 'Agora ficou ainda mais fácil acompanhar a DRM.',
    message: 'Criamos uma experiência digital completa para aproximar você da nossa equipe e reunir informações importantes sobre energia solar.',
    ctaLabel: 'Conhecer o Portal DRM',
    ctaUrl: '/portal-cliente',
  },
  {
    id: 'team-alert',
    audience: 'equipe',
    title: 'Comunicado para equipe DRM',
    subject: 'Comunicado interno DRM Energia Solar',
    heading: 'Informação importante para a equipe.',
    message: 'Confira este comunicado e mantenha seus atendimentos e atividades atualizados no Sistema DRM.',
    ctaLabel: 'Acessar Sistema DRM',
    ctaUrl: '/acesso?tipo=equipe',
  },
  {
    id: 'lead-followup',
    audience: 'leads',
    title: 'Retomada de contato com interessados',
    subject: 'Sua economia com energia solar pode começar agora',
    heading: 'Vamos transformar sua conta de energia?',
    message: 'A equipe DRM Energia Solar está pronta para apresentar uma solução personalizada e acompanhar você em todas as etapas.',
    ctaLabel: 'Falar com a DRM',
    ctaUrl: '/',
  },
];

const buildCommunicationEmail = ({ name, heading, message, ctaLabel, ctaUrl }) => {
  const url = ctaUrl?.startsWith('http') ? ctaUrl : `${getAppUrl()}${ctaUrl || ''}`;
  return `
    <div style="margin:0;background:#eef2f6;padding:24px 10px;font-family:Arial,sans-serif;color:#111827">
      <div style="max-width:640px;margin:auto;background:#fff">
        <div style="padding:18px 26px;background:#111827;border-bottom:3px solid #f97316;color:#fff;font-size:18px;font-weight:900">DRM <span style="color:#f97316">ENERGIA SOLAR</span></div>
        <div style="padding:34px 28px">
          <p style="margin:0 0 8px;color:#ea580c;font-size:12px;font-weight:bold;text-transform:uppercase">Comunicação DRM</p>
          <h1 style="margin:0 0 16px;font-size:30px;line-height:1.12">${escapeHtml(heading)}</h1>
          <p style="margin:0 0 12px;color:#475569;line-height:1.65">Olá, <strong>${escapeHtml(name || 'cliente')}</strong>.</p>
          <p style="margin:0 0 26px;color:#475569;line-height:1.65">${escapeHtml(message)}</p>
          <a href="${escapeHtml(url)}" style="display:inline-block;background:#f97316;color:#111827;padding:15px 22px;text-decoration:none;font-weight:bold;border-radius:6px">${escapeHtml(ctaLabel || 'Acessar')}</a>
        </div>
        <div style="padding:18px 26px;background:#111827;color:#cbd5e1;font-size:12px">DRM Energia Solar · Tecnologia, transparência e energia limpa.</div>
      </div>
    </div>`;
};

const sendCommunicationEmail = async ({ to, name, subject, heading, message, ctaLabel, ctaUrl }) => (
  getMailTransporter().sendMail({
    from: process.env.SMTP_FROM || `DRM ENERGIA SOLAR <${process.env.SMTP_USER}>`,
    to,
    subject,
    text: `Olá, ${name || 'cliente'}. ${heading}\n\n${message}\n\n${ctaUrl?.startsWith('http') ? ctaUrl : `${getAppUrl()}${ctaUrl || ''}`}`,
    html: buildCommunicationEmail({ name, heading, message, ctaLabel, ctaUrl }),
  })
);

const getCommunicationAudience = async audience => {
  const queries = {
    clientes_verificados: `SELECT nome name, lower(email) email FROM clientes WHERE emailVerified = 1 AND email IS NOT NULL`,
    clientes_novos: `SELECT nome name, lower(email) email FROM clientes WHERE email IS NOT NULL AND date(dataCadastro) >= date('now', '-30 day')`,
    clientes_antigos: `SELECT nome name, lower(email) email FROM clientes WHERE email IS NOT NULL AND date(dataCadastro) < date('now', '-30 day')`,
    todos_clientes: `SELECT nome name, lower(email) email FROM clientes WHERE email IS NOT NULL`,
    leads: `SELECT nome name, lower(email) email FROM leads WHERE email IS NOT NULL`,
    equipe: `SELECT nome name, lower(email) email FROM usuarios WHERE active = 1 AND email IS NOT NULL`,
  };
  const rows = await db.all(queries[audience] || queries.clientes_verificados);
  return [...new Map(rows.filter(item => isRealEmail(item.email)).map(item => [item.email, item])).values()];
};

const sendAutomaticPortalWelcome = async user => {
  if (user.userType === 'interno' || !isRealEmail(user.email)) return;
  const key = `portal-welcome-client-${user.id}`;
  const existing = await db.get('SELECT id FROM communication_deliveries WHERE uniqueKey = ?', key);
  if (existing) return;
  const template = COMMUNICATION_TEMPLATES[0];
  await sendCommunicationEmail({ to: user.email, name: user.nome, ...template });
  await db.run(
    `INSERT INTO communication_deliveries (uniqueKey, audience, email, name, subject, status, sentAt)
     VALUES (?, 'automatico', ?, ?, ?, 'sent', ?)`,
    key, user.email, user.nome, template.subject, new Date().toISOString()
  );
};

const createClientNotification = async ({
  clienteId,
  contratoId = null,
  projetoId = null,
  type = 'info',
  title,
  message,
  action = 'project',
}) => {
  if (!clienteId || !title || !message) return null;
  const now = new Date().toISOString();
  const duplicateSince = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const duplicate = await db.get(
    `SELECT id FROM client_notifications
     WHERE clienteId = ? AND COALESCE(contratoId, 0) = COALESCE(?, 0)
       AND COALESCE(projetoId, 0) = COALESCE(?, 0) AND type = ? AND title = ? AND message = ?
       AND createdAt >= ?
     LIMIT 1`,
    clienteId,
    contratoId,
    projetoId,
    type,
    title,
    message,
    duplicateSince
  );
  if (duplicate) return duplicate;

  const result = await db.run(
    `INSERT INTO client_notifications
      (clienteId, contratoId, projetoId, type, title, message, action, readAt, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
    clienteId,
    contratoId,
    projetoId,
    type,
    title,
    message,
    action,
    now
  );
  return { id: result.lastID, clienteId, contratoId, projetoId, type, title, message, action, readAt: null, createdAt: now };
};

const notifyClientByContract = async (contratoId, notification) => {
  if (!contratoId) return null;
  const contrato = await db.get('SELECT * FROM contratos WHERE id = ?', contratoId);
  if (!contrato) return null;
  let cliente = isRealEmail(contrato.clienteEmail)
    ? await db.get('SELECT * FROM clientes WHERE lower(email) = lower(?) LIMIT 1', contrato.clienteEmail)
    : null;
  const normalizedPhone = normalizeWhatsAppPhone(contrato.clienteTelefone);
  if (!cliente && normalizedPhone) {
    cliente = await db.get(
      `SELECT * FROM clientes
       WHERE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(whatsapp, ' ', ''), '-', ''), '(', ''), ')', ''), '+', '') IN (?, ?)
       LIMIT 1`,
      normalizedPhone,
      normalizedPhone.startsWith('55') ? normalizedPhone.slice(2) : normalizedPhone
    );
  }
  if (!cliente) return null;
  return createClientNotification({ clienteId: cliente.id, contratoId: contrato.id, ...notification });
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
  'etapaComercial',
  'motivoSuspensao',
  'dataSuspensao',
  'dataPrevisaoRetorno',
  'ultimoContatoComercial',
  'proximaAcaoComercial',
  'consultorId',
  'consultorNome',
  'historicoSuspensao',
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

// Equipe interna precisa cadastrar/confirmar o WhatsApp pessoal para receber
// avisos de atendimento. Clientes não.
const needsWhatsappSetup = (user = {}) => isInternalStaffUser(user) && !Boolean(user.whatsappConfirmed);

const sanitizeUser = (user) => ({
  id: user.id,
  nome: user.nome,
  username: user.username,
  email: user.email,
  whatsapp: user.whatsapp || '',
  whatsappConfirmed: Boolean(user.whatsappConfirmed),
  needsWhatsappSetup: needsWhatsappSetup({ ...user, userType: 'interno' }),
  role: user.role,
  permissions: user.permissions,
  quickActions: parseQuickActions(user.quickActions),
  mustChangePassword: shouldForcePasswordChange(user),
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
    const isPasswordChangeRoute = req.path === '/api/change-password';

    if (decoded.userType === 'interno') {
      const user = await db.get('SELECT * FROM usuarios WHERE id = ? AND active = 1', decoded.id);
      if (!user) return res.status(401).json({ message: 'Usuário inválido.' });

      req.user = {
        ...user,
        userType: 'interno',
        permissions: parsePermissions(user.permissions),
      };
      if (shouldForcePasswordChange(req.user) && !isPasswordChangeRoute) {
        return res.status(403).json({ message: 'Troque a senha temporária para liberar o painel.', mustChangePassword: true });
      }
      if (requiresEmailVerification(req.user) && !isEmailVerificationRoute && !isPasswordChangeRoute) {
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
    if (requiresEmailVerification(req.user) && !isEmailVerificationRoute && !isPasswordChangeRoute) {
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

const pickQueryEntries = (query = {}, predicate = () => true) => {
  const entries = {};
  for (const [key, rawValue] of Object.entries(query)) {
    if (!predicate(key)) continue;
    entries[key] = Array.isArray(rawValue)
      ? rawValue.map(value => String(value).slice(0, 500))
      : String(rawValue ?? '').slice(0, 500);
  }
  return entries;
};

const buildWhatsAppRedirectUrl = (phone, query = {}) => {
  const params = new URLSearchParams();
  for (const [key, rawValue] of Object.entries(query)) {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    values.forEach(value => {
      if (typeof value !== 'undefined' && value !== null) {
        params.append(key, String(value).slice(0, 500));
      }
    });
  }
  const queryString = params.toString();
  return `https://wa.me/${phone}${queryString ? `?${queryString}` : ''}`;
};

const getRoundRobinLeadSummary = async () => {
  const [state, totalRow, last24Row, rows, recent] = await Promise.all([
    db.get('SELECT nextIndex, updatedAt FROM lead_round_robin_state WHERE id = 1'),
    db.get('SELECT COUNT(*) as total FROM lead_redirect_logs'),
    db.get(`SELECT COUNT(*) as total FROM lead_redirect_logs WHERE datetime(createdAt) >= datetime('now', '-24 hours')`),
    db.all(
      `SELECT sellerPhone, sellerPosition, sellerName, COUNT(*) as total
       FROM lead_redirect_logs
       GROUP BY sellerPhone, sellerPosition, sellerName
       ORDER BY sellerPosition ASC`
    ),
    db.all(
      `SELECT id, createdAt, ip, userAgent, sellerPhone, sellerPosition, sellerName, referer, requestUrl, redirectUrl, utmParams, queryParams
       FROM lead_redirect_logs
       ORDER BY id DESC
       LIMIT 12`
    ),
  ]);

  const total = Number(totalRow?.total || 0);
  const bySeller = ROUND_ROBIN_SELLERS.map(seller => {
    const row = rows.find(item => item.sellerPhone === seller.phone);
    const sellerTotal = Number(row?.total || 0);
    return {
      ...seller,
      total: sellerTotal,
      percent: total ? sellerTotal / total : 0,
    };
  });
  const totals = bySeller.map(item => item.total);
  const spread = totals.length ? Math.max(...totals) - Math.min(...totals) : 0;

  return {
    enabled: true,
    route: '/rleads',
    targetBaseUrl: 'https://wa.me/',
    total,
    last24h: Number(last24Row?.total || 0),
    nextSeller: ROUND_ROBIN_SELLERS[Number(state?.nextIndex || 0) % ROUND_ROBIN_SELLERS.length],
    lastUpdatedAt: state?.updatedAt || null,
    status: {
      ok: spread <= 1,
      spread,
      message: spread <= 1
        ? 'Rodizio equilibrado e operacional.'
        : `Distribuicao com diferenca de ${spread} lead(s).`,
    },
    bySeller,
    recent: recent.map(item => ({
      ...item,
      utmParams: item.utmParams ? JSON.parse(item.utmParams) : {},
      queryParams: item.queryParams ? JSON.parse(item.queryParams) : {},
    })),
  };
};

const getNextLeadOwner = async () => {
  const eligible = await getLeadOwners();

  if (eligible.length === 0) return null;

  const currentIndexRaw = Number(await getSetting('leadRoundRobinIndex', 0));
  const currentIndex = Number.isFinite(currentIndexRaw) && currentIndexRaw >= 0 ? currentIndexRaw : 0;
  const owner = eligible[currentIndex % eligible.length];
  const nextIndex = (currentIndex + 1) % eligible.length;

  await setSetting('leadRoundRobinIndex', nextIndex);
  return owner;
};

const LEAD_ROTATION_EXCLUDED_USERNAMES = new Set(['agdon']);

const getLeadOwners = async () => {
  const users = await db.all('SELECT * FROM usuarios WHERE active = 1 ORDER BY id ASC');
  return users
    .map(user => ({ ...user, permissions: parsePermissions(user.permissions) }))
    .filter(user => {
      const username = String(user.username || '').trim().toLowerCase();
      return (
        !LEAD_ROTATION_EXCLUDED_USERNAMES.has(username)
        && user.role !== 'ADM'
        && can(user, 'leads')
        && normalizeWhatsAppPhone(user.whatsapp)
      );
    });
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
    documentacaoCorrigida: false,
    vistoriaRealizada: false,
    artGerada: false,
    trtPaga: false,
    projetoTecnico: false,
    projetoParaEnvio: false,
    projetoEnviado: false,
    pendenciaConcessionaria: false,
    projetoCorrigido: false,
    projetoReenviado: false,
    parecerAcesso: false,
    obraConcessionaria: false,
    vistoriaSolicitada: false,
    protocoloVistoria: false,
    vistoriaReprovada: false,
    homologacao: false,
    instalacao: false,
    vistoriaFinal: false,
    medidorTrocado: false,
    sistemaLigado: false,
  };
  const now = new Date();
  const prazo = new Date(now);
  prazo.setDate(prazo.getDate() + 30);

  const result = await db.run(
    `INSERT INTO projetos
      (contratoId, clienteNome, clienteTelefone, clienteCidade, valorProjeto, etapa, prioridade, responsavelId, responsavelNome, checklist, observacoes, dataInicio, prazoPrevisto, pendenciasHomologacao, enviosHomologacao, documentosHomologacao, timeline, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    contrato.id,
    contrato.clienteNome,
    contrato.clienteTelefone,
    contrato.clienteCidade,
    Number(contrato.valorProjeto) || 0,
    'Novo projeto',
    'Normal',
    contrato.assignedUserId || contrato.criadoPorId || null,
    contrato.assignedUserName || contrato.criadoPorNome || null,
    JSON.stringify(checklist),
    'Projeto criado automaticamente após aprovação do contrato.',
    now.toISOString(),
    prazo.toISOString().split('T')[0],
    JSON.stringify([]),
    JSON.stringify([]),
    JSON.stringify([]),
    JSON.stringify([{
      id: `tl-${now.getTime()}`,
      tipo: 'projeto',
      titulo: 'Projeto criado',
      descricao: 'Projeto criado automaticamente após aprovação do contrato.',
      responsavel: contrato.assignedUserName || contrato.criadoPorNome || 'Equipe DRM',
      data: now.toISOString(),
    }]),
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

const DRM_SIGNATORY = Object.freeze({
  nome: 'Deivson Rodrigues Martins',
  cpf: '04870895374',
  nascimento: '1991-06-23',
});

const validateSignatureDataUrl = (dataUrl) => {
  if (!dataUrl) return { valid: false, message: 'A assinatura está vazia.' };
  const value = String(dataUrl);
  const match = value.match(/^data:(image\/png|image\/jpeg);base64,([A-Za-z0-9+/=\r\n]+)$/i);
  if (!match) return { valid: false, message: 'Envie uma assinatura em PNG ou JPG válida.' };
  const estimatedBytes = Math.floor(match[2].replace(/\s/g, '').length * 0.75);
  if (estimatedBytes > 1.5 * 1024 * 1024) {
    return { valid: false, message: 'A assinatura deve ter no máximo 1.5 MB.' };
  }
  return { valid: true, dataUrl: value, mimeType: match[1].toLowerCase() };
};

const dataUrlToBuffer = (dataUrl) => {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/i);
  if (!match) return null;
  return Buffer.from(match[2], 'base64');
};

const normalizeIpAddress = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.includes(',')) return normalizeIpAddress(raw.split(',')[0]);
  return raw.replace(/^::ffff:/i, '');
};

const getRequestIp = (req) => (
  normalizeIpAddress(req.headers['x-forwarded-for']) ||
  normalizeIpAddress(req.ip) ||
  normalizeIpAddress(req.socket?.remoteAddress)
);

const buildSignatureDocumentHash = (parsed = {}) => {
  const payload = {
    id: parsed.id || null,
    clienteNome: parsed.clienteNome || '',
    clienteCpfCnpj: parsed.clienteCpfCnpj || parsed.dados?.manual?.cpfCnpj || '',
    clienteCidade: parsed.clienteCidade || '',
    clienteTelefone: parsed.clienteTelefone || '',
    clienteEmail: parsed.clienteEmail || '',
    valorProjeto: parsed.valorProjeto || 0,
    status: parsed.status || '',
    equipamentoId: parsed.equipamentoId || null,
    equipamentoNome: parsed.equipamentoNome || '',
    manual: parsed.dados?.manual || {},
    dimensionamento: parsed.dados?.dimensionamento || {},
    financeiro: parsed.dados?.financeiro || {},
    equipamentoDados: parsed.equipamentoDados || {},
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
};

const buildSignatureEvidenceSummary = (parsed = {}) => {
  const assinatura = parsed.dados?.assinatura || {};
  const documentHash = assinatura?.documentHash || buildSignatureDocumentHash(parsed);
  return {
    method: assinatura?.method || 'Assinatura eletrônica simples com trilha de evidências',
    provider: assinatura?.provider || 'DRM Energia Solar',
    documentHash,
    linkToken: assinatura?.link?.token || null,
    requestedAt: assinatura?.link?.createdAt || null,
    expiresAt: assinatura?.link?.expiresAt || null,
    drm: assinatura?.drm || null,
    cliente: assinatura?.cliente || null,
  };
};

const buildAutoDrmSignature = ({ signedAt, approvedByUser }) => ({
  signedAt: signedAt || new Date().toISOString(),
  signedById: approvedByUser?.id ?? null,
  signedByName: DRM_SIGNATORY.nome,
  cpf: DRM_SIGNATORY.cpf,
  birthDate: DRM_SIGNATORY.nascimento,
  autoApplied: true,
  approvedById: approvedByUser?.id ?? null,
  approvedByName: approvedByUser?.nome || '',
  source: 'aprovacao-admin',
});

const resolveAssinaturaStatus = (assinatura = {}) => {
  const drmSigned = Boolean((assinatura?.drm?.dataUrl || assinatura?.drm?.autoApplied) && assinatura?.drm?.signedAt);
  const clienteSigned = Boolean(assinatura?.cliente?.dataUrl && assinatura?.cliente?.signedAt);
  if (drmSigned && clienteSigned) return 'Assinado digitalmente';
  if (drmSigned) return 'Aguardando assinatura do cliente';
  if (clienteSigned) return 'Aguardando assinatura DRM';
  if (assinatura?.link?.token) return 'Link enviado para assinatura';
  return 'Pendente de assinaturas';
};

const validateProjectDocumentDataUrl = (dataUrl) => {
  if (!dataUrl) return { valid: true, dataUrl: null };
  const value = String(dataUrl);
  const match = value.match(/^data:(application\/pdf|image\/jpeg|image\/png);base64,([A-Za-z0-9+/=\r\n]+)$/i);
  if (!match) return { valid: false, message: 'Envie um arquivo PDF, JPG ou PNG válido.' };
  const estimatedBytes = Math.floor(match[2].replace(/\s/g, '').length * 0.75);
  if (estimatedBytes > 15 * 1024 * 1024) {
    return { valid: false, message: 'O documento deve ter no máximo 15 MB.' };
  }
  return { valid: true, dataUrl: value };
};

const getContractConsultantName = (contrato = {}) => (
  String(contrato.consultorNome || contrato.assignedUserName || contrato.criadoPorNome || '').trim() || 'Sem consultor'
);

const getContractConsultantId = (contrato = {}) => (
  contrato.consultorId ?? contrato.assignedUserId ?? contrato.criadoPorId ?? null
);

const parseContrato = (contrato) => ({
  ...contrato,
  consultorId: getContractConsultantId(contrato),
  consultorNome: getContractConsultantName(contrato),
  dados: parseJsonField(contrato.dados),
  equipamentoDados: parseJsonField(contrato.equipamentoDados),
  assinaturaStatus: contrato.assinaturaStatus || resolveAssinaturaStatus(parseJsonField(contrato.dados)?.assinatura || {}),
});

const parseProcuracao = (procuracao) => ({
  ...procuracao,
  clienteDados: parseJsonField(procuracao.clienteDados),
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
  valorSistema: moneyNumberOrNull(body.valorSistema),
  valorEntrada: moneyNumberOrNull(body.valorEntrada),
  valorSaldo: moneyNumberOrNull(body.valorSaldo),
  prazoExecucao: body.prazoExecucao === '' || typeof body.prazoExecucao === 'undefined' ? null : Number(body.prazoExecucao),
  formaPagamentoTipo: String(body.formaPagamentoTipo || '').trim() || null,
  formaPagamento: String(body.formaPagamento || '').trim() || null,
  observacoes: String(body.observacoes || '').trim() || null,
});

const firstFilled = (...values) => (
  values.find(value => value !== '' && typeof value !== 'undefined' && value !== null) ?? ''
);

const mergeManualWithEquipamento = (manual = {}, equipamento = {}) => ({
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
  formaPagamentoTipo: firstFilled(manual.formaPagamentoTipo, equipamento?.formaPagamentoTipo),
  formaPagamento: firstFilled(manual.formaPagamento, equipamento?.formaPagamento),
});

// Alias mantido por compatibilidade — usa a mesma fonte única de verdade.
const isMasterAdmin = isMasterAdminUser;

const numberOrNull = (value) => {
  if (value === '' || typeof value === 'undefined' || value === null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const moneyNumberOrNull = (value) => {
  if (value === '' || typeof value === 'undefined' || value === null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value) : null;
  const digits = String(value).replace(/\D/g, '');
  return digits ? Number(digits) : null;
};

const normalizeContractReviewPayload = (body = {}, existing = {}) => {
  const parsed = parseContrato(existing);
  const dados = parsed.dados || {};
  const manual = dados.manual || {};
  const financeiro = dados.financeiro || {};
  const dimensionamento = dados.dimensionamento || {};
  const equipamentoDados = parsed.equipamentoDados || {};

  const nextManual = {
    ...manual,
    valorSistema: body.valorProjeto ?? manual.valorSistema ?? '',
    valorEntrada: body.valorEntrada ?? manual.valorEntrada ?? '',
    valorSaldo: body.valorSaldo ?? manual.valorSaldo ?? '',
    potenciaKwp: body.potenciaKwp ?? manual.potenciaKwp ?? '',
    geracaoKwh: body.geracaoKwh ?? manual.geracaoKwh ?? '',
    geracaoAnualKwh: body.geracaoAnualKwh ?? manual.geracaoAnualKwh ?? '',
    numeroPaineis: body.numeroPaineis ?? manual.numeroPaineis ?? '',
    painel: body.placaModelo ?? manual.painel ?? '',
    inversor: body.inversorModelo ?? manual.inversor ?? '',
    quantidadeCabo: body.quantidadeCabo ?? manual.quantidadeCabo ?? '',
    prazoExecucao: body.prazoExecucao ?? manual.prazoExecucao ?? '',
    formaPagamento: body.formaPagamento ?? manual.formaPagamento ?? '',
    formaPagamentoTipo: body.formaPagamentoTipo ?? manual.formaPagamentoTipo ?? '',
  };

  const nextFinanceiro = {
    ...financeiro,
    preco_final_cliente_rs: moneyNumberOrNull(body.valorProjeto) ?? financeiro.preco_final_cliente_rs ?? 0,
    entrada_rs: moneyNumberOrNull(body.valorEntrada) ?? financeiro.entrada_rs ?? 0,
    saldo_rs: moneyNumberOrNull(body.valorSaldo) ?? financeiro.saldo_rs ?? 0,
    forma_pagamento: body.formaPagamento ?? financeiro.forma_pagamento ?? '',
    forma_pagamento_tipo: body.formaPagamentoTipo ?? financeiro.forma_pagamento_tipo ?? '',
  };

  const nextDimensionamento = {
    ...dimensionamento,
    potencia_real_instalada_kwp: numberOrNull(body.potenciaKwp) ?? dimensionamento.potencia_real_instalada_kwp ?? 0,
    geracao_estimada_kwh: numberOrNull(body.geracaoKwh) ?? dimensionamento.geracao_estimada_kwh ?? 0,
    geracao_anual_kwh: numberOrNull(body.geracaoAnualKwh) ?? dimensionamento.geracao_anual_kwh ?? dimensionamento.geracao_anual_estimada_kwh ?? 0,
    geracao_anual_estimada_kwh: numberOrNull(body.geracaoAnualKwh) ?? dimensionamento.geracao_anual_estimada_kwh ?? dimensionamento.geracao_anual_kwh ?? 0,
    numero_paineis_necessarios: numberOrNull(body.numeroPaineis) ?? dimensionamento.numero_paineis_necessarios ?? 0,
    placa_modelo: body.placaModelo ?? dimensionamento.placa_modelo ?? '',
    inversor_modelo: body.inversorModelo ?? dimensionamento.inversor_modelo ?? '',
    quantidade_cabo_cc: body.quantidadeCabo ?? dimensionamento.quantidade_cabo_cc ?? '',
  };

  const nextEquipamentoDados = {
    ...equipamentoDados,
    valorSistema: moneyNumberOrNull(body.valorProjeto) ?? equipamentoDados.valorSistema ?? null,
    valorEntrada: moneyNumberOrNull(body.valorEntrada) ?? equipamentoDados.valorEntrada ?? null,
    valorSaldo: moneyNumberOrNull(body.valorSaldo) ?? equipamentoDados.valorSaldo ?? null,
    potenciaKwp: numberOrNull(body.potenciaKwp) ?? equipamentoDados.potenciaKwp ?? null,
    geracaoKwh: numberOrNull(body.geracaoKwh) ?? equipamentoDados.geracaoKwh ?? null,
    geracaoAnualKwh: numberOrNull(body.geracaoAnualKwh) ?? equipamentoDados.geracaoAnualKwh ?? null,
    numeroPaineis: numberOrNull(body.numeroPaineis) ?? equipamentoDados.numeroPaineis ?? null,
    placaModelo: String(body.placaModelo ?? equipamentoDados.placaModelo ?? '').trim(),
    inversorModelo: String(body.inversorModelo ?? equipamentoDados.inversorModelo ?? '').trim(),
    quantidadeCabo: String(body.quantidadeCabo ?? equipamentoDados.quantidadeCabo ?? '').trim(),
    prazoExecucao: numberOrNull(body.prazoExecucao) ?? equipamentoDados.prazoExecucao ?? null,
    formaPagamento: String(body.formaPagamento ?? equipamentoDados.formaPagamento ?? '').trim(),
    formaPagamentoTipo: String(body.formaPagamentoTipo ?? equipamentoDados.formaPagamentoTipo ?? '').trim(),
  };

  const clienteNome = String(body.clienteNome ?? existing.clienteNome ?? '').trim();
  if (!clienteNome) {
    const error = new Error('Informe o nome do cliente.');
    error.statusCode = 400;
    throw error;
  }

  return {
    clienteNome,
    clienteTelefone: String(body.clienteTelefone ?? existing.clienteTelefone ?? '').trim(),
    clienteEmail: String(body.clienteEmail ?? existing.clienteEmail ?? '').trim(),
    clienteCidade: String(body.clienteCidade ?? existing.clienteCidade ?? '').trim(),
    consultorId: body.consultorId === '' || typeof body.consultorId === 'undefined' || body.consultorId === null
      ? getContractConsultantId(existing)
      : numberOrNull(body.consultorId),
    consultorNome: String(body.consultorNome ?? existing.consultorNome ?? existing.assignedUserName ?? existing.criadoPorNome ?? '').trim(),
    valorProjeto: moneyNumberOrNull(body.valorProjeto) ?? Number(existing.valorProjeto || 0),
    dados: {
      ...dados,
      dimensionamento: nextDimensionamento,
      financeiro: nextFinanceiro,
      manual: nextManual,
      consultor: {
        id: body.consultorId === '' || typeof body.consultorId === 'undefined' || body.consultorId === null
          ? getContractConsultantId(existing)
          : numberOrNull(body.consultorId),
        nome: String(body.consultorNome ?? existing.consultorNome ?? existing.assignedUserName ?? existing.criadoPorNome ?? '').trim(),
      },
      revisadoEm: new Date().toISOString(),
    },
    equipamentoDados: nextEquipamentoDados,
  };
};

const PROJECT_STAGES = [
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

const INSTALLATION_STAGES = [
  'Equipamento enviado',
  'Equipamento entregue',
  'Instalação agendada',
  'Instalação concluída',
  'Pedido de ligação realizado',
  'Ligação realizada pela concessionária',
];

const LEGACY_PROJECT_STAGE_MAP = {
  Documentação: 'Novo projeto',
  Vistoria: 'Análise inicial',
  'Projeto técnico': 'Elaborar projeto',
  Homologação: 'Aguardando parecer de acesso',
  Instalação: 'Solicitar vistoria',
  'Vistoria final': 'Vistoria em prazo',
  Concluído: 'Projeto concluído',
};

const normalizeProjectStage = (stage) => LEGACY_PROJECT_STAGE_MAP[stage] || stage || PROJECT_STAGES[0];

const parseProjeto = (projeto) => ({
  ...projeto,
  etapa: normalizeProjectStage(projeto.etapa),
  checklist: parseJsonField(projeto.checklist, {}),
  pendenciasHomologacao: parseJsonField(projeto.pendenciasHomologacao, []),
  enviosHomologacao: parseJsonField(projeto.enviosHomologacao, []),
  documentosHomologacao: parseJsonField(projeto.documentosHomologacao, []),
  documentosCliente: parseJsonField(projeto.documentosCliente, []),
  documentosProjetista: parseJsonField(projeto.documentosProjetista, []),
  documentosConcessionaria: parseJsonField(projeto.documentosConcessionaria, []),
  timeline: parseJsonField(projeto.timeline, []),
});

const timelineEvent = ({ tipo, titulo, descricao, responsavel }) => ({
  id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  tipo,
  titulo,
  descricao,
  responsavel,
  data: new Date().toISOString(),
});

const appendProjetoTimeline = (projeto, event) => [
  event,
  ...parseJsonField(projeto.timeline, []).slice(0, 79),
];

const parseOs = (os = {}) => ({
  ...os,
  numeroOs: os.numeroOs || (os.id ? `OS-${String(os.id).padStart(5, '0')}` : ''),
  dados: parseJsonField(os.dados, {}),
  fotos: Array.isArray(os.fotos) ? os.fotos : parseJsonField(os.fotos, []),
});

const loadOsComFotos = async (osId) => {
  const os = await db.get('SELECT * FROM ordens_servico WHERE id = ?', osId);
  if (!os) return null;
  const fotos = await db.all('SELECT * FROM os_fotos WHERE osId = ? ORDER BY id DESC', osId);
  return parseOs({ ...os, fotos });
};

const loadOrdensServicoComFotos = async (user) => {
  const rows = can(user, 'verTodosLeads')
    ? await db.all('SELECT * FROM ordens_servico ORDER BY id DESC')
    : await db.all('SELECT * FROM ordens_servico WHERE responsavelId = ? OR responsavelId IS NULL ORDER BY id DESC', user.id);
  if (!rows.length) return [];
  const ids = rows.map((item) => item.id);
  const fotos = await db.all(`SELECT * FROM os_fotos WHERE osId IN (${ids.map(() => '?').join(',')}) ORDER BY id DESC`, ...ids);
  const fotosPorOs = fotos.reduce((acc, foto) => {
    acc[foto.osId] = acc[foto.osId] || [];
    acc[foto.osId].push(foto);
    return acc;
  }, {});
  return rows.map((os) => parseOs({ ...os, fotos: fotosPorOs[os.id] || [] }));
};

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
    html { overflow-wrap: anywhere; word-break: normal; hyphens: none; }
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
      overflow: visible;
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
      max-width: 178mm;
      margin: 18px auto 10px;
      color: #111827;
      font-size: 15px;
      font-weight: 900;
      letter-spacing: 0.2px;
      line-height: 1.25;
      text-align: center;
      text-transform: uppercase;
      overflow-wrap: normal;
      word-break: normal;
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
    p { margin: 0 0 6px; text-align: left; overflow-wrap: anywhere; }
    .intro {
      margin-top: 8px;
      padding: 8px 9px;
      border: 1px solid #f5c4a1;
      background: #fff7ed;
      font-size: 10.2px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 8px;
      margin: 8px 0 10px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
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
      overflow-wrap: anywhere;
      word-break: normal;
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
      column-gap: 34px;
      row-gap: 90px;
      margin-top: 95px;
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
        <div class="meta">${escapeHtml(template.empresa.nome)} • ${escapeHtml(template.empresa.endereco || '')}</div>
        <span class="contract-id">Contrato #${parsed.id} • ${escapeHtml(parsed.status)}</span>
      </div>
      <div class="logo"><img src="${getLogoDataUri()}" alt="${escapeHtml(template.empresa.nome)}" /></div>
    </header>

    <h1>${escapeHtml(template.titulo || DEFAULT_CONTRACT_TEMPLATE.titulo)}</h1>

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
  const assinatura = parsed.dados?.assinatura || {};
  const template = await getContractTemplate();
  const logoPath = path.join(__dirname, '../frontend/public/assets/logo.png');
  const clientAddress = cliente.enderecoCompleto || buildClientAddress(cliente);
  const installAddress = cliente.enderecoInstalacaoCompleto || buildInstallAddress(cliente);
  const contractVariables = {
    empresa: template.empresa,
    cliente: {
      nome: parsed.clienteNome,
      telefone: parsed.clienteTelefone || 'Não informado',
      email: parsed.clienteEmail || 'Não informado',
      cidade: parsed.clienteCidade || 'Não informado',
      cpfCnpj: cliente.cpfCnpj || manual.cpfCnpj || 'Não informado',
      rgIe: cliente.rgIe || 'Não informado',
      endereco: clientAddress,
      enderecoInstalacao: installAddress,
      unidadeConsumidora: cliente.unidadeConsumidora || 'Não informado',
      distribuidora: cliente.distribuidora || 'Não informado',
    },
    projeto: {
      potencia: manual.potenciaKwp || dimensionamento.potencia_real_instalada_kwp || 0,
      geracao: manual.geracaoKwh || dimensionamento.geracao_estimada_kwh || 0,
      geracaoAnual: manual.geracaoAnualKwh || dimensionamento.geracao_anual_kwh || dimensionamento.geracao_anual_estimada_kwh || (Number(manual.geracaoKwh || dimensionamento.geracao_estimada_kwh || 0) * 12),
      paineis: manual.numeroPaineis || dimensionamento.numero_paineis_necessarios || 0,
      quantidadeCabo: manual.quantidadeCabo || equipamento.quantidadeCabo || 'Não informado',
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
  const projectRows = [
    ['Potência instalada', `${contractVariables.projeto.potencia} kWp`],
    ['Geração mensal estimada', `${contractVariables.projeto.geracao} kWh`],
    ['Geração anual estimada', `${contractVariables.projeto.geracaoAnual} kWh`],
    ['Quantidade de painéis', contractVariables.projeto.paineis || 'Não informado'],
    ['Modelo dos painéis', contractVariables.equipamento.placaModelo],
    ['Modelo do inversor', contractVariables.equipamento.inversorModelo],
    ['Quantidade de cabo', contractVariables.projeto.quantidadeCabo],
  ];
  const commercialRows = [
    ['Valor do sistema', contractVariables.contrato.valor],
    ['Entrada', contractVariables.contrato.entrada],
    ['Saldo', contractVariables.contrato.saldo],
    ['Condição de pagamento', contractVariables.contrato.formaPagamento],
    ['Prazo de execução', `${contractVariables.contrato.prazoExecucao} dias úteis`],
    ['Aprovado por', contractVariables.contrato.aprovadoPor],
    ['Data de aprovação', contractVariables.contrato.dataAprovacao || formatDateBr()],
  ];
  const clauses = htmlToPlainText(renderTemplate(template.corpo || DEFAULT_CONTRACT_TEMPLATE.corpo, contractVariables));

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 86, left: 44, right: 44, bottom: 58 },
      info: { Title: `Contrato DRM Solar #${parsed.id}` },
      bufferPages: true,
    });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const orange = template.visual.primaryColor || '#F97316';
    const dark = '#111827';
    const muted = '#64748B';
    const border = '#E5E7EB';
    const soft = '#F8FAFC';
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const footerTop = doc.page.height - 32;
    const contentBottom = doc.page.height - doc.page.margins.bottom;
    const sanitize = (value) => String(value ?? 'Não informado').replace(/\s+/g, ' ').trim() || 'Não informado';

    const drawHeader = () => {
      const topY = 26;
      doc.save();
      doc.rect(0, 0, doc.page.width, 8).fill(orange);
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, doc.page.margins.left, topY, { fit: [92, 48] });
      }
      doc.font('Helvetica-Bold').fontSize(8).fillColor(orange).text('DRM ENERGIA SOLAR', doc.page.margins.left + 112, topY, { width: pageWidth - 112, align: 'right' });
      doc.font('Helvetica').fontSize(7.4).fillColor(muted).text(sanitize(template.empresa.endereco), doc.page.margins.left + 112, topY + 13, { width: pageWidth - 112, align: 'right' });
      doc.font('Helvetica-Bold').fontSize(8).fillColor(dark).text(`Contrato #${parsed.id} - ${parsed.status}`, doc.page.margins.left + 112, topY + 32, { width: pageWidth - 112, align: 'right' });
      doc.strokeColor(border).lineWidth(1).moveTo(doc.page.margins.left, 78).lineTo(doc.page.margins.left + pageWidth, 78).stroke();
      doc.restore();
    };

    const drawFooter = (pageNumber, totalPages) => {
      const originalBottomMargin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.save();
      doc.strokeColor(border).lineWidth(1).moveTo(doc.page.margins.left, footerTop - 7).lineTo(doc.page.margins.left + pageWidth, footerTop - 7).stroke();
      doc.font('Helvetica').fontSize(7.4).fillColor(muted)
        .text(`${sanitize(template.empresa.telefone)}${template.empresa.email ? ` - ${sanitize(template.empresa.email)}` : ''}`, doc.page.margins.left, footerTop, { width: pageWidth * 0.72, lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(7.4).fillColor(orange)
        .text(`Página ${pageNumber} de ${totalPages}`, doc.page.margins.left + pageWidth * 0.72, footerTop, { width: pageWidth * 0.28, align: 'right', lineBreak: false });
      doc.restore();
      doc.page.margins.bottom = originalBottomMargin;
    };

    const ensureSpace = (height = 80) => {
      if (doc.y + height > contentBottom) {
        doc.addPage();
      }
    };
    const sectionTitle = (title) => {
      ensureSpace(38);
      const y = doc.y + 8;
      doc.roundedRect(doc.page.margins.left, y, pageWidth, 22, 6).fill('#FFF7ED');
      doc.rect(doc.page.margins.left, y, 4, 22).fill(orange);
      doc.font('Helvetica-Bold').fontSize(9.2).fillColor(dark).text(title.toUpperCase(), doc.page.margins.left + 12, y + 6, { width: pageWidth - 18 });
      doc.y = y + 30;
    };

    const keyValueCard = (x, y, width, label, value) => {
      const labelText = sanitize(label).toUpperCase();
      const valueText = sanitize(value);
      doc.font('Helvetica-Bold').fontSize(7.2);
      const labelHeight = doc.heightOfString(labelText, { width: width - 18 });
      const valueHeight = doc.font('Helvetica').fontSize(8.7).heightOfString(valueText, { width: width - 18, lineGap: 1.8 });
      const height = Math.max(52, labelHeight + valueHeight + 25);
      doc.roundedRect(x, y, width, height, 7).fillAndStroke('#FFFFFF', border);
      doc.font('Helvetica-Bold').fontSize(7.2).fillColor(muted).text(labelText, x + 9, y + 8, { width: width - 18 });
      doc.font('Helvetica').fontSize(8.7).fillColor(dark).text(valueText, x + 9, y + 23, { width: width - 18, lineGap: 1.8 });
      return height;
    };

    const cardGrid = (rows, columns = 2) => {
      const gap = 8;
      const width = (pageWidth - gap * (columns - 1)) / columns;
      for (let index = 0; index < rows.length; index += columns) {
        const row = rows.slice(index, index + columns);
        const rowHeight = Math.max(...row.map(([label, value]) => {
          doc.font('Helvetica-Bold').fontSize(7.2);
          const labelHeight = doc.heightOfString(sanitize(label).toUpperCase(), { width: width - 18 });
          const valueHeight = doc.font('Helvetica').fontSize(8.7).heightOfString(sanitize(value), { width: width - 18, lineGap: 1.8 });
          return Math.max(52, labelHeight + valueHeight + 25);
        }));
        ensureSpace(rowHeight + gap);
        const y = doc.y;
        row.forEach(([label, value], column) => {
          keyValueCard(doc.page.margins.left + column * (width + gap), y, width, label, value);
        });
        doc.y = y + rowHeight + gap;
      }
    };

    const paragraph = (text, options = {}) => {
      const clean = sanitize(text);
      doc.font(options.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(options.size || 8.8);
      const height = doc.heightOfString(clean, { width: pageWidth, lineGap: options.lineGap ?? 3 });
      if (height < contentBottom - 100) ensureSpace(height + 12);
      doc.fillColor(options.color || dark)
        .text(clean, doc.page.margins.left, doc.y, {
          width: pageWidth,
          align: 'left',
          lineGap: options.lineGap ?? 3,
        });
      doc.moveDown(0.6);
    };

    const renderClauses = () => {
      clauses.split('\n').map(line => line.trim()).filter(Boolean).forEach(line => {
        if (/^CL[ÁA]USULA|^D[ÉE]CIMA|^DAS |^DO |^DA /i.test(line) && line.length < 110) {
          sectionTitle(line);
        } else {
          paragraph(line);
        }
      });
    };

    doc.on('pageAdded', () => {
      drawHeader();
      doc.x = doc.page.margins.left;
      doc.y = 96;
    });

    drawHeader();
    doc.y = 96;
    const title = template.titulo || 'CONTRATO DE FORNECIMENTO E INSTALAÇÃO DE SISTEMA FOTOVOLTAICO';
    const titleSize = title.length > 85 ? 12.5 : title.length > 65 ? 13.5 : 15;
    const titleY = doc.y;
    doc.font('Helvetica-Bold').fontSize(titleSize).fillColor(dark)
      .text(title, doc.page.margins.left, titleY, {
        width: pageWidth,
        align: 'center',
        lineGap: 2,
      });
    doc.y += 8;
    const introText = `Pelo presente instrumento particular, ${sanitize(template.empresa.nome)}, inscrita no CNPJ ${sanitize(template.empresa.cnpj)}, e ${sanitize(parsed.clienteNome)}, CPF/CNPJ ${sanitize(contractVariables.cliente.cpfCnpj)}, firmam o presente contrato de prestação de serviços com fornecimento de materiais e instalação de sistema solar fotovoltaico.`;
    const introHeight = Math.max(72, doc.font('Helvetica').fontSize(8.8).heightOfString(introText, { width: pageWidth - 24, lineGap: 2.5 }) + 22);
    ensureSpace(introHeight + 4);
    const introBoxY = doc.y;
    doc.roundedRect(doc.page.margins.left, introBoxY, pageWidth, introHeight, 8).fillAndStroke('#FFFBF7', '#FED7AA');
    const introY = introBoxY + 11;
    doc.font('Helvetica').fontSize(8.8).fillColor(dark)
      .text(
        introText,
        doc.page.margins.left + 12,
        introY,
        { width: pageWidth - 24, lineGap: 2.5, align: 'left' }
      );
    doc.y = introBoxY + introHeight + 4;

    sectionTitle('Dados do contratante');
    cardGrid([
      ['Nome', parsed.clienteNome],
      ['CPF/CNPJ', contractVariables.cliente.cpfCnpj],
      ['Telefone', contractVariables.cliente.telefone],
      ['E-mail', contractVariables.cliente.email],
      ['Cidade', contractVariables.cliente.cidade],
      ['Distribuidora', contractVariables.cliente.distribuidora],
      ['Endereço', contractVariables.cliente.endereco],
      ['Local da instalação', contractVariables.cliente.enderecoInstalacao],
    ], 2);

    sectionTitle('Resumo técnico do sistema');
    cardGrid(projectRows, 2);

    sectionTitle('Condições comerciais');
    cardGrid(commercialRows, 2);

    sectionTitle('Cláusulas contratuais');
    renderClauses();

    ensureSpace(225);
    sectionTitle('Assinaturas');
    doc.font('Helvetica').fontSize(9).fillColor(dark).text(`${parsed.clienteCidade || 'Imperatriz'}, ${new Date().toLocaleDateString('pt-BR')}.`, { align: 'center' });
    doc.moveDown(7);
    const signatureY = doc.y;
    doc.strokeColor(dark).moveTo(doc.page.margins.left, signatureY).lineTo(doc.page.margins.left + 205, signatureY).stroke();
    doc.moveTo(doc.page.margins.left + pageWidth - 205, signatureY).lineTo(doc.page.margins.left + pageWidth, signatureY).stroke();
    const drmSignatureBuffer = assinatura?.drm?.dataUrl ? dataUrlToBuffer(assinatura.drm.dataUrl) : null;
    const clientSignatureBuffer = assinatura?.cliente?.dataUrl ? dataUrlToBuffer(assinatura.cliente.dataUrl) : null;
    if (drmSignatureBuffer) {
      try {
        doc.image(drmSignatureBuffer, doc.page.margins.left + 24, signatureY - 48, { fit: [156, 42], align: 'center' });
      } catch (error) {
        console.warn('Nao foi possivel renderizar a assinatura DRM no PDF:', error?.message || error);
      }
    } else if (assinatura?.drm?.signedAt) {
      const autoDrmName = assinatura?.drm?.signedByName || DRM_SIGNATORY.nome;
      doc.font('Helvetica-Oblique').fontSize(17).fillColor(orange).text(
        autoDrmName,
        doc.page.margins.left + 18,
        signatureY - 34,
        { width: 170, align: 'center' }
      );
    }
    if (clientSignatureBuffer) {
      try {
        doc.image(clientSignatureBuffer, doc.page.margins.left + pageWidth - 181, signatureY - 48, { fit: [156, 42], align: 'center' });
      } catch (error) {
        console.warn('Nao foi possivel renderizar a assinatura do cliente no PDF:', error?.message || error);
      }
    }
    doc.font('Helvetica-Bold').fontSize(8.5).text(template.empresa.nome, doc.page.margins.left, signatureY + 7, { width: 205, align: 'center' });
    doc.text(parsed.clienteNome, doc.page.margins.left + pageWidth - 205, signatureY + 7, { width: 205, align: 'center' });
    doc.font('Helvetica').fontSize(8).fillColor(muted).text('CONTRATADA', doc.page.margins.left, signatureY + 20, { width: 205, align: 'center' });
    doc.text('CONTRATANTE', doc.page.margins.left + pageWidth - 205, signatureY + 20, { width: 205, align: 'center' });
    if (assinatura?.drm?.signedAt) {
      doc.font('Helvetica').fontSize(7).fillColor(muted).text(
        `Assinado digitalmente por ${assinatura.drm.signedByName || template.empresa.nome} em ${formatDateBr(assinatura.drm.signedAt)}`,
        doc.page.margins.left,
        signatureY + 31,
        { width: 205, align: 'center' }
      );
      doc.text(
        `CPF ${assinatura.drm.cpf || DRM_SIGNATORY.cpf} - Nascimento ${formatDateBr(assinatura.drm.birthDate || DRM_SIGNATORY.nascimento)}`,
        doc.page.margins.left,
        signatureY + 41,
        { width: 205, align: 'center' }
      );
    }
    if (assinatura?.cliente?.signedAt) {
      doc.font('Helvetica').fontSize(7).fillColor(muted).text(
        `Assinado digitalmente por ${assinatura.cliente.signedByName || parsed.clienteNome} em ${formatDateBr(assinatura.cliente.signedAt)}`,
        doc.page.margins.left + pageWidth - 205,
        signatureY + 31,
        { width: 205, align: 'center' }
      );
    }
    doc.y = signatureY + 60;

    const signatureEvidence = buildSignatureEvidenceSummary(parsed);
    const evidenceRows = [
      ['Método', signatureEvidence.method],
      ['Hash SHA-256 do contrato', signatureEvidence.documentHash],
      ['Link/token', signatureEvidence.linkToken || 'Não gerado'],
      ['Solicitado em', signatureEvidence.requestedAt ? formatDateBr(signatureEvidence.requestedAt) : 'Não informado'],
      ['Assinatura cliente', assinatura?.cliente?.signedAt ? `${assinatura.cliente.signedByName || parsed.clienteNome} em ${formatDateBr(assinatura.cliente.signedAt)}` : 'Pendente'],
      ['Evidência cliente', assinatura?.cliente?.ip ? `IP ${assinatura.cliente.ip}` : 'IP não registrado'],
      ['Assinatura DRM', assinatura?.drm?.signedAt ? `${assinatura.drm.signedByName || template.empresa.nome} em ${formatDateBr(assinatura.drm.signedAt)}` : 'Pendente'],
      ['Evidência DRM', assinatura?.drm?.ip ? `IP ${assinatura.drm.ip}` : 'IP não registrado'],
    ];
    sectionTitle('Comprovante da assinatura eletrônica');
    cardGrid(evidenceRows, 2);

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      drawFooter(i + 1, range.count);
    }

    doc.end();
  });
};

const sendContratoPdf = async (res, contrato, { download = true } = {}) => {
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
  res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${fileName}"`);
  res.send(pdf);
};

const buildProcuracaoPdf = async (procuracao) => {
  const parsed = parseProcuracao(procuracao);
  const cliente = parsed.clienteDados || {};
  const template = await getContractTemplate();
  const logoPath = path.join(__dirname, '../frontend/public/assets/logo.png');
  const primary = template.visual.primaryColor || '#F97316';
  const dark = '#111827';
  const muted = '#64748B';
  const address = cliente.enderecoCompleto || buildClientAddress(cliente);
  const city = parsed.clienteCidade || cliente.cidade || 'Imperatriz';
  const state = parsed.clienteEstado || cliente.estado || 'MA';
  const distributor = cliente.distribuidora || 'ENERGISA, EQUATORIAL e a AGÊNCIA NACIONAL DE ENERGIA ELÉTRICA - ANEEL';

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 52, left: 56, right: 56, bottom: 48 }, info: { Title: `Procuração DRM #${parsed.id}` } });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const text = (value) => String(value || 'Não informado').replace(/\s+/g, ' ').trim();
    const paragraph = (content, options = {}) => {
      doc.font(options.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(options.size || 9.5).fillColor(options.color || dark)
        .text(content, doc.page.margins.left, doc.y, { width, align: 'left', lineGap: options.lineGap ?? 3.5 });
      doc.moveDown(options.gap ?? 0.8);
    };
    const section = (label) => {
      const y = doc.y + 3;
      doc.roundedRect(doc.page.margins.left, y, width, 22, 5).fill('#FFF7ED');
      doc.rect(doc.page.margins.left, y, 4, 22).fill(primary);
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(dark).text(label, doc.page.margins.left + 12, y + 6, { width: width - 20 });
      doc.y = y + 31;
    };

    doc.rect(0, 0, doc.page.width, 9).fill(primary);
    if (fs.existsSync(logoPath)) doc.image(logoPath, doc.page.margins.left, 28, { fit: [92, 46] });
    doc.font('Helvetica-Bold').fontSize(8).fillColor(primary).text('DRM ENERGIA SOLAR', doc.page.margins.left + 110, 32, { width: width - 110, align: 'right' });
    doc.font('Helvetica').fontSize(7.3).fillColor(muted).text(text(template.empresa.endereco), doc.page.margins.left + 110, 45, { width: width - 110, align: 'right' });
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(dark).text(
      `Procuração #${parsed.id}${parsed.contratoId ? ` - Contrato #${parsed.contratoId}` : ''} - ${parsed.status}`,
      doc.page.margins.left + 110,
      61,
      { width: width - 110, align: 'right' }
    );
    doc.strokeColor('#E5E7EB').moveTo(doc.page.margins.left, 86).lineTo(doc.page.margins.left + width, 86).stroke();
    doc.y = 108;
    doc.font('Helvetica-Bold').fontSize(18).fillColor(dark).text('PROCURAÇÃO', doc.page.margins.left, doc.y, { width, align: 'center' });
    doc.moveDown(1.1);

    section('OUTORGANTE');
    paragraph(`${text(parsed.clienteNome).toUpperCase()}, brasileiro(a), inscrito(a) no CPF/CNPJ sob o nº ${text(parsed.clienteCpfCnpj || cliente.cpfCnpj)}, residente e domiciliado(a) em ${text(address)}.`);

    section('OUTORGADO');
    paragraph(`DRM ENERGIA SOLAR LTDA, sociedade empresária limitada, inscrita no CNPJ sob o nº ${text(template.empresa.cnpj || '48.518.202/0001-56')}, com sede em ${text(template.empresa.endereco)}, neste ato representada por DEIVSON RODRIGUES MARTINS, inscrito no CPF sob o nº 048.708.953-74.`);
    paragraph('FELIX ASSESSORIA & SERVIÇOS INTEGRADOS LTDA, inscrita no CNPJ sob o nº 30.030.152/0001-06, com sede na Rua Jaime Pinto, nº 1.220, casa B, Novo Horizonte, Marabá/PA, CEP 68.503-250, representada por Matheus Pinheiro da Silva Félix, CPF nº 036.465.112-14.');

    section('PODERES CONFERIDOS');
    paragraph(`O OUTORGANTE confere aos OUTORGADOS poderes para representá-lo perante ${text(distributor)}, especialmente para solicitar e acompanhar ajustes de demanda, aumento ou redução de carga, bloqueio e revisão de faturas, memória de massa, reclamações, mudança de grupo ou modalidade tarifária, protocolos, assinaturas e demais atos necessários ao fiel cumprimento deste mandato.`);
    paragraph('Fica vedado o substabelecimento desta procuração a qualquer outra pessoa física ou jurídica.', { bold: true });
    paragraph(`Esta procuração possui validade de 06 (seis) meses, até ${formatDateBr(parsed.validadeAte)}.`, { bold: true });

    doc.moveDown(1.2);
    paragraph(`${text(city).toUpperCase()} - ${text(state).toUpperCase()}, ${formatDateBr(parsed.dataCriacao)}.`, { size: 9, gap: 4 });
    const signatureY = Math.max(doc.y + 42, 660);
    doc.strokeColor(dark).moveTo(doc.page.margins.left + 70, signatureY).lineTo(doc.page.margins.left + width - 70, signatureY).stroke();
    doc.font('Helvetica-Bold').fontSize(9).fillColor(dark).text(text(parsed.clienteNome).toUpperCase(), doc.page.margins.left, signatureY + 9, { width, align: 'center' });
    doc.font('Helvetica').fontSize(8).fillColor(muted).text(`CPF/CNPJ nº ${text(parsed.clienteCpfCnpj || cliente.cpfCnpj)} - OUTORGANTE`, doc.page.margins.left, signatureY + 23, { width, align: 'center' });

    const footerY = doc.page.height - 28;
    doc.page.margins.bottom = 0;
    doc.strokeColor('#E5E7EB').moveTo(doc.page.margins.left, footerY - 7).lineTo(doc.page.margins.left + width, footerY - 7).stroke();
    doc.font('Helvetica').fontSize(7.2).fillColor(muted).text(`${text(template.empresa.telefone)} - ${text(template.empresa.email)}`, doc.page.margins.left, footerY, { width, align: 'center', lineBreak: false });
    doc.end();
  });
};

const sendProcuracaoPdf = async (res, procuracao, { download = true } = {}) => {
  const pdf = await buildProcuracaoPdf(procuracao);
  const safeName = String(procuracao.clienteNome || 'cliente').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w-]+/g, '-').toLowerCase();
  const disposition = download ? 'attachment' : 'inline';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Length', pdf.length);
  res.setHeader('Content-Disposition', `${disposition}; filename="procuracao-drm-${procuracao.id}-${safeName}.pdf"`);
  res.send(pdf);
};

const buildOrcamentoPdf = async (orcamento) => {
  const dimensionamento = parseJsonField(orcamento.dimensionamento, {});
  const financeiro = parseJsonField(orcamento.financeiro, {});
  const template = await getContractTemplate();
  const logoPath = path.join(__dirname, '../frontend/public/assets/logo.png');

  return new Promise((resolve, reject) => {
    const ML = 42; // margin left/right
    const doc = new PDFDocument({ size: 'A4', margins: { top: 34, left: ML, right: ML, bottom: 30 }, info: { Title: `Orçamento Solar #${orcamento.id}` } });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const orange = '#F97316';
    const dark   = '#1E293B';
    const muted  = '#64748B';
    const W = doc.page.width - ML * 2; // usable width

    // ── shared header helper ──────────────────────────────────────────────
    const drawPageHeader = (subtitle) => {
      if (fs.existsSync(logoPath)) doc.image(logoPath, ML, 28, { fit: [90, 48] });
      doc.font('Helvetica-Bold').fontSize(18).fillColor(dark)
        .text(subtitle, ML + 100, 30, { width: W - 100, align: 'right' });
      doc.font('Helvetica-Bold').fontSize(9).fillColor(orange)
        .text(`ORÇAMENTO #${orcamento.id} - ${formatDateBr(orcamento.data)}`, ML + 100, 56, { width: W - 100, align: 'right' });
      doc.font('Helvetica').fontSize(8).fillColor(muted)
        .text(template.empresa.nome || 'DRM ENERGIA SOLAR LTDA', ML + 100, 72, { width: W - 100, align: 'right' });
      doc.moveTo(ML, 94).lineTo(ML + W, 94).lineWidth(2).strokeColor(orange).stroke();
      doc.y = 106;
    };

    // ── footer helper ─────────────────────────────────────────────────────
    const drawPageFooter = () => {
      // Temporarily disable bottom margin so text in the footer zone doesn't trigger auto-pagination
      const savedBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      const fy = doc.page.height - 32;
      doc.moveTo(ML, fy).lineTo(ML + W, fy).lineWidth(0.5).strokeColor('#E2E8F0').stroke();
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(dark)
        .text('DRM Energia Solar', ML, fy + 5, { width: W, align: 'center' });
      doc.font('Helvetica').fontSize(7.5).fillColor(muted)
        .text('Proposta comercial gerada pelo sistema DRM Solar', ML, fy + 16, { width: W, align: 'center' });
      doc.page.margins.bottom = savedBottom;
    };

    // ── metric card helper ────────────────────────────────────────────────
    const metricCard = (x, y, w, label, value) => {
      doc.roundedRect(x, y, w, 60, 6).fillAndStroke('#FFF7ED', '#FED7AA');
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#9A3412').text(label.toUpperCase(), x + 10, y + 10, { width: w - 20 });
      doc.font('Helvetica-Bold').fontSize(16).fillColor(dark).text(String(value || '-'), x + 10, y + 27, { width: w - 20 });
    };

    // ══════════════════════════════════════════════════════════════════════
    //  PAGE 1 — PROPOSTA COMERCIAL SOLAR
    // ══════════════════════════════════════════════════════════════════════
    drawPageHeader('PROPOSTA COMERCIAL SOLAR');

    // Greeting
    doc.font('Helvetica-Bold').fontSize(12).fillColor(dark)
      .text(`Olá, ${(orcamento.clienteNome || 'cliente').toUpperCase()}!`);
    doc.moveDown(0.25);
    doc.font('Helvetica').fontSize(8.4).fillColor(muted)
      .text('Esta proposta apresenta dimensionamento, equipamentos previstos, geração estimada e condições comerciais para análise antes da emissão do contrato.', { lineGap: 1 });
    doc.moveDown(0.7);

    // KPI cards (3)
    const cardY = doc.y;
    const cardW = (W - 16) / 3;
    metricCard(ML,                    cardY, cardW, 'POTÊNCIA', `${dimensionamento.potencia_real_instalada_kwp || 0} kWp`);
    metricCard(ML + cardW + 8,        cardY, cardW, 'GERAÇÃO',  `${dimensionamento.geracao_estimada_kwh || 0} kWh/mês`);
    metricCard(ML + (cardW + 8) * 2,  cardY, cardW, 'VALOR',    formatCurrency(financeiro.preco_final_cliente_rs));
    doc.y = cardY + 70;

    // FORMA DE PAGAMENTO
    doc.moveDown(0.45);
    doc.roundedRect(ML, doc.y, W, 34, 6).fillAndStroke('#FFF7ED', '#FED7AA');
    const fpY = doc.y;
    doc.font('Helvetica-Bold').fontSize(7.2).fillColor('#9A3412').text('FORMA DE PAGAMENTO', ML + 10, fpY + 6, { width: W - 20 });
    const tags = ['Financiado', 'Cartão de Crédito', 'À vista', 'Pagamento Híbrido'];
    let tagX = ML + 10;
    const tagY = fpY + 18;
    tags.forEach(tag => {
      const tw = doc.widthOfString(tag, { fontSize: 7 }) + 14;
      doc.roundedRect(tagX, tagY, tw, 12, 3).fill('#1E293B');
      doc.font('Helvetica-Bold').fontSize(7).fillColor('#FFFFFF').text(tag, tagX + 7, tagY + 2.5, { lineBreak: false });
      tagX += tw + 6;
    });
    doc.y = fpY + 40;

    // CLIENTE section
    doc.moveDown(0.45);
    doc.font('Helvetica-Bold').fontSize(11).fillColor(orange).text('CLIENTE', ML, doc.y, { width: W, align: 'center' });
    doc.moveDown(0.2);
    doc.moveTo(ML, doc.y).lineTo(ML + W, doc.y).lineWidth(0.5).strokeColor('#E2E8F0').stroke();
    doc.moveDown(0.2);

    const clienteRows = [
      ['NOME', orcamento.clienteNome || '-'],
      ['CIDADE', orcamento.clienteCidade || '-'],
    ];
    clienteRows.forEach(([label, value]) => {
      const ry = doc.y;
      doc.font('Helvetica-Bold').fontSize(7.2).fillColor(muted).text(label, ML, ry + 3, { width: 100, lineBreak: false });
      doc.font('Helvetica').fontSize(8.4).fillColor(dark).text(value, ML + 105, ry + 2, { width: W - 105, lineBreak: false });
      doc.y = ry + 16;
      doc.moveTo(ML, doc.y).lineTo(ML + W, doc.y).lineWidth(0.5).strokeColor('#E2E8F0').stroke();
      doc.moveDown(0.1);
    });

    // SISTEMA FOTOVOLTAICO table
    doc.moveDown(0.45);
    doc.font('Helvetica-Bold').fontSize(11).fillColor(orange).text('SISTEMA FOTOVOLTAICO', ML, doc.y, { width: W, align: 'center' });
    doc.moveDown(0.3);

    const c1 = 120; // ITEM
    const c3 = 36;  // QTD
    const c2 = W - c1 - c3; // MODELO/DESCRIÇÃO

    // Build inversor rows — group same models, separate different models
    const allInversores = [
      { marca: dimensionamento.inversor_marca || '', modelo: dimensionamento.inversor_modelo || '', quantidade: Number(dimensionamento.quantidade_inversores || 1) },
      ...(Array.isArray(dimensionamento.inversores_adicionais) ? dimensionamento.inversores_adicionais : [])
        .filter(i => i.marca || i.modelo)
        .map(i => ({ marca: i.marca || '', modelo: i.modelo || '', quantidade: Number(i.quantidade || 1) })),
    ];
    const inversorMap = new Map();
    allInversores.forEach(inv => {
      const key = `${inv.marca} ${inv.modelo}`.trim() || 'Inversor';
      if (inversorMap.has(key)) {
        inversorMap.get(key).quantidade += inv.quantidade;
      } else {
        inversorMap.set(key, { desc: key, quantidade: inv.quantidade });
      }
    });
    const inversorTableRows = Array.from(inversorMap.values()).map(inv => [
      'Inversor', inv.desc || '-', String(inv.quantidade), true,
    ]);

    const tableRows = [
      ['Placas',                  (dimensionamento.placa_modelo || '-'),
        String(dimensionamento.numero_paineis_necessarios || 1), true],
      ...inversorTableRows,
      ['Estruturas de fixação',   'Inclusas - quantidade necessária para instalação', '1', false],
      ['Cabos',                   'Inclusos - quantidade necessária para instalação',  '1', false],
      ['Conectores',              'Inclusos - quantidade necessária para instalação',  '1', false],
      ['Proteções',               'Inclusas - quantidade necessária para instalação',  '1', false],
      ['Materiais',               'Inclusos',   '1', false],
      ['Instalação',              'Inclusa',    '1', false],
      ['Homologação',             'Inclusa',    '1', false],
      ['Pós-venda',               'Incluso',    '1', false],
    ];

    // header row
    let ty = doc.y;
    doc.rect(ML, ty, W, 16).fill('#1E293B');
    doc.font('Helvetica-Bold').fontSize(7).fillColor('#FFF')
      .text('ITEM', ML + 6, ty + 5, { width: c1 - 10, lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(7).fillColor('#FFF')
      .text('MODELO / DESCRIÇÃO', ML + c1 + 6, ty + 5, { width: c2 - 10, lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(7).fillColor('#FFF')
      .text('QTD', ML + c1 + c2 + 4, ty + 5, { width: c3 - 6, align: 'right', lineBreak: false });
    ty += 16;

    tableRows.forEach(([item, desc, qty, isBold], idx) => {
      // Measure height needed for wrapped desc
      doc.font(isBold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.4);
      const dh = doc.heightOfString(desc, { width: c2 - 14, lineGap: 0 });
      const rh = Math.max(16, dh + 8);

      if (ty + rh > doc.page.height - doc.page.margins.bottom - 50) {
        drawPageFooter();
        doc.addPage();
        drawPageHeader('PROPOSTA COMERCIAL SOLAR (cont.)');
        ty = doc.y;
      }

      const bg = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
      doc.rect(ML, ty, W, rh).fill(bg);
      doc.rect(ML, ty, W, rh).lineWidth(0.5).stroke('#E2E8F0');

      const textVY = ty + Math.floor((rh - 8) / 2);
      doc.font('Helvetica').fontSize(7.4).fillColor('#374151')
        .text(item, ML + 6, textVY, { width: c1 - 10, lineBreak: false });
      doc.font(isBold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.4).fillColor(dark)
        .text(desc, ML + c1 + 6, ty + 5, { width: c2 - 14, lineGap: 0 });
      doc.font('Helvetica').fontSize(7.4).fillColor('#374151')
        .text(qty, ML + c1 + c2 + 4, textVY, { width: c3 - 6, align: 'right', lineBreak: false });

      ty += rh;
    });
    doc.y = ty;

    // Note about included items
    doc.moveDown(0.35);
    const noteY = doc.y;
    doc.roundedRect(ML, noteY, W, 28, 4).fill('#F8FAFC').stroke('#E2E8F0');
    doc.font('Helvetica-Bold').fontSize(6.8).fillColor(dark)
      .text('Itens inclusos em conjunto completo para instalação:', ML + 8, noteY + 5, { width: W - 16 });
    doc.font('Helvetica').fontSize(6.8).fillColor(muted)
      .text('estruturas de fixação, cabos, conectores, proteções, materiais, instalação, homologação e pós-venda inclusos, conforme projeto executivo e normas aplicáveis.', ML + 8, noteY + 15, { width: W - 16, lineGap: 0 });
    doc.y = noteY + 32;

    // OBSERVAÇÃO IMPORTANTE
    doc.moveDown(0.35);
    doc.roundedRect(ML, doc.y, W, 38, 4).fill('#FFFBEB').stroke('#FCD34D');
    const obsY = doc.y;
    doc.font('Helvetica-Bold').fontSize(7.4).fillColor('#92400E').text('OBSERVAÇÃO IMPORTANTE', ML + 10, obsY + 7, { width: W - 20 });
    doc.font('Helvetica').fontSize(7.3).fillColor('#92400E')
      .text('Reforma, melhoria ou reforço em telhado, bem como adequação do padrão de entrada da concessionária, ', ML + 10, obsY + 19, { continued: true, width: W - 20, lineGap: 0 });
    doc.font('Helvetica-Bold').fontSize(7.3).fillColor('#92400E')
      .text('não estão inclusos', { continued: true });
    doc.font('Helvetica').fontSize(7.3).fillColor('#92400E')
      .text(' nesta proposta. Caso sejam necessários, deverão ser avaliados e orçados separadamente.', { width: W - 20, lineGap: 0 });
    doc.y = obsY + 44;

    drawPageFooter();

    // ══════════════════════════════════════════════════════════════════════
    //  PAGE 2 — GARANTIAS E PÓS-VENDA
    // ══════════════════════════════════════════════════════════════════════
    doc.addPage();
    drawPageHeader('GARANTIAS E PÓS-VENDA');

    doc.font('Helvetica-Bold').fontSize(12).fillColor(dark).text('Informações complementares do seu orçamento');
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(9).fillColor(muted)
      .text('A seguir, apresentamos as condições de garantia e os serviços de pós-venda oferecidos pela DRM Energia Solar para este sistema fotovoltaico.', { lineGap: 2 });
    doc.moveDown(1.2);

    // GARANTIAS DRM section
    const g1hY = doc.y;
    doc.rect(ML, g1hY, W, 24).fill(dark);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#FFF').text('GARANTIAS DRM', ML + 10, g1hY + 7, { width: W - 20, align: 'center' });
    doc.y = g1hY + 30;
    doc.moveDown(0.5);

    const garantias = [
      'Materiais CA e CC de excelente qualidade',
      '10 anos de garantia do inversor',
      '15 anos de garantia de fábrica dos módulos e 30 anos de garantia de desempenho',
      '5 anos de garantia de instalação',
      'Geração prometida garantida',
    ];
    doc.roundedRect(ML, doc.y, W, garantias.length * 22 + 16, 6).fill('#FFFFFF').stroke('#E2E8F0');
    const gbY = doc.y;
    garantias.forEach((g, i) => {
      const gy = gbY + 10 + i * 22;
      doc.circle(ML + 16, gy + 5, 5).fill(orange);
      doc.font('Helvetica').fontSize(9).fillColor(dark).text(g, ML + 28, gy, { width: W - 40, lineBreak: false });
    });
    doc.y = gbY + garantias.length * 22 + 20;
    doc.moveDown(0.4);

    // Disclaimer garantias
    const g1dY = doc.y;
    doc.roundedRect(ML, g1dY, W, 28, 4).fill('#F8FAFC').stroke('#E2E8F0');
    doc.font('Helvetica').fontSize(7.5).fillColor(muted)
      .text('As garantias apresentadas seguem as condições dos fabricantes e os padrões de instalação adotados pela DRM Energia Solar.', ML + 8, g1dY + 8, { width: W - 16 });
    doc.y = g1dY + 36;
    doc.moveDown(0.9);

    // PÓS-VENDA DRM section
    const pv1hY = doc.y;
    doc.rect(ML, pv1hY, W, 24).fill(dark);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#FFF').text('PÓS-VENDA DRM', ML + 10, pv1hY + 7, { width: W - 20, align: 'center' });
    doc.y = pv1hY + 30;
    doc.moveDown(0.5);

    const posVenda = [
      'Análise das contas de energia após a instalação do sistema, bem como medidas cabíveis se necessário.',
      'Análise e acompanhamento do monitoramento do sistema através do aplicativo.',
      'A empresa é responsável por acionar a garantia e realizar todos os ensaios nos módulos e inversores necessários para tal.',
      'Em caso de goteira, a empresa envia técnico quantas vezes forem necessárias até que os vazamentos relativos à instalação sejam sanados, principalmente aqueles abaixo das placas.',
    ];
    const pvBoxH = posVenda.reduce((acc, txt) => {
      doc.font('Helvetica').fontSize(9);
      return acc + Math.max(22, doc.heightOfString(txt, { width: W - 40 }) + 8);
    }, 16);
    doc.roundedRect(ML, doc.y, W, pvBoxH, 6).fill('#FFFFFF').stroke('#E2E8F0');
    let pvY = doc.y;
    posVenda.forEach(txt => {
      const ty2 = pvY + 10;
      doc.circle(ML + 16, ty2 + 5, 5).fill(orange);
      doc.font('Helvetica').fontSize(9).fillColor(dark).text(txt, ML + 28, ty2, { width: W - 40 });
      pvY += Math.max(22, doc.heightOfString(txt, { width: W - 40 }) + 8);
    });
    doc.y = pvY + 10;
    doc.moveDown(1.5);

    // Disclaimer pós-venda
    const pv2dY = doc.y;
    doc.roundedRect(ML, pv2dY, W, 28, 4).fill('#F8FAFC').stroke('#E2E8F0');
    doc.font('Helvetica').fontSize(7.5).fillColor(muted)
      .text('O suporte pós-venda é parte integrante do atendimento DRM, garantindo acompanhamento após a instalação do sistema.', ML + 8, pv2dY + 8, { width: W - 16 });
    doc.y = pv2dY + 36;

    drawPageFooter();
    doc.end();
  });
};

const sendOrcamentoPdf = async (res, orcamento) => {
  const safeClientName = String(orcamento.clienteNome || 'cliente')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  const fileName = `orcamento-solar-${orcamento.id}-${safeClientName || 'cliente'}.pdf`;
  const pdf = await buildOrcamentoPdf(orcamento);
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
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
  `);

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
      clienteTelefone TEXT,
      clienteEmail TEXT,
      clienteCidade TEXT,
      status TEXT,
      data TEXT,
      tipo TEXT DEFAULT 'completo',
      dimensionamento TEXT,
      financeiro TEXT,
      assignedUserId INTEGER,
      assignedUserName TEXT,
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
      assinaturaStatus TEXT DEFAULT 'Pendente de assinaturas',
      assinaturaToken TEXT,
      assinaturaSolicitadaEm TEXT,
      assinaturaTokenExpiraEm TEXT,
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
      origem TEXT,
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
      equipamentoEnviadoAt TEXT,
      instalacaoAgendada TEXT,
      instalacaoConcluidaAt TEXT,
      pedidoLigacaoAt TEXT,
      previsaoLigacao TEXT,
      equipamentoEntregueAt TEXT,
      medidorTrocadoAt TEXT,
      pendenciasHomologacao TEXT,
      enviosHomologacao TEXT,
      documentosHomologacao TEXT,
      timeline TEXT,
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
      numeroOs TEXT,
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
      dados TEXT,
      dataAbertura TEXT,
      dataAtualizacao TEXT,
      dataFechamento TEXT
    );

    CREATE TABLE IF NOT EXISTS os_fotos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      osId INTEGER NOT NULL,
      dataUrl TEXT NOT NULL,
      tipo TEXT,
      mimeType TEXT,
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

    CREATE TABLE IF NOT EXISTS procuracoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clienteId INTEGER NOT NULL,
      contratoId INTEGER,
      titularMesmoContrato INTEGER DEFAULT 1,
      clienteNome TEXT NOT NULL,
      clienteCpfCnpj TEXT,
      clienteCidade TEXT,
      clienteEstado TEXT,
      clienteDados TEXT,
      status TEXT DEFAULT 'Pendente',
      criadoPorId INTEGER,
      criadoPorNome TEXT,
      analisadoPorId INTEGER,
      analisadoPorNome TEXT,
      observacaoAnalise TEXT,
      dataCriacao TEXT,
      dataAnalise TEXT,
      validadeAte TEXT,
      FOREIGN KEY (clienteId) REFERENCES clientes(id),
      FOREIGN KEY (contratoId) REFERENCES contratos(id)
    );

    CREATE TABLE IF NOT EXISTS lead_round_robin_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      nextIndex INTEGER NOT NULL DEFAULT 0,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lead_redirect_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      createdAt TEXT NOT NULL,
      ip TEXT,
      userAgent TEXT,
      sellerPhone TEXT NOT NULL,
      sellerPosition INTEGER NOT NULL,
      sellerName TEXT,
      referer TEXT,
      requestUrl TEXT,
      redirectUrl TEXT NOT NULL,
      utmParams TEXT,
      queryParams TEXT
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

    CREATE TABLE IF NOT EXISTS whatsapp_conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      leadId INTEGER,
      clienteNome TEXT,
      clienteTelefone TEXT NOT NULL,
      remoteJid TEXT,
      assignedUserId INTEGER,
      assignedUserName TEXT,
      status TEXT DEFAULT 'Aberta',
      lastMessage TEXT,
      lastMessageAt TEXT,
      unreadCount INTEGER DEFAULT 0,
      createdAt TEXT,
      updatedAt TEXT,
      UNIQUE(clienteTelefone)
    );

    CREATE TABLE IF NOT EXISTS whatsapp_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversationId INTEGER NOT NULL,
      direction TEXT NOT NULL,
      messageType TEXT DEFAULT 'text',
      text TEXT,
      mediaUrl TEXT,
      mimeType TEXT,
      fileName TEXT,
      fileSize INTEGER,
      providerMessageId TEXT,
      status TEXT,
      senderId INTEGER,
      senderName TEXT,
      createdAt TEXT,
      rawPayload TEXT,
      FOREIGN KEY (conversationId) REFERENCES whatsapp_conversations(id)
    );

    CREATE TABLE IF NOT EXISTS tabelas_precos_sistemas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      geracaoKwh REAL,
      numeroPaineis INTEGER,
      potenciaKwp REAL,
      potenciaInversorKw REAL,
      placaModelo TEXT,
      inversorModelo TEXT,
      valorKitSolar REAL DEFAULT 0,
      custoInstalacao REAL DEFAULT 0,
      materialCA REAL DEFAULT 0,
      deslocamento REAL DEFAULT 0,
      custoAdicional REAL DEFAULT 0,
      margemEmpresa REAL DEFAULT 0,
      comissaoPercentual REAL DEFAULT 0,
      custoBase REAL DEFAULT 0,
      valorComissao REAL DEFAULT 0,
      precoFinal REAL DEFAULT 0,
      observacoes TEXT,
      active INTEGER DEFAULT 1,
      criadoPorId INTEGER,
      criadoPorNome TEXT,
      createdAt TEXT,
      updatedAt TEXT
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

    CREATE TABLE IF NOT EXISTS client_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clienteId INTEGER NOT NULL,
      contratoId INTEGER,
      projetoId INTEGER,
      type TEXT NOT NULL DEFAULT 'info',
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      action TEXT DEFAULT 'project',
      readAt TEXT,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (clienteId) REFERENCES clientes(id)
    );

    CREATE TABLE IF NOT EXISTS client_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clienteId INTEGER NOT NULL,
      contratoId INTEGER,
      rating INTEGER NOT NULL,
      comment TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (clienteId) REFERENCES clientes(id)
    );

    CREATE TABLE IF NOT EXISTS client_referrals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clienteId INTEGER NOT NULL,
      nome TEXT NOT NULL,
      telefone TEXT NOT NULL,
      cidade TEXT,
      status TEXT NOT NULL DEFAULT 'Recebida',
      createdAt TEXT NOT NULL,
      FOREIGN KEY (clienteId) REFERENCES clientes(id)
    );

    CREATE TABLE IF NOT EXISTS email_campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaignKey TEXT NOT NULL UNIQUE,
      subject TEXT NOT NULL,
      imagePath TEXT,
      totalRecipients INTEGER DEFAULT 0,
      sentCount INTEGER DEFAULT 0,
      failedCount INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'draft',
      createdById INTEGER,
      createdAt TEXT NOT NULL,
      sentAt TEXT
    );

    CREATE TABLE IF NOT EXISTS mailing_contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      email TEXT NOT NULL UNIQUE,
      active INTEGER NOT NULL DEFAULT 1,
      source TEXT,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS communication_campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      templateId TEXT,
      audience TEXT NOT NULL,
      subject TEXT NOT NULL,
      heading TEXT NOT NULL,
      message TEXT NOT NULL,
      ctaLabel TEXT,
      ctaUrl TEXT,
      totalRecipients INTEGER DEFAULT 0,
      sentCount INTEGER DEFAULT 0,
      failedCount INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'draft',
      createdById INTEGER,
      createdByName TEXT,
      createdAt TEXT NOT NULL,
      sentAt TEXT
    );

    CREATE TABLE IF NOT EXISTS communication_deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaignId INTEGER,
      uniqueKey TEXT UNIQUE,
      audience TEXT,
      email TEXT NOT NULL,
      name TEXT,
      subject TEXT,
      status TEXT NOT NULL,
      error TEXT,
      sentAt TEXT
    );

    CREATE TABLE IF NOT EXISTS email_campaign_deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaignId INTEGER NOT NULL,
      email TEXT NOT NULL,
      name TEXT,
      status TEXT NOT NULL,
      error TEXT,
      sentAt TEXT,
      UNIQUE(campaignId, email),
      FOREIGN KEY (campaignId) REFERENCES email_campaigns(id)
    );

    CREATE TABLE IF NOT EXISTS marcas_inversor_hibrido (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome_marca TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'ativo',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS modelos_inversor_hibrido (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      marca_id INTEGER NOT NULL,
      nome_modelo TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ativo',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(marca_id, nome_modelo),
      FOREIGN KEY (marca_id) REFERENCES marcas_inversor_hibrido(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS baterias_litio_compativeis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      modelo_hibrido_id INTEGER NOT NULL,
      nome_bateria TEXT NOT NULL,
      capacidade_kwh TEXT,
      status TEXT NOT NULL DEFAULT 'ativo',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(modelo_hibrido_id, nome_bateria),
      FOREIGN KEY (modelo_hibrido_id) REFERENCES modelos_inversor_hibrido(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS placas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      modelo TEXT NOT NULL UNIQUE,
      potencia_w TEXT,
      status TEXT NOT NULL DEFAULT 'ativo',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS marcas_inversor (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome_marca TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'ativo',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS modelos_inversor (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      marca_id INTEGER NOT NULL,
      nome_modelo TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ativo',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(marca_id, nome_modelo),
      FOREIGN KEY (marca_id) REFERENCES marcas_inversor(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_lead_redirect_logs_createdAt ON lead_redirect_logs(createdAt);
    CREATE INDEX IF NOT EXISTS idx_lead_redirect_logs_sellerPhone ON lead_redirect_logs(sellerPhone);
    CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_assigned ON whatsapp_conversations(assignedUserId);
    CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_updated ON whatsapp_conversations(updatedAt);
    CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_conversation ON whatsapp_messages(conversationId, createdAt);
  `);

  await db.run(
    `INSERT OR IGNORE INTO lead_round_robin_state (id, nextIndex, updatedAt)
     VALUES (1, 0, ?)`,
    new Date().toISOString()
  );

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
  if (!existingOrcamentoColumns.includes('tipo')) {
    await db.exec("ALTER TABLE orcamentos ADD COLUMN tipo TEXT DEFAULT 'completo'");
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
  if (!existingLeadColumns.includes('tipoCadastro')) {
    await db.exec("ALTER TABLE leads ADD COLUMN tipoCadastro TEXT DEFAULT 'site'");
  }
  if (!existingLeadColumns.includes('criadoPorId')) {
    await db.exec('ALTER TABLE leads ADD COLUMN criadoPorId INTEGER');
  }
  if (!existingLeadColumns.includes('criadoPorNome')) {
    await db.exec('ALTER TABLE leads ADD COLUMN criadoPorNome TEXT');
  }

  const whatsappConversationColumns = await db.all('PRAGMA table_info(whatsapp_conversations)');
  const existingWhatsappConversationColumns = whatsappConversationColumns.map(column => column.name);
  if (!existingWhatsappConversationColumns.includes('remoteJid')) {
    await db.exec('ALTER TABLE whatsapp_conversations ADD COLUMN remoteJid TEXT');
  }
  const whatsappMessageColumns = await db.all('PRAGMA table_info(whatsapp_messages)');
  const existingWhatsappMessageColumns = whatsappMessageColumns.map(column => column.name);
  const whatsappMediaColumns = [
    ['mediaUrl', 'TEXT'],
    ['mimeType', 'TEXT'],
    ['fileName', 'TEXT'],
    ['fileSize', 'INTEGER'],
  ];
  for (const [column, definition] of whatsappMediaColumns) {
    if (!existingWhatsappMessageColumns.includes(column)) {
      await db.exec(`ALTER TABLE whatsapp_messages ADD COLUMN ${column} ${definition}`);
    }
  }
  await db.exec(`
    UPDATE whatsapp_conversations
    SET remoteJid = clienteTelefone || '@s.whatsapp.net'
    WHERE (remoteJid IS NULL OR remoteJid = '') AND clienteTelefone IS NOT NULL AND clienteTelefone != ''
  `);
  await db.exec(`
    UPDATE whatsapp_conversations
    SET status = 'Arquivada', unreadCount = 0, updatedAt = CURRENT_TIMESTAMP
    WHERE remoteJid LIKE '%@g.us'
       OR remoteJid = 'status@broadcast'
       OR remoteJid LIKE '%@broadcast'
       OR remoteJid LIKE '%@newsletter'
       OR remoteJid LIKE '%@lid'
  `);
  const pendingQueueCleaned = await getSetting('whatsappPendingQueueCleanedForNewInboxV1', false);
  if (!pendingQueueCleaned) {
    await db.exec(`
      UPDATE whatsapp_conversations
      SET status = 'Arquivada', unreadCount = 0, updatedAt = CURRENT_TIMESTAMP
      WHERE status = 'Aguardando atendimento'
    `);
    await setSetting('whatsappPendingQueueCleanedForNewInboxV1', {
      cleanedAt: new Date().toISOString(),
      reason: 'Fila antiga arquivada para exibir apenas novas conversas individuais recebidas pelo WhatsApp.',
    });
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
  if (!existingContratoColumns.includes('consultorId')) {
    await db.exec('ALTER TABLE contratos ADD COLUMN consultorId INTEGER');
  }
  if (!existingContratoColumns.includes('consultorNome')) {
    await db.exec('ALTER TABLE contratos ADD COLUMN consultorNome TEXT');
  }
  if (!existingContratoColumns.includes('assinaturaStatus')) {
    await db.exec("ALTER TABLE contratos ADD COLUMN assinaturaStatus TEXT DEFAULT 'Pendente de assinaturas'");
  }
  if (!existingContratoColumns.includes('assinaturaToken')) {
    await db.exec('ALTER TABLE contratos ADD COLUMN assinaturaToken TEXT');
  }
  if (!existingContratoColumns.includes('assinaturaSolicitadaEm')) {
    await db.exec('ALTER TABLE contratos ADD COLUMN assinaturaSolicitadaEm TEXT');
  }
  if (!existingContratoColumns.includes('assinaturaTokenExpiraEm')) {
    await db.exec('ALTER TABLE contratos ADD COLUMN assinaturaTokenExpiraEm TEXT');
  }
  await db.exec(`
    UPDATE contratos
    SET consultorId = COALESCE(consultorId, assignedUserId, criadoPorId),
        consultorNome = COALESCE(NULLIF(consultorNome, ''), NULLIF(assignedUserName, ''), NULLIF(criadoPorNome, ''))
    WHERE consultorId IS NULL OR consultorNome IS NULL OR consultorNome = ''
  `);
  const contratosParaAssinatura = await db.all('SELECT id, dados, assinaturaStatus FROM contratos');
  for (const contrato of contratosParaAssinatura) {
    const assinaturaStatus = resolveAssinaturaStatus(parseJsonField(contrato.dados)?.assinatura || {});
    if (assinaturaStatus !== (contrato.assinaturaStatus || '')) {
      await db.run('UPDATE contratos SET assinaturaStatus = ? WHERE id = ?', assinaturaStatus, contrato.id);
    }
  }

  const procuracaoColumns = await db.all('PRAGMA table_info(procuracoes)');
  const existingProcuracaoColumns = procuracaoColumns.map(column => column.name);
  if (!existingProcuracaoColumns.includes('contratoId')) {
    await db.exec('ALTER TABLE procuracoes ADD COLUMN contratoId INTEGER');
  }
  if (!existingProcuracaoColumns.includes('titularMesmoContrato')) {
    await db.exec('ALTER TABLE procuracoes ADD COLUMN titularMesmoContrato INTEGER DEFAULT 1');
  }
  await db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_procuracoes_contrato_unique ON procuracoes(contratoId) WHERE contratoId IS NOT NULL');

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
    ['equipamentoEnviadoAt', 'TEXT'],
    ['instalacaoAgendada', 'TEXT'],
    ['instalacaoConcluidaAt', 'TEXT'],
    ['pedidoLigacaoAt', 'TEXT'],
    ['previsaoLigacao', 'TEXT'],
    ['equipamentoEntregueAt', 'TEXT'],
    ['medidorTrocadoAt', 'TEXT'],
    ['pendenciasHomologacao', 'TEXT'],
    ['enviosHomologacao', 'TEXT'],
    ['documentosHomologacao', 'TEXT'],
    ['timeline', 'TEXT'],
    ['documentosCliente', 'TEXT'],
    ['documentosProjetista', 'TEXT'],
    ['documentosConcessionaria', 'TEXT'],
    ['observacoesInternas', 'TEXT'],
    ['concessionaria', 'TEXT'],
    ['statusDocumental', 'TEXT'],
    ['responsavelTecnicoNome', 'TEXT'],
    ['responsavelTecnicoId', 'INTEGER'],
    ['slaAtual', 'TEXT'],
  ]) {
    if (!existingProjetoColumns.includes(field)) {
      await db.exec(`ALTER TABLE projetos ADD COLUMN ${field} ${definition}`);
    }
  }

  const atividadeColumns = await db.all('PRAGMA table_info(atividades)');
  const existingAtividadeColumns = atividadeColumns.map(column => column.name);
  if (!existingAtividadeColumns.includes('origem')) {
    await db.exec('ALTER TABLE atividades ADD COLUMN origem TEXT');
  }

  const osColumns = await db.all('PRAGMA table_info(ordens_servico)');
  const existingOsColumns = osColumns.map(column => column.name);
  for (const [field, definition] of [
    ['numeroOs', 'TEXT'],
    ['dados', 'TEXT'],
  ]) {
    if (!existingOsColumns.includes(field)) {
      await db.exec(`ALTER TABLE ordens_servico ADD COLUMN ${field} ${definition}`);
    }
  }

  const osFotosColumns = await db.all('PRAGMA table_info(os_fotos)');
  const existingOsFotosColumns = osFotosColumns.map(column => column.name);
  for (const [field, definition] of [
    ['tipo', 'TEXT'],
    ['mimeType', 'TEXT'],
  ]) {
    if (!existingOsFotosColumns.includes(field)) {
      await db.exec(`ALTER TABLE os_fotos ADD COLUMN ${field} ${definition}`);
    }
  }

  const usuarioColumns = await db.all('PRAGMA table_info(usuarios)');
  const existingUsuarioColumns = usuarioColumns.map(column => column.name);
  if (!existingUsuarioColumns.includes('whatsapp')) {
    await db.exec('ALTER TABLE usuarios ADD COLUMN whatsapp TEXT');
  }
  if (!existingUsuarioColumns.includes('quickActions')) {
    await db.exec('ALTER TABLE usuarios ADD COLUMN quickActions TEXT');
  }
  if (!existingUsuarioColumns.includes('whatsappConfirmed')) {
    await db.exec('ALTER TABLE usuarios ADD COLUMN whatsappConfirmed INTEGER DEFAULT 0');
  }
  for (const [field, definition] of emailVerificationColumns) {
    if (!existingUsuarioColumns.includes(field)) {
      await db.exec(`ALTER TABLE usuarios ADD COLUMN ${field} ${definition}`);
    }
  }

  await db.run(
    `UPDATE usuarios
        SET whatsapp = ?
      WHERE lower(username) = 'carlito'
        AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(whatsapp, ''), ' ', ''), '-', ''), '(', ''), ')', ''), '+', '') = ?`,
    '5599992276744',
    '559992276744'
  );

  await db.run(
    `UPDATE usuarios
        SET whatsapp = ?
      WHERE lower(username) = 'deivson'
        AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(whatsapp, ''), ' ', ''), '-', ''), '(', ''), ')', ''), '+', '') = ?`,
    '559991675608',
    '559985127056'
  );

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
        JSON.stringify(normalizePermissions(user.permissions)),
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

  const savedUsers = await db.all('SELECT id, username, permissions FROM usuarios');
  for (const savedUser of savedUsers) {
    let rawPermissions = {};
    try {
      rawPermissions = savedUser.permissions ? JSON.parse(savedUser.permissions) : {};
    } catch {}

    const normalizedSavedPermissions = normalizePermissions(
      String(savedUser.username || '').toLowerCase() === 'renejr'
        ? { ...rawPermissions, clientes: true, gerenciarClientes: true }
        : rawPermissions
    );
    if (JSON.stringify(normalizedSavedPermissions) !== JSON.stringify(mergePermissions(rawPermissions))) {
      await db.run(
        'UPDATE usuarios SET permissions = ? WHERE id = ?',
        JSON.stringify(normalizedSavedPermissions),
        savedUser.id
      );
      rawPermissions = normalizedSavedPermissions;
    }

    if (rawPermissions.orcamentos === true && typeof rawPermissions.contratos === 'undefined') {
      await db.run(
        'UPDATE usuarios SET permissions = ? WHERE id = ?',
        JSON.stringify(normalizePermissions({ ...rawPermissions, contratos: true })),
        savedUser.id
      );
    }
    if (rawPermissions.equipeTecnica === true && rawPermissions.ordensServico !== true) {
      await db.run(
        'UPDATE usuarios SET permissions = ? WHERE id = ?',
        JSON.stringify(normalizePermissions({ ...rawPermissions, ordensServico: true })),
        savedUser.id
      );
    }
    if ((rawPermissions.financeiro === true || rawPermissions.equipeTecnica === true) && rawPermissions.precosSistemas !== true) {
      await db.run(
        'UPDATE usuarios SET permissions = ? WHERE id = ?',
        JSON.stringify(normalizePermissions({ ...rawPermissions, precosSistemas: true })),
        savedUser.id
      );
    }
    if (rawPermissions.leads === true && typeof rawPermissions.whatsapp === 'undefined') {
      await db.run(
        'UPDATE usuarios SET permissions = ? WHERE id = ?',
        JSON.stringify(normalizePermissions({ ...rawPermissions, whatsapp: true })),
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

app.get('/rleads', async (req, res) => {
  let transactionStarted = false;
  try {
    await db.exec('BEGIN IMMEDIATE TRANSACTION');
    transactionStarted = true;

    const state = await db.get('SELECT nextIndex FROM lead_round_robin_state WHERE id = 1');
    const currentIndex = Number(state?.nextIndex || 0);
    const seller = ROUND_ROBIN_SELLERS[currentIndex % ROUND_ROBIN_SELLERS.length];
    const nextIndex = (currentIndex + 1) % ROUND_ROBIN_SELLERS.length;
    const redirectUrl = buildWhatsAppRedirectUrl(seller.phone, req.query);
    const now = new Date().toISOString();
    const queryParams = pickQueryEntries(req.query);
    const utmParams = pickQueryEntries(req.query, key => key.toLowerCase().startsWith('utm_'));

    await db.run(
      'UPDATE lead_round_robin_state SET nextIndex = ?, updatedAt = ? WHERE id = 1',
      nextIndex,
      now
    );
    await db.run(
      `INSERT INTO lead_redirect_logs
        (createdAt, ip, userAgent, sellerPhone, sellerPosition, sellerName, referer, requestUrl, redirectUrl, utmParams, queryParams)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      now,
      String(req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim().slice(0, 80),
      String(req.headers['user-agent'] || '').slice(0, 500),
      seller.phone,
      seller.position,
      seller.name,
      String(req.headers.referer || req.headers.referrer || '').slice(0, 1000),
      String(req.originalUrl || req.url || '/rleads').slice(0, 1000),
      redirectUrl,
      JSON.stringify(utmParams).slice(0, 2000),
      JSON.stringify(queryParams).slice(0, 4000)
    );

    await db.exec('COMMIT');
    transactionStarted = false;
    return res.redirect(302, redirectUrl);
  } catch (error) {
    if (transactionStarted) {
      try {
        await db.exec('ROLLBACK');
      } catch {}
    }
    console.error('ERRO NO RODIZIO DE LEADS:', error);
    return res.status(503).send('Servico de distribuicao temporariamente indisponivel.');
  }
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
        (nome, telefone, email, cidade, origem, status, dataCadastro, assignedUserId, assignedUserName, tipoCadastro)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      leadData.nome,
      leadData.telefone,
      leadData.email,
      leadData.cidade,
      'Simulação do site',
      'Novo',
      dataCadastro,
      owner?.id || null,
      owner?.nome || null,
      'site'
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
      assignedUserName: owner?.nome || null,
      tipoCadastro: 'site'
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
app.post('/api/login', loginRateLimiter, async (req, res) => {
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
    try {
      await sendAutomaticPortalWelcome({ ...updated, userType: req.user.userType });
    } catch (welcomeError) {
      console.error('Erro ao enviar boas-vindas automáticas:', welcomeError);
    }
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

// Consultor cadastra/confirma o próprio WhatsApp (modal de primeiro acesso).
app.put('/api/me/whatsapp', authRequired, async (req, res) => {
  if (req.user.userType !== 'interno') {
    return res.status(403).json({ message: 'Apenas usuários internos cadastram WhatsApp de atendimento.' });
  }

  const phone = normalizeWhatsAppPhone(req.body?.whatsapp);
  if (!phone || !isPlausibleContactPhone(phone) || !phone.startsWith('55')) {
    return res.status(400).json({ message: 'Informe um número de WhatsApp válido com DDD (ex: 99 99999-9999).' });
  }

  // Verifica se o número realmente existe no WhatsApp (quando a sessão está ativa).
  if (whatsappRuntime.connected && whatsappRuntime.socket) {
    try {
      const results = await whatsappRuntime.socket.onWhatsApp(phone);
      const match = Array.isArray(results) ? results.find(r => r?.exists) : null;
      if (!match) {
        return res.status(400).json({ message: 'Esse número não foi encontrado no WhatsApp. Confira e tente novamente.' });
      }
    } catch (error) {
      console.error('Erro ao verificar número no WhatsApp:', error?.message || error);
      // Não bloqueia se a checagem falhar por instabilidade da sessão.
    }
  }

  await db.run(
    'UPDATE usuarios SET whatsapp = ?, whatsappConfirmed = 1 WHERE id = ?',
    phone,
    req.user.id
  );
  const updated = await db.get('SELECT * FROM usuarios WHERE id = ?', req.user.id);
  res.json({ user: sanitizeUser({ ...updated, permissions: parsePermissions(updated.permissions) }) });
});

app.get('/api/admin/quick-actions', authRequired, async (req, res) => {
  if (req.user.userType !== 'interno') return res.status(403).json({ message: 'Apenas usuários internos podem configurar ações rápidas.' });
  res.json({ quickActions: parseQuickActions(req.user.quickActions) });
});

app.put('/api/admin/quick-actions', authRequired, async (req, res) => {
  if (req.user.userType !== 'interno') return res.status(403).json({ message: 'Apenas usuários internos podem configurar ações rápidas.' });
  const quickActions = Array.isArray(req.body.quickActions)
    ? req.body.quickActions.filter(item => typeof item === 'string').slice(0, 12)
    : null;
  await db.run('UPDATE usuarios SET quickActions = ? WHERE id = ?', quickActions ? JSON.stringify(quickActions) : null, req.user.id);
  res.json({ quickActions });
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
  const projetoIds = projetos.map(item => item.id);
  const projetoFotos = projetoIds.length
    ? await db.all(`SELECT * FROM projeto_fotos WHERE projetoId IN (${projetoIds.map(() => '?').join(',')}) ORDER BY createdAt DESC, id DESC`, ...projetoIds)
    : [];
  const fotosByProjeto = projetoFotos.reduce((acc, foto) => {
    acc[foto.projetoId] = acc[foto.projetoId] || [];
    acc[foto.projetoId].push(foto);
    return acc;
  }, {});
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
  const notifications = await db.all(
    'SELECT * FROM client_notifications WHERE clienteId = ? ORDER BY createdAt DESC, id DESC LIMIT 80',
    cliente.id
  );
  const feedback = await db.get(
    'SELECT * FROM client_feedback WHERE clienteId = ? ORDER BY updatedAt DESC LIMIT 1',
    cliente.id
  );
  const referrals = await db.all(
    'SELECT * FROM client_referrals WHERE clienteId = ? ORDER BY createdAt DESC, id DESC LIMIT 20',
    cliente.id
  );

  res.json({
    cliente: publicClient(cliente),
    contratos,
    projetos: projetos.map(projeto => ({ ...projeto, fotos: fotosByProjeto[projeto.id] || [] })),
    ordensServico: ordensServico.map(os => parseOs({ ...os, fotos: fotosByOs[os.id] || [] })),
    notifications,
    feedback,
    referrals,
  });
});

app.put('/api/cliente/notificacoes/lidas', authRequired, requireClientUser, async (req, res) => {
  const now = new Date().toISOString();
  await db.run(
    'UPDATE client_notifications SET readAt = COALESCE(readAt, ?) WHERE clienteId = ?',
    now,
    req.user.id
  );
  res.json({ message: 'Notificações marcadas como lidas.', readAt: now });
});

app.post('/api/cliente/mensagens', authRequired, requireClientUser, async (req, res) => {
  const cliente = await db.get('SELECT * FROM clientes WHERE id = ?', req.user.id);
  if (!cliente) return res.status(404).json({ message: 'Cliente não encontrado.' });
  const { contratoId = null, assunto = 'Mensagem pelo portal', mensagem } = req.body;
  if (!String(mensagem || '').trim()) return res.status(400).json({ message: 'Escreva uma mensagem para enviar.' });
  const contratos = await getClienteContratoRows(cliente);
  const contrato = contratoId ? contratos.find(item => Number(item.id) === Number(contratoId)) : contratos[0];
  if (contratoId && !contrato) return res.status(403).json({ message: 'Contrato não pertence a este cliente.' });
  const now = new Date().toISOString();
  const result = await db.run(
    `INSERT INTO ordens_servico
      (clienteNome, clienteTelefone, contratoId, origem, problema, categoria, prioridade, status, responsavelId, responsavelNome, observacoes, dataAbertura, dataAtualizacao)
     VALUES (?, ?, ?, 'Portal do cliente', ?, 'Mensagem', 'Normal', 'Aberta', ?, ?, ?, ?, ?)`,
    cliente.nome,
    cliente.whatsapp,
    contrato?.id || null,
    String(mensagem).trim(),
    contrato?.assignedUserId || null,
    contrato?.assignedUserName || null,
    String(assunto || 'Mensagem pelo portal').trim(),
    now,
    now
  );
  await createClientNotification({
    clienteId: cliente.id,
    contratoId: contrato?.id || null,
    type: 'success',
    title: 'Mensagem enviada',
    message: 'A equipe DRM recebeu sua mensagem e responderá pelo acompanhamento da solicitação.',
    action: 'communication',
  });
  const created = parseOs(await db.get('SELECT * FROM ordens_servico WHERE id = ?', result.lastID));
  io.emit('os_atualizada', created);
  res.status(201).json(created);
});

app.post('/api/cliente/avaliacao', authRequired, requireClientUser, async (req, res) => {
  const rating = Number(req.body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ message: 'Escolha uma avaliação entre 1 e 5.' });
  }
  const now = new Date().toISOString();
  const existing = await db.get('SELECT id FROM client_feedback WHERE clienteId = ? ORDER BY id DESC LIMIT 1', req.user.id);
  if (existing) {
    await db.run(
      'UPDATE client_feedback SET contratoId = ?, rating = ?, comment = ?, updatedAt = ? WHERE id = ?',
      req.body.contratoId || null,
      rating,
      String(req.body.comment || '').trim(),
      now,
      existing.id
    );
  } else {
    await db.run(
      'INSERT INTO client_feedback (clienteId, contratoId, rating, comment, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
      req.user.id,
      req.body.contratoId || null,
      rating,
      String(req.body.comment || '').trim(),
      now,
      now
    );
  }
  res.json({ message: 'Obrigado pela avaliação. Ela foi enviada para a equipe DRM.' });
});

app.post('/api/cliente/indicacoes', authRequired, requireClientUser, async (req, res) => {
  const { nome, telefone, cidade = '' } = req.body;
  if (!String(nome || '').trim() || normalizeWhatsAppPhone(telefone).length < 12) {
    return res.status(400).json({ message: 'Informe o nome e um WhatsApp válido da pessoa indicada.' });
  }
  const now = new Date().toISOString();
  const result = await db.run(
    'INSERT INTO client_referrals (clienteId, nome, telefone, cidade, status, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
    req.user.id,
    String(nome).trim(),
    normalizeWhatsAppPhone(telefone),
    String(cidade).trim(),
    'Recebida',
    now
  );
  res.status(201).json({ id: result.lastID, nome: String(nome).trim(), telefone: normalizeWhatsAppPhone(telefone), cidade: String(cidade).trim(), status: 'Recebida', createdAt: now });
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
  await createClientNotification({
    clienteId: cliente.id,
    contratoId: authorizedContract?.id || null,
    type: 'service',
    title: 'Solicitação aberta',
    message: `Sua solicitação #${result.lastID} foi recebida e já está no acompanhamento da equipe DRM.`,
    action: 'communication',
  });
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
  await createClientNotification({
    clienteId: cliente.id,
    contratoId: projeto.contratoId,
    projetoId: projeto.id,
    type: 'success',
    title: 'Entrega confirmada',
    message: 'Recebemos sua confirmação de entrega. A equipe seguirá com os próximos passos.',
    action: 'tracking',
  });
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
  await createClientNotification({
    clienteId: cliente.id,
    contratoId: projeto.contratoId,
    projetoId: projeto.id,
    type: 'success',
    title: 'Troca do medidor confirmada',
    message: 'A DRM recebeu sua confirmação da troca do medidor pela Equatorial.',
    action: 'tracking',
  });
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

app.post('/api/admin/clientes', authRequired, requirePermission('clientes'), async (req, res) => {
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

app.put('/api/admin/clientes/:id', authRequired, requirePermission('clientes'), async (req, res) => {
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

app.put('/api/admin/clientes/:id/etapa-comercial', authRequired, requirePermission('clientes'), async (req, res) => {
  const { etapaComercial, motivoSuspensao, dataPrevisaoRetorno, ultimoContatoComercial, proximaAcaoComercial } = req.body;
  const etapasValidas = ['Em negociação', 'Venda concluída', 'Venda suspensa'];
  if (!etapasValidas.includes(etapaComercial)) {
    return res.status(400).json({ message: 'Etapa comercial inválida.' });
  }
  if (etapaComercial === 'Venda suspensa' && !String(motivoSuspensao || '').trim()) {
    return res.status(400).json({ message: 'O motivo da suspensão é obrigatório.' });
  }
  const cliente = await db.get('SELECT * FROM clientes WHERE id = ?', req.params.id);
  if (!cliente) return res.status(404).json({ message: 'Cliente não encontrado.' });

  const historicoAtual = parseJsonField(cliente.historicoSuspensao, []);
  const novoHistorico = etapaComercial === 'Venda suspensa'
    ? [{ id: `${Date.now()}`, data: new Date().toISOString(), etapa: etapaComercial, motivo: motivoSuspensao, responsavel: req.user.nome || req.user.username }, ...historicoAtual.slice(0, 19)]
    : etapaComercial !== cliente.etapaComercial
      ? [{ id: `${Date.now()}`, data: new Date().toISOString(), etapa: etapaComercial, motivo: `Alterado de ${cliente.etapaComercial || 'Em negociação'} para ${etapaComercial}`, responsavel: req.user.nome || req.user.username }, ...historicoAtual.slice(0, 19)]
      : historicoAtual;

  await db.run(
    `UPDATE clientes SET etapaComercial = ?, motivoSuspensao = ?, dataSuspensao = ?, dataPrevisaoRetorno = ?, ultimoContatoComercial = ?, proximaAcaoComercial = ?, consultorId = ?, consultorNome = ?, historicoSuspensao = ? WHERE id = ?`,
    etapaComercial,
    etapaComercial === 'Venda suspensa' ? (motivoSuspensao || null) : null,
    etapaComercial === 'Venda suspensa' ? new Date().toISOString().split('T')[0] : null,
    dataPrevisaoRetorno || null,
    ultimoContatoComercial || null,
    proximaAcaoComercial || null,
    req.user.id,
    req.user.nome || req.user.username,
    JSON.stringify(novoHistorico),
    req.params.id
  );
  const updated = publicClient(await db.get('SELECT * FROM clientes WHERE id = ?', req.params.id));
  res.json(updated);
});

app.put('/api/admin/projetos/:id/detalhes-homologacao', authRequired, requirePermission('equipeTecnica'), async (req, res) => {
  const { concessionaria, statusDocumental, observacoesInternas, responsavelTecnicoNome, responsavelTecnicoId, slaAtual } = req.body;
  const projeto = await db.get('SELECT * FROM projetos WHERE id = ?', req.params.id);
  if (!projeto) return res.status(404).json({ message: 'Projeto não encontrado.' });

  await db.run(
    `UPDATE projetos SET concessionaria = COALESCE(?, concessionaria), statusDocumental = COALESCE(?, statusDocumental), observacoesInternas = COALESCE(?, observacoesInternas), responsavelTecnicoNome = COALESCE(?, responsavelTecnicoNome), responsavelTecnicoId = COALESCE(?, responsavelTecnicoId), slaAtual = COALESCE(?, slaAtual), updatedAt = ? WHERE id = ?`,
    concessionaria || null, statusDocumental || null, observacoesInternas || null,
    responsavelTecnicoNome || null, responsavelTecnicoId || null, slaAtual || null,
    new Date().toISOString(), req.params.id
  );
  res.json(parseProjeto(await db.get('SELECT * FROM projetos WHERE id = ?', req.params.id)));
});

app.post('/api/admin/projetos/:id/documentos', authRequired, requirePermission('equipeTecnica'), async (req, res) => {
  const projeto = await db.get('SELECT * FROM projetos WHERE id = ?', req.params.id);
  if (!projeto) return res.status(404).json({ message: 'Projeto não encontrado.' });

  const { tipo, nome, descricao, dataUrl, arquivo, categoria, localizacaoCliente } = req.body;
  const tiposValidos = ['cliente', 'projetista', 'concessionaria'];
  if (!tiposValidos.includes(tipo)) return res.status(400).json({ message: 'Tipo de documento inválido.' });
  const validatedDocument = validateProjectDocumentDataUrl(dataUrl);
  if (!validatedDocument.valid) return res.status(400).json({ message: validatedDocument.message });

  const field = tipo === 'cliente' ? 'documentosCliente' : tipo === 'projetista' ? 'documentosProjetista' : 'documentosConcessionaria';
  const docs = parseJsonField(projeto[field], []);
  const novoDoc = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    nome: nome || 'Documento',
    descricao: descricao || '',
    arquivo: arquivo || '',
    dataUrl: validatedDocument.dataUrl,
    categoria: categoria || tipo,
    localizacaoCliente: localizacaoCliente || '',
    status: dataUrl ? 'Concluído' : 'Pendente',
    responsavel: req.user.nome || req.user.username,
    data: new Date().toISOString().split('T')[0],
  };
  docs.push(novoDoc);
  const timeline = appendProjetoTimeline(projeto, timelineEvent({ tipo: 'documento', titulo: `Documento adicionado: ${novoDoc.nome}`, descricao: `Categoria: ${tipo}. Responsável: ${novoDoc.responsavel}`, responsavel: novoDoc.responsavel }));
  await db.run(`UPDATE projetos SET ${field} = ?, timeline = ?, updatedAt = ? WHERE id = ?`, JSON.stringify(docs), JSON.stringify(timeline), new Date().toISOString(), req.params.id);
  res.status(201).json(parseProjeto(await db.get('SELECT * FROM projetos WHERE id = ?', req.params.id)));
});

app.put('/api/admin/projetos/:id/documentos/:docId', authRequired, requirePermission('equipeTecnica'), async (req, res) => {
  const projeto = await db.get('SELECT * FROM projetos WHERE id = ?', req.params.id);
  if (!projeto) return res.status(404).json({ message: 'Projeto não encontrado.' });

  const { tipo, status, dataUrl, arquivo, localizacaoCliente } = req.body;
  const tiposValidos = ['cliente', 'projetista', 'concessionaria'];
  if (!tiposValidos.includes(tipo)) return res.status(400).json({ message: 'Tipo de documento inválido.' });
  const validatedDocument = dataUrl === undefined ? null : validateProjectDocumentDataUrl(dataUrl);
  if (validatedDocument && !validatedDocument.valid) return res.status(400).json({ message: validatedDocument.message });

  const field = tipo === 'cliente' ? 'documentosCliente' : tipo === 'projetista' ? 'documentosProjetista' : 'documentosConcessionaria';
  const docs = parseJsonField(projeto[field], []);
  const idx = docs.findIndex(d => d.id === req.params.docId);
  if (idx === -1) return res.status(404).json({ message: 'Documento não encontrado.' });

  docs[idx] = {
    ...docs[idx],
    status: status || docs[idx].status,
    dataUrl: validatedDocument ? validatedDocument.dataUrl : docs[idx].dataUrl,
    arquivo: arquivo || docs[idx].arquivo,
    localizacaoCliente: localizacaoCliente !== undefined ? localizacaoCliente : docs[idx].localizacaoCliente,
    responsavel: req.user.nome || req.user.username,
    data: new Date().toISOString().split('T')[0],
  };
  await db.run(`UPDATE projetos SET ${field} = ?, updatedAt = ? WHERE id = ?`, JSON.stringify(docs), new Date().toISOString(), req.params.id);
  res.json(parseProjeto(await db.get('SELECT * FROM projetos WHERE id = ?', req.params.id)));
});

app.delete('/api/admin/projetos/:id/documentos/:docId', authRequired, requirePermission('equipeTecnica'), async (req, res) => {
  const projeto = await db.get('SELECT * FROM projetos WHERE id = ?', req.params.id);
  if (!projeto) return res.status(404).json({ message: 'Projeto não encontrado.' });

  const tipo = req.query.tipo || 'cliente';
  const field = tipo === 'cliente' ? 'documentosCliente' : tipo === 'projetista' ? 'documentosProjetista' : 'documentosConcessionaria';
  const docs = parseJsonField(projeto[field], []).filter(d => d.id !== req.params.docId);
  await db.run(`UPDATE projetos SET ${field} = ?, updatedAt = ? WHERE id = ?`, JSON.stringify(docs), new Date().toISOString(), req.params.id);
  res.json({ message: 'Documento removido.' });
});

app.get('/api/admin/leads', authRequired, requirePermission('leads'), async (req, res) => {
  const leads = isMasterAdminUser(req.user)
    ? await db.all('SELECT * FROM leads ORDER BY id DESC')
    : await db.all('SELECT * FROM leads WHERE assignedUserId = ? ORDER BY id DESC', req.user.id);
  res.json(leads);
});

app.get('/api/admin/lead-owners', authRequired, requirePermission('leads'), async (req, res) => {
  const users = await db.all('SELECT * FROM usuarios WHERE active = 1 ORDER BY nome ASC');
  const owners = users
    .map(user => ({ ...user, permissions: parsePermissions(user.permissions) }))
    .filter(user => user.role !== 'ADM' && can(user, 'leads'));
  res.json(owners.map(owner => ({
    id: owner.id,
    nome: owner.nome,
    username: owner.username,
    whatsapp: owner.whatsapp,
  })));
});

app.post('/api/admin/leads', authRequired, requirePermission('leads'), async (req, res) => {
  const nome = String(req.body.nome || '').trim();
  const telefone = String(req.body.telefone || '').trim();
  const email = String(req.body.email || '').trim();
  const cidade = String(req.body.cidade || '').trim();
  const observacoes = String(req.body.observacoes || '').trim();
  const status = String(req.body.status || 'Novo').trim() || 'Novo';
  const origem = String(req.body.origem || 'Manual').trim() || 'Manual';
  const requestedOwnerId = req.body.assignedUserId ? Number(req.body.assignedUserId) : null;

  if (!nome || !telefone) {
    return res.status(400).json({ message: 'Preencha nome e telefone para cadastrar o lead.' });
  }

  let owner = { id: req.user.id, nome: req.user.nome };
  let requestedOwnerUser = null;
  if (requestedOwnerId) {
    const requestedOwner = await db.get('SELECT * FROM usuarios WHERE id = ? AND active = 1', requestedOwnerId);
    if (!requestedOwner || requestedOwner.role === 'ADM' || !parsePermissions(requestedOwner.permissions).leads) {
      return res.status(400).json({ message: 'O consultor selecionado não está disponível para receber leads.' });
    }
    requestedOwnerUser = requestedOwner;
    owner = { id: requestedOwner.id, nome: requestedOwner.nome };
  }

  const dataCadastro = new Date().toISOString().split('T')[0];
  const result = await db.run(
    `INSERT INTO leads
      (nome, telefone, email, cidade, origem, status, dataCadastro, assignedUserId, assignedUserName, observacoes, tipoCadastro, criadoPorId, criadoPorNome)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    nome,
    telefone,
    email,
    cidade,
    origem,
    status,
    dataCadastro,
    owner.id || null,
    owner.nome || null,
    observacoes,
    'manual',
    req.user.id,
    req.user.nome
  );

  const lead = await db.get('SELECT * FROM leads WHERE id = ?', result.lastID);
  io.emit('novo_lead', lead);
  let notification = { sent: false };
  if (requestedOwnerUser && Number(requestedOwnerUser.id) !== Number(req.user.id)) {
    try {
      notification = await notifyConsultantAboutTransfer({
        consultant: requestedOwnerUser,
        conversation: { clienteNome: lead.nome, clienteTelefone: lead.telefone },
        transferredBy: getConsultantDisplayName(req.user),
      });
    } catch (error) {
      notification = { sent: false, reason: error?.message || 'Falha ao enviar aviso privado.' };
    }
  }
  res.status(201).json({ ...lead, assignmentNotification: notification });
});

app.put('/api/admin/leads/:id/responsavel', authRequired, requirePermission('leads'), async (req, res) => {
  if (!isMasterAdminUser(req.user)) {
    return res.status(403).json({ message: 'Apenas o Deivson pode designar leads manualmente.' });
  }

  const lead = await db.get('SELECT * FROM leads WHERE id = ?', req.params.id);
  if (!lead) return res.status(404).json({ message: 'Lead não encontrado.' });

  const ownerId = Number(req.body.assignedUserId || 0);
  if (!ownerId) return res.status(400).json({ message: 'Selecione um vendedor para receber o lead.' });

  const owner = await db.get('SELECT * FROM usuarios WHERE id = ? AND active = 1', ownerId);
  const ownerPermissions = parsePermissions(owner?.permissions);
  if (!owner || !ownerPermissions.leads) {
    return res.status(400).json({ message: 'O usuário escolhido precisa estar ativo e ter permissão de leads.' });
  }

  await db.run(
    'UPDATE leads SET assignedUserId = ?, assignedUserName = ? WHERE id = ?',
    owner.id,
    owner.nome,
    lead.id
  );

  const phoneVariants = whatsAppPhoneVariants(lead.telefone);
  if (phoneVariants.length) {
    const placeholders = phoneVariants.map(() => '?').join(', ');
    const conversations = await db.all(
      `SELECT id FROM whatsapp_conversations
       WHERE status != 'Arquivada'
         AND clienteTelefone IN (${placeholders})`,
      ...phoneVariants
    );
    if (conversations.length) {
      const ids = conversations.map(item => item.id);
      const idPlaceholders = ids.map(() => '?').join(', ');
      await db.run(
        `UPDATE whatsapp_conversations
         SET assignedUserId = ?, assignedUserName = ?, status = CASE WHEN status = 'Arquivada' THEN status ELSE 'Aguardando atendimento' END, updatedAt = ?
         WHERE id IN (${idPlaceholders})`,
        owner.id,
        owner.nome,
        new Date().toISOString(),
        ...ids
      );
      const updatedConversations = await db.all(
        `SELECT * FROM whatsapp_conversations WHERE id IN (${idPlaceholders})`,
        ...ids
      );
      updatedConversations.forEach(item => io.emit('whatsapp_conversation_updated', item));
    }
  }

  const updatedLead = await db.get('SELECT * FROM leads WHERE id = ?', lead.id);
  io.emit('novo_lead', updatedLead);
  res.json(updatedLead);
});

app.get('/api/admin/whatsapp/status', authRequired, requirePermission('whatsapp'), async (req, res) => {
  res.json({
    ...getWhatsAppProviderStatus(),
    webhookUrl: `${getAppUrl()}/api/whatsapp/webhook`,
    visibility: isMasterAdminUser(req.user) ? 'todos' : 'proprios',
  });
});

app.post('/api/admin/whatsapp/connect', authRequired, requirePermission('whatsapp'), async (req, res) => {
  const force = Boolean(req.body?.force);
  const status = await startWhatsAppQrSession({ force });
  res.json({ ...status, visibility: isMasterAdminUser(req.user) ? 'todos' : 'proprios' });
});

app.post('/api/admin/whatsapp/test-new-lead-notifications', authRequired, requirePermission('whatsapp'), async (req, res) => {
  if (!isMasterAdminUser(req.user)) {
    return res.status(403).json({ message: 'Apenas o ADM master pode enviar teste de aviso para os consultores.' });
  }
  const assignedUser = req.body?.assignedUserId
    ? await db.get('SELECT id, username FROM usuarios WHERE id = ? AND active = 1', req.body.assignedUserId)
    : null;
  const fakeConversation = {
    clienteNome: 'Teste DRM Energia Solar',
    clienteTelefone: normalizeWhatsAppPhone(req.body?.telefone || DEFAULT_WHATSAPP_PHONE),
    assignedUserId: assignedUser?.id || null,
    assignedUsername: assignedUser?.username || '',
  };
  const results = await notifyConsultantsAboutNewWhatsAppLead({
    conversation: fakeConversation,
    text: req.body?.mensagem || 'Mensagem de teste para confirmar o aviso de lead novo.',
    test: true,
  });
  res.json({ ok: results.every(item => item.ok), results });
});

app.post('/api/admin/whatsapp/conversations/:id/renotify-lead', authRequired, requirePermission('whatsapp'), async (req, res) => {
  if (!isMasterAdminUser(req.user)) {
    return res.status(403).json({ message: 'Apenas o ADM master pode reenviar aviso de lead.' });
  }

  const conversation = await db.get('SELECT * FROM whatsapp_conversations WHERE id = ?', req.params.id);
  if (!conversation) return res.status(404).json({ message: 'Conversa não encontrada.' });
  if (!conversation.assignedUserId) return res.status(400).json({ message: 'Conversa sem consultor responsável.' });

  const lastMessage = await db.get(
    'SELECT text FROM whatsapp_messages WHERE conversationId = ? ORDER BY id DESC LIMIT 1',
    conversation.id
  );
  const results = await notifyConsultantsAboutNewWhatsAppLead({
    conversation,
    text: req.body?.mensagem || lastMessage?.text || conversation.lastMessage || '',
  });
  console.log('[WhatsApp] Aviso de lead reenviado manualmente:', JSON.stringify({
    conversationId: conversation.id,
    leadId: conversation.leadId,
    assignedUserId: conversation.assignedUserId,
    results,
  }));
  res.json({ ok: results.every(item => item.ok), conversationId: conversation.id, results });
});

app.post('/api/admin/whatsapp/debug-classify-contact', authRequired, requirePermission('whatsapp'), async (req, res) => {
  if (!isMasterAdminUser(req.user)) {
    return res.status(403).json({ message: 'Apenas o ADM master pode usar o diagnóstico de contatos.' });
  }

  const phone = normalizeWhatsAppPhone(req.body?.telefone || '');
  if (!phone) {
    return res.status(400).json({ message: 'Informe um telefone válido para diagnóstico.' });
  }

  const phoneVariants = whatsAppPhoneVariants(phone);
  const savedWhatsAppContact = isSavedWhatsAppContact(phoneVariants);
  const knownBusinessPhone = await isKnownBusinessPhone(phoneVariants);

  const conversationPlaceholders = phoneVariants.map(() => '?').join(', ');
  const previousConversation = await db.get(
    `SELECT * FROM whatsapp_conversations WHERE clienteTelefone IN (${conversationPlaceholders}) ORDER BY updatedAt DESC LIMIT 1`,
    ...phoneVariants
  );

  const leadPlaceholders = phoneVariants.map(() => '?').join(', ');
  const lead = await db.get(`SELECT * FROM leads WHERE telefone IN (${leadPlaceholders})`, ...phoneVariants);

  const allowNewLead = req.body?.allowNewLead !== false;
  const rescuedUnknownLidLead = !allowNewLead
    && !previousConversation
    && !lead
    && !savedWhatsAppContact
    && !knownBusinessPhone;
  const effectiveAllowNewLead = !savedWhatsAppContact
    && !knownBusinessPhone
    && (allowNewLead || rescuedUnknownLidLead);
  const wouldCreateLead = !lead && effectiveAllowNewLead;
  const wouldNotifyNewLead = wouldCreateLead;
  const wouldNotifyAssignedReply = !savedWhatsAppContact
    && Boolean(previousConversation?.assignedUserId)
    && previousConversation?.status === 'Em atendimento';

  res.json({
    phone,
    phoneVariants,
    savedWhatsAppContact,
    knownBusinessPhone,
    allowNewLead,
    rescuedUnknownLidLead,
    effectiveAllowNewLead,
    leadExists: Boolean(lead),
    previousConversationExists: Boolean(previousConversation),
    previousConversationStatus: previousConversation?.status || null,
    previousConversationAssignedUserId: previousConversation?.assignedUserId || null,
    wouldCreateLead,
    wouldNotifyNewLead,
    wouldNotifyAssignedReply,
    matchedLead: lead ? {
      id: lead.id,
      nome: lead.nome,
      assignedUserId: lead.assignedUserId,
      assignedUserName: lead.assignedUserName,
      status: lead.status,
      origem: lead.origem,
    } : null,
    matchedConversation: previousConversation ? {
      id: previousConversation.id,
      clienteNome: previousConversation.clienteNome,
      status: previousConversation.status,
      assignedUserId: previousConversation.assignedUserId,
      assignedUserName: previousConversation.assignedUserName,
      lastMessageAt: previousConversation.lastMessageAt,
    } : null,
  });
});

app.post('/api/internal/whatsapp/debug-classify-contact', async (req, res) => {
  const ip = String(req.ip || req.connection?.remoteAddress || '');
  const isLocalRequest = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  if (!isLocalRequest) {
    return res.status(403).json({ message: 'Diagnóstico interno disponível apenas no localhost.' });
  }

  const phone = normalizeWhatsAppPhone(req.body?.telefone || '');
  if (!phone) {
    return res.status(400).json({ message: 'Informe um telefone válido para diagnóstico.' });
  }

  const phoneVariants = whatsAppPhoneVariants(phone);
  const savedWhatsAppContact = isSavedWhatsAppContact(phoneVariants);
  const knownBusinessPhone = await isKnownBusinessPhone(phoneVariants);
  const conversationPlaceholders = phoneVariants.map(() => '?').join(', ');
  const previousConversation = await db.get(
    `SELECT * FROM whatsapp_conversations WHERE clienteTelefone IN (${conversationPlaceholders}) ORDER BY updatedAt DESC LIMIT 1`,
    ...phoneVariants
  );
  const leadPlaceholders = phoneVariants.map(() => '?').join(', ');
  const lead = await db.get(`SELECT * FROM leads WHERE telefone IN (${leadPlaceholders})`, ...phoneVariants);
  const allowNewLead = req.body?.allowNewLead !== false;
  const rescuedUnknownLidLead = !allowNewLead
    && !previousConversation
    && !lead
    && !savedWhatsAppContact
    && !knownBusinessPhone;
  const effectiveAllowNewLead = !savedWhatsAppContact
    && !knownBusinessPhone
    && (allowNewLead || rescuedUnknownLidLead);
  const wouldCreateLead = !lead && effectiveAllowNewLead;
  const wouldNotifyNewLead = wouldCreateLead;
  const wouldNotifyAssignedReply = !savedWhatsAppContact
    && Boolean(previousConversation?.assignedUserId)
    && previousConversation?.status === 'Em atendimento';

  res.json({
    phone,
    phoneVariants,
    savedWhatsAppContact,
    knownBusinessPhone,
    allowNewLead,
    rescuedUnknownLidLead,
    effectiveAllowNewLead,
    leadExists: Boolean(lead),
    previousConversationExists: Boolean(previousConversation),
    previousConversationStatus: previousConversation?.status || null,
    previousConversationAssignedUserId: previousConversation?.assignedUserId || null,
    wouldCreateLead,
    wouldNotifyNewLead,
    wouldNotifyAssignedReply,
    matchedLead: lead ? {
      id: lead.id,
      nome: lead.nome,
      assignedUserId: lead.assignedUserId,
      assignedUserName: lead.assignedUserName,
      status: lead.status,
      origem: lead.origem,
    } : null,
    matchedConversation: previousConversation ? {
      id: previousConversation.id,
      clienteNome: previousConversation.clienteNome,
      status: previousConversation.status,
      assignedUserId: previousConversation.assignedUserId,
      assignedUserName: previousConversation.assignedUserName,
      lastMessageAt: previousConversation.lastMessageAt,
    } : null,
  });
});

// Teste do aviso de "cliente respondeu" para consultores específicos (master only).
app.post('/api/admin/whatsapp/test-consultant-alert', authRequired, requirePermission('whatsapp'), async (req, res) => {
  if (!isMasterAdminUser(req.user)) {
    return res.status(403).json({ message: 'Apenas o ADM master pode enviar teste de aviso.' });
  }
  const usernames = Array.isArray(req.body?.usernames) && req.body.usernames.length
    ? req.body.usernames
    : ['renejr', 'gleyson'];
  const placeholders = usernames.map(() => '?').join(', ');
  const consultants = await db.all(`SELECT * FROM usuarios WHERE username IN (${placeholders}) AND active = 1`, ...usernames);

  const payloadBase = {
    clienteNome: 'Cliente Teste DRM',
    telefone: '5599999990000',
    mensagem: 'Olá, gostaria de saber mais sobre energia solar! (mensagem de teste)',
  };

  const results = [];
  for (const consultant of consultants) {
    const consultantName = getConsultantDisplayName(consultant);
    const payload = { consultantName, ...payloadBase };
    const item = { username: consultant.username, whatsapp: '-', email: '-' };

    const consultantPhone = normalizeWhatsAppPhone(consultant.whatsapp);
    const businessPhone = normalizeWhatsAppPhone(whatsappRuntime.phone || DEFAULT_WHATSAPP_PHONE);
    if (consultantPhone && consultantPhone !== businessPhone) {
      try {
        const r = await sendWhatsAppTextMessage(consultantPhone, buildConsultantReplyNotice(payload));
        item.whatsapp = 'enviado para ' + consultantPhone + ' | baileysStatus=' + (r?.payload?.status ?? '?') + ' | id=' + (r?.providerMessageId || '-');
      } catch (error) {
        item.whatsapp = 'erro: ' + (error?.message || 'falha');
      }
    } else {
      item.whatsapp = consultantPhone ? 'pulado (numero da empresa)' : 'sem numero';
    }

    if (isRealEmail(consultant.email)) {
      try {
        await sendConsultantReplyEmail({ to: consultant.email, ...payload });
        item.email = 'enviado para ' + consultant.email;
      } catch (error) {
        item.email = 'erro: ' + (error?.message || 'falha');
      }
    } else {
      item.email = 'email nao real (' + (consultant.email || '-') + ')';
    }
    results.push(item);
  }

  res.json({ ok: true, results });
});

// Master reseta a confirmação de WhatsApp de um consultor, forçando o modal de
// cadastro no próximo acesso para ele informar o número correto no aparelho dele.
app.post('/api/admin/whatsapp/reset-consultant-number', authRequired, requirePermission('whatsapp'), async (req, res) => {
  if (!isMasterAdminUser(req.user)) {
    return res.status(403).json({ message: 'Apenas o ADM master pode resetar o número dos consultores.' });
  }
  const usernames = Array.isArray(req.body?.usernames) && req.body.usernames.length ? req.body.usernames : [];
  if (!usernames.length) return res.status(400).json({ message: 'Informe os usernames.' });
  const placeholders = usernames.map(() => '?').join(', ');
  await db.run(`UPDATE usuarios SET whatsappConfirmed = 0 WHERE username IN (${placeholders})`, ...usernames);
  const updated = await db.all(`SELECT username, whatsapp, whatsappConfirmed FROM usuarios WHERE username IN (${placeholders})`, ...usernames);
  res.json({ ok: true, usuarios: updated });
});

app.post('/api/admin/whatsapp/disconnect', authRequired, requirePermission('whatsapp'), async (req, res) => {
  if (!isMasterAdminUser(req.user)) {
    return res.status(403).json({ message: 'Apenas o ADM master pode desconectar o WhatsApp oficial.' });
  }
  const status = await disconnectWhatsAppQrSession();
  res.json({ ...status, visibility: 'todos' });
});

app.get('/api/admin/whatsapp/conversations', authRequired, requirePermission('whatsapp'), async (req, res) => {
  const visibleWhere = `
    status != 'Arquivada'
    AND COALESCE(remoteJid, '') LIKE '%@s.whatsapp.net'
    AND COALESCE(remoteJid, '') NOT LIKE '%@g.us'
    AND COALESCE(remoteJid, '') != 'status@broadcast'
    AND COALESCE(remoteJid, '') NOT LIKE '%@broadcast'
    AND COALESCE(remoteJid, '') NOT LIKE '%@newsletter'
    AND COALESCE(remoteJid, '') NOT LIKE '%@lid'
    AND length(COALESCE(clienteTelefone, '')) BETWEEN 10 AND 13
  `;

  const conversations = isMasterAdminUser(req.user)
    ? await db.all(`
      SELECT * FROM whatsapp_conversations
      WHERE ${visibleWhere}
      ORDER BY COALESCE(lastMessageAt, updatedAt, createdAt) DESC, id DESC
    `)
    : await db.all(
      `SELECT * FROM whatsapp_conversations
       WHERE ${visibleWhere}
         AND assignedUserId = ?
       ORDER BY COALESCE(lastMessageAt, updatedAt, createdAt) DESC, id DESC`,
      req.user.id
    );

  res.json(conversations);
});

app.post('/api/admin/whatsapp/conversations/:id/claim', authRequired, requirePermission('whatsapp'), async (req, res) => {
  const conversation = await getWhatsAppConversationById(req.params.id);
  if (!conversation) return res.status(404).json({ message: 'Conversa não encontrada.' });

  if (!isMasterAdminUser(req.user) && Number(conversation.assignedUserId) !== Number(req.user.id)) {
    return res.status(403).json({ message: 'Esta conversa precisa ser designada para você pelo Deivson ou pelo rodízio.' });
  }

  if (
    conversation.assignedUserId
    && Number(conversation.assignedUserId) !== Number(req.user.id)
    && !isMasterAdminUser(req.user)
  ) {
    return res.status(409).json({ message: `Essa conversa já está em atendimento com ${conversation.assignedUserName || 'outro consultor'}.` });
  }

  const now = new Date().toISOString();
  const result = await db.run(
    `UPDATE whatsapp_conversations
     SET assignedUserId = ?, assignedUserName = ?, status = 'Em atendimento', unreadCount = 0, updatedAt = ?
     WHERE id = ?
       AND (
         (assignedUserId IS NULL AND status = 'Aguardando atendimento')
         OR assignedUserId = ?
         OR ? = 1
       )`,
    req.user.id,
    req.user.nome || req.user.username,
    now,
    conversation.id,
    req.user.id,
    isMasterAdminUser(req.user) ? 1 : 0
  );
  if (!result.changes) {
    const current = await getWhatsAppConversationById(conversation.id);
    return res.status(409).json({ message: `Essa conversa já está em atendimento com ${current?.assignedUserName || 'outro consultor'}.` });
  }
  let updated = await getWhatsAppConversationById(conversation.id);
  try {
    const noticeResult = await sendAndStoreWhatsAppMessage({
      conversation: updated,
      text: buildWhatsAppClaimNotice(getConsultantDisplayName(req.user)),
      user: req.user,
      system: true,
    });
    updated = noticeResult.conversation;
  } catch (error) {
    console.error('Erro ao enviar aviso de início de atendimento:', error);
    io.emit('whatsapp_conversation_updated', updated);
  }
  res.json(updated);
});

app.post('/api/admin/whatsapp/conversations/:id/transfer', authRequired, requirePermission('whatsapp'), async (req, res) => {
  if (!isMasterAdminUser(req.user)) {
    return res.status(403).json({ message: 'Apenas o Deivson pode transferir conversas.' });
  }

  const conversation = await getWhatsAppConversationById(req.params.id);
  if (!conversation) return res.status(404).json({ message: 'Conversa não encontrada.' });
  if (conversation.status === 'Arquivada') {
    return res.status(400).json({ message: 'Uma conversa arquivada como não lead não pode ser transferida.' });
  }

  const consultantId = Number(req.body.assignedUserId || 0);
  const consultant = await db.get('SELECT * FROM usuarios WHERE id = ? AND active = 1', consultantId);
  if (!consultant || consultant.role === 'ADM' || !parsePermissions(consultant.permissions).whatsapp) {
    return res.status(400).json({ message: 'Selecione um consultor ativo com acesso ao WhatsApp.' });
  }

  const now = new Date().toISOString();
  let leadId = conversation.leadId;
  if (!leadId) {
    const result = await db.run(
      `INSERT INTO leads
        (nome, telefone, email, cidade, origem, status, dataCadastro, assignedUserId, assignedUserName, observacoes, tipoCadastro, criadoPorId, criadoPorNome)
       VALUES (?, ?, '', '', 'WhatsApp transferido', 'Novo', ?, ?, ?, 'Lead criado ao transferir uma conversa do WhatsApp.', 'manual', ?, ?)`,
      conversation.clienteNome || conversation.clienteTelefone,
      conversation.clienteTelefone,
      now.split('T')[0],
      consultant.id,
      consultant.nome,
      req.user.id,
      req.user.nome
    );
    leadId = result.lastID;
  }

  await db.run(
    `UPDATE whatsapp_conversations
     SET leadId = ?, assignedUserId = ?, assignedUserName = ?, status = 'Aguardando atendimento', unreadCount = 0, updatedAt = ?
     WHERE id = ?`,
    leadId,
    consultant.id,
    consultant.nome,
    now,
    conversation.id
  );

  await db.run(
    'UPDATE leads SET assignedUserId = ?, assignedUserName = ? WHERE id = ?',
    consultant.id,
    consultant.nome,
    leadId
  );
  const updatedLead = await db.get('SELECT * FROM leads WHERE id = ?', leadId);
  if (updatedLead) io.emit('novo_lead', updatedLead);

  const updated = await getWhatsAppConversationById(conversation.id);
  io.emit('whatsapp_conversation_updated', updated);

  let notification = { sent: false };
  try {
    notification = await notifyConsultantAboutTransfer({
      consultant,
      conversation: updated,
      transferredBy: getConsultantDisplayName(req.user),
    });
  } catch (error) {
    notification = { sent: false, reason: error?.message || 'Falha ao enviar aviso privado.' };
    console.error(`Erro ao avisar transferência para ${consultant.username}:`, error?.message || error);
  }

  res.json({ conversation: updated, notification });
});

app.post('/api/admin/whatsapp/conversations/:id/close', authRequired, requirePermission('whatsapp'), async (req, res) => {
  const conversation = await getWhatsAppConversationById(req.params.id);
  if (!conversation) return res.status(404).json({ message: 'Conversa não encontrada.' });
  if (!canAccessWhatsAppConversation(req.user, conversation)) {
    return res.status(403).json({ message: 'Você não tem acesso a esta conversa.' });
  }

  // Envia o aviso de finalização ao cliente ANTES de marcar como finalizada,
  // pois o envio exige que a conversa ainda esteja acessível ao consultor.
  try {
    await sendAndStoreWhatsAppMessage({
      conversation,
      text: buildWhatsAppCloseNotice(getConsultantDisplayName(req.user)),
      user: req.user,
      system: true,
    });
  } catch (error) {
    console.error('Erro ao enviar aviso de finalização de atendimento:', error);
  }

  const now = new Date().toISOString();
  await db.run(
    `UPDATE whatsapp_conversations
     SET status = 'Finalizada', unreadCount = 0, updatedAt = ?
     WHERE id = ?`,
    now,
    conversation.id
  );
  const updated = await getWhatsAppConversationById(conversation.id);
  io.emit('whatsapp_conversation_updated', updated);
  res.json(updated);
});

// Arquiva uma conversa que não é lead (pós-venda, manutenção, instalação etc.).
// Não envia nada ao cliente — apenas some da lista de atendimento para todos.
app.post('/api/admin/whatsapp/conversations/:id/archive', authRequired, requirePermission('whatsapp'), async (req, res) => {
  // Apenas o Deivson (ADM master) e o Rene Jr podem arquivar conversas como "não é lead".
  const canArchiveNotLead = isMasterAdminUser(req.user) || String(req.user.username || '').toLowerCase() === 'renejr';
  if (!canArchiveNotLead) {
    return res.status(403).json({ message: 'Apenas o Deivson e o Rene Jr podem arquivar conversas como não lead.' });
  }
  const conversation = await getWhatsAppConversationById(req.params.id);
  if (!conversation) return res.status(404).json({ message: 'Conversa não encontrada.' });

  const phoneVariants = whatsAppPhoneVariants(conversation.clienteTelefone);
  const remoteJidVariants = phoneVariants.map(phone => `${phone}@s.whatsapp.net`);
  const phonePlaceholders = phoneVariants.map(() => '?').join(', ');
  const remotePlaceholders = remoteJidVariants.map(() => '?').join(', ');
  const matchingConversations = await db.all(
    `SELECT id FROM whatsapp_conversations
     WHERE id = ?
        OR clienteTelefone IN (${phonePlaceholders})
        OR remoteJid IN (${remotePlaceholders})`,
    conversation.id,
    ...phoneVariants,
    ...remoteJidVariants
  );
  const archivedIds = matchingConversations.map(item => item.id);
  const idPlaceholders = archivedIds.map(() => '?').join(', ');

  await db.run(
    `UPDATE whatsapp_conversations
     SET status = 'Arquivada', unreadCount = 0, updatedAt = ?
     WHERE id IN (${idPlaceholders})`,
    new Date().toISOString(),
    ...archivedIds
  );
  const updated = await getWhatsAppConversationById(conversation.id);
  io.emit('whatsapp_conversation_updated', updated);
  io.emit('whatsapp_conversation_archived', { id: conversation.id, ids: archivedIds });
  res.json({ ...updated, archivedIds });
});

app.get('/api/admin/whatsapp/conversations/:id/messages', authRequired, requirePermission('whatsapp'), async (req, res) => {
  const conversation = await getWhatsAppConversationById(req.params.id);
  if (!conversation) return res.status(404).json({ message: 'Conversa não encontrada.' });
  if (!canAccessWhatsAppConversation(req.user, conversation)) {
    return res.status(403).json({ message: 'Você não tem acesso a esta conversa.' });
  }

  await db.run('UPDATE whatsapp_conversations SET unreadCount = 0 WHERE id = ?', conversation.id);
  const messages = await db.all('SELECT * FROM whatsapp_messages WHERE conversationId = ? ORDER BY createdAt ASC, id ASC', conversation.id);
  res.json(messages);
});

app.post('/api/admin/whatsapp/conversations/:id/messages', authRequired, requirePermission('whatsapp'), async (req, res) => {
  const text = String(req.body.text || '').trim();
  if (!text) return res.status(400).json({ message: 'Digite uma mensagem para enviar.' });

  const conversation = await getWhatsAppConversationById(req.params.id);
  if (!conversation) return res.status(404).json({ message: 'Conversa não encontrada.' });
  if (!canAccessWhatsAppConversation(req.user, conversation)) {
    return res.status(403).json({ message: 'Você não tem acesso a esta conversa.' });
  }

  let activeConversation = conversation;
  let autoClaimedConversation = false;
  if (conversation.status === 'Finalizada') {
    const ownerId = conversation.assignedUserId || req.user.id;
    const ownerName = conversation.assignedUserName || req.user.nome || req.user.username;
    await db.run(
      `UPDATE whatsapp_conversations
       SET assignedUserId = ?, assignedUserName = ?, status = 'Em atendimento', updatedAt = ?
       WHERE id = ?`,
      ownerId,
      ownerName,
      new Date().toISOString(),
      conversation.id
    );
    activeConversation = await getWhatsAppConversationById(conversation.id);
    io.emit('whatsapp_conversation_updated', activeConversation);
  } else if (conversation.status === 'Aguardando atendimento' || !conversation.assignedUserId) {
    const claimResult = await db.run(
      `UPDATE whatsapp_conversations
       SET assignedUserId = ?, assignedUserName = ?, status = 'Em atendimento', updatedAt = ?
       WHERE id = ?
         AND (
           (assignedUserId IS NULL AND status = 'Aguardando atendimento')
           OR assignedUserId = ?
           OR ? = 1
         )`,
      req.user.id,
      req.user.nome || req.user.username,
      new Date().toISOString(),
      conversation.id,
      req.user.id,
      isMasterAdminUser(req.user) ? 1 : 0
    );
    if (!claimResult.changes) {
      const current = await getWhatsAppConversationById(conversation.id);
      return res.status(409).json({ message: `Essa conversa já está em atendimento com ${current?.assignedUserName || 'outro consultor'}.` });
    }
    activeConversation = await getWhatsAppConversationById(conversation.id);
    autoClaimedConversation = true;
  }

  try {
    if (autoClaimedConversation) {
      const noticeResult = await sendAndStoreWhatsAppMessage({
        conversation: activeConversation,
        text: buildWhatsAppClaimNotice(getConsultantDisplayName(req.user)),
        user: req.user,
        system: true,
      });
      activeConversation = noticeResult.conversation;
    }
    const result = await sendAndStoreWhatsAppMessage({
      conversation: activeConversation,
      text,
      user: req.user,
    });
    res.status(201).json(result);
  } catch (error) {
    console.error('Erro ao enviar WhatsApp:', error);
    res.status(error.statusCode || 502).json({ message: error.message || 'Não foi possível enviar pelo WhatsApp agora.' });
  }
});

app.post('/api/admin/whatsapp/conversations/:id/audio', authRequired, requirePermission('whatsapp'), async (req, res) => {
  const conversation = await getWhatsAppConversationById(req.params.id);
  if (!conversation) return res.status(404).json({ message: 'Conversa não encontrada.' });
  if (!canAccessWhatsAppConversation(req.user, conversation)) {
    return res.status(403).json({ message: 'Você não tem acesso a esta conversa.' });
  }

  const mimeType = String(req.body.mimeType || 'audio/webm').split(';')[0].toLowerCase();
  const audioBase64 = String(req.body.audioBase64 || '').replace(/^data:[^;]+;base64,/, '');
  if (!audioBase64) return res.status(400).json({ message: 'Grave um áudio antes de enviar.' });

  const buffer = Buffer.from(audioBase64, 'base64');
  if (!buffer.length || buffer.length > 15 * 1024 * 1024) {
    return res.status(400).json({ message: 'O áudio deve ter no máximo 15 MB.' });
  }

  let activeConversation = conversation;
  if (conversation.status === 'Finalizada') {
    await db.run(
      `UPDATE whatsapp_conversations
       SET assignedUserId = ?, assignedUserName = ?, status = 'Em atendimento', updatedAt = ?
       WHERE id = ?`,
      conversation.assignedUserId || req.user.id,
      conversation.assignedUserName || req.user.nome || req.user.username,
      new Date().toISOString(),
      conversation.id
    );
    activeConversation = await getWhatsAppConversationById(conversation.id);
  }

  try {
    const voice = await convertAudioToWhatsAppVoice(buffer, mimeType);
    const provider = await sendWhatsAppAudioMessage(activeConversation.clienteTelefone, { url: voice.absolutePath }, voice.mimeType, {
      remoteJid: activeConversation.remoteJid,
    });
    const message = await createWhatsAppMessage({
      conversationId: activeConversation.id,
      direction: 'outgoing',
      messageType: 'audio',
      text: 'Áudio enviado',
      mediaUrl: `/api/whatsapp/media/${voice.fileName}`,
      mimeType: voice.mimeType,
      fileName: voice.fileName,
      fileSize: voice.buffer.length,
      providerMessageId: provider.providerMessageId,
      status: provider.status,
      senderId: req.user.id,
      senderName: getConsultantDisplayName(req.user),
      rawPayload: provider.payload || provider,
    });
    const updatedConversation = await getWhatsAppConversationById(activeConversation.id);
    io.emit('whatsapp_message_created', { message, conversation: updatedConversation });
    io.emit('whatsapp_conversation_updated', updatedConversation);
    res.status(201).json({ message, conversation: updatedConversation, provider });
  } catch (error) {
    console.error('Erro ao enviar áudio WhatsApp:', error);
    res.status(error.statusCode || 502).json({ message: error.message || 'Não foi possível enviar o áudio.' });
  }
});

app.get('/api/whatsapp/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || process.env.META_WHATSAPP_VERIFY_TOKEN || '';

  if (mode === 'subscribe' && verifyToken && token === verifyToken) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

app.post('/api/whatsapp/webhook', async (req, res) => {
  res.sendStatus(200);

  try {
    const entries = Array.isArray(req.body?.entry) ? req.body.entry : [];
    for (const entry of entries) {
      const changes = Array.isArray(entry.changes) ? entry.changes : [];
      for (const change of changes) {
        const value = change.value || {};
        const contacts = Array.isArray(value.contacts) ? value.contacts : [];
        const messages = Array.isArray(value.messages) ? value.messages : [];
        for (const incoming of messages) {
          const phone = normalizeWhatsAppPhone(incoming.from);
          if (!phone || !isPlausibleContactPhone(phone)) continue;

          const contact = contacts.find(item => normalizeWhatsAppPhone(item.wa_id) === phone) || {};
          const name = contact.profile?.name || phone;
          const phoneVariants = whatsAppPhoneVariants(phone);
          const savedWhatsAppContact = isSavedWhatsAppContact(phoneVariants);
          const knownBusinessPhone = await isKnownBusinessPhone(phoneVariants);
          const conversationPlaceholders = phoneVariants.map(() => '?').join(', ');
          const previousConversation = await db.get(
            `SELECT * FROM whatsapp_conversations WHERE clienteTelefone IN (${conversationPlaceholders}) ORDER BY updatedAt DESC LIMIT 1`,
            ...phoneVariants
          );
          const leadPlaceholders = phoneVariants.map(() => '?').join(', ');
          let lead = await db.get(`SELECT * FROM leads WHERE telefone IN (${leadPlaceholders})`, ...phoneVariants);
          const effectiveAllowNewLead = !savedWhatsAppContact && !knownBusinessPhone;
          if (!effectiveAllowNewLead && !previousConversation) continue;
          let owner = null;

          if (!lead && effectiveAllowNewLead) {
            owner = await getNextLeadOwner();
            const result = await db.run(
              `INSERT INTO leads
                (nome, telefone, email, cidade, origem, status, dataCadastro, assignedUserId, assignedUserName, observacoes, tipoCadastro, criadoPorId, criadoPorNome)
               VALUES (?, ?, '', '', 'WhatsApp', 'Novo', ?, ?, ?, 'Mensagem recebida pelo WhatsApp conectado.', 'site', NULL, 'WhatsApp')`,
              name,
              phone,
              new Date().toISOString().split('T')[0],
              owner.id,
              owner.nome
            );
            lead = await db.get('SELECT * FROM leads WHERE id = ?', result.lastID);
            io.emit('novo_lead', lead);
          } else if (!lead && previousConversation?.assignedUserId) {
            owner = { id: previousConversation.assignedUserId, nome: previousConversation.assignedUserName };
          } else if (lead?.assignedUserId) {
            owner = { id: lead.assignedUserId, nome: lead.assignedUserName };
          } else if (lead) {
            owner = await getNextLeadOwner();
            await db.run('UPDATE leads SET assignedUserId = ?, assignedUserName = ? WHERE id = ?', owner.id, owner.nome, lead.id);
            lead = await db.get('SELECT * FROM leads WHERE id = ?', lead.id);
            io.emit('novo_lead', lead);
          }

          const text = incoming.text?.body || incoming.button?.text || incoming.interactive?.button_reply?.title || `[${incoming.type || 'mensagem'}]`;
          const conversation = await upsertWhatsAppConversation({
            leadId: lead?.id || previousConversation?.leadId || null,
            nome: lead?.nome || previousConversation?.clienteNome || name,
            telefone: phone,
            remoteJid: `${phone}@s.whatsapp.net`,
            assignedUserId: owner?.id || lead?.assignedUserId || previousConversation?.assignedUserId || null,
            assignedUserName: owner?.nome || lead?.assignedUserName || previousConversation?.assignedUserName || '',
          });
          const message = await createWhatsAppMessage({
            conversationId: conversation.id,
            direction: 'incoming',
            messageType: incoming.type || 'text',
            text,
            providerMessageId: incoming.id || '',
            status: 'recebida',
            rawPayload: incoming,
          });
          const updatedConversation = await getWhatsAppConversationById(conversation.id);
          io.emit('whatsapp_message_created', { message, conversation: updatedConversation });
          io.emit('whatsapp_conversation_updated', updatedConversation);
        }
      }
    }
  } catch (error) {
    console.error('Erro ao processar webhook do WhatsApp:', error);
  }
});

app.get('/api/admin/round-robin-leads', authRequired, requirePermission('dashboard'), async (req, res) => {
  res.json(await getRoundRobinLeadSummary());
});

app.get('/api/admin/orcamentos', authRequired, requirePermission('orcamentos'), async (req, res) => {
  const orcamentos = can(req.user, 'verTodosLeads')
    ? await db.all('SELECT * FROM orcamentos ORDER BY id DESC')
    : await db.all('SELECT * FROM orcamentos WHERE assignedUserId = ? ORDER BY id DESC', req.user.id);
  // Converte os campos JSON de string para objeto
  const parsedOrcamentos = orcamentos.map(o => ({...o, dimensionamento: parseJsonField(o.dimensionamento), financeiro: parseJsonField(o.financeiro)}));
  res.json(parsedOrcamentos);
});

app.post('/api/admin/orcamentos', authRequired, requirePermission('orcamentos'), async (req, res) => {
  const {
    clienteId,
    clienteNome,
    clienteTelefone,
    clienteEmail,
    clienteCidade,
    dimensionamento = {},
    financeiro = {},
    status = 'Orçamento manual',
    tipo = 'completo',
  } = req.body;
  const isQuickBudget = String(tipo || '').trim().toLowerCase() === 'rapido';

  let cliente = null;
  if (clienteId) {
    cliente = await db.get('SELECT * FROM clientes WHERE id = ?', clienteId);
    if (!cliente) return res.status(404).json({ message: 'Cliente não encontrado.' });
  } else if (!isQuickBudget) {
    return res.status(400).json({ message: 'Selecione um cliente ou use o modo de orçamento rápido.' });
  }

  const snapshotClienteNome = String(cliente?.nome || clienteNome || '').trim();
  const snapshotClienteCidade = String(cliente?.cidade || clienteCidade || '').trim();
  const snapshotClienteTelefone = String(cliente?.whatsapp || clienteTelefone || '').trim();
  const snapshotClienteEmail = String(cliente?.email || clienteEmail || '').trim();
  if (!snapshotClienteNome) return res.status(400).json({ message: 'Informe o nome do cliente para salvar o orçamento.' });
  if (!snapshotClienteCidade) return res.status(400).json({ message: 'Informe a cidade do cliente para salvar o orçamento.' });

  const potenciaPlacaW = Number(dimensionamento.potencia_placa_w || dimensionamento.potenciaPlacaW || 0);
  const numeroPaineis = Number(dimensionamento.numero_paineis_necessarios || dimensionamento.numeroPaineis || 0);
  const potenciaKwp = Number(dimensionamento.potencia_real_instalada_kwp || ((potenciaPlacaW * numeroPaineis) / 1000) || 0);
  const areaOcupada = Number(dimensionamento.area_ocupada_m2 || (numeroPaineis * 2.6) || 0);
  const irradiacao = Number(dimensionamento.irradiacao_solar || dimensionamento.irradiacaoSolar || 0);
  const perdaPercentual = Number(dimensionamento.perda_percentual || dimensionamento.perdaPercentual || 20);
  const geracaoCalculada = potenciaKwp && irradiacao
    ? potenciaKwp * irradiacao * 30 * (1 - perdaPercentual / 100)
    : 0;
  const geracaoMensal = Number(dimensionamento.geracao_estimada_kwh || geracaoCalculada || 0);
  const data = new Date().toISOString().split('T')[0];
  const ownerId = req.user.id || null;
  const ownerName = req.user.nome || req.user.username || null;

  const normalizedDimensionamento = {
    ...dimensionamento,
    potencia_placa_w: potenciaPlacaW,
    placa_modelo: dimensionamento.placa_modelo || dimensionamento.placaModelo || '',
    numero_paineis_necessarios: numeroPaineis,
    potencia_real_instalada_kwp: Number(potenciaKwp.toFixed(2)),
    area_ocupada_m2: Number(areaOcupada.toFixed(2)),
    potencia_inversor_kw: Number(dimensionamento.potencia_inversor_kw || dimensionamento.potenciaInversorKw || 0),
    inversor_modelo: dimensionamento.inversor_modelo || dimensionamento.inversorModelo || '',
    quantidade_inversores: Number(dimensionamento.quantidade_inversores || 1),
    quantidade_cabo_cc: dimensionamento.quantidade_cabo_cc || dimensionamento.quantidadeCabo || '',
    irradiacao_solar: irradiacao,
    perda_percentual: perdaPercentual,
    geracao_estimada_kwh: Number(geracaoMensal.toFixed(2)),
    geracao_anual_kwh: Number((geracaoMensal * 12).toFixed(2)),
    cidade_base: dimensionamento.cidade_base || snapshotClienteCidade || '',
    origem: isQuickBudget ? 'Orçamento rápido' : 'Orçamento interno',
  };
  const normalizedFinanceiro = {
    ...financeiro,
    preco_final_cliente_rs: moneyNumberOrNull(financeiro.preco_final_cliente_rs || financeiro.valorSistema) || 0,
    entrada_rs: moneyNumberOrNull(financeiro.entrada_rs || financeiro.valorEntrada) || 0,
    saldo_rs: moneyNumberOrNull(financeiro.saldo_rs || financeiro.valorSaldo) || 0,
    forma_pagamento: financeiro.forma_pagamento || financeiro.formaPagamento || '',
    forma_pagamento_tipo: financeiro.forma_pagamento_tipo || financeiro.formaPagamentoTipo || financeiro.forma_pagamento || financeiro.formaPagamento || '',
    condicoes_pagamento: financeiro.condicoes_pagamento || financeiro.condicoesPagamento || '',
  };

  const result = await db.run(
    `INSERT INTO orcamentos
      (clienteId, clienteNome, clienteTelefone, clienteEmail, clienteCidade, status, data, tipo, dimensionamento, financeiro, assignedUserId, assignedUserName)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    cliente?.id || null,
    snapshotClienteNome,
    snapshotClienteTelefone || null,
    snapshotClienteEmail || null,
    snapshotClienteCidade,
    status,
    data,
    isQuickBudget ? 'rapido' : 'completo',
    JSON.stringify(normalizedDimensionamento),
    JSON.stringify(normalizedFinanceiro),
    ownerId,
    ownerName
  );

  const orcamento = {
    id: result.lastID,
    clienteId: cliente?.id || null,
    clienteNome: snapshotClienteNome,
    clienteTelefone: snapshotClienteTelefone || null,
    clienteEmail: snapshotClienteEmail || null,
    clienteCidade: snapshotClienteCidade,
    status,
    data,
    tipo: isQuickBudget ? 'rapido' : 'completo',
    dimensionamento: normalizedDimensionamento,
    financeiro: normalizedFinanceiro,
    assignedUserId: ownerId,
    assignedUserName: ownerName,
  };

  io.emit('novo_orcamento', orcamento);
  res.status(201).json(orcamento);
});

app.put('/api/admin/orcamentos/:id', authRequired, requirePermission('orcamentos'), async (req, res) => {
  const orcamento = await db.get('SELECT * FROM orcamentos WHERE id = ?', req.params.id);
  if (!orcamento) return res.status(404).json({ message: 'Orçamento não encontrado.' });
  if (!can(req.user, 'verTodosLeads') && orcamento.assignedUserId !== req.user.id) {
    return res.status(403).json({ message: 'Este orçamento pertence a outro responsável.' });
  }

  const status = String(req.body.status || '').trim();
  if (!status) return res.status(400).json({ message: 'Informe o status do orçamento.' });

  await db.run('UPDATE orcamentos SET status = ? WHERE id = ?', status, req.params.id);
  const updated = await db.get('SELECT * FROM orcamentos WHERE id = ?', req.params.id);
  res.json({
    ...updated,
    dimensionamento: parseJsonField(updated.dimensionamento),
    financeiro: parseJsonField(updated.financeiro),
  });
});

app.delete('/api/admin/orcamentos/:id', authRequired, requirePermission('orcamentos'), async (req, res) => {
  const orcamento = await db.get('SELECT * FROM orcamentos WHERE id = ?', req.params.id);
  if (!orcamento) return res.status(404).json({ message: 'Orçamento não encontrado.' });
  if (!can(req.user, 'verTodosLeads') && orcamento.assignedUserId !== req.user.id) {
    return res.status(403).json({ message: 'Este orçamento pertence a outro responsável.' });
  }

  const contrato = await db.get('SELECT id, status FROM contratos WHERE orcamentoId = ?', req.params.id);
  if (contrato) {
    return res.status(409).json({
      message: `Este orçamento já gerou o contrato #${contrato.id}. Para preservar o histórico, ele não pode ser excluído.`,
    });
  }

  await db.run('DELETE FROM orcamentos WHERE id = ?', req.params.id);
  io.emit('orcamento_excluido', { id: Number(req.params.id) });
  res.json({ message: 'Orçamento excluído com sucesso.', id: Number(req.params.id) });
});

app.get('/api/admin/orcamentos/:id/download', authRequired, requirePermission('orcamentos'), async (req, res) => {
  const orcamento = await db.get('SELECT * FROM orcamentos WHERE id = ?', req.params.id);
  if (!orcamento) return res.status(404).json({ message: 'Orçamento não encontrado.' });
  if (!can(req.user, 'verTodosLeads') && orcamento.assignedUserId !== req.user.id) {
    return res.status(403).json({ message: 'Este orçamento pertence a outro responsável.' });
  }
  await sendOrcamentoPdf(res, orcamento);
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
  const isPlacaOnly = data.tipo === 'Placa solar';
  const isInversorOnly = data.tipo === 'Inversor';
  if (!data.nome) {
    return res.status(400).json({ message: 'Nome é obrigatório.' });
  }
  if (!isPlacaOnly && !isInversorOnly && (!data.placaModelo || !data.inversorModelo)) {
    return res.status(400).json({ message: 'Modelo da placa e modelo do inversor são obrigatórios para kits.' });
  }
  if (isPlacaOnly && !data.placaModelo) {
    return res.status(400).json({ message: 'Modelo da placa é obrigatório.' });
  }
  if (isInversorOnly && !data.inversorModelo) {
    return res.status(400).json({ message: 'Modelo do inversor é obrigatório.' });
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

// ── Marcas Inversor Híbrido ──────────────────────────────────────────────────
app.get('/api/admin/marcas-inversor-hibrido', authRequired, requirePermission('contratos'), async (req, res) => {
  res.json(await db.all('SELECT * FROM marcas_inversor_hibrido ORDER BY nome_marca ASC'));
});
app.post('/api/admin/marcas-inversor-hibrido', authRequired, requirePermission('contratos'), async (req, res) => {
  const { nome_marca, status } = req.body;
  if (!nome_marca?.trim()) return res.status(400).json({ message: 'Nome da marca é obrigatório.' });
  try {
    const r = await db.run('INSERT INTO marcas_inversor_hibrido (nome_marca, status) VALUES (?, ?)', nome_marca.trim(), status || 'ativo');
    res.status(201).json(await db.get('SELECT * FROM marcas_inversor_hibrido WHERE id = ?', r.lastID));
  } catch (e) {
    if (e.message?.includes('UNIQUE')) return res.status(400).json({ message: 'Marca já cadastrada.' });
    throw e;
  }
});
app.put('/api/admin/marcas-inversor-hibrido/:id', authRequired, requirePermission('contratos'), async (req, res) => {
  const { nome_marca, status } = req.body;
  if (!nome_marca?.trim()) return res.status(400).json({ message: 'Nome da marca é obrigatório.' });
  try {
    await db.run('UPDATE marcas_inversor_hibrido SET nome_marca=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', nome_marca.trim(), status||'ativo', req.params.id);
    res.json(await db.get('SELECT * FROM marcas_inversor_hibrido WHERE id=?', req.params.id));
  } catch (e) {
    if (e.message?.includes('UNIQUE')) return res.status(400).json({ message: 'Marca já cadastrada.' });
    throw e;
  }
});

// ── Modelos Inversor Híbrido ─────────────────────────────────────────────────
app.get('/api/admin/modelos-inversor-hibrido', authRequired, requirePermission('contratos'), async (req, res) => {
  const { marcaId } = req.query;
  res.json(marcaId
    ? await db.all('SELECT * FROM modelos_inversor_hibrido WHERE marca_id=? ORDER BY nome_modelo ASC', marcaId)
    : await db.all('SELECT * FROM modelos_inversor_hibrido ORDER BY nome_modelo ASC'));
});
app.post('/api/admin/modelos-inversor-hibrido', authRequired, requirePermission('contratos'), async (req, res) => {
  const { marca_id, nome_modelo, status } = req.body;
  if (!marca_id || !nome_modelo?.trim()) return res.status(400).json({ message: 'Marca e modelo são obrigatórios.' });
  try {
    const r = await db.run('INSERT INTO modelos_inversor_hibrido (marca_id, nome_modelo, status) VALUES (?,?,?)', marca_id, nome_modelo.trim(), status||'ativo');
    res.status(201).json(await db.get('SELECT * FROM modelos_inversor_hibrido WHERE id=?', r.lastID));
  } catch (e) {
    if (e.message?.includes('UNIQUE')) return res.status(400).json({ message: 'Modelo já cadastrado para esta marca.' });
    throw e;
  }
});
app.put('/api/admin/modelos-inversor-hibrido/:id', authRequired, requirePermission('contratos'), async (req, res) => {
  const { nome_modelo, status } = req.body;
  if (!nome_modelo?.trim()) return res.status(400).json({ message: 'Nome do modelo é obrigatório.' });
  try {
    await db.run('UPDATE modelos_inversor_hibrido SET nome_modelo=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', nome_modelo.trim(), status||'ativo', req.params.id);
    res.json(await db.get('SELECT * FROM modelos_inversor_hibrido WHERE id=?', req.params.id));
  } catch (e) {
    if (e.message?.includes('UNIQUE')) return res.status(400).json({ message: 'Modelo já cadastrado para esta marca.' });
    throw e;
  }
});

// ── Baterias de Lítio Compatíveis ───────────────────────────────────────────
app.get('/api/admin/baterias-litio', authRequired, requirePermission('contratos'), async (req, res) => {
  const { modeloId } = req.query;
  res.json(modeloId
    ? await db.all('SELECT * FROM baterias_litio_compativeis WHERE modelo_hibrido_id=? ORDER BY nome_bateria ASC', modeloId)
    : await db.all('SELECT * FROM baterias_litio_compativeis ORDER BY nome_bateria ASC'));
});
app.post('/api/admin/baterias-litio', authRequired, requirePermission('contratos'), async (req, res) => {
  const { modelo_hibrido_id, nome_bateria, capacidade_kwh, status } = req.body;
  if (!modelo_hibrido_id || !nome_bateria?.trim()) return res.status(400).json({ message: 'Modelo e nome da bateria são obrigatórios.' });
  try {
    const r = await db.run('INSERT INTO baterias_litio_compativeis (modelo_hibrido_id, nome_bateria, capacidade_kwh, status) VALUES (?,?,?,?)', modelo_hibrido_id, nome_bateria.trim(), capacidade_kwh||null, status||'ativo');
    res.status(201).json(await db.get('SELECT * FROM baterias_litio_compativeis WHERE id=?', r.lastID));
  } catch (e) {
    if (e.message?.includes('UNIQUE')) return res.status(400).json({ message: 'Bateria já cadastrada para este modelo.' });
    throw e;
  }
});
app.put('/api/admin/baterias-litio/:id', authRequired, requirePermission('contratos'), async (req, res) => {
  const { nome_bateria, capacidade_kwh, status } = req.body;
  if (!nome_bateria?.trim()) return res.status(400).json({ message: 'Nome da bateria é obrigatório.' });
  try {
    await db.run('UPDATE baterias_litio_compativeis SET nome_bateria=?, capacidade_kwh=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', nome_bateria.trim(), capacidade_kwh||null, status||'ativo', req.params.id);
    res.json(await db.get('SELECT * FROM baterias_litio_compativeis WHERE id=?', req.params.id));
  } catch (e) {
    if (e.message?.includes('UNIQUE')) return res.status(400).json({ message: 'Bateria já cadastrada para este modelo.' });
    throw e;
  }
});

// ── Placas ──────────────────────────────────────────────────────────────────
app.get('/api/admin/placas', authRequired, requirePermission('contratos'), async (req, res) => {
  const rows = await db.all('SELECT * FROM placas ORDER BY modelo ASC');
  res.json(rows);
});

app.post('/api/admin/placas', authRequired, requirePermission('contratos'), async (req, res) => {
  const { modelo, potencia_w, status } = req.body;
  if (!modelo?.trim()) return res.status(400).json({ message: 'Modelo é obrigatório.' });
  try {
    const result = await db.run(
      'INSERT INTO placas (modelo, potencia_w, status) VALUES (?, ?, ?)',
      modelo.trim(), potencia_w || null, status || 'ativo'
    );
    const row = await db.get('SELECT * FROM placas WHERE id = ?', result.lastID);
    res.status(201).json(row);
  } catch (err) {
    if (err.message?.includes('UNIQUE')) return res.status(400).json({ message: 'Modelo de placa já cadastrado.' });
    throw err;
  }
});

app.put('/api/admin/placas/:id', authRequired, requirePermission('contratos'), async (req, res) => {
  const { modelo, potencia_w, status } = req.body;
  if (!modelo?.trim()) return res.status(400).json({ message: 'Modelo é obrigatório.' });
  try {
    await db.run(
      'UPDATE placas SET modelo = ?, potencia_w = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      modelo.trim(), potencia_w || null, status || 'ativo', req.params.id
    );
    const row = await db.get('SELECT * FROM placas WHERE id = ?', req.params.id);
    res.json(row);
  } catch (err) {
    if (err.message?.includes('UNIQUE')) return res.status(400).json({ message: 'Modelo de placa já cadastrado.' });
    throw err;
  }
});

// ── Marcas de inversor ───────────────────────────────────────────────────────
app.get('/api/admin/marcas-inversor', authRequired, requirePermission('contratos'), async (req, res) => {
  const rows = await db.all('SELECT * FROM marcas_inversor ORDER BY nome_marca ASC');
  res.json(rows);
});

app.post('/api/admin/marcas-inversor', authRequired, requirePermission('contratos'), async (req, res) => {
  const { nome_marca, status } = req.body;
  if (!nome_marca?.trim()) return res.status(400).json({ message: 'Nome da marca é obrigatório.' });
  try {
    const result = await db.run(
      'INSERT INTO marcas_inversor (nome_marca, status) VALUES (?, ?)',
      nome_marca.trim(), status || 'ativo'
    );
    const row = await db.get('SELECT * FROM marcas_inversor WHERE id = ?', result.lastID);
    res.status(201).json(row);
  } catch (err) {
    if (err.message?.includes('UNIQUE')) return res.status(400).json({ message: 'Marca já cadastrada.' });
    throw err;
  }
});

app.put('/api/admin/marcas-inversor/:id', authRequired, requirePermission('contratos'), async (req, res) => {
  const { nome_marca, status } = req.body;
  if (!nome_marca?.trim()) return res.status(400).json({ message: 'Nome da marca é obrigatório.' });
  try {
    await db.run(
      'UPDATE marcas_inversor SET nome_marca = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      nome_marca.trim(), status || 'ativo', req.params.id
    );
    const row = await db.get('SELECT * FROM marcas_inversor WHERE id = ?', req.params.id);
    res.json(row);
  } catch (err) {
    if (err.message?.includes('UNIQUE')) return res.status(400).json({ message: 'Marca já cadastrada.' });
    throw err;
  }
});

// ── Modelos de inversor ──────────────────────────────────────────────────────
app.get('/api/admin/modelos-inversor', authRequired, requirePermission('contratos'), async (req, res) => {
  const { marcaId } = req.query;
  const rows = marcaId
    ? await db.all('SELECT * FROM modelos_inversor WHERE marca_id = ? ORDER BY nome_modelo ASC', marcaId)
    : await db.all('SELECT * FROM modelos_inversor ORDER BY nome_modelo ASC');
  res.json(rows);
});

app.post('/api/admin/modelos-inversor', authRequired, requirePermission('contratos'), async (req, res) => {
  const { marca_id, nome_modelo, status } = req.body;
  if (!marca_id || !nome_modelo?.trim()) return res.status(400).json({ message: 'Marca e modelo são obrigatórios.' });
  try {
    const result = await db.run(
      'INSERT INTO modelos_inversor (marca_id, nome_modelo, status) VALUES (?, ?, ?)',
      marca_id, nome_modelo.trim(), status || 'ativo'
    );
    const row = await db.get('SELECT * FROM modelos_inversor WHERE id = ?', result.lastID);
    res.status(201).json(row);
  } catch (err) {
    if (err.message?.includes('UNIQUE')) return res.status(400).json({ message: 'Modelo já cadastrado para esta marca.' });
    throw err;
  }
});

app.put('/api/admin/modelos-inversor/:id', authRequired, requirePermission('contratos'), async (req, res) => {
  const { nome_modelo, status } = req.body;
  if (!nome_modelo?.trim()) return res.status(400).json({ message: 'Nome do modelo é obrigatório.' });
  try {
    await db.run(
      'UPDATE modelos_inversor SET nome_modelo = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      nome_modelo.trim(), status || 'ativo', req.params.id
    );
    const row = await db.get('SELECT * FROM modelos_inversor WHERE id = ?', req.params.id);
    res.json(row);
  } catch (err) {
    if (err.message?.includes('UNIQUE')) return res.status(400).json({ message: 'Modelo já cadastrado para esta marca.' });
    throw err;
  }
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

app.get('/api/admin/procuracoes', authRequired, requirePermission('contratos'), async (req, res) => {
  const rows = await db.all('SELECT * FROM procuracoes ORDER BY id DESC');
  res.json(rows.map(parseProcuracao));
});

app.post('/api/admin/procuracoes', authRequired, requirePermission('contratos'), async (req, res) => {
  const cliente = await db.get('SELECT * FROM clientes WHERE id = ?', req.body.clienteId);
  if (!cliente) return res.status(404).json({ message: 'Cliente não encontrado.' });

  const contratoId = Number(req.body.contratoId);
  if (!contratoId) return res.status(400).json({ message: 'Gere o contrato do cliente antes de iniciar a homologação.' });
  const contrato = await db.get('SELECT * FROM contratos WHERE id = ?', contratoId);
  if (!contrato) return res.status(404).json({ message: 'Contrato vinculado não encontrado.' });
  const parsedContrato = parseContrato(contrato);
  if (Number(parsedContrato.dados?.cliente?.id) !== Number(cliente.id)) {
    return res.status(400).json({ message: 'O contrato selecionado não pertence a este cliente.' });
  }

  const existing = await db.get('SELECT * FROM procuracoes WHERE contratoId = ? ORDER BY id DESC LIMIT 1', contratoId);
  if (existing) return res.json(parseProcuracao(existing));

  const titularMesmoContrato = req.body.titularMesmoContrato !== false;
  const titular = req.body.titular || {};
  const source = titularMesmoContrato
    ? { ...cliente, ...(parsedContrato.dados?.cliente || {}) }
    : {
      ...cliente,
      nome: String(titular.nome || '').trim(),
      cpfCnpj: String(titular.cpfCnpj || '').trim(),
      endereco: String(titular.endereco || '').trim(),
      numero: null,
      bairro: null,
      cep: null,
      cidade: cliente.cidade || parsedContrato.clienteCidade || parsedContrato.dados?.cliente?.cidade || 'Imperatriz',
      estado: cliente.estado || parsedContrato.dados?.cliente?.estado || 'MA',
      titularContaEnergia: true,
      clienteContratoNome: cliente.nome,
    };
  if (!source.nome || !source.cpfCnpj || !source.endereco || (titularMesmoContrato && (!source.cidade || !source.estado))) {
    return res.status(400).json({
      message: titularMesmoContrato
        ? 'Preencha CPF/CNPJ, endereço, cidade e estado do cliente antes de iniciar a homologação.'
        : 'Informe nome completo, CPF e endereço do titular exatamente como constam na concessionária.',
    });
  }

  const now = new Date();
  const expires = new Date(now);
  expires.setMonth(expires.getMonth() + 6);
  const snapshot = {
    ...source,
    enderecoCompleto: titularMesmoContrato ? buildClientAddress(source) : source.endereco,
    contratoId,
    contratoNumero: contrato.id,
    titularMesmoContrato,
  };
  delete snapshot.password;
  await db.run(
    `INSERT OR IGNORE INTO procuracoes
      (clienteId, contratoId, titularMesmoContrato, clienteNome, clienteCpfCnpj, clienteCidade, clienteEstado, clienteDados, status, criadoPorId, criadoPorNome, dataCriacao, validadeAte)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pendente', ?, ?, ?, ?)`,
    cliente.id, contratoId, titularMesmoContrato ? 1 : 0, source.nome, source.cpfCnpj, source.cidade, source.estado, JSON.stringify(snapshot),
    req.user.id, req.user.nome, now.toISOString(), expires.toISOString()
  );
  const procuracao = parseProcuracao(await db.get('SELECT * FROM procuracoes WHERE contratoId = ?', contratoId));
  io.emit('procuracao_atualizada', procuracao);
  res.status(201).json(procuracao);
});

app.put('/api/admin/procuracoes/:id/revisao', authRequired, requirePermission('contratos'), async (req, res) => {
  if (req.user.role !== 'ADM') return res.status(403).json({ message: 'Somente administrador pode aprovar ou recusar procurações.' });
  const status = String(req.body.status || '');
  const observation = String(req.body.observacaoAnalise || '').trim();
  if (!['Aprovado', 'Recusado'].includes(status)) return res.status(400).json({ message: 'Informe se a procuração foi aprovada ou recusada.' });
  if (status === 'Recusado' && !observation) return res.status(400).json({ message: 'Informe o motivo da recusa.' });
  const current = await db.get('SELECT * FROM procuracoes WHERE id = ?', req.params.id);
  if (!current) return res.status(404).json({ message: 'Procuração não encontrada.' });
  if (current.status === 'Aprovado' && !isMasterAdmin(req.user)) return res.status(403).json({ message: 'Procuração aprovada só pode ser alterada pelo admin master.' });
  await db.run(
    `UPDATE procuracoes SET status = ?, analisadoPorId = ?, analisadoPorNome = ?, observacaoAnalise = ?, dataAnalise = ? WHERE id = ?`,
    status, req.user.id, req.user.nome, observation || null, new Date().toISOString(), req.params.id
  );
  const updated = parseProcuracao(await db.get('SELECT * FROM procuracoes WHERE id = ?', req.params.id));
  io.emit('procuracao_atualizada', updated);
  res.json(updated);
});

app.get('/api/admin/procuracoes/:id/download', authRequired, requirePermission('contratos'), async (req, res) => {
  const procuracao = await db.get('SELECT * FROM procuracoes WHERE id = ?', req.params.id);
  if (!procuracao) return res.status(404).send('Procuração não encontrada.');
  if (procuracao.status !== 'Aprovado') return res.status(403).send('A procuração só pode ser baixada após aprovação.');
  await sendProcuracaoPdf(res, procuracao);
});

app.get('/api/admin/procuracoes/:id/preview', authRequired, requirePermission('contratos'), async (req, res) => {
  if (req.user.role !== 'ADM') return res.status(403).send('Somente administrador pode revisar procurações pendentes.');
  const procuracao = await db.get('SELECT * FROM procuracoes WHERE id = ?', req.params.id);
  if (!procuracao) return res.status(404).send('Procuração não encontrada.');
  await sendProcuracaoPdf(res, procuracao, { download: false });
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

  const cliente = orcamento.clienteId
    ? await db.get('SELECT * FROM clientes WHERE id = ?', orcamento.clienteId)
    : null;
  const dimensionamento = parseJsonField(orcamento.dimensionamento);
  const financeiro = parseJsonField(orcamento.financeiro);
  const equipamento = equipamentoId
    ? await db.get('SELECT * FROM equipamentos WHERE id = ?', equipamentoId)
    : await db.get('SELECT * FROM equipamentos WHERE active = 1 ORDER BY id DESC LIMIT 1');
  const manualFromOrcamento = {
    geracaoKwh: dimensionamento.geracao_estimada_kwh || '',
    geracaoAnualKwh: dimensionamento.geracao_anual_kwh || dimensionamento.geracao_anual_estimada_kwh || (dimensionamento.geracao_estimada_kwh ? Number(dimensionamento.geracao_estimada_kwh) * 12 : ''),
    potenciaKwp: dimensionamento.potencia_real_instalada_kwp || '',
    numeroPaineis: dimensionamento.numero_paineis_necessarios || '',
    painel: dimensionamento.placa_modelo || '',
    inversor: dimensionamento.inversor_modelo || '',
    quantidadeCabo: dimensionamento.quantidade_cabo_cc || '',
    valorSistema: financeiro.preco_final_cliente_rs || '',
    valorEntrada: financeiro.entrada_rs ?? '',
    valorSaldo: financeiro.saldo_rs ?? '',
    prazoExecucao: '',
    formaPagamentoTipo: financeiro.forma_pagamento_tipo || financeiro.forma_pagamento || '',
    formaPagamento: financeiro.condicoes_pagamento || '',
  };
  const manualOverrides = Object.fromEntries(
    Object.entries(manual || {}).filter(([, value]) => value !== '' && typeof value !== 'undefined' && value !== null)
  );
  const manualFinal = mergeManualWithEquipamento({ ...manualFromOrcamento, ...manualOverrides }, equipamento);
  const consultorId = cliente?.consultorId ?? orcamento.assignedUserId ?? req.user.id ?? null;
  const consultorNome = String(cliente?.consultorNome || orcamento.assignedUserName || req.user.nome || '').trim() || 'Sem consultor';
  const now = new Date().toISOString();
  const dados = {
    cliente: cliente ? publicClient(cliente) : {
      id: orcamento.clienteId || null,
      nome: orcamento.clienteNome,
      whatsapp: orcamento.clienteTelefone,
      email: orcamento.clienteEmail,
      cidade: orcamento.clienteCidade,
    },
    dimensionamento,
    financeiro,
    manual: manualFinal,
    assinatura: {
      drm: null,
      cliente: null,
      link: null,
    },
    consultor: {
      id: consultorId,
      nome: consultorNome,
    },
    statusOrigem: orcamento.status,
    observacao: dimensionamento.observacoes || 'Contrato gerado no sistema e aguardando aprovação do responsável administrativo.',
  };

  const result = await db.run(
    `INSERT INTO contratos
      (orcamentoId, clienteNome, clienteTelefone, clienteEmail, clienteCidade, valorProjeto, status, dados,
       criadoPorId, criadoPorNome, dataCriacao, assignedUserId, assignedUserName, equipamentoId, equipamentoNome, equipamentoDados, consultorId, consultorNome, assinaturaStatus)
     VALUES (?, ?, ?, ?, ?, ?, 'Pendente', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    orcamento.id,
    orcamento.clienteNome,
    orcamento.clienteTelefone,
    orcamento.clienteEmail,
    orcamento.clienteCidade,
    moneyNumberOrNull(manualFinal.valorSistema || financeiro.preco_final_cliente_rs) || 0,
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
    }),
    consultorId,
    consultorNome,
    'Pendente de assinaturas'
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

  const existing = await db.get(
    `SELECT * FROM contratos
     WHERE json_valid(dados) = 1
       AND CAST(json_extract(dados, '$.cliente.id') AS INTEGER) = ?
     ORDER BY id DESC
     LIMIT 1`,
    cliente.id
  );
  if (existing) return res.json(parseContrato(existing));

  const equipamento = equipamentoId
    ? await db.get('SELECT * FROM equipamentos WHERE id = ?', equipamentoId)
    : await db.get('SELECT * FROM equipamentos WHERE active = 1 ORDER BY id DESC LIMIT 1');
  const manualFinal = mergeManualWithEquipamento(manual, equipamento);
  const consultorId = cliente.consultorId ?? req.user.id ?? null;
  const consultorNome = String(cliente.consultorNome || req.user.nome || '').trim() || 'Sem consultor';

  const potenciaKwp = Number(manualFinal.potenciaKwp || 0);
  const potenciaPlacaW = Number(equipamento?.potenciaPlacaW || 0);
  const numeroPaineis = Number(manualFinal.numeroPaineis || 0) || (
    potenciaKwp && potenciaPlacaW ? Math.ceil(potenciaKwp / (potenciaPlacaW / 1000)) : 0
  );
  const geracaoMensal = Number(manualFinal.geracaoKwh || 0);
  const valorSistema = moneyNumberOrNull(manualFinal.valorSistema) || 0;
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
      entrada_rs: moneyNumberOrNull(manualFinal.valorEntrada) || 0,
      saldo_rs: moneyNumberOrNull(manualFinal.valorSaldo) || 0,
    },
    manual: manualFinal,
    assinatura: {
      drm: null,
      cliente: null,
      link: null,
    },
    consultor: {
      id: consultorId,
      nome: consultorNome,
    },
    cliente: clienteSnapshot,
    statusOrigem: 'Cliente cadastrado',
    observacao: 'Contrato gerado diretamente a partir do cadastro completo do cliente.',
  };

  const result = await db.run(
    `INSERT INTO contratos
      (orcamentoId, clienteNome, clienteTelefone, clienteEmail, clienteCidade, valorProjeto, status, dados,
       criadoPorId, criadoPorNome, dataCriacao, assignedUserId, assignedUserName, equipamentoId, equipamentoNome, equipamentoDados, consultorId, consultorNome, assinaturaStatus)
     VALUES (NULL, ?, ?, ?, ?, ?, 'Pendente', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    }),
    consultorId,
    consultorNome,
    'Pendente de assinaturas'
  );

  const contrato = await db.get('SELECT * FROM contratos WHERE id = ?', result.lastID);
  const parsedContrato = parseContrato(contrato);
  io.emit('contrato_atualizado', parsedContrato);
  res.status(201).json(parsedContrato);
});

app.put('/api/admin/contratos/:id', authRequired, requirePermission('contratos'), async (req, res) => {
  const contrato = await db.get('SELECT * FROM contratos WHERE id = ?', req.params.id);
  if (!contrato) return res.status(404).json({ message: 'Contrato não encontrado.' });

  if (req.user.role !== 'ADM') {
    return res.status(403).json({ message: 'Somente administrador pode revisar dados de contrato.' });
  }

  if (contrato.status === 'Aprovado' && !isMasterAdmin(req.user)) {
    return res.status(403).json({ message: 'Contrato aprovado só pode ser alterado pelo admin master.' });
  }

  try {
    const data = normalizeContractReviewPayload(req.body, contrato);
    await db.run(
      `UPDATE contratos
       SET clienteNome = ?,
           clienteTelefone = ?,
           clienteEmail = ?,
           clienteCidade = ?,
           consultorId = ?,
           consultorNome = ?,
           valorProjeto = ?,
           dados = ?,
           equipamentoDados = ?
       WHERE id = ?`,
      data.clienteNome,
      data.clienteTelefone,
      data.clienteEmail,
      data.clienteCidade,
      data.consultorId,
      data.consultorNome,
      data.valorProjeto,
      JSON.stringify(data.dados),
      JSON.stringify(data.equipamentoDados),
      req.params.id
    );

    if (contrato.status === 'Aprovado') {
      await db.run(
        `UPDATE projetos
         SET clienteNome = ?, clienteTelefone = ?, clienteCidade = ?, valorProjeto = ?, updatedAt = ?
         WHERE contratoId = ?`,
        data.clienteNome,
        data.clienteTelefone,
        data.clienteCidade,
        data.valorProjeto,
        new Date().toISOString(),
        req.params.id
      );
    }

    const updated = parseContrato(await db.get('SELECT * FROM contratos WHERE id = ?', req.params.id));
    io.emit('contrato_atualizado', updated);
    res.json(updated);
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : 'Erro ao atualizar contrato.' });
  }
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
  if (contrato.status === 'Aprovado' && !isMasterAdmin(req.user)) {
    return res.status(403).json({ message: 'Contrato aprovado só pode ser alterado pelo admin master.' });
  }

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

  let updated = parseContrato(await db.get('SELECT * FROM contratos WHERE id = ?', req.params.id));
  if (updated.status === 'Aprovado') {
    const assinaturaAtual = updated.dados?.assinatura || {};
    const assinatura = {
      ...assinaturaAtual,
      method: 'Assinatura eletrônica simples com trilha de evidências',
      provider: 'DRM Energia Solar',
      drm: buildAutoDrmSignature({
        signedAt: assinaturaAtual?.drm?.signedAt || new Date().toISOString(),
        approvedByUser: req.user,
      }),
    };
    const nextDados = {
      ...(updated.dados || {}),
      assinatura,
    };
    const assinaturaComHash = {
      ...assinatura,
      documentHash: buildSignatureDocumentHash({
        ...updated,
        dados: nextDados,
      }),
    };
    await db.run(
      'UPDATE contratos SET dados = ?, assinaturaStatus = ? WHERE id = ?',
      JSON.stringify({
        ...(updated.dados || {}),
        assinatura: assinaturaComHash,
      }),
      resolveAssinaturaStatus(assinaturaComHash),
      req.params.id
    );
    updated = parseContrato(await db.get('SELECT * FROM contratos WHERE id = ?', req.params.id));
    await createProjetoFromContrato(updated);
  }
  io.emit('contrato_atualizado', updated);
  res.json(updated);
});

app.post('/api/admin/contratos/:id/assinatura-link', authRequired, requirePermission('contratos'), async (req, res) => {
  const contrato = await db.get('SELECT * FROM contratos WHERE id = ?', req.params.id);
  if (!contrato) return res.status(404).json({ message: 'Contrato não encontrado.' });
  if (!can(req.user, 'verTodosLeads') && contrato.assignedUserId !== req.user.id && contrato.criadoPorId !== req.user.id) {
    return res.status(403).json({ message: 'Você não pode gerar link para este contrato.' });
  }
  if (contrato.status !== 'Aprovado') {
    return res.status(400).json({ message: 'A assinatura digital é liberada somente após a aprovação do contrato.' });
  }

  const parsed = parseContrato(contrato);
  const existingAssinatura = parsed.dados?.assinatura || {};
  const now = new Date();
  const signatureAlreadyCompleted = Boolean(existingAssinatura?.cliente?.signedAt);
  if (signatureAlreadyCompleted) {
    return res.status(400).json({ message: 'Este contrato já foi assinado pelo cliente e o link não pode mais ser reaberto.' });
  }
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30).toISOString();
  const drm = buildAutoDrmSignature({
    signedAt: existingAssinatura?.drm?.signedAt || now.toISOString(),
    approvedByUser: req.user,
  });
  const documentHash = buildSignatureDocumentHash({
    ...parsed,
    dados: {
      ...(parsed.dados || {}),
      assinatura: {
        ...existingAssinatura,
        drm,
      },
    },
  });
  const assinatura = {
    ...existingAssinatura,
    method: 'Assinatura eletrônica simples com trilha de evidências',
    provider: 'DRM Energia Solar',
    documentHash,
    drm,
    link: {
      token,
      createdAt: now.toISOString(),
      expiresAt,
      createdById: req.user.id,
      createdByName: req.user.nome,
    },
  };
  const assinaturaStatus = resolveAssinaturaStatus(assinatura);
  const nextDados = {
    ...(parsed.dados || {}),
    assinatura,
  };

  await db.run(
    `UPDATE contratos
     SET dados = ?, assinaturaStatus = ?, assinaturaToken = ?, assinaturaSolicitadaEm = ?, assinaturaTokenExpiraEm = ?
     WHERE id = ?`,
    JSON.stringify(nextDados),
    assinaturaStatus,
    token,
    now.toISOString(),
    expiresAt,
    contrato.id
  );

  const updated = parseContrato(await db.get('SELECT * FROM contratos WHERE id = ?', contrato.id));
  io.emit('contrato_atualizado', updated);

  const baseUrl = `${req.protocol}://${req.get('host')}`;
  res.json({
    contrato: updated,
    signatureUrl: `${baseUrl}/assinatura/contrato/${token}`,
    expiresAt,
    documentHash,
  });
});

app.post('/api/admin/contratos/:id/assinar-drm', authRequired, requirePermission('contratos'), async (req, res) => {
  const contrato = await db.get('SELECT * FROM contratos WHERE id = ?', req.params.id);
  if (!contrato) return res.status(404).json({ message: 'Contrato não encontrado.' });
  if (req.user.role !== 'ADM') {
    return res.status(403).json({ message: 'Somente a administração pode assinar pela DRM.' });
  }
  if (contrato.status !== 'Aprovado') {
    return res.status(400).json({ message: 'A assinatura DRM só é liberada após a aprovação do contrato.' });
  }

  const signerName = String(req.body?.signerName || req.user.nome || '').trim();
  if (!signerName) return res.status(400).json({ message: 'Informe o nome do responsável que está assinando pela DRM.' });
  const signatureCheck = validateSignatureDataUrl(req.body?.signatureDataUrl);
  if (!signatureCheck.valid) return res.status(400).json({ message: signatureCheck.message });

  const parsed = parseContrato(contrato);
  const assinatura = {
    ...(parsed.dados?.assinatura || {}),
    drm: {
      signedAt: new Date().toISOString(),
      signedById: req.user.id,
      signedByName: signerName,
      dataUrl: signatureCheck.dataUrl,
      ip: getRequestIp(req),
      userAgent: String(req.headers['user-agent'] || ''),
    },
  };
  const nextDados = {
    ...(parsed.dados || {}),
    assinatura,
  };
  const assinaturaStatus = resolveAssinaturaStatus(assinatura);

  await db.run(
    'UPDATE contratos SET dados = ?, assinaturaStatus = ? WHERE id = ?',
    JSON.stringify(nextDados),
    assinaturaStatus,
    contrato.id
  );

  const updated = parseContrato(await db.get('SELECT * FROM contratos WHERE id = ?', contrato.id));
  io.emit('contrato_atualizado', updated);
  res.json(updated);
});

app.get('/api/assinatura/contrato/:token', async (req, res) => {
  const token = String(req.params.token || '').trim();
  if (!token) return res.status(400).json({ message: 'Token de assinatura inválido.' });
  const contrato = await db.get('SELECT * FROM contratos WHERE assinaturaToken = ?', token);
  if (!contrato) return res.status(404).json({ message: 'Link de assinatura não encontrado.' });

  const parsed = parseContrato(contrato);
  const expiresAt = contrato.assinaturaTokenExpiraEm || parsed.dados?.assinatura?.link?.expiresAt || null;
  if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
    return res.status(410).json({ message: 'Este link de assinatura expirou. Gere um novo link no painel.' });
  }
  if (parsed.dados?.assinatura?.link?.consumedAt) {
    return res.status(410).json({ message: 'Este link de assinatura já foi concluído e não pode mais ser reaberto.' });
  }

  res.json({
    id: parsed.id,
    numero: `CT-${String(parsed.dataCriacao || '').slice(0, 4) || new Date().getFullYear()}-${String(parsed.id || '').padStart(4, '0')}`,
    clienteNome: parsed.clienteNome,
    clienteCidade: parsed.clienteCidade,
    clienteTelefone: parsed.clienteTelefone,
    clienteEmail: parsed.clienteEmail,
    valorProjeto: parsed.valorProjeto,
    status: parsed.status,
    assinaturaStatus: parsed.assinaturaStatus,
    assinatura: parsed.dados?.assinatura || {},
    evidencias: buildSignatureEvidenceSummary(parsed),
    resumo: {
      potenciaKwp: parsed.dados?.manual?.potenciaKwp ?? parsed.dados?.dimensionamento?.potencia_real_instalada_kwp ?? '',
      geracaoKwh: parsed.dados?.manual?.geracaoKwh ?? parsed.dados?.dimensionamento?.geracao_estimada_kwh ?? '',
      formaPagamento: parsed.dados?.manual?.formaPagamento || parsed.equipamentoDados?.formaPagamento || '',
    },
    previewUrl: `/api/assinatura/contrato/${token}/pdf`,
    downloadUrl: `/api/assinatura/contrato/${token}/download`,
    expiresAt,
  });
});

app.post('/api/assinatura/contrato/:token/cliente', async (req, res) => {
  const token = String(req.params.token || '').trim();
  if (!token) return res.status(400).json({ message: 'Token de assinatura inválido.' });
  const contrato = await db.get('SELECT * FROM contratos WHERE assinaturaToken = ?', token);
  if (!contrato) return res.status(404).json({ message: 'Link de assinatura não encontrado.' });
  if (contrato.status !== 'Aprovado') {
    return res.status(400).json({ message: 'Este contrato ainda não está liberado para assinatura.' });
  }
  if (contrato.assinaturaTokenExpiraEm && new Date(contrato.assinaturaTokenExpiraEm).getTime() < Date.now()) {
    return res.status(410).json({ message: 'Este link expirou. Solicite um novo link para a DRM.' });
  }

  const signerName = String(req.body?.signerName || '').trim();
  if (!signerName) return res.status(400).json({ message: 'Informe seu nome para concluir a assinatura.' });
  if (!req.body?.acceptedTerms) {
    return res.status(400).json({ message: 'Confirme a leitura e o aceite do contrato antes de assinar.' });
  }
  const existingAssinatura = parseContrato(contrato).dados?.assinatura || {};
  if (existingAssinatura?.cliente?.signedAt || existingAssinatura?.link?.consumedAt) {
    return res.status(409).json({ message: 'Este contrato já foi assinado e o link não aceita nova assinatura.' });
  }
  const signatureCheck = validateSignatureDataUrl(req.body?.signatureDataUrl);
  if (!signatureCheck.valid) return res.status(400).json({ message: signatureCheck.message });

  const parsed = parseContrato(contrato);
  const documentHash = buildSignatureDocumentHash(parsed);
  const assinatura = {
    ...(parsed.dados?.assinatura || {}),
    cliente: {
      signedAt: new Date().toISOString(),
      signedByName: signerName,
      dataUrl: signatureCheck.dataUrl,
      ip: getRequestIp(req),
      userAgent: String(req.headers['user-agent'] || ''),
      referer: String(req.headers.referer || ''),
      acceptedTerms: true,
      acceptedAt: new Date().toISOString(),
      documentHash,
    },
    link: {
      ...(parsed.dados?.assinatura?.link || {}),
      consumedAt: new Date().toISOString(),
    },
  };
  const nextDados = {
    ...(parsed.dados || {}),
    assinatura,
  };
  const assinaturaStatus = resolveAssinaturaStatus(assinatura);

  await db.run(
    'UPDATE contratos SET dados = ?, assinaturaStatus = ?, assinaturaToken = NULL, assinaturaTokenExpiraEm = NULL WHERE id = ?',
    JSON.stringify(nextDados),
    assinaturaStatus,
    contrato.id
  );

  const updated = parseContrato(await db.get('SELECT * FROM contratos WHERE id = ?', contrato.id));
  io.emit('contrato_atualizado', updated);
  res.json({
    message: 'Assinatura registrada com sucesso.',
    assinaturaStatus: updated.assinaturaStatus,
    downloadUrl: `/api/assinatura/contrato/${token}/download`,
  });
});

app.get('/api/assinatura/contrato/:token/pdf', async (req, res) => {
  const contrato = await db.get('SELECT * FROM contratos WHERE assinaturaToken = ?', req.params.token);
  if (!contrato) return res.status(404).send('Link de assinatura não encontrado.');
  if (contrato.assinaturaTokenExpiraEm && new Date(contrato.assinaturaTokenExpiraEm).getTime() < Date.now()) {
    return res.status(410).send('Este link expirou.');
  }
  await sendContratoPdf(res, contrato, { download: false });
});

app.get('/api/assinatura/contrato/:token/download', async (req, res) => {
  const contrato = await db.get('SELECT * FROM contratos WHERE assinaturaToken = ?', req.params.token);
  if (!contrato) return res.status(404).send('Link de assinatura não encontrado.');
  if (contrato.assinaturaTokenExpiraEm && new Date(contrato.assinaturaTokenExpiraEm).getTime() < Date.now()) {
    return res.status(410).send('Este link expirou.');
  }
  await sendContratoPdf(res, contrato, { download: true });
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
  const mergedPermissions = normalizePermissions(permissions || {
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
    JSON.stringify(normalizePermissions(permissions)),
    active === false ? 0 : 1,
    typeof whatsapp === 'undefined' ? user.whatsapp : normalizeWhatsAppPhone(whatsapp),
    req.params.id
  );

  res.json({ message: 'Permissões atualizadas.' });
});

app.get('/api/admin/comunicacoes', authRequired, requirePermission('usuarios'), async (req, res) => {
  const audienceIds = ['clientes_verificados', 'clientes_novos', 'clientes_antigos', 'todos_clientes', 'leads', 'equipe'];
  const audienceCounts = {};
  for (const audience of audienceIds) audienceCounts[audience] = (await getCommunicationAudience(audience)).length;
  const history = await db.all('SELECT * FROM communication_campaigns ORDER BY id DESC LIMIT 40');
  res.json({ templates: COMMUNICATION_TEMPLATES, audienceCounts, history });
});

app.post('/api/admin/comunicacoes/teste', authRequired, requirePermission('usuarios'), async (req, res) => {
  const { to, subject, heading, message, ctaLabel, ctaUrl } = req.body;
  if (!isRealEmail(to)) return res.status(400).json({ message: 'Informe um e-mail válido para o teste.' });
  if (!String(subject || '').trim() || !String(heading || '').trim() || !String(message || '').trim()) {
    return res.status(400).json({ message: 'Assunto, título e mensagem são obrigatórios.' });
  }
  await sendCommunicationEmail({ to: normalizeEmail(to), name: req.user.nome, subject, heading, message, ctaLabel, ctaUrl });
  res.json({ message: `Prévia enviada para ${normalizeEmail(to)}.` });
});

app.post('/api/admin/comunicacoes/disparar', authRequired, requirePermission('usuarios'), async (req, res) => {
  const { templateId = 'custom', audience, subject, heading, message, ctaLabel = 'Acessar', ctaUrl = '/' } = req.body;
  if (!String(subject || '').trim() || !String(heading || '').trim() || !String(message || '').trim()) {
    return res.status(400).json({ message: 'Assunto, título e mensagem são obrigatórios.' });
  }
  const recipients = await getCommunicationAudience(audience);
  if (!recipients.length) return res.status(400).json({ message: 'Nenhum destinatário válido encontrado para este público.' });
  const now = new Date().toISOString();
  const result = await db.run(
    `INSERT INTO communication_campaigns
      (templateId, audience, subject, heading, message, ctaLabel, ctaUrl, totalRecipients, status, createdById, createdByName, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'sending', ?, ?, ?)`,
    templateId, audience, subject, heading, message, ctaLabel, ctaUrl, recipients.length, req.user.id, req.user.nome, now
  );
  let sent = 0;
  let failed = 0;
  for (const recipient of recipients) {
    try {
      await sendCommunicationEmail({ to: recipient.email, name: recipient.name, subject, heading, message, ctaLabel, ctaUrl });
      sent += 1;
      await db.run(
        `INSERT INTO communication_deliveries (campaignId, audience, email, name, subject, status, sentAt)
         VALUES (?, ?, ?, ?, ?, 'sent', ?)`,
        result.lastID, audience, recipient.email, recipient.name, subject, new Date().toISOString()
      );
    } catch (error) {
      failed += 1;
      await db.run(
        `INSERT INTO communication_deliveries (campaignId, audience, email, name, subject, status, error)
         VALUES (?, ?, ?, ?, ?, 'failed', ?)`,
        result.lastID, audience, recipient.email, recipient.name, subject, String(error.message || error).slice(0, 500)
      );
    }
  }
  await db.run(
    'UPDATE communication_campaigns SET sentCount = ?, failedCount = ?, status = ?, sentAt = ? WHERE id = ?',
    sent, failed, failed ? 'partial' : 'sent', new Date().toISOString(), result.lastID
  );
  res.json({ message: `Disparo concluído: ${sent} enviado${sent === 1 ? '' : 's'} e ${failed} falha${failed === 1 ? '' : 's'}.`, sent, failed });
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
  if (!isMasterAdminUser(req.user) && lead.assignedUserId !== req.user.id) {
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
  if (!isMasterAdminUser(req.user) && lead.assignedUserId !== req.user.id) {
    return res.status(403).json({ message: 'Este lead pertence a outro usuário.' });
  }

  const { tipo = 'Contato', origem = '', descricao, resultado = '', proximoRetorno } = req.body;
  if (!String(descricao || '').trim()) {
    return res.status(400).json({ message: 'Descreva a atividade realizada.' });
  }

  const now = new Date().toISOString();
  const result = await db.run(
    `INSERT INTO atividades
      (leadId, clienteNome, tipo, origem, descricao, resultado, proximoRetorno, criadoPorId, criadoPorNome, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    lead.id,
    lead.nome,
    tipo,
    origem,
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
  const atividades = isMasterAdminUser(req.user)
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

  const {
    etapa,
    prioridade,
    responsavelId,
    observacoes,
    prazoPrevisto,
    checklist,
    equipamentoEnviadoAt,
    instalacaoAgendada,
    instalacaoConcluidaAt,
    pedidoLigacaoAt,
    previsaoLigacao,
    equipamentoEntregueAt,
    medidorTrocadoAt,
  } = req.body;
  const normalizedEtapa = etapa ? normalizeProjectStage(etapa) : null;
  if (normalizedEtapa && !PROJECT_STAGES.includes(normalizedEtapa) && !INSTALLATION_STAGES.includes(normalizedEtapa)) {
    return res.status(400).json({ message: 'Etapa de projeto inválida.' });
  }

  let responsavelNome = null;
  if (responsavelId) {
    const user = await db.get('SELECT nome FROM usuarios WHERE id = ?', responsavelId);
    responsavelNome = user?.nome || null;
  }

  const timeline = parseJsonField(projeto.timeline, []);
  const nextTimeline = normalizedEtapa && normalizedEtapa !== normalizeProjectStage(projeto.etapa)
    ? appendProjetoTimeline(projeto, timelineEvent({
      tipo: 'etapa',
      titulo: `Etapa alterada para ${normalizedEtapa}`,
      descricao: `Movimento operacional registrado no workflow de homologação.`,
      responsavel: req.user.nome || req.user.username || 'Equipe DRM',
    }))
    : timeline;

  await db.run(
    `UPDATE projetos
     SET etapa = COALESCE(?, etapa),
         prioridade = COALESCE(?, prioridade),
         responsavelId = COALESCE(?, responsavelId),
         responsavelNome = COALESCE(?, responsavelNome),
         checklist = COALESCE(?, checklist),
         observacoes = COALESCE(?, observacoes),
         prazoPrevisto = COALESCE(?, prazoPrevisto),
         equipamentoEnviadoAt = COALESCE(?, equipamentoEnviadoAt),
         instalacaoAgendada = COALESCE(?, instalacaoAgendada),
         instalacaoConcluidaAt = COALESCE(?, instalacaoConcluidaAt),
         pedidoLigacaoAt = COALESCE(?, pedidoLigacaoAt),
         previsaoLigacao = COALESCE(?, previsaoLigacao),
         equipamentoEntregueAt = COALESCE(?, equipamentoEntregueAt),
         medidorTrocadoAt = COALESCE(?, medidorTrocadoAt),
         timeline = COALESCE(?, timeline),
         updatedAt = ?
     WHERE id = ?`,
    normalizedEtapa || null,
    prioridade || null,
    responsavelId || null,
    responsavelNome,
    checklist ? JSON.stringify(checklist) : null,
    observacoes || null,
    prazoPrevisto || null,
    equipamentoEnviadoAt || null,
    instalacaoAgendada || null,
    instalacaoConcluidaAt || null,
    pedidoLigacaoAt || null,
    previsaoLigacao || null,
    equipamentoEntregueAt || null,
    medidorTrocadoAt || null,
    JSON.stringify(nextTimeline),
    new Date().toISOString(),
    req.params.id
  );

  const updated = parseProjeto(await db.get('SELECT * FROM projetos WHERE id = ?', req.params.id));
  const changeMessages = [];
  if (normalizedEtapa && normalizedEtapa !== normalizeProjectStage(projeto.etapa)) changeMessages.push(`Seu projeto avançou para a etapa: ${normalizedEtapa}.`);
  if (prazoPrevisto && prazoPrevisto !== projeto.prazoPrevisto) changeMessages.push(`A previsão de entrega foi atualizada para ${new Date(prazoPrevisto).toLocaleDateString('pt-BR')}.`);
  if (equipamentoEnviadoAt && equipamentoEnviadoAt !== projeto.equipamentoEnviadoAt) changeMessages.push('O envio do equipamento foi registrado.');
  if (instalacaoAgendada && instalacaoAgendada !== projeto.instalacaoAgendada) changeMessages.push(`Sua instalação foi agendada para ${new Date(instalacaoAgendada).toLocaleString('pt-BR')}.`);
  if (instalacaoConcluidaAt && instalacaoConcluidaAt !== projeto.instalacaoConcluidaAt) changeMessages.push('A instalação do sistema foi marcada como concluída.');
  if (pedidoLigacaoAt && pedidoLigacaoAt !== projeto.pedidoLigacaoAt) changeMessages.push('O pedido de ligação foi registrado.');
  if (previsaoLigacao && previsaoLigacao !== projeto.previsaoLigacao) changeMessages.push(`A previsão da ligação pela Equatorial foi atualizada para ${new Date(previsaoLigacao).toLocaleDateString('pt-BR')}.`);
  if (changeMessages.length) {
    await notifyClientByContract(projeto.contratoId, {
      projetoId: projeto.id,
      type: 'update',
      title: 'Novidade no seu projeto',
      message: changeMessages.join(' '),
      action: 'tracking',
    });
  }
  io.emit('projeto_atualizado', updated);
  res.json(updated);
});

app.post('/api/admin/projetos/:id/pendencias', authRequired, requirePermission('equipeTecnica'), async (req, res) => {
  const projeto = await db.get('SELECT * FROM projetos WHERE id = ?', req.params.id);
  if (!projeto) return res.status(404).json({ message: 'Projeto não encontrado.' });
  if (!can(req.user, 'verTodosLeads') && projeto.responsavelId !== req.user.id) {
    return res.status(403).json({ message: 'Este projeto pertence a outro responsável.' });
  }

  const now = new Date().toISOString();
  const pendencia = {
    id: `pend-${Date.now()}`,
    tipo: String(req.body.tipo || 'Pendência da concessionária').trim(),
    descricao: String(req.body.descricao || '').trim(),
    origem: String(req.body.origem || 'Concessionária').trim(),
    prazo: req.body.prazo || '',
    responsavel: String(req.body.responsavel || req.user.nome || req.user.username || 'Equipe DRM').trim(),
    anexos: Array.isArray(req.body.anexos) ? req.body.anexos : [],
    status: String(req.body.status || 'Aberta').trim(),
    dataAbertura: now,
    dataCorrecao: '',
    observacoes: String(req.body.observacoes || '').trim(),
  };

  if (!pendencia.descricao) {
    return res.status(400).json({ message: 'Descreva a pendência antes de salvar.' });
  }

  const pendencias = [pendencia, ...parseJsonField(projeto.pendenciasHomologacao, [])];
  const checklist = {
    ...parseJsonField(projeto.checklist, {}),
    pendenciaConcessionaria: true,
  };
  const timeline = appendProjetoTimeline(projeto, timelineEvent({
    tipo: 'pendencia',
    titulo: `${pendencia.tipo} registrada`,
    descricao: pendencia.descricao,
    responsavel: pendencia.responsavel,
  }));

  await db.run(
    `UPDATE projetos
     SET etapa = ?, pendenciasHomologacao = ?, checklist = ?, timeline = ?, updatedAt = ?
     WHERE id = ?`,
    'Pendência da concessionária',
    JSON.stringify(pendencias),
    JSON.stringify(checklist),
    JSON.stringify(timeline),
    now,
    req.params.id
  );

  await notifyClientByContract(projeto.contratoId, {
    projetoId: projeto.id,
    type: 'homologacao',
    title: 'Pendência na homologação',
    message: `Registramos uma pendência: ${pendencia.tipo}. A equipe DRM já está acompanhando a correção.`,
  });

  const updated = parseProjeto(await db.get('SELECT * FROM projetos WHERE id = ?', req.params.id));
  io.emit('projeto_atualizado', updated);
  res.status(201).json(updated);
});

app.put('/api/admin/projetos/:id/pendencias/:pendenciaId', authRequired, requirePermission('equipeTecnica'), async (req, res) => {
  const projeto = await db.get('SELECT * FROM projetos WHERE id = ?', req.params.id);
  if (!projeto) return res.status(404).json({ message: 'Projeto não encontrado.' });
  if (!can(req.user, 'verTodosLeads') && projeto.responsavelId !== req.user.id) {
    return res.status(403).json({ message: 'Este projeto pertence a outro responsável.' });
  }

  const now = new Date().toISOString();
  const pendencias = parseJsonField(projeto.pendenciasHomologacao, []);
  let found = false;
  const updatedPendencias = pendencias.map(item => {
    if (item.id !== req.params.pendenciaId) return item;
    found = true;
    const status = req.body.status || item.status;
    return {
      ...item,
      ...req.body,
      status,
      dataCorrecao: status === 'Corrigida' || status === 'Concluída' ? (item.dataCorrecao || now) : item.dataCorrecao,
      updatedAt: now,
    };
  });
  if (!found) return res.status(404).json({ message: 'Pendência não encontrada.' });

  const hasOpenPendencias = updatedPendencias.some(item => !['Corrigida', 'Concluída', 'Cancelada'].includes(item.status));
  const timeline = appendProjetoTimeline(projeto, timelineEvent({
    tipo: 'pendencia',
    titulo: `Pendência ${req.body.status || 'atualizada'}`,
    descricao: req.body.observacoes || req.body.descricao || 'Atualização registrada no workflow.',
    responsavel: req.user.nome || req.user.username || 'Equipe DRM',
  }));

  await db.run(
    `UPDATE projetos
     SET etapa = ?, pendenciasHomologacao = ?, timeline = ?, updatedAt = ?
     WHERE id = ?`,
    hasOpenPendencias ? 'Pendência da concessionária' : 'Corrigir projeto',
    JSON.stringify(updatedPendencias),
    JSON.stringify(timeline),
    now,
    req.params.id
  );

  const updated = parseProjeto(await db.get('SELECT * FROM projetos WHERE id = ?', req.params.id));
  io.emit('projeto_atualizado', updated);
  res.json(updated);
});

app.post('/api/admin/projetos/:id/envios-homologacao', authRequired, requirePermission('equipeTecnica'), async (req, res) => {
  const projeto = await db.get('SELECT * FROM projetos WHERE id = ?', req.params.id);
  if (!projeto) return res.status(404).json({ message: 'Projeto não encontrado.' });
  if (!can(req.user, 'verTodosLeads') && projeto.responsavelId !== req.user.id) {
    return res.status(403).json({ message: 'Este projeto pertence a outro responsável.' });
  }

  const now = new Date().toISOString();
  const envios = parseJsonField(projeto.enviosHomologacao, []);
  const envio = {
    id: `envio-${Date.now()}`,
    numero: envios.length + 1,
    protocolo: String(req.body.protocolo || '').trim(),
    tipo: String(req.body.tipo || (envios.length ? 'Reenvio' : 'Envio inicial')).trim(),
    status: String(req.body.status || 'Enviado').trim(),
    resposta: String(req.body.resposta || '').trim(),
    responsavel: String(req.body.responsavel || req.user.nome || req.user.username || 'Equipe DRM').trim(),
    dataEnvio: req.body.dataEnvio || now,
    anexos: Array.isArray(req.body.anexos) ? req.body.anexos : [],
  };
  const nextEtapa = envio.tipo.toLowerCase().includes('reenvio') ? 'Reenviar projeto' : 'Projeto enviado';
  const checklist = {
    ...parseJsonField(projeto.checklist, {}),
    projetoEnviado: true,
    projetoReenviado: envios.length > 0 || undefined,
  };
  const timeline = appendProjetoTimeline(projeto, timelineEvent({
    tipo: 'envio',
    titulo: `${envio.tipo} #${envio.numero}`,
    descricao: envio.protocolo ? `Protocolo ${envio.protocolo}` : 'Envio registrado para a concessionária.',
    responsavel: envio.responsavel,
  }));

  await db.run(
    `UPDATE projetos
     SET etapa = ?, enviosHomologacao = ?, checklist = ?, timeline = ?, updatedAt = ?
     WHERE id = ?`,
    nextEtapa,
    JSON.stringify([envio, ...envios]),
    JSON.stringify(checklist),
    JSON.stringify(timeline),
    now,
    req.params.id
  );

  await notifyClientByContract(projeto.contratoId, {
    projetoId: projeto.id,
    type: 'homologacao',
    title: 'Projeto enviado para homologação',
    message: envio.protocolo ? `Envio registrado com protocolo ${envio.protocolo}.` : 'O projeto foi enviado para análise da concessionária.',
  });

  const updated = parseProjeto(await db.get('SELECT * FROM projetos WHERE id = ?', req.params.id));
  io.emit('projeto_atualizado', updated);
  res.status(201).json(updated);
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
  const rows = await loadOrdensServicoComFotos(req.user);
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
    dados = {},
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
      (numeroOs, clienteNome, clienteTelefone, contratoId, origem, problema, categoria, prioridade, status, responsavelId, responsavelNome, observacoes, dados, dataAbertura, dataAtualizacao)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    null,
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
    JSON.stringify(dados || {}),
    now,
    now
  );

  const numeroOs = `OS-${String(result.lastID).padStart(5, '0')}`;
  await db.run('UPDATE ordens_servico SET numeroOs = ? WHERE id = ?', numeroOs, result.lastID);
  const os = await loadOsComFotos(result.lastID);
  io.emit('os_atualizada', os);
  res.status(201).json(os);
});

app.put('/api/admin/ordens-servico/:id', authRequired, requirePermission('ordensServico'), async (req, res) => {
  const os = await db.get('SELECT * FROM ordens_servico WHERE id = ?', req.params.id);
  if (!os) return res.status(404).json({ message: 'O.S não encontrada.' });
  if (!canAccessOs(req.user, os)) return res.status(403).json({ message: 'Você não pode alterar esta O.S.' });

  const has = (field) => Object.prototype.hasOwnProperty.call(req.body, field);
  const {
    status,
    prioridade,
    responsavelId,
    solucao,
    observacoes,
    categoria,
    dados,
    clienteNome,
    clienteTelefone,
    contratoId,
    origem,
    problema,
  } = req.body;
  let responsavelNome = null;
  if (has('responsavelId') && responsavelId) {
    const user = await db.get('SELECT nome FROM usuarios WHERE id = ?', responsavelId);
    responsavelNome = user?.nome || null;
  } else if (!has('responsavelId')) {
    responsavelNome = os.responsavelNome;
  }
  const nextStatus = status || os.status;
  const now = new Date().toISOString();
  const mergedDados = dados ? { ...parseJsonField(os.dados, {}), ...dados } : null;

  await db.run(
    `UPDATE ordens_servico
     SET clienteNome = ?,
         clienteTelefone = ?,
         contratoId = ?,
         origem = ?,
         problema = ?,
         status = ?,
         prioridade = ?,
         categoria = ?,
         responsavelId = ?,
         responsavelNome = ?,
         solucao = ?,
         observacoes = ?,
         dados = ?,
         dataAtualizacao = ?,
         dataFechamento = ?
     WHERE id = ?`,
    has('clienteNome') ? String(clienteNome || '').trim() || os.clienteNome : os.clienteNome,
    has('clienteTelefone') ? String(clienteTelefone || '').trim() : os.clienteTelefone,
    has('contratoId') ? (contratoId || null) : os.contratoId,
    has('origem') ? String(origem || '').trim() || os.origem : os.origem,
    has('problema') ? String(problema || '').trim() || os.problema : os.problema,
    status || os.status,
    prioridade || os.prioridade,
    categoria || os.categoria,
    has('responsavelId') ? (responsavelId || null) : os.responsavelId,
    responsavelNome,
    has('solucao') ? (solucao || '') : (os.solucao || ''),
    has('observacoes') ? (observacoes || '') : (os.observacoes || ''),
    mergedDados ? JSON.stringify(mergedDados) : os.dados,
    now,
    nextStatus === 'Resolvida' || nextStatus === 'Cancelada' || nextStatus === 'Encerrada' ? now : os.dataFechamento,
    req.params.id
  );

  const updated = await loadOsComFotos(req.params.id);
  io.emit('os_atualizada', updated);
  res.json(updated);
});

app.post('/api/admin/ordens-servico/:id/evidencias', authRequired, requirePermission('ordensServico'), async (req, res) => {
  const os = await db.get('SELECT * FROM ordens_servico WHERE id = ?', req.params.id);
  if (!os) return res.status(404).json({ message: 'O.S não encontrada.' });
  if (!canAccessOs(req.user, os)) return res.status(403).json({ message: 'Você não pode alterar esta O.S.' });

  const { dataUrl, descricao = '', tipo = 'foto', mimeType = '' } = req.body;
  const validated = validateProjectDocumentDataUrl(dataUrl);
  if (!validated.valid) return res.status(400).json({ message: validated.message });

  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO os_fotos (osId, dataUrl, tipo, mimeType, descricao, criadoPorId, criadoPorNome, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    req.params.id,
    validated.dataUrl,
    tipo,
    mimeType || '',
    descricao,
    req.user.id,
    req.user.nome || req.user.username,
    now
  );

  const updated = await loadOsComFotos(req.params.id);
  io.emit('os_atualizada', updated);
  res.status(201).json(updated);
});

app.delete('/api/admin/ordens-servico/:id/evidencias/:evidenciaId', authRequired, requirePermission('ordensServico'), async (req, res) => {
  const os = await db.get('SELECT * FROM ordens_servico WHERE id = ?', req.params.id);
  if (!os) return res.status(404).json({ message: 'O.S não encontrada.' });
  if (!canAccessOs(req.user, os)) return res.status(403).json({ message: 'Você não pode alterar esta O.S.' });

  await db.run('DELETE FROM os_fotos WHERE id = ? AND osId = ?', req.params.evidenciaId, req.params.id);
  const updated = await loadOsComFotos(req.params.id);
  io.emit('os_atualizada', updated);
  res.json(updated);
});

app.get('/api/admin/resumo', authRequired, requirePermission('dashboard'), async (req, res) => {
  const canSeeAll = isMasterAdminUser(req.user);
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
  const roundRobinLeads = canSeeAll ? await getRoundRobinLeadSummary() : null;

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
  const vendasConsultoresAccumulator = contratos.reduce((acc, contrato) => {
    if (contrato.status !== 'Aprovado') return acc;
    const data = new Date(contrato.dataAnalise || contrato.dataCriacao || 0);
    if (Number.isNaN(data.getTime())) return acc;
    const consultor = getContractConsultantName(contrato);
    if (!acc[consultor]) {
      acc[consultor] = {
        nome: consultor,
        mes: { quantidade: 0, valor: 0 },
        ano: { quantidade: 0, valor: 0 },
      };
    }
    if (data.getFullYear() === hoje.getFullYear()) {
      acc[consultor].ano.quantidade += 1;
      acc[consultor].ano.valor += Number(contrato.valorProjeto || 0);
      if (data.getMonth() === hoje.getMonth()) {
        acc[consultor].mes.quantidade += 1;
        acc[consultor].mes.valor += Number(contrato.valorProjeto || 0);
      }
    }
    return acc;
  }, {});
  const vendasConsultoresBase = Object.values(vendasConsultoresAccumulator).sort((a, b) => b.ano.valor - a.ano.valor);
  const vendasConsultores = {
    referenciaMes: `${String(hoje.getMonth() + 1).padStart(2, '0')}/${hoje.getFullYear()}`,
    referenciaAno: String(hoje.getFullYear()),
    totalMes: vendasConsultoresBase.reduce((sum, item) => sum + item.mes.valor, 0),
    totalAno: vendasConsultoresBase.reduce((sum, item) => sum + item.ano.valor, 0),
    porMes: [...vendasConsultoresBase].sort((a, b) => b.mes.valor - a.mes.valor),
    porAno: [...vendasConsultoresBase].sort((a, b) => b.ano.valor - a.ano.valor),
  };
  const leadsPorStatus = leads.reduce((acc, lead) => {
    const status = lead.status || 'Novo';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  const projetosPorEtapa = PROJECT_STAGES.map(etapa => ({
    etapa,
    total: projetos.filter(projeto => normalizeProjectStage(projeto.etapa) === etapa).length,
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
      projetosAtivos: projetos.filter(projeto => normalizeProjectStage(projeto.etapa) !== 'Projeto concluído').length,
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
    roundRobinLeads,
    vendasConsultores,
    leadsPorStatus,
    projetosPorEtapa,
    proximosRetornos: leads
      .filter(lead => lead.proximoRetorno)
      .sort((a, b) => new Date(a.proximoRetorno) - new Date(b.proximoRetorno))
      .slice(0, 8),
    projetosCriticos: projetos
      .filter(projeto => normalizeProjectStage(projeto.etapa) !== 'Projeto concluído')
      .sort((a, b) => new Date(a.prazoPrevisto || '2999-01-01') - new Date(b.prazoPrevisto || '2999-01-01'))
      .slice(0, 6)
      .map(parseProjeto),
    atividadesRecentes: atividades,
  });
});

app.get('/api/admin/financeiro', authRequired, requirePermission('financeiro'), async (req, res) => {
  const rows = await db.all('SELECT financeiro, status, data, assignedUserName FROM orcamentos');
  const contratos = await db.all('SELECT valorProjeto, status, dataAnalise, dataCriacao, criadoPorNome, assignedUserName, consultorNome, consultorId FROM contratos');
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
    const pessoa = getContractConsultantName(contrato);
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
    moneyNumberOrNull(valor),
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
    typeof valor === 'undefined' ? null : moneyNumberOrNull(valor),
    categoria || null,
    active === false ? 0 : 1,
    req.params.id
  );
  const despesa = await db.get('SELECT * FROM despesas_fixas WHERE id = ?', req.params.id);
  res.json({ ...despesa, active: Boolean(despesa.active) });
});

app.get('/api/admin/tabelas-precos', authRequired, requirePermission('precosSistemas'), async (req, res) => {
  const rows = await db.all('SELECT * FROM tabelas_precos_sistemas ORDER BY active DESC, geracaoKwh ASC, precoFinal ASC, id DESC');
  res.json(rows.map(item => ({ ...item, active: Boolean(item.active) })));
});

const normalizePriceTablePayload = body => {
  const number = value => Number(value || 0);
  return {
    nome: String(body.nome || '').trim(),
    geracaoKwh: number(body.geracaoKwh),
    numeroPaineis: Math.max(0, Math.round(number(body.numeroPaineis))),
    potenciaKwp: number(body.potenciaKwp),
    potenciaInversorKw: number(body.potenciaInversorKw),
    placaModelo: String(body.placaModelo || '').trim(),
    inversorModelo: String(body.inversorModelo || '').trim(),
    valorKitSolar: number(body.valorKitSolar),
    custoInstalacao: number(body.custoInstalacao),
    materialCA: number(body.materialCA),
    deslocamento: number(body.deslocamento),
    custoAdicional: number(body.custoAdicional),
    margemEmpresa: number(body.margemEmpresa),
    comissaoPercentual: number(body.comissaoPercentual),
    custoBase: number(body.custoBase),
    valorComissao: number(body.valorComissao),
    precoFinal: number(body.precoFinal),
    observacoes: String(body.observacoes || '').trim(),
  };
};

app.post('/api/admin/tabelas-precos', authRequired, requirePermission('precosSistemas'), async (req, res) => {
  const data = normalizePriceTablePayload(req.body);
  if (!data.nome || data.geracaoKwh <= 0 || data.precoFinal <= 0) {
    return res.status(400).json({ message: 'Informe nome, geração e preço final válidos.' });
  }
  const now = new Date().toISOString();
  const result = await db.run(
    `INSERT INTO tabelas_precos_sistemas
      (nome, geracaoKwh, numeroPaineis, potenciaKwp, potenciaInversorKw, placaModelo, inversorModelo,
       valorKitSolar, custoInstalacao, materialCA, deslocamento, custoAdicional, margemEmpresa,
       comissaoPercentual, custoBase, valorComissao, precoFinal, observacoes, active, criadoPorId, criadoPorNome, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
    data.nome, data.geracaoKwh, data.numeroPaineis, data.potenciaKwp, data.potenciaInversorKw, data.placaModelo, data.inversorModelo,
    data.valorKitSolar, data.custoInstalacao, data.materialCA, data.deslocamento, data.custoAdicional, data.margemEmpresa,
    data.comissaoPercentual, data.custoBase, data.valorComissao, data.precoFinal, data.observacoes,
    req.user.id, req.user.nome, now, now
  );
  const created = await db.get('SELECT * FROM tabelas_precos_sistemas WHERE id = ?', result.lastID);
  res.status(201).json({ ...created, active: Boolean(created.active) });
});

app.put('/api/admin/tabelas-precos/:id', authRequired, requirePermission('precosSistemas'), async (req, res) => {
  const existing = await db.get('SELECT * FROM tabelas_precos_sistemas WHERE id = ?', req.params.id);
  if (!existing) return res.status(404).json({ message: 'Preço salvo não encontrado.' });
  const data = normalizePriceTablePayload({ ...existing, ...req.body });
  await db.run(
    `UPDATE tabelas_precos_sistemas SET nome=?, geracaoKwh=?, numeroPaineis=?, potenciaKwp=?, potenciaInversorKw=?,
      placaModelo=?, inversorModelo=?, valorKitSolar=?, custoInstalacao=?, materialCA=?, deslocamento=?,
      custoAdicional=?, margemEmpresa=?, comissaoPercentual=?, custoBase=?, valorComissao=?, precoFinal=?,
      observacoes=?, active=?, updatedAt=? WHERE id=?`,
    data.nome, data.geracaoKwh, data.numeroPaineis, data.potenciaKwp, data.potenciaInversorKw,
    data.placaModelo, data.inversorModelo, data.valorKitSolar, data.custoInstalacao, data.materialCA, data.deslocamento,
    data.custoAdicional, data.margemEmpresa, data.comissaoPercentual, data.custoBase, data.valorComissao, data.precoFinal,
    data.observacoes, req.body.active === false ? 0 : 1, new Date().toISOString(), req.params.id
  );
  const updated = await db.get('SELECT * FROM tabelas_precos_sistemas WHERE id = ?', req.params.id);
  res.json({ ...updated, active: Boolean(updated.active) });
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
  loadPersistedWhatsAppContacts();
  if (fs.existsSync(WHATSAPP_AUTH_DIR)) {
    startWhatsAppQrSession().catch(error => console.error('Erro ao restaurar sessão WhatsApp:', error));
  }
});
