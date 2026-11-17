import type { ReactNode } from "react";
import { Alert, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { radius, spacing, useColors } from "@/lib/theme";

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }, style]}>{children}</View>
  );
}

export function SectionTitle({ children, action }: { children: string; action?: ReactNode }) {
  const c = useColors();
  return (
    <View style={styles.sectionRow}>
      <Text style={[styles.sectionTitle, { color: c.text }]} accessibilityRole="header">
        {children}
      </Text>
      {action}
    </View>
  );
}

export function SecondaryButton({
  title,
  onPress,
  disabled,
  tone = "default",
  compact,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
  compact?: boolean;
}) {
  const c = useColors();
  const color = tone === "danger" ? c.danger : c.primary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={6}
      style={({ pressed }) => [
        compact ? styles.secondaryCompact : styles.secondary,
        { borderColor: color, opacity: disabled ? 0.5 : pressed ? 0.7 : 1 },
      ]}
    >
      <Text style={{ color, fontWeight: "700", fontSize: compact ? 13 : 15 }}>{title}</Text>
    </Pressable>
  );
}

/** Opção selecionável (participantes, pagador, modo de divisão). */
export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      style={[
        styles.chip,
        selected
          ? { backgroundColor: c.primarySoft, borderColor: c.primary }
          : { backgroundColor: c.surface, borderColor: c.border },
      ]}
    >
      <Text style={{ color: selected ? c.text : c.textMuted, fontWeight: selected ? "700" : "500" }}>
        {selected ? "✓ " : ""}
        {label}
      </Text>
    </Pressable>
  );
}

export function Avatar({ name }: { name: string }) {
  const c = useColors();
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  return (
    <View style={[styles.avatar, { backgroundColor: c.primarySoft }]} accessibilityElementsHidden>
      <Text style={{ color: c.text, fontWeight: "700" }}>{initials || "?"}</Text>
    </View>
  );
}

export function Notice({ tone, children }: { tone: "warning" | "danger"; children: ReactNode }) {
  const c = useColors();
  const bg = tone === "warning" ? c.warningSurface : c.dangerSurface;
  const fg = tone === "warning" ? c.warning : c.danger;
  return (
    <View style={[styles.notice, { backgroundColor: bg }]} accessibilityRole="alert">
      {typeof children === "string" ? <Text style={{ color: fg }}>{children}</Text> : children}
    </View>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  const c = useColors();
  return (
    <Card>
      <Text style={{ color: c.text, fontWeight: "700" }}>{title}</Text>
      <Text style={{ color: c.textMuted, marginTop: spacing.xs }}>{description}</Text>
    </Card>
  );
}

/** Confirmação que funciona também na web (Alert com botões não existe no navegador). */
export function confirm(title: string, message: string, confirmLabel = "Confirmar"): Promise<boolean> {
  if (Platform.OS === "web") {
    return Promise.resolve(typeof window !== "undefined" && window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: "Cancelar", style: "cancel", onPress: () => resolve(false) },
      { text: confirmLabel, onPress: () => resolve(true) },
    ]);
  });
}

/** Mensagem simples (erro ou sucesso) que funciona no celular e na web. */
export function notify(title: string, message: string) {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
}

const styles = StyleSheet.create({
  card: { padding: spacing.md, borderRadius: radius.lg, borderWidth: 1 },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionTitle: { fontSize: 18, fontWeight: "800" },
  secondary: {
    minHeight: 46,
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryCompact: {
    minHeight: 34,
    borderWidth: 1.5,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  chip: {
    borderWidth: 1.5,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 40,
    justifyContent: "center",
  },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  notice: { padding: spacing.md, borderRadius: radius.md, gap: spacing.xs },
});
