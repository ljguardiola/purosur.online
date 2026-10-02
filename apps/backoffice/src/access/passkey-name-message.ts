import type { ZodType } from "zod";
import { schemaLimit } from "../platform/schema-limit";

export function passkeyNameMessage(shape: ZodType) {
  return ({ name }: { name: string }): string => {
    const trimmed = name.trim();
    if (trimmed === "") {
      return "Ingresá un nombre para la passkey.";
    }
    return shape.safeParse(trimmed).success
      ? "Revisá el nombre de la passkey."
      : `El nombre no puede superar los ${schemaLimit(shape.meta()?.["maxLength"])} caracteres.`;
  };
}
