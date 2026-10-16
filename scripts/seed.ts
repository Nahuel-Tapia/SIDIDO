import { createHash } from 'node:crypto';
import { db } from '../src/server/db/client';
import { users, documentTypes, origins, documents } from '../src/server/db/schema';
import { hashPassword } from '../src/server/auth/password';
import { storage } from '../src/server/storage';
import { generateOfficialPdfBuffer } from '../src/server/storage/pdf-generator';
import { analyzePdfBufferAndFilename } from '../src/server/services/extractor';
import { eq } from 'drizzle-orm';

async function seed() {
  console.log('--- Iniciando Seed de Datos y PDFs en BD — SIDIDO 2.0 (San Juan) ---');

  // 1. Usuarios Base
  console.log('1. Creando usuarios iniciales...');
  const usersToSeed = [
    {
      username: 'admin',
      fullName: 'Administrador del Sistema',
      email: 'admin.sidido@sanjuan.edu.ar',
      password: 'admin123',
      role: 'admin' as const,
    },
    {
      username: 'operador',
      fullName: 'Operador de Mesa de Entradas',
      email: 'operador.sidido@sanjuan.edu.ar',
      password: 'operador123',
      role: 'operador' as const,
    },
    {
      username: 'consulta',
      fullName: 'Agente de Consulta Escolar',
      email: 'consulta.sidido@sanjuan.edu.ar',
      password: 'consulta123',
      role: 'consulta' as const,
    },
  ];

  const createdUsers: Record<string, string> = {};

  for (const u of usersToSeed) {
    const existing = await db.select().from(users).where(eq(users.username, u.username));
    if (existing.length === 0) {
      const passwordHash = await hashPassword(u.password);
      const [inserted] = await db
        .insert(users)
        .values({
          username: u.username,
          fullName: u.fullName,
          email: u.email,
          passwordHash,
          role: u.role,
        })
        .returning();
      createdUsers[u.username] = inserted.id;
      console.log(`   + Usuario creado: ${u.username} (${u.role}) - Clave: ${u.password}`);
    } else {
      createdUsers[u.username] = existing[0].id;
      console.log(`   * Usuario ya existe: ${u.username}`);
    }
  }

  // 2. Tipos de Documento
  console.log('2. Creando tipos de documento oficiales...');
  const typesToSeed = [
    { code: 'RES', name: 'Resolución' },
    { code: 'DEC', name: 'Decreto' },
    { code: 'EXP', name: 'Expediente' },
    { code: 'DISP', name: 'Disposición' },
    { code: 'CIRC', name: 'Circular' },
    { code: 'LEY', name: 'Ley Provincial' },
    { code: 'ACTA', name: 'Acta de Acuerdo' },
  ];

  const typeMap: Record<string, number> = {};
  const typeNameMap: Record<number, string> = {};
  for (const t of typesToSeed) {
    const existing = await db.select().from(documentTypes).where(eq(documentTypes.code, t.code));
    if (existing.length === 0) {
      const [inserted] = await db.insert(documentTypes).values(t).returning();
      typeMap[t.code] = inserted.id;
      typeNameMap[inserted.id] = inserted.name;
      console.log(`   + Tipo creado: ${t.code} - ${t.name}`);
    } else {
      typeMap[t.code] = existing[0].id;
      typeNameMap[existing[0].id] = existing[0].name;
    }
  }

  // 3. Orígenes
  console.log('3. Creando orígenes institucionales...');
  const originsToSeed = [
    { code: 'ME', name: 'Ministerio de Educación' },
    { code: 'DGEP', name: 'Dirección de Educación Primaria' },
    { code: 'DGES', name: 'Dirección de Educación Secundaria' },
    { code: 'DGESup', name: 'Dirección de Educación Superior' },
    { code: 'DGETP', name: 'Dirección de Educación Técnico Profesional' },
    { code: 'SAF', name: 'Subsecretaría Administrativa Financiera' },
  ];

  const originMap: Record<string, number> = {};
  const originNameMap: Record<number, string> = {};
  for (const o of originsToSeed) {
    const existing = await db.select().from(origins).where(eq(origins.code, o.code));
    if (existing.length === 0) {
      const [inserted] = await db.insert(origins).values(o).returning();
      originMap[o.code] = inserted.id;
      originNameMap[inserted.id] = `${inserted.name} (${inserted.code})`;
      console.log(`   + Origen creado: ${o.code} - ${o.name}`);
    } else {
      originMap[o.code] = existing[0].id;
      originNameMap[existing[0].id] = `${existing[0].name} (${existing[0].code})`;
    }
  }

  // 4. Documentos de Muestra y sus Binarios PDF en PostgreSQL (tabla document_files)
  console.log('4. Generando PDFs oficiales y extrayendo DNIs y nombres asociados automáticamente...');
  const adminId = createdUsers['admin'];

  const sampleDocs = [
    {
      typeId: typeMap['RES'],
      originId: originMap['ME'],
      number: '1420',
      year: 2024,
      expediente: '300-028554-2024',
      caratula: 'Aprobación del Calendario Escolar Período Lectivo 2024 para la Provincia de San Juan',
      extracto: 'Establécese el inicio del ciclo lectivo 2024 para todos los niveles y modalidades del sistema educativo provincial en fecha 4 de marzo.',
      contenido: 'San Juan, 15 de febrero de 2024. VISTO: El Expediente Nº 300-028554-2024, impulsado por la Ministra Lic. Silvia Beatriz Fuentes (DNI N° 21.480.312, CUIL 27-21480312-4) y la Secretaria de Educación Prof. Mariela Alejandra Lueje (DNI 24.910.544)... CONSIDERANDO que resulta necesario garantizar los 190 días de clases efectivos en concordancia con el Consejo Federal de Educación. Por ello, la MINISTRA DE EDUCACIÓN RESUELVE: Artículo 1°: Aprobar el Calendario Escolar Provincial para el año 2024 en todas las instituciones dependientes de la gestión pública y privada, incluyendo el Colegio Central Universitario y la Escuela Normal Superior Sarmiento.',
      ocrStatus: 'completed' as const,
      fileName: 'Resolucion_1420_ME_2024.pdf',
    },
    {
      typeId: typeMap['RES'],
      originId: originMap['ME'],
      number: '2350',
      year: 2024,
      expediente: '300-019482-2024',
      caratula: 'Titularización y designación docente Nivel Secundario y Formación Técnica',
      extracto: 'Designación y titularización de cargos docentes y horas cátedra en escuelas técnicas de Capital, Rawson, Chimbas y Pocito.',
      contenido: 'San Juan, 10 de abril de 2024. VISTO: El Expediente Nº 300-019482-2024 y la propuesta elevada por la Junta de Clasificación Docente Rama Media y Técnica. Se resuelve designar a María Elena Quiroga (DNI N° 28.456.789, CUIL 27-28456789-4) y al Prof. Carlos Alberto Sarmiento (DNI N° 31.450.992, CUIL 20-31450992-8) en horas cátedra titulares en la Escuela Industrial Domingo Faustino Sarmiento y Escuela Boero.',
      ocrStatus: 'completed' as const,
      fileName: 'Resolucion_2350_Concurso_2024.pdf',
    },
    {
      typeId: typeMap['DEC'],
      originId: originMap['ME'],
      number: '058',
      year: 2023,
      expediente: '300-008122-2023',
      caratula: 'Creación del Programa Provincial de Conectividad Escolar e Inclusión Digital',
      extracto: 'Dotación de fibra óptica, equipamiento informático e internet satelital a establecimientos rurales de Calingasta, Iglesia, Jáchal y Valle Fértil.',
      contenido: 'San Juan, 20 de mayo de 2023. VISTO: El Expediente Nº 300-008122-2023 y el proyecto presentado por el Director Ing. Roberto Daniel Morales (DNI 23.876.105, CUIL 20-23876105-9) y la Supervisora Lic. Ana Laura Peñaloza (DNI 29.334.810). EL GOBERNADOR DE LA PROVINCIA DE SAN JUAN DECRETA: Artículo 1° Créase en el ámbito del Ministerio de Educación el Programa Provincial San Juan Conecta Escuelas para la Escuela Provincia de Salta y el Colegio San Martín.',
      ocrStatus: 'completed' as const,
      fileName: 'Decreto_058_Conectividad_2023.pdf',
    },
    {
      typeId: typeMap['EXP'],
      originId: originMap['DGES'],
      number: '4820-A',
      year: 2024,
      expediente: '300-034110-2024',
      caratula: 'Solicitud de ampliación edilicia y refacción integral Escuela Agrotécnica Cornelio Saavedra',
      extracto: 'Pedido de partida presupuestaria para nuevos talleres de procesamiento de alimentos, laboratorios de enología y sistema de riego por goteo.',
      contenido: 'San Juan, 18 de marzo de 2024. VISTO: El Expediente Nº 300-034110-2024 (Actuación 4820-A-2024). Presentada por el Director Prof. Jorge Luis Benítez (DNI N° 22.645.901, CUIL 20-22645901-3) y la Docente Ing. Valeria Soledad Castro (DNI 33.120.488) a favor de la Escuela Agrotécnica Cornelio Saavedra de Rodeo, Iglesia. Dictamen favorable de la Dirección de Infraestructura Escolar.',
      ocrStatus: 'completed' as const,
      fileName: 'Expte_4820_Agrotecnica.pdf',
    },
    {
      typeId: typeMap['CIRC'],
      originId: originMap['DGEP'],
      number: '012',
      year: 2024,
      expediente: '300-012903-2024',
      caratula: 'Pautas pedagógicas de evaluación, acreditación y promoción en escuelas primarias',
      extracto: 'Criterios de acompañamiento a las trayectorias escolares, registros cualitativos y libreta de calificaciones cuatrimestral.',
      contenido: 'San Juan, 8 de junio de 2024. VISTO: El Expediente Nº 300-012903-2024 de la Dirección de Educación Primaria. Suscripta por la Directora Lic. Liliana Mercedes Carrizo (DNI N° 20.512.774, CUIL 27-20512774-6) y el Supervisor Prof. Ricardo Gabriel Elizondo (DNI 26.789.432). Se comunica a los directores de la Escuela Normal Fray Justo Santa María de Oro las disposiciones obligatorias referidas a los informes pedagógicos cuatrimestrales.',
      ocrStatus: 'completed' as const,
      fileName: 'Circular_012_Evaluacion_2024.pdf',
    },
  ];

  for (const doc of sampleDocs) {
    const fileKey = `sample_${doc.number}.pdf`;
    const pdfBuffer = generateOfficialPdfBuffer({
      typeName: typeNameMap[doc.typeId] || 'Documento',
      originName: originNameMap[doc.originId] || 'Ministerio de Educación',
      number: doc.number,
      year: doc.year,
      expediente: doc.expediente,
      caratula: doc.caratula,
      extracto: doc.extracto,
      contenido: doc.contenido,
    });
    const sha256 = createHash('sha256').update(pdfBuffer).digest('hex');

    // Guardar el binario PDF directamente en la tabla document_files de PostgreSQL
    await storage.save(fileKey, pdfBuffer, {
      fileName: doc.fileName,
      mimeType: 'application/pdf',
      sha256,
      uploadedBy: adminId,
    });

    // Ejecutar el analizador automático sobre el binario PDF generado
    const analysis = await analyzePdfBufferAndFilename(pdfBuffer, doc.fileName);

    const existing = await db
      .select()
      .from(documents)
      .where(eq(documents.number, doc.number));

    const finalExpediente = doc.expediente || analysis.expediente || null;

    if (existing.length === 0) {
      await db.insert(documents).values({
        ...doc,
        expediente: finalExpediente,
        fileKey,
        fileSize: pdfBuffer.byteLength,
        fileSha256: sha256,
        pageCount: analysis.pageCount || 1,
        extractedMetadata: analysis.metadata,
        createdBy: adminId,
        updatedBy: adminId,
      });
      console.log(`   + Documento creado: ${doc.number}/${doc.year} (Exp: ${finalExpediente}) | DNIs: [${analysis.metadata.dnis.join(', ')}] | Personas: [${analysis.metadata.people.join('; ')}]`);
    } else {
      await db
        .update(documents)
        .set({
          expediente: finalExpediente,
          caratula: doc.caratula,
          extracto: doc.extracto,
          contenido: doc.contenido,
          fileKey,
          fileName: doc.fileName,
          fileSize: pdfBuffer.byteLength,
          fileSha256: sha256,
          pageCount: analysis.pageCount || 1,
          extractedMetadata: analysis.metadata,
        })
        .where(eq(documents.id, existing[0].id));
      console.log(`   * Documento actualizado: ${doc.number}/${doc.year} (Exp: ${finalExpediente}) | DNIs: [${analysis.metadata.dnis.join(', ')}] | Personas: [${analysis.metadata.people.join('; ')}]`);
    }
  }

  console.log('--- Seed de Datos, PDFs y Extracción Automática completado con éxito! ---');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Error en seed:', err);
  process.exit(1);
});
