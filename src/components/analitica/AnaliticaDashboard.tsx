import { useMemo, useState } from 'react'
import { BarChart3, MapPin, Upload } from 'lucide-react'
import type { Servicio, Tecnico } from '../../types'
import type { ResultadoCierres } from '../../services/reconciliationService'
import type { ToastVariant } from '../ToastContainer'
import { ciudadCanonica, esSucursalAutorizada } from '../../lib/zonasPermitidas'
import { MultiSelectFilter, type MultiSelectOpcion } from '../MultiSelectFilter'
import { Modal } from '../Modal'
import { FileUpload } from '../FileUpload'
import { BalanceCuadrillas } from './BalanceCuadrillas'
import { RadarMasivos } from './RadarMasivos'
import { RadarFlotantes } from './RadarFlotantes'
import { ControlCalidad } from './ControlCalidad'
import { RadiografiaTecnico } from './RadiografiaTecnico'

/** Id sintético que representa las órdenes sin técnico asignado. */
const SIN_ASIGNAR_ID = 'sin_asignar'

interface AnaliticaDashboardProps {
  servicios: Servicio[]
  tecnicos: Tecnico[]
  ciudadesActivas: Record<string, string[]>
  procesando: boolean
  onProcesarReporte: (file: File, ciudadFiltro: string | undefined) => Promise<boolean>
  notificar: (mensaje: string, variant?: ToastVariant) => void
  resultadoCierres: ResultadoCierres | null
}

/**
 * Módulo de Analítica Distrital: inteligencia operativa en tiempo real a partir
 * de `serviciosActivos` y `tecnicos`, sin consultar la base de datos.
 */
