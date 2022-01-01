import {
	readDoubleLE,
	readFloatLE,
	writeDoubleLE,
	writeFloatLE,
} from './float/mod.ts'

const SHIFT_LEFT_32 = (1 << 16) * (1 << 16)
const SHIFT_RIGHT_32 = 1 / SHIFT_LEFT_32

// Threshold chosen based on both benchmarking and knowledge about browser string
// data structures (which currently switch structure types at 12 bytes or more)
const TEXT_DECODER_MIN_LENGTH = 12

const unsigned = false


class ProtoBuf {
	static readonly Varint	= 0 // varint: int32, int64, uint32, uint64, sint32, sint64, bool, enum
	static readonly Fixed64	= 1 // 64-bit: double, fixed64, sfixed64
	static readonly Bytes	= 2 // length-delimited: string, bytes, embedded messages, packed repeated fields
	static readonly Fixed32	= 5 // 32-bit: float, fixed32, sfixed32
	
	buf	: Uint8Array
	pos	: number
	type	: number
	length	: number

	constructor(buf?: Uint8Array) {
		this.buf	= buf || new Uint8Array
		this.pos	= 0
		this.type	= 0
		this.length	= this.buf.length
	}

	destroy() {
		this.buf = new Uint8Array()
	}

	// === READING =================================================================

	readFields<T>(
		readField: (tag: number, result: T, pbf: ProtoBuf) => void,
		result: T,
		end = this.length,
	) {
		while (this.pos < end) {
			const val	= this.readVarint(unsigned)
			const tag	= val >> 3
			const startPos	= this.pos

			this.type = val & 0x7
			readField(tag, result, this)

			if (this.pos === startPos) this.skip(val)
		}
		return result
	}

	readMessage<T>(
		readField: (tag: number, result: T, pbf: ProtoBuf) => void,
		result: T,
	) {
		return this.readFields(
			readField,
			result,
			this.readVarint(unsigned) + this.pos,
		)
	}

	readFixed32() {
		const val = readUInt32(this.buf, this.pos)
		this.pos += 4
		return val
	}

	readSFixed32() {
		const val = readInt32(this.buf, this.pos)
		this.pos += 4
		return val
	}

	// 64-bit int handling is based on github.com/dpw/node-buffer-more-ints (MIT-licensed)

	readFixed64() {
		const val = readUInt32(this.buf, this.pos) + readUInt32(this.buf, this.pos + 4) * SHIFT_LEFT_32
		this.pos += 8
		return val
	}

	readSFixed64() {
		const val = readUInt32(this.buf, this.pos) + readInt32(this.buf, this.pos + 4) * SHIFT_LEFT_32
		this.pos += 8
		return val
	}

	readFloat() {
		const val = readFloatLE(this.buf, this.pos)
		this.pos += 4
		return val
	}

	readDouble() {
		const val = readDoubleLE(this.buf, this.pos)
		this.pos += 8
		return val
	}

	readVarint(isSigned: boolean) {
		const buf = this.buf
		let val
		let b

		b = buf[this.pos++]
		val  =  b & 0x7f
		if (b < 0x80) return val
		
		b = buf[this.pos++]
		val |= (b & 0x7f) << 7
		if (b < 0x80) return val
		
		b = buf[this.pos++]
		val |= (b & 0x7f) << 14
		if (b < 0x80) return val
		
		b = buf[this.pos++]
		val |= (b & 0x7f) << 21
		if (b < 0x80) return val

		b = buf[this.pos]
		val |= (b & 0x0f) << 28

		return readVarintRemainder(val, isSigned, this)
	}

	readVarint64() { // for compatibility with v2.0.1
		return this.readVarint(true)
	}

	readSVarint() {
		const num = this.readVarint(unsigned)
		return num % 2 === 1 ? (num + 1) / -2 : num / 2 // zigzag encoding
	}

	readBoolean() {
		return Boolean(this.readVarint(unsigned))
	}

	readString() {
		const end = this.readVarint(unsigned) + this.pos
		const pos = this.pos
		this.pos = end

		// longer strings are fast with the built-in browser TextDecoder API
		if (end - pos >= TEXT_DECODER_MIN_LENGTH) {
			return readUtf8TextDecoder(this.buf, pos, end)
		}

		// short strings are fast with our custom implementation
		return readUtf8(this.buf, pos, end)
	}

