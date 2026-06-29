
/* import: local classes */
import { FAudioEffect } from './FAudioEffect.js'

/* import: local interfaces */
import { FAudioLimiterOptions } from '../../../interfaces/audio/effect/FAudioLimiterOptions.js'

/* code */
export class FAudioLimiterEffect extends FAudioEffect {
    options: FAudioLimiterOptions
    gain: number
    env: number
    constructor(options?: FAudioLimiterOptions) {
        super()
        this.gain = 1.0
        this.env = 0.0
        this.options = {
            attack: options?.attack ?? 0.002,
            release: options?.release ?? 0.08553,
            threshold: options?.threshold ?? 0.5,
            sampleRate: options?.sampleRate ?? 48000
        }
    }
    reset() {
        this.gain = 1.0
        this.env = 0.0
    }
    in(x: number): number {
        let attack  = Math.exp(-1.0 / (this.options.attack * this.options.sampleRate))
        let release = Math.exp(-1.0 / (this.options.release * this.options.sampleRate))

        this.env = Math.max(Math.abs(x), this.env * release)
        let targetGain = 1.0

        if (this.env > this.options.threshold)
            targetGain = this.options.threshold / this.env

        this.gain = this.gain * attack + targetGain * (1.0 - attack)

        return x * this.gain
    }
}