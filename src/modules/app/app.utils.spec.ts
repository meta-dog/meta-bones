import { AppIdConstraint } from './app.utils';

interface ValidateAppIdData {
  input: string;
  output: boolean;
}

const validateAppIdData: ValidateAppIdData[] = [
  {
    input: '123523523',
    output: true,
  },
  {
    input: 'm1241241m',
    output: false,
  },
  {
    input: '1a',
    output: false,
  },
  {
    input: 'a',
    output: false,
  },
  {
    input: 'cant.stop.me.now',
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
      'https://www.oculus.com/appreferrals/example.user/1241241241241241/?utm_source=3',
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

test.each(validateAppIdData)(
  'expects validateAppIds($input) to equal $output',
  ({ input, output }) => {
    expect(new AppIdConstraint().validate(input)).toEqual(output);
  },
);
