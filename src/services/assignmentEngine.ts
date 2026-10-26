import type { ReglaAsignacion, ServicioNuevo } from '../types'

/**
 * Aplica la matriz de asignación a cada servicio mediante un algoritmo de
 * cascada por especificidad (prioridad 1 → 2 → 3).
 *
 * Las reglas se indexan en `Map`s para lograr búsquedas O(1) por servicio.
 */
export function aplicarMatrizAsignacion(
  servicios: ServicioNuevo[],
  reglas: ReglaAsignacion[],
): ServicioNuevo[] {
  const mapPrio1 = new Map<string, string>()
  const mapPrio2 = new Map<string, string>()
  const mapPrio3 = new Map<string, string>()

  for (const regla of reglas) {
    const tecnicoId = regla.tecnico_id
    const ciudad = regla.ciudad.toLowerCase()

    if (regla.prioridad === 1) {
      if (!regla.barrio || !regla.tipo_servicio) continue
      const clave = `${ciudad}|${regla.barrio.toLowerCase()}|${regla.tipo_servicio.toLowerCase()}`
      if (!mapPrio1.has(clave)) mapPrio1.set(clave, tecnicoId)
    } else if (regla.prioridad === 2) {
      if (!regla.barrio) continue
      const clave = `${ciudad}|${regla.barrio.toLowerCase()}`
      if (!mapPrio2.has(clave)) mapPrio2.set(clave, tecnicoId)
    } else if (regla.prioridad === 3) {
      if (!mapPrio3.has(ciudad)) mapPrio3.set(ciudad, tecnicoId)
    }
  }

  return servicios.map((servicio) => {
    const ciudad = servicio.ciudad.toLowerCase()
    const barrio = servicio.barrio.toLowerCase()
    const tipoServicio = servicio.tipo_servicio.toLowerCase()

    const tecnicoId =
      mapPrio1.get(`${ciudad}|${barrio}|${tipoServicio}`) ??
      mapPrio2.get(`${ciudad}|${barrio}`) ??
      mapPrio3.get(ciudad) ??
      null

    return { ...servicio, tecnico_id: tecnicoId }
  })
}

/**
 * Determina la prioridad de una regla según los criterios completados:
 * 1 = Ciudad+Barrio+Servicio · 2 = Ciudad+Barrio · 3 = Solo Ciudad.
 */
export function calcularPrioridad(
  ciudad: string,
  barrio?: string,
  tipoServicio?: string,
): number {
  if (ciudad && barrio && tipoServicio) return 1
  if (ciudad && barrio) return 2
  return 3
}
