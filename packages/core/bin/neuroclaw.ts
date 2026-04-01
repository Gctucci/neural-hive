#!/usr/bin/env node
import { createCLI } from "../src/cli";

createCLI().parse(process.argv);
