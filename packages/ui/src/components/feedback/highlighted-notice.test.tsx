import { Info } from "lucide-react";
import { expect, expectTypeOf, test } from "vitest";
import { render } from "vitest-browser-react";
import { AA_TEXT_CONTRAST, contrastRatio } from "../../styles/contrast";
import { rgbToHex, tokenRgb } from "../../test/token-colors";
import type { Icon } from "../shared/icon";
import type { NoticeTone } from "../shared/tone";
import { HighlightedNotice, type HighlightedNoticeProps } from "./highlighted-notice";

type ToneTokens = { background: string; text: string };

const tones: Record<NoticeTone, ToneTokens> = {
  warning: { background: "warning-subtle", text: "warning-strong" },
  info: { background: "info-subtle", text: "info-strong" },
  success: { background: "success-subtle", text: "success-strong" },
  error: { background: "error-subtle", text: "error-strong" },
};

test("renders the caller's title, description and icon", async () => {
  const screen = await render(
    <HighlightedNotice
      tone="error"
      icon={<Info />}
      title="Sale blocked"
      description="Card declined"
    />,
  );

  // The paragraph is aria-hidden, so a role query wouldn't find it; read it directly instead.
  const title = screen.container.querySelector("p") as HTMLElement;
  expect(title.textContent).toBe("Sale blocked");
  expect(screen.container.querySelector("svg")).not.toBeNull();
});

test("does not accept a highlighted notice without a title", () => {
  expectTypeOf<{
    tone: "error";
    icon: Icon;
    description: string;
  }>().not.toExtend<HighlightedNoticeProps>();
});

test("does not accept a highlighted notice without a description", () => {
  expectTypeOf<{
    tone: "error";
    icon: Icon;
    title: string;
  }>().not.toExtend<HighlightedNoticeProps>();
});

test("exposes the notice's text to assistive technology exactly once", async () => {
  const screen = await render(
    <HighlightedNotice
      tone="error"
      icon={<Info />}
      title="Sale blocked"
      description="Card declined"
    />,
  );

  // aria-hidden removes an element from the accessibility tree that getByRole walks.
  expect(screen.getByRole("paragraph").elements()).toHaveLength(0);

  const region = screen.container.querySelector('[role="alert"]') as HTMLElement;
  await expect.poll(() => region.textContent).toBe("Sale blocked Card declined");
});

test("renders every tone's background, text and icon colors", async () => {
  for (const [tone, expected] of Object.entries(tones) as [NoticeTone, ToneTokens][]) {
    const screen = await render(
      <HighlightedNotice
        tone={tone}
        icon={<Info />}
        title={`Title ${tone}`}
        description={`Detail ${tone}`}
      />,
    );
    const container = screen.container.firstElementChild as HTMLElement;
    const icon = container.querySelector("svg") as SVGSVGElement;
    const title = screen
      .getByText(`Title ${tone}`, { exact: true })
      .first()
      .element() as HTMLElement;
    const description = screen
      .getByText(`Detail ${tone}`, { exact: true })
      .first()
      .element() as HTMLElement;

    expect(getComputedStyle(container).backgroundColor, `${tone} background`).toBe(
      tokenRgb(expected.background),
    );
    expect(getComputedStyle(icon).color, `${tone} icon`).toBe(tokenRgb(expected.text));
    expect(getComputedStyle(title).color, `${tone} title`).toBe(tokenRgb(expected.text));
    expect(getComputedStyle(description).color, `${tone} description`).toBe(
      tokenRgb(expected.text),
    );
  }
});

test("keeps every tone's text readable against its own background", async () => {
  for (const [tone] of Object.entries(tones) as [NoticeTone, ToneTokens][]) {
    const screen = await render(
      <HighlightedNotice
        tone={tone}
        icon={<Info />}
        title={`Title ${tone}`}
        description={`Detail ${tone}`}
      />,
    );
    const container = screen.container.firstElementChild as HTMLElement;
    const style = getComputedStyle(container);

    const ratio = contrastRatio(rgbToHex(style.color), rgbToHex(style.backgroundColor));
    expect(ratio, `${tone} contrast`).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);
  }
});

test("renders 16px padding on every side, a 20px icon and a 12px icon-to-text gap", async () => {
  const screen = await render(
    <HighlightedNotice tone="warning" icon={<Info />} title="Title" description="Detail" />,
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
});

test("stacks an 18px bold title and a 14px description 4px apart", async () => {
  const screen = await render(
    <HighlightedNotice tone="warning" icon={<Info />} title="Title" description="Detail" />,
  );
  const title = screen.getByText("Title", { exact: true }).first().element() as HTMLElement;
  const description = screen.getByText("Detail", { exact: true }).first().element() as HTMLElement;
  const titleStyle = getComputedStyle(title);
  const descriptionStyle = getComputedStyle(description);

  expect(titleStyle.fontSize).toBe("18px");
  expect(titleStyle.fontWeight).toBe("700");
  expect(descriptionStyle.fontSize).toBe("14px");

  const titleRect = title.getBoundingClientRect();
  const descriptionRect = description.getBoundingClientRect();
  const gap = descriptionRect.top - titleRect.bottom;
  expect(gap).toBeGreaterThan(3);
  expect(gap).toBeLessThan(5);
});

test("announces an error notice right away, interrupting current speech", async () => {
  const screen = await render(
    <HighlightedNotice
      tone="error"
      icon={<Info />}
      title="Sale blocked"
      description="Card declined"
    />,
  );

  const region = screen.container.querySelector('[role="alert"]') as HTMLElement;
  expect(region).not.toBeNull();

  await expect.poll(() => region.textContent).toContain("Sale blocked");
  await expect.poll(() => region.textContent).toContain("Card declined");
});

test("announces every other tone politely, after the current speech ends", async () => {
  for (const tone of ["warning", "info"] as const) {
    const screen = await render(
      <HighlightedNotice
        tone={tone}
        icon={<Info />}
        title="Heads up"
        description="Check the totals"
      />,
    );

    expect(screen.container.querySelector('[role="alert"]')).toBeNull();
    const region = screen.container.querySelector('[role="status"]') as HTMLElement;
    expect(region).not.toBeNull();

    await expect.poll(() => region.textContent).toContain("Heads up");
    await expect.poll(() => region.textContent).toContain("Check the totals");
  }
});

test("does not name its secondary text detail", () => {
  expectTypeOf<HighlightedNoticeProps>().not.toHaveProperty("detail");
});
