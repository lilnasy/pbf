// uint helpers

function writeUintLE (val: number, buf: Uint8Array, pos: number) {
	buf[pos    ] = val        & 255
	buf[pos + 1] = val >>> 8  & 255
	buf[pos + 2] = val >>> 16 & 255
	buf[pos + 3] = val >>> 24
}

function writeUintBE (val: number, buf: Uint8Array, pos: number) {
	buf[pos    ] = val >>> 24
	buf[pos + 1] = val >>> 16 & 255
	buf[pos + 2] = val >>> 8  & 255
	buf[pos + 3] = val        & 255
}

function readUintLE (buf: Uint8Array, pos: number) {
	return  ( buf[pos    ]
		| buf[pos + 1] << 8
		| buf[pos + 2] << 16
		| buf[pos + 3] << 24) >>> 0
}

function readUintBE (buf: Uint8Array, pos: number) {
	return  ( buf[pos    ] << 24
		| buf[pos + 1] << 16
		| buf[pos + 2] << 8
		| buf[pos + 3]) >>> 0
}

export  { writeUintLE
	, writeUintBE
	, readUintLE
	, readUintBE }
