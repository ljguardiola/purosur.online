import type { ZodType } from "zod";

export function failedRules(schema: ZodType, value: unknown): string[] {
  const result = schema.safeParse(value);
  if (result.success) {
    return [];
  }
  return result.error.issues.flatMap((issue) => {
    const rule = issue.code === "custom" ? issue.params?.["rule"] : undefined;
    return typeof rule === "string" ? [rule] : [];
  });
}
