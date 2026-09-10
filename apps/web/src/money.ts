/**
 * Every conversion between minor units and something a person reads lives in
 * this file, and it is all string work. No value here is ever a JS number:
 * that is the whole reason money is a decimal string on the wire.
 *
 * Currency is not modelled at all, so both the exponent and the symbol are
 * constants here rather than columns. Supporting more than one would mean
 * looking up the ISO 4217 minor unit exponent, which is 0 for JPY and 3 for
 * KWD, and carrying the code alongside every amount.
 */
const MINOR_UNIT_DIGITS = 2;
const CURRENCY = 'GBP';

const MAJOR_AMOUNT = /^\d+(\.\d{1,2})?$/;

/**
 * The render boundary. Takes the minor-unit string straight from the API and
 * returns something to put in the DOM; nothing upstream of this should have
 * turned money into a number.
 */
export function formatMinor(minorUnits: string): string {
  const negative = minorUnits.startsWith('-');
  const digits = (negative ? minorUnits.slice(1) : minorUnits).padStart(
    MINOR_UNIT_DIGITS + 1,
    '0',
  );

  const major = digits.slice(0, -MINOR_UNIT_DIGITS);
  const minor = digits.slice(-MINOR_UNIT_DIGITS);

  const decimal = `${negative ? '-' : ''}${major}.${minor}`;

  // Intl.NumberFormat accepts a decimal string, so we get grouping and the
  // currency symbol without the value ever passing through a float. The cast
  // is only to satisfy StringNumericLiteral, a template literal type no
  // computed string can be assigned to however well formed it is.
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: CURRENCY,
  }).format(decimal as `${number}`);
}

/**
 * Turns what someone typed into what the API accepts: "12.34" becomes "1234".
 * Splitting and padding rather than multiplying by 100, because
 * `parseFloat('0.29') * 100` is 28.999999999999996 and that is a lost penny.
 *
 * Returns null for anything unusable, including zero, so a form can say so
 * without a round trip.
 */
export function parseMajorToMinor(input: string): string | null {
  const trimmed = input.trim();
  if (!MAJOR_AMOUNT.test(trimmed)) return null;

  const [major = '', minor = ''] = trimmed.split('.');
  const digits = `${major}${minor.padEnd(MINOR_UNIT_DIGITS, '0')}`;

  // The server's amountMinor regex is /^[1-9][0-9]*$/, so "0012" would be
  // rejected as readily as "0".
  const withoutLeadingZeros = digits.replace(/^0+/, '');
  return withoutLeadingZeros === '' ? null : withoutLeadingZeros;
}
