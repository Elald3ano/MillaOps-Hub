import type { Servicio, ServicioNuevo } from '../types'

/**
 * Calcula los servicios de la línea base que deben marcarse como CERRADOS.
 *
 * Un servicio se considera cerrado si su `numero_orden` existía en la línea
 * base pero ya NO aparece en el nuevo archivo cargado.
 */
export function calcularDiferencialCerrados(
  serviciosLineaBase: Servicio[],
  serviciosNuevos: ServicioNuevo[],
): Servicio[] {
  // Set de órdenes del nuevo archivo para búsqueda O(1)
  const ordenesNuevas = new Set(serviciosNuevos.map((servicio) => servicio.numero_orden))

  return serviciosLineaBase
    .filter((servicio) => !ordenesNuevas.has(servicio.numero_orden))
    .map((servicio): Servicio => ({ ...servicio, estado: 'CERRADO' }))
}
