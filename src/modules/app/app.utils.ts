/* eslint-disable @typescript-eslint/ban-types */
import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ async: false })
export class AppIdConstraint implements ValidatorConstraintInterface {
  validate(app_id: string) {
    return app_id.match(/^[0-9]+$/g) !== null;
  }

  defaultMessage() {
    return 'Invalid App Id ($value)';
  }
}

@ValidatorConstraint({ async: false })
export class AdvocateIdConstraint implements ValidatorConstraintInterface {
  validate(advocate_id: string) {
    if (advocate_id === null) return false;
    const hasLengthAndOnlyValidChars =
      advocate_id.match(/^[0-9a-zA-Z]{1}[\w\.\-_]+$/) !== null;
    if (!hasLengthAndOnlyValidChars) return false;
    const hasDoubleDashOrUnderscore = advocate_id.match(/[-_]{2,}/);
    if (hasDoubleDashOrUnderscore) return false;
    return true;
  }

  defaultMessage() {
    return 'Invalid Advocate Id ($value)';
  }
}
