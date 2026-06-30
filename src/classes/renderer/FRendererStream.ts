/* import: local types */
import { FRendererStreamEvent } from '../../types/renderer/FRendererStreamEvent.js'

/* code */
export class FRendererStream {
	events: FRendererStreamEvent[][]
	
	map: Map<number, Map<number, { time: number, velocity: number }[]>>
	constructor() {
		this.events = []
		this.map = new Map()

		this.reset()
	}
	write(time: number, data: number[]) {
		let status = data[0]
		let eventType = status >> 4
		let channel = status & 0x0f

		let noteOn = (note: number, velocity: number) => {
			// it's a note on, so we simply add the note to the map
			this.map.get(channel)?.get(note)?.push({
				time,
				velocity
			})
		}

		let noteOff = (note: number) => {
			// it's a note off, so we add a note to `this.events` if this note is on
			let ch = this.map.get(channel)
			let noteOn = ch?.get(note)?.pop()!

			this.events[channel].push({
				type: 'note',
				time: noteOn.time,
				duration: time - noteOn.time,
				channel,
				note,
				velocity: noteOn?.velocity
			})
		}

		switch (eventType) {
			case 0x08: // note off
				noteOff(data[1])
				break
			case 0x09: // note on
				noteOn(data[1], data[2])
				break
			case 0x0b: // control change
				this.events[channel].push({
					type: 'control_change',
					time: time,
					channel,
					number: data[1],
					value: data[2]
				})
				break
		}
	}
	reset() {
		// clear events array
		this.events = []

		// for each channel
		for (let i = 0; i < 16; i++) {
			// add an empty array to the events array
			this.events.push([])

			// set the channel to an empty map
			this.map.set(i, new Map())

			// for each note
			for (let j = 0; j < 128; j++) {
				// set this note to an empty array
				this.map.get(i)?.set(j, [])
			}
		}
	}
}