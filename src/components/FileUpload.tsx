import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { CloudUpload, FileSpreadsheet, Loader2, MapPin, Trash2 } from 'lucide-react'
import { cn } from '../lib/utils'
import { CIUDADES_SUGERIDAS } from '../lib/sla'

interface FileUploadProps {
  procesando: boolean
  onProcesar: (file: File, ciudadFiltro: string | undefined) => Promise<void>
}

const EXTENSIONES_VALIDAS = ['.xlsx', '.xls']

function esExcelValido(file: File): boolean {
  const nombre = file.name.toLowerCase()
  return EXTENSIONES_VALIDAS.some((ext) => nombre.endsWith(ext))
}

function formatearTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

/** Dropzone accesible con filtro de ciudad y opción de Línea Base. */
export function FileUpload({ procesando, onProcesar }: FileUploadProps) {
  const [archivo, setArchivo] = useState<File | null>(null)
  const [ciudad, setCiudad] = useState<string>('')
  const [dragging, setDragging] = useState(false)
  const [errorLocal, setErrorLocal] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function seleccionarArchivo(file: File | undefined) {
    if (!file) return
    if (!esExcelValido(file)) {
      setErrorLocal('Formato no válido. Sube un archivo .xlsx o .xls.')
      return
    }
    setErrorLocal(null)
    setArchivo(file)
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    seleccionarArchivo(event.target.files?.[0])
    // Permite volver a seleccionar el mismo archivo después.
    event.target.value = ''
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    if (procesando) return
    seleccionarArchivo(event.dataTransfer.files?.[0])
  }

  async function handleProcesar() {
    if (!archivo || procesando) return
    setErrorLocal(null)
    await onProcesar(archivo, ciudad || undefined)
    setArchivo(null)
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <CloudUpload className="size-5 text-slate-700" />
        <h2 className="text-sm font-semibold text-slate-900">Cargar reporte de servicios</h2>
      </div>

      {/* Dropzone */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Área para arrastrar o seleccionar archivo Excel"
        onClick={() => !procesando && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !procesando) inputRef.current?.click()
        }}
        onDragOver={(e) => {
          e.preventDefault()
          if (!procesando) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400',
          dragging
            ? 'border-slate-500 bg-slate-50'
            : 'border-slate-300 bg-slate-50/60 hover:border-slate-400 hover:bg-slate-50',
          procesando && 'pointer-events-none opacity-60',
        )}
      >
        <FileSpreadsheet
          className={cn('mb-2 size-8', dragging ? 'text-slate-700' : 'text-slate-400')}
        />
        {archivo ? (
          <>
            <p className="max-w-full truncate text-sm font-medium text-slate-900">{archivo.name}</p>
            <p className="text-xs text-slate-500">{formatearTamano(archivo.size)}</p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-slate-700">
              Arrastra tu archivo aquí o haz clic para seleccionarlo
            </p>
            <p className="text-xs text-slate-500">Formatos admitidos: .xlsx, .xls</p>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        className="sr-only"
        onChange={handleInputChange}
        disabled={procesando}
      />

      {/* Controles */}
      <div className="mt-4 grid gap-4">
        <label className="block">
          <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-600">
            <MapPin className="size-3.5" /> Ciudad / Zona
          </span>
          <input
            list="ciudades-sugeridas"
            value={ciudad}
            onChange={(e) => setCiudad(e.target.value)}
            placeholder="Todas (sin filtro)"
            disabled={procesando}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:opacity-60"
          />
          <datalist id="ciudades-sugeridas">
            {CIUDADES_SUGERIDAS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
      </div>

      {errorLocal && <p className="mt-3 text-xs font-medium text-red-600">{errorLocal}</p>}

      <div className="mt-4 flex items-center justify-between gap-3">
        {archivo ? (
          <button
            type="button"
            onClick={() => setArchivo(null)}
            disabled={procesando}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
          >
            <Trash2 className="size-3.5" /> Quitar archivo
          </button>
        ) : (
          <span className="text-xs text-slate-400">Selecciona un archivo para continuar</span>
        )}

        <button
          type="button"
          onClick={handleProcesar}
          disabled={!archivo || procesando}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {procesando ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Procesando…
            </>
          ) : (
            <>
              <CloudUpload className="size-4" /> Procesar y Despachar
            </>
          )}
        </button>
      </div>
    </section>
  )
}
