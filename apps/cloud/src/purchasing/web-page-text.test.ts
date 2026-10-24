import { describe, expect, it } from "vitest";
import { webPageText } from "./web-page-text.js";

function textOf(html: string): string {
  return webPageText(new TextEncoder().encode(html));
}

describe("the text of a web page", () => {
  it("keeps the visible text of the body", () => {
    expect(textOf("<html><body><h1>Lista de precios</h1><p>Marzo 2026</p></body></html>")).toBe(
      "Lista de precios\nMarzo 2026",
    );
  });

  it.each([
    ["scripts", "<script>var precio = 1;</script>"],
    ["styles", "<style>.precio { color: red }</style>"],
    ["noscript fallbacks", "<noscript>Activá JavaScript</noscript>"],
    ["templates", "<template><p>Plantilla</p></template>"],
    ["inline drawings", "<svg><title>Logo</title><text>Marca</text></svg>"],
    ["comments", "<!-- ignorar esto -->"],
  ])("leaves out %s", (_name, dropped) => {
    expect(textOf(`<body><p>Yerba</p>${dropped}<p>Azúcar</p></body>`)).toBe("Yerba\nAzúcar");
  });

  it("leaves out the head of the page, with its title, links and meta tags", () => {
    const html = `<html><head><title>Proveedor</title><meta name="description" content="Lista">
      <link rel="canonical" href="https://distribuidora-sur.example/lista"></head>
      <body>Yerba</body></html>`;

    expect(textOf(html)).toBe("Yerba");
  });

  it("leaves out the address of a link, keeping its text", () => {
    expect(textOf('<p><a href="https://distribuidora-sur.example/x">Ver ficha</a></p>')).toBe(
      "Ver ficha",
    );
  });

  it("decodes entities", () => {
    expect(textOf("<p>Dulce &amp; salado &lt;oferta&gt; caf&eacute; &#241;</p>")).toBe(
      "Dulce & salado <oferta> café ñ",
    );
  });

  it.each(["p", "div", "li", "h2", "section", "article", "tr"])(
    "breaks the line around a %s",
    (tag) => {
      expect(textOf(`<body>antes<${tag}>dentro</${tag}>después</body>`)).toBe(
        "antes\ndentro\ndespués",
      );
    },
  );

  it("breaks the line at a br", () => {
    expect(textOf("<p>Yerba 1 kg<br>Caja x 10<br/>Azúcar</p>")).toBe(
      "Yerba 1 kg\nCaja x 10\nAzúcar",
    );
  });

  it("keeps inline elements on the line they are in", () => {
    expect(textOf("<p>Yerba <b>mate</b> <span>1 kg</span></p>")).toBe("Yerba mate 1 kg");
  });

  it("collapses whitespace and drops blank lines", () => {
    expect(textOf("<p>  Yerba \n\n   mate\t 1&nbsp;kg </p>\n\n\n<p>   </p><p>Azúcar</p>")).toBe(
      "Yerba mate 1 kg\nAzúcar",
    );
  });

  it("puts each table row on its own line, with its cells separated by a tab", () => {
    const html = `<table>
      <thead><tr><th>Código</th><th>Descripción</th><th>Precio</th></tr></thead>
      <tbody>
        <tr><td>Y-01</td><td>Yerba mate 1 kg</td><td>$ 1.234,50</td></tr>
        <tr><td>A-02</td><td>Azúcar <b>1 kg</b></td><td>$ 980,00</td></tr>
      </tbody></table>`;

    expect(textOf(html)).toBe(
      "Código\tDescripción\tPrecio\nY-01\tYerba mate 1 kg\t$ 1.234,50\nA-02\tAzúcar 1 kg\t$ 980,00",
    );
  });

  it("keeps an empty cell as an empty column", () => {
    expect(textOf("<table><tr><td>Y-01</td><td></td><td>$ 10</td></tr></table>")).toBe(
      "Y-01\t\t$ 10",
    );
  });

  it("keeps the text of a cell on one line even when the cell holds blocks", () => {
    expect(
      textOf("<table><tr><td><p>Yerba</p><p>mate</p></td><td>Caja<br>x 10</td></tr></table>"),
    ).toBe("Yerba mate\tCaja x 10");
  });

  it("reads rows whose cells are not closed", () => {
    expect(textOf("<table><tr><td>Y-01<td>Yerba<tr><td>A-02<td>Azúcar</table>")).toBe(
      "Y-01\tYerba\nA-02\tAzúcar",
    );
  });

  it("leaves out a row with no text", () => {
    expect(textOf("<table><tr><td></td><td> </td></tr><tr><td>Y-01</td></tr></table>")).toBe(
      "Y-01",
    );
  });

  it("answers nothing for a page without visible text", () => {
    expect(
      textOf("<html><head><title>x</title></head><body><script>1</script></body></html>"),
    ).toBe("");
    expect(textOf("")).toBe("");
  });

  it("reads the page in the encoding it declares", () => {
    const latin1 = Uint8Array.from(
      Buffer.from('<meta charset="iso-8859-1"><p>Azúcar 1 kg</p>', "latin1"),
    );

    expect(webPageText(latin1)).toBe("Azúcar 1 kg");
  });

  it("reads a page that starts with a UTF-8 byte order mark as UTF-8, whatever it declares", () => {
    const marked = Uint8Array.from([
      0xef,
      0xbb,
      0xbf,
      ...new TextEncoder().encode('<meta charset="iso-8859-1"><p>Azúcar 1 kg</p>'),
    ]);

    expect(webPageText(marked)).toBe("Azúcar 1 kg");
  });

  it("reads a page as UTF-8 when it declares nothing or an encoding that does not exist", () => {
    expect(textOf("<p>Azúcar</p>")).toBe("Azúcar");
    expect(textOf('<meta charset="no-such-encoding"><p>Azúcar</p>')).toBe("Azúcar");
  });
});
