import { Link, Stack, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useSession } from "@/auth/session";
import { FormError, PrimaryButton } from "@/components/form";
import { EmptyState } from "@/components/ui";
import { groupsApi } from "@/lib/api";
import { formatBRL } from "@/lib/money";
import { radius, spacing, useColors } from "@/lib/theme";
import { useFocusData } from "@/lib/use-focus-data";

/** Tela inicial: saudação e os grupos do usuário. */
export default function HomeScreen() {
  const { session, signOut } = useSession();
  const router = useRouter();
  const c = useColors();
  const token = session?.token ?? "";

  const load = useCallback(() => groupsApi.list(token), [token]);
  const { data: groups, error, loading, reload } = useFocusData(load);
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }

  const firstName = session?.user.name.split(" ")[0] ?? "";

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={signOut} accessibilityRole="button" hitSlop={12}>
              <Text style={{ color: c.primary, fontWeight: "700" }}>Sair</Text>
            </Pressable>
          ),
        }}
      />
      <FlatList
        data={groups ?? []}
        keyExtractor={(g) => g.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.primary} />}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.md }}>
            <Text style={[styles.hello, { color: c.text }]}>Olá, {firstName}!</Text>
            <Text style={{ color: c.textMuted }}>Seus grupos de despesas</Text>
            <PrimaryButton title="+ Novo grupo" onPress={() => router.push("/groups/new")} />
            <FormError message={error} />
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={c.primary} style={{ marginTop: spacing.xl }} />
          ) : error ? undefined : (
            <EmptyState
              title="Nenhum grupo ainda"
              description="Crie um grupo para a república, a viagem ou o churrasco e convide as pessoas."
            />
          )
        }
        renderItem={({ item }) => (
          <Link href={{ pathname: "/groups/[groupId]", params: { groupId: item.id } }} asChild>
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.card,
                { backgroundColor: c.surface, borderColor: c.border, opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.groupName, { color: c.text }]}>{item.name}</Text>
                <Text style={{ color: c.textMuted, marginTop: spacing.xs }}>
                  {item.memberCount} {item.memberCount === 1 ? "participante" : "participantes"}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", marginRight: spacing.sm }}>
                {item.myBalanceCents === 0 ? (
                  <Text style={{ color: c.textMuted, fontWeight: "600" }}>quite</Text>
                ) : (
                  <>
                    <Text
                      style={{
                        color: item.myBalanceCents > 0 ? c.positive : c.negative,
                        fontWeight: "800",
                        fontVariant: ["tabular-nums"],
                      }}
                    >
                      {formatBRL(Math.abs(item.myBalanceCents))}
                    </Text>
                    <Text
                      style={{ color: item.myBalanceCents > 0 ? c.positive : c.negative, fontSize: 12, fontWeight: "600" }}
                    >
                      {item.myBalanceCents > 0 ? "você recebe" : "você deve"}
                    </Text>
                  </>
                )}
              </View>
              <Text style={{ color: c.textMuted, fontSize: 22 }}>›</Text>
            </Pressable>
          </Link>
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
      />
    </>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.md, width: "100%", maxWidth: 640, alignSelf: "center" },
  hello: { fontSize: 26, fontWeight: "800" },
  card: {
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  groupName: { fontSize: 17, fontWeight: "700" },
});
