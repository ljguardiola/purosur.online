import { defineHelp } from "@purosur/ui";

export const help = defineHelp("es-AR", {
  categories: {
    sales: { label: "Ventas" },
    payments: { label: "Cobros" },
    register: { label: "Caja" },
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
          text: "Un reembolso pendiente no se hace desde la caja. El de una transferencia lo hace alguien por transferencia; el de un pago con la terminal independiente, desde esa terminal o la app de Mercado Pago, nunca en efectivo; quien lo devolvió lo marca como hecho en el backoffice. El de un pago con QR, en cambio, lo envía la nube a Mercado Pago cuando alguien lo confirma en el backoffice.",
        },
      ],
    },
    "charge-on-point-terminal": {
      category: "payments",
      title: "Cobrar con la Point integrada",
      body: [
        {
          kind: "paragraph",
          text: "La Point integrada cobra con tarjeta o QR en la terminal, y necesita internet.",
        },
        {
          kind: "steps",
          items: [
            "En Venta en curso, tocá Cobrar y elegí Point integrada.",
            "Revisá el importe a cobrar con este medio. Si cobrás menos que el saldo pendiente, el resto queda para otro medio.",
            "Tocá Enviar a la terminal. Desde ese momento el importe ya no se puede cambiar.",
            "El cliente paga con tarjeta o QR en la terminal mientras la caja muestra la cuenta regresiva.",
            "Cuando la caja muestra que el cliente pagó en la terminal, tocá Continuar.",
          ],
        },
        {
          kind: "note",
          text: "Si queda saldo, la caja lo muestra en Falta cobrar y lo cobrás con otro medio.",
        },
        { kind: "heading", text: "Si algo no sale como esperabas" },
        { kind: "articleLink", article: "point-payment-declined" },
        { kind: "articleLink", article: "point-payment-not-credited" },
        { kind: "articleLink", article: "change-method-with-point-charge" },
        { kind: "articleLink", article: "point-terminal-offline" },
        { kind: "articleLink", article: "point-below-minimum" },
      ],
    },
    "point-payment-declined": {
      category: "payments",
      title: "Pago rechazado en la Point",
      body: [
        { kind: "heading", text: "Qué pasa" },
        {
          kind: "paragraph",
          text: "La caja muestra que la terminal rechazó el pago: no se aprobó y no se cobró nada.",
        },
        { kind: "heading", text: "Qué hacer" },
        {
          kind: "steps",
          items: [
            "Tocá Elegir otro medio.",
            "Volvé a intentar con la Point integrada o cobrá con otro medio.",
          ],
        },
      ],
    },
    "point-payment-not-credited": {
      category: "payments",
      title: "Point que no se acredita a tiempo",
      body: [
        { kind: "heading", text: "Qué pasa" },
        {
          kind: "paragraph",
          text: "La caja espera el pago mientras corre la cuenta regresiva. Si el cobro venció en la terminal, no se cobró nada. Si se termina el tiempo de espera y el cobro sigue en la terminal, hay que cancelarlo ahí.",
        },
        { kind: "heading", text: "Qué hacer" },
        {
          kind: "steps",
          items: [
            "Si el cobro venció, tocá Elegir otro medio y volvé a intentar con la Point o cobrá con otro medio.",
            "Si se terminó el tiempo de espera, cancelá el cobro en la terminal.",
            "Cuando la terminal confirma la cancelación, tocá Elegir otro medio.",
          ],
        },
        {
          kind: "note",
          text: "Si el cliente llegó a pagar antes de la cancelación, la caja muestra que pagó en la terminal y el pago queda cobrado.",
        },
      ],
    },
    "change-method-with-point-charge": {
      category: "payments",
      title: "Cambiar de medio con un cobro en la Point",
      body: [
        { kind: "heading", text: "Qué pasa" },
        {
          kind: "paragraph",
          text: "La caja no puede cancelar un cobro que ya está en la terminal: se cancela en la terminal misma.",
        },
        { kind: "heading", text: "Qué hacer" },
        {
          kind: "steps",
          items: [
            "Tocá Cambiar de medio. Si la terminal todavía no tomó el cobro, la caja lo cancela y volvés a elegir medio.",
            "Si el cobro ya está en la terminal, la caja muestra Esperando la cancelación en la terminal: cancelalo en la terminal.",
            "Cuando la terminal confirma la cancelación, se habilita Elegir otro medio.",
          ],
        },
        {
          kind: "note",
          text: "Si el cliente llegó a pagar antes de la cancelación, la caja muestra que pagó en la terminal y el pago queda cobrado.",
        },
      ],
    },
    "point-terminal-offline": {
      category: "payments",
      title: "Point integrada sin conexión",
      body: [
        { kind: "heading", text: "Qué pasa" },
        {
          kind: "paragraph",
          text: "La Point integrada necesita internet. Sin conexión aparece como No disponible sin conexión y no se puede elegir. Si la conexión se corta con un cobro ya en la terminal, la caja sigue mostrando el tiempo para pagar.",
        },
        {
          kind: "paragraph",
          text: "La caja avisa que no hay conexión con la nube cuando envió el cobro a la terminal pero no pudo confirmarlo con la nube, o cuando tocás Cambiar de medio y la cancelación no llega a la nube.",
        },
        { kind: "heading", text: "Qué hacer" },
        {
          kind: "steps",
          items: [
            "Sin conexión, cobrá con otro medio.",
            "Si la caja avisa que no hay conexión con la nube, cancelá el cobro en la terminal y esperá a que vuelva la conexión.",
          ],
        },
        { kind: "articleLink", article: "charge-on-standalone-terminal" },
      ],
    },
    "point-below-minimum": {
      category: "payments",
      title: "Venta menor al mínimo de la Point",
      body: [
        { kind: "heading", text: "Qué pasa" },
        {
          kind: "paragraph",
          text: "La Point integrada no acepta cobros menores a un mínimo. Si el saldo pendiente es menor, no aparece entre los medios y la caja avisa desde qué importe se ofrece. Si escribís un importe menor, la caja te avisa en el campo.",
        },
        { kind: "heading", text: "Qué hacer" },
        {
          kind: "steps",
          items: [
            "Si el saldo pendiente es menor al mínimo, cobralo con otro medio.",
            "Si el saldo alcanza, cobrá con la Point al menos el mínimo y el resto con otro medio.",
          ],
        },
      ],
    },
    "charge-on-standalone-terminal": {
      category: "payments",
      title: "Point sin internet: la segunda Point",
      body: [
        { kind: "heading", text: "Qué pasa" },
        {
          kind: "paragraph",
          text: "Cuando la caja no llega a Mercado Pago, la Point integrada y el QR no se pueden usar. La segunda Point cobra sin la caja: el cliente paga en ella y vos cargás el resultado en la caja.",
        },
        { kind: "heading", text: "Qué hacer" },
        {
          kind: "steps",
          items: [
            "En Venta en curso, tocá Cobrar y elegí Terminal independiente.",
            "Revisá el importe a cobrar con este medio. Si cobrás menos que el saldo pendiente, el resto queda para otro medio.",
            "Cobrá ese mismo importe en la segunda Point.",
            "Cuando la terminal muestra el pago aprobado, cargá a mano el resultado: tocá Registrar pago aprobado.",
            "Si la terminal rechaza el pago, no registres nada: tocá Cambiar de medio.",
          ],
        },
        {
          kind: "note",
          text: "El pago queda a nombre de quien lo confirma en la caja.",
        },
        { kind: "heading", text: "Nunca cambies el modo de las terminales" },
        {
          kind: "paragraph",
          text: "La segunda Point queda siempre en su modo autónomo y la Point integrada en el suyo. Durante un corte nadie cambia el modo de ninguna de las dos.",
        },
      ],
    },
    "startup-pending": {
      category: "register",
      title: "Cosas para resolver al empezar",
      body: [
        {
          kind: "paragraph",
          text: "Si la caja se cerró sin terminar algunas operaciones, al entrar muestra lo que quedó antes de ir a Venta en curso. Podés resolverlo en ese momento o tocar Ir a vender y seguir vendiendo: nada de esta lista frena la caja, salvo un cobro pagado sin venta y la consulta de los cobros pagados mientras sigue en curso.",
        },
        {
          kind: "steps",
          items: [
            "Venta sin ticket: la venta nunca se imprimió. Tocá la impresora de la fila y el ticket sale enseguida como original.",
            "Ticket sin confirmar: puede que el ticket haya salido. Tocá la impresora de la fila, escribí el motivo de la reimpresión y tocá Reimprimir duplicado: sale como duplicado.",
            "Factura o cobro en consulta: la caja lo consulta sola, y desaparece de la lista cuando llega la respuesta.",
            "Cobro pagado sin venta: el cliente pagó con QR o Point y la venta no quedó en la caja. La caja no deja empezar una venta nueva hasta que lo pases a reembolso: si quedó una venta abierta, Ir a vender lleva a terminarla; si no, Ir a vender queda desactivado. Tocá la flecha de vuelta de la fila y confirmá con Pasar a reembolso: el cobro queda como un reembolso que se marca como hecho en el backoffice, y al cliente no se le cobra de nuevo.",
            "Cobros pagados sin consultar: la caja todavía no sabe si hay un cobro pagado sin venta, porque lo está consultando o porque no había conexión. Si la caja lo está consultando, no deja empezar una venta nueva hasta que termine: si quedó una venta abierta, Ir a vender lleva a terminarla; si no, Ir a vender queda desactivado. Si no había conexión, se puede seguir vendiendo: la caja lo consulta cuando vuelve la conexión y, si lo encuentra, lo agrega a la lista.",
          ],
        },
      ],
    },
  },
});
