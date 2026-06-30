/* import: local libraries */
import util from '../../libs/util.js'

/* import: modules */
import { workerData, parentPort } from 'node:worker_threads'

let controlChangeMap: Record<number, number[]> = {
	0x07: Array(16).fill(100),
	0x0b: Array(16).fill(127)
}

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
							let c07 = controlChangeMap[0x07][event.channel]
							let c11 = controlChangeMap[0x0b][event.channel]

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
									let ccv = (c07 / 128) * (c11 / 128) // volume from control changes

									let y = (sample / 32768) * env * vol * ccv

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
						/* to be added later
						case 'control_change':
							switch (event.number) {
								case 0x07: // volume
									controlChangeMap[0x07] = event.value
									break
								case 0x11: // expression
									controlChangeMap[0x0b] = event.value
									break
							}
							break
						*/
					}
					
				}
			}
			parentPort!.postMessage({ message: 'all done!' });
			break
	}
})