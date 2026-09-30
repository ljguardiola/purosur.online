import type { OpenSale, ScanProductOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import type { SaleScreenProps } from "./sale-screen";
import { SaleScreen } from "./sale-screen";

const PERSON = { user_id: "u1", first_name: "Ada", permission_keys: ["sell_and_charge"] };
// 12:02 UTC is 09:02 in Argentina.
const OPENED_AT = "2026-09-30T12:02:00.000Z";
const FIELD_NAME = "Producto";
const PLACEHOLDER = "Escaneá o escribí el nombre del producto";

const YERBA = {
  id: "line-1",
  product_id: "p1",
  product_name: "Yerba mate 1 kg",
  quantity: 2,
  list_unit_price: 238_000,
  line_total: 476_000,
};
const ALFAJOR = {
  id: "line-2",
  product_id: "p2",
  product_name: "Alfajor triple",
  quantity: 1,
  list_unit_price: 150_000,
  line_total: 150_000,
};
const SALE_OF_YERBA: OpenSale = { id: "sale-1", lines: [YERBA], total: 476_000 };
const SALE_OF_YERBA_AND_ALFAJOR: OpenSale = {
  id: "sale-1",
  lines: [YERBA, ALFAJOR],
  total: 626_000,
};

type Overrides = Partial<SaleScreenProps> & { registerName?: string | null };

async function renderScreen({ registerName = "Caja 1", ...overrides }: Overrides = {}) {
  await page.viewport(1280, 720);
  onTestFinished(() => page.viewport(414, 896));
  const currentSale = overrides.currentSale ?? vi.fn(async () => null);
  const scanProduct =
    overrides.scanProduct ??
    vi.fn(async (): Promise<ScanProductOutcome> => ({ kind: "unknown_code" }));
  const onSessionInvalid = overrides.onSessionInvalid ?? vi.fn();
  const screen = await render(
    <SaleScreen
      person={PERSON}
      registerName={registerName}
      openedAt={OPENED_AT}
      currentSale={currentSale}
      scanProduct={scanProduct}
      onSessionInvalid={onSessionInvalid}
    />,
  );
  return { screen, field: screen.getByRole("searchbox", { name: FIELD_NAME }) };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

async function scan(field: ReturnType<typeof page.getByRole>, code: string) {
  await field.fill(code);
  await userEvent.keyboard("{Enter}");
}

describe("SaleScreen", () => {
  it("says that the sale is underway", async () => {
    const { screen } = await renderScreen();

    await expect.element(screen.getByRole("heading", { name: "Venta en curso" })).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("names the register and when the session opened in the eyebrow", async () => {
    const { screen } = await renderScreen();

    await expect.element(screen.getByText("Caja 1 · Sesión abierta 09:02")).toBeVisible();
  });

  it("leaves the register's name out of the eyebrow while it isn't known", async () => {
    const { screen } = await renderScreen({ registerName: null });

    await expect.element(screen.getByText("Sesión abierta 09:02", { exact: true })).toBeVisible();
  });

  it("offers only Venta and the first name of the person who opened, and no way out", async () => {
    const { screen } = await renderScreen();

    const rail = screen.getByRole("navigation", { name: "Menú de la caja" }).element();

    const items = Array.from(rail.querySelectorAll("button, a")).map((item) => item.textContent);
    expect(items).toEqual(["Venta"]);
    await expect.element(screen.getByText("Ada")).toBeVisible();
    expect(screen.container.textContent).not.toContain("sell_and_charge");
    await expect.element(screen.getByRole("button", { name: "Salir" })).not.toBeInTheDocument();
  });

  it("has the scan field focused and named as the place to scan a product", async () => {
    const { screen, field } = await renderScreen();

    await expect.element(field).toHaveFocus();
    await expect.element(field).toHaveAttribute("placeholder", PLACEHOLDER);
    await expect.element(screen.getByRole("searchbox")).toBeVisible();
  });

  describe("keeping the scan field ready", () => {
    it.each([
      [
        "the heading",
        (screen: Awaited<ReturnType<typeof renderScreen>>["screen"]) =>
          screen.getByRole("heading", { name: "Venta en curso" }),
      ],
      [
        "the lines",
        (screen: Awaited<ReturnType<typeof renderScreen>>["screen"]) =>
          screen.getByText("Yerba mate 1 kg"),
      ],
      [
        "the amount to charge",
        (screen: Awaited<ReturnType<typeof renderScreen>>["screen"]) => screen.getByText("1 línea"),
      ],
    ])("takes a scan typed after clicking %s", async (_place, target) => {
      const scanProduct = vi.fn(
        async (): Promise<ScanProductOutcome> => ({ kind: "added", sale: SALE_OF_YERBA }),
      );
      const { screen, field } = await renderScreen({
        currentSale: async () => SALE_OF_YERBA,
        scanProduct,
      });
      await expect.element(screen.getByText("Yerba mate 1 kg")).toBeVisible();

      await target(screen).click();
      await expect.element(field).toHaveFocus();
      await userEvent.keyboard("7790001{Enter}");

      await expect.poll(() => scanProduct.mock.calls).toEqual([["u1", "7790001"]]);
    });

    it("leaves the focus on a button the person pressed", async () => {
      const { screen } = await renderScreen({
        currentSale: async () => {
          throw new Error("unavailable");
        },
      });

      const retry = screen.getByRole("button", { name: "Reintentar" });
      await expect.element(retry).toBeVisible();
      await retry.element().focus();

      await expect.element(retry).toHaveFocus();
    });

    it("has the field ready again once the retry replaces the button that had the focus", async () => {
      const currentSale = vi
        .fn<SaleScreenProps["currentSale"]>()
        .mockRejectedValueOnce(new Error("unavailable"))
        .mockResolvedValueOnce(SALE_OF_YERBA);
      const { screen, field } = await renderScreen({ currentSale });

      await screen.getByRole("button", { name: "Reintentar" }).click();

      await expect.element(screen.getByText("Yerba mate 1 kg")).toBeVisible();
      await expect.element(field).toHaveFocus();
    });
  });

  describe("reading the sale in progress", () => {
    it("asks for the sale of the person who is selling", async () => {
      const currentSale = vi.fn(async () => null);

      await renderScreen({ currentSale });

      await expect.poll(() => currentSale.mock.calls).toEqual([["u1"]]);
    });

    it("shows a placeholder while it loads, with the scan field ready", async () => {
      const { screen, field } = await renderScreen({ currentSale: () => new Promise(() => {}) });

      await expect.element(screen.getByText("Cargando…")).toBeInTheDocument();
      await expect.element(field).toHaveFocus();
    });

    it("shows an empty sale as empty, with nothing to charge", async () => {
      const { screen } = await renderScreen();

      await expect.element(screen.getByText("La venta está vacía")).toBeVisible();
      await expect.element(screen.getByText("Escaneá un producto para agregarlo.")).toBeVisible();
      const panel = screen.getByRole("complementary", { name: "Panel de cobro" });
      await expect.element(panel.getByText("Total a cobrar")).toBeVisible();
      await expect.element(panel.getByText("$ 0,00").first()).toBeVisible();
      await expect.element(panel.getByText("0 líneas")).toBeVisible();
      await expectNoAccessibilityViolations(screen.container);
    });

    it("shows the lines of the sale with their quantity and amount, and the total to charge", async () => {
      const { screen } = await renderScreen({
        currentSale: async () => SALE_OF_YERBA_AND_ALFAJOR,
      });

      const lines = screen.getByRole("list").getByRole("listitem");
      await expect.element(lines).toHaveLength(2);
      const yerba = lines.first();
      await expect.element(yerba.getByText("Yerba mate 1 kg")).toBeVisible();
      await expect.element(yerba.getByText("2", { exact: true })).toBeVisible();
      await expect.element(yerba.getByText("$ 4.760,00")).toBeVisible();
      const alfajor = lines.last();
      await expect.element(alfajor.getByText("Alfajor triple")).toBeVisible();
      await expect.element(alfajor.getByText("$ 1.500,00")).toBeVisible();
      const panel = screen.getByRole("complementary", { name: "Panel de cobro" });
      await expect.element(panel.getByText("$ 6.260,00").first()).toBeVisible();
      await expect.element(panel.getByText("2 líneas")).toBeVisible();
      await expect.element(screen.getByText("La venta está vacía")).not.toBeInTheDocument();
      await expectNoAccessibilityViolations(screen.container);
    });

    it("writes 1 línea in the singular", async () => {
      const { screen } = await renderScreen({ currentSale: async () => SALE_OF_YERBA });

      await expect
        .element(screen.getByRole("complementary", { name: "Panel de cobro" }).getByText("1 línea"))
        .toBeVisible();
    });

    it("offers to try again when it cannot be read, and shows the sale once it can", async () => {
      const currentSale = vi
        .fn<SaleScreenProps["currentSale"]>()
        .mockRejectedValueOnce(new Error("unavailable"))
        .mockResolvedValueOnce(SALE_OF_YERBA);
      const { screen } = await renderScreen({ currentSale });

      await expect.element(screen.getByText("No se pudo cargar la venta")).toBeVisible();
      await expectNoAccessibilityViolations(screen.container);
      await screen.getByRole("button", { name: "Reintentar" }).click();

      await expect.element(screen.getByText("Yerba mate 1 kg")).toBeVisible();
      await expect.element(screen.getByText("No se pudo cargar la venta")).not.toBeInTheDocument();
      expect(currentSale).toHaveBeenCalledTimes(2);
    });

    it("keeps a sale a scan already returned when the slower first read answers afterwards", async () => {
      const read = deferred<OpenSale | null>();
      const scanProduct = vi.fn(
        async (): Promise<ScanProductOutcome> => ({ kind: "added", sale: SALE_OF_YERBA }),
      );
      const { screen, field } = await renderScreen({
        currentSale: () => read.promise,
        scanProduct,
      });

      await scan(field, "7790001");
      await expect.element(screen.getByText("Yerba mate 1 kg")).toBeVisible();
      read.resolve(null);

      await expect.element(screen.getByText("Yerba mate 1 kg")).toBeVisible();
      await expect.element(screen.getByText("La venta está vacía")).not.toBeInTheDocument();
    });
  });

  describe("scanning", () => {
    it("sends the code, without the blanks around it, for the person selling", async () => {
      const scanProduct = vi.fn(
        async (): Promise<ScanProductOutcome> => ({ kind: "unknown_code" }),
      );
      const { field } = await renderScreen({ scanProduct });

      await scan(field, "  7790001  ");

      await expect.poll(() => scanProduct.mock.calls).toEqual([["u1", "7790001"]]);
    });

    it("does nothing on Enter while the field is blank", async () => {
      const scanProduct = vi.fn(
        async (): Promise<ScanProductOutcome> => ({ kind: "unknown_code" }),
      );
      const { field } = await renderScreen({ scanProduct });

      await scan(field, "   ");
      await userEvent.keyboard("{Enter}");

      expect(scanProduct).not.toHaveBeenCalled();
    });

    it("shows the sale it returns, marks the line that changed and clears the field", async () => {
      const scanProduct = vi
        .fn<SaleScreenProps["scanProduct"]>()
        .mockResolvedValueOnce({ kind: "added", sale: SALE_OF_YERBA })
        .mockResolvedValueOnce({ kind: "added", sale: SALE_OF_YERBA_AND_ALFAJOR });
      const { screen, field } = await renderScreen({ scanProduct });
      const lines = screen.getByRole("listitem");

      await scan(field, "7790001");

      await expect.element(lines).toHaveLength(1);
      await expect.element(lines.first()).toHaveAttribute("aria-current", "true");
      await expect.element(field).toHaveValue("");
      await expect.element(field).toHaveFocus();

      await scan(field, "7790002");

      await expect.element(lines).toHaveLength(2);
      await expect.element(lines.first()).not.toHaveAttribute("aria-current");
      await expect.element(lines.last()).toHaveAttribute("aria-current", "true");
      await expect
        .element(
          screen
            .getByRole("complementary", { name: "Panel de cobro" })
            .getByText("$ 6.260,00")
            .first(),
        )
        .toBeVisible();
    });

    it("marks the line whose quantity went up when the same product is scanned again", async () => {
      const again: OpenSale = {
        id: "sale-1",
        lines: [YERBA, { ...ALFAJOR, quantity: 2, line_total: 300_000 }],
        total: 776_000,
      };
      const scanProduct = vi.fn(
        async (): Promise<ScanProductOutcome> => ({ kind: "added", sale: again }),
      );
      const { screen, field } = await renderScreen({
        currentSale: async () => SALE_OF_YERBA_AND_ALFAJOR,
        scanProduct,
      });
      await expect.element(screen.getByText("Alfajor triple")).toBeVisible();

      await scan(field, "7790002");

      const lines = screen.getByRole("listitem");
      await expect.element(lines.last()).toHaveAttribute("aria-current", "true");
      await expect.element(lines.first()).not.toHaveAttribute("aria-current");
    });

    it("leaves what is being typed alone when the scanner already started the next code", async () => {
      const answer = deferred<ScanProductOutcome>();
      const { screen, field } = await renderScreen({ scanProduct: () => answer.promise });

      await scan(field, "7790001");
      await field.fill("77900");
      answer.resolve({ kind: "added", sale: SALE_OF_YERBA });

      await expect.element(screen.getByText("Yerba mate 1 kg")).toBeVisible();
      await expect.element(field).toHaveValue("77900");
    });

    it.each<{
      name: string;
      outcome: ScanProductOutcome;
      title: string;
      help: string;
    }>([
      {
        name: "an unknown code",
        outcome: { kind: "unknown_code" },
        title: "No hay ningún producto con ese código",
        help: "Buscalo por nombre. Si no aparece, falta darlo de alta en el backoffice.",
      },
      {
        name: "a product without a price",
        outcome: { kind: "no_price", product_name: "Yerba mate 1 kg" },
        title: "Yerba mate 1 kg no tiene precio",
        help: "No se puede vender hasta que alguien con el permiso de precios se lo ponga en el backoffice.",
      },
      {
        name: "a product sold by weight",
        outcome: { kind: "sold_by_weight", product_name: "Queso cremoso" },
        title: "Queso cremoso se vende por kilo",
        help: "Esta caja todavía no vende productos por kilo.",
      },
      {
        name: "a revoked installation",
        outcome: { kind: "installation_revoked" },
        title: "Esta caja ya no puede empezar ventas",
        help: "Su instalación fue reemplazada o retirada desde el backoffice.",
      },
      {
        name: "the core being unable to add it",
        outcome: { kind: "unavailable" },
        title: "No se pudo agregar el producto",
        help: "Probá escanearlo de nuevo.",
      },
    ])(
      "tells what happened, keeps the code and leaves the sale alone on $name",
      async ({ outcome, title, help }) => {
        const { screen, field } = await renderScreen({
          currentSale: async () => SALE_OF_YERBA,
          scanProduct: async () => outcome,
        });
        await expect.element(screen.getByText("Yerba mate 1 kg").first()).toBeVisible();

        await scan(field, "7790009");

        await expect.element(screen.getByText(title, { exact: true })).toBeVisible();
        await expect.element(screen.getByText(help, { exact: true })).toBeVisible();
        await expect.element(field).toHaveValue("7790009");
        await expect.element(screen.getByRole("listitem")).toHaveLength(1);
        await expect
          .element(
            screen.getByRole("complementary", { name: "Panel de cobro" }).getByText("1 línea"),
          )
          .toBeVisible();
        await expectNoAccessibilityViolations(screen.container);
      },
    );

    it("tells that the product could not be added when the core doesn't answer", async () => {
      const { screen, field } = await renderScreen({
        scanProduct: async () => {
          throw new Error("the core connection was replaced");
        },
      });

      await scan(field, "7790009");

      await expect.element(screen.getByText("No se pudo agregar el producto")).toBeVisible();
      await expect.element(field).toHaveValue("7790009");
    });

    it("announces what happened without moving the lines", async () => {
      const { screen, field } = await renderScreen({
        currentSale: async () => SALE_OF_YERBA,
        scanProduct: async () => ({ kind: "unknown_code" }),
      });
      const line = screen.getByRole("listitem").first();
      await expect.element(line).toBeVisible();
      const before = line.element().getBoundingClientRect().top;

      await scan(field, "7790009");

      const message = screen.getByRole("status").filter({
        hasText: "No hay ningún producto con ese código",
      });
      await expect.element(message).toBeInTheDocument();
      expect(line.element().getBoundingClientRect().top).toBe(before);
      const fieldBox = field.element().getBoundingClientRect();
      const messageBox = screen
        .getByText("No hay ningún producto con ese código")
        .element()
        .getBoundingClientRect();
      expect(messageBox.top).toBeGreaterThanOrEqual(fieldBox.bottom);
    });

    it("takes the message away when the text in the field changes", async () => {
      const { screen, field } = await renderScreen();
      await scan(field, "7790009");
      await expect.element(screen.getByText("No hay ningún producto con ese código")).toBeVisible();

      await field.fill("77900091");

      await expect
        .element(screen.getByText("No hay ningún producto con ese código"))
        .not.toBeInTheDocument();
    });

    it("takes the message away on the next successful scan", async () => {
      const scanProduct = vi
        .fn<SaleScreenProps["scanProduct"]>()
        .mockResolvedValueOnce({ kind: "unknown_code" })
        .mockResolvedValueOnce({ kind: "added", sale: SALE_OF_YERBA });
      const { screen, field } = await renderScreen({ scanProduct });
      await scan(field, "7790009");
      await expect.element(screen.getByText("No hay ningún producto con ese código")).toBeVisible();

      await userEvent.keyboard("{Enter}");

      await expect.element(screen.getByText("Yerba mate 1 kg")).toBeVisible();
      await expect
        .element(screen.getByText("No hay ningún producto con ese código"))
        .not.toBeInTheDocument();
    });

    it.each<ScanProductOutcome>([{ kind: "not_permitted" }, { kind: "no_open_session" }])(
      "asks for the session to be read again when the core answers $kind, without any message",
      async (outcome) => {
        const onSessionInvalid = vi.fn();
        const { screen, field } = await renderScreen({
          scanProduct: async () => outcome,
          onSessionInvalid,
        });

        await scan(field, "7790009");

        await expect.poll(() => onSessionInvalid.mock.calls.length).toBe(1);
        await expect
          .element(screen.getByText("No hay ningún producto con ese código"))
          .not.toBeInTheDocument();
        await expect
          .element(screen.getByText("No se pudo agregar el producto"))
          .not.toBeInTheDocument();
      },
    );
  });
});
