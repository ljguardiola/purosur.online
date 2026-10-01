import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { act, StrictMode } from "react";
import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import type { RegisterSummary } from "./registers-api";
import { RegistersListScreen } from "./registers-list-screen";
import type { RegistersListScreenServices } from "./registers-list-services";
import {
  createServices,
  grantAuthorization,
  register1,
  register2,
  renderScreen,
} from "./test-support/registers-list-screen";

test("shows the breadcrumb, heading, each register's name and count", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValue({
    kind: "ok",
    value: [register1, register2],
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Configuración")).toBeVisible();
  await expect
    .element(screen.getByRole("heading", { name: "Cajas registradoras", level: 1 }))
    .toBeVisible();
  await expect.element(screen.getByText("Caja 1")).toBeVisible();
  await expect.element(screen.getByText("Caja 2")).toBeVisible();
  await expect.element(screen.getByText("2 cajas")).toBeVisible();
});

test("shows Sin instalación and the Esperando alta tag for every register", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValue({ kind: "ok", value: [register1] });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Sin instalación")).toBeVisible();
  await expect.element(screen.getByText("Esperando alta")).toBeVisible();
});

test("shows a configured register's point of sale as the tax authority prints it", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValue({ kind: "ok", value: [register2] });

  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("columnheader", { name: "Punto de venta" })).toBeVisible();
  await expect.element(screen.getByText("00003")).toBeVisible();
  await expect.element(screen.getByText("Sin configurar")).not.toBeInTheDocument();
});

test("shows Sin configurar for a register without a point of sale", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValue({ kind: "ok", value: [register1] });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Sin configurar")).toBeVisible();
  await expect.element(screen.getByText("00003")).not.toBeInTheDocument();
});

test("shows the elapsed and remaining time for a register with a pending code", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValue({ kind: "ok", value: [register2] });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Código emitido hace 4 minutos")).toBeVisible();
  await expect.element(screen.getByText("Vence en 11 minutos")).toBeVisible();
});

test("shows recién for a code issued less than a minute ago", async () => {
  const services = createServices();
  const justIssued: RegisterSummary = {
    id: "register-3",
    name: "Caja 3",
    pendingCode: { secondsSinceIssued: 20, secondsUntilExpiry: 880 },
  };
  vi.mocked(services.fetchRegisters).mockResolvedValue({ kind: "ok", value: [justIssued] });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Código emitido recién")).toBeVisible();
});

test("counts a pending code down every 30 seconds from the cloud's answer without reading the list again", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValue({ kind: "ok", value: [register2] });
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  try {
    const screen = await renderScreen(services);
    await expect.element(screen.getByText("Vence en 11 minutos")).toBeVisible();

    vi.advanceTimersByTime(60_000);

    await expect.element(screen.getByText("Código emitido hace 5 minutos")).toBeVisible();
    await expect.element(screen.getByText("Vence en 10 minutos")).toBeVisible();
    expect(services.fetchRegisters).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
  }
});

test("stops showing a pending code once the remaining time the cloud gave runs out", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValue({
    kind: "ok",
    value: [{ ...register2, pendingCode: { secondsSinceIssued: 870, secondsUntilExpiry: 30 } }],
  });
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  try {
    const screen = await renderScreen(services);
    await expect.element(screen.getByText("Vence en 1 minuto")).toBeVisible();

    vi.advanceTimersByTime(30_000);

    await expect.poll(() => screen.getByText(/^Vence en/).query()).toBeNull();
    await expect.poll(() => screen.getByText(/^Código emitido/).query()).toBeNull();
    await expect.element(screen.getByText("—")).toBeVisible();
  } finally {
    vi.useRealTimers();
  }
});

