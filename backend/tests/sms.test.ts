import test from "node:test";
import assert from "node:assert/strict";
import { formatPhoneNumber } from "../src/services/sms.service.js";

test("SMS Phone Formatter - Formats 10-digit Indian mobile numbers to +91", () => {
  assert.strictEqual(formatPhoneNumber("9876543210"), "+919876543210");
  assert.strictEqual(formatPhoneNumber(" 98765 43210 "), "+919876543210");
  assert.strictEqual(formatPhoneNumber("9876-543-210"), "+919876543210");
});

test("SMS Phone Formatter - Preserves existing international + codes", () => {
  assert.strictEqual(formatPhoneNumber("+919876543210"), "+919876543210");
  assert.strictEqual(formatPhoneNumber("+14155552671"), "+14155552671");
  assert.strictEqual(formatPhoneNumber("+447911123456"), "+447911123456");
});

test("SMS Phone Formatter - Normalizes 12-digit Indian numbers starting with 91", () => {
  assert.strictEqual(formatPhoneNumber("919876543210"), "+919876543210");
});

test("SMS Phone Formatter - Strips letters and invalid symbols", () => {
  assert.strictEqual(formatPhoneNumber("call: (9876) 543-210"), "+919876543210");
});
