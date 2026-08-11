const jwt = require('jsonwebtoken');
require('dotenv').config({ quiet: true });

const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3001';
const jwtSecret = process.env.JWT_SECRET;
const mutating = process.env.SMOKE_MUTATING === '1';

if (!jwtSecret) {
  console.error('JWT_SECRET is required for smoke tests.');
  process.exit(1);
}

const users = {
  admin: { id: 1, email: 'admin@drm.test', username: 'deivson', role: 'ADM', userType: 'interno' },
  consultant: { id: 3, email: 'consultor@drm.test', username: 'gleyson', role: 'CONSULTOR', userType: 'interno' },
  technician: { id: 2, email: 'tecnico@drm.test', username: 'renejr', role: 'EQUIPE_TECNICA_COMERCIAL', userType: 'interno' },
};

const tokenFor = (user) => jwt.sign(user, jwtSecret, { expiresIn: '10m' });

const request = async (path, { user = users.consultant, method = 'GET', body } = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenFor(user)}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { response, data };
};

const assertStatus = async (label, promise, expected) => {
  const { response, data } = await promise;
  if (response.status !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${response.status}: ${JSON.stringify(data)}`);
  }
  console.log(`ok ${label} ${response.status}`);
  return data;
};

const run = async () => {
  const consultants = await assertStatus('consultant can list consultants', request('/api/admin/consultores'), 200);
  if (!Array.isArray(consultants) || !consultants.some(user => user.username === 'gleyson')) {
    throw new Error('consultant list did not include expected users.');
  }

  await assertStatus('consultant can list clients', request('/api/admin/clientes'), 200);
  await assertStatus('consultant can list contracts', request('/api/admin/contratos'), 200);

  const operational = await assertStatus(
    'technician can list operational users',
    request('/api/admin/equipe-operacional', { user: users.technician }),
    200
  );
  if (!Array.isArray(operational) || !operational.some(user => user.username === 'renejr')) {
    throw new Error('operational list did not include expected users.');
  }
  await assertStatus('technician cannot list admin users', request('/api/admin/usuarios', { user: users.technician }), 403);

  if (mutating) {
    const suffix = Date.now();
    const clientEmail = `smoke-${suffix}@example.com`;
    const clientPassword = `ClienteSmoke#${suffix}`;
    const client = await assertStatus(
      'consultant can create client',
      request('/api/admin/clientes', {
        method: 'POST',
        body: {
          nome: `Cliente Smoke ${suffix}`,
          whatsapp: `55999${String(suffix).slice(-8)}`,
          cidade: 'Imperatriz',
          estado: 'MA',
          email: clientEmail,
          password: clientPassword,
          cpfCnpj: '12345678909',
          endereco: 'Rua Smoke',
          cep: '65900000',
        },
      }),
      201
    );
    if (!client?.id) throw new Error('client creation did not return an id.');

    const contract = await assertStatus(
      'consultant can create direct contract',
      request('/api/admin/contratos-direto', {
        method: 'POST',
        body: {
          clienteId: client.id,
          manual: {
            consultorId: users.consultant.id,
            dataVenda: new Date().toISOString().slice(0, 10),
            potenciaKwp: 5,
            numeroPaineis: 10,
            geracaoKwh: 650,
            valorSistema: 25000,
            formaPagamentoTipo: 'avista',
            formaPagamento: 'Pagamento à vista.',
          },
        },
      }),
      201
    );
    if (!contract?.id) throw new Error('contract creation did not return an id.');

    const approved = await assertStatus(
      'admin can approve contract',
      request(`/api/admin/contratos/${contract.id}/revisao`, {
        user: users.admin,
        method: 'PUT',
        body: {
          status: 'Aprovado',
          observacaoAnalise: 'Aprovado pelo smoke test.',
        },
      }),
      200
    );
    if (approved.status !== 'Aprovado') throw new Error('contract approval did not persist.');

    const systems = await assertStatus(
      'technician can list approved system',
      request('/api/admin/sistemas-fv', { user: users.technician }),
      200
    );
    const system = Array.isArray(systems)
      ? systems.find(item => Number(item.contratoId) === Number(contract.id))
      : null;
    if (!system) throw new Error('approved contract did not create a visible technical system.');

    const serviceOrder = await assertStatus(
      'technician can create service order',
      request('/api/admin/ordens-servico', {
        user: users.technician,
        method: 'POST',
        body: {
          clienteNome: client.nome,
          clienteTelefone: client.whatsapp,
          contratoId: contract.id,
          origem: 'Smoke test',
          problema: 'Validação automática do fluxo operacional.',
          categoria: 'Vistoria técnica',
          prioridade: 'Normal',
          responsavelId: users.technician.id,
          observacoes: 'O.S. criada pelo smoke test.',
        },
      }),
      201
    );
    if (!serviceOrder?.id) throw new Error('service order creation did not return an id.');

    const serviceOrders = await assertStatus(
      'technician can list assigned service order',
      request('/api/admin/ordens-servico', { user: users.technician }),
      200
    );
    if (!Array.isArray(serviceOrders) || !serviceOrders.some(item => Number(item.id) === Number(serviceOrder.id))) {
      throw new Error('technician service order list did not include the created item.');
    }

    const clientToken = jwt.sign(
      {
        id: client.id,
        nome: client.nome,
        email: client.email,
        role: 'CLIENTE',
        userType: 'cliente',
        permissions: {},
      },
      jwtSecret,
      { expiresIn: '10m' }
    );
    const portal = await assertStatus(
      'client can access portal',
      fetch(`${baseUrl}/api/cliente/portal`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${clientToken}`,
        },
      }).then(async response => ({
        response,
        data: await response.json().catch(() => null),
      })),
      200
    );
    if (!portal.contratos?.some(item => Number(item.id) === Number(contract.id))) {
      throw new Error('client portal did not include the approved contract.');
    }
    if (!portal.ordensServico?.some(item => Number(item.id) === Number(serviceOrder.id))) {
      throw new Error('client portal did not include the service order.');
    }
  }
};

run().catch(error => {
  console.error(error);
  process.exit(1);
});
