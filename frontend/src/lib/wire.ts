// wire.ts — binary tunnel framing (protocol v2), mirrors server/internal/services/wire.go.
//
//	[4-byte big-endian metaLen][metaLen bytes JSON][raw body bytes]
//
// Removes the base64 size tax and JSON body escaping for tunneled payloads.

export type WireRequest = {
  id: string
  method: string
  path: string
  headers: Record<string, string[]>
  body: Uint8Array
}

export type WireResponse = {
  id: string
  status: number
  headers: Record<string, string[]>
  body: Uint8Array
  error?: string
}

type WireMeta = {
  id?: string
  method?: string
  path?: string
  headers?: Record<string, string[]>
  status?: number
  error?: string
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export function encodeFrame(meta: WireMeta, body?: Uint8Array): ArrayBuffer {
  const metaBytes = encoder.encode(JSON.stringify(meta))
  const bodyLen = body ? body.byteLength : 0
  const frame = new Uint8Array(4 + metaBytes.length + bodyLen)
  new DataView(frame.buffer).setUint32(0, metaBytes.length, false)
  frame.set(metaBytes, 4)
  if (bodyLen && body) frame.set(body, 4 + metaBytes.length)
  return frame.buffer
}

export function decodeFrame(data: ArrayBuffer): { meta: WireMeta; body: Uint8Array } {
  if (data.byteLength < 4) throw new Error('invalid tunnel frame')
  const metaLen = new DataView(data).getUint32(0, false)
  if (metaLen < 0 || 4 + metaLen > data.byteLength) throw new Error('invalid tunnel frame metadata')
  const bytes = new Uint8Array(data)
  const meta = JSON.parse(decoder.decode(bytes.subarray(4, 4 + metaLen))) as WireMeta
  return { meta, body: bytes.subarray(4 + metaLen) }
}
