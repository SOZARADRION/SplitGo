-- Garante no próprio banco que as partes de cada despesa somam exatamente o total.
-- Triggers de restrição DEFERRED: a verificação acontece no COMMIT, depois que a
-- despesa e todas as partes foram inseridas na mesma transação.
-- (Regra trazida da versão inicial do SplitGo no GitHub.)

-- Serializa alterações nas partes de uma mesma despesa (evita write skew).
CREATE FUNCTION lock_share_expense() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM 1 FROM expenses WHERE id = OLD.expense_id FOR UPDATE;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    PERFORM 1 FROM expenses WHERE id = NEW.expense_id FOR UPDATE;
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$$;--> statement-breakpoint
CREATE TRIGGER lock_share_expense BEFORE INSERT OR UPDATE OR DELETE ON expense_shares
FOR EACH ROW EXECUTE FUNCTION lock_share_expense();--> statement-breakpoint

CREATE FUNCTION assert_expense_sum(p_expense_id uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  total bigint;
  allocated bigint;
  participants bigint;
BEGIN
  SELECT amount_cents INTO total FROM expenses WHERE id = p_expense_id;
  IF NOT FOUND THEN RETURN; END IF; -- despesa removida (cascade)
  SELECT COALESCE(SUM(amount_cents), 0), COUNT(*) INTO allocated, participants
    FROM expense_shares WHERE expense_id = p_expense_id;
  IF participants = 0 OR allocated <> total THEN
    RAISE EXCEPTION 'SplitGo: as partes da despesa % somam % e o total é %', p_expense_id, allocated, total
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;--> statement-breakpoint

CREATE FUNCTION validate_expense_sum() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'expenses' THEN
    IF TG_OP <> 'DELETE' THEN PERFORM assert_expense_sum(NEW.id); END IF;
  ELSE
    IF TG_OP <> 'INSERT' THEN PERFORM assert_expense_sum(OLD.expense_id); END IF;
    IF TG_OP <> 'DELETE' THEN PERFORM assert_expense_sum(NEW.expense_id); END IF;
  END IF;
  RETURN NULL;
END;
$$;--> statement-breakpoint

CREATE CONSTRAINT TRIGGER expense_sum AFTER INSERT OR UPDATE ON expenses
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_expense_sum();--> statement-breakpoint
CREATE CONSTRAINT TRIGGER share_sum AFTER INSERT OR UPDATE OR DELETE ON expense_shares
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_expense_sum();
