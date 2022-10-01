import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';
import { RegionReferralInterface } from '../region.types';

@Exclude()
export class GetRegionReferralResponse implements RegionReferralInterface {
  @ApiProperty({ description: 'The username of the Advocate' })
  @Expose()
  advocate_id: string;
}
