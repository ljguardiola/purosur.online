import { ScanBarcode, TriangleAlert } from "lucide-react";
import { expect, expectTypeOf, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { tokenRgb } from "../../test/token-colors";
import { ElevatedNotice, type ElevatedNoticeProps } from "./elevated-notice";

const NOTICE = {
  icon: <ScanBarcode />,
  title: "No hay ningún producto con ese código",
  description: "Buscalo por nombre.",
};

test("keeps an empty status region mounted while there is no notice", async () => {
  const screen = await render(<ElevatedNotice notice={undefined} />);

  const region = screen.getByRole("status").element();
  expect(region.textContent).toBe("");
  expect(region.children).toHaveLength(0);
});

test("puts a notice's title and description inside the same region that was empty", async () => {
  const screen = await render(<ElevatedNotice notice={undefined} />);
  const region = screen.getByRole("status").element();

  await screen.rerender(<ElevatedNotice notice={NOTICE} />);

  expect(screen.getByRole("status").element()).toBe(region);
  expect(region.textContent).toContain("No hay ningún producto con ese código");
  expect(region.textContent).toContain("Buscalo por nombre.");
});

test("exposes the visible text to assistive technology inside the region", async () => {
  const screen = await render(<ElevatedNotice notice={NOTICE} />);

  const region = screen.getByRole("status").element();
  expect(region.querySelector('[aria-hidden="true"]:not(svg)')).toBeNull();
  await expect
    .element(screen.getByRole("status"))
    .toHaveTextContent("No hay ningún producto con ese código Buscalo por nombre.");
});

test("leaves the same region mounted and empty once the notice is cleared", async () => {
  const screen = await render(<ElevatedNotice notice={NOTICE} />);
  const region = screen.getByRole("status").element();

  await screen.rerender(<ElevatedNotice notice={undefined} />);

  expect(screen.getByRole("status").element()).toBe(region);
  expect(region.textContent).toBe("");
});

test("updates the same region when one notice replaces another", async () => {
  const screen = await render(<ElevatedNotice notice={NOTICE} />);
  const region = screen.getByRole("status").element();

  await screen.rerender(
    <ElevatedNotice
      notice={{ icon: <TriangleAlert />, title: "Otro problema", description: "Probá de nuevo." }}
    />,
  );

  expect(screen.getByRole("status").element()).toBe(region);
  expect(region.textContent).toContain("Otro problema");
  expect(region.textContent).not.toContain("No hay ningún producto");
});

test("centers a bordered card with 24px padding on the surface color and a shadow", async () => {
  const screen = await render(<ElevatedNotice notice={NOTICE} />);
  const card = screen.getByRole("status").element().firstElementChild as HTMLElement;
  const style = getComputedStyle(card);

  expect(style.display).toBe("flex");
  expect(style.flexDirection).toBe("column");
  expect(style.alignItems).toBe("center");
  expect(style.textAlign).toBe("center");
  expect(style.rowGap).toBe("8px");
  expect(style.borderRadius).toBe("8px");
  expect(style.borderTopWidth).toBe("1px");
  expect(style.borderTopColor).toBe(tokenRgb("border"));
  expect(style.backgroundColor).toBe(tokenRgb("surface"));
  expect(style.paddingTop).toBe("24px");
  expect(style.paddingLeft).toBe("24px");
  expect(style.boxShadow).not.toBe("none");
});

test("draws a 28px subtle icon the assistive technology skips", async () => {
  const screen = await render(<ElevatedNotice notice={NOTICE} />);
  const icon = screen.getByRole("status").element().querySelector("svg") as SVGSVGElement;
  const rect = icon.getBoundingClientRect();

  expect(icon.closest('[aria-hidden="true"]')).not.toBeNull();
  expect(rect.width).toBeGreaterThan(27);
  expect(rect.width).toBeLessThan(29);
  expect(rect.height).toBeGreaterThan(27);
  expect(rect.height).toBeLessThan(29);
  expect(getComputedStyle(icon).color).toBe(tokenRgb("text-subtle"));
});

test("sets the title in the heading size and text color, and the description in the body size and subtle color", async () => {
  const screen = await render(<ElevatedNotice notice={NOTICE} />);
  const title = screen.getByText(NOTICE.title, { exact: true }).element() as HTMLElement;
  const description = screen
    .getByText(NOTICE.description, { exact: true })
    .element() as HTMLElement;

  const reference = await render(
    <>
      <p className="text-heading text-text">Reference</p>
      <p className="text-body text-text-subtle">Reference</p>
    </>,
  );
  const [heading, body] = Array.from(reference.container.querySelectorAll("p"));

  expect(getComputedStyle(title).fontSize).toBe(getComputedStyle(heading as Element).fontSize);
  expect(getComputedStyle(title).color).toBe(tokenRgb("text"));
  expect(getComputedStyle(description).fontSize).toBe(getComputedStyle(body as Element).fontSize);
  expect(getComputedStyle(description).color).toBe(tokenRgb("text-subtle"));
});

test("wraps a long title and description inside the card", async () => {
  const long = "palabra ".repeat(60).trim();
  const screen = await render(
    <div style={{ width: "320px" }}>
      <ElevatedNotice notice={{ icon: <ScanBarcode />, title: long, description: long }} />
    </div>,
  );
  const region = screen.getByRole("status").element();
  const card = region.firstElementChild as HTMLElement;

  expect(card.getBoundingClientRect().width).toBeLessThanOrEqual(320);
  expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth);
  for (const paragraph of card.querySelectorAll("p")) {
    expect(paragraph.getBoundingClientRect().height).toBeGreaterThan(40);
  }
});

test("has no accessibility violations empty or with a notice", async () => {
  const screen = await render(<ElevatedNotice notice={undefined} />);
  await expectNoAccessibilityViolations(screen.container);

  await screen.rerender(<ElevatedNotice notice={NOTICE} />);
  await expectNoAccessibilityViolations(screen.container);
});

test("does not accept a notice without a title or without a description", () => {
  expectTypeOf<{
    notice: { icon: (typeof NOTICE)["icon"]; description: string };
  }>().not.toExtend<ElevatedNoticeProps>();
  expectTypeOf<{
    notice: { icon: (typeof NOTICE)["icon"]; title: string };
  }>().not.toExtend<ElevatedNoticeProps>();
});
