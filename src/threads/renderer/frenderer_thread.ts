/* import: local libraries */
import util from '../../libs/util.js'

/* import: modules */
import { workerData, parentPort } from 'node:worker_threads'

/* code */
parentPort!.on('message', e => {
	switch (e.message) {
		case 'start':
			let channels = workerData.events
			let options = workerData.options
			let sampleRate = options.sampleRate

			let out = e.out
			let keyCache = e.keyCache

			for (let events of channels) {
				for (let event of events) {
					let time = Math.floor((event.time / 1000) * sampleRate)
					let duration = Math.floor((event.duration / 1000) * sampleRate)

					if (time > out.length) break
					if (keyCache) {
						let key = keyCache[event.note]
						let attackLength = Math.floor(key.envelope.attack * sampleRate)
						let releaseLength = Math.floor(key.envelope.release * sampleRate)

						for (let i = 0; i < duration + releaseLength; i++) {
							if (time + i > out.length) break

							let sample = key.pcm[i]
							if (sample === undefined) break

							let vol = Math.pow(event.velocity / 128, 2) * options.volume!
							let atk = i >= time + attackLength ? 1 : Math.min(i / attackLength, 1)
							let rel = i >= duration ? 1 - Math.max(i - duration, 0) / releaseLength : 1
							// no decay, for now

							let env = Math.pow(atk, 2) * Math.pow(rel, 2) // attack, decay, and release mixed

							let y = (sample / 32768) * env * vol

							// add value to output
							out[time + i] += y
						}
					} else {
						for (let i = 0; i < duration; i++) {
							if (time + i > out.length) break

							let vol = Math.pow(event.velocity / 128, 2) * 0.5

							let y = Math.sin((i * 2 * Math.PI * util.math.freq(event.note)) / sampleRate) * vol

							// add value to output
							out[time + i] += y
						}
					}
				}
			}
			parentPort!.postMessage({ message: 'all done!' });
			break
	}
})