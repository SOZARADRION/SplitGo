import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * Armazenamento da sessão:
 * - Android/iOS: expo-secure-store (Keystore / Keychain, criptografado);
 * - Web: localStorage (o SecureStore não existe no navegador).
 */

const isWeb = Platform.OS === "web";

export async function getItem(key: string): Promise<string | null> {
  if (isWeb) {
    try {
      return typeof localStorage === "undefined" ? null : localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  if (isWeb) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // modo privado / armazenamento bloqueado: a sessão dura só esta aba
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function removeItem(key: string): Promise<void> {
  if (isWeb) {
    try {
      localStorage.removeItem(key);
    } catch {
      // idem
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
