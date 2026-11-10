import { useState } from 'react'
import { Tags, Users, Wrench } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../../lib/utils'
import { DirectorioTecnicos } from './DirectorioTecnicos'
import { DetalleTecnicoTerritorio } from './DetalleTecnicoTerritorio'
import { CategorizacionServicios } from './CategorizacionServicios'
import { PanelReglasPatrulla } from './PanelReglasPatrulla'
import type { CategoriaConServicios, ReglaConTecnico, Servicio, Tecnico } from '../../types'
import type { ToastVariant } from '../ToastContainer'

type SubVista = 'directorio' | 'categorias' | 'mantenimiento'

interface GestionTerritorialProps {
  /** Técnico abierto en la ficha; si existe se omite el nivel de sub-pestañas. */
  tecnicoSeleccionado: Tecnico | null
  tecnicos: Tecnico[]
  reglas: ReglaConTecnico[]
  servicios: Servicio[]
  ciudadesActivas: Record<string, string[]>
  onSeleccionar: (tecnicoId: string) => void
  onVolver: () => void
  onCreado: (tecnico: Tecnico) => Promise<void>
  onCambio: () => Promise<void>
  onActualizado: () => Promise<void>
  categorias: CategoriaConServicios[]
  sinClasificar: string[]
  onReasignarCategoria: (tipoSolicitud: string, categoriaId: string) => Promise<void>
  notificar: (mensaje: string, variant?: ToastVariant) => void
}

const SUB_VISTAS: Array<{ id: SubVista; label: string; icon: LucideIcon }> = [
  { id: 'directorio', label: 'Directorio de Técnicos', icon: Users },
  { id: 'categorias', label: 'Categorías de Servicios', icon: Tags },
  { id: 'mantenimiento', label: 'Mantenimiento', icon: Wrench },
]

/**
 * Wrapper de Gestión Territorial: mantiene las sub-pestañas Directorio /
 * Categorías y delega el detalle del técnico sin sub-navegación.
 */
export function GestionTerritorial({
  tecnicoSeleccionado,
  tecnicos,
  reglas,
  servicios,
  ciudadesActivas,
  onSeleccionar,
  onVolver,
  onCreado,
  onCambio,
  onActualizado,
  categorias,
  sinClasificar,
  onReasignarCategoria,
  notificar,
}: GestionTerritorialProps) {
  const [subVista, setSubVista] = useState<SubVista>('directorio')

  if (tecnicoSeleccionado) {
    return (
      <DetalleTecnicoTerritorio
        key={tecnicoSeleccionado.id}
        tecnico={tecnicoSeleccionado}
        tecnicos={tecnicos}
        reglas={reglas}
        servicios={servicios}
        ciudadesActivas={ciudadesActivas[tecnicoSeleccionado.id] ?? []}
        onVolver={onVolver}
        notificar={notificar}
        onCambio={onCambio}
        onActualizado={onActualizado}
      />
    )
  }

  return (
    <div className="space-y-4">
      <nav className="flex w-fit gap-1 rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200">
        {SUB_VISTAS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSubVista(id)}
            className={cn(
              'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition',
              subVista === id
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100',
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </nav>

      {subVista === 'directorio' ? (
        <DirectorioTecnicos
          tecnicos={tecnicos}
          reglas={reglas}
          ciudadesActivas={ciudadesActivas}
          onSeleccionar={onSeleccionar}
          notificar={notificar}
          onCreado={onCreado}
          onCambio={onCambio}
        />
      ) : subVista === 'categorias' ? (
        <CategorizacionServicios
          categorias={categorias}
          sinClasificar={sinClasificar}
          onReasignar={onReasignarCategoria}
          notificar={notificar}
        />
      ) : (
        <PanelReglasPatrulla
          tecnicos={tecnicos}
          notificar={notificar}
          onCambio={onCambio}
        />
      )}
    </div>
  )
}
