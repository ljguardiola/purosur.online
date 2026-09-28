import { expect, expectTypeOf, test } from "vitest";
import { cdp } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { expectFullyRound } from "../../test/fully-round";
import { tokenRgb } from "../../test/token-colors";
import {
  StatusIndicator,
  type StatusIndicatorProps,
  type StatusIndicatorTone,
} from "./status-indicator";

type ToneTokens = { background: string; dot: string; text: string };

const tones: Record<StatusIndicatorTone, ToneTokens> = {
  success: { background: "success-subtle", dot: "success-soft", text: "success-strong" },
  warning: {
    background: "warning-subtle",
    dot: "warning-soft",
    text: "warning-strong",
  },
  error: {
    background: "error-subtle",
    dot: "error-soft",
    text: "error-strong",
  },
  info: { background: "info-subtle", dot: "info-soft", text: "info-strong" },
  neutral: { background: "neutral-subtle", dot: "neutral", text: "text-subtle" },
};

test("renders the caller's text", async () => {
  const screen = await render(<StatusIndicator tone="success">Connected</StatusIndicator>);

  await expect.element(screen.getByText("Connected")).toBeVisible();
});

test("renders the pill's fixed shape regardless of tone", async () => {
  const screen = await render(<StatusIndicator tone="info">Shape</StatusIndicator>);
  const pill = screen.container.firstElementChild as HTMLElement;
  const style = getComputedStyle(pill);

  expect(style.display).toBe("inline-flex");
  expect(style.alignItems).toBe("center");
  expect(style.height).toBe("28px");
  expectFullyRound(pill);
  expect(style.paddingTop).toBe("0px");
  expect(style.paddingBottom).toBe("0px");
  expect(style.paddingLeft).toBe("12px");
  expect(style.paddingRight).toBe("12px");
  expect(style.gap).toBe("8px");
  expect(style.fontSize).toBe("14px");
  expect(style.fontWeight).toBe("600");
});

test("renders every tone's background, dot and text colors", async () => {
  for (const [tone, expected] of Object.entries(tones) as [StatusIndicatorTone, ToneTokens][]) {
    const screen = await render(<StatusIndicator tone={tone}>State {tone}</StatusIndicator>);
    const pill = screen.container.firstElementChild as HTMLElement;
    const dot = pill.firstElementChild as HTMLElement;

    expect(getComputedStyle(pill).backgroundColor, `${tone} background`).toBe(
      tokenRgb(expected.background),
    );
    expect(getComputedStyle(pill).color, `${tone} text`).toBe(tokenRgb(expected.text));
    expect(getComputedStyle(dot).backgroundColor, `${tone} dot`).toBe(tokenRgb(expected.dot));
    expect(dot.getAttribute("aria-hidden"), `${tone} dot is decorative`).toBe("true");
  }
});

test("renders an 8px dot when not busy", async () => {
  const screen = await render(<StatusIndicator tone="success">Ready</StatusIndicator>);
  const dot = (screen.container.firstElementChild as HTMLElement).firstElementChild as HTMLElement;
  const rect = dot.getBoundingClientRect();

  expect(dot.tagName).toBe("SPAN");
  expect(rect.width).toBeGreaterThan(7);
  expect(rect.width).toBeLessThan(9);
  expect(rect.height).toBeGreaterThan(7);
  expect(rect.height).toBeLessThan(9);
});

test("replaces the dot with a 14px spinner in the tone's dot color while busy", async () => {
  const screen = await render(
    <StatusIndicator tone="warning" busy>
      Weighing
    </StatusIndicator>,
  );
  const pill = screen.container.firstElementChild as HTMLElement;
  const spinner = pill.firstElementChild as HTMLElement;
  const rect = spinner.getBoundingClientRect();

  expect(spinner.tagName).toBe("svg");
  expect(spinner.getAttribute("aria-hidden")).toBe("true");
  expect(rect.width).toBeGreaterThan(13);
  expect(rect.width).toBeLessThan(15);
  expect(rect.height).toBeGreaterThan(13);
  expect(rect.height).toBeLessThan(15);
  expect(getComputedStyle(spinner).color).toBe(tokenRgb("warning-soft"));
  expect(getComputedStyle(spinner).animationName).not.toBe("none");

  await expectNoAccessibilityViolations(screen.container);
});

test("stops the spinner from moving when the system asks for reduced motion", async () => {
  const session = cdp();
  await session.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });

  try {
    const screen = await render(
      <StatusIndicator tone="info" busy>
        Syncing
      </StatusIndicator>,
    );
    const spinner = (screen.container.firstElementChild as HTMLElement)
      .firstElementChild as HTMLElement;

    await expect.poll(() => getComputedStyle(spinner).animationName).toBe("none");

    await expectNoAccessibilityViolations(screen.container);
  } finally {
    await session.send("Emulation.setEmulatedMedia", { features: [] });
  }
});

test("does not accept a status indicator without text", () => {
  expectTypeOf<{ tone: "success" }>().not.toExtend<StatusIndicatorProps>();
});

test("does not accept a status indicator without a tone", () => {
  expectTypeOf<{ children: string }>().not.toExtend<StatusIndicatorProps>();
});
