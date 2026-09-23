# LedGo TypeScript SDK

Official TypeScript SDK for integrating with the LedGo platform. It lets you interact with **kanban dashboards** (including blueprint boards rendered from external providers), **forms**, **databases**, **diagrams**, **documents** (A4 sheets of blocks), **home dashboard widgets**, **comments**, and **file storage**, using integration tokens for authentication.

## Features

- **Fully typed** — every entity, payload, and enum ships with TypeScript definitions for autocomplete and compile-time validation.
- **camelCase everywhere** — send payloads in `camelCase`; the SDK converts them to the API's `snake_case` format and converts responses back to `camelCase` automatically.
- **Batch operations** — create, update, and delete multiple records, document blocks, and widgets in a single request (one server transaction).
- **Server-side queries** — filter, sort, paginate, count, and aggregate database records without fetching everything to the client.
- **Blueprint kanbans** — build data-driven boards fed by HTTP endpoints, LedGo databases, or static payloads, exposed through public routes protected by signed access links.
- **AI-readable content** — convert document blocks and dashboard widgets to Markdown, plain text, or an AI-friendly `id + fenced Markdown` format.
- **Zero dependencies** — only the standard `fetch` API is required.

## Installation

```bash
npm install @ledgo/sdk
```

Requires Node.js with global `fetch` (Node 18+).

## Getting Started

You need an **Integration Token** (generated in the LedGo organization settings) and, optionally, the **Organization ID**. When the `organizationId` is omitted, the API resolves the organization from the token itself.

```typescript
import { LedGoSDK } from '@ledgo/sdk';

const ledgo = new LedGoSDK({
  baseUrl: 'https://api.ledgo.app',
  organizationId: 'your-org-id', // optional — resolved from the token when omitted
  token: 'prof_your_secure_token',
});
```

The SDK exposes eight modules: `kanbans`, `forms`, `databases`, `diagrams`, `documents`, `comments`, `widgets`, and `storage`.

## Kanbans

Manage dashboards, columns, panels, and cards.

```typescript
// List all dashboards
const dashboards = await ledgo.kanbans.listDashboards();

// Create a dashboard (optionally with a card template)
const dashboard = await ledgo.kanbans.createDashboard({ name: 'Projects 2024' });

// Update a dashboard (name and/or card template)
await ledgo.kanbans.updateDashboard(dashboard.id, {
  name: 'Projects 2025',
  cardTemplate: [
    { id: 'title', type: FieldType.STRING, title: 'Card Title', required: true },
    { id: 'priority', type: FieldType.STRING, title: 'Priority', enum: ['low', 'medium', 'high'] },
  ],
});

// List all items of a dashboard, grouped by type
const { columns, panels, cards } = await ledgo.kanbans.listItems(dashboard.id);

// Get a single item (column, panel, or card) by id
const item = await ledgo.kanbans.getItem(cardId);

// Create items with discriminated overloads for type safety
await ledgo.kanbans.createItem(dashboard.id, KanbanItemType.COLUMN, { name: 'To Do', order: 0 });
await ledgo.kanbans.createItem(dashboard.id, KanbanItemType.PANEL, {
  columnId: columnId,
  title: 'Urgent',
  color: '#ff0000',
});
await ledgo.kanbans.createItem(dashboard.id, KanbanItemType.CARD, {
  columnId: columnId,
  data: { title: 'Fix bug', priority: 'high' },
});

// Update / delete / move items
await ledgo.kanbans.updateItem(cardId, KanbanItemType.CARD, { data: { title: 'Fixed' } });
await ledgo.kanbans.deleteItem(cardId, KanbanItemType.CARD);
await ledgo.kanbans.moveItem(cardId, KanbanItemType.CARD, otherColumnId, 0);

// Delete a dashboard (removes its columns, panels, and cards too)
await ledgo.kanbans.deleteDashboard(dashboard.id);
```

### Blueprint Boards (data-driven kanbans)

A **blueprint board** renders its columns, panels, and cards from an external provider instead of storing them in LedGo. Providers can be:

