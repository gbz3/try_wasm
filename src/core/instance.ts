import {
  ModuleNode, FuncTypeNode, CodeNode, InstrNode, //BlockInstrNode,
  //LoopInstrNode, IfInstrNode, BrInstrNode, BrIfInstrNode,
  //CallInstrNode,
  I32ConstInstrNode, I32EqzInstrNode,
  I32LtSInstrNode, I32GeSInstrNode, I32AddInstrNode,
  I32RemSInstrNode, LocalGetInstrNode, LocalSetInstrNode
} from "./node.ts"
import { Buffer, StackBuffer } from "./buffer.ts"

export class Instance {
  #module: ModuleNode
  #exports: {[key: string]: any}
  #context: Context

  get exports(): {[key: string]: any} {
    return this.#exports
  }

  constructor(module: ModuleNode) {
    this.#module = module
    this.#exports = {}
    this.#context = new Context()
  }

  compile() {
    const typeSection = this.#module.typeSection
    const functionSection = this.#module.fuctionSection
    const codeSection = this.#module.codeSection
    functionSection?.typeIdxs.forEach((typeIdx, i) => {
      const func = new _WasmFunction(typeSection!.funcTypes[typeIdx], codeSection!.codes[i])
      this.#context.functions.push(func)
    })

    const exportSection = this.#module.exportSection
    exportSection?.exports.forEach(exp => {
      if (exp.exportDesc?.tag === 0x00) {
        this.#exports[exp.name!] = (...args: number[]) => {
          const result = this.#context.functions[exp.exportDesc!.index!].invoke(this.#context, ...args)
          return result
        }
      }
    })
  }
}

class _LocalValue {
  #type: number
  value: number

  constructor(type: number, value: number) {
    this.#type = type
    this.value = value
  }

  store(buffer: Buffer) {
    switch (this.#type) {
      case 0x7f:
        buffer.writeI32(this.value)
        break
      default:
        throw new Error(`invalid local type: ${this.#type}`)
    }
  }

  load(buffer: Buffer) {
    switch (this.#type) {
      case 0x7f:
        this.value = buffer.readI32()
        break
      default:
        throw new Error(`invalid local type: ${this.#type}`)
    }
  }
}

class _WasmFunction {
  #funcType: FuncTypeNode
  #code: CodeNode
  #instructions: _InstructionSeq

  constructor(funcType: FuncTypeNode, code: CodeNode) {
    this.#funcType = funcType
    this.#code = code
    this.#instructions = new _InstructionSeq(this.#code.func?.expr?.instrs)
  }

  invoke(context: Context, ...args: number[]) {

    // 1. 引数の読み込み
    const params = [...args]
    const paramTypes = this.#funcType.paramType.valTypes
    for (let i = 0; i < paramTypes.length - args.length; i++) {
      const param = context.stack.readI32()
      params.push(param)
    }

    // 2. ローカル変数に引数を設定
    params.forEach((v, i) => {
      context.locals[i] = new _LocalValue(paramTypes[i], v)
    })

    // 3. ローカル変数の設定
    const localses = this.#code.func?.localses
    if (localses) {
      for (let i = 0; i < localses.length; i++) {
        const locals = localses[i]
        for (let j = 0; j < (locals.num || 0); j++) {
          context.locals.push(new _LocalValue(locals.valType!, 0))
        }
      }
    }

    // 4. コードの実行
    let instr = this.#instructions.top
    while (instr) {
      instr = instr.invoke(context)
    }
    const resultTypes = this.#funcType.resultType.valTypes
    if (resultTypes.length === 0) {
      return null
    } else {
      return context.stack.readI32()
    }
  }
}

export class Context {
  stack: Buffer
  functions: _WasmFunction[]
  locals: _LocalValue[]

  constructor() {
    this.stack = new StackBuffer({buffer: new ArrayBuffer(1024)})
    this.functions = []
    this.locals = []
  }
}

class _Instruction {
  parent?: _Instruction
  #next?: _Instruction

  get next(): _Instruction | undefined {
    if (this.#next) {
      return this.#next
    } else {
      return this.parent?.next
    }
  }

  set next(instr: _Instruction | undefined) {
    this.#next = instr
  }

  constructor(parent?: _Instruction) {
    this.parent = parent
  }

