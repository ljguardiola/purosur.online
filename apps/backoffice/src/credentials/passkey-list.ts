import { type PasskeySummaryWire, passkeyListSchema } from "@purosur/contracts";

export type Passkey = ReturnType<typeof passkeyFromWire>;

function passkeyFromWire(row: PasskeySummaryWire) {
  return { id: row.id, name: row.name, createdAt: row.created_at, lastUsedAt: row.last_used_at };
}

export function passkeyListFromWire(body: unknown): Passkey[] | undefined {
  const parsed = passkeyListSchema.safeParse(body);
  return parsed.success ? parsed.data.map(passkeyFromWire) : undefined;
}
