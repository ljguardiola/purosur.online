import { type ReactNode, useId } from "react";
import { expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { useKeyboardScrollableRegion } from "./keyboard-scrollable-region";

function ScrollingBox({
  shown = true,
  height = 200,
  children,
}: {
  shown?: boolean;
  height?: number;
  children: ReactNode;
}) {
  const titleId = useId();
  const region = useKeyboardScrollableRegion(titleId);
  return (
    <main>
      <h2 id={titleId}>Detalle</h2>
      {shown ? (
        <div
          ref={region.observeOverflow}
          {...region.regionProps}
          style={{ height: `${height}px`, width: "300px", overflow: "auto" }}
        >
          {children}
        </div>
      ) : null}
      <button type="button">Siguiente</button>
    </main>
  );
}

function Lines({ count }: { count: number }) {
  return Array.from({ length: count }, (_, index) => `Línea ${index + 1}`).map((line) => (
    <p key={line}>{line}</p>
  ));
}

function BoxInAWrapperWithoutABox({ height }: { height: number }) {
  return (
    <div style={{ display: "contents" }}>
      <div style={{ height: `${height}px` }} />
    </div>
  );
}

function BoxOfFixedSize() {
  return <div style={{ height: "400px", width: "100px" }} />;
}

function TextInABoxOfFixedSize({ text }: { text: string }) {
  return (
    <div>
      <span style={{ whiteSpace: "nowrap" }}>{text}</span>
    </div>
  );
}

const region = () => page.getByRole("region", { name: "Detalle" });
const nextButton = () => page.getByRole("button", { name: "Siguiente" });
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

test("adds no tab stop to content that fits", async () => {
  await render(
    <ScrollingBox>
      <Lines count={2} />
    </ScrollingBox>,
  );

  await userEvent.tab();

  await expect.element(nextButton()).toHaveFocus();
  expect(page.getByRole("region").query()).toBeNull();
});

test("is a tab stop named by its label while its content overflows it vertically", async () => {
  await render(
    <ScrollingBox>
      <Lines count={40} />
    </ScrollingBox>,
  );

  await userEvent.tab();

  await expect.element(region()).toHaveFocus();
  await expectNoAccessibilityViolations(document.body);
});

test("is a tab stop while its content overflows it sideways", async () => {
  await render(
    <ScrollingBox>
      <p style={{ whiteSpace: "nowrap" }}>{"x".repeat(400)}</p>
    </ScrollingBox>,
  );

  await userEvent.tab();

  await expect.element(region()).toHaveFocus();
});

test("becomes a tab stop once lines are added past it", async () => {
  const screen = await render(
    <ScrollingBox>
      <Lines count={2} />
    </ScrollingBox>,
  );
  expect(page.getByRole("region").query()).toBeNull();

  await screen.rerender(
    <ScrollingBox>
      <Lines count={40} />
    </ScrollingBox>,
  );

  await expect.element(region()).toHaveAttribute("tabindex", "0");
});

test("becomes a tab stop once a box inside a wrapper without a box of its own grows past it", async () => {
  const screen = await render(
    <ScrollingBox>
      <BoxInAWrapperWithoutABox height={50} />
    </ScrollingBox>,
  );
  expect(page.getByRole("region").query()).toBeNull();

  await screen.rerender(
    <ScrollingBox>
      <BoxInAWrapperWithoutABox height={1000} />
    </ScrollingBox>,
  );

  await expect.element(region()).toHaveAttribute("tabindex", "0");
});

test("becomes a tab stop once text in a box that keeps its size grows past it", async () => {
  const screen = await render(
    <ScrollingBox>
      <TextInABoxOfFixedSize text="corto" />
    </ScrollingBox>,
  );
  expect(page.getByRole("region").query()).toBeNull();

  await screen.rerender(
    <ScrollingBox>
      <TextInABoxOfFixedSize text={"x".repeat(400)} />
    </ScrollingBox>,
  );

  await expect.element(region()).toHaveAttribute("tabindex", "0");
});

test("becomes a tab stop once it shrinks below content that keeps its size", async () => {
  const screen = await render(
    <ScrollingBox height={1000}>
      <BoxOfFixedSize />
    </ScrollingBox>,
  );
  await nextFrame();
  await nextFrame();
  expect(page.getByRole("region").query()).toBeNull();

  await screen.rerender(
    <ScrollingBox height={100}>
      <BoxOfFixedSize />
    </ScrollingBox>,
  );

  await expect.element(region()).toHaveAttribute("tabindex", "0");
});

test("stops being a tab stop once its content fits again while it is not focused", async () => {
  const screen = await render(
    <ScrollingBox>
      <Lines count={40} />
    </ScrollingBox>,
  );
  await expect.element(region()).toHaveAttribute("tabindex", "0");

  await screen.rerender(
    <ScrollingBox>
      <Lines count={2} />
    </ScrollingBox>,
  );

  await expect.poll(() => page.getByRole("region").query()).toBeNull();
  await userEvent.tab();
  await expect.element(nextButton()).toHaveFocus();
});

test("keeps the tab stop of a focused region whose content fits again until the focus leaves it", async () => {
  const screen = await render(
    <ScrollingBox>
      <Lines count={40} />
    </ScrollingBox>,
  );
  await userEvent.tab();
  await expect.element(region()).toHaveFocus();
  const box = region().element();

  await screen.rerender(
    <ScrollingBox>
      <Lines count={2} />
    </ScrollingBox>,
  );
  await expect.poll(() => box.scrollHeight <= box.clientHeight).toBe(true);
  await nextFrame();
  await nextFrame();

  await expect.element(region()).toHaveFocus();
  await userEvent.tab();
  await expect.element(nextButton()).toHaveFocus();
  await expect.poll(() => page.getByRole("region").query()).toBeNull();
});

test("adds no tab stop to content that fits in a region shown again after one removed while it held the focus", async () => {
  const screen = await render(
    <ScrollingBox>
      <Lines count={40} />
    </ScrollingBox>,
  );
  await userEvent.tab();
  await expect.element(region()).toHaveFocus();

  await screen.rerender(
    <ScrollingBox shown={false}>
      <Lines count={40} />
    </ScrollingBox>,
  );
  await screen.rerender(
    <ScrollingBox>
      <Lines count={2} />
    </ScrollingBox>,
  );
  await expect.element(page.getByText("Línea 2", { exact: true })).toBeVisible();

  expect(page.getByRole("region").query()).toBeNull();
  await userEvent.tab();
  await expect.element(nextButton()).toHaveFocus();
});
