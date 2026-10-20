interface StreamedAnswer {
  textParts: string[];
  stopReason?: "end_turn" | "max_tokens" | "refusal";
  withTextBlock?: boolean;
}

function event(name: string, data: unknown): string {
  return `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
}

// The server-sent events the Messages API streams for one answer, as its documentation lists them.
function messagesStreamText({
  textParts,
  stopReason = "end_turn",
  withTextBlock = true,
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
        usage: { input_tokens: 25, output_tokens: 1 },
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
      usage: { output_tokens: 40 },
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