- `http` — an external endpoint that returns the board data.
- `ledgo-database` — a LedGo custom database.
- `static` — a static payload stored with the configuration.

Blueprints can be published to a public route (`scope: public`) and accessed through **signed access links** that grant `view` or `edit` scope, optionally restricted by TTL, single use, and allowed destination columns/panels.

```typescript
import {
  KanbanProviderType,
  KanbanAuthMode,
  KanbanScopeType,
  KanbanLinkScope,
} from '@ledgo/sdk';

// 1. Create the blueprint board
const blueprint = await ledgo.kanbans.createBlueprint({ name: 'Territory permissions' });

// 2. Configure the provider (here a static payload; also supports 'http' and 'ledgo-database')
await ledgo.kanbans.updatePublicConfig(blueprint.id, {
  providerType: KanbanProviderType.STATIC,
  authMode: KanbanAuthMode.NONE,
  readSource: {
    url: '',
    method: 'GET',
    headers: {},
    body: {
      columns: [{ id: 'col-1', name: 'To Do', order: 0 }],
      panels: [],
      cards: [
        { id: 'card-1', dashboard_id: blueprint.id, column_id: 'col-1', panel_id: null, data: { title: 'Hello' }, order: 0 },
      ],
    },
    timeoutMs: 15000,
    auth: null,
  },
});

// Read the stored configuration (null if it does not exist yet)
const config = await ledgo.kanbans.getPublicConfig(blueprint.id);

// 3. Publish the board (subject to the organization plan limit)
await ledgo.kanbans.setScope(blueprint.id, KanbanScopeType.PUBLIC);

// 4. Mint a signed access link (view or edit) with optional restrictions
const link = await ledgo.kanbans.createAccessLink(blueprint.id, {
  scope: KanbanLinkScope.EDIT,
  ttlSeconds: 3600,
  singleUse: false,
  params: { territory: 'north' },   // forwarded to the public route as query string
  claims: { playerId: 'player-123' }, // exposed to the provider as {{claim.*}}
  allowedColumns: ['col-1'],
  baseUrl: 'https://app.ledgo.dev',  // to build the absolute url in the result
});

// 5. Manage the minted links
const links = await ledgo.kanbans.listAccessLinks(blueprint.id);
await ledgo.kanbans.revokeAccessLink(links[0].jti);

// 6. Use the public board (no integration token required)
const board = await ledgo.kanbans.getPublicBoard(blueprint.id, { linkToken: token });

// Move a card through the public route (the link must grant edit scope)
await ledgo.kanbans.movePublicCard(blueprint.id, {
  linkToken: token,
  cardId: 'card-1',
  to: { columnId: 'col-2', panelId: null },
  data: { title: 'Hello' },
  baseVersion: board.version, // optional, for conflict detection
});

// Run a declarative card action through the public route
await ledgo.kanbans.runPublicCardAction(blueprint.id, {
  linkToken: token,
  cardId: 'card-1',
  actionId: 'approve',
  baseVersion: board.version,
});
```

Notes:

- `updatePublicConfig` only writes the fields you send; the rest keep their stored value.
- `http` providers can define `readSource`/`writeSource` with placeholders: `{{param.*}}`, `{{claim.*}}`, `{{card.id}}`, `{{from.columnId}}`, `{{to.columnId}}`, `{{to.panelId}}`, `{{token}}`, and `{{timestamp}}`.
- `authMode: 'forward-token'` forwards the signed link token to the provider so it can validate it itself; `'signed'` makes LedGo sign the requests with an HMAC secret.
- `getPublicBoard`, `movePublicCard`, and `runPublicCardAction` operate against the public route without using the integration token; if the board is signed, they require the `linkToken`.

## Forms

Create and manage dynamic forms and read their submissions. Fields support data sources (external APIs), async CTA buttons, and conditional visibility/enablement.

