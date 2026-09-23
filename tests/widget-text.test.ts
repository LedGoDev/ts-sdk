import {
  EmbedResourceType,
  IWidgetLike,
  ListStyleType,
  TextAlignmentType,
  WidgetTextFormat,
  WidgetType,
  widgetToAIText,
  widgetToMarkdown,
  widgetToText,
  widgetsToAIText,
  widgetsToContent,
} from '../src';

describe('widgetToMarkdown', () => {
  it('formats a title widget with the heading level as markdown', () => {
    const widget: IWidgetLike = {
      id: '4f38f3e8-bb28-4888-93a6-5724f737796d',
      widgetType: WidgetType.TITLE,
      config: { content: '10. Preguntas abiertas', level: 3 },
    };

    const result = widgetToMarkdown(widget);

    expect(result).toBe('### 10. Preguntas abiertas');
  });

  it('clamps the title level between 1 and 5', () => {
    const high = widgetToMarkdown({ id: 'a', widgetType: WidgetType.TITLE, config: { content: 'X', level: 9 } });
    const low = widgetToMarkdown({ id: 'b', widgetType: WidgetType.TITLE, config: { content: 'X', level: 0 } });

    expect(high).toBe('##### X');
    expect(low).toBe('# X');
  });

  it('formats a metrics widget with prefix, value, suffix, unit and trend', () => {
    const widget: IWidgetLike = {
      id: 'metrics-1',
      widgetType: WidgetType.METRICS,
      config: { title: 'Revenue', value: 50000, unit: 'USD', trend: 'up', prefix: '$', suffix: '' },
    };

    const result = widgetToMarkdown(widget);

    expect(result).toBe('**Revenue**: $50000 USD (up)');
  });

  it('formats a toggle widget as a checked or unchecked item', () => {
    const on: IWidgetLike = {
      id: 'toggle-1',
      widgetType: WidgetType.TOGGLE,
      config: { label: 'Dark Mode', currentValue: true, defaultValue: false },
    };
    const off: IWidgetLike = {
      id: 'toggle-2',
      widgetType: WidgetType.TOGGLE,
      config: { label: 'Dark Mode', currentValue: false, defaultValue: true },
    };

    expect(widgetToMarkdown(on)).toBe('- [x] Dark Mode');
    expect(widgetToMarkdown(off)).toBe('- [ ] Dark Mode');
  });

  it('formats a button widget as a markdown link', () => {
    const widget: IWidgetLike = {
      id: 'button-1',
      widgetType: WidgetType.BUTTON,
      config: { label: 'Learn More', action: 'https://example.com' },
    };

    const result = widgetToMarkdown(widget);

    expect(result).toBe('[Learn More](https://example.com)');
  });

  it('formats an image widget as a markdown image', () => {
    const widget: IWidgetLike = {
      id: 'image-1',
      widgetType: WidgetType.IMAGE,
      config: { src: 'https://example.com/image.png', alt: 'Example' },
    };

    const result = widgetToMarkdown(widget);

    expect(result).toBe('![Example](https://example.com/image.png)');
  });

  it('returns the raw content of a textarea widget', () => {
    const widget: IWidgetLike = {
      id: 'text-1',
      widgetType: WidgetType.TEXTAREA,
      config: { content: 'Hello\nworld' },
    };

    const result = widgetToMarkdown(widget);

    expect(result).toBe('Hello\nworld');
  });

  it('formats a code widget as a fenced block with its language', () => {
    const widget: IWidgetLike = {
      id: 'code-1',
      widgetType: WidgetType.CODE,
      config: { code: 'const x = 1;', language: 'javascript' },
    };

    const result = widgetToMarkdown(widget);

    expect(result).toBe('```javascript\nconst x = 1;\n```');
  });

  it('formats a chart widget as a markdown table', () => {
    const widget: IWidgetLike = {
      id: 'chart-1',
      widgetType: WidgetType.CHART,
      config: { type: 'bar', title: 'Sales', labels: 'Q1,Q2,Q3', data: '10,20,30' },
    };

    const result = widgetToMarkdown(widget);

    expect(result).toBe([
      '**Sales** (bar)',
      '',
      '| Label | Value |',
      '| --- | --- |',
      '| Q1 | 10 |',
      '| Q2 | 20 |',
      '| Q3 | 30 |',
    ].join('\n'));
  });

  it('returns only the header when a chart has no data', () => {
    const widget: IWidgetLike = {
      id: 'chart-2',
      widgetType: WidgetType.CHART,
      config: { type: 'pie', title: 'Empty' },
    };

    const result = widgetToMarkdown(widget);

    expect(result).toBe('**Empty** (pie)');
  });

  it('formats progress bar widgets with their percentage', () => {
    const single: IWidgetLike = {
      id: 'pb-1',
      widgetType: WidgetType.PROGRESS_BAR,
      config: { label: 'Completion', value: 75 },
    };
    const list: IWidgetLike = {
      id: 'pbl-1',
      widgetType: WidgetType.PROGRESS_BAR_LIST,
      config: {
        items: [
          { label: 'Task A', value: 80, color: '#00d992' },
          { label: 'Task B', value: 45, color: '#f59e0b' },
        ],
      },
    };

    expect(widgetToMarkdown(single)).toBe('**Completion**: 75%');
    expect(widgetToMarkdown(list)).toBe('- **Task A**: 80%\n- **Task B**: 45%');
  });

  it('formats youtube and link widgets as markdown links', () => {
    const youtube: IWidgetLike = {
      id: 'yt-1',
      widgetType: WidgetType.YOUTUBE,
      config: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
    };
    const link: IWidgetLike = {
      id: 'link-1',
      widgetType: WidgetType.LINK,
      config: { label: 'Visit Site', url: 'https://example.com' },
    };

    expect(widgetToMarkdown(youtube)).toBe('[Watch on YouTube](https://www.youtube.com/watch?v=dQw4w9WgXcQ)');
    expect(widgetToMarkdown(link)).toBe('[Visit Site](https://example.com)');
  });

  it('formats a table widget as a markdown table and escapes pipes', () => {
    const widget: IWidgetLike = {
      id: 'table-1',
      widgetType: WidgetType.TABLE,
      config: { columns: ['Col A', 'Col B'], rows: [['A|1', 'B'], ['C']] },
    };

    const result = widgetToMarkdown(widget);

    expect(result).toBe([
      '| Col A | Col B |',
      '| --- | --- |',
      '| A\\|1 | B |',
      '| C |  |',
    ].join('\n'));
  });

  it('returns an empty string for a table without columns', () => {
    const widget: IWidgetLike = {
      id: 'table-2',
      widgetType: WidgetType.TABLE,
      config: { columns: [], rows: [] },
    };

    const result = widgetToMarkdown(widget);

    expect(result).toBe('');
  });

  it('formats list widgets according to their style', () => {
    const bullets: IWidgetLike = {
      id: 'list-1',
      widgetType: WidgetType.LIST,
      config: { items: [{ text: 'One', checked: false }, { text: 'Two', checked: false }], style: ListStyleType.BULLETS },
    };
    const numbered: IWidgetLike = {
      id: 'list-2',
      widgetType: WidgetType.LIST,
      config: { items: [{ text: 'One', checked: false }, { text: 'Two', checked: false }], style: ListStyleType.NUMBERED },
    };
    const checklist: IWidgetLike = {
      id: 'list-3',
      widgetType: WidgetType.LIST,
      config: {
        items: [{ text: 'One', checked: true }, { text: 'Two', checked: false }],
        style: ListStyleType.CHECKLIST,
      },
    };

    expect(widgetToMarkdown(bullets)).toBe('- One\n- Two');
    expect(widgetToMarkdown(numbered)).toBe('1. One\n2. Two');
    expect(widgetToMarkdown(checklist)).toBe('- [x] One\n- [ ] Two');
  });

  it('formats a divider widget as a horizontal rule', () => {
    const widget: IWidgetLike = {
      id: 'div-1',
      widgetType: WidgetType.DIVIDER,
      config: { color: '#3d3a39' },
    };

    const result = widgetToMarkdown(widget);

    expect(result).toBe('---');
  });

  it('formats an embed widget with its resource type and id', () => {
    const widget: IWidgetLike = {
      id: 'embed-1',
      widgetType: WidgetType.EMBED,
      config: {
        resourceType: EmbedResourceType.DATABASE,
        resourceId: '00000000-0000-0000-0000-000000000000',
        showTitle: true,
      },
    };

    const result = widgetToMarkdown(widget);

    expect(result).toBe('> Embed: database `00000000-0000-0000-0000-000000000000`');
  });

  it('falls back to pretty JSON for unknown widget types', () => {
    const widget: IWidgetLike = {
      id: 'future-1',
      widgetType: 'unknown' as WidgetType,
      config: { futureField: 'value' },
    };

    const result = widgetToMarkdown(widget);

    expect(result).toBe('{\n  "futureField": "value"\n}');
  });
});

