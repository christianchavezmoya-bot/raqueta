import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuid } from 'uuid';

const BUCKET = 'media';
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

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

@Injectable()
export class MediaService implements OnModuleInit {
  private readonly logger = new Logger(MediaService.name);
  private readonly supabase: SupabaseClient;
  private readonly publicBase: string;

  constructor(private config: ConfigService) {
    const url = config.getOrThrow<string>('SUPABASE_URL');
    const key = config.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY');
    this.supabase = createClient(url, key, { auth: { persistSession: false } });
    this.publicBase = `${url}/storage/v1/object/public/${BUCKET}`;
  }

  async onModuleInit() {
    const { data: buckets } = await this.supabase.storage.listBuckets();
    const exists = buckets?.some(b => b.name === BUCKET);
    if (!exists) {
      const { error } = await this.supabase.storage.createBucket(BUCKET, { public: true });
      if (error) {
        this.logger.error(`Failed to create storage bucket "${BUCKET}": ${error.message}`);
      } else {
        this.logger.log(`Created Supabase Storage bucket: ${BUCKET}`);
      }
    }
  }

  /**
   * Upload a file to a fixed path (e.g. clubs/{id}/logo).
   * Uses upsert so the existing file is atomically replaced — no orphan cleanup needed.
   * Returns the public URL.
   */
  async uploadFixed(file: Express.Multer.File, storagePath: string): Promise<string> {
    const mime = this.validate(file);
    const ext = MIME_EXT[mime];
    const fullPath = `${storagePath}.${ext}`;

    // If a different extension existed before (e.g. old was .jpg, new is .png) we
    // need to clean it up. We do this by trying to delete all known extensions first,
    // then uploading the new one.
    const otherExts = Object.values(MIME_EXT).filter(e => e !== ext);
    const stalePaths = otherExts.map(e => `${storagePath}.${e}`);
    await this.supabase.storage.from(BUCKET).remove(stalePaths).catch(() => {});

    const { error } = await this.supabase.storage
      .from(BUCKET)
      .upload(fullPath, file.buffer, { contentType: mime, upsert: true });

    if (error) throw new InternalServerErrorException(`Upload failed: ${error.message}`);
    return `${this.publicBase}/${fullPath}`;
  }

  /**
   * Upload a gallery image with a unique path (e.g. clubs/{id}/photos/{uuid}).
   * Returns { url, storagePath } so the caller can store storagePath for later deletion.
   */
  async uploadUnique(
    file: Express.Multer.File,
    pathPrefix: string,
  ): Promise<{ url: string; storagePath: string }> {
    const mime = this.validate(file);
    const ext = MIME_EXT[mime];
    const fullPath = `${pathPrefix}/${uuid()}.${ext}`;

    const { error } = await this.supabase.storage
      .from(BUCKET)
      .upload(fullPath, file.buffer, { contentType: mime, upsert: false });

    if (error) throw new InternalServerErrorException(`Upload failed: ${error.message}`);
    return { url: `${this.publicBase}/${fullPath}`, storagePath: fullPath };
  }

  /**
   * Delete a file by its storage path (not the public URL).
   * Fire-and-forget safe — never throws.
   */
  async deleteByPath(storagePath: string): Promise<void> {
    const { error } = await this.supabase.storage.from(BUCKET).remove([storagePath]);
    if (error) this.logger.warn(`Storage delete failed for ${storagePath}: ${error.message}`);
  }

  /**
   * Extract storage path from a public URL produced by this service.
   * Returns null if the URL doesn't belong to this bucket.
   */
  extractPath(publicUrl: string): string | null {
    const marker = `/object/public/${BUCKET}/`;
    const idx = publicUrl.indexOf(marker);
    if (idx === -1) return null;
    return publicUrl.slice(idx + marker.length);
  }

  private validate(file: Express.Multer.File): 'image/jpeg' | 'image/png' | 'image/webp' {
    if (!file?.buffer) throw new BadRequestException('No file provided.');
    if (file.size > MAX_BYTES) throw new BadRequestException('File too large. Maximum size is 5 MB.');
    const mime = detectMime(file.buffer);
    if (!mime) throw new BadRequestException('Invalid file type. Only JPEG, PNG, and WebP are accepted.');
    return mime;
  }
}
