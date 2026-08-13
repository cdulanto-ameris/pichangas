// Único punto del código que habla con Anthropic. Todo lo demás depende de
// `pedirFormacion`, así que cambiar de proveedor es editar este archivo.
// SOLO SERVIDOR: se importa con `await import(...)` para que el SDK no entre
// al bundle del navegador.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { SYSTEM_DT } from "./prompt-dt";
import { FormacionIASchema, type FormacionIA } from "./formacion-ia";
import type { DossierPartido } from "./dossier";

export const MODELO_DT = "claude-opus-5";

// En Opus 5 el thinking está activo por defecto y cuenta contra este tope.
// Bajarlo trunca la respuesta a mitad de camino.
const MAX_TOKENS = 16000;

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

  const respuesta = await client.messages.parse({
    model: MODELO_DT,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_DT,
    output_config: { format: zodOutputFormat(FormacionIASchema) },
    messages: [{ role: "user", content: turnoDelUsuario(dossier, correccion) }],
  });

  if (respuesta.stop_reason === "refusal") {
    throw new Error("El modelo declinó responder");
  }
  if (!respuesta.parsed_output) {
    throw new Error(`El modelo no devolvió un armado válido (stop_reason: ${respuesta.stop_reason})`);
  }
  return respuesta.parsed_output;
}
