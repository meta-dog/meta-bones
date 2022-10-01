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
