import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type BlacklistItemDocument = BlacklistItem & Document;

@Schema()
export class BlacklistItem {
  @Prop({ required: true })
  app_id: string;

  @Prop({ required: true })
  advocate_id: string;
}

export const BlacklistItemSchema = SchemaFactory.createForClass(BlacklistItem);

BlacklistItemSchema.index({ app_id: 1, advocate_id: 1 }, { unique: true });