	readBytes() {
		const end = this.readVarint(unsigned) + this.pos
		const buffer = this.buf.subarray(this.pos, end)
		this.pos = end
		return buffer
	}

	// verbose for performance reasons doesn't affect gzipped size

	readPackedVarint(arr: Array<number>, isSigned: boolean) {
		if (this.type !== ProtoBuf.Bytes) {
			return arr.push(this.readVarint(isSigned))
		}
		const end = readPackedEnd(this)
		arr = arr || []
		while (this.pos < end) arr.push(this.readVarint(isSigned))
		return arr
	}

	readPackedSVarint(arr: Array<number>) {
		if (this.type !== ProtoBuf.Bytes) return arr.push(this.readSVarint())
		const end = readPackedEnd(this)
		arr = arr || []
		while (this.pos < end) arr.push(this.readSVarint())
		return arr
	}

	readPackedBoolean(arr: Array<boolean>) {
		if (this.type !== ProtoBuf.Bytes) return arr.push(this.readBoolean())
		const end = readPackedEnd(this)
		arr = arr || []
		while (this.pos < end) arr.push(this.readBoolean())
		return arr
	}

	readPackedFloat(arr: Array<number>) {
		if (this.type !== ProtoBuf.Bytes) return arr.push(this.readFloat())
		const end = readPackedEnd(this)
		arr = arr || []
		while (this.pos < end) arr.push(this.readFloat())
		return arr
	}

	readPackedDouble(arr: Array<number>) {
		if (this.type !== ProtoBuf.Bytes) return arr.push(this.readDouble())
		const end = readPackedEnd(this)
		arr = arr || []
		while (this.pos < end) arr.push(this.readDouble())
		return arr
	}

	readPackedFixed32(arr: Array<number>) {
		if (this.type !== ProtoBuf.Bytes) return arr.push(this.readFixed32())
		const end = readPackedEnd(this)
		arr = arr || []
		while (this.pos < end) arr.push(this.readFixed32())
		return arr
	}

	readPackedSFixed32(arr: Array<number>) {
		if (this.type !== ProtoBuf.Bytes) return arr.push(this.readSFixed32())
		const end = readPackedEnd(this)
		arr = arr || []
		while (this.pos < end) arr.push(this.readSFixed32())
		return arr
	}

	readPackedFixed64(arr: Array<number>) {
		if (this.type !== ProtoBuf.Bytes) return arr.push(this.readFixed64())
		const end = readPackedEnd(this)
		arr = arr || []
		while (this.pos < end) arr.push(this.readFixed64())
		return arr
	}

	readPackedSFixed64(arr: Array<number>) {
		if (this.type !== ProtoBuf.Bytes) return arr.push(this.readSFixed64())
		const end = readPackedEnd(this)
		arr = arr || []
		while (this.pos < end) arr.push(this.readSFixed64())
		return arr
	}

	skip(val: number) {
		const type = val & 0x7
		// deno-lint-ignore no-empty
		if	(type === ProtoBuf.Varint)	while (this.buf[this.pos++] > 0x7f) {}
		else if	(type === ProtoBuf.Bytes)	this.pos = this.readVarint(unsigned) + this.pos
		else if	(type === ProtoBuf.Fixed32)	this.pos += 4
		else if	(type === ProtoBuf.Fixed64)	this.pos += 8
		else throw new Error('Unimplemented type: ' + type)
	}

	// === WRITING =================================================================

	writeTag(tag: number, type: number) {
		this.writeVarint((tag << 3) | type)
	}

	realloc(min: number) {
		let length = this.length || 16

		while (length < this.pos + min) length *= 2

		if (length !== this.length) {
			const buf = new Uint8Array(length)
			buf.set(this.buf)
			this.buf = buf
			this.length = length
		}
	}

	finish() {
		this.length = this.pos
		this.pos = 0
		return this.buf.subarray(0, this.length)
	}

	writeFixed32(val: number) {
		this.realloc(4)
		writeInt32(this.buf, val, this.pos)
		this.pos += 4
	}

	writeSFixed32(val: number) {
		this.realloc(4)
		writeInt32(this.buf, val, this.pos)
		this.pos += 4
	}

