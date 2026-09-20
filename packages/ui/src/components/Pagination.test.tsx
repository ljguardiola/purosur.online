import { useState } from "react";
import { expect, expectTypeOf, test, vi } from "vitest";
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
