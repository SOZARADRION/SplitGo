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
        contentStyle: { backgroundColor: c.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: "SplitGo" }} />
    </Stack>
  );
}
