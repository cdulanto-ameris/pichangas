// Vive aparte de `ia.server.ts` a propósito: este archivo no importa el SDK, así
// que se puede importar estáticamente desde código que también corre en el
// cliente sin arrastrar `@anthropic-ai/sdk` al grafo de módulos del navegador.
export function iaDisponible(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