	writeFixed64(val: number) {
		this.realloc(8)
		writeInt32(this.buf, val & -1, this.pos)
		writeInt32(this.buf, Math.floor(val * SHIFT_RIGHT_32), this.pos + 4)
		this.pos += 8
	}

	writeSFixed64(val: number) {
		this.realloc(8)
		writeInt32(this.buf, val & -1, this.pos)
		writeInt32(this.buf, Math.floor(val * SHIFT_RIGHT_32), this.pos + 4)
		this.pos += 8
	}

	writeVarint(val: number | boolean) {
		val = Number(val)

		if (val > 0xfffffff || val < 0) {
			writeBigVarint(val, this)
			return
		}

		this.realloc(4)

		this.buf[this.pos++] = ((val       ) & 0x7f) | (val > 0x7f ? 0x80 : 0)
		if (val <= 0x7f) return

		this.buf[this.pos++] = ((val >>>= 7) & 0x7f) | (val > 0x7f ? 0x80 : 0)
		if (val <= 0x7f) return

		this.buf[this.pos++] = ((val >>>= 7) & 0x7f) | (val > 0x7f ? 0x80 : 0)
		if (val <= 0x7f) return
		
		this.buf[this.pos++] = ((val >>>  7) & 0x7f)
	}

	writeSVarint(val: number) {
		this.writeVarint(val < 0 ? -val * 2 - 1 : val * 2)
	}

	writeBoolean(val: boolean) {
		this.writeVarint(val)
	}

	writeString(str: string) {
		this.realloc(str.length * 4)

		this.pos++ // reserve 1 byte for short string length

		const startPos = this.pos
		// write the string directly to the buffer and see how much was written
		this.pos = writeUtf8(this.buf, str, this.pos)
		const len = this.pos - startPos

		if (len >= 0x80) makeRoomForExtraLength(startPos, len, this)

		// finally, write the message length in the reserved place and restore the position
		this.pos = startPos - 1
		this.writeVarint(len)
		this.pos += len
	}

	writeFloat(val: number) {
		this.realloc(4)
		writeFloatLE(val, this.buf, this.pos)
		this.pos += 4
	}

	writeDouble(val: number) {
		this.realloc(8)
		writeDoubleLE(val, this.buf, this.pos)
		this.pos += 8
	}

	writeBytes(buffer: Uint8Array) {
		const len = buffer.length
		this.writeVarint(len)
		this.realloc(len)
		for (let i = 0; i < len; i++) this.buf[this.pos++] = buffer[i]
	}

	writeRawMessage<T>(fn: (obj: T, pbf: ProtoBuf) => void, obj: T) {
		this.pos++ // reserve 1 byte for short message length

		// write the message directly to the buffer and see how much was written
		const startPos = this.pos
		fn(obj, this)
		const len = this.pos - startPos

		if (len >= 0x80) makeRoomForExtraLength(startPos, len, this)

		// finally, write the message length in the reserved place and restore the position
		this.pos = startPos - 1
		this.writeVarint(len)
		this.pos += len
	}

	writeMessage<T>(
		tag: number,
		fn: (obj: T, pbf: ProtoBuf) => void,
		obj: T,
	) {
		this.writeTag(tag, ProtoBuf.Bytes)
		this.writeRawMessage(fn, obj)
	}

	writePackedBoolean	(tag: number, arr: Array<boolean>){ if (arr.length) this.writeMessage(tag, writePackedBoolean	, arr) }
	writePackedVarint	(tag: number, arr: Array<number>) { if (arr.length) this.writeMessage(tag, writePackedVarint	, arr) }
	writePackedSVarint	(tag: number, arr: Array<number>) { if (arr.length) this.writeMessage(tag, writePackedSVarint	, arr) }
	writePackedFloat	(tag: number, arr: Array<number>) { if (arr.length) this.writeMessage(tag, writePackedFloat	, arr) }
	writePackedDouble	(tag: number, arr: Array<number>) { if (arr.length) this.writeMessage(tag, writePackedDouble	, arr) }
	writePackedFixed32	(tag: number, arr: Array<number>) { if (arr.length) this.writeMessage(tag, writePackedFixed32	, arr) }
	writePackedSFixed32	(tag: number, arr: Array<number>) { if (arr.length) this.writeMessage(tag, writePackedSFixed32	, arr) }
	writePackedFixed64	(tag: number, arr: Array<number>) { if (arr.length) this.writeMessage(tag, writePackedFixed64	, arr) }
	writePackedSFixed64	(tag: number, arr: Array<number>) { if (arr.length) this.writeMessage(tag, writePackedSFixed64	, arr) }

