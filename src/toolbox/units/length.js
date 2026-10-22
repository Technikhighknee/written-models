/**
 * All lengths are converted to meters.
 * 1 world unit = 1 meter
 */

export const mm = value => value / 1000;
export const cm = value => value / 100;
export const m = value => value;
export const km = value => value * 1000;

// Aliases; not sure if I will ever use them; they're cool tho ^^
export const millimeter = value => mm(value);
export const centimeter = value => cm(value);
export const meter = value => m(value);
export const kilometer = value => km(value);

// Let's see if the inaccuracy of floating-point arithmetic will throw a wrench in my plans :D
