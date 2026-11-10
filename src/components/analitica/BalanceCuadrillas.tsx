import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Bike,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  MapPin,
  Truck,
  Users,
} from 'lucide-react'
import type { Servicio, Tecnico } from '../../types'
import { esServicioLiviano } from '../../lib/tiposServicio'
import { limpiarTexto } from '../../lib/normalizer'
import { ciudadCanonica } from '../../lib/zonasPermitidas'
import { cn } from '../../lib/utils'
import { BarraProgreso, TarjetaAnalitica } from './TarjetaAnalitica'

// Referencia de saturación: a partir de 30 órdenes la barra llega al tope.
const REF_SATURACION = 30

type Carga = 'normal' | 'alta' | 'saturado'
type ModoVista = 'sucursales' | 'tecnicos'

interface ResumenTecnico {
  tecnico: Tecnico
  total: number
  livianos: number
  pesados: number
  carga: Carga
  ciudadesTexto: string
  /** Ciudad con más órdenes del técnico (clave canónica); confina la selección. */
  ciudadPrincipal: string
  /** Conteo de órdenes por ciudad canónica (usado para agregar patrullas). */
  conteoCiudades: Map<string, number>
}

interface TecnicoSinOrdenes {
  tecnico: Tecnico
  ciudadesTexto: string
}

/** Unidad rankeable del ranking: patrulla (con sus operadores) u operador suelto. */
type UnidadRanking =
  | {
      tipo: 'patrulla'
      clave: string
      patrulla: Tecnico
      operadores: ResumenTecnico[]
      total: number
      livianos: number
      pesados: number
      carga: Carga
      ciudadesTexto: string
      ciudadPrincipal: string
    }
  | {
      tipo: 'operador'
      clave: string
      resumen: ResumenTecnico
      total: number
      carga: Carga
    }

interface TecnicoEnCiudad {
  tecnicoId: string
  nombre: string
  total: number
  livianos: number
  pesados: number
  carga: Carga
  /** Nombre de la patrulla cuando el operador queda como independiente en esta ciudad. */
  patrullaNombre?: string
}

interface PatrullaEnCiudad {
  patrulla: Tecnico
  operadores: TecnicoEnCiudad[]
  total: number
  livianos: number
  pesados: number
  carga: Carga
}

interface ResumenCiudad {
  clave: string
  ciudad: string
  total: number
  sinAsignar: number
  tecnicos: TecnicoEnCiudad[]
  patrullas: PatrullaEnCiudad[]
  independientes: TecnicoEnCiudad[]
}

function clasificarCarga(total: number): Carga {
  if (total > 25) return 'saturado'
  if (total >= 15) return 'alta'
  return 'normal'
}

const CARGA_CONFIG: Record<Carga, { barra: string; texto: string }> = {
  normal: { barra: 'bg-emerald-500', texto: 'text-emerald-300' },
  alta: { barra: 'bg-yellow-400', texto: 'text-yellow-300' },
  saturado: { barra: 'bg-red-500', texto: 'text-red-300' },
}

/** Etiqueta usada cuando una fila no expone una ciudad real. */
const SIN_CIUDAD = 'Sin ciudad'

/**
 * Ciudades únicas legibles: priman las de las órdenes asignadas; si no hay,
 * se usan las asignadas en la regla territorial (`tecnicos_ciudades`).
 */
function formatearCiudades(deOrdenes: Set<string>, asignadas: string[] | undefined): string {
  const origen = deOrdenes.size > 0 ? [...deOrdenes] : (asignadas ?? [])
  const unicas = [...new Set(origen.map((c) => c.trim()).filter(Boolean))]
  return unicas.sort((a, b) => a.localeCompare(b)).join(', ')
}

/** Ciudad con más órdenes para un técnico (clave canónica); fallback sin ciudad. */
function ciudadPrincipalDe(conteo: Map<string, number>): string {
  let principal = ''
  let maximo = -1
  for (const [ciudad, cantidad] of conteo) {
    if (cantidad > maximo) {
      principal = ciudad
      maximo = cantidad
    }
  }
  return principal || SIN_CIUDAD
}

/** Fila seleccionable de un técnico dentro de una ciudad. */
function FilaTecnico({
  item,
  seleccionado,
  onToggle,
}: {
  item: TecnicoEnCiudad
  seleccionado: boolean
  onToggle: () => void
}) {
  const cfg = CARGA_CONFIG[item.carga]
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={seleccionado}
      className={cn(
        'w-full rounded-lg px-2.5 py-2 text-left transition-all',
        seleccionado
          ? 'bg-cyan-500/10 ring-2 ring-cyan-400/70'
          : 'cursor-pointer hover:bg-slate-800/60',
      )}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              'flex size-4 shrink-0 items-center justify-center rounded border transition',
              seleccionado ? 'border-cyan-400 bg-cyan-600' : 'border-slate-600 bg-slate-950',
            )}
          >
            {seleccionado && <Check className="size-3 text-white" strokeWidth={3} />}
          </span>
          <span className="truncate text-sm font-medium text-slate-200">{item.nombre}</span>
          {item.patrullaNombre && (
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-400 ring-1 ring-white/10"
              title={`Patrulla: ${item.patrullaNombre}`}
            >
              <Truck className="size-2.5" /> {item.patrullaNombre}
            </span>
          )}
          {item.carga === 'saturado' && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-semibold text-red-300 ring-1 ring-red-500/30">
              <AlertTriangle className="size-3" /> Sobrecargado
            </span>
          )}
        </div>
        <span className={cn('text-sm font-bold tabular-nums', cfg.texto)}>{item.total}</span>
      </div>
      <BarraProgreso valor={item.total / REF_SATURACION} color={cfg.barra} />
      <p className="mt-1 text-[11px] text-slate-400">
        {item.livianos} liviano · {item.pesados} pesado
      </p>
    </button>
  )
}

