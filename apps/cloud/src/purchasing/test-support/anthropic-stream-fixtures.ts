interface StreamedIteration {
  type: "message" | "fallback_message";
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

interface StreamedUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheWriteTokens?: number;
  cacheReadTokens?: number;
  iterations?: StreamedIteration[];
}

interface StreamedAnswer {
  textParts: string[];
  stopReason?: "end_turn" | "max_tokens" | "refusal";
  withTextBlock?: boolean;
  usage?: StreamedUsage;
}

function event(name: string, data: unknown): string {
  return `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
}

// The server-sent events the Messages API streams for one answer, as its documentation lists them.
function messagesStreamText({
  textParts,
  stopReason = "end_turn",
  withTextBlock = true,
  usage = {},
}: StreamedAnswer): string {
  const events = [
    event("message_start", {
      type: "message_start",
      message: {
        id: "msg_fictional_01",
        type: "message",
        role: "assistant",
        model: "claude-sonnet-5-5",
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: usage.inputTokens ?? 25, output_tokens: 1 },
      },
    }),
  ];
  if (withTextBlock) {
    events.push(
      event("content_block_start", {
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "" },
      }),
      event("ping", { type: "ping" }),
      ...textParts.map((text) =>
        event("content_block_delta", {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text },
        }),
      ),
      event("content_block_stop", { type: "content_block_stop", index: 0 }),
    );
  }
  events.push(
    event("message_delta", {
      type: "message_delta",
      delta: { stop_reason: stopReason, stop_sequence: null },
      usage: {
        output_tokens: usage.outputTokens ?? 40,
        ...(usage.cacheWriteTokens === undefined
          ? {}
          : { cache_creation_input_tokens: usage.cacheWriteTokens }),
        ...(usage.cacheReadTokens === undefined
          ? {}
          : { cache_read_input_tokens: usage.cacheReadTokens }),
        ...(usage.iterations === undefined ? {} : { iterations: usage.iterations }),
      },
    }),
    event("message_stop", { type: "message_stop" }),
  );
  return events.join("");
}

export function streamedAnswerResponse(answer: StreamedAnswer): Response {
  return new Response(messagesStreamText(answer), {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

export function streamedJsonResponse(value: unknown): Response {
  return streamedAnswerResponse({ textParts: [JSON.stringify(value)] });
}

export function streamInterruptedByErrorResponse(): Response {
  const started = messagesStreamText({ textParts: [] }).split("event: content_block_start")[0];
  return new Response(
    `${started}${event("error", {
      type: "error",
      error: { type: "overloaded_error", message: "Overloaded" },
    })}`,
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );
}

export function streamAbortedAfterItsStartResponse(
  signal: AbortSignal,
  onStarted: () => void,
): Response {
  const started = messagesStreamText({ textParts: [] }).split("event: content_block_start")[0];
  let pulls = 0;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(started));
      signal.addEventListener("abort", () =>
        controller.error(new DOMException("The operation was aborted", "AbortError")),
      );
    },
    pull(controller) {
      pulls += 1;
      if (pulls === 1) {
        controller.enqueue(new TextEncoder().encode(event("ping", { type: "ping" })));
      } else if (pulls === 2) {
        onStarted();
      }
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

export function streamEndingWithoutAMessageResponse(onEnd: () => void): Response {
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.close();
      onEnd();
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

export function apiErrorResponse(
  status: number,
  type: string,
  message = "The request was refused",
): Response {
  return new Response(JSON.stringify({ type: "error", error: { type, message } }), {
    status,
    headers: { "content-type": "application/json" },
  });
}
