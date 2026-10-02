import { useId, useState } from "react";
import { expect, expectTypeOf, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { insetBoundary, tokenRgb } from "../../test/token-colors";
import { AvatarOptionCardGroup, type AvatarOptionCardGroupProps } from "./avatar-option-card-group";
import type { NarrowedOption } from "./option";

type PersonValue = "ada" | "bruno" | "carla";

const options: [
  NarrowedOption<PersonValue>,
  NarrowedOption<PersonValue>,
  NarrowedOption<PersonValue>,
] = [
  { value: "ada", label: "Ada" },
  { value: "bruno", label: "Bruno" },
  { value: "carla", label: "Carla" },
];

type Screen = Awaited<ReturnType<typeof render>>;

function Harness({
  initial = null,
  disabled = false,
  choices = options,
}: {
  initial?: PersonValue | null;
  disabled?: boolean;
  choices?: AvatarOptionCardGroupProps<PersonValue>["options"];
}) {
  const [chosen, setChosen] = useState<PersonValue | null>(initial);
  const headingId = useId();
  return (
    <>
      <h1 id={headingId}>¿Quién sos?</h1>
      <AvatarOptionCardGroup
        labelledBy={headingId}
        options={choices}
        value={chosen}
        onChange={setChosen}
        disabled={disabled}
      />
    </>
  );
}

function radioCard(screen: Screen, name: string): HTMLElement {
  return screen.getByRole("radio", { name }).element().closest("label") as HTMLElement;
}

test("renders one radio per option in the order given, in a group named by the heading it references", async () => {
  const screen = await render(<Harness />);

  const names = [...screen.container.querySelectorAll("input[type=radio]")].map((radio) =>
    radio.getAttribute("aria-label"),
  );

  expect(names).toEqual(["Ada", "Bruno", "Carla"]);
  await expect.element(screen.getByRole("radiogroup", { name: "¿Quién sos?" })).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("names each choice by its label alone", async () => {
  const screen = await render(<Harness />);

  await expect.element(screen.getByRole("radio", { name: "Ada", exact: true })).toBeVisible();
  await expect.element(screen.getByRole("radio", { name: "Bruno", exact: true })).toBeVisible();
});

test("shows the capital initial of the label in the avatar", async () => {
  const screen = await render(<Harness choices={[{ value: "ada", label: "ada" }]} />);

  expect(radioCard(screen, "ada").textContent).toBe("Aada");
});

test("starts with nothing chosen when it is given no value", async () => {
  const screen = await render(<Harness />);

  for (const option of options) {
    await expect.element(screen.getByRole("radio", { name: option.label })).not.toBeChecked();
  }
});

test("chooses the option that is clicked, and only that one", async () => {
  const screen = await render(<Harness />);

  await userEvent.click(screen.getByText("Bruno"));
  await expect.element(screen.getByRole("radio", { name: "Bruno" })).toBeChecked();

  await userEvent.click(screen.getByText("Ada"));

  await expect.element(screen.getByRole("radio", { name: "Ada" })).toBeChecked();
  await expect.element(screen.getByRole("radio", { name: "Bruno" })).not.toBeChecked();
  await expectNoAccessibilityViolations(screen.container);
});

test("marks only the chosen card with a check", async () => {
  const screen = await render(<Harness initial="ada" />);

  const checks = [...screen.container.querySelectorAll("svg.lucide-check")];

  expect(checks).toHaveLength(1);
  expect(checks[0]?.closest("label")?.textContent).toContain("Ada");
});

test("lets the arrow keys move the choice, as any group of radio buttons", async () => {
  const screen = await render(<Harness initial="ada" />);
  screen.getByRole("radio", { name: "Ada" }).element().focus();

  await userEvent.keyboard("{ArrowDown}");

  await expect.element(screen.getByRole("radio", { name: "Bruno" })).toBeChecked();
});

test("keeps the choice and disables every radio while it is disabled", async () => {
  const screen = await render(<Harness initial="ada" disabled />);

  await userEvent.click(screen.getByText("Bruno"), { force: true });

  await expect.element(screen.getByRole("radio", { name: "Ada" })).toBeChecked();
  for (const option of options) {
    await expect.element(screen.getByRole("radio", { name: option.label })).toBeDisabled();
  }
  await expect.element(screen.getByRole("radio", { name: "Bruno" })).not.toBeChecked();
  await expectNoAccessibilityViolations(screen.container);
});

test("draws each card 60px tall with an 8px radius, a hand cursor and a 1px border ring when not chosen", async () => {
  const screen = await render(<Harness initial="bruno" />);
  const card = radioCard(screen, "Ada");
  const style = getComputedStyle(card);

  expect(card.getBoundingClientRect().height).toBeCloseTo(60, 0);
  expect(style.borderRadius).toBe("8px");
  expect(style.cursor).toBe("pointer");
  expect(style.backgroundColor).toBe(tokenRgb("surface"));
  expect(style.boxShadow).toContain(insetBoundary("border", "1px"));
});

test("draws the chosen card with the action background and a 2px action ring", async () => {
  const screen = await render(<Harness initial="ada" />);
  const style = getComputedStyle(radioCard(screen, "Ada"));

  expect(style.backgroundColor).toBe(tokenRgb("action-subtle"));
  expect(style.boxShadow).toContain(insetBoundary("action", "2px"));
});

test("truncates a long label inside a narrow container instead of overflowing it", async () => {
  const longLabel = "Una persona con un nombre larguísimo que no entra en la tarjeta";
  const screen = await render(
    <div style={{ width: "200px" }}>
      <Harness choices={[{ value: "ada", label: longLabel }]} />
    </div>,
  );
  const card = radioCard(screen, longLabel);
  const label = [...card.querySelectorAll("span")].find((span) => span.textContent === longLabel);

  expect(card.getBoundingClientRect().right).toBeLessThanOrEqual(200);
  expect(label?.scrollWidth).toBeGreaterThan(label?.clientWidth ?? 0);
  expect(getComputedStyle(label as HTMLElement).textOverflow).toBe("ellipsis");
});

test("does not accept an option without a label", () => {
  expectTypeOf<[{ value: "ada" }]>().not.toExtend<
    AvatarOptionCardGroupProps<PersonValue>["options"]
  >();
});
