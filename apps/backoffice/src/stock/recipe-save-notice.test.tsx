import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { RecipeSaveNotice } from "./recipe-save-notice";

const TITLES = [
  "No se guardó la receta",
  "Demasiadas solicitudes",
  "Otra persona cambió esta receta",
  "Este producto ya no está disponible",
];

test.each([
  [{ kind: "attemptFailed" } as const, "No se guardó la receta", "Volvé a intentarlo."],
  [
    { kind: "rateLimited", retryAfterSeconds: 120 } as const,
    "Demasiadas solicitudes",
    "Se puede volver a intentar en 2 minutos.",
  ],
  [
    { kind: "staleVersion" } as const,
    "Otra persona cambió esta receta",
    "Cerrá esta ventana y volvé a abrirla para ver cómo quedó.",
  ],
  [
    { kind: "productNotFound" } as const,
    "Este producto ya no está disponible",
    "Cerrá esta ventana y actualizá la lista.",
  ],
])(
  "tells %j with its title and what to do next, and nothing else",
  async (notice, title, description) => {
    const screen = await render(<RecipeSaveNotice notice={notice} />);

    await expect.element(screen.getByText(title, { exact: true })).toBeVisible();
    await expect.element(screen.getByText(description, { exact: true })).toBeVisible();
    for (const other of TITLES.filter((shown) => shown !== title)) {
      expect(screen.getByText(other).query()).toBeNull();
    }
  },
);
