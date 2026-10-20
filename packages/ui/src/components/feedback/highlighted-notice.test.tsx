import { Info, X } from "lucide-react";
import { expect, expectTypeOf, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { AA_TEXT_CONTRAST, contrastRatio } from "../../styles/contrast";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { rgbToHex, tokenRgb } from "../../test/token-colors";
import { Button } from "../forms/button";
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

function noticeWithAction(onPress: () => void = () => {}) {
  return (
    <HighlightedNotice
      tone="error"
      icon={<Info />}
      title="Sale open"
      description="Cancel it to close"
      actions={
        <Button variant="secondary" icon={<X />} onPress={onPress}>
          Cancel the sale
        </Button>
      }
    />
  );
}

test("places the action 12px below the text, aligned with its left edge", async () => {
  const screen = await render(noticeWithAction());
  const title = screen.getByText("Sale open", { exact: true }).first().element() as HTMLElement;
  const textStack = title.parentElement as HTMLElement;
  const button = screen.getByRole("button", { name: "Cancel the sale" }).element();

  const textRect = textStack.getBoundingClientRect();
  const buttonRect = button.getBoundingClientRect();
  expect(buttonRect.top - textRect.bottom).toBeGreaterThan(11);
  expect(buttonRect.top - textRect.bottom).toBeLessThan(13);
  expect(buttonRect.left).toBe(textRect.left);
});

test("keeps the action inside the notice's box", async () => {
  const screen = await render(noticeWithAction());
  const notice = screen.container.firstElementChild as HTMLElement;
  const button = screen.getByRole("button", { name: "Cancel the sale" }).element();

  const noticeRect = notice.getBoundingClientRect();
  const buttonRect = button.getBoundingClientRect();
  expect(buttonRect.bottom).toBeLessThanOrEqual(noticeRect.bottom - 15);
  expect(buttonRect.right).toBeLessThanOrEqual(noticeRect.right);
});

test("lets the action be found by role and pressed", async () => {
  const onPress = vi.fn();
  const screen = await render(noticeWithAction(onPress));

  await screen.getByRole("button", { name: "Cancel the sale" }).click();

  expect(onPress).toHaveBeenCalledTimes(1);
});

test("still exposes the notice's text exactly once when it has an action", async () => {
  const screen = await render(noticeWithAction());

  expect(screen.getByRole("paragraph").elements()).toHaveLength(0);
  const region = screen.container.querySelector('[role="alert"]') as HTMLElement;
  await expect.poll(() => region.textContent).toBe("Sale open Cancel it to close");
});

test("renders no row for actions when none are given", async () => {
  const noActions: ReadonlyArray<[string, Partial<HighlightedNoticeProps>]> = [
    ["omitted", {}],
    ["undefined", { actions: undefined }],
    ["null", { actions: null }],
    ["false", { actions: false }],
  ];

  for (const [label, props] of noActions) {
    const screen = await render(
      <HighlightedNotice
        tone="error"
        icon={<Info />}
        title="Title"
        description="Detail"
        {...props}
      />,
    );
    const notice = screen.container.firstElementChild as HTMLElement;

    expect(notice.querySelector("button"), `${label} button`).toBeNull();
    expect(notice.querySelector(".flex-wrap"), `${label} row`).toBeNull();
  }
});

test("has no accessibility violations with an action", async () => {
  const screen = await render(noticeWithAction());

  await expectNoAccessibilityViolations(screen.container);
});

test("accepts actions that are explicitly undefined", () => {
  expectTypeOf<{
    tone: "error";
    icon: Icon;
    title: string;
    description: string;
    actions: undefined;
  }>().toExtend<HighlightedNoticeProps>();
});

function rowNotice() {
  return (
    <HighlightedNotice
      tone="error"
      layout="row"
      icon={<Info />}
      title="Sale open"
      description="Cancel it to close"
      actions={
        <Button variant="secondary" icon={<X />}>
          Cancel the sale
        </Button>
      }
    />
  );
}

async function rowParts(screen: Awaited<ReturnType<typeof render>>) {
  const notice = screen.container.firstElementChild as HTMLElement;
  const title = screen.getByText("Sale open", { exact: true }).first().element() as HTMLElement;
  const description = screen
    .getByText("Cancel it to close", { exact: true })
    .first()
    .element() as HTMLElement;
  return {
    notice,
    icon: notice.querySelector("svg") as SVGSVGElement,
    title,
    description,
    textStack: title.parentElement as HTMLElement,
    button: screen.getByRole("button", { name: "Cancel the sale" }).element() as HTMLElement,
  };
}

const centerY = (element: Element) => {
  const rect = element.getBoundingClientRect();
  return (rect.top + rect.bottom) / 2;
};

test("places the action at the end of the same row, right of the text", async () => {
  const screen = await render(rowNotice());
  const { notice, textStack, button } = await rowParts(screen);

  const textRect = textStack.getBoundingClientRect();
  const buttonRect = button.getBoundingClientRect();
  const noticeRect = notice.getBoundingClientRect();
  expect(buttonRect.left).toBeGreaterThanOrEqual(textRect.right);
  expect(buttonRect.top).toBeLessThan(textRect.bottom);
  expect(noticeRect.right - buttonRect.right).toBeGreaterThan(15);
  expect(noticeRect.right - buttonRect.right).toBeLessThan(17);
});

test("centers the icon, the text and the action vertically in the row layout", async () => {
  const screen = await render(rowNotice());
  const { icon, textStack, button } = await rowParts(screen);

  expect(Math.abs(centerY(icon) - centerY(button))).toBeLessThan(1);
  expect(Math.abs(centerY(textStack) - centerY(button))).toBeLessThan(1);
});

test("separates the icon, the text and the action by 16px in the row layout", async () => {
  const screen = await render(rowNotice());
  const { icon, textStack, button } = await rowParts(screen);

  const iconRect = icon.getBoundingClientRect();
  const textRect = textStack.getBoundingClientRect();
  const buttonRect = button.getBoundingClientRect();
  expect(textRect.left - iconRect.right).toBeGreaterThan(15);
  expect(textRect.left - iconRect.right).toBeLessThan(17);
  expect(buttonRect.left - textRect.right).toBeGreaterThan(15);
  expect(buttonRect.left - textRect.right).toBeLessThan(17);
});

test("renders a 16px bold title in the tone's strong color and a 14px description in the text color in the row layout", async () => {
  const screen = await render(rowNotice());
  const { title, description, icon } = await rowParts(screen);

  expect(getComputedStyle(title).fontSize).toBe("16px");
  expect(getComputedStyle(title).fontWeight).toBe("700");
  expect(getComputedStyle(title).color).toBe(tokenRgb("error-strong"));
  expect(getComputedStyle(description).fontSize).toBe("14px");
  expect(getComputedStyle(description).color).toBe(tokenRgb("text"));
  expect(getComputedStyle(icon).color).toBe(tokenRgb("error-strong"));
});

test("keeps the 4px gap between the title and the description in the row layout", async () => {
  const screen = await render(rowNotice());
  const { title, description } = await rowParts(screen);

  const gap = description.getBoundingClientRect().top - title.getBoundingClientRect().bottom;
  expect(gap).toBeGreaterThan(3);
  expect(gap).toBeLessThan(5);
});

test("still exposes the notice's text exactly once in the row layout", async () => {
  const screen = await render(rowNotice());

  expect(screen.getByRole("paragraph").elements()).toHaveLength(0);
  const region = screen.container.querySelector('[role="alert"]') as HTMLElement;
  await expect.poll(() => region.textContent).toBe("Sale open Cancel it to close");
});

test("has no accessibility violations in the row layout", async () => {
  const screen = await render(rowNotice());

  await expectNoAccessibilityViolations(screen.container);
});

test("moves the action below the text when the row is too narrow to keep the text readable", async () => {
  const screen = await render(<div style={{ width: 320 }}>{rowNotice()}</div>);
  const title = screen.getByText("Sale open", { exact: true }).first().element() as HTMLElement;
  const textStack = title.parentElement as HTMLElement;
  const button = screen.getByRole("button", { name: "Cancel the sale" }).element();

  const textRect = textStack.getBoundingClientRect();
  expect(textRect.width).toBeGreaterThanOrEqual(128);
  expect(button.getBoundingClientRect().top).toBeGreaterThanOrEqual(textRect.bottom);
});
