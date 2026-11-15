import { Link } from "expo-router";
import { useRef, useState } from "react";
import { Text, type TextInputInstance } from "react-native";
import { useSession } from "@/auth/session";
import { validateSignUp } from "@/auth/validation";
import { AuthLayout, FormError, PrimaryButton, TextField } from "@/components/form";
import { ApiError } from "@/lib/api";
import { useColors } from "@/lib/theme";

export default function SignUpScreen() {
  const { signUp } = useSession();
  const c = useColors();
  const emailRef = useRef<TextInputInstance>(null);
  const passwordRef = useRef<TextInputInstance>(null);
  const confirmRef = useRef<TextInputInstance>(null);

  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [errors, setErrors] = useState<ReturnType<typeof validateSignUp>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  async function submit() {
    const found = validateSignUp(form);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;

    setLoading(true);
    try {
      await signUp(form.name, form.email, form.password);
    } catch (err) {
      if (err instanceof ApiError && err.code === "EMAIL_TAKEN") {
        setErrors({ email: err.message });
      } else {
        setFormError(err instanceof ApiError ? err.message : "Não foi possível criar a conta.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Criar conta" subtitle="Divida contas com amigos sem planilha e sem cobrança chata.">
      <FormError message={formError} />
      <TextField
        label="Nome"
        value={form.name}
        onChangeText={set("name")}
        error={errors.name}
        placeholder="Como seus amigos te chamam"
        autoComplete="name"
        textContentType="name"
        returnKeyType="next"
        onSubmitEditing={() => emailRef.current?.focus()}
      />
      <TextField
        ref={emailRef}
        label="E-mail"
        value={form.email}
        onChangeText={set("email")}
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
        value={form.password}
        onChangeText={set("password")}
        error={errors.password}
        placeholder="Mínimo de 8 caracteres"
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="next"
        onSubmitEditing={() => confirmRef.current?.focus()}
      />
      <TextField
        ref={confirmRef}
        label="Confirmar senha"
        value={form.confirm}
        onChangeText={set("confirm")}
        error={errors.confirm}
        placeholder="Repita a senha"
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <PrimaryButton title="Criar conta" onPress={submit} loading={loading} />
      <Text style={{ color: c.textMuted, textAlign: "center", marginTop: 8 }}>
        Já tem conta?{" "}
        <Link href="/sign-in" replace style={{ color: c.primary, fontWeight: "700" }}>
          Entrar
        </Link>
      </Text>
    </AuthLayout>
  );
}
