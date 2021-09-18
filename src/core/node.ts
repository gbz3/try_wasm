import { Buffer } from "./buffer.ts"

type I32 = 0x7f
type I64 = 0x7e
type F32 = 0x7d
type F64 = 0x7c
type NumType = I32 | I64 | F32 | F64
type FuncRef = 0x70
type ExternRef = 0x6f
type RefType = FuncRef | ExternRef
type ValType = NumType | RefType
type TypeIdx = number

export class ModuleNode {
  magic?: Uint8Array
  version?: Uint8Array
  sections: SectionNode[] = []

  load(buffer: Buffer) {
    this.magic = buffer.readBytes(4)
    this.version = buffer.readBytes(4)

    while (true) {
      if (buffer.eof) break

      const section = this.loadSection(buffer)
      this.sections.push(section)
    }
  }

  loadSection(buffer: Buffer): SectionNode {
    const sectionId = buffer.readByte()
    const sectionSize = buffer.readU32()
    const sectionsBuffer = buffer.readBuffer(sectionSize)

    const section = SectionNode.create(sectionId)
    section.load(sectionsBuffer)
    return section
  }
}

abstract class SectionNode {
  static create(sectionId: number): SectionNode {
    switch (sectionId) {
      case 1:
        return new TypeSectionNode()
      case 3:
        return new FunctionSectionNode()
      case 10:
        return new CodeSectionNode()
      default:
        throw new Error(`invalid section id: ${sectionId}`)
    }
  }

  abstract load(buffer: Buffer): void
}

export class TypeSectionNode extends SectionNode {
  funcTypes: FuncTypeNode[] = []

  load(buffer: Buffer) {
    this.funcTypes = buffer.readVec<FuncTypeNode>((): FuncTypeNode => {
      const functype = new FuncTypeNode()
      functype.load(buffer)
      return functype
    })
  }
}

export class FuncTypeNode {
  static get TAG() { return 0x60 }

  paramType = new ResultTypeNode()
  resultType = new ResultTypeNode()

  load(buffer: Buffer) {
    if (buffer.readByte() !== FuncTypeNode.TAG) {
      throw new Error("invalid functype")
    }
    this.paramType = new ResultTypeNode()
    this.paramType.load(buffer)
    this.resultType = new ResultTypeNode()
    this.resultType.load(buffer)
  }
}

export class ResultTypeNode {
  valTypes: ValType[] = []

  load(buffer: Buffer) {
    this.valTypes = buffer.readVec<ValType>((): ValType => {
      return buffer.readByte() as ValType
    })
  }
}

export class FunctionSectionNode extends SectionNode {
  typeIdxs: TypeIdx[] = []

  load(buffer: Buffer) {
    this.typeIdxs = buffer.readVec<TypeIdx>((): TypeIdx => {
      return buffer.readU32() as TypeIdx
    })
  }
}

export class CodeSectionNode extends SectionNode {
  codes: CodeNode[] = []

  load(buffer: Buffer) {
    this.codes = buffer.readVec<CodeNode>((): CodeNode => {
      const code = new CodeNode()
      code.load(buffer)
      return code
    })
  }
}

export class CodeNode {
  size?: number
  func?: FuncNode

  load(buffer: Buffer) {
    this.size = buffer.readU32()
    const funcBuffer = buffer.readBuffer(this.size)
    this.func = new FuncNode()
    this.func.load(funcBuffer)
  }
}

export class FuncNode {
  localses: LocalsNode[] = []
  expr?: ExprNode

  load(buffer: Buffer) {
    this.localses = buffer.readVec<LocalsNode>((): LocalsNode => {
      const locals = new LocalsNode()
      locals.load(buffer)
      return locals
    })
    this.expr = new ExprNode()
    this.expr.load(buffer)
  }
}

export class LocalsNode {
  num!: number
  valType!: ValType

  load(buffer: Buffer) {
    this.num = buffer.readU32()
    this.valType = buffer.readByte() as ValType
  }
}

const Op = {
  I32Const: 0x41,
  End: 0x0b,
} as const
type Op = typeof Op[keyof typeof Op]

export class ExprNode {
  instrs: InstrNode[] = []
  endOp!: Op

  load(buffer: Buffer) {
    while (true) {
      const opcode = buffer.readByte() as Op
      if (opcode === Op.End) {
        this.endOp = opcode
        break
      }

      const instr = InstrNode.create(opcode)
      if (!instr) {
        throw new Error(`invalid opcode: 0x${opcode.toString(16)}`)
      }

      instr.load(buffer)
      this.instrs.push(instr)

      if (buffer.eof) break
    }
  }
}

export class InstrNode {
  opcode: Op

  static create(opcode: Op): InstrNode | null {
    switch (opcode) {
      case Op.I32Const:
        return new I32ConstInstrNode(opcode)
      default:
        return null
    }
  }

  constructor(opcode: Op) {
    this.opcode = opcode
  }

  load(_buffer: Buffer) {
    // nop
  }
}

export class I32ConstInstrNode extends InstrNode {
  num!: number

  load(buffer: Buffer) {
    this.num = buffer.readI32()
  }
}
