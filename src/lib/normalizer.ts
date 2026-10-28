/**
 * Única fuente de verdad para la normalización/limpieza de texto.
 *
 * `limpiarTexto` deja únicamente letras y números en minúscula, eliminando
 * tildes, espacios, guiones y cualquier otro símbolo. Dos cadenas que
 * representen lo mismo serán idénticas el 100% de las veces:
 *
 *   "C1 NUEVO AMANECER"   -> "c1nuevoamanecer"
 *   "C1 - NUEVO AMANECER" -> "c1nuevoamanecer"
 *   "C1 Nuevo Amanecer "  -> "c1nuevoamanecer"
 */
export function limpiarTexto(str: string | null | undefined): string {
  if (!str) return ''
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita tildes
    .replace(/[^a-z0-9]/g, '') // deja solo letras y números
    .trim()
}
