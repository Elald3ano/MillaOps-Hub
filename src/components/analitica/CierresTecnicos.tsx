import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Building2,
  Check,
  ChevronDown,
  ClipboardCheck,
  FileDown,
  Loader2,
  PackageSearch,
  Search,
  ShieldAlert,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react'
import type {
  CierreTecnico,
  OrigenCierre,
  ReglaConTecnico,
  Tecnico,
} from '../../types'
import type { ToastVariant } from '../ToastContainer'
import { limpiarBarrio, limpiarTexto } from '../../lib/normalizer'
import { cn } from '../../lib/utils'
import type { FilaCierrePdf } from './pdfCierres'

type FiltroFecha = 'semana' | 'hoy' | 'ayer' | 'fecha'
type ColumnaOrden = 'dias' | 'orden' | 'ciudad' | 'barrio' | 'servicio' | 'fecha' | 'tecnico'

interface Ordenamiento {
  columna: ColumnaOrden
  direccion: 'asc' | 'desc'
}

interface CierresTecnicosProps {
  cierres: CierreTecnico[]
  reglas: ReglaConTecnico[]
  tecnicos: Tecnico[]
  notificar: (mensaje: string, variant?: ToastVariant) => void
}

/** Foco activo del árbol izquierdo: filtra reactivamente la radiografía. */
export type SeleccionActiva =
  | { tipo: 'global' }
  | { tipo: 'ciudad'; ciudad: string }
  | { tipo: 'patrulla'; patrullaId: string; nombre: string }
  | { tipo: 'operador'; operadorId: string; nombre: string }

/** Nodo del árbol Ciudad → Patrulla → Operador. */
interface NodoOperador {
  /** `id` del técnico, o `null` cuando el barrio no tiene dueño asignado. */
  id: string | null
  tecnico?: Tecnico
  nombre: string
  cierres: number
  titulares: number
  externos: number
}

interface NodoPatrulla {
  id: string | null
  tecnico?: Tecnico
  nombre: string
  cierres: number
  titulares: number
  externos: number
  operadores: NodoOperador[]
}

interface NodoCiudad {
  ciudad: string
  cierres: number
  patrullas: NodoPatrulla[]
}

/** Fila enriquecida con el dueño territorial y el veredicto de auditoría. */
interface FilaCierre {
  cierre: CierreTecnico
  operador?: Tecnico
  patrulla?: Tecnico
  origen: OrigenCierre
  indiceBusqueda: string
  fechaMs: number
}

const SIN_DUENO = 'Sin dueño asignado'
/** Clave sintética para los nodos sin técnico ("Sin patrulla" / "Sin dueño"). */
const SIN_ID = '__sin_id__'

/**
 * Compara dos nombres de técnico ignorando tildes, mayúsculas y orden de las
 * palabras ("WILMAR GALLON" vs "Gallon Wilmar" deben coincidir).
 */
function mismoTecnico(a: string | undefined, b: string | undefined): boolean {
  const normalizar = (valor: string | undefined) =>
    limpiarTexto(valor)
      .split(/\s+/)
      .filter(Boolean)
      .sort()
      .join('|')

  const na = normalizar(a)
  const nb = normalizar(b)
  if (!na || !nb) return false
  return na === nb
}

function nombreCorto(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean)
  return partes.slice(0, 2).join(' ')
}

/**
 * Auditoría de cierres de la última semana.
 *
 * Cruza cada orden cerrada con el dueño territorial del barrio
 * (`ciudad|barrio` → regla P2, con fallback a P1) para decidir si el cierre lo
 * ejecutó el titular o un tercero.
 */
