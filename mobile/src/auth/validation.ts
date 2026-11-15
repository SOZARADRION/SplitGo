/** Validação de formulário no cliente (o servidor valida de novo). */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

export function validateEmail(email: string): string | undefined {
  if (!email.trim()) return "Informe seu e-mail";
  if (!EMAIL_RE.test(email.trim())) return "E-mail inválido";
}

export function validateLogin(v: { email: string; password: string }) {
  const errors: FieldErrors<"email" | "password"> = {};
  errors.email = validateEmail(v.email);
  if (!v.password) errors.password = "Informe sua senha";
  return clean(errors);
}

export function validateSignUp(v: { name: string; email: string; password: string; confirm: string }) {
  const errors: FieldErrors<"name" | "email" | "password" | "confirm"> = {};
  if (!v.name.trim()) errors.name = "Informe seu nome";
  else if (v.name.trim().length > 80) errors.name = "Nome muito longo";
  errors.email = validateEmail(v.email);
  if (v.password.length < 8) errors.password = "A senha deve ter pelo menos 8 caracteres";
  else if (new TextEncoder().encode(v.password).length > 72) errors.password = "Senha longa demais";
  if (v.confirm !== v.password) errors.confirm = "As senhas não conferem";
  return clean(errors);
}

function clean<T extends Record<string, string | undefined>>(errors: T): Partial<T> {
  return Object.fromEntries(Object.entries(errors).filter(([, v]) => v)) as Partial<T>;
}
