import { useEffect, useState } from "react";
import { expect, expectTypeOf, test, vi } from "vitest";
import { cdp, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { AA_TEXT_CONTRAST, contrastRatio, hexToRgb } from "../styles/contrast";
import { expectNoAccessibilityViolations } from "../test/axe";
import { insetBoundary, paintedBoxShadowLayers, rgbToHex, tokenRgb } from "../test/token-colors";
import { Pagination, type PaginationProps } from "./Pagination";

interface DispatchableCdpSession {
  send(
    method: "Input.dispatchMouseEvent",
    params: { type: "mouseMoved"; x: number; y: number },
  ): Promise<unknown>;
}

// aria-disabled, not the native attribute, is what marks Previous/Next unavailable, so Playwright's
// own locator actionability check (which treats aria-disabled as "not enabled") refuses to drive a
// hover through it — dispatched directly over CDP instead, the same way setup-browser.ts parks the
// pointer between tests.
async function hoverAt(x: number, y: number) {
  const session = cdp() as unknown as DispatchableCdpSession;
  await session.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
}

// The dimmed nav buttons paint their label at full opacity internally, then composite that whole
// button (label included) at aria-disabled:opacity's alpha onto whatever sits behind it (the
// page), not onto the button's own equally-faded background — so the label's real contrast has to
// be computed against the page surface, not read off getComputedStyle(button).color directly.
function compositeHex(foregroundHex: string, backgroundHex: string, alpha: number): string {
  const foreground = hexToRgb(foregroundHex);
  const background = hexToRgb(backgroundHex);
  const channel = (fg: number, bg: number) =>
    Math.round(fg * alpha + bg * (1 - alpha))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(foreground.r, background.r)}${channel(foreground.g, background.g)}${channel(foreground.b, background.b)}`;
}

function baseProps(overrides: Partial<PaginationProps> = {}): PaginationProps {
  return {
    page: 1,
    pageCount: 3,
    onPageChange: () => {},
    previousLabel: "Anterior",
    nextLabel: "Siguiente",
    label: "Paginación",
    // The identity, matching every existing `name: "N"` lookup below; a caller free to choose
    // something richer is proven separately.
    pageLabel: (page) => String(page),
    ...overrides,
  };
}

test("renders nothing with a single page", async () => {
  const screen = await render(<Pagination {...baseProps({ pageCount: 1 })} />);

  expect(screen.container.innerHTML).toBe("");
});

test("renders every page number up to 5 pages, 36px high with 8px between buttons", async () => {
  const screen = await render(<Pagination {...baseProps({ page: 2, pageCount: 5 })} />);

  for (const page of ["1", "2", "3", "4", "5"]) {
    await expect.element(screen.getByRole("button", { name: page, exact: true })).toBeVisible();
  }
  const first = screen.getByRole("button", { name: "1", exact: true }).element() as HTMLElement;
  const second = screen.getByRole("button", { name: "2", exact: true }).element() as HTMLElement;
  const rect = first.getBoundingClientRect();

  expect(rect.height).toBeGreaterThan(35);
  expect(rect.height).toBeLessThan(37);
  expect(getComputedStyle(first).borderRadius).toBe("6px");
  expect(getComputedStyle(first).paddingLeft).toBe("12px");

  const gap = second.getBoundingClientRect().left - first.getBoundingClientRect().right;
  expect(gap).toBeGreaterThan(7);
  expect(gap).toBeLessThan(9);

  await expectNoAccessibilityViolations(screen.container);
});

test("renders a page button white with a 1px line border and 14px ink text", async () => {
  const screen = await render(<Pagination {...baseProps({ page: 1, pageCount: 5 })} />);
  const page = screen.getByRole("button", { name: "3", exact: true }).element() as HTMLElement;
  const style = getComputedStyle(page);

  expect(style.backgroundColor).toBe(tokenRgb("surface-white"));
  expect(style.borderWidth).toBe("0px");
  expect(style.boxShadow).toContain(insetBoundary("line", "1px"));
  expect(style.fontSize).toBe("14px");
  expect(style.color).toBe(tokenRgb("ink"));
  expect(style.fontWeight).toBe("400");

  await expectNoAccessibilityViolations(screen.container);
});

test("hovers a non-current page button to a bone background", async () => {
  const screen = await render(<Pagination {...baseProps({ page: 1, pageCount: 5 })} />);
  const page = screen.getByRole("button", { name: "3", exact: true }).element() as HTMLElement;
  const restBackground = getComputedStyle(page).backgroundColor;
  expect(restBackground).toBe(tokenRgb("surface-white"));

  const rect = page.getBoundingClientRect();
  await hoverAt(rect.left + rect.width / 2, rect.top + rect.height / 2);

  expect(page.getAttribute("data-hovered")).toBe("true");
  expect(getComputedStyle(page).backgroundColor).toBe(tokenRgb("surface-bone"));

  await expectNoAccessibilityViolations(screen.container);
});

test("marks the current page blue UI with bold white text and no border", async () => {
  const screen = await render(<Pagination {...baseProps({ page: 3, pageCount: 5 })} />);
  const current = screen.getByRole("button", { name: "3", exact: true }).element() as HTMLElement;
  const style = getComputedStyle(current);

  expect(style.backgroundColor).toBe(tokenRgb("brand-blue-ui"));
  expect(style.color).toBe(tokenRgb("surface-white"));
  expect(style.fontWeight).toBe("700");
  expect(paintedBoxShadowLayers(current)).toEqual([]);
  expect(current.getAttribute("aria-current")).toBe("page");

  await expectNoAccessibilityViolations(screen.container);
});

test("keeps every page button the same width, current or not", async () => {
  const screen = await render(<Pagination {...baseProps({ page: 3, pageCount: 5 })} />);
  const current = screen.getByRole("button", { name: "3", exact: true }).element() as HTMLElement;
  const other = screen.getByRole("button", { name: "1", exact: true }).element() as HTMLElement;

  expect(current.getBoundingClientRect().width).toBeCloseTo(other.getBoundingClientRect().width, 0);

  await expectNoAccessibilityViolations(screen.container);
});

test("shows 1 2 3 … 24 when the current page is among the first three", async () => {
  const screen = await render(<Pagination {...baseProps({ page: 1, pageCount: 24 })} />);
  const numbers = screen.container.querySelectorAll("li");

  expect(Array.from(numbers).map((el) => el.textContent)).toEqual(["1", "2", "3", "…", "24"]);

  await expectNoAccessibilityViolations(screen.container);
});

test("shows 1 … 10 … 24 when the current page is in the middle", async () => {
  const screen = await render(<Pagination {...baseProps({ page: 10, pageCount: 24 })} />);
  const numbers = screen.container.querySelectorAll("li");

  expect(Array.from(numbers).map((el) => el.textContent)).toEqual(["1", "…", "10", "…", "24"]);

  await expectNoAccessibilityViolations(screen.container);
});

test("shows 1 … 22 23 24 when the current page is among the last three", async () => {
  const screen = await render(<Pagination {...baseProps({ page: 23, pageCount: 24 })} />);
  const numbers = screen.container.querySelectorAll("li");

  expect(Array.from(numbers).map((el) => el.textContent)).toEqual(["1", "…", "22", "23", "24"]);

  await expectNoAccessibilityViolations(screen.container);
});

test("keeps 5 fixed places across every page of a long list", async () => {
  for (const page of [1, 2, 12, 23, 24]) {
    const screen = await render(<Pagination {...baseProps({ page, pageCount: 24 })} />);
    const numbers = screen.container.querySelectorAll("li");

    expect(numbers).toHaveLength(5);
    await expectNoAccessibilityViolations(screen.container);
    await screen.unmount();
  }
});

test("shows every number with no ellipsis when there are exactly 5 pages", async () => {
  const screen = await render(<Pagination {...baseProps({ page: 3, pageCount: 5 })} />);
  const numbers = screen.container.querySelectorAll("li");

  expect(Array.from(numbers).map((el) => el.textContent)).toEqual(["1", "2", "3", "4", "5"]);

  await expectNoAccessibilityViolations(screen.container);
});

test("switches from the start window to the end window between pages 3 and 4 of 6", async () => {
  const startWindow = await render(<Pagination {...baseProps({ page: 3, pageCount: 6 })} />);
  const startNumbers = startWindow.container.querySelectorAll("li");
  expect(Array.from(startNumbers).map((el) => el.textContent)).toEqual(["1", "2", "3", "…", "6"]);
  await expectNoAccessibilityViolations(startWindow.container);
  await startWindow.unmount();

  const endWindow = await render(<Pagination {...baseProps({ page: 4, pageCount: 6 })} />);
  const endNumbers = endWindow.container.querySelectorAll("li");
  expect(Array.from(endNumbers).map((el) => el.textContent)).toEqual(["1", "…", "4", "5", "6"]);
  await expectNoAccessibilityViolations(endWindow.container);
});

test("covers the start, middle and end windows across pages 3, 4 and 5 of 7", async () => {
  const startWindow = await render(<Pagination {...baseProps({ page: 3, pageCount: 7 })} />);
  expect(
    Array.from(startWindow.container.querySelectorAll("li")).map((el) => el.textContent),
  ).toEqual(["1", "2", "3", "…", "7"]);
  await expectNoAccessibilityViolations(startWindow.container);
  await startWindow.unmount();

  const middleWindow = await render(<Pagination {...baseProps({ page: 4, pageCount: 7 })} />);
  expect(
    Array.from(middleWindow.container.querySelectorAll("li")).map((el) => el.textContent),
  ).toEqual(["1", "…", "4", "…", "7"]);
  await expectNoAccessibilityViolations(middleWindow.container);
  await middleWindow.unmount();

  const endWindow = await render(<Pagination {...baseProps({ page: 5, pageCount: 7 })} />);
  expect(
    Array.from(endWindow.container.querySelectorAll("li")).map((el) => el.textContent),
  ).toEqual(["1", "…", "5", "6", "7"]);
  await expectNoAccessibilityViolations(endWindow.container);
});

test("treats a page below 1 as page 1", async () => {
  const onPageChange = vi.fn();
  const screen = await render(
    <Pagination {...baseProps({ page: 0, pageCount: 5, onPageChange })} />,
  );
  const current = screen.getByRole("button", { name: "1", exact: true }).element() as HTMLElement;

  expect(current.getAttribute("aria-current")).toBe("page");
  expect(
    screen.getByRole("button", { name: "Anterior" }).element().getAttribute("aria-disabled"),
  ).toBe("true");
  expect(
    screen.getByRole("button", { name: "Siguiente" }).element().getAttribute("aria-disabled"),
  ).toBeNull();

  await screen.getByRole("button", { name: "Siguiente" }).click();
  expect(onPageChange).toHaveBeenCalledWith(2);

  await expectNoAccessibilityViolations(screen.container);
});

test("treats a page above the count as the last page", async () => {
  const onPageChange = vi.fn();
  const screen = await render(
    <Pagination {...baseProps({ page: 6, pageCount: 5, onPageChange })} />,
  );
  const current = screen.getByRole("button", { name: "5", exact: true }).element() as HTMLElement;

  expect(current.getAttribute("aria-current")).toBe("page");
  expect(
    screen.getByRole("button", { name: "Siguiente" }).element().getAttribute("aria-disabled"),
  ).toBe("true");
  expect(
    screen.getByRole("button", { name: "Anterior" }).element().getAttribute("aria-disabled"),
  ).toBeNull();

  await screen.getByRole("button", { name: "Anterior" }).click();
  expect(onPageChange).toHaveBeenCalledWith(4);

  await expectNoAccessibilityViolations(screen.container);
});

test("treats a NaN page as page 1", async () => {
  const screen = await render(<Pagination {...baseProps({ page: Number.NaN, pageCount: 5 })} />);
  const current = screen.getByRole("button", { name: "1", exact: true }).element() as HTMLElement;

  expect(current.getAttribute("aria-current")).toBe("page");
  expect(
    screen.getByRole("button", { name: "Anterior" }).element().getAttribute("aria-disabled"),
  ).toBe("true");

  await expectNoAccessibilityViolations(screen.container);
});

test("treats a positive infinite page as the last page", async () => {
  const screen = await render(
    <Pagination {...baseProps({ page: Number.POSITIVE_INFINITY, pageCount: 5 })} />,
  );
  const current = screen.getByRole("button", { name: "5", exact: true }).element() as HTMLElement;

  expect(current.getAttribute("aria-current")).toBe("page");
  expect(
    screen.getByRole("button", { name: "Siguiente" }).element().getAttribute("aria-disabled"),
  ).toBe("true");

  await expectNoAccessibilityViolations(screen.container);
});

test("treats a negative infinite page as page 1", async () => {
  const screen = await render(
    <Pagination {...baseProps({ page: Number.NEGATIVE_INFINITY, pageCount: 5 })} />,
  );
  const current = screen.getByRole("button", { name: "1", exact: true }).element() as HTMLElement;

  expect(current.getAttribute("aria-current")).toBe("page");
  expect(
    screen.getByRole("button", { name: "Anterior" }).element().getAttribute("aria-disabled"),
  ).toBe("true");

  await expectNoAccessibilityViolations(screen.container);
});

test("truncates a fractional page instead of rounding it", async () => {
  const screen = await render(<Pagination {...baseProps({ page: 2.5, pageCount: 5 })} />);
  const current = screen.getByRole("button", { name: "2", exact: true }).element() as HTMLElement;

  expect(current.getAttribute("aria-current")).toBe("page");

  await expectNoAccessibilityViolations(screen.container);
});

test("truncates a fractional page count instead of rounding it", async () => {
  const screen = await render(<Pagination {...baseProps({ page: 1, pageCount: 5.9 })} />);
  const numbers = screen.container.querySelectorAll("li");

  expect(Array.from(numbers).map((el) => el.textContent)).toEqual(["1", "2", "3", "4", "5"]);

  await expectNoAccessibilityViolations(screen.container);
});

test("renders nothing with a non-finite or below-2 page count", async () => {
  for (const pageCount of [Number.NaN, Number.POSITIVE_INFINITY, 1.9]) {
    const screen = await render(<Pagination {...baseProps({ page: 1, pageCount })} />);

    expect(screen.container.innerHTML).toBe("");
    await screen.unmount();
  }
});

test("keeps Previous focusable, tab-reachable, dimmed and marked unavailable at page 1", async () => {
  const screen = await render(<Pagination {...baseProps({ page: 1, pageCount: 5 })} />);
  const previous = screen.getByRole("button", { name: "Anterior" }).element() as HTMLElement;

  expect(previous.hasAttribute("disabled")).toBe(false);
  expect(previous.getAttribute("aria-disabled")).toBe("true");
  expect(getComputedStyle(previous).opacity).toBe("0.65");

  await userEvent.tab();
  expect(document.activeElement).toBe(previous);

  await expectNoAccessibilityViolations(screen.container);
});

test("keeps Next focusable, tab-reachable, dimmed and marked unavailable on the last page", async () => {
  const screen = await render(<Pagination {...baseProps({ page: 5, pageCount: 5 })} />);
  const next = screen.getByRole("button", { name: "Siguiente" }).element() as HTMLElement;

  expect(next.hasAttribute("disabled")).toBe(false);
  expect(next.getAttribute("aria-disabled")).toBe("true");
  expect(getComputedStyle(next).opacity).toBe("0.65");

  await expectNoAccessibilityViolations(screen.container);
});

test("shows the hand cursor on a page button and an available nav button, the arrow on an unavailable one", async () => {
  const screen = await render(<Pagination {...baseProps({ page: 1, pageCount: 5 })} />);
  const previous = screen.getByRole("button", { name: "Anterior" }).element() as HTMLElement;
  const next = screen.getByRole("button", { name: "Siguiente" }).element() as HTMLElement;
  const page = screen.getByRole("button", { name: "3", exact: true }).element() as HTMLElement;

  expect(getComputedStyle(previous).cursor).toBe("default");
  expect(getComputedStyle(next).cursor).toBe("pointer");
  expect(getComputedStyle(page).cursor).toBe("pointer");

  await expectNoAccessibilityViolations(screen.container);
});

test("does not paint the hover background while Previous is unavailable at page 1, unlike an available Next", async () => {
  const screen = await render(<Pagination {...baseProps({ page: 1, pageCount: 5 })} />);
  const previous = screen.getByRole("button", { name: "Anterior" }).element() as HTMLElement;
  const next = screen.getByRole("button", { name: "Siguiente" }).element() as HTMLElement;
  const restBackground = getComputedStyle(previous).backgroundColor;

  const previousRect = previous.getBoundingClientRect();
  await hoverAt(
    previousRect.left + previousRect.width / 2,
    previousRect.top + previousRect.height / 2,
  );
  expect(previous.getAttribute("data-hovered")).toBe("true");
  expect(getComputedStyle(previous).backgroundColor).toBe(restBackground);

  // Control: the same hover, over the available Next button, still paints its own hover
  // background — proving the suppression above is specific to the unavailable state, not a
  // regression that dropped hover styling everywhere.
  const nextRect = next.getBoundingClientRect();
  await hoverAt(nextRect.left + nextRect.width / 2, nextRect.top + nextRect.height / 2);
  expect(next.getAttribute("data-hovered")).toBe("true");
  expect(getComputedStyle(next).backgroundColor).toBe(tokenRgb("surface-bone"));

  await expectNoAccessibilityViolations(screen.container);
});

test("keeps the dimmed nav label's real composited contrast at or above 4.5:1, on white and on bone", async () => {
  const screen = await render(<Pagination {...baseProps({ page: 1, pageCount: 5 })} />);
  const previous = screen.getByRole("button", { name: "Anterior" }).element() as HTMLElement;
  const style = getComputedStyle(previous);
  const alpha = Number.parseFloat(style.opacity);
  const labelHex = rgbToHex(style.color);

  for (const surface of ["surface-white", "surface-bone"] as const) {
    const surfaceHex = rgbToHex(tokenRgb(surface));
    const compositedHex = compositeHex(labelHex, surfaceHex, alpha);

    expect(contrastRatio(compositedHex, surfaceHex)).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);
  }

  await expectNoAccessibilityViolations(screen.container);
});

// aria-disabled, not the native attribute, is what marks these unavailable, so Playwright's own
// locator actionability check (which treats aria-disabled as "not enabled") refuses to drive a
// click through it — exactly the assistive-technology-only signal this is supposed to be, not a
// real interaction barrier. A real click still reaches the button, so it's dispatched directly.
test("does nothing when Previous is activated at page 1, by click, Enter or Space", async () => {
  const onPageChange = vi.fn();
  const screen = await render(
    <Pagination {...baseProps({ page: 1, pageCount: 5, onPageChange })} />,
  );
  const previousEl = screen.getByRole("button", { name: "Anterior" }).element() as HTMLElement;

  previousEl.focus();
  previousEl.click();
  expect(onPageChange).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(previousEl);

  await userEvent.keyboard("{Enter}");
  expect(onPageChange).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(previousEl);

  await userEvent.keyboard(" ");
  expect(onPageChange).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(previousEl);

  await expectNoAccessibilityViolations(screen.container);
});

test("does nothing when Next is activated on the last page, by click, Enter or Space", async () => {
  const onPageChange = vi.fn();
  const screen = await render(
    <Pagination {...baseProps({ page: 5, pageCount: 5, onPageChange })} />,
  );
  const nextEl = screen.getByRole("button", { name: "Siguiente" }).element() as HTMLElement;

  nextEl.focus();
  nextEl.click();
  expect(onPageChange).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(nextEl);

  await userEvent.keyboard("{Enter}");
  expect(onPageChange).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(nextEl);

  await userEvent.keyboard(" ");
  expect(onPageChange).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(nextEl);

  await expectNoAccessibilityViolations(screen.container);
});

test("gives the caller the chosen page when a page button is pressed", async () => {
  const onPageChange = vi.fn();
  const screen = await render(
    <Pagination {...baseProps({ page: 1, pageCount: 5, onPageChange })} />,
  );

  await screen.getByRole("button", { name: "4", exact: true }).click();

  expect(onPageChange).toHaveBeenCalledWith(4);
  await expectNoAccessibilityViolations(screen.container);
});

test("does nothing when the current page's own button is pressed, but stays focusable", async () => {
  const onPageChange = vi.fn();
  const screen = await render(
    <Pagination {...baseProps({ page: 3, pageCount: 5, onPageChange })} />,
  );
  const current = screen.getByRole("button", { name: "3", exact: true });

  await current.click();

  expect(onPageChange).not.toHaveBeenCalled();
  await expect.element(current).toBeEnabled();
  expect(current.element().getAttribute("aria-current")).toBe("page");
  await expectNoAccessibilityViolations(screen.container);
});

test("moves to the previous and next page", async () => {
  const onPageChange = vi.fn();
  const screen = await render(
    <Pagination {...baseProps({ page: 3, pageCount: 5, onPageChange })} />,
  );

  await screen.getByRole("button", { name: "Anterior" }).click();
  expect(onPageChange).toHaveBeenLastCalledWith(2);

  await screen.getByRole("button", { name: "Siguiente" }).click();
  expect(onPageChange).toHaveBeenLastCalledWith(4);

  await expectNoAccessibilityViolations(screen.container);
});

test("tabs through Previous, every page button and Next in DOM order", async () => {
  const screen = await render(<Pagination {...baseProps({ page: 3, pageCount: 5 })} />);
  const previousButton = screen.getByRole("button", { name: "Anterior" }).element();
  const nextButton = screen.getByRole("button", { name: "Siguiente" }).element();
  const pageButtons = [1, 2, 3, 4, 5].map((n) =>
    screen.getByRole("button", { name: String(n), exact: true }).element(),
  );

  await userEvent.tab();
  expect(document.activeElement).toBe(previousButton);

  for (const pageButton of pageButtons) {
    await userEvent.tab();
    expect(document.activeElement).toBe(pageButton);
  }

  await userEvent.tab();
  expect(document.activeElement).toBe(nextButton);

  await expectNoAccessibilityViolations(screen.container);
});

test("activates a page button with Enter, calling onPageChange and leaving focus on it", async () => {
  const onPageChange = vi.fn();
  const screen = await render(
    <Pagination {...baseProps({ page: 1, pageCount: 5, onPageChange })} />,
  );
  const target = screen.getByRole("button", { name: "3", exact: true }).element();

  // Previous is unavailable but still tabbable on page 1, so it's the first stop: Previous, page1,
  // page2, page3.
  await userEvent.tab();
  await userEvent.tab();
  await userEvent.tab();
  await userEvent.tab();
  expect(document.activeElement).toBe(target);

  await userEvent.keyboard("{Enter}");

  expect(onPageChange).toHaveBeenCalledWith(3);
  expect(document.activeElement).toBe(target);

  await expectNoAccessibilityViolations(screen.container);
});

test("activates a page button with Space, calling onPageChange and leaving focus on it", async () => {
  const onPageChange = vi.fn();
  const screen = await render(
    <Pagination {...baseProps({ page: 1, pageCount: 5, onPageChange })} />,
  );
  const target = screen.getByRole("button", { name: "4", exact: true }).element();

  // Previous is unavailable but still tabbable on page 1, so it's the first stop: Previous, page1,
  // page2, page3, page4.
  await userEvent.tab();
  await userEvent.tab();
  await userEvent.tab();
  await userEvent.tab();
  await userEvent.tab();
  expect(document.activeElement).toBe(target);

  await userEvent.keyboard(" ");

  expect(onPageChange).toHaveBeenCalledWith(4);
  expect(document.activeElement).toBe(target);

  await expectNoAccessibilityViolations(screen.container);
});

// Mirrors how a real caller wires this controlled component: page and onPageChange round-tripped
// through the caller's own state.
function ControlledPagination({
  initialPage,
  ...props
}: Omit<PaginationProps, "page" | "onPageChange"> & { initialPage: number }) {
  const [page, setPage] = useState(initialPage);
  return <Pagination {...props} page={page} onPageChange={setPage} />;
}

test("leaves focus on Next, never reaching document.body, when pressing it lands on the last page", async () => {
  const screen = await render(
    <ControlledPagination
      initialPage={4}
      pageCount={5}
      previousLabel="Anterior"
      nextLabel="Siguiente"
      label="Paginación"
      pageLabel={(page) => String(page)}
    />,
  );
  const next = screen.getByRole("button", { name: "Siguiente" });
  const nextEl = next.element() as HTMLElement;

  await next.click();

  const lastPageButton = screen.getByRole("button", { name: "5", exact: true }).element();
  await expect.poll(() => lastPageButton.getAttribute("aria-current")).toBe("page");
  expect(nextEl.getAttribute("aria-disabled")).toBe("true");
  expect(document.activeElement).toBe(nextEl);
  expect(document.activeElement).not.toBe(document.body);

  await expectNoAccessibilityViolations(screen.container);
});

test("leaves focus on Previous, never reaching document.body, when pressing it lands on page 1", async () => {
  const screen = await render(
    <ControlledPagination
      initialPage={2}
      pageCount={5}
      previousLabel="Anterior"
      nextLabel="Siguiente"
      label="Paginación"
      pageLabel={(page) => String(page)}
    />,
  );
  const previous = screen.getByRole("button", { name: "Anterior" });
  const previousEl = previous.element() as HTMLElement;

  await previous.click();

  const firstPageButton = screen.getByRole("button", { name: "1", exact: true }).element();
  await expect.poll(() => firstPageButton.getAttribute("aria-current")).toBe("page");
  expect(previousEl.getAttribute("aria-disabled")).toBe("true");
  expect(document.activeElement).toBe(previousEl);
  expect(document.activeElement).not.toBe(document.body);

  await expectNoAccessibilityViolations(screen.container);
});

// A real async caller: pressing Next first lands an unrelated re-render (a loading flag flips,
// the page itself doesn't move yet), and only a tick later, in a separate commit, does the page
// actually land.
function AsyncPagination(props: Omit<PaginationProps, "page" | "pageCount" | "onPageChange">) {
  const [page, setPage] = useState(4);
  const [pendingPage, setPendingPage] = useState<number | null>(null);
  useEffect(() => {
    if (pendingPage === null) {
      return;
    }
    const id = setTimeout(() => {
      setPage(pendingPage);
      setPendingPage(null);
    }, 0);
    return () => clearTimeout(id);
  }, [pendingPage]);
  return (
    <Pagination
      {...props}
      page={page}
      pageCount={5}
      onPageChange={(next) => setPendingPage(next)}
    />
  );
}

test("leaves focus on Next, never reaching document.body, even when the page lands in a later, separate commit", async () => {
  const screen = await render(
    <AsyncPagination
      previousLabel="Anterior"
      nextLabel="Siguiente"
      label="Paginación"
      pageLabel={(page) => String(page)}
    />,
  );
  const next = screen.getByRole("button", { name: "Siguiente" }).element() as HTMLElement;

  await screen.getByRole("button", { name: "Siguiente" }).click();
  expect(document.activeElement).toBe(next);

  const lastPageButton = screen.getByRole("button", { name: "5", exact: true }).element();
  await expect.poll(() => lastPageButton.getAttribute("aria-current")).toBe("page");

  expect(next.getAttribute("aria-disabled")).toBe("true");
  expect(document.activeElement).toBe(next);
  expect(document.activeElement).not.toBe(document.body);

  await expectNoAccessibilityViolations(screen.container);
});

test("names its own navigation landmark from the caller's label", async () => {
  const screen = await render(
    <Pagination {...baseProps({ page: 1, pageCount: 5, label: "Páginas de resultados" })} />,
  );

  await expect
    .element(screen.getByRole("navigation", { name: "Páginas de resultados" }))
    .toBeVisible();

  await expectNoAccessibilityViolations(screen.container);
});

test("names each page button from the caller's own pageLabel, not a bare digit", async () => {
  const screen = await render(
    <Pagination {...baseProps({ page: 1, pageCount: 5, pageLabel: (page) => `Página ${page}` })} />,
  );

  await expect.element(screen.getByRole("button", { name: "Página 3" })).toBeVisible();

  await expectNoAccessibilityViolations(screen.container);
});

test("hides every ellipsis from assistive technology", async () => {
  // Page 10 of 24 renders [1, …, 10, …, 24]: 5 <li>, 2 of them an ellipsis. getByRole excludes
  // hidden elements by default, so this counts what actually reaches the accessibility tree —
  // an aria-hidden span inside a plain <li> wouldn't change that count, since hiding the span
  // leaves its own parent <li> announced as an empty list item.
  const screen = await render(<Pagination {...baseProps({ page: 10, pageCount: 24 })} />);

  const listItems = screen.getByRole("listitem").elements();
  expect(listItems).toHaveLength(3);
  expect(listItems.map((item) => item.textContent)).toEqual(["1", "10", "24"]);

  await expectNoAccessibilityViolations(screen.container);
});

test("does not accept a pagination missing its page, page count, change handler, button labels, nav label or page label", () => {
  expectTypeOf<{
    pageCount: number;
    onPageChange: (page: number) => void;
    previousLabel: string;
    nextLabel: string;
    label: string;
    pageLabel: (page: number) => string;
  }>().not.toExtend<PaginationProps>();
  expectTypeOf<{
    page: number;
    onPageChange: (page: number) => void;
    previousLabel: string;
    nextLabel: string;
    label: string;
    pageLabel: (page: number) => string;
  }>().not.toExtend<PaginationProps>();
  expectTypeOf<{
    page: number;
    pageCount: number;
    previousLabel: string;
    nextLabel: string;
    label: string;
    pageLabel: (page: number) => string;
  }>().not.toExtend<PaginationProps>();
  expectTypeOf<{
    page: number;
    pageCount: number;
    onPageChange: (page: number) => void;
    label: string;
    pageLabel: (page: number) => string;
  }>().not.toExtend<PaginationProps>();
  expectTypeOf<{
    page: number;
    pageCount: number;
    onPageChange: (page: number) => void;
    previousLabel: string;
    nextLabel: string;
    pageLabel: (page: number) => string;
  }>().not.toExtend<PaginationProps>();
  expectTypeOf<{
    page: number;
    pageCount: number;
    onPageChange: (page: number) => void;
    previousLabel: string;
    nextLabel: string;
    label: string;
  }>().not.toExtend<PaginationProps>();
});
