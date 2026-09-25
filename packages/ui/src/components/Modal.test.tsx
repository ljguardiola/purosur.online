import { AlertTriangle, CheckCircle, Info } from "lucide-react";
import { useState } from "react";
import { beforeEach, expect, expectTypeOf, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../test/axe";
import { tokenBackgroundColor, tokenRgb } from "../test/token-colors";
import { Button } from "./Button";
import { Modal, type ModalProps, type ModalWidth } from "./Modal";

// The default browser-mode viewport is phone-sized and narrower than the panel's own widest
// design value (720px), which would leave the close button permanently outside it (a fixed,
// centered element can't be scrolled into view). This package targets desktop POS displays, so
// every test in this file runs at a desktop-sized viewport instead.
beforeEach(async () => {
  await page.viewport(1280, 900);
});

// react-aria-components portals a modal's whole DOM into document.body, outside vitest-browser-
// react's own render container, so an accessibility check scoped to `screen.container` audits an
// empty placeholder and always passes regardless of what the modal actually renders. document.body
// holds everything a test cares about: the portaled dialog, and any non-portaled markup (a trigger
// button, a Harness) rendered alongside it. Every test in this file that renders a modal audits
// document.body for exactly this reason.

// The helper supplies every field a real caller must pass, so a test only overrides what it is
// checking. `footer` defaults to an empty span since most tests don't assert on it directly.
function baseProps(overrides: Partial<ModalProps> = {}): ModalProps {
  return {
    isOpen: true,
    onOpenChange: () => {},
    tone: "info",
    icon: <Info />,
    title: "Void the sale",
    footer: <span />,
    children: "Body content",
    ...overrides,
  } as ModalProps;
}

const widths: Record<ModalWidth, number> = {
  confirmation: 560,
  standard: 640,
  wide: 720,
  editor: 1040,
};

test("renders each width in the design's scale", async () => {
  for (const [width, px] of Object.entries(widths) as [ModalWidth, number][]) {
    const screen = await render(<Modal {...baseProps({ width })} />);
    const panel = screen.getByRole("dialog").element().parentElement as HTMLElement;

    const rect = panel.getBoundingClientRect();
    expect(rect.width, `${width} width`).toBeGreaterThan(px - 1);
    expect(rect.width, `${width} width`).toBeLessThan(px + 1);

    await expectNoAccessibilityViolations(document.body);
    await screen.unmount();
  }
});

test("defaults to the standard 640px width when none is given", async () => {
  const screen = await render(<Modal {...baseProps()} />);
  const panel = screen.getByRole("dialog").element().parentElement as HTMLElement;

  const rect = panel.getBoundingClientRect();
  expect(rect.width).toBeGreaterThan(639);
  expect(rect.width).toBeLessThan(641);

  await expectNoAccessibilityViolations(document.body);
});

test("gives the panel a white background, 12px radius and the design's shadow", async () => {
  const screen = await render(<Modal {...baseProps()} />);
  const panel = screen.getByRole("dialog").element().parentElement as HTMLElement;
  const style = getComputedStyle(panel);

  expect(style.backgroundColor).toBe(tokenRgb("surface-white"));
  expect(style.borderRadius).toBe("12px");
  expect(style.boxShadow).toContain("24px 64px");
  expect(style.boxShadow).toContain(tokenBackgroundColor("ink-panel-shadow"));

  await expectNoAccessibilityViolations(document.body);
});

test("covers the viewport with a backdrop in ink at 50% opacity", async () => {
  await render(<Modal {...baseProps()} />);
  const backdrop = document.querySelector('[class*="bg-ink-backdrop"]') as HTMLElement;

  expect(backdrop).not.toBeNull();
  const style = getComputedStyle(backdrop);
  expect(style.backgroundColor).toBe(tokenBackgroundColor("ink-backdrop"));
  const rect = backdrop.getBoundingClientRect();
  expect(rect.width).toBeGreaterThan(0);
  expect(rect.height).toBeGreaterThan(0);

  await expectNoAccessibilityViolations(document.body);
});

test("stays above page content that has its own stacking order", async () => {
  const fixedBar = document.createElement("div");
  fixedBar.style.cssText = "position: fixed; inset: 0; z-index: 10; background: white;";
  document.body.appendChild(fixedBar);

  try {
    await render(<Modal {...baseProps()} />);
    const dialog = page.getByRole("dialog").element() as HTMLElement;
    const rect = dialog.getBoundingClientRect();
    // An open modal makes everything outside it inert, and hit testing skips inert elements, so
    // the bar is made hittable again to find out what is actually painted on top.
    fixedBar.inert = false;
    fixedBar.removeAttribute("aria-hidden");
    const topmost = document.elementFromPoint(rect.left + rect.width / 2, rect.top + 8);

    expect(dialog.contains(topmost)).toBe(true);
    await expectNoAccessibilityViolations(document.body);
  } finally {
    fixedBar.remove();
  }
});

const tones: {
  tone: ModalProps["tone"];
  boxBg: string;
  strong: string;
}[] = [
  { tone: "info", boxBg: "brand-blue-message-bg", strong: "brand-blue-strong" },
  { tone: "success", boxBg: "brand-green-message-bg", strong: "brand-green-strong" },
  { tone: "warning", boxBg: "status-warning-message-bg", strong: "status-warning-strong" },
  { tone: "error", boxBg: "status-error-message-bg", strong: "status-error-strong" },
];

test("colors the icon box and title with each tone's background and strong color", async () => {
  for (const { tone, boxBg, strong } of tones) {
    const screen = await render(
      <Modal {...baseProps({ tone, icon: <CheckCircle />, title: `${tone} title` })} />,
    );
    const dialog = screen.getByRole("dialog").element() as HTMLElement;
    const iconBox = dialog.querySelector('[aria-hidden="true"]') as HTMLElement;
    const icon = iconBox.querySelector("svg") as SVGSVGElement;
    const title = screen.getByText(`${tone} title`, { exact: true }).element() as HTMLElement;

    expect(getComputedStyle(iconBox).backgroundColor, `${tone} icon box background`).toBe(
      tokenRgb(boxBg),
    );
    expect(getComputedStyle(iconBox).color, `${tone} icon box color`).toBe(tokenRgb(strong));
    expect(getComputedStyle(icon).color, `${tone} icon color`).toBe(tokenRgb(strong));
    expect(getComputedStyle(title).color, `${tone} title color`).toBe(tokenRgb(strong));

    await expectNoAccessibilityViolations(document.body);
    await screen.unmount();
  }
});

test("renders the icon box at 48px with a 12px radius and the icon at 24px", async () => {
  const screen = await render(<Modal {...baseProps({ icon: <CheckCircle /> })} />);
  const dialog = screen.getByRole("dialog").element() as HTMLElement;
  const iconBox = dialog.querySelector('[aria-hidden="true"]') as HTMLElement;
  const icon = iconBox.querySelector("svg") as SVGSVGElement;

  const boxRect = iconBox.getBoundingClientRect();
  expect(boxRect.width).toBeGreaterThan(47);
  expect(boxRect.width).toBeLessThan(49);
  expect(boxRect.height).toBeGreaterThan(47);
  expect(boxRect.height).toBeLessThan(49);
  expect(getComputedStyle(iconBox).borderRadius).toBe("12px");

  const iconRect = icon.getBoundingClientRect();
  expect(iconRect.width).toBeGreaterThan(23);
  expect(iconRect.width).toBeLessThan(25);

  await expectNoAccessibilityViolations(document.body);
});

test("shows a context line in bold uppercase earth-ui by default", async () => {
  const screen = await render(<Modal {...baseProps({ context: "Warning" })} />);
  const context = screen.getByText("Warning", { exact: true }).element() as HTMLElement;
  const style = getComputedStyle(context);

  expect(style.fontWeight).toBe("700");
  expect(style.textTransform).toBe("uppercase");
  expect(style.fontSize).toBe("12px");
  expect(style.color).toBe(tokenRgb("brand-earth-ui"));

  await expectNoAccessibilityViolations(document.body);
});

test("lets the caller color the context line with another text tone", async () => {
  const screen = await render(
    <Modal {...baseProps({ context: "Cannot be undone", contextTone: "status-error-ui" })} />,
  );
  const context = screen.getByText("Cannot be undone", { exact: true }).element() as HTMLElement;

  expect(getComputedStyle(context).color).toBe(tokenRgb("status-error-ui"));

  await expectNoAccessibilityViolations(document.body);
});

test("renders no context line when the caller does not supply one", async () => {
  const screen = await render(<Modal {...baseProps({ title: "Void the sale" })} />);
  const title = screen.getByRole("heading", { name: "Void the sale" }).element() as HTMLElement;

  // The title is the context line's only possible sibling in the header's text column (see
  // Modal.tsx): if an empty context paragraph rendered instead of nothing, this would find it and
  // fail, rather than merely checking the title's own text for a stray "undefined".
  expect(title.previousElementSibling).toBeNull();

  await expectNoAccessibilityViolations(document.body);
});

test("lays out the header with its padding, border and 16px gap", async () => {
  const screen = await render(<Modal {...baseProps()} />);
  const dialog = screen.getByRole("dialog").element() as HTMLElement;
  const header = dialog.firstElementChild as HTMLElement;
  const style = getComputedStyle(header);

  expect(style.paddingTop).toBe("16px");
  expect(style.paddingRight).toBe("16px");
  expect(style.paddingBottom).toBe("16px");
  expect(style.paddingLeft).toBe("24px");
  expect(style.borderBottomWidth).toBe("1px");
  expect(style.borderBottomColor).toBe(tokenRgb("line"));
  expect(style.columnGap).toBe("16px");
  expect(style.alignItems).toBe("center");

  await expectNoAccessibilityViolations(document.body);
});

test("gives the body 24px padding", async () => {
  const screen = await render(
    <Modal {...baseProps({ children: <p>Are you sure you want to void this sale?</p> })} />,
  );
  const body = screen
    .getByText("Are you sure you want to void this sale?", { exact: true })
    .element().parentElement as HTMLElement;
  const style = getComputedStyle(body);

  expect(style.paddingTop).toBe("24px");
  expect(style.paddingRight).toBe("24px");
  expect(style.paddingBottom).toBe("24px");
  expect(style.paddingLeft).toBe("24px");

  await expectNoAccessibilityViolations(document.body);
});

test('gives the body no padding at all when bodyPadding is "none", for a caller laying out its own edge-to-edge regions', async () => {
  const screen = await render(
    <Modal
      {...baseProps({
        bodyPadding: "none",
        children: <p>Areas pane and detail pane, flush to the panel's edges</p>,
      })}
    />,
  );
  const body = screen
    .getByText("Areas pane and detail pane, flush to the panel's edges", { exact: true })
    .element().parentElement as HTMLElement;
  const style = getComputedStyle(body);

  expect(style.paddingTop).toBe("0px");
  expect(style.paddingRight).toBe("0px");
  expect(style.paddingBottom).toBe("0px");
  expect(style.paddingLeft).toBe("0px");

  await expectNoAccessibilityViolations(document.body);
});

test("centers the header's icon (as a 56px circle) and title when headerLayout is centered", async () => {
  const screen = await render(<Modal {...baseProps({ headerLayout: "centered" })} />);
  const dialog = screen.getByRole("dialog").element() as HTMLElement;
  const iconBox = dialog.querySelector('[aria-hidden="true"]') as HTMLElement;
  const title = screen.getByRole("heading", { name: "Void the sale" }).element() as HTMLElement;

  const boxRect = iconBox.getBoundingClientRect();
  expect(boxRect.width).toBeGreaterThan(55);
  expect(boxRect.width).toBeLessThan(57);
  expect(boxRect.height).toBeGreaterThan(55);
  expect(boxRect.height).toBeLessThan(57);
  // `rounded-full` resolves to an arbitrarily large px radius rather than 50%, so what makes the
  // box a circle is a radius of at least half its own size, not one exact value (see
  // Toggle.test.tsx's own knob check for the same reasoning).
  expect(Number.parseFloat(getComputedStyle(iconBox).borderRadius)).toBeGreaterThanOrEqual(
    boxRect.width / 2,
  );
  expect(getComputedStyle(dialog.firstElementChild as HTMLElement).alignItems).toBe("center");
  expect(getComputedStyle(title).textAlign).toBe("center");

  await expectNoAccessibilityViolations(document.body);
});

test("draws no close button in the centered header layout, yet still closes on Escape when closable", async () => {
  const onOpenChange = vi.fn();
  const screen = await render(
    <Modal {...baseProps({ headerLayout: "centered", closable: true, onOpenChange })} />,
  );
  const dialog = screen.getByRole("dialog").element() as HTMLElement;

  expect(dialog.querySelectorAll("button")).toHaveLength(0);

  await userEvent.keyboard("{Escape}");

  expect(onOpenChange).toHaveBeenCalledWith(false);
  await expectNoAccessibilityViolations(document.body);
});

test("draws the centered layout's icon, title and body as one 24px-padded, centered column with 12px gaps and no divider", async () => {
  const screen = await render(
    <Modal
      {...baseProps({ headerLayout: "centered", children: <p>The text below the title</p> })}
    />,
  );
  const dialog = screen.getByRole("dialog").element() as HTMLElement;
  const column = dialog.firstElementChild as HTMLElement;
  const iconBox = column.querySelector('[aria-hidden="true"]') as HTMLElement;
  const title = screen.getByRole("heading", { name: "Void the sale" }).element() as HTMLElement;
  const text = screen.getByText("The text below the title").element() as HTMLElement;
  const columnStyle = getComputedStyle(column);

  expect(column.contains(text)).toBe(true);
  expect(columnStyle.borderBottomWidth).toBe("0px");
  expect(columnStyle.paddingTop).toBe("24px");
  expect(columnStyle.paddingRight).toBe("24px");
  expect(columnStyle.paddingBottom).toBe("24px");
  expect(columnStyle.paddingLeft).toBe("24px");
  expect(columnStyle.alignItems).toBe("center");
  expect(title.getBoundingClientRect().top - iconBox.getBoundingClientRect().bottom).toBeCloseTo(
    12,
    0,
  );
  expect(text.getBoundingClientRect().top - title.getBoundingClientRect().bottom).toBeCloseTo(
    12,
    0,
  );

  await expectNoAccessibilityViolations(document.body);
});

test('lays a flush body out as a column its content can fill, so an inner region scrolls instead of the body, when bodyPadding is "none"', async () => {
  await page.viewport(1280, 400);
  try {
    const screen = await render(
      <Modal
        {...baseProps({
          bodyPadding: "none",
          children: (
            <div
              data-testid="inner-region"
              style={{ flex: "1 1 0%", minHeight: 0, overflowY: "auto" }}
            >
              <div style={{ height: 2000 }} />
            </div>
          ),
        })}
      />,
    );
    const inner = screen.getByTestId("inner-region").element() as HTMLElement;
    const body = inner.parentElement as HTMLElement;

    expect(body.scrollHeight).toBe(body.clientHeight);
    expect(inner.scrollHeight).toBeGreaterThan(inner.clientHeight);

    await expectNoAccessibilityViolations(document.body);
  } finally {
    await page.viewport(1280, 900);
  }
});

test("goes straight from the header to the footer when there is nothing to show in the body", async () => {
  const cases: Array<Partial<ModalProps>> = [
    { children: undefined },
    // A caller's conditional content that currently has nothing to show.
    {
      children: (
        <>
          {false}
          {null}
        </>
      ),
    },
    { children: [false, null] },
  ];

  for (const overrides of cases) {
    const screen = await render(
      <Modal {...baseProps({ ...overrides, footer: <Button>Confirm</Button> })} />,
    );
    const dialog = screen.getByRole("dialog").element() as HTMLElement;
    const footer = screen.getByRole("button", { name: "Confirm" }).element()
      .parentElement as HTMLElement;
    const header = screen.getByRole("heading", { name: "Void the sale" }).element().parentElement
      ?.parentElement as HTMLElement;

    expect(dialog.children).toHaveLength(2);
    expect(header.nextElementSibling).toBe(footer);

    await expectNoAccessibilityViolations(document.body);
    await screen.unmount();
  }
});

test("shows the body between the header and the footer once there is something to show in it", async () => {
  const screen = await render(
    <Modal
      {...baseProps({
        footer: <Button>Confirm</Button>,
        children: (
          <>
            {false}
            <p>Signing out failed.</p>
          </>
        ),
      })}
    />,
  );
  const dialog = screen.getByRole("dialog").element() as HTMLElement;
  const body = screen.getByText("Signing out failed.", { exact: true }).element()
    .parentElement as HTMLElement;

  expect(dialog.children).toHaveLength(3);
  expect(dialog.children[1]).toBe(body);

  await expectNoAccessibilityViolations(document.body);
});

test("gives the footer a bone background, its padding, top border and 12px gap", async () => {
  const screen = await render(<Modal {...baseProps({ footer: <Button>Confirm</Button> })} />);
  const footerButton = screen.getByRole("button", { name: "Confirm" }).element() as HTMLElement;
  const footer = footerButton.parentElement as HTMLElement;
  const style = getComputedStyle(footer);

  expect(style.backgroundColor).toBe(tokenRgb("surface-bone"));
  expect(style.paddingTop).toBe("16px");
  expect(style.paddingBottom).toBe("16px");
  expect(style.paddingLeft).toBe("24px");
  expect(style.paddingRight).toBe("24px");
  expect(style.borderTopWidth).toBe("1px");
  expect(style.borderTopColor).toBe(tokenRgb("line"));
  expect(style.columnGap).toBe("12px");
  expect(style.alignItems).toBe("center");

  await expectNoAccessibilityViolations(document.body);
});

test("rounds the footer's bottom corners like the panel's so its bone fill keeps them rounded", async () => {
  const screen = await render(<Modal {...baseProps({ footer: <Button>Confirm</Button> })} />);
  const footerButton = screen.getByRole("button", { name: "Confirm" }).element() as HTMLElement;
  const footer = footerButton.parentElement as HTMLElement;
  const panel = (footer.closest('[role="dialog"]') as HTMLElement).parentElement as HTMLElement;
  const footerStyle = getComputedStyle(footer);
  const panelStyle = getComputedStyle(panel);

  expect(panelStyle.borderBottomLeftRadius).toBe("12px");
  expect(panelStyle.borderBottomRightRadius).toBe("12px");
  expect(footerStyle.borderBottomLeftRadius).toBe(panelStyle.borderBottomLeftRadius);
  expect(footerStyle.borderBottomRightRadius).toBe(panelStyle.borderBottomRightRadius);

  await expectNoAccessibilityViolations(document.body);
});

test("caps the panel below the viewport and lets only the body scroll when content overflows", async () => {
  await page.viewport(900, 500);
  try {
    const screen = await render(
      <Modal
        {...baseProps({
          closable: true,
          closeLabel: "Close",
          footer: <Button>Confirm</Button>,
          children: <div style={{ height: "1400px" }}>Tall body content</div>,
        })}
      />,
    );
    const dialog = screen.getByRole("dialog").element() as HTMLElement;
    const panel = dialog.parentElement as HTMLElement;
    const header = dialog.firstElementChild as HTMLElement;
    const body = header.nextElementSibling as HTMLElement;
    const footer = body.nextElementSibling as HTMLElement;

    const viewportHeight = window.innerHeight;
    const panelRect = panel.getBoundingClientRect();
    const footerRect = footer.getBoundingClientRect();

    expect(panelRect.height).toBeLessThanOrEqual(viewportHeight - 48 + 1);
    expect(footerRect.bottom).toBeLessThanOrEqual(viewportHeight + 1);
    expect(body.scrollHeight).toBeGreaterThan(body.clientHeight);
    expect(["auto", "scroll"]).toContain(getComputedStyle(body).overflowY);

    await expectNoAccessibilityViolations(document.body);
  } finally {
    await page.viewport(1280, 900);
  }
});

test("keeps the header and footer at their natural height even when the body scrolls", async () => {
  const naturalScreen = await render(
    <Modal {...baseProps({ footer: <Button>Confirm</Button> })} />,
  );
  const naturalDialog = naturalScreen.getByRole("dialog").element() as HTMLElement;
  const naturalHeaderHeight = (
    naturalDialog.firstElementChild as HTMLElement
  ).getBoundingClientRect().height;
  const naturalFooterHeight = (
    naturalDialog.lastElementChild as HTMLElement
  ).getBoundingClientRect().height;
  await expectNoAccessibilityViolations(document.body);
  await naturalScreen.unmount();

  await page.viewport(900, 500);
  try {
    const screen = await render(
      <Modal
        {...baseProps({
          footer: <Button>Confirm</Button>,
          children: <div style={{ height: "1400px" }}>Tall body content</div>,
        })}
      />,
    );
    const dialog = screen.getByRole("dialog").element() as HTMLElement;
    const header = dialog.firstElementChild as HTMLElement;
    const footer = dialog.lastElementChild as HTMLElement;

    expect(header.getBoundingClientRect().height).toBeCloseTo(naturalHeaderHeight, 0);
    expect(footer.getBoundingClientRect().height).toBeCloseTo(naturalFooterHeight, 0);

    await expectNoAccessibilityViolations(document.body);
  } finally {
    await page.viewport(1280, 900);
  }
});

test("keeps its natural height and an unscrolled body when the content fits", async () => {
  const screen = await render(
    <Modal {...baseProps({ footer: <Button>Confirm</Button>, children: <p>Short body</p> })} />,
  );
  const dialog = screen.getByRole("dialog").element() as HTMLElement;
  const panel = dialog.parentElement as HTMLElement;
  const header = dialog.firstElementChild as HTMLElement;
  const body = header.nextElementSibling as HTMLElement;

  expect(panel.getBoundingClientRect().height).toBeLessThan(window.innerHeight - 48);
  expect(body.scrollHeight).toBeLessThanOrEqual(body.clientHeight + 1);

  await expectNoAccessibilityViolations(document.body);
});

test("keeps a bottom body control reachable by Tab, scrolled into the body's visible area", async () => {
  await page.viewport(900, 500);
  try {
    const screen = await render(
      <Modal
        {...baseProps({
          closable: true,
          closeLabel: "Close",
          footer: <Button>Confirm</Button>,
          children: (
            <div>
              <button type="button">Top field</button>
              <div style={{ height: "1200px" }} />
              <button type="button">Bottom field</button>
            </div>
          ),
        })}
      />,
    );
    const dialog = screen.getByRole("dialog").element() as HTMLElement;
    const header = dialog.firstElementChild as HTMLElement;
    const body = header.nextElementSibling as HTMLElement;

    let reachedBottomField = false;
    for (let i = 0; i < 10 && !reachedBottomField; i++) {
      await userEvent.tab();
      reachedBottomField = document.activeElement?.textContent === "Bottom field";
    }

    expect(reachedBottomField).toBe(true);

    // The real test of "reachable": the focused control must land inside the actual browser
    // viewport, not merely inside the body element's own (potentially unclipped) box — a fixed,
    // centered panel taller than the viewport never scrolls the page, so without the body itself
    // becoming a scroll container, a focused descendant stays visually off-screen regardless of
    // where it sits within its own ancestor's bounding box.
    const focusedRect = (document.activeElement as HTMLElement).getBoundingClientRect();
    const bodyRect = body.getBoundingClientRect();

    expect(focusedRect.top).toBeGreaterThanOrEqual(0);
    expect(focusedRect.bottom).toBeLessThanOrEqual(window.innerHeight);
    expect(focusedRect.top).toBeGreaterThanOrEqual(bodyRect.top - 1);
    expect(focusedRect.bottom).toBeLessThanOrEqual(bodyRect.bottom + 1);

    await expectNoAccessibilityViolations(document.body);
  } finally {
    await page.viewport(1280, 900);
  }
});

test("shows a 40px circular close button in bone with a 20px glyph in secondary ink", async () => {
  const screen = await render(<Modal {...baseProps({ closable: true, closeLabel: "Close" })} />);
  const closeButton = screen.getByRole("button", { name: "Close" }).element() as HTMLElement;
  const icon = closeButton.querySelector("svg") as SVGSVGElement;

  const rect = closeButton.getBoundingClientRect();
  expect(rect.width).toBeGreaterThan(39);
  expect(rect.width).toBeLessThan(41);
  expect(rect.height).toBeGreaterThan(39);
  expect(rect.height).toBeLessThan(41);
  // Tailwind's rounded-full resolves to a huge computed radius (calc(infinity * 1px)) rather than
  // a fixed pixel value, so a full circle is asserted by the radius exceeding half the button's
  // own size, not by an exact string.
  expect(Number.parseFloat(getComputedStyle(closeButton).borderRadius)).toBeGreaterThan(rect.width);
  expect(getComputedStyle(closeButton).backgroundColor).toBe(tokenRgb("surface-bone"));

  const iconRect = icon.getBoundingClientRect();
  expect(iconRect.width).toBeGreaterThan(19);
  expect(iconRect.width).toBeLessThan(21);
  expect(getComputedStyle(icon).color).toBe(tokenRgb("ink-secondary"));

  await expectNoAccessibilityViolations(document.body);
});

test("shows the hand cursor on the close button", async () => {
  const screen = await render(<Modal {...baseProps({ closable: true, closeLabel: "Close" })} />);
  const closeButton = screen.getByRole("button", { name: "Close" }).element() as HTMLElement;

  expect(getComputedStyle(closeButton).cursor).toBe("pointer");

  await expectNoAccessibilityViolations(document.body);
});

test("turns the close button's background sand on hover", async () => {
  const screen = await render(<Modal {...baseProps({ closable: true, closeLabel: "Close" })} />);
  const closeButton = screen.getByRole("button", { name: "Close" }).element() as HTMLElement;

  await userEvent.hover(closeButton);
  await expect
    .poll(() => getComputedStyle(closeButton).backgroundColor)
    .toBe(tokenRgb("surface-sand"));

  await expectNoAccessibilityViolations(document.body);
});

test("shows the package's standard focus ring on the close button", async () => {
  const screen = await render(<Modal {...baseProps({ closable: true, closeLabel: "Close" })} />);
  const closeButton = screen.getByRole("button", { name: "Close" }).element() as HTMLElement;

  await userEvent.tab();

  await expect.poll(() => getComputedStyle(closeButton).outlineWidth).toBe("3px");
  await expect.poll(() => getComputedStyle(closeButton).outlineOffset).toBe("3px");
  await expect
    .poll(() => getComputedStyle(closeButton).outlineColor)
    .toBe(tokenRgb("brand-blue-strong"));

  await expectNoAccessibilityViolations(document.body);
});

test("closes when the close button is pressed", async () => {
  const onOpenChange = vi.fn();
  const screen = await render(
    <Modal {...baseProps({ closable: true, closeLabel: "Close", onOpenChange })} />,
  );

  await screen.getByRole("button", { name: "Close" }).click();

  expect(onOpenChange).toHaveBeenCalledWith(false);
  await expectNoAccessibilityViolations(document.body);
});

test("closes on Escape when closable", async () => {
  const onOpenChange = vi.fn();
  await render(<Modal {...baseProps({ closable: true, closeLabel: "Close", onOpenChange })} />);

  await userEvent.keyboard("{Escape}");

  expect(onOpenChange).toHaveBeenCalledWith(false);
  await expectNoAccessibilityViolations(document.body);
});

test("stays open when the backdrop is clicked, even when closable", async () => {
  const onOpenChange = vi.fn();
  await render(<Modal {...baseProps({ closable: true, closeLabel: "Close", onOpenChange })} />);
  const backdrop = document.querySelector('[class*="bg-ink-backdrop"]') as HTMLElement;

  await userEvent.click(backdrop, { position: { x: 4, y: 4 } });

  expect(onOpenChange).not.toHaveBeenCalled();
  await expectNoAccessibilityViolations(document.body);
});

test("shows no close button and ignores Escape and the backdrop when not closable", async () => {
  const onOpenChange = vi.fn();
  const screen = await render(<Modal {...baseProps({ closable: false, onOpenChange })} />);
  const dialog = screen.getByRole("dialog").element() as HTMLElement;

  // Scoped to the dialog's own rendered content, so this fails the moment a close button exists
  // anywhere inside it (e.g. if `closable` were mistakenly true) instead of always reading 0 from
  // vitest-browser-react's empty portal placeholder.
  expect(dialog.querySelectorAll("button")).toHaveLength(0);

  await userEvent.keyboard("{Escape}");
  const backdrop = document.querySelector('[class*="bg-ink-backdrop"]') as HTMLElement;
  await userEvent.click(backdrop, { position: { x: 4, y: 4 } });

  expect(onOpenChange).not.toHaveBeenCalled();
  await expect.element(screen.getByRole("dialog")).toBeVisible();
  await expectNoAccessibilityViolations(document.body);
});

test("exposes the modal as a dialog named by its title", async () => {
  const screen = await render(<Modal {...baseProps({ title: "Void the sale" })} />);

  await expect.element(screen.getByRole("dialog", { name: "Void the sale" })).toBeVisible();
  await expectNoAccessibilityViolations(document.body);
});

test("moves focus into the modal on open and contains it while tabbing", async () => {
  const screen = await render(
    <Modal
      {...baseProps({
        closable: true,
        closeLabel: "Close",
        footer: <Button>Confirm</Button>,
      })}
    />,
  );
  const dialog = screen.getByRole("dialog").element() as HTMLElement;

  expect(dialog.contains(document.activeElement)).toBe(true);

  for (let i = 0; i < 6; i++) {
    await userEvent.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
  }

  await expectNoAccessibilityViolations(document.body);
});

test("returns focus to the element that opened it, on close", async () => {
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Open
        </button>
        <Modal
          {...baseProps({
            isOpen: open,
            onOpenChange: setOpen,
            closable: true,
            closeLabel: "Close",
          })}
        />
      </>
    );
  }

  const screen = await render(<Harness />);
  const trigger = screen.getByRole("button", { name: "Open" });
  await trigger.click();

  await expect.element(screen.getByRole("dialog")).toBeVisible();
  await expectNoAccessibilityViolations(document.body);
  await screen.getByRole("button", { name: "Close" }).click();

  await expect.poll(() => document.activeElement).toBe(trigger.element());
});

