import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';
import { AppInterface } from '../app.types';

@Exclude()
export class GetAppResponse implements AppInterface {
  @ApiProperty({ description: 'The Meta id of the App' })
  @Expose()
  app_id: string;

  @ApiProperty({ description: 'The name of the App' })
  @Expose()
  name: string;

  @ApiProperty({ description: 'Whether the App is in the Quest store' })
  @Expose()
  has_quest: boolean;

  @ApiProperty({ description: 'Whether the App is in the Rift store' })
  @Expose()
  has_rift: boolean;
}
