import { Stack } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useSession } from "@/auth/session";
import { FormError } from "@/components/form";
import { ApiError, groupsApi, type GroupListItem } from "@/lib/api";
import { radius, spacing, useColors } from "@/lib/theme";

/** Tela inicial logada: saudação e lista de grupos (o detalhe chega na Etapa 4). */
export default function HomeScreen() {
  const { session, signOut } = useSession();
  const c = useColors();
  const [groups, setGroups] = useState<GroupListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const token = session?.token;

  /** Busca os grupos; `isActive` evita atualizar a tela depois de desmontada. */
  const fetchGroups = useCallback(
    (isActive: () => boolean = () => true) => {
      if (!token) return Promise.resolve();
      return groupsApi.list(token).then(
        (data) => {
          if (!isActive()) return;
          setGroups(data);
          setError(null);
        },
        (err) => {
          if (!isActive()) return;
          setError(err instanceof ApiError ? err.message : "Erro ao carregar seus grupos.");
        },
      );
    },
    [token],
  );

  useEffect(() => {
    let active = true;
    fetchGroups(() => active);
    return () => {
      active = false;
    };
  }, [fetchGroups]);

  async function refresh() {
    setRefreshing(true);
    await fetchGroups();
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
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.primary} />
        }
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.md }}>
            <Text style={[styles.hello, { color: c.text }]}>Olá, {firstName}!</Text>
            <Text style={{ color: c.textMuted }}>Seus grupos de despesas</Text>
            <FormError message={error} />
          </View>
        }
        ListEmptyComponent={
          groups === null && !error ? (
            <ActivityIndicator color={c.primary} style={{ marginTop: spacing.xl }} />
          ) : (
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Text style={{ color: c.text, fontWeight: "600" }}>Nenhum grupo ainda</Text>
              <Text style={{ color: c.textMuted, marginTop: spacing.xs }}>
                Crie um grupo para a república, a viagem ou o churrasco.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={[styles.groupName, { color: c.text }]}>{item.name}</Text>
            <Text style={{ color: c.textMuted, marginTop: spacing.xs }}>
              {item.memberCount} {item.memberCount === 1 ? "participante" : "participantes"} · {item.currency}
            </Text>
          </View>
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
      />
    </>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.md, width: "100%", maxWidth: 640, alignSelf: "center" },
  hello: { fontSize: 26, fontWeight: "800" },
  card: { padding: spacing.md, borderRadius: radius.lg, borderWidth: 1 },
  groupName: { fontSize: 17, fontWeight: "700" },
});
