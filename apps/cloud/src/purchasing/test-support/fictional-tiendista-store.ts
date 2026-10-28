export const FICTIONAL_TIENDISTA_STORE = "almacen-del-sur";

export const FICTIONAL_TIENDISTA_STORE_ADDRESS = `https://tiendista.com/${FICTIONAL_TIENDISTA_STORE}`;

export const FICTIONAL_TIENDISTA_PRODUCT_DATA_URL = `https://datostienda-pc3gz7vuxa-uc.a.run.app/${FICTIONAL_TIENDISTA_STORE}/producto`;

const fictionalTiendistaProducts = [
  {
    id: 101,
    nombre: "Yerba mate suave",
    marca: "Don Ernesto",
    unidad: "Unidad",
    precio: 3200,
    agotado: false,
    categoria: "Almacen",
    imagen: "https://images.example/yerba.png",
  },
  {
    id: 102,
    nombre: "Yerba mate suave",
    marca: "Don Ernesto",
    unidad: "Pack x 6",
    precio: 18000,
    agotado: false,
    categoria: "Almacen",
  },
  {
    id: 103,
    nombre: "Yerba mate suave",
    marca: "Don Ernesto",
    unidad: "Pack x 12",
    precio: 34500,
    agotado: false,
    categoria: "Almacen",
  },
  {
    id: 104,
    nombre: "Fideos tirabuzon",
    marca: "La Pampita",
    unidad: "Unidad",
    precio: 1250.5,
    agotado: true,
  },
  {
    id: 105,
    nombre: "Aceite de girasol",
    marca: "Campo Verde",
    unidad: "Botella 900 ml",
    precio: "2890.5",
    agotado: false,
  },
  {
    id: 106,
    nombre: "Sal fina",
    unidad: "Paquete 500 g",
    precio: 700,
    agotado: false,
  },
];

export function fictionalTiendistaProductDataBytes(
  products: readonly unknown[] = fictionalTiendistaProducts,
): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(products));
}
