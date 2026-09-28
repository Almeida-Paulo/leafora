import assert from "node:assert/strict";
import { parseAmount, decimal, formatUnits, sharePercent } from "../../apps/web/assets/js/money.js";
for (const invalid of ["", "0", "-1", "NaN", "Infinity", "1e3", "0.00000001", "1,000.00", "100000000001"]) {
  assert.throws(() => parseAmount(invalid), invalid);
}
assert.equal(parseAmount("0,0000001"), 1n);
assert.equal(parseAmount("100.25"), 1002500000n);
assert.equal(decimal(1002500000n), "100.25");
assert.equal(formatUnits(1002500000n), "100,25");
assert.equal(formatUnits(10n ** 18n, "en-US"), "100,000,000,000");
assert.throws(() => formatUnits(null));
assert.equal(sharePercent("100", "400"), 25);
console.log("PASS: exact USDC/AP parsing, formatting, limits and fractions.");
