import * as Assert from "./testing/asserts.ts";
import { exec, OutputMode } from "https://deno.land/x/exec@0.0.5/mod.ts";

import { command } from "./mod.ts";

await test("simple");
// await test("parspiler");

async function test(name: string) {
  Deno.test(name, async () => {
    await assertTest(name);
  });
}

async function assertTest(name: string) {
  await command(
    `./test/src/main/kotlin/${name}/parser.llgd`,
    {
      directory: "./test/src/main/kotlin",
      scannerName: "simple.Scanner",
      parserName: "simple.Parser",
      force: true,
      verbose: true,
    },
  );

  // const result = await exec(
  //   `deno test ./test/${name}/parser_t.ts`,
  //   { output: OutputMode.StdOut },
  // );

  // Assert.assertEquals(result.status.code, 0);
}
