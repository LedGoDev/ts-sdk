// ─────────────────────────────────────────────
// Internal HTTP Client (fetch-based)
// ─────────────────────────────────────────────

class HttpClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(baseUrl: string, headers: Record<string, string>) {
    this.baseUrl = baseUrl;
    this.headers = { ...headers };
  }

  private async request(
    method: string,
    path: string,
    options?: { body?: any; headers?: Record<string, string>; responseType?: 'blob'; }
  ): Promise<{ data: any; }> {
    const url = `${this.baseUrl}${path}`;
    const isFormData = options?.body instanceof FormData;
    const requestHeaders: Record<string, string> = {
      ...this.headers,
      ...options?.headers,
    };

    if (isFormData) {
      delete requestHeaders['Content-Type'];
    }

    const fetchOptions: RequestInit = {
      method,
      headers: requestHeaders,
    };

    if (options?.body !== undefined) {
      fetchOptions.body = isFormData ? options.body : JSON.stringify(options.body);
    }

    const response = await fetch(url, fetchOptions);

    if (options?.responseType === 'blob') {
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const error: any = new Error(`HTTP ${response.status}`);
        error.response = { data: errorBody, status: response.status };
        throw error;
      }

      const blob = await response.blob();
      return { data: blob };
    }

    const text = await response.text();
    let data: any = text;
    try {
      data = JSON.parse(text);
    } catch {
    }

    if (!response.ok) {
      const error: any = new Error(`HTTP Code: ${response.status}\nResponse body: ${text}`);
      error.response = { data, status: response.status };
      throw error;
    }

    if (Array.isArray(data) || (data !== null && typeof data === 'object' && data.constructor === Object)) {
      data = toCamelCase(data);
    }

    return { data };
  }

  async get(path: string, options?: { responseType?: 'blob'; }): Promise<{ data: any; }> {
    return this.request('GET', path, options);
  }

  /** Returns the raw base URL configured for this client. */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  async post(path: string, body?: any, options?: { headers?: Record<string, string>; }): Promise<{ data: any; }> {
    return this.request('POST', path, { body, ...options });
  }

  async patch(path: string, body?: any): Promise<{ data: any; }> {
    return this.request('PATCH', path, { body });
  }

  async delete(path: string, options?: { data?: any; }): Promise<{ data: any; }> {
    return this.request('DELETE', path, { body: options?.data });
  }
}

/**
 * Converts all top-level keys of an object from camelCase to snake_case.
 * Nested objects and arrays are preserved as-is without recursive conversion.
 * Useful for transforming SDK request payloads to match the API's expected format.
 *
 * @param obj - Object with camelCase keys to convert.
 * @returns A new object with snake_case keys and the same values.
 */
function toSnakeCase<T extends Record<string, any>>(obj: T): Record<string, any> {
  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();

    result[snakeKey] = value;
  }

  return result;
}

/**
 * Recursively converts all keys of an object from snake_case to camelCase.
 * Handles plain objects and arrays. Preserves non-plain objects (Blob, etc.) as-is.
 *
 * @param value - The value to convert (object, array, or primitive).
 * @returns A new value with camelCase keys.
 */
function toCamelCase(value: any): any {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(toCamelCase);
  }

  if (typeof value !== 'object' || value.constructor !== Object) {
    return value;
  }

  const result: Record<string, any> = {};

  for (const [key, val] of Object.entries(value)) {
    const camelKey = key.replace(/_([a-z])/g, (_, char) => char.toUpperCase());

    result[camelKey] = toCamelCase(val);
  }

  return result;
}

/**
 * Derives the edge functions base URL from the API base URL.
 * API base pattern:    https://{appKey}.{region}.insforge.app
 * Functions pattern:   https://{appKey}.function2.insforge.app
 * Returns undefined for non-insforge.app hosts (callers fall back to the
 * gateway proxy path).
 */
function deriveFunctionsBaseUrl(apiBaseUrl: string): string | undefined {
  try {
    const { hostname } = new URL(apiBaseUrl);

    if (!hostname.endsWith('.insforge.app')) {
      return undefined;
    }

    const appKey = hostname.split('.')[0];

    return `https://${appKey}.function2.insforge.app`;
  } catch {
    return undefined;
  }
}

/**
 * Configuration options for initializing the LedGo SDK.
 */
export interface ILedGoConfig {
  /** Base URL of the LedGo API (e.g. https://api.ledgo.ai). */
  baseUrl: string;
  /** Integration token generated in the organization settings. Used for Bearer authentication. */
  token: string;
  /**
   * Optional unique identifier of the organization. When omitted, the API
   * resolves the organization from the token itself, so the SDK does not need
   * it to scope its operations.
   */
  organizationId?: string;
}

/**
 * Common timestamp fields present in most system entities.
 * Inherit from this interface to include creation and update tracking.
 */
export interface ITimestamps {
  /** ISO 8601 formatted string of when the entity was created. */
  createdAt?: string;
  /** ISO 8601 formatted string of when the entity was last updated. */
  updatedAt?: string;
}

/**
 * Supported data types for form and template fields.
 */
export enum FieldType {
  /** Free text string value. */
  STRING = "string",
  /** Whole number integer value. */
  INTEGER = "integer",
  /** True/false boolean value. */
  BOOLEAN = "boolean",
  /** Ordered list of values. */
  ARRAY = "array",
  /** Numeric value (supports decimals). */
  NUMBER = "number",
  /** Absence of a value. */
  NULL = "null",
  /** No user input; informational label field (legacy alias: "null"). */
  INFORMATION = "information",
  /** No user input; button that opens links, fills fields, and/or waits for async session updates. */
  BUTTON = "button",
}

/**
 * Represents an option within a selection field (dropdown or multiselect).
 */
export interface IFormOption {
  /** Unique identifier for the option. */
  id: string;
  /** Human-readable label displayed to the user. */
  label: string;
  /** Optional mapping key for integrating with external systems. */
  key?: string;
}

/**
 * Condition that resolves an async button field from the form session data.
 */
export interface IFormSessionWaitCondition {
  /** JSON path inside the session data that gates the button resolution. */
  path: string;
  /** Optional exact value the path must equal for the button to resolve. */
  equals?: unknown;
}

/**
 * Configuration of a button field: opens a link, fills other fields, and/or
 * waits for an async form session update (CTA).
 */
export interface IFormButtonConfig {
  /** URL opened when the button is clicked. Supports {{field_id}}, {SESSION_KEY} and {{session_key}} placeholders. */
  url?: string;
  /** Whether the URL opens in a new browser tab (defaults to true). */
  openInNewTab?: boolean;
  /** Values applied to other fields on click, keyed by target field id. Supports {{field_id}} placeholders. */
  setValues?: Record<string, string>;
  /** Whether the button enters a waiting state after the click and resolves when the form session data satisfies `waitFor`. */
  async?: boolean;
  /** Condition on the form session data that resolves an async button. */
  waitFor?: IFormSessionWaitCondition;
}

/**
 * Detailed configuration for a single form field.
 * Describes the field's type, validation rules, and UI hints.
 */
export interface IFormField {
  /** Unique identifier for the field. Used as the key in the response data object. */
  id: string;
  /** The data type expected for this field. Determines rendering and validation. */
  type: FieldType;
  /** The title or label displayed to the user above the field. */
  title: string;
  /** Optional description or help text shown below the field. */
  description?: string;
  /** Whether the field must be filled before submission. */
  required?: boolean;
  /** List of allowed string values for simple enum-based selection. */
  enum?: string[];
  /** List of structured options for select/multiselect UI widgets. */
  options?: IFormOption[];
  /** Data format hint (e.g. 'date-time', 'email', 'uri'). */
  format?: string;
  /** UI component hint (e.g. 'textarea', 'select', 'checkbox'). */
  uiWidget?: string;
  /** Placeholder text displayed inside an empty input. */
  placeholder?: string;
  /** Whether the field is visible in the rendered form. */
  visible?: boolean;
  /** Initial/default value for the field when the form loads. */
  defaultValue?: any;
  /** Whether the field accepts user interaction. */
  enabled?: boolean;
  /** Minimum allowed length for string values. */
  minLength?: number;
  /** Maximum allowed length for string values. */
  maxLength?: number;
  /** Regex pattern that string values must match for validation. */
  pattern?: string;
  /** Minimum allowed numerical value (inclusive). */
  minimum?: number;
  /** Maximum allowed numerical value (inclusive). */
  maximum?: number;
  /** Configuration of button fields (open link / fill fields / async CTA). */
  button?: IFormButtonConfig;
}

/**
 * Represents a kanban dashboard (board) within an organization.
 * Dashboards contain columns, panels, and cards with a customizable template.
 */
export interface IKanbanDashboard extends ITimestamps {
  /** Unique identifier of the dashboard. */
  id: string;
  /** Reference to the parent organization. */
  organizationId: string;
  /** Display name of the dashboard. */
  name: string;
  /** Field definitions that define the data structure of cards within this dashboard.
   * Each field corresponds to a column in the kanban card view. */
  cardTemplate?: IFormField[];
  /** Kind of board. Blueprint boards render data fetched from an external provider. */
  boardType?: KanbanBoardType;
  /** Visibility scope of the board. Only public boards are readable through the public route. */
  scope?: KanbanScopeType;
}

/**
 * Represents a column (lane) within a kanban dashboard.
 * Columns hold panels and cards, and can trigger automatic state updates.
 */
export interface IKanbanColumn extends ITimestamps {
  /** Unique identifier of the column. */
  id: string;
  /** Reference to the parent dashboard. */
  dashboardId: string;
  /** Display name of the column (e.g. "To Do", "In Progress"). */
  name: string;
  /** Numerical order of the column in the dashboard, 0-indexed from left to right. */
  order: number;
  /** Optional rules for automatic state updates when a card enters this column.
   * Keys must match IDs defined in the dashboard's `card_template`.
   * @example { status: "In Progress", assigned_to: null } */
  stateUpdates?: Record<string, any>;
}

/**
 * Represents a visual panel (group) within a column.
 * Panels group related cards together with a title and optional color.
 */
export interface IKanbanPanel extends ITimestamps {
  /** Unique identifier of the panel. */
  id: string;
  /** Reference to the parent column. */
  columnId: string;
  /** Display title of the panel. */
  title: string;
  /** Numerical order of the panel within the column, 0-indexed from top to bottom. */
  order: number;
  /** Hex color code (e.g. "#ff0000") or named color for visual identification. */
  color?: string;
  /** Optional rules for automatic state updates when a card enters this panel.
   * Keys must match IDs defined in the dashboard's `card_template`.
   * @example { priority: "high", tags: ["urgent"] } */
  stateUpdates?: Record<string, any>;
}

/**
 * Represents an individual card item within a dashboard column or panel.
 */
export interface IKanbanCard extends ITimestamps {
  /** Unique identifier of the card. */
  id: string;
  /** Reference to the dashboard where the card resides. */
  dashboardId: string;
  /** Reference to the column currently holding the card. */
  columnId: string;
  /** Reference to the organization that owns the card. */
  organizationId: string;
  /** Custom data object containing card field values.
   * Keys must match IDs defined in the dashboard's `card_template`.
   * @example { title: "Fix bug", priority: "high", effort: 5 } */
  data: Record<string, any>;
  /** Numerical order of the card within its current container. */
  order: number;
  /** Optional reference to a specific panel within the column. */
  panelId?: string;
}

/**
 * Valid types of elements within the kanbans module.
 * Used to distinguish between columns, panels, and cards in API calls.
 */
export enum KanbanItemType {
  /** A column (lane) that holds panels and cards. */
  COLUMN = "column",
  /** A panel (group) within a column that holds cards. */
  PANEL = "panel",
  /** An individual card item. */
  CARD = "card",
}

/** Payload for creating a new kanban dashboard. Only name is required; card_template, board_type and scope are optional. */
export interface ICreateKanbanDashboardPayload extends Pick<IKanbanDashboard, 'name' | 'cardTemplate'>, Partial<Pick<IKanbanDashboard, 'boardType' | 'scope'>> { }

/** Payload for creating a new column in a dashboard. Name is required; order and state_updates are optional. */
export interface ICreateKanbanColumnPayload extends Pick<IKanbanColumn, 'name'>, Partial<Pick<IKanbanColumn, 'order' | 'stateUpdates'>> { }

/** Payload for creating a new panel within a column. column_id and title are required; color, order, and state_updates are optional. */
export interface ICreateKanbanPanelPayload extends Pick<IKanbanPanel, 'columnId' | 'title'>, Partial<Pick<IKanbanPanel, 'color' | 'order' | 'stateUpdates'>> { }

/** Payload for creating a new card item. column_id and data are required; panel_id and order are optional. */
export interface ICreateKanbanCardPayload extends Pick<IKanbanCard, 'columnId' | 'data'>, Partial<Pick<IKanbanCard, 'panelId' | 'order'>> { }

/**
 * Kind of kanban board. Standard boards keep their columns and cards inside
 * LedGo; blueprint boards render data fetched from an external provider.
 */
export enum KanbanBoardType {
  /** Classic board whose columns and cards live in LedGo. */
  STANDARD = "standard",
  /** Data-driven board rendered from an external provider. */
  BLUEPRINT = "blueprint",
}

/**
 * Visibility scope of a kanban board.
 */
