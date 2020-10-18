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
import {
  copyLibrary as copyScannerLibrary,
  writeScanner,
} from "https://raw.githubusercontent.com/littlelanguages/scanpiler-tool-kotlin/0.0.2/mod.ts";

export type CommandOptions = {
  directory: string | undefined;
  scannerName: string;
  parserName: string;
  force: boolean;
  verbose: boolean;
};

export const command = async (
  fileName: string,
  options: CommandOptions,
): Promise<void> => {
  const [scannerPackageName, scannerName] = splitName(options.scannerName);
  const scannerDirectory = `${options.directory}/${
    scannerPackageName.replaceAll(".", "/")
  }`;
  const scannerOutputFileName = `${scannerDirectory}/${scannerName}.kt`;

  const [parserPackageName, parserName] = splitName(options.parserName);
  const parserDirectory = `${options.directory}/${
    parserPackageName.replaceAll(".", "/")
  }`;
  const parserOutputFileName = `${parserDirectory}/${parserName}.kt`;

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
        scannerPackageName,
        definition.scanner,
      ).then((_) =>
        copyScannerLibrary(
          {
            directory: options.directory,
            name: options.scannerName,
            verbose: options.verbose,
            force: options.force,
          },
        )
      ).then((_) => {
        if (options.verbose) {
          console.log(`Writing ${parserOutputFileName}`);
        }
        return writeParser(
          parserOutputFileName,
          parserPackageName,
          scannerPackageName,
          definition,
        );
      }).then((_) => copyLibrary(options));
    });
  } else {
    return Promise.resolve();
  }
};

