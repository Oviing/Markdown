import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  convertInchesToTwip,
} from "docx";
import { marked, type Token, type Tokens } from "marked";
import { splitFrontmatter } from "./frontmatter";

const HEADINGS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
] as const;

interface RunStyle {
  bold?: boolean;
  italics?: boolean;
  strike?: boolean;
  code?: boolean;
}

interface BlockCtx {
  listLevel: number;
  quote: boolean;
}

type Block = Paragraph | Table;

function decodeEntities(s: string): string {
  return s.replace(
    /&(?:amp|lt|gt|quot|#39);/g,
    (m) =>
      ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" })[m] ?? m
  );
}

function makeRun(text: string, style: RunStyle): TextRun {
  return new TextRun({
    text: decodeEntities(text),
    bold: style.bold,
    italics: style.italics,
    strike: style.strike,
    font: style.code ? "Courier New" : undefined,
    shading: style.code
      ? { type: ShadingType.CLEAR, fill: "F2F2F2" }
      : undefined,
  });
}

function inlineRuns(tokens: Token[], style: RunStyle = {}): (TextRun | ExternalHyperlink)[] {
  const out: (TextRun | ExternalHyperlink)[] = [];
  for (const tok of tokens) {
    switch (tok.type) {
      case "strong":
        out.push(...inlineRuns((tok as Tokens.Strong).tokens, { ...style, bold: true }));
        break;
      case "em":
        out.push(...inlineRuns((tok as Tokens.Em).tokens, { ...style, italics: true }));
        break;
      case "del":
        out.push(...inlineRuns((tok as Tokens.Del).tokens, { ...style, strike: true }));
        break;
      case "codespan":
        out.push(makeRun((tok as Tokens.Codespan).text, { ...style, code: true }));
        break;
      case "link": {
        const link = tok as Tokens.Link;
        const inner = inlineRuns(link.tokens, style).filter(
          (r): r is TextRun => r instanceof TextRun
        );
        out.push(
          new ExternalHyperlink({
            link: link.href,
            children: inner.length
              ? inner
              : [new TextRun({ text: decodeEntities(link.text), style: "Hyperlink" })],
          })
        );
        break;
      }
      case "image":
        out.push(makeRun((tok as Tokens.Image).text || (tok as Tokens.Image).href, { ...style, italics: true }));
        break;
      case "br":
        out.push(new TextRun({ break: 1 }));
        break;
      case "escape":
        out.push(makeRun((tok as Tokens.Escape).text, style));
        break;
      case "text": {
        const t = tok as Tokens.Text;
        if (t.tokens?.length) out.push(...inlineRuns(t.tokens, style));
        else out.push(makeRun(t.text, style));
        break;
      }
      default:
        if ("text" in tok && typeof tok.text === "string") out.push(makeRun(tok.text, style));
    }
  }
  return out;
}

function paragraphOpts(ctx: BlockCtx): Record<string, unknown> {
  const opts: Record<string, unknown> = { spacing: { after: 160 } };
  if (ctx.quote) {
    opts.indent = { left: convertInchesToTwip(0.35) };
    opts.border = {
      left: { style: BorderStyle.SINGLE, size: 18, color: "BFBFBF", space: 8 },
    };
  }
  return opts;
}

function codeBlock(tok: Tokens.Code, ctx: BlockCtx): Paragraph {
  const lines = tok.text.split("\n");
  const runs: TextRun[] = lines.map(
    (line, i) => new TextRun({ text: line, font: "Courier New", size: 18, break: i > 0 ? 1 : undefined })
  );
  return new Paragraph({
    ...paragraphOpts(ctx),
    children: runs,
    shading: { type: ShadingType.CLEAR, fill: "F5F5F5" },
    spacing: { after: 160, before: 80 },
  });
}

function listBlocks(list: Tokens.List, ctx: BlockCtx, out: Block[]): void {
  const level = Math.min(ctx.listLevel, 8);
  for (const item of list.items) {
    let firstParagraphDone = false;
    for (const child of item.tokens) {
      if (child.type === "list") {
        listBlocks(child as Tokens.List, { ...ctx, listLevel: ctx.listLevel + 1 }, out);
        continue;
      }
      const inline =
        child.type === "text"
          ? (child as Tokens.Text).tokens ?? [child]
          : child.type === "paragraph"
            ? (child as Tokens.Paragraph).tokens
            : null;
      if (inline) {
        out.push(
          new Paragraph({
            children: inlineRuns(inline),
            spacing: { after: 60 },
            ...(firstParagraphDone
              ? { indent: { left: convertInchesToTwip(0.5 * (level + 1)) } }
              : list.ordered
                ? { numbering: { reference: "ordered-list", level } }
                : { bullet: { level } }),
          })
        );
        firstParagraphDone = true;
      } else {
        walkBlocks([child], { ...ctx, listLevel: ctx.listLevel + 1 }, out);
      }
    }
  }
}

function tableBlock(tok: Tokens.Table): Table {
  const headerRow = new TableRow({
    tableHeader: true,
    children: tok.header.map(
      (cell) =>
        new TableCell({
          children: [
            new Paragraph({
              children: inlineRuns(cell.tokens, { bold: true }),
              alignment: AlignmentType.LEFT,
            }),
          ],
          shading: { type: ShadingType.CLEAR, fill: "EFEFEF" },
        })
    ),
  });
  const bodyRows = tok.rows.map(
    (row) =>
      new TableRow({
        children: row.map(
          (cell) =>
            new TableCell({
              children: [new Paragraph({ children: inlineRuns(cell.tokens) })],
            })
        ),
      })
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...bodyRows],
  });
}

