import {
  CircuitBreaker,
  CircuitBreakerService,
  CircuitBreakerOpenError,
} from '../circuit-breaker.service';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker(
      {
        failureThreshold: 3,
        windowMs: 60000,
        resetTimeoutMs: 1000,
        halfOpenRequests: 2,
      },
      'test',
    );
  });

  describe('initial state', () => {
    it('should start in CLOSED state', () => {
      expect(breaker.getState()).toBe('CLOSED');
    });

    it('should allow requests in CLOSED state', () => {
      expect(breaker.canRequest()).toBe(true);
    });

    it('should return correct stats in initial state', () => {
      const stats = breaker.getStats();
      expect(stats.state).toBe('CLOSED');
      expect(stats.failures).toBe(0);
      expect(stats.halfOpenSuccesses).toBe(0);
      expect(stats.nextAttemptTime).toBeNull();
    });
  });

  describe('CLOSED → OPEN transition', () => {
    it('should open circuit after reaching failure threshold', () => {
      for (let i = 0; i < 3; i++) {
        breaker.onFailure(new Error(`failure ${i}`));
      }
      expect(breaker.getState()).toBe('OPEN');
      expect(breaker.canRequest()).toBe(false);
    });

    it('should NOT open circuit below failure threshold', () => {
      breaker.onFailure(new Error('failure 1'));
      breaker.onFailure(new Error('failure 2'));
      // threshold is 3, so still CLOSED
      expect(breaker.getState()).toBe('CLOSED');
      expect(breaker.canRequest()).toBe(true);
    });

    it('should execute() and throw after failures reach threshold', async () => {
      const failingFn = jest.fn().mockRejectedValue(new Error('boom'));

      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(failingFn);
        } catch {
          // expected
        }
      }

      expect(breaker.getState()).toBe('OPEN');

      // Next execute should throw immediately without calling fn
      await expect(breaker.execute(failingFn)).rejects.toThrow(
        CircuitBreakerOpenError,
      );
      // fn should not have been called on the 4th attempt
      expect(failingFn).toHaveBeenCalledTimes(3);
    });

    it('should executeAndSuppress() and return fallback when OPEN', async () => {
      // Trip the circuit breaker
      for (let i = 0; i < 3; i++) {
        breaker.onFailure(new Error(`fail ${i}`));
      }

      expect(breaker.getState()).toBe('OPEN');

      const fn = jest.fn().mockResolvedValue('result');
      const result = await breaker.executeAndSuppress(fn, 'fallback');

      expect(result).toBe('fallback');
      expect(fn).not.toHaveBeenCalled();
    });

    it('should executeAndSuppress() without explicit fallback returns undefined', async () => {
      for (let i = 0; i < 3; i++) {
        breaker.onFailure(new Error(`fail ${i}`));
      }

      const fn = jest.fn().mockResolvedValue('result');
      const result = await breaker.executeAndSuppress(fn);

      expect(result).toBeUndefined();
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe('OPEN → HALF_OPEN transition', () => {
    it('should transition to HALF_OPEN after resetTimeoutMs', () => {
      // Trip the breaker
      for (let i = 0; i < 3; i++) {
        breaker.onFailure(new Error(`fail ${i}`));
      }
      expect(breaker.getState()).toBe('OPEN');

      // Wait for resetTimeoutMs
      jest.useFakeTimers();
      jest.advanceTimersByTime(1000);

      expect(breaker.canRequest()).toBe(true);
      expect(breaker.getState()).toBe('HALF_OPEN');
      jest.useRealTimers();
    });

    it('should reject requests before resetTimeoutMs elapses', () => {
      for (let i = 0; i < 3; i++) {
        breaker.onFailure(new Error(`fail ${i}`));
      }

      jest.useFakeTimers();
      jest.advanceTimersByTime(500); // only half the timeout

      expect(breaker.canRequest()).toBe(false);
      jest.useRealTimers();
    });
  });

  describe('HALF_OPEN → CLOSED (recovery)', () => {
    it('should close circuit after halfOpenRequests successes', () => {
      // Trip the breaker
      for (let i = 0; i < 3; i++) {
        breaker.onFailure(new Error(`fail ${i}`));
      }

      jest.useFakeTimers();
      jest.advanceTimersByTime(1000);

      // canRequest() triggers OPEN → HALF_OPEN transition
      expect(breaker.canRequest()).toBe(true);
      expect(breaker.getState()).toBe('HALF_OPEN');

      // halfOpenRequests = 2, so we need 2 successes
      breaker.onSuccess();
      expect(breaker.getState()).toBe('HALF_OPEN');

      breaker.onSuccess();
      expect(breaker.getState()).toBe('CLOSED');

      // Stats should be reset
      const stats = breaker.getStats();
      expect(stats.failures).toBe(0);
      expect(stats.halfOpenSuccesses).toBe(0);
      jest.useRealTimers();
    });

    it('should execute() with success recover from HALF_OPEN', async () => {
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(() => {
            throw new Error('fail');
          });
        } catch {
          // expected
        }
      }

      jest.useFakeTimers();
      jest.advanceTimersByTime(1000);

      // execute() internally calls canRequest() which triggers HALF_OPEN
      const successFn = jest.fn().mockResolvedValue('ok');
      const result = await breaker.execute(successFn);

      expect(result).toBe('ok');
      expect(breaker.getState()).toBe('HALF_OPEN'); // need 2 successes to recover
      expect(successFn).toHaveBeenCalledTimes(1);

      // Second success should close the circuit
      await breaker.execute(successFn);
      expect(breaker.getState()).toBe('CLOSED');
      jest.useRealTimers();
    });
  });

  describe('HALF_OPEN → OPEN (re-failure)', () => {
    it('should open circuit immediately on failure in HALF_OPEN', () => {
      for (let i = 0; i < 3; i++) {
        breaker.onFailure(new Error(`fail ${i}`));
      }

      jest.useFakeTimers();
      jest.advanceTimersByTime(1000);

      // Trigger HALF_OPEN transition via canRequest
      expect(breaker.canRequest()).toBe(true);
      expect(breaker.getState()).toBe('HALF_OPEN');

      // One success then one failure
      breaker.onSuccess();
      expect(breaker.getState()).toBe('HALF_OPEN');

      breaker.onFailure(new Error('re-fail'));
      expect(breaker.getState()).toBe('OPEN');
      jest.useRealTimers();
    });

    it('should reject further requests after HALF_OPEN failure', () => {
      for (let i = 0; i < 3; i++) {
        breaker.onFailure(new Error(`fail ${i}`));
      }

      jest.useFakeTimers();
      jest.advanceTimersByTime(1000);

      // Trigger HALF_OPEN then fail
      breaker.canRequest(); // transitions to HALF_OPEN
      breaker.onFailure(new Error('re-fail'));

      expect(breaker.canRequest()).toBe(false);
      jest.useRealTimers();
    });
  });

  describe('onSuccess in CLOSED state', () => {
    it('should decrement failure count on success', () => {
      breaker.onFailure(new Error('fail 1'));
      breaker.onFailure(new Error('fail 2'));
      expect(breaker.getStats().failures).toBe(2);

      breaker.onSuccess();
      expect(breaker.getStats().failures).toBe(1);

      breaker.onSuccess();
      expect(breaker.getStats().failures).toBe(0);
    });

    it('should not decrement below 0', () => {
      breaker.onSuccess();
      breaker.onSuccess();
      breaker.onSuccess();
      expect(breaker.getStats().failures).toBe(0);
    });
  });

  describe('execute() success path', () => {
    it('should call fn and return result in CLOSED state', async () => {
      const fn = jest.fn().mockResolvedValue('hello');
      const result = await breaker.execute(fn);
      expect(result).toBe('hello');
      expect(fn).toHaveBeenCalledTimes(1);
      expect(breaker.getState()).toBe('CLOSED');
    });

    it('should call onSuccess after successful fn', async () => {
      breaker.onFailure(new Error('pre-fail'));
      expect(breaker.getStats().failures).toBe(1);

      await breaker.execute(() => 'ok');
      expect(breaker.getStats().failures).toBe(0);
    });

    it('should call onFailure and re-throw on fn failure', async () => {
      const err = new Error('boom');
      await expect(
        breaker.execute(() => {
          throw err;
        }),
      ).rejects.toThrow('boom');
      expect(breaker.getState()).toBe('CLOSED'); // only 1 failure, threshold is 3
      expect(breaker.getStats().failures).toBe(1);
    });
  });

  describe('executeAndSuppress() edge cases', () => {
    it('should return result when fn succeeds', async () => {
      const fn = jest.fn().mockResolvedValue('data');
      const result = await breaker.executeAndSuppress(fn, 'fallback');
      expect(result).toBe('data');
      expect(breaker.getState()).toBe('CLOSED');
    });

    it('should return fallback when fn throws', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('fail'));

      // Trip the breaker first
      for (let i = 0; i < 3; i++) {
        await breaker.executeAndSuppress(fn, 'fb');
      }

      expect(breaker.getState()).toBe('OPEN');

      // Now executeAndSuppress should return fallback
      const result = await breaker.executeAndSuppress(fn, 'custom_fallback');
      expect(result).toBe('custom_fallback');
    });
  });

  describe('windowMs is NOT used', () => {
    it('should NOT reset failures after windowMs elapses (known limitation)', () => {
      // windowMs = 60000 in config, but it's never read in the implementation
      breaker.onFailure(new Error('fail 1'));
      breaker.onFailure(new Error('fail 2'));
      expect(breaker.getStats().failures).toBe(2);

      jest.useFakeTimers();
      jest.advanceTimersByTime(60000); // full window passes

      // Failures should NOT have been reset (windowMs is unused)
      expect(breaker.getStats().failures).toBe(2);
      jest.useRealTimers();
    });
  });
});

