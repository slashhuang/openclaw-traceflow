import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ErrorAlertService } from './error-alert.service';
import { ConfigService } from '../config/config.service';
import { ChannelManager } from './channel-manager';
import type { DetectedError } from './error-detector';

// ----------------------------------------------------------------
// Mocks
// ----------------------------------------------------------------

function makeError(overrides: Partial<DetectedError> = {}): DetectedError {
  return {
    sessionId: 'test-session-001',
    severity: 'critical',
    pattern: 'prompt-error',
    toolName: 'llm',
    errorMessage: 'LLM idle timeout',
    rawEntry: {},
    timestamp: Date.now(),
    ...overrides,
  };
}

const mockConfigService = {
  getConfig: jest.fn().mockReturnValue({
    im: {
      enabled: true,
      errorMonitor: {
        enabled: true,
        minSeverity: 'warning',
        aggregateWindowMs: 100, // Short window for fast tests
        patterns: {
          promptError: true,
          toolStatusError: true,
          nonZeroExit: true,
          stackTrace: true,
          consecutiveFailures: true,
        },
      },
    },
  }),
};

const mockChannelManager = {
  sendToChannel: jest.fn().mockResolvedValue({ message_id: 'om_alert_001' }),
};

describe('ErrorAlertService', () => {
  let service: ErrorAlertService;
  let eventEmitter: EventEmitter2;

  beforeEach(async () => {
    jest.useFakeTimers();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ErrorAlertService,
        { provide: EventEmitter2, useValue: new EventEmitter2() },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: ChannelManager, useValue: mockChannelManager },
      ],
    }).compile();

    service = module.get<ErrorAlertService>(ErrorAlertService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    service.onModuleDestroy();
  });

  // ----------------------------------------------------------------
  // Basic: event listener registration
  // ----------------------------------------------------------------

  describe('initialization', () => {
    it('should register audit.session.error listener when errorMonitor is enabled', () => {
      const listeners = eventEmitter.listeners('audit.session.error');
      expect(listeners.length).toBeGreaterThanOrEqual(1);
    });

    it('should NOT register listener when errorMonitor is disabled', async () => {
      mockConfigService.getConfig.mockReturnValue({
        im: { enabled: true, errorMonitor: { enabled: false } },
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ErrorAlertService,
          { provide: EventEmitter2, useValue: new EventEmitter2() },
          { provide: ConfigService, useValue: mockConfigService },
          { provide: ChannelManager, useValue: mockChannelManager },
        ],
      }).compile();

      const disabledService = module.get<ErrorAlertService>(ErrorAlertService);
      const ee = module.get<EventEmitter2>(EventEmitter2);

      const listeners = ee.listeners('audit.session.error');
      expect(listeners.length).toBe(0);

      disabledService.onModuleDestroy();
    });

    it('should NOT register listener when IM is disabled', async () => {
      mockConfigService.getConfig.mockReturnValue({
        im: { enabled: false },
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ErrorAlertService,
          { provide: EventEmitter2, useValue: new EventEmitter2() },
          { provide: ConfigService, useValue: mockConfigService },
          { provide: ChannelManager, useValue: mockChannelManager },
        ],
      }).compile();

      const disabledService = module.get<ErrorAlertService>(ErrorAlertService);
      const ee = module.get<EventEmitter2>(EventEmitter2);

      const listeners = ee.listeners('audit.session.error');
      expect(listeners.length).toBe(0);

      disabledService.onModuleDestroy();
    });
  });

  // ----------------------------------------------------------------
  // Aggregation: multiple errors in window merge into one alert
  // ----------------------------------------------------------------

  describe('aggregation window', () => {
    it('should send one alert for multiple errors in same session within window', () => {
      // Emit 3 errors for same session
      eventEmitter.emit('audit.session.error', {
        sessionId: 'sess-1',
        errors: [makeError({ pattern: 'prompt-error' })],
        timestamp: Date.now(),
      });
      eventEmitter.emit('audit.session.error', {
        sessionId: 'sess-1',
        errors: [
          makeError({ pattern: 'tool-status-error', severity: 'warning' }),
        ],
        timestamp: Date.now(),
      });
      eventEmitter.emit('audit.session.error', {
        sessionId: 'sess-1',
        errors: [makeError({ pattern: 'non-zero-exit' })],
        timestamp: Date.now(),
      });

      // No alert sent yet (within window)
      expect(mockChannelManager.sendToChannel).not.toHaveBeenCalled();

      // Advance past aggregation window
      jest.advanceTimersByTime(200);

      // Single alert with all 3 errors
      expect(mockChannelManager.sendToChannel).toHaveBeenCalledTimes(1);
      expect(mockChannelManager.sendToChannel).toHaveBeenCalledWith(
        'feishu',
        expect.objectContaining({
          msg_type: 'text',
          content: expect.objectContaining({
            text: expect.stringContaining('错误数量: 3'),
          }),
        }),
        expect.any(Object),
      );
    });

    it('should send separate alerts for different sessions', () => {
      eventEmitter.emit('audit.session.error', {
        sessionId: 'sess-A',
        errors: [makeError({ sessionId: 'sess-A' })],
        timestamp: Date.now(),
      });
      eventEmitter.emit('audit.session.error', {
        sessionId: 'sess-B',
        errors: [
          makeError({ sessionId: 'sess-B', pattern: 'tool-status-error' }),
        ],
        timestamp: Date.now(),
      });

      jest.advanceTimersByTime(200);

      expect(mockChannelManager.sendToChannel).toHaveBeenCalledTimes(2);
    });

    it('should clear aggregation after flush', () => {
      // First batch
      eventEmitter.emit('audit.session.error', {
        sessionId: 'sess-1',
        errors: [makeError()],
        timestamp: Date.now(),
      });
      jest.advanceTimersByTime(200);
      expect(mockChannelManager.sendToChannel).toHaveBeenCalledTimes(1);

      mockChannelManager.sendToChannel.mockClear();

      // Second batch (after first flushed)
      eventEmitter.emit('audit.session.error', {
        sessionId: 'sess-1',
        errors: [makeError({ pattern: 'stack-trace' })],
        timestamp: Date.now(),
      });
      jest.advanceTimersByTime(200);

      expect(mockChannelManager.sendToChannel).toHaveBeenCalledTimes(1);
    });
  });

  // ----------------------------------------------------------------
  // Severity filtering
  // ----------------------------------------------------------------

  describe('severity filtering', () => {
    it('should filter out errors below minSeverity (warning)', () => {
      eventEmitter.emit('audit.session.error', {
        sessionId: 'sess-1',
        errors: [makeError({ severity: 'info', pattern: 'tool-status-error' })],
        timestamp: Date.now(),
      });

      jest.advanceTimersByTime(200);

      // Info-level error should be filtered out
      expect(mockChannelManager.sendToChannel).not.toHaveBeenCalled();
    });

    it('should pass critical errors when minSeverity is warning', () => {
      eventEmitter.emit('audit.session.error', {
        sessionId: 'sess-1',
        errors: [makeError({ severity: 'critical' })],
        timestamp: Date.now(),
      });

      jest.advanceTimersByTime(200);

      expect(mockChannelManager.sendToChannel).toHaveBeenCalledTimes(1);
    });

    it('should pass warning errors when minSeverity is warning', () => {
      eventEmitter.emit('audit.session.error', {
        sessionId: 'sess-1',
        errors: [
          makeError({ severity: 'warning', pattern: 'tool-status-error' }),
        ],
        timestamp: Date.now(),
      });

      jest.advanceTimersByTime(200);

      expect(mockChannelManager.sendToChannel).toHaveBeenCalledTimes(1);
    });

    it('should filter mixed severity, only passing those >= minSeverity', () => {
      eventEmitter.emit('audit.session.error', {
        sessionId: 'sess-1',
        errors: [
          makeError({ severity: 'critical' }),
          makeError({ severity: 'info', pattern: 'tool-status-error' }),
          makeError({ severity: 'warning', pattern: 'non-zero-exit' }),
        ],
        timestamp: Date.now(),
      });

      jest.advanceTimersByTime(200);

      expect(mockChannelManager.sendToChannel).toHaveBeenCalledTimes(1);
      const call = mockChannelManager.sendToChannel.mock.calls[0];
      const message = call[1];
      // Should contain 2 errors (critical + warning), not info
      expect(message.content.text).toContain('错误数量: 2');
    });
  });

  // ----------------------------------------------------------------
  // Pattern filtering
  // ----------------------------------------------------------------

  describe('pattern filtering', () => {
    it('should filter disabled patterns', () => {
      mockConfigService.getConfig.mockReturnValue({
        im: {
          enabled: true,
          errorMonitor: {
            enabled: true,
            minSeverity: 'info',
            aggregateWindowMs: 100,
            patterns: {
              promptError: false, // disabled
              toolStatusError: true,
              nonZeroExit: true,
              stackTrace: true,
              consecutiveFailures: true,
            },
          },
        },
      });

      eventEmitter.emit('audit.session.error', {
        sessionId: 'sess-1',
        errors: [makeError({ pattern: 'prompt-error', severity: 'info' })],
        timestamp: Date.now(),
      });

      jest.advanceTimersByTime(200);

      // prompt-error is disabled, should be filtered
      expect(mockChannelManager.sendToChannel).not.toHaveBeenCalled();
    });

    it('should allow all patterns by default', () => {
      const patterns = [
        'prompt-error',
        'tool-status-error',
        'non-zero-exit',
        'stack-trace',
        'consecutive-failures',
      ];

      for (const pattern of patterns) {
        mockChannelManager.sendToChannel.mockClear();

        eventEmitter.emit('audit.session.error', {
          sessionId: `sess-${pattern}`,
          errors: [makeError({ pattern: pattern as any, severity: 'warning' })],
          timestamp: Date.now(),
        });

        jest.advanceTimersByTime(200);

        expect(mockChannelManager.sendToChannel).toHaveBeenCalledTimes(1);
      }
    });
  });

  // ----------------------------------------------------------------
  // Alert message formatting
  // ----------------------------------------------------------------

  describe('alert message formatting', () => {
    it('should format alert with severity icon, error list, and TraceFlow URL', () => {
      eventEmitter.emit('audit.session.error', {
        sessionId: 'sess-1',
        errors: [
          makeError({
            severity: 'critical',
            toolName: 'llm',
            errorMessage: 'timeout',
          }),
          makeError({
            severity: 'warning',
            pattern: 'tool-status-error',
            toolName: 'web_search',
            errorMessage: 'fetch failed',
          }),
        ],
        timestamp: Date.now(),
      });

      jest.advanceTimersByTime(200);

      const call = mockChannelManager.sendToChannel.mock.calls[0];
      const message = call[1];
      const text = message.content.text;

      expect(text).toContain('错误监控告警');
      expect(text).toContain('sess-1');
      expect(text).toContain('严重级别: critical');
      expect(text).toContain('错误数量: 2');
      expect(text).toContain('[prompt-error] llm: timeout');
      expect(text).toContain('[tool-status-error] web_search: fetch failed');
      expect(text).toContain('http://localhost:3001/sessions/');
    });

    it('should sort errors by severity (critical first)', () => {
      eventEmitter.emit('audit.session.error', {
        sessionId: 'sess-1',
        errors: [
          makeError({ severity: 'info', pattern: 'tool-status-error' }),
          makeError({ severity: 'critical', pattern: 'prompt-error' }),
          makeError({ severity: 'warning', pattern: 'stack-trace' }),
        ],
        timestamp: Date.now(),
      });

      jest.advanceTimersByTime(200);

      const call = mockChannelManager.sendToChannel.mock.calls[0];
      const message = call[1];
      const text = message.content.text;

      // critical should appear before warning and info
      const criticalIdx = text.indexOf('prompt-error');
      const warningIdx = text.indexOf('stack-trace');
      expect(criticalIdx).toBeLessThan(warningIdx);
    });

    it('should use warning icon for warning-level highest severity', () => {
      eventEmitter.emit('audit.session.error', {
        sessionId: 'sess-1',
        errors: [makeError({ severity: 'warning' })],
        timestamp: Date.now(),
      });

      jest.advanceTimersByTime(200);

      const call = mockChannelManager.sendToChannel.mock.calls[0];
      const message = call[1];
      expect(message.content.text).toContain('严重级别: warning');
    });
  });

  // ----------------------------------------------------------------
  // Target chat ID (group chat)
  // ----------------------------------------------------------------

  describe('targetChatId', () => {
    it('should send to group chat when targetChatId is configured', () => {
      mockConfigService.getConfig.mockReturnValue({
        im: {
          enabled: true,
          errorMonitor: {
            enabled: true,
            minSeverity: 'warning',
            aggregateWindowMs: 100,
            targetChatId: 'oc_test_group_chat_id',
            patterns: {
              promptError: true,
              toolStatusError: true,
              nonZeroExit: true,
              stackTrace: true,
              consecutiveFailures: true,
            },
          },
        },
      });

      eventEmitter.emit('audit.session.error', {
        sessionId: 'sess-1',
        errors: [makeError()],
        timestamp: Date.now(),
      });

      jest.advanceTimersByTime(200);

      expect(mockChannelManager.sendToChannel).toHaveBeenCalledWith(
        'feishu',
        expect.any(Object),
        {
          receive_id: 'oc_test_group_chat_id',
          receive_id_type: 'chat_id',
        },
      );
    });

    it('should send to DM when targetChatId is not configured', () => {
      eventEmitter.emit('audit.session.error', {
        sessionId: 'sess-1',
        errors: [makeError()],
        timestamp: Date.now(),
      });

      jest.advanceTimersByTime(200);

      const call = mockChannelManager.sendToChannel.mock.calls[0];
      const options = call[2];
      // No receive_id means DM (default channel behavior)
      expect(options.receive_id).toBeUndefined();
    });
  });

  // ----------------------------------------------------------------
  // Error sending failure
  // ----------------------------------------------------------------

  describe('sending failure', () => {
    it('should not crash when ChannelManager throws', () => {
      mockChannelManager.sendToChannel.mockRejectedValue(
        new Error('Network error'),
      );

      eventEmitter.emit('audit.session.error', {
        sessionId: 'sess-1',
        errors: [makeError()],
        timestamp: Date.now(),
      });

      jest.advanceTimersByTime(200);

      // Should not throw
      expect(mockChannelManager.sendToChannel).toHaveBeenCalledTimes(1);
    });
  });

  // ----------------------------------------------------------------
  // Reload / cleanup
  // ----------------------------------------------------------------

  describe('reload and cleanup', () => {
    it('should reload event listeners from config', () => {
      const initialListeners = eventEmitter.listeners(
        'audit.session.error',
      ).length;
      service.reloadFromConfig();
      const afterListeners = eventEmitter.listeners(
        'audit.session.error',
      ).length;
      expect(afterListeners).toBe(initialListeners);
    });

    it('should clear all aggregation timers on module destroy', () => {
      // Start an aggregation
      eventEmitter.emit('audit.session.error', {
        sessionId: 'sess-1',
        errors: [makeError()],
        timestamp: Date.now(),
      });

      // Destroy module before timer fires
      service.onModuleDestroy();

      // Advance timer — should not fire because it was cleared
      jest.advanceTimersByTime(200);

      // No alert should have been sent
      expect(mockChannelManager.sendToChannel).not.toHaveBeenCalled();
    });
  });

  // ----------------------------------------------------------------
  // Edge cases
  // ----------------------------------------------------------------

  describe('edge cases', () => {
    it('should handle empty errors array', () => {
      eventEmitter.emit('audit.session.error', {
        sessionId: 'sess-1',
        errors: [],
        timestamp: Date.now(),
      });

      jest.advanceTimersByTime(200);

      expect(mockChannelManager.sendToChannel).not.toHaveBeenCalled();
    });

    it('should handle missing errorMonitor config gracefully', () => {
      mockConfigService.getConfig.mockReturnValue({
        im: { enabled: true },
        // no errorMonitor
      });

      eventEmitter.emit('audit.session.error', {
        sessionId: 'sess-1',
        errors: [makeError()],
        timestamp: Date.now(),
      });

      jest.advanceTimersByTime(200);

      // No errorMonitor config = no handling
      expect(mockChannelManager.sendToChannel).not.toHaveBeenCalled();
    });

    it('should handle error with unknown pattern (not filtered)', () => {
      eventEmitter.emit('audit.session.error', {
        sessionId: 'sess-1',
        errors: [
          makeError({
            pattern: 'unknown-pattern' as any,
            severity: 'critical',
          }),
        ],
        timestamp: Date.now(),
      });

      jest.advanceTimersByTime(200);

      // Unknown pattern is not in config, so it passes through
      expect(mockChannelManager.sendToChannel).toHaveBeenCalledTimes(1);
    });

    it('should use TRACEFLOW_WEB_URL env var when set', () => {
      const originalUrl = process.env.TRACEFLOW_WEB_URL;
      process.env.TRACEFLOW_WEB_URL = 'https://traceflow.example.com';

      eventEmitter.emit('audit.session.error', {
        sessionId: 'sess-1',
        errors: [makeError()],
        timestamp: Date.now(),
      });

      jest.advanceTimersByTime(200);

      const call = mockChannelManager.sendToChannel.mock.calls[0];
      const message = call[1];
      expect(message.content.text).toContain(
        'https://traceflow.example.com/sessions/',
      );

      process.env.TRACEFLOW_WEB_URL = originalUrl;
    });
  });
});
