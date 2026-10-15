import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

/**
 * Hashea una contraseña usando scrypt con salt aleatorio de 16 bytes.
 * Formato resultante: salt:hash (hexadecimal)
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Verifica una contraseña en texto plano contra el hash almacenado usando comparación en tiempo constante.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  try {
    const [salt, key] = storedHash.split(':');
    if (!salt || !key) return false;

    const keyBuffer = Buffer.from(key, 'hex');
    const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;

    return timingSafeEqual(keyBuffer, derivedKey);
  } catch {
    return false;
  }
}
