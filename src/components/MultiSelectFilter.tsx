import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../lib/utils'

export interface MultiSelectOpcion {
  id: string
  label: string
  count?: number
}

interface MultiSelectFilterProps {
  /** Título del filtro (aria-label). */
  label: string
  opciones: MultiSelectOpcion[]
  seleccionados: string[]
  onSeleccionChange: (nuevosIds: string[]) => void
  /** Texto cuando no hay selección (o están todos seleccionados). */
  placeholderTodos: string
  icono?: LucideIcon
}

/**
 * Combobox de selección múltiple con buscador integrado y acciones rápidas.
 * Reemplaza a los `<select>` nativos para filtros de múltiples valores.
 */
export function MultiSelectFilter({
  label,
  opciones,
  seleccionados,
  onSeleccionChange,
  placeholderTodos,
  icono: Icono,
}: MultiSelectFilterProps) {
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const contenedorRef = useRef<HTMLDivElement>(null)

  // Cierre accesible: clic afuera y tecla Escape.
  useEffect(() => {
    if (!abierto) return
    function handlePointerDown(e: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) {
        setAbierto(false)
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setAbierto(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [abierto])

  const opcionesFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return opciones
    return opciones.filter((o) => o.label.toLowerCase().includes(q))
  }, [opciones, busqueda])

  function toggle(id: string) {
    const nuevo = seleccionados.includes(id)
      ? seleccionados.filter((x) => x !== id)
      : [...seleccionados, id]
    onSeleccionChange(nuevo)
  }

  function marcarTodos() {
    onSeleccionChange(opciones.map((o) => o.id))
  }

  function limpiar() {
    onSeleccionChange([])
  }

  // Etiqueta del disparador según el número de seleccionados.
  const seleccionadas = opciones.filter((o) => seleccionados.includes(o.id))
  const etiqueta = (() => {
    if (seleccionadas.length === 0 || (opciones.length > 0 && seleccionadas.length === opciones.length)) {
      return placeholderTodos
    }
    if (seleccionadas.length === 1) return seleccionadas[0].label
    const [primera, segunda, ...resto] = seleccionadas
    return `${primera.label}, ${segunda.label} (+${resto.length})`
  })()

  return (
    <div ref={contenedorRef} className="relative">
      {/* Botón disparador */}
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-lg border bg-white px-3 py-2 text-left text-sm shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200',
          seleccionadas.length > 0
            ? 'border-slate-400 text-slate-900'
            : 'border-slate-300 text-slate-700',
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          {Icono && <Icono className="size-4 shrink-0 text-slate-400" />}
          <span className="truncate">{etiqueta}</span>
          {seleccionadas.length > 1 && (
            <span className="inline-flex shrink-0 items-center rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-white tabular-nums">
              {seleccionadas.length}
            </span>
          )}
        </span>
        <ChevronDown
          className={cn(
            'size-4 shrink-0 text-slate-400 transition-transform',
            abierto && 'rotate-180',
          )}
        />
      </button>

      {/* Panel desplegable */}
      {abierto && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          {/* Buscador */}
          <div className="relative border-b border-slate-100 p-2">
            <Search className="pointer-events-none absolute top-1/2 left-4 size-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar…"
              autoFocus
              className="w-full rounded-md border border-slate-200 bg-slate-50 py-1.5 pr-2 pl-8 text-xs text-slate-700 outline-none transition focus:border-slate-400"
            />
          </div>

          {/* Acciones rápidas */}
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-1.5">
            <button
              type="button"
              onClick={marcarTodos}
              className="text-xs font-medium text-slate-600 transition hover:text-slate-900"
            >
              Marcar Todos
            </button>
            <button
              type="button"
              onClick={limpiar}
              className="text-xs font-medium text-slate-600 transition hover:text-slate-900"
            >
              Limpiar
            </button>
          </div>

          {/* Lista */}
          <div className="max-h-60 overflow-y-auto p-1">
            {opcionesFiltradas.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-slate-500">Sin coincidencias.</p>
            ) : (
              opcionesFiltradas.map((opcion) => {
                const activo = seleccionados.includes(opcion.id)
                return (
                  <button
                    key={opcion.id}
                    type="button"
                    onClick={() => toggle(opcion.id)}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition',
                      activo ? 'bg-slate-100 text-slate-900' : 'text-slate-700 hover:bg-slate-50',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-4 shrink-0 items-center justify-center rounded border transition',
                        activo
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-300 bg-white',
                      )}
                    >
                      {activo && <Check className="size-3" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{opcion.label}</span>
                    {opcion.count !== undefined && (
                      <span className="text-xs text-slate-400 tabular-nums">({opcion.count})</span>
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
