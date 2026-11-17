import { Stack } from "expo-router";
import { useColors } from "@/lib/theme";

/** Área logada do SplitGo. A proteção fica no layout raiz (Stack.Protected). */
export default function AppLayout() {
  const c = useColors();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: c.surface },
        headerTintColor: c.text,
        headerTitleStyle: { fontWeight: "700" },
        contentStyle: { backgroundColor: c.background },
        headerBackTitle: "Voltar",
      }}
    >
      <Stack.Screen name="index" options={{ title: "SplitGo" }} />
      <Stack.Screen name="groups/[groupId]/index" options={{ title: "Grupo" }} />
      {/* Formulários abrem como modal sobre a tela atual. */}
      <Stack.Screen name="groups/new" options={{ title: "Novo grupo", presentation: "modal" }} />
      <Stack.Screen
        name="groups/[groupId]/new-expense"
        options={{ title: "Nova despesa", presentation: "modal" }}
      />
      <Stack.Screen
        name="groups/[groupId]/add-member"
        options={{ title: "Adicionar participante", presentation: "modal" }}
      />
    </Stack>
  );
}
