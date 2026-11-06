import { recordIdSchema } from "@purosur/contracts";
import type { FastifyReply } from "fastify";

function ownValue(source: unknown, name: string): unknown {
  return typeof source === "object" && source !== null
    ? Object.getOwnPropertyDescriptor(source, name)?.value
    : undefined;
}

async function refuseMalformedId(reply: FastifyReply, name: string, message: string) {
  await reply.code(400).send({
    code: "validation_failed",
    message,
    details: [{ field: name }],
  });
}

async function readIds<Name extends string>(
  reply: FastifyReply,
  source: unknown,
  names: readonly Name[],
  optional: boolean,
): Promise<Partial<Record<Name, string>> | undefined> {
  const ids = new Map<Name, string>();
  for (const name of names) {
    const value = ownValue(source, name);
    if (optional && value === undefined) {
      continue;
    }
    const message = `${name} must be a record id`;
    const result = recordIdSchema(message).safeParse(value);
    if (!result.success) {
      await refuseMalformedId(reply, name, message);
      return undefined;
    }
    ids.set(name, result.data);
  }
  return Object.fromEntries(ids) as Partial<Record<Name, string>>;
}

export async function readRecordId(
  reply: FastifyReply,
  source: unknown,
  name: string,
): Promise<string | undefined> {
  const message = `${name} must be a record id`;
  const result = recordIdSchema(message).safeParse(ownValue(source, name));
  if (!result.success) {
    await refuseMalformedId(reply, name, message);
    return undefined;
  }
  return result.data;
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
