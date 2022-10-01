import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type RegionDocument = Region & Document;

@Schema()
export class Region {
  @Prop({ required: true, unique: true })
  region: string;

  @Prop({ required: true, default: [] })
  advocates: string[];
}

export const RegionSchema = SchemaFactory.createForClass(Region);
