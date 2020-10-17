import * as Assert from "../../testing/asserts.ts";

import { mkParser, Visitor } from "./parser-parser.ts";
import { mkScanner, Token } from "./parser-scanner.ts";

const visitor: Visitor<
  string,
  string,
  string,
  [string, string],
  string | number,
  string | undefined,
  Array<string | number>,
  Array<string | number>
> = {
  visitId: (a: Token): string => a[2],
  visitIds: (a: Array<Token>): string => a.map((id) => id[2]).join(", "),
  visitOptionalId: (a: string | undefined): string => a ?? "",
  visitManyIds: (a1: string, a2: string): [string, string] => [a1, a2],
  visitAlternativeValues1: (a: string): string | number => a,
  visitAlternativeValues2: (a: Token): string | number => parseInt(a[2]),
  visitOptionalManyIds: (a: [string, string] | undefined): string | undefined =>
    (a == undefined) ? undefined : `${a[0]}-${a[1]}`,
  visitManyAlternativeValues: (
    a: Array<([string, string] | Token)>,
  ): Array<string | number> =>
    a.map((v) => v.length == 2 ? `${v[0]}-${v[1]}` : parseInt(v[2])),
  visitManyAlternativeOptionalValues: (
    a: Array<([string, string] | Token | undefined)>,
  ): Array<string | number> =>
    a.map((v) =>
      v == undefined
        ? "<undefined>"
        : (v.length == 2)
        ? `${v[0]}-${v[1]}`
        : parseInt(v[2])
    ),
};

Deno.test("test - simple - id", () => {
  Assert.assertEquals(mkParser(mkScanner("abc"), visitor).id(), "abc");
});

Deno.test("test - simple - ids", () => {
  Assert.assertEquals(mkParser(mkScanner(""), visitor).ids(), "");
  Assert.assertEquals(mkParser(mkScanner("hello"), visitor).ids(), "hello");
  Assert.assertEquals(
    mkParser(mkScanner("hello world"), visitor).ids(),
    "hello, world",
  );
});

Deno.test("test - simple - optional id", () => {
  Assert.assertEquals(mkParser(mkScanner(""), visitor).optionalId(), "");
  Assert.assertEquals(
    mkParser(mkScanner("hello"), visitor).optionalId(),
    "hello",
  );
});

Deno.test("test - simple - many ids", () => {
  Assert.assertEquals(
    mkParser(mkScanner("hello"), visitor).manyIds(),
    ["hello", ""],
  );

  Assert.assertEquals(
    mkParser(mkScanner("hello world worlds"), visitor).manyIds(),
    ["hello", "world, worlds"],
  );
});

Deno.test("test - simple - many ids", () => {
  Assert.assertEquals(
    mkParser(mkScanner("123"), visitor).alternativeValues(),
    123,
  );

  Assert.assertEquals(
    mkParser(mkScanner("hello world worlds"), visitor).alternativeValues(),
    "hello, world, worlds",
  );
});

Deno.test("test - simple - optional many ids", () => {
  Assert.assertEquals(
    mkParser(mkScanner(""), visitor).optionalManyIds(),
    undefined,
  );

  Assert.assertEquals(
    mkParser(mkScanner("hello"), visitor).optionalManyIds(),
    "hello-",
  );

  Assert.assertEquals(
    mkParser(mkScanner("hello world worlds"), visitor).optionalManyIds(),
    "hello-world, worlds",
  );
});

Deno.test("test - simple - many alternative values", () => {
  Assert.assertEquals(
    mkParser(mkScanner(""), visitor).manyAlternativeValues(),
    [],
  );

  Assert.assertEquals(
    mkParser(mkScanner("hello"), visitor).manyAlternativeValues(),
    ["hello-"],
  );

  Assert.assertEquals(
    mkParser(mkScanner("hello world worlds"), visitor).manyAlternativeValues(),
    ["hello-world, worlds"],
  );

  Assert.assertEquals(
    mkParser(mkScanner("hello 123 world 456 war of the worlds"), visitor)
      .manyAlternativeValues(),
    ["hello-", 123, "world-", 456, "war-of, the, worlds"],
  );
});

Deno.test("test - simple - many alternative values with optional", () => {
  Assert.assertEquals(
    mkParser(mkScanner(""), visitor).manyAlternativeOptionalValues(),
    [],
  );

  Assert.assertEquals(
    mkParser(mkScanner("hello"), visitor).manyAlternativeOptionalValues(),
    ["hello-"],
  );

  Assert.assertEquals(
    mkParser(mkScanner("hello world worlds"), visitor)
      .manyAlternativeOptionalValues(),
    ["hello-world, worlds"],
  );

  Assert.assertEquals(
    mkParser(mkScanner("hello 123 world 456 war of the worlds"), visitor)
      .manyAlternativeOptionalValues(),
    ["hello-", 123, "world-", 456, "war-of, the, worlds"],
  );
});
