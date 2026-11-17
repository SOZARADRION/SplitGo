import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, registerUser, type TestUser } from "./helpers.js";

let app: FastifyInstance;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ app, close } = await createTestApp());
});
afterAll(() => close());

type Member = { id: string; name: string; email: string | null; userId: string | null };

/** Ana (logada) cria o churrasco com Bia e Caio, que ainda não têm conta. */
async function createChurrasco(owner?: TestUser) {
  const ana = owner ?? (await registerUser(app, { name: "Ana" }));
  const res = await app.inject({
    method: "POST",
    url: "/api/groups",
    headers: ana.headers,
    payload: {
      name: "Churrasco de sábado",
      members: [{ name: "Bia", email: `bia.${Date.now()}.${Math.random()}@splitgo.test` }, { name: "Caio" }],
    },
  });
  expect(res.statusCode, res.body).toBe(201);
  const group = res.json();
  const [anaM, biaM, caioM] = group.members as Member[];
  return { user: ana, group, ana: anaM, bia: biaM, caio: caioM, base: `/api/groups/${group.id}` };
}

describe("rotas protegidas", () => {
  it("/health é público", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.json()).toEqual({ service: "SplitGo API", status: "ok" });
  });

  it("todas as rotas de grupos exigem login", async () => {
    const id = "00000000-0000-4000-8000-000000000000";
    const routes: [string, string][] = [
      ["GET", "/api/groups"],
      ["POST", "/api/groups"],
      ["GET", `/api/groups/${id}`],
      ["POST", `/api/groups/${id}/members`],
      ["POST", `/api/groups/${id}/expenses`],
      ["GET", `/api/groups/${id}/expenses`],
      ["DELETE", `/api/groups/${id}/expenses/${id}`],
      ["POST", `/api/groups/${id}/settlements`],
      ["GET", `/api/groups/${id}/summary`],
    ];
    for (const [method, url] of routes) {
      const res = await app.inject({ method: method as "GET", url, payload: method === "GET" || method === "DELETE" ? undefined : {} });
      expect(res.statusCode, `${method} ${url}`).toBe(401);
    }
  });

  it("quem não participa do grupo recebe 404 em todas as rotas dele", async () => {
    const { base, ana } = await createChurrasco();
    const intruso = await registerUser(app, { name: "Intruso" });
    const attempts = [
      app.inject({ method: "GET", url: base, headers: intruso.headers }),
      app.inject({ method: "GET", url: `${base}/summary`, headers: intruso.headers }),
      app.inject({ method: "GET", url: `${base}/expenses`, headers: intruso.headers }),
      app.inject({
        method: "POST",
        url: `${base}/members`,
        headers: intruso.headers,
        payload: { name: "Eu mesmo" },
      }),
      app.inject({
        method: "POST",
        url: `${base}/expenses`,
        headers: intruso.headers,
        payload: {
          description: "x",
          amountCents: 100,
          paidByMemberId: ana.id,
          split: { type: "EQUAL", memberIds: [ana.id] },
        },
      }),
    ];
    for (const res of await Promise.all(attempts)) expect(res.statusCode).toBe(404);

    const list = await app.inject({ method: "GET", url: "/api/groups", headers: intruso.headers });
    expect(list.json()).toEqual([]);
  });
});

