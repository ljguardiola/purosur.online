import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { AssemblyBatchNotice } from "./assembly-batch-notice";

const TITLES = [
  "No se registró la tanda",
  "Demasiadas solicitudes",
  "La receta cambió",
  "Este producto ya no tiene receta",
];

test.each([
  [{ kind: "attemptFailed" } as const, "No se registró la tanda", "Volvé a intentarlo."],
  [
    { kind: "rateLimited", retryAfterSeconds: 120 } as const,
    "Demasiadas solicitudes",
    "Se puede volver a intentar en 2 minutos.",
  ],
  [
    { kind: "staleRecipe" } as const,
    "La receta cambió",
    "Cerrá esta ventana y volvé a abrirla para usar la receta actual.",
  ],
  [
    { kind: "productGone" } as const,
    "Este producto ya no tiene receta",
    "Cerrá esta ventana y actualizá la lista.",
  ],
])(
  "tells %j with its title and what to do next, and nothing else",
  async (notice, title, description) => {
    const screen = await render(<AssemblyBatchNotice notice={notice} />);

    await expect.element(screen.getByText(title, { exact: true })).toBeVisible();
    await expect.element(screen.getByText(description, { exact: true })).toBeVisible();
    for (const other of TITLES.filter((shown) => shown !== title)) {
      expect(screen.getByText(other).query()).toBeNull();
    }
  },
);
