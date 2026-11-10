import { useState } from 'react'
import { AlertTriangle, Loader2, ShieldCheck, Truck } from 'lucide-react'
import { liberarReglasDePatrullas } from '../../services/supabaseService'
import type { Tecnico } from '../../types'
import type { ToastVariant } from '../ToastContainer'

interface PanelReglasPatrullaProps {
  tecnicos: Tecnico[]
  notificar: (mensaje: string, variant?: ToastVariant) => void
  onCambio: () => Promise<void>
}

/**
 * Mantenimiento del índice P2 (`idx_regla_especialidad_unica`, 1 barrio = 1
 * carro). Una ficha convertida en patrulla no debe conservar barrios propios:
 * su territorio es la unión de los de sus operadores, y cualquier fila a su
 * nombre bloquea el barrio para el resto (incluidos sus propios operadores).
 */
export function PanelReglasPatrulla({
  tecnicos,
  notificar,
  onCambio,
}: PanelReglasPatrullaProps) {
  const [ocupado, setOcupado] = useState(false)
  const patrullas = tecnicos.filter((t) => t.rol === 'patrulla')

  async function ejecutar(confirmar: boolean) {
    setOcupado(true)
    try {
      const total = await liberarReglasDePatrullas(confirmar)
      if (!confirmar) {
        notificar(
          total === 0
            ? 'Ninguna patrulla tiene barrios propios: el índice P2 está limpio.'
            : `${total} regla(s) de patrullas bloquean barrios. Pulsa "Liberar" para quitarlas.`,
          total === 0 ? 'success' : 'error',
        )
        return
      }
      await onCambio()
      notificar(`Se liberaron ${total} regla(s) de patrullas.`, 'success')
    } catch (e) {
      notificar(
        e instanceof Error ? e.message : 'No se pudieron liberar las reglas.',
        'error',
      )
    } finally {
      setOcupado(false)
    }
  }

  return (
    <section className="space-y-3">
      <div className="rounded-2xl border border-slate-700/60 bg-slate-900 px-4 py-4 shadow-xl shadow-slate-900/20">
        <div className="flex items-start gap-3">
          <Truck className="mt-0.5 size-5 shrink-0 text-cyan-300" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-100">
              Mantenimiento de reglas territoriales
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              La patrulla no tiene barrios propios: su territorio es la unión de los barrios de
              sus operadores. Si una patrulla conserva barrios, el índice{' '}
              <span className="font-mono text-slate-300">idx_regla_especialidad_unica</span>{' '}
              (1 barrio = 1 carro) bloquea esos barrios para todos, incluidos sus propios
              operadores.
            </p>
            <p className="mt-2 text-[11px] text-slate-500">
              {patrullas.length === 0
                ? 'No hay fichas con rol patrulla.'
                : `${patrullas.length} ficha(s) con rol patrulla: ${patrullas
                    .map((p) => p.nombre)
                    .join(', ')}.`}
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={ocupado}
            onClick={() => void ejecutar(false)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 ring-1 ring-white/10 transition hover:bg-white/10 disabled:opacity-50"
          >
            {ocupado ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <ShieldCheck className="size-3.5" />
            )}
            Diagnosticar
          </button>
          <button
            type="button"
            disabled={ocupado}
            onClick={() => void ejecutar(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-200 ring-1 ring-amber-500/30 transition hover:bg-amber-500/25 disabled:opacity-50"
          >
            {ocupado ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <AlertTriangle className="size-3.5" />
            )}
            Liberar barrios de patrullas
          </button>
        </div>
        <p className="mt-2 text-[11px] text-amber-200/60">
          Al liberar, esos barrios quedan <strong>sin dueño</strong> y hay que reasignarlos a mano
          desde la ficha del operador que corresponda.
        </p>
      </div>
    </section>
  )
}
