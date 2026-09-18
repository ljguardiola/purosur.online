import { Info } from "lucide-react";
import { expect, expectTypeOf, test } from "vitest";
import { render } from "vitest-browser-react";
import { AA_TEXT_CONTRAST, contrastRatio } from "../styles/contrast";
import { expectNoAccessibilityViolations } from "../test/axe";
import { rgbToHex, tokenRgb } from "../test/token-colors";
import type { ButtonIcon } from "./Button";
import { HighlightedNotice, type HighlightedNoticeProps } from "./HighlightedNotice";
import type { NoticeTone } from "./InlineNotice";

type ToneTokens = { background: string; text: string };

const tones: Record<NoticeTone, ToneTokens> = {
  warning: { background: "status-warning-message-bg", text: "status-warning-strong" },
  info: { background: "brand-blue-message-bg", text: "brand-blue-strong" },
  error: { background: "status-error-message-bg", text: "status-error-strong" },
};

test("renders the caller's title, detail and icon", async () => {
  const screen = await render(
    <HighlightedNotice tone="error" icon={<Info />} title="Sale blocked" detail="Card declined" />,
  );

  // The visible paragraph is hidden from assistive technology (see the "exposes the notice's
  // text" test below), so this reads it directly instead of through a role query.
  const title = screen.container.querySelector("p") as HTMLElement;
  expect(title.textContent).toBe("Sale blocked");
  expect(screen.container.querySelector("svg")).not.toBeNull();
  await expectNoAccessibilityViolations(screen.container);
});

test("does not accept a highlighted notice without a title", () => {
  expectTypeOf<{
    tone: "error";
    icon: ButtonIcon;
    detail: string;
  }>().not.toExtend<HighlightedNoticeProps>();
});

test("does not accept a highlighted notice without a detail", () => {
  expectTypeOf<{
    tone: "error";
    icon: ButtonIcon;
    title: string;
  }>().not.toExtend<HighlightedNoticeProps>();
});

test("exposes the notice's text to assistive technology exactly once", async () => {
  const screen = await render(
    <HighlightedNotice tone="error" icon={<Info />} title="Sale blocked" detail="Card declined" />,
  );

  // getByRole walks the accessibility tree, which aria-hidden removes an element from: once the
  // visible title/detail are hidden from it, the live region is the only accessible copy left.
  expect(screen.getByRole("paragraph").elements()).toHaveLength(0);

  const region = screen.container.querySelector('[role="alert"]') as HTMLElement;
  await expect.poll(() => region.textContent).toBe("Sale blocked Card declined");

  await expectNoAccessibilityViolations(screen.container);
});

test("renders every tone's background, text and icon colors", async () => {
  for (const [tone, expected] of Object.entries(tones) as [NoticeTone, ToneTokens][]) {
    const screen = await render(
      <HighlightedNotice
        tone={tone}
        icon={<Info />}
        title={`Title ${tone}`}
        detail={`Detail ${tone}`}
      />,
    );
    const container = screen.container.firstElementChild as HTMLElement;
    const icon = container.querySelector("svg") as SVGSVGElement;
    const title = screen
      .getByText(`Title ${tone}`, { exact: true })
      .first()
      .element() as HTMLElement;
    const detail = screen
      .getByText(`Detail ${tone}`, { exact: true })
      .first()
      .element() as HTMLElement;

    expect(getComputedStyle(container).backgroundColor, `${tone} background`).toBe(
      tokenRgb(expected.background),
    );
    expect(getComputedStyle(icon).color, `${tone} icon`).toBe(tokenRgb(expected.text));
    expect(getComputedStyle(title).color, `${tone} title`).toBe(tokenRgb(expected.text));
    expect(getComputedStyle(detail).color, `${tone} detail`).toBe(tokenRgb(expected.text));

    await expectNoAccessibilityViolations(screen.container);
  }
});

