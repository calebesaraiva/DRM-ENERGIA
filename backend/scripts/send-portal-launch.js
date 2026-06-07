require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

const args = process.argv.slice(2);
const shouldSend = args.includes('--send');
const force = args.includes('--force');
const imageArg = args.find(item => item.startsWith('--image='));
const imagePath = imageArg ? path.resolve(imageArg.slice('--image='.length)) : '';
const campaignKey = 'portal-cliente-lancamento-2026';
const portalUrl = 'https://drmenergiasolar.com.br/portal-cliente';

const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim())
  && !String(value).toLowerCase().endsWith('@drm.local');

const maskEmail = email => {
  const [name, domain] = email.split('@');
  return `${name.slice(0, 2)}***@${domain}`;
};
const escapeHtml = value => String(value || '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
}[character]));

const getRecipients = async db => {
  const sources = [
    ['clientes', 'nome', 'email'],
    ['contratos', 'clienteNome', 'clienteEmail'],
    ['leads', 'nome', 'email'],
    ['orcamentos', 'clienteNome', 'clienteEmail'],
    ['mailing_contacts', 'name', 'email'],
  ];
  const recipients = new Map();
  for (const [table, nameField, emailField] of sources) {
    const rows = await db.all(`SELECT ${nameField} name, ${emailField} email FROM ${table} WHERE ${emailField} IS NOT NULL`);
    for (const row of rows) {
      const email = String(row.email || '').trim().toLowerCase();
      if (!validEmail(email)) continue;
      if (!recipients.has(email)) recipients.set(email, { email, name: String(row.name || '').trim() || 'Cliente DRM' });
    }
  }
  return [...recipients.values()];
};

const htmlTemplate = ({ name, hasImage }) => `
  <div style="margin:0;background:#f3f4f6;padding:28px 12px;font-family:Arial,sans-serif;color:#111827">
    <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb">
      ${hasImage ? '<img src="cid:portal-launch-poster" alt="Portal do Cliente DRM Energia Solar" style="display:block;width:100%;height:auto">' : ''}
      <div style="padding:28px">
        <p style="margin:0 0 8px;color:#ea580c;font-size:13px;font-weight:bold;text-transform:uppercase">Novidade DRM Energia Solar</p>
        <h1 style="margin:0 0 16px;font-size:30px;line-height:1.1">Olá, ${escapeHtml(name)}. Seu Portal do Cliente já está disponível.</h1>
        <p style="margin:0 0 16px;color:#475569;line-height:1.6">Agora você acompanha contrato, prazos, entrega dos equipamentos, instalação, Equatorial, documentos e atendimento em um único lugar.</p>
        <p style="margin:0 0 24px;color:#475569;line-height:1.6">O portal também reúne guia completo sobre energia solar, notificações automáticas, envio de fotos, acompanhamento de solicitações e um canal direto com a equipe DRM.</p>
        <a href="${portalUrl}" style="display:inline-block;background:#f97316;color:#111827;padding:15px 22px;text-decoration:none;font-weight:bold">Acessar Portal do Cliente</a>
        <p style="margin:24px 0 0;color:#64748b;font-size:13px;line-height:1.5">Use o e-mail cadastrado na DRM. Caso ainda não tenha senha, utilize a recuperação de acesso na tela de login.</p>
      </div>
      <div style="padding:18px 28px;background:#111827;color:#e5e7eb;font-size:13px">DRM Energia Solar · Tecnologia, transparência e energia limpa na palma da sua mão.</div>
    </div>
  </div>
`;

