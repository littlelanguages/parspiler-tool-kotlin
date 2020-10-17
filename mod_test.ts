import * as Assert from "./testing/asserts.ts";
import { exec, OutputMode } from "https://deno.land/x/exec@0.0.5/mod.ts";

import { denoCommand } from "./mod.ts";

// await test("simple");
// await test("parspiler");

async function test(name: string) {
  Deno.test(name, async () => {
    await assertTest(name);
  });
}

async function assertTest(name: string) {
  await denoCommand(
    `./test/${name}/parser.pd`,
    {
      scannerOutputFileName: undefined,
      parserOutputFileName: undefined,
      force: true,
      verbose: true,
    },
  );

  const result = await exec(
    `deno test ./test/${name}/parser_t.ts`,
    { output: OutputMode.StdOut },
  );

  Assert.assertEquals(result.status.code, 0);
}
