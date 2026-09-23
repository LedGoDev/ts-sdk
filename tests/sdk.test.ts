import { LedGoSDK, KanbanItemType, KanbanBoardType, KanbanScopeType, KanbanProviderType, KanbanAuthMode, KanbanLinkScope, WidgetType, FieldType, FormVisibilityType, ICreateFormPayload, RecordFilterOperator, RecordSortDirection, RecordAggregateOperator, TextAlignmentType, ListStyleType, EmbedResourceType, DocumentStatus, DocumentScopeType, DocumentOrientation, DocumentBlockType, WidgetTextFormat } from '../src';
import * as dotenv from 'dotenv';

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

dotenv.config();

describe('LedGoSDK (Live Tests)', () => {
  const config = {
    baseUrl: process.env.MONDA_BASE_URL || '',
    organizationId: process.env.MONDA_ORG_ID || '',
    token: process.env.MONDA_TOKEN || ''
  };

  if (!config.baseUrl || !config.organizationId || !config.token) {
    console.warn('Live tests skipped: Missing configuration in .env');
    it('should be configured', () => {
      expect(config.baseUrl).toBeDefined();
      expect(config.organizationId).toBeDefined();
      expect(config.token).toBeDefined();
    });
    return;
  }

  const sdk = new LedGoSDK(config);

  describe('Full Integration Flow', () => {
    let dashboardId: string;
    let formId: string;
    let databaseId: string;
    let diagramId: string;

    describe('Kanbans Module', () => {
      let col1Id: string;
      let col2Id: string;
      let panelId: string;
      let cardId1: string;
      let cardId2: string;

      it('should create a real dashboard', async () => {
        const payload = { name: `Live Board ${Date.now()}` };
        const result = await sdk.kanbans.createDashboard(payload);
        expect(result.id).toBeDefined();
        expect(result.name).toBe(payload.name);
        dashboardId = result.id;
      }, 30000);

      it('should design and update the dashboard template', async () => {
        const template = [
          { id: 'title', type: FieldType.STRING, title: 'Card Title', required: true },
          { id: 'priority', type: FieldType.STRING, title: 'Priority', enum: ['low', 'medium', 'high'] },
          { id: 'estimate', type: FieldType.NUMBER, title: 'Estimate (hours)' }
        ];
        const updated = await sdk.kanbans.updateDashboard(dashboardId, {
          name: `Updated Board ${Date.now()}`,
          cardTemplate: template as any
        });
        expect(updated.name).toContain('Updated Board');
        expect(updated.cardTemplate?.length).toBe(3);
      });

      it('should create multiple columns', async () => {
        const c1 = await sdk.kanbans.createItem(dashboardId, KanbanItemType.COLUMN, { name: 'To Do', order: 0 });
        const c2 = await sdk.kanbans.createItem(dashboardId, KanbanItemType.COLUMN, { name: 'In Progress', order: 1 });
        expect(c1.id).toBeDefined();
        expect(c2.id).toBeDefined();
        col1Id = c1.id;
        col2Id = c2.id;
      });

      it('should create panels within columns', async () => {
        const panel = await sdk.kanbans.createItem(dashboardId, KanbanItemType.PANEL, {
          columnId: col1Id,
          title: 'Urgent Stuff',
          color: '#ff0000',
          order: 0
        });
        expect(panel.id).toBeDefined();
        expect(panel.title).toBe('Urgent Stuff');
        panelId = panel.id;

        const items = await sdk.kanbans.listItems(dashboardId);
        expect(items.panels.length).toBeGreaterThan(0);
        expect(items.panels.some(p => p.id === panelId)).toBe(true);
      });

      it('should create multiple cards with template data', async () => {
        const t1 = await sdk.kanbans.createItem(dashboardId, KanbanItemType.CARD, {
          columnId: col1Id,
          data: { title: 'First Card', priority: 'high', estimate: 4 }
        });
        const t2 = await sdk.kanbans.createItem(dashboardId, KanbanItemType.CARD, {
          columnId: col1Id,
          panelId: panelId,
          data: { title: 'Second Card', priority: 'low' }
        });
        expect(t1.id).toBeDefined();
        expect(t2.id).toBeDefined();
        expect(t1.data.estimate).toBe(4);
        expect(t2.panelId).toBe(panelId);
        cardId1 = t1.id;
        cardId2 = t2.id;
      });

      it('should update column and panel properties', async () => {
        const updatedCol = await sdk.kanbans.updateItem(col1Id, KanbanItemType.COLUMN, { name: 'To Do (Renamed)' });
        const updatedPanel = await sdk.kanbans.updateItem(panelId, KanbanItemType.PANEL, { title: 'Very Urgent', color: '#0000ff' });

        expect(updatedCol.name).toBe('To Do (Renamed)');
        expect(updatedPanel.title).toBe('Very Urgent');
        expect(updatedPanel.color).toBe('#0000ff');
      });

      it('should update card data', async () => {
        const updated = await sdk.kanbans.updateItem(cardId1, KanbanItemType.CARD, {
          data: { title: 'First Card Updated', estimate: 8 }
        });
        expect(updated.data.title).toBe('First Card Updated');
        expect(updated.data.estimate).toBe(8);
      });

      it('should move cards between columns and panels', async () => {
        await sdk.kanbans.moveItem(cardId1, KanbanItemType.CARD, col2Id, 0);

        await sdk.kanbans.moveItem(cardId2, KanbanItemType.CARD, col2Id, 1);

        let items = await sdk.kanbans.listItems(dashboardId);
        let t1 = items.cards.find(t => t.id === cardId1);
        let t2 = items.cards.find(t => t.id === cardId2);

        if (t1?.columnId !== col2Id) {
          console.log(`Debug move T1: Expected ${col2Id}, got ${t1?.columnId}. Card: ${JSON.stringify(t1)}`);
        }

        expect(t1?.columnId).toBe(col2Id);
        expect(t2?.columnId).toBe(col2Id);
      });

      it('should delete a card', async () => {
        await sdk.kanbans.deleteItem(cardId1, KanbanItemType.CARD);
        const items = await sdk.kanbans.listItems(dashboardId);
        expect(items.cards.some(t => t.id === cardId1)).toBe(false);
        expect(items.cards.some(t => t.id === cardId2)).toBe(true);
      });

      it('should delete a panel', async () => {
        await sdk.kanbans.deleteItem(panelId, KanbanItemType.PANEL);
        const items = await sdk.kanbans.listItems(dashboardId);
        expect(items.panels.some(p => p.id === panelId)).toBe(false);
      });

      it('should delete a column and verify cleanup', async () => {
        await sdk.kanbans.deleteItem(col1Id, KanbanItemType.COLUMN);
        await sleep(500);
        const items = await sdk.kanbans.listItems(dashboardId);
        expect(items.columns.some(c => c.id === col1Id)).toBe(false);
      });

      it('should list all dashboards and find the current one', async () => {
        const list = await sdk.kanbans.listDashboards();
        expect(Array.isArray(list)).toBe(true);
        expect(list.some(d => d.id === dashboardId)).toBe(true);
      });
    });

    describe('Kanban Blueprints', () => {
      let blueprintId = '';
      let linkJti = '';

      afterAll(async () => {
        if (blueprintId) {
          try { await sdk.kanbans.deleteDashboard(blueprintId); } catch { }
        }
      });

      it('should create a blueprint dashboard', async () => {
        const blueprint = await sdk.kanbans.createBlueprint({ name: `Live Blueprint ${Date.now()}` });

        expect(blueprint.id).toBeDefined();
        expect(blueprint.boardType).toBe(KanbanBoardType.BLUEPRINT);
        expect(blueprint.scope).toBe(KanbanScopeType.PROJECT);
        blueprintId = blueprint.id;
      }, 30000);

      it('should upsert and read the public configuration', async () => {
        const initial = await sdk.kanbans.getPublicConfig(blueprintId);

        expect(initial).toBeNull();

        const saved = await sdk.kanbans.updatePublicConfig(blueprintId, {
          providerType: KanbanProviderType.STATIC,
          authMode: KanbanAuthMode.NONE,
          allowWrite: false,
          readSource: {
            url: '',
            method: 'GET',
            headers: {},
            body: {
              columns: [{ id: 'col-1', name: 'Todo', order: 0 }],
              panels: [],
              cards: [
                { id: 'card-1', dashboard_id: blueprintId, column_id: 'col-1', panel_id: null, data: { title: 'Hello' }, order: 0 }
              ]
            },
            timeoutMs: 15000,
            auth: null
          }
        });

        expect(saved.providerType).toBe(KanbanProviderType.STATIC);
        expect(saved.authMode).toBe(KanbanAuthMode.NONE);

        const reloaded = await sdk.kanbans.getPublicConfig(blueprintId);

        expect(reloaded?.providerType).toBe(KanbanProviderType.STATIC);
      }, 30000);

      it('should publish the blueprint and read its public board', async () => {
        const published = await sdk.kanbans.setScope(blueprintId, KanbanScopeType.PUBLIC);

        expect(published.scope).toBe(KanbanScopeType.PUBLIC);

        const board = await sdk.kanbans.getPublicBoard(blueprintId);

        expect(board.columns.length).toBeGreaterThan(0);
        expect(board.cards.length).toBeGreaterThan(0);
        expect(board.cards[0].data.title).toBe('Hello');
      }, 30000);

      it('should mint, list and revoke access links', async () => {
        const link = await sdk.kanbans.createAccessLink(blueprintId, {
          scope: KanbanLinkScope.VIEW,
          ttlSeconds: 600,
          singleUse: true,
          allowedColumns: ['col-1'],
          baseUrl: 'https://app.ledgo.dev'
        });

        expect(link.path).toContain('/public/kanbans/');
        expect(link.url).toContain('https://app.ledgo.dev/public/kanbans/');

        const links = await sdk.kanbans.listAccessLinks(blueprintId);

        expect(links.length).toBeGreaterThan(0);
        expect(links[0].singleUse).toBe(true);
        linkJti = links[0].jti;

        await sdk.kanbans.revokeAccessLink(linkJti);

        const afterRevoke = await sdk.kanbans.listAccessLinks(blueprintId);

        expect(afterRevoke[0].revokedAt).not.toBeNull();
      }, 30000);
    });

    describe('Forms Module', () => {
      const createdFormIds: string[] = [];

      afterAll(async () => {
        for (const id of createdFormIds) {
          try { await sdk.forms.deleteForm(id); } catch { }
        }
      });

      describe('Create Forms', () => {
        it('should create a basic form (minimum required fields)', async () => {
          const payload: ICreateFormPayload = {
            title: 'Basic Form',
            slug: `basic-form-${Date.now()}`,
            fields: [{ id: 'name', type: FieldType.STRING, title: 'Name' }]
          };
          const result = await sdk.forms.createForm(payload);
          expect(result.id).toBeDefined();
          expect(result.title).toBe(payload.title);
          expect(result.slug).toBe(payload.slug);
          expect(result.fields).toHaveLength(1);
          expect(result.fields[0].id).toBe('name');
          expect(result.fields[0].title).toBe('Name');
          expect(result.visibility).toBe(FormVisibilityType.PUBLIC);
          expect(result.organizationId).toBeDefined();
          expect(result.createdAt).toBeDefined();
          formId = result.id;
          createdFormIds.push(result.id);
        });

        it('should create a form with all optional fields populated', async () => {
          const payload: ICreateFormPayload = {
            title: 'Full Form',
            slug: `full-form-${Date.now()}`,
            description: 'A comprehensive form testing every optional field',
            visibility: FormVisibilityType.PRIVATE,
            fields: [
              { id: 'name', type: FieldType.STRING, title: 'Your Name', required: true },
              { id: 'age', type: FieldType.INTEGER, title: 'Age', minimum: 0, maximum: 150 },
              { id: 'active', type: FieldType.BOOLEAN, title: 'Active Member', defaultValue: true },
              { id: 'tags', type: FieldType.ARRAY, title: 'Interest Tags' },
              { id: 'score', type: FieldType.NUMBER, title: 'Score', minimum: 0, maximum: 100 },
            ],
            jsonSchema: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } },
            uiSchema: { name: { 'ui:autofocus': true } }
          };
          const result = await sdk.forms.createForm(payload);
          expect(result.id).toBeDefined();
          expect(result.title).toBe(payload.title);
          expect(result.description).toBe(payload.description);
          expect(result.visibility).toBe(FormVisibilityType.PRIVATE);
          expect(result.fields).toHaveLength(5);
          expect(result.fields[0].required).toBe(true);
          expect(result.fields[1].minimum).toBe(0);
          expect(result.fields[1].maximum).toBe(150);
          expect(result.fields[2].defaultValue).toBe(true);
          expect(result.jsonSchema).toBeDefined();
          expect(result.uiSchema).toBeDefined();
          createdFormIds.push(result.id);
        });

        it('should create a form with fields containing structured options', async () => {
          const payload: ICreateFormPayload = {
            title: 'Select Options Form',
            slug: `select-form-${Date.now()}`,
            fields: [
              {
                id: 'country',
                type: FieldType.STRING,
                title: 'Country',
                options: [
                  { id: 'us', label: 'United States' },
                  { id: 'mx', label: 'Mexico' },
                  { id: 'ca', label: 'Canada', key: 'CA' },
                ],
                uiWidget: 'select'
              }
            ]
          };
          const result = await sdk.forms.createForm(payload);
          expect(result.fields[0].options).toHaveLength(3);
          expect(result.fields[0].options![0].label).toBe('United States');
          expect(result.fields[0].options![2].key).toBe('CA');
          expect(result.fields[0].uiWidget).toBe('select');
          createdFormIds.push(result.id);
        });

        it('should create a form with fields containing UI hints and validation rules', async () => {
          const payload: ICreateFormPayload = {
            title: 'Validated Form',
            slug: `validated-form-${Date.now()}`,
            fields: [
              {
                id: 'email',
                type: FieldType.STRING,
                title: 'Email Address',
                format: 'email',
                minLength: 5,
                maxLength: 100,
                pattern: '^[\\w.-]+@[\\w.-]+\\.\\w{2,}$',
                placeholder: 'you@example.com'
              },
              {
                id: 'bio',
                type: FieldType.STRING,
                title: 'Biography',
                uiWidget: 'textarea',
                placeholder: 'Tell us about yourself...',
                maxLength: 500,
                visible: true,
                enabled: true
              }
            ]
          };
          const result = await sdk.forms.createForm(payload);
          expect(result.fields[0].format).toBe('email');
          expect(result.fields[0].minLength).toBe(5);
          expect(result.fields[0].maxLength).toBe(100);
          expect(result.fields[0].pattern).toBeDefined();
          expect(result.fields[0].placeholder).toBe('you@example.com');
          expect(result.fields[1].uiWidget).toBe('textarea');
          expect(result.fields[1].placeholder).toBe('Tell us about yourself...');
          expect(result.fields[1].visible).toBe(true);
          expect(result.fields[1].enabled).toBe(true);
          createdFormIds.push(result.id);
        });

        it('should create a form with no fields', async () => {
          const payload: ICreateFormPayload = {
            title: 'Empty Fields Form',
            slug: `empty-form-${Date.now()}`
          };
          const result = await sdk.forms.createForm(payload);
          expect(result.id).toBeDefined();
          expect(result.title).toBe(payload.title);
          expect(result.fields).toEqual([]);
          createdFormIds.push(result.id);
        });
      });

      describe('List Forms', () => {
        it('should list all forms and find each created one', async () => {
          const list = await sdk.forms.listForms();
          expect(Array.isArray(list)).toBe(true);
          expect(list.length).toBeGreaterThanOrEqual(createdFormIds.length);
          for (const id of createdFormIds) {
            expect(list.some(f => f.id === id)).toBe(true);
          }
        });

        it('should return typed form objects with all expected properties', async () => {
          const list = await sdk.forms.listForms();
          for (const form of list) {
            expect(form.id).toBeDefined();
            expect(form.title).toBeDefined();
            expect(form.slug).toBeDefined();
            expect(form.organizationId).toBeDefined();
            expect(form.visibility).toBeDefined();
            expect(Array.isArray(form.fields)).toBe(true);
          }
        });
      });

      describe('Update Forms', () => {
        it('should update the form title', async () => {
          const updated = await sdk.forms.updateForm(formId, { title: 'Updated Feedback Form' });
          expect(updated.title).toBe('Updated Feedback Form');
        });

        it('should update form description', async () => {
          const updated = await sdk.forms.updateForm(formId, { description: 'New description text added via update' });
          expect(updated.description).toBe('New description text added via update');
        });

        it('should update form visibility to private', async () => {
          const updated = await sdk.forms.updateForm(formId, { visibility: FormVisibilityType.PRIVATE });
          expect(updated.visibility).toBe(FormVisibilityType.PRIVATE);
        });

        it('should update form visibility back to public', async () => {
          const updated = await sdk.forms.updateForm(formId, { visibility: FormVisibilityType.PUBLIC });
          expect(updated.visibility).toBe(FormVisibilityType.PUBLIC);
        });

        it('should update form fields (replace entire field set)', async () => {
          const newFields = [
            { id: 'fullName', type: FieldType.STRING, title: 'Full Name', required: true },
            { id: 'email', type: FieldType.STRING, title: 'Email Address', format: 'email' },
            { id: 'rating', type: FieldType.INTEGER, title: 'Rating (1-5)', minimum: 1, maximum: 5 },
          ];
          const updated = await sdk.forms.updateForm(formId, { fields: newFields as any });
          expect(updated.fields).toHaveLength(3);
          expect(updated.fields[0].id).toBe('fullName');
          expect(updated.fields[0].title).toBe('Full Name');
          expect(updated.fields[0].required).toBe(true);
          expect(updated.fields[2].minimum).toBe(1);
          expect(updated.fields[2].maximum).toBe(5);
        });

        it('should update form slug', async () => {
          const newSlug = `updated-slug-${Date.now()}`;
          const updated = await sdk.forms.updateForm(formId, { slug: newSlug });
          expect(updated.slug).toBe(newSlug);
        });

        it('should update form with jsonSchema', async () => {
          const schema = {
            type: 'object',
            properties: {
              fullName: { type: 'string', minLength: 2 },
              email: { type: 'string', format: 'email' },
              rating: { type: 'integer', minimum: 1, maximum: 5 },
            },
            required: ['fullName', 'email']
          };
          const updated = await sdk.forms.updateForm(formId, { jsonSchema: schema });
          expect(updated.jsonSchema).toBeDefined();
          expect(updated.jsonSchema!.required).toContain('fullName');
          expect(updated.jsonSchema!.required).toContain('email');
        });

        it('should update form with uiSchema', async () => {
          const uiSchema = {
            fullName: { 'ui:autofocus': true, 'ui:placeholder': 'Enter your full name' },
            rating: { 'ui:widget': 'select' }
          };
          const updated = await sdk.forms.updateForm(formId, { uiSchema: uiSchema });
          expect(updated.uiSchema).toBeDefined();
          expect(updated.uiSchema!.fullName['ui:autofocus']).toBe(true);
        });

        it('should persist all updates by verifying the final form state', async () => {
          const finalTitle = `Persisted Form ${Date.now()}`;
          const updated = await sdk.forms.updateForm(formId, { title: finalTitle });
          expect(updated.title).toBe(finalTitle);
          expect(updated.fields).toHaveLength(3);
          expect(updated.jsonSchema).toBeDefined();
          expect(updated.uiSchema).toBeDefined();
        });

        it('should partially update a form (only description, leave others unchanged)', async () => {
          const updated = await sdk.forms.updateForm(formId, { description: 'Partial update test' });
          expect(updated.description).toBe('Partial update test');
        });
      });

      describe('Form Responses', () => {
        it('should list responses for a valid form and return an empty array', async () => {
          const responses = await sdk.forms.listResponses(formId);
          expect(Array.isArray(responses)).toBe(true);
          expect(responses).toHaveLength(0);
        });

        it('should list responses for a newly created form (no submissions)', async () => {
          const newForm = await sdk.forms.createForm({
            title: 'No Response Form',
            slug: `no-response-${Date.now()}`,
            fields: [{ id: 'q1', type: FieldType.STRING, title: 'Question 1' }]
          });
          createdFormIds.push(newForm.id);

          const responses = await sdk.forms.listResponses(newForm.id);
          expect(Array.isArray(responses)).toBe(true);
          expect(responses).toHaveLength(0);
        });
      });

      describe('Delete Forms', () => {
        it('should delete a created form', async () => {
          const idToDelete = createdFormIds.pop()!;
          await sdk.forms.deleteForm(idToDelete);
          const list = await sdk.forms.listForms();
          expect(list.some(f => f.id === idToDelete)).toBe(false);
        });

        it('should handle deleting a non-existent form gracefully', async () => {
          const nonExistentId = '00000000-0000-0000-0000-000000000000';
          await expect(sdk.forms.deleteForm(nonExistentId)).resolves.toBeUndefined();
        });

        it('should verify all remaining created forms still exist', async () => {
          const list = await sdk.forms.listForms();
          for (const id of createdFormIds) {
            expect(list.some(f => f.id === id)).toBe(true);
          }
        });

        it('should clean up the primary form used in update/response tests', async () => {
          if (formId) {
            await sdk.forms.deleteForm(formId);
            const list = await sdk.forms.listForms();
            expect(list.some(f => f.id === formId)).toBe(false);
            formId = '';
          }
        });
      });
    });

    describe('Databases Module', () => {
      it('should create a real database', async () => {
        const payload = {
          name: 'Customer DB',
          schema: { type: 'object', properties: { name: { type: 'string' } } }
        };
        const result = await sdk.databases.createDatabase(payload);
        expect(result.id).toBeDefined();
        databaseId = result.id;
      });

      it('should create a record', async () => {
        const record = await sdk.databases.createRecord(databaseId, { name: 'John Doe' });
        expect(record.id).toBeDefined();
        expect(record.data.name).toBe('John Doe');
      });

      describe('Server-side Queries', () => {
        beforeAll(async () => {
          await sdk.databases.createRecord(databaseId, { name: 'John Wick' });
          await sdk.databases.createRecord(databaseId, { name: 'Jane Doe' });
          await sdk.databases.createRecord(databaseId, { name: 'Alice Smith' });
        });

        it('should query records with a contains filter', async () => {
          const result = await sdk.databases.queryRecords(databaseId, {
            filters: [{ field: 'name', op: RecordFilterOperator.CONTAINS, value: 'Doe' }]
          });

          expect(result.total).toBe(2);
          expect(result.records.length).toBe(2);
          expect(result.records.every(r => r.data.name.includes('Doe'))).toBe(true);
        });

        it('should query records with a starts_with filter', async () => {
          const result = await sdk.databases.queryRecords(databaseId, {
            filters: [{ field: 'name', op: RecordFilterOperator.STARTS_WITH, value: 'John' }]
          });

          expect(result.total).toBe(2);
          expect(result.records.every(r => r.data.name.startsWith('John'))).toBe(true);
        });

        it('should sort and paginate records', async () => {
          const page = await sdk.databases.queryRecords(databaseId, {
            sort: [{ field: 'name', dir: RecordSortDirection.ASC }],
            limit: 2,
            offset: 0
          });

          expect(page.records.length).toBe(2);
          expect(page.total).toBe(4);

          const names = page.records.map(r => r.data.name as string).sort();
          expect(page.records[0].data.name).toBe(names[0]);
        });

        it('should count records matching filters', async () => {
          const count = await sdk.databases.countRecords(databaseId, [
            { field: 'name', op: RecordFilterOperator.EQ, value: 'John Doe' }
          ]);

          expect(count).toBe(1);
        });

        it('should count all records without filters', async () => {
          const count = await sdk.databases.countRecords(databaseId);

          expect(count).toBe(4);
        });

        it('should aggregate record counts grouped by a data field', async () => {
          const results = await sdk.databases.aggregateRecords(databaseId, {
            op: RecordAggregateOperator.COUNT,
            groupBy: 'name'
          });

          expect(results.length).toBe(4);
          results.forEach(row => {
            expect(row.key).toBeDefined();
            expect(row.value).toBe(1);
          });
        });
      });
    });

    describe('Diagrams Module', () => {
      it('should create a real diagram', async () => {
        const payload = {
          name: `Live Diagram ${Date.now()}`,
          description: 'A test diagram flow',
          code: 'graph TD\n  A[Start] --> B[End]'
        };
        const result = await sdk.diagrams.createDiagram(payload);
        expect(result.id).toBeDefined();
        expect(result.name).toBe(payload.name);
        expect(result.code).toBe(payload.code);
        diagramId = result.id;
      });

      it('should retrieve a specific diagram', async () => {
        const diagram = await sdk.diagrams.getDiagram(diagramId);
        expect(diagram.id).toBe(diagramId);
        expect(diagram.name).toBeDefined();
      });

      it('should update the diagram', async () => {
        const newCode = 'graph LR\n  A --> B';
        const updated = await sdk.diagrams.updateDiagram(diagramId, {
          code: newCode,
          description: 'Updated description'
        });
        expect(updated.code).toBe(newCode);
        expect(updated.description).toBe('Updated description');
      });

      it('should list all diagrams and find the current one', async () => {
        const list = await sdk.diagrams.listDiagrams();
        expect(Array.isArray(list)).toBe(true);
        expect(list.some(d => d.id === diagramId)).toBe(true);
      });

      it('should delete a diagram', async () => {
        await sdk.diagrams.deleteDiagram(diagramId);
        const list = await sdk.diagrams.listDiagrams();
        expect(list.some(d => d.id === diagramId)).toBe(false);
        diagramId = '';
      });
    });

    describe('Storage Module', () => {
      const bucketName = 'avatars';
      const testFileName = `test-file-${Date.now()}.txt`;
      const testContent = 'Hello LedGo Storage!';
      let uploadedKey: string;

      it('should upload a file with specific path', async () => {
        const blob = new Blob([testContent], { type: 'text/plain' });
        const result = await sdk.storage.from(bucketName).upload({
          path: testFileName,
          file: blob
        });

        expect(result.bucket).toBe(bucketName);
        expect(result.key).toContain(testFileName);
        expect(result.url).toBeDefined();
        uploadedKey = result.key;
      });

      it('should upload a file with auto-generated key', async () => {
        const blob = new Blob(['Auto Key Content'], { type: 'text/plain' });
        const result = await sdk.storage.from(bucketName).uploadAuto(blob);

        expect(result.bucket).toBe(bucketName);
        expect(result.key).toBeDefined();
        expect(result.url).toBeDefined();

        await sdk.storage.from(bucketName).remove(result.key);
      });

      it('should download the uploaded file', async () => {
        const blob: any = await sdk.storage.from(bucketName).download(uploadedKey);
        
        expect(blob).toBeDefined();
        
        const size = blob.size !== undefined ? blob.size : (blob.length !== undefined ? blob.length : 0);
        expect(size).toBeGreaterThan(0);
        
        let text = '';
        if (typeof blob.text === 'function') {
          text = await blob.text();
        } else if (typeof blob.toString === 'function') {
          text = blob.toString();
        }
        
        expect(text).toBe(testContent);
      });

      it('should delete the uploaded file', async () => {
        await sdk.storage.from(bucketName).remove(uploadedKey);
        
        try {
          await sdk.storage.from(bucketName).download(uploadedKey);
          fail('Should have thrown an error');
        } catch (error: any) {
          expect(error.response.status).toBe(404);
        }
      });
    });

    describe('Widgets Module', () => {
      const createdWidgetIds: string[] = [];

      describe('Create Widgets', () => {
        it('should create a metrics widget', async () => {
          const widget = await sdk.widgets.createWidget({
            widgetType: WidgetType.METRICS,
            config: { title: 'Revenue', value: 50000, unit: 'USD', trend: 'up', prefix: '$', suffix: '' },
            position: { x: 0, y: 0, w: 3, h: 2, minW: 2, minH: 2 }
          });

          expect(widget.id).toBeDefined();
          expect(widget.widgetType).toBe(WidgetType.METRICS);
          expect(widget.config.title).toBe('Revenue');
          expect(widget.position.w).toBe(3);
          createdWidgetIds.push(widget.id);
        });

        it('should create a title widget', async () => {
          const widget = await sdk.widgets.createWidget({
            widgetType: WidgetType.TITLE,
            config: { content: 'Welcome Dashboard', level: 3, alignment: TextAlignmentType.CENTER },
            position: { x: 0, y: 0, w: 3, h: 1, minW: 2, minH: 1 }
          });

          expect(widget.id).toBeDefined();
          expect(widget.widgetType).toBe(WidgetType.TITLE);
          expect(widget.config.content).toBe('Welcome Dashboard');
          createdWidgetIds.push(widget.id);
        });

        it('should create a chart widget with default config', async () => {
          const widget = await sdk.widgets.createWidget({
            widgetType: WidgetType.CHART,
            position: { x: 0, y: 0, w: 4, h: 3 }
          });

          expect(widget.id).toBeDefined();
          expect(widget.widgetType).toBe(WidgetType.CHART);
          expect(widget.position.w).toBe(4);
          createdWidgetIds.push(widget.id);
        });

        it('should create a toggle widget', async () => {
          const widget = await sdk.widgets.createWidget({
            widgetType: WidgetType.TOGGLE,
            config: { label: 'Dark Mode', defaultValue: false, currentValue: true, onLabel: 'On', offLabel: 'Off' },
            position: { x: 0, y: 0, w: 2, h: 1 }
          });

          expect(widget.id).toBeDefined();
          expect(widget.config.label).toBe('Dark Mode');
          expect(widget.config.currentValue).toBe(true);
          createdWidgetIds.push(widget.id);
        });

        it('should create a button widget', async () => {
          const widget = await sdk.widgets.createWidget({
            widgetType: WidgetType.BUTTON,
            config: { label: 'Learn More', variant: 'primary', size: 'md', action: 'https://example.com', icon: '' },
            position: { x: 0, y: 0, w: 1, h: 1 }
          });

          expect(widget.id).toBeDefined();
          expect(widget.config.label).toBe('Learn More');
          expect(widget.config.variant).toBe('primary');
          createdWidgetIds.push(widget.id);
        });

        it('should create an image widget', async () => {
          const widget = await sdk.widgets.createWidget({
            widgetType: WidgetType.IMAGE,
            config: { src: 'https://example.com/image.png', alt: 'Example', fit: 'cover', rounded: false },
            position: { x: 0, y: 0, w: 3, h: 3 }
          });

          expect(widget.id).toBeDefined();
          expect(widget.config.src).toBe('https://example.com/image.png');
          createdWidgetIds.push(widget.id);
        });

        it('should create a textarea widget', async () => {
          const widget = await sdk.widgets.createWidget({
            widgetType: WidgetType.TEXTAREA,
            config: { content: 'Hello, this is a text block!' },
            position: { x: 0, y: 0, w: 3, h: 3 }
          });

          expect(widget.id).toBeDefined();
          expect(widget.config.content).toBe('Hello, this is a text block!');
          createdWidgetIds.push(widget.id);
        });

        it('should create a code widget', async () => {
          const widget = await sdk.widgets.createWidget({
            widgetType: WidgetType.CODE,
            config: { code: 'console.log("Hello World");', language: 'javascript' },
            position: { x: 0, y: 0, w: 4, h: 3 }
          });

          expect(widget.id).toBeDefined();
          expect(widget.config.language).toBe('javascript');
          createdWidgetIds.push(widget.id);
        });

        it('should create a progress_bar widget', async () => {
          const widget = await sdk.widgets.createWidget({
            widgetType: WidgetType.PROGRESS_BAR,
            config: { label: 'Completion', value: 75, color: '#00d992', showPercentage: true },
            position: { x: 0, y: 0, w: 3, h: 1 }
          });

          expect(widget.id).toBeDefined();
          expect(widget.config.value).toBe(75);
          expect(widget.config.showPercentage).toBe(true);
          createdWidgetIds.push(widget.id);
        });

        it('should create a progress_bar_list widget', async () => {
          const widget = await sdk.widgets.createWidget({
            widgetType: WidgetType.PROGRESS_BAR_LIST,
            config: {
              items: [{ label: 'Task A', value: 80, color: '#00d992' }, { label: 'Task B', value: 45, color: '#f59e0b' }],
              showPercentage: true
            },
            position: { x: 0, y: 0, w: 3, h: 3 }
          });

          expect(widget.id).toBeDefined();
          expect(widget.config.items.length).toBe(2);
          createdWidgetIds.push(widget.id);
        });

        it('should create a youtube widget', async () => {
          const widget = await sdk.widgets.createWidget({
            widgetType: WidgetType.YOUTUBE,
            config: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
            position: { x: 0, y: 0, w: 4, h: 3 }
          });

          expect(widget.id).toBeDefined();
          expect(widget.config.url).toContain('youtube.com');
          createdWidgetIds.push(widget.id);
        });

        it('should create a link widget', async () => {
          const widget = await sdk.widgets.createWidget({
            widgetType: WidgetType.LINK,
            config: { label: 'Visit Site', url: 'https://example.com' },
            position: { x: 0, y: 0, w: 2, h: 1 }
          });

          expect(widget.id).toBeDefined();
          expect(widget.config.url).toBe('https://example.com');
          createdWidgetIds.push(widget.id);
        });

        it('should create a table widget', async () => {
          const widget = await sdk.widgets.createWidget({
            widgetType: WidgetType.TABLE,
            config: {
              columns: ['Columna 1', 'Columna 2'],
              rows: [['', ''], ['', '']],
              cellAlignments: [[TextAlignmentType.LEFT, TextAlignmentType.LEFT], [TextAlignmentType.LEFT, TextAlignmentType.LEFT]],
              columnAlignments: []
            },
            position: { x: 0, y: 0, w: 7, h: 4 }
          });

          expect(widget.id).toBeDefined();
          expect(widget.widgetType).toBe(WidgetType.TABLE);
          expect(widget.config.columns).toHaveLength(2);
          expect(widget.config.rows).toHaveLength(2);
          createdWidgetIds.push(widget.id);
        });

        it('should create a list widget', async () => {
          const widget = await sdk.widgets.createWidget({
            widgetType: WidgetType.LIST,
            config: {
              items: [
                { text: 'Elemento 1', checked: false },
                { text: 'Elemento 2', checked: true },
              ],
              style: ListStyleType.CHECKLIST,
            },
            position: { x: 0, y: 0, w: 6, h: 3 }
          });

          expect(widget.id).toBeDefined();
          expect(widget.widgetType).toBe(WidgetType.LIST);
          expect(widget.config.items).toHaveLength(2);
          expect(widget.config.items[1].checked).toBe(true);
          createdWidgetIds.push(widget.id);
        });

        it('should create a divider widget', async () => {
          const widget = await sdk.widgets.createWidget({
            widgetType: WidgetType.DIVIDER,
            config: { color: '#3d3a39' },
            position: { x: 0, y: 0, w: 12, h: 1 }
          });

          expect(widget.id).toBeDefined();
          expect(widget.widgetType).toBe(WidgetType.DIVIDER);
          expect(widget.config.color).toBe('#3d3a39');
          createdWidgetIds.push(widget.id);
        });

        it('should create an embed widget', async () => {
          const widget = await sdk.widgets.createWidget({
            widgetType: WidgetType.EMBED,
            config: {
              resourceType: EmbedResourceType.DATABASE,
              resourceId: '00000000-0000-0000-0000-000000000000',
              showTitle: true,
            },
            position: { x: 0, y: 0, w: 6, h: 3 }
          });

          expect(widget.id).toBeDefined();
          expect(widget.widgetType).toBe(WidgetType.EMBED);
          expect(widget.config.resourceType).toBe(EmbedResourceType.DATABASE);
          createdWidgetIds.push(widget.id);
        });

        it('should create several widgets in a single request', async () => {
          const widgets = await sdk.widgets.createWidgets([
            {
              widgetType: WidgetType.TITLE,
              config: { content: 'Batch Created Title', level: 2, alignment: TextAlignmentType.LEFT },
              position: { x: 0, y: 0, w: 4, h: 1 }
            },
            {
              widgetType: WidgetType.TEXTAREA,
              config: { content: 'Batch Created Body' },
              position: { x: 4, y: 0, w: 4, h: 1 }
            },
          ]);

          expect(widgets).toHaveLength(2);
          expect(widgets[0].id).toBeDefined();
          expect(widgets[0].widgetType).toBe(WidgetType.TITLE);
          expect(widgets[0].config.content).toBe('Batch Created Title');
          expect(widgets[1].id).toBeDefined();
          expect(widgets[1].widgetType).toBe(WidgetType.TEXTAREA);
          expect(widgets[1].config.content).toBe('Batch Created Body');
          createdWidgetIds.push(...widgets.map(w => w.id));
        });
      });

      describe('List and Get Widgets', () => {
        it('should list all widgets and find created ones', async () => {
          const list = await sdk.widgets.listWidgets();

          expect(Array.isArray(list)).toBe(true);

          for (const id of createdWidgetIds) {
            const found = list.some(w => w.id === id);

            expect(found).toBe(true);
          }
        });

        it('should get a specific widget by ID', async () => {
          const firstId = createdWidgetIds[0];
          const widget = await sdk.widgets.getWidget(firstId);

          expect(widget.id).toBe(firstId);
          expect(widget.widgetType).toBeDefined();
          expect(widget.config).toBeDefined();
          expect(widget.position).toBeDefined();
          expect(widget.organizationId).toBeDefined();
        });

        it('should read the dashboard content as AI text', async () => {
          const content = await sdk.widgets.readContent();

          expect(content).toContain('```md');

          for (const id of createdWidgetIds) {
            expect(content).toContain(`${id}:`);
          }
        });
      });

      describe('Update Widgets', () => {
        it('should update metrics widget config', async () => {
          const metricsWidgetId = createdWidgetIds[0];
          const updated = await sdk.widgets.updateWidget(metricsWidgetId, {
            config: { title: 'Updated Revenue', value: 75000, unit: 'USD', trend: 'up', prefix: '$', suffix: '' }
          });

          expect(updated.config.title).toBe('Updated Revenue');
          expect(updated.config.value).toBe(75000);
        });

        it('should update widget position', async () => {
          const widgetId = createdWidgetIds[1];
          const updated = await sdk.widgets.updateWidget(widgetId, {
            position: { x: 3, y: 2, w: 4, h: 2 }
          });

          expect(updated.position.x).toBe(3);
          expect(updated.position.y).toBe(2);
          expect(updated.position.w).toBe(4);
          expect(updated.position.h).toBe(2);
        });

        it('should update both config and position together', async () => {
          const widgetId = createdWidgetIds[2];
          const updated = await sdk.widgets.updateWidget(widgetId, {
            config: { type: 'pie', title: 'Updated Chart', labels: 'A,B,C', data: '10,20,30' },
            position: { x: 1, y: 1, w: 5, h: 4 }
          });

          expect(updated.config.title).toBe('Updated Chart');
          expect(updated.config.type).toBe('pie');
          expect(updated.position.w).toBe(5);
        });

        it('should verify the update persisted by fetching the widget', async () => {
          const widgetId = createdWidgetIds[0];
          const widget = await sdk.widgets.getWidget(widgetId);

          expect(widget.config.title).toBe('Updated Revenue');
          expect(widget.config.value).toBe(75000);
        });

        it('should update the positions of several widgets in one request', async () => {
          await sdk.widgets.updateWidgetPositions([
            { widgetId: createdWidgetIds[0], position: { x: 2, y: 3, w: 4, h: 2 } },
            { widgetId: createdWidgetIds[1], position: { x: 6, y: 3, w: 4, h: 2 } },
          ]);

          const firstWidget = await sdk.widgets.getWidget(createdWidgetIds[0]);
          const secondWidget = await sdk.widgets.getWidget(createdWidgetIds[1]);

          expect(firstWidget.position).toMatchObject({ x: 2, y: 3, w: 4, h: 2 });
          expect(secondWidget.position).toMatchObject({ x: 6, y: 3, w: 4, h: 2 });
        });

        it('should update several widgets in a single request', async () => {
          const updated = await sdk.widgets.updateWidgets([
            { id: createdWidgetIds[0], config: { title: 'Batch Updated Revenue', value: 80000, unit: 'USD', trend: 'up', prefix: '$', suffix: '' } },
            { id: createdWidgetIds[1], position: { x: 5, y: 4, w: 3, h: 2 } },
          ]);

          expect(updated).toHaveLength(2);
          expect(updated[0].id).toBe(createdWidgetIds[0]);
          expect(updated[0].config.title).toBe('Batch Updated Revenue');
          expect(updated[1].id).toBe(createdWidgetIds[1]);
          expect(updated[1].position).toMatchObject({ x: 5, y: 4, w: 3, h: 2 });
        });
      });

      describe('Delete Widgets', () => {
        it('should delete all created widgets in a single request', async () => {
          await sdk.widgets.deleteWidgets(createdWidgetIds);
        }, 30000);

        it('should verify deletion by listing widgets', async () => {
          const list = await sdk.widgets.listWidgets();

          for (const id of createdWidgetIds) {
            const found = list.some(w => w.id === id);

            expect(found).toBe(false);
          }
        });

        it('should handle deleting a non-existent widget gracefully', async () => {
          const nonExistentId = '00000000-0000-0000-0000-000000000000';

          await expect(sdk.widgets.deleteWidget(nonExistentId)).resolves.toBeUndefined();
        });

        it('should handle getting a non-existent widget', async () => {
          const nonExistentId = '00000000-0000-0000-0000-000000000000';

          const result = await sdk.widgets.getWidget(nonExistentId);

          expect(result).toBeDefined();
        });
      });

      describe('Batch Delete Widgets', () => {
        let batchWidgetIds: string[] = [];

        afterAll(async () => {
          for (const id of batchWidgetIds) {
            try {
              await sdk.widgets.deleteWidget(id);
            } catch {
            }
          }
        });

        it('should delete several widgets in a single request', async () => {
          const w1 = await sdk.widgets.createWidget({
            widgetType: WidgetType.TITLE,
            config: { content: 'Batch A', level: 2, alignment: TextAlignmentType.LEFT },
            position: { x: 0, y: 0, w: 4, h: 1 }
          });
          const w2 = await sdk.widgets.createWidget({
            widgetType: WidgetType.TEXTAREA,
            config: { content: 'Batch B' },
            position: { x: 4, y: 0, w: 4, h: 1 }
          });
          const w3 = await sdk.widgets.createWidget({
            widgetType: WidgetType.DIVIDER,
            config: { color: '#3d3a39' },
            position: { x: 0, y: 1, w: 12, h: 1 }
          });

          batchWidgetIds = [w1.id, w2.id, w3.id];

          await sdk.widgets.deleteWidgets(batchWidgetIds);

          const list = await sdk.widgets.listWidgets();

          for (const id of batchWidgetIds) {
            const found = list.some(w => w.id === id);

            expect(found).toBe(false);
          }

          batchWidgetIds = [];
        });
      });

      describe('Widget Type Data Integrity', () => {
        let integrityWidgetId: string;

        afterAll(async () => {
          if (integrityWidgetId) {
            try {
              await sdk.widgets.deleteWidget(integrityWidgetId);
            } catch {
            }
          }
        });

        it('should preserve complex nested config (progress_bar_list items)', async () => {
          const items = [
            { label: 'Task 1', value: 100, color: '#00d992' },
            { label: 'Task 2', value: 60, color: '#f59e0b' },
            { label: 'Task 3', value: 30, color: '#ef4444' },
          ];

          const widget = await sdk.widgets.createWidget({
            widgetType: WidgetType.PROGRESS_BAR_LIST,
            config: { items, showPercentage: true },
            position: { x: 0, y: 0, w: 3, h: 3 }
          });

          integrityWidgetId = widget.id;

          expect(widget.config.items).toEqual(items);
          expect(widget.config.items.length).toBe(3);
          expect(widget.config.items[0].value).toBe(100);
        });

        it('should preserve boolean config values through update cycle', async () => {
          const updated = await sdk.widgets.updateWidget(integrityWidgetId, {
            config: {
              items: [
                { label: 'Task 1', value: 100, color: '#00d992' },
                { label: 'Task 2', value: 60, color: '#f59e0b' },
              ],
              showPercentage: false
            }
          });

          expect(updated.config.showPercentage).toBe(false);

          const fetched = await sdk.widgets.getWidget(integrityWidgetId);

          expect(fetched.config.showPercentage).toBe(false);
          expect(fetched.config.items.length).toBe(2);
        });
      });
    });

    describe('Cleanup', () => {
      it('should delete created resources', async () => {
        if (dashboardId) await sdk.kanbans.deleteDashboard(dashboardId);
        if (databaseId) await sdk.databases.deleteDatabase(databaseId);
        if (diagramId) await sdk.diagrams.deleteDiagram(diagramId);
      });
    });
  });

  describe('Documents Module', () => {
    const isDocumentsConfigured = config.baseUrl && config.organizationId && config.token;

    if (!isDocumentsConfigured) {
      it('should be configured', () => {
        expect(config.token).toBeDefined();
      });

      return;
    }

    const docsSdk = new LedGoSDK(config);
    let createdDocumentId: string;
    let createdBlockIds: string[] = [];

    it('should list the documents of the token-scoped project', async () => {
      const list = await docsSdk.documents.listDocuments();
      expect(Array.isArray(list)).toBe(true);
    });

    it('should create a document', async () => {
      const doc = await docsSdk.documents.createDocument({
        title: `SDK Document ${Date.now()}`,
        description: 'Created by SDK live tests',
        status: DocumentStatus.PUBLISHED,
        scope: DocumentScopeType.PROJECT,
      });

      expect(doc.id).toBeDefined();
      expect(doc.title).toContain('SDK Document');
      expect(doc.projectId).toBeDefined();
      expect(doc.organizationId).toBeDefined();
      expect(doc.status).toBe(DocumentStatus.PUBLISHED);
      createdDocumentId = doc.id;
    });

    it('should retrieve the created document', async () => {
      const doc = await docsSdk.documents.getDocument(createdDocumentId);
      expect(doc.id).toBe(createdDocumentId);
      expect(doc.title).toContain('SDK Document');
    });

    it('should update the document', async () => {
      const updated = await docsSdk.documents.updateDocument(createdDocumentId, {
        title: 'Updated SDK Document',
        description: 'Updated description',
        scope: DocumentScopeType.ORGANIZATION,
      });

      expect(updated.title).toBe('Updated SDK Document');
      expect(updated.description).toBe('Updated description');
      expect(updated.scope).toBe(DocumentScopeType.ORGANIZATION);
    });

    it('should create blocks of different types in the document', async () => {
      const titleBlock = await docsSdk.documents.createBlock(createdDocumentId, {
        widgetType: WidgetType.TITLE,
        config: { content: 'SDK Title Block', level: 1, alignment: TextAlignmentType.LEFT },
        position: { x: 0, y: 0, w: 12, h: 2, minW: 12, maxW: 12, minH: 1 },
      });
      const tableBlock = await docsSdk.documents.createBlock(createdDocumentId, {
        widgetType: DocumentBlockType.TABLE,
        config: { columns: ['Columna 1', 'Columna 2'], rows: [['A', 'B']] },
        position: { x: 0, y: 2, w: 12, h: 4 },
      });
      const textBlock = await docsSdk.documents.createBlock(createdDocumentId, {
        widgetType: WidgetType.TEXTAREA,
        config: { content: 'Some text content' },
        position: { x: 0, y: 6, w: 12, h: 3 },
      });

      expect(titleBlock.id).toBeDefined();
      expect(titleBlock.widgetType).toBe(WidgetType.TITLE);
      expect(tableBlock.id).toBeDefined();
      expect(tableBlock.widgetType).toBe(DocumentBlockType.TABLE);
      expect(textBlock.id).toBeDefined();
      createdBlockIds = [titleBlock.id, tableBlock.id, textBlock.id];
    });

    it('should create several blocks in a single request', async () => {
      const blocks = await docsSdk.documents.createBlocks(createdDocumentId, [
        {
          widgetType: WidgetType.TITLE,
          config: { content: 'Batch Title Block', level: 2, alignment: TextAlignmentType.LEFT },
          position: { x: 0, y: 16, w: 12, h: 2, minW: 12, maxW: 12, minH: 1 },
        },
        {
          widgetType: WidgetType.TEXTAREA,
          config: { content: 'Batch body text' },
          position: { x: 0, y: 18, w: 12, h: 3 },
        },
      ]);

      expect(blocks).toHaveLength(2);
      expect(blocks[0].id).toBeDefined();
      expect(blocks[0].widgetType).toBe(WidgetType.TITLE);
      expect(blocks[0].config.content).toBe('Batch Title Block');
      expect(blocks[1].id).toBeDefined();
      expect(blocks[1].widgetType).toBe(WidgetType.TEXTAREA);
      expect(blocks[1].config.content).toBe('Batch body text');
      createdBlockIds.push(...blocks.map(b => b.id));
    });

    it('should read the document content as AI text', async () => {
      const content = await docsSdk.documents.readContent(createdDocumentId);

      expect(content).toContain('```md');
      expect(content).toContain(`${createdBlockIds[0]}:`);
      expect(content).toContain('# SDK Title Block');
      expect(content).toContain('| Columna 1 | Columna 2 |');
      expect(content).toContain('Some text content');
    });

    it('should read the document content as raw markdown', async () => {
      const markdown = await docsSdk.documents.readContent(createdDocumentId, { format: WidgetTextFormat.MARKDOWN });

      expect(markdown).toContain('# SDK Title Block');
      expect(markdown).toContain('| Columna 1 | Columna 2 |');
      expect(markdown).not.toContain('```md');
    });

    it('should list the document blocks', async () => {
      const blocks = await docsSdk.documents.listBlocks(createdDocumentId);
      expect(Array.isArray(blocks)).toBe(true);
      expect(blocks.length).toBeGreaterThanOrEqual(createdBlockIds.length);
      for (const blockId of createdBlockIds) {
        expect(blocks.some(b => b.id === blockId)).toBe(true);
      }
    });

    it('should update a block config and position', async () => {
      const updated = await docsSdk.documents.updateBlock(createdDocumentId, createdBlockIds[0], {
        config: { content: 'Updated Title Block', level: 2, alignment: TextAlignmentType.CENTER },
        position: { x: 0, y: 0, w: 12, h: 1, minW: 12, maxW: 12, minH: 1 },
      });

      expect(updated.config.content).toBe('Updated Title Block');
      expect(updated.position.h).toBe(1);
    });

    it('should update the positions of several blocks in one request', async () => {
      await docsSdk.documents.updateBlockPositions(createdDocumentId, [
        { blockId: createdBlockIds[1], position: { x: 0, y: 8, w: 12, h: 4 } },
        { blockId: createdBlockIds[2], position: { x: 0, y: 12, w: 12, h: 3 } },
      ]);

      const blocks = await docsSdk.documents.listBlocks(createdDocumentId);
      const tableBlock = blocks.find(b => b.id === createdBlockIds[1]);
      const textBlock = blocks.find(b => b.id === createdBlockIds[2]);

      expect(tableBlock?.position).toMatchObject({ x: 0, y: 8, w: 12, h: 4 });
      expect(textBlock?.position).toMatchObject({ x: 0, y: 12, w: 12, h: 3 });
    });

    it('should create a complete document with blocks in a single call', async () => {
      const result = await docsSdk.documents.createDocumentWithBlocks({
        title: `SDK Full Document ${Date.now()}`,
        description: 'Created with blocks in one call',
        blocks: [
          {
            widgetType: WidgetType.TITLE,
            config: { content: 'Full Title Block', level: 1, alignment: TextAlignmentType.LEFT },
            position: { x: 0, y: 0, w: 12, h: 2, minW: 12, maxW: 12, minH: 1 },
          },
          {
            widgetType: WidgetType.TEXTAREA,
            config: { content: 'Full body text' },
            position: { x: 0, y: 2, w: 12, h: 3 },
          },
        ],
      });

      expect(result.document.id).toBeDefined();
      expect(result.document.title).toContain('SDK Full Document');
      expect(result.document.description).toBe('Created with blocks in one call');
      expect(result.document.projectId).toBeDefined();
      expect(result.blocks).toHaveLength(2);
      expect(result.blocks[0].widgetType).toBe(WidgetType.TITLE);
      expect(result.blocks[0].config.content).toBe('Full Title Block');
      expect(result.blocks[1].widgetType).toBe(WidgetType.TEXTAREA);
      expect(result.blocks[1].config.content).toBe('Full body text');

      const blocks = await docsSdk.documents.listBlocks(result.document.id);
      expect(blocks).toHaveLength(2);

      await docsSdk.documents.deleteDocument(result.document.id);

      const documents = await docsSdk.documents.listDocuments();
      expect(documents.some(d => d.id === result.document.id)).toBe(false);
    });

    it('should delete the blocks and the document', async () => {
      for (const blockId of createdBlockIds) {
        await docsSdk.documents.deleteBlock(createdDocumentId, blockId);
      }

      const blocks = await docsSdk.documents.listBlocks(createdDocumentId);
      expect(blocks.length).toBe(0);

      await docsSdk.documents.deleteDocument(createdDocumentId);

      const documents = await docsSdk.documents.listDocuments();
      expect(documents.some(d => d.id === createdDocumentId)).toBe(false);
    }, 30000);
  });

  describe('Without organizationId', () => {
    const sdkNoOrg = new LedGoSDK({
      baseUrl: config.baseUrl,
      token: config.token
    });

    it('should resolve the organization from the token and list dashboards', async () => {
      const list = await sdkNoOrg.kanbans.listDashboards();
      expect(Array.isArray(list)).toBe(true);
    });

    it('should list forms without providing an organization id', async () => {
      const list = await sdkNoOrg.forms.listForms();
      expect(Array.isArray(list)).toBe(true);
    });
  });

  describe('Error Handling (RAW)', () => {
    it('should return custom error format on unauthorized', async () => {
      const badSdk = new LedGoSDK({ ...config, token: 'prof_invalid' });
      try {
        await badSdk.kanbans.listDashboards();
      } catch (error: any) {
        expect(error.response.data).toMatchObject({
          message: expect.any(String),
          code: '0xAUTH01'
        });
        expect(error.response.status).toBe(403);
      }
    });

    it('should return error code for invalid resources', async () => {
      try {
        await sdk.kanbans.updateDashboard('00000000-0000-0000-0000-000000000000', { name: 'X' });
      } catch (error: any) {
        expect(error.response.data.code).toBeDefined();
      }
    });
  });
});

describe('Form session URL derivation (no network)', () => {
  it('derives the functions URL for insforge.app hosts', () => {
    const sdk = new LedGoSDK({
      baseUrl: 'https://m3c9h4c8.us-east.insforge.app',
      token: 'prof_x'
    });

    expect(sdk.forms.getFormSessionUrl()).toBe('https://m3c9h4c8.function2.insforge.app/form-session');
  });

  it('builds the read URL by session token', () => {
    const sdk = new LedGoSDK({
      baseUrl: 'https://m3c9h4c8.us-east.insforge.app',
      token: 'prof_x'
    });

    expect(sdk.forms.getFormSessionReadUrl('3d27edde-108c-4cb4-ae4d-fd6efd00f8de'))
      .toBe('https://m3c9h4c8.function2.insforge.app/form-session?id=3d27edde-108c-4cb4-ae4d-fd6efd00f8de');
  });

  it('falls back to the proxy path for non-insforge hosts', () => {
    const sdk = new LedGoSDK({
      baseUrl: 'https://api.ledgo.ai',
      token: 'prof_x'
    });

    expect(sdk.forms.getFormSessionUrl()).toBe('https://api.ledgo.ai/functions/form-session');
  });
});