test("opens a second modal over the first with its own backdrop and returns to the first when it closes", async () => {
  function Harness() {
    const [firstOpen, setFirstOpen] = useState(true);
    const [secondOpen, setSecondOpen] = useState(false);
    return (
      <>
        <Modal
          isOpen={firstOpen}
          onOpenChange={setFirstOpen}
          tone="info"
          icon={<Info />}
          title="First modal"
          closable
          closeLabel="Close first"
          footer={<Button onPress={() => setSecondOpen(true)}>Open second</Button>}
        >
          First body
        </Modal>
        <Modal
          isOpen={secondOpen}
          onOpenChange={setSecondOpen}
          tone="warning"
          icon={<AlertTriangle />}
          title="Second modal"
          closable
          closeLabel="Close second"
          footer={<Button onPress={() => setSecondOpen(false)}>Done</Button>}
        >
          Second body
        </Modal>
      </>
    );
  }

  const screen = await render(<Harness />);
  const openSecond = screen.getByRole("button", { name: "Open second" });
  await openSecond.click();

  await expect.element(screen.getByRole("dialog", { name: "Second modal" })).toBeVisible();
  await expect.element(screen.getByRole("dialog", { name: "First modal" })).toBeVisible();
  expect(document.querySelectorAll('[class*="bg-ink-backdrop"]')).toHaveLength(2);
  await expectNoAccessibilityViolations(document.body);

  const done = screen.getByRole("button", { name: "Done", exact: true });
  await done.click();

  await expect
    .element(screen.getByRole("dialog", { name: "Second modal" }))
    .not.toBeInTheDocument();
  await expect.element(screen.getByRole("dialog", { name: "First modal" })).toBeVisible();
  await expect.poll(() => document.activeElement).toBe(openSecond.element());

  const firstDialog = screen.getByRole("dialog", { name: "First modal" }).element() as HTMLElement;
  expect(firstDialog.contains(document.activeElement)).toBe(true);
  await expectNoAccessibilityViolations(document.body);
});

