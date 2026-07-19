// Normalize a screenshot/photo for the AI extract endpoint: downscale to the
// model's high-res ceiling and re-encode as JPEG so the payload stays under
// the API's 2 MB body limit. Steps down quality, then dimensions, if needed.
const MAX_EDGE = 2400; // model supports up to 2576px on the long edge
const MAX_BASE64_CHARS = 1_800_000;

export async function fileToApiImage(file: File): Promise<{ mediaType: "image/jpeg"; data: string }> {
  const bitmap = await createImageBitmap(file);
  let scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));

  for (const quality of [0.92, 0.8, 0.65, 0.5]) {
    const data = renderToJpegBase64(bitmap, scale, quality);
    if (data.length <= MAX_BASE64_CHARS) return { mediaType: "image/jpeg", data };
  }
  // Still too big (unusual — e.g. an enormous dense photo): halve dimensions.
  const data = renderToJpegBase64(bitmap, scale * 0.5, 0.65);
  if (data.length <= MAX_BASE64_CHARS) return { mediaType: "image/jpeg", data };
  throw new Error("Image is too large even after compression — crop it and try again.");
}

function renderToJpegBase64(bitmap: ImageBitmap, scale: number, quality: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process the image in this browser.");
  // White backdrop: transparent PNG screenshots would otherwise turn black in JPEG.
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality).split(",")[1];
}
