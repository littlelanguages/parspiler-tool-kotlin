import * as Path from "https://deno.land/std@0.63.0/path/mod.ts";
import * as PP from "https://raw.githubusercontent.com/littlelanguages/deno-lib-text-prettyprint/0.3.1/mod.ts";

import {
  asDoc,
  Definition,
  Expr,
  first,
  Production,
  translate,
} from "https://raw.githubusercontent.com/littlelanguages/parspiler/0.0.3/mod.ts";
import { writeScanner } from "https://raw.githubusercontent.com/littlelanguages/scanpiler-tool-deno/0.2.2/mod.ts";

export type CommandOptions = {
  scannerOutputFileName: string | undefined;
  parserOutputFileName: string | undefined;
  force: boolean;
  verbose: boolean;
};

export const denoCommand = async (
  fileName: string,
  options: CommandOptions,
): Promise<void> => {
  const parsedFileName = Path.parse(fileName);

  const scannerOutputFileName = options.scannerOutputFileName ||
    constructOutputFileName(parsedFileName, "scanner");
  const parserOutputFileName = options.parserOutputFileName ||
    constructOutputFileName(parsedFileName, "parser");

  if (
    options.force ||
    fileDateTime(fileName) > fileDateTime(scannerOutputFileName) ||
    fileDateTime(fileName) > fileDateTime(parserOutputFileName)
  ) {
    const src = await Deno.readTextFile(fileName);
    const parseResult = await translate(fileName, src);

    return parseResult.either((es) =>
      PP.render(
        PP.vcat(
          es.map((e) => PP.hcat(["Error: ", asDoc(e)])).concat(PP.blank),
        ),
        Deno.stdout,
      ), (definition) => {
      if (options.verbose) {
        console.log(`Writing ${scannerOutputFileName}`);
      }
      return writeScanner(
        scannerOutputFileName,
        definition.scanner,
      ).then((_) => {
        if (options.verbose) {
          console.log(`Writing ${parserOutputFileName}`);
        }
        return writeParser(
          parserOutputFileName,
          canonicalRelativeTo(parserOutputFileName, scannerOutputFileName),
          definition,
        );
      });
    });
  } else {
    return Promise.resolve();
  }
};

const writeParser = async (
  fileName: string,
  scannerRelativeName: string,
  definition: Definition,
): Promise<void> => {
  const parserDoc = PP.vcat([
    'import { Either, left, right } from "https://raw.githubusercontent.com/littlelanguages/deno-lib-data-either/0.1.0/mod.ts";',
    PP.hcat(
      [
        'import { mkScanner, Scanner, Token, TToken } from "',
        scannerRelativeName,
        '";',
      ],
    ),
    PP.blank,
    writeVisitor(definition),
    PP.blank,
    writeExportedParser(definition),
    PP.blank,
    writeMkParser(definition),
    PP.blank,
    writeSyntaxError(),
    PP.blank,
    PP.blank,
  ]);

  const writer = await Deno.create(fileName);
  await PP.render(parserDoc, writer);
  return writer.close();
};

const writeGenericTypeVariables = (definition: Definition): PP.Doc =>
  PP.hcat(
    ["<", PP.hsep(definition.productions.map((p) => `T_${p.lhs}`), ", "), ">"],
  );

const writeExprType = (definition: Definition, e: Expr): PP.Doc => {
  const write = (e: Expr): PP.Doc => {
    switch (e.tag) {
      case "Identifier":
        return (definition.nonTerminalNames.has(e.name))
          ? PP.hcat(["T_", e.name])
          : PP.text("Token");
      case "Sequence":
        return PP.hcat([
          "[",
          PP.join(e.exprs.map((es) => write(es)), ", "),
          "]",
        ]);
      case "Alternative":
        return PP.hcat([
          "(",
          PP.join(e.exprs.map((es) => write(es)), " | "),
          ")",
        ]);
      case "Many":
        return PP.hcat(["Array<", write(e.expr), ">"]);
      case "Optional":
        return PP.hcat([write(e.expr), " | undefined"]);
    }
  };

  return write(e);
};

