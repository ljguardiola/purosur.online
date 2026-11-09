import { act } from "react";
import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import {
  InstallationStatusTag,
  RegisterInstallationSummary,
  useSecondsSinceRead,
} from "./register-installation-summary";
import type { RegisterSummary } from "./registers-api";
import {
  enrolledRegister,
  register1,
  register2,
  revokedRegister,
} from "./test-support/registers-list-screen";

function InstallationSummaries({ registers }: { registers: RegisterSummary[] }) {
  const secondsSinceRead = useSecondsSinceRead(registers);
  return (
    <ul>
      {registers.map((register) => (
        <li key={register.id}>
          <RegisterInstallationSummary register={register} secondsSinceRead={secondsSinceRead} />
          <InstallationStatusTag installation={register.installation} />
        </li>
      ))}
    </ul>
  );
}

function renderSummaries(...registers: RegisterSummary[]) {
  return render(<InstallationSummaries registers={registers} />);
}

test("shows an enrolled register's enrollment date and Windows version, tagged Activa", async () => {
  const screen = await renderSummaries(enrolledRegister);

  await expect.element(screen.getByText("Dada de alta el 01/08/2026")).toBeVisible();
  await expect.element(screen.getByText("Windows 11 Pro 10.0.26100")).toBeVisible();
  await expect.element(screen.getByText("Activa", { exact: true })).toBeVisible();
  expect(screen.getByText("Esperando alta").query()).toBeNull();
});

test("shows a revoked installation as Revocada with when and on which machine", async () => {
  const screen = await renderSummaries(revokedRegister);

  await expect.element(screen.getByText("Revocada el 03/08/2026")).toBeVisible();
  await expect.element(screen.getByText("CAJA-DEPOSITO · Windows 10 Pro 10.0.19045")).toBeVisible();
  await expect.element(screen.getByText("Revocada", { exact: true })).toBeVisible();
  expect(screen.getByText("Esperando alta").query()).toBeNull();
});

test("shows a register never enrolled as — and Esperando alta", async () => {
  const screen = await renderSummaries(register1);

  await expect.element(screen.getByText("—")).toBeVisible();
  await expect.element(screen.getByText("Esperando alta")).toBeVisible();
  expect(screen.getByText("Activa", { exact: true }).query()).toBeNull();
});

test("keeps showing a pending code after the installation of a revoked register", async () => {
  const screen = await renderSummaries({ ...revokedRegister, pendingCode: register2.pendingCode });

  await expect.element(screen.getByText("Revocada el 03/08/2026")).toBeVisible();
  await expect.element(screen.getByText("Código emitido hace 4 minutos")).toBeVisible();
  await expect.element(screen.getByText("Vence en 11 minutos")).toBeVisible();
});

test("shows the elapsed and remaining time for a register with a pending code", async () => {
  const screen = await renderSummaries(register2);

  await expect.element(screen.getByText("Código emitido hace 4 minutos")).toBeVisible();
  await expect.element(screen.getByText("Vence en 11 minutos")).toBeVisible();
});

test("shows recién for a code issued less than a minute ago", async () => {
  const screen = await renderSummaries({
    ...register1,
    pendingCode: { secondsSinceIssued: 20, secondsUntilExpiry: 880 },
  });

  await expect.element(screen.getByText("Código emitido recién")).toBeVisible();
});

test("counts a pending code down every 30 seconds from the answer it was given", async () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  try {
    const screen = await renderSummaries(register2);
    await expect.element(screen.getByText("Vence en 11 minutos")).toBeVisible();

    vi.advanceTimersByTime(60_000);

    await expect.element(screen.getByText("Código emitido hace 5 minutos")).toBeVisible();
    await expect.element(screen.getByText("Vence en 10 minutos")).toBeVisible();
  } finally {
    vi.useRealTimers();
  }
});

test("stops showing a pending code once the remaining time it was given runs out", async () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  try {
    const screen = await renderSummaries({
      ...register2,
      pendingCode: { secondsSinceIssued: 870, secondsUntilExpiry: 30 },
    });
    await expect.element(screen.getByText("Vence en 1 minuto")).toBeVisible();

    vi.advanceTimersByTime(30_000);

    await expect.poll(() => screen.getByText(/^Vence en/).query()).toBeNull();
    await expect.poll(() => screen.getByText(/^Código emitido/).query()).toBeNull();
    await expect.element(screen.getByText("—")).toBeVisible();
  } finally {
    vi.useRealTimers();
  }
});

test("restarts the countdown from a new answer once the list is read again", async () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  try {
    const screen = await renderSummaries(register2);
    await expect.element(screen.getByText("Vence en 11 minutos")).toBeVisible();
    vi.advanceTimersByTime(60_000);
    await expect.element(screen.getByText("Vence en 10 minutos")).toBeVisible();

    await screen.rerender(
      <InstallationSummaries
        registers={[
          { ...register2, pendingCode: { secondsSinceIssued: 0, secondsUntilExpiry: 900 } },
        ]}
      />,
    );

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
  "counts the 30 seconds of each tick from the latest answer, showing $shownUntilTick until then",
  async ({ answer, shownUntilTick, shownAfterTick }) => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      const screen = await renderSummaries(register2);
      await expect.element(screen.getByText("Vence en 11 minutos")).toBeVisible();
      vi.advanceTimersByTime(29_000);
      await screen.rerender(
        <InstallationSummaries registers={[{ ...register2, pendingCode: answer }]} />,
      );
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