describe("grupos e participantes", () => {
  it("o criador entra como primeiro participante, vinculado à conta", async () => {
    const { user, group, ana } = await createChurrasco();
    expect(group.members).toHaveLength(3);
    expect(ana).toMatchObject({ name: "Ana", email: user.email, userId: user.id });

    const list = await app.inject({ method: "GET", url: "/api/groups", headers: user.headers });
    expect(list.json()).toEqual([expect.objectContaining({ id: group.id, memberCount: 3 })]);
  });

  it("não duplica o criador se ele se incluir na lista de participantes", async () => {
    const user = await registerUser(app, { name: "Davi" });
    const res = await app.inject({
      method: "POST",
      url: "/api/groups",
      headers: user.headers,
      payload: { name: "Viagem", members: [{ name: "Davi", email: user.email.toUpperCase() }, { name: "Eva" }] },
    });
    expect(res.json().members).toHaveLength(2);
  });

  it("participante convidado por e-mail ganha acesso ao se cadastrar", async () => {
    const owner = await registerUser(app, { name: "Fábio" });
    const inviteEmail = `convite.${Date.now()}@splitgo.test`;
    const g = await app.inject({
      method: "POST",
      url: "/api/groups",
      headers: owner.headers,
      payload: { name: "Apartamento 204", members: [{ name: "Gabi", email: inviteEmail }] },
    });
    const groupId = g.json().id;

    const gabi = await registerUser(app, { name: "Gabi", email: inviteEmail });
    const res = await app.inject({ method: "GET", url: `/api/groups/${groupId}`, headers: gabi.headers });
    expect(res.statusCode).toBe(200);
    const gabiMember = res.json().members.find((m: Member) => m.email === inviteEmail);
    expect(gabiMember.userId).toBe(gabi.id);
  });

  it("participante adicionado com e-mail de conta existente já fica vinculado", async () => {
    const { base, user } = await createChurrasco();
    const helena = await registerUser(app, { name: "Helena" });
    const add = await app.inject({
      method: "POST",
      url: `${base}/members`,
      headers: user.headers,
      payload: { name: "Helena", email: helena.email },
    });
    expect(add.statusCode).toBe(201);
    expect(add.json().userId).toBe(helena.id);

    const view = await app.inject({ method: "GET", url: `${base}/summary`, headers: helena.headers });
    expect(view.statusCode).toBe(200);
  });

  it("recusa e-mail duplicado no mesmo grupo", async () => {
    const { base, user, bia } = await createChurrasco();
    const dup = await app.inject({
      method: "POST",
      url: `${base}/members`,
      headers: user.headers,
      payload: { name: "Outra Bia", email: bia.email!.toUpperCase() },
    });
    expect(dup.statusCode).toBe(409);
  });
});

