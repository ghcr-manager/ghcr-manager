#!/usr/bin/env node
/* global process */

import { graphScenarioMatrix } from "./test-scenarios/_definitions.mjs";

process.stdout.write(JSON.stringify({ include: graphScenarioMatrix }));
