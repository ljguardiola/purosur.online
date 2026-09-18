import { Info } from "lucide-react";
import { expect, expectTypeOf, test } from "vitest";
import { render } from "vitest-browser-react";
import { AA_TEXT_CONTRAST, contrastRatio } from "../styles/contrast";
import { expectNoAccessibilityViolations } from "../test/axe";
import { rgbToHex, tokenRgb } from "../test/token-colors";
import type { ButtonIcon } from "./Button";
import { InlineNotice, type InlineNoticeProps, type NoticeTone } from "./InlineNotice";

type ToneTokens = { background: string; text: string };

const tones: Record<NoticeTone, ToneTokens> = {
  warning: { background: "status-warning-message-bg", text: "status-warning-strong" },
  info: { background: "brand-blue-message-bg", text: "brand-blue-strong" },
  error: { background: "status-error-message-bg", text: "status-error-strong" },
};

test("renders the caller's title, detail and icon", async () => {
  const screen = await render(
    <InlineNotice tone="info" icon={<Info />} title="Draft saved" detail="Nothing to sync yet" />,
  );

  await expect.element(screen.getByText("Draft saved", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("Nothing to sync yet", { exact: true })).toBeVisible();
  expect(screen.container.querySelector("svg")).not.toBeNull();
  await expectNoAccessibilityViolations(screen.container);
});

test("renders with only a title", async () => {
  const screen = await render(<InlineNotice tone="info" icon={<Info />} title="Draft saved" />);

  // The visible paragraph is hidden from assistive technology (see the "exposes the notice's
  // text" test below), so this reads it directly instead of through a role query.
  const paragraph = screen.container.querySelector("p") as HTMLElement;
  expect(paragraph.textContent).toBe("Draft saved");
  await expectNoAccessibilityViolations(screen.container);
});

test("renders with only a detail", async () => {
  const screen = await render(
    <InlineNotice tone="info" icon={<Info />} detail="Nothing to sync yet" />,
  );

  const paragraph = screen.container.querySelector("p") as HTMLElement;
  expect(paragraph.textContent).toBe("Nothing to sync yet");
  await expectNoAccessibilityViolations(screen.container);
});

test("does not accept an inline notice without a title or a detail", () => {
  expectTypeOf<{ tone: "info"; icon: ButtonIcon }>().not.toExtend<InlineNoticeProps>();
});

test("exposes the notice's text to assistive technology exactly once", async () => {
  const screen = await render(
    <InlineNotice tone="info" icon={<Info />} title="Draft saved" detail="Nothing to sync yet" />,
  );

  // getByRole walks the accessibility tree, which aria-hidden removes an element from: once the
  // visible title/detail are hidden from it, the live region is the only accessible copy left.
  expect(screen.getByRole("paragraph").elements()).toHaveLength(0);

  const region = screen.container.querySelector('[role="status"]') as HTMLElement;
  await expect.poll(() => region.textContent).toBe("Draft saved Nothing to sync yet");

  await expectNoAccessibilityViolations(screen.container);
});

test("renders every tone's background, text and icon colors", async () => {
  for (const [tone, expected] of Object.entries(tones) as [NoticeTone, ToneTokens][]) {
    const screen = await render(
      <InlineNotice
        tone={tone}
        icon={<Info />}
        title={`Title ${tone}`}
        detail={`Detail ${tone}`}
      />,
    );
    const container = screen.container.firstElementChild as HTMLElement;
    const icon = container.querySelector("svg") as SVGSVGElement;
    const title = screen.getByText(`Title ${tone}`, { exact: true }).element() as HTMLElement;
    const detail = screen.getByText(`Detail ${tone}`, { exact: true }).element() as HTMLElement;

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
  for (const tone of Object.keys(tones) as NoticeTone[]) {
    const screen = await render(
      <InlineNotice
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

test("renders the design's fixed layout regardless of tone", async () => {
  const screen = await render(
    <InlineNotice tone="warning" icon={<Info />} title="Title" detail="Detail" />,
  );
  const container = screen.container.firstElementChild as HTMLElement;
  const style = getComputedStyle(container);

  expect(style.borderRadius).toBe("8px");
  expect(style.paddingTop).toBe("12px");
  expect(style.paddingBottom).toBe("12px");
  expect(style.paddingLeft).toBe("16px");
  expect(style.paddingRight).toBe("16px");

  const icon = container.querySelector("svg") as SVGSVGElement;
  const title = screen.getByText("Title", { exact: true }).element() as HTMLElement;
  const textStack = title.parentElement as HTMLElement;

  const iconRect = icon.getBoundingClientRect();
  const textRect = textStack.getBoundingClientRect();
  expect(iconRect.width).toBeGreaterThan(17);
  expect(iconRect.width).toBeLessThan(19);
  expect(iconRect.height).toBeGreaterThan(17);
  expect(iconRect.height).toBeLessThan(19);
  expect(textRect.left - iconRect.right).toBeGreaterThan(11);
  expect(textRect.left - iconRect.right).toBeLessThan(13);

  await expectNoAccessibilityViolations(screen.container);
});

test("stacks the title and detail 4px apart, in a 16px bold title and a 14px detail with 1.35 line height", async () => {
  const screen = await render(
    <InlineNotice tone="warning" icon={<Info />} title="Title" detail="Detail" />,
  );
  const title = screen.getByText("Title", { exact: true }).element() as HTMLElement;
  const detail = screen.getByText("Detail", { exact: true }).element() as HTMLElement;
  const titleStyle = getComputedStyle(title);
  const detailStyle = getComputedStyle(detail);

  expect(titleStyle.fontSize).toBe("16px");
  expect(titleStyle.fontWeight).toBe("700");
  expect(detailStyle.fontSize).toBe("14px");
  expect(detailStyle.lineHeight).toBe("18.9px");

  const titleRect = title.getBoundingClientRect();
  const detailRect = detail.getBoundingClientRect();
  const gap = detailRect.top - titleRect.bottom;
  expect(gap).toBeGreaterThan(3);
  expect(gap).toBeLessThan(5);

  await expectNoAccessibilityViolations(screen.container);
});

test("takes the width of its container", async () => {
  const screen = await render(
    <div style={{ width: "500px" }}>
      <InlineNotice tone="info" icon={<Info />} title="Title" />
    </div>,
  );
  const container = screen.container.firstElementChild?.firstElementChild as HTMLElement;

  expect(container.getBoundingClientRect().width).toBeCloseTo(500, 0);
  await expectNoAccessibilityViolations(screen.container);
});

test("announces an error notice right away, interrupting current speech", async () => {
  const screen = await render(
    <InlineNotice tone="error" icon={<Info />} title="Can't save" detail="Try again" />,
  );

  const region = screen.container.querySelector('[role="alert"]') as HTMLElement;
  expect(region).not.toBeNull();

  await expect.poll(() => region.textContent).toContain("Can't save");
  await expect.poll(() => region.textContent).toContain("Try again");
  await expectNoAccessibilityViolations(screen.container);
});

test("announces every other tone politely, after the current speech ends", async () => {
  for (const tone of ["warning", "info"] as const) {
    const screen = await render(
      <InlineNotice tone={tone} icon={<Info />} title="Heads up" detail="Check the totals" />,
    );

    expect(screen.container.querySelector('[role="alert"]')).toBeNull();
    const region = screen.container.querySelector('[role="status"]') as HTMLElement;
    expect(region).not.toBeNull();

    await expect.poll(() => region.textContent).toContain("Heads up");
    await expect.poll(() => region.textContent).toContain("Check the totals");
    await expectNoAccessibilityViolations(screen.container);
  }
});
