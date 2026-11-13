import { randomUUID } from 'node:crypto';

// Repositório para testes e demonstração; dados são perdidos ao reiniciar.
export class MemoryRepository {
  #groups = new Map();
  async createGroup(input) {
    const group = { id: randomUUID(), name: input.name, currency: 'BRL', members: input.members.map(m => ({ ...m, id: randomUUID() })), expenses: [] };
    const emails = group.members.map(m => m.email).filter(Boolean);
    if (new Set(emails).size !== emails.length) {
      const { ApiError } = await import('../api/app.mjs');
      throw new ApiError(409, 'DUPLICATE_EMAIL', 'SplitGo: e-mails duplicados no grupo.');
    }
    this.#groups.set(group.id, group);
    return structuredClone(group);
  }
  async getGroup(id) { return structuredClone(this.#groups.get(id) ?? null); }
  async mutateGroup(id, operation) {
    const group = this.#groups.get(id);
    const change = operation(structuredClone(group ?? null));
    const record = { ...(change.member ?? change.expense), id: randomUUID() };
    if (change.member) group.members.push(record);
    else { record.createdAt = new Date().toISOString(); group.expenses.push(record); }
    return structuredClone(record);
  }
}
