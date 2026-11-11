import type {
  EstadoGestionNovedad,
  EtiquetaNovedad,
  NovedadInstalacion,
  TipoNovedadInstalacion,
} from '../../types'

/**
 * Catálogo único de tipos de novedad: icono, etiqueta corta y descripción.
 * Lo consumen el filtro táctico (conteos), la tabla (badges) y el modal de
 * gestión, de modo que un tipo nuevo solo se declara aquí.
 */
export const TIPOS_NOVEDAD_UI: readonly EtiquetaNovedad[] = [
  {
    tipo: 'pendiente_puerto',
    icono: '🔌',
    etiqueta: 'Liberar Puerto',
    descripcion: 'El puerto de la caja NAP está ocupado; se debe liberar.',
  },
  {
    tipo: 'ampliacion_nap',
    icono: '📦',
    etiqueta: 'Ampliación NAP',
    descripcion: 'La caja NAP no tiene capacidad; requiere ampliación de red.',
  },
  {
    tipo: 'sin_cobertura',
    icono: '📍',
    etiqueta: 'Sin Cobertura',
    descripcion: 'El sector no tiene red disponible o está saturada.',
  },
  {
    tipo: 'cliente_no_contacta',
    icono: '📞',
    etiqueta: 'Cliente No Contacta',
    descripcion: 'No se pudo contactar al cliente o la visita debe reagendarse.',
  },
  {
    tipo: 'otra',
    icono: '⚠️',
    etiqueta: 'Otra Novedad',
    descripcion: 'Bloqueo distinto a los anteriores; ver el comentario.',
  },
]

const ETIQUETA_POR_TIPO = new Map<TipoNovedadInstalacion, EtiquetaNovedad>(
  TIPOS_NOVEDAD_UI.map((e) => [e.tipo, e]),
)

/** Devuelve la etiqueta de un tipo (nunca `undefined`: cae a "Otra Novedad"). */
export function etiquetaDeTipo(tipo: TipoNovedadInstalacion): EtiquetaNovedad {
  return ETIQUETA_POR_TIPO.get(tipo) ?? ETIQUETA_POR_TIPO.get('otra')!
}

/** Estados de gestión con su presentación para el selector y los badges. */
export const ESTADOS_NOVEDAD_UI: readonly {
  estado: EstadoGestionNovedad
  icono: string
  etiqueta: string
  texto: string
}[] = [
  {
    estado: 'pendiente',
    icono: '🔴',
    etiqueta: 'Pendiente',
    texto: 'text-red-700 bg-red-50 ring-red-200',
  },
  {
    estado: 'en_gestion',
    icono: '🟡',
    etiqueta: 'En Gestión',
    texto: 'text-amber-700 bg-amber-50 ring-amber-200',
  },
  {
    estado: 'resuelto',
    icono: '🟢',
    etiqueta: 'Resuelto',
    texto: 'text-emerald-700 bg-emerald-50 ring-emerald-200',
  },
]

/** Presentación del estado; tolerante a valores fuera de dominio. */
export function presentacionDeEstado(estado: EstadoGestionNovedad) {
  return ESTADOS_NOVEDAD_UI.find((e) => e.estado === estado) ?? ESTADOS_NOVEDAD_UI[0]!
}

/** Texto del badge de una novedad, p. ej. `🔌 Liberar Puerto (NAP-04)`. */
export function textoBadgeNovedad(novedad: NovedadInstalacion): string {
  const etiqueta = etiquetaDeTipo(novedad.tipo_novedad)
  const caja = novedad.caja_nap?.trim()
  return `${etiqueta.icono} ${etiqueta.etiqueta}${caja ? ` (${caja})` : ''}`
}

/**
 * Mensaje de WhatsApp dirigido al operador de zona dueño del barrio.
 *
 * Si el operador no tiene teléfono registrado se devuelve el texto sin el
 * saludo de destinatario, para que Daniel pueda copiarlo y reenviarlo.
 */
export function componerMensajeWhatsApp(params: {
  operador?: string
  orden: string
  barrio: string
  direccion?: string
  tipo: TipoNovedadInstalacion
  cajaNap?: string
  comentario?: string
}): string {
  const { operador, orden, barrio, direccion, tipo, cajaNap, comentario } = params
  const etiqueta = etiquetaDeTipo(tipo).etiqueta
  const lugar = direccion?.trim() ? `${barrio} (${direccion.trim()})` : barrio
  const caja = cajaNap?.trim() ? ` en caja ${cajaNap.trim()}` : ''
  const nota = comentario?.trim() ? ` Nota: ${comentario.trim()}.` : ''
  const saludo = operador?.trim() ? `Hola ${operador.trim()}` : 'Hola'

  return `${saludo}, para la instalación #${orden} en ${lugar}, requerimos ${etiqueta}${caja}.${nota} Favor auditar y confirmar.`
}

/** Construye el enlace `wa.me` normalizando el teléfono colombiano. */
export function enlaceWhatsApp(telefono: string | undefined, mensaje: string): string | null {
  const digitos = (telefono ?? '').replace(/\D/g, '')
  if (digitos.length < 7) return null
  // Colombia: si viene sin indicativo (10 dígitos) se antepone 57.
  const conIndicativo = digitos.length === 10 ? `57${digitos}` : digitos
  return `https://wa.me/${conIndicativo}?text=${encodeURIComponent(mensaje)}`
}
