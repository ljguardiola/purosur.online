import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { SessionEyebrow } from "./session-eyebrow";

describe("SessionEyebrow", () => {
  it("names the register before saying that no session is open", async () => {
    const screen = await render(<SessionEyebrow registerName="Caja 1" />);

    await expect.element(screen.getByText("Caja 1 · Sin sesión abierta")).toBeVisible();
  });

  it("only says that no session is open while the register's name isn't known", async () => {
    const screen = await render(<SessionEyebrow registerName={null} />);

    await expect.element(screen.getByText("Sin sesión abierta", { exact: true })).toBeVisible();
  });

  it("shows its text in capitals", async () => {
    const screen = await render(<SessionEyebrow registerName={null} />);

    const style = getComputedStyle(screen.getByText("Sin sesión abierta").element());

    expect(style.textTransform).toBe("uppercase");
  });

  // 12:02 UTC is 09:02 in Argentina, which has no daylight saving time.
  const OPENED_AT = "2026-09-30T12:02:00.000Z";

  it("names the register and the Argentine time the session opened at", async () => {
    const screen = await render(<SessionEyebrow registerName="Caja 1" openedAt={OPENED_AT} />);

    await expect.element(screen.getByText("Caja 1 · Sesión abierta 09:02")).toBeVisible();
  });

  it("says when the session opened without the register's name while it isn't known", async () => {
    const screen = await render(<SessionEyebrow registerName={null} openedAt={OPENED_AT} />);

    await expect.element(screen.getByText("Sesión abierta 09:02", { exact: true })).toBeVisible();
  });

  it("writes the time on a 24-hour clock", async () => {
    const screen = await render(
      <SessionEyebrow registerName={null} openedAt="2026-09-30T23:45:00.000Z" />,
    );

    await expect.element(screen.getByText("Sesión abierta 20:45", { exact: true })).toBeVisible();
  });
});
