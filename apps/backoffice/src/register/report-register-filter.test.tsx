import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import {
  BACK_REGISTER_ID,
  FRONT_REGISTER_ID,
  registers,
} from "../shell/test-support/report-fixtures";
import { ReportRegisterFilter } from "./report-register-filter";
import type { ReportRegisterFilterServices } from "./report-register-filter-services";

function createServices(): ReportRegisterFilterServices {
  return { fetchReportRegisters: vi.fn().mockResolvedValue({ kind: "ok", value: registers }) };
}

type Handlers = {
  value?: string;
  onChange?: (register: string) => void;
  onSessionEnded?: () => void;
};

function ControlledFilter({
  services,
  value: initial = "ALL",
  onChange = () => {},
  onSessionEnded = () => {},
}: Handlers & { services: ReportRegisterFilterServices }) {
  const [value, setValue] = useState(initial);
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <ReportRegisterFilter
          value={value}
          onChange={(next) => {
            onChange(next);
            setValue(next);
          }}
          onSessionEnded={onSessionEnded}
          services={services}
        />
      </main>
    </FieldSizeProvider>
  );
}

function renderFilter(services: ReportRegisterFilterServices, handlers: Handlers = {}) {
  return render(<ControlledFilter services={services} {...handlers} />);
}

test("offers every register of the branch by name and reports the one chosen", async () => {
  const onChange = vi.fn();
  const screen = await renderFilter(createServices(), { onChange });

  await userEvent.click(screen.getByRole("button", { name: /Caja:/ }));
  await expect.element(screen.getByRole("option", { name: "Caja principal" })).toBeVisible();
  const options = screen
    .getByRole("option")
    .elements()
    .map((option) => option.textContent);
  await userEvent.click(screen.getByRole("option", { name: "Caja principal" }));

  expect(options).toEqual(["Todas", "Caja del fondo", "Caja principal"]);
  await expect.poll(() => onChange.mock.lastCall?.[0]).toBe(FRONT_REGISTER_ID);
  await expectNoAccessibilityViolations(screen.container);
});

test("shows the register it is given by its name", async () => {
  const screen = await renderFilter(createServices(), { value: BACK_REGISTER_ID });

  await expect.element(screen.getByRole("button", { name: "Caja: Caja del fondo" })).toBeVisible();
});

test("offers only all the registers when the registers cannot be listed", async () => {
  const services = createServices();
  vi.mocked(services.fetchReportRegisters).mockResolvedValue({ kind: "failed" });
  const screen = await renderFilter(services);

  await userEvent.click(screen.getByRole("button", { name: /Caja:/ }));

  await expect.element(screen.getByRole("option", { name: "Todas" })).toBeVisible();
  expect(screen.getByRole("option").elements()).toHaveLength(1);
});

test("keeps the register it is given when the registers cannot be listed", async () => {
  const services = createServices();
  vi.mocked(services.fetchReportRegisters).mockResolvedValue({ kind: "failed" });
  const onChange = vi.fn();

  const screen = await renderFilter(services, { value: BACK_REGISTER_ID, onChange });

  await expect.element(screen.getByRole("button", { name: "Caja: La elegida" })).toBeVisible();
  expect(onChange).not.toHaveBeenCalled();
});

test("shows the register it is given, never every register, while the registers load", async () => {
  const services = createServices();
  vi.mocked(services.fetchReportRegisters).mockReturnValue(new Promise(() => {}));

  const screen = await renderFilter(services, { value: BACK_REGISTER_ID });

  await expect.element(screen.getByRole("button", { name: "Caja: La elegida" })).toBeVisible();
});

test("goes back to every register when it is given one the branch does not have", async () => {
  const onChange = vi.fn();

  await renderFilter(createServices(), {
    value: "33333333-3333-4333-8333-333333333333",
    onChange,
  });

  await expect.poll(() => onChange.mock.lastCall?.[0]).toBe("ALL");
});

test("ends the session when the cloud says it is over", async () => {
  const services = createServices();
  vi.mocked(services.fetchReportRegisters).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderFilter(services, { onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});
