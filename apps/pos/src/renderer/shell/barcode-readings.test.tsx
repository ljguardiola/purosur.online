import { Modal } from "@purosur/ui";
import { CircleX } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { BarcodeReadings, useBarcodeReadings } from "./barcode-readings";

const NOTICE_TITLE = "No se agregó el producto escaneado";
const NOTICE_DESCRIPTION =
  "Escaneá de nuevo en una venta que se pueda cambiar, sin ventanas abiertas.";

function fakeCore() {
  const listeners = new Set<(code: string) => void>();
  return {
    onBarcodeRead(listener: (code: string) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    read(code: string) {
      for (const listener of [...listeners]) listener(code);
    },
    listening: () => listeners.size,
  };
}

function Taker({ take }: { take: ((code: string) => void) | undefined }) {
  useBarcodeReadings(take);
  return null;
}

async function renderReadings(takers: React.ReactNode) {
  const core = fakeCore();
  const screen = await render(
    <BarcodeReadings onBarcodeRead={core.onBarcodeRead}>{takers}</BarcodeReadings>,
  );
  return { core, screen };
}

describe("BarcodeReadings", () => {
  it("hands a reading to the screen that takes readings, with no notice", async () => {
    const take = vi.fn();
    const { core, screen } = await renderReadings(<Taker take={take} />);

    core.read("7790001234567");

    expect(take).toHaveBeenCalledExactlyOnceWith("7790001234567");
    await expect.element(screen.getByText(NOTICE_TITLE)).not.toBeInTheDocument();
  });

  it("hands the same code to the taker each time it is read", async () => {
    const take = vi.fn();
    const { core } = await renderReadings(<Taker take={take} />);

    core.read("7790001234567");
    core.read("7790001234567");

    expect(take).toHaveBeenCalledTimes(2);
  });

  it("hands a reading to the taker that registered last", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { core } = await renderReadings(
      <>
        <Taker take={first} />
        <Taker take={second} />
      </>,
    );

    core.read("111");

    expect(second).toHaveBeenCalledExactlyOnceWith("111");
    expect(first).not.toHaveBeenCalled();
  });

  it("hands readings to the taker that registered before once the last one stops taking", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { core, screen } = await renderReadings(
      <>
        <Taker take={first} />
        <Taker take={second} />
      </>,
    );

    await screen.rerender(
      <BarcodeReadings onBarcodeRead={core.onBarcodeRead}>
        <Taker take={first} />
        <Taker take={undefined} />
      </BarcodeReadings>,
    );
    core.read("222");

    expect(first).toHaveBeenCalledExactlyOnceWith("222");
    expect(second).not.toHaveBeenCalled();
  });

  it("hands a reading to the latest function a taker was given", async () => {
    const stale = vi.fn();
    const latest = vi.fn();
    const { core, screen } = await renderReadings(<Taker take={stale} />);

    await screen.rerender(
      <BarcodeReadings onBarcodeRead={core.onBarcodeRead}>
        <Taker take={latest} />
      </BarcodeReadings>,
    );
    core.read("333");

    expect(latest).toHaveBeenCalledExactlyOnceWith("333");
    expect(stale).not.toHaveBeenCalled();
  });

  it("warns that the product was not added when no screen takes readings", async () => {
    const { core, screen } = await renderReadings(<Taker take={undefined} />);

    core.read("7790001234567");

    await expect.element(screen.getByText(NOTICE_TITLE)).toBeVisible();
    await expect.element(screen.getByText(NOTICE_DESCRIPTION)).toBeVisible();
  });

  it("replaces the warning of an earlier reading with the one of a new reading", async () => {
    const { core, screen } = await renderReadings(null);

    core.read("111");
    core.read("222");

    await expect.element(screen.getByText(NOTICE_TITLE)).toBeVisible();
    expect(document.body.textContent?.split(NOTICE_TITLE)).toHaveLength(2);
  });

  describe("while a modal window is open", () => {
    function WithWindow({ open, take }: { open: boolean; take: (code: string) => void }) {
      return (
        <>
          <Taker take={take} />
          <Modal
            open={open}
            onOpenChange={() => {}}
            width="confirmation"
            tone="error"
            icon={<CircleX />}
            context="Venta en curso"
            title="Una ventana"
            closable
            footer={null}
          >
            <p>Contenido</p>
          </Modal>
        </>
      );
    }

    it("warns that the product was not added instead of handing the reading to the taker", async () => {
      const take = vi.fn();
      const { core, screen } = await renderReadings(<WithWindow open take={take} />);
      await expect.element(screen.getByRole("dialog", { name: "Una ventana" })).toBeVisible();

      core.read("7790001234567");

      await expect.element(screen.getByText(NOTICE_TITLE)).toBeVisible();
      expect(take).not.toHaveBeenCalled();
    });

    it("hands readings to the taker again once the window is closed", async () => {
      const take = vi.fn();
      const { core, screen } = await renderReadings(<WithWindow open take={take} />);
      await expect.element(screen.getByRole("dialog", { name: "Una ventana" })).toBeVisible();

      await screen.rerender(
        <BarcodeReadings onBarcodeRead={core.onBarcodeRead}>
          <WithWindow open={false} take={take} />
        </BarcodeReadings>,
      );
      await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
      core.read("7790001234567");

      expect(take).toHaveBeenCalledExactlyOnceWith("7790001234567");
    });
  });

  it("stops listening to the core once it is gone", async () => {
    const { core, screen } = await renderReadings(null);

    await screen.unmount();

    expect(core.listening()).toBe(0);
  });
});
