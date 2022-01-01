// double: typed array
const f64	= new Float64Array([ -0 ])
const f8b	= new Uint8Array(f64.buffer)
const le	= f8b[7] === 128

function writeDoubleF64Cpy (val: number, buf: Uint8Array, pos: number) {
	f64[0] = val
	buf[pos    ] = f8b[0]
	buf[pos + 1] = f8b[1]
	buf[pos + 2] = f8b[2]
	buf[pos + 3] = f8b[3]
	buf[pos + 4] = f8b[4]
	buf[pos + 5] = f8b[5]
	buf[pos + 6] = f8b[6]
	buf[pos + 7] = f8b[7]
}

function writeDoubleF64Rev (val: number, buf: Uint8Array, pos: number) {
	f64[0] = val
	buf[pos    ] = f8b[7]
	buf[pos + 1] = f8b[6]
	buf[pos + 2] = f8b[5]
	buf[pos + 3] = f8b[4]
	buf[pos + 4] = f8b[3]
	buf[pos + 5] = f8b[2]
	buf[pos + 6] = f8b[1]
	buf[pos + 7] = f8b[0]
}

/**
 * Writes a 64 bit double to a buffer using little endian byte order.
 * @name writeDoubleLE
 * @function
 * @param {number} val Value to write
 * @param {Uint8Array} buf Target buffer
 * @param {number} pos Target buffer offset
 * @returns {undefined}
 */
const writeDoubleLE = le ? writeDoubleF64Cpy : writeDoubleF64Rev

/**
 * Writes a 64 bit double to a buffer using big endian byte order.
 * @name writeDoubleBE
 * @function
 * @param {number} val Value to write
 * @param {Uint8Array} buf Target buffer
 * @param {number} pos Target buffer offset
 * @returns {undefined}
 */
const writeDoubleBE = le ? writeDoubleF64Rev : writeDoubleF64Cpy


function readDoubleF64Cpy (buf: Uint8Array, pos: number) {
	f8b[0] = buf[pos    ]
	f8b[1] = buf[pos + 1]
	f8b[2] = buf[pos + 2]
	f8b[3] = buf[pos + 3]
	f8b[4] = buf[pos + 4]
	f8b[5] = buf[pos + 5]
	f8b[6] = buf[pos + 6]
	f8b[7] = buf[pos + 7]
	return f64[0]
}

function readDoubleF64Rev (buf: Uint8Array, pos: number) {
	f8b[7] = buf[pos    ]
	f8b[6] = buf[pos + 1]
	f8b[5] = buf[pos + 2]
	f8b[4] = buf[pos + 3]
	f8b[3] = buf[pos + 4]
	f8b[2] = buf[pos + 5]
	f8b[1] = buf[pos + 6]
	f8b[0] = buf[pos + 7]
	return f64[0]
}

/**
 * Reads a 64 bit double from a buffer using little endian byte order.
 * @name readDoubleLE
 * @function
 * @param {Uint8Array} buf Source buffer
 * @param {number} pos Source buffer offset
 * @returns {number} Value read
 */
const readDoubleLE = le ? readDoubleF64Cpy : readDoubleF64Rev

/**
 * Reads a 64 bit double from a buffer using big endian byte order.
 * @name readDoubleBE
 * @function
 * @param {Uint8Array} buf Source buffer
 * @param {number} pos Source buffer offset
 * @returns {number} Value read
 */
const readDoubleBE = le ? readDoubleF64Rev : readDoubleF64Cpy

export  { writeDoubleLE
	, writeDoubleBE
	, readDoubleLE
	, readDoubleBE }
