// float: typed array
const f32	= new Float32Array([ -0 ])
const f8b	= new Uint8Array(f32.buffer)
const le	= f8b[3] === 128

function writeFloatF32Cpy (val: number, buf: Uint8Array, pos: number) {
	f32[0] = val
	buf[pos    ] = f8b[0]
	buf[pos + 1] = f8b[1]
	buf[pos + 2] = f8b[2]
	buf[pos + 3] = f8b[3]
}

function writeFloatF32Rev (val: number, buf: Uint8Array, pos: number) {
	f32[0] = val
	buf[pos    ] = f8b[3]
	buf[pos + 1] = f8b[2]
	buf[pos + 2] = f8b[1]
	buf[pos + 3] = f8b[0]
}

/**
 * Writes a 32 bit float to a buffer using little endian byte order.
 * @name writeFloatLE
 * @function
 * @param {number} val Value to write
 * @param {Uint8Array} buf Target buffer
 * @param {number} pos Target buffer offset
 * @returns {undefined}
 */
const writeFloatLE = le ? writeFloatF32Cpy : writeFloatF32Rev

/**
 * Writes a 32 bit float to a buffer using big endian byte order.
 * @name writeFloatBE
 * @function
 * @param {number} val Value to write
 * @param {Uint8Array} buf Target buffer
 * @param {number} pos Target buffer offset
 * @returns {undefined}
 */
const writeFloatBE = le ? writeFloatF32Rev : writeFloatF32Cpy


function readFloatF32Cpy (buf: Uint8Array, pos: number) {
	f8b[0] = buf[pos    ]
	f8b[1] = buf[pos + 1]
	f8b[2] = buf[pos + 2]
	f8b[3] = buf[pos + 3]
	return f32[0]
}

function readFloatF32Rev (buf: Uint8Array, pos: number) {
	f8b[3] = buf[pos    ]
	f8b[2] = buf[pos + 1]
	f8b[1] = buf[pos + 2]
	f8b[0] = buf[pos + 3]
	return f32[0]
}

/**
 * Reads a 32 bit float from a buffer using little endian byte order.
 * @name readFloatLE
 * @function
 * @param {Uint8Array} buf Source buffer
 * @param {number} pos Source buffer offset
 * @returns {number} Value read
 */
const readFloatLE = le ? readFloatF32Cpy : readFloatF32Rev

/**
 * Reads a 32 bit float from a buffer using big endian byte order.
 * @name readFloatBE
 * @function
 * @param {Uint8Array} buf Source buffer
 * @param {number} pos Source buffer offset
 * @returns {number} Value read
 */
const readFloatBE = le ? readFloatF32Rev : readFloatF32Cpy

export  { writeFloatLE
	, writeFloatBE
	, readFloatLE
	, readFloatBE }
