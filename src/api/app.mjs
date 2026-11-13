import express from 'express';
import { z } from 'zod';
import { calculateBalances, splitEqually, simplifyDebts } from '../domain/accounting.ts';

const text = z.string().trim().min(1).max(200);
const id = z.string().uuid();
const cents = z.string().regex(/^(0|[1-9][0-9]{0,18})$/)
  .transform(BigInt).refine(v => v <= 9223372036854775807n, 'Valor excede BIGINT');
const positiveCents = cents.refine(v => v > 0n, 'Valor deve ser positivo');
const memberSchema = z.object({ name: text, email: z.string().trim().toLowerCase().pipe(z.email()).optional() }).strict();
const groupSchema = z.object({ name: text, members: z.array(memberSchema).min(1).max(100) }).strict();
const baseExpense = { description: text, payerId: id, totalCents: positiveCents };
const expenseSchema = z.discriminatedUnion('splitMode', [
  z.object({ ...baseExpense, splitMode: z.literal('EQUAL'), memberIds: z.array(id).min(1).max(100) }).strict(),
  z.object({ ...baseExpense, splitMode: z.literal('CUSTOM'), shares: z.array(z.object({ memberId: id, amountCents: cents }).strict()).min(1).max(100) }).strict(),
]);

export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const notFound = () => new ApiError(404, 'GROUP_NOT_FOUND', 'SplitGo: grupo não encontrado.');
const invalid = message => new ApiError(422, 'INVALID_EXPENSE', `SplitGo: ${message}`);

// O repositório executa mutateGroup atomicamente e entrega uma cópia isolada.
export function createApp(repository, { logger = console } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('json replacer', (_, value) => typeof value === 'bigint' ? value.toString() : value);
  app.use(express.json({ limit: '64kb' }));
  app.get('/health', (_req, res) => res.json({ app: 'SplitGo', status: 'ok' }));
  app.post('/groups', async (req, res) => {
    const group = await repository.createGroup(groupSchema.parse(req.body));
    res.status(201).location(`/groups/${group.id}`).json(group);
  });
  app.get('/groups/:groupId', async (req, res) => {
    const group = await repository.getGroup(id.parse(req.params.groupId));
    if (!group) throw notFound();
    res.json(group);
  });
  app.post('/groups/:groupId/members', async (req, res) => {
    const groupId = id.parse(req.params.groupId);
    const member = memberSchema.parse(req.body);
    const result = await repository.mutateGroup(groupId, group => {
      if (!group) throw notFound();
      if (group.members.length >= 100) throw new ApiError(422, 'GROUP_LIMIT', 'SplitGo: limite de 100 participantes por grupo.');
      if (member.email && group.members.some(m => m.email === member.email)) {
        throw new ApiError(409, 'DUPLICATE_EMAIL', 'SplitGo: e-mail já participa deste grupo.');
      }
      return { member };
    });
    res.status(201).json(result);
  });
  app.post('/groups/:groupId/expenses', async (req, res) => {
    const groupId = id.parse(req.params.groupId);
    const input = expenseSchema.parse(req.body);
    const result = await repository.mutateGroup(groupId, group => {
      if (!group) throw notFound();
      if (input.splitMode === 'EQUAL' && new Set(input.memberIds).size !== input.memberIds.length) {
        throw invalid('participantes duplicados.');
      }
      const shares = input.splitMode === 'EQUAL' ? splitEqually(input.totalCents, input.memberIds) : input.shares;
      const expense = { description: input.description, payerId: input.payerId, totalCents: input.totalCents, splitMode: input.splitMode, shares };
      try { calculateBalances(group.members.map(m => m.id), [expense]); }
      catch { throw invalid('verifique os membros, as cotas e a soma da divisão.'); }
      return { expense };
    });
    res.status(201).json(result);
  });
  app.get('/groups/:groupId/summary', async (req, res) => {
    const group = await repository.getGroup(id.parse(req.params.groupId));
    if (!group) throw notFound();
    const balances = calculateBalances(group.members.map(m => m.id), group.expenses);
    const simplification = simplifyDebts(balances);
    res.json({ groupId: group.id, currency: group.currency,
      totalExpenseCents: group.expenses.reduce((sum, e) => sum + e.totalCents, 0n),
      members: group.members.map(member => ({ ...member,
        paidCents: group.expenses.filter(e => e.payerId === member.id).reduce((sum, e) => sum + e.totalCents, 0n),
        owedCents: group.expenses.flatMap(e => e.shares).filter(s => s.memberId === member.id).reduce((sum, s) => sum + s.amountCents, 0n),
        balanceCents: balances.find(b => b.memberId === member.id).cents,
      })), ...simplification,
    });
  });
  app.use((_req, _res, next) => next(new ApiError(404, 'ROUTE_NOT_FOUND', 'SplitGo: rota não encontrada.')));
  app.use((err, _req, res, _next) => {
    if (err instanceof z.ZodError) return res.status(422).json({ error: { code: 'VALIDATION_ERROR', message: 'SplitGo: dados inválidos.', details: err.issues.map(i => ({ path: i.path, message: i.message })) } });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'SplitGo: JSON inválido.' } });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: { code: 'BODY_TOO_LARGE', message: 'SplitGo: corpo da requisição excede 64 KB.' } });
    if (err instanceof ApiError) return res.status(err.status).json({ error: { code: err.code, message: err.message } });
    logger.error(err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'SplitGo: erro interno.' } });
  });
  return app;
}
