import { Link } from "expo-router";
import { useRef, useState } from "react";
import { Text, type TextInputInstance } from "react-native";
import { useSession } from "@/auth/session";
import { validateLogin } from "@/auth/validation";
import { AuthLayout, FormError, PrimaryButton, TextField } from "@/components/form";
import { ApiError } from "@/lib/api";
import { useColors } from "@/lib/theme";

export default function SignInScreen() {
  const { signIn } = useSession();
  const c = useColors();
  const passwordRef = useRef<TextInputInstance>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<ReturnType<typeof validateLogin>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    const found = validateLogin({ email, password });
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;

    setLoading(true);
    try {
      await signIn(email, password);
      // O Stack.Protected do layout raiz leva para a área logada.
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Não foi possível entrar. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Entrar" subtitle="Acesse sua conta para ver seus grupos e saldos.">
      <FormError message={formError} />
      <TextField
        label="E-mail"
        value={email}
        onChangeText={setEmail}
        error={errors.email}
        placeholder="voce@exemplo.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <TextField
        ref={passwordRef}
        label="Senha"
        value={password}
        onChangeText={setPassword}
        error={errors.password}
        placeholder="Sua senha"
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <PrimaryButton title="Entrar" onPress={submit} loading={loading} />
      <Text style={{ color: c.textMuted, textAlign: "center", marginTop: 8 }}>
        Ainda não tem conta?{" "}
        <Link href="/sign-up" replace style={{ color: c.primary, fontWeight: "700" }}>
          Cadastre-se
        </Link>
      </Text>
    </AuthLayout>
  );
}