describe('CircuitBreakerService', () => {
  let service: CircuitBreakerService;

  beforeEach(() => {
    service = new CircuitBreakerService();
  });

  it('should create a new circuit breaker on get()', () => {
    const breaker = service.get('feishu');
    expect(breaker).toBeDefined();
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('should return the same instance on repeated get()', () => {
    const b1 = service.get('feishu');
    const b2 = service.get('feishu');
    expect(b1).toBe(b2);
  });

  it('should create independent breakers for different names', () => {
    const b1 = service.get('feishu');
    const b2 = service.get('dingtalk');
    expect(b1).not.toBe(b2);

    // Tripping one should not affect the other
    for (let i = 0; i < 5; i++) {
      b1.onFailure(new Error('fail'));
    }
    expect(b1.getState()).toBe('OPEN');
    expect(b2.getState()).toBe('CLOSED');
  });

  it('should allow custom config override', () => {
    const breaker = service.get('custom', { failureThreshold: 10 });
    expect(breaker).toBeDefined();
  });

  it('should remove a circuit breaker', () => {
    service.get('feishu');
    service.remove('feishu');

    const stats = service.getAllStats();
    expect(stats.has('feishu')).toBe(false);
  });

  it('should return stats for all breakers', () => {
    service.get('feishu');
    service.get('dingtalk');

    const stats = service.getAllStats();
    expect(stats.size).toBe(2);
    expect(stats.has('feishu')).toBe(true);
    expect(stats.has('dingtalk')).toBe(true);
  });

  it('should return empty map when no breakers exist', () => {
    const stats = service.getAllStats();
    expect(stats.size).toBe(0);
  });
});
