/* declaration */
export interface FRendererSoundfontKey {
	pcm: Int16Array
	envelope: {
		attack: number
		release: number
	}
}