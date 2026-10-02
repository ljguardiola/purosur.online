export function schemaLimit(declared: unknown): number {
  if (typeof declared !== "number" || !Number.isFinite(declared)) {
    throw new Error("The schema declares no such limit");
  }
  return declared;
}
