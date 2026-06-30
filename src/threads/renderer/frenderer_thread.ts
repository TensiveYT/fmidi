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
					if (time >= out.length) 
						break

					switch (event.type) {
						case 'note':
							let duration = Math.floor((event.duration / 1000) * sampleRate)
							let vel = event.velocity / 128
							let vol = (vel * vel) * options.volume

							if (keyCache.length !== 0) {
								let key = keyCache[event.note]
								if (!key)
									continue

								let attackLength = Math.floor(key.envelope.attack * sampleRate)
								let releaseLength = Math.floor(key.envelope.release * sampleRate)

								// max out iteration count to avoid checking for boundaries every sample
								let maxLen = Math.max(0, out.length - time)
								let iterationCount = Math.min(duration + releaseLength, key.pcm.length, maxLen)

								for (let i = 0; i < iterationCount; i++) {
									let sample = key.pcm[i]
									
									let atk = Math.min(i / attackLength, 1)
									let rel = i < duration ? 1 : 1 - Math.max(0, i - duration) / releaseLength
									// no decay, for now

									let env = (atk * atk) * (rel * rel) // attack, decay, and release mixed

									let y = (sample / 32768) * env * vol

									// add value to output
									out[time + i] += y
								}
							} else {
								let freq = util.math.freq(event.note)

								// max out iteration count to avoid checking for boundaries every sample
								let maxLen = Math.max(0, out.length - time)
								let iterationCount = Math.min(duration, maxLen)

								for (let i = 0; i < iterationCount; i++) {
									let y = Math.sin((i * 2 * Math.PI * freq) / sampleRate) * vol

									// add value to output
									out[time + i] += y
								}
							}
							break
					}
					
				}
			}
			parentPort!.postMessage({ message: 'all done!' });
			break
	}
})