// Distributes Omit over ModalProps' union first (see Button.test.tsx's ButtonPropsWithoutText for
// the same trick): a plain Omit on a union collapses each branch's optionality and would stop
// catching that a close label is tied to `closable`. Omit is used instead of Pick because Pick's
// second parameter is constrained to `keyof P`, which fails to typecheck against the not-yet-
// distributed P; Omit's parameter has no such constraint.
type ModalCommonKeys =
  | "isOpen"
  | "onOpenChange"
  | "width"
  | "tone"
  | "icon"
  | "context"
  | "contextTone"
  | "title"
  | "children"
  | "footer";

type ModalCloseFields = ModalProps extends infer P
  ? P extends unknown
    ? Omit<P, ModalCommonKeys>
    : never
  : never;

test("does not accept a closable modal without a close label", () => {
  expectTypeOf<{ closable: true }>().not.toExtend<ModalCloseFields>();
});

test("does not accept a close label on a non-closable modal", () => {
  expectTypeOf<{ closable: false; closeLabel: string }>().not.toExtend<ModalCloseFields>();
});

// The same distribution, keeping only each branch's layout-specific fields: the header layout and
// the leading layout's context line and body padding.
type ModalLayoutFields = ModalProps extends infer P
  ? P extends unknown
    ? Omit<P, Exclude<ModalCommonKeys, "context" | "contextTone"> | "closable" | "closeLabel">
    : never
  : never;

test("accepts a context line, its tone and a flush body in the leading header layout", () => {
  expectTypeOf<{
    context: string;
    contextTone: "brand-blue-ui";
    bodyPadding: "none";
  }>().toExtend<ModalLayoutFields>();
});

test("does not accept a context line, its tone or a flush body in the centered header layout, which draws none of them", () => {
  expectTypeOf<{ headerLayout: "centered"; context: string }>().not.toExtend<ModalLayoutFields>();
  expectTypeOf<{
    headerLayout: "centered";
    contextTone: "brand-blue-ui";
  }>().not.toExtend<ModalLayoutFields>();
  expectTypeOf<{
    headerLayout: "centered";
    bodyPadding: "none";
  }>().not.toExtend<ModalLayoutFields>();
});

test("does not accept a close label in the centered header layout, which draws no close button", () => {
  expectTypeOf<{
    headerLayout: "centered";
    closable: true;
    closeLabel: string;
  }>().not.toExtend<ModalCloseFields>();
});
