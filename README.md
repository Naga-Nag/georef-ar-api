# Georef AR API — Referencia

API de referencia geográfica argentina. Proporciona búsqueda y consulta de divisiones administrativas, calles, direcciones y ubicación basada en coordenadas de Argentina.

- **Versión**: 2.0.0
- **Runtime**: Bun + Elysia.js
- **URL Base**: `http://<host>:<port>` (por defecto `http://localhost:5000`)
- **Prefijo API**: `/api/`

---

## ✨ Novedades: Exportación en Formato Shapefile

Ahora puede exportar datos geográficos en formato ESRI Shapefile agregando el parámetro `formato=shp` a cualquier endpoint compatible con geometría:

```bash
# Exportar provincias como Shapefile
curl "http://localhost:5000/api/provincias?formato=shp" -o provincias.zip

# Exportar calles específicas
curl "http://localhost:5000/api/calles?nombre=Rivadavia&formato=shp&limit=50" -o calles.zip
```

El archivo ZIP incluye todos los componentes necesarios: `.shp`, `.shx`, `.dbf`, y `.prj` (WGS84).

**Documentación completa**: [docs/SHAPEFILE_EXPORT.md](docs/SHAPEFILE_EXPORT.md)

Endpoints compatibles: `/provincias`, `/departamentos`, `/municipios`, `/localidades`, `/calles`, `/intersecciones`, `/asentamientos`

---

## Tabla de Contenidos

