import 'jest'
import { decrypt, encrypt } from '../src/encrypt'
import crypto from 'crypto'

describe('Encryption', () => {
    it('Encrypts and decrypts', async () => {
        const key = crypto.createHash('sha256').update('secret').digest('base64')
        const msg = "Hello, World!"
        expect(decrypt(encrypt(Buffer.from(msg), key), key).toString()).toEqual(msg)
    })
})