const writeParser = async (
  fileName: string,
  packageName: string,
  scannerPackageName: string,
  definition: Definition,
): Promise<void> => {
  const parserDoc = PP.vcat([
    PP.hsep(["package", packageName]),
    PP.blank,
    PP.hcat(["import ", scannerPackageName, ".Token"]),
    PP.blank,
    writeVisitor(definition),
    PP.blank,
    writeMkParser(definition),
    PP.blank,
    writeParsingException(),
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
          "io.littlelanguages.data.Tuple",
          e.exprs.length.toString(),
          "<",
          PP.join(e.exprs.map((es) => write(es)), ", "),
          ">",
        ]);
      case "Alternative":
        return PP.hcat([
          "io.littlelanguages.data.Union",
          e.exprs.length.toString(),
          "<",
          PP.join(e.exprs.map((es) => write(es)), ", "),
          ">",
        ]);
      case "Many":
        return PP.hcat(["List<", write(e.expr), ">"]);
      case "Optional":
        return PP.hcat([write(e.expr), "?"]);
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
      PP.hcat(["fun visit", name, writeParameters(e), ": T_", returnType]);

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
      "interface Visitor",
      writeGenericTypeVariables(definition),
      " {",
    ]),
    PP.nest(2, PP.vcat(definition.productions.map((p) => writeProduction(p)))),
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
          ? [writeExprType(definition, e), `${parseFunctioName(e.name)}()`]
          : ["Token", `matchToken(TToken.T${e.name})`];

        return PP.vcat([
          PP.hcat([
            "val ",
            variable,
            ": ",
            type,
            " = ",
            expression,
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
            "val ",
            variable,
            ": ",
            writeExprType(definition, e),
            " = io.littlelanguages.data.Tuple",
            e.exprs.length.toString(),
            "(",
            PP.join(e.exprs.map((_, i) => `${variable}${i + 1}`), ", "),
            ")",
          ]),
          assign(variable),
        ]);
      case "Alternative":
        return PP.vcat([
          "when {",
          PP.nest(
            2,
            PP.vcat([
              PP.vcat(e.exprs.map((es, i) =>
                PP.vcat([
                  PP.hcat([
                    writeIsToken(es),
                    "-> {",
                  ]),
                  PP.nest(
                    2,
                    writeExpr(
                      variable,
                      () =>
                        assign(
                          `io.littlelanguages.data.Union${e.exprs.length}${
                            String.fromCharCode(i + 97)
                          }(${variable})`,
                        ),
                      es,
                    ),
                  ),
                  "}",
                ])
              )),
              "else -> {",
              PP.nest(
                2,
                PP.hcat([
                  "throw ParsingException(peek(), ",
                  writeExpectedTokens(e),
                  ")",
                ]),
              ),
              "}",
            ]),
          ),
          "}",
        ]);

      case "Many": {
        const tmpVariable = `${variable}t`;

        return PP.vcat([
          PP.hcat([
            "val ",
            variable,
            "= mutableListOf<",
            writeExprType(definition, e.expr),
            ">()",
          ]),
          PP.blank,
          PP.hcat(["while (", writeIsToken(e.expr), ") {"]),
          PP.nest(
            2,
            PP.vcat([
              writeExpr(
                tmpVariable,
                () => PP.hcat([variable, ".add(", tmpVariable, ")"]),
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
            "var ",
            variable,
            ": ",
            writeExprType(definition, e.expr),
            "? = null",
          ]),
          PP.blank,
          PP.hcat(["if (", writeIsToken(e.expr), ") {"]),
          PP.nest(
            2,
            writeExpr(
              tmpVariable,
              () => PP.hcat([variable, " = ", tmpVariable]),
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
            "(",
            parseFunctioName(e.name),
            "())",
          ])
          : PP.hcat([
            "return visitor.visit",
            visitorName,
            "(matchToken(TToken.T",
            e.name,
            "))",
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
            ")",
          ]),
        ]);
      case "Many":
        return PP.vcat([
          PP.hcat([
            "val a = mutableListOf<",
            writeExprType(definition, e.expr),
            ">()",
          ]),
          PP.blank,
          PP.hcat(["while (", writeIsToken(e.expr), ") {"]),
          PP.nest(
            2,
            writeExpr(
              "at",
              (n) => PP.hcat(["a.add(", n, ")"]),
              e.expr,
            ),
          ),
          "}",
          PP.hcat(["return visitor.visit", visitorName, "(a)"]),
        ]);
      case "Optional":
        return PP.vcat([
          PP.hcat([
            "var a: ",
            writeExprType(definition, e),
            " = null",
          ]),
          PP.blank,
          PP.hcat(["if (", writeIsToken(e.expr), ") {"]),
          PP.nest(
            2,
            writeExpr("at", (ns) => PP.hcat(["a = ", ns]), e.expr),
          ),
          "}",
          PP.hcat(["return visitor.visit", visitorName, "(a)"]),
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
        "when {",
        PP.nest(
          2,
          PP.vcat([
            PP.vcat(e.exprs.map((es, i) =>
              PP.vcat([
                PP.hcat([
                  writeIsToken(es),
                  " -> {",
                ]),
                PP.nest(
                  2,
                  writeTopLevelExpresseion(
                    `${production.lhs}${i + 1}`,
                    es,
                  ),
                ),
                "}",
              ])
            )),
            "else -> {",
            PP.nest(
              2,
              PP.hcat([
                "throw ParsingException(peek(), ",
                writeExpectedTokens(e),
                ")",
              ]),
            ),
            "}",
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
            "fun ",
            parseFunctioName(production.lhs),
            "(): T_",
            production.lhs,
            " {",
          ]),
          PP.nest(2, writeTopLevelBody(production)),
          "}",
          PP.blank,
        ])
      ),
    );

  const writeExpectedTokens = (e: Expr): PP.Doc => {
    const f = [...first(definition.firsts, e)].filter((n) => n !== "");

    return PP.hcat(
      ["setOf(", PP.join(f.map((n) => `TToken.T${n}`), ", "), ")"],
    );
  };

  const writeIsToken = (e: Expr): PP.Doc => {
    const f = [...first(definition.firsts, e)].filter((n) => n !== "");

    return (f.length === 1)
      ? PP.hcat(["isToken(TToken.T", f[0], ")"])
      : PP.hcat(
        ["isTokens(setOf(", PP.join(f.map((n) => `TToken.T${n}`), ", "), "))"],
      );
  };

  return PP.vcat([
    PP.hcat([
      "class Parser",
      gtvs,
      "(",
    ]),
    PP.nest(
      4,
      PP.vcat([
        "private val scanner: Scanner,",
        PP.hcat(["private val visitor: Visitor", gtvs, ") {"]),
      ]),
    ),
    PP.nest(
      2,
      PP.vcat([
        writeParseFunctions(),
        PP.blank,
        "private fun matchToken(tToken: TToken): Token =",
        PP.nest(
          2,
          PP.vcat([
            "when (peek().tToken) {",
            PP.nest(
              2,
              PP.vcat([
                "tToken -> nextToken()",
                "else -> throw ParsingException(peek(), setOf(tToken))",
              ]),
            ),
            "}",
          ]),
        ),
        PP.blank,
        "private fun nextToken(): Token {",
        PP.nest(
          2,
          PP.vcat([
            "val result =",
            PP.nest(2, "peek()"),
            PP.blank,
            "skipToken()",
            PP.blank,
            "return result",
          ]),
        ),
        "}",
        PP.blank,
        "private fun skipToken() {",
        PP.nest(2, "scanner.next()"),
        "}",
        PP.blank,
        "private fun isToken(tToken: TToken): Boolean =",
        PP.nest(2, "peek().tToken == tToken"),
        PP.blank,
        "private fun isTokens(tTokens: Set<TToken>): Boolean =",
        PP.nest(2, "tTokens.contains(peek().tToken)"),
        PP.blank,
        "private fun peek(): Token =",
        PP.nest(2, "scanner.current()"),
      ]),
    ),
    "}",
  ]);
};

const writeParsingException = (): PP.Doc =>
  PP.vcat([
    "class ParsingException(",
    PP.nest(
      2,
      PP.vcat([
        "val found: Token,",
        "val expected: Set<TToken>) : Exception()",
      ]),
    ),
  ]);

export const copyLibrary = async (
  options: CommandOptions,
): Promise<void> => {
  const copyFile = async (
    srcName: string,
    targetName: string,
  ): Promise<void> => {
    const outputFileName = `${options.directory}/${targetName}`;

    if (options.force || fileDateTime(outputFileName) === 0) {
      const srcFileName = `${Path.dirname(import.meta.url)}/${srcName}`;

      console.log(`Copy ${srcName}`);

      return Deno.mkdir(Path.dirname(outputFileName), { recursive: true })
        .then((_) =>
          (srcFileName.startsWith("file://"))
            ? Deno.copyFile(
              srcFileName.substr(7),
              outputFileName,
            )
            : srcFileName.startsWith("http://") ||
                srcFileName.startsWith("https://")
            ? fetch(srcFileName).then((response) => response.text()).then((
              t: string,
            ) => Deno.writeFile(outputFileName, new TextEncoder().encode(t)))
            : Deno.copyFile(
              srcFileName,
              outputFileName,
            )
        );
    } else {
      return Promise.resolve();
    }
  };

  await copyFile(
    "lib/kotlin/Tuple.kt",
    "io/littlelanguages/data/Tuple.kt",
  );

  return await copyFile(
    "lib/kotlin/Union.kt",
    "io/littlelanguages/data/Union.kt",
  );
};

const parseFunctioName = (name: string): string =>
  `${name.slice(0, 1).toLowerCase()}${name.slice(1)}`;

const fileDateTime = (name: string): number => {
  try {
    return Deno.lstatSync(name)?.mtime?.getTime() || 0;
  } catch (_) {
    return 0;
  }
};

const splitName = (name: string): [string, string] => {
  const lastIndexOfPeriod = name.lastIndexOf(".");

  return (lastIndexOfPeriod === -1) ? ["", name] : [
    name.substr(0, lastIndexOfPeriod),
    name.substr(lastIndexOfPeriod + 1),
  ];
};
