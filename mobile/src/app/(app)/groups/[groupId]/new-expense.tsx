import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, Text, View } from "react-native";
import { useSession } from "@/auth/session";
import { FormError, FormScreen, PrimaryButton, TextField } from "@/components/form";
import { Card, Chip, Notice, SecondaryButton } from "@/components/ui";
import { errorMessage, groupsApi, receiptsApi, type ParsedReceipt, type SplitInput } from "@/lib/api";
import { centsToInput, formatBRL, formatDate, parseBRL } from "@/lib/money";
import { PermissionDeniedError, pickReceiptImage, type ReceiptSource } from "@/lib/receipt-image";
import { spacing, useColors } from "@/lib/theme";
import { useFocusData } from "@/lib/use-focus-data";

const MAX_CENTS = 1_000_000_000; // mesmo limite da API (R$ 10 milhões)

type Mode = "EQUAL" | "EXACT";
type Errors = Partial<Record<"description" | "amount" | "split", string>>;

export default function NewExpenseScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { session } = useSession();
  const router = useRouter();
  const c = useColors();
  const token = session?.token ?? "";

  const load = useCallback(() => groupsApi.get(token, groupId), [token, groupId]);
  const { data: group, error: loadError } = useFocusData(load);

  const [description, setDescription] = useState("");
  const [amountText, setAmountText] = useState("");
  const [payerChoice, setPayerChoice] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("EQUAL");
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
  const [exact, setExact] = useState<Record<string, string>>({});
  const [occurredAt, setOccurredAt] = useState<string | null>(null);

  const [receipt, setReceipt] = useState<ParsedReceipt | null>(null);
  const [reading, setReading] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);

  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!group) {
    return (
      <FormScreen>
        {loadError ? <FormError message={loadError} /> : <ActivityIndicator color={c.primary} />}
      </FormScreen>
    );
  }

  const members = group.members;
  const me = members.find((m) => m.userId === session?.user.id);
  const payerId = payerChoice ?? me?.id ?? members[0]?.id;
  const participants = members.filter((m) => !excluded.has(m.id));
  const amount = parseBRL(amountText);

  const exactSum = members.reduce((s, m) => s + (parseBRL(exact[m.id] ?? "") ?? 0), 0);
  const exactDiff = (amount ?? 0) - exactSum;

  async function readReceipt(source: ReceiptSource) {
    setReceiptError(null);
    try {
      const image = await pickReceiptImage(source);
      if (!image) return;
      setReading(true);
      const result = await receiptsApi.parse(token, image);
      setReceipt(result);
      if (result.estabelecimento && !description.trim()) setDescription(result.estabelecimento);
      if (result.valor_total) setAmountText(centsToInput(result.valor_total));
      setOccurredAt(result.data);
    } catch (err) {
      setReceiptError(
        err instanceof PermissionDeniedError ? err.message : errorMessage(err, "Não foi possível ler o recibo."),
      );
    } finally {
      setReading(false);
    }
  }

  function toggle(memberId: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  }

  function validate(): { found: Errors; split?: SplitInput } {
    const found: Errors = {};
    if (!description.trim()) found.description = "Descreva a despesa";
    if (amount === null || amount <= 0) found.amount = "Informe um valor válido, ex.: 45,90";
    else if (amount > MAX_CENTS) found.amount = "Valor acima do limite";

    let split: SplitInput | undefined;
    if (mode === "EQUAL") {
      if (participants.length === 0) found.split = "Escolha ao menos uma pessoa";
      else split = { type: "EQUAL", memberIds: participants.map((m) => m.id) };
    } else {
      const shares = members.map((m) => ({ memberId: m.id, raw: (exact[m.id] ?? "").trim() }));
      const invalid = shares.find((s) => s.raw && parseBRL(s.raw) === null);
      const parsed = shares
        .map((s) => ({ memberId: s.memberId, amountCents: s.raw ? (parseBRL(s.raw) ?? 0) : 0 }))
        .filter((s) => s.amountCents > 0);
      if (invalid) found.split = "Há um valor inválido na divisão";
      else if (parsed.length === 0) found.split = "Informe quanto cabe a cada pessoa";
      else if (amount !== null && exactSum !== amount)
        found.split = `A divisão soma ${formatBRL(exactSum)}, mas a despesa é ${formatBRL(amount)}`;
      else split = { type: "EXACT", shares: parsed };
    }
    return { found, split };
  }

  async function submit() {
    const { found, split } = validate();
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length || !split || amount === null || !payerId) return;

    setSaving(true);
    try {
      await groupsApi.createExpense(token, groupId, {
        description: description.trim(),
        amountCents: amount,
        paidByMemberId: payerId,
        // Data do recibo ao meio-dia UTC: evita "voltar um dia" no fuso do Brasil.
        ...(occurredAt ? { occurredAt: `${occurredAt}T12:00:00Z` } : {}),
        split,
      });
      router.back();
    } catch (err) {
      setFormError(errorMessage(err, "Não foi possível salvar a despesa."));
      setSaving(false);
    }
  }

  const perPerson =
    amount && participants.length ? formatBRL(Math.ceil(amount / participants.length)) : null;

  return (
    <FormScreen>
      {/* Leitura de recibo */}
      <Card style={{ gap: spacing.sm }}>
        <Text style={[styles.cardTitle, { color: c.text }]}>Tem o recibo?</Text>
        <Text style={{ color: c.textMuted }}>Leia a nota e o SplitGo preenche valor, descrição e data.</Text>
        {reading ? (
          <View style={styles.readingRow}>
            <ActivityIndicator color={c.primary} />
            <Text style={{ color: c.textMuted }}>Lendo o recibo…</Text>
          </View>
        ) : (
          <View style={styles.buttonRow}>
            {Platform.OS !== "web" ? (
              <View style={{ flex: 1 }}>
                <SecondaryButton title="📷 Tirar foto" onPress={() => readReceipt("camera")} />
              </View>
            ) : null}
            <View style={{ flex: 1 }}>
              <SecondaryButton
                title={Platform.OS === "web" ? "Escolher imagem" : "Galeria"}
                onPress={() => readReceipt("library")}
              />
            </View>
          </View>
        )}
        {receiptError ? <Notice tone="danger">{receiptError}</Notice> : null}
      </Card>

      {receipt ? (
        <Card style={{ gap: spacing.sm }}>
          <Text style={[styles.cardTitle, { color: c.text }]}>
            Recibo lido{receipt.estabelecimento ? `: ${receipt.estabelecimento}` : ""}
          </Text>
          {receipt.itens.map((it, i) => (
            <View key={i} style={styles.itemRow}>
              <Text style={{ color: c.text, flex: 1 }} numberOfLines={2}>
                {it.quantidade !== 1 ? `${it.quantidade.toLocaleString("pt-BR")} × ` : ""}
                {it.descricao}
              </Text>
              <Text style={{ color: c.text, fontVariant: ["tabular-nums"] }}>{formatBRL(it.valor_total_item)}</Text>
            </View>
          ))}
          {receipt.valor_total !== null ? (
            <View style={[styles.itemRow, { borderTopWidth: 1, borderTopColor: c.border, paddingTop: spacing.sm }]}>
              <Text style={{ color: c.text, fontWeight: "700", flex: 1 }}>Total</Text>
              <Text style={{ color: c.text, fontWeight: "700" }}>{formatBRL(receipt.valor_total)}</Text>
            </View>
          ) : null}
          {receipt.avisos.length ? (
            <Notice tone="warning">
              {receipt.avisos.map((a, i) => (
                <Text key={i} style={{ color: c.warning }}>
                  • {a}
                </Text>
              ))}
            </Notice>
          ) : null}
        </Card>
      ) : null}

      <FormError message={formError} />

      <TextField
        label="Descrição"
        value={description}
        onChangeText={setDescription}
        error={errors.description}
        placeholder="Ex.: Mercado, Jantar, Uber"
        maxLength={140}
      />
      <TextField
        label="Valor (R$)"
        value={amountText}
        onChangeText={setAmountText}
        error={errors.amount}
        placeholder="0,00"
        keyboardType="decimal-pad"
        inputMode="decimal"
      />
      {occurredAt ? (
        <View style={styles.itemRow}>
          <Text style={{ color: c.textMuted, flex: 1 }}>Data do recibo: {formatDate(occurredAt)}</Text>
          <SecondaryButton compact title="Usar hoje" onPress={() => setOccurredAt(null)} />
        </View>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        <Text style={[styles.label, { color: c.text }]}>Quem pagou?</Text>
        <View style={styles.chips}>
          {members.map((m) => (
            <Chip
              key={m.id}
              label={m.id === me?.id ? `${m.name} (você)` : m.name}
              selected={m.id === payerId}
              onPress={() => setPayerChoice(m.id)}
            />
          ))}
        </View>
      </View>

      <View style={{ gap: spacing.sm }}>
        <Text style={[styles.label, { color: c.text }]}>Como dividir?</Text>
        <View style={styles.chips}>
          <Chip label="Igual" selected={mode === "EQUAL"} onPress={() => setMode("EQUAL")} />
          <Chip label="Valores" selected={mode === "EXACT"} onPress={() => setMode("EXACT")} />
        </View>

        {mode === "EQUAL" ? (
          <>
            <Text style={{ color: c.textMuted }}>Toque para incluir ou tirar alguém da divisão.</Text>
            <View style={styles.chips}>
              {members.map((m) => (
                <Chip key={m.id} label={m.name} selected={!excluded.has(m.id)} onPress={() => toggle(m.id)} />
              ))}
            </View>
            {perPerson ? (
              <Text style={{ color: c.textMuted }}>
                {participants.length === 1
                  ? `Tudo para ${participants[0].name}`
                  : `Cerca de ${perPerson} para cada uma das ${participants.length} pessoas`}
              </Text>
            ) : null}
          </>
        ) : (
          <>
            {members.map((m) => (
              <View key={m.id} style={styles.exactRow}>
                <Text style={{ color: c.text, flex: 1 }}>{m.name}</Text>
                <View style={{ width: 140 }}>
                  <TextField
                    label={`Parte de ${m.name}`}
                    value={exact[m.id] ?? ""}
                    onChangeText={(v) => setExact((e) => ({ ...e, [m.id]: v }))}
                    placeholder="0,00"
                    keyboardType="decimal-pad"
                    inputMode="decimal"
                  />
                </View>
              </View>
            ))}
            {amount ? (
              <Text style={{ color: exactDiff === 0 ? c.positive : c.textMuted, fontWeight: "600" }}>
                {exactDiff === 0
                  ? "✓ A divisão fecha com o total"
                  : exactDiff > 0
                    ? `Faltam ${formatBRL(exactDiff)} para fechar ${formatBRL(amount)}`
                    : `Passou ${formatBRL(-exactDiff)} do total de ${formatBRL(amount)}`}
              </Text>
            ) : null}
          </>
        )}
        {errors.split ? <Text style={{ color: c.danger }}>{errors.split}</Text> : null}
      </View>

      <PrimaryButton title="Salvar despesa" onPress={submit} loading={saving} />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  cardTitle: { fontSize: 16, fontWeight: "700" },
  label: { fontSize: 14, fontWeight: "600" },
  buttonRow: { flexDirection: "row", gap: spacing.sm },
  readingRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 46 },
  itemRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  exactRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.md },
});
