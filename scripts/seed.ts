import { db } from '../src/server/db/client';
import { users, documentTypes, origins, documents } from '../src/server/db/schema';
import { hashPassword } from '../src/server/auth/password';
import { eq } from 'drizzle-orm';

async function seed() {
  console.log('--- Iniciando Seed de Datos SIDIDO 2.0 (San Juan) ---');

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
  for (const t of typesToSeed) {
    const existing = await db.select().from(documentTypes).where(eq(documentTypes.code, t.code));
    if (existing.length === 0) {
      const [inserted] = await db.insert(documentTypes).values(t).returning();
      typeMap[t.code] = inserted.id;
      console.log(`   + Tipo creado: ${t.code} - ${t.name}`);
    } else {
      typeMap[t.code] = existing[0].id;
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
  for (const o of originsToSeed) {
    const existing = await db.select().from(origins).where(eq(origins.code, o.code));
    if (existing.length === 0) {
      const [inserted] = await db.insert(origins).values(o).returning();
      originMap[o.code] = inserted.id;
      console.log(`   + Origen creado: ${o.code} - ${o.name}`);
    } else {
      originMap[o.code] = existing[0].id;
    }
  }

  // 4. Documentos de Muestra del Ministerio de Educación de San Juan
  console.log('4. Creando documentos representativos de muestra...');
  const adminId = createdUsers['admin'];

  const sampleDocs = [
    {
      typeId: typeMap['RES'],
      originId: originMap['ME'],
      number: '1420',
      year: 2024,
      caratula: 'Aprobación del Calendario Escolar Período Lectivo 2024 para la Provincia de San Juan',
      extracto: 'Establécese el inicio del ciclo lectivo 2024 para todos los niveles y modalidades del sistema educativo provincial en fecha 4 de marzo.',
      contenido: 'San Juan, 15 de febrero de 2024. VISTO el expediente ministerial por el cual se propicia fijar el cronograma escolar... CONSIDERANDO que resulta necesario garantizar los 190 días de clases efectivos en concordancia con el Consejo Federal de Educación. Por ello, la MINISTRA DE EDUCACIÓN RESUELVE: Artículo 1°: Aprobar el Calendario Escolar Provincial para el año 2024 en todas las instituciones dependientes de la gestión pública y privada. Artículo 2°: Notifíquese a las direcciones de área: DGEP, DGES y DGESup.',
      ocrStatus: 'completed' as const,
      fileName: 'Resolucion_1420_ME_2024.pdf',
    },
    {
      typeId: typeMap['RES'],
      originId: originMap['ME'],
      number: '2350',
      year: 2024,
      caratula: 'Titularización y llamado a concurso docente Nivel Secundario y Formación Técnica',
      extracto: 'Convocatoria a concurso de antecedentes y oposición para cargos directivos y horas cátedra vacantes en escuelas técnicas de Capital, Rawson, Chimbas y Pocito.',
      contenido: 'El Ministerio de Educación de la Provincia de San Juan convoca a los profesionales de la educación inscriptos en Junta de Clasificación Docente Rama Media y Técnica. Se asignarán partidas presupuestarias extraordinarias aprobadas por decreto provincial. Los requisitos de postulación incluyen título habilitante con registro provincial de firmas.',
      ocrStatus: 'completed' as const,
      fileName: 'Resolucion_2350_Concurso_2024.pdf',
    },
    {
      typeId: typeMap['DEC'],
      originId: originMap['ME'],
      number: '058',
      year: 2023,
      caratula: 'Creación del Programa Provincial de Conectividad Escolar e Inclusión Digital',
      extracto: 'Dotación de fibra óptica, equipamiento informático e internet satelital a establecimientos rurales de Calingasta, Iglesia, Jáchal y Valle Fértil.',
      contenido: 'San Juan, 20 de mayo de 2023. EL GOBERNADOR DE LA PROVINCIA DE SAN JUAN DECRETA: Artículo 1° Créase en el ámbito del Ministerio de Educación el Programa Provincial San Juan Conecta Escuelas. Las escuelas de zonas alejadas contarán con paneles solares y enlaces de banda ancha de alta velocidad para aulas digitales y robótica.',
      ocrStatus: 'completed' as const,
      fileName: 'Decreto_058_Conectividad_2023.pdf',
    },
    {
      typeId: typeMap['EXP'],
      originId: originMap['DGES'],
      number: '4820-A',
      year: 2024,
      caratula: 'Solicitud de ampliación edilicia y refacción integral Escuela Agrotécnica Cornelio Saavedra',
      extracto: 'Pedido de partida presupuestaria para nuevos talleres de procesamiento de alimentos, laboratorios de enología y sistema de riego por goteo.',
      contenido: 'Mesa de entradas - Expte 4820-A-2024. Objeto: Solicitud de mejoras estructurales y ampliación de aulas técnicas en Rodeo, Iglesia. Dictamen favorable de la Dirección de Infraestructura Escolar. Monto estimado de inversión de fondos provinciales con seguimiento del Tribunal de Cuentas.',
      ocrStatus: 'completed' as const,
      fileName: 'Expte_4820_Agrotecnica.pdf',
    },
    {
      typeId: typeMap['CIRC'],
      originId: originMap['DGEP'],
      number: '012',
      year: 2024,
      caratula: 'Pautas pedagógicas de evaluación, acreditación y promoción en escuelas primarias',
      extracto: 'Criterios de acompañamiento a las trayectorias escolares, registros cualitativos y libreta de calificaciones cuatrimestral.',
      contenido: 'Dirección General de Educación Primaria. Se comunica a los directores de escuelas y supervisores escolares las disposiciones obligatorias referidas a los informes pedagógicos cuatrimestrales y apoyo específico a estudiantes en proceso de aprendizaje.',
      ocrStatus: 'completed' as const,
      fileName: 'Circular_012_Evaluacion_2024.pdf',
    },
  ];

  for (const doc of sampleDocs) {
    const existing = await db
      .select()
      .from(documents)
      .where(eq(documents.number, doc.number));

    if (existing.length === 0) {
      await db.insert(documents).values({
        ...doc,
        fileKey: `sample_${doc.number}.pdf`,
        fileSize: 1024 * 350,
        createdBy: adminId,
        updatedBy: adminId,
      });
      console.log(`   + Documento creado: ${doc.number}/${doc.year} - ${doc.caratula.slice(0, 45)}...`);
    }
  }

  console.log('--- Seed completado con éxito! ---');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Error en seed:', err);
  process.exit(1);
});
