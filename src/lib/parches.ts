// Utilidades para el manejo de parches (jugadores fantasma).

// Normaliza un sobrenombre para comparar si dos parches son "el mismo":
// - quita espacios sobrantes al inicio/fin y colapsa los internos
// - pasa a minúsculas
// - elimina acentos/diacríticos (á -> a, ñ -> n, etc.)
export function normalizarNombre(nombre: string): string {
  return nombre
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// ¿Coincide un parche con lo que el usuario escribió en el buscador?
// Coincide si el término normalizado está contenido en el nombre normalizado.
export function coincideBusqueda(sobrenombre: string, termino: string): boolean {
  const t = normalizarNombre(termino);
  if (t === "") return true;
  return normalizarNombre(sobrenombre).includes(t);
}
