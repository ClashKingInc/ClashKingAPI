import { Effect, Schema, SchemaAST, SchemaIssue } from "effect"
import * as SchemaCompiler from "effect/schema/SchemaCompiler"

// Effect omits its internal parser methods from published declarations. Keep
// their 4.0.0 signatures in this adapter rather than leaking them to callers.
type Parser = (input: unknown, options: SchemaAST.ParseOptions) => Effect.Effect<unknown, SchemaIssue.Issue, unknown>
type Compiler = (ast: SchemaAST.AST) => Parser
interface ParserObject extends SchemaAST.Objects {
  getParser(compile: Compiler, compileField?: Compiler): Parser
  flip(recur: (ast: SchemaAST.AST) => SchemaAST.AST): SchemaAST.AST
  recur(recur: (ast: SchemaAST.AST) => SchemaAST.AST,
    recurParameter?: (ast: SchemaAST.AST) => SchemaAST.AST): SchemaAST.AST
}
const ParserObjects = SchemaAST.Objects as new (...args: ConstructorParameters<typeof SchemaAST.Objects>) => ParserObject

/** Restore the recursive excess-property policy formerly set by parseOptions.
 * Keep the original object AST so symbols, field codecs, struct composition and
 * generated JSON Schema retain their existing behavior. This adapter isolates
 * Effect 4.0.0's object parser hook; flipping must retain the policy for encoders. */
class ObjectPolicy extends ParserObjects {
  constructor(ast: SchemaAST.Objects, readonly excessProperty: "error" | "ignore") {
    super(ast.propertySignatures, ast.indexSignatures, ast.annotations, ast.checks,
      ast.encoding, ast.context, ast.encodingChecks)
    // An empty registry entry selects Effect's native interpreted fallback for
    // every operation, including constructors. JIT cannot infer this local
    // option override from the public object representation.
    SchemaCompiler.set(this, {} as SchemaCompiler.CompiledDecoder)
  }

  override getParser(compile: Compiler, compileField: Compiler = compile): Parser {
    const parse = super.getParser(compile, compileField)
    const knownKeys = new Set(this.propertySignatures.map(property =>
      typeof property.name === "number" ? String(property.name) : property.name))
    return (input, options) => {
      const localOptions = { ...options, onExcessProperty: this.excessProperty }
      // Stable checks only enumerable extras. Rc.112 rejected every undeclared
      // own key; restore that behavior for the fixed-field structs used here.
      if (this.excessProperty === "error" && this.propertySignatures.length > 0 && this.indexSignatures.length === 0 &&
        typeof input === "object" && input !== null && !Array.isArray(input)) {
        const issues: SchemaIssue.Issue[] = []
        for (const key of Reflect.ownKeys(input)) {
          if (!knownKeys.has(key) && !Object.prototype.propertyIsEnumerable.call(input, key)) {
            const unexpected = new SchemaIssue.UnexpectedKey(this, (input as Record<PropertyKey, unknown>)[key], localOptions)
            issues.push(new SchemaIssue.Pointer([key], unexpected))
            if (localOptions.errors === "first") break
          }
        }
        const [first, ...rest] = issues
        if (first !== undefined) return Effect.fail(new SchemaIssue.Composite(this, [first, ...rest], input, localOptions))
      }
      return parse(input, localOptions)
    }
  }

  override flip(recur: (ast: SchemaAST.AST) => SchemaAST.AST): SchemaAST.AST {
    return this.retainPolicy(super.flip(recur))
  }

  override recur(recur: (ast: SchemaAST.AST) => SchemaAST.AST,
    recurParameter: (ast: SchemaAST.AST) => SchemaAST.AST = recur): SchemaAST.AST {
    return this.retainPolicy(super.recur(recur, recurParameter))
  }

  private retainPolicy(ast: SchemaAST.AST): SchemaAST.Objects {
    if (!SchemaAST.isObjects(ast)) throw new Error("Object policy requires an object AST")
    return ast === this ? this : new ObjectPolicy(ast, this.excessProperty)
  }
}

export const strictObject = <Fields extends Schema.Struct.Fields>(schema: Schema.Struct<Fields>): Schema.Struct<Fields> =>
  schema.rebuild(new ObjectPolicy(schema.ast, "error"))

/** Explicitly override a strict parent's inherited policy for this subtree. */
export const ignoreObject = <Fields extends Schema.Struct.Fields>(schema: Schema.Struct<Fields>): Schema.Struct<Fields> =>
  schema.rebuild(new ObjectPolicy(schema.ast, "ignore"))
