import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AppDocument = App & Document;

@Schema()
export class App {
  @Prop({ required: true, unique: true })
  app_id: string;

  @Prop({ required: true })
  name: string;

  @Prop({ default: undefined })
  has_quest: boolean;

  @Prop({ default: undefined })
  has_rift: boolean;

  @Prop({ required: true, default: [] })
  advocates: string[];
}

export const AppSchema = SchemaFactory.createForClass(App);
