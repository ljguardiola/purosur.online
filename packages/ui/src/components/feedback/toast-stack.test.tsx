import { Printer, TriangleAlert, Undo2 } from "lucide-react";
import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { ToastStack, type ToastStackProps } from "./toast-stack";

const REFUND: ToastStackProps["toasts"][number] = {
  id: "refund",
  tone: "success",
  icon: <Undo2 />,
  title: "Payment turned into a refund",
  description: "It is confirmed later in the back office.",
  onDismiss: () => {},
};
const PRINT: ToastStackProps["toasts"][number] = {
  id: "print",
  tone: "success",
  icon: <Printer />,
  title: "The ticket prints once the printer is ready",
  description: "It comes out as the original.",
  onDismiss: () => {},
};
const REFUSAL: ToastStackProps["toasts"][number] = {
  id: "refusal",
  tone: "error",
  icon: <TriangleAlert />,
  title: "The card type is still missing",
  description: "Try again later.",
  onDismiss: () => {},
};

function stack(toasts: ToastStackProps["toasts"]) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "900px", height: "600px" }}>
      <ToastStack toasts={toasts}>
        <div data-testid="content" style={{ flex: 1 }}>
          Pending items
        </div>
      </ToastStack>
    </div>
  );
}

test("shows the content it floats over", async () => {
  const screen = await render(stack([]));

  await expect.element(screen.getByText("Pending items")).toBeVisible();
});

test("shows every toast it is given, one above the next in the order given", async () => {
  const screen = await render(stack([REFUND, PRINT, REFUSAL]));

  const tops = [REFUND, PRINT, REFUSAL].map(
    ({ title }) => screen.getByText(title).element().getBoundingClientRect().top,
  );
  expect(tops).toEqual([...tops].sort((a, b) => a - b));
  expect(new Set(tops).size).toBe(3);
});

test("places its toasts over the bottom left of its content, inside it", async () => {
  const screen = await render(stack([REFUND, REFUSAL]));
  const content = screen.getByTestId("content").element().getBoundingClientRect();
  const first = screen.getByRole("status").element().parentElement?.getBoundingClientRect();
  const last = screen.getByRole("alert").element().parentElement?.getBoundingClientRect();

  expect(first?.left).toBe(content.left);
  expect(first?.top).toBeGreaterThan(content.top + content.height / 2);
  expect(last?.bottom).toBeLessThan(content.bottom);
});

test("has no accessibility violations", async () => {
  const screen = await render(stack([REFUND, REFUSAL]));

  await expectNoAccessibilityViolations(screen.container);
});