const writeVisitor = (definition: Definition): PP.Doc => {
  const writeParameters = (e: Expr): PP.Doc =>
    (e.tag === "Sequence")
      ? PP.hcat([
        "(",
        PP.join(
          e.exprs.map((es, i) =>
            PP.hcat([`a${i + 1}`, ": ", writeExprType(definition, es)])
          ),
          ", ",
        ),
        ")",
      ])
      : PP.hcat(["(a: ", writeExprType(definition, e), ")"]);

  const writeProduction = (
    production: Production,
  ): PP.Doc => {
    const write = (name: string, e: Expr, returnType: string): PP.Doc =>
      PP.hcat(["visit", name, writeParameters(e), ": T_", returnType, ";"]);

    return (production.expr.tag === "Alternative")
      ? PP.vcat(
        production.expr.exprs.map((e, i) =>
          write(`${production.lhs}${i + 1}`, e, production.lhs)
        ),
      )
      : write(production.lhs, production.expr, production.lhs);
  };

  return PP.vcat([
    PP.hcat([
      "export interface Visitor",
      writeGenericTypeVariables(definition),
      " {",
    ]),
    PP.nest(2, PP.vcat(definition.productions.map((p) => writeProduction(p)))),
    "}",
  ]);
};

const writeExportedParser = (definition: Definition): PP.Doc => {
  const gtvs = writeGenericTypeVariables(definition);
  const name = definition.productions[0].lhs;

  return PP.vcat([
    PP.hcat([
      "export const parse",
      name,
      " = ",
      gtvs,
      "(input: string, visitor: Visitor",
      gtvs,
      "): Either<SyntaxError, T_",
      name,
      "> => {",
    ]),
    PP.nest(
      2,
      PP.vcat([
        "try {",
        PP.nest(
          2,
          PP.hcat([
            "return right(mkParser(mkScanner(input), visitor).",
            parseFunctioName(name),
            "());",
          ]),
        ),
        "} catch(e) {",
        PP.nest(2, "return left(e);"),
        "}",
      ]),
    ),
    "}",
  ]);
};

