/** Small types every port shares. */

/** Stops a subscription; calling it twice does nothing. */
export type Unsubscribe = () => void;

/** A JSON value (what crosses storage, the network and Worker boundaries as data). */
export type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };
