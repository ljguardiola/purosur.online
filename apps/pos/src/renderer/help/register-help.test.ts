import { searchArticles } from "@purosur/ui";
import { describe, expect, it } from "vitest";
import { help } from "./register-help";

const titles = Object.values(help.articles).map((article) => article.title);

function titlesFound(words: string): string[] {
  return searchArticles(help.articles, words).map(([, article]) => article.title);
}

const POINT_TERMINAL_TITLES = [
  "Cobrar con la Point integrada",
  "Pago rechazado en la Point",
  "Point que no se acredita a tiempo",
  "Cambiar de medio con un cobro en la Point",
  "Point integrada sin conexión",
  "Venta menor al mínimo de la Point",
];

const STANDALONE_TERMINAL_TITLE = "Point sin internet: la segunda Point";

const PAYMENTS_TITLES = [...POINT_TERMINAL_TITLES, STANDALONE_TERMINAL_TITLE];

const STARTUP_PENDING_TITLE = "Cosas para resolver al empezar";

describe("the register's help", () => {
  it("starts with the sections on adding products to a sale and on cancelling it, followed by charging on the integrated Point terminal and on the standalone one, and ends with what the register left pending when it starts", () => {
    expect(titles).toEqual([
      "Agregar un producto escaneándolo",
      "Agregar un producto buscándolo por nombre",
      "Cancelar una venta",
      ...PAYMENTS_TITLES,
      STARTUP_PENDING_TITLE,
    ]);
  });

  it("files the section on what the register left pending under Caja", () => {
    const startupPending = Object.values(help.articles).find(
      (article) => article.title === STARTUP_PENDING_TITLE,
    );

    expect(startupPending && help.categories[startupPending.category].label).toBe("Caja");
  });

  it("explains that a ticket that may have come out is reprinted only as a duplicate, and that nothing on the list stops selling but a paid order without a sale and the check for paid orders while it runs", () => {
    expect(titlesFound("duplicado")).toContain(STARTUP_PENDING_TITLE);
    expect(titlesFound("seguir vendiendo")).toEqual([STARTUP_PENDING_TITLE]);
    expect(
      titlesFound("salvo un cobro pagado sin venta y la consulta de los cobros pagados mientras sigue"),
    ).toEqual([STARTUP_PENDING_TITLE]);
  });

  it("explains that while the register is checking for paid orders it starts no new sale until the check ends, and that without a connection selling goes on and the register checks when the connection returns", () => {
    expect(titlesFound("Si la caja lo está consultando")).toEqual([STARTUP_PENDING_TITLE]);
    expect(titlesFound("no deja empezar una venta nueva hasta que termine")).toEqual([
      STARTUP_PENDING_TITLE,
    ]);
    expect(titlesFound("Si no había conexión, se puede seguir vendiendo")).toEqual([
      STARTUP_PENDING_TITLE,
    ]);
    expect(titlesFound("No frena la venta")).toEqual([]);
  });

  it("explains how to pass a paid order without a sale to refund, and the warning shown when there was no connection to look for one", () => {
    expect(titlesFound("Pasar a reembolso")).toEqual([STARTUP_PENDING_TITLE]);
    expect(titlesFound("la flecha de vuelta de la fila")).toEqual([STARTUP_PENDING_TITLE]);
    expect(titlesFound("Cobros pagados sin consultar")).toEqual([STARTUP_PENDING_TITLE]);
    expect(titlesFound("Ir a vender lleva a terminarla")).toEqual([STARTUP_PENDING_TITLE]);
    expect(titlesFound("no deja empezar una venta nueva hasta que lo pases a reembolso")).toEqual([
      STARTUP_PENDING_TITLE,
    ]);
    expect(titlesFound("Tocá Pasar a reembolso en la fila")).toEqual([]);
    expect(titlesFound("cuando vuelve la conexión")).toEqual([STARTUP_PENDING_TITLE]);
  });

  it("points to the row's printer, the only thing the row shows to print with, and names the duplicate modal's own button", () => {
    expect(titlesFound("impresora de la fila")).toEqual([STARTUP_PENDING_TITLE]);
    expect(titlesFound("Reimprimir duplicado")).toEqual([STARTUP_PENDING_TITLE]);
    expect(titlesFound("Tocá Imprimir el ticket")).toEqual([]);
    expect(titlesFound("Tocá Reimprimir como duplicado")).toEqual([]);
  });

  it("files every section under a category it declares", () => {
    for (const article of Object.values(help.articles)) {
      expect(Object.keys(help.categories)).toContain(article.category);
    }
  });

  it("files the card terminals' sections under Cobros", () => {
    const categories = Object.values(help.articles)
      .filter((article) => PAYMENTS_TITLES.includes(article.title))
      .map((article) => help.categories[article.category].label);

    expect(categories).toEqual(PAYMENTS_TITLES.map(() => "Cobros"));
  });

  it.each([
    ["lector", "Agregar un producto escaneándolo"],
    ["flechas", "Agregar un producto buscándolo por nombre"],
    ["reembolsos que corresponden", "Cancelar una venta"],
    ["enviar a la terminal", "Cobrar con la Point integrada"],
    ["rechazó", "Pago rechazado en la Point"],
    ["venció", "Point que no se acredita a tiempo"],
    ["esperando la cancelación", "Cambiar de medio con un cobro en la Point"],
    ["no disponible sin conexión", "Point integrada sin conexión"],
    ["menores a", "Venta menor al mínimo de la Point"],
    ["registrar pago aprobado", STANDALONE_TERMINAL_TITLE],
    ["nunca se imprimió", STARTUP_PENDING_TITLE],
  ])("finds the section on %s by a word from its body", (word, title) => {
    expect(titlesFound(word)).toEqual([title]);
  });

  it("explains that the pending refund of a standalone terminal payment is given back from that terminal or the Mercado Pago app, and marked as done in the backoffice", () => {
    expect(titlesFound("desde esa terminal o la app de Mercado Pago")).toEqual([
      "Cancelar una venta",
    ]);
    expect(titlesFound("quien lo devolvió lo marca como hecho en el backoffice")).toEqual([
      "Cancelar una venta",
    ]);
  });

  it("explains that the pending refund of a Mercado Pago QR payment is sent by the cloud once a person confirms it in the backoffice, with nobody marking it done", () => {
    expect(
      titlesFound(
        "El de un pago con QR, en cambio, lo envía la nube a Mercado Pago cuando alguien lo confirma en el backoffice",
      ),
    ).toEqual(["Cancelar una venta"]);
    expect(titlesFound("Un reembolso pendiente lo hace alguien fuera de la caja")).toEqual([]);
  });

  it("explains that an order already on the terminal is cancelled there, and another method is offered once the terminal confirms it", () => {
    expect(titlesFound("cancelalo en la terminal")).toContain(
      "Cambiar de medio con un cobro en la Point",
    );
    expect(titlesFound("cuando la terminal confirma la cancelación")).toContain(
      "Cambiar de medio con un cobro en la Point",
    );
  });

  it("explains that the register warns of no cloud connection only when it could not confirm the order sent or reach the cloud to cancel it", () => {
    expect(titlesFound("no pudo confirmarlo con la nube")).toEqual([
      "Point integrada sin conexión",
    ]);
    expect(titlesFound("la cancelación no llega a la nube")).toEqual([
      "Point integrada sin conexión",
    ]);
    expect(titlesFound("sigue mostrando el tiempo para pagar")).toEqual([
      "Point integrada sin conexión",
    ]);
  });

  it("explains that the standalone terminal's result is entered by hand and recorded against whoever confirms it", () => {
    expect(titlesFound("cargá a mano")).toEqual([STANDALONE_TERMINAL_TITLE]);
    expect(titlesFound("a nombre de quien lo confirma")).toEqual([STANDALONE_TERMINAL_TITLE]);
  });

  it("tells never to switch either card terminal's mode", () => {
    expect(titlesFound("nadie cambia el modo de ninguna de las dos")).toEqual([
      STANDALONE_TERMINAL_TITLE,
    ]);
  });

  it("points from the integrated Point terminal without connection to the standalone terminal", () => {
    expect(help.articles["point-terminal-offline"].body).toContainEqual({
      kind: "articleLink",
      article: "charge-on-standalone-terminal",
    });
  });
});
