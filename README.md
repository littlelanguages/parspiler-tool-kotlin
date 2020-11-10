# parspiler-tool-kotlin

A tool to generate a Kotlin parser and scanner from a language's grammar and lexical definition.

## Input Syntax

The following EBNF grammar defines `parspiler`'s syntax.

```
Definition: 
    "uses" LiteralString ";"
    {Production};
    
Production: Identifier ":" Expr ";";

Expr: SequenceExpr {"|" SequenceExpr};

SequenceExpr: {Factor};

Factor
  : LiteralString
  | "(" Expr ")"
  | "{" Expr "}"
  | "[" Expr "]"
  | Identifier
  ;
```

This grammar's scanner is defined as follows:

```
tokens
    LiteralString = '"' {!'"'} '"';
    Identifier = alpha {alpha | digit};

comments
    "/*" to "*/" nested;
    "//" {!cr};

whitespace
    chr(0)-' ';

fragments
    digit = '0'-'9';
    alpha = 'a'-'z' + 'A'-'Z';
    cr = chr(10);
```

## Building Source

The directory `~/.devcontainer` contains a Dockerfile used by [Visual Studio Code](https://code.visualstudio.com) to issolate the editor and build tools from being installed on the developer's workstation.

The Dockerfile is straightforward with the interesting piece being [entr](https://github.com/eradman/entr/) which is used by the `etl.sh` to run `test.sh` whenever a source file has changed.

## Scripts

Two script can be found inside `~/.bin`

| Name   | Purpose |
|--------|----------------------------------|
| etl.sh | Runs an edit-test-loop - loops indefinately running all of the tests whenever a source file has changed. |
| test.sh | Runs lint on the source code and executes the automated tests. |

These scripts must be run out of the project's root directory which, when using [Visual Studio Code](https://code.visualstudio.com), is done using a shell inside the container.