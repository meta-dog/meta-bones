import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { RegionController } from './region.controller';
import { RegionService } from './region.service';
import { Region, RegionSchema } from '@schemas/region.schema';
import {
  RegionPendingItem,
  RegionPendingItemSchema,
} from '@schemas/region-pending-item.schema';
import {
  RegionBlacklistItem,
  RegionBlacklistItemSchema,
} from '@schemas/region-blacklist-item.schema';
import { CacheModule } from '@nestjs/cache-manager';
import { CACHE_TTL_MS } from './device.const';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Region.name, schema: RegionSchema },
      { name: RegionBlacklistItem.name, schema: RegionBlacklistItemSchema },
      { name: RegionPendingItem.name, schema: RegionPendingItemSchema },
    ]),
    CacheModule.register({ ttl: CACHE_TTL_MS }),
  ],
  controllers: [RegionController],
  providers: [RegionService],
})
export class RegionModule {}
