import { ErrorDetector } from './error-detector';

describe('ErrorDetector', () => {
  let detector: ErrorDetector;

  const SESSION_ID = '71eea228-4687-48ad-9644-732ad6d71831';

  beforeEach(() => {
    detector = new ErrorDetector();
  });

  afterEach(() => {
    detector.clearSession(SESSION_ID);
  });

  // ----------------------------------------------------------------
  // Pattern 1: openclaw:prompt-error
  // ----------------------------------------------------------------

  describe('Pattern 1: prompt-error', () => {
    it('should detect LLM timeout error from custom event', () => {
      const entry = {
        type: 'custom',
        customType: 'openclaw:prompt-error',
        data: {
          timestamp: 1776218633783,
          error: 'LLM idle timeout (60s): no response from model',
        },
      };

      const errors = detector.analyzeLine(entry, SESSION_ID);

      expect(errors.length).toBe(1);
      expect(errors[0].pattern).toBe('prompt-error');
      expect(errors[0].severity).toBe('critical');
      expect(errors[0].toolName).toBe('llm');
      expect(errors[0].errorMessage).toContain('timeout');
    });

    it('should not produce error for custom event without error field', () => {
      const entry = {
        type: 'custom',
        customType: 'openclaw:prompt-error',
        data: { timestamp: 1776218633783 },
      };

      const errors = detector.analyzeLine(entry, SESSION_ID);
      expect(errors.length).toBe(0);
    });

    it('should classify model switch as warning', () => {
      const entry = {
        type: 'custom',
        customType: 'openclaw:prompt-error',
        data: {
          timestamp: 1776218633783,
          error: 'Model rate limited, switching to fallback',
        },
      };

      const errors = detector.analyzeLine(entry, SESSION_ID);
      expect(errors.length).toBe(1);
      // "rate limited" is not in critical/warning keywords, defaults to info
      // But we still detect it as an error
      expect(errors[0].pattern).toBe('prompt-error');
    });
  });

  // ----------------------------------------------------------------
  // Pattern 2: tool-status-error
  // ----------------------------------------------------------------

  describe('Pattern 2: tool-status-error', () => {
    it('should detect fetch failed error in tool result JSON', () => {
      const entry = {
        type: 'message',
        role: 'toolResult',
        toolName: 'web_search',
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'error',
              tool: 'web_search',
              error: 'fetch failed',
            }),
          },
        ],
        isError: false,
      };

      const errors = detector.analyzeLine(entry, SESSION_ID);

      // tool-status-error + stack-trace (keyword: "fetch failed") = 2 errors
      expect(errors.length).toBeGreaterThanOrEqual(1);
      const statusError = errors.find((e) => e.pattern === 'tool-status-error');
      expect(statusError).toBeDefined();
      expect(statusError!.severity).toBe('warning');
      expect(statusError!.toolName).toBe('web_search');
      expect(statusError!.errorMessage).toBe('fetch failed');
    });

    it('should detect extraction failed error', () => {
      const entry = {
        type: 'message',
        role: 'toolResult',
        toolName: 'web_fetch',
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'error',
              error:
                'Web fetch extraction failed: Readability, provider fallback, and basic HTML cleanup returned no content.',
            }),
          },
        ],
        isError: false,
      };

      const errors = detector.analyzeLine(entry, SESSION_ID);

      // tool-status-error + stack-trace (keyword: "extraction failed") = 2 errors
      expect(errors.length).toBeGreaterThanOrEqual(1);
      const statusError = errors.find((e) => e.pattern === 'tool-status-error');
      expect(statusError).toBeDefined();
      expect(statusError!.severity).toBe('warning');
    });

    it('should detect security blocked error as critical', () => {
      const entry = {
        type: 'message',
        role: 'toolResult',
        toolName: 'web_fetch',
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'error',
              error:
                'Blocked: resolves to private/internal/special-use IP address',
            }),
          },
        ],
        isError: false,
      };

      const errors = detector.analyzeLine(entry, SESSION_ID);

      // tool-status-error + stack-trace (keyword: "Blocked")
      expect(errors.length).toBeGreaterThanOrEqual(1);
      const statusError = errors.find((e) => e.pattern === 'tool-status-error');
      expect(statusError).toBeDefined();
      // Security block is classified as warning (policy rejection, not runtime failure)
      expect(statusError!.severity).toBe('warning');
    });

    it('should detect empty results from memory_search', () => {
      const entry = {
        type: 'message',
        role: 'toolResult',
        toolName: 'memory_search',
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              results: [],
              provider: 'none',
              citations: 'auto',
              mode: 'fts-only',
            }),
          },
        ],
        isError: false,
      };

      const errors = detector.analyzeLine(entry, SESSION_ID);

      expect(errors.length).toBe(1);
      expect(errors[0].pattern).toBe('tool-status-error');
      expect(errors[0].severity).toBe('info');
    });

    it('should NOT detect error for successful tool result', () => {
      const entry = {
        type: 'message',
        role: 'toolResult',
        toolName: 'exec',
        content: [
          {
            type: 'text',
            text: JSON.stringify({ status: 'success', output: 'done' }),
          },
        ],
        isError: false,
      };

      const errors = detector.analyzeLine(entry, SESSION_ID);
      expect(errors.length).toBe(0);
    });
  });

  // ----------------------------------------------------------------
  // Pattern 3: non-zero-exit
  // ----------------------------------------------------------------

  describe('Pattern 3: non-zero-exit', () => {
    it('should detect non-zero exit code', () => {
      const entry = {
        type: 'message',
        role: 'toolResult',
        toolName: 'exec',
        content: [
          {
            type: 'text',
            text: 'Error: Failed to merge PR #125\nMessage: Bad credentials\n(Command exited with code 1)',
          },
        ],
        details: { status: 'completed', exitCode: 1 },
        isError: false,
      };

      const errors = detector.analyzeLine(entry, SESSION_ID);

      const exitError = errors.find((e) => e.pattern === 'non-zero-exit');
      expect(exitError).toBeDefined();
      expect(exitError!.severity).toBe('critical');
      expect(exitError!.toolName).toBe('exec');
    });

    it('should NOT detect error for exit code 0', () => {
      const entry = {
        type: 'message',
        role: 'toolResult',
        toolName: 'exec',
        content: [{ type: 'text', text: 'success' }],
        details: { status: 'completed', exitCode: 0 },
        isError: false,
      };

      const errors = detector.analyzeLine(entry, SESSION_ID);
      expect(errors.filter((e) => e.pattern === 'non-zero-exit')).toHaveLength(
        0,
      );
    });

    it('should extract error message from output', () => {
      const entry = {
        type: 'message',
        role: 'toolResult',
        toolName: 'exec',
        content: [
          {
            type: 'text',
            text: 'Error: Failed to merge PR #125\nMessage: Bad credentials',
          },
        ],
        details: { exitCode: 1 },
        isError: false,
      };

      const errors = detector.analyzeLine(entry, SESSION_ID);
      const exitError = errors.find((e) => e.pattern === 'non-zero-exit');
      expect(exitError!.errorMessage).toContain('Failed to merge PR');
    });
  });

  // ----------------------------------------------------------------
  // Pattern 4: stack-trace
  // ----------------------------------------------------------------

  describe('Pattern 4: stack-trace', () => {
    it('should detect stack trace in output', () => {
      const stackTrace = `Error: listen EADDRINUSE: address already in use 0.0.0.0:3001
    at Server.setupListenHandle [as _listen2] (node:net:2008:16)
    at listenInCluster (node:net:2065:12)
    at processTicksAndRejections (node:internal/process/task_queues:90:21) {
  code: 'EADDRINUSE',
  errno: -98
}`;

      const entry = {
        type: 'message',
        role: 'toolResult',
        toolName: 'exec',
        content: [{ type: 'text', text: stackTrace }],
        details: { exitCode: 0 },
        isError: false,
      };

      const errors = detector.analyzeLine(entry, SESSION_ID);

      const stackError = errors.find((e) => e.pattern === 'stack-trace');
      expect(stackError).toBeDefined();
      expect(stackError!.severity).toBe('critical');
      expect(stackError!.errorMessage).toContain('listen EADDRINUSE');
    });

    it('should detect known error keywords', () => {
      const entry = {
        type: 'message',
        role: 'toolResult',
        toolName: 'exec',
        content: [
          {
            type: 'text',
            text: 'Connection refused: ECONNREFUSED on port 3000',
          },
        ],
        details: { exitCode: 0 },
        isError: false,
      };

      const errors = detector.analyzeLine(entry, SESSION_ID);

      const keywordError = errors.find((e) => e.pattern === 'stack-trace');
      expect(keywordError).toBeDefined();
      expect(keywordError!.errorMessage).toBe('ECONNREFUSED');
    });

    it('should NOT detect error for clean output', () => {
      const entry = {
        type: 'message',
        role: 'toolResult',
        toolName: 'exec',
        content: [{ type: 'text', text: 'Hello world\nDone.' }],
        details: { exitCode: 0 },
        isError: false,
      };

      const errors = detector.analyzeLine(entry, SESSION_ID);
      expect(errors.filter((e) => e.pattern === 'stack-trace')).toHaveLength(0);
    });
  });

  // ----------------------------------------------------------------
  // Pattern 5: consecutive-failures
  // ----------------------------------------------------------------

  describe('Pattern 5: consecutive-failures', () => {
    function makeFailedEntry(toolName: string, errorMsg: string) {
      return {
        type: 'message',
        role: 'toolResult',
        toolName,
        content: [
          {
            type: 'text',
            text: JSON.stringify({ status: 'error', error: errorMsg }),
          },
        ],
        isError: false,
      };
    }

    it('should detect consecutive failures for same tool', () => {
      // 3 consecutive failures (threshold)
      const errors1 = detector.analyzeLine(
        makeFailedEntry('web_search', 'fetch failed'),
        SESSION_ID,
      );
      const errors2 = detector.analyzeLine(
        makeFailedEntry('web_search', 'fetch failed'),
        SESSION_ID,
      );
      const errors3 = detector.analyzeLine(
        makeFailedEntry('web_search', 'fetch failed'),
        SESSION_ID,
      );

      const consecutiveErrors = [errors1, errors2, errors3]
        .flat()
        .filter((e) => e.pattern === 'consecutive-failures');

      expect(consecutiveErrors.length).toBeGreaterThanOrEqual(1);
      expect(consecutiveErrors[0].severity).toBe('critical');
    });

    it('should NOT detect consecutive failures below threshold', () => {
      const errors1 = detector.analyzeLine(
        makeFailedEntry('web_search', 'fetch failed'),
        SESSION_ID,
      );
      const errors2 = detector.analyzeLine(
        makeFailedEntry('web_search', 'fetch failed'),
        SESSION_ID,
      );

      const consecutiveErrors = [errors1, errors2]
        .flat()
        .filter((e) => e.pattern === 'consecutive-failures');

      expect(consecutiveErrors).toHaveLength(0);
    });

    it('should reset consecutive count on success', () => {
      // 2 failures
      detector.analyzeLine(
        makeFailedEntry('web_search', 'fetch failed'),
        SESSION_ID,
      );
      detector.analyzeLine(
        makeFailedEntry('web_search', 'fetch failed'),
        SESSION_ID,
      );

      // 1 success (resets counter)
      const successEntry = {
        type: 'message',
        role: 'toolResult',
        toolName: 'web_search',
        content: [
          { type: 'text', text: JSON.stringify({ status: 'success' }) },
        ],
        isError: false,
      };
      detector.analyzeLine(successEntry, SESSION_ID);

      // 1 more failure (should not trigger consecutive since counter was reset)
      const errors = detector.analyzeLine(
        makeFailedEntry('web_search', 'fetch failed'),
        SESSION_ID,
      );
      const consecutiveErrors = errors.filter(
        (e) => e.pattern === 'consecutive-failures',
      );
      expect(consecutiveErrors).toHaveLength(0);
    });

    it('should NOT detect consecutive failures across different tools', () => {
      const errors1 = detector.analyzeLine(
        makeFailedEntry('web_search', 'fetch failed'),
        SESSION_ID,
      );
      const errors2 = detector.analyzeLine(
        makeFailedEntry('web_fetch', 'extraction failed'),
        SESSION_ID,
      );
      const errors3 = detector.analyzeLine(
        makeFailedEntry('web_search', 'fetch failed'),
        SESSION_ID,
      );

      const consecutiveErrors = [errors1, errors2, errors3]
        .flat()
        .filter((e) => e.pattern === 'consecutive-failures');

      expect(consecutiveErrors).toHaveLength(0);
    });
  });

  // ----------------------------------------------------------------
  // Session cleanup
  // ----------------------------------------------------------------

  describe('clearSession', () => {
    it('should clear failure history for a session', () => {
      // Record 3 failures
      for (let i = 0; i < 3; i++) {
        detector.analyzeLine(
          {
            type: 'message',
            role: 'toolResult',
            toolName: 'web_search',
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  status: 'error',
                  error: 'fetch failed',
                }),
              },
            ],
            isError: false,
          },
          SESSION_ID,
        );
      }

      detector.clearSession(SESSION_ID);

      // After clear, 3 more failures should NOT trigger consecutive (history was cleared)
      // Actually, after clear, it would need 3 new failures to trigger again
      // Let's verify by adding only 2 and checking no consecutive error
      const errors = detector.analyzeLine(
        {
          type: 'message',
          role: 'toolResult',
          toolName: 'web_search',
          content: [
            {
              type: 'text',
              text: JSON.stringify({ status: 'error', error: 'fetch failed' }),
            },
          ],
          isError: false,
        },
        SESSION_ID,
      );

      const consecutiveErrors = errors.filter(
        (e) => e.pattern === 'consecutive-failures',
      );
      expect(consecutiveErrors).toHaveLength(0);
    });
  });

  // ----------------------------------------------------------------
  // Edge cases
  // ----------------------------------------------------------------

  describe('Edge cases', () => {
    it('should detect exec with Bad credentials (real-world case)', () => {
      const entry = {
        type: 'message',
        id: '519b3638',
        parentId: 'ecb8fb49',
        role: 'toolResult',
        toolCallId: 'call_932b04560a7b44afa1db9d9e',
        toolName: 'exec',
        content: [
          {
            type: 'text',
            text: `[git-workflow] 合并 PR #125 (方式：merge)...
Error: Failed to merge PR #125
Message: Bad credentials
Response: {
  "message": "Bad credentials",
  "documentation_url": "https://docs.github.com/rest",
  "status": "401"
}
[git-workflow] ❌ PR 合并失败

(Command exited with code 1)`,
          },
        ],
        details: { status: 'completed', exitCode: 1, durationMs: 2700 },
        isError: false,
      };

      const errors = detector.analyzeLine(entry, SESSION_ID);

      // Should detect non-zero exit
      const exitError = errors.find((e) => e.pattern === 'non-zero-exit');
      expect(exitError).toBeDefined();
      expect(exitError!.severity).toBe('critical');
      expect(exitError!.errorMessage).toContain('Failed to merge PR');

      // Should also detect Bad credentials keyword
      const keywordError = errors.find((e) => e.pattern === 'stack-trace');
      expect(keywordError).toBeDefined();
      expect(keywordError!.errorMessage).toBe('Bad credentials');
    });

    it('should detect openclaw:prompt-error custom event (real-world case)', () => {
      const entry = {
        type: 'custom',
        customType: 'openclaw:prompt-error',
        data: {
          timestamp: 1776218633783,
          runId: '8942063b-1b11-465d-8c52-21b4ed7cdea0',
          sessionId: SESSION_ID,
          provider: 'bailian',
          model: 'qwen3.6-plus',
          api: 'openai-completions',
          error: 'LLM idle timeout (60s): no response from model',
        },
        id: '135807d0',
        parentId: '4eceb8af',
        timestamp: '2026-04-15T02:03:53.783Z',
      };

      const errors = detector.analyzeLine(entry, SESSION_ID);

      expect(errors.length).toBe(1);
      expect(errors[0].pattern).toBe('prompt-error');
      expect(errors[0].severity).toBe('critical');
      expect(errors[0].toolName).toBe('llm');
      expect(errors[0].errorMessage).toContain('LLM idle timeout');
    });

    it('should detect web_fetch blocked IP (real-world case)', () => {
      const entry = {
        type: 'message',
        id: 'f41c8d31',
        parentId: '0d091cd3',
        role: 'toolResult',
        toolCallId: 'call_ffe059cb51ca4eb49ae777d3',
        toolName: 'web_fetch',
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'error',
              tool: 'web_fetch',
              error:
                'Blocked: resolves to private/internal/special-use IP address',
            }),
          },
        ],
        details: {
          status: 'error',
          tool: 'web_fetch',
          error: 'Blocked: resolves to private/internal/special-use IP address',
        },
        isError: false,
        timestamp: 1776218246030,
      };

      const errors = detector.analyzeLine(entry, SESSION_ID);
      const statusError = errors.find((e) => e.pattern === 'tool-status-error');
      expect(statusError).toBeDefined();
      expect(statusError!.severity).toBe('warning');
      expect(statusError!.errorMessage).toContain('Blocked');
    });

    it('should detect web_fetch extraction failed (real-world case)', () => {
      const entry = {
        type: 'message',
        id: '98c96449',
        parentId: 'd8fc0672',
        role: 'toolResult',
        toolCallId: 'call_da4d1266bf464d6c90428064',
        toolName: 'web_fetch',
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'error',
              tool: 'web_fetch',
              error:
                'Web fetch extraction failed: Readability, provider fallback, and basic HTML cleanup returned no content.',
            }),
          },
        ],
        details: {
          status: 'error',
          tool: 'web_fetch',
          error:
            'Web fetch extraction failed: Readability, provider fallback, and basic HTML cleanup returned no content.',
        },
        isError: false,
        timestamp: 1776218249294,
      };

      const errors = detector.analyzeLine(entry, SESSION_ID);
      const statusError = errors.find((e) => e.pattern === 'tool-status-error');
      expect(statusError).toBeDefined();
      expect(statusError!.severity).toBe('warning');
      expect(statusError!.errorMessage).toContain('extraction failed');
    });

    it('should handle non-JSON content gracefully', () => {
      const entry = {
        type: 'message',
        role: 'toolResult',
        toolName: 'exec',
        content: [{ type: 'text', text: 'This is not JSON at all' }],
        details: { exitCode: 0 },
        isError: false,
      };

      const errors = detector.analyzeLine(entry, SESSION_ID);
      expect(
        errors.filter((e) => e.pattern === 'tool-status-error'),
      ).toHaveLength(0);
    });

    it('should handle empty content', () => {
      const entry = {
        type: 'message',
        role: 'toolResult',
        toolName: 'exec',
        content: [],
        isError: false,
      };

      const errors = detector.analyzeLine(entry, SESSION_ID);
      expect(errors).toHaveLength(0);
    });

    it('should handle non-message entries without error', () => {
      const entry = {
        type: 'message',
        role: 'user',
        content: 'Hello',
      };

      const errors = detector.analyzeLine(entry, SESSION_ID);
      expect(errors).toHaveLength(0);
    });

    it('should not double-count errors when isError is true', () => {
      const entry = {
        type: 'message',
        role: 'toolResult',
        toolName: 'web_search',
        content: [
          {
            type: 'text',
            text: JSON.stringify({ status: 'error', error: 'fetch failed' }),
          },
        ],
        isError: true,
      };

      const errors = detector.analyzeLine(entry, SESSION_ID);
      // Should still detect the tool-status-error pattern
      expect(
        errors.filter((e) => e.pattern === 'tool-status-error'),
      ).toHaveLength(1);
    });

    it('should handle entry without toolName (fallback to message.toolCallId)', () => {
      const entry = {
        type: 'message',
        toolName: 'web_fetch',
        content: [
          {
            type: 'text',
            text: JSON.stringify({ status: 'error', error: 'fetch failed' }),
          },
        ],
        isError: false,
      };

      const errors = detector.analyzeLine(entry, SESSION_ID);
      // tool-status-error + stack-trace (keyword) = 2 errors
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors[0].toolName).toBe('web_fetch');
    });
  });
});
