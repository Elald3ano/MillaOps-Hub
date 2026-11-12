import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Building2,
  Check,
  ChevronDown,
  ClipboardList,
  Copy,
  FileDown,
  Loader2,
  MessageCircle,
  PackageSearch,
  PencilLine,
  RefreshCw,
  Search,
  Tag,
  X,
} from 'lucide-react'
import type {
  EntradaNovedadInstalacion,
  NovedadInstalacion,
  ReglaConTecnico,
  ServicioNuevo,
  Tecnico,
  TipoNovedadInstalacion,
} from '../../types'
import type { ToastVariant } from '../ToastContainer'
import { limpiarBarrio, limpiarTexto } from '../../lib/normalizer'
import { clasificarSla, SLA_BADGE_CLASSES } from '../../lib/sla'
import { cn } from '../../lib/utils'
import { ModalNovedad } from './ModalNovedad'
import {
  componerMensajeWhatsApp,
  enlaceWhatsApp,
  etiquetaDeTipo,
  presentacionDeEstado,
  TIPOS_NOVEDAD_UI,
  textoBadgeNovedad,
} from './catalogoNovedades'
import type { FilaInstalacionPdf } from './pdfInstalaciones'

/** Filtro táctico del panel de balance. */
type FiltroNovedad = 'todas' | 'con_novedad' | 'en_gestion' | 'listas'

/** Columnas ordenables de la tabla (clic en el encabezado alterna dirección). */
type ColumnaOrden = 'dias' | 'orden' | 'servicio' | 'barrio' | 'operador' | 'novedad'

/** Dirección de ordenamiento activa; `null` = orden natural del reporte. */
interface Ordenamiento {
  columna: ColumnaOrden
  direccion: 'asc' | 'desc'
}

/** Rangos operativos de antigüedad del filtro de días. */
type RangoDias = 'todas' | 'recientes' | 'medio' | 'demoradas' | 'criticas'

const RANGOS_DIAS: readonly { id: RangoDias; etiqueta: string; min: number; max: number }[] = [
  { id: 'todas', etiqueta: 'Todas las edades', min: 0, max: Number.POSITIVE_INFINITY },
  { id: 'recientes', etiqueta: '0 a 7 días (Recientes)', min: 0, max: 7 },
  { id: 'medio', etiqueta: '8 a 15 días', min: 8, max: 15 },
  { id: 'demoradas', etiqueta: '16 a 30 días (Demoradas)', min: 16, max: 30 },
  { id: 'criticas', etiqueta: '> 30 días (Críticas)', min: 31, max: Number.POSITIVE_INFINITY },
]

/** Peso del estado de bloqueo para ordenar la columna "Novedad" (rojo primero). */
function pesoEstadoNovedad(novedad: NovedadInstalacion | undefined): number {
  if (!novedad) return 3 // sin novedad va al final del asc
  if (novedad.estado_gestion === 'pendiente') return 0
  if (novedad.estado_gestion === 'en_gestion') return 1
  return 2 // resuelto
}

interface ControlInstalacionesProps {
  /** Órdenes de instalación del último reporte Sigma (solo memoria). */
  servicios: ServicioNuevo[]
  /** Novedades persistidas, indexadas por número de orden. */
  novedades: Map<string, NovedadInstalacion>
  reglas: ReglaConTecnico[]
  tecnicos: Tecnico[]
  /** Persiste la novedad en Supabase y refresca el mapa en App. */
  onGuardarNovedad: (entrada: EntradaNovedadInstalacion) => Promise<void>
  /** Elimina la novedad en Supabase y refresca el mapa en App. */
  onEliminarNovedad: (ordenId: string) => Promise<void>
  /** Sube un reporte Sigma (mismo intake del Centro de Mando). */
  onProcesarReporte: (file: File, ciudadFiltro?: string) => Promise<boolean>
  procesando: boolean
  notificar: (mensaje: string, variant?: ToastVariant) => void
}

/** Clave (ciudad canónica, barrio canónico) → operador / patrulla dueño del barrio. */
interface DuenoBarrio {
  operador?: Tecnico
  patrulla?: Tecnico
}

/** Fila del tablero: la orden de instalación + su novedad y su dueño territorial. */
interface FilaInstalacion {
  servicio: ServicioNuevo
  novedad?: NovedadInstalacion
  dueno: DuenoBarrio
  /** Texto normalizado para el buscador rápido. */
  indiceBusqueda: string
}

const FILTROS: readonly { id: FiltroNovedad; icono: string; etiqueta: string }[] = [
  { id: 'todas', icono: '📋', etiqueta: 'Todas' },
  { id: 'con_novedad', icono: '🔴', etiqueta: 'Con Novedad' },
  { id: 'en_gestion', icono: '🟡', etiqueta: 'En Gestión' },
  { id: 'listas', icono: '🟢', etiqueta: 'Sin Novedad / Listas' },
]

/** Nombre corto del técnico para el mensaje de WhatsApp (nombre y primer apellido). */
function nombreCorto(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean)
  return partes.slice(0, 2).join(' ')
}

/**
 * Tablero de Control de Instalaciones y Puertos.
 *
 * Espejo del Centro de Mando para las órdenes de la categoría
 * "Instalaciones y Traslados": las órdenes viven en memoria (nunca se
 * persisten en `servicios`) y solo la novedad se guarda en Supabase.
 */
