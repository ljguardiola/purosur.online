import { readdirSync } from "node:fs";
import { z } from "zod";

const FIELD_CHANGE_READERS_DIR = new URL(
  "../../../test-support/field-change-readers/",
  import.meta.url,
);

const readerModuleShape = z.object({ changesPageSchema: z.instanceof(z.ZodType) });

const readerSchemaShape = z.object({
  properties: z.object({
    changes: z.object({
      items: z.object({
        oneOf: z.array(
          z.object({
            properties: z.object({
              entity: z.object({ const: z.string() }),
              row: z
                .object({
                  properties: z.object({
                    kind: z.object({ enum: z.array(z.string()) }).optional(),
                  }),
                })
                .optional(),
            }),
          }),
        ),
      }),
    }),
  }),
});

export interface FieldChangeReader {
  version: string;
  changesPage: z.ZodType;
  readableEntities: string[];
  readableStockMovementKinds: string[];
}

async function readerOf(fileName: string): Promise<FieldChangeReader> {
  const { changesPageSchema } = readerModuleShape.parse(
    await import(new URL(fileName, FIELD_CHANGE_READERS_DIR).href),
  );
  const changeShapes = readerSchemaShape.parse(
    z.toJSONSchema(changesPageSchema, { io: "input", unrepresentable: "any" }),
  ).properties.changes.items.oneOf;
  const stockMovement = changeShapes.find(
    ({ properties }) => properties.entity.const === "stock_movement",
  );
  return {
    version: fileName.slice(0, -".js".length),
    changesPage: changesPageSchema,
    readableEntities: changeShapes.map(({ properties }) => properties.entity.const),
    readableStockMovementKinds: stockMovement?.properties.row?.properties.kind?.enum ?? [],
  };
}

export function fieldChangeReaders(): Promise<FieldChangeReader[]> {
  return Promise.all(
    readdirSync(FIELD_CHANGE_READERS_DIR)
      .filter((name) => name.endsWith(".js"))
      .sort()
      .map(readerOf),
  );
}
