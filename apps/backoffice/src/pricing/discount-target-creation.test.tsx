import type { DiscountTargets } from "@purosur/contracts";
import type { DiscountTargetKind } from "@purosur/domain";
import { Button } from "@purosur/ui";
import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import {
  StubCategoryCreationModal,
  StubProductCreationModal,
} from "../platform/test-support/creation-parts";
import { render } from "../shell/test-support/render-with-router";
import {
  DiscountTargetCreationNotice,
  type DiscountTargetCreationParts,
  type DiscountTargetCreationServices,
  useDiscountTargetCreation,
} from "./discount-target-creation";
import { targetsWithCreatedProduct } from "./test-support/discount-target-creation";
import { discountTargets } from "./test-support/discounts";

const parts: DiscountTargetCreationParts = {
  productCreationModal: StubProductCreationModal,
  categoryCreationModal: StubCategoryCreationModal,
};

function CreationHost({
  services,
  withParts,
  choose,
  onSessionEnded,
}: {
  services: DiscountTargetCreationServices;
  withParts: boolean;
  choose: (targetId: string | null) => void;
  onSessionEnded: () => void;
}) {
  const creation = useDiscountTargetCreation({
    targets: discountTargets,
    services,
    parts: withParts ? parts : undefined,
    benefitKind: () => "PERCENT_OFF",
    choose,
    onSessionEnded,
  });
  const kinds: DiscountTargetKind[] = ["PRODUCT", "CATEGORY", "TAG"];
  return (
    <main>
      <DiscountTargetCreationNotice text={creation.notice} />
      <p>{`Creación: ${kinds.map((kind) => creation.creationOf(kind)?.recordKind ?? "ninguna").join(", ")}`}</p>
      <p>{`Productos: ${creation.sources.products.map(({ name }) => name).join(", ")}`}</p>
      <Button
        variant="secondary"
        onPress={() => creation.creationOf("PRODUCT")?.onCreate("Fideos nuevos")}
      >
        Crear el producto tipeado
      </Button>
      <Button variant="secondary" onPress={creation.reset}>
        Abrir de nuevo
      </Button>
      {creation.modals}
    </main>
  );
}

async function hosted(
  fetchDiscountTargets: DiscountTargetCreationServices["fetchDiscountTargets"],
  { withParts = true }: { withParts?: boolean } = {},
) {
  const choose = vi.fn();
  const onSessionEnded = vi.fn();
  const screen = await render(
    <CreationHost
      services={{ fetchDiscountTargets, createTag: vi.fn() }}
      withParts={withParts}
      choose={choose}
      onSessionEnded={onSessionEnded}
    />,
  );
  return { screen, choose, onSessionEnded };
}

async function createFideos(screen: Awaited<ReturnType<typeof hosted>>["screen"]) {
  await userEvent.click(screen.getByRole("button", { name: "Crear el producto tipeado" }));
  await userEvent.click(
    page
      .getByRole("dialog", { name: "Nuevo producto" })
      .getByRole("button", { name: "Guardar lo creado" }),
  );
}

function listing(value: DiscountTargets) {
  return vi.fn().mockResolvedValue({ kind: "ok", value });
}

test("offers creating each kind of target only when given the parts that create them", async () => {
  const { screen } = await hosted(listing(discountTargets));

  await expect.element(screen.getByText("Creación: producto, categoría, distintivo")).toBeVisible();
});

test("offers no creation without the parts that create targets", async () => {
  const { screen } = await hosted(listing(discountTargets), { withParts: false });

  await expect.element(screen.getByText("Creación: ninguna, ninguna, ninguna")).toBeVisible();
});

test("chooses the created target and offers it once the cloud lists it for the benefit", async () => {
  const { screen, choose } = await hosted(
    listing(targetsWithCreatedProduct("Fideos nuevos", ["PERCENT_OFF"])),
  );

  await createFideos(screen);

  await expect.poll(() => choose).toHaveBeenCalledWith("created-product");
  await expect.element(screen.getByText(/^Productos: .*Fideos nuevos$/)).toBeVisible();
  expect(screen.getByText(/^Se creó/).query()).toBeNull();
});

test("chooses nothing and says so when the cloud does not list the created target for the benefit", async () => {
  const { screen, choose } = await hosted(
    listing(targetsWithCreatedProduct("Fideos nuevos", ["BUY_N_PAY_M"])),
  );

  await createFideos(screen);

  await expect
    .element(
      screen
        .getByText("Se creó el producto «Fideos nuevos», pero no puede recibir este beneficio.")
        .first(),
    )
    .toBeVisible();
  expect(choose).toHaveBeenCalledWith(null);
});

test("chooses nothing and says so when what the cloud offers cannot be read again", async () => {
  const { screen, choose } = await hosted(vi.fn().mockResolvedValue({ kind: "failed" }));

  await createFideos(screen);

  await expect
    .element(
      screen
        .getByText("Se creó el producto «Fideos nuevos», pero no pudimos cargarlo para elegirlo.")
        .first(),
    )
    .toBeVisible();
  expect(choose).toHaveBeenCalledWith(null);
  await expect
    .element(screen.getByText("Productos: Yerba Hoja Alta 1 kg, Almendras peladas"))
    .toBeVisible();
});

test("ends the session once when reading what the cloud offers again finds it ended", async () => {
  const { screen, choose, onSessionEnded } = await hosted(
    vi.fn().mockResolvedValue({ kind: "unauthenticated" }),
  );

  await createFideos(screen);

  await expect.poll(() => onSessionEnded).toHaveBeenCalledTimes(1);
  expect(choose).not.toHaveBeenCalled();
});

test.each([
  [
    "lists the created target",
    { kind: "ok", value: targetsWithCreatedProduct("Fideos nuevos", ["PERCENT_OFF"]) },
  ],
  ["fails", { kind: "failed" }],
] as const)(
  "a reading again that %s only after the form opened again changes nothing in the new opening",
  async (_answer, outcome) => {
    let answer: (outcome: CloudReadOutcome<DiscountTargets>) => void = () => {};
    const fetchDiscountTargets = vi.fn().mockReturnValue(
      new Promise<CloudReadOutcome<DiscountTargets>>((resolve) => {
        answer = resolve;
      }),
    );
    const { screen, choose } = await hosted(fetchDiscountTargets);
    await createFideos(screen);
    await expect.poll(() => fetchDiscountTargets).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Abrir de nuevo" }));

    answer(outcome);
    await userEvent.click(screen.getByRole("button", { name: "Crear el producto tipeado" }));
    await expect.element(page.getByRole("dialog", { name: "Nuevo producto" })).toBeVisible();

    await expect
      .element(screen.getByText("Productos: Yerba Hoja Alta 1 kg, Almendras peladas"))
      .toBeVisible();
    expect(screen.getByText(/^Se creó/).query()).toBeNull();
    expect(choose).not.toHaveBeenCalled();
  },
);
