import { useMemo } from 'react'
import { Bike, Truck } from 'lucide-react'
import type { Servicio } from '../../types'
import { esServicioLiviano } from '../../lib/tiposServicio'
import { cn } from '../../lib/utils'
import { BarraProgreso, TarjetaAnalitica } from './TarjetaAnalitica'

interface DesgloseServicio {
  tipo: string
  cantidad: number
  liviano: boolean
}

/**
 * Distribución de Servicios y Flota: cuadrilla liviana (motos) vs. pesada
 * (patrullas con carro y escalera), con desglose del 100% de los servicios.
 */
export function RadarFlotantes({ servicios }: { servicios: Servicio[] }) {
  const {
    totalLivianos,
    totalPesados,
    porcentajeLivianos,
    porcentajePesados,
    total,
    desglose,
    maxDesglose,
  } = useMemo(() => {
    const total = servicios.length
    const totalLivianos = servicios.filter((s) => esServicioLiviano(s.tipo_servicio)).length
    const totalPesados = total - totalLivianos
    const porcentajeLivianos = total === 0 ? 0 : Math.round((totalLivianos / total) * 100)
    const porcentajePesados = total === 0 ? 0 : Math.round((totalPesados / total) * 100)

    // Agrupa TODOS los servicios activos (livianos y pesados).
    const conteo = new Map<string, { cantidad: number; liviano: boolean }>()
    for (const s of servicios) {
      const liviano = esServicioLiviano(s.tipo_servicio)
      const prev = conteo.get(s.tipo_servicio)
      if (prev) prev.cantidad += 1
      else conteo.set(s.tipo_servicio, { cantidad: 1, liviano })
    }
    const desglose: DesgloseServicio[] = [...conteo.entries()]
      .map(([tipo, v]) => ({ tipo, cantidad: v.cantidad, liviano: v.liviano }))
      .sort((a, b) => b.cantidad - a.cantidad)
    const maxDesglose = Math.max(1, ...desglose.map((d) => d.cantidad))

    return {
      totalLivianos,
      totalPesados,
      porcentajeLivianos,
      porcentajePesados,
      total,
      desglose,
      maxDesglose,
    }
  }, [servicios])

  return (
    <TarjetaAnalitica
      icon={Bike}
      titulo="Distribución de Servicios y Flota"
      subtitulo="Motos vs. Patrullas"
    >
      {/* Cabecera ejecutiva dual */}
      <div className="grid grid-cols-2 gap-3">
        {/* Cuadrilla liviana (motos) */}
        <div className="rounded-xl bg-cyan-500/10 p-3 ring-1 ring-cyan-400/30">
          <div className="flex items-center gap-1.5">
            <Bike className="size-4 shrink-0 text-cyan-300" />
            <span className="truncate text-xs font-semibold text-cyan-200">
              Cuadrilla Liviana (Motos)
            </span>
          </div>
          <p className="mt-2 text-2xl font-black tracking-tight text-white tabular-nums">
            {totalLivianos}
            <span className="ml-1 text-sm font-bold text-cyan-300">({porcentajeLivianos}%)</span>
          </p>
          <p className="mt-1 text-[11px] font-medium text-cyan-300">
            El {porcentajeLivianos}% de los servicios se pueden resolver en moto.
          </p>
          <p className="text-[10px] text-slate-500">Trámites rápidos sin escalera</p>
        </div>

        {/* Patrulla pesada (carro + escalera) */}
        <div className="rounded-xl bg-slate-800/60 p-3 ring-1 ring-white/10">
          <div className="flex items-center gap-1.5">
            <Truck className="size-4 shrink-0 text-amber-300" />
            <span className="truncate text-xs font-semibold text-slate-300">
              Patrulla Pesada (Carro + Escalera)
            </span>
          </div>
          <p className="mt-2 text-2xl font-black tracking-tight text-white tabular-nums">
            {totalPesados}
            <span className="ml-1 text-sm font-bold text-slate-400">({porcentajePesados}%)</span>
          </p>
          <p className="mt-1 text-[11px] font-medium text-amber-300/90">
            El {porcentajePesados}% requiere patrulla pesada.
          </p>
          <p className="text-[10px] text-slate-500">Pareja con vehículo y escalera</p>
        </div>
      </div>

      {/* Desglose del 100% de los servicios activos */}
      <div>
        <p className="mb-1.5 text-xs font-semibold text-slate-300">
          Desglose del 100% de servicios activos
        </p>
        <div className="max-h-80 space-y-2.5 overflow-y-auto pr-1.5">
          {desglose.length === 0 ? (
            <p className="text-xs text-slate-500">Sin servicios en el ámbito seleccionado.</p>
          ) : (
            desglose.map((d) => (
              <div key={d.tipo}>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-xs text-slate-200">{d.tipo}</span>
                    <span
                      className={cn(
                        'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold',
                        d.liviano
                          ? 'bg-cyan-950/70 text-cyan-200 ring-1 ring-cyan-400'
                          : 'bg-slate-700 text-slate-300 ring-1 ring-slate-600',
                      )}
                    >
                      {d.liviano ? '🛵 Moto' : '🚛 Patrulla'}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-slate-300 tabular-nums">
                    {d.cantidad} ({((d.cantidad / total) * 100).toFixed(1)}%)
                  </span>
                </div>
                <BarraProgreso
                  valor={d.cantidad / maxDesglose}
                  color={d.liviano ? 'bg-cyan-400' : 'bg-slate-500'}
                />
              </div>
            ))
          )}
        </div>
      </div>
    </TarjetaAnalitica>
  )
}
