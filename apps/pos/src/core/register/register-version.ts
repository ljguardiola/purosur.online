import { registerVersionSchema } from "@purosur/contracts";
import type { RegisterVersion } from "@purosur/domain";

export function registerVersionOf(text: string | null | undefined): RegisterVersion | null {
  const parsed = registerVersionSchema.safeParse(text);
  return parsed.success ? parsed.data : null;
}
