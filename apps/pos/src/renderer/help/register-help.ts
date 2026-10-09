import { defineHelp } from "@purosur/ui";

export const help = defineHelp("es-AR", {
  categories: {
    sales: { label: "Ventas" },
  },
  articles: {
    "add-scanned-product": {
      category: "sales",
      title: "Agregar un producto escaneándolo",
      body: [
        {
          kind: "paragraph",
          text: "Con la caja abierta, en Venta en curso, el campo Producto queda listo para escanear.",
        },
        {
          kind: "steps",
          items: [
            "Pasá el código de barras del producto por el lector.",
            "El producto se suma al carrito con su precio. Si ya estaba, su línea suma una unidad.",
          ],
        },
        {
          kind: "note",
          text: "Si la caja dice que no hay ningún producto con ese código, buscalo por nombre. Si tampoco aparece, falta darlo de alta en el backoffice.",
        },
      ],
    },
    "add-product-by-name": {
      category: "sales",
      title: "Agregar un producto buscándolo por nombre",
      body: [
        {
          kind: "steps",
          items: [
            "En el campo Producto, escribí parte del nombre del producto.",
            "Elegí el producto de la lista: con las flechas y Enter, o tocándolo.",
            "El producto se suma al carrito con su precio.",
          ],
        },
        { kind: "note", text: "Escape cierra la lista sin borrar lo que escribiste." },
      ],
    },
    "cancel-sale": {
      category: "sales",
      title: "Cancelar una venta",
      body: [
        {
          kind: "steps",
          items: [
            "En Venta en curso, tocá Cancelar venta.",
            "Revisá las líneas y el total, y confirmá con Cancelar la venta. Para volver sin cancelar, tocá Seguir con la venta.",
          ],
        },
        {
          kind: "paragraph",
          text: "Se vacía el carrito y no se cobra nada. La mercadería no sale del stock.",
        },
        { kind: "heading", text: "Si la venta ya tiene pagos" },
        {
          kind: "paragraph",
          text: "La caja muestra lo pagado y los reembolsos que corresponden. Cancelarla requiere el permiso de anular ventas: si no lo tenés, elegí a alguien que lo tenga para que ponga su PIN.",
        },
        {
          kind: "note",
          text: "Un reembolso pendiente lo hace alguien fuera de la caja y lo marca como hecho en el backoffice.",
        },
      ],
    },
  },
});
