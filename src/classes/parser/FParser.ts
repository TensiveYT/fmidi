// 'THE BEER-WARE LICENSE' (Revision 42):
// <me@seq.wtf> wrote this file.
// As long as you retain this notice you can do whatever you want with this stuff.
// If we meet some day, and you think this stuff is worth it, you can buy me a beer in return.
// - James

/*
	yes, this code is originally from James
	if this hadn't existed, i may've used ToneJS, as puke-inducing as that may sound
	i'm only using this 'cause of how speedy it is
		- Tensive
*/

/* import: classes */
import { EventEmitter } from 'node:events'
import { Worker }       from 'node:worker_threads'

/* import: libraries */
import path             from 'node:path'
import fs               from 'node:fs'
import os               from 'node:os'
import url              from 'node:url'

/* import: local interfaces */
import { FParserTrack } from '../../interfaces/parser/FParserTrack.js'
import { FParserThreadResponse } from '../../interfaces/parser/FParserThreadResponse.js'
import { FParserTempoEvent } from '../../interfaces/parser/FParserTempoEvent.js'

/* import: local constants */
import { HEADER_LENGTH } from '../../modules/parser/fparser_constants.js'
import { DEFAULT_TEMPO } from '../../modules/parser/fparser_constants.js'
import { EVENT_SIZE    } from '../../modules/parser/fparser_constants.js'

const __filename = url.fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)

/* code */
export class FParser extends EventEmitter {
	// midi properties
	#format: number | null = null
	#numTracks: number | null = null
	#ppqn: number | null = 0
	#trackOffsets: number[] = []
	#tempoEvents: FParserTempoEvent[] = []
	#tempoEventsB: FParserTempoEvent[][] = []
	#tempoMap: FParserTempoEvent[] = []

	// playback state
	#isPlaying = false
	#trackEventPointers = []
	#playLoopInterval = null
	#startTick = 0
	#startTime = 0
	#sampleRate = 5 // ms

	// loading state & file data
	#isLoading = false
	#tracksParsed = 0
	#totalEvents = 0
	#totalTicks = 0
	#songTime = 0
	#tracks: FParserTrack[] = []
	#midiChunksByteLength = 0