```typescript
// List forms
const forms = await ledgo.forms.listForms();

// Create a form
const form = await ledgo.forms.createForm({
  title: 'Feedback',
  slug: 'feedback-2024',
  visibility: FormVisibilityType.PUBLIC,
  fields: [
    { id: 'name', type: FieldType.STRING, title: 'Your name', required: true },
    { id: 'rating', type: FieldType.NUMBER, title: 'Rating', minimum: 1, maximum: 5 },
  ],
});

// Update a form's configuration
await ledgo.forms.updateForm(form.id, { title: 'Feedback v2' });

// List submissions
const responses = await ledgo.forms.listResponses(form.id);

// Delete a form (and all its responses)
await ledgo.forms.deleteForm(form.id);
```

### Async sessions (for external providers)

Forms with **async CTA buttons** (`button.async` + `button.waitFor`) create a session per filling; the session token lives in the form URL (`?session=<uuid>`) and can be injected into provider URLs with `{SESSION_KEY}`. External providers update the session over HTTP using the token as the credential. The SDK exposes the endpoint URLs:

```typescript
// Endpoint to create (POST), update (PATCH), and read (GET ?id=) the session
const endpointUrl = ledgo.forms.getFormSessionUrl();

// URL to read the session record by its token
const readUrl = ledgo.forms.getFormSessionReadUrl(sessionToken);
```

Example for a payments provider:

```bash
PATCH https://{app}.function2.insforge.app/form-session
Content-Type: application/json

{ "id": "<session_token>", "data": { "payment": { "status": "success", "id": "p_123" } } }
```

The form resolves the async button when the expected data (`waitFor`) arrives in the session. Responses: `200` OK · `404` session not found · `410` expired or closed.

## Databases

Manage custom databases and their records, including server-side queries, aggregations, and batch operations.

```typescript
// List databases
const dbs = await ledgo.databases.listDatabases();

// Create a database (optionally with a JSON schema)
const db = await ledgo.databases.createDatabase({
  name: 'Customers',
  schema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      email: { type: 'string', format: 'email' },
      phone: { type: 'string' },
    },
  },
});

// Update / delete a database
await ledgo.databases.updateDatabase(db.id, { name: 'Clients' });
await ledgo.databases.deleteDatabase(db.id);
```

### Records and server-side queries

```typescript
// Create / update / delete a single record
const record = await ledgo.databases.createRecord(db.id, {
  name: 'Customer A',
  email: 'customer@example.com',
  phone: '+52 555 123 4567',
});
await ledgo.databases.updateRecord(db.id, record.id, { name: 'Customer B' });
await ledgo.databases.deleteRecord(db.id, record.id);

// List all records of a database
const records = await ledgo.databases.listRecords(db.id);

// Query with filters, sorting, and pagination (server-side)
const { records, total } = await ledgo.databases.queryRecords(db.id, {
  filters: [
    { field: 'email', op: RecordFilterOperator.CONTAINS, value: '@example.com' },
    { field: 'created_at', op: RecordFilterOperator.GTE, value: '2024-01-01' },
  ],
  sort: [{ field: 'name', dir: RecordSortDirection.ASC }],
  limit: 50,
  offset: 0,
});

// Count matching records without fetching them
const count = await ledgo.databases.countRecords(db.id, [
  { field: 'status', op: RecordFilterOperator.EQ, value: 'active' },
]);

// Aggregations (count, sum, avg, min, max), optionally grouped
const totals = await ledgo.databases.aggregateRecords(db.id, {
  op: RecordAggregateOperator.SUM,
  field: 'total',
  groupBy: 'status',
});
```

### Batch operations

Execute several record operations with a single gateway call. Execution is best-effort: every item is attempted and per-item failures are collected in the `errors` list.

