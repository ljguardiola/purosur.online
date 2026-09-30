import type {
  CoreToRendererMessage,
  EnrollmentOutcome,
  RendererToCoreMessage,
} from "@purosur/contracts";
import { coreToRendererMessageSchema } from "@purosur/contracts";

export interface CorePort {
  postMessage(message: unknown): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  start(): void;
  close(): void;
}

export interface CoreClient {
  connect(port: CorePort): void;
  enrollmentStatus(): Promise<boolean>;
  registerName(): Promise<string | null>;
  enroll(typedCode: string): Promise<EnrollmentOutcome>;
  onPulled(listener: () => void): () => void;
}

type CoreRequest = Exclude<RendererToCoreMessage, { type: "ping" }>;

type CoreAnswer = Exclude<CoreToRendererMessage, { type: "pulled" }>;

interface PendingRequest {
  message: CoreRequest;
  settle(answer: CoreAnswer): boolean;
  fail(error: Error): void;
}

export function createCoreClient(deps: { newRequestId: () => string }): CoreClient {
  let current: CorePort | undefined;
  const unsent: PendingRequest[] = [];
  const sent = new Map<string, PendingRequest>();
  const pulledListeners = new Set<() => void>();

  function receive(port: CorePort, data: unknown): void {
    if (port !== current) {
      return;
    }
    const answer = coreToRendererMessageSchema.safeParse(data);
    if (!answer.success) {
      return;
    }
    if (answer.data.type === "pulled") {
      for (const listener of pulledListeners) {
        listener();
      }
      return;
    }
    if (sent.get(answer.data.request_id)?.settle(answer.data)) {
      sent.delete(answer.data.request_id);
    }
  }

  function send(port: CorePort, request: PendingRequest): void {
    sent.set(request.message.request_id, request);
    port.postMessage(request.message);
  }

  function ask<T>(message: CoreRequest, read: (answer: CoreAnswer) => T | undefined): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const request: PendingRequest = {
        message,
        settle(answer) {
          const value = read(answer);
          if (value === undefined) {
            return false;
          }
          resolve(value);
          return true;
        },
        fail: reject,
      };
      if (current === undefined) {
        unsent.push(request);
      } else {
        send(current, request);
      }
    });
  }

  return {
    // A reloaded page or a restarted core hands over a fresh port, and the core behind the one it
    // replaces will never answer what was already sent on it.
    connect(port) {
      current?.close();
      for (const request of sent.values()) {
        request.fail(new Error("the core connection was replaced"));
      }
      sent.clear();
      current = port;
      port.addEventListener("message", (event) => receive(port, event.data));
      port.start();
      for (const request of unsent.splice(0)) {
        send(port, request);
      }
    },
    enrollmentStatus() {
      return ask(
        { type: "enrollment-status-request", request_id: deps.newRequestId() },
        (answer) => (answer.type === "enrollment-status" ? answer.enrolled : undefined),
      );
    },
    registerName() {
      return ask({ type: "register-name-request", request_id: deps.newRequestId() }, (answer) =>
        answer.type === "register-name" ? answer.name : undefined,
      );
    },
    enroll(typedCode) {
      return ask({ type: "enroll", request_id: deps.newRequestId(), code: typedCode }, (answer) =>
        answer.type === "enrollment-result" ? answer.outcome : undefined,
      );
    },
    onPulled(listener) {
      pulledListeners.add(listener);
      return () => {
        pulledListeners.delete(listener);
      };
    },
  };
}
