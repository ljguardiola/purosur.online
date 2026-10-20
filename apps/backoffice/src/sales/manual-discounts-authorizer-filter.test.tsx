import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { ManualDiscountsAuthorizerFilter } from "./manual-discounts-authorizer-filter";
import { ANA_USER_ID, BETO_USER_ID, manualDiscountsReport } from "./test-support/sales-fixtures";

type Handlers = {
  value?: string;
  authorizers?: (typeof manualDiscountsReport)["authorizers"] | undefined;
  onChange?: (authorizedBy: string) => void;
};

function ControlledFilter({ value: initial = "ALL", authorizers, onChange = () => {} }: Handlers) {
  const [value, setValue] = useState(initial);
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <ManualDiscountsAuthorizerFilter
          value={value}
          authorizers={authorizers}
          onChange={(next) => {
            onChange(next);
            setValue(next);
          }}
        />
      </main>
    </FieldSizeProvider>
  );
}

function renderFilter(handlers: Handlers = { authorizers: manualDiscountsReport.authorizers }) {
  return render(<ControlledFilter {...handlers} />);
}

test("offers everyone and each person who authorized a discount by name, and reports the one chosen", async () => {
  const onChange = vi.fn();
  const screen = await renderFilter({ authorizers: manualDiscountsReport.authorizers, onChange });

  await userEvent.click(screen.getByRole("button", { name: /Autorizante:/ }));
  await expect.element(screen.getByRole("option", { name: "Ana" })).toBeVisible();
  const options = screen
    .getByRole("option")
    .elements()
    .map((option) => option.textContent);
  await userEvent.click(screen.getByRole("option", { name: "Beto" }));

  expect(options).toEqual(["Todos", "Ana", "Beto", "Sin identificar"]);
  await expect.poll(() => onChange.mock.lastCall?.[0]).toBe(BETO_USER_ID);
  await expectNoAccessibilityViolations(screen.container);
});

test("orders the people by the name it shows, whatever order they come in", async () => {
  const screen = await renderFilter({
    authorizers: [
      { id: "66666666-6666-4666-8666-666666666666", name: null },
      { id: BETO_USER_ID, name: "Beto" },
      { id: ANA_USER_ID, name: "álvaro" },
    ],
  });

  await userEvent.click(screen.getByRole("button", { name: /Autorizante:/ }));
  await expect.element(screen.getByRole("option", { name: "Beto" })).toBeVisible();
  const options = screen
    .getByRole("option")
    .elements()
    .map((option) => option.textContent);

  expect(options).toEqual(["Todos", "álvaro", "Beto", "Sin identificar"]);
});

test("shows the person it is given by name", async () => {
  const screen = await renderFilter({
    value: ANA_USER_ID,
    authorizers: manualDiscountsReport.authorizers,
  });

  await expect.element(screen.getByRole("button", { name: "Autorizante: Ana" })).toBeVisible();
});

test("offers only everyone when nobody authorized a discount", async () => {
  const screen = await renderFilter({ authorizers: [] });

  await userEvent.click(screen.getByRole("button", { name: /Autorizante:/ }));

  await expect.element(screen.getByRole("option", { name: "Todos" })).toBeVisible();
  expect(screen.getByRole("option").elements()).toHaveLength(1);
});

test("shows the person it is given, never everyone, until the people are known", async () => {
  const onChange = vi.fn();

  const screen = await renderFilter({ value: BETO_USER_ID, authorizers: undefined, onChange });

  await expect
    .element(screen.getByRole("button", { name: "Autorizante: El elegido" }))
    .toBeVisible();
  expect(onChange).not.toHaveBeenCalled();
});

test("goes back to everyone when it is given a person who authorized nothing in the period", async () => {
  const onChange = vi.fn();

  await renderFilter({
    value: BETO_USER_ID,
    authorizers: [{ id: ANA_USER_ID, name: "Ana" }],
    onChange,
  });

  await expect.poll(() => onChange.mock.lastCall?.[0]).toBe("ALL");
});
