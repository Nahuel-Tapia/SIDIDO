import { createRequire } from 'node:module';
import { getDocumentTypes, getOrigins } from './catalog';

const require = createRequire(import.meta.url);

export interface ExtractedDocumentMetadata {
  expediente?: string | null;
  dnis: string[];
  cuils: string[];
  people: string[];
  institutions: string[];
  detectedDate?: string | null;
}

export interface PdfAnalysisResult {
  rawText: string;
  pageCount: number;
  typeId?: number | null;
  typeCode?: string | null;
  typeName?: string | null;
  originId?: number | null;
  originCode?: string | null;
  number?: string | null;
  year?: number | null;
  expediente?: string | null;
  caratula?: string | null;
  extracto?: string | null;
  metadata: ExtractedDocumentMetadata;
}

function normalizeNoAccents(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * Decodifica cadenas literales en flujos PDF nativos (incluyendo escapes octales \xxx de WinAnsi)
 */
function decodePdfLiteralStrings(buffer: Buffer): string {
  const raw = buffer.toString('binary');
  const matches = raw.match(/\((?:\\.|[^\\()])*\)\s*Tj/g);
  if (!matches || matches.length === 0) return '';

  const lines: string[] = [];
  for (const m of matches) {
    const inner = m.replace(/\)\s*Tj$/, '').slice(1);
    const decoded = inner
      .replace(/\\([0-7]{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\\\/g, '\\');
    lines.push(decoded);
  }
  return lines.join('\n');
}

/**
 * Extrae el texto de un Buffer PDF combinando pdf-parse y decodificación de flujos nativos.
 */
export async function extractTextFromPdfBuffer(buffer: Buffer): Promise<{ text: string; pageCount: number }> {
  let text = '';
  let pageCount = 1;

  try {
    const pdfParse = require('pdf-parse/lib/pdf-parse.js');
    const parsed = await pdfParse(buffer);
    if (parsed.numpages) pageCount = parsed.numpages;
    if (parsed.text && parsed.text.trim().length > 10) {
      text = parsed.text.trim();
    }
  } catch {
    // Fallback a decodificador de cadenas literales PDF
  }

  const literalText = decodePdfLiteralStrings(buffer);
  if (literalText.length > text.length) {
    text = literalText;
  }

  return { text: text.trim(), pageCount };
}

/**
 * Formatea un DNI de 7 u 8 dígitos con puntos (ej: 28456789 -> 28.456.789)
 */
export function formatDni(digits: string): string {
  const clean = digits.replace(/\D/g, '');
  if (clean.length === 8) {
    return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5)}`;
  }
  if (clean.length === 7) {
    return `${clean.slice(0, 1)}.${clean.slice(1, 4)}.${clean.slice(4)}`;
  }
  return clean;
}

/**
 * Extrae DNIs, CUILs, Nombres de personas, Instituciones, Fechas, Tipo, Origen, Número y Año
 * a partir del texto del PDF y su nombre de archivo.
 */
export async function analyzePdfBufferAndFilename(
  buffer: Buffer,
  fileName: string
): Promise<PdfAnalysisResult> {
  const { text, pageCount } = await extractTextFromPdfBuffer(buffer);
  const types = await getDocumentTypes(true);
  const originsList = await getOrigins(true);

  const combinedText = `${fileName.replace(/\.pdf$/i, '')}\n${text}`;
  const normText = normalizeNoAccents(combinedText);

  // 1. Extraer CUILs / CUITs (ej: 20-28456789-3 o 27-31450992-8)
  const cuilSet = new Set<string>();
  const dniSet = new Set<string>();

  const cuilRegex = /\b(20|23|24|27|30|33)[-\s.]?(\d{7,8})[-\s.]?(\d)\b/g;
  for (const match of text.matchAll(cuilRegex)) {
    const prefix = match[1];
    const docDigits = match[2];
    const verifier = match[3];
    cuilSet.add(`${prefix}-${docDigits}-${verifier}`);
    if (['20', '23', '24', '27'].includes(prefix)) {
      dniSet.add(formatDni(docDigits));
    }
  }

  // 2. Extraer DNIs con contexto ("DNI", "D.N.I.", "Documento", "Matrícula") o formato XX.XXX.XXX
  const dniContextRegex = /(?:D\.?\s*N\.?\s*I\.?|Documento|Doc\.?|Matr[ií]cula|M\.?\s*I\.?)\s*(?:N[°ºo.]?)?\s*[:#-]?\s*(\d{1,2}\.?\d{3}\.?\d{3}|\d{7,8})\b/gi;
  for (const match of text.matchAll(dniContextRegex)) {
    const clean = match[1].replace(/\D/g, '');
    if (clean.length >= 7 && clean.length <= 8) {
      dniSet.add(formatDni(clean));
    }
  }

  // También detectar números con formato explícito de puntos XX.XXX.XXX (7-8 dígitos)
  const dottedDniRegex = /\b([1-9]\d?\.\d{3}\.\d{3})\b/g;
  for (const match of text.matchAll(dottedDniRegex)) {
    const clean = match[1].replace(/\D/g, '');
    if (clean.length >= 7 && clean.length <= 8) {
      dniSet.add(formatDni(clean));
    }
  }

  // 3. Extraer Nombres y Personas Asociadas
  const peopleSet = new Set<string>();

  // a) Títulos o cargos (incluso combinados como "Ministra Lic." o "Director Ing.") seguidos de Nombre y Apellido
  const titleToken = '(?:Prof\\.?|Profesor(?:a)?|Lic\\.?|Licenciad[oa]|Dr\\.?|Doctor(?:a)?|Mg\\.?|Ing\\.?|Sr\\.?|Sra\\.?|Srta\\.?|Docente|Agente|Alumno|Alumna|Estudiante|Director(?:a)?|Supervisor(?:a)?|Secretari[oa](?:\\s+de\\s+Educaci[oó]n)?|Ministr[oa]|Solicitante|Interesad[oa]|Causante)';
  const titledNameRegex = new RegExp(`\\b${titleToken}(?:\\s+${titleToken})*\\s*[:.]?\\s*([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\\s+(?:de\\s+los\\s+|de\\s+las\\s+|de\\s+|del\\s+)?[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3})`, 'g');

  const stopWords = new Set([
    'San Juan', 'Ministerio De', 'Educacion Primaria', 'Educacion Secundaria',
    'Educacion Superior', 'Tecnico Profesional', 'Gobierno De', 'Provincia De',
    'Consejo Federal', 'Junta De', 'Clasificacion Docente', 'Rama Media',
    'Nivel Secundario', 'Nivel Primario', 'Nivel Inicial', 'Ciclo Lectivo',
    'Calendario Escolar', 'Administrativa Financiera', 'Tribunal De',
    'Infraestructura Escolar', 'Escuela Agrotecnica', 'Escuela Normal',
    'Poder Ejecutivo', 'Boletin Oficial',
  ]);

  function addPersonIfValid(rawName: string) {
    const cleaned = rawName
      .replace(/\s+/g, ' ')
      .replace(/[,.;:()]+$/, '')
      .trim();
    if (cleaned.length < 6 || cleaned.length > 55) return;
    const words = cleaned.split(' ');
    if (words.length < 2 || words.length > 5) return;
    for (const sw of stopWords) {
      if (normalizeNoAccents(cleaned).includes(normalizeNoAccents(sw))) return;
    }
    peopleSet.add(cleaned);
  }

  for (const match of text.matchAll(titledNameRegex)) {
    addPersonIfValid(match[1]);
  }

  // b) Nombres en formato "APELLIDO, Nombre" o "Apellido, Nombre" seguidos o precedidos de DNI/CUIL
  const lastFirstDniRegex = /\b([A-ZÁÉÍÓÚÑ]{2,20}(?:\s+[A-ZÁÉÍÓÚÑ]{2,20})?,\s*[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)/g;
  for (const match of text.matchAll(lastFirstDniRegex)) {
    addPersonIfValid(match[1]);
  }

  // c) Frases de acción administrativa: "designar a ...", "a favor de ...", "presentada por ...", "otorgar a ..."
  const actionNameRegex = /\b(?:designar\s+a(?:\s+la|\s+el)?|a\s+favor\s+de(?:\s+la|\s+el)?|presentad[oa]\s+por(?:\s+la|\s+el)?|otorgar\s+a(?:\s+la|\s+el)?|reconocer\s+a(?:\s+la|\s+el)?|trasladar\s+a(?:\s+la|\s+el)?)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3})/g;
  for (const match of text.matchAll(actionNameRegex)) {
    addPersonIfValid(match[1]);
  }

  // 4. Extraer Instituciones / Escuelas mencionadas
  const institutionSet = new Set<string>();
  const instRegex = /\b((?:Escuela|Colegio|Instituto|Junta\s+de\s+Clasificaci[oó]n|Direcci[oó]n\s+de\s+[A-ZÁÉÍÓÚÑa-záéíóúñ]+)(?:\s+[A-ZÁÉÍÓÚÑ0-9°º"'-][A-ZÁÉÍÓÚÑa-záéíóúñ0-9°º"'-]*){1,6})/g;
  for (const match of text.matchAll(instRegex)) {
    const inst = match[1].replace(/\s+/g, ' ').trim();
    if (inst.length > 8 && inst.length < 75) {
      institutionSet.add(inst);
    }
  }

  // 5. Detectar Tipo de Documento
  let detectedType: { id: number; code: string; name: string } | null = null;
  for (const t of types) {
    const normName = normalizeNoAccents(t.name);
    const normCode = normalizeNoAccents(t.code);
    const firstWord = normName.split(' ')[0];
    if (
      (firstWord && normText.includes(firstWord)) ||
      new RegExp(`\\b${normCode}\\b`).test(normText)
    ) {
      detectedType = t;
      break;
    }
  }

  // 6. Detectar Origen / Repartición
  let detectedOrigin: { id: number; code: string; name: string } | null = null;
  for (const o of originsList) {
    const normName = normalizeNoAccents(o.name);
    const normCode = normalizeNoAccents(o.code);
    if (
      normText.includes(normName) ||
      new RegExp(`\\b${normCode}\\b`).test(normText)
    ) {
      detectedOrigin = o;
      break;
    }
  }

  // 7. Detectar Fecha, Número y Año
  let detectedDate: string | null = null;
  let detectedYear: number | null = null;
  let detectedNumber: string | null = null;

  const monthsEs = 'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre';
  const dateLongMatch = text.match(new RegExp(`\\b(\\d{1,2}\\s+de\\s+(?:${monthsEs})\\s+de(?:l\\s+a[ñn]o)?\\s+(19\\d{2}|20[0-3]\\d))`, 'i'));
  if (dateLongMatch) {
    detectedDate = dateLongMatch[1];
    detectedYear = Number(dateLongMatch[2]);
  } else {
    const dateSlashMatch = text.match(/\b(\d{1,2}[/-]\d{1,2}[/-](19\d{2}|20[0-3]\d))\b/);
    if (dateSlashMatch) {
      detectedDate = dateSlashMatch[1];
      detectedYear = Number(dateSlashMatch[2]);
    }
  }

  // 7. Extraer Número de Expediente Oficial (ej: 300-028554-2026 como en "VISTO: El Expediente Nº 300-028554-2026")
  let detectedExpediente: string | null = null;
  const expteContextRegex = /(?:(?:VISTO\s*:?\s*)?(?:El\s+)?(?:Expediente|Expte\.?|Actuaci[oó]n|EE|EX)\s*(?:N[°ºo.]?)?\s*[:#-]?\s*)([0-9]{2,4}-[0-9]{4,8}-(?:19\d{2}|20\d{2}))/i;
  const expteContextMatch = combinedText.match(expteContextRegex);
  if (expteContextMatch) {
    detectedExpediente = expteContextMatch[1].trim();
  } else {
    const directExpteRegex = /\b([0-9]{2,4}-[0-9]{4,8}-(?:19\d{2}|20[0-3]\d))\b/;
    const directMatch = combinedText.match(directExpteRegex);
    if (directMatch) {
      detectedExpediente = directMatch[1].trim();
    }
  }

  if (detectedExpediente) {
    const expteYear = detectedExpediente.split('-').pop();
    if (expteYear && /^(19\d{2}|20[0-3]\d)$/.test(expteYear) && !detectedYear) {
      detectedYear = Number(expteYear);
    }
  }

  // Buscar patrón explícito en texto: "RESOLUCIÓN N° 1420 / 2024"
  const numYearInText = text.match(/(?:N[°ºo.]?|Resoluci[oó]n|Decreto|Disposici[oó]n|Circular|Ley|Acta)\s*(?:N[°ºo.]?)?\s*[:#-]?\s*([0-9]{1,6}(?:-[A-Za-z0-9]+)?)\s*(?:\/|-|\s+del?\s+(?:a[ñn]o\s+)?)?(19\d{2}|20[0-3]\d)?/i);
  if (numYearInText) {
    detectedNumber = numYearInText[1].toUpperCase();
    if (numYearInText[2] && !detectedYear) {
      detectedYear = Number(numYearInText[2]);
    }
  }

  // Fallback de Año y Número desde el nombre del archivo o resto del texto
  if (!detectedYear) {
    const anyYearMatch = combinedText.match(/\b(19\d{2}|20[0-3]\d)\b/);
    if (anyYearMatch) {
      detectedYear = Number(anyYearMatch[1]);
    }
  }

  if (!detectedNumber) {
    const baseName = fileName.replace(/\.pdf$/i, '');
    const tokens = baseName.split(/[_\-\s]+/);
    for (const tok of tokens) {
      if (detectedYear && tok === String(detectedYear)) continue;
      if (detectedExpediente && detectedExpediente.includes(tok)) continue;
      if (/^\d{1,6}(-[A-Za-z0-9]+)?$/.test(tok)) {
        detectedNumber = tok.toUpperCase();
        break;
      }
    }
  }

  // 8. Extraer Carátula y Extracto sugeridos desde la estructura del texto
  let suggestedCaratula: string | null = null;
  let suggestedExtracto: string | null = null;

  const cleanLines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // Buscar si el PDF tiene marcador explícito "CARATULA / ASUNTO PRINCIPAL:" o "OBJETO:" o "REFERENCIA:"
  for (let i = 0; i < cleanLines.length; i++) {
    const line = cleanLines[i];
    if (/^(?:CAR[ÁA]TULA|ASUNTO|OBJETO|REFERENCIA|REF\.?)\s*(?:\/\s*ASUNTO\s*PRINCIPAL)?\s*[:.-]/i.test(line)) {
      const inlineVal = line.replace(/^(?:CAR[ÁA]TULA|ASUNTO|OBJETO|REFERENCIA|REF\.?)\s*(?:\/\s*ASUNTO\s*PRINCIPAL)?\s*[:.-]\s*/i, '').trim();
      if (inlineVal.length > 8) {
        suggestedCaratula = inlineVal;
      } else if (cleanLines[i + 1]) {
        suggestedCaratula = cleanLines[i + 1];
      }
      break;
    }
  }

  for (let i = 0; i < cleanLines.length; i++) {
    const line = cleanLines[i];
    if (/^(?:EXTRACTO|S[ÍI]NTESIS|RESUMEN)\s*(?:\/\s*S[ÍI]NTESIS)?\s*[:.-]/i.test(line)) {
      const inlineVal = line.replace(/^(?:EXTRACTO|S[ÍI]NTESIS|RESUMEN)\s*(?:\/\s*S[ÍI]NTESIS)?\s*[:.-]\s*/i, '').trim();
      if (inlineVal.length > 8) {
        suggestedExtracto = inlineVal;
      } else if (cleanLines[i + 1]) {
        suggestedExtracto = [cleanLines[i + 1], cleanLines[i + 2]].filter(Boolean).join(' ');
      }
      break;
    }
  }

  // Si no había etiquetas explícitas, inferir de cláusulas "VISTO ... RESUELVE / DECRETA"
  if (!suggestedCaratula && text.length > 20) {
    const resuelveMatch = text.match(/(?:RESUELVE|DECRETA|DISPONE)\s*:\s*(?:Art[ií]culo\s*1[°ºo.]?\s*[:.-]?\s*)?([^.\n]{15,180})/i);
    if (resuelveMatch) {
      suggestedCaratula = resuelveMatch[1].trim();
    } else {
      // Tomar la primera línea sustantiva que no sea el membrete institucional
      const candidate = cleanLines.find(
        (l) =>
          l.length > 20 &&
          l.length < 160 &&
          !/GOBIERNO DE SAN JUAN|MINISTERIO DE EDUCACI|SIDIDO|REPOSITORIO OFICIAL|REPARTICI[ÓO]N DE ORIGEN/i.test(l)
      );
      if (candidate) suggestedCaratula = candidate;
    }
  }

  if (!suggestedExtracto && text.length > 30) {
    const vistoMatch = text.match(/VISTO\s+([^.\n]{20,240}\.)/i);
    if (vistoMatch) {
      suggestedExtracto = `Visto ${vistoMatch[1].trim()}`;
    } else if (cleanLines.length > 2) {
      const bodyCandidate = cleanLines
        .filter(
          (l) =>
            l.length > 35 &&
            !/GOBIERNO DE SAN JUAN|MINISTERIO DE EDUCACI|SIDIDO|CARATULA|EXTRACTO|TEXTO DEL DOCUMENTO/i.test(l)
        )
        .slice(0, 2)
        .join(' ');
      if (bodyCandidate) {
        suggestedExtracto = bodyCandidate.slice(0, 260);
      }
    }
  }

  return {
    rawText: text,
    pageCount,
    typeId: detectedType?.id || null,
    typeCode: detectedType?.code || null,
    typeName: detectedType?.name || null,
    originId: detectedOrigin?.id || null,
    originCode: detectedOrigin?.code || null,
    number: detectedNumber,
    year: detectedYear,
    expediente: detectedExpediente,
    caratula: suggestedCaratula,
    extracto: suggestedExtracto,
    metadata: {
      expediente: detectedExpediente,
      dnis: Array.from(dniSet),
      cuils: Array.from(cuilSet),
      people: Array.from(peopleSet),
      institutions: Array.from(institutionSet),
      detectedDate,
    },
  };
}
