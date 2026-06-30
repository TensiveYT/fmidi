/* import: local libraries */
import MathExt from '../../libs/mathext/index.js'
import util from '../../libs/util.js'

/* import: modules */
import { workerData, parentPort } from 'node:worker_threads'

/* code */
let cache = {
	pcmScale: 1 / 32768
}

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
								let holdLength = duration
								let releaseLength = Math.floor(key.envelope.release * sampleRate)

								let available = MathExt.min(out.length - time, key.pcm.length)

								let attackIterationCount = MathExt.max(attackLength, available)
								let holdIterationCount = MathExt.max(holdLength, available - attackIterationCount)
								let releaseIterationCount = MathExt.max(releaseLength, available - attackIterationCount - holdIterationCount)

								// attack
								for (let i = 0; i < attackIterationCount; i++) {
									let j = i

									let sample = key.pcm[j]
									
									let atk = i / attackLength
									let env = (atk * atk)

									let y = (sample * cache.pcmScale) * env * vol

									// add value to output
									out[time + j] += y
								}

								// hold
								for (let i = 0; i < holdIterationCount; i++) {
									let j = i + attackLength

									let sample = key.pcm[j]

									let env = 1 // for now, until i add decay

									let y = (sample * cache.pcmScale) * env * vol

									// add value to output
									out[time + j] += y
								}

								// release
								for (let i = 0; i < releaseIterationCount; i++) {
									let j = attackLength + holdLength + i

									let sample = key.pcm[j]
									
									let rel = 1 - (i / releaseLength)
									let env = (rel * rel)

									let y = (sample * cache.pcmScale) * env * vol

									// add value to output
									out[time + j] += y
								}
							} else {
								let freq = util.math.freq(event.note)

								// max out iteration count to avoid checking for boundaries every sample
								let maxLen = MathExt.min(out.length - time, 0)
								let iterationCount = MathExt.max(duration, maxLen)

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