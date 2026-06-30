
/* import: local classes */
import { FAudioEffect } from './FAudioEffect.js'

/* import: local libraries */
import MathExt from '../../../libs/mathext/index.js'

/* code */
export class FAudioHardClipEffect {
	in(x: number) {
		let y = MathExt.clamp(x, -1, 1)

		return y
	}
}