describe('widgetToText', () => {
  it('renders plain text without markdown syntax', () => {
    const title: IWidgetLike = {
      id: 'title-1',
      widgetType: WidgetType.TITLE,
      config: { content: 'Welcome', level: 2 },
    };
    const metrics: IWidgetLike = {
      id: 'metrics-1',
      widgetType: WidgetType.METRICS,
      config: { title: 'Revenue', value: 50000, unit: 'USD', trend: 'up', prefix: '$', suffix: '' },
    };
    const toggle: IWidgetLike = {
      id: 'toggle-1',
      widgetType: WidgetType.TOGGLE,
      config: { label: 'Dark Mode', currentValue: true, onLabel: 'Enabled', offLabel: 'Disabled' },
    };
    const button: IWidgetLike = {
      id: 'button-1',
      widgetType: WidgetType.BUTTON,
      config: { label: 'Learn More', action: 'https://example.com' },
    };
    const link: IWidgetLike = {
      id: 'link-1',
      widgetType: WidgetType.LINK,
      config: { label: 'Visit Site', url: 'https://example.com' },
    };

    expect(widgetToText(title)).toBe('Welcome');
    expect(widgetToText(metrics)).toBe('Revenue: $50000 USD (up)');
    expect(widgetToText(toggle)).toBe('Dark Mode: Enabled');
    expect(widgetToText(button)).toBe('Learn More: https://example.com');
    expect(widgetToText(link)).toBe('Visit Site: https://example.com');
  });

  it('renders code and image widgets with explicit labels', () => {
    const code: IWidgetLike = {
      id: 'code-1',
      widgetType: WidgetType.CODE,
      config: { code: 'console.log(1)', language: 'javascript' },
    };
    const image: IWidgetLike = {
      id: 'image-1',
      widgetType: WidgetType.IMAGE,
      config: { src: 'https://example.com/a.png', alt: 'Logo' },
    };

    expect(widgetToText(code)).toBe('Code (javascript):\nconsole.log(1)');
    expect(widgetToText(image)).toBe('Image: Logo (https://example.com/a.png)');
  });

  it('renders chart data as label/value lines', () => {
    const widget: IWidgetLike = {
      id: 'chart-1',
      widgetType: WidgetType.CHART,
      config: { type: 'bar', title: 'Sales', labels: 'Q1,Q2', data: '10,20' },
    };

    const result = widgetToText(widget);

    expect(result).toBe('Sales (bar)\nQ1: 10\nQ2: 20');
  });

  it('renders tables and lists without markdown markers', () => {
    const table: IWidgetLike = {
      id: 'table-1',
      widgetType: WidgetType.TABLE,
      config: { columns: ['Col A', 'Col B'], rows: [['A', 'B']] },
    };
    const checklist: IWidgetLike = {
      id: 'list-1',
      widgetType: WidgetType.LIST,
      config: {
        items: [{ text: 'One', checked: true }, { text: 'Two', checked: false }],
        style: ListStyleType.CHECKLIST,
      },
    };

    expect(widgetToText(table)).toBe('Columns: Col A | Col B\nA | B');
    expect(widgetToText(checklist)).toBe('[x] One\n[ ] Two');
  });
});

