import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { useId, useState } from "react";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { UserPicker } from "./user-picker";

const USERS = [
  { id: "u2", first_name: "Bruno" },
  { id: "u3", first_name: "Ángela" },
  { id: "u1", first_name: "Ada" },
];

function Harness({
  initial = null,
  disabled = false,
}: {
  initial?: string | null;
  disabled?: boolean;
}) {
  const [chosen, setChosen] = useState<string | null>(initial);
  const headingId = useId();
  return (
    <>
      <h1 id={headingId}>¿Quién abre la caja?</h1>
      <UserPicker
        users={USERS}
        value={chosen}
        onChange={(user) => setChosen(user.id)}
        labelledBy={headingId}
        disabled={disabled}
      />
    </>
  );
}

describe("UserPicker", () => {
  it("offers one choice per user, ordered by first name", async () => {
    const screen = await render(<Harness />);

    const names = [...screen.container.querySelectorAll("input[type=radio]")].map(
      (radio) => radio.closest("label")?.textContent,
    );

    expect(names).toEqual(["AAda", "ÁÁngela", "BBruno"]);
    await expect
      .element(screen.getByRole("radiogroup", { name: "¿Quién abre la caja?" }))
      .toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("names each choice by the first name alone", async () => {
    const screen = await render(<Harness />);

    await expect.element(screen.getByRole("radio", { name: "Ada" })).toBeVisible();
    await expect.element(screen.getByRole("radio", { name: "Bruno" })).toBeVisible();
  });

  it("starts with nobody chosen", async () => {
    const screen = await render(<Harness />);

    await expect.element(screen.getByRole("radio", { name: "Ada" })).not.toBeChecked();
    await expect.element(screen.getByRole("radio", { name: "Bruno" })).not.toBeChecked();
  });

  it("chooses the user who is clicked, and only that one", async () => {
    const screen = await render(<Harness />);

    await userEvent.click(screen.getByText("Bruno"));
    await expect.element(screen.getByRole("radio", { name: "Bruno" })).toBeChecked();

    await userEvent.click(screen.getByText("Ada"));

    await expect.element(screen.getByRole("radio", { name: "Ada" })).toBeChecked();
    await expect.element(screen.getByRole("radio", { name: "Bruno" })).not.toBeChecked();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("marks the chosen user with a check", async () => {
    const screen = await render(<Harness initial="u1" />);

    const checks = [...screen.container.querySelectorAll("svg.lucide-check")];

    expect(checks).toHaveLength(1);
    expect(checks[0]?.closest("label")?.textContent).toContain("Ada");
  });

  it("lets the arrow keys move the choice, as any group of radio buttons", async () => {
    const screen = await render(<Harness initial="u1" />);
    screen.getByRole("radio", { name: "Ada" }).element().focus();

    await userEvent.keyboard("{ArrowDown}");

    await expect.element(screen.getByRole("radio", { name: "Ángela" })).toBeChecked();
  });

  it("keeps the choice while it is disabled", async () => {
    const screen = await render(<Harness initial="u1" disabled />);

    await userEvent.click(screen.getByText("Bruno"), { force: true });

    await expect.element(screen.getByRole("radio", { name: "Ada" })).toBeChecked();
    await expect.element(screen.getByRole("radio", { name: "Ada" })).toBeDisabled();
    await expect.element(screen.getByRole("radio", { name: "Bruno" })).toBeDisabled();
    await expect.element(screen.getByRole("radio", { name: "Bruno" })).not.toBeChecked();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("shows the initial of the first name in the avatar, in capitals", async () => {
    const screen = await render(
      <UserPicker
        users={[{ id: "u1", first_name: "ada" }]}
        value={null}
        onChange={() => {}}
        labelledBy="none"
      />,
    );

    expect(screen.container.querySelector("label")?.textContent).toBe("Aada");
  });

  it("shows nothing when there is nobody to choose", async () => {
    const screen = await render(
      <UserPicker users={[]} value={null} onChange={() => {}} labelledBy="none" />,
    );

    expect(screen.container.innerHTML).toBe("");
  });
});
