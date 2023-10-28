import crypto from 'crypto'
import { EncryptedMessage } from './protobuf/msgTypes.js'

function createKey(secret: string) {
    return crypto.createHash('sha256').update(String(secret)).digest('base64').slice(0, 32)
}

const algorithm = 'aes-256-ctr'

export function encrypt(data: Uint8Array, secret: string): Uint8Array {
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv(algorithm, createKey(secret), iv)
    const content = Buffer.concat([cipher.update(data), cipher.final()])
    return EncryptedMessage.toBinary(EncryptedMessage.create({iv, content}))
}

export function decrypt(data: Uint8Array, secret: string): Uint8Array {
    const {iv, content}: {iv: Uint8Array, content: Uint8Array} = EncryptedMessage.fromBinary(data)
    const decipher = crypto.createDecipheriv(algorithm, createKey(secret), iv)
    const decrypted = Buffer.concat([decipher.update(content), decipher.final()])
    return decrypted
}

export interface Crypter {
    encrypt: (data: Uint8Array) => Uint8Array
    decrypt: (data: Uint8Array) => Uint8Array
}