describe('widgetToAIText and widgetsToAIText', () => {
  it('formats a widget as id plus its markdown inside a md fence', () => {
    const widget: IWidgetLike = {
      id: '4f38f3e8-bb28-4888-93a6-5724f737796d',
      widgetType: WidgetType.TITLE,
      config: { content: '10. Preguntas abiertas', level: 3 },
    };

    const result = widgetToAIText(widget);

    expect(result).toBe('4f38f3e8-bb28-4888-93a6-5724f737796d:\n```md\n### 10. Preguntas abiertas\n```');
  });

  it('grows the fence when the markdown payload contains backticks', () => {
    const widget: IWidgetLike = {
      id: 'code-1',
      widgetType: WidgetType.CODE,
      config: { code: 'const x = `tpl`;', language: 'javascript' },
    };

    const result = widgetToAIText(widget);

    expect(result).toBe('code-1:\n````md\n```javascript\nconst x = `tpl`;\n```\n````');
  });

  it('joins multiple widgets with a blank line', () => {
    const widgets: IWidgetLike[] = [
      { id: 'a', widgetType: WidgetType.TITLE, config: { content: 'Hello', level: 1 } },
      { id: 'b', widgetType: WidgetType.DIVIDER, config: { color: '#000' } },
    ];

    const result = widgetsToAIText(widgets);

    expect(result).toBe('a:\n```md\n# Hello\n```\n\nb:\n```md\n---\n```');
  });

  it('accepts document block shapes (id, widgetType, config)', () => {
    const block = {
      id: 'block-1',
      documentId: 'doc-1',
      widgetType: WidgetType.TEXTAREA,
      config: { content: 'Some text content' },
      position: { x: 0, y: 0, w: 12, h: 3 },
    };

    const result = widgetToAIText(block);

    expect(result).toBe('block-1:\n```md\nSome text content\n```');
  });
});

