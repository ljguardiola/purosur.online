import { localAlertText } from "@purosur/ui";
import { expectNoAccessibilityViolations, tokenRgb } from "@purosur/ui/test";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import {
  appartadosCard,
  BOTH_CONFIGURER,
  CLOCK_DRIFT,
  legendOf,
  loadedBackupTickets,
  NO_CONFIGURER,
  noticesList,
  OPEN_SESSION,
  panelLegendOf,
  panelOf,
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

      await expect.element(rowOf(screen)).toHaveTextContent("Nube conectada");
      expect(rowOf(screen).element().textContent).not.toMatch(/aviso/);
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

    it("counts the notices in the error tone when one is critical", async () => {
      const { screen } = await render({ status: { conditions: [CLOCK_DRIFT, REGISTER_SILENT] } });

      const text = rowOf(screen).getByText("2 avisos");
      expect(statusDotColor(text.element())).toBe(tokenRgb("error-soft"));
    });
  });

  describe("its panel", () => {
    it("is headed Esta caja with Esc at the top right, and leaves for Inicio on it", async () => {
      const { screen } = await render();

      await expect.element(panelOf(screen, "Esta caja")).toBeVisible();
      await userEvent.click(
        panelOf(screen, "Esta caja").getByRole("button", { name: "Cerrar con Esc" }),
      );
      await expect.poll(() => screen.router.state.location.pathname).toBe("/");
    });

    it("tells the cloud, the open session's time and the version", async () => {
      const { screen } = await render({
        status: { cloud: "unreachable" },
        cashSession: OPEN_SESSION,
      });

      const panel = panelOf(screen, "Esta caja");
      await expect.element(panel.getByText("Nube", { exact: true })).toBeVisible();
      await expect.element(panel.getByText("Sin conexión con la nube")).toBeVisible();
      await expect.element(panel.getByText("Sesión", { exact: true })).toBeVisible();
      await expect.element(panel.getByText("Sesión abierta 08:02")).toBeVisible();
      await expect.element(panel.getByText("Versión", { exact: true })).toBeVisible();
      await expect.element(panel.getByText("1.4.212")).toBeVisible();
    });

    it("says Sin sesión abierta when no cash session is open", async () => {
      const { screen } = await render();

      await expect
        .element(panelOf(screen, "Esta caja").getByText("Sin sesión abierta"))
        .toBeVisible();
    });

    it("says Nube sin verificar while the cloud's state is unknown", async () => {
      const { screen } = await render({ status: { cloud: "unknown" } });

      await expect
        .element(panelOf(screen, "Esta caja").getByText("Nube sin verificar"))
        .toBeVisible();
    });

    it("hides the version row while the version is unknown", async () => {
      const { screen } = await render({ version: null });

      await expect
        .element(panelOf(screen, "Esta caja").getByText("Versión"))
        .not.toBeInTheDocument();
    });

    it.each([
      ["offline_code", "Contingencia CAEA"],
      ["deferring", "Venta diferida"],
    ] as const)("tells the invoicing during a %s contingency", async (kind, text) => {
      const { screen } = await render({ status: { contingency: { kind, notice: false } } });

      const panel = panelOf(screen, "Esta caja");
      await expect.element(panel.getByText("Facturación", { exact: true })).toBeVisible();
      await expect.element(panel.getByText(text)).toBeVisible();
    });

    it("shows no invoicing row outside a contingency", async () => {
      const { screen } = await render();

      await expect
        .element(panelOf(screen, "Esta caja").getByText("Facturación"))
        .not.toBeInTheDocument();
    });

    it("shows the eyebrow AVISOS DE ESTA CAJA and the notices only when there are some", async () => {
      const none = await render();
      await expect
        .element(panelOf(none.screen, "Esta caja").getByText("AVISOS DE ESTA CAJA"))
        .not.toBeInTheDocument();
      await none.screen.unmount();

      const { screen } = await render({ status: { conditions: [CLOCK_DRIFT] } });
      await expect
        .element(panelOf(screen, "Esta caja").getByText("AVISOS DE ESTA CAJA"))
        .toBeVisible();
      await expect
        .element(noticesList(screen).getByText("Reloj de la caja desajustado"))
        .toBeVisible();
      await expect.element(noticesList(screen).getByText("Desde 04/11/2026 · 14:20")).toBeVisible();
      await expectNoAccessibilityViolations(screen.container);
    });
  });

  describe("its notices", () => {
    const ALL: NonNullable<Parameters<typeof renderSettings>[0]> = {
      status: {
        cloud: "unreachable",
        conditions: [CLOCK_DRIFT, REGISTER_SILENT],
        contingency: OFFLINE_CODE,
      },
      backupTickets: loadedBackupTickets({ to_print: 3, discardable: 3, may_discard: true }),
    };

    function titlesOf(screen: Awaited<ReturnType<typeof render>>["screen"]): string[] {
      return noticesList(screen)
        .getByRole("listitem")
        .elements()
        .map((item) => item.querySelector("p")?.textContent ?? "");
    }

    it("lists the critical conditions, the contingency, the backup tickets and the other conditions, in that order", async () => {
      const { screen } = await render(ALL);

      expect(titlesOf(screen)).toEqual([
        "La caja no está sincronizando",
        "Facturación en modo de respaldo",
        "Tickets de respaldo sin imprimir",
        "Ya podés descartar los tickets de respaldo",
        "Reloj de la caja desajustado",
      ]);
    });

    it("tells the backup tickets by their count and the missing key with no subtitle", async () => {
      const { screen } = await render({
        backupTickets: loadedBackupTickets({
          to_print: 3,
          missing_key: 2,
          discardable: 3,
          may_discard: true,
        }),
      });

      const list = noticesList(screen);
      await expect.element(list.getByText("3 sin imprimir")).toBeVisible();
      await expect.element(list.getByText("3 tickets guardados")).toBeVisible();
      await expect.element(list.getByText("No se pudo armar el ticket de respaldo")).toBeVisible();
    });

    it("draws the first notice focused, expanded with what it means and what to do, and the others with only a title and a subtitle", async () => {
      const { screen } = await render(ALL);

      const list = noticesList(screen);
      const items = list.getByRole("listitem").elements();
      expect(items[0]?.firstElementChild?.getAttribute("aria-current")).toBe("true");
      expect(items[1]?.firstElementChild?.hasAttribute("aria-current")).toBe(false);
      await expect
        .element(list.getByText("Seguí vendiendo con normalidad", { exact: false }))
        .not.toBeInTheDocument();
    });

    it("moves the focus between the notices with the arrows, expanding the focused one, once the focus is on them", async () => {
      const { screen } = await render(ALL);

      await userEvent.keyboard("{ArrowRight}");
      await userEvent.keyboard("{ArrowDown}");

      const list = noticesList(screen);
      const items = list.getByRole("listitem").elements();
      expect(items[1]?.firstElementChild?.getAttribute("aria-current")).toBe("true");
      await expect
        .element(
          list.getByText(
            "Seguí vendiendo con normalidad: las facturas salen igual. Se resuelve sola.",
          ),
        )
        .toBeVisible();
      await userEvent.keyboard("{ArrowUp}{ArrowUp}{ArrowUp}");
      expect(items[0]?.firstElementChild?.getAttribute("aria-current")).toBe("true");
    });

    it("keeps choosing apartados with the arrows while the focus is on the list", async () => {
      const { onSelectSection } = await render({ ...ALL, person: BOTH_CONFIGURER });

      await userEvent.keyboard("{ArrowUp}");

      expect(onSelectSection).toHaveBeenCalledExactlyOnceWith("devices");
    });

    it("stops choosing apartados while the focus is on the notices, and gives it back with the left and right arrows", async () => {
      const { onSelectSection } = await render({ ...ALL, person: BOTH_CONFIGURER });

      await userEvent.keyboard("{ArrowRight}");
      await userEvent.keyboard("{ArrowUp}");
      expect(onSelectSection).not.toHaveBeenCalled();
      await userEvent.keyboard("{ArrowLeft}");
      await userEvent.keyboard("{ArrowUp}");
      expect(onSelectSection).toHaveBeenCalledExactlyOnceWith("devices");
    });

    it("expands the focused condition with what it means and what to do", async () => {
      const { screen } = await render({ status: { conditions: [CLOCK_DRIFT] } });

      const text = localAlertText(CLOCK_DRIFT);
      await expect.element(noticesList(screen).getByText(text.meaning)).toBeVisible();
      await expect.element(noticesList(screen).getByText(text.whatToDo)).toBeVisible();
    });
  });

  describe("its keys", () => {
    it("shows ↑↓ Apartados and ←→ Lista in the card's legend when there are notices", async () => {
      const { screen } = await render({ status: { conditions: [CLOCK_DRIFT] } });

      expect(legendOf(screen)).toEqual(["↑↓Apartados", "←→Lista"]);
    });

    it("shows ↑↓ Aviso and ←→ Lista in the panel's footer, without Supr when the focused notice can't be discarded", async () => {
      const { screen } = await render({ status: { conditions: [CLOCK_DRIFT] } });

      expect(panelLegendOf(screen)).toEqual(["↑↓Aviso", "←→Lista"]);
    });

    it("shows no ←→ Lista and no panel legend when there are no notices", async () => {
      const { screen } = await render();

      expect(legendOf(screen)).toEqual(["↑↓Apartados"]);
      expect(panelLegendOf(screen)).toEqual([]);
    });

    it("shows Supr Descartar only while the focused notice is the discardable one and may be discarded", async () => {
      const { screen } = await render({
        status: { conditions: [CLOCK_DRIFT] },
        backupTickets: loadedBackupTickets({ discardable: 3, may_discard: true }),
      });

      expect(panelLegendOf(screen)).toEqual(["↑↓Aviso", "←→Lista", "SuprDescartar"]);
      await userEvent.keyboard("{ArrowRight}{ArrowDown}");
      expect(panelLegendOf(screen)).toEqual(["↑↓Aviso", "←→Lista"]);
    });

    it("discards the tickets on Supr while the discardable notice is focused", async () => {
      const { onDiscardBackupTickets } = await render({
        backupTickets: loadedBackupTickets({ discardable: 3, may_discard: true }),
      });

      await userEvent.keyboard("{Delete}");

      expect(onDiscardBackupTickets).toHaveBeenCalledOnce();
    });

    it("does nothing on Supr while another notice is focused", async () => {
      const { onDiscardBackupTickets } = await render({
        status: { conditions: [REGISTER_SILENT] },
        backupTickets: loadedBackupTickets({ discardable: 3, may_discard: true }),
      });

      await userEvent.keyboard("{Delete}");

      expect(onDiscardBackupTickets).not.toHaveBeenCalled();
    });

    it("offers no Supr to a person who may not discard, and tells them who closes the notice", async () => {
      const { screen, onDiscardBackupTickets } = await render({
        backupTickets: loadedBackupTickets({
          discardable: 3,
          may_discard: true,
          discard_permitted: false,
        }),
      });

      expect(panelLegendOf(screen)).toEqual(["↑↓Aviso", "←→Lista"]);
      await expect
        .element(screen.getByText("Tiralos. Este aviso lo cierra quien venda en esta caja."))
        .toBeVisible();
      await userEvent.keyboard("{Delete}");
      expect(onDiscardBackupTickets).not.toHaveBeenCalled();
    });

    it("expands the discardable notice with no what-to-do line, as the Supr key says it", async () => {
      const { screen } = await render({
        backupTickets: loadedBackupTickets({ discardable: 3, may_discard: true }),
      });

      await expect.element(screen.getByText("3 tickets guardados")).toBeVisible();
      await expect.element(screen.getByText("Tiralos y cerrá este aviso.")).not.toBeInTheDocument();
    });
  });

  it("is reachable with the sections of a person who may configure nothing", async () => {
    const { screen } = await render({ person: NO_CONFIGURER });

    await expect.element(panelOf(screen, "Esta caja")).toBeVisible();
  });
});
