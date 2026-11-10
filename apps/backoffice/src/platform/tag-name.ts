import { tagCreationBodySchema } from "@purosur/contracts";
import { schemaLimit } from "./schema-limit";

const tagNameSchema = tagCreationBodySchema.shape.name;

export const TAG_NAME_TAKEN = "Ya existe una etiqueta con este nombre.";

export function tagNameMessage({ name }: { name: string }): string {
  const trimmed = name.trim();
  if (trimmed === "") {
    return "Ingresá el nombre de la etiqueta.";
  }
  if (!tagNameSchema.safeParse(trimmed).success) {
    return `El nombre puede tener hasta ${schemaLimit(tagNameSchema.meta()?.["maxLength"])} caracteres.`;
  }
  return "Revisá el nombre de la etiqueta.";
}