```typescript
// Full batch control
const result = await ledgo.databases.batchRecords(db.id, {
  create: [{ name: 'A' }, { name: 'B' }],
  update: [{ id: recordId, data: { name: 'C' } }],
  upsert: [{ id: existingId, data: { name: 'D' } }, { data: { name: 'E' } }], // id omitted → always inserted
  deleteIds: [recordIdToDelete],
});
// => { created, updated, upserted, deletedIds, errors }

// Convenience helpers
await ledgo.databases.createRecords(db.id, [{ name: 'A' }, { name: 'B' }]);
await ledgo.databases.updateRecords(db.id, [{ id: recordId, data: { name: 'C' } }]);
await ledgo.databases.upsertRecords(db.id, [{ id: recordId, data: { name: 'D' } }]);
await ledgo.databases.deleteRecords(db.id, [id1, id2]);
```

Supported filter operators: `eq`, `neq`, `contains`, `starts_with`, `gt`, `gte`, `lt`, `lte`, `in`, `between`, `is_null`, `is_not_null` — with optional casts (`text`, `number`, `boolean`, `uuid`, `date`).

## Diagrams

Manage Mermaid.js diagrams.

```typescript
// List diagrams
const diagrams = await ledgo.diagrams.listDiagrams();

// Get a diagram by id
const diagram = await ledgo.diagrams.getDiagram(diagramId);

// Create a diagram
const newDiagram = await ledgo.diagrams.createDiagram({
  name: 'Architecture',
  code: 'graph TD; A-->B;',
  description: 'System overview',
});

// Update / delete
await ledgo.diagrams.updateDiagram(newDiagram.id, { code: 'graph TD; A-->C;' });
await ledgo.diagrams.deleteDiagram(newDiagram.id);
```

## Documents

Manage project documents — A4 sheets filled with a grid of blocks. The project is resolved from the integration token, so `projectId` is optional and only used to build the URL path when provided; the server always validates the project scope against the token.

```typescript
// List documents
const docs = await ledgo.documents.listDocuments();

// Get a document
const doc = await ledgo.documents.getDocument(docId);

// Create a document
const doc = await ledgo.documents.createDocument({
  title: 'Operations Manual',
  description: 'Internal procedures',
  status: DocumentStatus.PUBLISHED,
  scope: DocumentScopeType.PROJECT,
});

// Create a complete document (title, description, and blocks) in a single transaction
const { document, blocks } = await ledgo.documents.createDocumentWithBlocks({
  title: 'Quarterly Report',
  description: 'Q3 summary',
  blocks: [
    { widgetType: WidgetType.TITLE, config: { content: 'Q3 Report', level: 1, alignment: TextAlignmentType.LEFT }, position: { x: 0, y: 0, w: 12, h: 2 } },
    { widgetType: WidgetType.TEXTAREA, config: { content: 'Report body...' }, position: { x: 0, y: 2, w: 12, h: 4 } },
    { widgetType: WidgetType.TABLE, config: { columns: ['Metric', 'Value'], rows: [['Revenue', '$50K']] }, position: { x: 0, y: 6, w: 12, h: 4 } },
  ],
});

// Update a document (title, description, orientation, status, scope, password)
await ledgo.documents.updateDocument(doc.id, {
  title: 'Operations Manual v2',
  scope: DocumentScopeType.ORGANIZATION,
  passwordHash: '<sha256-hex>', // pass null to remove a password
});

// List the blocks of a document
const blocks = await ledgo.documents.listBlocks(doc.id);

// Create a single block
await ledgo.documents.createBlock(doc.id, {
  widgetType: WidgetType.TABLE,
  config: { columns: ['Column 1', 'Column 2'], rows: [['A', 'B']] },
  position: { x: 0, y: 0, w: 12, h: 4 },
});

// Create several blocks in a single transaction
await ledgo.documents.createBlocks(doc.id, [
  { widgetType: WidgetType.TITLE, config: { content: 'New section', level: 2, alignment: TextAlignmentType.LEFT }, position: { x: 0, y: 4, w: 12, h: 2 } },
  { widgetType: WidgetType.TEXTAREA, config: { content: 'Section body' }, position: { x: 0, y: 6, w: 12, h: 3 } },
]);

// Update a block and its position
await ledgo.documents.updateBlock(doc.id, blockId, { config: { content: 'New text' } });

// Update several block positions in a single transaction
await ledgo.documents.updateBlockPositions(doc.id, [
  { blockId, position: { x: 0, y: 4, w: 12, h: 2 } },
  { blockId: otherBlockId, position: { x: 0, y: 6, w: 12, h: 2 } },
]);

// Delete blocks and documents
await ledgo.documents.deleteBlock(doc.id, blockId);
await ledgo.documents.deleteDocument(doc.id);
```

