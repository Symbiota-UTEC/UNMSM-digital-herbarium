# DESIGN.md — Sistema de diseño del frontend

Referencia visual para diseñar pantallas/componentes nuevos (a mano o con IA) que se vean
coherentes con el resto de la app. Para convenciones de código (routing, servicios, estructura
de archivos) ver [`CLAUDE.md`](CLAUDE.md) — este documento es solo sobre lo visual.

Stack: React 18 + TypeScript, Tailwind v4 **pre-compilado** (ver advertencia más abajo, es la
trampa más importante de todo este documento), shadcn/ui (Radix) + `lucide-react` para íconos.

---

## 1. Colores

Todos los tokens viven como variables CSS en `:root` de `src/index.css` (línea ~2642) y se
consumen vía las clases de Tailwind que ya usa el resto de la app (`bg-primary`,
`text-muted-foreground`, etc.) — nunca un hex suelto si ya existe un token para ese rol.

| Token | Hex | Uso |
|---|---|---|
| `--background` | `#eaecf3` | Fondo de página (gris azulado muy claro) |
| `--foreground` | `#1a1a2e` | Texto principal |
| `--card` | `#ffffff` | Fondo de `Card`, diálogos, popovers |
| `--primary` | `#8b2323` | Color de marca — rojo vino oscuro. Botones primarios, sidebar activo, focus ring |
| `--primary-foreground` | `#ffffff` | Texto sobre `--primary` |
| `--secondary` / `--muted` | `#f4f5f7` | Fondos secundarios, badges neutros, hover sutil |
| `--muted-foreground` | `#6b7280` | Texto secundario / subtítulos |
| `--accent` | `#ba7e7e` | Rosa apagado — acentos puntuales, hover de accent |
| `--destructive` | `#e02040` | Acciones destructivas (eliminar) |
| `--border` | `rgba(0,0,0,.09)` | Bordes de card/input, casi invisible a propósito |
| `--sidebar` | `#1f0909` | Fondo del sidebar (mucho más oscuro que el resto de la app) |
| `--sidebar-accent` | `#2e1010` | Hover de ítem del sidebar |
| `--sidebar-primary` | `#8b2323` | Ítem activo del sidebar — mismo rojo que `--primary` |

**Modo oscuro:** existe un bloque `.dark { ... }` en `index.css` (heredado del scaffold de
shadcn), pero **no está conectado a nada** — no hay `ThemeProvider` ni toggle en la app. No
asumas que el modo oscuro funciona hoy; si se activa, hay que revisar esas variables primero.

**Sidebar con hex sueltos:** `PrivateSidebar.tsx` no usa las variables de arriba, tiene sus
propias constantes (`BG = "#1f0909"`, `BG_HOVER = "#2e1010"`, `BG_ACTIVE = "#8b2323"`) que
casualmente coinciden con `--sidebar`/`--sidebar-accent`/`--sidebar-primary`. Si cambias el tema
del sidebar, hay que tocar los dos lugares (es deuda técnica conocida, no una decisión de diseño).

### Paletas de badges de estado (roles / identificación)

Dos paletas separadas a propósito — mismo tono de azul en una y otra no significa lo mismo:

**Roles** (`src/constants/roleBadge.ts`) — usada en la lista de colecciones, "Usuarios con
Acceso" de una colección, y el rol propio en el perfil:

| Rol | Fondo | Texto | Clase Tailwind |
|---|---|---|---|
| Superuser | morado claro | morado oscuro | `bg-purple-100 text-purple-800` |
| Admin institución | naranja claro | naranja oscuro | `bg-orange-100 text-orange-800` |
| Propietario (Owner) | azul claro | azul oscuro | `bg-blue-100 text-blue-800` |
| Editor | verde muy claro | verde oscuro | `bg-green-50 text-green-700` |
| Lector (Viewer) | gris claro | gris oscuro | `bg-gray-100 text-gray-800` |

**Estado de identificación / taxón** (`src/constants/identificationStatus.ts`) — Vigente/Actual,
estado de verificación, tipo (holotype, etc.), y "Accepted" en el estado taxonómico:

| Estado | Fondo | Texto | Hex (estilo inline, no clase) |
|---|---|---|---|
| Vigente / Actual / Accepted | verde claro | verde oscuro | `{ backgroundColor: "#dcfce7", color: "#166534" }` |
| Verificación | azul claro | azul oscuro | `{ backgroundColor: "#dbeafe", color: "#1e40af" }` |
| Tipo (holotype, etc.) | morado claro | morado oscuro | `{ backgroundColor: "#f3e8ff", color: "#6b21a8" }` |

Van en `style={{}}` y no en clases Tailwind porque `bg-green-100`/`text-green-800` nunca se
compilaron en `index.css` (ver §6) — quedaban invisibles.

### Mapa (MapPage.tsx)

No usa la paleta de arriba — colorea por `fullyContained` (si el área buscada contiene toda la
forma del registro, o solo la toca):
- **Verde oscuro** — coincide y está totalmente contenido.
- **Verde claro** — coincide pero solo se solapa (círculo de incertidumbre o polígono parcialmente afuera).
- **Azul marino** — el punto/área de búsqueda misma (nunca un verde, para no confundirla con un resultado).

