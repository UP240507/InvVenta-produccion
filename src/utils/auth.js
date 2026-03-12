// src/utils/auth.js
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

/**
 * Genera un hash bcrypt de una contraseña en texto plano.
 */
export async function hashPassword(plainText) {
    return await bcrypt.hash(plainText, SALT_ROUNDS);
}

/**
 * Verifica una contraseña contra un hash o texto plano legacy.
 * Retorna true si coincide.
 */
export async function verifyPassword(plainText, storedPassword) {
    if (isHashed(storedPassword)) {
        return await bcrypt.compare(plainText, storedPassword);
    }
    // Fallback legacy: contraseña aún en texto plano
    return plainText === storedPassword;
}

/**
 * Detecta si un string ya es un hash bcrypt.
 */
export function isHashed(password) {
    return typeof password === 'string' && password.startsWith('$2');
}