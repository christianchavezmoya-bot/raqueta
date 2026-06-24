import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuid } from 'uuid';
import { StorageProvider } from './storage.provider';

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

@Injectable()
export class LocalDiskStorageProvider implements StorageProvider {
  private readonly logger = new Logger(LocalDiskStorageProvider.name);
  private readonly root: string;
  private readonly publicBase: string;

  constructor(private config: ConfigService) {
    const rawRoot = config.get<string>('STORAGE_ROOT', './storage');
    this.root = path.isAbsolute(rawRoot) ? rawRoot : path.resolve(process.cwd(), rawRoot);
    this.publicBase = `${config.get<string>('API_BASE_URL', 'http://localhost:3001')}/storage`;
  }

  async uploadFixed(buffer: Buffer, mime: string, storagePath: string): Promise<string> {
    const ext = MIME_EXT[mime];
    const fullPath = `${storagePath}.${ext}`;

    // Remove stale files with other extensions so only one variant lives on disk.
    await Promise.all(
      Object.values(MIME_EXT)
        .filter(e => e !== ext)
        .map(e => fs.rm(path.join(this.root, `${storagePath}.${e}`), { force: true }).catch(() => {})),
    );

    const absPath = path.join(this.root, fullPath);
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, buffer);

    return `${this.publicBase}/${fullPath}`;
  }

  async uploadUnique(buffer: Buffer, mime: string, pathPrefix: string): Promise<{ url: string; storagePath: string }> {
    const ext = MIME_EXT[mime];
    const relativePath = `${pathPrefix}/${uuid()}.${ext}`;
    const absPath = path.join(this.root, relativePath);

    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, buffer);

    return { url: `${this.publicBase}/${relativePath}`, storagePath: relativePath };
  }

  async deleteByPath(storagePath: string): Promise<void> {
    try {
      await fs.rm(path.join(this.root, storagePath), { force: true });
    } catch (err) {
      this.logger.warn(`Storage delete failed for ${storagePath}: ${(err as Error).message}`);
    }
  }

  extractPath(publicUrl: string): string | null {
    const prefix = `${this.publicBase}/`;
    if (!publicUrl.startsWith(prefix)) return null;
    return publicUrl.slice(prefix.length);
  }
}
