import { db } from '../src/server/db/client';
import { users, documents } from '../src/server/db/schema';
import { createSession } from '../src/server/auth/session';
import { eq } from 'drizzle-orm';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

async function main() {
  console.log('1. Generando sesión de administrador para capturas...');
  const adminUsers = await db.select().from(users).where(eq(users.username, 'admin')).limit(1);
  const admin = adminUsers[0];
  const { token } = await createSession(admin.id, '127.0.0.1', 'ScreenshotBot/2.0');
  console.log('   Sesión creada:', token.slice(0, 8) + '...');

  const sampleDocs = await db.select().from(documents).limit(1);
  const docId = sampleDocs[0]?.id;

  const userDataDir = path.resolve(process.cwd(), '.edge-profile');
  if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });

  const edgeProcess = spawn(
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    [
      '--headless',
      '--disable-gpu',
      '--remote-debugging-port=9222',
      `--user-data-dir=${userDataDir}`,
      'about:blank',
    ],
    { stdio: 'ignore' }
  );

  await new Promise((r) => setTimeout(r, 1500));

  const versionRes = await fetch('http://127.0.0.1:9222/json/version');
  const versionData = await versionRes.json();
  const webSocketDebuggerUrl = versionData.webSocketDebuggerUrl;

  const { WebSocket } = await import('undici');
  const ws = new WebSocket(webSocketDebuggerUrl);

  await new Promise((resolve) => ws.addEventListener('open', resolve));

  let msgId = 1;
  const pending = new Map<number, (res: any) => void>();

  ws.addEventListener('message', (event: any) => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      pending.get(data.id)!(data.result);
      pending.delete(data.id);
    }
  });

  function sendCommand(method: string, params: any = {}): Promise<any> {
    return new Promise((resolve) => {
      const id = msgId++;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  const { targetId } = await sendCommand('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await sendCommand('Target.attachToTarget', { targetId, flatten: true });

  function sendPageCommand(method: string, params: any = {}): Promise<any> {
    return new Promise((resolve) => {
      const id = msgId++;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, sessionId, method, params }));
    });
  }

  await sendPageCommand('Page.enable');
  await sendPageCommand('Network.enable');

  await sendPageCommand('Emulation.setDeviceMetricsOverride', {
    width: 1366,
    height: 850,
    deviceScaleFactor: 1,
    mobile: false,
  });

  const brainDir = 'C:\\Users\\Docente\\.gemini\\antigravity\\brain\\c69f04ea-35f5-414e-a655-f098e7997776';

  // Capturar Login sin sesión
  await sendPageCommand('Network.clearBrowserCookies');
  console.log('Capturando captura_01_login.png...');
  await sendPageCommand('Page.navigate', { url: 'http://localhost:4321/login' });
  await new Promise((r) => setTimeout(r, 1500));
  const loginShot = await sendPageCommand('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.resolve(process.cwd(), 'captura_01_login.png'), Buffer.from(loginShot.data, 'base64'));
  fs.writeFileSync(path.join(brainDir, 'captura_01_login.png'), Buffer.from(loginShot.data, 'base64'));

  // Establecer cookie sidido_session
  await sendPageCommand('Network.setCookie', {
    name: 'sidido_session',
    value: token,
    domain: 'localhost',
    path: '/',
    httpOnly: true,
  });

  const pagesToCapture = [
    { name: 'captura_02_consultas.png', url: 'http://localhost:4321/consultas' },
    { name: 'captura_03_anexar.png', url: 'http://localhost:4321/anexar' },
    { name: 'captura_04_detalle.png', url: `http://localhost:4321/documentos/${docId}` },
    { name: 'captura_05_admin.png', url: 'http://localhost:4321/admin' },
    { name: 'captura_06_auditoria.png', url: 'http://localhost:4321/admin/auditoria' },
  ];

  for (const page of pagesToCapture) {
    console.log(`Capturando ${page.name} (${page.url})...`);
    await sendPageCommand('Page.navigate', { url: page.url });
    await new Promise((r) => setTimeout(r, 1600));

    const { data: base64Png } = await sendPageCommand('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(base64Png, 'base64');

    const destLocal = path.resolve(process.cwd(), page.name);
    const destBrain = path.join(brainDir, page.name);

    fs.writeFileSync(destLocal, buffer);
    fs.writeFileSync(destBrain, buffer);
    console.log(`   ✓ Guardada en: ${destBrain}`);
  }

  ws.close();
  edgeProcess.kill();
  console.log('\n--- Todas las capturas generadas exitosamente! ---');
  process.exit(0);
}

main().catch((err) => {
  console.error('Error generando capturas:', err);
  process.exit(1);
});
