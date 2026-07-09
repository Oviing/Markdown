import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
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
import { sniffImage, fitTo, type ImageMeta } from "./image-meta";

export interface DocxImage {
  data: Uint8Array;
  meta: ImageMeta;
}

export interface DocxOptions {
  // returns the raw bytes for a (non-data:) image href, or null when unavailable
  resolveImage?: (href: string) => Promise<Uint8Array | null>;
}

type ImageMap = Map<string, DocxImage>;

const NO_IMAGES: ImageMap = new Map();

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
  images: ImageMap;
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

type InlineChild = TextRun | ExternalHyperlink | ImageRun;

function imageRun(img: DocxImage): ImageRun {
  return new ImageRun({
    type: img.meta.type,
    data: img.data,
    transformation: fitTo(img.meta),
  });
}

function inlineRuns(tokens: Token[], style: RunStyle = {}, images: ImageMap = NO_IMAGES): InlineChild[] {
  const out: InlineChild[] = [];
  for (const tok of tokens) {
    switch (tok.type) {
      case "strong":
        out.push(...inlineRuns((tok as Tokens.Strong).tokens, { ...style, bold: true }, images));
        break;
      case "em":
        out.push(...inlineRuns((tok as Tokens.Em).tokens, { ...style, italics: true }, images));
        break;
      case "del":
        out.push(...inlineRuns((tok as Tokens.Del).tokens, { ...style, strike: true }, images));
        break;
      case "codespan":
        out.push(makeRun((tok as Tokens.Codespan).text, { ...style, code: true }));
        break;
      // math renders via KaTeX only in the preview — export the LaTeX source as code
      case "inlineMath":
        out.push(makeRun((tok as Tokens.Generic).text, { ...style, code: true }));
        break;
      case "link": {
        const link = tok as Tokens.Link;
        const inner = inlineRuns(link.tokens, style, images).filter(
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
      case "image": {
        const img = tok as Tokens.Image;
        const resolved = images.get(img.href);
        if (resolved) out.push(imageRun(resolved));
        else out.push(makeRun(img.text || img.href, { ...style, italics: true }));
        break;
      }
      case "br":
        out.push(new TextRun({ break: 1 }));
        break;
      case "escape":
        out.push(makeRun((tok as Tokens.Escape).text, style));
        break;
      case "text": {
        const t = tok as Tokens.Text;
        if (t.tokens?.length) out.push(...inlineRuns(t.tokens, style, images));
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
            children: inlineRuns(inline, {}, ctx.images),
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

function tableBlock(tok: Tokens.Table, images: ImageMap): Table {
  const headerRow = new TableRow({
    tableHeader: true,
    children: tok.header.map(
      (cell) =>
        new TableCell({
          children: [
            new Paragraph({
              children: inlineRuns(cell.tokens, { bold: true }, images),
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
              children: [new Paragraph({ children: inlineRuns(cell.tokens, {}, images) })],
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
            children: inlineRuns(h.tokens, {}, ctx.images),
            spacing: { before: 240, after: 120 },
          })
        );
        break;
      }
      case "paragraph":
        out.push(
          new Paragraph({
            ...paragraphOpts(ctx),
            children: inlineRuns((tok as Tokens.Paragraph).tokens, {}, ctx.images),
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
      // $$…$$ blocks render via KaTeX only in the preview — export the LaTeX source
      case "blockMath":
        out.push(codeBlock(tok as Tokens.Code, ctx));
        break;
      case "table":
        out.push(tableBlock(tok as Tokens.Table, ctx.images));
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
            children: inlineRuns(t.tokens?.length ? t.tokens : [t], {}, ctx.images),
          })
        );
        break;
      }
      default:
        break;
    }
  }
}

function collectImageHrefs(tokens: Token[], out: Set<string>): void {
  for (const tok of tokens) {
    if (tok.type === "image") out.add((tok as Tokens.Image).href);
    if ("tokens" in tok && Array.isArray(tok.tokens)) collectImageHrefs(tok.tokens, out);
    if (tok.type === "list") {
      for (const item of (tok as Tokens.List).items) collectImageHrefs(item.tokens, out);
    }
    if (tok.type === "table") {
      const table = tok as Tokens.Table;
      for (const cell of [...table.header, ...table.rows.flat()]) {
        collectImageHrefs(cell.tokens, out);
      }
    }
  }
}

function decodeDataUrl(href: string): Uint8Array | null {
  const m = /^data:image\/[\w.+-]+((?:;[\w-]+=[\w-]+)*)(;base64)?,(.*)$/s.exec(href);
  if (!m) return null;
  try {
    if (m[2]) {
      const bin = atob(m[3]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes;
    }
    return new TextEncoder().encode(decodeURIComponent(m[3]));
  } catch {
    return null;
  }
}

async function resolveImages(tokens: Token[], opts: DocxOptions): Promise<ImageMap> {
  const hrefs = new Set<string>();
  collectImageHrefs(tokens, hrefs);
  const images: ImageMap = new Map();
  await Promise.all(
    [...hrefs].map(async (href) => {
      let data: Uint8Array | null = null;
      if (href.startsWith("data:")) data = decodeDataUrl(href);
      else if (opts.resolveImage) data = await opts.resolveImage(href).catch(() => null);
      if (!data) return;
      // never hand Packer bytes we can't identify — fall back to alt text
      const meta = sniffImage(data);
      if (meta) images.set(href, { data, meta });
    })
  );
  return images;
}

export async function markdownToDocx(md: string, opts: DocxOptions = {}): Promise<Uint8Array> {
  // frontmatter is document metadata, not content — keep it out of the export
  const tokens = marked.lexer(splitFrontmatter(md).body);
  const images = await resolveImages(tokens, opts);
  const children: Block[] = [];
  walkBlocks(tokens, { listLevel: 0, quote: false, images }, children);
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
