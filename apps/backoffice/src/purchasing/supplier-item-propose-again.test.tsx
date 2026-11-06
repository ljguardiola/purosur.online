import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ProposeAgainButton, ProposeAgainFailure } from "./supplier-item-propose-again";

const proposeAgain = "Volver a proponer";

test("asks for a new proposal once the proposal is loaded", async () => {
  const onPress = vi.fn();
  const screen = await render(
    <ProposeAgainButton dataStatus="loaded" refreshing={false} onPress={onPress} />,
  );

  await userEvent.click(screen.getByRole("button", { name: proposeAgain }));

  expect(onPress).toHaveBeenCalledTimes(1);
});

test.each(["loading", "failed"] as const)(
  "stays in place, disabled, while the proposal is %s",
  async (dataStatus) => {
    const screen = await render(
      <ProposeAgainButton dataStatus={dataStatus} refreshing={false} onPress={() => {}} />,
    );

    await expect.element(screen.getByRole("button", { name: proposeAgain })).toBeDisabled();
  },
);

test("is disabled while the new proposal is being asked", async () => {
  const screen = await render(
    <ProposeAgainButton dataStatus="loaded" refreshing onPress={() => {}} />,
  );

  await expect.element(screen.getByRole("button", { name: proposeAgain })).toBeDisabled();
});

test("says only that the new proposal could not be made", async () => {
  const screen = await render(<ProposeAgainFailure />);

  await expect.element(screen.getByText("No pudimos volver a proponer").first()).toBeVisible();
  expect(screen.container.textContent?.replaceAll("No pudimos volver a proponer", "").trim()).toBe(
    "",
  );
});
