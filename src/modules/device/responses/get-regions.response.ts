import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';
import { RegionInterface } from '../region.types';

@Exclude()
export class GetRegionResponse implements RegionInterface {
  @ApiProperty({ description: 'The Region' })
  @Expose()
  region: string;
}
