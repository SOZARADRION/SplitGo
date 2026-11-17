import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Text } from "react-native";
import { useSession } from "@/auth/session";
import { validateEmail } from "@/auth/validation";
import { FormError, FormScreen, PrimaryButton, TextField } from "@/components/form";
import { errorMessage, groupsApi } from "@/lib/api";
import { useColors } from "@/lib/theme";

export default function AddMemberScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { session } = useSession();
  const router = useRouter();
  const c = useColors();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    const found: typeof errors = {};
    if (!name.trim()) found.name = "Informe o nome";
    if (email.trim()) found.email = validateEmail(email);
    if (!found.email) delete found.email;
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length || !session) return;

    setLoading(true);
    try {
      await groupsApi.addMember(session.token, groupId, { name: name.trim(), email: email.trim() || null });
      router.back();
    } catch (err) {
      setFormError(errorMessage(err, "Não foi possível adicionar o participante."));
      setLoading(false);
    }
  }

  return (
    <FormScreen>
      <Text style={{ color: c.textMuted }}>
        Com o e-mail, a pessoa passa a ver este grupo quando entrar no SplitGo com ele.
      </Text>
      <FormError message={formError} />
      <TextField
        label="Nome"
        value={name}
        onChangeText={setName}
        error={errors.name}
        placeholder="Nome"
        autoFocus
        maxLength={80}
      />
      <TextField
        label="E-mail (opcional)"
        value={email}
        onChangeText={setEmail}
        error={errors.email}
        placeholder="pessoa@exemplo.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <PrimaryButton title="Adicionar" onPress={submit} loading={loading} />
    </FormScreen>
  );
}
