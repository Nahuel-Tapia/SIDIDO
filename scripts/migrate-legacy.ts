import fs from 'node:fs';
import path from 'node:path';
import { db } from '../src/server/db/client';
import { documentTypes, origins, documents, importRuns, importErrors, users } from '../src/server/db/schema';
import { storage } from '../src/server/storage';
import { checkDuplicate } from '../src/server/services/documents';
import { eq } from 'drizzle-orm';
import { randomUUID, createHash } from 'node:crypto';

async function runMigration() {
  const args = process.argv.slice(2);
  const csvIndex = args.indexOf('--csv');
  const pdfsIndex = args.indexOf('--pdfs');
  const isDryRun = args.includes('--dry-run');

  if (csvIndex === -1 || !args[csvIndex + 1]) {
    console.error('Uso: npm run migrate:legacy -- --csv <ruta_al_csv> [--pdfs <carpeta_pdfs>] [--dry-run]');
    process.exit(1);
  }

  const csvPath = path.resolve(process.cwd(), args[csvIndex + 1]);
  const pdfsDir = pdfsIndex !== -1 && args[pdfsIndex + 1] ? path.resolve(process.cwd(), args[pdfsIndex + 1]) : null;

  if (!fs.existsSync(csvPath)) {
    console.error(`Error: El archivo CSV no existe en ${csvPath}`);
    process.exit(1);
  }

  console.log(`--- Iniciando Migración Masiva de Documentos SIDIDO ---`);
  console.log(`Archivo CSV: ${csvPath}`);
  console.log(`Carpeta de PDFs: ${pdfsDir || 'No especificada'}`);
  console.log(`Modo simulación (dry-run): ${isDryRun ? 'SÍ' : 'NO'}`);

  // Leer y parsear CSV
  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);

  if (lines.length <= 1) {
    console.log('El archivo CSV está vacío o solo contiene cabecera.');
    process.exit(0);
  }

  const headerLine = lines[0];
  const delimiter = headerLine.includes(';') ? ';' : ',';
  const headers = headerLine.split(delimiter).map((h) => h.trim().toLowerCase());

  console.log(`Cabeceras detectadas: [${headers.join(', ')}]`);

  // Crear registro de import_run
  let runId = randomUUID();
  if (!isDryRun) {
    const [run] = await db
      .insert(importRuns)
      .values({
        id: runId,
        source: path.basename(csvPath),
        totalRecords: lines.length - 1,
        status: 'running',
      })
      .returning();
    runId = run.id;
  }

  // Cargar usuario admin por defecto para asignación
  const adminUsers = await db.select().from(users).where(eq(users.username, 'admin')).limit(1);
  const adminId = adminUsers[0]?.id;

  // Cache de tipos y orígenes
  const allTypes = await db.select().from(documentTypes);
  const typeMap = new Map<string, number>();
  for (const t of allTypes) {
    typeMap.set(t.code.toUpperCase(), t.id);
    typeMap.set(t.name.toUpperCase(), t.id);
  }

  const allOrigins = await db.select().from(origins);
  const originMap = new Map<string, number>();
  for (const o of allOrigins) {
    originMap.set(o.code.toUpperCase(), o.id);
    originMap.set(o.name.toUpperCase(), o.id);
  }

  let importedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  const errorsReport: any[] = [];

  for (let i = 1; i < lines.length; i++) {
    const rawLine = lines[i];
    const cols = rawLine.split(delimiter).map((c) => c.trim().replace(/^["']|["']$/g, ''));

    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = cols[idx] || '';
    });

    const tipoRaw = row['tipo'] || 'EXP';
    const origenRaw = row['origen'] || '';
    const numeroRaw = row['numero'] || '';
    const anioRaw = row['anio'] ? parseInt(row['anio'], 10) : new Date().getFullYear();
    const caratulaRaw = row['caratula'] || '';
    const extractoRaw = row['extracto'] || '';
    const contenidoRaw = row['contenido'] || '';
    const archivoRaw = row['archivo'] || '';

    try {
      // 1. Resolver Tipo de Documento
      let typeId = typeMap.get(tipoRaw.toUpperCase());
      if (!typeId && !isDryRun) {
        const [newT] = await db.insert(documentTypes).values({ code: tipoRaw.toUpperCase(), name: tipoRaw }).returning();
        typeId = newT.id;
        typeMap.set(newT.code.toUpperCase(), newT.id);
      }

      // 2. Resolver Origen
      let originId: number | null = null;
      if (origenRaw) {
        originId = originMap.get(origenRaw.toUpperCase()) || null;
        if (!originId && !isDryRun) {
          const [newO] = await db.insert(origins).values({ code: origenRaw.toUpperCase(), name: origenRaw }).returning();
          originId = newO.id;
          originMap.set(newO.code.toUpperCase(), newO.id);
        }
      }

      // 3. Chequear duplicado
      if (typeId) {
        const isDup = await checkDuplicate(typeId, originId, numeroRaw, anioRaw);
        if (isDup) {
          skippedCount++;
          continue;
        }
      }

      // 4. Copiar PDF si está disponible
      let fileKey: string | null = null;
      let fileSize: number | null = null;
      let fileSha256: string | null = null;

      if (pdfsDir && archivoRaw) {
        const candidatePdf = path.join(pdfsDir, archivoRaw);
        if (fs.existsSync(candidatePdf)) {
          const pdfBuffer = fs.readFileSync(candidatePdf);
          fileSha256 = createHash('sha256').update(pdfBuffer).digest('hex');
          fileSize = pdfBuffer.length;
          fileKey = `${randomUUID()}.pdf`;

          if (!isDryRun) {
            await storage.save(fileKey, pdfBuffer);
          }
        }
      }

      // 5. Insertar Documento
      if (!isDryRun && typeId) {
        await db.insert(documents).values({
          typeId,
          originId,
          number: numeroRaw || null,
          year: anioRaw || null,
          caratula: caratulaRaw || null,
          extracto: extractoRaw || null,
          contenido: contenidoRaw || null,
          fileKey,
          fileName: archivoRaw || null,
          fileSize,
          fileSha256,
          ocrStatus: contenidoRaw ? 'completed' : fileKey ? 'pending' : 'none',
          createdBy: adminId,
        });
      }

      importedCount++;
    } catch (rowErr: any) {
      failedCount++;
      errorsReport.push({
        row: i,
        identifier: `${tipoRaw} ${numeroRaw}/${anioRaw}`,
        error: rowErr?.message || String(rowErr),
      });

      if (!isDryRun) {
        await db.insert(importErrors).values({
          runId,
          rowIndex: i,
          identifier: `${tipoRaw} ${numeroRaw}/${anioRaw}`,
          errorMessage: rowErr?.message || String(rowErr),
          rawData: row,
        });
      }
    }
  }

  // Finalizar import_run
  if (!isDryRun) {
    await db
      .update(importRuns)
      .set({
        importedCount,
        skippedCount,
        failedCount,
        status: failedCount > 0 ? 'completed' : 'completed',
        finishedAt: new Date(),
      })
      .where(eq(importRuns.id, runId));
  }

  console.log(`\n--- Resumen de Migración ---`);
  console.log(`Total registros leídos: ${lines.length - 1}`);
  console.log(`Importados con éxito:  ${importedCount}`);
  console.log(`Omitidos (Duplicados): ${skippedCount}`);
  console.log(`Errores:               ${failedCount}`);

  if (errorsReport.length > 0) {
    const reportPath = `import_report_${Date.now()}.csv`;
    const reportContent = 'Fila,Identificador,Error\n' + errorsReport.map((e) => `${e.row},"${e.identifier}","${e.error}"`).join('\n');
    fs.writeFileSync(reportPath, reportContent, 'utf-8');
    console.log(`Reporte de errores generado en: ${reportPath}`);
  }

  process.exit(0);
}

runMigration().catch((err) => {
  console.error('Error fatal durante la migración:', err);
  process.exit(1);
});
