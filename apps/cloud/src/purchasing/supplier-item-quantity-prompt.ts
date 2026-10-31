import { STOCK_QUANTITY_PER_UNIT } from "@purosur/domain";
import { z } from "zod";

export const SUPPLIER_ITEM_QUANTITY_RULE = [
  "Quantity: also state how much of the product's sale unit the item brings, as a number: units for a product whose sale unit is UNIT, kilograms (decimals allowed) for a product whose sale unit is KG.",
  "Read it from the item's description and presentation, taking the product's sale unit and net content into account.",
  "The item also carries the other presentations the same list states for the same description; they depend on each other, so use them to resolve what a presentation counts.",
  'Examples: the presentation "x3 packs" with another presentation "Pack x12u" is three packs of 12 units, so 36 for a product sold by UNIT; the presentation "Caja x5 bol" with another presentation "Bolsa 2,5kg" is five bags of 2.5 kg, so 12.5 for a product sold by KG; the presentation "5 kg ($22800 kg)" for a product sold by KG is 5.',
  "Answer null for the quantity when you are not certain of it. Never guess.",
].join(" ");

export const quantityAnswerSchema = z.number().nullable();

export function thousandthsOf(quantity: number | null): number | null {
  return quantity === null ? null : Math.round(quantity * STOCK_QUANTITY_PER_UNIT);
}
