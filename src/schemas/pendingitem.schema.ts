import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PendingItemDocument = PendingItem & Document;

@Schema()
export class PendingItem {
  @Prop({ required: true })
  app_id: string;

  @Prop({ required: true })
  advocate_id: string;

  @Prop({ default: 0 })
  attempts: number;
}

export const PendingItemSchema = SchemaFactory.createForClass(PendingItem);

PendingItemSchema.index({ app_id: 1, advocate_id: 1 }, { unique: true });
