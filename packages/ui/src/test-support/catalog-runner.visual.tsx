import { composeStory } from "@storybook/react-vite";
import type { ReactElement } from "react";
import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { cleanup } from "vitest-browser-react";
import { type CatalogStory, renderCatalogStory } from "./catalog-runner";

function harnessStory(name: string, render: () => ReactElement): CatalogStory {
  return composeStory({ name, render }, { title: "Harness" });
}

const storyDrawingLongWrappedText = harnessStory("Drawing long wrapped text", () => (
  <div data-testid="drawn" className="flex flex-col gap-3">
    <p className="text-text text-body">
      El QR de una venta se pagó dos veces; el pago de más es el de la orden
      ORD01JZ8K3M4N5P6Q7R8S9T0V de Mercado Pago.
    </p>
    <div className="flex flex-col gap-1">
      <p className="font-bold text-text text-detail">Qué hacer</p>
      <p className="text-text text-body">
        Si ese reembolso ya se hizo desde Mercado Pago, marcarlo como hecho; si todavía no se hizo,
        hacerlo cuanto antes por el mismo medio, o descartarlo si no corresponde. El Administrador
        ya fue avisado.
      </p>
    </div>
  </div>
));

const storyDrawingOneShortLine = harnessStory("Drawing one short line", () => (
  <p data-testid="drawn" className="text-text text-body">
    Otra historia.
  </p>
));

function drawnBounds(container: HTMLElement): DOMRect {
  const drawn = container.querySelector("[data-testid='drawn']");
  if (drawn === null) {
    throw new Error("The story drew nothing.");
  }
  return drawn.getBoundingClientRect();
}

async function capturedPixels(): Promise<ImageData> {
  const base64 = await page.screenshot({ element: document.body, save: false });
  const response = await fetch(`data:image/png;base64,${base64}`);
  const bitmap = await createImageBitmap(await response.blob());
  const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext("2d");
  if (context === null) {
    throw new Error("The capture could not be read back.");
  }
  context.drawImage(bitmap, 0, 0);
  return context.getImageData(0, 0, bitmap.width, bitmap.height);
}

function colorAt(pixels: ImageData, x: number, y: number): string {
  const offset = (y * pixels.width + x) * 4;
  return [...pixels.data.subarray(offset, offset + 4)].join(",");
}

function pixelsOffTheBackgroundInRows(pixels: ImageData, top: number, bottom: number): string[] {
  const background = colorAt(pixels, pixels.width - 1, pixels.height - 1);
  const off: string[] = [];
  for (let y = Math.ceil(top); y < Math.min(Math.ceil(bottom), pixels.height); y++) {
    for (let x = 0; x < pixels.width; x++) {
      if (colorAt(pixels, x, y) !== background) {
        off.push(`${x},${y}`);
      }
    }
  }
  return off;
}

async function capturedRowsOffTheBackground(top: number, bottom: number): Promise<string[]> {
  return pixelsOffTheBackgroundInRows(await capturedPixels(), top, bottom);
}

// What a story leaves behind depends on when Chromium happens to repaint, so it does not show up
// after every story; varying how many stories of each kind follow each other makes it show up
// within a single run.
const ROUNDS = 6;

test("captures a story with nothing left of the stories before it where it draws nothing", async () => {
  const leftovers: { round: number; pixels: string[] }[] = [];
  let longTextBottom = 0;
  for (let round = 0; round < ROUNDS; round++) {
    for (let repeat = 0; repeat <= round % 3; repeat++) {
      await cleanup();
      const longText = drawnBounds(await renderCatalogStory(storyDrawingLongWrappedText));
      expect(await capturedRowsOffTheBackground(longText.top, longText.bottom)).not.toEqual([]);
      longTextBottom = longText.bottom;
    }
    for (let repeat = 0; repeat <= round % 2; repeat++) {
      await cleanup();
      const shortLine = drawnBounds(await renderCatalogStory(storyDrawingOneShortLine));
      const pixels = await capturedRowsOffTheBackground(shortLine.bottom, longTextBottom);
      if (pixels.length > 0) {
        leftovers.push({ round, pixels });
      }
    }
  }

  expect(leftovers).toEqual([]);
});