### Block types

A document block can be any `WidgetType` plus the document-specific block types:

| Type | Description |
| --- | --- |
| `metrics` | Key metric with value, unit, trend, and prefix/suffix |
| `title` | Heading with configurable level (1–5) and alignment |
| `toggle` | Toggle switch with on/off labels |
| `button` | Clickable button with variant, size, and action URL |
| `image` | Image with fit mode and rounded corners |
| `textarea` | Multi-line rich text |
| `code` | Code block with syntax highlighting by language |
| `chart` | Bar, line, pie, or area chart |
| `progress_bar` | Single horizontal progress bar |
| `progress_bar_list` | List of progress bars |
| `youtube` | YouTube video embed |
| `link` | Hyperlink with label and URL |
| `table` | Data table with per-cell alignment |
| `list` | Bullets, numbered, or checklist |
| `divider` | Horizontal separator |
| `embed` | Embed of a platform resource (kanban, form, database, diagram, or file) |

The sheet uses a 12-column grid; `title` blocks are always full-width (`w: 12`).

## Home Dashboard Widgets

Manage the widgets of the organization home dashboard with the same widget types, plus batch operations.

```typescript
// List widgets
const widgets = await ledgo.widgets.listWidgets();

// Get a widget
const widget = await ledgo.widgets.getWidget(widgetId);

// Create a widget
await ledgo.widgets.createWidget({
  widgetType: WidgetType.METRICS,
  config: { title: 'Revenue', value: 50000, unit: 'USD', trend: 'up', prefix: '$', suffix: '' },
  position: { x: 0, y: 0, w: 4, h: 2 },
});

// Create several widgets in a single transaction
await ledgo.widgets.createWidgets([
  { widgetType: WidgetType.TITLE, config: { content: 'KPIs', level: 2, alignment: TextAlignmentType.LEFT }, position: { x: 0, y: 0, w: 4, h: 1 } },
  { widgetType: WidgetType.METRICS, config: { title: 'Revenue', value: 50000, unit: 'USD', trend: 'up', prefix: '$', suffix: '' }, position: { x: 4, y: 0, w: 4, h: 2 } },
]);

// Update one widget (config and/or position; omitted fields keep their values)
await ledgo.widgets.updateWidget(widgetId, { config: { title: 'Updated Revenue' } });

// Update several widgets in a single transaction
await ledgo.widgets.updateWidgets([
  { id: widgetId, config: { title: 'Updated Revenue', value: 60000 } },
  { id: otherWidgetId, position: { x: 0, y: 2, w: 4, h: 2 } },
]);

// Update several positions in a single transaction
await ledgo.widgets.updateWidgetPositions([
  { widgetId, position: { x: 0, y: 2, w: 4, h: 2 } },
  { widgetId: otherWidgetId, position: { x: 4, y: 2, w: 4, h: 2 } },
]);

// Delete widgets (single or batch)
await ledgo.widgets.deleteWidget(widgetId);
await ledgo.widgets.deleteWidgets([widgetId, otherWidgetId]);
```

## Comments

Cross-cutting comments anchored to a root resource — a database or a document — and to one of its fine-grained targets: the resource itself, a column, a record, a cell, or a document block. Reading and creating require view access on the root resource; editing and deleting only affect your own comments.