describe("despesas, extrato e acertos", () => {
  it("fluxo completo: despesas → extrato → acerto → quitado", async () => {
    const { user, base, ana, bia, caio } = await createChurrasco();
    const h = user.headers;

    const e1 = await app.inject({
      method: "POST",
      url: `${base}/expenses`,
      headers: h,
      payload: {
        description: "Carne",
        amountCents: 30000,
        paidByMemberId: ana.id,
        split: { type: "EQUAL", memberIds: [ana.id, bia.id, caio.id] },
      },
    });
    expect(e1.statusCode).toBe(201);
    expect(e1.json().createdByUserId).toBe(user.id);

    const e2 = await app.inject({
      method: "POST",
      url: `${base}/expenses`,
      headers: h,
      payload: {
        description: "Bebidas",
        amountCents: 9000,
        paidByMemberId: bia.id,
        split: {
          type: "EXACT",
          shares: [{ memberId: bia.id, amountCents: 3000 }, { memberId: caio.id, amountCents: 6000 }],
        },
      },
    });
    expect(e2.statusCode).toBe(201);

    const list = await app.inject({ method: "GET", url: `${base}/expenses`, headers: h });
    expect(list.json()).toHaveLength(2);

    let summary = (await app.inject({ method: "GET", url: `${base}/summary`, headers: h })).json();
    const bal = (id: string) => summary.members.find((m: { memberId: string }) => m.memberId === id);
    expect(summary.totalSpentCents).toBe(39000);
    expect(bal(ana.id)).toMatchObject({ paidCents: 30000, shareCents: 10000, balanceCents: 20000 });
    expect(bal(bia.id)).toMatchObject({ paidCents: 9000, shareCents: 13000, balanceCents: -4000 });
    expect(bal(caio.id)).toMatchObject({ paidCents: 0, shareCents: 16000, balanceCents: -16000 });
    expect(summary.transfers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fromName: "Caio", toName: "Ana", amountCents: 16000 }),
        expect.objectContaining({ fromName: "Bia", toName: "Ana", amountCents: 4000 }),
      ]),
    );

    for (const t of summary.transfers) {
      const s = await app.inject({
        method: "POST",
        url: `${base}/settlements`,
        headers: h,
        payload: { fromMemberId: t.fromMemberId, toMemberId: t.toMemberId, amountCents: t.amountCents },
      });
      expect(s.statusCode).toBe(201);
    }
    summary = (await app.inject({ method: "GET", url: `${base}/summary`, headers: h })).json();
    expect(summary.transfers).toEqual([]);
    expect(summary.members.every((m: { balanceCents: number }) => m.balanceCents === 0)).toBe(true);
  });

  it("excluir despesa remove o efeito dela no extrato", async () => {
    const { user, base, ana, bia } = await createChurrasco();
    const e = await app.inject({
      method: "POST",
      url: `${base}/expenses`,
      headers: user.headers,
      payload: {
        description: "Gelo",
        amountCents: 1000,
        paidByMemberId: ana.id,
        split: { type: "EQUAL", memberIds: [ana.id, bia.id] },
      },
    });
    const url = `${base}/expenses/${e.json().id}`;
    expect((await app.inject({ method: "DELETE", url, headers: user.headers })).statusCode).toBe(204);
    expect((await app.inject({ method: "DELETE", url, headers: user.headers })).statusCode).toBe(404);

    const summary = (await app.inject({ method: "GET", url: `${base}/summary`, headers: user.headers })).json();
    expect(summary.totalSpentCents).toBe(0);
    expect(summary.transfers).toEqual([]);
  });

  describe("validações", () => {
    it("rejeita pagador de outro grupo", async () => {
      const g1 = await createChurrasco();
      const g2 = await createChurrasco(g1.user);
      const res = await app.inject({
        method: "POST",
        url: `${g1.base}/expenses`,
        headers: g1.user.headers,
        payload: {
          description: "Intruso",
          amountCents: 100,
          paidByMemberId: g2.bia.id,
          split: { type: "EQUAL", memberIds: [g1.ana.id] },
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("INVALID_PAYER");
    });

    it("rejeita participante da divisão de outro grupo", async () => {
      const g1 = await createChurrasco();
      const g2 = await createChurrasco(g1.user);
      const res = await app.inject({
        method: "POST",
        url: `${g1.base}/expenses`,
        headers: g1.user.headers,
        payload: {
          description: "Intruso",
          amountCents: 100,
          paidByMemberId: g1.ana.id,
          split: { type: "EQUAL", memberIds: [g1.ana.id, g2.bia.id] },
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("INVALID_SPLIT");
    });

    it("rejeita divisão personalizada que não fecha com o total", async () => {
      const { user, base, ana, bia } = await createChurrasco();
      const res = await app.inject({
        method: "POST",
        url: `${base}/expenses`,
        headers: user.headers,
        payload: {
          description: "Errada",
          amountCents: 1000,
          paidByMemberId: ana.id,
          split: { type: "EXACT", shares: [{ memberId: bia.id, amountCents: 500 }] },
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("INVALID_SPLIT");
    });

    it("rejeita valor não inteiro, negativo ou zero", async () => {
      const { user, base, ana } = await createChurrasco();
      for (const amountCents of [10.5, -100, 0, "100"]) {
        const res = await app.inject({
          method: "POST",
          url: `${base}/expenses`,
          headers: user.headers,
          payload: {
            description: "x",
            amountCents,
            paidByMemberId: ana.id,
            split: { type: "EQUAL", memberIds: [ana.id] },
          },
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().error).toBe("VALIDATION_ERROR");
      }
    });

    it("404 para grupo inexistente e 400 para id malformado", async () => {
      const user = await registerUser(app);
      const missing = await app.inject({
        method: "GET",
        url: "/api/groups/00000000-0000-4000-8000-000000000000/summary",
        headers: user.headers,
      });
      expect(missing.statusCode).toBe(404);
      const bad = await app.inject({ method: "GET", url: "/api/groups/nao-e-uuid", headers: user.headers });
      expect(bad.statusCode).toBe(400);
    });

    it("rejeita acerto para si mesmo", async () => {
      const { user, base, ana } = await createChurrasco();
      const res = await app.inject({
        method: "POST",
        url: `${base}/settlements`,
        headers: user.headers,
        payload: { fromMemberId: ana.id, toMemberId: ana.id, amountCents: 100 },
      });
      expect(res.statusCode).toBe(400);
    });
  });
});

describe("limites", () => {
  it("recusa corpo acima de 64 KB com 413", async () => {
    const user = await registerUser(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/groups",
      headers: user.headers,
      payload: { name: "x".repeat(70 * 1024) },
    });
    expect(res.statusCode).toBe(413);
    expect(res.json().error).toBe("PAYLOAD_TOO_LARGE");
  });

  it("limita o grupo a 100 participantes (criador incluso)", async () => {
    const user = await registerUser(app);
    const many = Array.from({ length: 99 }, (_, i) => ({ name: `P${i}` }));
    const g = await app.inject({
      method: "POST",
      url: "/api/groups",
      headers: user.headers,
      payload: { name: "Lotado", members: many },
    });
    expect(g.json().members).toHaveLength(100);
    const extra = await app.inject({
      method: "POST",
      url: `/api/groups/${g.json().id}/members`,
      headers: user.headers,
      payload: { name: "Sobrando" },
    });
    expect(extra.statusCode).toBe(400);
    expect(extra.json().error).toBe("GROUP_LIMIT");
  });
});

describe("edição de despesa, desfazer pagamento e saldo por grupo", () => {
  const equal = (paidBy: string, amountCents: number, memberIds: string[]) => ({
    description: "Mercado",
    amountCents,
    paidByMemberId: paidBy,
    split: { type: "EQUAL", memberIds },
  });

  it("edita valor, pagador e divisão de uma despesa", async () => {
    const { user, base, ana, bia, caio } = await createChurrasco();
    const h = user.headers;
    const created = (
      await app.inject({ method: "POST", url: `${base}/expenses`, headers: h, payload: equal(ana.id, 3000, [ana.id, bia.id, caio.id]) })
    ).json();
    expect(created.updatedAt).toBeNull();

    const res = await app.inject({
      method: "PUT",
      url: `${base}/expenses/${created.id}`,
      headers: h,
      payload: {
        description: "Mercado (corrigido)",
        amountCents: 5000,
        paidByMemberId: bia.id,
        split: { type: "EXACT", shares: [{ memberId: ana.id, amountCents: 1000 }, { memberId: bia.id, amountCents: 4000 }] },
      },
    });
    expect(res.statusCode, res.body).toBe(200);
    const updated = res.json();
    expect(updated).toMatchObject({ id: created.id, description: "Mercado (corrigido)", amountCents: 5000, splitType: "EXACT" });
    expect(updated.updatedAt).not.toBeNull();
    expect(updated.shares).toHaveLength(2);

    const list = (await app.inject({ method: "GET", url: `${base}/expenses`, headers: h })).json();
    expect(list).toHaveLength(1);
    const summary = (await app.inject({ method: "GET", url: `${base}/summary`, headers: h })).json();
    const bal = Object.fromEntries(summary.members.map((m: { memberId: string; balanceCents: number }) => [m.memberId, m.balanceCents]));
    // Bia pagou 5000 e ficou com 4000 → +1000; Ana deve 1000; Caio saiu da divisão.
    expect(bal).toEqual({ [ana.id]: -1000, [bia.id]: 1000, [caio.id]: 0 });
  });

  it("edição inválida não altera nada (operação atômica)", async () => {
    const { user, base, ana, bia } = await createChurrasco();
    const h = user.headers;
    const created = (
      await app.inject({ method: "POST", url: `${base}/expenses`, headers: h, payload: equal(ana.id, 2000, [ana.id, bia.id]) })
    ).json();
    const bad = await app.inject({
      method: "PUT",
      url: `${base}/expenses/${created.id}`,
      headers: h,
      payload: { ...equal(ana.id, 2000, []), split: { type: "EXACT", shares: [{ memberId: bia.id, amountCents: 1 }] } },
    });
    expect(bad.statusCode).toBe(400);
    const [still] = (await app.inject({ method: "GET", url: `${base}/expenses`, headers: h })).json();
    expect(still).toMatchObject({ amountCents: 2000, splitType: "EQUAL", updatedAt: null });
    expect(still.shares).toHaveLength(2);
  });

  it("não edita despesa excluída nem de outro grupo", async () => {
    const g1 = await createChurrasco();
    const g2 = await createChurrasco(g1.user);
    const h = g1.user.headers;
    const e = (
      await app.inject({ method: "POST", url: `${g1.base}/expenses`, headers: h, payload: equal(g1.ana.id, 1000, [g1.ana.id]) })
    ).json();
    const otherGroup = await app.inject({
      method: "PUT",
      url: `${g2.base}/expenses/${e.id}`,
      headers: h,
      payload: equal(g2.ana.id, 1000, [g2.ana.id]),
    });
    expect(otherGroup.statusCode).toBe(404);

    await app.inject({ method: "DELETE", url: `${g1.base}/expenses/${e.id}`, headers: h });
    const deleted = await app.inject({
      method: "PUT",
      url: `${g1.base}/expenses/${e.id}`,
      headers: h,
      payload: equal(g1.ana.id, 1000, [g1.ana.id]),
    });
    expect(deleted.statusCode).toBe(404);
  });

  it("desfaz um pagamento registrado por engano", async () => {
    const { user, base, ana, bia } = await createChurrasco();
    const h = user.headers;
    await app.inject({ method: "POST", url: `${base}/expenses`, headers: h, payload: equal(ana.id, 2000, [ana.id, bia.id]) });
    const s = (
      await app.inject({
        method: "POST",
        url: `${base}/settlements`,
        headers: h,
        payload: { fromMemberId: bia.id, toMemberId: ana.id, amountCents: 1000 },
      })
    ).json();

    let summary = (await app.inject({ method: "GET", url: `${base}/summary`, headers: h })).json();
    expect(summary.transfers).toEqual([]);
    const listed = (await app.inject({ method: "GET", url: `${base}/settlements`, headers: h })).json();
    expect(listed).toEqual([expect.objectContaining({ id: s.id, amountCents: 1000, createdByUserId: user.id })]);

    const del = await app.inject({ method: "DELETE", url: `${base}/settlements/${s.id}`, headers: h });
    expect(del.statusCode).toBe(204);
    expect((await app.inject({ method: "DELETE", url: `${base}/settlements/${s.id}`, headers: h })).statusCode).toBe(404);

    summary = (await app.inject({ method: "GET", url: `${base}/summary`, headers: h })).json();
    expect(summary.transfers).toEqual([expect.objectContaining({ fromMemberId: bia.id, toMemberId: ana.id, amountCents: 1000 })]);
    expect((await app.inject({ method: "GET", url: `${base}/settlements`, headers: h })).json()).toEqual([]);
  });

  it("quem não participa não lista nem desfaz pagamentos", async () => {
    const { user, base, ana, bia } = await createChurrasco();
    const s = (
      await app.inject({
        method: "POST",
        url: `${base}/settlements`,
        headers: user.headers,
        payload: { fromMemberId: bia.id, toMemberId: ana.id, amountCents: 500 },
      })
    ).json();
    const intruso = await registerUser(app);
    expect((await app.inject({ method: "GET", url: `${base}/settlements`, headers: intruso.headers })).statusCode).toBe(404);
    expect(
      (await app.inject({ method: "DELETE", url: `${base}/settlements/${s.id}`, headers: intruso.headers })).statusCode,
    ).toBe(404);
  });

  it("a lista de grupos traz o saldo do usuário em cada grupo", async () => {
    const user = await registerUser(app, { name: "Lia" });
    const g1 = await createChurrasco(user); // "Ana" = membro da Lia (criadora)
    const g2 = await createChurrasco(user);
    const h = user.headers;
    // g1: Lia pagou 3000 dividido por 3 → recebe 2000
    await app.inject({ method: "POST", url: `${g1.base}/expenses`, headers: h, payload: equal(g1.ana.id, 3000, [g1.ana.id, g1.bia.id, g1.caio.id]) });
    // g2: Bia pagou 1000 dividido com a Lia → Lia deve 500; depois Lia paga 200
    await app.inject({ method: "POST", url: `${g2.base}/expenses`, headers: h, payload: equal(g2.bia.id, 1000, [g2.ana.id, g2.bia.id]) });
    await app.inject({
      method: "POST",
      url: `${g2.base}/settlements`,
      headers: h,
      payload: { fromMemberId: g2.ana.id, toMemberId: g2.bia.id, amountCents: 200 },
    });
    // Despesa excluída não conta
    const gone = (
      await app.inject({ method: "POST", url: `${g1.base}/expenses`, headers: h, payload: equal(g1.bia.id, 9000, [g1.ana.id]) })
    ).json();
    await app.inject({ method: "DELETE", url: `${g1.base}/expenses/${gone.id}`, headers: h });

    const list = (await app.inject({ method: "GET", url: "/api/groups", headers: h })).json();
    const byId = Object.fromEntries(list.map((g: { id: string; myBalanceCents: number }) => [g.id, g.myBalanceCents]));
    expect(byId).toEqual({ [g1.group.id]: 2000, [g2.group.id]: -300 });
  });
});
