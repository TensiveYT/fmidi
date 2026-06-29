const util = {
	math: {
		freq: (note: number) => 440 * Math.pow(2, (note - 69) / 12),
		lerp: (a: number, b: number, t: number) => a + (b - a) * t,
		transpose: (data: Int16Array, root: number, note: number): Int16Array => {
			let diff = note - root
			let ratio = 2 ** (diff / 12)
			let len = Math.floor(data.length / ratio)
			let out = new Int16Array(new SharedArrayBuffer(Int16Array.BYTES_PER_ELEMENT * len))
			for (let i = 0; i < len; i++) {
				const pos = i * ratio
				const j = pos | 0
				const t = pos - j
				const a = data[j]
				const b = data[j + 1] ?? a
				out[i] = a + (b - a) * t
			}
			return out
		},
		resample: (data: Int16Array, orate: number, rate: number): Int16Array => {
			const ratio = orate / rate
			const len = ((data.length * rate) / orate) | 0
			const out = new Int16Array(new SharedArrayBuffer(Int16Array.BYTES_PER_ELEMENT * len))

			for (let i = 0; i < len; i++) {
				const pos = i * ratio
				const j = pos | 0
				const t = pos - j

				const a = data[j]
				const b = data[j + 1] ?? a

				out[i] = a + (b - a) * t
			}

			return out
		},
	}
}
export default util