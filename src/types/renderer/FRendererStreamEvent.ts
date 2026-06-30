/* import: local interfaces */
import { FRendererStreamControlChangeEvent } from '../../interfaces/renderer/FRendererStreamControlChangeEvent.js'
import { FRendererStreamNoteEvent } from '../../interfaces/renderer/FRendererStreamNoteEvent.js'

/* declaration */
export type FRendererStreamEvent =
	| FRendererStreamNoteEvent
	| FRendererStreamControlChangeEvent