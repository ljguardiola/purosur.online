import type { BrowserOptions } from "@sentry/browser";
import { describe, expect, it, vi } from "vitest";
import { startSentryReporting } from "./sentry-browser";

const configuration = {
  enabled: true,
  dsn: "https://key@errors.example.test/1",
  environment: "staging",
  release: "abc1234",
} as const;

function startWithFakeSentry() {
  const init = vi.fn();
  const captureException = vi.fn();
  const breadcrumbsIntegration = vi.fn((settings?: object) => ({
    name: "Breadcrumbs" as const,
    settings,
  }));
  const send = startSentryReporting(configuration, {
    init,
    captureException,
    breadcrumbsIntegration,
  });
  const options = init.mock.calls[0]?.[0] as BrowserOptions;
  return { init, captureException, breadcrumbsIntegration, send, options };
}

describe("startSentryReporting", () => {
  it("tags every report with the deployed version and the environment", () => {
    const { options } = startWithFakeSentry();

    expect(options).toMatchObject({
      dsn: configuration.dsn,
      environment: "staging",
      release: "abc1234",
    });
  });

  it("sends no personal data by default and takes no traces or session replays", () => {
    const { options } = startWithFakeSentry();

    expect(options.sendDefaultPii).toBe(false);
    expect(options.tracesSampleRate).toBeUndefined();
    expect(options.replaysSessionSampleRate).toBeUndefined();
    expect(options.replaysOnErrorSampleRate).toBeUndefined();
  });

  it("records no clicks or key presses, whose element labels can hold personal data", () => {
    const { options } = startWithFakeSentry();

    expect(options.integrations).toContainEqual({
      name: "Breadcrumbs",
      settings: { dom: false },
    });
  });

  it("hands the errors it is given to the reporting library", () => {
    const { send, captureException } = startWithFakeSentry();
    const failure = new Error("screen failed");

    send(failure);

    expect(captureException).toHaveBeenCalledWith(failure);
  });

  it("scrubs a report shaped like the ones a browser produces before it leaves", async () => {
    const { options } = startWithFakeSentry();
    const event = {
      exception: {
        values: [{ type: "Error", value: "GET /users?email=ana@example.test failed" }],
      },
      request: {
        url: "https://backoffice.example.test/users?email=ana@example.test",
        headers: { Cookie: "session=secret", "User-Agent": "Mozilla/5.0" },
      },
      contexts: { culture: { locale: "es-AR" }, response: { status_code: 500 } },
      breadcrumbs: [
        {
          category: "fetch",
          data: { url: "/users?email=ana@example.test", method: "GET", status_code: 500 },
        },
        {
          category: "navigation",
          data: { from: "/catalog?q=alfajor", to: "/users/7f3a?tab=access#token=abc" },
        },
        { category: "ui.click", message: "body > div#root > button.save" },
      ],
    };

    const scrubbed = await options.beforeSend?.(event as never, {});

    expect(scrubbed).toMatchObject({
      exception: { values: [{ value: "GET /users?[redacted] failed" }] },
      contexts: { culture: { locale: "es-AR" } },
      breadcrumbs: [
        { data: { url: "/users?[redacted]", method: "GET", status_code: 500 } },
        { data: { from: "/catalog?[redacted]", to: "/users/7f3a?[redacted]" } },
        { message: "body > div#root > button.save" },
      ],
    });
    expect(scrubbed).not.toHaveProperty("request");
    expect(scrubbed).not.toHaveProperty("contexts.response");
    expect(JSON.stringify(scrubbed)).not.toContain("ana@example.test");
  });
});
