import { Check, Printer } from "lucide-react";
import { expect, expectTypeOf, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { TimedOfferCard, type TimedOfferCardProps } from "./timed-offer-card";

function renderCard(overrides: Partial<TimedOfferCardProps> = {}) {
  const onSkip = vi.fn();
  const onAccept = vi.fn();
  const props: TimedOfferCardProps = {
    icon: <Printer />,
    title: "¿Imprimir ticket?",
    skip: { label: "Omitir", onPress: onSkip },
    countdown: { remainingSeconds: 3, totalSeconds: 3, label: "Tiempo para imprimir" },
    accept: { label: "Sí", icon: <Check />, onPress: onAccept },
    ...overrides,
  };
  return { onSkip, onAccept, render: () => render(<TimedOfferCard {...props} />) };
}

test("is a group named by its title", async () => {
  const screen = await renderCard().render();

  await expect.element(screen.getByRole("group", { name: "¿Imprimir ticket?" })).toBeVisible();
  await expect.element(screen.getByText("¿Imprimir ticket?")).toBeVisible();
});

test("shows the countdown with the seconds that remain", async () => {
  const screen = await renderCard({
    countdown: { remainingSeconds: 2, totalSeconds: 3, label: "Tiempo para imprimir" },
  }).render();

  await expect.element(screen.getByRole("timer", { name: "Tiempo para imprimir" })).toBeVisible();
  await expect.element(screen.getByText("2 s")).toBeVisible();
});

test("offers to skip with the Esc key shown, and runs the skip when pressed", async () => {
  const { onSkip, render: renderIt } = renderCard();
  const screen = await renderIt();

  const skip = screen.getByRole("button", { name: "Omitir" });
  await expect.element(skip).toBeVisible();
  expect((skip.element() as HTMLElement).querySelector("kbd")?.textContent).toBe("Esc");
  await userEvent.click(skip);

  expect(onSkip).toHaveBeenCalledOnce();
});

test("shows the Esc key before the skip label", async () => {
  const screen = await renderCard().render();

  const skip = screen.getByRole("button", { name: "Omitir" });
  await expect.element(skip).toBeVisible();
  expect((skip.element() as HTMLElement).textContent).toBe("EscOmitir");
});

test("offers the primary action with the Enter key shown, and runs it when pressed", async () => {
  const { onAccept, render: renderIt } = renderCard();
  const screen = await renderIt();

  const accept = screen.getByRole("button", { name: "Sí" });
  await expect.element(accept).toBeVisible();
  expect((accept.element() as HTMLElement).querySelector("kbd")?.textContent).toBe("Enter");
  await userEvent.click(accept);

  expect(onAccept).toHaveBeenCalledOnce();
});

test("disables the skip as well while the primary action is disabled", async () => {
  const {
    onAccept,
    onSkip,
    render: renderIt,
  } = renderCard({
    accept: { label: "Sí", icon: <Check />, onPress: () => {}, disabled: true },
  });
  const screen = await renderIt();

  await expect.element(screen.getByRole("button", { name: "Sí" })).toBeDisabled();
  await expect.element(screen.getByRole("button", { name: "Omitir" })).toBeDisabled();
  expect(onAccept).not.toHaveBeenCalled();
  expect(onSkip).not.toHaveBeenCalled();
});

test("has no accessibility violations", async () => {
  const screen = await renderCard().render();

  await expectNoAccessibilityViolations(screen.container);
});

test("does not accept a card without its texts", () => {
  expectTypeOf<Omit<TimedOfferCardProps, "title">>().not.toExtend<TimedOfferCardProps>();
  expectTypeOf<Omit<TimedOfferCardProps, "skip">>().not.toExtend<TimedOfferCardProps>();
  expectTypeOf<Omit<TimedOfferCardProps, "accept">>().not.toExtend<TimedOfferCardProps>();
});
