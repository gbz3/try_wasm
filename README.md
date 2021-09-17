# try_wasm

## WebAssembly ツール類をインストール

- [WebAssemblyツール](https://github.com/WebAssembly/wabt)

```bash
$ sudo apt install build-essential
...
$ vi data/add.wat
$ ../wabt/bin/wasm-objdump -d data/add.wasm

add.wasm:       file format wasm 0x1

Code Disassembly:

000022 func[0] <add>:
 000023: 20 00                      | local.get 0
 000025: 20 01                      | local.get 1
 000027: 6a                         | i32.add
 000028: 0b                         | end
$
```

## Deno インストール

- [Deno](https://deno.land/)
- [Error: unzip is required to install Deno](https://github.com/denoland/deno_install#unzip-is-required)

```bash
$ sudo apt-get install unzip -y
$
```
