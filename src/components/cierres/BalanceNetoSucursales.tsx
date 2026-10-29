import { Scale } from 'lucide-react'
import type { BalanceCiudad } from '../../services/reconciliationService'
import { cn } from '../../lib/utils'
import { TarjetaAnalitica } from '../analitica/TarjetaAnalitica'

/** Balance neto por sucursal: cerradas vs. nuevas (auditoría de congestión). */
export function BalanceNetoSucursales({ balance }: { balance: BalanceCiudad[] }) {
  return (
    <TarjetaAnalitica
      icon={Scale}
      titulo="Balance Neto por Sucursal"
      subtitulo={`${balance.length} sucursales con actividad`}
    >
      {balance.length === 0 ? (
        <p className="text-xs text-slate-400">Sin actividad entre los cortes.</p>
      ) : (
        <ul className="max-h-80 space-y-2 overflow-y-auto pr-1.5">
          {balance.map((b) => {
            const estado =
              b.neto > 0 ? 'descongestionando' : b.neto < 0 ? 'saturado' : 'neutral'
            return (
              <li
                key={b.ciudad}
                className="rounded-lg bg-white/5 px-3 py-2 ring-1 ring-white/10"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-slate-200">{b.ciudad}</span>
                  <span className="shrink-0 text-xs text-slate-400 tabular-nums">
                    {b.cerradas} ↓ · {b.nuevas} ↑
                  </span>
                </div>
                <span
                  className={cn(
                    'mt-1.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1',
                    estado === 'descongestionando' &&
                      'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
                    estado === 'saturado' && 'bg-red-500/15 text-red-300 ring-red-500/30',
                    estado === 'neutral' && 'bg-slate-700/60 text-slate-300 ring-slate-600',
                  )}
                >
                  {estado === 'descongestionando' && `🟢 Descongestionando (-${b.neto} órdenes netas)`}
                  {estado === 'saturado' && `🔴 En saturación (+${Math.abs(b.neto)} órdenes netas)`}
                  {estado === 'neutral' && '⚪ Sin cambios'}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </TarjetaAnalitica>
  )
}
