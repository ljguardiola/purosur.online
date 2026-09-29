import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { RoleSaveConfirmationModal } from "./role-save-confirmation-modal";

const assignedUsers = [
  { id: "user-amara", name: "Amara Ortiz" },
  { id: "user-zoe", name: "Zoe Almeida" },
];

function renderModal(handlers: { onBack?: () => void; onConfirm?: () => void } = {}) {
  return render(
    <main>
      <RoleSaveConfirmationModal
        open
        roleName="Depósito"
        assignedUsers={assignedUsers}
        submitting={false}
        onBack={handlers.onBack ?? (() => {})}
        onConfirm={handlers.onConfirm ?? (() => {})}
      />
    </main>,
  );
}

test("lists the names of the people the role applies to, under how many they are and the role's name", async () => {
  const screen = await renderModal();

  await expect.element(screen.getByText("¿Guardar los cambios?")).toBeVisible();
  await expect
    .element(screen.getByText("Se aplican a las 2 personas con el rol Depósito:"))
    .toBeVisible();
  await expect.element(screen.getByText("Amara Ortiz")).toBeVisible();
  await expect.element(screen.getByText("Zoe Almeida")).toBeVisible();
});

test("has no accessibility violations", async () => {
  const screen = await renderModal();

  await expect.element(screen.getByText("¿Guardar los cambios?")).toBeVisible();
  await expectNoAccessibilityViolations(document.body);
});

test("draws as one centered column, 12px apart, with only Volver and Guardar los cambios, and Escape still goes back", async () => {
  const onBack = vi.fn();
  const onConfirm = vi.fn();
  const screen = await renderModal({ onBack, onConfirm });
  const confirmation = screen.getByRole("dialog", { name: "¿Guardar los cambios?" });
  await expect.element(confirmation).toBeVisible();

  const buttonNames = Array.from(
    (confirmation.element() as HTMLElement).querySelectorAll("button"),
    (button) => button.textContent,
  );
  expect(buttonNames).toEqual(["Volver", "Guardar los cambios"]);
  const title = confirmation.getByRole("heading").element().getBoundingClientRect();
  const text = confirmation
    .getByText(/^Se aplican/)
    .element()
    .getBoundingClientRect();
  const names = (confirmation.getByText("Amara Ortiz").element().parentElement as HTMLElement)
    .parentElement as HTMLElement;
  expect(text.top - title.bottom).toBeCloseTo(12, 0);
  expect(names.getBoundingClientRect().top - text.bottom).toBeCloseTo(12, 0);

  await userEvent.keyboard("{Escape}");

  await expect.poll(() => onBack.mock.calls.length).toBe(1);
  expect(onConfirm).not.toHaveBeenCalled();
});
