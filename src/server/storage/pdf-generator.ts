/**
 * Generador nativo de documentos PDF 1.4 oficiales (sin dependencias externas)
 * Produce un binario PDF válido y legible en cualquier visor con encabezado institucional,
 * metadatos, carátula, extracto y cuerpo del documento.
 */
export interface OfficialPdfParams {
  typeName: string;
  originName?: string | null;
  number?: string | null;
  year?: number | null;
  expediente?: string | null;
  caratula?: string | null;
  extracto?: string | null;
  contenido?: string | null;
}

function toWinAnsiHex(str: string): string {
  // Convierte cadena UTF-8 a representación literal escapada PDF (WinAnsi / ISO-8859-1)
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code === 40 || code === 41 || code === 92) {
      out += '\\' + str[i];
    } else if (code >= 32 && code <= 126) {
      out += str[i];
    } else if (code >= 160 && code <= 255) {
      out += '\\' + code.toString(8).padStart(3, '0');
    } else {
      out += ' ';
    }
  }
  return out;
}

function wrapLines(text: string, maxChars: number): string[] {
  const paragraphs = text.replace(/\r\n/g, '\n').split('\n');
  const lines: string[] = [];

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) {
      lines.push('');
      continue;
    }
    const words = trimmed.split(/\s+/);
    let current = '';
    for (const word of words) {
      if (!current) {
        current = word;
      } else if (current.length + 1 + word.length <= maxChars) {
        current += ' ' + word;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

export function generateOfficialPdfBuffer(params: OfficialPdfParams): Buffer {
  const docTitle = `${params.typeName.toUpperCase()} N° ${params.number || 'S/N'} / ${params.year || '----'}`;
  const originLine = params.originName || 'Ministerio de Educación — Provincia de San Juan';

  const streamOps: string[] = [];

  // Banda superior institucional en Rojo San Juan (#E03C31 -> 0.878, 0.235, 0.192)
  streamOps.push('0.878 0.235 0.192 rg');
  streamOps.push('50 760 512 4 re f');

  // Encabezado Institucional
  streamOps.push('BT');
  streamOps.push('/F2 11 Tf 0.114 0.145 0.176 rg');
  streamOps.push('50 740 Td (GOBIERNO DE SAN JUAN  |  MINISTERIO DE EDUCACION) Tj');
  streamOps.push('/F1 9 Tf 0.4 0.45 0.5 rg');
  streamOps.push(`0 -14 Td (${toWinAnsiHex('SIDIDO 2.0 - Repositorio Oficial de Documentos Digitalizados')}) Tj`);
  streamOps.push('ET');

  // Caja de Identificación del Expediente
  streamOps.push('0.96 0.97 0.98 rg');
  streamOps.push('50 672 512 42 re f');
  streamOps.push('0.88 0.90 0.92 RG 1 w');
  streamOps.push('50 672 512 42 re S');

  streamOps.push('BT');
  streamOps.push('/F2 13 Tf 0.114 0.145 0.176 rg');
  streamOps.push(`62 696 Td (${toWinAnsiHex(docTitle)}) Tj`);
  streamOps.push('/F1 9 Tf 0.35 0.4 0.45 rg');
  const subLine = params.expediente
    ? `Expediente N°: ${params.expediente}   |   Repartición: ${originLine}`
    : `Repartición de Origen: ${originLine}`;
  streamOps.push(`0 -15 Td (${toWinAnsiHex(subLine)}) Tj`);
  streamOps.push('ET');

  let y = 642;

  // Carátula
  if (params.caratula) {
    streamOps.push('BT');
    streamOps.push('/F2 10 Tf 0.878 0.235 0.192 rg');
    streamOps.push(`50 ${y} Td (CARATULA / ASUNTO PRINCIPAL:) Tj`);
    streamOps.push('ET');
    y -= 16;

    const caratulaLines = wrapLines(params.caratula, 78);
    for (const line of caratulaLines) {
      streamOps.push('BT');
      streamOps.push('/F2 11 Tf 0.114 0.145 0.176 rg');
      streamOps.push(`50 ${y} Td (${toWinAnsiHex(line)}) Tj`);
      streamOps.push('ET');
      y -= 15;
    }
    y -= 8;
  }

  // Extracto
  if (params.extracto) {
    streamOps.push('BT');
    streamOps.push('/F2 9.5 Tf 0.35 0.4 0.45 rg');
    streamOps.push(`50 ${y} Td (EXTRACTO / SINTESIS:) Tj`);
    streamOps.push('ET');
    y -= 14;

    const extractoLines = wrapLines(params.extracto, 85);
    for (const line of extractoLines) {
      streamOps.push('BT');
      streamOps.push('/F1 10 Tf 0.2 0.25 0.3 rg');
      streamOps.push(`50 ${y} Td (${toWinAnsiHex(line)}) Tj`);
      streamOps.push('ET');
      y -= 14;
    }
    y -= 10;
  }

  // Línea separadora
  streamOps.push('0.85 0.87 0.90 RG 0.8 w');
  streamOps.push(`50 ${y} m 562 ${y} l S`);
  y -= 20;

  // Cuerpo / Contenido
  streamOps.push('BT');
  streamOps.push('/F2 10 Tf 0.114 0.145 0.176 rg');
  streamOps.push(`50 ${y} Td (TEXTO DEL DOCUMENTO:) Tj`);
  streamOps.push('ET');
  y -= 18;

  const bodyText = params.contenido || 'Documento oficial registrado en el Sistema Integral de Digitalización Documental.';
  const bodyLines = wrapLines(bodyText, 86);

  for (const line of bodyLines) {
    if (y < 75) break;
    if (line === '') {
      y -= 10;
      continue;
    }
    streamOps.push('BT');
    streamOps.push('/F1 10 Tf 0.15 0.18 0.22 rg');
    streamOps.push(`50 ${y} Td (${toWinAnsiHex(line)}) Tj`);
    streamOps.push('ET');
    y -= 14;
  }

  // Pie de página oficial
  streamOps.push('0.88 0.90 0.92 RG 0.6 w');
  streamOps.push('50 52 m 562 52 l S');
  streamOps.push('BT');
  streamOps.push('/F1 8 Tf 0.45 0.5 0.55 rg');
  streamOps.push('50 38 Td (Documento almacenado en Base de Datos Oficial SIDIDO 2.0 - Ministerio de Educacion - Gobierno de San Juan) Tj');
  streamOps.push('ET');

  const contentStream = streamOps.join('\n');
  const contentBytes = Buffer.byteLength(contentStream, 'binary');

  const objects: string[] = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n',
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n',
    `6 0 obj\n<< /Length ${contentBytes} >>\nstream\n${contentStream}\nendstream\nendobj\n`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];

  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'binary'));
    pdf += obj;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'binary');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const off of offsets) {
    pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, 'binary');
}
