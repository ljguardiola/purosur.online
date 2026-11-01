import { postgresErrorChain } from "../platform/db/postgres-error-chain.js";

export function constraintViolatedBy(error: unknown, name: string): boolean {
  return postgresErrorChain(error).some((link) => link.constraint === name);
}
