import { Trash2 } from "lucide-react";
import { useId } from "react";
import { ButtonContext } from "react-aria-components";
import { beforeEach, expect, test, vi } from "vitest";
import { cdp, page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { HOVER_DELAY_MS } from "../overlays/tooltip";
import { IconOnlyButton, type IconOnlyButtonProps } from "./icon-only-button";

beforeEach(async () => {
  await page.viewport(1280, 900);
  await cdp().send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 0, y: 0 });
  window.focus();
});

async function renderNamed(props: Partial<IconOnlyButtonProps> = {}) {
  const screen = await render(
    <IconOnlyButton name="Remove row" className="size-10" {...props}>
      <Trash2 aria-hidden="true" />
    </IconOnlyButton>,
  );
  return { screen, button: screen.getByRole("button", { name: "Remove row", exact: true }) };
}

test("shows its name as a tooltip when hovered", async () => {
  const { screen, button } = await renderNamed();

  await userEvent.hover(button);

  await expect.element(screen.getByRole("tooltip")).toHaveTextContent("Remove row");
});

test("shows its name as a tooltip when reached by keyboard", async () => {
  const { screen, button } = await renderNamed();

  await userEvent.tab();

  expect(document.activeElement).toBe(button.element());
  await expect.element(screen.getByRole("tooltip")).toHaveTextContent("Remove row");
});

test("shows its name as a tooltip when hovered while disabled", async () => {
  const { screen, button } = await renderNamed({ disabled: true });

  await userEvent.hover(button);

  await expect.element(screen.getByRole("tooltip")).toHaveTextContent("Remove row");
  await expect.element(button).toBeDisabled();
});

test("keeps a disabled button out of the tab order and unpressable", async () => {
  const onPress = vi.fn();
  const { button } = await renderNamed({ disabled: true, onPress });

  await userEvent.tab();
  button.element().dispatchEvent(new MouseEvent("click", { bubbles: true }));

  expect(document.activeElement).not.toBe(button.element());
  expect(onPress).not.toHaveBeenCalled();
});

type AccessibilityNode = {
  role?: { value?: string };
  name?: { value?: string };
  description?: { value?: string };
};

type FrameTree = { frame: { id: string }; childFrames?: FrameTree[] };

function frameIds(tree: FrameTree): string[] {
  return [tree.frame.id, ...(tree.childFrames ?? []).flatMap(frameIds)];
}

async function accessibilityNodesOfEveryFrame(): Promise<AccessibilityNode[]> {
  const session = cdp();
  await session.send("Accessibility.enable");
  const { frameTree } = (await session.send("Page.getFrameTree")) as { frameTree: FrameTree };
  const perFrame = await Promise.all(
    frameIds(frameTree).map(async (frameId) => {
      const { nodes } = (await session.send("Accessibility.getFullAXTree", { frameId })) as {
        nodes: AccessibilityNode[];
      };
      return nodes;
    }),
  );
  return perFrame.flat();
}

test("is not described by the tooltip that repeats its own name while the tooltip is open", async () => {
  const { screen } = await renderNamed();

  await userEvent.tab();
  await expect.element(screen.getByRole("tooltip")).toBeVisible();

  const nodes = await accessibilityNodesOfEveryFrame();
  const node = nodes.find(
    (candidate) => candidate.role?.value === "button" && candidate.name?.value === "Remove row",
  );
  expect(node).toBeDefined();
  expect(node?.description?.value ?? "").not.toBe("Remove row");
});

function InsideALabelledField() {
  const labelId = useId();
  return (
    <>
      <span id={labelId}>Expiry</span>
      <ButtonContext value={{ "aria-labelledby": labelId }}>
        <IconOnlyButton name="Open calendar" className="size-10">
          <Trash2 aria-hidden="true" />
        </IconOnlyButton>
      </ButtonContext>
    </>
  );
}

test("keeps its own name inside a field that passes it the field's label", async () => {
  const screen = await render(<InsideALabelledField />);

  const button = screen.getByRole("button", { name: "Open calendar", exact: true });

  await expect.element(button).toBeVisible();
  expect(button.element().hasAttribute("aria-labelledby")).toBe(false);
});

test("shows no tooltip once the pointer has pressed it, however soon after resting on it", async () => {
  const onPress = vi.fn();
  const { screen, button } = await renderNamed({ onPress });

  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  try {
    await userEvent.click(button);
    expect(onPress).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(HOVER_DELAY_MS * 2);
    await screen.rerender(
      <IconOnlyButton name="Remove row" className="size-10" onPress={onPress}>
        <Trash2 aria-hidden="true" />
      </IconOnlyButton>,
    );

    expect(screen.getByRole("tooltip").elements()).toHaveLength(0);
  } finally {
    vi.runAllTimers();
    vi.useRealTimers();
  }
});
