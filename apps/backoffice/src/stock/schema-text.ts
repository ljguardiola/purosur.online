export function schemaText(declared: unknown): string {
  if (typeof declared !== "string" || declared === "") {
    throw new Error("The schema declares no such text");
  }
  return declared;
}
