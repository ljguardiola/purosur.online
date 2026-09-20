import { StrictMode, useEffect, useState } from "react";
import { expect, expectTypeOf, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../test/axe";
import { tokenRgb } from "../test/token-colors";
import { Pagination, type PaginationProps } from "./Pagination";

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
  expect(style.boxShadow).toContain(`${tokenRgb("line")} 0px 0px 0px 1px inset`);
  expect(style.fontSize).toBe("14px");
  expect(style.color).toBe(tokenRgb("ink"));
  expect(style.fontWeight).toBe("400");

  await expectNoAccessibilityViolations(screen.container);
});

test("marks the current page blue UI with bold white text", async () => {
  const screen = await render(<Pagination {...baseProps({ page: 3, pageCount: 5 })} />);
  const current = screen.getByRole("button", { name: "3", exact: true }).element() as HTMLElement;
  const style = getComputedStyle(current);

  expect(style.backgroundColor).toBe(tokenRgb("brand-blue-ui"));
  expect(style.color).toBe(tokenRgb("surface-white"));
  expect(style.fontWeight).toBe("700");
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
  await expect.element(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();
  await expect.element(screen.getByRole("button", { name: "Siguiente" })).toBeEnabled();

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
  await expect.element(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled();
  await expect.element(screen.getByRole("button", { name: "Anterior" })).toBeEnabled();

  await screen.getByRole("button", { name: "Anterior" }).click();
  expect(onPageChange).toHaveBeenCalledWith(4);

  await expectNoAccessibilityViolations(screen.container);
});

test("treats a NaN page as page 1", async () => {
  const screen = await render(<Pagination {...baseProps({ page: Number.NaN, pageCount: 5 })} />);
  const current = screen.getByRole("button", { name: "1", exact: true }).element() as HTMLElement;

  expect(current.getAttribute("aria-current")).toBe("page");
  await expect.element(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();

  await expectNoAccessibilityViolations(screen.container);
});

test("treats a positive infinite page as the last page", async () => {
  const screen = await render(
    <Pagination {...baseProps({ page: Number.POSITIVE_INFINITY, pageCount: 5 })} />,
  );
  const current = screen.getByRole("button", { name: "5", exact: true }).element() as HTMLElement;

  expect(current.getAttribute("aria-current")).toBe("page");
  await expect.element(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled();

  await expectNoAccessibilityViolations(screen.container);
});

test("treats a negative infinite page as page 1", async () => {
  const screen = await render(
    <Pagination {...baseProps({ page: Number.NEGATIVE_INFINITY, pageCount: 5 })} />,
  );
  const current = screen.getByRole("button", { name: "1", exact: true }).element() as HTMLElement;

  expect(current.getAttribute("aria-current")).toBe("page");
  await expect.element(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();

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

test("disables Previous on the first page and Next on the last page", async () => {
  const firstPage = await render(<Pagination {...baseProps({ page: 1, pageCount: 5 })} />);
  await expect.element(firstPage.getByRole("button", { name: "Anterior" })).toBeDisabled();
  await expect.element(firstPage.getByRole("button", { name: "Siguiente" })).toBeEnabled();
  await expectNoAccessibilityViolations(firstPage.container);
  await firstPage.unmount();

  const lastPage = await render(<Pagination {...baseProps({ page: 5, pageCount: 5 })} />);
  await expect.element(lastPage.getByRole("button", { name: "Siguiente" })).toBeDisabled();
  await expect.element(lastPage.getByRole("button", { name: "Anterior" })).toBeEnabled();
  await expectNoAccessibilityViolations(lastPage.container);
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

  // Previous is disabled on page 1 (not in tab order), so the first tab already lands on page 1's
  // own button: page1, page2, page3.
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

  // Previous is disabled on page 1 (not in tab order), so the first tab already lands on page 1's
  // own button: page1, page2, page3, page4.
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

// Mirrors how a real caller wires this controlled component (page/onPageChange round-tripped
// through the caller's own state), which is what actually exercises the re-render that disables
// Previous/Next: a plain onPageChange spy never re-renders, so it could never observe the
// disabled-button-loses-focus problem in the first place.
function ControlledPagination({
  initialPage,
  ...props
}: Omit<PaginationProps, "page" | "onPageChange"> & { initialPage: number }) {
  const [page, setPage] = useState(initialPage);
  return <Pagination {...props} page={page} onPageChange={setPage} />;
}

test("moves focus to the last page's button when Next disables itself", async () => {
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

  await screen.getByRole("button", { name: "Siguiente" }).click();

  const lastPageButton = screen.getByRole("button", { name: "5", exact: true }).element();
  await expect.poll(() => document.activeElement).toBe(lastPageButton);
  await expect.element(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled();

  await expectNoAccessibilityViolations(screen.container);
});

test("moves focus to page 1's button when Previous disables itself", async () => {
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

  await screen.getByRole("button", { name: "Anterior" }).click();

  const firstPageButton = screen.getByRole("button", { name: "1", exact: true }).element();
  await expect.poll(() => document.activeElement).toBe(firstPageButton);
  await expect.element(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();

  await expectNoAccessibilityViolations(screen.container);
});

test("moves focus to the last page's button when Next is activated with Enter from the keyboard, once it disables", async () => {
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
  const nextButton = screen
    .getByRole("button", { name: "Siguiente" })
    .element() as HTMLButtonElement;
  nextButton.focus();
  expect(document.activeElement).toBe(nextButton);

  await userEvent.keyboard("{Enter}");

  const lastPageButton = screen.getByRole("button", { name: "5", exact: true }).element();
  await expect.poll(() => document.activeElement).toBe(lastPageButton);
  await expect.element(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled();

  await expectNoAccessibilityViolations(screen.container);
});

test("moves focus to page 1's button when Previous is activated with Space from the keyboard, once it disables", async () => {
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
  const previousButton = screen
    .getByRole("button", {
      name: "Anterior",
    })
    .element() as HTMLButtonElement;
  previousButton.focus();
  expect(document.activeElement).toBe(previousButton);

  await userEvent.keyboard(" ");

  const firstPageButton = screen.getByRole("button", { name: "1", exact: true }).element();
  await expect.poll(() => document.activeElement).toBe(firstPageButton);
  await expect.element(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();

  await expectNoAccessibilityViolations(screen.container);
});

// The component only knows the page it asked for, not the page it will actually get: a caller
// that ignores onPageChange (as this plain, non-controlled render does) never re-renders it, so
// currentPage stays exactly where it was. Nothing should jump to a page button that doesn't match
// what's actually on screen, and Next never actually becomes disabled, so focus simply stays put.
test("keeps focus on Next and does not jump to the last page's button when the caller ignores the change", async () => {
  const screen = await render(<Pagination {...baseProps({ page: 4, pageCount: 5 })} />);
  const nextButton = screen.getByRole("button", { name: "Siguiente" }).element();

  await screen.getByRole("button", { name: "Siguiente" }).click();

  expect(document.activeElement).toBe(nextButton);
  await expect.element(screen.getByRole("button", { name: "Siguiente" })).not.toBeDisabled();

  await expectNoAccessibilityViolations(screen.container);
});

test("keeps focus on Previous and does not jump to page 1's button when the caller ignores the change", async () => {
  const screen = await render(<Pagination {...baseProps({ page: 2, pageCount: 5 })} />);
  const previousButton = screen.getByRole("button", { name: "Anterior" }).element();

  await screen.getByRole("button", { name: "Anterior" }).click();

  expect(document.activeElement).toBe(previousButton);
  await expect.element(screen.getByRole("button", { name: "Anterior" })).not.toBeDisabled();

  await expectNoAccessibilityViolations(screen.container);
});

// A caller can go a long time between a boundary press and any resulting re-render (or never
// re-render at all): the person is free to move focus anywhere on the page in that window. A
// later, unrelated prop change that happens to land the component on the very boundary that press
// asked for must never grab focus back from wherever the person actually put it since.
test("does not steal focus back from wherever the person moved it, when an unrelated later prop change happens to land on the boundary Next asked for", async () => {
  const screen = await render(<Pagination {...baseProps({ page: 4, pageCount: 5 })} />);

  await screen.getByRole("button", { name: "Siguiente" }).click();
  await screen.getByRole("button", { name: "1", exact: true }).click();
  const firstPageButton = screen.getByRole("button", { name: "1", exact: true }).element();
  expect(document.activeElement).toBe(firstPageButton);

  // Unrelated to the Next press above: the caller shrinks pageCount on its own, which happens to
  // land currentPage exactly on the boundary Next asked for (page 4 becomes the last of 4 pages),
  // long after that press and with nothing to do with it.
  await screen.rerender(<Pagination {...baseProps({ page: 4, pageCount: 4 })} />);

  expect(document.activeElement).toBe(firstPageButton);

  await expectNoAccessibilityViolations(screen.container);
});

// The intent that survives a stale press only records that *a* boundary press happened, not
// which one: focus was moved to Previous directly (never pressed), and the boundary that actually
// disables in this render is Previous's own (page 1), unrelated to the earlier, still-unconsumed
// Next press. The redirect must follow the disabling that is actually happening, not the specific
// button that happened to set the intent.
test("redirects focus to page 1's own button when Previous disables, even though the last recorded press was toward Next", async () => {
  const screen = await render(<Pagination {...baseProps({ page: 4, pageCount: 5 })} />);

  await screen.getByRole("button", { name: "Siguiente" }).click();
  const previousButton = screen
    .getByRole("button", {
      name: "Anterior",
    })
    .element() as HTMLButtonElement;
  previousButton.focus();
  expect(document.activeElement).toBe(previousButton);

  await screen.rerender(<Pagination {...baseProps({ page: 1, pageCount: 5 })} />);

  const firstPageButton = screen.getByRole("button", { name: "1", exact: true }).element();
  expect(document.activeElement).toBe(firstPageButton);

  await expectNoAccessibilityViolations(screen.container);
});

// Isolates the mechanism's one load-bearing browser assumption from its own redirect logic: focus
// a nav button directly (never through a press, so no intent is ever recorded), then disable that
// exact button through a prop change alone. Nothing in this component redirects anything here
// (pending stays false throughout), so document.body afterward can only be the browser's own,
// unprompted reaction to disabling the element that held focus.
test("proves the browser itself drops focus to document.body when a focused nav button becomes disabled by a prop change alone", async () => {
  const screen = await render(<Pagination {...baseProps({ page: 4, pageCount: 5 })} />);
  const nextButton = screen
    .getByRole("button", { name: "Siguiente" })
    .element() as HTMLButtonElement;
  nextButton.focus();
  expect(document.activeElement).toBe(nextButton);

  await screen.rerender(<Pagination {...baseProps({ page: 5, pageCount: 5 })} />);

  expect(document.activeElement).toBe(document.body);
});

// The positive counterpart to the two staleness tests above: pageCount can genuinely change in
// the very same update the press itself triggers (e.g. the caller's onPageChange also refreshes a
// filtered total), landing the redirect on a boundary that only exists because of that combined
// change. The mechanism has to still catch this, not just correctly ignore the unrelated cases.
function PaginationThatAlsoShrinksOnNext(
  props: Omit<PaginationProps, "page" | "pageCount" | "onPageChange">,
) {
  const [page, setPage] = useState(4);
  const [pageCount, setPageCount] = useState(5);
  return (
    <Pagination
      {...props}
      page={page}
      pageCount={pageCount}
      onPageChange={(next) => {
        setPage(next);
        setPageCount(4);
      }}
    />
  );
}

test("still redirects focus when pageCount shrinks in the very same update the press triggers", async () => {
  const screen = await render(
    <PaginationThatAlsoShrinksOnNext
      previousLabel="Anterior"
      nextLabel="Siguiente"
      label="Paginación"
      pageLabel={(page) => String(page)}
    />,
  );

  await screen.getByRole("button", { name: "Siguiente" }).click();

  const newLastPageButton = screen.getByRole("button", { name: "4", exact: true }).element();
  await expect.poll(() => document.activeElement).toBe(newLastPageButton);
  await expect.element(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled();

  await expectNoAccessibilityViolations(screen.container);
});

// Two presses landing in the same React batch: a genuine double-press, both calls to the DOM
// .click() method fired back to back with no await between them (that method doesn't itself move
// focus the way a real user click does, so Next is focused explicitly first, the way tabbing to
// it would leave it) — both onPress handlers read the same still-stale currentPage and both ask
// for page 5, before React ever gets a chance to re-render in response to the first one.
test("stays correct when Next is pressed twice before any render lands between the two presses", async () => {
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
  const nextButton = screen
    .getByRole("button", { name: "Siguiente" })
    .element() as HTMLButtonElement;
  nextButton.focus();

  nextButton.click();
  nextButton.click();

  const lastPageButton = screen.getByRole("button", { name: "5", exact: true }).element();
  await expect.poll(() => document.activeElement).toBe(lastPageButton);
  await expect.element(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled();

  await expectNoAccessibilityViolations(screen.container);
});

test("still redirects focus correctly when rendered inside React StrictMode", async () => {
  const screen = await render(
    <StrictMode>
      <ControlledPagination
        initialPage={4}
        pageCount={5}
        previousLabel="Anterior"
        nextLabel="Siguiente"
        label="Paginación"
        pageLabel={(page) => String(page)}
      />
    </StrictMode>,
  );

  await screen.getByRole("button", { name: "Siguiente" }).click();

  const lastPageButton = screen.getByRole("button", { name: "5", exact: true }).element();
  await expect.poll(() => document.activeElement).toBe(lastPageButton);
  await expect.element(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled();

  await expectNoAccessibilityViolations(screen.container);
});

// If the boundary is only reached later, indirectly (a rerender, not the disabling button's own
// click), and the browser hasn't dropped focus to document.body — because whatever holds it right
// now is a genuinely unrelated element outside Pagination entirely, never disabled by this update
// at all — the mechanism must still do nothing rather than guess.
test("never redirects focus when a boundary is reached while focus sits on an element outside Pagination entirely", async () => {
  const screen = await render(
    <>
      <input aria-label="Unrelated field" />
      <Pagination {...baseProps({ page: 4, pageCount: 5 })} />
    </>,
  );
  const unrelatedField = screen
    .getByRole("textbox", { name: "Unrelated field" })
    .element() as HTMLInputElement;

  await screen.getByRole("button", { name: "Siguiente" }).click();
  unrelatedField.focus();
  expect(document.activeElement).toBe(unrelatedField);

  await screen.rerender(
    <>
      <input aria-label="Unrelated field" />
      <Pagination {...baseProps({ page: 5, pageCount: 5 })} />
    </>,
  );

  expect(document.activeElement).toBe(unrelatedField);

  await expectNoAccessibilityViolations(screen.container);
});

// A real async caller: pressing Next first lands an unrelated re-render (a loading flag flips,
// the page itself doesn't move yet), and only a tick later, in a *separate* commit, does the page
// actually land. The intent has to survive that intervening render to still catch the disabling
// when it finally happens.
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

test("moves focus to the last page's button once Next disables, even when the page lands in a later, separate commit", async () => {
  const screen = await render(
    <AsyncPagination
      previousLabel="Anterior"
      nextLabel="Siguiente"
      label="Paginación"
      pageLabel={(page) => String(page)}
    />,
  );

  await screen.getByRole("button", { name: "Siguiente" }).click();

  const lastPageButton = screen.getByRole("button", { name: "5", exact: true }).element();
  await expect.poll(() => document.activeElement).toBe(lastPageButton);
  await expect.element(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled();

  await expectNoAccessibilityViolations(screen.container);
});

// document.body can hold focus for reasons that have nothing to do with a nav button disabling:
// the caller moved focus away programmatically, an unrelated element was removed, a click landed
// on the page background. An intervening render caught in that state, before the real boundary is
// ever reached, must not discard the armed intent — it has to keep waiting for the change that
// actually matters, the same way it already does while focus still sits on the nav button itself.
test("stays armed through an unrelated body-focus that doesn't yet match the boundary, and still redirects once the real change lands", async () => {
  const screen = await render(<Pagination {...baseProps({ page: 4, pageCount: 5 })} />);
  const nextButton = screen
    .getByRole("button", { name: "Siguiente" })
    .element() as HTMLButtonElement;

  await screen.getByRole("button", { name: "Siguiente" }).click();
  nextButton.blur();
  expect(document.activeElement).toBe(document.body);

  await screen.rerender(<Pagination {...baseProps({ page: 4, pageCount: 5, label: "Otro" })} />);
  expect(document.activeElement).toBe(document.body);

  await screen.rerender(<Pagination {...baseProps({ page: 5, pageCount: 5, label: "Otro" })} />);

  const lastPageButton = screen.getByRole("button", { name: "5", exact: true }).element();
  expect(document.activeElement).toBe(lastPageButton);

  await expectNoAccessibilityViolations(screen.container);
});

// The intent has to survive an update that changes nothing relevant (a loading flag, an unrelated
// label), but it only ever gets one real chance: the first time page/pageCount actually differ
// from what they were at press time, that's treated as the press's own outcome, matched or not.
// A later, unrelated change that happens to land on a boundary — after several other updates that
// didn't — must never inherit a long-expired press's redirect.
test("does not fire later, after an unrelated page change already resolved the press's one chance", async () => {
  const screen = await render(<Pagination {...baseProps({ page: 4, pageCount: 5 })} />);

  await screen.getByRole("button", { name: "Siguiente" }).click();

  // Several intervening renders that change nothing relevant: still waiting, correctly.
  await screen.rerender(<Pagination {...baseProps({ page: 4, pageCount: 5, label: "Otro" })} />);
  await screen.rerender(
    <Pagination {...baseProps({ page: 4, pageCount: 5, label: "Otra vez" })} />,
  );

  // An unrelated page change, nothing to do with the press, that doesn't reach a boundary: this
  // is the press's one chance, taken now even though it doesn't match.
  await screen.rerender(<Pagination {...baseProps({ page: 3, pageCount: 5 })} />);

  // Much later, a real boundary is reached — but the press that could have redirected to it
  // already resolved, unmatched, back when page first changed.
  await screen.rerender(<Pagination {...baseProps({ page: 5, pageCount: 5 })} />);

  const lastPageButton = screen.getByRole("button", { name: "5", exact: true }).element();
  expect(document.activeElement).not.toBe(lastPageButton);

  await expectNoAccessibilityViolations(screen.container);
});

// An armed intent has nowhere left to redirect to once its own component is gone: unmounting
// while a press is still pending must be a clean no-op, not a stranded reference or a thrown
// error reaching into a removed tree.
test("removes cleanly, with no error, when unmounted while an intent is still armed", async () => {
  const screen = await render(<Pagination {...baseProps({ page: 4, pageCount: 5 })} />);
  const nextButton = screen
    .getByRole("button", { name: "Siguiente" })
    .element() as HTMLButtonElement;

  await screen.getByRole("button", { name: "Siguiente" }).click();
  expect(document.activeElement).toBe(nextButton);

  await screen.unmount();

  expect(screen.container.innerHTML).toBe("");
  expect(document.activeElement).toBe(document.body);
});

// Collapsing to a single page renders nothing (see resolvedPageCount <= 1 above) without the
// component itself unmounting: the same instance, the same refs, can render again later if
// pageCount grows back. An intent armed right before that collapse has nowhere left to redirect
// to, same as a real unmount — the buttons it could have focused are gone from this exact commit,
// pageButtonRefs is emptied by their own ref cleanup before this effect ever runs, and the
// browser's own removal-triggered blur to document.body is again the entire, correct outcome.
function PaginationThatCollapsesOnNext(
  props: Omit<PaginationProps, "page" | "pageCount" | "onPageChange">,
) {
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(2);
  return (
    <Pagination
      {...props}
      page={page}
      pageCount={pageCount}
      onPageChange={(next) => {
        setPage(next);
        setPageCount(1);
      }}
    />
  );
}

test("does nothing unsafe when pressing Next collapses the page count to one while the intent is still armed", async () => {
  const screen = await render(
    <PaginationThatCollapsesOnNext
      previousLabel="Anterior"
      nextLabel="Siguiente"
      label="Paginación"
      pageLabel={(page) => String(page)}
    />,
  );

  await screen.getByRole("button", { name: "Siguiente" }).click();

  expect(screen.container.innerHTML).toBe("");
  expect(document.activeElement).toBe(document.body);

  await expectNoAccessibilityViolations(screen.container);
});

// The redirect only ever compares against document.activeElement, never against any particular
// ancestor: an ancestor's own tabindex (a focus-trap wrapper, a modal, a scroll region) plays no
// part in the browser's native disable-triggered blur, which always targets document.body
// regardless of what else on the page happens to be programmatically focusable.
test("still redirects correctly wrapped in an ancestor with its own tabindex", async () => {
  const screen = await render(
    <div tabIndex={-1}>
      <ControlledPagination
        initialPage={4}
        pageCount={5}
        previousLabel="Anterior"
        nextLabel="Siguiente"
        label="Paginación"
        pageLabel={(page) => String(page)}
      />
    </div>,
  );

  await screen.getByRole("button", { name: "Siguiente" }).click();

  const lastPageButton = screen.getByRole("button", { name: "5", exact: true }).element();
  await expect.poll(() => document.activeElement).toBe(lastPageButton);
  await expect.element(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled();

  await expectNoAccessibilityViolations(screen.container);
});

// The one browser fact the whole mechanism leans on: with nothing focused yet, before any
// interaction at all, document.activeElement already reads as document.body — never null, never
// undefined, never some other implicit default. A document that "never had focus" is already
// covered by the exact same check the redirect uses.
test("proves document.activeElement already reads as document.body before any interaction", async () => {
  await render(<Pagination {...baseProps({ page: 1, pageCount: 5 })} />);

  expect(document.activeElement).toBe(document.body);
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
  const screen = await render(<Pagination {...baseProps({ page: 10, pageCount: 24 })} />);
  const ellipses = screen.getByText("…", { exact: true }).elements() as HTMLElement[];

  expect(ellipses).toHaveLength(2);
  for (const ellipsis of ellipses) {
    expect(ellipsis.getAttribute("aria-hidden")).toBe("true");
  }

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
