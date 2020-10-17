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
