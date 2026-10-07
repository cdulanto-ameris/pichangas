// Único punto del código que habla con Anthropic. Todo lo demás depende de
// `pedirFormacion`, así que cambiar de proveedor es editar este archivo.
// SOLO SERVIDOR: se importa con `await import(...)` para que el SDK no entre
// al bundle del navegador.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { SYSTEM_DT } from "./prompt-dt";
import { FormacionIASchema, type FormacionIA } from "./formacion-ia";
import type { DossierPartido } from "./dossier";

export const MODELO_DT = "claude-sonnet-5";

// El thinking está activo por defecto y se cobra como salida, así que cuenta
// contra este tope. Es un techo, no una reserva: dejarlo holgado no cuesta nada
// y evita que un armado se trunque a mitad del JSON. Con 16000 ya se cortó un
// armado en producción.
const MAX_TOKENS = 32000;

// El armado es una tarea acotada, no un problema abierto: con `low` el modelo
// piensa lo justo. Es la palanca principal de gasto y de latencia — el thinking
// se cobra a precio de salida.
const ESFUERZO = "low" as const;

export type Correccion = { intento: FormacionIA; problema: string };

function turnoDelUsuario(dossier: DossierPartido, correccion?: Correccion): string {
  const base =
    `Estos son los 16 convocados de hoy con su historial. Arma los dos equipos.\n\n` +
    JSON.stringify(dossier, null, 2);
  if (!correccion) return base;

  // El reintento va como un único turno de usuario en vez de una conversación:
  // menos superficie para que algo salga mal y el mismo resultado.
  return (
    base +
    `\n\nTu armado anterior fue:\n${JSON.stringify(correccion.intento, null, 2)}` +
    `\n\nTiene este problema: ${correccion.problema}` +
    `\n\nCorrígelo y devuelve el armado completo de nuevo.`
  );
}

export async function pedirFormacion(
  dossier: DossierPartido,
  correccion?: Correccion,
): Promise<FormacionIA> {
  // maxRetries: 1 para que el reintento HTTP del SDK no se sume al reintento
  // de armado y multiplique la latencia total.
  const client = new Anthropic({ maxRetries: 1 }); // lee ANTHROPIC_API_KEY del entorno

  // `create` en vez de `parse`: `parse` intenta leer el JSON antes de que uno
  // alcance a mirar el stop_reason, y si la respuesta se cortó el error sale
  // como "Unterminated string in JSON", que no dice qué pasó.
  const formato = zodOutputFormat(FormacionIASchema);
  const respuesta = await client.messages.create({
    model: MODELO_DT,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_DT,
    // Explícito aunque sea el default de Sonnet 5: el thinking es lo que hace
    // que el armado tenga criterio y no sea un reparto al azar. Que nadie lo
    // apague por error creyendo que solo ahorra.
    thinking: { type: "adaptive" },
    output_config: { effort: ESFUERZO, format: formato },
    messages: [{ role: "user", content: turnoDelUsuario(dossier, correccion) }],
  });

  if (respuesta.stop_reason === "refusal") {
    throw new Error("El modelo declinó responder");
  }
  const texto = respuesta.content
    .flatMap((b) => (b.type === "text" ? [b.text] : []))
    .join("");
  if (respuesta.stop_reason === "max_tokens") {
    // El largo del texto separa los dos casos: si es corto, se lo comió el
    // thinking; si es largo, el modelo se alargó en la explicación.
    console.error(
      `[armado-dt] respuesta cortada: ${respuesta.usage.output_tokens} tokens de salida, ` +
        `${texto.length} caracteres de texto`,
    );
    throw new Error("La respuesta del DT se cortó antes de terminar (max_tokens)");
  }
  return formato.parse(texto);
}