---

## 2. Tipografía

Dos familias, cargadas por `<link>` en `index.html` (no hay que declarar `font-family` a mano):

- **Texto general:** `Inter` — `body { font-family: 'Inter', ... }`.
- **Encabezados (`h1`–`h6`):** `Hanken Grotesk` — se aplica solo por el selector de tag, así que
  un `<div>` con clases de tamaño de heading NO hereda esta fuente a menos que sea literalmente
  un `h1`–`h6` o se le fuerce la familia a mano.

| Uso | Clases | Tamaño |
|---|---|---|
| Título de página (H1) | `text-3xl font-semibold tracking-tight mb-2` | 30px |
| Título de sección dentro de una página | `text-2xl` | 24px |
| Título de card / `FiltersCard` | `text-lg font-semibold tracking-tight` | 18px |
| Cuerpo / valores de formulario | `text-sm` | 14px |
| Etiqueta de campo de filtro | `text-xs font-semibold text-muted-foreground` | 12px |
| Texto de ayuda / pie | `text-xs text-muted-foreground` | 12px |

**Pesos disponibles:** solo `font-medium` (500) y `font-semibold` existen compilados —
`font-bold` no está, no lo uses (ver §6).

**Regla de jerarquía en `FiltersCard`:** el título SIEMPRE debe ser más grande que las etiquetas
de campo — nunca al revés.

---

## 3. Espaciado y radios

- **Radio base:** `--radius: .625rem` (10px). shadcn deriva de ahí: `rounded-sm` = radius−4px,
  `rounded-md` = radius−2px, `rounded-lg` = radius, `rounded-xl` = radius+4px. `Card` usa
  `rounded-xl`; `Button`/`Input`/`Badge` usan `rounded-md`; los badges de estado/rol de arriba
  usan `rounded-full` (pastilla).
- **Espaciado entre bloques:** `gap-6` es el espaciado por defecto entre `CardHeader` y
  `CardContent` (viene del propio componente `Card`, `flex flex-col gap-6`) — **no** le agregues
  `pt-*` extra a `CardContent` cuando ya hay un `CardHeader` arriba, se duplica el aire (bug real
  que ya se dio en `CollectionDetailPage.tsx`).
- **Padding de página:** `container mx-auto px-4 py-8` en el div raíz de cada página (ver §4).
- **Solo enteros:** `gap-1.5`, `py-1.5`, `px-1.5` (y cualquier `.5` fraccionario) no están
  compilados salvo las pocas excepciones que ya se usan en el código (`gap-1.5`, `py-1.5` sí
  existen; `px-1.5`, `space-y-1.5`, `w-1.5`/`h-1.5` no). Ver §6 antes de usar cualquiera.

---

## 4. Layout de página

Toda página sigue esta forma (de `CLAUDE.md`):

```tsx
<div className="container mx-auto px-4 py-8">
  <div className="flex justify-between items-center mb-6">
    <div>
      <h1 className="text-3xl font-semibold tracking-tight mb-2">Título</h1>
      <p className="text-sm text-muted-foreground">Subtítulo</p>
    </div>
    {/* botón de acción, si aplica */}
  </div>
  <Card>
    <CardHeader>...</CardHeader>
    <CardContent>
      <Table>...</Table>
      {/* paginación */}
    </CardContent>
  </Card>
</div>
```

**Tablas** — la última columna ("Acciones") siempre pegada al borde derecho: `width: "1px"` +
`whitespace-nowrap` en el `TableHead`/`TableCell`, contenido envuelto en
`<div className="flex justify-end gap-2">`. Nunca `text-center`/`justify-center` en esa columna.
`DataTable` (ver §5) ya lo hace solo.

---

## 5. Componentes

### Primitivas shadcn disponibles (`src/components/ui/`)

Ya están instaladas y listas para usar — no reinventarlas: `accordion`, `alert`, `alert-dialog`,
`avatar`, `badge`, `breadcrumb`, `button`, `calendar` (⚠ no usar, ver §6), `card`, `carousel`,
`chart`, `checkbox`, `collapsible`, `command`, `context-menu`, `dialog`, `drawer`,
`dropdown-menu`, `form`, `hover-card`, `input`, `input-otp`, `label`, `menubar`,
`navigation-menu`, `password-input`, `popover`, `progress`, `radio-group`, `resizable`,
`scroll-area`, `select`, `separator`, `sheet`, `sidebar`, `skeleton`, `slider`, `sonner` (toasts),
`switch`, `table`, `tabs`, `textarea`, `toggle`, `toggle-group`, `tooltip`.

**`Button`** — variantes: `default` (primario, rojo), `destructive`, `outline`, `secondary`,
`ghost`, `link`. Tamaños: `default` (h-9), `sm` (h-8), `lg` (h-10), `icon` (cuadrado, size-9).

