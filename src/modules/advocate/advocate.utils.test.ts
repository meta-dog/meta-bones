import { AdvocateIdConstraint } from './advocate.utils';

interface ValidateAdvocateIdData {
  input: string;
  output: boolean;
}

// Based off on: https://www.meta.com/en-gb/help/quest/articles/accounts/account-settings-and-management/manage-oculus-account/
/* Username requirements:

- Usernames must start with a letter or digit.
- Usernames may be between 2 and 20 characters in length.
- Usernames may include a combination of letters, digits, dashes and underscores, but may not include dashes or underscores consecutively.
- Usernames may not have spaces, slashes or ~~full stops~~.

- NOTE: Full stops seem to work

*/
const validateAdvocateIdData: ValidateAdvocateIdData[] = [
  {
    input: '1-true_exampleuser',
    output: true,
  },
  {
    input: 'maybe-good-gal',
    output: true,
  },
  {
    input: 'cant.stop.me.now',
    output: true,
  },
  {
    input: '1',
    output: false,
  },
  {
    input: 'a',
    output: false,
  },
  {
    input: 'take/this/fail',
    output: false,
  },
  {
    input: 'double__under__fail',
    output: false,
  },
  {
    input: 'double--dash--fail',
    output: false,
  },
  {
    input: 'fail space user',
    output: false,
  },
  {
    input:
      'https://www.meta.com/appreferrals/example.user/1241241241241241/?utm_source=3',
    output: false,
  },
  {
    input: 'maybe-evil/not-great-user',
    output: false,
  },
  {
    input: 'probablygood?user',
    output: false,
  },
];

test.each(validateAdvocateIdData)(
  'expects validateAdvocateIds($input) to equal $output',
  ({ input, output }) => {
    expect(new AdvocateIdConstraint().validate(input)).toEqual(output);
  },
);