interface BalanceCuadrillasProps {
  servicios: Servicio[]
  tecnicos: Tecnico[]
  ciudadesActivas: Record<string, string[]>
  tecnicosSeleccionadosIds: string[]
  /** Ciudad dueña de la selección actual; `null` cuando no hay selección. */
  ciudadSeleccionada: string | null
  sinAsignarCiudadSeleccionada: string | null
  onToggleTecnico: (id: string, ciudad: string) => void
  onTogglePatrulla: (id: string, ciudad: string) => void
  onSeleccionarSinAsignarCiudad: (ciudad: string) => void
  onSeleccionarTodosDeCiudad: (ciudad: string) => void
  onDeseleccionarTodosDeCiudad: (ciudad: string) => void
  onLimpiarSeleccion: () => void
}

/** Balance y saturación de cuadrillas dentro del ámbito seleccionado. */
export function BalanceCuadrillas({
  servicios,
  tecnicos,
  ciudadesActivas,
  tecnicosSeleccionadosIds,
  ciudadSeleccionada,
  sinAsignarCiudadSeleccionada,
  onToggleTecnico,
  onTogglePatrulla,
  onSeleccionarSinAsignarCiudad,
  onSeleccionarTodosDeCiudad,
  onDeseleccionarTodosDeCiudad,
  onLimpiarSeleccion,
}: BalanceCuadrillasProps) {
  const [modoVista, setModoVista] = useState<ModoVista>('sucursales')
  const [direccionOrden, setDireccionOrden] = useState<'desc' | 'asc'>('desc')

  const tecnicosPorId = useMemo(
    () => new Map(tecnicos.map((t) => [t.id, t] as const)),
    [tecnicos],
  )

  // Órdenes sin técnico asignado: siempre auditables desde el ranking.
  const totalSinAsignar = useMemo(
    () => servicios.filter((s) => s.tecnico_id === null).length,
    [servicios],
  )

  // Agrupación jerárquica por ciudad (vista "sucursales").
  const resumenCiudades = useMemo<ResumenCiudad[]>(() => {
    const factor = direccionOrden === 'asc' ? 1 : -1
    const porCiudad = new Map<
      string,
      {
        ciudad: string
        total: number
        sinAsignar: number
        porTecnico: Map<string, TecnicoEnCiudad>
      }
    >()

    for (const s of servicios) {
      const canonica = ciudadCanonica(s.ciudad) || s.ciudad
      const clave = limpiarTexto(canonica)
      if (!clave) continue
      let ciudad = porCiudad.get(clave)
      if (!ciudad) {
        ciudad = { ciudad: canonica, total: 0, sinAsignar: 0, porTecnico: new Map() }
        porCiudad.set(clave, ciudad)
      }
      ciudad.total += 1
      if (s.tecnico_id) {
        const tecnico = tecnicosPorId.get(s.tecnico_id)
        const prev = ciudad.porTecnico.get(s.tecnico_id) ?? {
          tecnicoId: s.tecnico_id,
          nombre: tecnico?.nombre ?? 'Técnico',
          total: 0,
          livianos: 0,
          pesados: 0,
          carga: 'normal' as Carga,
        }
        prev.total += 1
        if (esServicioLiviano(s.tipo_servicio)) prev.livianos += 1
        else prev.pesados += 1
        ciudad.porTecnico.set(s.tecnico_id, prev)
      } else {
        ciudad.sinAsignar += 1
      }
    }

    return [...porCiudad.values()]
      .map((c) => {
        const tecnicosCiudad = [...c.porTecnico.values()]
          .map((t) => ({ ...t, carga: clasificarCarga(t.total) }))
          .sort((a, b) => (a.total - b.total) * factor)

        const operadoresDePatrulla = new Map<string, TecnicoEnCiudad[]>()
        const ordenesPropiasDePatrulla = new Map<string, TecnicoEnCiudad>()
        const patrullasConPresencia = new Set<string>()
        const independientes: TecnicoEnCiudad[] = []

        for (const item of tecnicosCiudad) {
          const tecnico = tecnicosPorId.get(item.tecnicoId)
          if (tecnico?.rol === 'patrulla') {
            // Una patrulla puede aparecer con órdenes propias (caso excepcional).
            // Se registran para que el total de la fila reconcilie con la ciudad.
            ordenesPropiasDePatrulla.set(tecnico.id, item)
            patrullasConPresencia.add(tecnico.id)
            continue
          }

          const patrullaId = tecnico?.patrulla_id ?? null
          if (patrullaId) {
            const patrulla = tecnicosPorId.get(patrullaId)
            if (patrulla?.rol === 'patrulla') {
              const lista = operadoresDePatrulla.get(patrullaId) ?? []
              lista.push(item)
              operadoresDePatrulla.set(patrullaId, lista)
              patrullasConPresencia.add(patrullaId)
              continue
            }
            // Patrulla inexistente o no válida: se muestra como independiente.
            independientes.push({
              ...item,
              patrullaNombre: patrulla?.nombre ?? `Patrulla ${patrullaId}`,
            })
            continue
          }

          // Sin patrulla o sin rol (null): operador independiente.
          independientes.push(item)
        }

        const patrullas: PatrullaEnCiudad[] = [...patrullasConPresencia]
          .map((patrullaId) => {
            const patrulla = tecnicosPorId.get(patrullaId)
            if (!patrulla) return null
            const operadores = (operadoresDePatrulla.get(patrullaId) ?? []).sort(
              (a, b) => (a.total - b.total) * factor,
            )
            // Órdenes propias de la patrulla (si las tuviera) también suman.
            const propias = ordenesPropiasDePatrulla.get(patrullaId)
            const total = operadores.reduce((acc, o) => acc + o.total, 0) + (propias?.total ?? 0)
            const livianos =
              operadores.reduce((acc, o) => acc + o.livianos, 0) + (propias?.livianos ?? 0)
            const pesados =
              operadores.reduce((acc, o) => acc + o.pesados, 0) + (propias?.pesados ?? 0)
            return {
              patrulla,
              operadores,
              total,
              livianos,
              pesados,
              carga: clasificarCarga(total),
            }
          })
          .filter((p): p is PatrullaEnCiudad => p !== null)
          .sort((a, b) => (a.total - b.total) * factor)

        independientes.sort((a, b) => (a.total - b.total) * factor)

        return {
          clave: limpiarTexto(c.ciudad),
          ciudad: c.ciudad,
          total: c.total,
          sinAsignar: c.sinAsignar,
          tecnicos: tecnicosCiudad,
          patrullas,
          independientes,
        }
      })
      .sort((a, b) => (a.total - b.total) * factor)
  }, [servicios, tecnicosPorId, direccionOrden])

  // Ranking jerárquico: patrullas (con sus operadores) y operadores sueltos.
  const { unidades, sinOrdenes } = useMemo(() => {
    const factor = direccionOrden === 'asc' ? 1 : -1
    const acumulado = new Map<
      string,
      {
        tecnico: Tecnico
        total: number
        livianos: number
        pesados: number
        ciudades: Set<string>
        conteoCiudades: Map<string, number>
      }
    >()

    for (const s of servicios) {
      if (!s.tecnico_id) continue
      const tecnico = tecnicosPorId.get(s.tecnico_id)
      if (!tecnico) continue
      const prev = acumulado.get(s.tecnico_id) ?? {
        tecnico,
        total: 0,
        livianos: 0,
        pesados: 0,
        ciudades: new Set<string>(),
        conteoCiudades: new Map<string, number>(),
      }
      prev.total += 1
      if (esServicioLiviano(s.tipo_servicio)) prev.livianos += 1
      else prev.pesados += 1
      if (s.ciudad) {
        prev.ciudades.add(s.ciudad)
        const canonica = ciudadCanonica(s.ciudad) || s.ciudad
        prev.conteoCiudades.set(canonica, (prev.conteoCiudades.get(canonica) ?? 0) + 1)
      }
      acumulado.set(s.tecnico_id, prev)
    }

    const porTecnico = new Map<string, ResumenTecnico>(
      [...acumulado.values()].map((r) => [
        r.tecnico.id,
        {
          tecnico: r.tecnico,
          total: r.total,
          livianos: r.livianos,
          pesados: r.pesados,
          carga: clasificarCarga(r.total),
          ciudadesTexto: formatearCiudades(r.ciudades, ciudadesActivas[r.tecnico.id]),
          ciudadPrincipal: ciudadPrincipalDe(r.conteoCiudades),
          conteoCiudades: r.conteoCiudades,
        },
      ]),
    )

    // --- Jerarquía Patrulla → Operadores (mismas reglas que la vista por sucursal) ---
    // Los operadores entran en la lista de SU patrulla aunque no tengan órdenes,
    // para que el desglose no esconda huecos de cobertura.
    const operadoresPorPatrulla = new Map<string, ResumenTecnico[]>()
    // Toda patrulla válida se registra, tenga o no operadores: así conserva su
    // identidad 🚛 y sus órdenes propias no caen en la lista de sueltos.
    const patrullasValidas = new Set<string>()
    for (const t of tecnicos) {
      const patrullaId = t.patrulla_id
      if (!patrullaId) continue
      const patrulla = tecnicosPorId.get(patrullaId)
      if (patrulla?.rol !== 'patrulla') continue
      patrullasValidas.add(patrullaId)
      const lista = operadoresPorPatrulla.get(patrullaId) ?? []
      const resumen = porTecnico.get(t.id) ?? {
        tecnico: t,
        total: 0,
        livianos: 0,
        pesados: 0,
        carga: 'normal' as Carga,
        ciudadesTexto: formatearCiudades(new Set<string>(), ciudadesActivas[t.id]),
        ciudadPrincipal: SIN_CIUDAD,
        conteoCiudades: new Map<string, number>(),
      }
      lista.push({ ...resumen, carga: clasificarCarga(resumen.total) })
      operadoresPorPatrulla.set(patrullaId, lista)
    }
    // Patrullas sin operadores pero con órdenes propias (P2).
    for (const t of tecnicos) {
      if (t.rol !== 'patrulla') continue
      if (!porTecnico.has(t.id)) continue
      patrullasValidas.add(t.id)
    }

    // Carga efectiva por patrulla: los despachos de sus operadores cuentan una
    // sola vez, aunque el operador aparezca como fila propia con rol 'patrulla'.
    const efectivaPorPatrulla = new Map<string, ResumenTecnico>()
    for (const patrullaId of patrullasValidas) {
      const operadores = operadoresPorPatrulla.get(patrullaId) ?? []
      const propio = porTecnico.get(patrullaId)
      const ciudades = new Map<string, number>()
      const contarCiudades = (resumen: ResumenTecnico | undefined) => {
        if (!resumen) return
        for (const [ciudad, cantidad] of resumen.conteoCiudades) {
          ciudades.set(ciudad, (ciudades.get(ciudad) ?? 0) + cantidad)
        }
      }
      // Órdenes propias de la patrulla (P2, asignación directa del carro dueño de
      // barrio) se suman SIEMPRE a las de sus operadores (P1, flotantes), igual que
      // en la vista por sucursal. No hay doble conteo: cada servicio tiene un único
      // `tecnico_id`.
      if (propio) contarCiudades(propio)
      for (const o of operadores) contarCiudades(o)
      const sumaOperadores = operadores.reduce((acc, o) => acc + o.total, 0)
      const total = sumaOperadores + (propio?.total ?? 0)
      const livianos =
        operadores.reduce((acc, o) => acc + o.livianos, 0) + (propio?.livianos ?? 0)
      const pesados = operadores.reduce((acc, o) => acc + o.pesados, 0) + (propio?.pesados ?? 0)
      const patrulla = tecnicosPorId.get(patrullaId)
      if (!patrulla) continue
      efectivaPorPatrulla.set(patrullaId, {
        tecnico: patrulla,
        total,
        livianos,
        pesados,
        carga: clasificarCarga(total),
        ciudadesTexto: [...ciudades.keys()].sort((a, b) => a.localeCompare(b)).join(', '),
        ciudadPrincipal: ciudadPrincipalDe(ciudades),
        conteoCiudades: ciudades,
      })
    }

    const unidades: UnidadRanking[] = []
    const operadoresConsumidos = new Set<string>()

    for (const [patrullaId, efectiva] of efectivaPorPatrulla) {
      const operadores = [...(operadoresPorPatrulla.get(patrullaId) ?? [])].sort(
        (a, b) => (a.total - b.total) * factor,
      )
      for (const o of operadores) operadoresConsumidos.add(o.tecnico.id)
      operadoresConsumidos.add(patrullaId)
      unidades.push({
        tipo: 'patrulla',
        clave: `patrulla:${patrullaId}`,
        patrulla: efectiva.tecnico,
        operadores,
        total: efectiva.total,
        livianos: efectiva.livianos,
        pesados: efectiva.pesados,
        carga: efectiva.carga,
        ciudadesTexto: efectiva.ciudadesTexto,
        ciudadPrincipal: efectiva.ciudadPrincipal,
      })
    }

    // Todo técnico con carga que no pertenece a una patrulla válida compite solo.
    for (const resumen of porTecnico.values()) {
      if (operadoresConsumidos.has(resumen.tecnico.id)) continue
      unidades.push({
        tipo: 'operador',
        clave: `operador:${resumen.tecnico.id}`,
        resumen,
        total: resumen.total,
        carga: resumen.carga,
      })
    }

    unidades.sort((a, b) => (a.total - b.total) * factor)

    const asignadosIds = new Set(acumulado.keys())
    const sinOrdenes: TecnicoSinOrdenes[] = tecnicos
      .filter((t) => t.activo && !asignadosIds.has(t.id))
      .map((t) => ({
        tecnico: t,
        ciudadesTexto: formatearCiudades(new Set<string>(), ciudadesActivas[t.id]),
      }))

    return { unidades, sinOrdenes }
  }, [servicios, tecnicos, ciudadesActivas, tecnicosPorId, direccionOrden])

  /** Técnicos con carga: operadores sueltos + operadores dentro de patrullas. */
  const tecnicosConCarga = useMemo(() => {
    let total = 0
    for (const u of unidades) {
      total += u.tipo === 'patrulla' ? u.operadores.length : 1
    }
    return total
  }, [unidades])

  // Todas las ciudades comienzan colapsadas por defecto.
  const [sucursalExpandida, setSucursalExpandida] = useState<string | null>(null)
  // Patrullas desplegadas (por id), independientes por ciudad.
  const [patrullasExpandidas, setPatrullasExpandidas] = useState<Set<string>>(new Set())

  function toggleSucursal(clave: string) {
    setSucursalExpandida((prev) => (prev === clave ? null : clave))
  }

  function togglePatrullaExpandida(id: string) {
    setPatrullasExpandidas((prev) => {
      const siguiente = new Set(prev)
      if (siguiente.has(id)) siguiente.delete(id)
      else siguiente.add(id)
      return siguiente
    })
  }

  return (
    <TarjetaAnalitica
      icon={Users}
      titulo="Balance y Saturación de Cuadrillas"
      subtitulo={`${resumenCiudades.length} sucursales · ${tecnicosConCarga} técnicos`}
      accion={
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {tecnicosSeleccionadosIds.length > 0 && (
            <span className="inline-flex items-center gap-2 rounded-lg bg-cyan-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-200 ring-1 ring-cyan-500/30">
              {ciudadSeleccionada ?? SIN_CIUDAD}: {tecnicosSeleccionadosIds.length}{' '}
              {tecnicosSeleccionadosIds.length === 1 ? 'técnico' : 'técnicos'}
              <button
                type="button"
                onClick={onLimpiarSeleccion}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-cyan-200/80 transition hover:bg-cyan-500/20 hover:text-white"
              >
                ✕ Limpiar
              </button>
            </span>
          )}
          <div className="flex gap-1 rounded-lg bg-white/5 p-1 ring-1 ring-white/10">
            <button
              type="button"
              onClick={() => setModoVista('sucursales')}
              aria-pressed={modoVista === 'sucursales'}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition',
                modoVista === 'sucursales'
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-slate-200',
              )}
            >
              <Building2 className="size-3.5" /> Por Sucursal
            </button>
            <button
              type="button"
              onClick={() => setModoVista('tecnicos')}
              aria-pressed={modoVista === 'tecnicos'}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition',
                modoVista === 'tecnicos'
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-slate-200',
              )}
            >
              <Users className="size-3.5" /> Ranking Técnicos
            </button>
          </div>

          {/* Orden por carga */}
          <button
            type="button"
            onClick={() => setDireccionOrden((d) => (d === 'desc' ? 'asc' : 'desc'))}
            aria-pressed={direccionOrden === 'asc'}
            title={
              direccionOrden === 'desc'
                ? 'Ordenar de mayor a menor carga'
                : 'Ordenar de menor a mayor carga'
            }
            className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs font-medium text-slate-300 ring-1 ring-white/10 transition hover:bg-white/10 hover:text-white"
          >
            {direccionOrden === 'desc' ? (
              <ArrowDown className="size-3.5" />
            ) : (
              <ArrowUp className="size-3.5" />
            )}
            {direccionOrden === 'desc' ? 'Mayor carga' : 'Menor carga'}
          </button>
        </div>
      }
    >
      {modoVista === 'sucursales' ? (
        /* ---- Vista por sucursal (acordeón jerárquico) ---- */
        <div>
          {resumenCiudades.length === 0 ? (
            <p className="text-xs text-slate-400">Sin órdenes en el ámbito seleccionado.</p>
          ) : (
            <ul className="space-y-1.5">
              {resumenCiudades.map((c) => {
                const expandida = sucursalExpandida === c.clave
                return (
                  <li
                    key={c.clave}
                    className="overflow-hidden rounded-lg bg-white/5 ring-1 ring-white/10"
                  >
                    <button
                      type="button"
                      onClick={() => toggleSucursal(c.clave)}
                      aria-expanded={expandida}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition hover:bg-white/5"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        {expandida ? (
                          <ChevronDown className="size-3.5 shrink-0 text-slate-400" />
                        ) : (
                          <ChevronRight className="size-3.5 shrink-0 text-slate-400" />
                        )}
                        <Building2 className="size-3.5 shrink-0 text-cyan-300" />
                        <span className="truncate text-sm font-medium text-slate-100">
                          {c.ciudad}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold text-slate-200 ring-1 ring-white/15 tabular-nums">
                        {c.total}
                      </span>
                    </button>

                    {expandida && (
                      <div className="border-t border-white/10 p-2">
                        {c.sinAsignar > 0 && (
                          <button
                            type="button"
                            onClick={() => onSeleccionarSinAsignarCiudad(c.ciudad)}
                            aria-pressed={
                              tecnicosSeleccionadosIds.includes('sin_asignar') &&
                              sinAsignarCiudadSeleccionada === c.ciudad
                            }
                            className={cn(
                              'mb-2 flex w-full cursor-pointer items-center justify-between rounded-lg border p-2.5 text-left transition-all',
                              tecnicosSeleccionadosIds.includes('sin_asignar') &&
                                sinAsignarCiudadSeleccionada === c.ciudad
                                ? 'border-amber-500 bg-amber-950/40'
                                : 'border-amber-800/60 bg-amber-950/30 hover:bg-amber-950/50',
                            )}
                          >
                            <span className="flex items-center gap-2 text-xs font-semibold text-amber-300">
                              <AlertTriangle className="size-4 text-amber-400" />
                              <span>Sin Asignar en {c.ciudad}</span>
                            </span>
                            <span className="rounded-full bg-amber-900/50 px-2 py-0.5 text-xs font-bold text-amber-400">
                              {c.sinAsignar}
                            </span>
                          </button>
                        )}
                        {c.tecnicos.length === 0 ? (
                          <p className="px-2.5 py-2 text-xs text-slate-500">
                            Sin técnicos con órdenes en esta ciudad.
                          </p>
                        ) : (
                          <>
                            <div className="mb-1.5 flex items-center justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => onSeleccionarTodosDeCiudad(c.ciudad)}
                                className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-2 py-1 text-[11px] font-medium text-slate-300 transition hover:bg-slate-800"
                              >
                                ☑️ Seleccionar todos en {c.ciudad}
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeseleccionarTodosDeCiudad(c.ciudad)}
                                className="rounded-md border border-slate-600 px-2 py-1 text-[11px] font-medium text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
                              >
                                Desmarcar
                              </button>
                            </div>

                            {/* Árbol jerárquico: patrullas → operadores, luego independientes. */}
                            {c.patrullas.length > 0 && (
                              <div className="mb-2">
                                <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
                                  <Truck className="size-3.5 text-cyan-300" /> Patrullas de Zona
                                </p>
                                <ul className="space-y-1">
                                  {c.patrullas.map((p) => {
                                    const cfg = CARGA_CONFIG[p.carga]
                                    const seleccionada = tecnicosSeleccionadosIds.includes(
                                      p.patrulla.id,
                                    )
                                    const desplegada = patrullasExpandidas.has(p.patrulla.id)
                                    return (
                                      <li key={p.patrulla.id}>
                                        <div
                                          className={cn(
                                            'rounded-lg border border-indigo-700/40 bg-indigo-950/30 px-2.5 py-2 transition-all',
                                            seleccionada && 'ring-2 ring-cyan-400/70',
                                          )}
                                        >
                                          <div className="flex items-center gap-2">
                                            <button
                                              type="button"
                                              onClick={() => onTogglePatrulla(p.patrulla.id, c.ciudad)}
                                              aria-pressed={seleccionada}
                                              aria-label={`Seleccionar patrulla ${p.patrulla.nombre}`}
                                              className="shrink-0 cursor-pointer rounded p-0.5 transition hover:bg-white/10"
                                            >
                                              <span
                                                className={cn(
                                                  'flex size-4 shrink-0 items-center justify-center rounded border transition',
                                                  seleccionada
                                                    ? 'border-cyan-400 bg-cyan-600'
                                                    : 'border-slate-600 bg-slate-950',
                                                )}
                                              >
                                                {seleccionada && (
                                                  <Check
                                                    className="size-3 text-white"
                                                    strokeWidth={3}
                                                  />
                                                )}
                                              </span>
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => togglePatrullaExpandida(p.patrulla.id)}
                                              aria-expanded={desplegada}
                                              className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-2 text-left"
                                            >
                                              <span className="flex min-w-0 items-center gap-1.5">
                                                {desplegada ? (
                                                  <ChevronDown className="size-3.5 shrink-0 text-slate-400" />
                                                ) : (
                                                  <ChevronRight className="size-3.5 shrink-0 text-slate-400" />
                                                )}
                                                <Truck className="size-3.5 shrink-0 text-cyan-300" />
                                                <span className="truncate text-sm font-medium text-slate-200">
                                                  {p.patrulla.nombre}
                                                </span>
                                                <span className="shrink-0 text-[10px] font-semibold tracking-wide text-indigo-300 uppercase">
                                                  🚛 Patrulla
                                                </span>
                                                <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-slate-300 ring-1 ring-white/15">
                                                  {p.operadores.length}{' '}
                                                  {p.operadores.length === 1
                                                    ? 'operador'
                                                    : 'operadores'}
                                                </span>
                                              </span>
                                              <span
                                                className={cn(
                                                  'shrink-0 text-sm font-bold tabular-nums',
                                                  cfg.texto,
                                                )}
                                              >
                                                {p.total}
                                              </span>
                                            </button>
                                          </div>
                                          <div className="mt-1 pl-6">
                                            <BarraProgreso
                                              valor={p.total / REF_SATURACION}
                                              color={cfg.barra}
                                            />
                                            <p className="mt-1 text-[11px] text-slate-400">
                                              {p.livianos} liviano · {p.pesados} pesado
                                            </p>
                                          </div>

                                          {desplegada && (
                                            <ul className="mt-1 ml-4 space-y-1 border-l border-white/10 pl-2">
                                              {p.operadores.length === 0 ? (
                                                <li className="px-2.5 py-1 text-[11px] text-slate-500">
                                                  Sin operadores con órdenes en esta ciudad.
                                                </li>
                                              ) : (
                                                p.operadores.map((t) => (
                                                  <li
                                                    key={t.tecnicoId}
                                                    className="rounded-md bg-slate-900/60 px-1.5 py-1"
                                                  >
                                                    <FilaTecnico
                                                      item={t}
                                                      seleccionado={tecnicosSeleccionadosIds.includes(
                                                        t.tecnicoId,
                                                      )}
                                                      onToggle={() =>
                                                        onToggleTecnico(t.tecnicoId, c.ciudad)
                                                      }
                                                    />
                                                  </li>
                                                ))
                                              )}
                                            </ul>
                                          )}
                                        </div>
                                      </li>
                                    )
                                  })}
                                </ul>
                              </div>
                            )}

                            {c.independientes.length > 0 && (
                              <div>
                                <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
                                  <Bike className="size-3.5 text-cyan-300" /> Operadores
                                  Independientes
                                </p>
                                <ul className="space-y-1">
                                  {c.independientes.map((t) => (
                                    <li key={t.tecnicoId}>
                                      <FilaTecnico
                                        item={t}
                                        seleccionado={tecnicosSeleccionadosIds.includes(
                                          t.tecnicoId,
                                        )}
                                        onToggle={() => onToggleTecnico(t.tecnicoId, c.ciudad)}
                                      />
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {c.patrullas.length === 0 && c.independientes.length === 0 && (
                              <p className="px-2.5 py-2 text-xs text-slate-500">
                                Sin técnicos con órdenes en esta ciudad.
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ) : (
        /* ---- Vista por técnico (ranking jerárquico) ---- */
        <div>
          {unidades.length === 0 && totalSinAsignar === 0 ? (
            <p className="text-xs text-slate-400">Sin órdenes en el ámbito seleccionado.</p>
          ) : (
            <ul className="space-y-1.5">
              {totalSinAsignar > 0 && (
                <li>
                  <button
                    type="button"
                    onClick={() => onToggleTecnico('sin_asignar', SIN_CIUDAD)}
                    aria-pressed={
                      tecnicosSeleccionadosIds.includes('sin_asignar') &&
                      sinAsignarCiudadSeleccionada === null
                    }
                    className={cn(
                      'w-full rounded-xl px-3 py-2 text-left transition-all',
                      tecnicosSeleccionadosIds.includes('sin_asignar') &&
                        sinAsignarCiudadSeleccionada === null
                        ? 'bg-amber-500/10 ring-2 ring-amber-400/70'
                        : 'cursor-pointer hover:bg-slate-800/60',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-2 text-sm font-semibold text-amber-300">
                        <AlertTriangle className="size-3.5" />
                        Total Sin Asignar
                      </span>
                      <span className="text-sm font-bold text-amber-300 tabular-nums">
                        {totalSinAsignar}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-amber-200/70">
                      {totalSinAsignar} órdenes sin técnico asignado
                    </p>
                  </button>
                </li>
              )}
              {unidades.map((u) => {
                if (u.tipo === 'operador') {
                  const r = u.resumen
                  const cfg = CARGA_CONFIG[r.carga]
                  const seleccionado = tecnicosSeleccionadosIds.includes(r.tecnico.id)
                  return (
                    <li key={u.clave}>
                      <button
                        type="button"
                        onClick={() => onToggleTecnico(r.tecnico.id, r.ciudadPrincipal)}
                        aria-pressed={seleccionado}
                        className={cn(
                          'w-full rounded-xl px-3 py-2 text-left transition-all',
                          seleccionado
                            ? 'bg-cyan-500/10 ring-2 ring-cyan-400/70'
                            : 'cursor-pointer hover:bg-slate-800/60',
                        )}
                      >
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <span
                              className={cn(
                                'flex size-4 shrink-0 items-center justify-center rounded border transition',
                                seleccionado
                                  ? 'border-cyan-400 bg-cyan-600'
                                  : 'border-slate-600 bg-slate-950',
                              )}
                            >
                              {seleccionado && (
                                <Check className="size-3 text-white" strokeWidth={3} />
                              )}
                            </span>
                            <span className="truncate text-sm font-medium text-slate-200">
                              {r.tecnico.nombre}
                            </span>
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-200 ring-1 ring-emerald-500/30">
                              🛵 Operador
                            </span>
                            {r.carga === 'saturado' && (
                              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-semibold text-red-300 ring-1 ring-red-500/30">
                                <AlertTriangle className="size-3" /> Sobrecargado
                              </span>
                            )}
                          </div>
                          <span className={cn('text-sm font-bold tabular-nums', cfg.texto)}>
                            {r.total}
                          </span>
                        </div>
                        <div className="mb-1 flex items-center gap-1.5 text-[11px] text-slate-400">
                          <MapPin className="size-3 shrink-0 text-cyan-400" />
                          <span className="truncate">
                            {r.ciudadesTexto || 'Sin ciudad asignada'} · {r.livianos} liviano ·{' '}
                            {r.pesados} pesado
                          </span>
                        </div>
                        <BarraProgreso valor={r.total / REF_SATURACION} color={cfg.barra} />
                      </button>
                    </li>
                  )
                }

                const cfg = CARGA_CONFIG[u.carga]
                const desplegada = patrullasExpandidas.has(u.patrulla.id)
                const seleccionada = tecnicosSeleccionadosIds.includes(u.patrulla.id)
                return (
                  <li key={u.clave}>
                    <div className="rounded-xl bg-white/[0.03] px-2 py-2 ring-1 ring-white/10">
                      <div className="flex items-start gap-1.5">
                        <button
                          type="button"
                          onClick={() => onTogglePatrulla(u.patrulla.id, u.ciudadPrincipal)}
                          aria-pressed={seleccionada}
                          aria-label={`Seleccionar patrulla ${u.patrulla.nombre}`}
                          className="mt-0.5 shrink-0 cursor-pointer rounded p-0.5 transition hover:bg-white/10"
                        >
                          <span
                            className={cn(
                              'flex size-4 shrink-0 items-center justify-center rounded border transition',
                              seleccionada
                                ? 'border-cyan-400 bg-cyan-600'
                                : 'border-slate-600 bg-slate-950',
                            )}
                          >
                            {seleccionada && (
                              <Check className="size-3 text-white" strokeWidth={3} />
                            )}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => togglePatrullaExpandida(u.patrulla.id)}
                          aria-expanded={desplegada}
                          className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-2 text-left"
                        >
                          <span className="flex min-w-0 items-center gap-1.5">
                            {desplegada ? (
                              <ChevronDown className="size-3.5 shrink-0 text-slate-400" />
                            ) : (
                              <ChevronRight className="size-3.5 shrink-0 text-slate-400" />
                            )}
                            <Truck className="size-3.5 shrink-0 text-cyan-300" />
                            <span className="truncate text-sm font-medium text-slate-200">
                              {u.patrulla.nombre}
                            </span>
                            <span className="shrink-0 text-[10px] font-semibold tracking-wide text-indigo-300 uppercase">
                              🚛 Patrulla
                            </span>
                            <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-slate-300 ring-1 ring-white/15">
                              {u.operadores.length}{' '}
                              {u.operadores.length === 1 ? 'operador' : 'operadores'}
                            </span>
                            {u.carga === 'saturado' && (
                              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-semibold text-red-300 ring-1 ring-red-500/30">
                                <AlertTriangle className="size-3" /> Sobrecargado
                              </span>
                            )}
                          </span>
                          <span className={cn('shrink-0 text-sm font-bold tabular-nums', cfg.texto)}>
                            {u.total}
                          </span>
                        </button>
                      </div>
                      <div className="mt-1 pl-6">
                        <p className="mb-1 flex items-center gap-1.5 text-[11px] text-slate-400">
                          <MapPin className="size-3 shrink-0 text-cyan-400" />
                          <span className="truncate">
                            {u.ciudadesTexto || 'Sin ciudad asignada'} · {u.livianos} liviano ·{' '}
                            {u.pesados} pesado
                          </span>
                        </p>
                        <BarraProgreso valor={u.total / REF_SATURACION} color={cfg.barra} />
                      </div>

                      {desplegada && (
                        <ul className="mt-1.5 ml-4 space-y-1 border-l border-white/10 pl-2">
                          {u.operadores.length === 0 ? (
                            <li className="px-2.5 py-1 text-[11px] text-slate-500">
                              Sin operadores a cargo.
                            </li>
                          ) : (
                            u.operadores.map((o) => {
                              const cfgOperador = CARGA_CONFIG[o.carga]
                              const seleccionado = tecnicosSeleccionadosIds.includes(o.tecnico.id)
                              return (
                                <li key={o.tecnico.id}>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onToggleTecnico(o.tecnico.id, o.ciudadPrincipal)
                                    }
                                    aria-pressed={seleccionado}
                                    className={cn(
                                      'w-full rounded-lg px-2.5 py-1.5 text-left transition-all',
                                      seleccionado
                                        ? 'bg-cyan-500/10 ring-2 ring-cyan-400/70'
                                        : 'cursor-pointer hover:bg-slate-800/60',
                                    )}
                                  >
                                    <div className="mb-0.5 flex items-center justify-between gap-2">
                                      <div className="flex min-w-0 items-center gap-2">
                                        <span
                                          className={cn(
                                            'flex size-4 shrink-0 items-center justify-center rounded border transition',
                                            seleccionado
                                              ? 'border-cyan-400 bg-cyan-600'
                                              : 'border-slate-600 bg-slate-950',
                                          )}
                                        >
                                          {seleccionado && (
                                            <Check
                                              className="size-3 text-white"
                                              strokeWidth={3}
                                            />
                                          )}
                                        </span>
                                        <span className="truncate text-sm font-medium text-slate-200">
                                          {o.tecnico.nombre}
                                        </span>
                                      </div>
                                      <span
                                        className={cn(
                                          'shrink-0 text-sm font-bold tabular-nums',
                                          cfgOperador.texto,
                                        )}
                                      >
                                        {o.total}
                                      </span>
                                    </div>
                                    <p className="pl-6 text-[11px] text-slate-400">
                                      {o.ciudadesTexto || 'Sin ciudad asignada'} · {o.livianos}{' '}
                                      liviano · {o.pesados} pesado
                                    </p>
                                    <div className="mt-1 pl-6">
                                      <BarraProgreso
                                        valor={o.total / REF_SATURACION}
                                        color={cfgOperador.barra}
                                      />
                                    </div>
                                  </button>
                                </li>
                              )
                            })
                          )}
                        </ul>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {/* Técnicos en cero */}
      <div className="mt-4 border-t border-white/10 pt-3">
        <p className="text-xs font-semibold text-slate-300">Técnicos en cero hoy</p>
        {sinOrdenes.length === 0 ? (
          <p className="mt-1 text-xs text-slate-500">
            Todos los técnicos activos tienen órdenes asignadas.
          </p>
        ) : (
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {sinOrdenes.map((t) => (
              <li
                key={t.tecnico.id}
                className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-slate-300 ring-1 ring-white/10"
              >
                {t.tecnico.nombre}
                {t.ciudadesTexto && (
                  <span className="text-slate-500"> · {t.ciudadesTexto}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </TarjetaAnalitica>
  )
}
