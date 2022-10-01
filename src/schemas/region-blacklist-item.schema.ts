import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type RegionBlacklistItemDocument = RegionBlacklistItem & Document;

@Schema()
export class RegionBlacklistItem {
  @Prop({ required: true })
  advocate_id: string;
  @Prop({ required: true })
  region: string;
}

export const RegionBlacklistItemSchema =
  SchemaFactory.createForClass(RegionBlacklistItem);

RegionBlacklistItemSchema.index(
  { advocate_id: 1, region: 1 },
  { unique: true },
);