	writeBytesField(tag: number, buffer: Uint8Array) {
		this.writeTag(tag, ProtoBuf.Bytes)
		this.writeBytes(buffer)
	}

	writeFixed32Field(tag: number, val: number) {
		this.writeTag(tag, ProtoBuf.Fixed32)
		this.writeFixed32(val)
	}

	writeSFixed32Field(tag: number, val: number) {
		this.writeTag(tag, ProtoBuf.Fixed32)
		this.writeSFixed32(val)
	}

	writeFixed64Field(tag: number, val: number) {
		this.writeTag(tag, ProtoBuf.Fixed64)
		this.writeFixed64(val)
	}

	writeSFixed64Field(tag: number, val: number) {
		this.writeTag(tag, ProtoBuf.Fixed64)
		this.writeSFixed64(val)
	}

	writeVarintField(tag: number, val: number | boolean) {
		this.writeTag(tag, ProtoBuf.Varint)
		this.writeVarint(val)
	}

	writeSVarintField(tag: number, val: number) {
		this.writeTag(tag, ProtoBuf.Varint)
		this.writeSVarint(val)
	}

	writeStringField(tag: number, str: string) {
		this.writeTag(tag, ProtoBuf.Bytes)
		this.writeString(str)
	}

	writeFloatField(tag: number, val: number) {
		this.writeTag(tag, ProtoBuf.Fixed32)
		this.writeFloat(val)
	}

	writeDoubleField(tag: number, val: number) {
		this.writeTag(tag, ProtoBuf.Fixed64)
		this.writeDouble(val)
	}

	writeBooleanField(tag: number, val: boolean) {
		this.writeVarintField(tag, Boolean(val))
	}
}

function readVarintRemainder(low: number, isSigned: boolean, pbf: ProtoBuf) {
	const buf = pbf.buf
	let high: number
	let b: number

	b = buf[pbf.pos++]
	high = (b & 0x70) >> 4
	if (b < 0x80) return toNum(low, high, isSigned)

	b = buf[pbf.pos++]
	high |= (b & 0x7f) << 3
	if (b < 0x80) return toNum(low, high, isSigned)

	b = buf[pbf.pos++]
	high |= (b & 0x7f) << 10
	if (b < 0x80) return toNum(low, high, isSigned)

	b = buf[pbf.pos++]
	high |= (b & 0x7f) << 17
	if (b < 0x80) return toNum(low, high, isSigned)

	b = buf[pbf.pos++]
	high |= (b & 0x7f) << 24
	if (b < 0x80) return toNum(low, high, isSigned)

	b = buf[pbf.pos++]
	high |= (b & 0x01) << 31
	if (b < 0x80) return toNum(low, high, isSigned)

	throw new Error('Expected varint not more than 10 bytes')
}

function readPackedEnd(pbf: ProtoBuf) {
	return pbf.type === ProtoBuf.Bytes
		? pbf.readVarint(unsigned) + pbf.pos
		: pbf.pos + 1
}

function toNum(low: number, high: number, isSigned: boolean) {
	return (isSigned)
		? high * 0x100000000 + (low >>> 0)
		: ((high >>> 0) * 0x100000000) + (low >>> 0)
}

function writeBigVarint(val: number, pbf: ProtoBuf) {
	let low: number
	let high: number

	if (val >= 0) {
		low  = (val % 0x100000000) | 0
		high = (val / 0x100000000) | 0
	} else {
		low  = ~(-val % 0x100000000)
		high = ~(-val / 0x100000000)

		if (low ^ 0xffffffff) {
			low = (low + 1) | 0
		}
		else {
			low  = 0
			high = (high + 1) | 0
		}
	}

	if (val >= 0x10000000000000000 || val < -0x10000000000000000) {
		throw new Error('Given varint doesn\'t fit into 10 bytes')
	}

	pbf.realloc(10)

	writeBigVarintLow(low, high, pbf)
	writeBigVarintHigh(high, pbf)
}

