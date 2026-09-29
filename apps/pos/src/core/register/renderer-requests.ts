import type {
  CoreToRendererMessage,
  EnrollmentOutcome,
  RendererToCoreMessage,
} from "@purosur/contracts";

export interface RendererRequestDeps {
  credentialsPresent: () => Promise<boolean>;
  enroll: (typedCode: string) => Promise<EnrollmentOutcome>;
}

export async function answerRendererRequest(
  deps: RendererRequestDeps,
  message: RendererToCoreMessage,
): Promise<CoreToRendererMessage | undefined> {
  switch (message.type) {
    case "enrollment-status-request":
      return {
        type: "enrollment-status",
        request_id: message.request_id,
        enrolled: await deps.credentialsPresent(),
      };
    case "enroll":
      return {
        type: "enrollment-result",
        request_id: message.request_id,
        outcome: await deps.enroll(message.code),
      };
    case "ping":
      return undefined;
  }
}
