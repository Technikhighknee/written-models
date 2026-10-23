/**
 * All lengths are converted to meters.
 * 1 world unit = 1 meter
 */

export const mm = value => value / 1000;
export const cm = value => value / 100;
export const m = value => value;
export const km = value => value * 1000;

// Aliases; not sure if I will ever use them; they're cool tho ^^
export const millimeter = mm;
export const centimeter = cm;
export const meter = m;
export const kilometer = km;

// Let's see if the inaccuracy of floating-point arithmetic will throw a wrench in my plans :D