test("keeps every tone's text readable against its own background", async () => {
  for (const [tone] of Object.entries(tones) as [NoticeTone, ToneTokens][]) {
    const screen = await render(
      <HighlightedNotice
        tone={tone}
        icon={<Info />}
        title={`Title ${tone}`}
        detail={`Detail ${tone}`}
      />,
    );
    const container = screen.container.firstElementChild as HTMLElement;
    const style = getComputedStyle(container);

    const ratio = contrastRatio(rgbToHex(style.color), rgbToHex(style.backgroundColor));
    expect(ratio, `${tone} contrast`).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);

    await expectNoAccessibilityViolations(screen.container);
  }
});

test("renders 16px padding on every side, a 20px icon and a 12px icon-to-text gap", async () => {
  const screen = await render(
    <HighlightedNotice tone="warning" icon={<Info />} title="Title" detail="Detail" />,
  );
  const container = screen.container.firstElementChild as HTMLElement;
  const style = getComputedStyle(container);

  expect(style.borderRadius).toBe("8px");
  expect(style.paddingTop).toBe("16px");
  expect(style.paddingBottom).toBe("16px");
  expect(style.paddingLeft).toBe("16px");
  expect(style.paddingRight).toBe("16px");

  const icon = container.querySelector("svg") as SVGSVGElement;
  const title = screen.getByText("Title", { exact: true }).first().element() as HTMLElement;
  const textStack = title.parentElement as HTMLElement;

  const iconRect = icon.getBoundingClientRect();
  const textRect = textStack.getBoundingClientRect();
  expect(iconRect.width).toBeGreaterThan(19);
  expect(iconRect.width).toBeLessThan(21);
  expect(iconRect.height).toBeGreaterThan(19);
  expect(iconRect.height).toBeLessThan(21);
  expect(textRect.left - iconRect.right).toBeGreaterThan(11);
  expect(textRect.left - iconRect.right).toBeLessThan(13);

  await expectNoAccessibilityViolations(screen.container);
});

test("stacks an 18px bold title and a 14px detail 4px apart", async () => {
  const screen = await render(
    <HighlightedNotice tone="warning" icon={<Info />} title="Title" detail="Detail" />,
  );
  const title = screen.getByText("Title", { exact: true }).first().element() as HTMLElement;
  const detail = screen.getByText("Detail", { exact: true }).first().element() as HTMLElement;
  const titleStyle = getComputedStyle(title);
  const detailStyle = getComputedStyle(detail);

  expect(titleStyle.fontSize).toBe("18px");
  expect(titleStyle.fontWeight).toBe("700");
  expect(detailStyle.fontSize).toBe("14px");

  const titleRect = title.getBoundingClientRect();
  const detailRect = detail.getBoundingClientRect();
  const gap = detailRect.top - titleRect.bottom;
  expect(gap).toBeGreaterThan(3);
  expect(gap).toBeLessThan(5);

  await expectNoAccessibilityViolations(screen.container);
});

test("announces an error notice right away, interrupting current speech", async () => {
  const screen = await render(
    <HighlightedNotice tone="error" icon={<Info />} title="Sale blocked" detail="Card declined" />,
  );

  const region = screen.container.querySelector('[role="alert"]') as HTMLElement;
  expect(region).not.toBeNull();

  await expect.poll(() => region.textContent).toContain("Sale blocked");
  await expect.poll(() => region.textContent).toContain("Card declined");
  await expectNoAccessibilityViolations(screen.container);
});

test("announces every other tone politely, after the current speech ends", async () => {
  for (const tone of ["warning", "info"] as const) {
    const screen = await render(
      <HighlightedNotice tone={tone} icon={<Info />} title="Heads up" detail="Check the totals" />,
    );

    expect(screen.container.querySelector('[role="alert"]')).toBeNull();
    const region = screen.container.querySelector('[role="status"]') as HTMLElement;
    expect(region).not.toBeNull();

    await expect.poll(() => region.textContent).toContain("Heads up");
    await expect.poll(() => region.textContent).toContain("Check the totals");
    await expectNoAccessibilityViolations(screen.container);
  }
});