	// configurable properties
	#parseThreads = 1
	get parseThreads() {
		return this.#parseThreads
	}
	set parseThreads(v) {
		this.#parseThreads = v
		this.setMaxListeners(this.#parseThreads * 2)
	}
	

	constructor() {
		super()

		this.setMaxListeners(this.#parseThreads * 2)
	}

	#load(buffer: SharedArrayBuffer, readTime: number) {
		return new Promise((resolve, reject) => {
			const start = performance.now()
			try {
				// reset state
				this.unload()
				this.#isLoading = true // re-set the flag

				const buf = Buffer.from(buffer)

				// HEADER

				// sanity check: valid midi?
				const magic = buf.readUint32BE(0)
				if (magic !== 0x4d546864) {
					// MThd
					throw new Error(`Invalid MIDI magic! Expected 4d546864, got ${magic.toString(16).padStart(8, '0')}.`)
				}

				const length = buf.readUint32BE(4)
				if (length !== 6) {
					throw new Error(`Invalid header length! Expected 6, got ${length}.`)
				}

				this.#format = buf.readUint16BE(8)
				this.#numTracks = buf.readUint16BE(10)
				this.#tracks.length = this.#numTracks

				if (this.#format === 0 && this.#numTracks > 1) {
					throw new Error(`Invalid track count! Format 0 MIDIs should only have 1 track, got ${this.#numTracks}.`)
				}

				if (this.#format >= 2) {
					throw new Error(`Unsupported MIDI format: ${this.#format}.`)
				}

				this.#ppqn = buf.readUint16BE(12)

				if (this.#ppqn === 0) {
					throw new Error(`Invalid PPQN/division value!`)
				}

				if ((this.#ppqn & 0x8000) !== 0) {
					throw new Error(`SMPTE timecode format is not supported!`)
				}

				// TRACK OFFSETS

				this.#trackOffsets = new Array(this.#numTracks)
				let currentOffset = HEADER_LENGTH

				for (let i = 0; i < this.#numTracks; ++i) {
					if (currentOffset >= buf.length) {
						throw new Error(`Reached EOF while looking for track ${i}. Tracks reported in header: ${this.#numTracks}.`)
					}

					const trackMagic = buf.readUint32BE(currentOffset)

					if (trackMagic !== 0x4d54726b) {
						// MTrk
						throw new Error(`Invalid track ${i} magic! Expected 4d54726b, got ${trackMagic.toString(16).padStart(8, '0')}.`)
					}

					const trackLength = buf.readUint32BE(currentOffset + 4)
					this.#trackOffsets[i] = currentOffset
					currentOffset += trackLength + 8
				}
				this.#midiChunksByteLength = currentOffset

				// SPAWN WORKERS

				this.#totalTicks = 0
				this.#tracksParsed = 0

				const tracksWithSize = this.#trackOffsets.map((offset, index) => ({ index, length: buf.readUint32BE(offset + 4) }))
				tracksWithSize.sort((a, b) => b.length - a.length)

				const numWorkers = Math.min(this.#parseThreads, this.#numTracks)
				let workersFinished = 0

				const workerTrackIndices: number[][] = Array.from({ length: numWorkers }, () => [])
				const workerLoads: number[] = new Array(numWorkers).fill(0)

				for (const track of tracksWithSize) {
					let minLoad = Infinity
					let minIndex = -1
					for (let i = 0; i < numWorkers; ++i) {
						if (workerLoads[i] < minLoad) {
							minLoad = workerLoads[i]
							minIndex = i
						}
					}

					workerTrackIndices[minIndex].push(track.index)
					workerLoads[minIndex] += track.length
				}

				for (let i = 0; i < numWorkers; ++i) {
					const trackIndices = workerTrackIndices[i]

					if (trackIndices.length === 0) continue

					const worker = new Worker(path.resolve(__dirname, '../../threads/parser/fparser_thread.js'), {
						workerData: {
							buffer: buffer,
							trackIndices,
							trackOffsets: this.#trackOffsets,
						},
					})

					// if a worker errors out, kill the rest
					const terminateWorker = () => {
						if ((worker as any).active) worker.terminate()
					}

					this.on('terminateWorkers', terminateWorker)

					worker.on('online', () => ((worker as any).active = true))

					worker.on('message', (t: FParserThreadResponse) => {
						this.#tracks[t.trackIndex] = {
							packedBuffer: t.packedBuffer,
							eventCount: t.packedBuffer ? t.packedBuffer.byteLength / EVENT_SIZE : 0,
							view: t.packedBuffer ? new DataView(t.packedBuffer) : null,
						}
						this.#totalTicks = Math.max(this.#totalTicks, t.totalTicks)
						this.#tempoEventsB.push(t.tempoEvents)
						++this.#tracksParsed
					})

					worker.on('error', e => {
						this.unload()
						reject(e)
					})

					worker.on('exit', (code) => {
						this.off('terminateWorkers', terminateWorker)
						worker.removeAllListeners()
						;(worker as any).active = false
						if (!this.#isLoading) return // error cascade

						if (code !== 0) {
							this.unload()
							reject(new Error(`Worker stopped with exit code ${code}.`))
							return
						}

						++workersFinished

						if (workersFinished === numWorkers) {
							this.#isLoading = false
							this.#tempoEvents = this.#tempoEventsB.flat()
							this.#calculateSongTime()
							this.#totalEvents = this.#tracks.map((t) => t?.eventCount || 0).reduce((a, b) => a + b, 0)
							this.emit('fileLoaded')
							;(buffer as any) = null
							resolve([readTime, performance.now() - start])
						}
					})
				}
			} catch (e) {
				this.unload()
				reject(e)
			}
		})
	}

	async loadFile(filePath: string) {
		const start = performance.now()
		this.#isLoading = true
		// node.js (libuv) has a 2 GiB I/O limit, so readFile would break here.
		// instead, we have to jump through hoops with ReadStreams.
		const fileHandle = await fs.promises.open(filePath)
		const stats = await fileHandle.stat()
		const buffer = new SharedArrayBuffer(stats.size)
		const view = Buffer.from(buffer)

		let i = 0
		for await (const chunk of fileHandle.createReadStream()) {
			view.set(chunk, i)
			i += chunk.byteLength
		}

		await fileHandle.close()

		return this.#load(buffer, performance.now() - start)
	}

	async loadArrayBuffer(arrbuf: ArrayBuffer | SharedArrayBuffer) {
		const start = performance.now()
		this.#isLoading = true
		let buffer
		if (arrbuf instanceof SharedArrayBuffer) {
			buffer = arrbuf
		} else {
			buffer = new SharedArrayBuffer(arrbuf.byteLength)
			new Uint8Array(buffer).set(new Uint8Array(arrbuf))
		}

		return this.#load(buffer, performance.now() - start)
	}

	unload() {
		if (this.#isLoading) {
			this.#isLoading = false
			this.emit('terminateWorkers')
		}

		this.#format = null
		this.#numTracks = 0
		this.#ppqn = null
		this.#tracks = []
		this.#trackOffsets = []
		this.#tempoEvents = []
		this.#tempoEventsB = []

		this.#tracksParsed = 0
		this.#totalEvents = 0
		this.#totalTicks = 0
		this.#songTime = 0
		this.#midiChunksByteLength = 0
		
		this.#trackEventPointers = []

		if (global.gc) global.gc()

		this.emit('unloaded')
	}

	getMillisecondsAtTick(tick: number): number {
		if (tick <= 0) return 0
		if (!this.#ppqn) throw new Error('No MIDI loaded.')

		this.#tempoEvents.sort((a, b) => a.tick - b.tick)

		const tempoMap = this.#tempoMap

		let totalMs = 0

		for (let i = 0; i < tempoMap.length; ++i) {
			const segmentStart = tempoMap[i].tick
			const segmentEnd = Math.min(
				i < tempoMap.length - 1 ? tempoMap[i + 1].tick : tick,
				tick
			)

			if (segmentEnd <= segmentStart) break

			totalMs += ((segmentEnd - segmentStart) * (tempoMap[i].uspq / 1000)) / this.#ppqn

			if (segmentEnd === tick) break
		}

		return totalMs
	}

	#calculateSongTime() {
		this.#tempoEvents.sort((a, b) => a.tick - b.tick)

		const tempoMap = [{ tick: 0, uspq: DEFAULT_TEMPO }]

		for (const event of this.#tempoEvents) {
			const lastTempo = tempoMap[tempoMap.length - 1]
			if (event.tick === lastTempo.tick) {
				lastTempo.uspq = event.uspq
			} else {
				tempoMap.push(event)
			}
		}
		this.#tempoMap = tempoMap

		let totalMs = 0

		for (let i = 0; i < tempoMap.length; ++i) {
			const currentTempo = tempoMap[i].uspq

			const nextTick = i < tempoMap.length - 1 ? tempoMap[i + 1].tick : this.#totalTicks
			const ticksInSegment = nextTick - tempoMap[i].tick

			if (ticksInSegment > 0) totalMs += (ticksInSegment * (currentTempo / 1000)) / this.#ppqn!
		}

		this.#songTime = totalMs / 1000
	}

	get isLoading() {
		return this.#isLoading
	}

	get trackCount() {
		return this.#numTracks
	}

	get tracksParsed() {
		return this.#tracksParsed
	}

	get songTime() {
		return this.#songTime
	}

	get ppqn() {
		return this.#ppqn
	}

	get totalEvents() {
		return this.#totalEvents
	}

	get totalTicks() {
		return this.#totalTicks
	}

	get tracks() {
		return this.#tracks
	}
}