/* declaration */
export interface FRendererStreamNoteEvent {
	type: 'note'
	time: number
	duration: number
	channel: number
	note: number
	velocity: number
}