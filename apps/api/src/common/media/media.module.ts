import { Global, Module } from '@nestjs/common';
import { MediaService } from './media.service';
import { LocalDiskStorageProvider } from './local-disk.storage';
import { STORAGE_PROVIDER } from './storage.provider';

@Global()
@Module({
  providers: [
    { provide: STORAGE_PROVIDER, useClass: LocalDiskStorageProvider },
    MediaService,
  ],
  exports: [MediaService],
})
export class MediaModule {}