  static create(node: InstrNode, parent?: _Instruction): _Instruction {
    if (node instanceof I32ConstInstrNode) {
      return new _I32ConstInstruction(node, parent)
    } else if (node instanceof I32EqzInstrNode) {
      return new _I32EqzInstruction(node, parent)
    } else if (node instanceof I32LtSInstrNode) {
      return new _I32LtSInstruction(node, parent)
    } else if (node instanceof I32GeSInstrNode) {
      return new _I32GeSInstruction(node, parent)
    } else if (node instanceof I32AddInstrNode) {
      return new _I32AddInstruction(node, parent)
    } else if (node instanceof I32RemSInstrNode) {
      return new _I32RemSInstruction(node, parent)
    } else if (node instanceof LocalGetInstrNode) {
      return new _LocalGetInstruction(node, parent)
    } else if (node instanceof LocalSetInstrNode) {
      return new _LocalSetInstruction(node, parent)
    } else {
      throw new Error(`invalid node: ${node.constructor.name}`)
    }
  }

  invoke(_context: Context): _Instruction | undefined {
    throw new Error(`subclass responsibility; ${this.constructor.name}`)
  }
}

class _InstructionSeq extends _Instruction {
  #instructions: _Instruction[] = []

  get top(): _Instruction | undefined {
    return this.#instructions[0]
  }

  constructor(nodes: InstrNode[] = [], parent?: _Instruction) {
    super()

    if (nodes.length === 0) return

    let prev = _Instruction.create(nodes[0], parent)
    this.#instructions.push(prev)
    for (let i = 1; i < nodes.length; i++) {
      prev.next = _Instruction.create(nodes[i], parent)
      this.#instructions.push(prev)
      prev = prev.next
    }
  }

  invoke(_context: Context): _Instruction | undefined {
    return this.top
  }
}

class _LocalGetInstruction extends _Instruction {
  #localIdx: number

  constructor(node: LocalGetInstrNode, parent?: _Instruction) {
    super(parent)
    this.#localIdx = node.localIdx
  }

  invoke(context: Context): _Instruction | undefined {
    const local = context.locals[this.#localIdx]
    local.store(context.stack)
    return this.next
  }
}

class _LocalSetInstruction extends _Instruction {
  #localIdx: number

  constructor(node: LocalSetInstrNode, parent?: _Instruction) {
    super(parent)
    this.#localIdx = node.localIdx
  }

  invoke(context: Context): _Instruction | undefined {
    const local = context.locals[this.#localIdx]
    local.load(context.stack)
    return this.next
  }
}

class _I32ConstInstruction extends _Instruction {
  #num: number

  constructor(node: I32ConstInstrNode, parent?: _Instruction) {
    super(parent)
    this.#num = node.num
  }

  invoke(context: Context): _Instruction | undefined {
    context.stack.writeI32(this.#num)
    return this.next
  }
}

class _I32AddInstruction extends _Instruction {
  constructor(_node: I32AddInstrNode, parent?: _Instruction) {
    super(parent)
  }

  invoke(context: Context): _Instruction | undefined {
    const rhs = context.stack.readI32()
    const lhs = context.stack.readI32()
    context.stack.writeI32(lhs + rhs)
    return this.next
  }
}

class _I32RemSInstruction extends _Instruction {
  constructor(_node: I32RemSInstrNode, parent?: _Instruction) {
    super(parent)
  }

  invoke(context: Context): _Instruction | undefined {
    const rhs = context.stack.readS32()
    const lhs = context.stack.readS32()
    context.stack.writeS32(lhs % rhs)
    return this.next
  }
}

class _I32EqzInstruction extends _Instruction {
  constructor(_node: I32EqzInstrNode, parent?: _Instruction) {
    super(parent)
  }

  invoke(context: Context): _Instruction | undefined {
    const num = context.stack.readS32()
    context.stack.writeI32(num === 0? 1: 0)
    return this.next
  }
}

class _I32LtSInstruction extends _Instruction {
  constructor(_node: I32LtSInstrNode, parent?: _Instruction) {
    super(parent)
  }

  invoke(context: Context): _Instruction | undefined {
    const rhs = context.stack.readS32()
    const lhs = context.stack.readS32()
    context.stack.writeI32(lhs < rhs? 1: 0)
    return this.next
  }
}

class _I32GeSInstruction extends _Instruction {
  constructor(_node: I32GeSInstrNode, parent?: _Instruction) {
    super(parent)
  }

  invoke(context: Context): _Instruction | undefined {
    const rhs = context.stack.readS32()
    const lhs = context.stack.readS32()
    context.stack.writeI32(lhs >= rhs? 1: 0)
    return this.next
  }
}