function writeBigVarintLow(low: number, _high: number, pbf: ProtoBuf) {
	pbf.buf[pbf.pos++] = low & 0x7f | 0x80
	low >>>= 7

	pbf.buf[pbf.pos++] = low & 0x7f | 0x80
	low >>>= 7

	pbf.buf[pbf.pos++] = low & 0x7f | 0x80
	low >>>= 7

	pbf.buf[pbf.pos++] = low & 0x7f | 0x80
	low >>>= 7

	pbf.buf[pbf.pos]   = low & 0x7f
}

function writeBigVarintHigh(high: number, pbf: ProtoBuf) {
	const lsb = (high & 0x07) << 4

	// deno-lint-ignore no-cond-assign
	pbf.buf[pbf.pos++] |= lsb         | ((high >>>= 3) ? 0x80 : 0)
	if (!high) return

	// deno-lint-ignore no-cond-assign
	pbf.buf[pbf.pos++]  = high & 0x7f | ((high >>>= 7) ? 0x80 : 0)
	if (!high) return

	// deno-lint-ignore no-cond-assign
	pbf.buf[pbf.pos++]  = high & 0x7f | ((high >>>= 7) ? 0x80 : 0)
	if (!high) return

	// deno-lint-ignore no-cond-assign
	pbf.buf[pbf.pos++]  = high & 0x7f | ((high >>>= 7) ? 0x80 : 0)
	if (!high) return

	// deno-lint-ignore no-cond-assign
	pbf.buf[pbf.pos++]  = high & 0x7f | ((high >>>= 7) ? 0x80 : 0)
	if (!high) return

	pbf.buf[pbf.pos++]  = high & 0x7f
}

function makeRoomForExtraLength(startPos: number, len: number, pbf: ProtoBuf) {
	const extraLen =
		(len <= 0x3fff) ? 1 :
		(len <= 0x1fffff) ? 2 :
		(len <= 0xfffffff) ? 3 : Math.floor(Math.log(len) / (Math.LN2 * 7))

	// if 1 byte isn't enough for encoding message length, shift the data to the right
	pbf.realloc(extraLen)

	for (let i = pbf.pos - 1; i >= startPos; i--) {
		pbf.buf[i + extraLen] = pbf.buf[i]
	}
}

function writePackedBoolean	(arr: Array<boolean>,pbf: ProtoBuf) { for (let i = 0; i < arr.length; i++) pbf.writeBoolean	(arr[i]) }
function writePackedVarint	(arr: Array<number>, pbf: ProtoBuf) { for (let i = 0; i < arr.length; i++) pbf.writeVarint	(arr[i]) }
function writePackedSVarint	(arr: Array<number>, pbf: ProtoBuf) { for (let i = 0; i < arr.length; i++) pbf.writeSVarint	(arr[i]) }
function writePackedFloat	(arr: Array<number>, pbf: ProtoBuf) { for (let i = 0; i < arr.length; i++) pbf.writeFloat	(arr[i]) }
function writePackedDouble	(arr: Array<number>, pbf: ProtoBuf) { for (let i = 0; i < arr.length; i++) pbf.writeDouble	(arr[i]) }
function writePackedFixed32	(arr: Array<number>, pbf: ProtoBuf) { for (let i = 0; i < arr.length; i++) pbf.writeFixed32	(arr[i]) }
function writePackedSFixed32	(arr: Array<number>, pbf: ProtoBuf) { for (let i = 0; i < arr.length; i++) pbf.writeSFixed32	(arr[i]) }
function writePackedFixed64	(arr: Array<number>, pbf: ProtoBuf) { for (let i = 0; i < arr.length; i++) pbf.writeFixed64	(arr[i]) }
function writePackedSFixed64	(arr: Array<number>, pbf: ProtoBuf) { for (let i = 0; i < arr.length; i++) pbf.writeSFixed64	(arr[i]) }

// Buffer code below from https://github.com/feross/buffer, MIT-licensed

function readUInt32(buf: Uint8Array, pos: number) {
	return ((buf[pos]) |
		(buf[pos + 1] << 8) |
		(buf[pos + 2] << 16)) +
		(buf[pos + 3] * 0x1000000)
}

function writeInt32(buf: Uint8Array, val: number, pos: number) {
	buf[pos] = val
	buf[pos + 1] = val >>> 8
	buf[pos + 2] = val >>> 16
	buf[pos + 3] = val >>> 24
}

