-- Aplicado por scripts/migrate.mjs após db/001_initial.sql.
ALTER TABLE "Expense" ADD CONSTRAINT expense_positive CHECK ("totalCents" > 0);
ALTER TABLE "ExpenseShare" ADD CONSTRAINT share_nonnegative CHECK ("amountCents" >= 0);
ALTER TABLE "Settlement" ADD CONSTRAINT settlement_positive CHECK ("amountCents" > 0);
ALTER TABLE "Settlement" ADD CONSTRAINT settlement_distinct CHECK ("fromMemberId" <> "toMemberId");

-- Serializa alterações de cotas da mesma despesa para evitar write skew.
CREATE FUNCTION lock_share_expense() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM 1 FROM "Expense" WHERE id = OLD."expenseId" FOR UPDATE;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    PERFORM 1 FROM "Expense" WHERE id = NEW."expenseId" FOR UPDATE;
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER lock_share_expense BEFORE INSERT OR UPDATE OR DELETE ON "ExpenseShare"
FOR EACH ROW EXECUTE FUNCTION lock_share_expense();

CREATE FUNCTION assert_expense_sum(expense_id uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE total bigint; allocated numeric; participants bigint;
BEGIN
  SELECT "totalCents" INTO total FROM "Expense" WHERE id = expense_id;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT COALESCE(SUM("amountCents"), 0), COUNT(*) INTO allocated, participants
    FROM "ExpenseShare" WHERE "expenseId" = expense_id;
  IF participants = 0 OR allocated <> total THEN
    RAISE EXCEPTION 'Expense shares must equal total: %', expense_id;
  END IF;
END;
$$;
CREATE FUNCTION validate_expense_sum() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'Expense' THEN
    IF TG_OP <> 'DELETE' THEN PERFORM assert_expense_sum(NEW.id); END IF;
  ELSE
    IF TG_OP <> 'INSERT' THEN PERFORM assert_expense_sum(OLD."expenseId"); END IF;
    IF TG_OP <> 'DELETE' THEN PERFORM assert_expense_sum(NEW."expenseId"); END IF;
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER expense_sum AFTER INSERT OR UPDATE ON "Expense"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_expense_sum();
CREATE CONSTRAINT TRIGGER share_sum AFTER INSERT OR UPDATE OR DELETE ON "ExpenseShare"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_expense_sum();
