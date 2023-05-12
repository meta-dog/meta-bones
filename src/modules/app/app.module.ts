import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { App, AppSchema } from '@schemas/app.schema';
import {
  PendingItem,
  PendingItemSchema,
} from '@schemas/app-pending-item.schema';
import {
  BlacklistItem,
  BlacklistItemSchema,
} from '@schemas/app-blacklist-item.schema';
import { CacheModule } from '@nestjs/cache-manager';
import { CACHE_TTL_MS } from './app.const';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: App.name, schema: AppSchema },
      { name: BlacklistItem.name, schema: BlacklistItemSchema },
      { name: PendingItem.name, schema: PendingItemSchema },
    ]),
    CacheModule.register({ ttl: CACHE_TTL_MS }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
