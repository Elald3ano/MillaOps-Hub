import { useMemo, useRef, useState } from 'react'
import {
  Bike,
  ChevronRight,
  FileSpreadsheet,
  Loader2,
  Map as MapIcon,
  Search,
  Truck,
  UserPlus,
  UserRound,
} from 'lucide-react'
import { limpiarTexto } from '../../lib/normalizer'
import { cn } from '../../lib/utils'
import { Modal } from '../Modal'
import { crearTecnico, importarMatrizDesdeExcel } from '../../services/supabaseService'
import type { ReglaConTecnico, Tecnico } from '../../types'
import type { ToastVariant } from '../ToastContainer'

interface DirectorioTecnicosProps {
  tecnicos: Tecnico[]
  reglas: ReglaConTecnico[]
  ciudadesActivas: Record<string, string[]>
  onSeleccionar: (tecnicoId: string) => void
  notificar: (mensaje: string, variant?: ToastVariant) => void
  /** Se invoca tras crear un técnico para refrescar y seleccionarlo. */
  onCreado: (tecnico: Tecnico) => Promise<void>
  /** Se invoca tras importar la matriz por Excel para refrescar reglas y técnicos. */
  onCambio?: () => Promise<void>
}

type FiltroRapido = 'todos' | 'patrullas' | 'operadores' | 'sinPatrulla'

/** ID corto legible a partir del UUID. */
function idCorto(id: string): string {
  return id.slice(0, 8).toUpperCase()
}

const BASE_BADGE =
  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1'

interface BadgeRolProps {
  rol: Tecnico['rol']
  operadoresACargo: number
  patrullaNombre: string | null
}

/** Badge de rol con el mismo lenguaje visual que la ficha técnica. */
function BadgeRol({ rol, operadoresACargo, patrullaNombre }: BadgeRolProps) {
  if (rol === 'patrulla') {
    return (
      <span
        className={cn(
          BASE_BADGE,
          'bg-indigo-500/15 text-indigo-300 ring-indigo-500/30',
        )}
      >
        <Truck className="size-3" />
        Patrulla · {operadoresACargo} operadores a cargo
      </span>
    )
  }

  if (rol === 'operador') {
    return (
      <span
        className={cn(BASE_BADGE, 'bg-cyan-500/15 text-cyan-300 ring-cyan-500/30')}
      >
        <Bike className="size-3" />
        Operador · Patrulla: {patrullaNombre ?? 'Sin patrulla'}
      </span>
    )
  }

  return (
    <span
      className={cn(BASE_BADGE, 'bg-slate-700/60 text-slate-400 ring-slate-600/40')}
    >
      Sin clasificar
    </span>
  )
}

