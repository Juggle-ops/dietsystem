import * as docx from 'docx';

export interface HeaderFooterOptions {
  systemName: string; // e.g., 氢云餐饮 · 智能系统
  reportName: string; // e.g., 决策模拟报告
}

export function buildStandardStyles(): docx.IStylesOptions {
  return {
    paragraphStyles: [
      {
        id: 'TitleStyle',
        name: '报告标题',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { font: 'Microsoft YaHei', size: 56, bold: true, color: '1F2937' },
        paragraph: {
          spacing: { after: 300 },
          alignment: docx.AlignmentType.CENTER,
        },
      },
      {
        id: 'SubTitleStyle',
        name: '副标题',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { font: 'Microsoft YaHei', size: 24, color: '374151' },
        paragraph: {
          spacing: { after: 200 },
          alignment: docx.AlignmentType.CENTER,
        },
      },
      {
        id: 'Heading1',
        name: '一级标题',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { font: 'Microsoft YaHei', size: 28, bold: true, color: '111827' },
        paragraph: { spacing: { before: 240, after: 160 } },
      },
      {
        id: 'Heading2',
        name: '二级标题',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { font: 'Microsoft YaHei', size: 24, bold: true, color: '1F2937' },
        paragraph: { spacing: { before: 200, after: 120 } },
      },
      {
        id: 'BodyText',
        name: '正文',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { font: 'Microsoft YaHei', size: 22, color: '374151' },
        paragraph: { spacing: { after: 80, line: 360 } },
      },
      {
        id: 'SmallNote',
        name: '注释',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { font: 'Microsoft YaHei', size: 18, color: '6B7280' },
        paragraph: { spacing: { after: 60 } },
      },
      {
        id: 'TableHeader',
        name: '表头',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: false,
        run: { font: 'Microsoft YaHei', size: 20, bold: true, color: '111827' },
        paragraph: { spacing: { after: 40 } },
      },
      {
        id: 'TableCell',
        name: '表格正文',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: false,
        run: { font: 'Microsoft YaHei', size: 20, color: '111827' },
      },
    ],
  };
}

export function buildHeaderFooter(opts: HeaderFooterOptions) {
  const header = new docx.Header({
    children: [
      new docx.Paragraph({
        children: [
          new docx.TextRun({
            text: opts.systemName,
            bold: true,
            color: '374151',
          }),
          new docx.TextRun({ text: '  |  ' }),
          new docx.TextRun({ text: opts.reportName, color: '6B7280' }),
        ],
        alignment: docx.AlignmentType.LEFT,
      }),
    ],
  });

  const footer = new docx.Footer({
    children: [
      new docx.Paragraph({
        children: [
          new docx.TextRun({ text: '第 ' }),
          new docx.TextRun({ children: [docx.PageNumber.CURRENT] }),
          new docx.TextRun({ text: ' 页 / 共 ' }),
          new docx.TextRun({ children: [docx.PageNumber.TOTAL_PAGES] }),
          new docx.TextRun({ text: ' 页' }),
        ],
        alignment: docx.AlignmentType.CENTER,
      }),
    ],
  });

  return { header, footer };
}

export function buildCover(
  title: string,
  subtitle?: string,
  highlights?: string[],
) {
  return [
    new docx.Paragraph({
      style: 'TitleStyle',
      children: [new docx.TextRun(title)],
    }),
    subtitle
      ? new docx.Paragraph({
          style: 'SubTitleStyle',
          children: [new docx.TextRun(subtitle)],
        })
      : new docx.Paragraph(''),
    ...(highlights && highlights.length
      ? [
          new docx.Paragraph({
            children: [
              new docx.TextRun({ text: '报告要点', bold: true, size: 22 }),
            ],
            spacing: { before: 300, after: 100 },
          }),
          ...highlights.map(
            (h) =>
              new docx.Paragraph({
                children: [
                  new docx.TextRun({
                    text: `• ${h}`,
                    size: 20,
                    color: '374151',
                  }),
                ],
                spacing: { after: 60 },
              }),
          ),
        ]
      : []),
    new docx.Paragraph({
      children: [
        new docx.TextRun({
          text: `生成时间：${new Date().toLocaleString('zh-CN')}`,
          color: '6B7280',
        }),
      ],
      spacing: { before: 400 },
      alignment: docx.AlignmentType.CENTER,
    }),
    new docx.Paragraph(''),
  ];
}

export function buildTOC() {
  return new docx.TableOfContents('目录', {
    hyperlink: true,
    headingStyleRange: '1-5',
  });
}