export enum KanbanScopeType {
  /** Anyone with the link can view the board through its public route. */
  PUBLIC = "public",
  /** Only members of the owning organization can view the board. */
  ORGANIZATION = "organization",
  /** Only members assigned to the owning project can view the board. */
  PROJECT = "project",
}

/**
 * Kind of data provider that feeds a blueprint dashboard.
 */
export enum KanbanProviderType {
  /** Board data is fetched from an external HTTP endpoint. */
  HTTP = "http",
  /** Board data lives in LedGo and is read through the anonymous views. */
  INTERNAL = "internal",
  /** Board data is read from a LedGo custom database. */
  LEDGO_DATABASE = "ledgo-database",
  /** Board data is a static payload stored with the configuration. */
  STATIC = "static",
}

/**
 * Authentication mode used when calling a provider endpoint.
 */
export enum KanbanAuthMode {
  /** Provider requests are signed by LedGo with an HMAC secret. */
  SIGNED = "signed",
  /** Provider requests carry no authentication. */
  NONE = "none",
  /** The signed link token is forwarded to the provider, which validates it. */
  FORWARD_TOKEN = "forward-token",
}

/**
 * Definition of a provider parameter exposed to the public read endpoint.
 */
export interface IKanbanParamDefinition {
  /** Identifier used inside `{{param.<id>}}` placeholders. */
  id: string;
  /** Display label shown in the editor. */
  label: string;
  /** Primitive type expected for the parameter value. */
  type: "string" | "number" | "boolean";
  /** Whether the parameter must be provided by the caller. */
  required: boolean;
  /** Default value applied when the caller omits the parameter. */
  defaultValue: string | number | boolean | null;
  /** Help text shown next to the parameter. */
  description: string;
}

/**
 * Authentication configuration of a provider endpoint.
 */
export interface IKanbanSourceAuth {
  /** Authentication mode applied to the request. */
  mode: KanbanAuthMode;
  /** Header carrying the signature, null when the mode does not use one. */
  headerName: string | null;
  /** Shared secret used to sign the request, null for unsigned modes. */
  secret: string | null;
}

/**
 * Description of an HTTP request performed against a provider endpoint.
 */
export interface IKanbanSource {
  /** Endpoint URL, may contain `{{...}}` placeholders. */
  url: string;
  /** HTTP method of the request. */
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Headers forwarded with the request. */
  headers: Record<string, string>;
  /** Request body template, null or empty when the method sends no body. */
  body: unknown;
  /** Abort timeout of the request in milliseconds. */
  timeoutMs: number;
  /** Authentication applied to the request, null when unsigned. */
  auth: IKanbanSourceAuth | null;
}

/**
 * Mapping between a provider response and the board collections. Paths are
 * JSON paths; field maps translate output field names to item-relative paths.
 */
export interface IKanbanMapping {
  /** JSON path to the array of columns in the provider response. */
  columns?: string;
  /** JSON path to the array of panels in the provider response. */
  panels?: string;
  /** JSON path to the array of cards in the provider response. */
  cards?: string;
  /** JSON path to the provider version used for conflict detection. */
  version?: string;
  /** Output field to JSON path map applied to each column. */
  columnFields?: Record<string, string>;
  /** Output field to JSON path map applied to each panel. */
  panelFields?: Record<string, string>;
  /** Output field to JSON path map applied to each card. */
  cardFields?: Record<string, string>;
}

/**
 * Declarative action offered by every card of a blueprint board.
 */
export interface IKanbanCardAction {
  /** Identifier sent to the provider as `{{action.id}}`. */
  id: string;
  /** Button label shown on the card. */
  label: string;
  /** Visual variant applied to the button. */
  variant: "primary" | "secondary" | "danger";
  /** Whether the action asks for confirmation before running. */
  requiresConfirm: boolean;
  /** Columns where the action is available, null for any column. */
  allowedColumns: string[] | null;
  /** Panels where the action is available, null for any panel. */
  allowedPanels: string[] | null;
}

/**
 * Server-only configuration of a blueprint dashboard. Never exposed to
 * anonymous visitors; read and written through the authenticated gateway.
 */
export interface IKanbanPublicConfig extends ITimestamps {
  /** Identifier of the dashboard configured. */
  dashboardId: string;
  /** Organization that owns the dashboard, null when unresolved. */
  organizationId: string | null;
  /** Project that owns the dashboard, null when unresolved. */
  projectId: string | null;
  /** Provider that feeds the board. */
  providerType: KanbanProviderType;
  /** URL of the provider manifest, null when the provider has none. */
  providerManifestUrl: string | null;
  /** Parameters accepted by the public read endpoint. */
  params: IKanbanParamDefinition[];
  /** Request used to read the board, null when the provider is not HTTP. */
  readSource: IKanbanSource | null;
  /** Request used to write the board back, null when writes are disabled. */
  writeSource: IKanbanSource | null;
  /** Mapping applied to the provider response. */
  mapping: IKanbanMapping;
  /** Declarative actions offered by the cards of the board. */
  cardActions: IKanbanCardAction[];
  /** Authentication mode of the provider requests. */
  authMode: KanbanAuthMode;
  /** Whether public callers may write to the board. */
  allowWrite: boolean;
  /** Whether each write consumes a single-use token. */
  singleUse: boolean;
  /** Origins allowed to embed the public board, null for any origin. */
  embedAllowedOrigins: string[] | null;
  /** Auto-refresh interval of the public board in milliseconds. */
  refreshIntervalMs: number | null;
}

/**
 * Payload for creating or updating the public configuration of a blueprint.
 * Every field is optional; omitted fields keep their stored value.
 */
export interface IUpdateKanbanPublicConfigPayload {
  /** Provider that feeds the board. */
  providerType?: KanbanProviderType;
  /** URL of the provider manifest, null to clear it. */
  providerManifestUrl?: string | null;
  /** Parameters accepted by the public read endpoint. */
  params?: IKanbanParamDefinition[];
  /** Request used to read the board, null to clear it. */
  readSource?: IKanbanSource | null;
  /** Request used to write the board back, null to clear it. */
  writeSource?: IKanbanSource | null;
  /** Mapping applied to the provider response. */
  mapping?: IKanbanMapping;
  /** Declarative actions offered by the cards of the board. */
  cardActions?: IKanbanCardAction[];
  /** Authentication mode of the provider requests. */
  authMode?: KanbanAuthMode;
  /** Whether public callers may write to the board. */
  allowWrite?: boolean;
  /** Whether each write consumes a single-use token. */
  singleUse?: boolean;
  /** Origins allowed to embed the public board, null for any origin. */
  embedAllowedOrigins?: string[] | null;
  /** Auto-refresh interval of the public board in milliseconds. */
  refreshIntervalMs?: number | null;
}

/**
 * Scope granted by a signed access link.
 */
export enum KanbanLinkScope {
  /** The link can only read the board. */
  VIEW = "view",
  /** The link can read and write the board. */
  EDIT = "edit",
}

/**
 * Payload for minting a signed access link for a blueprint dashboard.
 */
export interface ICreateKanbanAccessLinkPayload {
  /** Scope granted by the link, defaults to view. */
  scope?: KanbanLinkScope;
  /** Provider params forwarded to the public route as query string values. */
  params?: Record<string, unknown>;
  /** Claims exposed to the provider as `{{claim.*}}` placeholders. */
  claims?: Record<string, unknown>;
  /** Whether the link can only be used once. */
  singleUse?: boolean;
  /** Lifetime of the link in seconds, clamped by the server. */
  ttlSeconds?: number;
  /** Base URL used to build the absolute `url` of the result, optional. */
  baseUrl?: string;
  /** Columns the link may move cards into, omitted for any column. */
  allowedColumns?: string[];
  /** Panels the link may move cards into, omitted for any panel. */
  allowedPanels?: string[];
}

/**
 * Result of minting a signed access link.
 */
export interface IKanbanAccessLinkResult {
  /** Relative public path including the query string and the token. */
  path: string;
  /** Absolute URL when `baseUrl` was provided, otherwise the relative path. */
  url: string;
  /** ISO timestamp the link expires at. */
  expiresAt: string;
}

/**
 * Registered access link of a dashboard.
 */
export interface IKanbanAccessLink extends ITimestamps {
  /** Unique identifier of the link, also carried by the token as `jti`. */
  jti: string;
  /** Dashboard the link is bound to. */
  dashboardId: string;
  /** Organization that owns the dashboard, null when unresolved. */
  organizationId: string | null;
  /** Scope granted by the link. */
  scope: KanbanLinkScope;
  /** Whether the link can only be used once. */
  singleUse: boolean;
  /** Timestamp the link was consumed, null when unused. */
  usedAt: string | null;
  /** Timestamp the link was revoked, null when active. */
  revokedAt: string | null;
  /** ISO timestamp the link expires at. */
  expiresAt: string;
  /** Requests consumed in the current rate-limit window. */
  useCount: number;
  /** Start of the current rate-limit window. */
  windowStartedAt: string;
  /** Maximum requests allowed per rate-limit window. */
  maxUses: number;
}

/**
 * Board collections produced from a provider response.
 */
export interface IKanbanBoardData {
  /** Columns of the board. */
  columns: IKanbanColumn[];
  /** Panels of the board, each one referencing its column. */
  panels: IKanbanPanel[];
  /** Cards of the board. */
  cards: IKanbanCard[];
  /** Provider version of the payload, used for conflict detection. */
  version?: string;
  /** Whether the signed link allows writing to the board. */
  canWrite?: boolean;
  /** Declarative actions available on every card. */
  cardActions?: IKanbanCardAction[];
  /** Auto-refresh interval of the board in milliseconds. */
  refreshIntervalMs?: number;
  /** Columns the link is allowed to move cards into, null for any column. */
  allowedColumns?: string[] | null;
  /** Panels the link is allowed to move cards into, null for any panel. */
  allowedPanels?: string[] | null;
}

/**
 * Destination container of a public board move.
 */
export interface IKanbanMoveTarget {
  /** Identifier of the destination column. */
  columnId: string;
  /** Identifier of the destination panel, null for the column root. */
  panelId: string | null;
}

/**
 * Kind of write event sent to the public gateway.
 */
export enum KanbanWriteEventType {
  /** A card is moved between containers. */
  CARD_MOVED = "card_moved",
  /** A declarative card action is executed. */
  CARD_ACTION = "card_action",
}

/**
 * Options for reading a public blueprint board.
 */
export interface IGetPublicKanbanOptions {
  /** Signed access-link token, required for signed boards. */
  linkToken?: string;
}

/**
 * Payload for moving a card through a public signed link.
 */
export interface IMovePublicKanbanCardPayload {
  /** Signed access-link token with edit scope. */
  linkToken: string;
  /** Identifier of the card being moved. */
  cardId: string;
  /** Destination container of the card. */
  to: IKanbanMoveTarget;
  /** Card data after merging the destination state updates. */
  data?: Record<string, unknown>;
  /** Provider version the move is based on, for conflict detection. */
  baseVersion?: string;
}

/**
 * Payload for running a card action through a public signed link.
 */
export interface IRunPublicKanbanCardActionPayload {
  /** Signed access-link token with edit scope. */
  linkToken: string;
  /** Identifier of the card the action runs on. */
  cardId: string;
  /** Identifier of the action executed. */
  actionId: string;
  /** Provider version the action is based on, for conflict detection. */
  baseVersion?: string;
}

/**
 * Horizontal alignment of a block/widget text content.
 */
export enum TextAlignmentType {
  /** Aligns the text to the left edge. */
  LEFT = "left",
  /** Centers the text horizontally. */
  CENTER = "center",
  /** Aligns the text to the right edge. */
  RIGHT = "right",
}

/**
 * Supported widget types for the organization home dashboard.
 * Each type has a specific rendering component and configuration schema.
 */
export enum WidgetType {
  /** Displays a key metric with value, unit, trend indicator, and optional prefix/suffix. */
  METRICS = "metrics",
  /** Renders a heading/title with configurable level and alignment. */
  TITLE = "title",
  /** A toggle switch with on/off labels and configurable default state. */
  TOGGLE = "toggle",
  /** A clickable button with variant styling and an action URL. */
  BUTTON = "button",
  /** Displays an image with fit mode and rounded corners option. */
  IMAGE = "image",
  /** A multi-line text block for rich content. */
  TEXTAREA = "textarea",
  /** A code editor block with syntax highlighting by language. */
  CODE = "code",
  /** A chart (bar, line, pie, or area) with labels and data series. */
  CHART = "chart",
  /** A single horizontal progress bar with label, value, and color. */
  PROGRESS_BAR = "progress_bar",
  /** A list of progress bars, each with label, value, and color. */
  PROGRESS_BAR_LIST = "progress_bar_list",
  /** Embeds a YouTube video player by URL. */
  YOUTUBE = "youtube",
  /** A hyperlink with label and URL. */
  LINK = "link",
  /** An editable data table with columns, rows, and per-cell alignment. */
  TABLE = "table",
  /** A list of items (bullets, numbered, or checklist). */
  LIST = "list",
  /** A horizontal separator line. */
  DIVIDER = "divider",
  /** An embed of a platform resource (kanban, form, database, diagram, or file). */
  EMBED = "embed",
}

/**
 * Grid position and dimensions for a widget on the dashboard.
 * All coordinates are measured in grid units.
 */
