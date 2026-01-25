/**
 * Key Manager
 * Handles key generation, import, and secure storage
 */

import * as StellarSdk from '@stellar/stellar-sdk';
import { AccountCreationResult } from './types';

// Storage keys
const ENCRYPTED_KEY_STORAGE = 'stellar_encrypted_keys';

export class KeyManager {
  private static instance: KeyManager | null = null;

  private constructor() {}

  static getInstance(): KeyManager {
    if (!KeyManager.instance) {
      KeyManager.instance = new KeyManager();
    }
    return KeyManager.instance;
  }

  /**
   * Generate a new random keypair
   */
  generateKeypair(): AccountCreationResult {
    const keypair = StellarSdk.Keypair.random();

    return {
      publicKey: keypair.publicKey(),
      secretKey: keypair.secret(),
      needsFunding: true,
    };
  }

  /**
   * Import keypair from secret key
   */
  importFromSecret(secretKey: string): AccountCreationResult {
    try {
      const keypair = StellarSdk.Keypair.fromSecret(secretKey);

      return {
        publicKey: keypair.publicKey(),
        secretKey: keypair.secret(),
        needsFunding: false, // Assume imported accounts exist
      };
    } catch (error) {
      throw new Error('Invalid secret key format');
    }
  }

  /**
   * Validate a public key
   */
  isValidPublicKey(publicKey: string): boolean {
    try {
      StellarSdk.Keypair.fromPublicKey(publicKey);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate a secret key
   */
  isValidSecretKey(secretKey: string): boolean {
    try {
      StellarSdk.Keypair.fromSecret(secretKey);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get public key from secret key
   */
  getPublicKey(secretKey: string): string {
    const keypair = StellarSdk.Keypair.fromSecret(secretKey);
    return keypair.publicKey();
  }

  /**
   * Sign arbitrary data with a secret key
   */
  signData(data: Buffer, secretKey: string): Buffer {
    const keypair = StellarSdk.Keypair.fromSecret(secretKey);
    return keypair.sign(data);
  }

  /**
   * Verify a signature
   */
  verifySignature(
    data: Buffer,
    signature: Buffer,
    publicKey: string
  ): boolean {
    try {
      const keypair = StellarSdk.Keypair.fromPublicKey(publicKey);
      return keypair.verify(data, signature);
    } catch {
      return false;
    }
  }

  /**
   * Encrypt and store a secret key
   * Note: In production, use a proper encryption library
   */
  async storeEncryptedKey(
    publicKey: string,
    secretKey: string,
    password: string
  ): Promise<void> {
    // Simple XOR encryption for demo - USE PROPER ENCRYPTION IN PRODUCTION
    const encrypted = await this.encrypt(secretKey, password);
    
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        const existing = await this.getStoredKeys();
        existing[publicKey] = encrypted;
        await chrome.storage.local.set({ [ENCRYPTED_KEY_STORAGE]: existing });
      } else {
        const existing = this.getLocalStoredKeys();
        existing[publicKey] = encrypted;
        localStorage.setItem(ENCRYPTED_KEY_STORAGE, JSON.stringify(existing));
      }
    } catch (error) {
      throw new Error('Failed to store encrypted key');
    }
  }

  /**
   * Retrieve and decrypt a stored secret key
   */
  async retrieveKey(publicKey: string, password: string): Promise<string> {
    try {
      let encrypted: string | undefined;

      if (typeof chrome !== 'undefined' && chrome.storage) {
        const stored = await this.getStoredKeys();
        encrypted = stored[publicKey];
      } else {
        const stored = this.getLocalStoredKeys();
        encrypted = stored[publicKey];
      }

      if (!encrypted) {
        throw new Error('Key not found');
      }

      return await this.decrypt(encrypted, password);
    } catch (error) {
      throw new Error('Failed to retrieve key - incorrect password or key not found');
    }
  }

  /**
   * Remove a stored key
   */
  async removeKey(publicKey: string): Promise<void> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        const existing = await this.getStoredKeys();
        delete existing[publicKey];
        await chrome.storage.local.set({ [ENCRYPTED_KEY_STORAGE]: existing });
      } else {
        const existing = this.getLocalStoredKeys();
        delete existing[publicKey];
        localStorage.setItem(ENCRYPTED_KEY_STORAGE, JSON.stringify(existing));
      }
    } catch (error) {
      throw new Error('Failed to remove key');
    }
  }

  /**
   * List all stored public keys
   */
  async listStoredKeys(): Promise<string[]> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        const stored = await this.getStoredKeys();
        return Object.keys(stored);
      } else {
        const stored = this.getLocalStoredKeys();
        return Object.keys(stored);
      }
    } catch {
      return [];
    }
  }

  // Private helper methods

  private async getStoredKeys(): Promise<Record<string, string>> {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const result = await chrome.storage.local.get(ENCRYPTED_KEY_STORAGE);
      return result[ENCRYPTED_KEY_STORAGE] || {};
    }
    return {};
  }

  private getLocalStoredKeys(): Record<string, string> {
    try {
      const stored = localStorage.getItem(ENCRYPTED_KEY_STORAGE);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  }

  /**
   * Simple encryption - REPLACE WITH PROPER ENCRYPTION IN PRODUCTION
   * Consider using Web Crypto API with PBKDF2 for key derivation
   */
  private async encrypt(data: string, password: string): Promise<string> {
    // In production, use SubtleCrypto with AES-GCM
    const encoder = new TextEncoder();
    const dataBytes = encoder.encode(data);
    const keyBytes = encoder.encode(password.padEnd(32, '0').slice(0, 32));
    
    const encrypted = new Uint8Array(dataBytes.length);
    for (let i = 0; i < dataBytes.length; i++) {
      encrypted[i] = dataBytes[i] ^ keyBytes[i % keyBytes.length];
    }
    
    return Buffer.from(encrypted).toString('base64');
  }

  /**
   * Simple decryption - REPLACE WITH PROPER DECRYPTION IN PRODUCTION
   */
  private async decrypt(encrypted: string, password: string): Promise<string> {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const dataBytes = Buffer.from(encrypted, 'base64');
    const keyBytes = encoder.encode(password.padEnd(32, '0').slice(0, 32));
    
    const decrypted = new Uint8Array(dataBytes.length);
    for (let i = 0; i < dataBytes.length; i++) {
      decrypted[i] = dataBytes[i] ^ keyBytes[i % keyBytes.length];
    }
    
    return decoder.decode(decrypted);
  }
}

// Export singleton getter
export const getKeyManager = () => KeyManager.getInstance();
