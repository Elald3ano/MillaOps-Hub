import { useMemo, useState } from 'react'
import { BarChart3, MapPin } from 'lucide-react'
import type { Servicio, Tecnico } from '../../types'
import { ciudadCanonica, esSucursalAutorizada } from '../../lib/zonasPermitidas'
import { MultiSelectFilter, type MultiSelectOpcion } from '../MultiSelectFilter'
import { BalanceCuadrillas } from './BalanceCuadrillas'
import { RadarMasivos } from './RadarMasivos'
import { RadarFlotantes } from './RadarFlotantes'
import { ControlCalidad } from './ControlCalidad'
import { RadiografiaTecnico } from './RadiografiaTecnico'

interface AnaliticaDashboardProps {
  servicios: Servicio[]
  tecnicos: Tecnico[]
  ciudadesActivas: Record<string, string[]>
}

/**
 * Módulo de Analítica Distrital: inteligencia operativa en tiempo real a partir
 * de `serviciosActivos` y `tecnicos`, sin consultar la base de datos.
 */
export function AnaliticaDashboard({
  servicios,
  tecnicos,
  ciudadesActivas,
}: AnaliticaDashboardProps) {
  const [sucursalesSeleccionadas, setSucursalesSeleccionadas] = useState<string[]>([])
  const [tecnicoSeleccionadoId, setTecnicoSeleccionadoId] = useState<string | null>(null)
  const [barrioExpandido, setBarrioExpandido] = useState<string | null>(null)

  // Invariante #2: todo responde al universo de las 27 sucursales autorizadas.
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

  const tecnicoSeleccionado = useMemo(
    () => tecnicos.find((t) => t.id === tecnicoSeleccionadoId) ?? null,
    [tecnicos, tecnicoSeleccionadoId],
  )

  const serviciosDelTecnico = useMemo(() => {
    if (!tecnicoSeleccionadoId) return []
    return serviciosFiltrados.filter((s) => s.tecnico_id === tecnicoSeleccionadoId)
  }, [serviciosFiltrados, tecnicoSeleccionadoId])

  // Conmuta la selección de técnico (clic de nuevo = deseleccionar).
  const toggleTecnico = (id: string) => {
    setBarrioExpandido(null)
    setTecnicoSeleccionadoId((prev) => (prev === id ? null : id))
  }

  const verVistaGlobal = () => {
    setTecnicoSeleccionadoId(null)
    setBarrioExpandido(null)
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

          {/* Badge resumen */}
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-500/30">
            Total {serviciosFiltrados.length} órdenes analizadas
          </span>
        </div>
      </div>

      {/* Drill-down: técnicos (izquierda) → radiografía / radar global (derecha) */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <BalanceCuadrillas
          servicios={serviciosFiltrados}
          tecnicos={tecnicos}
          ciudadesActivas={ciudadesActivas}
          tecnicoSeleccionadoId={tecnicoSeleccionadoId}
          onToggleTecnico={toggleTecnico}
        />

        {tecnicoSeleccionado ? (
          <RadiografiaTecnico
            key={tecnicoSeleccionado.id}
            tecnico={tecnicoSeleccionado}
            servicios={serviciosDelTecnico}
            barrioExpandido={barrioExpandido}
            onToggleBarrio={toggleBarrio}
            onVerVistaGlobal={verVistaGlobal}
          />
        ) : (
          <RadarMasivos servicios={serviciosFiltrados} />
        )}
      </div>

      {/* Cards complementarias */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RadarFlotantes servicios={serviciosFiltrados} />
        <ControlCalidad servicios={serviciosFiltrados} />
      </div>
    </section>
  )
}