export interface IWidgetPosition {
  /** Horizontal grid column position, 0-indexed. */
  x: number;
  /** Vertical grid row position, 0-indexed. */
  y: number;
  /** Width of the widget in grid columns. */
  w: number;
  /** Height of the widget in grid rows. */
  h: number;
  /** Minimum width constraint for responsive resizing. */
  minW?: number;
  /** Minimum height constraint for responsive resizing. */
  minH?: number;
}

/** Configuration for a Metrics widget displaying a key value with trend. */
export interface IMetricsConfig {
  /** Display title above the metric value. */
  title: string;
  /** The metric value, can be a number or formatted string. */
  value: string | number;
  /** Unit label shown next to the value (e.g. "USD", "users"). */
  unit: string;
  /** Trend direction indicator: "up" (positive), "down" (negative), or "neutral". */
  trend: "up" | "down" | "neutral";
  /** Optional prefix prepended to the value (e.g. "$"). */
  prefix: string;
  /** Optional suffix appended to the value (e.g. "%"). */
  suffix: string;
}

/** Configuration for a Title/heading widget. */
export interface ITitleConfig {
  /** The heading text content. */
  content: string;
  /** HTML heading level: 1 (largest) through 5 (smallest). */
  level: 1 | 2 | 3 | 4 | 5;
  /** Horizontal alignment of the heading text. */
  alignment: TextAlignmentType;
}

/** Configuration for a Toggle switch widget. */
export interface IToggleConfig {
  /** Label text displayed next to the toggle. */
  label: string;
  /** Default state when the widget is first rendered. */
  defaultValue: boolean;
  /** Current live state of the toggle. */
  currentValue: boolean;
  /** Label displayed when the toggle is in the ON position. */
  onLabel: string;
  /** Label displayed when the toggle is in the OFF position. */
  offLabel: string;
}

/** Configuration for a Button widget with variant styling. */
export interface IButtonConfig {
  /** Text displayed on the button. */
  label: string;
  /** Visual variant: "primary", "secondary", "outline", or "ghost". */
  variant: "primary" | "secondary" | "outline" | "ghost";
  /** Button size: "sm" (small), "md" (medium), or "lg" (large). */
  size: "sm" | "md" | "lg";
  /** URL or action triggered on click. */
  action: string;
  /** Optional icon identifier to display alongside the label. */
  icon: string;
}

/** Configuration for an Image widget. */
export interface IImageConfig {
  /** Source URL of the image. */
  src: string;
  /** Alternative text for accessibility and fallback display. */
  alt: string;
  /** CSS object-fit mode: "cover", "contain", or "fill". */
  fit: "cover" | "contain" | "fill";
  /** Whether to apply rounded corners to the image. */
  rounded: boolean;
}

/** Configuration for a Textarea/rich text widget. */
export interface ITextareaConfig {
  /** The text content displayed in the widget. */
  content: string;
}

/** Configuration for a Code editor widget. */
export interface ICodeConfig {
  /** The source code content. */
  code: string;
  /** Programming language identifier for syntax highlighting (e.g. "javascript", "python"). */
  language: string;
}

/** Configuration for a Chart widget. */
export interface IChartConfig {
  /** Chart type: "bar", "line", "pie", or "area". */
  type: "bar" | "line" | "pie" | "area";
  /** Display title above the chart. */
  title: string;
  /** Comma-separated labels for the X-axis or legend. */
  labels: string;
  /** Comma-separated data values corresponding to the labels. */
  data: string;
}

/** Configuration for a single progress bar within a progress bar list. */
export interface IProgressBarItem {
  /** Label text displayed alongside the bar. */
  label: string;
  /** Numeric value determining the bar fill percentage (0-100). */
  value: number;
  /** Hex color code for the bar fill color. */
  color: string;
}

/** Configuration for a single Progress Bar widget. */
export interface IProgressBarConfig {
  /** Label text displayed above or beside the bar. */
  label: string;
  /** Numeric value determining the bar fill percentage (0-100). */
  value: number;
  /** Hex color code for the bar fill color. */
  color: string;
  /** Whether to display the percentage value on the bar. */
  showPercentage: boolean;
}

/** Configuration for a Progress Bar List widget containing multiple bars. */
export interface IProgressBarListConfig {
  /** Array of individual progress bar items. */
  items: IProgressBarItem[];
  /** Whether to display percentage values on each bar. */
  showPercentage: boolean;
}

/** Configuration for a YouTube video embed widget. */
export interface IYoutubeConfig {
  /** Full YouTube video URL (e.g. https://www.youtube.com/watch?v=...). */
  url: string;
}

/** Configuration for a Link/hyperlink widget. */
export interface ILinkConfig {
  /** Clickable label text for the link. */
  label: string;
  /** Target URL the link navigates to. */
  url: string;
}

/** Configuration for a Table widget with editable cells. */
export interface ITableConfig {
  /** Labels of the table columns. */
  columns: string[];
  /** Cell values as rows of the same length as columns. */
  rows: string[][];
  /** Horizontal alignment per column (parallel to columns); applies only to the column header text. */
  columnAlignments?: TextAlignmentType[];
  /** Horizontal alignment per cell (parallel to rows/columns); each cell has its own, independent of the column. */
  cellAlignments?: TextAlignmentType[][];
}

/**
 * Visual style of the list widget.
 */
export enum ListStyleType {
  /** Renders items with bullet markers. */
  BULLETS = "bullets",
  /** Renders items with sequential numbers. */
  NUMBERED = "numbered",
  /** Renders items with checkboxes that can be toggled. */
  CHECKLIST = "checklist",
}

/** Single item of a list widget. */
export interface IListItem {
  /** Text of the list item. */
  text: string;
  /** Whether the item is checked (only used by the checklist style). */
  checked: boolean;
}

/** Configuration for a List widget. */
export interface IListConfig {
  /** Items rendered by the list. */
  items: IListItem[];
  /** Visual style of the list. */
  style: ListStyleType;
  /** Horizontal alignment per item (parallel to items). */
  itemAlignments?: TextAlignmentType[];
}

/** Configuration for a Divider widget. */
export interface IDividerConfig {
  /** CSS border color of the divider. */
  color: string;
}

/**
 * Type of platform resource referenced by an embed widget.
 */
export enum EmbedResourceType {
  /** A kanban dashboard. */
  KANBAN_DASHBOARD = "kanban_dashboard",
  /** A form. */
  FORM = "form",
  /** A database. */
  DATABASE = "database",
  /** A diagram. */
  DIAGRAM = "diagram",
  /** A storage file. */
  STORAGE_FILE = "storage_file",
}

/** Configuration for an Embed widget referencing a platform resource. */
export interface IEmbedConfig {
  /** Type of platform resource being embedded. */
  resourceType: EmbedResourceType;
  /** Unique identifier of the embedded resource. */
  resourceId: string;
  /** Whether the resource title is shown in the card. */
  showTitle: boolean;
}

/**
 * Represents a widget instance on the organization home dashboard.
 * The `config` shape is determined by the `widgetType` value.
 */
export interface IWidgetInstance extends ITimestamps {
  /** Unique identifier of the widget instance. */
  id: string;
  /** Reference to the parent organization. */
  organizationId: string;
  /** Reference to the parent project. */
  projectId: string;
  /** Type of widget. Determines the rendering component and config schema. */
  widgetType: WidgetType;
  /** Widget-specific configuration. Shape varies by `widgetType`. Use `widgetType` to determine the expected fields. */
  config: Record<string, any>;
  /** Grid position and dimensions on the dashboard layout. */
  position: IWidgetPosition;
}

/** Payload for creating a Metrics widget. */
export interface ICreateMetricsWidgetPayload {
  widgetType: WidgetType.METRICS;
  /** Metrics-specific configuration. Falls back to defaults when omitted. */
  config?: IMetricsConfig;
  /** Grid position and dimensions. Falls back to sensible defaults when omitted. */
  position?: IWidgetPosition;
}

/** Payload for creating a Title widget. */
export interface ICreateTitleWidgetPayload {
  widgetType: WidgetType.TITLE;
  config?: ITitleConfig;
  position?: IWidgetPosition;
}

/** Payload for creating a Toggle widget. */
export interface ICreateToggleWidgetPayload {
  widgetType: WidgetType.TOGGLE;
  config?: IToggleConfig;
  position?: IWidgetPosition;
}

/** Payload for creating a Button widget. */
export interface ICreateButtonWidgetPayload {
  widgetType: WidgetType.BUTTON;
  config?: IButtonConfig;
  position?: IWidgetPosition;
}

/** Payload for creating an Image widget. */
export interface ICreateImageWidgetPayload {
  widgetType: WidgetType.IMAGE;
  config?: IImageConfig;
  position?: IWidgetPosition;
}

/** Payload for creating a Textarea widget. */
export interface ICreateTextareaWidgetPayload {
  widgetType: WidgetType.TEXTAREA;
  config?: ITextareaConfig;
  position?: IWidgetPosition;
}

/** Payload for creating a Code widget. */
export interface ICreateCodeWidgetPayload {
  widgetType: WidgetType.CODE;
  config?: ICodeConfig;
  position?: IWidgetPosition;
}

/** Payload for creating a Chart widget. */
export interface ICreateChartWidgetPayload {
  widgetType: WidgetType.CHART;
  config?: IChartConfig;
  position?: IWidgetPosition;
}

/** Payload for creating a Progress Bar widget. */
export interface ICreateProgressBarWidgetPayload {
  widgetType: WidgetType.PROGRESS_BAR;
  config?: IProgressBarConfig;
  position?: IWidgetPosition;
}

/** Payload for creating a Progress Bar List widget. */
export interface ICreateProgressBarListWidgetPayload {
  widgetType: WidgetType.PROGRESS_BAR_LIST;
  config?: IProgressBarListConfig;
  position?: IWidgetPosition;
}

/** Payload for creating a YouTube widget. */
export interface ICreateYoutubeWidgetPayload {
  widgetType: WidgetType.YOUTUBE;
  config?: IYoutubeConfig;
  position?: IWidgetPosition;
}

/** Payload for creating a Link widget. */
export interface ICreateLinkWidgetPayload {
  widgetType: WidgetType.LINK;
  config?: ILinkConfig;
  position?: IWidgetPosition;
}

/** Payload for creating a Table widget. */
export interface ICreateTableWidgetPayload {
  widgetType: WidgetType.TABLE;
  config?: ITableConfig;
  position?: IWidgetPosition;
}

/** Payload for creating a List widget. */
export interface ICreateListWidgetPayload {
  widgetType: WidgetType.LIST;
  config?: IListConfig;
  position?: IWidgetPosition;
}

/** Payload for creating a Divider widget. */
export interface ICreateDividerWidgetPayload {
  widgetType: WidgetType.DIVIDER;
  config?: IDividerConfig;
  position?: IWidgetPosition;
}

/** Payload for creating an Embed widget. */
export interface ICreateEmbedWidgetPayload {
  widgetType: WidgetType.EMBED;
  config?: IEmbedConfig;
  position?: IWidgetPosition;
}

/**
 * Discriminated union of all possible widget creation payloads.
 * The `widgetType` field discriminates which config type is expected.
 */
export type ICreateWidgetPayload =
  | ICreateMetricsWidgetPayload
  | ICreateTitleWidgetPayload
  | ICreateToggleWidgetPayload
  | ICreateButtonWidgetPayload
  | ICreateImageWidgetPayload
  | ICreateTextareaWidgetPayload
  | ICreateCodeWidgetPayload
  | ICreateChartWidgetPayload
  | ICreateProgressBarWidgetPayload
  | ICreateProgressBarListWidgetPayload
  | ICreateYoutubeWidgetPayload
  | ICreateLinkWidgetPayload
  | ICreateTableWidgetPayload
  | ICreateListWidgetPayload
  | ICreateDividerWidgetPayload
  | ICreateEmbedWidgetPayload;

/**
 * Payload for updating an existing widget.
 * Each field is optional — only provided fields will be updated.
 */
export interface IUpdateWidgetPayload {
  /** Updated widget configuration. Shape must match the widget's type (see specific config interfaces). */
  config: Record<string, any>;
  /** Updated grid position and dimensions. */
  position: IWidgetPosition;
}

/** Payload for updating the positions of several widgets in a single request. */
export interface IWidgetPositionUpdate {
  /** Identifier of the widget to update. */
  widgetId: string;
  /** New grid position and dimensions of the widget. */
  position: IWidgetPosition;
}

/**
 * Payload for updating a widget within a batch update.
 * Each field is optional — only provided fields will be updated.
 */
export interface IWidgetBatchUpdate {
  /** Identifier of the widget to update. */
  id: string;
  /** Updated widget configuration. Shape must match the widget's type (see specific config interfaces). */
  config?: Record<string, any>;
  /** Updated grid position and dimensions. */
  position?: IWidgetPosition;
}

/**
 * Visibility level for a form.
 * Public forms can be submitted by anyone with the link; private forms require authentication.
 */
export enum FormVisibilityType {
  /** Anyone with the form link can submit. */
  PUBLIC = "public",
  /** Only authenticated organization members can submit. */
  PRIVATE = "private",
}

/**
 * Represents a dynamic form structure for external data collection.
 * Forms can be embedded, shared via link, or used internally.
 */
