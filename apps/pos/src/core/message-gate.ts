export interface MessageIssue {
  readonly path: PropertyKey[];
  readonly message: string;
}

// Duck-types a Zod schema's `safeParse` shape instead of depending on `zod`
// directly: parsing stays the concern of packages/contracts.
export interface MessageSchema<T> {
  safeParse(
    raw: unknown,
  ):
    | { success: true; data: T }
    | { success: false; error: { issues: ReadonlyArray<MessageIssue> } };
}

export interface RejectedMessage {
  raw: unknown;
  issues: ReadonlyArray<MessageIssue>;
}

export interface RejectionSummary {
  messageType: string | undefined;
  issues: MessageIssue[];
}

// A rejected message can carry sale or credential data, so what leaves the core is only its
// declared type and where it failed validation, never its values.
export function summarizeRejection(rejection: RejectedMessage): RejectionSummary {
  const { raw } = rejection;
  const declaredType =
    typeof raw === "object" && raw !== null && "type" in raw ? raw.type : undefined;

  return {
    messageType: typeof declaredType === "string" ? declaredType : undefined,
    issues: rejection.issues.map(({ path, message }) => ({ path, message })),
  };
}

export interface RejectionRecorder {
  recordRejection(rejection: RejectedMessage): void;
}

export type MessageGate<T> = (raw: unknown, handler: (message: T) => void) => void;

export function createMessageGate<T>(
  schema: MessageSchema<T>,
  recorder: RejectionRecorder,
): MessageGate<T> {
  return (raw, handler) => {
    const result = schema.safeParse(raw);
    if (result.success) {
      handler(result.data);
      return;
    }

    recorder.recordRejection({ raw, issues: result.error.issues });
  };
}
