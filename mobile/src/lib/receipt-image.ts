import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";

export type ReceiptSource = "camera" | "library";

export interface ReceiptImage {
  uri: string;
  name: string;
  mimeType: string;
}

export class PermissionDeniedError extends Error {}

/** Lado maior da imagem enviada: nítido o bastante para ler o cupom e bem abaixo de 5 MB. */
const MAX_SIDE = 2000;

/**
 * Abre a câmera ou a galeria e devolve o recibo pronto para envio.
 * No celular a foto é convertida para JPEG e reduzida (o iPhone salva em HEIC,
 * formato que a API não aceita). Retorna null se o usuário cancelar.
 * Deve ser chamada a partir de um toque do usuário (exigência do navegador na web).
 */
export async function pickReceiptImage(source: ReceiptSource): Promise<ReceiptImage | null> {
  if (source === "camera" && Platform.OS !== "web") {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new PermissionDeniedError("Permita o acesso à câmera para fotografar o recibo.");
  }

  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 1 };
  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];

  if (Platform.OS === "web") {
    // O navegador entrega o arquivo original; a API valida o formato.
    return { uri: asset.uri, name: asset.fileName ?? "recibo.jpg", mimeType: asset.mimeType ?? "image/jpeg" };
  }

  const context = ImageManipulator.manipulate(asset.uri);
  if (Math.max(asset.width, asset.height) > MAX_SIDE) {
    context.resize(asset.width >= asset.height ? { width: MAX_SIDE } : { height: MAX_SIDE });
  }
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  return { uri: saved.uri, name: "recibo.jpg", mimeType: "image/jpeg" };
}