**`Badge`** — variantes: `default` (bg-primary), `secondary` (gris), `destructive`, `outline`.
Para un color específico (rol, estado) se pasa `className`/`style` encima de la variante — ver
§1, las tablas de colores ya están pensadas para pegarse sobre `<Badge>`.

### Building blocks propios (no shadcn, no reinventar)

- **`DataTable`** (`ui/data-table.tsx`) — toda lista paginada. Columnas ordenables (clic:
  activa → invierte → desactiva, con flechas ↑/↓/⇅), skeleton solo en la primera carga,
  `LoadingOverlay` en refetch (sin colapsar la tabla), paginación integrada. `TablePagination`
  se puede usar suelto si no hace falta la tabla completa (una lista de cards paginada, p. ej.).
- **`FiltersCard`** + campos de `ui/filters.tsx` (`FilterAutocompleteInput`,
  `FilterDateRangePicker`, etc.) — todo formulario de filtro. Ver la tabla de jerarquía
  tipográfica en §2.
- **`AutocompleteDropdown`** + hook `useSuggestions` (`ui/autocomplete.tsx`) — cualquier
  autocompletado. Las sugerencias anteriores quedan atenuadas mientras llega la respuesta nueva,
  nunca desaparecen de golpe.
- **`LoadingOverlay`** + `SkeletonBar` + `useSettled` (`ui/loading-overlay.tsx`) — estado de
  carga de listas que no son `DataTable`. Nunca reemplazar una lista existente por un
  "Cargando…" en un refetch: colapsa la página y resetea el scroll.

### Íconos

`lucide-react`, imports nombrados (`import { Eye, Pencil } from "lucide-react"`), tamaño usual
`h-4 w-4` (16px) en botones y `h-3 w-3` (12px) dentro de badges pequeños.

---

## 6. La trampa de Tailwind (leer antes de diseñar nada nuevo)

`src/index.css` es la **salida pre-compilada** de Tailwind v4 — el navegador la lee tal cual, no
se regenera sola en cada build. `src/styles/globals.css` es la fuente, pero requiere correr el
CLI de Tailwind a mano para propagar un cambio.

**Consecuencia:** una clase de Tailwind que no esté ya usada en algún archivo del proyecto **no
existe en el CSS compilado y falla en silencio** — sin error, sin warning, el elemento
simplemente no tiene ese estilo. Esto ya causó bugs reales (un punto de "tiene datos" invisible,
badges de estado sin color, texto sin el tamaño pedido).

**Antes de usar una clase que no hayas visto en el código:**
```bash
grep -o "\.tu-clase-aqui\b" src/index.css
```
Si no aparece, usa `style={{}}` inline en su lugar (es lo que se hizo en todos los casos de
abajo), un `.css` aparte importado por el componente (precedente: `utils/map.css`,
`ui/feedback.css`), o corre el CLI de Tailwind para regenerar `index.css`.

**Confirmado NO compilado** (usar `style` inline):
- Tamaños arbitrarios: `text-[11px]`, `text-[10px]`, cualquier `text-[...]`.
- Transformaciones de texto: `uppercase`, `tracking-wide`/`wider`/`widest` (solo existe `tracking-tight`).
- `font-bold` (solo `font-medium` y `font-semibold`).
- Espaciado fraccionario salvo `gap-1.5`/`py-1.5`: `px-1.5`, `space-y-1.5`, `space-x-1.5`,
  `w-1.5`/`h-1.5`/`ml-1.5`/`mt-1.5`.
- Colores puntuales fuera de los ya usados en la app: `bg-green-100`, `text-green-800` (por
  ejemplo — cualquier combinación color+tono que no aparezca ya en otro componente es sospechosa,
  confírmala con el `grep` de arriba antes de asumir que existe).

**Sí está compilado y es seguro reutilizar:** todo lo que ya aparece en las tablas de §1/§2 —
`bg-purple-100`/`text-purple-800`, `bg-blue-100`/`text-blue-800`, `bg-green-50`/`text-green-700`,
`bg-gray-100`/`text-gray-800`, `bg-orange-100`/`text-orange-800`, `capitalize`, `gap-1.5`, `py-1.5`.

**`Calendar` (react-day-picker):** su CSS no está compilado — no lo uses en un `Popover` para
rangos de fecha, usa `FilterDateRangePicker` (dos `<input type="date">` nativos).

---

## 7. Cuando generes una pantalla nueva con IA

1. Empieza por la plantilla de §4 y los componentes de §5 — no inventes un layout desde cero.
2. Para cualquier badge de estado/rol, reusa las paletas de §1 en vez de elegir un color nuevo.
3. Antes de escribir una clase Tailwind que no reconozcas del resto del código, corre el `grep`
   de §6. Si dudas, usa `style={{}}` — es más lento de escribir pero nunca falla en silencio.
4. Sigue la jerarquía tipográfica de §2 (título de card > etiqueta de campo, nunca al revés).
5. Si la pantalla necesita una lista paginada, un formulario de filtros o un autocompletado, usa
   los building blocks de §5 — no hay necesidad de reconstruirlos.
