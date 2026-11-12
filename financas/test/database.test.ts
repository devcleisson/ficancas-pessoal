import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createDatabase, createUser, asUser } from "./support/db";

let db: PGlite;
let alice: string;
let bob: string;

beforeAll(async () => {
  db = await createDatabase();
  alice = await createUser(db, "alice@example.com", "Alice");
  bob = await createUser(db, "bob@example.com");
}, 60_000);

describe("migração e dados iniciais", () => {
  it("cria perfil, categorias padrão e carteira para novo usuário", async () => {
    const r = await asUser(db, alice, async (tx) => ({
      profile: (await tx.query<{ full_name: string }>("select full_name from profiles")).rows,
      income: (await tx.query("select 1 from categories where kind='income'")).rows.length,
      expense: (await tx.query("select 1 from categories where kind='expense'")).rows.length,
      accounts: (await tx.query<{ name: string; initial_balance: string }>("select name, initial_balance from accounts")).rows,
    }));
    expect(r.profile[0].full_name).toBe("Alice");
    expect(r.income).toBe(6);
    expect(r.expense).toBe(12);
    expect(r.accounts).toHaveLength(1);
    expect(Number(r.accounts[0].initial_balance)).toBe(0);
  });
});

describe("row level security", () => {
  it("um usuário não vê nem altera dados de outro", async () => {
    const aliceAccount = await asUser(db, alice, async (tx) =>
      (await tx.query<{ id: string }>("select id from accounts limit 1")).rows[0].id,
    );
    const bobSees = await asUser(db, bob, async (tx) => ({
      accounts: (await tx.query<{ id: string }>("select id from accounts")).rows.map((r) => r.id),
      updated: (await tx.query(`update accounts set name='hack' where id=$1`, [aliceAccount])).affectedRows,
      deleted: (await tx.query(`delete from accounts where id=$1`, [aliceAccount])).affectedRows,
    }));
    expect(bobSees.accounts).not.toContain(aliceAccount);
    expect(bobSees.updated).toBe(0);
    expect(bobSees.deleted).toBe(0);
  });

  it("impede inserir registro em nome de outro usuário", async () => {
    await expect(
      asUser(db, bob, (tx) =>
        tx.query("insert into accounts (user_id, name, type) values ($1, 'x', 'cash')", [alice]),
      ),
    ).rejects.toThrow();
  });

  it("impede referenciar categoria/conta de outro usuário", async () => {
    const aliceCat = await asUser(db, alice, async (tx) =>
      (await tx.query<{ id: string }>("select id from categories where kind='expense' limit 1")).rows[0].id,
    );
    await expect(
      asUser(db, bob, async (tx) => {
        const acc = (await tx.query<{ id: string }>("select id from accounts limit 1")).rows[0].id;
        await tx.query(
          `insert into transactions (kind, description, amount, date, category_id, account_id, payment_method)
           values ('expense', 'x', 10, '2026-01-01', $1, $2, 'pix')`,
          [aliceCat, acc],
        );
      }),
    ).rejects.toThrow();
  });

  it("anônimo não acessa nada", async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.exec("set local role anon");
        await tx.query("select * from transactions");
      }),
    ).rejects.toThrow();
  });
});

describe("validações do banco", () => {
  const insertTx = (fields: string, values: string) =>
    asUser(db, alice, async (tx) => {
      const acc = (await tx.query<{ id: string }>("select id from accounts limit 1")).rows[0].id;
      await tx.query(
        `insert into transactions (kind, description, amount, date, payment_method, account_id ${fields})
         values ('expense', 'Teste', 10, '2026-01-01', 'pix', $1 ${values})`,
        [acc],
      );
    });

  it("aceita uma despesa válida", async () => {
    await expect(insertTx("", "")).resolves.toBeUndefined();
  });

  it("rejeita valor zero ou negativo", async () => {
    await expect(
      asUser(db, alice, (tx) =>
        tx.query(`insert into transactions (kind, description, amount, date, payment_method, status)
                  values ('expense','x',0,'2026-01-01','pix','pending')`),
      ),
    ).rejects.toThrow();
    await expect(
      asUser(db, alice, (tx) =>
        tx.query(`insert into transactions (kind, description, amount, date, payment_method, status)
                  values ('expense','x',-5,'2026-01-01','pix','pending')`),
      ),
    ).rejects.toThrow();
  });

  it("exige conta para lançamento pago fora do cartão", async () => {
    await expect(
      asUser(db, alice, (tx) =>
        tx.query(`insert into transactions (kind, description, amount, date, payment_method, status)
                  values ('expense','x',5,'2026-01-01','pix','paid')`),
      ),
    ).rejects.toThrow(/paid_needs_account/);
  });

  it("compra no cartão não pode debitar conta", async () => {
    await expect(
      asUser(db, alice, async (tx) => {
        const card = (
          await tx.query<{ id: string }>(
            "insert into credit_cards (name, limit_amount, closing_day, due_day) values ('C', 1000, 5, 12) returning id",
          )
        ).rows[0].id;
        const acc = (await tx.query<{ id: string }>("select id from accounts limit 1")).rows[0].id;
        await tx.query(
          `insert into transactions (kind, description, amount, date, payment_method, card_id, account_id)
           values ('expense','x',5,'2026-01-01','credit',$1,$2)`,
          [card, acc],
        );
      }),
    ).rejects.toThrow(/card_purchase_shape/);
  });

  it("não permite excluir categoria em uso", async () => {
    await expect(
      asUser(db, alice, async (tx) => {
        const cat = (await tx.query<{ id: string }>("select id from categories where name='Lazer'")).rows[0].id;
        const acc = (await tx.query<{ id: string }>("select id from accounts limit 1")).rows[0].id;
        await tx.query(
          `insert into transactions (kind, description, amount, date, payment_method, account_id, category_id)
           values ('expense','x',5,'2026-01-01','pix',$1,$2)`,
          [acc, cat],
        );
        await tx.query("delete from categories where id=$1", [cat]);
      }),
    ).rejects.toThrow();
  });

  it("orçamento e metas validam valores", async () => {
    await expect(
      asUser(db, alice, (tx) => tx.query("insert into goals (name, target_amount) values ('Meta', 0)")),
    ).rejects.toThrow();
    await expect(
      asUser(db, alice, (tx) => tx.query("insert into credit_cards (name, limit_amount, closing_day, due_day) values ('C', 100, 32, 1)")),
    ).rejects.toThrow();
  });

  it("excluir usuário remove todos os dados dele", async () => {
    const temp = await createUser(db, "temp@example.com");
    await db.query("delete from auth.users where id=$1", [temp]);
    const left = await db.query("select 1 from public.categories where user_id=$1", [temp]);
    expect(left.rows).toHaveLength(0);
  });
});
