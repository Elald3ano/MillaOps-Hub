import { limpiarTexto } from './normalizer'

// Lista de sucursales autorizadas (jurisdicción operativa).
export const SUCURSALES_AUTORIZADAS = [
  'Zarzal',
  'Yumbo',
  'Villa Gorgona',
  'Tulua',
  'Toro Valle',
  'Todos los Santos',
  'Sonso',
  'Santander de Quilichao',
  'Puerto Tejada',
  'Presidente Valle',
  'Palmira',
  'Miranda',
  'Jamundi',
  'Guacari',
  'Florida',
  'Chancos',
  'Cerrito',
  'Carmelo',
  'Candelaria',
  'Caloto',
  'Cali',
  'La Union',
  'La Paila',
  'Bugalagrande',
  'Buga',
  'BuenaVentura',
  'Andalucia',
] as const

// Set normalizado para búsqueda O(1).
const SUCURSALES_SET = new Set(SUCURSALES_AUTORIZADAS.map((s) => limpiarTexto(s)))

// Alias específicos de nombres de sistemas (Sigma).
const ALIASES: Record<string, string> = {
  [limpiarTexto('Toro')]: limpiarTexto('Toro Valle'),
  [limpiarTexto('Presidente')]: limpiarTexto('Presidente Valle'),
  [limpiarTexto('Los Mangos - Cali')]: limpiarTexto('Cali'),
  [limpiarTexto('Los Mangos')]: limpiarTexto('Cali'),
  // Variantes con tilde/acentos que pueden llegar del sistema origen.
  [limpiarTexto('La Unión')]: limpiarTexto('La Union'),
  [limpiarTexto('Unión')]: limpiarTexto('La Union'),
  [limpiarTexto('Unión Valle')]: limpiarTexto('La Union'),
  [limpiarTexto('La Paila Valle')]: limpiarTexto('La Paila'),
}

/**
 * ¿La ciudad pertenece a la jurisdicción operativa?
 * Devuelve `false` para ciudades fuera de la lista blanca.
 */
export function esSucursalAutorizada(ciudad: string | null | undefined): boolean {
  if (!ciudad) return false
  const limpio = limpiarTexto(ciudad)
  return SUCURSALES_SET.has(limpio) || SUCURSALES_SET.has(ALIASES[limpio] || '')
}

// Mapa normalizado → nombre canónico (incluye alias), para unificar variantes
// por mayúsculas/minúsculas, tildes o alias de sistema.
const CANONICAS_POR_LIMPIO = new Map<string, string>()
for (const s of SUCURSALES_AUTORIZADAS) {
  CANONICAS_POR_LIMPIO.set(limpiarTexto(s), s)
}
for (const [aliasKey, aliasTarget] of Object.entries(ALIASES)) {
  const canonica = CANONICAS_POR_LIMPIO.get(aliasTarget)
  if (canonica && !CANONICAS_POR_LIMPIO.has(aliasKey)) {
    CANONICAS_POR_LIMPIO.set(aliasKey, canonica)
  }
}

/**
 * Devuelve el nombre canónico de una ciudad (la forma exacta de la lista
 * blanca), resolviendo alias y unificando variantes por mayúsculas/tildes.
 * Devuelve `''` si la ciudad no pertenece a la jurisdicción operativa.
 */
export function ciudadCanonica(ciudad: string | null | undefined): string {
  if (!ciudad) return ''
  return CANONICAS_POR_LIMPIO.get(limpiarTexto(ciudad)) ?? ''
}
