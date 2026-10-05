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

/** admin: dueño/gerente · operario: registra pero no gestiona · lectura: sólo ve. */
export type Rol = "admin" | "operario" | "lectura";

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

export type Unidad = "m2" | "unidad" | "metro_lineal" | "ml";

export type Tenant = {
  id: string;
  nombre: string;
  created_at: string;
  nit: string | null;
  telefono: string | null;
  ciudad: string | null;
  direccion: string | null;
  updated_at: string;
  /** Un taller suspendido (desde /admin) deja de ver y escribir datos. */
  estado: "activo" | "suspendido";
  suspendido_en: string | null;
};

/** Quién es superadmin de la plataforma (tabla superadmins). */
export type Superadmin = {
  user_id: string;
  agregado_por: string | null;
  created_at: string;
};

/** Registro de acciones de superadmin (tabla superadmin_log). */
export type SuperadminLog = {
  id: string;
  actor: string | null;
  actor_email: string | null;
  accion: string;
  detalle: Record<string, unknown>;
  created_at: string;
};

export type Profile = {
  id: string;
  tenant_id: string;
  email: string;
  nombre: string | null;
  rol: Rol;
  activo: boolean;
  ultimo_acceso: string | null;
  updated_at: string;
};

/** Invitación para sumar a una persona a un taller (tabla `invitaciones`). */
export type Invitacion = {
  id: string;
  tenant_id: string;
  email: string;
  rol: Rol;
  token: string;
  invitado_por: string;
  expira_en: string;
  aceptada: boolean;
  aceptada_en: string | null;
  created_at: string;
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
  /** Ya no se ofrece al registrar, pero su historial se conserva. */
  archivado: boolean;
  /** Sólo líquidos (unidad ml): ml que gasta el taller por m² impreso o pegado. */
  ml_por_m2: number | null;
};