export function AnaliticaDashboard({
  servicios,
  tecnicos,
  ciudadesActivas,
  procesando,
  onProcesarReporte,
  notificar,
  resultadoCierres,
}: AnaliticaDashboardProps) {
  const [sucursalesSeleccionadas, setSucursalesSeleccionadas] = useState<string[]>([])
  // Selección múltiple de técnicos; puede incluir 'sin_asignar' como pseudo-técnico.
  const [tecnicosSeleccionadosIds, setTecnicosSeleccionadosIds] = useState<string[]>([])
  // Ciudad de las órdenes sin asignar (solo aplica cuando 'sin_asignar' está seleccionado).
  const [sinAsignarCiudad, setSinAsignarCiudad] = useState<string | null>(null)
  // Ciudad dueña de la selección actual: confina qué checkboxes pueden marcarse.
  // OJO: NO filtra los servicios de la radiografía; un técnico multiciudad conserva
  // todas sus órdenes en todas sus ciudades.
  const [ciudadSeleccionada, setCiudadSeleccionada] = useState<string | null>(null)
  const [barrioExpandido, setBarrioExpandido] = useState<string | null>(null)
  const [modalCargaAbierto, setModalCargaAbierto] = useState(false)

  // Invariante #2: todo responde al universo de las 28 sucursales autorizadas.
  const serviciosAutorizados = useMemo(
    () => servicios.filter((s) => esSucursalAutorizada(s.ciudad)),
    [servicios],
  )

  // Opciones del multi-select de sucursales (canónicas, con conteo de órdenes).
  const opcionesSucursales = useMemo<MultiSelectOpcion[]>(() => {
    const conteo = new Map<string, number>()
    for (const s of serviciosAutorizados) {
      const canonica = ciudadCanonica(s.ciudad)
      if (!canonica) continue
      conteo.set(canonica, (conteo.get(canonica) ?? 0) + 1)
    }
    return [...conteo.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([ciudad, cantidad]) => ({ id: ciudad, label: ciudad, count: cantidad }))
  }, [serviciosAutorizados])

  const serviciosFiltrados = useMemo(() => {
    if (sucursalesSeleccionadas.length === 0) return serviciosAutorizados
    return serviciosAutorizados.filter((s) =>
      sucursalesSeleccionadas.includes(ciudadCanonica(s.ciudad)),
    )
  }, [serviciosAutorizados, sucursalesSeleccionadas])

  // Resuelve los IDs seleccionados a objetos `Tecnico` (sintético para 'sin_asignar').
  const tecnicosSeleccionados = useMemo<Tecnico[]>(() => {
    const resultado: Tecnico[] = []
    for (const id of tecnicosSeleccionadosIds) {
      if (id === SIN_ASIGNAR_ID) {
        resultado.push({ id: SIN_ASIGNAR_ID, nombre: 'Sin Asignar', activo: true })
        continue
      }
      const t = tecnicos.find((x) => x.id === id)
      if (t) resultado.push(t)
    }
    return resultado
  }, [tecnicos, tecnicosSeleccionadosIds])

  // Órdenes de TODOS los técnicos seleccionados (unión de sus despachos).
  const serviciosSeleccionados = useMemo(() => {
    if (tecnicosSeleccionadosIds.length === 0) return []
    const set = new Set(tecnicosSeleccionadosIds)
    const incluyeSinAsignar = set.has(SIN_ASIGNAR_ID)
    return serviciosFiltrados.filter((s) => {
      if (s.tecnico_id === null) {
        if (!incluyeSinAsignar) return false
        return !sinAsignarCiudad || ciudadCanonica(s.ciudad) === sinAsignarCiudad
      }
      return set.has(s.tecnico_id)
    })
  }, [serviciosFiltrados, tecnicosSeleccionadosIds, sinAsignarCiudad])

  // Añade o remueve un técnico de la selección múltiple.
  // El confinamiento por ciudad SOLO altera qué checkboxes quedan marcados:
  // los servicios del técnico seleccionado no se filtran por ciudad.
  const toggleTecnico = (id: string, ciudad: string) => {
    setBarrioExpandido(null)
    if (id === SIN_ASIGNAR_ID) setSinAsignarCiudad(null)
    setTecnicosSeleccionadosIds((prev) => {
      const cambiaCiudad = ciudadSeleccionada !== null && ciudadSeleccionada !== ciudad
      const base = cambiaCiudad ? [] : prev
      const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id]
      setCiudadSeleccionada(next.length === 0 ? null : ciudad)
      return next
    })
  }

  // Selecciona/deselecciona una patrulla junto con todos sus operadores.
  const togglePatrulla = (patrullaId: string, ciudad: string) => {
    setBarrioExpandido(null)
    const operadoresIds = tecnicos
      .filter((t) => t.patrulla_id === patrullaId)
      .map((t) => t.id)
    setTecnicosSeleccionadosIds((prev) => {
      const cambiaCiudad = ciudadSeleccionada !== null && ciudadSeleccionada !== ciudad
      const base = cambiaCiudad ? [] : prev
      const algunoSeleccionado = operadoresIds.some((id) => base.includes(id))
      let next: string[]
      if (algunoSeleccionado) {
        const aExcluir = new Set([patrullaId, ...operadoresIds])
        next = base.filter((id) => !aExcluir.has(id))
      } else {
        next = [...new Set([...base, patrullaId, ...operadoresIds])]
      }
      setCiudadSeleccionada(next.length === 0 ? null : ciudad)
      return next
    })
  }

  // Sin Asignar de una sucursal específica (selección aislada con alcance de ciudad).
  const seleccionarSinAsignarCiudad = (ciudad: string) => {
    setBarrioExpandido(null)
    setTecnicosSeleccionadosIds([SIN_ASIGNAR_ID])
    setSinAsignarCiudad(ciudad)
    setCiudadSeleccionada(ciudad)
  }

  // Selecciona todos los técnicos con órdenes en una ciudad (sustituye la selección).
  const seleccionarTodosDeCiudad = (ciudad: string) => {
    setBarrioExpandido(null)
    const ids = new Set(
      serviciosFiltrados
        .filter((s) => s.tecnico_id && ciudadCanonica(s.ciudad) === ciudad)
        .map((s) => s.tecnico_id as string),
    )
    setTecnicosSeleccionadosIds([...ids])
    setCiudadSeleccionada(ids.size === 0 ? null : ciudad)
  }

  // Quita los técnicos con órdenes en una ciudad.
  const deseleccionarTodosDeCiudad = (ciudad: string) => {
    const ids = new Set(
      serviciosFiltrados
        .filter((s) => s.tecnico_id && ciudadCanonica(s.ciudad) === ciudad)
        .map((s) => s.tecnico_id as string),
    )
    setTecnicosSeleccionadosIds((prev) => {
      const next = prev.filter((id) => !ids.has(id))
      if (next.length === 0) setCiudadSeleccionada(null)
      return next
    })
  }

  // Resetea la selección (vuelve a la vista global).
  const limpiarSeleccionTecnicos = () => {
    setBarrioExpandido(null)
    setSinAsignarCiudad(null)
    setCiudadSeleccionada(null)
    setTecnicosSeleccionadosIds([])
  }

  const toggleBarrio = (clave: string) => {
    setBarrioExpandido((prev) => (prev === clave ? null : clave))
  }

  return (
    <section className="space-y-4">
      {/* Barra superior */}
      <div className="flex flex-col gap-3 rounded-2xl bg-slate-900 p-4 text-white shadow-lg ring-1 ring-white/10 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
            <BarChart3 className="size-5 text-emerald-300" />
          </span>
          <div>
            <h2 className="text-base font-bold tracking-tight">
              Inteligencia Operativa y Control Distrital
            </h2>
            <p className="text-xs text-slate-400">Analítica en tiempo real del despacho activo</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Multi-select de sucursales con buscador */}
          <div className="w-60">
            <MultiSelectFilter
              label="Sucursales"
              opciones={opcionesSucursales}
              seleccionados={sucursalesSeleccionadas}
              onSeleccionChange={setSucursalesSeleccionadas}
              placeholderTodos="Todas las sucursales"
              icono={MapPin}
            />
          </div>

          {/* Carga rápida del reporte diario */}
          <button
            type="button"
            onClick={() => setModalCargaAbierto(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white"
          >
            <Upload className="size-3.5" /> Cargar Reporte Sigma
          </button>

          {/* Badge resumen */}
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-500/30">
            Total {serviciosFiltrados.length} órdenes analizadas
          </span>
        </div>
      </div>

      {/* Drill-down: técnicos (izquierda, 4/12) → radiografía / radar global (derecha, 8/12) */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <BalanceCuadrillas
            servicios={serviciosFiltrados}
            tecnicos={tecnicos}
            ciudadesActivas={ciudadesActivas}
            tecnicosSeleccionadosIds={tecnicosSeleccionadosIds}
            ciudadSeleccionada={ciudadSeleccionada}
            sinAsignarCiudadSeleccionada={sinAsignarCiudad}
            onToggleTecnico={toggleTecnico}
            onTogglePatrulla={togglePatrulla}
            onSeleccionarSinAsignarCiudad={seleccionarSinAsignarCiudad}
            onSeleccionarTodosDeCiudad={seleccionarTodosDeCiudad}
            onDeseleccionarTodosDeCiudad={deseleccionarTodosDeCiudad}
            onLimpiarSeleccion={limpiarSeleccionTecnicos}
          />
        </div>

        <div className="lg:col-span-8">
          {tecnicosSeleccionados.length > 0 ? (
            <RadiografiaTecnico
              key={tecnicosSeleccionadosIds.join(',')}
              tecnicos={tecnicosSeleccionados}
              servicios={serviciosSeleccionados}
              barrioExpandido={barrioExpandido}
              onToggleBarrio={toggleBarrio}
              onVerVistaGlobal={limpiarSeleccionTecnicos}
              notificar={notificar}
            />
          ) : (
            <RadarMasivos servicios={serviciosFiltrados} />
          )}
        </div>
      </div>

      {/* Cards complementarias */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RadarFlotantes servicios={serviciosFiltrados} />
        <ControlCalidad
          servicios={serviciosFiltrados}
          tecnicos={tecnicos}
          resultadoCierres={resultadoCierres}
        />
      </div>

      {/* Modal de carga rápida del reporte diario */}
      <Modal
        abierto={modalCargaAbierto}
        onCerrar={() => setModalCargaAbierto(false)}
        titulo="Cargar Reporte Sigma"
        descripcion="Procesa el nuevo Excel diario y actualiza el despacho en vivo."
        anchoMaximo="max-w-lg"
      >
        <FileUpload
          procesando={procesando}
          onProcesar={onProcesarReporte}
          onExito={() => setModalCargaAbierto(false)}
        />
      </Modal>
    </section>
  )
}
