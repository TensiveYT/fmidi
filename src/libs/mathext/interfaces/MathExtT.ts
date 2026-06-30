/* declaration */
export interface MathExtT {
	/**
	* Linearly interpolates between two values.
	*
	* @param start The value returned when `t` is `0`.
	* @param end The value returned when `t` is `1`.
	* @param factor The interpolation factor.
	* @returns The interpolated value.
	 */
	lerp(start: number, end: number, factor: number): number

	/**
	 * Caps a value at a maximum.
	 *
	 * If `value` is greater than `max`, `max` is returned.
	 * Otherwise, `value` is returned unchanged.
	 *
	 * @param value The value to limit.
	 * @param max The highest value that can be returned.
	 * @returns `value`, capped at `max`.
	 */
	max(value: number, max: number): number

	/**
	 * Raises a value to a minimum.
     *
     * If `value` is less than `min`, `min` is returned.
     * Otherwise, `value` is returned unchanged.
     *
     * @param value The value to limit.
     * @param min The lowest value that can be returned.
     * @returns `value`, raised to at least `min`.
	 */
	min(value: number, min: number): number

	/**
	 * Restricts a value to an inclusive range.
     *
     * Values below `min` are returned as `min`, and values above `max`
     * are returned as `max`.
     *
     * @param value The value to clamp.
     * @param min The lowest allowed value.
     * @param max The highest allowed value.
     * @returns The clamped value.
	 */
	clamp(value: number, min: number, max: number): number
}