test("restarts the countdown from the cloud's new answer once the list is read again", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters)
    .mockResolvedValueOnce({ kind: "ok", value: [register2] })
    .mockResolvedValueOnce({
      kind: "ok",
      value: [{ ...register2, pendingCode: { secondsSinceIssued: 0, secondsUntilExpiry: 900 } }],
    });
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  try {
    const screen = await renderScreen(services);
    await expect.element(screen.getByText("Vence en 11 minutos")).toBeVisible();
    vi.advanceTimersByTime(60_000);
    await expect.element(screen.getByText("Vence en 10 minutos")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Refrescar" }));

    await expect.element(screen.getByText("Código emitido recién")).toBeVisible();
    await expect.element(screen.getByText("Vence en 15 minutos")).toBeVisible();
  } finally {
    vi.useRealTimers();
  }
});

test.each([
  {
    answer: { secondsSinceIssued: 870, secondsUntilExpiry: 30 },
    shownUntilTick: "Vence en 1 minuto",
    shownAfterTick: "—",
  },
  {
    answer: { secondsSinceIssued: 30, secondsUntilExpiry: 870 },
    shownUntilTick: "Código emitido recién",
    shownAfterTick: "Código emitido hace 1 minuto",
  },
])(
  "counts the 30 seconds of each tick from the cloud's latest answer, showing $shownUntilTick until then",
  async ({ answer, shownUntilTick, shownAfterTick }) => {
    const services = createServices();
    vi.mocked(services.fetchRegisters)
      .mockResolvedValueOnce({ kind: "ok", value: [register2] })
      .mockResolvedValueOnce({ kind: "ok", value: [{ ...register2, pendingCode: answer }] });
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      const screen = await renderScreen(services);
      await expect.element(screen.getByText("Vence en 11 minutos")).toBeVisible();
      vi.advanceTimersByTime(29_000);
      await userEvent.click(screen.getByRole("button", { name: "Refrescar" }));
      await expect.element(screen.getByText(shownUntilTick)).toBeVisible();

      await act(async () => {
        vi.advanceTimersByTime(1_000);
      });
      expect(screen.getByText(shownAfterTick).query()).toBeNull();
      await expect.element(screen.getByText(shownUntilTick)).toBeVisible();

      vi.advanceTimersByTime(29_000);
      await expect.element(screen.getByText(shownAfterTick)).toBeVisible();
    } finally {
      vi.useRealTimers();
    }
  },
);

test("shows an empty state when there are no registers yet", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValue({ kind: "ok", value: [] });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Todavía no hay cajas registradoras")).toBeVisible();
});

test("shows no count under the empty state", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValue({ kind: "ok", value: [] });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Todavía no hay cajas registradoras")).toBeVisible();
  await expect.element(screen.getByText("0 cajas")).not.toBeInTheDocument();
});

test("shows loading placeholders while the first read runs", async () => {
  const services = createServices();
  const firstLoad = deferred<Awaited<ReturnType<RegistersListScreenServices["fetchRegisters"]>>>();
  vi.mocked(services.fetchRegisters).mockReturnValueOnce(firstLoad.promise);

  const screen = await renderScreen(services);

  await expect
    .element(screen.getByRole("table", { name: "Cajas registradoras" }))
    .toHaveAttribute("aria-busy", "true");
  expect(screen.getByText("Todavía no hay cajas registradoras").query()).toBeNull();
  firstLoad.resolve({ kind: "ok", value: [register1] });
  await expect.element(screen.getByText("Caja 1")).toBeVisible();
});

test("retrying a failed load starts again from the loading placeholders", async () => {
  const services = createServices();
  const retry = deferred<Awaited<ReturnType<RegistersListScreenServices["fetchRegisters"]>>>();
  vi.mocked(services.fetchRegisters)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockReturnValueOnce(retry.promise);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No pudimos abrir las cajas registradoras")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect
    .element(screen.getByText("No pudimos abrir las cajas registradoras"))
    .not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("table", { name: "Cajas registradoras" }))
    .toHaveAttribute("aria-busy", "true");
  retry.resolve({ kind: "ok", value: [register1] });
  await expect.element(screen.getByText("Caja 1")).toBeVisible();
});

test("the create action stays available while the registers load and after they fail to load", async () => {
  const services = createServices();
  const firstLoad = deferred<Awaited<ReturnType<RegistersListScreenServices["fetchRegisters"]>>>();
  vi.mocked(services.fetchRegisters).mockReturnValueOnce(firstLoad.promise);
  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("button", { name: "Nueva caja" })).toBeEnabled();

  firstLoad.resolve({ kind: "failed" });
  await expect.element(screen.getByText("No pudimos abrir las cajas registradoras")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Nueva caja" })).toBeEnabled();
});

