# SIDIDO 2.0 — Sistema Integral de Digitalización y Consulta Documental

> **Ministerio de Educación — Gobierno de San Juan**  
> Modernización del sistema de gestión, digitalización, indexación y consulta de expedientes y resoluciones oficiales.

---

## 🎨 Identidad Visual Oficial

El sistema implementa estrictamente las directrices del **Kit de Marca Oficial de San Juan Gobierno**:
- **Tipografía Oficial:** **Ubuntu** (Dalton Maag / Google Fonts) en toda la interfaz.
- **Paleta de Colores Oficial:**
  - **Pantone 433 C (`#1D252D`):** Gris Institucional / Charcoal para textos, títulos y solidez.
  - **Pantone 179 C (`#E03C31`):** Rojo Cálido Institucional para acciones principales (CTA), botones primarios y estados activos.
  - **Pantone 151 C (`#FF8200`):** Naranja San Juan para procesos de fondo (OCR) y avisos secundarios.
  - **Pantone 114 C (`#FBDD40`):** Amarillo Sol San Juan para resaltado en vivo de búsquedas y elementos destacados.
  - **Superficie y Fondos:** Blanco Puro (`#FFFFFF`) y Gris Suave (`#F8F9FA`), garantizando el respeto del área de seguridad de la marca.
- **Estética Minimalista:** Interfaces despejadas, lectura ágil, eliminación de fricciones y accesibilidad completa (WCAG AA).

---

## 🚀 Características Principales

1. **Consultas y Búsqueda Avanzada (Módulo 1):**
   - **Búsqueda de Texto Completo (FTS):** Motor PostgreSQL configurado en español con `unaccent` (`es_unaccent`), insensible a tildes y mayúsculas.
   - **Filtros Flexibles:** Sin obligación de mínimo de 2 campos. Puede consultar con 0 filtros (lista los más recientes), 1 filtro o combinaciones complejas.
   - **Resaltado de Términos:** Coincidencias resaltadas automáticamente con el color amarillo oficial de San Juan.
   - **Visor PDF Embebido y Descarga Directa:** Visualización fluida del PDF escaneado con control de acceso por sesión.

2. **Anexado y Digitalización (Módulo 2):**
   - Carga con **Arrastrar y Soltar (Drag & Drop)** con barra de progreso en tiempo real y límite de 50 MB.
   - **Validación Automática de Duplicados:** Alerta en vivo en el formulario si ya existe la combinación `(Tipo + Origen + Número + Año)`.
   - **Extracción de Texto y OCR:** Pipeline híbrido (extracción digital instantánea + OCR Tesseract en español).
   - **Baja Lógica y Control de Revisiones:** Registro del motivo obligatorio de baja y trazabilidad de cada cambio.

3. **Seguridad y Auditoría (Módulo 3):**
   - **Roles y Permisos:** `Administrador`, `Operador de carga` y `Consulta`.
   - **Sesiones Seguras:** Tokens criptográficos aleatorios con hash SHA-256 en base de datos y cookies `HttpOnly; SameSite=Lax`. Contraseñas hasheadas con `scrypt`/Argon2.
   - **Auditoría Completa:** Registro inalterable de quién cargó, modificó, consultó o descargó cada documento con exportación a **CSV**.

4. **Administración (Módulo 4):**
   - ABM de Tipos de Documento y Orígenes / Reparticiones.
   - ABM de Usuarios y Asignación de Roles.
   - Panel de control con métricas en tiempo real y gráficos de barras SVG en los colores oficiales.

5. **Migración Masiva del SIDIDO Anterior (Módulo 5):**
   - Script ejecutable para importar archivos CSV y carpetas de PDFs existentes con tolerancia a fallos y generación de informes de errores.

---

## 💻 Requisitos del Entorno

- **Node.js:** v18 o superior (probado en v24.14.1)
- **PostgreSQL:** v15 o superior (con extensiones `unaccent` y `pg_trgm`)

---

## 🛠️ Instalación y Puesta en Marcha

### 1. Clonar o ingresar al directorio
```bash
cd c:\Users\Docente\Desktop\SIDIDO
```

### 2. Configurar variables de entorno
Copie el archivo `.env.example` a `.env`:
```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sidido
PORT=4321
NODE_ENV=development
SESSION_SECRET=sidido_seguridad_san_juan_gob_secret_2026_key
STORAGE_DRIVER=local
STORAGE_LOCAL_PATH=./storage/pdfs
MAX_UPLOAD_MB=50
```

### 3. Instalar dependencias e inicializar la Base de Datos
```bash
# Instalar paquetes
npm install

# Inicializar extensiones de PostgreSQL y FTS en español
node --import tsx/esm scripts/init-db.ts

# Aplicar el esquema Drizzle
npx drizzle-kit push

# Aplicar índices de alto rendimiento y columna calculada search_vector
node --import tsx/esm scripts/setup-indexes.ts

# Cargar usuarios base y datos representativos de prueba
npm run db:seed
```

### 4. Iniciar el Servidor en Local
```bash
# Modo Desarrollo
npm run dev

# O compilar y correr en modo producción:
npm run build
node dist/server/entry.mjs
```
El sistema estará accesible de inmediato en: **`http://localhost:4321`**

---

## 👥 Credenciales de Prueba Preconfiguradas

| Usuario | Contraseña | Rol | Permisos |
|---|---|---|---|
| `admin` | `admin123` | **Administrador** | Acceso total: Consultas, Anexar, Edición, Baja, ABM de Tipos/Orígenes, Usuarios, Auditoría y Estadísticas. |
| `operador` | `operador123` | **Operador** | Consultas, Descargas, Anexar nuevos documentos, Carga de PDF, Edición y Baja lógica. |
| `consulta` | `consulta123` | **Consulta** | Búsqueda avanzada, Visualización de fichas técnicas y Descarga de documentos oficiales. |

---

## 📦 Comandos Disponibles

- `npm run dev`: Inicia el servidor de desarrollo en el puerto 4321.
- `npm run build`: Compila la aplicación Astro SSR lista para producción.
- `npm run db:seed`: Recrea los usuarios y documentos iniciales de prueba.
- `npm run migrate:legacy -- --csv <archivo.csv> --pdfs <carpeta_pdfs>`: Ejecuta la migración masiva de expedientes del sistema anterior.
