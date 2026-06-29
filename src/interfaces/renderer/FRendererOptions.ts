/* declaration */
export interface FRendererOptions {
	/**
	 * The volume of the renderer output.
	 * @default 0.5
	 */
	volume?: number
	/**
	 * The sample rate of the renderer output.
	 * @default 48000
	 */
	sampleRate?: number
	/**
	 * Worker thread options.
	 */
	threads?: {
		/**
		 * The amount of threads the parser will use.  
		 * Set to `1` for single-threaded mode.
		 */
		loader?: number
		/**
		 * The amount of threads the renderer will use.  
		 * Set to `1` for single-threaded mode.
		 * @default 16
		 */
		renderer?: number
	}
}