function walkBlocks(tokens: Token[], ctx: BlockCtx, out: Block[]): void {
  for (const tok of tokens) {
    switch (tok.type) {
      case "heading": {
        const h = tok as Tokens.Heading;
        out.push(
          new Paragraph({
            heading: HEADINGS[Math.min(h.depth, 6) - 1],
            children: inlineRuns(h.tokens),
            spacing: { before: 240, after: 120 },
          })
        );
        break;
      }
      case "paragraph":
        out.push(
          new Paragraph({
            ...paragraphOpts(ctx),
            children: inlineRuns((tok as Tokens.Paragraph).tokens),
          })
        );
        break;
      case "blockquote":
        walkBlocks((tok as Tokens.Blockquote).tokens, { ...ctx, quote: true }, out);
        break;
      case "list":
        listBlocks(tok as Tokens.List, ctx, out);
        break;
      case "code":
        out.push(codeBlock(tok as Tokens.Code, ctx));
        break;
      case "table":
        out.push(tableBlock(tok as Tokens.Table));
        out.push(new Paragraph({ spacing: { after: 120 } }));
        break;
      case "hr":
        out.push(new Paragraph({ thematicBreak: true, spacing: { before: 160, after: 160 } }));
        break;
      case "html": {
        const text = (tok as Tokens.HTML).text.trim();
        if (text) out.push(new Paragraph({ ...paragraphOpts(ctx), children: [makeRun(text, {})] }));
        break;
      }
      case "space":
        break;
      case "text": {
        const t = tok as Tokens.Text;
        out.push(
          new Paragraph({
            ...paragraphOpts(ctx),
            children: inlineRuns(t.tokens?.length ? t.tokens : [t]),
          })
        );
        break;
      }
      default:
        break;
    }
  }
}

export async function markdownToDocx(md: string): Promise<Uint8Array> {
  // frontmatter is document metadata, not content — keep it out of the export
  const tokens = marked.lexer(splitFrontmatter(md).body);
  const children: Block[] = [];
  walkBlocks(tokens, { listLevel: 0, quote: false }, children);
  if (children.length === 0) children.push(new Paragraph({}));

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 22 }, paragraph: { spacing: { line: 300 } } },
      },
    },
    numbering: {
      config: [
        {
          reference: "ordered-list",
          levels: Array.from({ length: 9 }, (_, level) => ({
            level,
            format: LevelFormat.DECIMAL,
            text: `%${level + 1}.`,
            alignment: AlignmentType.START,
            style: {
              paragraph: {
                indent: {
                  left: convertInchesToTwip(0.5 * (level + 1)),
                  hanging: convertInchesToTwip(0.25),
                },
              },
            },
          })),
        },
      ],
    },
    sections: [{ children }],
  });

  const blob = await Packer.toBlob(doc);
  return new Uint8Array(await blob.arrayBuffer());
}