export function CierresTecnicos({
  cierres,
  reglas,
  tecnicos,
  notificar,
}: CierresTecnicosProps) {
  const [filtroFecha, setFiltroFecha] = useState<FiltroFecha>('semana')
  const [fechaEspecifica, setFechaEspecifica] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [barriosSeleccionados, setBarriosSeleccionados] = useState<Set<string>>(new Set())
  const [serviciosSeleccionados, setServiciosSeleccionados] = useState<Set<string>>(new Set())
  const [barriosAbierto, setBarriosAbierto] = useState(false)
  const [serviciosAbierto, setServiciosAbierto] = useState(false)
  const [busquedaBarrio, setBusquedaBarrio] = useState('')
  const [busquedaServicio, setBusquedaServicio] = useState('')
  const [orden, setOrden] = useState<Ordenamiento | null>({ columna: 'fecha', direccion: 'desc' })
  const [generandoPdf, setGenerandoPdf] = useState(false)
  // Foco del árbol izquierdo: ciudad, patrulla u operador. Reacciona en la
  // radiografía, los contadores y el PDF.
  const [seleccionActiva, setSeleccionActiva] = useState<SeleccionActiva>({ tipo: 'global' })
  const panelBarriosRef = useRef<HTMLDivElement>(null)
  const panelServiciosRef = useRef<HTMLDivElement>(null)

  const tecnicoPorId = useMemo(() => new Map(tecnicos.map((t) => [t.id, t])), [tecnicos])

  /** Dueño territorial por barrio: P2 primero (carro), P1 como respaldo. */
  const duenosPorBarrio = useMemo(() => {
    const operadorPorClave = new Map<string, string>()
    for (const regla of reglas) {
      if (regla.prioridad !== 2 || !regla.barrio) continue
      const clave = `${limpiarTexto(regla.ciudad)}|${limpiarBarrio(regla.barrio)}`
      if (!operadorPorClave.has(clave)) operadorPorClave.set(clave, regla.tecnico_id)
    }
    for (const regla of reglas) {
      if (regla.prioridad !== 1 || !regla.barrio) continue
      const clave = `${limpiarTexto(regla.ciudad)}|${limpiarBarrio(regla.barrio)}`
      if (!operadorPorClave.has(clave)) operadorPorClave.set(clave, regla.tecnico_id)
    }
    return operadorPorClave
  }, [reglas])

  /** Filas enriquecidas: dueño del barrio + veredicto de auditoría. */
  const filas = useMemo<FilaCierre[]>(() => {
    return cierres.map((cierre) => {
      const clave = `${limpiarTexto(cierre.ciudad)}|${limpiarBarrio(cierre.barrio)}`
      const operadorId = duenosPorBarrio.get(clave)
      const operador = operadorId ? tecnicoPorId.get(operadorId) : undefined
      const patrulla = operador?.patrulla_id ? tecnicoPorId.get(operador.patrulla_id) : undefined

      let origen: OrigenCierre
      if (!operador) origen = 'sin_dueno'
      else if (mismoTecnico(cierre.tecnico_cierre, operador.nombre)) origen = 'titular'
      else origen = 'externo'

      const indiceBusqueda = limpiarTexto(
        [
          cierre.numero_orden,
          cierre.ciudad,
          cierre.barrio,
          cierre.direccion ?? '',
          cierre.nombre_cliente ?? '',
          cierre.telefono_cliente ?? '',
          cierre.tipo_servicio,
          cierre.tecnico_cierre ?? '',
          operador?.nombre ?? '',
        ].join(' '),
      )

      return {
        cierre,
        operador,
        patrulla,
        origen,
        indiceBusqueda,
        fechaMs: new Date(cierre.fecha_cierre).getTime(),
      }
    })
  }, [cierres, duenosPorBarrio, tecnicoPorId])

  /** Fechas del paquete (para los presets Hoy/Ayer y el periodo del PDF). */
  const fechas = useMemo(() => {
    const unicas = new Set(filas.map((f) => f.cierre.fecha_cierre))
    return [...unicas].sort()
  }, [filas])

  const fechaMaxima = fechas.length > 0 ? fechas[fechas.length - 1]! : null

  /** Rango [desde, hasta] en ms según el preset de fecha. */
  const rangoFecha = useMemo(() => {
    if (filtroFecha === 'fecha') {
      if (!fechaEspecifica) return null
      const t = new Date(`${fechaEspecifica}T00:00:00`).getTime()
      return { desde: t, hasta: t + 86_400_000 }
    }
    if (filtroFecha === 'semana') return null // sin recorte: es el paquete entero
    if (!fechaMaxima) return null // sin datos no hay referencia para Hoy/Ayer
    const base = new Date(`${fechaMaxima}T00:00:00`)
    if (filtroFecha === 'ayer') base.setDate(base.getDate() - 1)
    const desde = base.getTime()
    return { desde, hasta: desde + 86_400_000 }
  }, [filtroFecha, fechaEspecifica, fechaMaxima])

  /** Barrios y servicios disponibles (sobre el universo, no sobre lo filtrado). */
  const barriosDisponibles = useMemo(() => {
    const porClave = new Map<string, string>()
    for (const fila of filas) {
      const clave = limpiarBarrio(fila.cierre.barrio)
      if (!clave) continue
      if (!porClave.has(clave)) porClave.set(clave, fila.cierre.barrio || 'Sin barrio')
    }
    return [...porClave.entries()]
      .map(([clave, etiqueta]) => ({ clave, etiqueta }))
      .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta))
  }, [filas])

  const serviciosDisponibles = useMemo(() => {
    const porClave = new Map<string, { clave: string; etiqueta: string; cantidad: number }>()
    for (const fila of filas) {
      const etiqueta = fila.cierre.tipo_servicio?.trim()
      if (!etiqueta) continue
      const clave = limpiarTexto(etiqueta)
      const prev = porClave.get(clave)
      if (prev) prev.cantidad += 1
      else porClave.set(clave, { clave, etiqueta, cantidad: 1 })
    }
    return [...porClave.values()].sort(
      (a, b) => b.cantidad - a.cantidad || a.etiqueta.localeCompare(b.etiqueta),
    )
  }, [filas])

  const barriosVisibles = useMemo(() => {
    const q = limpiarTexto(busquedaBarrio)
    return q ? barriosDisponibles.filter((b) => limpiarTexto(b.etiqueta).includes(q)) : barriosDisponibles
  }, [barriosDisponibles, busquedaBarrio])

  const serviciosVisibles = useMemo(() => {
    const q = limpiarTexto(busquedaServicio)
    return q ? serviciosDisponibles.filter((s) => s.clave.includes(q)) : serviciosDisponibles
  }, [serviciosDisponibles, busquedaServicio])

  /**
   * ¿La fila cae dentro del foco del árbol? Es independiente de los filtros de
   * la barra (fecha/barrio/servicio/búsqueda): todos se combinan con AND.
   */
  const coincideSeleccion = useCallback(
    (fila: FilaCierre): boolean => {
      switch (seleccionActiva.tipo) {
        case 'global':
          return true
        case 'ciudad':
          return fila.cierre.ciudad === seleccionActiva.ciudad
        case 'patrulla':
          // "Sin patrulla" no tiene id: se identifica por no tener técnico.
          return seleccionActiva.patrullaId === SIN_ID
            ? !fila.patrulla
            : fila.patrulla?.id === seleccionActiva.patrullaId
        case 'operador':
          // Igual con "Sin dueño": filas cuyo barrio no tiene titular.
          return seleccionActiva.operadorId === SIN_ID
            ? !fila.operador
            : fila.operador?.id === seleccionActiva.operadorId
        default:
          return true
      }
    },
    [seleccionActiva],
  )

  const filasFiltradas = useMemo(() => {
    const texto = limpiarTexto(busqueda)
    const base = filas.filter((fila) => {
      if (!coincideSeleccion(fila)) return false
      if (rangoFecha && (fila.fechaMs < rangoFecha.desde || fila.fechaMs >= rangoFecha.hasta)) {
        return false
      }
      if (
        barriosSeleccionados.size > 0 &&
        !barriosSeleccionados.has(limpiarBarrio(fila.cierre.barrio))
      ) {
        return false
      }
      if (
        serviciosSeleccionados.size > 0 &&
        !serviciosSeleccionados.has(limpiarTexto(fila.cierre.tipo_servicio))
      ) {
        return false
      }
      if (texto && !fila.indiceBusqueda.includes(texto)) return false
      return true
    })

    if (!orden) return base

    const signo = orden.direccion === 'asc' ? 1 : -1
    return [...base].sort((a, b) => {
      switch (orden.columna) {
        case 'dias':
          return (a.cierre.dias_antiguedad - b.cierre.dias_antiguedad) * signo
        case 'orden': {
          const na = Number(a.cierre.numero_orden)
          const nb = Number(b.cierre.numero_orden)
          if (Number.isFinite(na) && Number.isFinite(nb)) return (na - nb) * signo
          return a.cierre.numero_orden.localeCompare(b.cierre.numero_orden) * signo
        }
        case 'ciudad':
          return a.cierre.ciudad.localeCompare(b.cierre.ciudad) * signo
        case 'barrio':
          return a.cierre.barrio.localeCompare(b.cierre.barrio) * signo
        case 'servicio':
          return a.cierre.tipo_servicio.localeCompare(b.cierre.tipo_servicio) * signo
        case 'fecha':
          return (a.fechaMs - b.fechaMs) * signo
        case 'tecnico':
          if (!a.cierre.tecnico_cierre && !b.cierre.tecnico_cierre) return 0
          if (!a.cierre.tecnico_cierre) return 1
          if (!b.cierre.tecnico_cierre) return -1
          return a.cierre.tecnico_cierre.localeCompare(b.cierre.tecnico_cierre) * signo
        default:
          return 0
      }
    })
  }, [filas, coincideSeleccion, rangoFecha, barriosSeleccionados, serviciosSeleccionados, busqueda, orden])

  /**
   * Árbol de cierres por célula: Ciudad → Patrulla → Operador de Zona.
   * Usa el universo completo (no lo filtrado) para que sirva de balance.
   */
  const arbol = useMemo<NodoCiudad[]>(() => {
    const porCiudad = new Map<string, NodoCiudad>()

    for (const fila of filas) {
      const ciudad = fila.cierre.ciudad
      let nodoCiudad = porCiudad.get(ciudad)
      if (!nodoCiudad) {
        nodoCiudad = { ciudad, cierres: 0, patrullas: [] }
        porCiudad.set(ciudad, nodoCiudad)
      }
      nodoCiudad.cierres += 1

      const nombrePatrulla = fila.patrulla?.nombre ?? 'Sin patrulla'
      const idPatrulla = fila.patrulla?.id ?? null
      let nodoPatrulla = nodoCiudad.patrullas.find((p) => p.nombre === nombrePatrulla)
      if (!nodoPatrulla) {
        nodoPatrulla = {
          id: idPatrulla,
          tecnico: fila.patrulla,
          nombre: nombrePatrulla,
          cierres: 0,
          titulares: 0,
          externos: 0,
          operadores: [],
        }
        nodoCiudad.patrullas.push(nodoPatrulla)
      }
      nodoPatrulla.cierres += 1

      const nombreOperador = fila.operador?.nombre ?? SIN_DUENO
      const idOperador = fila.operador?.id ?? null
      let nodoOperador = nodoPatrulla.operadores.find((o) => o.nombre === nombreOperador)
      if (!nodoOperador) {
        nodoOperador = {
          id: idOperador,
          tecnico: fila.operador,
          nombre: nombreOperador,
          cierres: 0,
          titulares: 0,
          externos: 0,
        }
        nodoPatrulla.operadores.push(nodoOperador)
      }
      nodoOperador.cierres += 1
      if (fila.origen === 'titular') {
        nodoOperador.titulares += 1
        nodoPatrulla.titulares += 1
      } else if (fila.origen === 'externo') {
        nodoOperador.externos += 1
        nodoPatrulla.externos += 1
      }
    }

    for (const ciudad of porCiudad.values()) {
      ciudad.patrullas.sort((a, b) => b.cierres - a.cierres)
      for (const patrulla of ciudad.patrullas) {
        patrulla.operadores.sort((a, b) => b.cierres - a.cierres)
      }
    }
    return [...porCiudad.values()].sort((a, b) => b.cierres - a.cierres)
  }, [filas])

  /** Totales SOLO del foco activo: alimentan las tarjetas y el subtítulo. */
  const totalesFoco = useMemo(() => {
    const enFoco = filas.filter(coincideSeleccion)
    return {
      total: enFoco.length,
      titulares: enFoco.filter((f) => f.origen === 'titular').length,
      externos: enFoco.filter((f) => f.origen === 'externo').length,
    }
  }, [filas, coincideSeleccion])

  const esGlobal = seleccionActiva.tipo === 'global'
  const etiquetaFoco =
    seleccionActiva.tipo === 'ciudad'
      ? seleccionActiva.ciudad
      : seleccionActiva.tipo === 'global'
        ? null
        : seleccionActiva.nombre

  // Cierra los desplegables al hacer clic fuera.
  useEffect(() => {
    if (!barriosAbierto && !serviciosAbierto) return
    const alClicFuera = (e: MouseEvent) => {
      const objetivo = e.target as Node
      if (barriosAbierto && panelBarriosRef.current && !panelBarriosRef.current.contains(objetivo)) {
        setBarriosAbierto(false)
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
        setServiciosAbierto(false)
      }
    }
    document.addEventListener('mousedown', alClicFuera)
    document.addEventListener('keydown', alEscape)
    return () => {
      document.removeEventListener('mousedown', alClicFuera)
      document.removeEventListener('keydown', alEscape)
    }
  }, [barriosAbierto, serviciosAbierto])

  const alternarOrden = (columna: ColumnaOrden) => {
    setOrden((prev) =>
      prev?.columna === columna
        ? { columna, direccion: prev.direccion === 'asc' ? 'desc' : 'asc' }
        : { columna, direccion: 'asc' },
    )
  }

  const toggleBarrio = (clave: string) => {
    setBarriosSeleccionados((prev) => {
      const siguiente = new Set(prev)
      if (siguiente.has(clave)) siguiente.delete(clave)
      else siguiente.add(clave)
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

  const limpiarFiltros = () => {
    setFiltroFecha('semana')
    setFechaEspecifica('')
    setBusqueda('')
    setBarriosSeleccionados(new Set())
    setServiciosSeleccionados(new Set())
    setBusquedaBarrio('')
    setBusquedaServicio('')
  }

  /** Clic en un nodo: activa el foco; repetir el clic vuelve a la vista global. */
  const seleccionarCiudad = (ciudad: string) => {
    setSeleccionActiva((prev) =>
      prev.tipo === 'ciudad' && prev.ciudad === ciudad ? { tipo: 'global' } : { tipo: 'ciudad', ciudad },
    )
  }

  const seleccionarPatrulla = (id: string | null, nombre: string) => {
    const clave = id ?? SIN_ID
    setSeleccionActiva((prev) =>
      prev.tipo === 'patrulla' && prev.patrullaId === clave
        ? { tipo: 'global' }
        : { tipo: 'patrulla', patrullaId: clave, nombre },
    )
  }

  const seleccionarOperador = (id: string | null, nombre: string) => {
    const clave = id ?? SIN_ID
    setSeleccionActiva((prev) =>
      prev.tipo === 'operador' && prev.operadorId === clave
        ? { tipo: 'global' }
        : { tipo: 'operador', operadorId: clave, nombre },
    )
  }

  const volverAGlobal = () => setSeleccionActiva({ tipo: 'global' })

  const hayFiltros =
    filtroFecha !== 'semana' ||
    busqueda.trim() !== '' ||
    barriosSeleccionados.size > 0 ||
    serviciosSeleccionados.size > 0

  /** Exporta la planilla respetando filtros y orden en pantalla. */
  const descargarPlanilla = useCallback(async () => {
    if (filasFiltradas.length === 0) {
      notificar('No hay cierres para exportar con los filtros actuales.', 'error')
      return
    }
    setGenerandoPdf(true)
    try {
      const { generarPlanillaCierres } = await import('./pdfCierres')
      const { marcaDeTiempo } = await import('../../services/pdfGenerator')

      const filasPdf: FilaCierrePdf[] = filasFiltradas.map((fila) => ({
        orden: fila.cierre.numero_orden,
        ciudad: fila.cierre.ciudad,
        barrio: fila.cierre.barrio,
        direccion: fila.cierre.direccion,
        cliente: fila.cierre.nombre_cliente,
        telefono: fila.cierre.telefono_cliente,
        tipoServicio: fila.cierre.tipo_servicio,
        dias: fila.cierre.dias_antiguedad,
        fechaCierre: fila.cierre.fecha_cierre,
        tecnicoSigma: fila.cierre.tecnico_cierre,
        operadorZona: fila.operador?.nombre,
        origen: fila.origen,
      }))

      const partes: string[] = []
      if (seleccionActiva.tipo === 'ciudad') partes.push(`Ciudad: ${seleccionActiva.ciudad}`)
      if (seleccionActiva.tipo === 'patrulla') partes.push(`Patrulla: ${seleccionActiva.nombre}`)
      if (seleccionActiva.tipo === 'operador') partes.push(`Operador: ${seleccionActiva.nombre}`)
      const etiquetasFecha: Record<FiltroFecha, string> = {
        semana: 'Toda la semana',
        hoy: `Hoy (${fechaMaxima ?? 'sin datos'})`,
        ayer: 'Ayer',
        fecha: fechaEspecifica || 'Fecha',
      }
      if (filtroFecha !== 'semana') partes.push(`Fecha: ${etiquetasFecha[filtroFecha]}`)
      if (barriosSeleccionados.size > 0) {
        const nombres = barriosDisponibles
          .filter((b) => barriosSeleccionados.has(b.clave))
          .map((b) => b.etiqueta)
        partes.push(`Barrios: ${nombres.join(', ')}`)
      }
      if (serviciosSeleccionados.size > 0) {
        const nombres = serviciosDisponibles
          .filter((s) => serviciosSeleccionados.has(s.clave))
          .map((s) => s.etiqueta)
        partes.push(`Servicios: ${nombres.join(', ')}`)
      }
      if (busqueda.trim()) partes.push(`Búsqueda: "${busqueda.trim()}"`)

      const nombreArchivo = `CT-cierres-${marcaDeTiempo()}`
      const doc = await generarPlanillaCierres(filasPdf, {
        notaFiltros: `Filtros: ${partes.length > 0 ? partes.join(' | ') : 'Toda la semana'}`,
        nombreArchivo,
      })
      doc.save(`${nombreArchivo}.pdf`)
      notificar(`Planilla de cierres descargada (${filasPdf.length} órdenes).`, 'success')
    } catch (error) {
      notificar(
        error instanceof Error ? error.message : 'No se pudo generar el PDF de cierres.',
        'error',
      )
    } finally {
      setGenerandoPdf(false)
    }
  }, [
    filasFiltradas,
    seleccionActiva,
    filtroFecha,
    fechaEspecifica,
    fechaMaxima,
    barriosSeleccionados,
    barriosDisponibles,
    serviciosSeleccionados,
    serviciosDisponibles,
    busqueda,
    notificar,
  ])




  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      {/* ---- Panel 3/12: árbol de cierres por célula ---- */}
      <aside className="space-y-4 lg:col-span-3">
        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <header className="mb-3 flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-slate-900">
              <ClipboardCheck className="size-4 text-emerald-300" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Cierres por célula</h2>
              <p className="text-[11px] text-slate-500">
                {totalesFoco.total} cierres en {arbol.length} ciudades
              </p>
            </div>
          </header>

          <div className="mb-3 grid grid-cols-2 gap-1.5">
            <Metrica etiqueta="Titulares" valor={totalesFoco.titulares} clase="text-emerald-600" />
            <Metrica etiqueta="Externos" valor={totalesFoco.externos} clase="text-red-600" />
          </div>

          {!esGlobal && (
            <button
              type="button"
              onClick={volverAGlobal}
              className="mb-2 flex w-full items-center justify-center gap-1 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-2 py-1 text-[11px] font-semibold text-cyan-700 transition hover:bg-cyan-500/20"
            >
              <X className="size-3" /> Ver Vista Global
            </button>
          )}

          {arbol.length === 0 ? (
            <p className="text-xs text-slate-400">
              Sin cierres cargados. Sube el reporte de Sigma.
            </p>
          ) : (
            <div className="max-h-[560px] space-y-1.5 overflow-y-auto pr-1">
              {arbol.map((ciudad) => {
                const ciudadActiva =
                  seleccionActiva.tipo === 'ciudad' && seleccionActiva.ciudad === ciudad.ciudad
                return (
                  <details key={ciudad.ciudad} className="group" open>
                    <summary className="list-none">
                      <button
                        type="button"
                        onClick={() => seleccionarCiudad(ciudad.ciudad)}
                        aria-pressed={ciudadActiva}
                        className={cn(
                          'flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs font-semibold transition',
                          ciudadActiva
                            ? 'border border-cyan-500/40 bg-cyan-500/10 text-cyan-900'
                            : 'bg-slate-100 text-slate-800 hover:bg-slate-200',
                        )}
                      >
                        <span className="inline-flex min-w-0 items-center gap-1.5">
                          <Building2 className="size-3.5 shrink-0 text-slate-500" />
                          <span className="truncate">{ciudad.ciudad}</span>
                        </span>
                        <span className="tabular-nums">{ciudad.cierres}</span>
                      </button>
                    </summary>

                    <div className="mt-1 space-y-1 pl-2">
                      {ciudad.patrullas.map((patrulla) => {
                        const clavePatrulla = patrulla.id ?? SIN_ID
                        const patrullaActiva =
                          seleccionActiva.tipo === 'patrulla' &&
                          seleccionActiva.patrullaId === clavePatrulla
                        return (
                          <details key={`${ciudad.ciudad}-${patrulla.nombre}`} open>
                            <summary className="list-none">
                              <button
                                type="button"
                                onClick={() => seleccionarPatrulla(patrulla.id, patrulla.nombre)}
                                aria-pressed={patrullaActiva}
                                className={cn(
                                  'flex w-full items-center justify-between rounded-md px-1.5 py-1 text-[11px] font-medium transition',
                                  patrullaActiva
                                    ? 'border border-cyan-500/40 bg-cyan-500/10 text-cyan-900'
                                    : 'text-slate-700 hover:bg-slate-50',
                                )}
                              >
                                <span className="inline-flex min-w-0 items-center gap-1.5">
                                  <Users className="size-3 shrink-0 text-slate-400" />
                                  <span className="truncate">{nombreCorto(patrulla.nombre)}</span>
                                </span>
                                <span className="tabular-nums">{patrulla.cierres}</span>
                              </button>
                            </summary>

                            <ul className="mt-0.5 space-y-0.5 border-l border-slate-200 pl-2">
                              {patrulla.operadores.map((operador) => {
                                const claveOperador = operador.id ?? SIN_ID
                                const operadorActivo =
                                  seleccionActiva.tipo === 'operador' &&
                                  seleccionActiva.operadorId === claveOperador
                                return (
                                  <li key={`${patrulla.nombre}-${operador.nombre}`}>
                                    <button
                                      type="button"
                                      onClick={() => seleccionarOperador(operador.id, operador.nombre)}
                                      aria-pressed={operadorActivo}
                                      title={operador.nombre}
                                      className={cn(
                                        'flex w-full cursor-pointer items-center justify-between gap-1 rounded px-1.5 py-1 text-left text-[11px] transition',
                                        operadorActivo
                                          ? 'border border-cyan-500/40 bg-cyan-500/10 font-semibold text-cyan-900'
                                          : 'text-slate-600 hover:bg-slate-100',
                                      )}
                                    >
                                      <span className="truncate">
                                        {nombreCorto(operador.nombre)}
                                      </span>
                                      <span className="flex shrink-0 items-center gap-1 tabular-nums">
                                        {operador.externos > 0 && (
                                          <span className="text-[10px] font-semibold text-red-500">
                                            ⚠{operador.externos}
                                          </span>
                                        )}
                                        <span className="font-bold">{operador.cierres}</span>
                                      </span>
                                    </button>
                                  </li>
                                )
                              })}
                            </ul>
                          </details>
                        )
                      })}
                    </div>
                  </details>
                )
              })}
            </div>
          )}
        </section>
      </aside>

      {/* ---- Panel 9/12: radiografía de auditoría ---- */}
      <section className="space-y-3 lg:col-span-9">
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-slate-900">
                <Search className="size-4 text-emerald-300" />
              </span>
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  {esGlobal
                    ? `Radiografía de cierres (${filasFiltradas.length} de ${filas.length} cierres · Global)`
                    : `Radiografía de cierres: ${etiquetaFoco} (${totalesFoco.total} cierres en su zona)`}
                </h2>
                <p className="text-[11px] text-slate-500">
                  {esGlobal
                    ? `${filasFiltradas.length} de ${filas.length} cierres`
                    : `${filasFiltradas.length} visibles en el foco · Titulares ${totalesFoco.titulares} · Externos ${totalesFoco.externos}`}
                </p>
              </div>
            </div>

            {!esGlobal && (
              <button
                type="button"
                onClick={volverAGlobal}
                className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-cyan-700 transition hover:bg-cyan-500/20"
              >
                <X className="size-3.5" /> Ver Vista Global
              </button>
            )}

            <label className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Cliente, orden, dirección, técnico…"
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

          {/* Filtros: fecha, barrios, servicios y limpieza */}
          <div className="mb-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            <select
              value={filtroFecha}
              onChange={(e) => setFiltroFecha(e.target.value as FiltroFecha)}
              aria-label="Filtrar por fecha de cierre"
              className={cn(
                'cursor-pointer rounded-lg px-2 py-1.5 text-xs font-medium ring-1 transition',
                filtroFecha !== 'semana'
                  ? 'bg-slate-900 text-white ring-slate-900'
                  : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50',
              )}
            >
              <option value="semana">Toda la semana</option>
              <option value="hoy">Hoy</option>
              <option value="ayer">Ayer</option>
              <option value="fecha">Fecha específica…</option>
            </select>

            {filtroFecha === 'fecha' && (
              <input
                type="date"
                value={fechaEspecifica}
                onChange={(e) => setFechaEspecifica(e.target.value)}
                aria-label="Fecha de cierre específica"
                className="rounded-lg bg-white px-2 py-1.5 text-xs text-slate-700 ring-1 ring-slate-200 focus:ring-2 focus:ring-slate-900 focus:outline-none"
              />
            )}

            {/* Barrios */}
            <div className="relative" ref={panelBarriosRef}>
              <button
                type="button"
                onClick={() => setBarriosAbierto((v) => !v)}
                aria-expanded={barriosAbierto}
                className={cn(
                  'inline-flex max-w-[220px] items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium ring-1 transition',
                  barriosSeleccionados.size > 0
                    ? 'bg-slate-900 text-white ring-slate-900'
                    : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50',
                )}
              >
                <Building2 className="size-3.5 shrink-0" />
                <span className="truncate">
                  {barriosSeleccionados.size === 0
                    ? 'Todos los barrios'
                    : `${barriosSeleccionados.size} barrio${barriosSeleccionados.size === 1 ? '' : 's'}`}
                </span>
                <ChevronDown className={cn('size-3.5 shrink-0 transition', barriosAbierto && 'rotate-180')} />
              </button>

              {barriosAbierto && (
                <div className="absolute top-full left-0 z-30 mt-1 w-64 overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-slate-200">
                  <div className="border-b border-slate-100 p-2">
                    <input
                      type="search"
                      autoFocus
                      value={busquedaBarrio}
                      onChange={(e) => setBusquedaBarrio(e.target.value)}
                      placeholder="Buscar barrio…"
                      className="w-full rounded-lg px-2 py-1 text-xs text-slate-900 ring-1 ring-slate-200 focus:ring-2 focus:ring-slate-900 focus:outline-none"
                    />
                  </div>
                  <div className="max-h-56 overflow-y-auto p-1">
                    {barriosVisibles.length === 0 ? (
                      <p className="px-2 py-3 text-center text-[11px] text-slate-400">Sin coincidencias.</p>
                    ) : (
                      barriosVisibles.map((b) => {
                        const marcado = barriosSeleccionados.has(b.clave)
                        return (
                          <button
                            key={b.clave}
                            type="button"
                            onClick={() => toggleBarrio(b.clave)}
                            className={cn(
                              'flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-xs transition',
                              marcado ? 'bg-slate-100 font-semibold text-slate-900' : 'text-slate-600 hover:bg-slate-50',
                            )}
                          >
                            <span
                              className={cn(
                                'flex size-3.5 shrink-0 items-center justify-center rounded ring-1',
                                marcado ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white ring-slate-300',
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
                        onClick={() => setBarriosSeleccionados(new Set())}
                        className="w-full rounded-lg px-2 py-1 text-left text-[11px] font-medium text-slate-500 hover:bg-slate-50"
                      >
                        Limpiar
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Servicios */}
            <div className="relative" ref={panelServiciosRef}>
              <button
                type="button"
                onClick={() => setServiciosAbierto((v) => !v)}
                aria-expanded={serviciosAbierto}
                className={cn(
                  'inline-flex max-w-[220px] items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium ring-1 transition',
                  serviciosSeleccionados.size > 0
                    ? 'bg-slate-900 text-white ring-slate-900'
                    : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50',
                )}
              >
                <PackageSearch className="size-3.5 shrink-0" />
                <span className="truncate">
                  {serviciosSeleccionados.size === 0
                    ? 'Todos los servicios'
                    : `${serviciosSeleccionados.size} servicio${serviciosSeleccionados.size === 1 ? '' : 's'}`}
                </span>
                <ChevronDown className={cn('size-3.5 shrink-0 transition', serviciosAbierto && 'rotate-180')} />
              </button>

              {serviciosAbierto && (
                <div className="absolute top-full left-0 z-30 mt-1 w-72 overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-slate-200">
                  <div className="border-b border-slate-100 p-2">
                    <input
                      type="search"
                      autoFocus
                      value={busquedaServicio}
                      onChange={(e) => setBusquedaServicio(e.target.value)}
                      placeholder="Buscar servicio…"
                      className="w-full rounded-lg px-2 py-1 text-xs text-slate-900 ring-1 ring-slate-200 focus:ring-2 focus:ring-slate-900 focus:outline-none"
                    />
                  </div>
                  <div className="max-h-56 overflow-y-auto p-1">
                    {serviciosVisibles.map((s) => {
                      const marcado = serviciosSeleccionados.has(s.clave)
                      return (
                        <button
                          key={s.clave}
                          type="button"
                          onClick={() => toggleServicio(s.clave)}
                          title={s.etiqueta}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-xs transition',
                            marcado ? 'bg-slate-100 font-semibold text-slate-900' : 'text-slate-600 hover:bg-slate-50',
                          )}
                        >
                          <span
                            className={cn(
                              'flex size-3.5 shrink-0 items-center justify-center rounded ring-1',
                              marcado ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white ring-slate-300',
                            )}
                          >
                            {marcado && <Check className="size-2.5" />}
                          </span>
                          <span className="flex-1 truncate">{s.etiqueta}</span>
                          <span className="text-[10px] font-bold text-slate-400 tabular-nums">{s.cantidad}</span>
                        </button>
                      )
                    })}
                  </div>
                  {serviciosSeleccionados.size > 0 && (
                    <div className="border-t border-slate-100 p-1.5">
                      <button
                        type="button"
                        onClick={() => setServiciosSeleccionados(new Set())}
                        className="w-full rounded-lg px-2 py-1 text-left text-[11px] font-medium text-slate-500 hover:bg-slate-50"
                      >
                        Limpiar
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {hayFiltros && (
              <button
                type="button"
                onClick={limpiarFiltros}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium text-slate-500 transition hover:bg-slate-100"
              >
                <X className="size-3" /> Limpiar
              </button>
            )}

            <button
              type="button"
              onClick={() => void descargarPlanilla()}
              disabled={generandoPdf || filasFiltradas.length === 0}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {generandoPdf ? <Loader2 className="size-3.5 animate-spin" /> : <FileDown className="size-3.5" />}
              Descargar PDF de cierres
            </button>
          </div>

          {filas.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-200 px-4 py-10 text-center">
              <ClipboardCheck className="size-8 text-slate-300" />
              <p className="text-sm font-semibold text-slate-700">No hay cierres cargados</p>
              <p className="text-xs text-slate-500">
                Sube el reporte de Sigma: se guardarán las órdenes cerradas de los últimos 7 días.
              </p>
            </div>
          ) : filasFiltradas.length === 0 ? (
            <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-xs text-slate-500">
              Ningún cierre coincide con el filtro actual.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl ring-1 ring-slate-200">
              <div className="max-h-[640px] overflow-auto">
                <table className="w-full min-w-[1240px] text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-slate-900 text-[10px] tracking-wide text-slate-400 uppercase">
                    <tr>
                      <Encabezado columna="dias" titulo="Días" orden={orden} onOrdenar={alternarOrden} />
                      <Encabezado columna="orden" titulo="Orden #" orden={orden} onOrdenar={alternarOrden} />
                      <Encabezado columna="ciudad" titulo="Ciudad" orden={orden} onOrdenar={alternarOrden} />
                      <Encabezado columna="barrio" titulo="Barrio / Dirección" orden={orden} onOrdenar={alternarOrden} />
                      <th className="px-3 py-2 font-semibold">Cliente / Tel.</th>
                      <Encabezado columna="servicio" titulo="Servicio" orden={orden} onOrdenar={alternarOrden} />
                      <Encabezado columna="fecha" titulo="Fecha de cierre" orden={orden} onOrdenar={alternarOrden} />
                      <Encabezado columna="tecnico" titulo="Técnico Sigma" orden={orden} onOrdenar={alternarOrden} />
                      <th className="w-36 min-w-[140px] px-3 py-2 font-semibold">Auditor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filasFiltradas.map((fila) => {
                      const { cierre, operador, origen } = fila
                      return (
                        <tr key={`${cierre.numero_orden}-${cierre.fecha_cierre}`} className="align-top hover:bg-slate-50">
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span
                              className={cn(
                                'inline-flex min-w-6 justify-center rounded px-1.5 py-0.5 text-[11px] font-bold tabular-nums',
                                cierre.dias_antiguedad <= 1
                                  ? 'bg-emerald-600 text-white'
                                  : cierre.dias_antiguedad <= 3
                                    ? 'bg-yellow-400 text-slate-900'
                                    : 'bg-red-600 text-white',
                              )}
                            >
                              {cierre.dias_antiguedad}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-mono text-[11px] font-semibold whitespace-nowrap text-slate-700">
                            {cierre.numero_orden}
                          </td>
                          <td className="px-3 py-2 text-slate-600">{cierre.ciudad}</td>
                          <td className="px-3 py-2">
                            <p className="font-medium text-slate-800">{cierre.barrio}</p>
                            {cierre.direccion && <p className="text-[11px] text-slate-500">{cierre.direccion}</p>}
                          </td>
                          <td className="px-3 py-2">
                            <p className="text-slate-800">{cierre.nombre_cliente ?? '—'}</p>
                            {cierre.telefono_cliente && (
                              <p className="text-[11px] text-slate-500">Tel: {cierre.telefono_cliente}</p>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <span className="inline-flex items-center rounded-md bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800 ring-1 ring-sky-200">
                              {cierre.tipo_servicio}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-mono text-[11px] whitespace-nowrap text-slate-700">
                            📅 {cierre.fecha_cierre}
                          </td>
                          <td className="px-3 py-2">
                            <p className="text-slate-800">{cierre.tecnico_cierre ?? 's/r'}</p>
                            <p className="text-[11px] text-slate-500">
                              Zona: {operador ? nombreCorto(operador.nombre) : 'sin dueño'}
                            </p>
                          </td>
                          <td className="w-36 min-w-[140px] px-3 py-2">
                            {origen === 'titular' ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap text-emerald-700 ring-1 ring-emerald-200">
                                <ShieldCheck className="size-3" /> Titular
                              </span>
                            ) : origen === 'externo' ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap text-red-700 ring-1 ring-red-200">
                                <ShieldAlert className="size-3" /> Externo / Tercero
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap text-amber-700 ring-1 ring-amber-200">
                                Sin dueño
                              </span>
                            )}
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
    </div>
  )
}

/** Indicador de dirección: ▲ asc, ▼ desc, ⇅ sin ordenar. */
function IconoOrden({ columna, orden }: { columna: ColumnaOrden; orden: Ordenamiento | null }) {
  if (orden?.columna !== columna) return <ArrowUpDown className="size-3 opacity-40" />
  return orden.direccion === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
}

/** Encabezado ordenable de la tabla de cierres. */
function Encabezado({
  columna,
  titulo,
  orden,
  onOrdenar,
}: {
  columna: ColumnaOrden
  titulo: string
  orden: Ordenamiento | null
  onOrdenar: (columna: ColumnaOrden) => void
}) {
  return (
    <th className="px-3 py-2 font-semibold">
      <button
        type="button"
        onClick={() => onOrdenar(columna)}
        aria-label={`Ordenar por ${titulo}`}
        className={cn(
          'inline-flex items-center gap-1 transition hover:text-white',
          orden?.columna === columna && 'text-white',
        )}
      >
        {titulo}
        <IconoOrden columna={columna} orden={orden} />
      </button>
    </th>
  )
}

/** Tarjeta compacta de métrica del panel de balance. */
function Metrica({ etiqueta, valor, clase }: { etiqueta: string; valor: number; clase: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-slate-50 px-1.5 py-1 ring-1 ring-slate-200">
      <p className={cn('truncate text-base leading-tight font-bold tabular-nums', clase)}>{valor}</p>
      <p className="truncate text-[9px] leading-tight font-medium text-slate-500">{etiqueta}</p>
    </div>
  )
}