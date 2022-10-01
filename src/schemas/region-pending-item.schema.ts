import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type RegionPendingItemDocument = RegionPendingItem & Document;

@Schema()
export class RegionPendingItem {
  @Prop({ required: true })
  advocate_id: string;

  @Prop({ required: true })
  region: string;

  @Prop({ default: 0 })
  attempts: number;
}

export const RegionPendingItemSchema =
  SchemaFactory.createForClass(RegionPendingItem);

RegionPendingItemSchema.index({ advocate_id: 1, region: 1 }, { unique: true });
