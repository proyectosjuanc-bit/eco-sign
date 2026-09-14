/**
 * Tipos del esquema multi-tenant de ECO-SIGN.
 *
 * Escritos a mano para reflejar el esquema ya creado en Supabase. Cada tabla
 * declara tres formas: `Row` (lo que devuelve un select), `Insert` (lo que se
 * envía en un insert, con los valores que tienen default marcados opcionales)
 * y `Update` (todo opcional). El cliente de Supabase se tipa con `Database`
 * para que los selects e inserts se validen en compilación.
 *
 * `tenant_id` es opcional en los Insert porque las políticas RLS lo rellenan
 * con `current_tenant_id()` como valor por defecto de columna.
 */

export type Rol = "admin" | "operador";

/** Valores que admite el CHECK de jobs.estado; el default es "pendiente". */
export type EstadoTrabajo = "pendiente" | "en_proceso" | "terminado";

/**
 * Tipos de ahorro que alimentan el ROI Circular. Son los cuatro valores que
 * admite el CHECK de savings.tipo.
 */
export type TipoAhorro =
  | "reutilizacion"
  | "compra_evitada"
  | "optimizacion"
  | "otro";

export type Unidad = "m2" | "unidad" | "metro_lineal";

export type Tenant = {
  id: string;
  nombre: string;
  created_at: string;
};

export type Profile = {
  id: string;
  tenant_id: string;
  email: string;
  nombre: string | null;
  rol: Rol;
};

export type Material = {
  id: string;
  tenant_id: string;
  tipo: string;
  color: string | null;
  grosor_mm: number | null;
  /** Precio por m². Se deriva de costo_lamina y las medidas. */
  costo_unitario: number;
  unidad: Unidad;
  /** Medidas de una lámina. Nulas si el material no se vende por lámina. */
  ancho_cm: number | null;
  alto_cm: number | null;
  /** Lo que cuesta una lámina entera. */
  costo_lamina: number | null;
  /** Láminas disponibles; se descuenta al consumir material en un trabajo. */
  stock_laminas: number;
};

export type InventoryItem = {
  id: string;
  tenant_id: string;
  material_id: string | null;
  ancho_cm: number;
  alto_cm: number;
  grosor_mm: number | null;
  color: string | null;
  foto_url: string | null;
  costo_estimado: number | null;
  usado: boolean;
  /** Trabajo del que salió el sobrante, si se conoce. */
  job_id: string | null;
};

export type Job = {
  id: string;
  tenant_id: string;
  nombre: string;
  cliente: string | null;
  fecha: string;
  estado: EstadoTrabajo;
};

/**
 * Cómo se registró el consumo de una fila de job_items.
 *
 * "pieza" es un corte individual; "lamina" es el material total gastado de ese
 * tipo, útil cuando se aprovechó una plancha entera y contar cortes uno a uno
 * daría un consumo menor que el real.
 */
export type ModoPieza = "pieza" | "lamina";

export type JobItem = {
  id: string;
  job_id: string;
  /** Obligatorio: la columna es NOT NULL, a diferencia del resto de tablas. */
  material_id: string;
  ancho_cm: number;
  alto_cm: number;
  cantidad: number;
  modo: ModoPieza;
  /** En formas irregulares, ancho y alto son el rectángulo envolvente. */
  descripcion: string | null;
  foto_url: string | null;
};

/**
 * De dónde salió un registro de desperdicio.
 *
 * "recortes" lo calcula el sistema al cerrar un trabajo: es el material que se
 * consumió menos el que acabó en piezas aprovechadas, y evita tener que medir
 * uno a uno los pedacitos que quedan de una lámina.
 */
export type OrigenDesperdicio = "manual" | "recortes";

export type WasteLog = {
  id: string;
  tenant_id: string;
  /** Obligatorio: la columna es NOT NULL, igual que en job_items. */
  material_id: string;
  /** Cantidad en la unidad del material; se deriva de las medidas si las hay. */
  cantidad: number;
  motivo: string | null;
  foto_url: string | null;
  costo: number | null;
  /** Medidas del material perdido. Nulas si no es una pieza medible. */
  ancho_cm: number | null;
  alto_cm: number | null;
  job_id: string | null;
  origen: OrigenDesperdicio;
};

export type Saving = {
  id: string;
  tenant_id: string;
  job_id: string | null;
  tipo: TipoAhorro;
  monto: number;
  descripcion: string | null;
  fecha: string;
};

/** Columnas que la base rellena sola: nunca se envían en un insert. */
type Generado = "id" | "created_at";

/**
 * `tenant_id` NO se omite en los inserts: las tablas no tienen default para esa
 * columna, y RLS rechaza toda fila que llegue sin ella. Se deja como obligatoria
 * para que el compilador avise si algún insert la olvida.
 */
type DeTenant = never;

/** Claves cuyo tipo admite null: en un insert se pueden omitir. */
type ClavesNulables<T> = {
  [K in keyof T]-?: null extends T[K] ? K : never;
}[keyof T];

/**
 * Forma de un insert: se quitan las columnas que genera la base y las que
 * rellena RLS, y se vuelven opcionales las nulables y las que tienen default.
 */
type Insertable<T, Opcional extends keyof T = never> = Omit<
  T,
  Extract<Generado | DeTenant, keyof T> | Opcional | ClavesNulables<T>
> &
  Partial<
    Pick<T, Extract<Generado | DeTenant | Opcional | ClavesNulables<T>, keyof T>>
  >;

export interface Database {
  public: {
    Tables: {
      tenants: {
        Row: Tenant;
        Insert: Insertable<Tenant>;
        Update: Partial<Tenant>;
        Relationships: [];
      };
      profiles: {
        Row: Profile;
        Insert: Insertable<Profile, "rol">;
        Update: Partial<Profile>;
        Relationships: [];
      };
      materials: {
        Row: Material;
        Insert: Insertable<Material, "stock_laminas">;
        Update: Partial<Material>;
        Relationships: [];
      };
      inventory_items: {
        Row: InventoryItem;
        Insert: Insertable<InventoryItem, "usado">;
        Update: Partial<InventoryItem>;
        Relationships: [];
      };
      jobs: {
        Row: Job;
        Insert: Insertable<Job, "fecha" | "estado">;
        Update: Partial<Job>;
        Relationships: [];
      };
      job_items: {
        Row: JobItem;
        Insert: Insertable<JobItem, "cantidad" | "modo">;
        Update: Partial<JobItem>;
        Relationships: [];
      };
      waste_logs: {
        Row: WasteLog;
        Insert: Insertable<WasteLog, "origen">;
        Update: Partial<WasteLog>;
        Relationships: [];
      };
      savings: {
        Row: Saving;
        Insert: Insertable<Saving, "fecha">;
        Update: Partial<Saving>;
        Relationships: [];
      };
    };
    /** El MVP1 no usa vistas, pero GenericSchema exige la clave. */
    Views: Record<never, never>;
    Functions: {
      current_tenant_id: {
        Args: Record<string, never>;
        Returns: string;
      };
    };
  };
}
