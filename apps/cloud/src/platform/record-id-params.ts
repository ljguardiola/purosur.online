import { recordIdSchema } from "@purosur/contracts";
import type { FastifyReply } from "fastify";

async function readIds<Name extends string>(
  reply: FastifyReply,
  source: unknown,
  names: readonly Name[],
  optional: boolean,
): Promise<Partial<Record<Name, string>> | undefined> {
  const values = typeof source === "object" && source !== null ? source : {};
  const ids: Partial<Record<Name, string>> = {};
  for (const name of names) {
    const value: unknown = (values as Record<string, unknown>)[name];
    if (optional && value === undefined) {
      continue;
    }
    const message = `${name} must be a record id`;
    const result = recordIdSchema(message).safeParse(value);
    if (!result.success) {
      await reply.code(400).send({
        code: "validation_failed",
        message,
        details: [{ field: name }],
      });
      return undefined;
    }
    ids[name] = result.data;
  }
  return ids;
}

export async function readRecordIds<Name extends string>(
  reply: FastifyReply,
  source: unknown,
  names: readonly Name[],
): Promise<Record<Name, string> | undefined> {
  return (await readIds(reply, source, names, false)) as Record<Name, string> | undefined;
}

export function readOptionalRecordIds<Name extends string>(
  reply: FastifyReply,
  source: unknown,
  names: readonly Name[],
): Promise<Partial<Record<Name, string>> | undefined> {
  return readIds(reply, source, names, true);
}
