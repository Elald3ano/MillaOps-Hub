import { limpiarBarrio } from './normalizer'

/**
 * Catálogo semilla de barrios por ciudad (cold start).
 *
 * Permite que la Gestión Territorial muestre chips seleccionables antes de
 * que exista el primer despacho de esa ciudad. Los barrios vivos (reglas y
 * servicios) se suman aparte; aquí solo van los que no dependen de datos.
 *
 * Clave: nombre canónico de la ciudad (igual que `SUCURSALES_AUTORIZADAS`).
 * Valor: nombres legibles SIN el prefijo de nodo comercial (R1-, R2-, etc.),
 * porque `limpiarBarrio` los elimina de todos modos al construir la clave.
 */
export const BARRIOS_SEMILLA: Record<string, string[]> = {
  Roldanillo: [
    // Ruta 1
    'ALCAZAR',
    'EL PRADO',
    'EL REY',
    'EUSTAQUIO PALACIOS',
    'IRRUPA',
    'JOSE M. BARBOSA',
    'LA ASUNCION',
    'LOS PINOS',
    'SAN NICOLAS',
    'SAN SEBASTIAN',
    'TIERRA BLANCA',
    'TORRIJOS',
    'UNION DE VIVIENDA',
    // Ruta 2
    'ARRAYANES',
    'CACERES',
    'DONA EMMA',
    'GUERRERO',
    'IPIRA',
    'J. J. JARAMILLO',
    'LA CEIBA',
    'LA ERMITA',
    'LLANITOS',
    'NUEVA ERMITA',
    'OBRERO',
    'SAN JOSE OBRERO',
    'SIMON BOLIVAR',
    'VILLA EMMA',
  ],
}

/**
 * Barrios semilla de una ciudad, ya normalizados con `limpiarBarrio`
 * (Invariante #1). Devuelve `[]` si la ciudad no tiene semilla.
 */
export function barriosSemilla(ciudad: string): { clave: string; nombre: string }[] {
  const lista = BARRIOS_SEMILLA[ciudad]
  if (!lista) return []
  return lista.map((nombre) => ({ clave: limpiarBarrio(nombre), nombre }))
}
