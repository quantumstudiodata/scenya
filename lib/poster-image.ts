// Prepara la portada en el navegador antes de subirla: quita bordes lisos
// (franjas blancas o negras que dejan los generadores de imágenes) y la
// reduce a un tamaño razonable para web.
const MAX_HEIGHT = 1500;
const MAX_TRIM = 0.08; // nunca recorta más del 8 % por lado

export async function preparePoster(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.type === "image/svg+xml") return file;
  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(file); } catch { return file; }

  // Analiza una copia pequeña para encontrar los bordes.
  const scale = Math.min(1, 600 / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
  const probe = document.createElement("canvas");
  probe.width = w; probe.height = h;
  const pctx = probe.getContext("2d", { willReadFrequently: true });
  if (!pctx) return file;
  pctx.drawImage(bmp, 0, 0, w, h);
  const px = pctx.getImageData(0, 0, w, h).data;

  const lum = (x: number, y: number) => { const i = (y * w + x) * 4; return px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114; };
  // Una línea es "borde" si es casi de un solo color (poca variación).
  const flat = (vals: number[]) => {
    const m = vals.reduce((a, b) => a + b, 0) / vals.length;
    return Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length) < 6;
  };
  const row = (y: number) => Array.from({ length: w }, (_, x) => lum(x, y));
  const col = (x: number) => Array.from({ length: h }, (_, y) => lum(x, y));
  const maxY = Math.floor(h * MAX_TRIM), maxX = Math.floor(w * MAX_TRIM);
  let top = 0, bottom = 0, left = 0, right = 0;
  while (top < maxY && flat(row(top))) top++;
  while (bottom < maxY && flat(row(h - 1 - bottom))) bottom++;
  while (left < maxX && flat(col(left))) left++;
  while (right < maxX && flat(col(w - 1 - right))) right++;
  // Un píxel extra de margen para no dejar restos del borde suavizado.
  const pad = (n: number) => (n ? n + 1 : 0);
  const sx = pad(left) / scale, sy = pad(top) / scale;
  const sw = bmp.width - (pad(left) + pad(right)) / scale;
  const sh = bmp.height - (pad(top) + pad(bottom)) / scale;

  const out = Math.min(1, MAX_HEIGHT / sh);
  if (!top && !bottom && !left && !right && out === 1) return file;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sw * out); canvas.height = Math.round(sh * out);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
}