```typescript
// List the comments of a database, optionally filtered to one target key
const comments = await ledgo.comments.listForDatabase(db.id, 'cell:email:record-123');

// Create a top-level comment or a reply anchored to a database target
await ledgo.comments.createForDatabase(db.id, {
  target: { kind: 'record', recordId: recordId },
  body: 'This record needs review',
  parentId: null, // pass the parent comment id to reply
});

// Same for documents
const docComments = await ledgo.comments.listForDocument(doc.id);
await ledgo.comments.createForDocument(doc.id, {
  target: { kind: 'block', blockId: blockId },
  body: 'Please expand this section',
});

// Update and delete own comments
await ledgo.comments.update(commentId, 'New body text');
await ledgo.comments.remove(commentId);
```

## Storage

File operations scoped to a storage bucket.

```typescript
// Get a bucket instance
const bucket = ledgo.storage.from('documents');

// Upload a file at a specific path/key
const object = await bucket.upload({
  path: 'reports/q3.pdf',
  file: fileOrBlob,
});

// Upload with an auto-generated key (the metadata contains the assigned key)
const autoObject = await bucket.uploadAuto(fileOrBlob);

// Download a file as a Blob
const blob = await bucket.download('reports/q3.pdf');

// Delete a file
await bucket.remove('reports/q3.pdf');
```

`upload` and `uploadAuto` accept both `File` (browser) and `Blob` (Node.js). Uploads return the object metadata (`bucket`, `key`, `size`, `mimeType`, `uploadedAt`, `url`).

## Widgets to AI-readable text

Widgets (home dashboard) and document blocks can be converted into a text or Markdown representation ready for AI models. The conversion utilities are **pure functions** (no network) and accept any object with `id`, `widgetType`, and `config` (an `IWidgetInstance` or `IDocumentBlock`).

```typescript
import { widgetToMarkdown, widgetToText, widgetToAIText, widgetsToAIText } from '@ledgo/sdk';

const widgets = await ledgo.widgets.listWidgets();

// Markdown of a single widget
const markdown = widgetToMarkdown(widgets[0]);

// Plain text (no Markdown syntax)
const text = widgetToText(widgets[0]);

// Recommended format for AI: id + Markdown inside a fenced code block
const aiText = widgetToAIText(widgets[0]);
// =>
// 4f38f3e8-bb28-4888-93a6-5724f737796d:
// ```md
// ### 10. Open questions
// ```

// All widgets at once
const allText = widgetsToAIText(widgets);
```

The `readContent` methods fetch the content from the API and order the items in reading order (top to bottom, left to right) according to their grid position:

```typescript
import { WidgetTextFormat } from '@ledgo/sdk';

// Document content as AI text (id + fenced Markdown per block)
const content = await ledgo.documents.readContent(documentId);

// Same content as plain Markdown or plain text
const markdown = await ledgo.documents.readContent(documentId, { format: WidgetTextFormat.MARKDOWN });
const plain = await ledgo.documents.readContent(documentId, { format: WidgetTextFormat.PLAIN });

// The whole home dashboard can also be read
const dashboardContent = await ledgo.widgets.readContent();
```

### Supported formats

| Format | Description |
| --- | --- |
| `ai` (default) | Widget id followed by its Markdown inside a fenced code block — recommended for AI models |
| `markdown` | Raw Markdown representation of each widget, one after another |
| `plain` | Plain text representation, no Markdown syntax |

## Typing and Security

The SDK includes TypeScript definitions for all data models (`IKanbanDashboard`, `IKanbanColumn`, `IKanbanPanel`, `IKanbanCard`, `IForm`, `IFormField`, `IDatabase`, `IDatabaseRecord`, `IDiagram`, `IDocument`, `IDocumentBlock`, `IWidgetInstance`, `IComment`, `IStorageObject`, ...) and all creation/update payloads, with discriminated unions for widget/block creation and overloads for kanban items.

Integration tokens must be treated as secrets. Grant only the minimum permissions required when creating the token in the LedGo admin panel. Tokens are sent as `Authorization: Bearer <token>` headers on every request except the public kanban routes (`getPublicBoard`, `movePublicCard`, `runPublicCardAction`), which use signed link tokens instead.

## API Reference

The complete API reference is available in the generated type definitions shipped with the package (`dist/index.d.ts`). Every module, method, entity, payload, and enum is documented inline with JSDoc.