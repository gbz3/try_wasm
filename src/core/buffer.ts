export class Buffer {
  #cursor = 0
  #buffer: ArrayBuffer

  constructor({buffer}: {buffer:ArrayBuffer}) {
    this.#buffer = buffer
  }

  readBytes(size: number): Uint8Array {
    if (this.#buffer.byteLength < this.#cursor + size) {
      return new Uint8Array(0)
    }

    const slice = this.#buffer.slice(this.#cursor, this.#cursor + size)
    this.#cursor += size
    return new Uint8Array(slice)
  }
}
