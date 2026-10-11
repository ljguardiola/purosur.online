import { Modal } from "@purosur/ui";
import { CircleX } from "lucide-react";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { BarcodeReadings, useBarcodeReadings } from "./barcode-readings";

const NOTICE_TITLE = "No se agregó el producto escaneado";
const NOTICE_DESCRIPTION =
  "Escaneá el código de nuevo cuando estés en la venta, sin ventanas abiertas.";

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

  it("shows the warning, readable by assistive technology, while a modal is open", async () => {
    await page.viewport(1280, 900);
    onTestFinished(() => page.viewport(414, 896));
    const core = fakeCore();
    const screen = await render(
      <BarcodeReadings onBarcodeRead={core.onBarcodeRead}>
        <Modal
          open
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
      </BarcodeReadings>,
    );

    core.read("7790001234567");

    await expect.element(screen.getByRole("dialog", { name: "Una ventana" })).toBeVisible();
    await expect.element(screen.getByText(NOTICE_TITLE)).toBeVisible();
    await expect
      .poll(() =>
        Array.from(document.body.children).some(
          (child) => child.hasAttribute("inert") && !child.hasAttribute("hidden"),
        ),
      )
      .toBe(true);
    expect(screen.getByRole("status").elements()).toHaveLength(1);
  });

  it("stops listening to the core once it is gone", async () => {
    const { core, screen } = await renderReadings(null);

    await screen.unmount();

    expect(core.listening()).toBe(0);
  });
});
