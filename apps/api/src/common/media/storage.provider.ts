export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

export interface StorageProvider {
  uploadFixed(buffer: Buffer, mime: string, storagePath: string): Promise<string>;
  uploadUnique(buffer: Buffer, mime: string, pathPrefix: string): Promise<{ url: string; storagePath: string }>;
  deleteByPath(storagePath: string): Promise<void>;
  extractPath(publicUrl: string): string | null;
}