export interface IForm extends ITimestamps {
  /** Unique identifier of the form. */
  id: string;
  /** Reference to the parent organization. */
  organizationId: string;
  /** Display title of the form. */
  title: string;
  /** Optional longer description shown at the top of the form. */
  description?: string;
  /** URL-friendly unique identifier (e.g. "feedback-form-2024"). */
  slug: string;
  /** Access level controlling who can view and submit the form. */
  visibility: FormVisibilityType;
  /** Array of field definitions that constitute the form's data structure. */
  fields: IFormField[];
  /** Optional JSON Schema for advanced server-side validation. */
  jsonSchema?: Record<string, any>;
  /** Optional UI Schema for advanced rendering customization. */
  uiSchema?: Record<string, any>;
  /** ID of the user who created the form. */
  createdBy?: string;
}

/**
 * Represents a single submission response received through a form.
 */
export interface IFormResponse extends ITimestamps {
  /** Unique identifier of the response. */
  id: string;
  /** Reference to the submitted form. */
  formId: string;
  /** The submitted field values, keyed by the field ID defined in the form. */
  data: Record<string, any>;
  /** ID of the authenticated user who submitted (undefined for anonymous submissions). */
  userId?: string;
}

/** Payload for creating a new form. Only title and slug are required. */
export interface ICreateFormPayload extends Pick<IForm, 'title' | 'slug'>, Partial<Pick<IForm, 'description' | 'visibility' | 'fields' | 'jsonSchema' | 'uiSchema'>> { }

/**
 * Represents a custom database structure within an organization.
 * Databases provide flexible schemas for structured data storage.
 */
export interface IDatabase extends ITimestamps {
  /** Unique identifier of the database. */
  id: string;
  /** Reference to the parent organization. */
  organizationId: string;
  /** Display name of the database. */
  name: string;
  /** Optional description of the database's purpose and contents. */
  description?: string;
  /** JSON Schema describing the expected structure of records. */
  schema: Record<string, any>;
  /** UI Schema describing layout and presentation rules for the record editor. */
  uiSchema: Record<string, any>;
}

/**
 * Represents a single record inside a custom database.
 */
export interface IDatabaseRecord extends ITimestamps {
  /** Unique identifier of the record. */
  id: string;
  /** Reference to the parent database. */
  databaseId: string;
  /** The record data. Structure must conform to the parent database's schema. */
  data: Record<string, any>;
}

/**
 * Represents a diagram created with Mermaid.js syntax.
 */
export interface IDiagram extends ITimestamps {
  /** Unique identifier of the diagram. */
  id: string;
  /** Reference to the parent organization. */
  organizationId: string;
  /** Display name of the diagram. */
  name: string;
  /** The Mermaid.js diagram definition code. */
  code: string;
  /** ID of the user who created or last modified the diagram. */
  createdBy: string;
  /** Optional description of the diagram's purpose. */
  description?: string;
}

/** Payload for creating a new diagram. Name and code are required; description is optional. */
export interface ICreateDiagramPayload extends Pick<IDiagram, 'name' | 'code'>, Partial<Pick<IDiagram, 'description'>> { }

/** Payload for creating a new database. Name is required; description, schema, and ui_schema are optional. */
export interface ICreateDatabasePayload extends Pick<IDatabase, 'name'>, Partial<Pick<IDatabase, 'description' | 'schema' | 'uiSchema'>> { }

/**
 * Fine-grained element a comment is anchored to. v1 supports databases:
 * the database itself, one of its columns, a record or a single cell.
 * v2 adds document blocks.
 */
export interface ICommentTarget {
  /** Kind of the commented element. */
  kind: 'database' | 'column' | 'record' | 'cell' | 'block';
  /** Identifier of the record, required for record and cell comments. */
  recordId?: string;
  /** Name of the schema property, required for column and cell comments. */
  field?: string;
  /** Identifier of the document block, required for block comments. */
  blockId?: string;
}

/** A single comment anchored to a database target. */
export interface IComment {
  /** Unique identifier of the comment. */
  id: string;
  /** Organization that owns the root resource. */
  organizationId: string;
  /** Project that owns the root resource. */
  projectId: string;
  /** Kind of the root resource. */
  rootResourceType: string;
  /** Identifier of the root resource. */
  rootResourceId: string;
  /** Fine-grained target the comment is anchored to. */
  target: ICommentTarget;
  /** Deterministic key derived from the target. */
  targetKey: string;
  /** Parent comment when this is a reply. */
  parentId: string | null;
  /** Author profile identifier. */
  authorId: string | null;
  /** Text content of the comment. */
  body: string;
  /** Format of the body. */
  bodyFormat: 'markdown' | 'plain';
  /** Last edit timestamp, null when never edited. */
  editedAt: string | null;
  /** Soft-delete timestamp, null when visible. */
  deletedAt: string | null;
  /** Creation timestamp. */
  createdAt: string;
  /** Free-form metadata (mentions, attachments). */
  metadata: Record<string, unknown>;
}

/** Payload for creating a comment or reply. */
export interface ICreateCommentPayload {
  /** Fine-grained target the comment is anchored to. */
  target: ICommentTarget;
  /** Text content of the comment. */
  body: string;
  /** Parent comment id to reply, null for top-level. */
  parentId?: string | null;
}

/**
 * Operators supported by server-side record queries.
 */
export enum RecordFilterOperator {
  /** Exact equality match. */
  EQ = 'eq',
  /** Not equal match. */
  NEQ = 'neq',
  /** Case-insensitive substring match on text values. */
  CONTAINS = 'contains',
  /** Case-insensitive prefix match on text values. */
  STARTS_WITH = 'starts_with',
  /** Greater than comparison (numbers, dates). */
  GT = 'gt',
  /** Greater than or equal comparison (numbers, dates). */
  GTE = 'gte',
  /** Less than comparison (numbers, dates). */
  LT = 'lt',
  /** Less than or equal comparison (numbers, dates). */
  LTE = 'lte',
  /** Value must be one of the provided array elements. */
  IN = 'in',
  /** Value must fall within the provided [min, max] array. */
  BETWEEN = 'between',
  /** Value must be null or missing. */
  IS_NULL = 'is_null',
  /** Value must be present and not null. */
  IS_NOT_NULL = 'is_not_null',
}

/**
 * Supported field casts for record filters.
 */
export enum RecordFieldCast {
  /** Text comparison (default for string values). */
  TEXT = 'text',
  /** Numeric comparison. */
  NUMBER = 'number',
  /** Boolean comparison. */
  BOOLEAN = 'boolean',
  /** UUID comparison. */
  UUID = 'uuid',
  /** Date/time comparison. */
  DATE = 'date',
}

/**
 * Sort direction for record queries.
 */
export enum RecordSortDirection {
  /** Ascending order. */
  ASC = 'asc',
  /** Descending order. */
  DESC = 'desc',
}

/**
 * Aggregation operations supported over record data fields.
 */
export enum RecordAggregateOperator {
  /** Count of matching records. */
  COUNT = 'count',
  /** Sum of a numeric data field. */
  SUM = 'sum',
  /** Average of a numeric data field. */
  AVG = 'avg',
  /** Minimum value of a data field. */
  MIN = 'min',
  /** Maximum value of a data field. */
  MAX = 'max',
}

/**
 * A single server-side filter applied to a record query.
 */
export interface IRecordFilter {
  /** Column name to filter. Use a data column name or a top-level column (id, created_at, updated_at). */
  field: string;
  /** Comparison operator applied to the field. */
  op: RecordFilterOperator;
  /** Comparison value. Required for all operators except is_null and is_not_null. */
  value?: any;
  /** Optional explicit cast. Auto-detected from the value type when omitted. */
  cast?: RecordFieldCast;
}

/**
 * A single sort entry for a record query.
 */
export interface IRecordSort {
  /** Column name to sort by. */
  field: string;
  /** Sort direction. Defaults to ascending. */
  dir?: RecordSortDirection;
}

/**
 * Aggregation specification for a record query.
 */
export interface IRecordAggregate {
  /** Aggregation operation to perform. */
  op: RecordAggregateOperator;
  /** Data field aggregated for sum/avg/min/max. Ignored for count. */
  field?: string;
  /** Optional data field to group results by. */
  groupBy?: string;
}

/**
 * Options for server-side record queries.
 */
export interface IQueryRecordsOptions {
  /** Filters applied server-side before pagination. */
  filters?: IRecordFilter[];
  /** Sort entries applied server-side. */
  sort?: IRecordSort[];
  /** Maximum number of records to return. Capped at 500 by the backend. */
  limit?: number;
  /** Number of records to skip before returning results. */
  offset?: number;
}

/**
 * Result of a server-side record query.
 */
export interface IQueryRecordsResult {
  /** Records matching the query for the current page. */
  records: IDatabaseRecord[];
  /** Total number of records matching the query filters (ignores limit/offset). */
  total: number;
}

/**
 * A single aggregation result row.
 */
export interface IAggregateResult {
  /** Group value when the aggregation included a groupBy field. */
  key?: string | null;
  /** Aggregated value. */
  value: number | null;
}

/**
 * Bulk operation applied to a single record inside a batch request.
 */
export enum RecordBulkOperation {
  /** Insert of a new record. */
  CREATE = "create",
  /** Update of an existing record. */
  UPDATE = "update",
  /** Update when the id exists, insert otherwise. */
  UPSERT = "upsert",
  /** Removal of an existing record. */
  DELETE = "delete",
}

/**
 * Update of a single existing record inside a batch request.
 */
export interface IRecordUpdate {
  /** Unique identifier of the record. */
  id: string;
  /** Replacement record data. Structure must conform to the parent database schema. */
  data: Record<string, any>;
}

/**
 * Upsert of a single record inside a batch request.
 */
export interface IRecordUpsert {
  /** Replacement record data. Structure must conform to the parent database schema. */
  data: Record<string, any>;
  /** Unique identifier of the record. When omitted, the entry is always inserted. */
  id?: string;
}

/**
 * Payload for a batch of record operations executed with one gateway call.
 */
export interface IBatchRecordsPayload {
  /** Raw data objects inserted as new records. */
  create: Record<string, any>[];
  /** Updates applied to existing records. */
  update: IRecordUpdate[];
  /** Upserts applied by id when present, inserted otherwise. */
  upsert: IRecordUpsert[];
  /** Identifiers of the records removed by the batch. */
  deleteIds: string[];
}

/**
 * Failure of a single record operation inside a batch request.
 */
export interface IBatchRecordError {
  /** Bulk operation that failed. */
  op: RecordBulkOperation;
  /** Human-readable failure reason. */
  message: string;
  /** Unique identifier of the record when the operation targeted one. */
  id?: string;
  /** Zero-based position of the item inside its operation list. */
  index?: number;
}

/**
 * Result of a batch of record operations.
 */
export interface IBatchRecordsResult {
  /** Records inserted by the batch. */
  created: IDatabaseRecord[];
  /** Records updated by the batch. */
  updated: IDatabaseRecord[];
  /** Records inserted or updated by the upsert entries. */
  upserted: IDatabaseRecord[];
  /** Identifiers of the records removed by the batch. */
  deletedIds: string[];
  /** Per-item failures. Empty when every operation succeeded. */
  errors: IBatchRecordError[];
}

/**
 * Represents a file object stored in a storage bucket.
 */
export interface IStorageObject {
  /** Name of the bucket where the file is stored. */
  bucket: string;
  /** Unique key/path of the file within the bucket. */
  key: string;
  /** File size in bytes. */
  size: number;
  /** MIME type of the file (e.g. "image/png", "application/pdf"). */
  mimeType: string;
  /** ISO 8601 formatted timestamp of when the file was uploaded. */
  uploadedAt: string;
  /** Publicly accessible URL for downloading the file. */
  url: string;
}

/**
 * Status of a document.
 */
export enum DocumentStatus {
  /** The document is a draft and not yet publicly visible. */
  DRAFT = "draft",
  /** The document is published and visible according to its scope. */
  PUBLISHED = "published",
}

/**
 * Sharing scope of a document.
 * Determines who can view the document.
 */
export enum DocumentScopeType {
  /** Anyone with the document link can view it. */
  PUBLIC = "public",
  /** Only members of the owning organization can view it. */
  ORGANIZATION = "organization",
  /** Only members of the owning project can view it. */
  PROJECT = "project",
}

/**
 * Orientation of the A4 sheet of a document.
 */
export enum DocumentOrientation {
  /** Vertical sheet (210mm wide, 794px @96dpi). */
  PORTRAIT = "portrait",
  /** Horizontal sheet (297mm wide, 1123px @96dpi). */
  LANDSCAPE = "landscape",
}

/**
 * Document-specific block types that extend the widget types.
 * Used as the `widgetType` of a document block alongside `WidgetType` values.
 */
export enum DocumentBlockType {
  /** A table with editable cells and per-cell alignment. */
  TABLE = "table",
  /** A list of items (bullets, numbered, or checklist). */
  LIST = "list",
  /** A horizontal separator line. */
  DIVIDER = "divider",
  /** An embed of a platform resource (kanban, form, database, diagram, or file). */
  EMBED = "embed",
}

/**
 * All possible block types of a document sheet:
 * the existing widget types plus the document-specific block types.
 */
export type DocumentBlockWidgetType = WidgetType | DocumentBlockType;

