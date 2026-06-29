/* declaration */
export interface FParserTrack {
	packedBuffer: ArrayBuffer
	eventCount: number
	view: DataView<any> | null
}