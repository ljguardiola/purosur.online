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