const writeMkParser = (definition: Definition): PP.Doc => {
  const gtvs = writeGenericTypeVariables(definition);

  const writeExpr = (
    variable: string,
    assign: (a: string) => PP.Doc,
    e: Expr,
  ): PP.Doc => {
    switch (e.tag) {
      case "Identifier":
        const [type, expression] = (definition.nonTerminalNames.has(e.name))
          ? [writeExprType(definition, e), `this.${parseFunctioName(e.name)}()`]
          : ["Token", `matchToken(TToken.${e.name})`];

        return PP.vcat([
          PP.hcat([
            "const ",
            variable,
            ": ",
            type,
            " = ",
            expression,
            ";",
          ]),
          assign(variable),
        ]);
      case "Sequence":
        return PP.vcat([
          PP.vcat(
            e.exprs.map((es, i) =>
              writeExpr(`${variable}${i + 1}`, (_) => PP.empty, es)
            ),
          ),
          PP.hcat([
            "const ",
            variable,
            ": ",
            writeExprType(definition, e),
            " = [",
            PP.join(e.exprs.map((_, i) => `${variable}${i + 1}`), ", "),
            "];",
          ]),
          assign(variable),
        ]);
      case "Alternative":
        return PP.vcat([
          PP.vcat(e.exprs.map((es, i) =>
            PP.vcat([
              PP.hcat([
                (i === 0) ? "if" : "} else if",
                " (",
                writeIsToken(es),
                ") {",
              ]),
              PP.nest(
                2,
                writeExpr(
                  variable,
                  () => assign(variable),
                  es,
                ),
              ),
            ])
          )),

          "} else {",
          PP.nest(
            2,
            PP.hcat([
              'throw { tag: "SyntaxError", found: scanner.current(), expected: ',
              writeExpectedTokens(e),
              "};",
            ]),
          ),
          "}",
        ]);

      case "Many": {
        const tmpVariable = `${variable}t`;

        return PP.vcat([
          PP.hcat([
            "const ",
            variable,
            ": Array<",
            writeExprType(definition, e.expr),
            "> = [];",
          ]),
          PP.blank,
          PP.hcat(["while (", writeIsToken(e.expr), ") {"]),
          PP.nest(
            2,
            PP.vcat([
              writeExpr(
                tmpVariable,
                () => PP.hcat([variable, ".push(", tmpVariable, ")"]),
                e.expr,
              ),
              assign(variable),
            ]),
          ),
          "}",
        ]);
      }
      case "Optional": {
        const tmpVariable = `${variable}t`;

        return PP.vcat([
          PP.hcat([
            "let ",
            variable,
            ": ",
            writeExprType(definition, e.expr),
            " | undefined = undefined;",
          ]),
          PP.blank,
          PP.hcat(["if (", writeIsToken(e.expr), ") {"]),
          PP.nest(
            2,
            writeExpr(
              tmpVariable,
              () => PP.hcat([variable, " = ", tmpVariable, ";"]),
              e.expr,
            ),
          ),
          "}",
          assign(variable),
        ]);
      }
    }
  };

  const writeTopLevelExpresseion = (visitorName: string, e: Expr): PP.Doc => {
    switch (e.tag) {
      case "Identifier":
        return (definition.nonTerminalNames.has(e.name))
          ? PP.hcat([
            "return visitor.visit",
            visitorName,
            "(this.",
            parseFunctioName(e.name),
            "());",
          ])
          : PP.hcat([
            "return visitor.visit",
            visitorName,
            "(matchToken(TToken.",
            e.name,
            "));",
          ]);
      case "Sequence":
        return PP.vcat([
          PP.vcat(
            e.exprs.map((es, i) => writeExpr(`a${i + 1}`, (_) => PP.empty, es)),
          ),
          PP.hcat([
            "return visitor.visit",
            visitorName,
            "(",
            PP.join(e.exprs.map((_, i) => `a${i + 1}`), ", "),
            ");",
          ]),
        ]);
      case "Many":
        return PP.vcat([
          PP.hcat([
            "const a: Array<",
            writeExprType(definition, e.expr),
            "> = [];",
          ]),
          PP.blank,
          PP.hcat(["while (", writeIsToken(e.expr), ") {"]),
          PP.nest(
            2,
            writeExpr(
              "at",
              (n) => PP.hcat(["a.push(", n, ")"]),
              e.expr,
            ),
          ),
          "}",
          PP.hcat(["return visitor.visit", visitorName, "(a);"]),
        ]);
      case "Optional":
        return PP.vcat([
          PP.hcat([
            "let a: ",
            writeExprType(definition, e),
            " = undefined;",
          ]),
          PP.blank,
          PP.hcat(["if (", writeIsToken(e.expr), ") {"]),
          PP.nest(
            2,
            writeExpr("at", (ns) => PP.hcat(["a = ", ns, ";"]), e.expr),
          ),
          "}",
          PP.hcat(["return visitor.visit", visitorName, "(a);"]),
        ]);
      default:
        throw {
          tag: "InternalError",
          reason: "Alternative case should not be encoutered",
          e,
        };
    }
  };

  const writeTopLevelBody = (production: Production): PP.Doc => {
    const e = production.expr;

    return (e.tag === "Alternative")
      ? PP.vcat([
        PP.vcat(e.exprs.map((es, i) =>
          PP.vcat([
            PP.hcat([
              (i === 0) ? "if" : "} else if",
              " (",
              writeIsToken(es),
              ") {",
            ]),
            PP.nest(
              2,
              writeTopLevelExpresseion(
                `${production.lhs}${i + 1}`,
                es,
              ),
            ),
          ])
        )),
        "} else {",
        PP.nest(
          2,
          PP.hcat([
            'throw { tag: "SyntaxError", found: scanner.current(), expected: ',
            writeExpectedTokens(e),
            "};",
          ]),
        ),
        "}",
      ])
      : writeTopLevelExpresseion(production.lhs, production.expr);
  };

  const writeParseFunctions = (): PP.Doc =>
    PP.vcat(
      definition.productions.map((production) =>
        PP.vcat([
          PP.hcat([
            parseFunctioName(production.lhs),
            ": function (): T_",
            production.lhs,
            " {",
          ]),
          PP.nest(2, writeTopLevelBody(production)),
          "},",
        ])
      ),
    );

  const writeExpectedTokens = (e: Expr): PP.Doc => {
    const f = [...first(definition.firsts, e)].filter((n) => n !== "");

    return PP.hcat(["[", PP.join(f.map((n) => `TToken.${n}`), ", "), "]"]);
  };

  const writeIsToken = (e: Expr): PP.Doc => {
    const f = [...first(definition.firsts, e)].filter((n) => n !== "");

    return (f.length === 1) ? PP.hcat(["isToken(TToken.", f[0], ")"]) : PP.hcat(
      ["isTokens([", PP.join(f.map((n) => `TToken.${n}`), ", "), "])"],
    );
  };

  return PP.vcat([
    PP.hcat([
      "export const mkParser = ",
      gtvs,
      "(scanner: Scanner, visitor: Visitor",
      gtvs,
      ") => {",
    ]),
    PP.nest(
      2,
      PP.vcat([
        "const matchToken = (ttoken: TToken): Token => {",
        PP.nest(
          2,
          PP.vcat([
            "if (isToken(ttoken)) {",
            PP.nest(2, "return nextToken();"),
            "} else {",
            PP.nest(
              2,
              'throw { tag: "SyntaxError", found: scanner.current(), expected: [ttoken] };',
            ),
            "}",
          ]),
        ),
        "}",
        PP.blank,
        "const isToken = (ttoken: TToken): boolean => currentToken() === ttoken;",
        PP.blank,
        "const isTokens = (ttokens: Array<TToken>): boolean => ttokens.includes(currentToken());",
        PP.blank,
        "const currentToken = (): TToken => scanner.current()[0];",
        PP.blank,
        "const nextToken = (): Token => {",
        PP.nest(
          2,
          PP.vcat([
            "const result = scanner.current();",
            "scanner.next();",
            "return result;",
          ]),
        ),
        "};",
        PP.blank,
        "return {",
        PP.nest(2, writeParseFunctions()),
        "}",
      ]),
    ),
    "}",
  ]);
};

