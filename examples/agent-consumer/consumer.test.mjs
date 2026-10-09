import { test } from "node:test";
import assert from "node:assert/strict";
import { CircuitBreaker, CircuitState } from "./circuit.mjs";

test("consecutive failures trip the circuit and suppress the next call", async () => {
  const breaker = new CircuitBreaker({
    failureThreshold: 2,
    resetTimeout: 10000,
  });
  let calls = 0;
  const fail = async () => {
    calls++;
    throw new Error("unavailable");
  };
  await assert.rejects(breaker.execute(fail), /unavailable/);
  await assert.rejects(breaker.execute(fail), /unavailable/);
  assert.equal(breaker.getState(), CircuitState.OPEN);
  await assert.rejects(breaker.execute(fail), /OPEN/);
  assert.equal(calls, 2);
});

test("reset clears the failure state and permits a successful result", async () => {
  const breaker = new CircuitBreaker({ failureThreshold: 1 });
  await assert.rejects(
    breaker.execute(async () => {
      throw new Error("unavailable");
    }),
  );
  breaker.reset();
  assert.equal(breaker.getState(), CircuitState.CLOSED);
  assert.equal(await breaker.execute(async () => 42), 42);
  assert.equal(breaker.getStats().failures, 0);
});

test("a successful probe after reset timeout closes the circuit", async (t) => {
  let now = 1000;
  t.mock.method(Date, "now", () => now);
  const breaker = new CircuitBreaker({
    failureThreshold: 1,
    resetTimeout: 100,
  });
  await assert.rejects(
    breaker.execute(async () => {
      throw new Error("unavailable");
    }),
  );
  assert.equal(breaker.getState(), CircuitState.OPEN);
  now = 1101;
  assert.equal(breaker.getState(), CircuitState.HALF_OPEN);
  assert.equal(await breaker.execute(async () => "recovered"), "recovered");
  assert.equal(breaker.getState(), CircuitState.CLOSED);
});
