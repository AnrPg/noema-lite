/** Text of values whose type is not known (thrown things, JSON from outside, a message's parameters). */

/**
 * Any value as text, exactly as `String(x)` renders it: a string as it is, numbers and booleans in their usual form, an
 * array joined by commas, an object by its own `toString` (an Error's "Name: message", a URL's address, a plain object's
 * "[object Object]"). For the places that must show an unknown value whatever it is.
 */
export function textOf(x: unknown): string {
  // eslint-disable-next-line @typescript-eslint/no-base-to-string -- the value's kind is unknown by design: String()'s own rendering (an object's toString included) is the text wanted
  return String(x);
}