const writeSyntaxError = (): PP.Doc =>
  PP.vcat([
    "export type SyntaxError = {",
    PP.nest(
      2,
      PP.vcat([
        'tag: "SyntaxError";',
        "found: Token;",
        "expected: Array<TToken>;",
      ]),
    ),
    "};",
  ]);

const parseFunctioName = (name: string): string =>
  `${name.slice(0, 1).toLowerCase()}${name.slice(1)}`;

const fileDateTime = (name: string): number => {
  try {
    return Deno.lstatSync(name)?.mtime?.getTime() || 0;
  } catch (_) {
    return 0;
  }
};

const constructOutputFileName = (
  parsedFileName: Path.ParsedPath,
  name: string,
): string =>
  Path.format(
    Object.assign(
      {},
      parsedFileName,
      {
        base: `${parsedFileName.name}-${name}.ts`,
        name: `${parsedFileName.name}-${name}`,
        ext: ".ts",
      },
    ),
  );

const canonicalRelativeTo = (src: string, target: string): string => {
  const srcParse = Path.parse(src);
  const targetParse = Path.parse(target);

  const srcParsePath = srcParse.dir + "/";
  const targetParsePath = targetParse.dir + "/";

  const len = Math.max(srcParsePath.length, targetParsePath.length);
  let lp = 0;
  while (lp < len && srcParsePath[lp] === targetParsePath[lp]) {
    lp += 1;
  }
  while (lp > 0 && srcParsePath[lp] !== "/") {
    lp -= 1;
  }
  const suffix = targetParsePath.substr(lp + 1);

  let result = "";
  lp += 1;
  while (lp < srcParsePath.length) {
    if (srcParsePath[lp] === "/") {
      result = result + "../";
    }
    lp += 1;
  }

  return "./" + result + suffix + targetParse.base;
};