test("an older read never replaces a newer one", async () => {
  const services = createServices();
  const older = deferred<Awaited<ReturnType<RegistersListScreenServices["fetchRegisters"]>>>();
  const newer = deferred<Awaited<ReturnType<RegistersListScreenServices["fetchRegisters"]>>>();
  vi.mocked(services.fetchRegisters)
    .mockResolvedValueOnce({ kind: "ok", value: [register1] })
    .mockReturnValueOnce(older.promise)
    .mockReturnValueOnce(newer.promise);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Caja 1")).toBeVisible();
  (screen.getByRole("button", { name: "Refrescar" }).element() as HTMLElement).click();
  await expect.poll(() => vi.mocked(services.fetchRegisters).mock.calls.length).toBe(2);
  (screen.getByRole("button", { name: "Refrescar" }).element() as HTMLElement).click();
  await expect.poll(() => vi.mocked(services.fetchRegisters).mock.calls.length).toBe(3);

  newer.resolve({ kind: "ok", value: [register2] });
  await expect.element(screen.getByText("Caja 2")).toBeVisible();
  older.resolve({ kind: "ok", value: [register1, register2] });
  await expect.element(screen.getByLabelText("Lecturas en curso")).toHaveTextContent("0");

  await expect.element(screen.getByText("1 caja")).toBeVisible();
  expect(screen.getByText("Caja 1").query()).toBeNull();
});

test("shows a load error with a retry action when the registers fail to load", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({ kind: "failed" });
  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No pudimos abrir las cajas registradoras")).toBeVisible();

  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({ kind: "ok", value: [register1] });
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("1 caja")).toBeVisible();
});

test("shows the rate-limited notice with a retry action", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(screen.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Reintentar" })).toBeVisible();
});

test("navigates to Mi cuenta when the registers request comes back forbidden", async () => {
  window.history.pushState(null, "", "/registers");
  try {
    const services = createServices();
    vi.mocked(services.fetchRegisters).mockResolvedValue({ kind: "forbidden" });

    await renderScreen(services);

    await expect.poll(() => window.location.pathname).toBe("/account");
  } finally {
    window.history.pushState(null, "", "/");
  }
});

test("ends the session when the registers request finds no open session", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, onSessionEnded);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

async function openNewRegisterModal(screen: Awaited<ReturnType<typeof renderScreen>>) {
  await userEvent.click(screen.getByRole("button", { name: "Nueva caja" }));
  return screen.getByRole("dialog");
}

test("opens the create modal, and cancel closes it without calling the API", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValue({ kind: "ok", value: [] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Todavía no hay cajas registradoras")).toBeVisible();

  const dialog = await openNewRegisterModal(screen);
  await expect.element(dialog.getByRole("heading", { name: "Nueva caja" })).toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(services.createRegister).not.toHaveBeenCalled();
});

test("creates a register and shows it in the list", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({ kind: "ok", value: [register1] });
  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({
    kind: "ok",
    value: [
      register1,
      { id: "register-3", name: "Caja 3", pendingCode: null, pointOfSaleNumber: null },
    ],
  });
  vi.mocked(services.createRegister).mockResolvedValue({ kind: "ok" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 caja")).toBeVisible();
  const dialog = await openNewRegisterModal(screen);

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre de la caja/ }), "Caja 3");
  await userEvent.click(dialog.getByRole("button", { name: "Crear la caja" }));

  await expect.poll(() => vi.mocked(services.createRegister).mock.calls.length).toBe(1);
  expect(services.createRegister).toHaveBeenCalledWith({ name: "Caja 3" });
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("Caja 3")).toBeVisible();
  await expect.element(screen.getByText("2 cajas")).toBeVisible();
});

