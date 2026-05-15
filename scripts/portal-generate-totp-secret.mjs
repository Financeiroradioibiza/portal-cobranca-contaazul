#!/usr/bin/env node
import { generateSecret } from "otplib";

console.log(generateSecret());
