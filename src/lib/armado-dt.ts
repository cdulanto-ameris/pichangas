// Orquestación pura del armado con el director técnico: pide, valida, y si
// hace falta reintenta una vez. Separada del handler para poder testearla sin
// red — `pedirFormacion` llega por `await import(...)` dentro del handler
// para no arrastrar el SDK al bundle del navegador, y eso la hacía intestable.
import { validarFormacion, type FormacionIA } from "./formacion-ia";
import type { DossierPartido } from "./dossier";

export type PedirFormacion = (
  dossier: DossierPartido,
  correccion?: { intento: FormacionIA; problema: string },
) => Promise<FormacionIA>;

export type ResultadoDT =
  | { ok: true; formacion: FormacionIA }
  | { ok: false; motivo: string };

/**
 * Un intento y un solo reintento. El reintento existe porque el modelo suele
 * corregir un desequilibrio cuando se le dice el número concreto; un loop, en
 * cambio, multiplica costo y latencia por una mejora marginal.
 * Recibe `pedir` como parámetro para poder probar esta lógica sin red.
 */
export async function armarConDT(
  dossier: DossierPartido,
  convocados: string[],
  niveles: Map<string, number>,
  pedir: PedirFormacion,
): Promise<ResultadoDT> {
  let intento = await pedir(dossier);
  let veredicto = validarFormacion(intento, convocados, niveles);

  if (!veredicto.ok) {
    intento = await pedir(dossier, { intento, problema: veredicto.problema });
    veredicto = validarFormacion(intento, convocados, niveles);
  }
  if (!veredicto.ok) return { ok: false, motivo: veredicto.problema };

  return { ok: true, formacion: intento };
}
