import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ImPushService } from './im-push.service';
import { ConfigService } from '../config/config.service';
import { MessageQueueService } from './message-queue.service';
import { ChannelManager } from './channel-manager';
import { CircuitBreakerOpenError } from './circuit-breaker.service';

// Mock dependencies
const mockConfigService = {
  getConfig: jest.fn().mockReturnValue({
    im: {
      enabled: true,
      channels: {
        feishu: {
          enabled: true,
        },
      },
    },
  }),
};

const mockMessageQueueService = {
  enqueueMessage: jest.fn(),
  getQueue: jest.fn(),
  setProcessing: jest.fn(),
  markMessageSent: jest.fn(),
  removeMessage: jest.fn(),
  cleanupSession: jest.fn(),
  markDone: jest.fn(),
};

const mockChannelManager = {
  sendToChannel: jest.fn(),
};

const mockFormatter = {
  formatUserMessage: jest.fn(),
  formatAssistantMessage: jest.fn(),
  formatSkillStart: jest.fn(),
  formatSkillEnd: jest.fn(),
};

describe('ImPushService', () => {
  let service: ImPushService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImPushService,
        { provide: EventEmitter2, useValue: new EventEmitter2() },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: MessageQueueService, useValue: mockMessageQueueService },
        { provide: ChannelManager, useValue: mockChannelManager },
      ],
    }).compile();

    service = module.get<ImPushService>(ImPushService);

    // Replace formatter with mock
    (service as any).formatter = mockFormatter;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('sessionLatestUserMessage', () => {
    it('should update latest user message on each user message', async () => {
      const sessionId = 'test-session-1';

      // Mock user message 1
      mockMessageQueueService.getQueue.mockReturnValue({
        isProcessing: () => false,
        dequeue: () => null,
      });

      // Direct user message 1
      mockFormatter.formatUserMessage.mockReturnValue({
        msg_type: 'text',
        content: { text: 'Hello 1' },
      });
      mockChannelManager.sendToChannel.mockResolvedValue({
        message_id: 'msg_001',
      });

      await (service as any).sendMessage(sessionId, {
        id: 'q1',
        message: { type: 'user', data: {} },
      });

      // Verify first user message is stored
      const latestMsg1 = (service as any).sessionLatestUserMessage.get(
        sessionId,
      );
      expect(latestMsg1?.message_id).toBe('msg_001');

      // Mock user message 2
      mockChannelManager.sendToChannel.mockResolvedValue({
        message_id: 'msg_002',
      });

      await (service as any).sendMessage(sessionId, {
        id: 'q2',
        message: { type: 'user', data: {} },
      });

      // Verify latest user message is updated (overwritten)
      const latestMsg2 = (service as any).sessionLatestUserMessage.get(
        sessionId,
      );
      expect(latestMsg2?.message_id).toBe('msg_002');
    });

    it('should reply assistant message to latest user message', async () => {
      const sessionId = 'test-session-2';

      // First send a user message
      (service as any).sessionLatestUserMessage.set(sessionId, {
        message_id: 'msg_user_123',
      });

      // Mock assistant message
      mockFormatter.formatAssistantMessage.mockReturnValue({
        msg_type: 'text',
        content: { text: 'AI response' },
      });
      mockChannelManager.sendToChannel.mockResolvedValue({
        message_id: 'msg_ai_456',
      });
      mockMessageQueueService.getQueue.mockReturnValue({
        isProcessing: () => false,
        getOldestMessage: () => ({
          id: 'q1',
          message: { type: 'assistant', data: {} },
        }),
      });

      await (service as any).sendMessage(sessionId, {
        id: 'q1',
        message: { type: 'assistant', data: {} },
      });

      // Verify assistant message was sent with reply_id
      expect(mockChannelManager.sendToChannel).toHaveBeenCalledWith(
        'feishu',
        expect.any(Object),
        { reply_id: 'msg_user_123' },
      );
    });

    it('should skip assistant message if no user message exists', async () => {
      const sessionId = 'test-session-3';

      mockFormatter.formatAssistantMessage.mockReturnValue({
        msg_type: 'text',
        content: { text: 'AI response' },
      });
      mockMessageQueueService.getQueue.mockReturnValue({
        isProcessing: () => false,
        getOldestMessage: () => ({
          id: 'q1',
          message: { type: 'assistant', data: {} },
        }),
      });

      await (service as any).sendMessage(sessionId, {
        id: 'q1',
        message: { type: 'assistant', data: {} },
      });

      // Verify message was skipped
      expect(mockChannelManager.sendToChannel).not.toHaveBeenCalled();
      expect(mockMessageQueueService.removeMessage).toHaveBeenCalledWith(
        sessionId,
        'q1',
      );
    });
  });

  describe('serial sending lock', () => {
    it('should wait for previous message to complete before sending next', async () => {
      const sessionId = 'test-session-4';
      let resolveFirstMessage: () => void;
      let firstMessageSent = false;

      // Mock queue with multiple messages
      const messages = [
        { id: 'q1', message: { type: 'user', data: {} } },
        { id: 'q2', message: { type: 'assistant', data: {} } },
      ];
      let messageIndex = 0;

      mockMessageQueueService.getQueue.mockReturnValue({
        isProcessing: () => false,
        dequeue: () => {
          if (messageIndex < messages.length) {
            return messages[messageIndex++];
          }
          return null;
        },
      });

      mockFormatter.formatUserMessage.mockReturnValue({
        msg_type: 'text',
        content: { text: 'Hello' },
      });
      mockFormatter.formatAssistantMessage.mockReturnValue({
        msg_type: 'text',
        content: { text: 'Response' },
      });

      // First message takes time
      mockChannelManager.sendToChannel.mockImplementation(async () => {
        if (!firstMessageSent) {
          await new Promise<void>((resolve) => {
            resolveFirstMessage = resolve;
          });
          firstMessageSent = true;
        }
        return { message_id: `msg_${Date.now()}` };
      });

      // Start processing queue
      const processPromise = (service as any).processQueue(sessionId);

      // Wait a bit to ensure first message started
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify first message is in progress
      const lock = (service as any).sessionSendingLock.get(sessionId);
      expect(lock).toBeDefined();

      // Resolve first message
      resolveFirstMessage!();

      // Wait for completion
      await processPromise;

      // Verify both messages were sent
      expect(mockChannelManager.sendToChannel).toHaveBeenCalledTimes(2);
    });
  });

  describe('handleSessionStart', () => {
    it('should clear session state on session start', () => {
      const sessionId = 'test-session-5';

      // Set some state
      (service as any).sessionLatestUserMessage.set(sessionId, {
        message_id: 'old_msg',
      });
      (service as any).sessionSendingLock.set(sessionId, Promise.resolve());

      // Trigger session start
      (service as any).handleSessionStart({
        sessionId,
        sessionKey: 'agent:main:main',
        user: { id: 'ou_xxx', name: 'Test User' },
        account: 'feishu',
      });

      // Verify state is cleared
      expect((service as any).sessionLatestUserMessage.has(sessionId)).toBe(
        false,
      );
      expect((service as any).sessionSendingLock.has(sessionId)).toBe(false);
    });
  });

  describe('handleSessionEnd', () => {
    it('should clean up all session state on session end', () => {
      const sessionId = 'test-session-6';

      // Set some state
      (service as any).sessionLatestUserMessage.set(sessionId, {
        message_id: 'msg_xxx',
      });
      (service as any).sessionSendingLock.set(sessionId, Promise.resolve());

      // Trigger session end
      (service as any).handleSessionEnd({ sessionId });

      // Verify state is cleared
      expect((service as any).sessionLatestUserMessage.has(sessionId)).toBe(
        false,
      );
      expect((service as any).sessionSendingLock.has(sessionId)).toBe(false);
      expect(mockMessageQueueService.cleanupSession).toHaveBeenCalledWith(
        sessionId,
      );
    });
  });

  describe('__pending__ placeholder (bug fix: compaction / debounce race)', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should set __pending__ immediately when user message is enqueued', async () => {
      const sessionId = 'test-pending-1';

      mockMessageQueueService.enqueueMessage.mockReturnValue({
        id: 'q1',
        message: { type: 'user', data: { text: 'hello' } },
      });
      mockMessageQueueService.getQueue.mockReturnValue({
        isProcessing: () => false,
        getOldestMessage: () => null,
      });

      await (service as any).handleSessionMessage({
        sessionId,
        message: { type: 'user', data: { text: 'hello' } },
        session: {},
      });

      // __pending__ should be set immediately, not after send
      const entry = (service as any).sessionLatestUserMessage.get(sessionId);
      expect(entry).toBeDefined();
      expect(entry.message_id).toBe('__pending__');
    });

    it('should skip assistant message while user message is still __pending__', async () => {
      const sessionId = 'test-pending-2';

      // Set __pending__ (simulating user message enqueued but not yet sent)
      (service as any).sessionLatestUserMessage.set(sessionId, {
        message_id: '__pending__',
      });

      mockFormatter.formatAssistantMessage.mockReturnValue({
        msg_type: 'text',
        content: { text: 'AI response' },
      });
      mockMessageQueueService.getQueue.mockReturnValue({
        isProcessing: () => false,
        getOldestMessage: () => ({
          id: 'q1',
          message: { type: 'assistant', data: {} },
        }),
      });

      await (service as any).sendMessage(sessionId, {
        id: 'q1',
        message: { type: 'assistant', data: {} },
      });

      // Assistant should be skipped (user still pending)
      expect(mockChannelManager.sendToChannel).not.toHaveBeenCalled();
      expect(mockMessageQueueService.removeMessage).toHaveBeenCalledWith(
        sessionId,
        'q1',
      );
    });

    it('should replace __pending__ with real message_id after user send succeeds', async () => {
      const sessionId = 'test-pending-3';

      // Pre-set __pending__
      (service as any).sessionLatestUserMessage.set(sessionId, {
        message_id: '__pending__',
      });

      mockFormatter.formatUserMessage.mockReturnValue({
        msg_type: 'text',
        content: { text: 'Hello' },
      });
      mockChannelManager.sendToChannel.mockResolvedValue({
        message_id: 'om_real_123',
      });
      mockMessageQueueService.getQueue.mockReturnValue({
        isProcessing: () => false,
        getOldestMessage: () => ({
          id: 'q1',
          message: { type: 'user', data: {} },
        }),
      });

      await (service as any).sendMessage(sessionId, {
        id: 'q1',
        message: { type: 'user', data: {} },
      });

      // __pending__ replaced with real message_id
      const entry = (service as any).sessionLatestUserMessage.get(sessionId);
      expect(entry.message_id).toBe('om_real_123');
    });

    it('should clear placeholder when user send fails (no message_id)', async () => {
      const sessionId = 'test-pending-4';

      (service as any).sessionLatestUserMessage.set(sessionId, {
        message_id: '__pending__',
      });

      mockFormatter.formatUserMessage.mockReturnValue({
        msg_type: 'text',
        content: { text: 'Hello' },
      });
      // Feishu returns response but without message_id
      mockChannelManager.sendToChannel.mockResolvedValue({
        code: 99999,
        msg: 'error',
      });
      mockMessageQueueService.getQueue.mockReturnValue({
        isProcessing: () => false,
        getOldestMessage: () => ({
          id: 'q1',
          message: { type: 'user', data: {} },
        }),
      });

      await (service as any).sendMessage(sessionId, {
        id: 'q1',
        message: { type: 'user', data: {} },
      });

      // Placeholder cleared on failure
      expect((service as any).sessionLatestUserMessage.has(sessionId)).toBe(
        false,
      );
      expect(mockMessageQueueService.removeMessage).toHaveBeenCalledWith(
        sessionId,
        'q1',
      );
    });

    it('should clear placeholder when user send throws exception', async () => {
      const sessionId = 'test-pending-5';

      (service as any).sessionLatestUserMessage.set(sessionId, {
        message_id: '__pending__',
      });

      mockFormatter.formatUserMessage.mockReturnValue({
        msg_type: 'text',
        content: { text: 'Hello' },
      });
      mockChannelManager.sendToChannel.mockRejectedValue(
        new Error('Network error'),
      );
      mockMessageQueueService.getQueue.mockReturnValue({
        isProcessing: () => false,
        getOldestMessage: () => ({
          id: 'q1',
          message: { type: 'user', data: {} },
        }),
      });

      await (service as any).sendMessage(sessionId, {
        id: 'q1',
        message: { type: 'user', data: {} },
      });

      // Placeholder cleared on exception
      expect((service as any).sessionLatestUserMessage.has(sessionId)).toBe(
        false,
      );
    });

    it('should allow assistant to be sent with correct reply_id after user confirmed', async () => {
      const sessionId = 'test-pending-6';

      // Step 1: User message succeeds → placeholder replaced with real ID
      (service as any).sessionLatestUserMessage.set(sessionId, {
        message_id: 'om_confirmed_789',
      });

      // Step 2: Assistant message should now be sent with reply_id
      mockFormatter.formatAssistantMessage.mockReturnValue({
        msg_type: 'text',
        content: { text: 'AI reply' },
      });
      mockChannelManager.sendToChannel.mockResolvedValue({
        message_id: 'om_ai_001',
      });
      mockMessageQueueService.getQueue.mockReturnValue({
        isProcessing: () => false,
        getOldestMessage: () => ({
          id: 'q2',
          message: { type: 'assistant', data: {} },
        }),
      });

      await (service as any).sendMessage(sessionId, {
        id: 'q2',
        message: { type: 'assistant', data: {} },
      });

      expect(mockChannelManager.sendToChannel).toHaveBeenCalledWith(
        'feishu',
        expect.any(Object),
        { reply_id: 'om_confirmed_789' },
      );
    });

    it('full flow: user queued → debounce expires → user sent → assistant sent with correct reply_id', async () => {
      const sessionId = 'test-pending-full';

      // Simulate: user message enqueued, __pending__ set
      (service as any).sessionLatestUserMessage.set(sessionId, {
        message_id: '__pending__',
      });

      // Queue returns user message first, then assistant
      let dequeueCall = 0;
      mockMessageQueueService.getQueue.mockReturnValue({
        isProcessing: () => false,
        dequeue: () => {
          dequeueCall++;
          if (dequeueCall === 1) {
            return {
              id: 'q-user',
              message: { type: 'user', data: { text: 'hello' } },
            };
          }
          if (dequeueCall === 2) {
            return {
              id: 'q-assistant',
              message: { type: 'assistant', data: { text: 'world' } },
            };
          }
          return null;
        },
        size: () => 0,
      });

      mockFormatter.formatUserMessage.mockReturnValue({
        msg_type: 'text',
        content: { text: 'hello' },
      });
      mockFormatter.formatAssistantMessage.mockReturnValue({
        msg_type: 'text',
        content: { text: 'world' },
      });
      mockChannelManager.sendToChannel
        .mockResolvedValueOnce({ message_id: 'om_user_abc' })
        .mockResolvedValueOnce({ message_id: 'om_assistant_xyz' });

      // Process queue directly (bypass debounce)
      await (service as any).processQueue(sessionId);

      // After user message sent, __pending__ replaced with real ID
      expect(
        (service as any).sessionLatestUserMessage.get(sessionId).message_id,
      ).toBe('om_user_abc');

      // Both messages sent
      expect(mockChannelManager.sendToChannel).toHaveBeenCalledTimes(2);
      // Assistant was sent with correct reply_id = the user message's real ID
      expect(mockChannelManager.sendToChannel).toHaveBeenNthCalledWith(
        2,
        'feishu',
        expect.any(Object),
        { reply_id: 'om_user_abc' },
      );
    });
  });

  describe('debounce', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should debounce rapid messages and only process once after window expires', async () => {
      const sessionId = 'test-debounce-1';

      mockMessageQueueService.getQueue.mockReturnValue({
        isProcessing: () => false,
        dequeue: () => null,
        size: () => 5,
      });

      // Emit 5 rapid messages
      for (let i = 0; i < 5; i++) {
        await (service as any).handleSessionMessage({
          sessionId,
          message: { type: 'user', data: { text: `msg ${i}` } },
          session: {},
        });
      }

      // Messages should be queued, not processed yet
      expect(mockMessageQueueService.enqueueMessage).toHaveBeenCalledTimes(5);
      expect(mockMessageQueueService.setProcessing).not.toHaveBeenCalled();

      // Advance time by debounce window
      jest.advanceTimersByTime(3000);

      // Now processQueue should have been called
      expect(mockMessageQueueService.setProcessing).toHaveBeenCalledWith(
        sessionId,
        true,
      );
    });

    it('should reset debounce timer on each new message', async () => {
      const sessionId = 'test-debounce-2';

      mockMessageQueueService.getQueue.mockReturnValue({
        isProcessing: () => false,
        dequeue: () => null,
        size: () => 2,
      });

      // Send first message
      await (service as any).handleSessionMessage({
        sessionId,
        message: { type: 'user', data: {} },
        session: {},
      });

      // Advance 2 seconds (less than debounce window)
      jest.advanceTimersByTime(2000);

      // Send another message, resetting the timer
      await (service as any).handleSessionMessage({
        sessionId,
        message: { type: 'assistant', data: {} },
        session: {},
      });

      // Should still not be processed (timer was reset)
      expect(mockMessageQueueService.setProcessing).not.toHaveBeenCalled();

      // Advance 2 more seconds (total 4s from first message, but only 2s from second)
      jest.advanceTimersByTime(2000);

      // Still not processed (only 2s since last message)
      expect(mockMessageQueueService.setProcessing).not.toHaveBeenCalled();

      // Advance 1 more second (3s since last message)
      jest.advanceTimersByTime(1000);

      // Now it should be processed
      expect(mockMessageQueueService.setProcessing).toHaveBeenCalledWith(
        sessionId,
        true,
      );
    });

    it('should flush pending queue immediately on session end', async () => {
      const sessionId = 'test-debounce-3';

      mockMessageQueueService.getQueue.mockReturnValue({
        isProcessing: () => false,
        dequeue: () => null,
        size: () => 1,
      });

      // Send a message (starts debounce timer)
      await (service as any).handleSessionMessage({
        sessionId,
        message: { type: 'user', data: {} },
        session: {},
      });

      // End session immediately (before debounce expires)
      (service as any).handleSessionEnd({ sessionId });

      // Should flush immediately, not wait for debounce
      expect(mockMessageQueueService.setProcessing).toHaveBeenCalledWith(
        sessionId,
        true,
      );
    });

    it('should clear debounce timer on session start', async () => {
      const sessionId = 'test-debounce-4';

      mockMessageQueueService.getQueue.mockReturnValue({
        isProcessing: () => false,
        dequeue: () => null,
        size: () => 0,
      });

      // Send a message (starts debounce timer)
      await (service as any).handleSessionMessage({
        sessionId,
        message: { type: 'user', data: {} },
        session: {},
      });

      // Session starts again (e.g., reconnect)
      (service as any).handleSessionStart({
        sessionId,
        sessionKey: 'agent:main:main',
        user: { id: 'ou_xxx', name: 'Test User' },
        account: 'feishu',
      });

      // Advance debounce window
      jest.advanceTimersByTime(3000);

      // Should NOT process queue because timer was cleared
      expect(mockMessageQueueService.setProcessing).not.toHaveBeenCalled();
    });
  });

  describe('message failure: drop immediately', () => {
    it('should drop message and remove from queue when send throws', async () => {
      const sessionId = 'test-fail-throw';

      mockFormatter.formatUserMessage.mockReturnValue({
        msg_type: 'text',
        content: { text: 'Hello' },
      });
      mockChannelManager.sendToChannel.mockRejectedValue(
        new Error('Network error'),
      );

      await (service as any).sendMessage(sessionId, {
        id: 'q1',
        message: { type: 'user', data: {} },
      });

      // Message should be removed from queue, not retried
      expect(mockMessageQueueService.removeMessage).toHaveBeenCalledWith(
        sessionId,
        'q1',
      );
      // Should NOT have called markMessageSent
      expect(mockMessageQueueService.markMessageSent).not.toHaveBeenCalled();
    });

    it('should drop message and remove from queue when send returns no message_id', async () => {
      const sessionId = 'test-fail-no-id';

      mockFormatter.formatUserMessage.mockReturnValue({
        msg_type: 'text',
        content: { text: 'Hello' },
      });
      mockChannelManager.sendToChannel.mockResolvedValue({
        code: 99999,
        msg: 'error',
      });

      await (service as any).sendMessage(sessionId, {
        id: 'q1',
        message: { type: 'user', data: {} },
      });

      // Message should be removed from queue
      expect(mockMessageQueueService.removeMessage).toHaveBeenCalledWith(
        sessionId,
        'q1',
      );
    });
  });

  describe('processQueue: dequeue prevents duplicate consumption', () => {
    it('should consume each message exactly once via dequeue', async () => {
      const sessionId = 'test-once';
      let dequeueCount = 0;
      const messages = [
        { id: 'm1', message: { type: 'user', data: {} } },
        { id: 'm2', message: { type: 'skill:start', data: {} } },
      ];

      mockMessageQueueService.getQueue.mockReturnValue({
        isProcessing: () => false,
        dequeue: () => {
          dequeueCount++;
          return dequeueCount <= messages.length
            ? messages[dequeueCount - 1]
            : null;
        },
      });

      (service as any).sessionLatestUserMessage.set(sessionId, {
        message_id: 'om_user_base',
      });

      mockFormatter.formatUserMessage.mockReturnValue({
        msg_type: 'text',
        content: { text: 'Hello' },
      });
      mockFormatter.formatSkillStart.mockReturnValue({
        msg_type: 'interactive',
        content: { text: 'skill' },
      });
      mockChannelManager.sendToChannel.mockResolvedValue({
        message_id: `msg_${Date.now()}`,
      });

      await (service as any).processQueue(sessionId);

      // dequeue called 3 times: m1, m2, then null
      expect(dequeueCount).toBe(3);
      // Each message sent exactly once
      expect(mockChannelManager.sendToChannel).toHaveBeenCalledTimes(2);
    });

    it('should process no messages when dequeue returns null', async () => {
      const sessionId = 'test-empty';

      mockMessageQueueService.getQueue.mockReturnValue({
        isProcessing: () => false,
        dequeue: () => null,
      });

      await (service as any).processQueue(sessionId);

      expect(mockChannelManager.sendToChannel).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // Edge cases: session end, multi-session, circuit breaker, etc.
  // ============================================================

  describe('edge case: session end flushes queue but user message map cleared', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
      jest.clearAllMocks();
    });

    it('should skip queued assistant messages when session ends and clears state', async () => {
      const sessionId = 'test-end-flush';

      // Pre-condition: session has state, then ends
      (service as any).sessionLatestUserMessage.set(sessionId, {
        message_id: 'om_user_123',
      });

      // Queue has user + assistant messages
      let dequeueCall = 0;
      mockMessageQueueService.getQueue.mockReturnValue({
        isProcessing: () => false,
        dequeue: () => {
          dequeueCall++;
          if (dequeueCall === 1) {
            return {
              id: 'q-user',
              message: { type: 'user', data: { text: 'hello' } },
            };
          }
          if (dequeueCall === 2) {
            return {
              id: 'q-assistant',
              message: { type: 'assistant', data: { text: 'world' } },
            };
          }
          return null;
        },
        size: () => 2,
      });

      mockFormatter.formatUserMessage.mockReturnValue({
        msg_type: 'text',
        content: { text: 'hello' },
      });
      mockFormatter.formatAssistantMessage.mockReturnValue({
        msg_type: 'text',
        content: { text: 'world' },
      });

      // User message succeeds
      mockChannelManager.sendToChannel.mockResolvedValueOnce({
        message_id: 'om_user_new',
      });
      // Assistant should succeed (sent in the same processQueue call)
      mockChannelManager.sendToChannel.mockResolvedValueOnce({
        message_id: 'om_ai_new',
      });

      // Process queue directly
      await (service as any).processQueue(sessionId);

      // Both messages should be sent in the same flush
      expect(mockChannelManager.sendToChannel).toHaveBeenCalledTimes(2);
    });

    it('should skip assistant messages after handleSessionEnd clears reply_id map', () => {
      const sessionId = 'test-end-clear';

      // Set up state as if session was active
      (service as any).sessionLatestUserMessage.set(sessionId, {
        message_id: 'om_user_old',
      });

      // Session ends — clears all state
      (service as any).handleSessionEnd({ sessionId });

      // Verify state is fully cleared
      expect((service as any).sessionLatestUserMessage.has(sessionId)).toBe(
        false,
      );

      // Now if a new message event somehow arrives for this session,
      // assistant should be skipped (no reply_id)
      mockFormatter.formatAssistantMessage.mockReturnValue({
        msg_type: 'text',
        content: { text: 'orphan assistant' },
      });

      // Call sendMessage directly (simulating late message after session end)
      return (service as any)
        .sendMessage(sessionId, {
          id: 'q-orphan',
          message: { type: 'assistant', data: {} },
        })
        .then(() => {
          expect(mockChannelManager.sendToChannel).not.toHaveBeenCalled();
          expect(mockMessageQueueService.removeMessage).toHaveBeenCalledWith(
            sessionId,
            'q-orphan',
          );
        });
    });
  });

  describe('edge case: circuit breaker opens mid-queue', () => {
    it('should drop remaining messages when circuit breaker opens during processQueue', async () => {
      const sessionId = 'test-cb-mid-queue';

      (service as any).sessionLatestUserMessage.set(sessionId, {
        message_id: 'om_user_base',
      });

      let callCount = 0;
      mockMessageQueueService.getQueue.mockReturnValue({
        isProcessing: () => false,
        dequeue: () => {
          callCount++;
          if (callCount <= 3) {
            return {
              id: `q${callCount}`,
              message: {
                type: 'assistant',
                data: { text: `msg ${callCount}` },
              },
            };
          }
          return null;
        },
        size: () => 3,
      });

      mockFormatter.formatAssistantMessage.mockReturnValue({
        msg_type: 'text',
        content: { text: 'assistant reply' },
      });

      // 1st succeeds, 2nd throws CircuitBreakerOpenError, 3rd still attempted
      mockChannelManager.sendToChannel
        .mockResolvedValueOnce({ message_id: 'om_1' })
        .mockRejectedValueOnce(new CircuitBreakerOpenError('circuit open'))
        .mockResolvedValueOnce({ message_id: 'om_3' });

      await (service as any).processQueue(sessionId);

      // All 3 messages attempted — CB error doesn't stop the queue
      expect(mockChannelManager.sendToChannel).toHaveBeenCalledTimes(3);
      // 1st & 3rd: markMessageSent (success)
      expect(mockMessageQueueService.markMessageSent).toHaveBeenCalledTimes(2);
      // 2nd: removeMessage (CB error = drop)
      expect(mockMessageQueueService.removeMessage).toHaveBeenCalledTimes(1);
    });

    it('should continue processing queue after a single message failure (non-circuit-breaker)', async () => {
      const sessionId = 'test-continue-after-fail';

      (service as any).sessionLatestUserMessage.set(sessionId, {
        message_id: 'om_user_base',
      });

      let dequeueCall = 0;
      mockMessageQueueService.getQueue.mockReturnValue({
        isProcessing: () => false,
        dequeue: () => {
          dequeueCall++;
          if (dequeueCall <= 3) {
            return {
              id: `q${dequeueCall}`,
              message: { type: 'user', data: { text: `msg ${dequeueCall}` } },
            };
          }
          return null;
        },
        size: () => 3,
      });

      mockFormatter.formatUserMessage.mockReturnValue({
        msg_type: 'text',
        content: { text: 'user msg' },
      });

      // 1st succeeds, 2nd throws network error, 3rd succeeds
      mockChannelManager.sendToChannel
        .mockResolvedValueOnce({ message_id: 'om_1' })
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValueOnce({ message_id: 'om_3' });

      await (service as any).processQueue(sessionId);

      // All 3 messages attempted — failure doesn't stop the queue
      expect(mockChannelManager.sendToChannel).toHaveBeenCalledTimes(3);
      // All messages removed (success or failure = drop)
      expect(mockMessageQueueService.removeMessage).toHaveBeenCalledTimes(1); // only the failed one
      expect(mockMessageQueueService.markMessageSent).toHaveBeenCalledTimes(2); // 1st and 3rd
    });
  });

  describe('edge case: channel unavailable / disabled', () => {
    it('should drop message when sendToChannel returns null (channel not found)', async () => {
      const sessionId = 'test-channel-null';

      (service as any).sessionLatestUserMessage.set(sessionId, {
        message_id: 'om_user_base',
      });

      mockFormatter.formatAssistantMessage.mockReturnValue({
        msg_type: 'text',
        content: { text: 'hello' },
      });

      // Channel returns null (e.g., disabled, not found)
      mockChannelManager.sendToChannel.mockResolvedValue(null);

      await (service as any).sendMessage(sessionId, {
        id: 'q1',
        message: { type: 'assistant', data: {} },
      });

      // Message should be dropped (no message_id)
      expect(mockMessageQueueService.removeMessage).toHaveBeenCalledWith(
        sessionId,
        'q1',
      );
      expect(mockMessageQueueService.markMessageSent).not.toHaveBeenCalled();
    });

    it('should drop user message and clear reply_id map when channel returns null', async () => {
      const sessionId = 'test-user-channel-null';

      (service as any).sessionLatestUserMessage.set(sessionId, {
        message_id: 'om_user_old',
      });

      mockFormatter.formatUserMessage.mockReturnValue({
        msg_type: 'text',
        content: { text: 'user text' },
      });

      mockChannelManager.sendToChannel.mockResolvedValue(null);

      await (service as any).sendMessage(sessionId, {
        id: 'q1',
        message: { type: 'user', data: {} },
      });

      // User message failed → reply_id map cleared
      expect((service as any).sessionLatestUserMessage.has(sessionId)).toBe(
        false,
      );
      expect(mockMessageQueueService.removeMessage).toHaveBeenCalledWith(
        sessionId,
        'q1',
      );
    });
  });

  describe('edge case: multi-session isolation', () => {
    it('should maintain independent state for multiple concurrent sessions', async () => {
      const sessionA = 'session-a';
      const sessionB = 'session-b';

      // Set up independent state for each session
      (service as any).sessionLatestUserMessage.set(sessionA, {
        message_id: 'om_a_user',
      });
      (service as any).sessionLatestUserMessage.set(sessionB, {
        message_id: 'om_b_user',
      });

      mockFormatter.formatAssistantMessage.mockReturnValue({
        msg_type: 'text',
        content: { text: 'assistant reply' },
      });
      mockChannelManager.sendToChannel.mockResolvedValue({
        message_id: 'om_ai',
      });

      // Send assistant for session A
      await (service as any).sendMessage(sessionA, {
        id: 'qa',
        message: { type: 'assistant', data: {} },
      });

      // Verify session A used its own reply_id
      expect(mockChannelManager.sendToChannel).toHaveBeenLastCalledWith(
        'feishu',
        expect.any(Object),
        { reply_id: 'om_a_user' },
      );

      // Session B's state should be untouched
      expect(
        (service as any).sessionLatestUserMessage.get(sessionB).message_id,
      ).toBe('om_b_user');

      // Send assistant for session B
      await (service as any).sendMessage(sessionB, {
        id: 'qb',
        message: { type: 'assistant', data: {} },
      });

      expect(mockChannelManager.sendToChannel).toHaveBeenLastCalledWith(
        'feishu',
        expect.any(Object),
        { reply_id: 'om_b_user' },
      );
    });

    it('should have independent debounce timers per session', async () => {
      jest.useFakeTimers();

      const sessionA = 'debounce-a';
      const sessionB = 'debounce-b';

      mockMessageQueueService.getQueue.mockReturnValue({
        isProcessing: () => false,
        dequeue: () => null,
        size: () => 1,
      });

      // Send message to session A
      await (service as any).handleSessionMessage({
        sessionId: sessionA,
        message: { type: 'user', data: {} },
        session: {},
      });

      // Advance 2s — timer should not have fired yet
      jest.advanceTimersByTime(2000);

      // Send message to session B — should have its own timer
      await (service as any).handleSessionMessage({
        sessionId: sessionB,
        message: { type: 'user', data: {} },
        session: {},
      });

      // Both sessions should have active timers
      expect((service as any).sessionDebounceTimers.has(sessionA)).toBe(true);
      expect((service as any).sessionDebounceTimers.has(sessionB)).toBe(true);

      // Advance 1.5s more — session A's timer should fire (3.5s total)
      jest.advanceTimersByTime(1500);

      // Session A timer should have fired, session B still at 1.5s
      expect((service as any).sessionDebounceTimers.has(sessionA)).toBe(false);
      expect((service as any).sessionDebounceTimers.has(sessionB)).toBe(true);

      jest.useRealTimers();
    });

    it('should isolate session start cleanup to only the target session', () => {
      const sessionA = 'isolate-a';
      const sessionB = 'isolate-b';

      // Both sessions have state
      (service as any).sessionLatestUserMessage.set(sessionA, {
        message_id: 'om_a',
      });
      (service as any).sessionLatestUserMessage.set(sessionB, {
        message_id: 'om_b',
      });

      // Session A restarts
      (service as any).handleSessionStart({
        sessionId: sessionA,
        sessionKey: 'agent:main:main',
        user: { id: 'ou_xxx', name: 'Test' },
        account: 'feishu',
      });

      // Session A state cleared, session B untouched
      expect((service as any).sessionLatestUserMessage.has(sessionA)).toBe(
        false,
      );
      expect(
        (service as any).sessionLatestUserMessage.get(sessionB).message_id,
      ).toBe('om_b');
    });
  });

  describe('edge case: user message failure blocks subsequent assistant', () => {
    it('should skip assistant after user message send fails (reply_id map cleared)', async () => {
      const sessionId = 'test-user-fail-blocks';

      // No confirmed user message (user send failed, map was cleared)
      // sessionLatestUserMessage does NOT have an entry for this session

      mockFormatter.formatAssistantMessage.mockReturnValue({
        msg_type: 'text',
        content: { text: 'orphan assistant' },
      });

      await (service as any).sendMessage(sessionId, {
        id: 'q-orphan',
        message: { type: 'assistant', data: {} },
      });

      expect(mockChannelManager.sendToChannel).not.toHaveBeenCalled();
      expect(mockMessageQueueService.removeMessage).toHaveBeenCalledWith(
        sessionId,
        'q-orphan',
      );
    });

    it('should handle user-then-assistant-then-user-then-assistant where first user fails', async () => {
      const sessionId = 'test-alt-fail';

      // Scenario: user1 enqueued (pending) → assistant1 skipped → user2 succeeds → assistant2 OK
      // Step 1: __pending__ set by handleSessionMessage for user1
      (service as any).sessionLatestUserMessage.set(sessionId, {
        message_id: '__pending__',
      });

      // assistant1 arrives — should be skipped (__pending__)
      mockFormatter.formatAssistantMessage.mockReturnValue({
        msg_type: 'text',
        content: { text: 'orphan' },
      });

      await (service as any).sendMessage(sessionId, {
        id: 'q-a1',
        message: { type: 'assistant', data: {} },
      });

      expect(mockChannelManager.sendToChannel).not.toHaveBeenCalled();

      // Step 2: user2 succeeds
      mockFormatter.formatUserMessage.mockReturnValue({
        msg_type: 'text',
        content: { text: 'hello again' },
      });
      mockChannelManager.sendToChannel.mockResolvedValue({
        message_id: 'om_user2',
      });

      await (service as any).sendMessage(sessionId, {
        id: 'q-u2',
        message: { type: 'user', data: {} },
      });

      // reply_id updated to real user2 message_id
      expect(
        (service as any).sessionLatestUserMessage.get(sessionId).message_id,
      ).toBe('om_user2');

      // Step 3: assistant2 should now succeed with correct reply_id
      mockChannelManager.sendToChannel.mockResolvedValue({
        message_id: 'om_ai2',
      });

      await (service as any).sendMessage(sessionId, {
        id: 'q-a2',
        message: { type: 'assistant', data: {} },
      });

      expect(mockChannelManager.sendToChannel).toHaveBeenLastCalledWith(
        'feishu',
        expect.any(Object),
        { reply_id: 'om_user2' },
      );
    });
  });

  describe('edge case: skill message types', () => {
    it('should send skill:start with reply_id to latest user message', async () => {
      const sessionId = 'test-skill-start';

      (service as any).sessionLatestUserMessage.set(sessionId, {
        message_id: 'om_user_base',
      });

      mockFormatter.formatSkillStart.mockReturnValue({
        msg_type: 'interactive',
        content: { text: 'Skill: search_files' },
      });
      mockChannelManager.sendToChannel.mockResolvedValue({
        message_id: 'om_skill_start',
      });

      await (service as any).sendMessage(sessionId, {
        id: 'q1',
        message: { type: 'skill:start', data: { skillName: 'search_files' } },
      });

      expect(mockChannelManager.sendToChannel).toHaveBeenCalledWith(
        'feishu',
        expect.any(Object),
        { reply_id: 'om_user_base' },
      );
    });

    it('should send skill:end with reply_id to latest user message', async () => {
      const sessionId = 'test-skill-end';

      (service as any).sessionLatestUserMessage.set(sessionId, {
        message_id: 'om_user_base',
      });

      mockFormatter.formatSkillEnd.mockReturnValue({
        msg_type: 'interactive',
        content: { text: 'Skill: search_files completed' },
      });
      mockChannelManager.sendToChannel.mockResolvedValue({
        message_id: 'om_skill_end',
      });

      await (service as any).sendMessage(sessionId, {
        id: 'q1',
        message: {
          type: 'skill:end',
          data: { skillName: 'search_files', status: 'success' },
        },
      });

      expect(mockChannelManager.sendToChannel).toHaveBeenCalledWith(
        'feishu',
        expect.any(Object),
        { reply_id: 'om_user_base' },
      );
    });

    it('should skip skill message when no user message exists', async () => {
      const sessionId = 'test-skill-no-user';

      // No user message in sessionLatestUserMessage

      mockFormatter.formatSkillStart.mockReturnValue({
        msg_type: 'interactive',
        content: { text: 'Skill: x' },
      });

      await (service as any).sendMessage(sessionId, {
        id: 'q1',
        message: { type: 'skill:start', data: {} },
      });

      expect(mockChannelManager.sendToChannel).not.toHaveBeenCalled();
      expect(mockMessageQueueService.removeMessage).toHaveBeenCalledWith(
        sessionId,
        'q1',
      );
    });

    it('should handle unknown message type as fallback text', async () => {
      const sessionId = 'test-unknown-type';

      (service as any).sessionLatestUserMessage.set(sessionId, {
        message_id: 'om_user_base',
      });

      mockChannelManager.sendToChannel.mockResolvedValue({
        message_id: 'om_unknown',
      });

      await (service as any).sendMessage(sessionId, {
        id: 'q1',
        message: {
          type: 'some_unknown_type',
          data: { foo: 'bar' },
        },
      });

      expect(mockChannelManager.sendToChannel).toHaveBeenCalledWith(
        'feishu',
        { msg_type: 'text', content: { text: '{"foo":"bar"}' } },
        { reply_id: undefined }, // unknown types don't use reply_id
      );
    });
  });

  describe('edge case: watcher error message delivery', () => {
    it('should send watcher error notification when IM is enabled', async () => {
      mockChannelManager.sendToChannel.mockResolvedValue({
        message_id: 'om_alert',
      });

      await (service as any).handleWatcherError({
        agentId: 'test-agent',
        error: 'File watcher crashed',
        timestamp: Date.now(),
      });

      expect(mockChannelManager.sendToChannel).toHaveBeenCalledWith(
        'feishu',
        expect.objectContaining({
          msg_type: 'text',
          content: expect.objectContaining({
            text: expect.stringContaining('IM Push 告警'),
          }),
        }),
      );
    });

    it('should skip watcher error when IM is disabled', async () => {
      mockConfigService.getConfig.mockReturnValue({
        im: { enabled: false },
      });

      await (service as any).handleWatcherError({
        agentId: 'test-agent',
        error: 'File watcher crashed',
        timestamp: Date.now(),
      });

      expect(mockChannelManager.sendToChannel).not.toHaveBeenCalled();
    });
  });

  describe('edge case: reloadFromConfig', () => {
    it('should re-initialize event listeners on reload', () => {
      // Spy on initializeEventListeners via checking eventListenersRegistered
      const initSpy = jest.spyOn(service as any, 'initializeEventListeners');

      (service as any).reloadFromConfig();

      expect(initSpy).toHaveBeenCalled();
    });
  });
});