test("shows a created register in the same order the server lists registers", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({ kind: "ok", value: [register2] });
  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({
    kind: "ok",
    value: [register1, register2],
  });
  vi.mocked(services.createRegister).mockResolvedValue({ kind: "ok" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 caja")).toBeVisible();
  const dialog = await openNewRegisterModal(screen);

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre de la caja/ }), "Caja 1");
  await userEvent.click(dialog.getByRole("button", { name: "Crear la caja" }));

  await expect.element(screen.getByText("2 cajas")).toBeVisible();
  const rowNames = screen
    .getByRole("row")
    .all()
    .map((row) => row.element().textContent ?? "")
    .map((text) => text.match(/Caja \d/)?.[0])
    .filter((name) => name !== undefined);
  expect(rowNames).toEqual(["Caja 1", "Caja 2"]);
});

async function openEmitModal(screen: Awaited<ReturnType<typeof renderScreen>>, name: string) {
  await userEvent.click(screen.getByRole("button", { name: `Emitir código de alta para ${name}` }));
  return screen.getByRole("dialog", { name: "Código de alta" });
}

test("the row action emits a code for that register and shows it in the code modal", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValue({ kind: "ok", value: [register1] });
  const pendingEmission =
    deferred<Awaited<ReturnType<RegistersListScreenServices["emitEnrollmentCode"]>>>();
  vi.mocked(services.emitEnrollmentCode).mockReturnValue(pendingEmission.promise);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Caja 1")).toBeVisible();

  const dialog = await openEmitModal(screen, "Caja 1");

  await expect.element(dialog.getByText("Emitiendo el código…")).toBeVisible();
  pendingEmission.resolve({
    kind: "ok",
    value: { code: "P4NX7KWE2QRT8MZD", expiresAt: "2026-09-25T12:15:00.000Z" },
  });
  await expect.element(dialog.getByText("P4NX 7KWE 2QRT 8MZD")).toBeVisible();
  expect(services.emitEnrollmentCode).toHaveBeenCalledWith("register-1");
});

