import { passkeyRegistrationBodySchema } from "@purosur/contracts";
import { schemaLimit } from "../platform/schema-limit";

const nameSchema = passkeyRegistrationBodySchema.shape.passkey_name;

export function passkeyNameMessage({ name }: { name: string }): string {
  const trimmed = name.trim();
  if (trimmed === "") {
    return "Ingresá un nombre para la passkey.";
  }
  return nameSchema.safeParse(trimmed).success
    ? "Revisá el nombre de la passkey."
    : `El nombre no puede superar los ${schemaLimit(nameSchema.meta()?.["maxLength"])} caracteres.`;
}
