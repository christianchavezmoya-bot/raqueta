import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { STORAGE_PROVIDER, StorageProvider } from './storage.provider';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

function detectMime(buf: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return 'image/webp';
  return null;
}

@Injectable()
export class MediaService {
  constructor(
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  async uploadFixed(file: Express.Multer.File, storagePath: string): Promise<string> {
    const mime = this.validate(file);
    return this.storage.uploadFixed(file.buffer, mime, storagePath);
  }

  async uploadUnique(
    file: Express.Multer.File,
    pathPrefix: string,
  ): Promise<{ url: string; storagePath: string }> {
    const mime = this.validate(file);
    return this.storage.uploadUnique(file.buffer, mime, pathPrefix);
  }

  async deleteByPath(storagePath: string): Promise<void> {
    return this.storage.deleteByPath(storagePath);
  }

  extractPath(publicUrl: string): string | null {
    return this.storage.extractPath(publicUrl);
  }

  private validate(file: Express.Multer.File): 'image/jpeg' | 'image/png' | 'image/webp' {
    if (!file?.buffer) throw new BadRequestException('No file provided.');
    if (file.size > MAX_BYTES) throw new BadRequestException('File too large. Maximum size is 5 MB.');
    const mime = detectMime(file.buffer);
    if (!mime) throw new BadRequestException('Invalid file type. Only JPEG, PNG, and WebP are accepted.');
    return mime;
  }
}
