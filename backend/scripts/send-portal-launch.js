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
const testToArg = args.find(item => item.startsWith('--test-to='));
const imagePath = imageArg ? path.resolve(imageArg.slice('--image='.length)) : '';
const testTo = testToArg ? String(testToArg.slice('--test-to='.length)).trim().toLowerCase() : '';
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

const htmlTemplate = ({ name, hasImage }) => {
  const safeName = escapeHtml(name);
  return `<!doctype html>
  <html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#eef2f6;font-family:Arial,Helvetica,sans-serif;color:#111827">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0">Uma nova forma de acompanhar cada etapa do seu projeto solar chegou.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#eef2f6">
      <tr><td align="center" style="padding:24px 10px">
        <table role="presentation" width="680" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:680px;background:#ffffff;border-collapse:separate">
          <tr><td style="padding:14px 24px;background:#0b1018;border-bottom:3px solid #f97316;color:#ffffff">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
              <td style="font-size:18px;font-weight:900;color:#ffffff">DRM <span style="color:#f97316">ENERGIA SOLAR</span></td>
              <td align="right" style="font-size:11px;font-weight:bold;color:#cbd5e1;text-transform:uppercase">Lançamento oficial</td>
            </tr></table>
          </td></tr>
          <tr><td style="padding:38px 30px 30px;background:#111827">
            <p style="margin:0 0 10px;color:#fb923c;font-size:12px;font-weight:bold;text-transform:uppercase">Feito para você acompanhar tudo de perto</p>
            <h1 style="margin:0 0 16px;color:#ffffff;font-size:34px;line-height:1.08">Olá, ${safeName}.<br>Seu projeto solar ganhou uma nova experiência.</h1>
            <p style="margin:0;color:#cbd5e1;font-size:17px;line-height:1.6">A DRM reuniu transparência, tecnologia e atendimento em um portal exclusivo. Agora, cada avanço do seu projeto está ao alcance do seu celular.</p>
          </td></tr>
          ${hasImage ? '<tr><td style="background:#ffffff"><img src="cid:portal-launch-poster" alt="Conheça o novo Portal do Cliente DRM Energia Solar" width="680" style="display:block;width:100%;max-width:680px;height:auto;border:0"></td></tr>' : ''}
          <tr><td style="padding:34px 30px 10px;background:#ffffff">
            <p style="margin:0 0 8px;color:#ea580c;font-size:12px;font-weight:bold;text-transform:uppercase">Sua jornada, sem dúvidas e sem distância</p>
            <h2 style="margin:0 0 14px;color:#111827;font-size:27px;line-height:1.15">Do contrato à geração de energia, você acompanha cada detalhe.</h2>
            <p style="margin:0;color:#475569;font-size:16px;line-height:1.65">Consulte prazos, documentos e agendamentos; acompanhe a entrega, instalação e ligação pela Equatorial; receba notificações automáticas e fale diretamente com a equipe DRM.</p>
          </td></tr>
          <tr><td style="padding:22px 30px 30px;background:#ffffff">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
              <td width="48%" valign="top" style="padding:18px;background:#fff7ed;border-left:4px solid #f97316">
                <strong style="display:block;color:#111827;font-size:15px">Tudo atualizado</strong>
                <span style="display:block;margin-top:6px;color:#64748b;font-size:13px;line-height:1.5">Prazos, linha do tempo, fotos da equipe e status do projeto.</span>
              </td>
              <td width="4%"></td>
              <td width="48%" valign="top" style="padding:18px;background:#ecfdf5;border-left:4px solid #16a34a">
                <strong style="display:block;color:#111827;font-size:15px">Atendimento conectado</strong>
                <span style="display:block;margin-top:6px;color:#64748b;font-size:13px;line-height:1.5">Solicitações, envio de fotos e mensagens em um único lugar.</span>
              </td>
            </tr></table>
          </td></tr>
          <tr><td align="center" style="padding:34px 28px;background:#f97316">
            <p style="margin:0 0 8px;color:#431407;font-size:12px;font-weight:bold;text-transform:uppercase">Seu portal já está esperando por você</p>
            <h2 style="margin:0 0 20px;color:#111827;font-size:27px;line-height:1.15">Acompanhe seu projeto solar agora.</h2>
            <a href="${portalUrl}" style="display:inline-block;padding:16px 28px;background:#111827;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;border-radius:6px">ACESSAR MEU PORTAL</a>
            <p style="margin:18px 0 0;color:#431407;font-size:12px;line-height:1.5">Use o e-mail cadastrado na DRM. Caso ainda não tenha senha, selecione “Esqueceu a senha?” na tela de acesso.</p>
          </td></tr>
          <tr><td style="padding:24px 28px;background:#0b1018;color:#cbd5e1">
            <p style="margin:0 0 6px;color:#ffffff;font-size:15px;font-weight:bold">DRM Energia Solar</p>
            <p style="margin:0;font-size:12px;line-height:1.6">Tecnologia, transparência e energia limpa na palma da sua mão.<br><a href="${portalUrl}" style="color:#fb923c;text-decoration:none">drmenergiasolar.com.br/portal-cliente</a></p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body></html>`;
};

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

  const allRecipients = await getRecipients(db);
  const recipients = testTo
    ? [{ email: testTo, name: allRecipients.find(item => item.email === testTo)?.name || 'Cliente DRM' }]
    : allRecipients;
  console.log(`Destinatários únicos válidos: ${recipients.length}`);
  recipients.forEach(item => console.log(`- ${maskEmail(item.email)} (${item.name})`));

  if (!shouldSend) {
    console.log('Prévia concluída. Nenhum e-mail foi enviado. Use --send e --image=C:\\caminho\\arte.jpg para disparar.');
    await db.close();
    return;
  }
  if (!imagePath || !fs.existsSync(imagePath)) throw new Error('Informe uma imagem existente usando --image=caminho.');
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) throw new Error('SMTP não configurado.');

  const existing = testTo ? null : await db.get('SELECT * FROM email_campaigns WHERE campaignKey = ?', campaignKey);
  if (existing?.status === 'sent' && !force) throw new Error('Campanha já enviada. Use --force somente se realmente precisar reenviar.');
  const now = new Date().toISOString();
  const subject = 'O Portal do Cliente DRM Energia Solar já está disponível';
  if (testTo) {
    console.log(`Modo de teste: o envio será feito somente para ${maskEmail(testTo)}.`);
  } else if (!existing) {
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
  const campaign = testTo ? null : await db.get('SELECT * FROM email_campaigns WHERE campaignKey = ?', campaignKey);
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
      if (!testTo) await db.run(
        `INSERT INTO email_campaign_deliveries (campaignId, email, name, status, sentAt) VALUES (?, ?, ?, 'sent', ?)
         ON CONFLICT(campaignId, email) DO UPDATE SET status = 'sent', error = NULL, sentAt = excluded.sentAt`,
        campaign.id, recipient.email, recipient.name, new Date().toISOString()
      );
    } catch (error) {
      failed += 1;
      if (!testTo) await db.run(
        `INSERT INTO email_campaign_deliveries (campaignId, email, name, status, error) VALUES (?, ?, ?, 'failed', ?)
         ON CONFLICT(campaignId, email) DO UPDATE SET status = 'failed', error = excluded.error`,
        campaign.id, recipient.email, recipient.name, String(error.message || error).slice(0, 500)
      );
    }
  }
  if (!testTo) await db.run(
    'UPDATE email_campaigns SET sentCount = ?, failedCount = ?, status = ?, sentAt = ? WHERE id = ?',
    sent, failed, failed ? 'partial' : 'sent', new Date().toISOString(), campaign.id
  );
  if (!testTo) await db.run(
    `INSERT INTO client_notifications (clienteId, type, title, message, action, createdAt)
     SELECT id, 'launch', 'Bem-vindo ao novo Portal do Cliente', 'Seu novo portal DRM está disponível com acompanhamento, documentos, notificações e atendimento.', 'communication', ?
     FROM clientes
     WHERE NOT EXISTS (
       SELECT 1 FROM client_notifications n WHERE n.clienteId = clientes.id AND n.title = 'Bem-vindo ao novo Portal do Cliente'
     )`,
    new Date().toISOString()
  );
  console.log(`${testTo ? 'Prévia' : 'Campanha'} concluída: ${sent} enviados, ${failed} falharam.`);
  await db.close();
})().catch(error => {
  console.error(`Falha: ${error.message || error}`);
  process.exitCode = 1;
});