test("emit's not_found closes the modal and refreshes the list", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({ kind: "ok", value: [register1] });
  vi.mocked(services.emitEnrollmentCode).mockResolvedValue({ kind: "not_found" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Caja 1")).toBeVisible();
  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({ kind: "ok", value: [register2] });

  await userEvent.click(screen.getByRole("button", { name: "Emitir código de alta para Caja 1" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.poll(() => vi.mocked(services.fetchRegisters).mock.calls.length).toBe(2);
  await expect.element(screen.getByText("Caja 2")).toBeVisible();
});

test("under StrictMode, clicking the row action emits the code exactly once and shows that call's code", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValue({ kind: "ok", value: [register1] });
  vi.mocked(services.emitEnrollmentCode).mockResolvedValue({
    kind: "ok",
    value: { code: "P4NX7KWE2QRT8MZD", expiresAt: "2026-09-25T12:15:00.000Z" },
  });
  const screen = await render(
    <StrictMode>
      <main>
        <RegistersListScreen services={services} onSessionEnded={() => {}} />
      </main>
    </StrictMode>,
  );
  await expect.element(screen.getByText("Caja 1")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Emitir código de alta para Caja 1" }));

  const dialog = screen.getByRole("dialog", { name: "Código de alta" });
  await expect.element(dialog.getByText("P4NX 7KWE 2QRT 8MZD")).toBeVisible();
  expect(services.emitEnrollmentCode).toHaveBeenCalledTimes(1);
});

test("Listo closes the code modal and refreshes the list", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({ kind: "ok", value: [register1] });
  vi.mocked(services.emitEnrollmentCode).mockResolvedValue({
    kind: "ok",
    value: { code: "P4NX7KWE2QRT8MZD", expiresAt: "2026-09-25T12:15:00.000Z" },
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Caja 1")).toBeVisible();
  const dialog = await openEmitModal(screen, "Caja 1");
  await expect.element(dialog.getByText("P4NX 7KWE 2QRT 8MZD")).toBeVisible();
  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({ kind: "ok", value: [register2] });

  await userEvent.click(dialog.getByRole("button", { name: "Listo" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.poll(() => vi.mocked(services.fetchRegisters).mock.calls.length).toBe(2);
  await expect.element(screen.getByText("Caja 2")).toBeVisible();
});

test("shows the pending code the cloud reports once the code modal closes", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({ kind: "ok", value: [register1] });
  vi.mocked(services.emitEnrollmentCode).mockResolvedValue({
    kind: "ok",
    value: { code: "P4NX7KWE2QRT8MZD", expiresAt: "2026-09-25T12:15:00.000Z" },
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Caja 1")).toBeVisible();
  const dialog = await openEmitModal(screen, "Caja 1");
  await expect.element(dialog.getByText("P4NX 7KWE 2QRT 8MZD")).toBeVisible();
  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({
    kind: "ok",
    value: [{ ...register1, pendingCode: { secondsSinceIssued: 0, secondsUntilExpiry: 900 } }],
  });

  await userEvent.click(dialog.getByRole("button", { name: "Listo" }));

  await expect.element(screen.getByText("Código emitido recién")).toBeVisible();
  await expect.element(screen.getByText("Vence en 15 minutos")).toBeVisible();
});

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

type CloseCodeModalCase = {
  name: string;
  arrange: (services: RegistersListScreenServices) => void;
  close: (
    screen: Awaited<ReturnType<typeof renderScreen>>,
    dialog: Awaited<ReturnType<typeof openEmitModal>>,
  ) => Promise<void>;
};

test.each<CloseCodeModalCase>([
  {
    name: "an issued code's modal with the close button",
    arrange: (services) => {
      vi.mocked(services.emitEnrollmentCode).mockResolvedValue({
        kind: "ok",
        value: { code: "P4NX7KWE2QRT8MZD", expiresAt: "2026-09-25T12:15:00.000Z" },
      });
    },
    close: async (_screen, dialog) => {
      await expect.element(dialog.getByText("P4NX 7KWE 2QRT 8MZD")).toBeVisible();
      // The modal is wider than the default phone-sized viewport, leaving its close button
      // outside it and unclickable.
      await page.viewport(1280, 900);
      try {
        await userEvent.click(dialog.getByRole("button", { name: "Cerrar" }));
      } finally {
        await page.viewport(414, 896);
      }
    },
  },
  {
    name: "an issued code's modal with Escape",
    arrange: (services) => {
      vi.mocked(services.emitEnrollmentCode).mockResolvedValue({
        kind: "ok",
        value: { code: "P4NX7KWE2QRT8MZD", expiresAt: "2026-09-25T12:15:00.000Z" },
      });
    },
    close: async (_screen, dialog) => {
      await expect.element(dialog.getByText("P4NX 7KWE 2QRT 8MZD")).toBeVisible();
      await userEvent.keyboard("{Escape}");
    },
  },
  {
    name: "the code modal with Escape after a failed emission",
    arrange: (services) => {
      vi.mocked(services.emitEnrollmentCode).mockResolvedValue({ kind: "failed" });
    },
    close: async (_screen, dialog) => {
      await expect.element(dialog.getByRole("button", { name: "Reintentar" })).toBeVisible();
      await userEvent.keyboard("{Escape}");
    },
  },
  {
    name: "the code modal with Escape after a rate-limited emission",
    arrange: (services) => {
      vi.mocked(services.emitEnrollmentCode).mockResolvedValue({
        kind: "rate_limited",
        retryAfterSeconds: 120,
      });
    },
    close: async (_screen, dialog) => {
      await expect.element(dialog.getByRole("button", { name: "Reintentar" })).toBeVisible();
      await userEvent.keyboard("{Escape}");
    },
  },
  {
    name: "the code modal by cancelling a retry's authorization",
    arrange: (services) => {
      vi.mocked(services.emitEnrollmentCode).mockResolvedValueOnce({ kind: "failed" });
      vi.mocked(services.emitEnrollmentCode).mockResolvedValueOnce({
        kind: "authorization_required",
      });
    },
    close: async (screen, dialog) => {
      await expect.element(dialog.getByRole("button", { name: "Reintentar" })).toBeVisible();
      await userEvent.click(dialog.getByRole("button", { name: "Reintentar" }));
      const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });
      await expect.element(authDialog).toBeVisible();
      await userEvent.click(authDialog.getByRole("button", { name: "Cancelar" }));
    },
  },
])("closing $name refreshes the list", async ({ arrange, close }) => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({ kind: "ok", value: [register1] });
  arrange(services);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Caja 1")).toBeVisible();
  const dialog = await openEmitModal(screen, "Caja 1");
  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({ kind: "ok", value: [register2] });

  await close(screen, dialog);

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.poll(() => vi.mocked(services.fetchRegisters).mock.calls.length).toBe(2);
  await expect.element(screen.getByText("Caja 2")).toBeVisible();
});

test("keeps the current rows visible while the list refreshes after closing the code modal", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({ kind: "ok", value: [register1] });
  vi.mocked(services.emitEnrollmentCode).mockResolvedValue({
    kind: "ok",
    value: { code: "P4NX7KWE2QRT8MZD", expiresAt: "2026-09-25T12:15:00.000Z" },
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Caja 1")).toBeVisible();
  const dialog = await openEmitModal(screen, "Caja 1");
  await expect.element(dialog.getByText("P4NX 7KWE 2QRT 8MZD")).toBeVisible();
  const pendingRefresh =
    deferred<Awaited<ReturnType<RegistersListScreenServices["fetchRegisters"]>>>();
  vi.mocked(services.fetchRegisters).mockReturnValueOnce(pendingRefresh.promise);

  await userEvent.click(dialog.getByRole("button", { name: "Listo" }));

  await expect.poll(() => vi.mocked(services.fetchRegisters).mock.calls.length).toBe(2);
  await expect.element(screen.getByRole("table")).toHaveAttribute("aria-busy", "true");
  await expect.element(screen.getByText("Caja 1")).toBeVisible();
  await expect.element(screen.getByText("1 caja")).toBeVisible();

  pendingRefresh.resolve({ kind: "ok", value: [register2] });

  await expect.element(screen.getByText("Caja 2")).toBeVisible();
  await expect.element(screen.getByRole("table")).not.toHaveAttribute("aria-busy");
});

test("keeps the current rows visible while the list refreshes after creating a register", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({ kind: "ok", value: [register1] });
  const pendingRefresh =
    deferred<Awaited<ReturnType<RegistersListScreenServices["fetchRegisters"]>>>();
  vi.mocked(services.fetchRegisters).mockReturnValueOnce(pendingRefresh.promise);
  vi.mocked(services.createRegister).mockResolvedValue({ kind: "ok" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 caja")).toBeVisible();
  const dialog = await openNewRegisterModal(screen);

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre de la caja/ }), "Caja 3");
  await userEvent.click(dialog.getByRole("button", { name: "Crear la caja" }));

  await expect.poll(() => vi.mocked(services.fetchRegisters).mock.calls.length).toBe(2);
  await expect.element(screen.getByRole("table")).toHaveAttribute("aria-busy", "true");
  await expect.element(screen.getByText("Caja 1")).toBeVisible();

  pendingRefresh.resolve({
    kind: "ok",
    value: [register1, { id: "register-3", name: "Caja 3", pendingCode: null }],
  });

  await expect.element(screen.getByText("2 cajas")).toBeVisible();
});

test("shows loading placeholders, not an empty table, while the list refreshes from an empty list", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({ kind: "ok", value: [] });
  const pendingRefresh =
    deferred<Awaited<ReturnType<RegistersListScreenServices["fetchRegisters"]>>>();
  vi.mocked(services.fetchRegisters).mockReturnValueOnce(pendingRefresh.promise);
  vi.mocked(services.createRegister).mockResolvedValue({ kind: "ok" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Todavía no hay cajas registradoras")).toBeVisible();
  const dialog = await openNewRegisterModal(screen);

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre de la caja/ }), "Caja 3");
  await userEvent.click(dialog.getByRole("button", { name: "Crear la caja" }));

  await expect.poll(() => vi.mocked(services.fetchRegisters).mock.calls.length).toBe(2);
  await expect.element(screen.getByRole("table")).toHaveAttribute("aria-busy", "true");
  expect(screen.getByText("Todavía no hay cajas registradoras").query()).toBeNull();
  expect(screen.getByText("0 cajas").query()).toBeNull();

  pendingRefresh.resolve({
    kind: "ok",
    value: [{ id: "register-3", name: "Caja 3", pendingCode: null }],
  });

  await expect.element(screen.getByText("Caja 3")).toBeVisible();
  await expect.element(screen.getByText("1 caja")).toBeVisible();
});

test("a refresh that fails shows the load error with its retry action, like a failed first load", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({ kind: "ok", value: [register1] });
  vi.mocked(services.emitEnrollmentCode).mockResolvedValue({ kind: "failed" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Caja 1")).toBeVisible();
  await openEmitModal(screen, "Caja 1");
  await expect
    .element(screen.getByRole("dialog").getByRole("button", { name: "Reintentar" }))
    .toBeVisible();
  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({ kind: "failed" });

  await userEvent.keyboard("{Escape}");

  await expect.element(screen.getByText("No pudimos abrir las cajas registradoras")).toBeVisible();
  expect(screen.getByText("Caja 1").query()).toBeNull();
});

test("navigates to Mi cuenta when emitting a code comes back forbidden", async () => {
  window.history.pushState(null, "", "/registers");
  try {
    const services = createServices();
    vi.mocked(services.fetchRegisters).mockResolvedValue({ kind: "ok", value: [register1] });
    vi.mocked(services.emitEnrollmentCode).mockResolvedValue({ kind: "forbidden" });
    const screen = await renderScreen(services);
    await expect.element(screen.getByText("Caja 1")).toBeVisible();

    await userEvent.click(
      screen.getByRole("button", { name: "Emitir código de alta para Caja 1" }),
    );

    await expect.poll(() => window.location.pathname).toBe("/account");
  } finally {
    window.history.pushState(null, "", "/");
  }
});

test("ends the session when emitting a code finds no open session", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValue({ kind: "ok", value: [register1] });
  vi.mocked(services.emitEnrollmentCode).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderScreen(services, onSessionEnded);
  await expect.element(screen.getByText("Caja 1")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Emitir código de alta para Caja 1" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("opens the authorization modal on emit's authorization_required, then authorizes and shows the code", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValue({ kind: "ok", value: [register1] });
  vi.mocked(services.emitEnrollmentCode).mockResolvedValueOnce({ kind: "authorization_required" });
  grantAuthorization(services);
  vi.mocked(services.emitEnrollmentCode).mockResolvedValueOnce({
    kind: "ok",
    value: { code: "P4NX7KWE2QRT8MZD", expiresAt: "2026-09-25T12:15:00.000Z" },
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Caja 1")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Emitir código de alta para Caja 1" }));
  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });
  await expect.element(authDialog).toBeVisible();
  await expect
    .element(
      authDialog.getByText(
        "Emitir un código de alta necesita tu autorización. Confirmala con tu passkey.",
      ),
    )
    .toBeVisible();

  await userEvent.click(authDialog.getByRole("button", { name: "Usar mi passkey" }));

  await expect.poll(() => vi.mocked(services.emitEnrollmentCode).mock.calls.length).toBe(2);
  const dialog = screen.getByRole("dialog", { name: "Código de alta" });
  await expect.element(dialog.getByText("P4NX 7KWE 2QRT 8MZD")).toBeVisible();
});

test("has no accessibility violations once loaded, with the create modal open, and with the code modal open", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValue({
    kind: "ok",
    value: [register1, register2],
  });
  vi.mocked(services.emitEnrollmentCode).mockResolvedValue({
    kind: "ok",
    value: { code: "P4NX7KWE2QRT8MZD", expiresAt: "2026-09-25T12:15:00.000Z" },
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("2 cajas")).toBeVisible();
  await expectNoAccessibilityViolations(document.body);

  await openNewRegisterModal(screen);
  await expectNoAccessibilityViolations(document.body);
  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }));
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();

  await openEmitModal(screen, "Caja 1");
  await expectNoAccessibilityViolations(document.body);
});
