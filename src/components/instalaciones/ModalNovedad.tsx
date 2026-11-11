import { useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import type {
  EntradaNovedadInstalacion,
  EstadoGestionNovedad,
  NovedadInstalacion,
  ServicioNuevo,
  TipoNovedadInstalacion,
} from '../../types'
import { Modal } from '../Modal'
import { cn } from '../../lib/utils'
import { ESTADOS_NOVEDAD_UI, TIPOS_NOVEDAD_UI } from './catalogoNovedades'

interface ModalNovedadProps {
  /** Orden de instalación a la que se le registra la novedad. */
  servicio: ServicioNuevo | null
  /** Novedad vigente (si existe) para precargar el formulario. */
  novedadActual?: NovedadInstalacion
  onCerrar: () => void
  /** Persiste (upsert) y devuelve la novedad guardada. Puede lanzar error. */
  onGuardar: (entrada: EntradaNovedadInstalacion) => Promise<void>
  /** Elimina la novedad (el bloqueo quedó superado). Puede lanzar error. */
  onEliminar: (ordenId: string) => Promise<void>
}

/**
 * Modal rápido de bitácora: tipo de novedad, caja NAP, comentario y estado.
 * El guardado es instantáneo (upsert por orden), sin pasos intermedios.
 */
export function ModalNovedad({
  servicio,
  novedadActual,
  onCerrar,
  onGuardar,
  onEliminar,
}: ModalNovedadProps) {
  const [tipo, setTipo] = useState<TipoNovedadInstalacion>(
    novedadActual?.tipo_novedad ?? 'pendiente_puerto',
  )
  const [cajaNap, setCajaNap] = useState(novedadActual?.caja_nap ?? '')
  const [comentario, setComentario] = useState(novedadActual?.comentario ?? '')
  const [estado, setEstado] = useState<EstadoGestionNovedad>(
    novedadActual?.estado_gestion ?? 'pendiente',
  )
  const [guardando, setGuardando] = useState(false)
  const [eliminando, setEliminando] = useState(false)

  const ocupado = guardando || eliminando
  const etiquetaTipo = TIPOS_NOVEDAD_UI.find((t) => t.tipo === tipo)

  async function handleGuardar() {
    if (!servicio) return
    setGuardando(true)
    try {
      await onGuardar({
        orden_id: servicio.numero_orden,
        tipo_novedad: tipo,
        estado_gestion: estado,
        caja_nap: cajaNap || undefined,
        comentario: comentario || undefined,
      })
    } finally {
      setGuardando(false)
    }
  }

  async function handleEliminar() {
    if (!servicio) return
    setEliminando(true)
    try {
      await onEliminar(servicio.numero_orden)
    } finally {
      setEliminando(false)
    }
  }

  return (
    <Modal
      abierto={servicio !== null}
      onCerrar={ocupado ? () => undefined : onCerrar}
      titulo={`Gestionar novedad · Orden #${servicio?.numero_orden ?? ''}`}
      descripcion={
        servicio
          ? `${servicio.ciudad} · ${servicio.barrio}${servicio.direccion ? ` · ${servicio.direccion}` : ''}`
          : undefined
      }
      anchoMaximo="max-w-xl"
      footer={
        <>
          {novedadActual && (
            <button
              type="button"
              onClick={() => void handleEliminar()}
              disabled={ocupado}
              className="mr-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-red-600 ring-1 ring-red-200 transition hover:bg-red-50 disabled:opacity-50"
            >
              {eliminando ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              Eliminar novedad
            </button>
          )}
          <button
            type="button"
            onClick={onCerrar}
            disabled={ocupado}
            className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleGuardar()}
            disabled={ocupado}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
          >
            {guardando && <Loader2 className="size-3.5 animate-spin" />}
            Guardar novedad
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Tipo de novedad */}
        <div>
          <p className="mb-1.5 text-xs font-semibold text-slate-700">Tipo de novedad</p>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {TIPOS_NOVEDAD_UI.map((opcion) => (
              <button
                key={opcion.tipo}
                type="button"
                disabled={ocupado}
                onClick={() => setTipo(opcion.tipo)}
                className={cn(
                  'flex items-start gap-2 rounded-lg px-2.5 py-2 text-left text-xs ring-1 transition disabled:opacity-50',
                  tipo === opcion.tipo
                    ? 'bg-slate-900 text-white ring-slate-900'
                    : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50',
                )}
              >
                <span aria-hidden="true">{opcion.icono}</span>
                <span className="font-semibold">{opcion.etiqueta}</span>
              </button>
            ))}
          </div>
          {etiquetaTipo && (
            <p className="mt-1.5 text-[11px] text-slate-500">{etiquetaTipo.descripcion}</p>
          )}
        </div>

        {/* Caja NAP */}
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-700">
            Caja NAP / Puerto <span className="font-normal text-slate-400">(opcional)</span>
          </span>
          <input
            type="text"
            value={cajaNap}
            onChange={(e) => setCajaNap(e.target.value)}
            disabled={ocupado}
            placeholder="Ej.: NAP-04, Puerto 3"
            className="w-full rounded-lg px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-200 outline-none transition placeholder:text-slate-400 focus:ring-2 focus:ring-slate-900 disabled:opacity-50"
          />
        </label>

        {/* Comentario */}
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-700">
            Comentario del bloqueo
          </span>
          <textarea
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            disabled={ocupado}
            rows={3}
            placeholder="Ej.: Puerto 4 ocupado por cliente vecino; se requiere liberación en caja NAP-04."
            className="w-full resize-y rounded-lg px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-200 outline-none transition placeholder:text-slate-400 focus:ring-2 focus:ring-slate-900 disabled:opacity-50"
          />
        </label>

        {/* Estado de gestión */}
        <div>
          <p className="mb-1.5 text-xs font-semibold text-slate-700">Estado de gestión</p>
          <div className="flex flex-wrap gap-1.5">
            {ESTADOS_NOVEDAD_UI.map((opcion) => (
              <button
                key={opcion.estado}
                type="button"
                disabled={ocupado}
                onClick={() => setEstado(opcion.estado)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 transition disabled:opacity-50',
                  estado === opcion.estado
                    ? opcion.texto
                    : 'bg-white text-slate-500 ring-slate-200 hover:bg-slate-50',
                )}
              >
                <span aria-hidden="true">{opcion.icono}</span>
                {opcion.etiqueta}
              </button>
            ))}
          </div>
        </div>

        {novedadActual && (
          <p className="text-[11px] text-slate-400">
            Última actualización: {new Date(novedadActual.updated_at).toLocaleString('es-CO')}
            {novedadActual.usuario ? ` · ${novedadActual.usuario}` : ''}
          </p>
        )}
      </div>
    </Modal>
  )
}
