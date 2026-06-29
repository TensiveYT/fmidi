/* import: local interfaces */
import { FParserTempoEvent } from './FParserTempoEvent.js'

/* declaration */
export interface FParserThreadResponse {
	trackIndex: number 
	packedBuffer: ArrayBuffer
	tempoEvents: FParserTempoEvent[]
	totalTicks: number
}