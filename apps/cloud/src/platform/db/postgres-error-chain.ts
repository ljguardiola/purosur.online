export interface PostgresErrorLink {
  code: unknown;
  constraint: unknown;
}

// postgres-js names the field `constraint_name`; PGlite names it `constraint`.
export function postgresErrorChain(error: unknown): PostgresErrorLink[] {
  const chain: PostgresErrorLink[] = [];
  let current: unknown = error;
  while (current instanceof Error) {
    const { code, constraint, constraint_name } = current as {
      code?: unknown;
      constraint?: unknown;
      constraint_name?: unknown;
    };
    chain.push({ code, constraint: constraint_name ?? constraint });
    current = current.cause;
  }
  return chain;
}
