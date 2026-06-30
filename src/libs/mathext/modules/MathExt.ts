import { MathExtT } from '../interfaces/MathExtT.js';

/* code */
export const MathExt: MathExtT = {
	lerp: (start: number, end: number, factor: number): number =>
		start + (end - start) * factor,

	max: (value: number, max: number): number =>
		value > max ? max : value,

	min: (value: number, min: number): number =>
		value < min ? min : value,

	clamp: (value: number, min: number, max: number): number =>
		value < min ? min : (value > max ? max : value)
}