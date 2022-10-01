import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

import { REGIONS } from './device.const';

@ValidatorConstraint({ async: false })
export class RegionConstraint implements ValidatorConstraintInterface {
  validate(region: string) {
    return REGIONS.includes(region);
  }

  defaultMessage() {
    return 'Invalid Region ($value)';
  }
}
