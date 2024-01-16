import yargs, { Options } from "yargs";
import { hideBin } from "yargs/helpers";

// Define a type for the argument specification object.
export type ArgumentSpecs = {
  [key: string]: Options & { type?: "string" | "boolean" | "number" };
};

// Define a type for the worker function.
type WorkerFunction<T> = (args: T) => Promise<void>;

// Define a utility type to infer the argument types from the argument specs.
type InferArgs<T> = {
  [P in keyof T]: T[P] extends { type: "number" }
    ? number
    : T[P] extends { type: "boolean" }
      ? boolean
      : T[P] extends { type: "string" }
        ? string
        : never;
} & { execute?: boolean };

const defaultArgumentSpecs: ArgumentSpecs = {
  execute: {
    alias: "e",
    describe: "Execute the script",
    type: "boolean" as const,
    default: false,
  },
};

export function makeScript<T extends ArgumentSpecs>(
  argumentSpecs: T,
  worker: WorkerFunction<InferArgs<T> & { execute: boolean }>
): void {
  const argv = yargs(hideBin(process.argv));

  const combinedArgumentSpecs = { ...defaultArgumentSpecs, ...argumentSpecs };

  // Configure yargs using the provided argument specifications.
  Object.entries(combinedArgumentSpecs).forEach(([key, options]) => {
    argv.option(key, options);
  });
  argv
    .help("h")
    .alias("h", "help")
    .parseAsync()
    .then((args) => worker(args as InferArgs<T & { execute: boolean }>))
    .catch((error) => {
      console.error("An error occurred:", error);
      process.exit(1);
    });
}
