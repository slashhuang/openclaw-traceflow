import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ImPushService } from './im-push.service';
import { ConfigService } from '../config/config.service';
import { MessageQueueService } from './message-queue.service';
import { ChannelManager } from './channel-manager';
import { FeishuMessageFormatter } from './channels/feishu/feishu.formatter';

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
  markMessageFailed: jest.fn(),
  removeFailedMessage: jest.fn(),
  cleanupSession: jest.fn(),
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
  let eventEmitter: EventEmitter2;

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
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);

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
      mockFormatter.formatUserMessage.mockReturnValue({
        msg_type: 'text',
        content: { text: 'Hello 1' },
      });
      mockChannelManager.sendToChannel.mockResolvedValue({
        message_id: 'msg_001',
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
      expect(mockMessageQueueService.markMessageSent).toHaveBeenCalledWith(
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
        getOldestMessage: () => {
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
      expect(mockMessageQueueService.markMessageSent).toHaveBeenCalledWith(
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
      expect(mockMessageQueueService.removeFailedMessage).toHaveBeenCalledWith(
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
        getOldestMessage: () => {
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
        getOldestMessage: () => null,
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
        getOldestMessage: () => null,
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
        getOldestMessage: () => null,
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
        getOldestMessage: () => null,
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
});
