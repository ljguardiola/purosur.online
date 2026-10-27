export async function decodeWithJsQr(frame: ImageData): Promise<string | null> {
  const { default: jsQR } = await import("jsqr");
  return jsQR(frame.data, frame.width, frame.height)?.data ?? null;
}
