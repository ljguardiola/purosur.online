import type { FastifyReply } from "fastify";

type SafeParseResult<T> =
  | { success: true; data: T }
  | {
      success: false;
      error: { issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }> };
    };

export interface RequestBodySchema<T> {
  safeParse(value: unknown): SafeParseResult<T>;
}

export async function readValidatedBody<T>(
  reply: FastifyReply,
  schema: RequestBodySchema<T>,
  body: unknown,
): Promise<T | undefined> {
  const result = schema.safeParse(body);
  if (result.success) {
    return result.data;
  }

  const [firstIssue] = result.error.issues;
  await reply.code(400).send({
    code: "validation_failed",
    message: firstIssue?.message ?? "invalid request body",
    details: [{ field: String(firstIssue?.path[0] ?? "") }],
  });
  return undefined;
}
