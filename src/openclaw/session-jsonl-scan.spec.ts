import { scanSessionJsonlLines } from './session-jsonl-scan';

/** 与 claw-family 真实 bailian 失败回合一致：content 为空数组 + 顶层 errorMessage */
const REALISTIC_ASSISTANT_CONNECTION_ERROR = {
  type: 'message',
  id: 'ec6d0adb',
  parentId: 'a714ce77',
  timestamp: 1774643626858,
  message: {
    role: 'assistant',
    content: [],
    api: 'openai-completions',
    provider: 'bailian',
    model: 'qwen3.5-plus',
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: 'error',
    timestamp: 1774643625526,
    errorMessage: 'Connection error.',
  },
};

function lines(...objects: unknown[]): string[] {
  return objects.map((o) => JSON.stringify(o));
}

describe('scanSessionJsonlLines', () => {
  it('maps bailian-style assistant failure (empty content + errorMessage) to [错误] text', () => {
    const scan = scanSessionJsonlLines(
      lines(
        {
          type: 'session',
          version: 3,
          id: '7c9dc1b3-8f21-46bb-864d-bc93a5d77b26',
          timestamp: 1774643625521,
        },
        {
          type: 'message',
          timestamp: 1774643625525,
          message: {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Read HEARTBEAT.md if it exists.',
              },
            ],
            timestamp: 1774643625525,
          },
        },
        REALISTIC_ASSISTANT_CONNECTION_ERROR,
      ),
    );

    const assistantMsgs = scan.messages.filter((m) => m.role === 'assistant');
    expect(assistantMsgs).toHaveLength(1);
    expect(assistantMsgs[0].content).toBe('[错误] Connection error.');
  });

  it('shows [错误] Request was aborted. for aborted stopReason + errorMessage', () => {
    const scan = scanSessionJsonlLines(
      lines({
        type: 'message',
        timestamp: 1,
        message: {
          role: 'assistant',
          content: [],
          stopReason: 'aborted',
          errorMessage: 'Request was aborted.',
        },
      }),
    );
    expect(scan.messages[0].content).toBe('[错误] Request was aborted.');
  });

  it('shows [已中止] when stopReason is aborted and no errorMessage', () => {
    const scan = scanSessionJsonlLines(
      lines({
        type: 'message',
        timestamp: 1,
        message: {
          role: 'assistant',
          content: [],
          stopReason: 'aborted',
        },
      }),
    );
    expect(scan.messages[0].content).toBe('[已中止]');
  });

  it('shows [错误]（无详情） when stopReason is error and no errorMessage', () => {
    const scan = scanSessionJsonlLines(
      lines({
        type: 'message',
        timestamp: 1,
        message: {
          role: 'assistant',
          content: [],
          stopReason: 'error',
        },
      }),
    );
    expect(scan.messages[0].content).toBe('[错误]（无详情）');
  });

  it('does not replace normal assistant text with error fallback', () => {
    const scan = scanSessionJsonlLines(
      lines({
        type: 'message',
        timestamp: 1,
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'HEARTBEAT_OK' }],
          stopReason: 'error',
          errorMessage: 'ignored when body present',
        },
      }),
    );
    expect(scan.messages[0].content).toBe('HEARTBEAT_OK');
  });

  it('extracts output_text blocks like OpenAI Responses', () => {
    const scan = scanSessionJsonlLines(
      lines({
        type: 'message',
        timestamp: 1,
        message: {
          role: 'assistant',
          content: [{ type: 'output_text', text: 'hello world' }],
          stopReason: 'stop',
        },
      }),
    );
    expect(scan.messages[0].content).toBe('hello world');
  });

  it('shows [工具调用：read] when only toolUse blocks exist (no text)', () => {
    const scan = scanSessionJsonlLines(
      lines({
        type: 'message',
        timestamp: 1,
        message: {
          role: 'assistant',
          content: [
            { type: 'toolUse', id: 'u1', name: 'read', input: { path: '/a' } },
          ],
          stopReason: 'toolUse',
        },
      }),
    );
    expect(scan.messages[0].content).toBe('[工具调用：read]');
    expect(scan.toolCalls.some((t) => t.name === 'read')).toBe(true);
  });

  it('shows [工具调用：exec] for functionCall blocks', () => {
    const scan = scanSessionJsonlLines(
      lines({
        type: 'message',
        timestamp: 1,
        message: {
          role: 'assistant',
          content: [
            { type: 'functionCall', id: 'fc1', name: 'exec', arguments: '{}' },
          ],
          stopReason: 'toolUse',
        },
      }),
    );
    expect(scan.messages[0].content).toBe('[工具调用：exec]');
  });

  it('merges text after toolCall line with tool placeholder when assistant had only tools', () => {
    const scan = scanSessionJsonlLines(
      lines({
        type: 'message',
        timestamp: 1,
        message: {
          role: 'assistant',
          content: [
            { type: 'toolCall', id: 'c1', name: 'read', arguments: {} },
            { type: 'text', text: 'Done.' },
          ],
          stopReason: 'stop',
        },
      }),
    );
    expect(scan.messages[0].content).toBe('Done.');
    expect(scan.toolCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('uses details as toolResult output when content array yields no text', () => {
    const scan = scanSessionJsonlLines(
      lines(
        {
          type: 'message',
          timestamp: 1,
          message: {
            role: 'assistant',
            content: [
              { type: 'toolCall', id: 'id1', name: 'exec', arguments: {} },
            ],
            stopReason: 'toolUse',
          },
        },
        {
          type: 'message',
          timestamp: 2,
          message: {
            role: 'toolResult',
            toolCallId: 'id1',
            toolName: 'exec',
            content: [],
            details: { durationMs: 3, status: 'timeout' },
          },
        },
      ),
    );
    const execCall = scan.toolCalls.find((t) => t.name === 'exec');
    expect(execCall?.output).toEqual({ durationMs: 3, status: 'timeout' });
  });

  it('links toolResult output to prior toolCall by toolCallId', () => {
    const scan = scanSessionJsonlLines(
      lines(
        {
          type: 'message',
          timestamp: 1,
          message: {
            role: 'assistant',
            content: [
              { type: 'toolCall', id: 'call_x', name: 'read', arguments: {} },
            ],
            stopReason: 'toolUse',
          },
        },
        {
          type: 'message',
          timestamp: 2,
          message: {
            role: 'toolResult',
            toolCallId: 'call_x',
            toolName: 'read',
            content: [{ type: 'output_text', text: 'file contents' }],
            details: { durationMs: 12, status: 'ok' },
          },
        },
      ),
    );
    const readCall = scan.toolCalls.find((t) => t.name === 'read');
    expect(readCall).toBeDefined();
    expect(readCall!.output).toBe('file contents');
    expect(readCall!.durationMs).toBe(12);
    expect(readCall!.success).toBe(true);
  });

  it('emits system meta for session / model_change / custom', () => {
    const scan = scanSessionJsonlLines(
      lines(
        { type: 'session', id: 's1', version: 3, timestamp: 1 },
        { type: 'model_change', provider: 'p', modelId: 'm', timestamp: 2 },
        {
          type: 'custom',
          customType: 'openclaw:prompt-error',
          id: 'x',
          timestamp: 3,
        },
      ),
    );
    expect(scan.messages.map((m) => m.content)).toEqual([
      '[Session] id=s1, version=3',
      '[Model] p/m',
      '[Custom] openclaw:prompt-error',
    ]);
    expect(scan.messages.every((m) => m.role === 'system')).toBe(true);
  });

  it('records events for type-only entries without message or toolUse', () => {
    const scan = scanSessionJsonlLines(
      lines({ type: 'heartbeat', tick: 1, timestamp: 99 }),
    );
    expect(scan.events).toHaveLength(1);
    expect(scan.events[0].type).toBe('heartbeat');
  });

  it('parses legacy top-level toolUse once per name', () => {
    const scan = scanSessionJsonlLines(
      lines(
        {
          type: 'tool_invocation',
          timestamp: 1,
          toolUse: {
            name: 'browser',
            input: { url: 'x' },
            output: { ok: true },
            durationMs: 5,
            success: true,
          },
        },
        {
          type: 'tool_invocation',
          timestamp: 2,
          toolUse: {
            name: 'browser',
            input: {},
            output: {},
            durationMs: 0,
            success: true,
          },
        },
      ),
    );
    expect(scan.toolCalls.filter((t) => t.name === 'browser')).toHaveLength(1);
  });

  it('aggregates token usage and cost across messages', () => {
    const scan = scanSessionJsonlLines(
      lines(
        {
          type: 'message',
          timestamp: 1,
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'a' }],
            usage: {
              input: 10,
              output: 20,
              totalTokens: 30,
              cost: {
                input: 0.1,
                output: 0.2,
                cacheRead: 0,
                cacheWrite: 0,
                total: 0.3,
              },
            },
          },
        },
        {
          type: 'message',
          timestamp: 2,
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'b' }],
            usage: {
              input: 5,
              output: 5,
              totalTokens: 40,
              cost: {
                input: 0.05,
                output: 0.05,
                cacheRead: 0,
                cacheWrite: 0,
                total: 0.1,
              },
            },
          },
        },
      ),
    );
    expect(scan.transcriptUsageObserved).toBe(true);
    expect(scan.sumInput).toBe(15);
    expect(scan.sumOutput).toBe(25);
    expect(scan.lastTotal).toBe(40);
    expect(scan.hasCostField).toBe(true);
    expect(scan.sumCostTotal).toBeCloseTo(0.4);
    expect((scan.tokenUsage as { total: number }).total).toBe(40);
  });

  it('skips malformed JSON lines without throwing', () => {
    const scan = scanSessionJsonlLines([
      '{"type":"message","timestamp":1,"message":{"role":"user","content":"ok"}}',
      '{not json',
      '{"type":"message","timestamp":2,"message":{"role":"assistant","content":[{"type":"text","text":"fine"}]}}',
    ]);
    expect(scan.messages.filter((m) => m.role === 'user')).toHaveLength(1);
    expect(scan.messages.filter((m) => m.role === 'assistant')).toHaveLength(1);
    expect(scan.messages.some((m) => m.content === 'fine')).toBe(true);
  });

  it('uses [无内容] for user message with empty content array', () => {
    const scan = scanSessionJsonlLines(
      lines({
        type: 'message',
        timestamp: 1,
        message: { role: 'user', content: [] },
      }),
    );
    expect(scan.messages[0].role).toBe('user');
    expect(scan.messages[0].content).toBe('[无内容]');
  });

  it('includes reasoning summary in assistant body when no text blocks', () => {
    const scan = scanSessionJsonlLines(
      lines({
        type: 'message',
        timestamp: 1,
        message: {
          role: 'assistant',
          content: [{ type: 'reasoning', summary: 'step 1' }],
          stopReason: 'stop',
        },
      }),
    );
    expect(scan.messages[0].content).toBe('step 1');
  });

  it('custom row without message appears as system line and as event (current behavior)', () => {
    const scan = scanSessionJsonlLines(
      lines({
        type: 'custom',
        customType: 'openclaw:prompt-error',
        data: { error: 'aborted' },
        timestamp: 5,
      }),
    );
    expect(
      scan.messages.some((m) => m.content.includes('openclaw:prompt-error')),
    ).toBe(true);
    expect(scan.events.some((e) => e.type === 'custom')).toBe(true);
  });
});
