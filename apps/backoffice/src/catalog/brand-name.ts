import { brandCreationBodySchema } from "@purosur/contracts";
import { schemaLimit } from "../platform/schema-limit";

const nameSchema = brandCreationBodySchema.shape.name;

export function brandNameMessage({ name }: { name: string }): string {
  const trimmed = name.trim();
  if (trimmed === "") {
    return "Ingresá el nombre de la marca.";
  }
  return nameSchema.safeParse(trimmed).success
    ? "Revisá el nombre de la marca."
    : `El nombre puede tener hasta ${schemaLimit(nameSchema.meta()?.["maxLength"])} caracteres.`;
}