export function shadedHeaderCell(text: string): docx.TableCell {
  return new docx.TableCell({
    children: [
      new docx.Paragraph({
        style: 'TableHeader',
        children: [new docx.TextRun(text)],
      }),
    ],
    shading: { type: docx.ShadingType.CLEAR, color: 'FFFFFF', fill: 'EEF2FF' },
  });
}

export function bodyCell(text: string): docx.TableCell {
  return new docx.TableCell({
    children: [
      new docx.Paragraph({
        style: 'TableCell',
        children: [new docx.TextRun(text)],
      }),
    ],
  });
}

export interface BarChartSeriesItem {
  label: string;
  value: number;
}

export interface BarChartOptions {
  unit?: string;
  maxValue?: number;
  barLength?: number;
  decimals?: number;
  valueFormatter?: (value: number) => string;
}

export function buildBarChartTable(
  items: ReadonlyArray<BarChartSeriesItem>,
  options: BarChartOptions = {},
): docx.Table {
  const sanitized = (items ?? [])
    .map((item) => ({
      label: item.label ?? '--',
      value:
        typeof item.value === 'number' && Number.isFinite(item.value)
          ? item.value
          : 0,
    }))
    .filter((item) => item.label && item.label.trim().length > 0);

  const columnWidths = [3500, 1800, 5200];

  if (sanitized.length === 0) {
    return new docx.Table({
      width: { size: 100, type: docx.WidthType.PERCENTAGE },
      columnWidths,
      rows: [
        new docx.TableRow({
          children: [
            new docx.TableCell({
              columnSpan: 3,
              children: [
                new docx.Paragraph({
                  style: 'SmallNote',
                  children: [new docx.TextRun('暂无图表数据')],
                }),
              ],
            }),
          ],
        }),
      ],
    });
  }

  const maxValueCandidate =
    options.maxValue ??
    sanitized.reduce((max, item) => Math.max(max, item.value), 0);
  const maxValue = maxValueCandidate > 0 ? maxValueCandidate : 1;
  const barLength = Math.max(options.barLength ?? 24, 8);
  const decimals =
    typeof options.decimals === 'number' && options.decimals >= 0
      ? options.decimals
      : options.unit === '%' || options.unit === undefined
        ? 1
        : 0;
  const unit = options.unit ?? '';

  const defaultFormatter = (value: number) => {
    const rounded = value.toFixed(decimals);
    if (!unit) {
      return rounded;
    }
    if (unit === '¥') {
      return `¥${Number.parseFloat(rounded).toLocaleString('zh-CN')}`;
    }
    if (unit === '%') {
      return `${rounded}%`;
    }
    return `${rounded}${unit}`;
  };

  const formatValue = options.valueFormatter ?? defaultFormatter;

  const headerRow = new docx.TableRow({
    children: ['维度', '数值', '条形图'].map(
      (title, index) =>
        new docx.TableCell({
          width: { size: columnWidths[index], type: docx.WidthType.DXA },
          shading: {
            type: docx.ShadingType.CLEAR,
            color: 'FFFFFF',
            fill: 'EEF2FF',
          },
          children: [
            new docx.Paragraph({
              style: 'TableHeader',
              children: [new docx.TextRun(title)],
            }),
          ],
        }),
    ),
  });

  const rows = sanitized.map((item) => {
    const ratio = Math.min(Math.max(item.value / maxValue, 0), 1);
    const filledBars =
      ratio === 0 ? 0 : Math.max(1, Math.round(ratio * barLength));
    const emptyBars = Math.max(barLength - filledBars, 0);
    const barText = `[${'#'.repeat(filledBars)}${' '.repeat(emptyBars)}]`;

    return new docx.TableRow({
      children: [
        new docx.TableCell({
          width: { size: columnWidths[0], type: docx.WidthType.DXA },
          children: [
            new docx.Paragraph({
              style: 'TableCell',
              children: [new docx.TextRun(item.label)],
            }),
          ],
        }),
        new docx.TableCell({
          width: { size: columnWidths[1], type: docx.WidthType.DXA },
          children: [
            new docx.Paragraph({
              style: 'TableCell',
              children: [new docx.TextRun(formatValue(item.value))],
            }),
          ],
        }),
        new docx.TableCell({
          width: { size: columnWidths[2], type: docx.WidthType.DXA },
          children: [
            new docx.Paragraph({
              style: 'TableCell',
              children: [
                new docx.TextRun({
                  text: barText,
                  font: 'Consolas',
                  color: '2563EB',
                }),
              ],
            }),
          ],
        }),
      ],
    });
  });

  return new docx.Table({
    width: { size: 100, type: docx.WidthType.PERCENTAGE },
    columnWidths,
    rows: [headerRow, ...rows],
  });
}
