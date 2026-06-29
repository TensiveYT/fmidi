/* import: classes */
import { Worker } from 'node:worker_threads'

/* declaration */
export interface FRendererThread {
	worker: Worker
	promise: Promise<null>
}