import { toBlob, toPng } from 'html-to-image'

/**
 * Captura de un elemento del DOM como imagen PNG de alta definición.
 *
 * Se usa `html-to-image` (en lugar de `html2canvas`) porque delega el render en
 * el motor nativo del navegador: soporta OKLCH y todo el CSS moderno que genera
 * Tailwind CSS v4. `html2canvas` fallaba con
 * `Attempting to parse an unsupported color function "oklch"`.
 */

/** Fondo navy corporativo del módulo de analítica. */
const FONDO_NAVY = '#0b1329'

export interface ImagenCapturada {
  blob: Blob
  dataUrl: string
}

/** Opciones compartidas: 2x para texto nítido al hacer zoom en el celular. */
const OPCIONES_CAPTURA = {
  pixelRatio: 2,
  backgroundColor: FONDO_NAVY,
  cacheBust: true,
} as const

/**
 * Renderiza `elemento` a escala 2x y devuelve tanto el Blob como la dataURL PNG.
 */
export async function capturarElementoComoImagen(
  elemento: HTMLElement,
): Promise<ImagenCapturada> {
  const blob = await toBlob(elemento, OPCIONES_CAPTURA)
  if (!blob) {
    throw new Error('No se pudo generar el blob de la imagen')
  }

  const dataUrl = await toPng(elemento, OPCIONES_CAPTURA)
  return { blob, dataUrl }
}

/** ¿El navegador permite escribir imágenes en el portapapeles? */
export function puedeCopiarImagenAlPortapapeles(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof navigator.clipboard?.write === 'function' &&
    typeof window.ClipboardItem === 'function'
  )
}

/**
 * Copia una imagen PNG al portapapeles. Devuelve `false` (sin lanzar) cuando
 * el navegador no soporta la API o deniega el permiso, para que el llamador
 * pueda caer al modo descarga.
 */
export async function copiarImagenAlPortapapeles(blob: Blob): Promise<boolean> {
  if (!puedeCopiarImagenAlPortapapeles()) return false
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    return true
  } catch (error) {
    console.warn('[imageExporter] Error escribiendo en portapapeles:', error)
    return false
  }
}

/** Dispara la descarga de un Blob en el navegador con el nombre indicado. */
export function descargarBlob(blob: Blob, nombreArchivo: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = nombreArchivo
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
