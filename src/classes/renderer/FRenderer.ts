/* import: libraries */
import path             from 'node:path'
import fs               from 'node:fs'
import os               from 'node:os'
import url              from 'node:url'
import sf2 from 'soundfont2'

/* import: local classes */
import { FParser } from '../parser/FParser.js'
import { FRendererStream } from './FRendererStream.js'
import { FAudioLimiterEffect } from '../audio/effect/FAudioLimiterEffect.js'
import { FAudioHardClipEffect } from '../audio/effect/FAudioHardClipEffect.js'

/* import: local interfaces */
import { FRendererOptions } from '../../interfaces/renderer/FRendererOptions.js'
import { FRendererSoundfontKey } from '../../interfaces/soundfont/FRendererSoundfontKey.js'
import { FRendererThread } from '../../interfaces/renderer/FRendererThread.js'

/* import: local libraries */
import util from '../../libs/util.js'

/* import: classes */
import { Worker }       from 'node:worker_threads'

const __filename = url.fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)

/* code */
export class FRenderer {
	parser: FParser
	stream: FRendererStream
	soundfont: sf2.SoundFont2 | undefined
	keyCache: FRendererSoundfontKey[]
	options: FRendererOptions

	constructor(options?: FRendererOptions) {
		this.parser = new FParser()
		this.stream = new FRendererStream()

		this.keyCache = []
		this.options = {
			volume: options?.volume ?? 1.0,
			sampleRate: options?.sampleRate ?? 48000,
			threads: {
				loader: options?.threads?.loader ?? Math.max(1, os.availableParallelism() - 1),
				renderer: options?.threads?.renderer ?? Math.min(16, Math.max(1, os.availableParallelism() - 1))
			}
		}

		if (this.options.threads?.renderer! > 16)
			throw new RangeError(`Can't allocate more than 16 threads to the renderer.`)

		this.parser.parseThreads = this.options.threads?.loader!
	}

	async load(dir: string) {
		await this.parser.loadFile(dir)
	}

	buildStream() {
		if (!this.parser.trackCount)
			return

		this.stream.reset()

		let trackCount = this.parser.trackCount
		let tracks = this.parser.tracks

		for (let h = 0; h < trackCount; h++) {
			let track = tracks[h]
			let buffer = new Uint8Array(track.packedBuffer)

			for (let i = 0; i < buffer.length; i += 8) {
				let tick = (
					(buffer[i    ] << 0x18) |
					(buffer[i + 1] << 0x10) |
					(buffer[i + 2] << 0x08) |
					(buffer[i + 3]        )
				)
				let eventType = buffer[i + 4]
				let channel = buffer[i + 5]
				
				switch (eventType) {
					case 0x08: // note off
					case 0x09: // note on
						let note = buffer[i + 6]
						let velocity = buffer[i + 7]
						this.stream.write(this.parser.getMillisecondsAtTick(tick), [
							(eventType << 4) | channel, // rebuild status
							note,
							velocity
						])
						break
				}
			}
		}
	}

	setSoundfont(dir: string) {
		let buffer = fs.readFileSync(dir)
		let array  = new Uint8Array(buffer)
		this.soundfont = new sf2.SoundFont2(array)

		this.buildKeyCache()
	}

	buildKeyCache() {
		if (!this.soundfont)
			return

		for (let note = 0; note < 128; note++) {
			let key = this.soundfont.getKeyData(note)

			if (!key)
				continue // for now

			let root = key.generators[58]?.value ?? key.sample.header.originalPitch ?? 60
			let fine = (key.generators[52]?.value ?? 0) + (key.sample.header.pitchCorrection ?? 0)
			let coarse = key.generators[51]?.value ?? 0
			let rate = key.sample.header.sampleRate
			let pcm = util.math.resample(
				util.math.transpose(
					key.sample.data, 
					(root - fine / 100) - coarse, 
					note
				), 
				rate, 
				this.options.sampleRate!
			)

			this.keyCache[note] = {
				pcm,
				envelope: {
					attack : 0.005, // for now
					release: 0.25  // for now
				}
			}
		}
		
	}

	render() {
		return new Promise(async(res, rej) => {
			if (!this.parser.trackCount)
				return

			let sampleRate = this.options?.sampleRate!

			this.buildStream()
			let outArrayBuffer = new SharedArrayBuffer(Float32Array.BYTES_PER_ELEMENT * Math.floor((this.parser.songTime + 1) * sampleRate))
			let out = new Float32Array(outArrayBuffer)

			const threadCount = this.options.threads?.renderer!
			const events = this.stream.events

			const base = Math.floor(events.length / threadCount)
			let extra = events.length % threadCount

			let threads: FRendererThread[] = []

			let index = 0

			for (let i = 0; i < threadCount; i++) {
				const size = base + (extra > 0 ? 1 : 0)
				extra--

				const chunk = events.slice(index, index + size)
				index += size

				let worker = new Worker(path.join(__dirname, '../../threads/renderer/frenderer_thread.js'), {
					workerData: {
						events: chunk,
						options: this.options
					}
				})

				worker.postMessage({ message: 'start', out, keyCache: this.keyCache })
				threads.push({
					worker,
					promise: new Promise(finished => {
						worker.on('message', e => {
							console.log(`thread ${i} -> all done!`)
							switch (e.message) {
								case 'all done!':
									worker.terminate()
									finished(null)
									break
							}
						})
					})
				})
			}
			
			await Promise.all(threads.map(t => t.promise))
		
			let limiter = new FAudioLimiterEffect()
			let clipper = new FAudioHardClipEffect

			for (let i = 0; i < out.length; i++) {
				let y = clipper.in(limiter.in(out[i]))
				out[i] = Number.isNaN(y) ? 0 : y
			}

			res(out)
		})
	}
}