import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSession } from "@/auth/session";
import { validateEmail } from "@/auth/validation";
import { FormError, FormScreen, PrimaryButton, TextField } from "@/components/form";
import { Card, SecondaryButton } from "@/components/ui";
import { errorMessage, groupsApi } from "@/lib/api";
import { spacing, useColors } from "@/lib/theme";

interface Row {
  key: number;
  name: string;
  email: string;
}

let nextKey = 1;
const emptyRow = (): Row => ({ key: nextKey++, name: "", email: "" });

export default function NewGroupScreen() {
  const { session } = useSession();
  const router = useRouter();
  const c = useColors();

  const [name, setName] = useState("");
  const [rows, setRows] = useState<Row[]>(() => [emptyRow()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const update = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  function validate() {
    const found: Record<string, string> = {};
    if (!name.trim()) found.name = "Dê um nome ao grupo";
    for (const r of rows) {
      if (!r.name.trim() && r.email.trim()) found[`name-${r.key}`] = "Informe o nome";
      if (r.email.trim()) {
        const e = validateEmail(r.email);
        if (e) found[`email-${r.key}`] = e;
      }
    }
    return found;
  }

  async function submit() {
    const found = validate();
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length || !session) return;

    setLoading(true);
    try {
      const group = await groupsApi.create(session.token, {
        name: name.trim(),
        members: rows
          .filter((r) => r.name.trim())
          .map((r) => ({ name: r.name.trim(), email: r.email.trim() || null })),
      });
      router.replace({ pathname: "/groups/[groupId]", params: { groupId: group.id } });
    } catch (err) {
      setFormError(errorMessage(err, "Não foi possível criar o grupo."));
      setLoading(false);
    }
  }

  return (
    <FormScreen>
      <FormError message={formError} />
      <TextField
        label="Nome do grupo"
        value={name}
        onChangeText={setName}
        error={errors.name}
        placeholder="Ex.: Viagem para Paraty, Apartamento 204"
        autoFocus
        maxLength={100}
      />

      <View style={{ gap: spacing.xs }}>
        <Text style={[styles.label, { color: c.text }]}>Participantes</Text>
        <Text style={{ color: c.textMuted }}>
          Você já entra no grupo. Com o e-mail, a pessoa vê o grupo ao criar a conta no SplitGo.
        </Text>
      </View>

      {rows.map((r, i) => (
        <Card key={r.key} style={{ gap: spacing.sm }}>
          <View style={styles.rowHeader}>
            <Text style={{ color: c.textMuted, fontWeight: "600" }}>Pessoa {i + 1}</Text>
            {rows.length > 1 ? (
              <Pressable
                onPress={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                accessibilityRole="button"
                accessibilityLabel={`Remover pessoa ${i + 1}`}
                hitSlop={10}
              >
                <Text style={{ color: c.danger, fontWeight: "700" }}>Remover</Text>
              </Pressable>
            ) : null}
          </View>
          <TextField
            label="Nome"
            value={r.name}
            onChangeText={(v) => update(r.key, { name: v })}
            error={errors[`name-${r.key}`]}
            placeholder="Nome"
            maxLength={80}
          />
          <TextField
            label="E-mail (opcional)"
            value={r.email}
            onChangeText={(v) => update(r.key, { email: v })}
            error={errors[`email-${r.key}`]}
            placeholder="pessoa@exemplo.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
        </Card>
      ))}

      <SecondaryButton title="+ Adicionar pessoa" onPress={() => setRows((rs) => [...rs, emptyRow()])} />
      <PrimaryButton title="Criar grupo" onPress={submit} loading={loading} />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 14, fontWeight: "600" },
  rowHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
});
