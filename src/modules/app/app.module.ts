import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MongooseModule } from '@nestjs/mongoose';
import { Advocate, AdvocateSchema } from '@schemas/advocate.schema';
import { App, AppSchema } from '@schemas/app.schema';
import { PendingItem, PendingItemSchema } from '@schemas/pendingitem.schema';
import {
  BlacklistItem,
  BlacklistItemSchema,
} from '@schemas/blacklistitem.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: App.name, schema: AppSchema },
      { name: Advocate.name, schema: AdvocateSchema },
      { name: BlacklistItem.name, schema: BlacklistItemSchema },
      { name: PendingItem.name, schema: PendingItemSchema },
    ]),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