export type InventoryItem = {
  id: string;
  tenant_id: string;
  /**
   * lamina: láminas completas (cantidad = nº de láminas, ancho/alto = tamaño).
   * retal: un sobrante con medidas y código (cantidad 1).
   * metros / unidades: cantidad = metros o unidades (ancho/alto 1×1 neutros).
   */
  clase: ClaseInventario;
  /** Obligatorio: la columna es NOT NULL, igual que en job_items y waste_logs. */
  material_id: string;
  ancho_cm: number;
  alto_cm: number;
  /**
   * Unidades sueltas en este sobrante. 1 para un retal de lámina (ancho_cm ×
   * alto_cm es su medida real); mayor que 1 sólo con un material "por
   * unidad", donde ancho_cm/alto_cm quedan en 1×1 como valor neutro.
   */
  cantidad: number;
  grosor_mm: number | null;
  color: string | null;
  foto_url: string | null;
  costo_estimado: number | null;
  usado: boolean;
  /** Trabajo del que salió el sobrante, si se conoce. */
  job_id: string | null;
  /**
   * Código corto tipo "SOB-014", consecutivo por tenant. Nulo sólo en filas
   * que ya existían antes de esta columna; toda fila nueva debe traerlo, así
   * que se fuerza como obligatorio en el Insert (ver `Requerido` más abajo)
   * aunque el tipo admita null.
   */
  codigo: string | null;
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
 * Qué es una fila de job_items.
 *
 * "salida": material sacado del inventario para el trabajo (lámina completa,
 * retal, metros o unidades; lleva inventory_item_id). "pieza": lo que se
 * entrega al cliente, con sus medidas; sirve para calcular cuánto se perdió en
 * recortes (salidas − piezas − sobrantes devueltos).
 */
export type ModoPieza = "pieza" | "salida";

/** Las cuatro clases de cosas que guarda el inventario. */
export type ClaseInventario = "lamina" | "retal" | "metros" | "unidades" | "mililitros";

export type JobItem = {
  id: string;
  job_id: string;
  /** En una salida: de qué ítem del inventario salió. */
  inventory_item_id: string | null;
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
  created_at: string;
};

export type Saving = {
  id: string;
  tenant_id: string;
  job_id: string | null;
  tipo: TipoAhorro;
  monto: number;
  descripcion: string | null;
  fecha: string;
  /** Ahorro por usar un retal: la línea del trabajo que lo generó. */
  job_item_id: string | null;
};

/**
 * Venta de un sobrante tal cual, sin cortarlo. Es dinero que ENTRA, distinto
 * de `savings` (dinero que se dejó de gastar) — no se suma al ROI Circular.
 */
export type Sale = {
  id: string;
  tenant_id: string;
  inventory_item_id: string;
  monto: number;
  descripcion: string | null;
  fecha: string;
};

/** Valores del CHECK de machines.tipo. */
export type TipoMaquina =
  | "impresora_gran_formato"
  | "laser_corte"
  | "plotter_corte"
  | "impresora_3d"
  | "router_cnc"
  | "otra";

/** Valores del CHECK de machines.unidad_precio. */
export type UnidadPrecio =
  | "minuto"
  | "hora"
  | "metro_lineal"
  | "metro_cuadrado"
  | "pieza";

/** Sólo las publicadas las ven otros talleres. */
export type EstadoPublicacion = "borrador" | "publicada" | "pausada";

export type EstadoOperativo = "disponible" | "ocupada" | "mantenimiento";

export type DiaSemana =
  | "lunes"
  | "martes"
  | "miercoles"
  | "jueves"
  | "viernes"
  | "sabado"
  | "domingo";

/** Franjas "HH:MM-HH:MM" por día. Un día sin clave = no disponible. */
export type DisponibilidadHoraria = Partial<Record<DiaSemana, string[]>>;

/**
 * Campos según el tipo de máquina. La lista de claves por tipo vive en
 * `src/lib/capacidad/tipos.ts`; aquí sólo la forma de los valores.
 */
export type Especificaciones = Record<string, string | number | string[]>;

/** Máquina que un taller ofrece a la red (tabla `machines`). */
export type Machine = {
  id: string;
  tenant_id: string;
  nombre: string;
  tipo: TipoMaquina;
  descripcion: string | null;
  ciudad: string;
  zona: string | null;
  especificaciones: Especificaciones;
  precio: number;
  unidad_precio: UnidadPrecio;
  estado_publicacion: EstadoPublicacion;
  estado_operativo: EstadoOperativo;
  disponibilidad_horaria: DisponibilidadHoraria;
  /** Rutas en el bucket "maquinas", no URLs: se firman al mostrarlas. */
  fotos: string[];
  contacto_telefono: string;
  /** Reputación: promedio bayesiano que empieza en 5. Sólo lo escribe un trigger. */
  rating_promedio: number;
  /** Número de reseñas reales de esta máquina. Sólo lo escribe un trigger. */
  total_resenas: number;
  total_solicitudes: number;
  total_completadas: number;
  created_at: string;
  updated_at: string;
};

export type EstadoSolicitud =
  | "pendiente"
  | "aceptada"
  | "rechazada"
  | "cancelada"
  | "completada";

/** Solicitud de uso de una máquina de otro taller (tabla `machine_requests`). */
export type MachineRequest = {
  id: string;
  machine_id: string;
  tenant_solicitante: string;
  /** Copia de machines.tenant_id, para que las políticas RLS no hagan join. */
  tenant_propietario: string;
  mensaje: string;
  fecha_deseada: string;
  duracion_estimada: string;
  estado: EstadoSolicitud;
  created_at: string;
  updated_at: string;
  /** Lo que cobró el dueño de la máquina (opcional, sólo con la solicitud completada). */
  monto_cobrado: number | null;
  /** Cuándo se completó (la pone la base). */
  completada_en: string | null;
};

/** Columnas de reputación: la base no deja que el usuario las escriba. */
type Reputacion = "rating_promedio" | "total_solicitudes" | "total_completadas" | "total_resenas";

/** Calificación de una solicitud completada (tabla `machine_reviews`). */
export type MachineReview = {
  id: string;
  request_id: string;
  machine_id: string;
  tenant_autor: string;
  tenant_calificado: string;
  estrellas: number;
  comentario: string | null;
  created_at: string;
};

export type EstadoBusqueda = "abierta" | "resuelta" | "cancelada";

/** «Busco máquina»: un taller pide a toda la red (tabla `machine_searches`). */
export type MachineSearch = {
  id: string;
  tenant_id: string;
  tipo: TipoMaquina;
  descripcion: string;
  fecha_deseada: string;
  ciudad: string;
  estado: EstadoBusqueda;
  /** Copia del nombre del taller que busca (la pone la base). */
  taller_nombre: string;
  created_at: string;
  updated_at: string;
};

/** «Yo puedo ayudar» (tabla `machine_search_responses`). */
export type MachineSearchResponse = {
  id: string;
  search_id: string;
  tenant_id: string;
  mensaje: string;
  telefono: string;
  /** Copia del nombre del taller que responde (la pone la base). */
  taller_nombre: string;
  created_at: string;
};

/** Aviso de la campanita (tabla `notifications`). Los crea la base con triggers. */
export type Notificacion = {
  id: string;
  user_id: string;
  tipo: string;
  titulo: string;
  cuerpo: string;
  /** Ruta interna de la app a la que lleva el aviso. */
  url: string;
  leida_at: string | null;
  push_enviada_at: string | null;
  created_at: string;
};

/** Dispositivo suscrito a los avisos push (tabla `push_subscriptions`). */
export type SuscripcionPush = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  created_at: string;
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

/**
 * Vuelve a exigir ciertas claves de un `Insert` que `ClavesNulables` habría
 * marcado opcionales por admitir `null` en el `Row`. Se usa cuando una
 * columna es técnicamente nullable en la base (por filas históricas) pero la
 * aplicación siempre debe rellenarla en un insert nuevo — así el compilador
 * avisa si se olvida, en vez de dejarlo pasar como si fuera opcional.
 */
type Requerido<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

export interface Database {
  public: {
    Tables: {
      superadmins: {
        Row: Superadmin;
        Insert: Insertable<Superadmin>;
        Update: Partial<Superadmin>;
        Relationships: [];
      };
      superadmin_log: {
        Row: SuperadminLog;
        Insert: Insertable<SuperadminLog, "detalle">;
        Update: Partial<SuperadminLog>;
        Relationships: [];
      };
      tenants: {
        Row: Tenant;
        Insert: Insertable<Tenant, "estado" | "updated_at">;
        Update: Partial<Tenant>;
        Relationships: [];
      };
      profiles: {
        Row: Profile;
        Insert: Insertable<Profile, "rol">;
        Update: Partial<Profile>;
        Relationships: [];
      };
      invitaciones: {
        Row: Invitacion;
        Insert: Insertable<Invitacion, "expira_en" | "aceptada">;
        /** Un admin sólo puede reenviar o corregir el rol (permiso por columna). */
        Update: Pick<Partial<Invitacion>, "rol" | "token" | "expira_en">;
        Relationships: [];
      };
      materials: {
        Row: Material;
        Insert: Insertable<Material, "stock_laminas" | "archivado">;
        Update: Partial<Material>;
        Relationships: [];
      };
      inventory_items: {
        Row: InventoryItem;
        Insert: Requerido<Insertable<InventoryItem, "usado" | "cantidad" | "clase">, "codigo">;
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
      sales: {
        Row: Sale;
        Insert: Insertable<Sale, "fecha">;
        Update: Partial<Sale>;
        Relationships: [];
      };
      machines: {
        Row: Machine;
        Insert: Omit<
          Insertable<
            Machine,
            | "especificaciones"
            | "estado_publicacion"
            | "estado_operativo"
            | "disponibilidad_horaria"
            | "fotos"
            | "updated_at"
            | Reputacion
          >,
          Reputacion | "updated_at"
        >;
        /** Sin tenant_id ni reputación: la base no da permiso de update ahí. */
        Update: Partial<Omit<Machine, "id" | "tenant_id" | "created_at" | "updated_at" | Reputacion>>;
        Relationships: [];
      };
      machine_reviews: {
        Row: MachineReview;
        Insert: Insertable<MachineReview>;
        /** Una calificación no se edita. */
        Update: Record<string, never>;
        Relationships: [];
      };
      machine_searches: {
        Row: MachineSearch;
        Insert: Pick<MachineSearch, "tenant_id" | "tipo" | "descripcion" | "fecha_deseada" | "ciudad">;
        /** Sólo se cierra (permiso por columna). */
        Update: Pick<Partial<MachineSearch>, "estado">;
        Relationships: [];
      };
      machine_search_responses: {
        Row: MachineSearchResponse;
        Insert: Pick<MachineSearchResponse, "search_id" | "tenant_id" | "mensaje" | "telefono">;
        Update: Record<string, never>;
        Relationships: [];
      };
      notifications: {
        Row: Notificacion;
        /** Sólo las crean los triggers de la base. */
        Insert: Record<string, never>;
        /**
         * El usuario sólo puede cambiar leida_at (permiso por columna);
         * push_enviada_at lo anota el servidor al enviar el aviso push.
         */
        Update: Pick<Partial<Notificacion>, "leida_at" | "push_enviada_at">;
        Relationships: [];
      };
      push_subscriptions: {
        Row: SuscripcionPush;
        /** Se escriben con registrar_suscripcion_push / quitar_suscripcion_push. */
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      machine_requests: {
        Row: MachineRequest;
        /** Sin estado: toda solicitud nace "pendiente". */
        Insert: Omit<
          Insertable<MachineRequest, "estado" | "updated_at">,
          "estado" | "updated_at" | "monto_cobrado" | "completada_en"
        >;
        /** Una vez enviada sólo cambian el estado y lo cobrado (permiso por columna en la base). */
        Update: Pick<Partial<MachineRequest>, "estado" | "monto_cobrado">;
        Relationships: [];
      };
    };
    /** El MVP1 no usa vistas, pero GenericSchema exige la clave. */
    Views: Record<never, never>;
    Functions: {
      registrar_suscripcion_push: {
        Args: { p_endpoint: string; p_p256dh: string; p_auth: string; p_user_agent?: string | null };
        Returns: undefined;
      };
      quitar_suscripcion_push: {
        Args: { p_endpoint: string };
        Returns: undefined;
      };
      probar_aviso: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      current_tenant_id: {
        Args: Record<string, never>;
        Returns: string;
      };
      siguiente_contador: {
        Args: { p_tenant_id: string; p_tipo: string };
        Returns: number;
      };
      consumir_sobrante_unidad: {
        Args: {
          p_tenant_id: string;
          p_inventory_item_id: string;
          p_cantidad: number;
        };
        Returns: number | null;
      };
      es_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      puede_escribir: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      es_lectura: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      obtener_invitacion_por_token: {
        Args: { p_token: string };
        /** Siempre una fila; si `valida` es false, el resto viene nulo salvo el motivo. */
        Returns: {
          email: string | null;
          rol: string | null;
          nombre_taller: string | null;
          nombre_invitador: string | null;
          expira_en: string | null;
          valida: boolean;
          mensaje_error: string | null;
        }[];
      };
      es_superadmin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      mi_acceso: {
        Args: Record<string, never>;
        Returns: { perfil_activo: boolean; taller_estado: string; taller_nombre: string }[];
      };
      sacar_inventario: {
        Args: { p_inventory_item_id: string; p_cantidad: number };
        /** Lo que queda; null si no alcanzaba o el retal ya estaba usado. */
        Returns: number | null;
      };
      reponer_inventario: {
        Args: { p_inventory_item_id: string; p_cantidad: number };
        Returns: number | null;
      };
      valor_inventario: {
        Args: Record<string, never>;
        Returns: { clase: ClaseInventario; valor: number; items: number }[];
      };
      valor_sobrantes_disponibles: {
        Args: Record<string, never>;
        Returns: number;
      };
      reputacion_talleres: {
        Args: { p_ids: string[] };
        Returns: { tenant_id: string; promedio: number; total: number }[];
      };
      nombres_talleres: {
        Args: { p_ids: string[] };
        Returns: { id: string; nombre: string }[];
      };
      contraparte_solicitud: {
        Args: { p_request_id: string };
        Returns: { email: string; nombre: string | null; empresa: string }[];
      };
    };
  };
}