/** Directorio maestro de técnicos (tabla oscura estilo navy). */
export function DirectorioTecnicos({
  tecnicos,
  reglas,
  ciudadesActivas,
  onSeleccionar,
  notificar,
  onCreado,
  onCambio,
}: DirectorioTecnicosProps) {
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState<FiltroRapido>('todos')

  // Formulario del modal "Nueva Ficha Técnica".
  const [modalNuevo, setModalNuevo] = useState(false)
  const [formNombre, setFormNombre] = useState('')
  const [formTelefono, setFormTelefono] = useState('')
  const [formDocumento, setFormDocumento] = useState('')
  const [formPlaca, setFormPlaca] = useState('')
  const [formRol, setFormRol] = useState<'operador' | 'patrulla' | ''>('')
  const [formPatrullaId, setFormPatrullaId] = useState('')
  const [creando, setCreando] = useState(false)

  // Importación masiva de la matriz de asignación desde Excel.
  const [importando, setImportando] = useState(false)
  const archivoMatrizRef = useRef<HTMLInputElement>(null)

  const stats = useMemo(() => {
    const barrios = new Map<string, Set<string>>()
    const ciudades = new Map<string, Set<string>>()

    for (const regla of reglas) {
      if (!regla.barrio) continue
      const claveBarrio = `${limpiarTexto(regla.ciudad)}|${limpiarTexto(regla.barrio)}`

      const setBarrios = barrios.get(regla.tecnico_id) ?? new Set<string>()
      setBarrios.add(claveBarrio)
      barrios.set(regla.tecnico_id, setBarrios)

      const setCiudades = ciudades.get(regla.tecnico_id) ?? new Set<string>()
      setCiudades.add(limpiarTexto(regla.ciudad))
      ciudades.set(regla.tecnico_id, setCiudades)
    }

    return { barrios, ciudades }
  }, [reglas])

  // Conteo de operadores por patrulla + nombres para resolver la patrulla de un operador.
  const resumenPatrullas = useMemo(() => {
    const operadoresACargo = new Map<string, number>()
    const nombrePorId = new Map<string, string>()

    for (const tecnico of tecnicos) {
      nombrePorId.set(tecnico.id, tecnico.nombre)
      if (tecnico.patrulla_id) {
        operadoresACargo.set(
          tecnico.patrulla_id,
          (operadoresACargo.get(tecnico.patrulla_id) ?? 0) + 1,
        )
      }
    }

    return { operadoresACargo, nombrePorId }
  }, [tecnicos])

  const patrullasDisponibles = useMemo(
    () =>
      tecnicos
        .filter((t) => t.rol === 'patrulla')
        .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [tecnicos],
  )

  const filas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return tecnicos
      .map((tecnico) => {
        const barriosCount = stats.barrios.get(tecnico.id)?.size ?? 0
        const ciudadesRegistradas = ciudadesActivas[tecnico.id]
        const ciudadesCount =
          ciudadesRegistradas && ciudadesRegistradas.length > 0
            ? ciudadesRegistradas.length
            : (stats.ciudades.get(tecnico.id)?.size ?? 0)

        return { tecnico, barriosCount, ciudadesCount }
      })
      .filter(({ tecnico }) => {
        // El filtro por rol/patrulla se aplica antes de la búsqueda por texto.
        if (filtro === 'patrullas' && tecnico.rol !== 'patrulla') return false
        if (filtro === 'operadores' && tecnico.rol !== 'operador') return false
        if (
          filtro === 'sinPatrulla' &&
          !(tecnico.rol === 'operador' && !tecnico.patrulla_id)
        ) {
          return false
        }

        if (q) {
          const coincide =
            tecnico.nombre.toLowerCase().includes(q) ||
            tecnico.id.toLowerCase().includes(q)
          if (!coincide) return false
        }
        return true
      })
      .sort((a, b) => a.tecnico.nombre.localeCompare(b.tecnico.nombre))
  }, [tecnicos, stats, ciudadesActivas, busqueda, filtro])

  const conteo = {
    todos: tecnicos.length,
    patrullas: tecnicos.filter((t) => t.rol === 'patrulla').length,
    operadores: tecnicos.filter((t) => t.rol === 'operador').length,
    sinPatrulla: tecnicos.filter((t) => t.rol === 'operador' && !t.patrulla_id).length,
  }

  const pestañas: Array<{ id: FiltroRapido; label: string }> = [
    { id: 'todos', label: `Todos (${conteo.todos})` },
    { id: 'patrullas', label: `Patrullas (${conteo.patrullas})` },
    { id: 'operadores', label: `Operadores (${conteo.operadores})` },
    { id: 'sinPatrulla', label: `Sin Patrulla (${conteo.sinPatrulla})` },
  ]

  const tituloModal =
    formRol === 'patrulla'
      ? 'Nueva Ficha Técnica · Patrulla de Zona'
      : formRol === 'operador'
        ? 'Nueva Ficha Técnica · Operador de Zona'
        : 'Nueva Ficha Técnica'

  function abrirModalNuevo() {
    setFormNombre('')
    setFormTelefono('')
    setFormDocumento('')
    setFormPlaca('')
    setFormRol('')
    setFormPatrullaId('')
    setModalNuevo(true)
  }

  function seleccionarRol(rol: 'operador' | 'patrulla') {
    setFormRol(rol)
    // Una patrulla no depende de otra patrulla.
    if (rol === 'patrulla') setFormPatrullaId('')
  }

  async function handleCrear() {
    const nombre = formNombre.trim()
    if (!nombre) {
      notificar('El nombre completo es obligatorio.', 'error')
      return
    }
    setCreando(true)

    let nuevo: Tecnico
    try {
      nuevo = await crearTecnico({
        nombre,
        telefono: formTelefono.trim() || undefined,
        documento: formDocumento.trim() || undefined,
        placa: formPlaca.trim() || undefined,
        rol: formRol || undefined,
        patrulla_id: formRol === 'operador' && formPatrullaId ? formPatrullaId : null,
      })
    } catch (e) {
      notificar(e instanceof Error ? e.message : 'No se pudo crear el técnico.', 'error')
      setCreando(false)
      return
    }

    setCreando(false)
    setModalNuevo(false)
    notificar(`Técnico "${nuevo.nombre}" creado correctamente.`, 'success')
    await onCreado(nuevo)
  }

  async function handleImportarMatriz(file: File | undefined) {
    if (!file) return
    setImportando(true)
    try {
      // xlsx es pesado: se importa bajo demanda.
      const { parsearMatrizExcel } = await import('../../services/excelParser')
      const filas = await parsearMatrizExcel(file)
      if (filas.length === 0) {
        notificar('No se encontraron filas válidas en la matriz.', 'error')
        return
      }
      const resultado = await importarMatrizDesdeExcel(filas)
      await onCambio?.()
      notificar(
        `${resultado.tecnicosCreados} técnicos y ${resultado.reglasCreadas} reglas importadas con éxito.`,
        'success',
      )
    } catch (e) {
      notificar(e instanceof Error ? e.message : 'No se pudo importar la matriz.', 'error')
    } finally {
      setImportando(false)
    }
  }

  return (
    <>
      <section className="overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900 shadow-xl shadow-slate-900/20">
        {/* Barra superior */}
        <div className="flex flex-col gap-3 border-b border-slate-700/60 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar técnico o ID…"
              aria-label="Buscar técnico"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 py-2 pr-3 pl-9 text-sm text-slate-100 shadow-sm outline-none transition placeholder:text-slate-500 focus:border-slate-500 focus:ring-2 focus:ring-slate-700"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1 rounded-lg bg-slate-800/80 p-1">
              {pestañas.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFiltro(id)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition',
                    filtro === id
                      ? 'bg-slate-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => archivoMatrizRef.current?.click()}
              disabled={importando}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {importando ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="size-4" />
              )}
              {importando ? 'Importando…' : 'Importar Matriz (Excel)'}
            </button>
            <input
              ref={archivoMatrizRef}
              type="file"
              accept=".xlsx,.xls"
              className="sr-only"
              onChange={(e) => {
                const archivo = e.target.files?.[0]
                e.target.value = ''
                void handleImportarMatriz(archivo)
              }}
            />

            <button
              type="button"
              onClick={abrirModalNuevo}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-400"
            >
              <UserPlus className="size-4" />
              Nuevo Técnico
            </button>
          </div>
        </div>

        {/* Tabla */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-slate-700/60 bg-slate-800/60 text-xs font-semibold tracking-wide text-slate-400 uppercase">
              <tr>
                <th scope="col" className="px-4 py-3">
                  ID / Cédula
                </th>
                <th scope="col" className="px-4 py-3">
                  Técnico
                </th>
                <th scope="col" className="px-4 py-3">
                  Sucursales / Ciudades
                </th>
                <th scope="col" className="px-4 py-3">
                  Barrios Asignados
                </th>
                <th scope="col" className="px-4 py-3">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/40">
              {filas.map(({ tecnico, barriosCount, ciudadesCount }) => {
                const operadoresACargo =
                  resumenPatrullas.operadoresACargo.get(tecnico.id) ?? 0
                const patrullaNombre = tecnico.patrulla_id
                  ? (resumenPatrullas.nombrePorId.get(tecnico.patrulla_id) ?? null)
                  : null

                return (
                  <tr
                    key={tecnico.id}
                    onClick={() => onSeleccionar(tecnico.id)}
                    className="cursor-pointer transition hover:bg-slate-800/60"
                  >
                    <td className="px-4 py-3">
                      <p className="font-mono text-xs text-slate-400">
                        {tecnico.documento || idCorto(tecnico.id)}
                      </p>
                      {tecnico.telefono && (
                        <p className="text-[11px] text-slate-500">{tecnico.telefono}</p>
                      )}
                      {tecnico.placa && (
                        <p className="text-[11px] text-slate-500">
                          Placa: {tecnico.placa}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-2">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-700/60 text-slate-300">
                          <UserRound className="size-3.5" />
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium text-slate-100">{tecnico.nombre}</p>
                          <div className="mt-1">
                            <BadgeRol
                              rol={tecnico.rol}
                              operadoresACargo={operadoresACargo}
                              patrullaNombre={patrullaNombre}
                            />
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-slate-300">
                        <MapIcon className="size-3.5 text-slate-500" />
                        {ciudadesCount} {ciudadesCount === 1 ? 'ciudad' : 'ciudades'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300 tabular-nums">
                      {barriosCount} {barriosCount === 1 ? 'barrio' : 'barrios'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ChevronRight className="ml-auto size-4 text-slate-600" />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {filas.length === 0 && (
            <div className="px-4 py-14 text-center">
              <p className="text-sm font-medium text-slate-300">Sin resultados</p>
              <p className="mt-1 text-xs text-slate-500">
                No hay técnicos que coincidan con el filtro o la búsqueda.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Modal Nueva Ficha Técnica */}
      <Modal
        abierto={modalNuevo}
        onCerrar={() => {
          if (!creando) setModalNuevo(false)
        }}
        titulo={tituloModal}
        descripcion="Registra la ficha técnica de un técnico para empezar a asignarle territorio."
        anchoMaximo="max-w-lg"
        footer={
          <>
            <button
              type="button"
              onClick={() => setModalNuevo(false)}
              disabled={creando}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleCrear()}
              disabled={creando}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-400 disabled:opacity-50"
            >
              {creando && <Loader2 className="size-4 animate-spin" />}
              Crear Técnico
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label
              htmlFor="nuevo-nombre"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Nombre Completo <span className="text-red-500">*</span>
            </label>
            <input
              id="nuevo-nombre"
              type="text"
              value={formNombre}
              onChange={(e) => setFormNombre(e.target.value)}
              placeholder="Ej: Juan Pérez"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCrear()
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
          </div>

          <div>
            <label
              htmlFor="nuevo-telefono"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Teléfono / Celular
            </label>
            <input
              id="nuevo-telefono"
              type="tel"
              value={formTelefono}
              onChange={(e) => setFormTelefono(e.target.value)}
              placeholder="Ej: 300 123 4567"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCrear()
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
          </div>

          <div>
            <label
              htmlFor="nuevo-documento"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Cédula / Documento
            </label>
            <input
              id="nuevo-documento"
              type="text"
              value={formDocumento}
              onChange={(e) => setFormDocumento(e.target.value)}
              placeholder="Ej: 1234567890"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCrear()
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
          </div>

          <div>
            <label
              htmlFor="nuevo-placa"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Placa del vehículo
            </label>
            <input
              id="nuevo-placa"
              type="text"
              value={formPlaca}
              onChange={(e) => setFormPlaca(e.target.value)}
              placeholder="Ej: ABC12D"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCrear()
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
          </div>

          <div>
            <p className="mb-1 block text-sm font-medium text-slate-700">Rol</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => seleccionarRol('operador')}
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-medium transition',
                  formRol === 'operador'
                    ? 'border-cyan-500 bg-cyan-500/10 text-cyan-700'
                    : 'border-slate-300 text-slate-500 hover:bg-slate-50',
                )}
              >
                <Bike className="size-4 shrink-0" />
                <span>
                  Operador de Zona
                  <span className="block text-[11px] font-normal text-slate-500">
                    Moto · Servicios específicos
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => seleccionarRol('patrulla')}
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-medium transition',
                  formRol === 'patrulla'
                    ? 'border-indigo-500 bg-indigo-500/10 text-indigo-700'
                    : 'border-slate-300 text-slate-500 hover:bg-slate-50',
                )}
              >
                <Truck className="size-4 shrink-0" />
                <span>
                  Patrulla de Zona
                  <span className="block text-[11px] font-normal text-slate-500">
                    Carro · Coordina operadores
                  </span>
                </span>
              </button>
            </div>
          </div>

          {formRol === 'operador' && (
            <div>
              <label
                htmlFor="nuevo-patrulla"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Patrulla Asignada (opcional)
              </label>
              <select
                id="nuevo-patrulla"
                value={formPatrullaId}
                onChange={(e) => setFormPatrullaId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              >
                <option value="">— Sin patrulla —</option>
                {patrullasDisponibles.map((patrulla) => (
                  <option key={patrulla.id} value={patrulla.id}>
                    {patrulla.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </Modal>
    </>
  )
}
