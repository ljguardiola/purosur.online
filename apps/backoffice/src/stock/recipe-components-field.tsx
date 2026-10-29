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
import { creatableChoice } from "../platform/creatable-options";
import { quantityFieldKind } from "../platform/stock-quantity";
import {
  type RecipeComponentValues,
  recipeComponentOf,
  recipeComponentOptions,
} from "./recipe-form";

type RecipeComponentsFieldProps = {
  products: RecipeList["products"];
  assembledProductId: string | null;
  refusals: Readonly<Record<string, string>>;
  onComponentsChange: () => void;
  onCreateProduct?: ((typedName: string) => void) | undefined;
};

export function RecipeComponentsField({
  products,
  assembledProductId,
  refusals,
  onComponentsChange,
  onCreateProduct,
}: RecipeComponentsFieldProps) {
  const field = useFieldContext<RecipeComponentValues[]>();
  const components = field.state.value;
  const [adding, setAdding] = useState(false);
  const [first, ...rest] = recipeComponentOptions(products, assembledProductId, components);
  const componentChoice = creatableChoice(
    first ? [first, ...rest] : undefined,
    onCreateProduct ? { recordKind: "producto", onCreate: onCreateProduct } : undefined,
  );

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
      field.handleChange([...components, recipeComponentOf(product)]);
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
          {adding && componentChoice ? (
            <ComboBox
              label="Componente"
              placeholder="Buscá un producto"
              value={null}
              onChange={add}
              {...componentChoice}
            />
          ) : (
            <div>
              <Button
                variant="text"
                icon={<Plus />}
                disabled={componentChoice === undefined}
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