/**
 * Grid position and size of a document block on the A4 sheet grid.
 * Extends the widget position with maximum bounds (used by full-width blocks).
 */
export interface IDocumentBlockPosition extends IWidgetPosition {
  /** Maximum grid width allowed when resizing. */
  maxW?: number;
  /** Maximum grid height allowed when resizing. */
  maxH?: number;
}

/**
 * Represents a document (wiki page) within a project.
 * Documents are A4 sheets filled with a grid of blocks.
 */
export interface IDocument extends ITimestamps {
  /** Unique identifier of the document. */
  id: string;
  /** Reference to the parent organization. */
  organizationId: string;
  /** Reference to the parent project. */
  projectId: string;
  /** Display title of the document. */
  title: string;
  /** Short summary shown in the documents list. */
  description?: string;
  /** Orientation of the A4 sheet. */
  orientation: DocumentOrientation;
  /** Publication status of the document. */
  status: DocumentStatus;
  /** Sharing scope of the document. */
  scope: DocumentScopeType;
  /** SHA-256 hex hash of the password protecting the document, if any. */
  passwordHash?: string | null;
}

/**
 * Represents a block instance inside a document sheet.
 * The `config` shape is determined by the `widgetType` value.
 */
export interface IDocumentBlock extends ITimestamps {
  /** Unique identifier of the block instance. */
  id: string;
  /** Reference to the parent document. */
  documentId: string;
  /** Type of block. Determines the rendering component and config schema. */
  widgetType: DocumentBlockWidgetType;
  /** Block-specific configuration. Shape varies by `widgetType`. */
  config: Record<string, any>;
  /** Grid position and size of the block on the A4 sheet. */
  position: IDocumentBlockPosition;
}

/** Payload for creating a new document. Title is required; description, orientation, status, and scope are optional. */
export interface ICreateDocumentPayload extends Pick<IDocument, 'title'>, Partial<Pick<IDocument, 'description' | 'orientation' | 'status' | 'scope'>> { }

/**
 * Payload for creating a complete document with all its blocks in a single call.
 * Extends the document creation payload with the blocks to create inside it.
 */
export interface ICreateDocumentWithBlocksPayload extends ICreateDocumentPayload {
  /** Blocks created inside the document in the same transaction. */
  blocks: ICreateDocumentBlockPayload[];
}

/**
 * Result of creating a document with its blocks in a single call.
 */
export interface ICreateDocumentWithBlocksResult {
  /** The created document. */
  document: IDocument;
  /** The blocks created inside the document. */
  blocks: IDocumentBlock[];
}

/** Payload for updating an existing document. Only provided fields will be updated. */
export interface IUpdateDocumentPayload extends Partial<Pick<IDocument, 'title' | 'description' | 'orientation' | 'status' | 'scope' | 'passwordHash'>> { }

/** Payload for creating a new block in a document. The widget type, config, and position are required. */
export interface ICreateDocumentBlockPayload extends Pick<IDocumentBlock, 'widgetType' | 'config' | 'position'> { }

/** Payload for creating several blocks in an existing document in a single request. */
export interface ICreateDocumentBlocksPayload {
  /** Blocks created inside the document in the same transaction. */
  blocks: ICreateDocumentBlockPayload[];
}

/** Payload for updating an existing document block. Only provided fields will be updated. */
export interface IUpdateDocumentBlockPayload extends Partial<Pick<IDocumentBlock, 'widgetType' | 'config' | 'position'>> { }

/** Payload for updating the positions of several document blocks in a single request. */
export interface IBlockPositionUpdate {
  /** Identifier of the block to update. */
  blockId: string;
  /** New grid position and size of the block on the A4 sheet. */
  position: IDocumentBlockPosition;
}

// ─────────────────────────────────────────────
// Widget text conversion (AI-readable)
// ─────────────────────────────────────────────

/**
 * Minimal widget-like shape consumed by the text conversion utilities.
 * Satisfied by both `IWidgetInstance` (home dashboard widgets) and
 * `IDocumentBlock` (document blocks), since both expose `id`, `widgetType`
 * and `config`.
 */
export interface IWidgetLike {
  /** Unique identifier of the widget or block instance. */
  id: string;
  /** Type of the widget or block. Determines the text representation. */
  widgetType: DocumentBlockWidgetType;
  /** Widget-specific configuration. Shape varies by `widgetType`. */
  config: Record<string, any>;
}

/**
 * Widget-like shape that also carries a grid position, used to order content
 * in reading order (top to bottom, left to right).
 */
export type IWidgetLikeWithPosition = IWidgetLike & { position?: IWidgetPosition; };

/**
 * Supported text output formats of the `readContent` methods.
 */
export enum WidgetTextFormat {
  /** AI-friendly: widget id followed by its Markdown inside a fenced code block. */
  AI = "ai",
  /** Raw Markdown representation of each widget, one after another. */
  MARKDOWN = "markdown",
  /** Plain text representation of each widget, one after another. */
  PLAIN = "plain",
}

/**
 * Options accepted by the `readContent` methods of the documents and widgets modules.
 */
export interface IWidgetTextOptions {
  /** Output format of the generated content. Defaults to `WidgetTextFormat.AI`. */
  format?: WidgetTextFormat;
}

/**
 * Converts a value into a safe table cell: pipes are escaped and line breaks
 * are collapsed into single spaces so the cell cannot break the table.
 */
