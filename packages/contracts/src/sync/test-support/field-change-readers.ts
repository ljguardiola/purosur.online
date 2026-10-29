import { readdirSync, readFileSync } from "node:fs";
import { z } from "zod";

export const FIELD_CHANGE_READERS_DIR = new URL("./field-change-readers/", import.meta.url);

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

export function fieldChangeReaders(): FieldChangeReader[] {
  return readdirSync(FIELD_CHANGE_READERS_DIR)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => {
      const jsonSchema = JSON.parse(readFileSync(new URL(name, FIELD_CHANGE_READERS_DIR), "utf8"));
      const changeShapes = readerSchemaShape.parse(jsonSchema).properties.changes.items.oneOf;
      const stockMovement = changeShapes.find(
        ({ properties }) => properties.entity.const === "stock_movement",
      );
      return {
        version: name.slice(0, -".json".length),
        changesPage: z.fromJSONSchema(jsonSchema),
        readableEntities: changeShapes.map(({ properties }) => properties.entity.const),
        readableStockMovementKinds: stockMovement?.properties.row?.properties.kind?.enum ?? [],
      };
    });
}
