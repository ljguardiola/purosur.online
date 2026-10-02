import { registerCreationBodySchema } from "@purosur/contracts";
import { schemaLimit } from "../platform/schema-limit";

const nameSchema = registerCreationBodySchema.shape.name;

export function registerNameMessage({ name }: { name: string }): string {
  const trimmed = name.trim();
  if (trimmed === "") {
    return "Ingresá el nombre de la caja.";
  }
  return nameSchema.safeParse(trimmed).success
    ? "Revisá el nombre de la caja."
    : `El nombre puede tener hasta ${schemaLimit(nameSchema.meta()?.["maxLength"])} caracteres.`;
}