describe('alignment and style edge cases', () => {
  it('ignores alignment configs when rendering text', () => {
    const widget: IWidgetLike = {
      id: 'title-1',
      widgetType: WidgetType.TITLE,
      config: { content: 'Centered Title', level: 2, alignment: TextAlignmentType.CENTER },
    };

    expect(widgetToMarkdown(widget)).toBe('## Centered Title');
    expect(widgetToText(widget)).toBe('Centered Title');
  });

  it('handles empty configs without throwing', () => {
    const empty: IWidgetLike = { id: 'e', widgetType: WidgetType.TEXTAREA, config: {} };

    expect(widgetToMarkdown(empty)).toBe('');
    expect(widgetToText(empty)).toBe('');
  });
});

describe('widgetsToContent', () => {
  it('orders widgets in reading order (top to bottom, left to right)', () => {
    const widgets = [
      { id: 'b', widgetType: WidgetType.TITLE, config: { content: 'B', level: 1 }, position: { x: 0, y: 1, w: 6, h: 1 } },
      { id: 'a', widgetType: WidgetType.TITLE, config: { content: 'A', level: 1 }, position: { x: 6, y: 0, w: 6, h: 1 } },
      { id: 'c', widgetType: WidgetType.TITLE, config: { content: 'C', level: 1 }, position: { x: 0, y: 0, w: 6, h: 1 } },
    ];

    const result = widgetsToContent(widgets);

    expect(result).toBe('c:\n```md\n# C\n```\n\na:\n```md\n# A\n```\n\nb:\n```md\n# B\n```');
  });

  it('keeps the given order when positions are missing', () => {
    const widgets = [
      { id: 'b', widgetType: WidgetType.TITLE, config: { content: 'B', level: 1 } },
      { id: 'a', widgetType: WidgetType.TITLE, config: { content: 'A', level: 1 } },
    ];

    const result = widgetsToContent(widgets);

    expect(result).toBe('b:\n```md\n# B\n```\n\na:\n```md\n# A\n```');
  });

  it('supports the markdown and plain formats', () => {
    const widgets = [
      { id: 'a', widgetType: WidgetType.TITLE, config: { content: 'Hello', level: 2 } },
      { id: 'b', widgetType: WidgetType.DIVIDER, config: { color: '#000' } },
    ];

    expect(widgetsToContent(widgets, { format: WidgetTextFormat.MARKDOWN })).toBe('## Hello\n\n---');
    expect(widgetsToContent(widgets, { format: WidgetTextFormat.PLAIN })).toBe('Hello\n\n---');
  });
});