# MillaOps Hub — Reglas Globales de Código

1. **Invariantes Inviolables:**
   - Todo cruce territorial usa `limpiarBarrio` y `limpiarTexto` de `src/lib/normalizer.ts`.
   - Únicamente se permiten las 27 sucursales autorizadas de `src/lib/zonasPermitidas.ts`.
   - Coexistencia jerárquica P1 (Flotantes/Motos por servicio) y P2 (Dueño general de barrio/Carros).
2. **Tipado Estricto:** Prohibido el uso de `any` o conversiones no seguras (`as any`).
3. **Carga Diferida:** `jspdf` y `xlsx` se importan ÚNICAMENTE de forma dinámica (`import()`).
4. **Referencia Técnica:** Consulta siempre `ARCHITECTURE.md` antes de proponer cambios de estructura.

## Verificación obligatoria

Antes de declarar cualquier cambio como terminado, ejecuta:

```sh
npm run build && npm run lint
```

Ambos deben terminar en **0 errores y 0 warnings**.
