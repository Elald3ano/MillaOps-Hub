import { format } from 'date-fns'

/**
 * Extrae la fecha/hora embebida en el nombre de archivo de Sigma.
 * Patrón esperado: `servicios_Legon_YYYYMMDD_HHmmss.xlsx`.
 */
export function extraerFechaDeNombreSigma(nombreArchivo: string): Date | null {
  const match = nombreArchivo.match(/_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/)
  if (!match) return null

  const [, year, month, day, hour, min, sec] = match
  return new Date(
    parseInt(year, 10),
    parseInt(month, 10) - 1, // En JS los meses van de 0 a 11
    parseInt(day, 10),
    parseInt(hour, 10),
    parseInt(min, 10),
    parseInt(sec, 10),
  )
}

/** Formatea una fecha como "29 Oct 08:08 AM" (para el badge de rango temporal). */
export function formatearFechaHora(fecha: Date): string {
  return format(fecha, 'dd MMM hh:mm a')
}
