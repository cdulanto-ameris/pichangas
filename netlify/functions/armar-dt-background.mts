// Background function de Netlify: 15 minutos de techo, responde 202 al tiro.
// El sufijo `-background` del nombre del archivo es lo que activa ese modo.
//
// Es a propósito un cascarón de quince líneas: toda la lógica vive en
// `src/lib/armado-worker.ts`, que sí entra en el tsconfig y por lo tanto pasa
// por el chequeo de tipos. Acá solo va lo que no se puede verificar en local.
import { ejecutarArmado } from "../../src/lib/armado-worker";

export default async (req: Request): Promise<Response> => {
  // Este endpoint gasta plata, y es público. El secreto compartido es la
  // primera barrera; la guarda de `intentos` en la base es la segunda.
  const secreto = process.env.ARMADO_DT_SECRET;
  if (!secreto || req.headers.get("x-armado-secreto") !== secreto) {
    return new Response("No autorizado", { status: 401 });
  }

  const { armado_id } = (await req.json()) as { armado_id?: string };
  if (!armado_id) return new Response("Falta armado_id", { status: 400 });

  await ejecutarArmado(armado_id);
  return new Response("ok");
};
