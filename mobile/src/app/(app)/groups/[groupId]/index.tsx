import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSession } from "@/auth/session";
import { FormError, PrimaryButton } from "@/components/form";
import { Avatar, Card, confirm, EmptyState, notify, SecondaryButton, SectionTitle } from "@/components/ui";
import { errorMessage, groupsApi, type Settlement, type Transfer } from "@/lib/api";
import { formatBRL, formatDate } from "@/lib/money";
import { radius, spacing, useColors, type Colors } from "@/lib/theme";
import { useFocusData } from "@/lib/use-focus-data";

function balanceLabel(cents: number, c: Colors) {
  if (cents > 0) return { text: "recebe", color: c.positive };
  if (cents < 0) return { text: "deve", color: c.negative };
  return { text: "quite", color: c.textMuted };
}

export default function GroupScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { session } = useSession();
  const router = useRouter();
  const c = useColors();
  const token = session?.token ?? "";

  const load = useCallback(async () => {
    const [group, summary, expenses, settlements] = await Promise.all([
      groupsApi.get(token, groupId),
      groupsApi.summary(token, groupId),
      groupsApi.expenses(token, groupId),
      groupsApi.settlements(token, groupId),
    ]);
    return { group, summary, expenses, settlements };
  }, [token, groupId]);

  const { data, error, loading, reload } = useFocusData(load);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function refresh() {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }

  async function markPaid(t: Transfer) {
    const ok = await confirm(
      "Registrar pagamento",
      `${t.fromName} pagou ${formatBRL(t.amountCents)} para ${t.toName}?`,
      "Registrar",
    );
    if (!ok) return;
    setBusy(`t-${t.fromMemberId}-${t.toMemberId}`);
    try {
      await groupsApi.settle(token, groupId, t);
      await reload();
    } catch (err) {
      notify("Não foi possível registrar", errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function removeExpense(id: string, description: string) {
    const ok = await confirm("Excluir despesa", `Excluir "${description}"? Os saldos serão recalculados.`, "Excluir");
    if (!ok) return;
    setBusy(`e-${id}`);
    try {
      await groupsApi.deleteExpense(token, groupId, id);
      await reload();
    } catch (err) {
      notify("Não foi possível excluir", errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function undoSettlement(s: Settlement, label: string) {
    const ok = await confirm("Desfazer pagamento", `Desfazer "${label}"? O saldo volta a ficar em aberto.`, "Desfazer");
    if (!ok) return;
    setBusy(`s-${s.id}`);
    try {
      await groupsApi.undoSettlement(token, groupId, s.id);
      await reload();
    } catch (err) {
      notify("Não foi possível desfazer", errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  if (!data) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        {loading ? <ActivityIndicator color={c.primary} /> : <FormError message={error ?? "Grupo não encontrado"} />}
      </View>
    );
  }

  const { group, summary, expenses, settlements } = data;
  const me = group.members.find((m) => m.userId === session?.user.id);
  const myBalance = summary.members.find((b) => b.memberId === me?.id)?.balanceCents ?? 0;
  const names = new Map(group.members.map((m) => [m.id, m.name]));

  return (
    <>
      <Stack.Screen options={{ title: group.name }} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.primary} />}
      >
        <FormError message={error} />

        {/* Destaque: total do grupo e o saldo de quem está usando o app */}
        <View style={[styles.hero, { backgroundColor: c.hero }]}>
          <Text style={[styles.heroLabel, { color: c.heroAccent }]}>TOTAL GASTO PELO GRUPO</Text>
          <Text style={[styles.heroTotal, { color: c.heroText }]}>{formatBRL(summary.totalSpentCents)}</Text>
          {me ? (
            <Text style={{ color: c.heroMuted, fontSize: 16, marginTop: spacing.sm }}>
              Seu saldo:{" "}
              <Text style={{ color: myBalance === 0 ? c.heroText : c.heroAccent, fontWeight: "800" }}>
                {myBalance === 0
                  ? "você está quite"
                  : myBalance > 0
                    ? `recebe ${formatBRL(myBalance)}`
                    : `deve ${formatBRL(-myBalance)}`}
              </Text>
            </Text>
          ) : null}
        </View>

        <View style={styles.actions}>
          <View style={{ flex: 1 }}>
            <PrimaryButton
              title="+ Nova despesa"
              onPress={() => router.push({ pathname: "/groups/[groupId]/new-expense", params: { groupId } })}
            />
          </View>
          <View style={{ marginTop: spacing.sm }}>
            <SecondaryButton
              title="+ Pessoa"
              onPress={() => router.push({ pathname: "/groups/[groupId]/add-member", params: { groupId } })}
            />
          </View>
        </View>

        <SectionTitle>Saldos</SectionTitle>
        <Card style={{ paddingVertical: spacing.xs }}>
          {summary.members.map((b, i) => {
            const label = balanceLabel(b.balanceCents, c);
            const isMe = b.memberId === me?.id;
            return (
              <View
                key={b.memberId}
                style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }]}
                accessible
                accessibilityLabel={`${b.name}${isMe ? ", você" : ""}: ${label.text} ${formatBRL(Math.abs(b.balanceCents))}`}
              >
                <Avatar name={b.name} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: c.text }]}>
                    {b.name}
                    {isMe ? <Text style={{ color: c.textMuted, fontWeight: "500" }}> (você)</Text> : null}
                  </Text>
                  <Text style={{ color: c.textMuted, fontSize: 13 }}>
                    pagou {formatBRL(b.paidCents)} · parte {formatBRL(b.shareCents)}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[styles.amount, { color: label.color }]}>
                    {formatBRL(Math.abs(b.balanceCents))}
                  </Text>
                  <Text style={{ color: label.color, fontSize: 13, fontWeight: "600" }}>{label.text}</Text>
                </View>
              </View>
            );
          })}
        </Card>

        <SectionTitle>Como acertar</SectionTitle>
        {summary.transfers.length === 0 ? (
          <EmptyState
            title={summary.totalSpentCents > 0 ? "Tudo quite ✓" : "Nada para acertar"}
            description={
              summary.totalSpentCents > 0
                ? "Ninguém deve nada a ninguém neste grupo."
                : "Lance a primeira despesa para ver quem paga quem."
            }
          />
        ) : (
          <Card style={{ gap: spacing.md }}>
            <Text style={{ color: c.textMuted }}>
              O menor número de transferências para zerar o grupo:
            </Text>
            {summary.transfers.map((t) => (
              <View key={`${t.fromMemberId}-${t.toMemberId}`} style={styles.transfer}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontSize: 15 }}>
                    <Text style={{ fontWeight: "700" }}>{t.fromName}</Text> paga{" "}
                    <Text style={{ fontWeight: "700" }}>{t.toName}</Text>
                  </Text>
                  <Text style={[styles.amount, { color: c.text }]}>{formatBRL(t.amountCents)}</Text>
                </View>
                <SecondaryButton
                  compact
                  title={busy === `t-${t.fromMemberId}-${t.toMemberId}` ? "Registrando…" : "Marcar como pago"}
                  disabled={busy !== null}
                  onPress={() => markPaid(t)}
                />
              </View>
            ))}
          </Card>
        )}

        <SectionTitle>{`Despesas (${expenses.length})`}</SectionTitle>
        {expenses.length === 0 ? (
          <EmptyState title="Nenhuma despesa" description="Toque em “Nova despesa” ou leia um recibo." />
        ) : (
          <Card style={{ paddingVertical: spacing.xs }}>
            {expenses.map((e, i) => (
              <View key={e.id} style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }]}>
                <Pressable
                  style={({ pressed }) => [{ flex: 1, opacity: pressed ? 0.6 : 1 }]}
                  accessibilityRole="button"
                  accessibilityHint="Abre a despesa para editar"
                  onPress={() =>
                    router.push({
                      pathname: "/groups/[groupId]/new-expense",
                      params: { groupId, expenseId: e.id },
                    })
                  }
                >
                  <Text style={[styles.name, { color: c.text }]}>
                    {e.description}
                    {e.updatedAt ? <Text style={{ color: c.textMuted, fontWeight: "500" }}> · editada</Text> : null}
                  </Text>
                  <Text style={{ color: c.textMuted, fontSize: 13 }}>
                    {names.get(e.paidByMemberId) ?? "?"} pagou · {formatDate(e.occurredAt)} · dividido entre{" "}
                    {e.shares.length}
                  </Text>
                  <Text style={{ color: c.primary, fontSize: 13, fontWeight: "600", marginTop: 2 }}>Editar ›</Text>
                </Pressable>
                <View style={{ alignItems: "flex-end", gap: spacing.xs }}>
                  <Text style={[styles.amount, { color: c.text }]}>{formatBRL(e.amountCents)}</Text>
                  <SecondaryButton
                    compact
                    tone="danger"
                    title={busy === `e-${e.id}` ? "Excluindo…" : "Excluir"}
                    disabled={busy !== null}
                    onPress={() => removeExpense(e.id, e.description)}
                  />
                </View>
              </View>
            ))}
          </Card>
        )}

        {settlements.length > 0 ? (
          <>
            <SectionTitle>{`Pagamentos registrados (${settlements.length})`}</SectionTitle>
            <Card style={{ paddingVertical: spacing.xs }}>
              {settlements.map((s, i) => {
                const label = `${names.get(s.fromMemberId) ?? "?"} pagou ${formatBRL(s.amountCents)} para ${
                  names.get(s.toMemberId) ?? "?"
                }`;
                return (
                  <View key={s.id} style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: c.text, fontSize: 15 }}>{label}</Text>
                      <Text style={{ color: c.textMuted, fontSize: 13 }}>{formatDate(s.paidAt)}</Text>
                    </View>
                    <SecondaryButton
                      compact
                      tone="danger"
                      title={busy === `s-${s.id}` ? "Desfazendo…" : "Desfazer"}
                      disabled={busy !== null}
                      onPress={() => undoSettlement(s, label)}
                    />
                  </View>
                );
              })}
            </Card>
          </>
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  content: { padding: spacing.md, paddingBottom: spacing.xl * 2, width: "100%", maxWidth: 640, alignSelf: "center" },
  hero: { borderRadius: radius.lg, padding: spacing.lg },
  heroLabel: { fontSize: 12, fontWeight: "700", letterSpacing: 1.5 },
  heroTotal: { fontSize: 34, fontWeight: "800", marginTop: spacing.xs },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm, alignItems: "flex-start" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  name: { fontSize: 15, fontWeight: "700" },
  amount: { fontSize: 16, fontWeight: "800", fontVariant: ["tabular-nums"] },
  transfer: { flexDirection: "row", alignItems: "center", gap: spacing.md },
});
