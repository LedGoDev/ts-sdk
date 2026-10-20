import { LedGoSDK } from '../src';

/** Captured request of the mocked fetch. */
interface ICapturedRequest {
  url: string;
  method: string;
  body: unknown;
}

/** Installs a fetch mock that records every request and returns an empty object. */
function mockFetch(): ICapturedRequest[] {
  const requests: ICapturedRequest[] = [];

  (global as unknown as { fetch: unknown }).fetch = async (url: string, options: RequestInit = {}) => {
    requests.push({
      url,
      method: options.method ?? 'GET',
      body: options.body ? JSON.parse(options.body as string) : undefined,
    });

    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({}),
    } as unknown as Response;
  };

  return requests;
}

const BASE_URL = 'https://api.example.com';

describe('CommentsModule routes', () => {
  let sdk: LedGoSDK;
  let requests: ICapturedRequest[];

  beforeEach(() => {
    requests = mockFetch();
    sdk = new LedGoSDK({ baseUrl: BASE_URL, token: 'test-token' });
  });

  it('lists kanban comments under the dashboard route', async () => {
    await sdk.comments.listForKanban('dashboard-1', 'kanban:dashboard-1:card:card-1');

    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe('GET');
    expect(requests[0].url).toBe(
      `${BASE_URL}/kanbans/dashboards/dashboard-1/comments?target_key=${encodeURIComponent('kanban:dashboard-1:card:card-1')}`,
    );
  });

  it('creates a kanban card comment with a camelCase target preserved', async () => {
    await sdk.comments.createForKanban('dashboard-1', {
      target: { kind: 'card', cardId: 'card-1' },
      body: 'Blocked',
      parentId: 'parent-1',
    });

    expect(requests[0].method).toBe('POST');
    expect(requests[0].url).toBe(`${BASE_URL}/kanbans/dashboards/dashboard-1/comments`);
    expect(requests[0].body).toEqual({
      target: { kind: 'card', cardId: 'card-1' },
      body: 'Blocked',
      parent_id: 'parent-1',
    });
  });

  it('lists and creates form response comments', async () => {
    await sdk.comments.listForForm('form-1');
    await sdk.comments.createForForm('form-1', {
      target: { kind: 'response', responseId: 'response-1' },
      body: 'Follow up',
    });

    expect(requests[0].url).toBe(`${BASE_URL}/forms/form-1/comments`);
    expect(requests[1].url).toBe(`${BASE_URL}/forms/form-1/comments`);
    expect(requests[1].body).toEqual({
      target: { kind: 'response', responseId: 'response-1' },
      body: 'Follow up',
    });
  });

  it('lists and creates document block comments', async () => {
    await sdk.comments.listForDocument('document-1');
    await sdk.comments.createForDocument('document-1', {
      target: { kind: 'block', blockId: 'block-1' },
      body: 'Expand this',
    });

    expect(requests[0].url).toBe(`${BASE_URL}/documents/document-1/comments`);
    expect(requests[1].url).toBe(`${BASE_URL}/documents/document-1/comments`);
    expect(requests[1].body).toEqual({
      target: { kind: 'block', blockId: 'block-1' },
      body: 'Expand this',
    });
  });

  it('updates a comment through the selected module route', async () => {
    await sdk.comments.update('comment-1', 'New body', 'kanban');

    expect(requests[0].method).toBe('PATCH');
    expect(requests[0].url).toBe(`${BASE_URL}/kanbans/comments/comment-1`);
    expect(requests[0].body).toEqual({ body: 'New body' });
  });

  it('defaults the by-id route to databases for backwards compatibility', async () => {
    await sdk.comments.update('comment-1', 'New body');
    await sdk.comments.remove('comment-1');

    expect(requests[0].url).toBe(`${BASE_URL}/databases/comments/comment-1`);
    expect(requests[1].method).toBe('DELETE');
    expect(requests[1].url).toBe(`${BASE_URL}/databases/comments/comment-1`);
  });

  it('removes a form comment through the form route', async () => {
    await sdk.comments.remove('comment-1', 'form');

    expect(requests[0].url).toBe(`${BASE_URL}/forms/comments/comment-1`);
  });
});

describe('API base URL resolution', () => {
  let requests: ICapturedRequest[];

  beforeEach(() => {
    requests = mockFetch();
  });

  it('appends the gateway slug to the default alias host', async () => {
    const sdk = new LedGoSDK({ token: 'test-token' });

    await sdk.kanbans.listDashboards();

    expect(requests[0].url).toBe('https://papi.ledgo.dev/api-v1-new/kanbans/dashboards');
  });

  it('does not duplicate the gateway slug when it is already present', async () => {
    const sdk = new LedGoSDK({
      baseUrl: 'https://papi.ledgo.dev/api-v1-new',
      token: 'test-token',
    });

    await sdk.kanbans.listDashboards();

    expect(requests[0].url).toBe('https://papi.ledgo.dev/api-v1-new/kanbans/dashboards');
  });

  it('keeps custom API base URLs unchanged', async () => {
    const sdk = new LedGoSDK({ baseUrl: BASE_URL, token: 'test-token' });

    await sdk.kanbans.listDashboards();

    expect(requests[0].url).toBe(`${BASE_URL}/kanbans/dashboards`);
  });

  it('uses the bare alias host for module-specific edge functions', () => {
    const sdk = new LedGoSDK({ token: 'test-token' });

    expect(sdk.forms.getFormSessionUrl()).toBe('https://papi.ledgo.dev/form-session');
  });
});
