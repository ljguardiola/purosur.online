import { z } from "zod";

const CLOUD_ERRORS = {
  validation_failed: { status: 400, retryable: false },
  reset_code_invalid: { status: 400, retryable: false },
  device_token_rejected: { status: 401, retryable: false },
  enrollment_code_rejected: { status: 403, retryable: false },
  not_found: { status: 404, retryable: false },
  pin_already_set: { status: 409, retryable: false },
  reset_code_expired: { status: 410, retryable: false },
  reset_code_burned: { status: 410, retryable: false },
  rate_limited: { status: 429, retryable: true },
  internal_error: { status: 500, retryable: false },
  server_unavailable: { status: 503, retryable: true },
  email_unavailable: { status: 503, retryable: true },
} as const satisfies Record<string, { status: number; retryable: boolean }>;

export type CloudErrorCode = keyof typeof CLOUD_ERRORS;

export const CLOUD_ERROR_CODES = Object.keys(CLOUD_ERRORS) as [CloudErrorCode, ...CloudErrorCode[]];

export const cloudErrorSchema = z.object({
  code: z.enum(CLOUD_ERROR_CODES),
  message: z.string(),
  details: z.array(z.record(z.string(), z.unknown())),
});

export type CloudError = z.output<typeof cloudErrorSchema>;

export function cloudErrorStatus(code: CloudErrorCode): number {
  return CLOUD_ERRORS[code].status;
}

export function isRetryableCloudError(code: CloudErrorCode): boolean {
  return CLOUD_ERRORS[code].retryable;
}

export function cloudError(
  code: CloudErrorCode,
  message: string,
  details: CloudError["details"] = [],
): CloudError {
  return { code, message, details };
}

const retryAfterDetailSchema = z.object({ retry_after_seconds: z.int().nonnegative() });

export function retryAfterSecondsOf(error: CloudError): number | undefined {
  for (const detail of error.details) {
    const parsed = retryAfterDetailSchema.safeParse(detail);
    if (parsed.success) {
      return parsed.data.retry_after_seconds;
    }
  }
  return undefined;
}
