import {
  appendTranscriptTextFromContentBlock,
  collectTranscriptTextParts,
  extractTranscriptToolBlockMeta,
  isTranscriptToolCallBlock,
  resolveAssistantTranscriptDisplayText,
} from './transcript-message-content';

describe('transcript-message-content', () => {
  it('isTranscriptToolCallBlock recognizes Pi / Anthropic / OpenAI / Ollama aliases', () => {
    expect(isTranscriptToolCallBlock({ type: 'toolCall' })).toBe(true);
    expect(isTranscriptToolCallBlock({ type: 'toolUse' })).toBe(true);
    expect(isTranscriptToolCallBlock({ type: 'functionCall' })).toBe(true);
    expect(isTranscriptToolCallBlock({ type: 'function_call' })).toBe(true);
    expect(isTranscriptToolCallBlock({ type: 'tool_use' })).toBe(true);
    expect(isTranscriptToolCallBlock({ type: 'text' })).toBe(false);
  });

  it('extractTranscriptToolBlockMeta parses id/name and JSON string arguments', () => {
    expect(
      extractTranscriptToolBlockMeta({
        type: 'functionCall',
        id: 'fc1',
        name: 'exec',
        arguments: '{"x":1}',
      }),
    ).toEqual({ id: 'fc1', name: 'exec', input: { x: 1 } });
    expect(
      extractTranscriptToolBlockMeta({
        type: 'tool_use',
        id: 'tu1',
        name: 'read',
        input: { path: '/a' },
      }),
    ).toEqual({ id: 'tu1', name: 'read', input: { path: '/a' } });
  });

  it('appendTranscriptTextFromContentBlock handles output_text and reasoning', () => {
    let s = '';
    s = appendTranscriptTextFromContentBlock({ type: 'output_text', text: 'hi' }, s);
    expect(s).toBe('hi');
    s = appendTranscriptTextFromContentBlock({ type: 'reasoning', summary: 'plan' }, s);
    expect(s).toBe('hiplan');
  });

  it('collectTranscriptTextParts treats output_text like text', () => {
    expect(
      collectTranscriptTextParts([
        { type: 'output_text', text: 'a' },
        { type: 'text', text: 'b' },
      ]),
    ).toEqual(['a', 'b']);
  });

  it('resolveAssistantTranscriptDisplayText uses errorMessage when content empty', () => {
    expect(
      resolveAssistantTranscriptDisplayText(
        { errorMessage: 'Connection error.', stopReason: 'error' },
        '[无内容]',
      ),
    ).toBe('[错误] Connection error.');
    expect(resolveAssistantTranscriptDisplayText({ stopReason: 'aborted' }, '')).toBe('[已中止]');
    expect(resolveAssistantTranscriptDisplayText({ stopReason: 'error' }, '[无内容]')).toBe('[错误]（无详情）');
    expect(resolveAssistantTranscriptDisplayText({}, 'hello')).toBe('hello');
  });
});
