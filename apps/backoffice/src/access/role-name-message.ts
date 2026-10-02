import { roleCreationBodySchema } from "@purosur/contracts";
import { failedRules } from "../platform/failed-rules";
import { schemaLimit } from "../platform/schema-limit";

const nameSchema = roleCreationBodySchema.shape.name;

export function roleNameMessage({ name }: { name: string }): string {
  const trimmed = name.trim();
  if (trimmed === "") {
    return "Ingresá el nombre del rol.";
  }
  const rules = failedRules(nameSchema, trimmed);
  if (rules.includes("max_length")) {
    return `El nombre puede tener hasta ${schemaLimit(nameSchema.meta()?.["maxLength"])} caracteres.`;
  }
  if (rules.includes("administrator_name")) {
    return "Ese nombre es del Administrador; elegí otro.";
  }
  return "Revisá el nombre del rol.";
}
