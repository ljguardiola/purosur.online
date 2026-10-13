import type { RecipeList } from "@purosur/contracts";
import {
  Button,
  Card,
  ComboBox,
  IconButton,
  InlineNotice,
  SharedFieldError,
  TextField,
  useFieldContext,
} from "@purosur/ui";
import { Plus, Trash2, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { quantityFieldKind } from "../platform/stock-quantity";
import { type RecipeComponentValues, recipeComponentOptions } from "./recipe-form";

type RecipeComponentsFieldProps = {
  products: RecipeList["products"];
  assembledProductId: string | null;
  refusals: Readonly<Record<string, string>>;
  onComponentsChange: () => void;
};

export function RecipeComponentsField({
  products,
  assembledProductId,
  refusals,
  onComponentsChange,
}: RecipeComponentsFieldProps) {
  const field = useFieldContext<RecipeComponentValues[]>();
  const components = field.state.value;
  const [adding, setAdding] = useState(false);
  const [first, ...rest] = recipeComponentOptions(products, assembledProductId, components);

  function change(productId: string, patch: Partial<RecipeComponentValues>) {
    onComponentsChange();
    field.handleChange(
      components.map((component) =>
        component.productId === productId ? { ...component, ...patch } : component,
      ),
    );
  }

  function add(productId: string) {
    const product = products.find((other) => other.id === productId);
    if (product) {
      onComponentsChange();
      field.handleChange([
        ...components,
        { productId, name: product.name, saleUnit: product.saleUnit, quantity: "" },
      ]);
    }
    setAdding(false);
  }

  return (
    <SharedFieldError>
      {(errorMessageId) => (
        <fieldset
          aria-label="Componentes"
          {...(errorMessageId === undefined ? {} : { "aria-describedby": errorMessageId })}
          className="flex min-w-0 flex-col gap-3"
        >
          {components.map((component) => {
            const refusal = refusals[component.productId];
            return (
              <Card key={component.productId} variant="subtle">
                <div className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate font-bold text-body text-text">
                    {component.name}
                  </span>
                  <div className="w-42.5 shrink-0">
                    <TextField
                      {...quantityFieldKind(component.saleUnit)}
                      label={`Cantidad de ${component.name}`}
                      labelVisuallyHidden
                      value={component.quantity}
                      onChange={(quantity) => change(component.productId, { quantity })}
                    />
                  </div>
                  <IconButton
                    variant="subtle"
                    icon={<Trash2 />}
                    aria-label={`Quitar ${component.name}`}
                    onPress={() => {
                      onComponentsChange();
                      field.handleChange(
                        components.filter((other) => other.productId !== component.productId),
                      );
                    }}
                  />
                </div>
                {refusal === undefined ? null : (
                  <InlineNotice tone="error" icon={<TriangleAlert />} title={refusal} />
                )}
              </Card>
            );
          })}
          {adding && first ? (
            <ComboBox
              label="Componente"
              placeholder="Buscá un producto"
              options={[first, ...rest]}
              value={null}
              onChange={add}
            />
          ) : (
            <div>
              <Button
                variant="text"
                icon={<Plus />}
                disabled={first === undefined}
                onPress={() => setAdding(true)}
              >
                Agregar un componente
              </Button>
            </div>
          )}
        </fieldset>
      )}
    </SharedFieldError>
  );
}
