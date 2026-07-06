// Procesamiento de imágenes de avatar en el cliente (sin librerías externas).

/** Carga un File como HTMLImageElement, liberando el object URL al terminar. */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Archivo de imagen inválido")); };
    img.src = url;
  });
}

/**
 * Recorta la imagen al centro (cuadrado) y la reduce a `size`px de lado.
 * Devuelve un Blob JPEG comprimido, ideal para avatares uniformes y livianos.
 */
export async function cropToSquareBlob(file: File, size = 512, quality = 0.85): Promise<Blob> {
  const img = await loadImage(file);
  const side = Math.min(img.width, img.height);
  const sx = (img.width - side) / 2;
  const sy = (img.height - side) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo procesar la imagen");
  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("No se pudo generar la imagen"))),
      "image/jpeg",
      quality,
    ),
  );
}