(async () => {
  const db = await open({ filename: path.join(__dirname, '..', 'database.db'), driver: sqlite3.Database });
  await db.exec(`
    CREATE TABLE IF NOT EXISTS email_campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT, campaignKey TEXT NOT NULL UNIQUE, subject TEXT NOT NULL,
      imagePath TEXT, totalRecipients INTEGER DEFAULT 0, sentCount INTEGER DEFAULT 0, failedCount INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'draft', createdById INTEGER, createdAt TEXT NOT NULL, sentAt TEXT
    );
    CREATE TABLE IF NOT EXISTS email_campaign_deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT, campaignId INTEGER NOT NULL, email TEXT NOT NULL, name TEXT,
      status TEXT NOT NULL, error TEXT, sentAt TEXT, UNIQUE(campaignId, email)
    );
    CREATE TABLE IF NOT EXISTS mailing_contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, email TEXT NOT NULL UNIQUE,
      active INTEGER NOT NULL DEFAULT 1, source TEXT, createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS client_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT, clienteId INTEGER NOT NULL, contratoId INTEGER, projetoId INTEGER,
      type TEXT NOT NULL DEFAULT 'info', title TEXT NOT NULL, message TEXT NOT NULL, action TEXT DEFAULT 'project',
      readAt TEXT, createdAt TEXT NOT NULL
    );
  `);
  await db.run(
    `INSERT INTO mailing_contacts (name, email, active, source, createdAt) VALUES (?, ?, 1, ?, ?)
     ON CONFLICT(email) DO UPDATE SET name = excluded.name, active = 1, source = excluded.source`,
    'Calebe Saraiva',
    'calebesaraiva60@gmail.com',
    'Solicitação direta',
    new Date().toISOString()
  );

  const recipients = await getRecipients(db);
  console.log(`Destinatários únicos válidos: ${recipients.length}`);
  recipients.forEach(item => console.log(`- ${maskEmail(item.email)} (${item.name})`));

  if (!shouldSend) {
    console.log('Prévia concluída. Nenhum e-mail foi enviado. Use --send e --image=C:\\caminho\\arte.jpg para disparar.');
    await db.close();
    return;
  }
  if (!imagePath || !fs.existsSync(imagePath)) throw new Error('Informe uma imagem existente usando --image=caminho.');
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) throw new Error('SMTP não configurado.');

  const existing = await db.get('SELECT * FROM email_campaigns WHERE campaignKey = ?', campaignKey);
  if (existing?.status === 'sent' && !force) throw new Error('Campanha já enviada. Use --force somente se realmente precisar reenviar.');
  const now = new Date().toISOString();
  const subject = 'O Portal do Cliente DRM Energia Solar já está disponível';
  if (!existing) {
    await db.run(
      'INSERT INTO email_campaigns (campaignKey, subject, imagePath, totalRecipients, status, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
      campaignKey, subject, imagePath, recipients.length, 'sending', now
    );
  } else {
    await db.run(
      'UPDATE email_campaigns SET imagePath = ?, totalRecipients = ?, status = ?, sentCount = 0, failedCount = 0 WHERE id = ?',
      imagePath, recipients.length, 'sending', existing.id
    );
  }
  const campaign = await db.get('SELECT * FROM email_campaigns WHERE campaignKey = ?', campaignKey);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || 'true') === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transporter.verify();
  let sent = 0;
  let failed = 0;
  for (const recipient of recipients) {
    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || `DRM ENERGIA SOLAR <${process.env.SMTP_USER}>`,
        to: recipient.email,
        subject,
        text: `Olá, ${recipient.name}. O Portal do Cliente DRM Energia Solar já está disponível: ${portalUrl}`,
        html: htmlTemplate({ name: recipient.name, hasImage: true }),
        attachments: [{ filename: path.basename(imagePath), path: imagePath, cid: 'portal-launch-poster' }],
      });
      sent += 1;
      await db.run(
        `INSERT INTO email_campaign_deliveries (campaignId, email, name, status, sentAt) VALUES (?, ?, ?, 'sent', ?)
         ON CONFLICT(campaignId, email) DO UPDATE SET status = 'sent', error = NULL, sentAt = excluded.sentAt`,
        campaign.id, recipient.email, recipient.name, new Date().toISOString()
      );
    } catch (error) {
      failed += 1;
      await db.run(
        `INSERT INTO email_campaign_deliveries (campaignId, email, name, status, error) VALUES (?, ?, ?, 'failed', ?)
         ON CONFLICT(campaignId, email) DO UPDATE SET status = 'failed', error = excluded.error`,
        campaign.id, recipient.email, recipient.name, String(error.message || error).slice(0, 500)
      );
    }
  }
  await db.run(
    'UPDATE email_campaigns SET sentCount = ?, failedCount = ?, status = ?, sentAt = ? WHERE id = ?',
    sent, failed, failed ? 'partial' : 'sent', new Date().toISOString(), campaign.id
  );
  await db.run(
    `INSERT INTO client_notifications (clienteId, type, title, message, action, createdAt)
     SELECT id, 'launch', 'Bem-vindo ao novo Portal do Cliente', 'Seu novo portal DRM está disponível com acompanhamento, documentos, notificações e atendimento.', 'communication', ?
     FROM clientes
     WHERE NOT EXISTS (
       SELECT 1 FROM client_notifications n WHERE n.clienteId = clientes.id AND n.title = 'Bem-vindo ao novo Portal do Cliente'
     )`,
    new Date().toISOString()
  );
  console.log(`Campanha concluída: ${sent} enviados, ${failed} falharam.`);
  await db.close();
})().catch(error => {
  console.error(`Falha: ${error.message || error}`);
  process.exitCode = 1;
});
