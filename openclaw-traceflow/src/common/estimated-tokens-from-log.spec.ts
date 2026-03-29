import {
  DEFAULT_TOKEN_BYTES_DIVISOR,
  estimateTokensFromTranscriptBytes,
  shouldOfferLogSizeTokenEstimate,
} from './estimated-tokens-from-log';

describe('estimateTokensFromTranscriptBytes', () => {
  it('ceil(bytes / divisor)', () => {
    expect(estimateTokensFromTranscriptBytes(100, 4)).toBe(25);
    expect(estimateTokensFromTranscriptBytes(101, 4)).toBe(26);
  });

  it('uses default divisor', () => {
    expect(estimateTokensFromTranscriptBytes(8)).toBe(
      Math.ceil(8 / DEFAULT_TOKEN_BYTES_DIVISOR),
    );
  });

  it('returns undefined for invalid bytes', () => {
    expect(estimateTokensFromTranscriptBytes(undefined)).toBeUndefined();
    expect(estimateTokensFromTranscriptBytes(-1)).toBeUndefined();
    expect(estimateTokensFromTranscriptBytes(100, 0)).toBeUndefined();
  });
});

describe('shouldOfferLogSizeTokenEstimate', () => {
  it('true when stale index, bytes>0, zero usage', () => {
    expect(
      shouldOfferLogSizeTokenEstimate({
        transcriptFileSizeBytes: 400,
        tokenUsageMeta: { totalTokensFresh: false },
        tokenUsage: {
          input: 0,
          output: 0,
          total: 0,
          contextUtilizationReliable: false,
        },
      }),
    ).toBe(true);
  });

  it('false when non-zero usage', () => {
    expect(
      shouldOfferLogSizeTokenEstimate({
        transcriptFileSizeBytes: 400,
        tokenUsageMeta: { totalTokensFresh: false },
        tokenUsage: {
          input: 1,
          output: 0,
          total: 1,
          contextUtilizationReliable: false,
        },
      }),
    ).toBe(false);
  });

  it('false when neither stale nor unreliable', () => {
    expect(
      shouldOfferLogSizeTokenEstimate({
        transcriptFileSizeBytes: 400,
        tokenUsage: {
          input: 0,
          output: 0,
          total: 0,
          contextUtilizationReliable: true,
        },
      }),
    ).toBe(false);
  });
});