export function ControlInstalaciones({
  servicios,
  novedades,
  reglas,
  tecnicos,
  onGuardarNovedad,
  onEliminarNovedad,
  onProcesarReporte,
  procesando,
  notificar,
}: ControlInstalacionesProps) {
  const [filtro, setFiltro] = useState<FiltroNovedad>('todas')
  const [tipoDestacado, setTipoDestacado] = useState<TipoNovedadInstalacion | null>(null)
  const [ciudadFiltro, setCiudadFiltro] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [ordenEnEdicion, setOrdenEnEdicion] = useState<string | null>(null)

  // Filtros tácticos de la cabecera 8/12. Son mutuamente excluyentes con el
  // filtro de novedades: activar uno limpia el otro (decisión del Arquitecto).
  const [barriosSeleccionados, setBarriosSeleccionados] = useState<Set<string>>(new Set())
  const [rangoDias, setRangoDias] = useState<RangoDias>('todas')
  const [barriosAbierto, setBarriosAbierto] = useState(false)
  const [busquedaBarrio, setBusquedaBarrio] = useState('')
  const [orden, setOrden] = useState<Ordenamiento | null>(null)
  const [generandoPdf, setGenerandoPdf] = useState(false)
  const panelBarriosRef = useRef<HTMLDivElement>(null)

  // Filtro de TIPO de novedad (multi-selección). Es ortogonal al resto: se
  // combina con barrio/días, con el estado del panel izquierdo y con el
  // buscador, porque "qué tipo de bloqueo" no es "qué estado de gestión".
  const [tiposNovedadSeleccionados, setTiposNovedadSeleccionados] = useState<
    Set<TipoNovedadInstalacion>
  >(new Set())
  const [tiposAbierto, setTiposAbierto] = useState(false)
  const panelTiposRef = useRef<HTMLDivElement>(null)

  // Filtro de TIPO DE SERVICIO (multi-selección). Usa la clave normalizada
  // (`limpiarTexto`) para no duplicar el mismo servicio por tildes o espacios.
  const [serviciosSeleccionados, setServiciosSeleccionados] = useState<Set<string>>(new Set())
  const [serviciosAbierto, setServiciosAbierto] = useState(false)
  const [busquedaServicio, setBusquedaServicio] = useState('')
  const panelServiciosRef = useRef<HTMLDivElement>(null)

  const tecnicoPorId = useMemo(() => new Map(tecnicos.map((t) => [t.id, t])), [tecnicos])

  /**
   * Dueño territorial por barrio: reglas P2 (prioridad 2, sin tipo de
   * servicio) = operador titular; si no hay, la P1 del barrio; la patrulla se
   * resuelve vía `patrulla_id` del operador.
   */
  const duenosPorBarrio = useMemo(() => {
    const operadorPorClave = new Map<string, string>()
    const patrullaPorClave = new Map<string, string>()

    const registrar = (clave: string, regla: ReglaConTecnico) => {
      if (!patrullaPorClave.has(clave) && regla.tecnico.patrulla_id) {
        patrullaPorClave.set(clave, regla.tecnico.patrulla_id)
      }
    }

    // P2 primero: el carro es el dueño general del barrio.
    for (const regla of reglas) {
      if (regla.prioridad !== 2 || !regla.barrio) continue
      const clave = `${limpiarTexto(regla.ciudad)}|${limpiarBarrio(regla.barrio)}`
      if (!operadorPorClave.has(clave)) operadorPorClave.set(clave, regla.tecnico_id)
      registrar(clave, regla)
    }
    // P1 después: solo rellena barrios sin regla general.
    for (const regla of reglas) {
      if (regla.prioridad !== 1 || !regla.barrio) continue
      const clave = `${limpiarTexto(regla.ciudad)}|${limpiarBarrio(regla.barrio)}`
      if (!operadorPorClave.has(clave)) operadorPorClave.set(clave, regla.tecnico_id)
      registrar(clave, regla)
    }

    const mapa = new Map<string, DuenoBarrio>()
    for (const [clave, tecnicoId] of operadorPorClave) {
      const operador = tecnicoPorId.get(tecnicoId)
      const patrullaId = operador?.patrulla_id ?? patrullaPorClave.get(clave)
      mapa.set(clave, {
        operador,
        patrulla: patrullaId ? tecnicoPorId.get(patrullaId) : undefined,
      })
    }
    return mapa
  }, [reglas, tecnicoPorId])

  const filas = useMemo<FilaInstalacion[]>(() => {
    return servicios.map((servicio) => {
      // Las órdenes pueden repetirse si el reporte trae la misma orden en dos
      // filas: solo cuenta la primera para no duplicar el tablero.
      const clave = `${limpiarTexto(servicio.ciudad)}|${limpiarBarrio(servicio.barrio)}`
      const novedad = novedades.get(servicio.numero_orden)
      const dueno = duenosPorBarrio.get(clave) ?? {}
      const indiceBusqueda = limpiarTexto(
        [
          servicio.numero_orden,
          servicio.ciudad,
          servicio.barrio,
          servicio.direccion ?? '',
          servicio.nombre_cliente ?? '',
          novedad?.caja_nap ?? '',
          novedad?.comentario ?? '',
          dueno.operador?.nombre ?? '',
        ].join(' '),
      )
      return { servicio, novedad, dueno, indiceBusqueda }
    })
  }, [servicios, novedades, duenosPorBarrio])

  /** Conteo por ciudad (todos los filtros de novedad ignorados: es el universo). */
  const conteoPorCiudad = useMemo(() => {
    const mapa = new Map<string, number>()
    for (const fila of filas) {
      mapa.set(fila.servicio.ciudad, (mapa.get(fila.servicio.ciudad) ?? 0) + 1)
    }
    return [...mapa.entries()].sort((a, b) => b[1] - a[1])
  }, [filas])

  /** Conteo por estado de gestión y por tipo de novedad (universo completo). */
  const conteoNovedades = useMemo(() => {
    let conNovedad = 0
    let enGestion = 0
    const porTipo = new Map<TipoNovedadInstalacion, number>()
    for (const fila of filas) {
      if (!fila.novedad) continue
      conNovedad++
      if (fila.novedad.estado_gestion === 'en_gestion') enGestion++
      porTipo.set(fila.novedad.tipo_novedad, (porTipo.get(fila.novedad.tipo_novedad) ?? 0) + 1)
    }
    return {
      total: filas.length,
      conNovedad,
      enGestion,
      listas: filas.length - conNovedad,
      porTipo,
    }
  }, [filas])

  /** Tipos de servicio únicos del corte (dentro de la ciudad activa). */
  const serviciosDisponibles = useMemo(() => {
    const porClave = new Map<string, { clave: string; etiqueta: string; cantidad: number }>()
    for (const fila of filas) {
      if (ciudadFiltro && fila.servicio.ciudad !== ciudadFiltro) continue
      const etiqueta = fila.servicio.tipo_servicio?.trim()
      if (!etiqueta) continue
      const clave = limpiarTexto(etiqueta)
      if (!clave) continue
      const prev = porClave.get(clave)
      if (prev) prev.cantidad += 1
      else porClave.set(clave, { clave, etiqueta, cantidad: 1 })
    }
    return [...porClave.values()].sort(
      (a, b) => b.cantidad - a.cantidad || a.etiqueta.localeCompare(b.etiqueta),
    )
  }, [filas, ciudadFiltro])

  /** Lista del desplegable acotada por su buscador interno. */
  const serviciosVisibles = useMemo(() => {
    const q = limpiarTexto(busquedaServicio)
    if (!q) return serviciosDisponibles
    return serviciosDisponibles.filter((s) => s.clave.includes(q))
  }, [serviciosDisponibles, busquedaServicio])

  /** Conteo de tipos de novedad acotado a la ciudad activa (contador del desplegable). */  const conteoTiposCiudad = useMemo(() => {
    const porTipo = new Map<TipoNovedadInstalacion, number>()
    for (const fila of filas) {
      if (ciudadFiltro && fila.servicio.ciudad !== ciudadFiltro) continue
      if (!fila.novedad) continue
      const tipo = fila.novedad.tipo_novedad
      porTipo.set(tipo, (porTipo.get(tipo) ?? 0) + 1)
    }
    return porTipo
  }, [filas, ciudadFiltro])

  /** Barrios disponibles de la ciudad activa (universo, no el ya filtrado). */
  const barriosDisponibles = useMemo(() => {
    const porClave = new Map<string, string>()
    for (const fila of filas) {
      if (ciudadFiltro && fila.servicio.ciudad !== ciudadFiltro) continue
      const clave = limpiarBarrio(fila.servicio.barrio)
      if (!clave) continue
      if (!porClave.has(clave)) porClave.set(clave, fila.servicio.barrio || 'Sin barrio')
    }
    return [...porClave.entries()]
      .map(([clave, etiqueta]) => ({ clave, etiqueta }))
      .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta))
  }, [filas, ciudadFiltro])

  /** Lista del desplegable ya acotada por el buscador interno. */
  const barriosVisibles = useMemo(() => {
    const q = limpiarTexto(busquedaBarrio)
    if (!q) return barriosDisponibles
    return barriosDisponibles.filter((b) => limpiarTexto(b.etiqueta).includes(q))
  }, [barriosDisponibles, busquedaBarrio])

  const hayFiltroBarrioODias = barriosSeleccionados.size > 0 || rangoDias !== 'todas'

  const filasFiltradas = useMemo(() => {
    const texto = limpiarTexto(busqueda)
    const rango = RANGOS_DIAS.find((r) => r.id === rangoDias) ?? RANGOS_DIAS[0]!

    const base = filas.filter((fila) => {
      if (ciudadFiltro && fila.servicio.ciudad !== ciudadFiltro) return false

      // Grupo B (barrio + días): si está activo, toma el control y el filtro de
      // novedades del panel izquierdo queda inerte (grupos excluyentes).
      if (hayFiltroBarrioODias) {
        const dias = fila.servicio.dias_antiguedad
        if (dias < rango.min || dias > rango.max) return false
        if (
          barriosSeleccionados.size > 0 &&
          !barriosSeleccionados.has(limpiarBarrio(fila.servicio.barrio))
        ) {
          return false
        }
      } else {
        // Grupo A: filtro de novedades.
        switch (filtro) {
          case 'con_novedad':
            if (!fila.novedad) return false
            break
          case 'en_gestion':
            if (fila.novedad?.estado_gestion !== 'en_gestion') return false
            break
          case 'listas':
            if (fila.novedad) return false
            break
          default:
            break
        }
        if (tipoDestacado && fila.novedad?.tipo_novedad !== tipoDestacado) return false
      }

      if (texto && !fila.indiceBusqueda.includes(texto)) return false

      // Filtro de TIPO de novedad: se aplica al final y por encima de todo lo
      // demás (es ortogonal a barrio/días y al estado de gestión).
      if (tiposNovedadSeleccionados.size > 0) {
        if (!fila.novedad || !tiposNovedadSeleccionados.has(fila.novedad.tipo_novedad)) {
          return false
        }
      }
      // Filtro de TIPO DE SERVICIO (también ortogonal: se combina con todo).
      if (
        serviciosSeleccionados.size > 0 &&
        !serviciosSeleccionados.has(limpiarTexto(fila.servicio.tipo_servicio))
      ) {
        return false
      }
      return true
    })

    if (!orden) return base

    const signo = orden.direccion === 'asc' ? 1 : -1
    return [...base].sort((a, b) => {
      switch (orden.columna) {
        case 'dias':
          return (a.servicio.dias_antiguedad - b.servicio.dias_antiguedad) * signo
        case 'orden': {
          // Comparación numérica cuando ambas son números; si no, alfabética.
          const na = Number(a.servicio.numero_orden)
          const nb = Number(b.servicio.numero_orden)
          if (Number.isFinite(na) && Number.isFinite(nb)) return (na - nb) * signo
          return a.servicio.numero_orden.localeCompare(b.servicio.numero_orden) * signo
        }
        case 'servicio':
          return a.servicio.tipo_servicio.localeCompare(b.servicio.tipo_servicio) * signo
        case 'barrio':
          return a.servicio.barrio.localeCompare(b.servicio.barrio) * signo
        case 'operador':
          // Los barrios sin dueño van siempre al final, en cualquier dirección.
          if (!a.dueno.operador && !b.dueno.operador) return 0
          if (!a.dueno.operador) return 1
          if (!b.dueno.operador) return -1
          return a.dueno.operador.nombre.localeCompare(b.dueno.operador.nombre) * signo
        case 'novedad': {
          const pa = pesoEstadoNovedad(a.novedad)
          const pb = pesoEstadoNovedad(b.novedad)
          if (pa !== pb) return (pa - pb) * signo
          // Empate: la más reciente primero dentro del mismo estado.
          return (a.novedad?.tipo_novedad ?? '').localeCompare(b.novedad?.tipo_novedad ?? '') * signo
        }
        default:
          return 0
      }
    })
  }, [
    filas,
    ciudadFiltro,
    filtro,
    tipoDestacado,
    busqueda,
    hayFiltroBarrioODias,
    rangoDias,
    barriosSeleccionados,
    tiposNovedadSeleccionados,
    serviciosSeleccionados,
    orden,
  ])

  const servicioEnEdicion = useMemo(
    () => filas.find((f) => f.servicio.numero_orden === ordenEnEdicion) ?? null,
    [filas, ordenEnEdicion],
  )

  const cerrarModal = useCallback(() => setOrdenEnEdicion(null), [])

  const handleGuardar = useCallback(
    async (entrada: EntradaNovedadInstalacion) => {
      try {
        await onGuardarNovedad(entrada)
        notificar(`Novedad guardada para la orden #${entrada.orden_id}.`, 'success')
        setOrdenEnEdicion(null)
      } catch (error) {
        notificar(
          error instanceof Error ? error.message : 'No se pudo guardar la novedad.',
          'error',
        )
      }
    },
    [onGuardarNovedad, notificar],
  )

  const handleEliminar = useCallback(
    async (ordenId: string) => {
      try {
        await onEliminarNovedad(ordenId)
        notificar(`Novedad eliminada de la orden #${ordenId}.`, 'success')
        setOrdenEnEdicion(null)
      } catch (error) {
        notificar(
          error instanceof Error ? error.message : 'No se pudo eliminar la novedad.',
          'error',
        )
      }
    },
    [onEliminarNovedad, notificar],
  )

  /**
   * WhatsApp al operador de zona. Si el teléfono está registrado se abre el
   * enlace de WhatsApp; si no, se copia el mensaje para reenviarlo.
   */
  const handleWhatsApp = useCallback(
    async (fila: FilaInstalacion) => {
      const { servicio, novedad, dueno } = fila
      const mensaje = componerMensajeWhatsApp({
        operador: dueno.operador?.nombre ? nombreCorto(dueno.operador.nombre) : undefined,
        orden: servicio.numero_orden,
        barrio: servicio.barrio,
        direccion: servicio.direccion,
        tipo: novedad?.tipo_novedad ?? 'otra',
        cajaNap: novedad?.caja_nap,
        comentario: novedad?.comentario,
      })

      const enlace = enlaceWhatsApp(dueno.operador?.telefono, mensaje)
      if (enlace) {
        window.open(enlace, '_blank', 'noopener,noreferrer')
        return
      }

      try {
        await navigator.clipboard.writeText(mensaje)
        notificar(
          dueno.operador
            ? `${nombreCorto(dueno.operador.nombre)} no tiene teléfono registrado: mensaje copiado.`
            : 'Barrio sin operador asignado: mensaje copiado.',
          'info',
        )
      } catch {
        notificar('No se pudo copiar el mensaje al portapapeles.', 'error')
      }
    },
    [notificar],
  )

  const toggleTipo = (tipo: TipoNovedadInstalacion) => {
    // Grupo A: al activar un filtro de novedad se limpia el grupo B.
    setFiltro('con_novedad')
    setTipoDestacado((prev) => (prev === tipo ? null : tipo))
    setBarriosSeleccionados(new Set())
    setRangoDias('todas')
  }

  /** Clic en encabezado: misma columna alterna dirección; otra columna reinicia asc. */
  const alternarOrden = (columna: ColumnaOrden) => {
    setOrden((prev) =>
      prev?.columna === columna
        ? { columna, direccion: prev.direccion === 'asc' ? 'desc' : 'asc' }
        : { columna, direccion: 'asc' },
    )
  }

  const toggleBarrio = (clave: string) => {
    // Grupo B: activar barrios limpia el filtro de novedades.
    setFiltro('todas')
    setTipoDestacado(null)
    setBarriosSeleccionados((prev) => {
      const siguiente = new Set(prev)
      if (siguiente.has(clave)) siguiente.delete(clave)
      else siguiente.add(clave)
      return siguiente
    })
  }

  const cambiarRangoDias = (rango: RangoDias) => {
    setFiltro('todas')
    setTipoDestacado(null)
    setRangoDias(rango)
  }

  const limpiarFiltrosCabecera = () => {
    setBarriosSeleccionados(new Set())
    setRangoDias('todas')
    setTiposNovedadSeleccionados(new Set())
    setServiciosSeleccionados(new Set())
  }

  const toggleTipoNovedad = (tipo: TipoNovedadInstalacion) => {
    setTiposNovedadSeleccionados((prev) => {
      const siguiente = new Set(prev)
      if (siguiente.has(tipo)) siguiente.delete(tipo)
      else siguiente.add(tipo)
      return siguiente
    })
  }

  const toggleServicio = (clave: string) => {
    setServiciosSeleccionados((prev) => {
      const siguiente = new Set(prev)
      if (siguiente.has(clave)) siguiente.delete(clave)
      else siguiente.add(clave)
      return siguiente
    })
  }

  // "Marcar todos" opera sobre lo visible (respeta el buscador interno), para
  // que un corte con muchos servicios se pueda acotar antes de marcarlos.
  const marcarTodosServicios = () => {
    setServiciosSeleccionados((prev) => {
      const siguiente = new Set(prev)
      for (const s of serviciosVisibles) siguiente.add(s.clave)
      return siguiente
    })
  }

  // Cierra los desplegables al hacer clic fuera (o con Escape).
  useEffect(() => {
    if (!barriosAbierto && !tiposAbierto && !serviciosAbierto) return
    const alClicFuera = (e: MouseEvent) => {
      const objetivo = e.target as Node
      if (barriosAbierto && panelBarriosRef.current && !panelBarriosRef.current.contains(objetivo)) {
        setBarriosAbierto(false)
      }
      if (tiposAbierto && panelTiposRef.current && !panelTiposRef.current.contains(objetivo)) {
        setTiposAbierto(false)
      }
      if (
        serviciosAbierto &&
        panelServiciosRef.current &&
        !panelServiciosRef.current.contains(objetivo)
      ) {
        setServiciosAbierto(false)
      }
    }
    const alEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setBarriosAbierto(false)
        setTiposAbierto(false)
        setServiciosAbierto(false)
      }
    }
    document.addEventListener('mousedown', alClicFuera)
    document.addEventListener('keydown', alEscape)
    return () => {
      document.removeEventListener('mousedown', alClicFuera)
      document.removeEventListener('keydown', alEscape)
    }
  }, [barriosAbierto, tiposAbierto, serviciosAbierto])

  /** Exporta la planilla PDF respetando el orden y los filtros en pantalla. */
  const descargarPlanilla = useCallback(async () => {
    if (filasFiltradas.length === 0) {
      notificar('No hay instalaciones para exportar con los filtros actuales.', 'error')
      return
    }
    setGenerandoPdf(true)
    try {
      const { generarPlanillaInstalaciones } = await import('./pdfInstalaciones')
      const { marcaDeTiempo } = await import('../../services/pdfGenerator')

      // Se pasan las filas YA filtradas y ordenadas: el PDF es espejo exacto
      // de la tabla que el usuario está viendo.
      const filasPdf: FilaInstalacionPdf[] = filasFiltradas.map((fila) => ({
        servicio: fila.servicio,
        operador: fila.dueno.operador?.nombre,
        novedad: fila.novedad
          ? {
              tipo: fila.novedad.tipo_novedad,
              cajaNap: fila.novedad.caja_nap,
              comentario: fila.novedad.comentario,
            }
          : undefined,
      }))

      const partes: string[] = []
      if (ciudadFiltro) partes.push(`Ciudad: ${ciudadFiltro}`)
      if (barriosSeleccionados.size > 0) {
        const nombres = barriosDisponibles
          .filter((b) => barriosSeleccionados.has(b.clave))
          .map((b) => b.etiqueta)
        partes.push(`Barrios: ${nombres.join(', ')}`)
      }
      const rango = RANGOS_DIAS.find((r) => r.id === rangoDias)
      if (rango && rango.id !== 'todas') partes.push(`Días: ${rango.etiqueta}`)
      if (!hayFiltroBarrioODias) {
        if (filtro === 'con_novedad') partes.push(tipoDestacado ? `Novedad: ${etiquetaDeTipo(tipoDestacado).etiqueta}` : 'Con novedad')
        if (filtro === 'en_gestion') partes.push('En gestión')
        if (filtro === 'listas') partes.push('Sin novedad')
      }
      if (busqueda.trim()) partes.push(`Búsqueda: "${busqueda.trim()}"`)
      if (tiposNovedadSeleccionados.size > 0) {
        // Se listan todos los tipos marcados, no solo el conteo: la planilla
        // debe documentar exactamente qué se exportó.
        const nombres = TIPOS_NOVEDAD_UI.filter((t) => tiposNovedadSeleccionados.has(t.tipo))
          .map((t) => t.etiqueta)
        partes.push(`Tipos de novedad: ${nombres.join(', ')}`)
      }
      if (serviciosSeleccionados.size > 0) {
        const nombres = serviciosDisponibles
          .filter((s) => serviciosSeleccionados.has(s.clave))
          .map((s) => s.etiqueta)
        partes.push(`Servicios: ${nombres.join(', ')}`)
      }
      if (orden) {
        partes.push(`Orden: ${orden.columna} (${orden.direccion === 'asc' ? 'asc' : 'desc'})`)
      }

      const nombreArchivo = `PI-instalaciones-${marcaDeTiempo()}`
      const doc = await generarPlanillaInstalaciones(filasPdf, {
        notaFiltros: `Filtros: ${partes.length > 0 ? partes.join(' | ') : 'Todas'}`,
        nombreArchivo,
      })
      doc.save(`${nombreArchivo}.pdf`)
      notificar(`Planilla de instalaciones descargada (${filasPdf.length} órdenes).`, 'success')
    } catch (error) {
      notificar(
        error instanceof Error ? error.message : 'No se pudo generar el PDF de instalaciones.',
        'error',
      )
    } finally {
      setGenerandoPdf(false)
    }
  }, [
    filasFiltradas,
    ciudadFiltro,
    barriosSeleccionados,
    barriosDisponibles,
    rangoDias,
    hayFiltroBarrioODias,
    filtro,
    tipoDestacado,
    busqueda,
    tiposNovedadSeleccionados,
    serviciosSeleccionados,
    serviciosDisponibles,
    orden,
    notificar,
  ])

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      {/* ---- Panel 4/12: balance y filtros ---- */}
      <aside className="space-y-4 lg:col-span-3">
        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <header className="mb-3 flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-slate-900">
              <PackageSearch className="size-4 text-emerald-300" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Balance de instalaciones</h2>
              <p className="text-[11px] text-slate-500">
                {conteoNovedades.total} órdenes activas en {conteoPorCiudad.length} ciudades
              </p>
            </div>
          </header>

          <div className="mb-3 grid grid-cols-3 gap-1.5">
            <Metrica etiqueta="Con novedad" valor={conteoNovedades.conNovedad} clase="text-red-600" />
            <Metrica
              etiqueta="En gestión"
              valor={conteoNovedades.enGestion}
              clase="text-amber-600"
            />
            <Metrica etiqueta="Listas" valor={conteoNovedades.listas} clase="text-emerald-600" />
          </div>

          <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
            Por ciudad
          </p>
          {conteoPorCiudad.length === 0 ? (
            <p className="text-xs text-slate-400">Sin órdenes de instalación cargadas.</p>
          ) : (
            <ul className="max-h-40 space-y-0.5 overflow-y-auto pr-1">
              <li>
                <button
                  type="button"
                  onClick={() => setCiudadFiltro(null)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-lg px-2 py-1 text-xs transition',
                    ciudadFiltro === null
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100',
                  )}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Building2 className="size-3.5" /> Todas las ciudades
                  </span>
                  <span className="font-bold tabular-nums">{conteoNovedades.total}</span>
                </button>
              </li>
              {conteoPorCiudad.map(([ciudad, cantidad]) => (
                <li key={ciudad}>
                  <button
                    type="button"
                    onClick={() => setCiudadFiltro((prev) => (prev === ciudad ? null : ciudad))}
                    className={cn(
                      'flex w-full items-center justify-between rounded-lg px-2 py-1 text-xs transition',
                      ciudadFiltro === ciudad
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-100',
                    )}
                  >
                    <span className="truncate">{ciudad}</span>
                    <span className="font-bold tabular-nums">{cantidad}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
              Filtro de novedades
            </p>
            {hayFiltroBarrioODias && (
              <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200">
                Inactivo: hay filtro de barrio/días
              </span>
            )}
          </div>
          <div className="space-y-1">
            {FILTROS.map((opcion) => {
              // El grupo del panel izquierdo queda inerte mientras el grupo
              // barrio/días de la cabecera esté activo (son excluyentes).
              const activo = !hayFiltroBarrioODias && filtro === opcion.id && tipoDestacado === null
              const conteo =
                opcion.id === 'con_novedad'
                  ? conteoNovedades.conNovedad
                  : opcion.id === 'en_gestion'
                    ? conteoNovedades.enGestion
                    : opcion.id === 'listas'
                      ? conteoNovedades.listas
                      : conteoNovedades.total
              return (
                <button
                  key={opcion.id}
                  type="button"
                  onClick={() => {
                    setFiltro(opcion.id)
                    setTipoDestacado(null)
                  }}
                  className={cn(
                    'flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition',
                    activo
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100',
                  )}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden="true">{opcion.icono}</span>
                    {opcion.etiqueta}
                  </span>
                  <span className="font-bold tabular-nums">{conteo}</span>
                </button>
              )
            })}
          </div>

          {conteoNovedades.conNovedad > 0 && (
            <div className="mt-3 border-t border-slate-100 pt-2">
              <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                Desglose por tipo
              </p>
              <div className="flex flex-wrap gap-1">
                {TIPOS_NOVEDAD_UI.map((tipo) => {
                  const cantidad = conteoNovedades.porTipo.get(tipo.tipo) ?? 0
                  if (cantidad === 0) return null
                  const activo = tipoDestacado === tipo.tipo
                  return (
                    <button
                      key={tipo.tipo}
                      type="button"
                      onClick={() => toggleTipo(tipo.tipo)}
                      title={tipo.descripcion}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ring-1 transition',
                        activo
                          ? 'bg-red-600 text-white ring-red-600'
                          : 'bg-red-50 text-red-700 ring-red-200 hover:bg-red-100',
                      )}
                    >
                      <span aria-hidden="true">{tipo.icono}</span>
                      {tipo.etiqueta}
                      <span className="font-bold tabular-nums">{cantidad}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </section>
      </aside>

      {/* ---- Panel 8/12: tablero de seguimiento ---- */}
      <section className="space-y-3 lg:col-span-9">
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-slate-900">
                <ClipboardList className="size-4 text-emerald-300" />
              </span>
              <div>
                <h2 className="text-sm font-bold text-slate-900">Tablero de seguimiento</h2>
                <p className="text-[11px] text-slate-500">
                  {filasFiltradas.length} de {filas.length} órdenes
                  {ciudadFiltro ? ` · ${ciudadFiltro}` : ''}
                  {orden ? ` · Ordenado por ${orden.columna} ${orden.direccion === 'asc' ? '▲' : '▼'}` : ''}
                </p>
              </div>
            </div>

            <label className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Cliente, orden, dirección, NAP…"
                className="w-full rounded-lg py-1.5 pr-8 pl-8 text-xs text-slate-900 ring-1 ring-slate-200 outline-none transition placeholder:text-slate-400 focus:ring-2 focus:ring-slate-900"
              />
              {busqueda && (
                <button
                  type="button"
                  onClick={() => setBusqueda('')}
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100"
                  aria-label="Limpiar búsqueda"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </label>
          </header>

          {/* Filtros tácticos + exportación */}
          <div className="mb-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            {/* Barrios (multi-selección con búsqueda) */}
            <div className="relative" ref={panelBarriosRef}>
              <button
                type="button"
                onClick={() => setBarriosAbierto((v) => !v)}
                aria-expanded={barriosAbierto}
                aria-haspopup="listbox"
                className={cn(
                  'inline-flex max-w-[260px] items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium ring-1 transition',
                  barriosSeleccionados.size > 0
                    ? 'bg-slate-900 text-white ring-slate-900'
                    : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50',
                )}
              >
                <Building2 className="size-3.5 shrink-0" />
                <span className="truncate">
                  {barriosSeleccionados.size === 0
                    ? 'Todos los barrios'
                    : barriosSeleccionados.size === 1
                      ? (barriosDisponibles.find((b) => barriosSeleccionados.has(b.clave))
                          ?.etiqueta ?? '1 barrio')
                      : `${barriosSeleccionados.size} barrios`}
                </span>
                <ChevronDown
                  className={cn('size-3.5 shrink-0 transition', barriosAbierto && 'rotate-180')}
                />
              </button>

              {barriosAbierto && (
                <div
                  role="listbox"
                  aria-multiselectable="true"
                  aria-label="Filtrar por barrios"
                  className="absolute top-full left-0 z-30 mt-1 w-64 overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-slate-200"
                >
                  <div className="border-b border-slate-100 p-2">
                    <label className="relative block">
                      <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-slate-400" />
                      <input
                        type="search"
                        autoFocus
                        value={busquedaBarrio}
                        onChange={(e) => setBusquedaBarrio(e.target.value)}
                        placeholder="Buscar barrio…"
                        className="w-full rounded-lg py-1 pr-2 pl-7 text-xs text-slate-900 ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-slate-900"
                      />
                    </label>
                  </div>

                  <div className="max-h-64 overflow-y-auto p-1">
                    {barriosVisibles.length === 0 ? (
                      <p className="px-2 py-3 text-center text-[11px] text-slate-400">
                        Sin barrios que coincidan.
                      </p>
                    ) : (
                      barriosVisibles.map((b) => {
                        const marcado = barriosSeleccionados.has(b.clave)
                        return (
                          <button
                            key={b.clave}
                            type="button"
                            role="option"
                            aria-selected={marcado}
                            onClick={() => toggleBarrio(b.clave)}
                            className={cn(
                              'flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-xs transition',
                              marcado ? 'bg-slate-100 font-semibold text-slate-900' : 'text-slate-600 hover:bg-slate-50',
                            )}
                          >
                            <span
                              className={cn(
                                'flex size-3.5 shrink-0 items-center justify-center rounded ring-1',
                                marcado
                                  ? 'bg-slate-900 text-white ring-slate-900'
                                  : 'bg-white ring-slate-300',
                              )}
                            >
                              {marcado && <Check className="size-2.5" />}
                            </span>
                            <span className="truncate">{b.etiqueta}</span>
                          </button>
                        )
                      })
                    )}
                  </div>

                  {barriosSeleccionados.size > 0 && (
                    <div className="border-t border-slate-100 p-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setBarriosSeleccionados(new Set())
                          setBusquedaBarrio('')
                        }}
                        className="w-full rounded-lg px-2 py-1 text-left text-[11px] font-medium text-slate-500 transition hover:bg-slate-50"
                      >
                        Limpiar selección
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Días */}
            <select
              value={rangoDias}
              onChange={(e) => cambiarRangoDias(e.target.value as RangoDias)}
              aria-label="Filtrar por rango de días"
              className={cn(
                'cursor-pointer rounded-lg px-2 py-1.5 text-xs font-medium ring-1 transition',
                rangoDias !== 'todas'
                  ? 'bg-slate-900 text-white ring-slate-900'
                  : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50',
              )}
            >
              {RANGOS_DIAS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.etiqueta}
                </option>
              ))}
            </select>

            {(hayFiltroBarrioODias ||
              tiposNovedadSeleccionados.size > 0 ||
              serviciosSeleccionados.size > 0) && (
              <button
                type="button"
                onClick={limpiarFiltrosCabecera}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium text-slate-500 transition hover:bg-slate-100"
              >
                <X className="size-3" /> Limpiar
              </button>
            )}

            {/* Tipos de novedad (multi-selección) */}
            <div className="relative" ref={panelTiposRef}>
              <button
                type="button"
                onClick={() => setTiposAbierto((v) => !v)}
                aria-expanded={tiposAbierto}
                aria-haspopup="listbox"
                className={cn(
                  'inline-flex max-w-[240px] items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium ring-1 transition',
                  tiposNovedadSeleccionados.size > 0
                    ? 'bg-slate-900 text-white ring-slate-900'
                    : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50',
                )}
              >
                <Tag className="size-3.5 shrink-0" />
                <span className="truncate">
                  {tiposNovedadSeleccionados.size === 0
                    ? 'Todas las novedades'
                    : `Novedades: ${tiposNovedadSeleccionados.size} seleccionada${
                        tiposNovedadSeleccionados.size === 1 ? '' : 's'
                      }`}
                </span>
                <ChevronDown
                  className={cn('size-3.5 shrink-0 transition', tiposAbierto && 'rotate-180')}
                />
              </button>

              {tiposAbierto && (
                <div
                  role="listbox"
                  aria-multiselectable="true"
                  aria-label="Filtrar por tipo de novedad"
                  className="absolute top-full left-0 z-30 mt-1 w-64 overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-slate-200"
                >
                  <div className="p-1">
                    {TIPOS_NOVEDAD_UI.map((tipo) => {
                      const marcado = tiposNovedadSeleccionados.has(tipo.tipo)
                      // Conteo disponible del tipo dentro de la ciudad activa.
                      const cantidad = conteoTiposCiudad.get(tipo.tipo) ?? 0
                      return (
                        <button
                          key={tipo.tipo}
                          type="button"
                          role="option"
                          aria-selected={marcado}
                          onClick={() => toggleTipoNovedad(tipo.tipo)}
                          title={tipo.descripcion}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-xs transition',
                            marcado
                              ? 'bg-slate-100 font-semibold text-slate-900'
                              : 'text-slate-600 hover:bg-slate-50',
                          )}
                        >
                          <span
                            className={cn(
                              'flex size-3.5 shrink-0 items-center justify-center rounded ring-1',
                              marcado
                                ? 'bg-slate-900 text-white ring-slate-900'
                                : 'bg-white ring-slate-300',
                            )}
                          >
                            {marcado && <Check className="size-2.5" />}
                          </span>
                          <span aria-hidden="true">{tipo.icono}</span>
                          <span className="flex-1 truncate">{tipo.etiqueta}</span>
                          <span className="text-[10px] font-bold text-slate-400 tabular-nums">
                            {cantidad}
                          </span>
                        </button>
                      )
                    })}
                  </div>

                  {tiposNovedadSeleccionados.size > 0 && (
                    <div className="border-t border-slate-100 p-1.5">
                      <button
                        type="button"
                        onClick={() => setTiposNovedadSeleccionados(new Set())}
                        className="w-full rounded-lg px-2 py-1 text-left text-[11px] font-medium text-slate-500 transition hover:bg-slate-50"
                      >
                        Limpiar filtro
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Tipos de servicio (multi-selección) */}
            <div className="relative" ref={panelServiciosRef}>
              <button
                type="button"
                onClick={() => setServiciosAbierto((v) => !v)}
                aria-expanded={serviciosAbierto}
                aria-haspopup="listbox"
                className={cn(
                  'inline-flex max-w-[240px] items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium ring-1 transition',
                  serviciosSeleccionados.size > 0
                    ? 'bg-slate-900 text-white ring-slate-900'
                    : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50',
                )}
              >
                <PackageSearch className="size-3.5 shrink-0" />
                <span className="truncate">
                  {serviciosSeleccionados.size === 0
                    ? 'Todos los servicios'
                    : `Servicios: ${serviciosSeleccionados.size} seleccionado${
                        serviciosSeleccionados.size === 1 ? '' : 's'
                      }`}
                </span>
                <ChevronDown
                  className={cn('size-3.5 shrink-0 transition', serviciosAbierto && 'rotate-180')}
                />
              </button>

              {serviciosAbierto && (
                <div
                  role="listbox"
                  aria-multiselectable="true"
                  aria-label="Filtrar por tipo de servicio"
                  className="absolute top-full left-0 z-30 mt-1 w-72 overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-slate-200"
                >
                  <div className="border-b border-slate-100 p-2">
                    <label className="relative block">
                      <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-slate-400" />
                      <input
                        type="search"
                        autoFocus
                        value={busquedaServicio}
                        onChange={(e) => setBusquedaServicio(e.target.value)}
                        placeholder="Buscar servicio…"
                        className="w-full rounded-lg py-1 pr-2 pl-7 text-xs text-slate-900 ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-slate-900"
                      />
                    </label>
                  </div>

                  <div className="max-h-64 overflow-y-auto p-1">
                    {serviciosVisibles.length === 0 ? (
                      <p className="px-2 py-3 text-center text-[11px] text-slate-400">
                        Sin servicios que coincidan.
                      </p>
                    ) : (
                      serviciosVisibles.map((s) => {
                        const marcado = serviciosSeleccionados.has(s.clave)
                        return (
                          <button
                            key={s.clave}
                            type="button"
                            role="option"
                            aria-selected={marcado}
                            onClick={() => toggleServicio(s.clave)}
                            title={s.etiqueta}
                            className={cn(
                              'flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-xs transition',
                              marcado
                                ? 'bg-slate-100 font-semibold text-slate-900'
                                : 'text-slate-600 hover:bg-slate-50',
                            )}
                          >
                            <span
                              className={cn(
                                'flex size-3.5 shrink-0 items-center justify-center rounded ring-1',
                                marcado
                                  ? 'bg-slate-900 text-white ring-slate-900'
                                  : 'bg-white ring-slate-300',
                              )}
                            >
                              {marcado && <Check className="size-2.5" />}
                            </span>
                            <span className="flex-1 truncate">{s.etiqueta}</span>
                            <span className="text-[10px] font-bold text-slate-400 tabular-nums">
                              {s.cantidad}
                            </span>
                          </button>
                        )
                      })
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-1 border-t border-slate-100 p-1.5">
                    <button
                      type="button"
                      onClick={marcarTodosServicios}
                      disabled={serviciosVisibles.length === 0}
                      className="rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-40"
                    >
                      Marcar todos
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setServiciosSeleccionados(new Set())
                        setBusquedaServicio('')
                      }}
                      disabled={serviciosSeleccionados.size === 0}
                      className="rounded-lg px-2 py-1 text-[11px] font-medium text-slate-500 transition hover:bg-slate-100 disabled:opacity-40"
                    >
                      Limpiar
                    </button>
                  </div>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => void descargarPlanilla()}
              disabled={generandoPdf || filasFiltradas.length === 0}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {generandoPdf ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <FileDown className="size-3.5" />
              )}
              Descargar Planilla PDF
            </button>
          </div>

          {filas.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-slate-200 px-4 py-10 text-center">
              <PackageSearch className="size-8 text-slate-300" />
              <div>
                <p className="text-sm font-semibold text-slate-700">
                  No hay instalaciones cargadas
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Sube el reporte de Sigma: las órdenes Nueva/Pendiente de
                  "Instalaciones y Traslados" aparecerán aquí sin guardarse en Supabase.
                </p>
              </div>
              <label
                className={cn(
                  'inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800',
                  procesando && 'pointer-events-none opacity-50',
                )}
              >
                {procesando ? (
                  <RefreshCw className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                Subir reporte Sigma
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="sr-only"
                  disabled={procesando}
                  onChange={(e) => {
                    const archivo = e.target.files?.[0]
                    e.target.value = ''
                    if (archivo) void onProcesarReporte(archivo)
                  }}
                />
              </label>
            </div>
          ) : filasFiltradas.length === 0 ? (
            <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-xs text-slate-500">
              Ninguna orden coincide con el filtro actual.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl ring-1 ring-slate-200">
              <div className="max-h-[640px] overflow-auto">
                <table className="w-full min-w-[1180px] text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-slate-900 text-[10px] tracking-wide text-slate-400 uppercase">
                    <tr>
                      <EncabezadoOrdenable
                        columna="dias"
                        titulo="Días"
                        onOrdenar={alternarOrden}
                        icono={<IconoOrden columna="dias" orden={orden} />}
                        activa={orden?.columna === 'dias'}
                      />
                      <EncabezadoOrdenable
                        columna="orden"
                        titulo="Orden #"
                        onOrdenar={alternarOrden}
                        icono={<IconoOrden columna="orden" orden={orden} />}
                        activa={orden?.columna === 'orden'}
                      />
                      <th className="px-3 py-2 font-semibold">Ciudad</th>
                      <EncabezadoOrdenable
                        columna="barrio"
                        titulo="Barrio / Dirección"
                        onOrdenar={alternarOrden}
                        icono={<IconoOrden columna="barrio" orden={orden} />}
                        activa={orden?.columna === 'barrio'}
                      />
                      <th className="px-3 py-2 font-semibold">Cliente / Tel.</th>
                      <EncabezadoOrdenable
                        columna="servicio"
                        titulo="Servicio"
                        onOrdenar={alternarOrden}
                        icono={<IconoOrden columna="servicio" orden={orden} />}
                        activa={orden?.columna === 'servicio'}
                      />
                      <EncabezadoOrdenable
                        columna="operador"
                        titulo="Operador de Zona"
                        onOrdenar={alternarOrden}
                        icono={<IconoOrden columna="operador" orden={orden} />}
                        activa={orden?.columna === 'operador'}
                      />
                      <EncabezadoOrdenable
                        columna="novedad"
                        titulo="Novedad / Seguimiento"
                        onOrdenar={alternarOrden}
                        icono={<IconoOrden columna="novedad" orden={orden} />}
                        activa={orden?.columna === 'novedad'}
                      />
                      <th className="w-44 min-w-[165px] px-3 py-2 font-semibold">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filasFiltradas.map((fila) => {
                      const { servicio, novedad, dueno } = fila
                      const sla = clasificarSla(servicio.dias_antiguedad)
                      return (
                        <tr key={servicio.numero_orden} className="align-top hover:bg-slate-50">
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span
                              className={cn(
                                'inline-flex min-w-6 justify-center rounded px-1.5 py-0.5 text-[11px] font-bold tabular-nums',
                                SLA_BADGE_CLASSES[sla],
                              )}
                            >
                              {servicio.dias_antiguedad}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-mono text-[11px] font-semibold whitespace-nowrap text-slate-700">
                            {servicio.numero_orden}
                          </td>
                          <td className="px-3 py-2 text-slate-600">{servicio.ciudad}</td>
                          <td className="px-3 py-2">
                            <p className="font-medium text-slate-800">{servicio.barrio}</p>
                            {servicio.direccion && (
                              <p className="text-[11px] text-slate-500">{servicio.direccion}</p>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <p className="text-slate-800">
                              {servicio.nombre_cliente ?? '—'}
                            </p>
                            {servicio.telefono_cliente && (
                              <p className="text-[11px] text-slate-500">
                                Tel: {servicio.telefono_cliente}
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <span className="inline-flex items-center rounded-md bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800 ring-1 ring-sky-200">
                              {servicio.tipo_servicio}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            {dueno.operador ? (
                              <>
                                <p className="font-medium text-slate-800">
                                  {dueno.operador.nombre}
                                </p>
                                <p className="text-[11px] text-slate-500">
                                  {dueno.operador.rol === 'operador'
                                    ? 'Operador de Zona'
                                    : 'Dueño del barrio'}
                                  {dueno.patrulla ? ` · Patrulla: ${nombreCorto(dueno.patrulla.nombre)}` : ''}
                                </p>
                              </>
                            ) : (
                              <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200">
                                Barrio sin dueño
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {novedad ? (
                              <div className="space-y-0.5">
                                <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700 ring-1 ring-red-200">
                                  {textoBadgeNovedad(novedad)}
                                </span>
                                <p>
                                  <span
                                    className={cn(
                                      'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1',
                                      presentacionDeEstado(novedad.estado_gestion).texto,
                                    )}
                                  >
                                    {presentacionDeEstado(novedad.estado_gestion).icono}{' '}
                                    {presentacionDeEstado(novedad.estado_gestion).etiqueta}
                                  </span>
                                </p>
                                {novedad.comentario && (
                                  <p className="line-clamp-2 text-[11px] text-slate-500">
                                    {novedad.comentario}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                                🟢 Sin novedad
                              </span>
                            )}
                          </td>
                          <td className="w-44 min-w-[165px] px-3 py-2">
                            <div className="flex flex-col gap-1">
                              <button
                                type="button"
                                onClick={() => setOrdenEnEdicion(servicio.numero_orden)}
                                className="inline-flex items-center justify-center gap-1 rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-semibold whitespace-nowrap text-white transition hover:bg-slate-800"
                              >
                                <PencilLine className="size-3 shrink-0" />
                                {novedad ? 'Editar' : 'Gestionar Novedad'}
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleWhatsApp(fila)}
                                disabled={!dueno.operador}
                                title={
                                  dueno.operador?.telefono
                                    ? `WhatsApp a ${dueno.operador.nombre}`
                                    : 'Copiar mensaje para el operador'
                                }
                                className="inline-flex items-center justify-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-[11px] font-semibold whitespace-nowrap text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {dueno.operador?.telefono ? (
                                  <MessageCircle className="size-3 shrink-0" />
                                ) : (
                                  <Copy className="size-3 shrink-0" />
                                )}
                                WhatsApp
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </section>

      <ModalNovedad
        key={ordenEnEdicion ?? 'sin-seleccion'}
        servicio={servicioEnEdicion?.servicio ?? null}
        novedadActual={servicioEnEdicion?.novedad}
        onCerrar={cerrarModal}
        onGuardar={handleGuardar}
        onEliminar={handleEliminar}
      />
    </div>
  )
}

/** Indicador de dirección del encabezado: ▲ asc, ▼ desc, ⇅ sin ordenar. */
function IconoOrden({
  columna,
  orden,
}: {
  columna: ColumnaOrden
  orden: Ordenamiento | null
}) {
  if (orden?.columna !== columna) return <ArrowUpDown className="size-3 opacity-40" />
  return orden.direccion === 'asc' ? (
    <ArrowUp className="size-3" />
  ) : (
    <ArrowDown className="size-3" />
  )
}

/** Encabezado con indicador ▲ / ▼ / ⇅ (clic para ordenar por esa columna). */
function EncabezadoOrdenable({
  columna,
  titulo,
  onOrdenar,
  icono,
  activa,
}: {
  columna: ColumnaOrden
  titulo: string
  onOrdenar: (columna: ColumnaOrden) => void
  icono: React.ReactNode
  activa: boolean
}) {
  return (
    <th className="px-3 py-2 font-semibold">
      <button
        type="button"
        onClick={() => onOrdenar(columna)}
        aria-label={`Ordenar por ${titulo}`}
        className={cn(
          'inline-flex items-center gap-1 transition hover:text-white',
          activa && 'text-white',
        )}
      >
        {titulo}
        {icono}
      </button>
    </th>
  )
}

/** Tarjeta compacta de métrica del panel de balance (ancho 3/12). */
function Metrica({
  etiqueta,
  valor,
  clase,
}: {
  etiqueta: string
  valor: number
  clase: string
}) {
  return (
    <div className="min-w-0 rounded-lg bg-slate-50 px-1.5 py-1 ring-1 ring-slate-200">
      <p
        className={cn(
          'truncate text-base leading-tight font-bold tabular-nums',
          clase,
        )}
        title={String(valor)}
      >
        {valor}
      </p>
      <p className="truncate text-[9px] leading-tight font-medium text-slate-500" title={etiqueta}>
        {etiqueta}
      </p>
    </div>
  )
}
