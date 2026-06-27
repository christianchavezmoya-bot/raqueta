import { Module } from '@nestjs/common';
import { ParentChildController } from './parent-child.controller';
import { ParentChildService } from './parent-child.service';

@Module({
  controllers: [ParentChildController],
  providers: [ParentChildService],
  exports: [ParentChildService],
})
export class ParentChildModule {}
