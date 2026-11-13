import { Lock, ShieldCheck } from "lucide-react";
import { createRef } from "react";
import { beforeEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { tokenRgb } from "../../test/token-colors";
import { CardModal } from "../overlays/card-modal";
import { CardPanel } from "./card-panel";

beforeEach(async () => {
  await page.viewport(1280, 900);
});

function panelOf(screen: Awaited<ReturnType<typeof render>>): HTMLElement {
  return screen.container.firstElementChild as HTMLElement;
}

test("draws a 440px white card with 24px padding, its children 16px apart", async () => {
  const screen = await render(
    <CardPanel>
      <p>Primero</p>
      <p>Segundo</p>
    </CardPanel>,
  );

  const style = getComputedStyle(panelOf(screen));
  expect(panelOf(screen).getBoundingClientRect().width).toBe(440);
  expect(style.backgroundColor).toBe(tokenRgb("surface"));
  expect(style.padding).toBe("24px");
  const first = screen.getByText("Primero").element().getBoundingClientRect();
  const second = screen.getByText("Segundo").element().getBoundingClientRect();
  expect(second.top - first.bottom).toBeCloseTo(16, 0);
});

test("draws the same card surface as the card modal", async () => {
  const screen = await render(<CardPanel>Contenido</CardPanel>);
  const panel = getComputedStyle(panelOf(screen));
  await render(
    <CardModal
      open
      onOpenChange={() => {}}
      icon={<ShieldCheck />}
      title="Autorizar"
      closable={false}
      action={null}
    >
      Contenido
    </CardModal>,
  );
  const card = getComputedStyle(page.getByRole("dialog").element().parentElement as HTMLElement);

  for (const property of ["width", "backgroundColor", "borderRadius", "boxShadow"] as const) {
    expect(panel[property], property).toBe(card[property]);
  }
});

test("shows no heading when it has no title", async () => {
  const screen = await render(<CardPanel>Contenido</CardPanel>);

  expect(screen.getByRole("heading").query()).toBeNull();
});

test("names its content with the title beside the icon badge, before the children", async () => {
  const screen = await render(
    <CardPanel icon={<Lock />} title="Ada está bloqueada">
      <p>Contenido</p>
    </CardPanel>,
  );

  const heading = screen.getByRole("heading", { name: "Ada está bloqueada", level: 1 });
  await expect.element(heading).toBeVisible();
  const badge = panelOf(screen).querySelector("svg")?.parentElement?.parentElement as HTMLElement;
  expect(getComputedStyle(badge).backgroundColor).toBe(tokenRgb("action-subtle"));
  expect(badge.getBoundingClientRect().width).toBe(36);
  expect(heading.element().getBoundingClientRect().left - badge.getBoundingClientRect().right).toBe(
    12,
  );
  const content = screen.getByText("Contenido").element();
  expect(
    heading.element().compareDocumentPosition(content) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(screen.getByText("Esc", { exact: true }).query()).toBeNull();
  await expectNoAccessibilityViolations(screen.container);
});

test("shows the Escape keycap at the end of the title row, as a key and not a button", async () => {
  const screen = await render(
    <CardPanel icon={<Lock />} title="Ada está bloqueada" escapeKeycap>
      <p>Contenido</p>
    </CardPanel>,
  );

  const keycap = screen.getByText("Esc", { exact: true }).element();
  const heading = screen.getByRole("heading").element();
  expect(keycap.getBoundingClientRect().right).toBe(
    panelOf(screen).getBoundingClientRect().right - 24,
  );
  expect(keycap.getBoundingClientRect().left).toBeGreaterThanOrEqual(
    heading.getBoundingClientRect().right,
  );
  expect(screen.getByRole("button").query()).toBeNull();
  await expectNoAccessibilityViolations(screen.container);
});

test("lets the screen move the focus to the title", async () => {
  const titleRef = createRef<HTMLHeadingElement>();
  const screen = await render(
    <CardPanel icon={<Lock />} title="Ada está bloqueada" titleRef={titleRef}>
      <p>Contenido</p>
    </CardPanel>,
  );

  titleRef.current?.focus();

  await expect.element(screen.getByRole("heading")).toHaveFocus();
});

test("draws no outline on the focused title", async () => {
  const titleRef = createRef<HTMLHeadingElement>();
  const screen = await render(
    <CardPanel icon={<Lock />} title="Ada está bloqueada" titleRef={titleRef}>
      <p>Contenido</p>
    </CardPanel>,
  );

  titleRef.current?.focus();

  await expect.element(screen.getByRole("heading")).toHaveFocus();
  const style = getComputedStyle(screen.getByRole("heading").element());
  expect(style.outlineStyle).toBe("none");
  expect(style.boxShadow).toBe("none");
});

test("shows the eyebrow above the title row, in capitals and tightly stacked", async () => {
  const screen = await render(
    <CardPanel icon={<Lock />} title="Elegí tu PIN" eyebrow="Lucas">
      <p>Contenido</p>
    </CardPanel>,
  );

  const eyebrow = screen.getByText("Lucas", { exact: true }).element();
  const heading = screen.getByRole("heading", { name: "Elegí tu PIN" }).element();
  expect(getComputedStyle(eyebrow).textTransform).toBe("uppercase");
  expect(eyebrow.getBoundingClientRect().bottom).toBeLessThanOrEqual(
    heading.getBoundingClientRect().top,
  );
  expect(heading.getBoundingClientRect().top - eyebrow.getBoundingClientRect().bottom).toBeLessThan(
    16,
  );
  await expectNoAccessibilityViolations(screen.container);
});

test("shows no eyebrow when it has none", async () => {
  const screen = await render(
    <CardPanel icon={<Lock />} title="Elegí tu PIN">
      <p>Contenido</p>
    </CardPanel>,
  );

  expect(screen.container.querySelectorAll("p")).toHaveLength(1);
});