function escapeTableCell(value: any): string {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

/**
 * Builds a fenced code block around a markdown payload. The fence grows when
 * the payload itself contains backticks so the wrapper never breaks.
 */
function buildMarkdownFence(content: string, language = 'md'): string {
  const runs = content.match(/`+/g) ?? [];
  const longestRun = runs.reduce((max, run) => Math.max(max, run.length), 0);
  const fence = '`'.repeat(Math.max(3, longestRun + 1));
  const result = `${fence}${language}\n${content}\n${fence}`;

  return result;
}

/**
 * Renders the markdown marker of a list item (bullet, number, or checkbox).
 */
function markdownListItemMarker(item: IListItem, index: number, style: ListStyleType): string {
  if (style === ListStyleType.NUMBERED) {
    return `${index + 1}.`;
  }

  if (style === ListStyleType.CHECKLIST) {
    const state = item.checked ? 'x' : ' ';

    return `- [${state}]`;
  }

  return '-';
}

/**
 * Renders the plain-text marker of a list item (bullet, number, or checkbox).
 */
function plainListItemMarker(item: IListItem, index: number, style: ListStyleType): string {
  if (style === ListStyleType.NUMBERED) {
    return `${index + 1}.`;
  }

  if (style === ListStyleType.CHECKLIST) {
    const state = item.checked ? 'x' : ' ';

    return `[${state}]`;
  }

  return '-';
}

/**
 * Converts a widget or document block into its Markdown representation.
 * Widgets without content produce an empty string. Unknown widget types fall
 * back to a pretty-printed JSON of the config so future types never lose data.
 */
export function widgetToMarkdown(widget: IWidgetLike): string {
  const { widgetType, config } = widget;

  switch (widgetType) {
    case WidgetType.METRICS: {
      const c = config as Partial<IMetricsConfig>;
      const value = `${c.prefix ?? ''}${c.value ?? ''}${c.suffix ?? ''}`;
      const unit = c.unit ? ` ${c.unit}` : '';
      const trend = c.trend === 'up' ? '(up)' : c.trend === 'down' ? '(down)' : '(neutral)';
      const result = `**${c.title ?? ''}**: ${value}${unit} ${trend}`.trim();

      return result;
    }

    case WidgetType.TITLE: {
      const c = config as Partial<ITitleConfig>;
      const level = Math.min(Math.max(c.level ?? 1, 1), 5);
      const result = `${'#'.repeat(level)} ${c.content ?? ''}`.trim();

      return result;
    }

    case WidgetType.TOGGLE: {
      const c = config as Partial<IToggleConfig>;
      const isOn = c.currentValue ?? c.defaultValue ?? false;
      const state = isOn ? 'x' : ' ';
      const result = `- [${state}] ${c.label ?? ''}`.trim();

      return result;
    }

    case WidgetType.BUTTON: {
      const c = config as Partial<IButtonConfig>;
      const label = c.label || c.action || 'Button';
      const result = `[${label}](${c.action ?? ''})`;

      return result;
    }

    case WidgetType.IMAGE: {
      const c = config as Partial<IImageConfig>;
      const alt = c.alt || 'image';
      const result = `![${alt}](${c.src ?? ''})`;

      return result;
    }

    case WidgetType.TEXTAREA: {
      const c = config as Partial<ITextareaConfig>;

      return c.content ?? '';
    }

    case WidgetType.CODE: {
      const c = config as Partial<ICodeConfig>;
      const result = `\`\`\`${c.language ?? ''}\n${c.code ?? ''}\n\`\`\``;

      return result;
    }

    case WidgetType.CHART: {
      const c = config as Partial<IChartConfig>;
      const header = `**${c.title ?? ''}** (${c.type ?? 'chart'})`.trim();
      const labels = String(c.labels ?? '').split(',').map((label) => label.trim()).filter(Boolean);
      const values = String(c.data ?? '').split(',').map((value) => value.trim()).filter(Boolean);

      if (labels.length === 0 && values.length === 0) {
        return header;
      }

      const rows = labels.length > 0
        ? labels.map((label, index) => [label, values[index] ?? ''])
        : values.map((value, index) => [String(index + 1), value]);
      const table = [
        '| Label | Value |',
        '| --- | --- |',
        ...rows.map(([label, value]) => `| ${escapeTableCell(label)} | ${escapeTableCell(value)} |`),
      ];
      const result = `${header}\n\n${table.join('\n')}`;

      return result;
    }

    case WidgetType.PROGRESS_BAR: {
      const c = config as Partial<IProgressBarConfig>;
      const result = `**${c.label ?? ''}**: ${c.value ?? 0}%`.trim();

      return result;
    }

    case WidgetType.PROGRESS_BAR_LIST: {
      const c = config as Partial<IProgressBarListConfig>;
      const items = c.items ?? [];
      const result = items.map((item) => `- **${item.label}**: ${item.value}%`).join('\n');

      return result;
    }

    case WidgetType.YOUTUBE: {
      const c = config as Partial<IYoutubeConfig>;
      const result = `[Watch on YouTube](${c.url ?? ''})`;

      return result;
    }

    case WidgetType.LINK: {
      const c = config as Partial<ILinkConfig>;
      const label = c.label || c.url || '';
      const result = `[${label}](${c.url ?? ''})`;

      return result;
    }

    case WidgetType.TABLE: {
      const c = config as Partial<ITableConfig>;
      const columns = c.columns ?? [];

      if (columns.length === 0) {
        return '';
      }

      const rows = (c.rows ?? []).map((row) => {
        const cells = Array.from({ length: columns.length }, (_, index) => escapeTableCell(row[index]));
        const line = `| ${cells.join(' | ')} |`;

        return line;
      });
      const header = `| ${columns.map((column) => escapeTableCell(column)).join(' | ')} |`;
      const separator = `| ${columns.map(() => '---').join(' | ')} |`;
      const result = [header, separator, ...rows].join('\n');

      return result;
    }

    case WidgetType.LIST: {
      const c = config as Partial<IListConfig>;
      const style = c.style ?? ListStyleType.BULLETS;
      const result = (c.items ?? [])
        .map((item, index) => `${markdownListItemMarker(item, index, style)} ${item.text}`)
        .join('\n');

      return result;
    }

    case WidgetType.DIVIDER: {
      return '---';
    }

    case WidgetType.EMBED: {
      const c = config as Partial<IEmbedConfig>;
      const resourceType = c.resourceType ?? 'resource';
      const result = `> Embed: ${resourceType} \`${c.resourceId ?? ''}\``;

      return result;
    }

    default: {
      const result = JSON.stringify(config, null, 2);

      return result;
    }
  }
}

/**
 * Converts a widget or document block into its plain-text representation.
 * Widgets without content produce an empty string. Unknown widget types fall
 * back to a pretty-printed JSON of the config so future types never lose data.
 */
export function widgetToText(widget: IWidgetLike): string {
  const { widgetType, config } = widget;

  switch (widgetType) {
    case WidgetType.METRICS: {
      const c = config as Partial<IMetricsConfig>;
      const value = `${c.prefix ?? ''}${c.value ?? ''}${c.suffix ?? ''}`;
      const unit = c.unit ? ` ${c.unit}` : '';
      const trend = c.trend ?? 'neutral';
      const result = `${c.title ?? ''}: ${value}${unit} (${trend})`.trim();

      return result;
    }

    case WidgetType.TITLE: {
      const c = config as Partial<ITitleConfig>;

      return (c.content ?? '').trim();
    }

    case WidgetType.TOGGLE: {
      const c = config as Partial<IToggleConfig>;
      const isOn = c.currentValue ?? c.defaultValue ?? false;
      const stateLabel = isOn ? c.onLabel ?? 'On' : c.offLabel ?? 'Off';
      const result = `${c.label ?? ''}: ${stateLabel}`.trim();

      return result;
    }

    case WidgetType.BUTTON: {
      const c = config as Partial<IButtonConfig>;
      const label = c.label ?? '';
      const result = `${label}: ${c.action ?? ''}`.trim();

      return result;
    }

    case WidgetType.IMAGE: {
      const c = config as Partial<IImageConfig>;
      const alt = c.alt || 'image';
      const result = `Image: ${alt} (${c.src ?? ''})`.trim();

      return result;
    }

    case WidgetType.TEXTAREA: {
      const c = config as Partial<ITextareaConfig>;

      return c.content ?? '';
    }

    case WidgetType.CODE: {
      const c = config as Partial<ICodeConfig>;
      const language = c.language || 'text';
      const result = `Code (${language}):\n${c.code ?? ''}`;

      return result;
    }

    case WidgetType.CHART: {
      const c = config as Partial<IChartConfig>;
      const labels = String(c.labels ?? '').split(',').map((label) => label.trim()).filter(Boolean);
      const values = String(c.data ?? '').split(',').map((value) => value.trim()).filter(Boolean);
      const rows = labels.length > 0
        ? labels.map((label, index) => `${label}: ${values[index] ?? ''}`)
        : values.map((value, index) => `${index + 1}: ${value}`);
      const lines = [`${c.title ?? ''} (${c.type ?? 'chart'})`, ...rows];
      const result = lines.join('\n').trim();

      return result;
    }

    case WidgetType.PROGRESS_BAR: {
      const c = config as Partial<IProgressBarConfig>;
      const result = `${c.label ?? ''}: ${c.value ?? 0}%`.trim();

      return result;
    }

    case WidgetType.PROGRESS_BAR_LIST: {
      const c = config as Partial<IProgressBarListConfig>;
      const result = (c.items ?? []).map((item) => `${item.label}: ${item.value}%`).join('\n');

      return result;
    }

    case WidgetType.YOUTUBE: {
      const c = config as Partial<IYoutubeConfig>;
      const result = `YouTube: ${c.url ?? ''}`.trim();

      return result;
    }

    case WidgetType.LINK: {
      const c = config as Partial<ILinkConfig>;
      const label = c.label ?? '';
      const result = `${label}: ${c.url ?? ''}`.trim();

      return result;
    }

    case WidgetType.TABLE: {
      const c = config as Partial<ITableConfig>;
      const columns = c.columns ?? [];

      if (columns.length === 0) {
        return '';
      }

      const rows = (c.rows ?? []).map((row) => columns.map((_, index) => row[index] ?? '').join(' | '));
      const header = `Columns: ${columns.join(' | ')}`;
      const result = [header, ...rows].join('\n');

      return result;
    }

    case WidgetType.LIST: {
      const c = config as Partial<IListConfig>;
      const style = c.style ?? ListStyleType.BULLETS;
      const result = (c.items ?? [])
        .map((item, index) => `${plainListItemMarker(item, index, style)} ${item.text}`)
        .join('\n');

      return result;
    }

    case WidgetType.DIVIDER: {
      return '---';
    }

    case WidgetType.EMBED: {
      const c = config as Partial<IEmbedConfig>;
      const resourceType = c.resourceType ?? 'resource';
      const result = `Embed: ${resourceType} (${c.resourceId ?? ''})`.trim();

      return result;
    }

    default: {
      const result = JSON.stringify(config, null, 2);

      return result;
    }
  }
}

/**
 * Converts a widget or document block into AI-friendly text: the instance id
 * followed by its Markdown representation inside a fenced code block.
 *
 * @example
 * ```
 * 4f38f3e8-bb28-4888-93a6-5724f737796d:
 * ```md
 * ### 10. Preguntas abiertas
 * ```
 * ```
 */
export function widgetToAIText(widget: IWidgetLike): string {
  const markdown = widgetToMarkdown(widget);
  const result = `${widget.id}:\n${buildMarkdownFence(markdown)}`;

  return result;
}

/**
 * Converts several widgets or document blocks into AI-friendly text, one
 * widget per line, separated by a blank line.
 */
export function widgetsToAIText(widgets: IWidgetLike[]): string {
  const result = widgets.map(widgetToAIText).join('\n\n');

  return result;
}

/**
 * Orders widget-like items in reading order (top to bottom, left to right)
 * using their grid position and converts them to the requested format.
 */
export function widgetsToContent(widgets: IWidgetLikeWithPosition[], options: IWidgetTextOptions = {}): string {
  const format = options.format ?? WidgetTextFormat.AI;
  const ordered = [...widgets].sort((a, b) => {
    const rowDiff = (a.position?.y ?? 0) - (b.position?.y ?? 0);

    if (rowDiff !== 0) {
      return rowDiff;
    }

    const colDiff = (a.position?.x ?? 0) - (b.position?.x ?? 0);

    return colDiff;
  });

  if (format === WidgetTextFormat.MARKDOWN) {
    const result = ordered.map((widget) => widgetToMarkdown(widget)).join('\n\n');

    return result;
  }

  if (format === WidgetTextFormat.PLAIN) {
    const result = ordered.map((widget) => widgetToText(widget)).join('\n\n');

    return result;
  }

  const result = widgetsToAIText(ordered);

  return result;
}

// ─────────────────────────────────────────────
// SDK Classes
// ─────────────────────────────────────────────

/**
 * Main SDK for interacting with the LedGo platform.
 * Provides access to Kanbans, Forms, Databases, Diagrams, Documents, Widgets, and Storage modules.
 *
 * @example
 * ```ts
 * const sdk = new LedGoSDK({
 *   baseUrl: 'https://api.ledgo.ai',
 *   token: 'your-integration-token',
 *   organizationId: 'org-123'
 * });
 * ```
 */
export class LedGoSDK {
  private client: HttpClient;
  private publicClient: HttpClient;

  /** Module for managing kanban dashboards, columns, panels, cards, and blueprints. */
  public kanbans: KanbansModule;
  /** Module for creating and managing forms and their responses. */
  public forms: FormsModule;
  /** Module for managing custom databases and their records. */
  public databases: DatabasesModule;
  /** Module for managing Mermaid.js diagrams. */
  public diagrams: DiagramsModule;
  /** Module for managing project documents and their blocks. */
  public documents: DocumentsModule;
  /** Module for the cross-cutting comments layer anchored to databases. */
  public comments: CommentsModule;
  /** Module for managing home dashboard widgets. */
  public widgets: WidgetsModule;
  /** Module for file storage operations (upload, download, delete). */
  public storage: StorageModule;

  constructor(config: ILedGoConfig) {
    const baseUrl = config.organizationId
      ? `${config.baseUrl}/organizations/${config.organizationId}`
      : config.baseUrl;

    this.client = new HttpClient(baseUrl, {
      'Authorization': `Bearer ${config.token}`,
      'Content-Type': 'application/json'
    });

    this.publicClient = new HttpClient(config.baseUrl, {
      'Content-Type': 'application/json'
    });

    this.kanbans = new KanbansModule(this.client, this.publicClient);
    this.forms = new FormsModule(this.client);
    this.databases = new DatabasesModule(this.client);
    this.diagrams = new DiagramsModule(this.client);
    this.documents = new DocumentsModule(this.client);
    this.comments = new CommentsModule(this.client);
    this.widgets = new WidgetsModule(this.client);
    this.storage = new StorageModule(this.client);
  }
}

/**
 * Handles operations related to the Kanbans module.
 * Provides CRUD for dashboards, columns, panels, and cards, plus blueprint
 * management (public configuration and signed access links) and public board
 * usage through signed links.
 */
class KanbansModule {
  constructor(private client: HttpClient, private publicClient: HttpClient) { }

  /** Retrieves all kanban dashboards for the organization. */
  async listDashboards(): Promise<IKanbanDashboard[]> {
    const { data } = await this.client.get('/kanbans/dashboards');

    return data;
  }

  /** Creates a new kanban dashboard. */
  async createDashboard(payload: ICreateKanbanDashboardPayload): Promise<IKanbanDashboard> {
    const requestPayload = toSnakeCase(payload);
    const { data } = await this.client.post('/kanbans/dashboards', requestPayload);

    return data;
  }

  /** Updates an existing kanban dashboard's name or template. */
  async updateDashboard(id: string, payload: Partial<ICreateKanbanDashboardPayload>): Promise<IKanbanDashboard> {
    const requestPayload = toSnakeCase(payload);
    const { data } = await this.client.patch(`/kanbans/dashboards/${id}`, requestPayload);

    return data;
  }

  /** Deletes a kanban dashboard and all its columns, panels, and cards. */
  async deleteDashboard(id: string): Promise<void> {
    await this.client.delete(`/kanbans/dashboards/${id}`);
  }

  /**
   * Lists all items (columns, panels, and cards) within a dashboard.
   * Returns a grouped object with arrays for each item type.
   */
  async listItems(dashboardId: string): Promise<{ columns: IKanbanColumn[], panels: IKanbanPanel[], cards: IKanbanCard[]; }> {
    const { data } = await this.client.get(`/kanbans/dashboards/${dashboardId}/items`);

    return data;
  }

  /** Retrieves a single item (column, panel, or card) by its ID. */
  async getItem(id: string): Promise<IKanbanCard | IKanbanColumn | IKanbanPanel> {
    const { data } = await this.client.get(`/kanbans/items/${id}`);

    return data;
  }

  async createItem(dashboardId: string, type: KanbanItemType.COLUMN, payload: ICreateKanbanColumnPayload): Promise<IKanbanColumn>;
  async createItem(dashboardId: string, type: KanbanItemType.PANEL, payload: ICreateKanbanPanelPayload): Promise<IKanbanPanel>;
  async createItem(dashboardId: string, type: KanbanItemType.CARD, payload: ICreateKanbanCardPayload): Promise<IKanbanCard>;
  /** Creates a new item (column, panel, or card) within a dashboard. */
  async createItem(dashboardId: string, type: KanbanItemType, payload: any): Promise<any> {
    const requestPayload = toSnakeCase({ type, ...payload });
    const { data } = await this.client.post(`/kanbans/dashboards/${dashboardId}/items`, requestPayload);

    return data;
  }

  async updateItem(id: string, type: KanbanItemType.COLUMN, payload: Partial<ICreateKanbanColumnPayload>): Promise<IKanbanColumn>;
  async updateItem(id: string, type: KanbanItemType.PANEL, payload: Partial<ICreateKanbanPanelPayload>): Promise<IKanbanPanel>;
  async updateItem(id: string, type: KanbanItemType.CARD, payload: Partial<ICreateKanbanCardPayload>): Promise<IKanbanCard>;
  /** Updates an existing item's properties. */
  async updateItem(id: string, type: KanbanItemType, payload: any): Promise<any> {
    const requestPayload = toSnakeCase({ type, ...payload });
    const { data } = await this.client.patch(`/kanbans/items/${id}`, requestPayload);

    return data;
  }

  /** Deletes an item (column, panel, or card) by ID and type. */
  async deleteItem(id: string, type: KanbanItemType): Promise<void> {
    const requestPayload = toSnakeCase({ type });

    await this.client.delete(`/kanbans/items/${id}`, { data: requestPayload });
  }

  /** Moves an item to a new container or changes its position within the current container. */
  async moveItem(id: string, type: KanbanItemType, targetId: string, position: number): Promise<void> {
    const requestPayload = { type, targetId, position };

    await this.client.post(`/kanbans/items/${id}/move`, requestPayload);
  }

  /**
   * Creates a blueprint dashboard. Blueprint boards render their structure and
   * cards from an external provider configured through `updatePublicConfig`.
   *
   * @param payload Dashboard name, optional card template, and optional scope.
   */
  async createBlueprint(payload: ICreateKanbanDashboardPayload): Promise<IKanbanDashboard> {
    return this.createDashboard({ ...payload, boardType: KanbanBoardType.BLUEPRINT });
  }

  /**
   * Updates the visibility scope of a dashboard. Publishing a board
   * (`KanbanScopeType.PUBLIC`) is subject to the organization plan limit.
   */
  async setScope(dashboardId: string, scope: KanbanScopeType): Promise<IKanbanDashboard> {
    return this.updateDashboard(dashboardId, { scope });
  }

  /**
   * Reads the server-only public configuration of a blueprint.
   * Returns null when the dashboard has no configuration yet.
   */
  async getPublicConfig(dashboardId: string): Promise<IKanbanPublicConfig | null> {
    const { data } = await this.client.get(`/kanbans/dashboards/${dashboardId}/public-config`);

    return data ?? null;
  }

  /**
   * Creates or updates the public configuration of a blueprint. Only the
   * provided fields are written; the rest keep their stored value.
   */
  async updatePublicConfig(dashboardId: string, payload: IUpdateKanbanPublicConfigPayload): Promise<IKanbanPublicConfig> {
    const requestPayload = toSnakeCase(payload);
    const { data } = await this.client.patch(`/kanbans/dashboards/${dashboardId}/public-config`, requestPayload);

    return data;
  }

  /**
   * Mints a signed access link for a dashboard. The link grants read or edit
   * access to the public route of the board and can be restricted by TTL,
   * single use, and allowed containers.
   *
   * The gateway expects camelCase keys for this endpoint, so the payload is
   * forwarded as-is.
   */
  async createAccessLink(dashboardId: string, payload: ICreateKanbanAccessLinkPayload = {}): Promise<IKanbanAccessLinkResult> {
    const { data } = await this.client.post(`/kanbans/dashboards/${dashboardId}/access-links`, payload);

    return data;
  }

  /** Lists the access links minted for a dashboard, newest first. */
  async listAccessLinks(dashboardId: string): Promise<IKanbanAccessLink[]> {
    const { data } = await this.client.get(`/kanbans/dashboards/${dashboardId}/access-links`);

    return data;
  }

  /** Revokes an access link so it can no longer be used. */
  async revokeAccessLink(jti: string): Promise<void> {
    await this.client.delete(`/kanbans/access-links/${jti}`);
  }

  /**
   * Reads a public blueprint board. When the board requires a signed link,
   * pass the token minted by `createAccessLink` in `options.linkToken`.
   */
  async getPublicBoard(dashboardId: string, options: IGetPublicKanbanOptions = {}): Promise<IKanbanBoardData> {
    const query = options.linkToken ? `?t=${encodeURIComponent(options.linkToken)}` : '';
    const { data } = await this.publicClient.get(`/public/kanbans/${dashboardId}${query}`);

    return data;
  }

  /**
   * Moves a card through a public signed link and returns the replacement
   * board. The link must grant edit scope.
   */
  async movePublicCard(dashboardId: string, payload: IMovePublicKanbanCardPayload): Promise<IKanbanBoardData> {
    const requestPayload = {
      event: KanbanWriteEventType.CARD_MOVED,
      cardId: payload.cardId,
      to: payload.to,
      data: payload.data ?? {},
      ...(payload.baseVersion === undefined ? {} : { baseVersion: payload.baseVersion }),
    };
    const path = `/public/kanbans/${dashboardId}/move?t=${encodeURIComponent(payload.linkToken)}`;
    const { data } = await this.publicClient.post(path, requestPayload);

    return data;
  }

  /**
   * Runs a declarative card action through a public signed link and returns the
   * replacement board. The link must grant edit scope.
   */
  async runPublicCardAction(dashboardId: string, payload: IRunPublicKanbanCardActionPayload): Promise<IKanbanBoardData> {
    const requestPayload = {
      event: KanbanWriteEventType.CARD_ACTION,
      cardId: payload.cardId,
      actionId: payload.actionId,
      data: {},
      ...(payload.baseVersion === undefined ? {} : { baseVersion: payload.baseVersion }),
    };
    const path = `/public/kanbans/${dashboardId}/move?t=${encodeURIComponent(payload.linkToken)}`;
    const { data } = await this.publicClient.post(path, requestPayload);

    return data;
  }
}

/**
 * Handles operations related to the Forms module.
 * Provides CRUD for forms, response listing, and form session URLs.
 */
class FormsModule {
  constructor(private client: HttpClient) { }

  /**
   * Returns the URL of the form session endpoint. External providers use it
   * to create (POST), update (PATCH) and read (GET ?id=) the async session
   * record of a form by its session token. The token is a capability: it is
   * sent in the request body for POST/PATCH and as `?id=` for GET.
   *
   * Primary:   https://{appKey}.function2.insforge.app/form-session
   * Fallback:  {baseUrl}/functions/form-session (non-insforge.app hosts)
   */
  getFormSessionUrl(): string {
    const baseUrl = this.client.getBaseUrl();
    const functionsBaseUrl = deriveFunctionsBaseUrl(baseUrl);

    return functionsBaseUrl ? `${functionsBaseUrl}/form-session` : `${baseUrl}/functions/form-session`;
  }

  /** Returns the URL to read a form session record by its session token (GET). */
  getFormSessionReadUrl(sessionId: string): string {
    return `${this.getFormSessionUrl()}?id=${encodeURIComponent(sessionId)}`;
  }

  /** Lists all forms for the organization. */
  async listForms(): Promise<IForm[]> {
    const { data } = await this.client.get('/forms');

    return data;
  }

  /** Creates a new form with the given configuration. */
  async createForm(payload: ICreateFormPayload): Promise<IForm> {
    const requestPayload = toSnakeCase(payload);
    const { data } = await this.client.post('/forms', requestPayload);

    return data;
  }

  /** Updates an existing form's configuration. */
  async updateForm(id: string, payload: Partial<ICreateFormPayload>): Promise<IForm> {
    const requestPayload = toSnakeCase(payload);
    const { data } = await this.client.patch(`/forms/${id}`, requestPayload);

    return data;
  }

  /** Deletes a form and all its associated responses. */
  async deleteForm(id: string): Promise<void> {
    await this.client.delete(`/forms/${id}`);
  }

  /** Retrieves all submissions/responses for a specific form. */
  async listResponses(formId: string): Promise<IFormResponse[]> {
    const { data } = await this.client.get(`/forms/${formId}/responses`);

    return data;
  }
}

/**
 * Handles operations related to the Databases module.
 * Provides CRUD for database definitions and their records.
 */
class DatabasesModule {
  constructor(private client: HttpClient) { }

  /** Lists all custom databases for the organization. */
  async listDatabases(): Promise<IDatabase[]> {
    const { data } = await this.client.get('/databases');

    return data;
  }

  /** Creates a new custom database structure. */
  async createDatabase(payload: ICreateDatabasePayload): Promise<IDatabase> {
    const requestPayload = toSnakeCase(payload);
    const { data } = await this.client.post('/databases', requestPayload);

    return data;
  }

  /** Updates an existing database's name, description, or schemas. */
  async updateDatabase(id: string, payload: Partial<ICreateDatabasePayload>): Promise<IDatabase> {
    const requestPayload = toSnakeCase(payload);
    const { data } = await this.client.patch(`/databases/${id}`, requestPayload);

    return data;
  }

  /** Deletes a database and all its records. */
  async deleteDatabase(id: string): Promise<void> {
    await this.client.delete(`/databases/${id}`);
  }

  /** Lists all records within a specific database. */
  async listRecords(databaseId: string): Promise<IDatabaseRecord[]> {
    const { data } = await this.client.get(`/databases/${databaseId}/records`);

    return data;
  }

  /**
   * Runs a server-side query against the records of a database.
   * Supports filtering over data fields and top-level columns, sorting,
   * and pagination. Returns the requested page plus the exact total
   * count of records matching the filters.
   */
  async queryRecords(databaseId: string, options: IQueryRecordsOptions = {}): Promise<IQueryRecordsResult> {
    const params: Record<string, string> = {};

    if (options.filters && options.filters.length > 0) {
      params.filter = JSON.stringify(options.filters);
    }
    if (options.sort && options.sort.length > 0) {
      params.sort = JSON.stringify(options.sort);
    }
    if (options.limit !== undefined) {
      params.limit = String(options.limit);
    }
    if (options.offset !== undefined) {
      params.offset = String(options.offset);
    }

    const { data } = await this.client.get(`${this.buildRecordsPath(databaseId, params)}`);

    return data;
  }

  /** Counts records matching the provided filters without fetching them. */
  async countRecords(databaseId: string, filters: IRecordFilter[] = []): Promise<number> {
    const params: Record<string, string> = {
      aggregate: JSON.stringify({ op: RecordAggregateOperator.COUNT })
    };

    if (filters.length > 0) {
      params.filter = JSON.stringify(filters);
    }

    const { data } = await this.client.get(`${this.buildRecordsPath(databaseId, params)}`);

    return data.aggregate?.[0]?.value ?? 0;
  }

  /** Runs an aggregation (count, sum, avg, min, max) over record data fields, optionally grouped. */
  async aggregateRecords(databaseId: string, aggregate: IRecordAggregate, filters: IRecordFilter[] = []): Promise<IAggregateResult[]> {
    const params: Record<string, string> = {
      aggregate: JSON.stringify(aggregate)
    };

    if (filters.length > 0) {
      params.filter = JSON.stringify(filters);
    }

    const { data } = await this.client.get(`${this.buildRecordsPath(databaseId, params)}`);

    return data.aggregate ?? [];
  }

  /** Builds the records endpoint path with the encoded query string. */
  private buildRecordsPath(databaseId: string, params: Record<string, string>): string {
    const queryString = Object.entries(params)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');

    return `/databases/${databaseId}/records${queryString ? `?${queryString}` : ''}`;
  }

  /** Creates a new record in a database with the provided data. */
  async createRecord(databaseId: string, dataRecord: Record<string, any>): Promise<IDatabaseRecord> {
    const requestPayload = toSnakeCase({ data: dataRecord });
    const { data } = await this.client.post(`/databases/${databaseId}/records`, requestPayload);

    return data;
  }

  /** Updates an existing database record with new data. */
  async updateRecord(databaseId: string, recordId: string, dataRecord: Record<string, any>): Promise<IDatabaseRecord> {
    const requestPayload = toSnakeCase({ data: dataRecord });
    const { data } = await this.client.patch(`/databases/${databaseId}/records/${recordId}`, requestPayload);

    return data;
  }

  /** Deletes a record from a database. */
  async deleteRecord(databaseId: string, recordId: string): Promise<void> {
    await this.client.delete(`/databases/${databaseId}/records/${recordId}`);
  }

  /**
   * Executes a batch of record operations with one gateway call.
   * Best-effort execution: every item is attempted and per-item
   * failures are collected in the errors list of the result.
   */
  async batchRecords(databaseId: string, payload: Partial<IBatchRecordsPayload>): Promise<IBatchRecordsResult> {
    const { create, update, upsert, deleteIds } = payload;
    const createList = create ?? [];
    const updateList = update ?? [];
    const upsertList = upsert ?? [];
    const deleteList = deleteIds ?? [];
    const totalItems = createList.length + updateList.length + upsertList.length + deleteList.length;
    const isEmptyBatch = totalItems === 0;

    if (isEmptyBatch) {
      throw new Error("Missing batch items: provide create, update, upsert or deleteIds");
    }

    const requestPayload = toSnakeCase({ create: createList, update: updateList, upsert: upsertList, deleteIds: deleteList });
    const { data } = await this.client.post(`/databases/${databaseId}/records/batch`, requestPayload);
    const batchResult = data as IBatchRecordsResult;

    return batchResult;
  }

  /** Inserts several records with one gateway call. */
  async createRecords(databaseId: string, dataList: Record<string, any>[]): Promise<IDatabaseRecord[]> {
    const result = await this.batchRecords(databaseId, { create: dataList });
    const createdRecords = result.created;

    return createdRecords;
  }

  /** Updates several records with one gateway call. */
  async updateRecords(databaseId: string, updates: IRecordUpdate[]): Promise<IDatabaseRecord[]> {
    const result = await this.batchRecords(databaseId, { update: updates });
    const updatedRecords = result.updated;

    return updatedRecords;
  }

  /** Inserts or updates several records with one gateway call. */
  async upsertRecords(databaseId: string, upserts: IRecordUpsert[]): Promise<IDatabaseRecord[]> {
    const result = await this.batchRecords(databaseId, { upsert: upserts });
    const upsertedRecords = result.upserted;

    return upsertedRecords;
  }

  /** Deletes several records with one gateway call. */
  async deleteRecords(databaseId: string, ids: string[]): Promise<void> {
    const isEmptyList = ids.length === 0;

    if (isEmptyList) {
      throw new Error("Missing ids: provide at least one record id");
    }

    await this.client.delete(`/databases/${databaseId}/records/batch`, { data: { ids } });
  }
}

/**
 * Handles the cross-cutting comments layer. Comments are not a standalone
 * module: they are anchored to a root resource (database or document) and to
 * one of its sub-targets. Reading and creating require view access on the root
 * resource; editing and deleting only affect own comments.
 */
class CommentsModule {
  constructor(private client: HttpClient) { }

  /** Lists the comments of a database, optionally filtered to one target key. */
  async listForDatabase(databaseId: string, targetKey?: string): Promise<IComment[]> {
    const query = targetKey ? `?target_key=${encodeURIComponent(targetKey)}` : '';
    const { data } = await this.client.get(`/databases/${databaseId}/comments${query}`);

    return data;
  }

  /** Creates a top-level comment or a reply anchored to a database target. */
  async createForDatabase(databaseId: string, payload: ICreateCommentPayload): Promise<IComment> {
    const requestPayload = toSnakeCase(payload);
    const { data } = await this.client.post(`/databases/${databaseId}/comments`, requestPayload);

    return data;
  }

  /** Lists the comments of a document, optionally filtered to one target key. */
  async listForDocument(documentId: string, targetKey?: string): Promise<IComment[]> {
    const query = targetKey ? `?target_key=${encodeURIComponent(targetKey)}` : '';
    const { data } = await this.client.get(`/documents/${documentId}/comments${query}`);

    return data;
  }

  /** Creates a top-level comment or a reply anchored to a document target. */
  async createForDocument(documentId: string, payload: ICreateCommentPayload): Promise<IComment> {
    const requestPayload = toSnakeCase(payload);
    const { data } = await this.client.post(`/documents/${documentId}/comments`, requestPayload);

    return data;
  }

  /** Updates the body of an owned comment. */
  async update(commentId: string, body: string): Promise<IComment> {
    const { data } = await this.client.patch(`/databases/comments/${commentId}`, { body });

    return data;
  }

  /** Deletes an owned comment. */
  async remove(commentId: string): Promise<void> {
    await this.client.delete(`/databases/comments/${commentId}`);
  }
}

/**
 * Handles operations related to the Diagrams module.
 * Provides CRUD for Mermaid.js diagrams.
 */
class DiagramsModule {
  constructor(private client: HttpClient) { }

  /** Lists all diagrams for the organization. */
  async listDiagrams(): Promise<IDiagram[]> {
    const { data } = await this.client.get('/diagrams');

    return data;
  }

  /** Retrieves a single diagram by its ID. */
  async getDiagram(id: string): Promise<IDiagram> {
    const { data } = await this.client.get(`/diagrams/${id}`);

    return data;
  }

  /** Creates a new diagram with Mermaid.js code. */
  async createDiagram(payload: ICreateDiagramPayload): Promise<IDiagram> {
    const requestPayload = toSnakeCase(payload);
    const { data } = await this.client.post('/diagrams', requestPayload);

    return data;
  }

  /** Updates an existing diagram's name, description, or code. */
  async updateDiagram(id: string, payload: Partial<ICreateDiagramPayload>): Promise<IDiagram> {
    const requestPayload = toSnakeCase(payload);
    const { data } = await this.client.patch(`/diagrams/${id}`, requestPayload);

    return data;
  }

  /** Deletes a diagram. */
  async deleteDiagram(id: string): Promise<void> {
    await this.client.delete(`/diagrams/${id}`);
  }
}

/**
 * Handles operations related to the Documents module.
 * Provides CRUD for documents and their blocks within a project.
 * The project scope is resolved from the integration token itself, so
 * `projectId` is optional and only used to build the URL path when provided.
 */
class DocumentsModule {
  constructor(private client: HttpClient) { }

  /** Builds the documents endpoint path for a project (token-scoped when projectId is omitted). */
  private buildDocumentsPath(projectId: string | undefined, suffix = ''): string {
    const scopePrefix = projectId ? `/projects/${projectId}` : '';

    return `${scopePrefix}/documents${suffix}`;
  }

  /** Lists all documents of the token-scoped project. */
  async listDocuments(projectId?: string): Promise<IDocument[]> {
    const { data } = await this.client.get(this.buildDocumentsPath(projectId));

    return data;
  }

  /** Retrieves a single document by its ID. */
  async getDocument(documentId: string, projectId?: string): Promise<IDocument> {
    const { data } = await this.client.get(this.buildDocumentsPath(projectId, `/${documentId}`));

    return data;
  }

  /** Creates a new document. */
  async createDocument(payload: ICreateDocumentPayload, projectId?: string): Promise<IDocument> {
    const requestPayload = toSnakeCase(payload);
    const { data } = await this.client.post(this.buildDocumentsPath(projectId), requestPayload);

    return data;
  }

  /**
   * Creates a complete document (title, description, and blocks) in a single
   * call. The server creates the document and all its blocks in one
   * transaction.
   *
   * @example
   * ```ts
   * const { document, blocks } = await ledgo.documents.createDocumentWithBlocks({
   *   title: 'Quarterly Report',
   *   description: 'Summary of Q3',
   *   blocks: [
   *     {
   *       widgetType: WidgetType.TITLE,
   *       config: { content: 'Q3 Report', level: 1, alignment: TextAlignmentType.LEFT },
   *       position: { x: 0, y: 0, w: 12, h: 2, minW: 12, maxW: 12, minH: 1 },
   *     },
   *     {
   *       widgetType: WidgetType.TEXTAREA,
   *       config: { content: 'Full body text' },
   *       position: { x: 0, y: 2, w: 12, h: 3 },
   *     },
   *   ],
   * });
   * ```
   */
  async createDocumentWithBlocks(payload: ICreateDocumentWithBlocksPayload, projectId?: string): Promise<ICreateDocumentWithBlocksResult> {
    const requestPayload = toSnakeCase({
      ...payload,
      blocks: payload.blocks.map((block) => toSnakeCase(block)),
    });
    const { data } = await this.client.post(this.buildDocumentsPath(projectId), requestPayload);

    return data;
  }

  /** Updates an existing document's properties. */
  async updateDocument(documentId: string, payload: IUpdateDocumentPayload, projectId?: string): Promise<IDocument> {
    const requestPayload = toSnakeCase(payload);
    const { data } = await this.client.patch(this.buildDocumentsPath(projectId, `/${documentId}`), requestPayload);

    return data;
  }

  /** Deletes a document and all its blocks. */
  async deleteDocument(documentId: string, projectId?: string): Promise<void> {
    await this.client.delete(this.buildDocumentsPath(projectId, `/${documentId}`));
  }

  /** Lists all blocks of a document. */
  async listBlocks(documentId: string, projectId?: string): Promise<IDocumentBlock[]> {
    const { data } = await this.client.get(this.buildDocumentsPath(projectId, `/${documentId}/blocks`));

    return data;
  }

  /** Creates a new block in a document. */
  async createBlock(documentId: string, payload: ICreateDocumentBlockPayload, projectId?: string): Promise<IDocumentBlock> {
    const requestPayload = toSnakeCase(payload);
    const { data } = await this.client.post(this.buildDocumentsPath(projectId, `/${documentId}/blocks`), requestPayload);

    return data;
  }

  /**
   * Creates several blocks in a document in a single request.
   * The server applies all creations in one transaction.
   */
  async createBlocks(documentId: string, blocks: ICreateDocumentBlockPayload[], projectId?: string): Promise<IDocumentBlock[]> {
    const requestPayload = {
      blocks: blocks.map((block) => toSnakeCase(block)),
    };
    const { data } = await this.client.post(this.buildDocumentsPath(projectId, `/${documentId}/blocks/batch`), requestPayload);

    return data;
  }

  /** Updates an existing block's widget type, config, or position. */
  async updateBlock(documentId: string, blockId: string, payload: IUpdateDocumentBlockPayload, projectId?: string): Promise<IDocumentBlock> {
    const requestPayload = toSnakeCase(payload);
    const { data } = await this.client.patch(this.buildDocumentsPath(projectId, `/${documentId}/blocks/${blockId}`), requestPayload);

    return data;
  }

  /** Deletes a block from a document. */
  async deleteBlock(documentId: string, blockId: string, projectId?: string): Promise<void> {
    await this.client.delete(this.buildDocumentsPath(projectId, `/${documentId}/blocks/${blockId}`));
  }

  /**
   * Updates the positions of several blocks of a document in a single request.
   * The server applies all updates in one transaction, so a layout change that
   * affects many blocks at once (e.g. auto-sizing one block pushes the ones
   * below it) requires only one HTTP call instead of one per block.
   */
  async updateBlockPositions(documentId: string, updates: IBlockPositionUpdate[], projectId?: string): Promise<void> {
    const requestPayload = toSnakeCase({
      positions: updates.map((update) => ({ id: update.blockId, position: update.position })),
    });

    await this.client.patch(this.buildDocumentsPath(projectId, `/${documentId}/blocks/positions`), requestPayload);
  }

  /**
   * Reads the content of a document as AI-readable text.
   * Fetches the blocks of the document and converts each one to the requested
   * format, ordered top to bottom and left to right.
   *
   * @example
   * ```ts
   * const content = await ledgo.documents.readContent(documentId);
   * const markdown = await ledgo.documents.readContent(documentId, { format: WidgetTextFormat.MARKDOWN });
   * ```
   */
  async readContent(documentId: string, options: IWidgetTextOptions = {}, projectId?: string): Promise<string> {
    const blocks = await this.listBlocks(documentId, projectId);
    const result = widgetsToContent(blocks, options);

    return result;
  }
}

/**
 * Handles operations related to the Home Dashboard Widgets module.
 * Provides CRUD for widgets on the organization's home dashboard.
 */
class WidgetsModule {
  constructor(private client: HttpClient) { }

  /** Lists all widgets on the organization home dashboard. */
  async listWidgets(): Promise<IWidgetInstance[]> {
    const { data } = await this.client.get('/widgets');

    return data;
  }

  /** Retrieves a single widget by its ID. */
  async getWidget(id: string): Promise<IWidgetInstance> {
    const { data } = await this.client.get(`/widgets/${id}`);

    return data;
  }

  /**
   * Creates a new widget on the organization home dashboard.
   * The config object shape must match the specified widgetType.
   * Falls back to default config and position when omitted.
   */
  async createWidget(payload: ICreateWidgetPayload): Promise<IWidgetInstance> {
    const requestPayload = toSnakeCase(payload);
    const { data } = await this.client.post('/widgets', requestPayload);

    return data;
  }

  /**
   * Creates several widgets on the organization home dashboard in a single
   * request. The server applies all creations in one transaction.
   * Each config object shape must match its specified widgetType.
   */
  async createWidgets(payloads: ICreateWidgetPayload[]): Promise<IWidgetInstance[]> {
    const requestPayload = {
      widgets: payloads.map((payload) => toSnakeCase(payload)),
    };
    const { data } = await this.client.post('/widgets/batch', requestPayload);

    return data;
  }

  /**
   * Updates an existing widget's configuration and/or position.
   * Only provided fields will be updated; omitted fields retain their current values.
   */
  async updateWidget(id: string, payload: Partial<IUpdateWidgetPayload>): Promise<IWidgetInstance> {
    const requestPayload = toSnakeCase(payload);
    const { data } = await this.client.patch(`/widgets/${id}`, requestPayload);

    return data;
  }

  /**
   * Updates several widgets' configuration and/or position in a single request.
   * The server applies all updates in one transaction. Only provided fields
   * are updated per widget; omitted fields retain their current values.
   */
  async updateWidgets(updates: IWidgetBatchUpdate[]): Promise<IWidgetInstance[]> {
    const requestPayload = {
      widgets: updates.map((update) => toSnakeCase(update)),
    };
    const { data } = await this.client.patch('/widgets/batch', requestPayload);

    return data;
  }

  /** Deletes a widget from the organization home dashboard. */
  async deleteWidget(id: string): Promise<void> {
    await this.client.delete(`/widgets/${id}`);
  }

  /**
   * Deletes several widgets from the organization home dashboard in a single
   * request. The server applies all deletions in one transaction.
   */
  async deleteWidgets(ids: string[]): Promise<void> {
    const requestPayload = { ids };

    await this.client.delete('/widgets/batch', { data: requestPayload });
  }

  /**
   * Updates the positions of several widgets in a single request.
   * The server applies all updates in one transaction, so a dashboard layout
   * change that affects many widgets at once requires only one HTTP call.
   */
  async updateWidgetPositions(updates: IWidgetPositionUpdate[]): Promise<void> {
    const requestPayload = toSnakeCase({
      positions: updates.map((update) => ({ id: update.widgetId, position: update.position })),
    });

    await this.client.patch('/widgets/positions', requestPayload);
  }

  /**
   * Reads the home dashboard content as AI-readable text.
   * Fetches all the widgets of the dashboard and converts each one to the
   * requested format, ordered top to bottom and left to right.
   *
   * @example
   * ```ts
   * const content = await ledgo.widgets.readContent();
   * const markdown = await ledgo.widgets.readContent({ format: WidgetTextFormat.MARKDOWN });
   * ```
   */
  async readContent(options: IWidgetTextOptions = {}): Promise<string> {
    const widgets = await this.listWidgets();
    const result = widgetsToContent(widgets, options);

    return result;
  }
}

/**
 * Handles operations related to the Storage module.
 * Provides access to storage buckets for file operations.
 */
class StorageModule {
  constructor(private client: HttpClient) { }

  /**
   * Gets a bucket instance for file operations within the specified bucket.
   * @param bucketName Name of the storage bucket (e.g. "avatars", "documents").
   */
  from(bucketName: string): StorageBucket {
    return new StorageBucket(this.client, bucketName);
  }
}

/** Arguments for uploading a file with a specific path/key. */
interface IUploadArguments {
  /** The object key/path where the file will be stored in the bucket. */
  path: string;
  /** The file data to upload. Accepts both File (browser) and Blob (Node.js) types. */
  file: File | Blob;
}

/**
 * Handles operations within a specific storage bucket.
 * Provides upload, download, and delete methods for files.
 */
class StorageBucket {
  constructor(private client: HttpClient, private bucketName: string) { }

  /**
   * Uploads a file to the bucket with a specified path/key.
   * @returns Metadata of the created storage object including URL.
   */
  async upload(args: IUploadArguments): Promise<IStorageObject> {
    const { path, file } = args;
    const formData = new FormData();

    formData.append('file', file);

    const { data } = await this.client.post(
      `/storage/buckets/${this.bucketName}/objects/${path}`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );

    return data;
  }

  /**
   * Uploads a file with an auto-generated unique key.
   * The server assigns a key; the returned metadata contains the assigned key.
   * @returns Metadata of the created storage object including the generated key and URL.
   */
  async uploadAuto(file: File | Blob): Promise<IStorageObject> {
    const formData = new FormData();

    formData.append('file', file);

    const { data } = await this.client.post(
      `/storage/buckets/${this.bucketName}/upload`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );

    return data;
  }

  /**
   * Downloads a file from the bucket as a Blob.
   * @param path The object key/path of the file to download.
   */
  async download(path: string): Promise<Blob> {
    const { data } = await this.client.get(
      `/storage/buckets/${this.bucketName}/objects/${path}`,
      {
        responseType: 'blob',
      }
    );

    return data;
  }

  /**
   * Deletes a file from the storage bucket.
   * @param path The object key/path of the file to delete.
   */
  async remove(path: string): Promise<void> {
    await this.client.delete(`/storage/buckets/${this.bucketName}/objects/${path}`);
  }
}
