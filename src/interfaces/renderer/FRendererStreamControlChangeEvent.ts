/* declaration */
export interface FRendererStreamControlChangeEvent {
	type: 'control_change'
	time: number
	channel: number
	number: number
	value: number
}