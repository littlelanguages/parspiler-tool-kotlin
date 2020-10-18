import * as Assert from "./testing/asserts.ts";
import { exec, OutputMode } from "https://deno.land/x/exec@0.0.5/mod.ts";

import { command } from "./mod.ts";

Deno.test("scanpiler-tool-kotlin", async () => {
  await parspiler("simple");
  await parspiler("parspiler");

  await gradle();
});

async function parspiler(name: string) {
  await command(
    `./test/src/main/kotlin/${name}/parser.llgd`,
    {
      directory: "./test/src/main/kotlin",
      scannerPackage: `${name}.scanner`,
      parserPackage: `${name}`,
      force: true,
      verbose: true,
    },
  );
}

async function gradle() {
  const result = await exec(
    '/bin/bash -c "cd test ; ./gradlew test"',
    { output: OutputMode.Capture },
  );

  if (result.status.code !== 0) {
    console.log(result);
  }

  Assert.assertEquals(result.status.code, 0);
}