function readInt32(buf: Uint8Array, pos: number) {
	return ((buf[pos]) |
		(buf[pos + 1] << 8) |
		(buf[pos + 2] << 16)) +
		(buf[pos + 3] << 24)
}

function readUtf8(buf: Uint8Array, pos: number, end: number) {
	let str = ''
	let i = pos

	while (i < end) {
		const b0 = buf[i]
		let b1: number
		let b2: number
		let b3: number
		let c: number | null = null // codepoint

		let bytesPerSequence =
			(b0 > 0xEF) ? 4 :
			(b0 > 0xDF) ? 3 :
			(b0 > 0xBF) ? 2 : 1

		if (i + bytesPerSequence > end) break

		if (bytesPerSequence === 1 && b0 < 0x80) c = b0
		else if (bytesPerSequence === 2) {
			b1 = buf[i + 1]
			if ((b1 & 0xC0) === 0x80) {
				c = (b0 & 0x1F) << 0x6 | (b1 & 0x3F)
				if (c <= 0x7F) c = null
			}
		}
		else if (bytesPerSequence === 3) {
			b1 = buf[i + 1]
			b2 = buf[i + 2]
			if ((b1 & 0xC0) === 0x80 && (b2 & 0xC0) === 0x80) {
				c = (b0 & 0xF) << 0xC | (b1 & 0x3F) << 0x6 | (b2 & 0x3F)
				if (c <= 0x7FF || (c >= 0xD800 && c <= 0xDFFF)) c = null
			}
		}
		else if (bytesPerSequence === 4) {
			b1 = buf[i + 1]
			b2 = buf[i + 2]
			b3 = buf[i + 3]
			if (
				(b1 & 0xC0) === 0x80 &&
				(b2 & 0xC0) === 0x80 &&
				(b3 & 0xC0) === 0x80
			) {
				c = (b0 & 0xF) << 0x12 | (b1 & 0x3F) << 0xC | (b2 & 0x3F) << 0x6 | (b3 & 0x3F)
				if (c <= 0xFFFF || c >= 0x110000) c = null
			}
		}

		if (c === null) {
			c = 0xFFFD
			bytesPerSequence = 1
		}
		else if (c > 0xFFFF) {
			c -= 0x10000
			str += String.fromCharCode(c >>> 10 & 0x3FF | 0xD800)
			c = 0xDC00 | c & 0x3FF
		}

		str += String.fromCharCode(c)
		i += bytesPerSequence
	}

	return str
}

function readUtf8TextDecoder(buf: Uint8Array, pos: number, end: number) {
	return new TextDecoder().decode(buf.subarray(pos, end))
}

function writeUtf8(buf: Uint8Array, str: string, pos: number) {
	for (let i = 0, c, lead; i < str.length; i++) {
		c = str.charCodeAt(i) // code point
		
		if (c > 0xD7FF && c < 0xE000) {
			if (lead) {
				if (c < 0xDC00) {
					buf[pos++] = 0xEF
					buf[pos++] = 0xBF
					buf[pos++] = 0xBD
					lead = c
					continue
				} else {
					c = lead - 0xD800 << 10 | c - 0xDC00 | 0x10000
					lead = null
				}
			} else {
				if (c > 0xDBFF || (i + 1 === str.length)) {
					buf[pos++] = 0xEF
					buf[pos++] = 0xBF
					buf[pos++] = 0xBD
				}
				else lead = c
				
				continue
			}
		} else if (lead) {
			buf[pos++] = 0xEF
			buf[pos++] = 0xBF
			buf[pos++] = 0xBD
			lead = null
		}
		if (c < 0x80) buf[pos++] = c
		else {
			if (c < 0x800) buf[pos++] = c >> 0x6 | 0xC0
			else {
				if (c < 0x10000) buf[pos++] = c >> 0xC | 0xE0
				else {
					buf[pos++] = c >> 0x12 | 0xF0
					buf[pos++] = c >> 0xC & 0x3F | 0x80
				}
				buf[pos++] = c >> 0x6 & 0x3F | 0x80
			}
			buf[pos++] = c & 0x3F | 0x80
		}
	}
	return pos
}

export default ProtoBuf
