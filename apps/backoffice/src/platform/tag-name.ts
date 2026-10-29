import { tagCreationBodySchema } from "@purosur/contracts";
import { schemaLimit } from "./schema-limit";

const tagNameSchema = tagCreationBodySchema.shape.name;

export const TAG_NAME_TAKEN = "Ya existe un distintivo con este nombre.";

export function tagNameMessage({ name }: { name: string }): string {
  const trimmed = name.trim();
  if (trimmed === "") {
    return "Ingresá el nombre del distintivo.";
  }
  if (!tagNameSchema.safeParse(trimmed).success) {
    return `El nombre puede tener hasta ${schemaLimit(tagNameSchema.meta()?.["maxLength"])} caracteres.`;
  }
  return "Revisá el nombre del distintivo.";
}
