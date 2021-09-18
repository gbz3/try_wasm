import { assertEquals } from "https://deno.land/std@0.107.0/testing/asserts.ts"
import { WasmModule, WasmBuffer } from "../src/wasm.ts"

async function loadModule(wasmPath: string): Promise<[WasmModule, WasmBuffer, Uint8Array]> {
  const code = await Deno.readFile(wasmPath)
  const wasmBuffer = new WasmBuffer(code)
  const wasmModule = new WasmModule()
  wasmModule.load(wasmBuffer)
  return [wasmModule, wasmBuffer, code]
}

Deno.test("store module.wasm", async () => {
  const [wasmModule, wasmBuffer, code] = await loadModule("data/module.wasm")
  const newCode = new Uint8Array(wasmBuffer.byteLength)
  const newBuffer = new WasmBuffer(newCode)
  wasmModule.store(newBuffer)
  assertEquals(code, newCode)
})
