import { ApiError } from '../api/app.mjs';

async function transaction(pool, begin, operation) {
  const client = await pool.connect();
  try {
    await client.query(begin);
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

function expenseRow(row, shares) {
  return { ...row, totalCents: BigInt(row.totalCents), shares: shares.map(s => ({ ...s, amountCents: BigInt(s.amountCents) })) };
}

async function loadGroup(client, id) {
  const { rows: [group] } = await client.query('SELECT * FROM "Group" WHERE id = $1', [id]);
  if (!group) return null;
  const { rows: members } = await client.query('SELECT * FROM "GroupMember" WHERE "groupId" = $1 ORDER BY id', [id]);
  const { rows: expenses } = await client.query('SELECT * FROM "Expense" WHERE "groupId" = $1 ORDER BY "createdAt", id', [id]);
  const { rows: shares } = await client.query('SELECT * FROM "ExpenseShare" WHERE "groupId" = $1 ORDER BY "memberId"', [id]);
  return { ...group, members, expenses: expenses.map(e => expenseRow(e, shares.filter(s => s.expenseId === e.id))) };
}

async function insertMember(client, groupId, member) {
  const { rows: [result] } = await client.query(
    'INSERT INTO "GroupMember" ("groupId", name, email) VALUES ($1, $2, $3) RETURNING *',
    [groupId, member.name, member.email ?? null]);
  return result;
}

export class PostgresRepository {
  constructor(pool) { this.pool = pool; }
  async createGroup(input) {
    const emails = input.members.map(m => m.email).filter(Boolean);
    if (new Set(emails).size !== emails.length) throw new ApiError(409, 'DUPLICATE_EMAIL', 'SplitGo: e-mails duplicados no grupo.');
    return transaction(this.pool, 'BEGIN', async client => {
      const { rows: [group] } = await client.query('INSERT INTO "Group" (name) VALUES ($1) RETURNING *', [input.name]);
      const members = [];
      for (const member of input.members) members.push(await insertMember(client, group.id, member));
      return { ...group, members, expenses: [] };
    });
  }
  async getGroup(id) {
    return transaction(this.pool, 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY', client => loadGroup(client, id));
  }
  async mutateGroup(id, operation) {
    return transaction(this.pool, 'BEGIN', async client => {
      await client.query('SELECT id FROM "Group" WHERE id = $1 FOR UPDATE', [id]);
      const change = operation(await loadGroup(client, id));
      if (change.member) return insertMember(client, id, change.member);
      const e = change.expense;
      const { rows: [expense] } = await client.query(
        'INSERT INTO "Expense" ("groupId", "payerId", description, "totalCents", "splitMode") VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [id, e.payerId, e.description, e.totalCents.toString(), e.splitMode]);
      const shares = [];
      for (const share of e.shares) {
        const { rows: [row] } = await client.query(
          'INSERT INTO "ExpenseShare" ("groupId", "expenseId", "memberId", "amountCents") VALUES ($1, $2, $3, $4) RETURNING *',
          [id, expense.id, share.memberId, share.amountCents.toString()]);
        shares.push(row);
      }
      return expenseRow(expense, shares);
    });
  }
}