- [Parámetros Comunes](#parámetros-comunes)
- [Envolvente de Respuesta](#envolvente-de-respuesta)
- [Respuestas de Error](#respuestas-de-error)
- [Puntos Finales Auxiliares](#puntos-finales-auxiliares)
  - [GET /](#get-)
  - [GET /health](#get-health)
- [Provincias — Provincias](#provincias--provincias)
  - [GET /api//provincias](#get-apiprovincias)
  - [GET /api//provincias/:id](#get-apiprovinciasid)
- [Departamentos — Departamentos](#departamentos--departamentos)
  - [GET /api//departamentos](#get-apidepartamentos)
  - [GET /api//departamentos/:id](#get-apidepartamentosid)
- [Municipios — Municipios](#municipios--municipios)
  - [GET /api//municipios](#get-apimunicipios)
  - [GET /api//municipios/:id](#get-apimunicipiosid)
- [Localidades — Localidades](#localidades--localidades)
  - [GET /api//localidades](#get-apilocalidades)
  - [GET /api//localidades/:id](#get-apilocalidadesid)
- [Calles — Calles](#calles--calles)
  - [GET /api//calles](#get-apicalles)
  - [GET /api//calles/:id](#get-apicallesid)
- [Asentamientos — Asentamientos](#asentamientos--asentamientos)
  - [GET /api//asentamientos](#get-apiasentamientos)
  - [GET /api//asentamientos/:id](#get-apiasentamientosid)
- [Intersecciones — Intersecciones](#intersecciones--intersecciones)
  - [POST /api//intersecciones](#post-apiintersecciones)
  - [GET /api//intersecciones/:id](#get-apiinterseccionesid)
- [Direcciones — Direcciones](#direcciones--direcciones)
  - [POST /api//direcciones](#post-apidirecciones)
  - [GET /api//direcciones/:id](#get-apidireccionesid)
- [Ubicación — Ubicación](#ubicación--ubicación)
  - [GET /api//ubicacion](#get-apiubicacion)

---

## Parámetros Comunes

Estos parámetros de consulta están disponibles en la mayoría de puntos finales de lista.

| Parámetro | Tipo    | Por Defecto | Descripción |
|-----------|---------|-------------|-------------|
| `limit`   | entero  | `100`       | Máximo de resultados a retornar. Rango: `1–5000`. |
| `offset`  | entero  | `0`         | Cantidad de resultados a omitir (paginación). |
| `campos`  | cadena  | —           | Lista de campos separados por coma a incluir en cada resultado. Soporta notación de punto para campos anidados (ej. `provincia.nombre`). Cuando se omite, los campos de geometría se excluyen por defecto. |
| `aplanar` | booleano| `false`     | Cuando es `true`, aplana objetos anidados en claves delimitadas por `_` (ej. `provincia_nombre`). Solo disponible en el punto final de lista `provincias`. |

---

## Envolvente de Respuesta

Todos los puntos finales de lista retornan la misma envolvente JSON:

```json
{
  "cantidad": 3,
  "inicio": 0,
  "resultados": [ ... ],
  "parametros": {
    "limite": 100,
    "inicio": 0,
    "orden": "asc"
  }
}
```

| Campo        | Tipo    | Descripción |
|--------------|---------|-------------|
| `cantidad`   | entero  | Cantidad de resultados en esta página. |
| `inicio`     | entero  | Offset utilizado en esta página. |
| `resultados` | matriz  | Matriz de entidades coincidentes. |
| `parametros` | objeto  | Echo de los parámetros de consulta aplicados. |

Los puntos finales de entidad única (`/:id`) retornan el objeto de entidad directamente (sin envolvente).

---

## Respuestas de Error

| Estado | Código              | Descripción |
|--------|---------------------|-------------|
| `400`  | `BAD_REQUEST`       | Parámetros faltantes o inválidos. El cuerpo contiene `{ "error": { "codigo": 400, "descripcion": "...", "detalles": "..." } }` |
| `404`  | `NOT_FOUND`         | Recurso no encontrado. Cuerpo: `{ "error": { "codigo": 404, "descripcion": "Recurso no encontrado" } }` |
| `405`  | `METHOD_NOT_ALLOWED` | Método HTTP no permitido. El cuerpo incluye `metodosPermitidos`. |
| `500`  | `INTERNAL_ERROR`     | Error interno del servidor. |

---

## Puntos Finales Auxiliares

### GET /

Retorna metadatos de la API.

**Respuesta**

```json
{
  "name": "Georef AR API",
  "version": "2.0.0",
  "description": "Argentine geographic referencing API",
  "status": "running",
  "endpoints": {
    "health": "/health",
    "documentation": "/docs",
    "api": "/api/"
  },
  "timestamp": "2026-03-21T00:00:00.000Z"
}
```

---

### GET /health

Retorna el estado de salud del servicio y su dependencia de Meilisearch.

**Respuesta**

```json
{
  "status": "healthy",
  "service": "georef-ar-api",
  "version": "2.0.0",
  "timestamp": "2026-03-21T00:00:00.000Z",
  "uptime": 3600,
  "meilisearch": {
    "status": "available"
  },
  "environment": "production"
}
```

| Campo              | Valores                              |
|-------------------|-------------------------------------|
| `status`          | `healthy` \| `degraded` \| `unhealthy` |
| `meilisearch.status` | `available` \| `unavailable`      |
| `uptime`          | Tiempo de actividad del servidor en segundos. |

---

## Provincias — Provincias

### GET /api//provincias

Buscar o listar provincias argentinas.

**Parámetros de Consulta**

| Parámetro | Tipo    | Descripción |
|-----------|---------|-------------|
| `nombre`  | cadena  | Búsqueda difusa en el nombre de la provincia. |
| `nombres` | cadena  | Alias para `nombre`. |
| `exacto`  | booleano| Cuando es `true`, requiere una coincidencia exacta con el nombre en lugar de búsqueda difusa. |
| `limit`   | entero  | Ver [Parámetros Comunes](#parámetros-comunes). |
| `offset`  | entero  | Ver [Parámetros Comunes](#parámetros-comunes). |
| `campos`  | cadena  | Ver [Parámetros Comunes](#parámetros-comunes). |
| `aplanar` | booleano| Cuando es `true`, aplana los objetos de la respuesta anidada. |

**Comportamiento**
- Si se proporciona `nombre` / `nombres`: realiza una búsqueda de texto completo (difusa). Agregue `exacto=true` para coincidencia exacta.
- Si no se proporciona ninguno: retorna todas las provincias.

**Ejemplo**

```
GET /api//provincias?nombre=buenos&limit=5
```

**Respuesta**

```json
{
  "cantidad": 1,
  "inicio": 0,
  "resultados": [
    {
      "id": "06",
      "nombre": "Buenos Aires",
      "centroide": { "lat": -36.6769, "lon": -60.5588 }
    }
  ],
  "parametros": { "limite": 5, "inicio": 0 }
}
```

---

### GET /api//provincias/:id

Recuperar una única provincia por su ID numérico.

**Parámetros de Ruta**

| Parámetro | Tipo   | Descripción          |
|-----------|--------|----------------------|
| `id`      | cadena | ID de provincia (ej. `06`). |

**Parámetros de Consulta**

| Parámetro | Tipo   | Descripción |
|-----------|--------|-------------|
| `campos`  | cadena | Ver [Parámetros Comunes](#parámetros-comunes). |

**Respuesta** — Objeto provincia (sin envolvente).

```json
{
  "id": "06",
  "nombre": "Buenos Aires",
  "centroide": { "lat": -36.6769, "lon": -60.5588 }
}
```

Retorna `404` si no existe una provincia con el ID indicado.

---

## Departamentos — Departamentos

### GET /api//departamentos

Buscar o listar departamentos (divisiones administrativas de segundo nivel).

**Parámetros de Consulta**

| Parámetro  | Tipo    | Descripción |
|------------|---------|-------------|
| `nombre`   | cadena  | Búsqueda difusa en el nombre del departamento. |
| `provincia`| cadena  | Filtrar por ID de provincia. Tiene prioridad sobre `nombre`. |
| `limit`    | entero  | Ver [Parámetros Comunes](#parámetros-comunes). |
| `offset`   | entero  | Ver [Parámetros Comunes](#parámetros-comunes). |
| `campos`   | cadena  | Ver [Parámetros Comunes](#parámetros-comunes). |

**Comportamiento**
- Si `provincia` está presente: retorna todos los departamentos pertenecientes a esa provincia.
- De lo contrario: búsqueda difusa por `nombre`.

**Ejemplo**

```
GET /api//departamentos?provincia=06&limit=10
```

**Respuesta** — Envolvente de lista estándar con objetos departamento.

```json
{
  "cantidad": 10,
  "inicio": 0,
  "resultados": [
    {
      "id": "06007",
      "nombre": "Adolfo Alsina",
      "provincia": { "id": "06", "nombre": "Buenos Aires" }
    }
  ],
  "parametros": { "limite": 10, "inicio": 0 }
}
```

---

### GET /api//departamentos/:id

Recuperar un único departamento por ID.

**Parámetros de Ruta**

| Parámetro | Tipo   | Descripción |
|-----------|--------|-------------|
| `id`      | cadena | ID de departamento. |

**Parámetros de Consulta**

| Parámetro | Tipo   | Descripción |
|-----------|--------|-------------|
| `campos`  | cadena | Ver [Parámetros Comunes](#parámetros-comunes). |

Retorna `404` si no se encuentra.

---

## Municipios — Municipios

### GET /api//municipios

Buscar o listar municipios.

**Parámetros de Consulta**

| Parámetro     | Tipo    | Descripción |
|---------------|---------|-------------|
| `nombre`      | cadena  | Búsqueda difusa en el nombre del municipio. |
| `provincia`   | cadena  | Filtrar por ID de provincia. Prioridad más alta. |
| `departamento`| cadena  | Filtrar por ID de departamento. Se usa cuando `provincia` está ausente. |
| `limit`       | entero  | Ver [Parámetros Comunes](#parámetros-comunes). |
| `offset`      | entero  | Ver [Parámetros Comunes](#parámetros-comunes). |
| `campos`      | cadena  | Ver [Parámetros Comunes](#parámetros-comunes). |

**Comportamiento (orden de prioridad)**
1. `provincia` → retorna todos los municipios en esa provincia.
2. `departamento` → retorna todos los municipios en ese departamento.
3. Búsqueda difusa en `nombre`.

**Ejemplo**

```
GET /api//municipios?nombre=lomas&limit=5
```

---

### GET /api//municipios/:id

Recuperar un único municipio por ID.

**Parámetros de Ruta**

| Parámetro | Tipo   | Descripción |
|-----------|--------|-------------|
| `id`      | cadena | ID de municipio. |

**Parámetros de Consulta**

| Parámetro | Tipo   | Descripción |
|-----------|--------|-------------|
| `campos`  | cadena | Ver [Parámetros Comunes](#parámetros-comunes). |

Retorna `404` si no se encuentra.

---

## Localidades — Localidades

### GET /api//localidades

Buscar o listar localidades (localidades censales).

**Parámetros de Consulta**

| Parámetro  | Tipo    | Descripción |
|------------|---------|-------------|
| `nombre`   | cadena  | Búsqueda difusa en el nombre de la localidad. |
| `provincia`| cadena  | Filtrar por ID de provincia. Prioridad más alta. |
| `municipio`| cadena  | Filtrar por ID de municipio. Se usa cuando `provincia` está ausente. |
| `limit`    | entero  | Ver [Parámetros Comunes](#parámetros-comunes). |
| `offset`   | entero  | Ver [Parámetros Comunes](#parámetros-comunes). |
| `campos`   | cadena  | Ver [Parámetros Comunes](#parámetros-comunes). |

**Comportamiento (orden de prioridad)**
1. `provincia` → retorna todas las localidades en esa provincia.
2. `municipio` → retorna todas las localidades en ese municipio.
3. Búsqueda difusa en `nombre`.

**Ejemplo**

```
GET /api//localidades?nombre=palermo&limit=3
```

---

### GET /api//localidades/:id

Recuperar una única localidad por ID.

**Parámetros de Ruta**

| Parámetro | Tipo   | Descripción |
|-----------|--------|-------------|
| `id`      | cadena | ID de localidad. |

**Parámetros de Consulta**

| Parámetro | Tipo   | Descripción |
|-----------|--------|-------------|
| `campos`  | cadena | Ver [Parámetros Comunes](#parámetros-comunes). |

Retorna `404` si no se encuentra.

---

## Calles — Calles

### GET /api//calles

Buscar o listar calles.

**Parámetros de Consulta**

| Parámetro  | Tipo    | Descripción |
|------------|---------|-------------|
| `nombre`   | cadena  | Búsqueda difusa en el nombre de la calle. |
| `provincia`| cadena  | Filtrar por ID de provincia. Prioridad más alta. |
| `municipio`| cadena  | Filtrar por ID de municipio. |
| `localidad`| cadena  | Filtrar por ID de localidad. |
| `limit`    | entero  | Ver [Parámetros Comunes](#parámetros-comunes). |
| `offset`   | entero  | Ver [Parámetros Comunes](#parámetros-comunes). |
| `campos`   | cadena  | Ver [Parámetros Comunes](#parámetros-comunes). |

**Comportamiento (orden de prioridad)**
1. `provincia` → calles en esa provincia.
2. `municipio` → calles en ese municipio.
3. `localidad` → calles en esa localidad.
4. Búsqueda difusa en `nombre`.

**Ejemplo**

```
GET /api//calles?nombre=corrientes&provincia=02&limit=10
```

---

### GET /api//calles/:id

Recuperar una única calle por ID.

**Parámetros de Ruta**

| Parámetro | Tipo   | Descripción |
|-----------|--------|-------------|
| `id`      | cadena | ID de calle. |

**Parámetros de Consulta**

| Parámetro | Tipo   | Descripción |
|-----------|--------|-------------|
| `campos`  | cadena | Ver [Parámetros Comunes](#parámetros-comunes). |

Retorna `404` si no se encuentra.

---

## Asentamientos — Asentamientos

Los asentamientos son asentamientos informales (villas, asentamientos informales) que pueden no aparecer en el índice de localidades estándar.

### GET /api//asentamientos

Buscar o listar asentamientos.

**Parámetros de Consulta**

| Parámetro  | Tipo    | Descripción |
|------------|---------|-------------|
| `nombre`   | cadena  | Búsqueda difusa en el nombre del asentamiento. |
| `provincia`| cadena  | Filtrar por ID de provincia. Tiene prioridad sobre `nombre`. |
| `limit`    | entero  | Ver [Parámetros Comunes](#parámetros-comunes). |
| `offset`   | entero  | Ver [Parámetros Comunes](#parámetros-comunes). |
| `campos`   | cadena  | Ver [Parámetros Comunes](#parámetros-comunes). |

**Comportamiento**
- Si `provincia`: retorna todos los asentamientos en esa provincia.
- De lo contrario: búsqueda difusa por `nombre`.

**Ejemplo**

```
GET /api//asentamientos?nombre=villa&limit=10
```

---

### GET /api//asentamientos/:id

Recuperar un único asentamiento por ID.

**Parámetros de Ruta**

| Parámetro | Tipo   | Descripción |
|-----------|--------|-------------|
| `id`      | cadena | ID de asentamiento. |

**Parámetros de Consulta**

| Parámetro | Tipo   | Descripción |
|-----------|--------|-------------|
| `campos`  | cadena | Ver [Parámetros Comunes](#parámetros-comunes). |

Retorna `404` si no se encuentra.

---

## Intersecciones — Intersecciones

### POST /api//intersecciones

Encontrar intersecciones de calles que coincidan con dos nombres de calle.

**Cuerpo de la Solicitud** (JSON) o parámetros de consulta

| Campo    | Tipo    | Requerido | Descripción |
|----------|---------|-----------|-------------|
| `calle1` | cadena  | Sí        | Nombre de la primera calle. También acepta `calle` como alias. |
| `calle2` | cadena  | Sí        | Nombre de la segunda calle. |
| `limit`  | entero  | No        | Máximo de resultados (por defecto `100`, máximo `5000`). |
| `offset` | entero  | No        | Offset de paginación (por defecto `0`). |

Tanto `calle1` como `calle2` son requeridos. La búsqueda es **bidireccional**: coincide con intersecciones donde `(calle1=A ∧ calle2=B) OR (calle1=B ∧ calle2=A)`.

**Ejemplo**

```http
POST /api//intersecciones
Content-Type: application/json

{
  "calle1": "Corrientes",
  "calle2": "Florida",
  "limit": 5
}
```

**Respuesta**

```json
{
  "cantidad": 1,
  "inicio": 0,
  "resultados": [
    {
      "id": "0200701002370-0200701002100",
      "nombre": "CORRIENTES y FLORIDA",
      "calle1": { "id": "0200701002370", "nombre": "CORRIENTES" },
      "calle2": { "id": "0200701002100", "nombre": "FLORIDA" },
      "provincia": { "id": "02", "nombre": "Ciudad Autónoma de Buenos Aires" }
    }
  ],
  "parametros": { "limite": 5, "inicio": 0 }
}
```

Retorna `400` si falta `calle1` o `calle2`.

---

### GET /api//intersecciones/:id

Recuperar una única intersección por ID.

**Parámetros de Ruta**

| Parámetro | Tipo   | Descripción      |
|-----------|--------|------------------|
| `id`      | cadena | ID de intersección. |

Retorna `404` si no se encuentra.

---

## Direcciones — Direcciones

### POST /api//direcciones

Geocodificar una dirección de calle (nombre de calle + número de puerta) a un registro de cuadra.

**Cuerpo de la Solicitud** (JSON) o parámetros de consulta

| Campo      | Tipo    | Requerido | Descripción |
|------------|---------|-----------|-------------|
| `calle`    | cadena  | Sí        | Nombre de calle. También acepta `street`. |
| `altura`   | entero  | Sí        | Número de puerta (debe ser un entero positivo). También acepta `number`. |
| `provincia`| cadena  | No        | ID de provincia para restringir la búsqueda. |
| `limit`    | entero  | No        | Máximo de resultados (por defecto `100`, máximo `5000`). |
| `offset`   | entero  | No        | Offset de paginación (por defecto `0`). |

**Comportamiento**

Busca en el índice de `cuadras` (cuadra/bloque) usando un filtro de rango:  
`altura_inicio <= <altura> AND altura_fin >= <altura>`  
Esto retorna la(s) cuadra(s) que cubre(n) el número de puerta dado en la calle nombrada. Cuando se proporciona `provincia`, los resultados se restringen aún más a esa provincia.

**Ejemplo**

```http
POST /api//direcciones
Content-Type: application/json

{
  "calle": "Corrientes",
  "altura": 1234,
  "provincia": "02"
}
```

**Respuesta**

```json
{
  "cantidad": 1,
  "inicio": 0,
  "resultados": [
    {
      "id": "0200701002370-1200-1298",
      "calle": { "id": "0200701002370", "nombre": "CORRIENTES" },
      "altura_inicio": 1200,
      "altura_fin": 1298,
      "provincia": { "id": "02", "nombre": "Ciudad Autónoma de Buenos Aires" },
      "geometria": { ... }
    }
  ],
  "parametros": { "limite": 100, "inicio": 0 }
}
```

Retorna `400` si `calle` o `altura` falta o es inválido.

---

### GET /api//direcciones/:id

Recuperar un único registro de cuadra por ID.

**Parámetros de Ruta**

| Parámetro | Tipo   | Descripción    |
|-----------|--------|----------------|
| `id`      | cadena | ID de cuadra. |

Retorna `404` si no se encuentra.

---

## Ubicación — Ubicación

### GET /api//ubicacion

Geocodificación inversa de coordenadas geográficas a la provincia, departamento y municipio que las contiene.

**Parámetros de Consulta**

| Parámetro | Tipo   | Requerido | Descripción |
|-----------|--------|-----------|-------------|
| `lat`     | número | Sí        | Latitud en grados decimales. Rango: `[-90, 90]`. |
| `lon`     | número | Sí        | Longitud en grados decimales. Rango: `[-180, 180]`. |

Retorna `400` si faltan coordenadas o están fuera del rango.

**Ejemplo**

```
GET /api//ubicacion?lat=-34.6037&lon=-58.3816
```

**Respuesta**

```json
{
  "resultado": {
    "provincia": {
      "id": "02",
      "nombre": "Ciudad Autónoma de Buenos Aires"
    },
    "departamento": {
      "id": "02007",
      "nombre": "Comuna 1"
    },
    "municipio": {
      "id": "020007",
      "nombre": "Ciudad Autónoma de Buenos Aires"
    },
    "lat": -34.6037,
    "lon": -58.3816
  }
}
```

Cualquiera de los objetos anidados puede tener valores `null` para `id` y `nombre` si el punto no cae dentro de una frontera conocida para ese nivel.

---

## Selección de Campos (`campos`)

El parámetro `campos` acepta una lista de campos separados por coma a incluir en la respuesta. Los campos de objetos anidados se pueden acceder usando notación de punto.

| Valor de ejemplo `campos` | Efecto |
|---------------------------|--------|
| `id,nombre`               | Retorna solo `id` y `nombre`. |
| `id,nombre,provincia`     | Retorna `id`, `nombre` y el objeto completo `provincia`. |
| `id,provincia.nombre`     | Retorna `id` y solo el subcampo `nombre` de `provincia`. |

Cuando se omite `campos`, los campos de geometría (`geometria`, `geometry`) se excluyen automáticamente para mantener las respuestas ligeras.

---

## Paginación

Use `limit` y `offset` para paginar a través de los resultados.

```
GET /api//calles?nombre=san martin&limit=50&offset=100
```

| Parámetro | Máximo | Por Defecto |
|-----------|--------|-------------|
| `limit`   | 5000   | 100         |
| `offset`  | —      | 0           |

El campo `cantidad` en la respuesta le indica cuántos resultados hay en la página actual. Si `cantidad < limit`, ha alcanzado la última página.

---

## Referencia de Configuración

El servidor se configura a través de variables de entorno.

| Variable de Entorno              | Por Defecto                | Descripción |
|----------------------------------|----------------------------|-------------|
| `PORT` / `APP_PORT`              | `5000`                     | Puerto de escucha. |
| `HOST` / `API_HOST`              | `0.0.0.0`                  | Dirección de vinculación. |
| `NODE_ENV` / `ENVIRONMENT`       | `production`               | Entorno en tiempo de ejecución (`development`, `production`, `test`). |
| `MEILISEARCH_HOST`               | `http://localhost:7700`    | URL de la instancia de Meilisearch. |
| `MEILISEARCH_API_KEY` / `MEILI_MASTER_KEY` | —         | Clave de autenticación de Meilisearch. |
| `DATA_VERSION`                   | `1.0.0`                    | Etiqueta de versión para los datos indexados. |
| `LOG_LEVEL`                      | `info`                     | Verbosidad del registro (`debug`, `info`, `warn`, `error`). |
| `CORS_ORIGIN`                    | `*` en desarrollo, ninguno en producción | Origen CORS permitido. |
| `DISABLE_CACHE`                  | —                          | Establecer en `true` para desactivar encabezados de control de caché HTTP. |
| `API_REQUEST_TIMEOUT`            | `30000`                    | Timeout de solicitud en milisegundos. |
| `ENABLE_METRICS`                 | `false`                    | Habilitar recopilación de métricas. |
