CREATE TYPE "SplitMode" AS ENUM ('EQUAL', 'CUSTOM');

CREATE TABLE "User" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE "Group" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  currency char(3) NOT NULL DEFAULT 'BRL',
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE "GroupMember" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "groupId" uuid NOT NULL REFERENCES "Group"(id) ON DELETE RESTRICT,
  "userId" uuid REFERENCES "User"(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  email text,
  "archivedAt" timestamptz,
  UNIQUE ("groupId", id),
  UNIQUE ("groupId", "userId")
);
CREATE UNIQUE INDEX member_email ON "GroupMember" ("groupId", lower(email)) WHERE email IS NOT NULL;
CREATE TABLE "Expense" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "groupId" uuid NOT NULL REFERENCES "Group"(id) ON DELETE RESTRICT,
  "payerId" uuid NOT NULL,
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 200),
  "totalCents" bigint NOT NULL,
  "splitMode" "SplitMode" NOT NULL,
  "occurredAt" timestamptz NOT NULL DEFAULT now(),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("groupId", id),
  FOREIGN KEY ("groupId", "payerId") REFERENCES "GroupMember"("groupId", id) ON DELETE RESTRICT
);
CREATE INDEX expense_group_date ON "Expense" ("groupId", "occurredAt");
CREATE TABLE "ExpenseShare" (
  "groupId" uuid NOT NULL,
  "expenseId" uuid NOT NULL,
  "memberId" uuid NOT NULL,
  "amountCents" bigint NOT NULL,
  PRIMARY KEY ("expenseId", "memberId"),
  FOREIGN KEY ("groupId", "expenseId") REFERENCES "Expense"("groupId", id) ON DELETE CASCADE,
  FOREIGN KEY ("groupId", "memberId") REFERENCES "GroupMember"("groupId", id) ON DELETE RESTRICT
);
CREATE INDEX share_group_member ON "ExpenseShare" ("groupId", "memberId");
-- Reservada para futura confirmação de quitações; as rotas atuais só sugerem pagamentos.
CREATE TABLE "Settlement" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "groupId" uuid NOT NULL REFERENCES "Group"(id) ON DELETE RESTRICT,
  "fromMemberId" uuid NOT NULL,
  "toMemberId" uuid NOT NULL,
  "amountCents" bigint NOT NULL,
  "idempotencyKey" text NOT NULL,
  "paidAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("groupId", "idempotencyKey"),
  FOREIGN KEY ("groupId", "fromMemberId") REFERENCES "GroupMember"("groupId", id) ON DELETE RESTRICT,
  FOREIGN KEY ("groupId", "toMemberId") REFERENCES "GroupMember"("groupId", id) ON DELETE RESTRICT
);
CREATE INDEX settlement_group_date ON "Settlement" ("groupId", "paidAt");
