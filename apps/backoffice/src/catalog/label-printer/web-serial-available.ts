export function webSerialAvailable(): boolean {
  if (typeof navigator !== "object" || navigator === null || !("serial" in navigator)) {
    return false;
  }
  const { serial } = navigator;
  return (
    typeof serial === "object" &&
    serial !== null &&
    "requestPort" in serial &&
    typeof serial.requestPort === "function"
  );
}
