#!/usr/bin/env node
import { runCli } from '../src/cli.js'

void runCli(process.argv.slice(2), {
  stdout: process.stdout,
  stderr: process.stderr,
}).then((code) => {
  process.exitCode = code
})
