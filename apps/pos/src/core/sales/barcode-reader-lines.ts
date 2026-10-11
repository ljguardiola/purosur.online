const CARRIAGE_RETURN = 0x0d;

export interface BarcodeReaderLines {
  feed(chunk: Uint8Array): string[];
}

export function createBarcodeReaderLines(): BarcodeReaderLines {
  let pending: number[] = [];
  return {
    feed(chunk) {
      const codes: string[] = [];
      for (const byte of chunk) {
        if (byte !== CARRIAGE_RETURN) {
          pending.push(byte);
        } else if (pending.length > 0) {
          codes.push(String.fromCharCode(...pending));
          pending = [];
        }
      }
      return codes;
    },
  };
}
