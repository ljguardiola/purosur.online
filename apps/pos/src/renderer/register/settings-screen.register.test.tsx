import { tokenRgb } from "@purosur/ui/test";
import { describe, expect, it } from "vitest";
import {
  appartadosCard,
  BOTH_CONFIGURER,
  CLOCK_DRIFT,
  loadedBackupTickets,
  REGISTER_SILENT,
  renderSettings,
} from "./test-support/settings-screen";

const OFFLINE_CODE = { kind: "offline_code", notice: true } as const;

function render(options: Parameters<typeof renderSettings>[0] = {}) {
  return renderSettings({ section: "register", ...options });
}

function rowOf(screen: Awaited<ReturnType<typeof render>>["screen"]) {
  return appartadosCard(screen).getByRole("button", { name: /^Esta caja/ });
}

function statusDotColor(text: Element): string {
  return getComputedStyle(text.firstElementChild as Element).backgroundColor;
}

describe("Esta caja", () => {
  describe("its row", () => {
    it("comes third, after Impresora and Balanza y lector, to a person who may configure both", async () => {
      const { screen } = await render({ person: BOTH_CONFIGURER });

      const titles = appartadosCard(screen)
        .getByRole("button")
        .elements()
        .map((row) => row.textContent);
      expect(titles).toEqual([
        expect.stringMatching(/^Impresora/),
        expect.stringMatching(/^Balanza y lector/),
        expect.stringMatching(/^Esta caja/),
      ]);
    });

    it("shows the cloud as connected, with no notice count while there is no notice", async () => {
      const { screen } = await render();

      expect(rowOf(screen).element().textContent).toBe("Esta cajaNube conectada");
      const dot = statusDotColor(screen.getByText("Nube conectada").first().element());
      expect(dot).toBe(tokenRgb("success-soft"));
    });

    it("shows a red Sin conexión con la nube when the cloud can't be reached", async () => {
      const { screen } = await render({ status: { cloud: "unreachable" } });

      const text = rowOf(screen).getByText("Sin conexión con la nube");
      await expect.element(text).toBeVisible();
      expect(statusDotColor(text.element())).toBe(tokenRgb("error-soft"));
    });

    it("shows a grey Nube sin verificar while the cloud's state is unknown", async () => {
      const { screen } = await render({ status: { cloud: "unknown" } });

      const text = rowOf(screen).getByText("Nube sin verificar");
      await expect.element(text).toBeVisible();
      expect(statusDotColor(text.element())).toBe(tokenRgb("neutral"));
    });

    it("counts the notices, in the singular and the plural, in the warning tone", async () => {
      const one = await render({ status: { conditions: [CLOCK_DRIFT] } });
      const aviso = rowOf(one.screen).getByText("1 aviso");
      await expect.element(aviso).toBeVisible();
      expect(statusDotColor(aviso.element())).toBe(tokenRgb("warning-soft"));
      await one.screen.unmount();

      const many = await render({
        status: { conditions: [CLOCK_DRIFT], contingency: OFFLINE_CODE },
        backupTickets: loadedBackupTickets({ to_print: 1 }),
      });
      await expect.element(rowOf(many.screen).getByText("3 avisos")).toBeVisible();
    });

    it("counts the notices in the warning tone even when one is critical", async () => {
      const { screen } = await render({ status: { conditions: [CLOCK_DRIFT, REGISTER_SILENT] } });

      const text = rowOf(screen).getByText("2 avisos");
      expect(statusDotColor(text.element())).toBe(tokenRgb("warning-soft"));
    });
  });
});
