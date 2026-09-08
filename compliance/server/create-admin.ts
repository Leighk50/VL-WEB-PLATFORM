import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { migrateDatabase } from "./db.js";
import {
  AdminBootstrapError,
  createAdministrator,
  inspectAdminBootstrap,
} from "./admin-bootstrap.js";

async function hiddenPrompt(label: string): Promise<string> {
  if (!stdin.isTTY || !stdout.isTTY || !stdin.setRawMode)
    throw new Error("Password entry requires an interactive terminal");
  stdout.write(label);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let value = "";
    const cleanup = () => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
    };
    const onData = (chunk: string) => {
      for (const character of chunk) {
        if (character === "\r" || character === "\n") {
          cleanup();
          resolve(value);
          return;
        }
        if (character === "\u0003") {
          cleanup();
          reject(new Error("Administrator creation cancelled"));
          return;
        }
        if (character === "\b" || character === "\u007f")
          value = value.slice(0, -1);
        else if (character >= " ") value += character;
      }
    };
    stdin.on("data", onData);
  });
}

async function main() {
  await migrateDatabase();
  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    const email = await prompt.question("Email: ");
    const displayName = await prompt.question("Display name: ");
    const status = await inspectAdminBootstrap(email);
    if (status.duplicate)
      throw new AdminBootstrapError("A user with that email already exists");

    let allowAdditionalAdmin = false;
    if (status.activeAdmin) {
      const confirmation = await prompt.question(
        "An active administrator already exists. Type YES to create another: ",
      );
      if (confirmation !== "YES")
        throw new Error("Administrator creation cancelled");
      allowAdditionalAdmin = true;
    }

    prompt.pause();
    const password = await hiddenPrompt("Password: ");
    const passwordConfirmation = await hiddenPrompt("Confirm password: ");
    const administrator = await createAdministrator(
      { email, displayName, password, passwordConfirmation },
      { allowAdditionalAdmin },
    );
    stdout.write(
      `Administrator created: ${administrator.email} (${administrator.role})\n`,
    );
  } finally {
    prompt.close();
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Administrator creation failed";
  console.error(`Administrator creation failed: ${message}`);
  process.exitCode = 1;
});
