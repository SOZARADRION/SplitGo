import type { ReactNode, Ref } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputInstance,
  type TextInputProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { radius, spacing, useColors } from "@/lib/theme";

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const c = useColors();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.inner}>
            <Text style={[styles.brand, { color: c.primary }]} accessibilityRole="header">
              SplitGo
            </Text>
            <Text style={[styles.title, { color: c.text }]}>{title}</Text>
            <Text style={[styles.subtitle, { color: c.textMuted }]}>{subtitle}</Text>
            <View style={{ gap: spacing.md }}>{children}</View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type FieldProps = Omit<TextInputProps, "ref"> & {
  label: string;
  error?: string;
  ref?: Ref<TextInputInstance>;
};

export function TextField({ label, error, style, ref, ...props }: FieldProps) {
  const c = useColors();
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[styles.label, { color: c.text }]}>{label}</Text>
      <TextInput
        ref={ref}
        placeholderTextColor={c.textMuted}
        accessibilityLabel={label}
        style={[
          styles.input,
          { color: c.text, backgroundColor: c.surface, borderColor: error ? c.danger : c.border },
          style,
        ]}
        {...props}
      />
      {error ? <Text style={[styles.fieldError, { color: c.danger }]}>{error}</Text> : null}
    </View>
  );
}

export function PrimaryButton({
  title,
  onPress,
  loading,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!loading, busy: !!loading }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: c.primary, opacity: pressed || loading ? 0.8 : 1 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={c.primaryText} />
      ) : (
        <Text style={[styles.buttonText, { color: c.primaryText }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function FormError({ message }: { message?: string | null }) {
  const c = useColors();
  if (!message) return null;
  return (
    <View style={[styles.formError, { backgroundColor: c.dangerSurface }]} accessibilityRole="alert">
      <Text style={{ color: c.danger }}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: "center", padding: spacing.lg },
  inner: { width: "100%", maxWidth: 420, alignSelf: "center" },
  brand: { fontSize: 32, fontWeight: "800", letterSpacing: -0.5, marginBottom: spacing.lg },
  title: { fontSize: 24, fontWeight: "700" },
  subtitle: { fontSize: 15, marginTop: spacing.xs, marginBottom: spacing.lg },
  label: { fontSize: 14, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 16,
  },
  fieldError: { fontSize: 13 },
  button: {
    minHeight: 50,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
  },
  buttonText: { fontSize: 16, fontWeight: "700" },
  formError: { padding: spacing.md, borderRadius: radius.md },
});
