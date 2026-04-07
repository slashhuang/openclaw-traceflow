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
      const latestMsg1 = (service as any).sessionLatestUserMessage.get(sessionId);
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
      const latestMsg2 = (service as any).sessionLatestUserMessage.get(sessionId);
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
      (service as any).sessionSendingLock.set(
        sessionId,
        Promise.resolve(),
      );

      // Trigger session start
      (service as any).handleSessionStart({
        sessionId,
        sessionKey: 'agent:main:main',
        user: { id: 'ou_xxx', name: 'Test User' },
        account: 'feishu',
      });

      // Verify state is cleared
      expect(
        (service as any).sessionLatestUserMessage.has(sessionId),
      ).toBe(false);
      expect(
        (service as any).sessionSendingLock.has(sessionId),
      ).toBe(false);
    });
  });

  describe('handleSessionEnd', () => {
    it('should clean up all session state on session end', () => {
      const sessionId = 'test-session-6';

      // Set some state
      (service as any).sessionLatestUserMessage.set(sessionId, {
        message_id: 'msg_xxx',
      });
      (service as any).sessionSendingLock.set(
        sessionId,
        Promise.resolve(),
      );

      // Trigger session end
      (service as any).handleSessionEnd({ sessionId });

      // Verify state is cleared
      expect(
        (service as any).sessionLatestUserMessage.has(sessionId),
      ).toBe(false);
      expect(
        (service as any).sessionSendingLock.has(sessionId),
      ).toBe(false);
      expect(mockMessageQueueService.cleanupSession).toHaveBeenCalledWith(
        sessionId,
      );
    });
  });
});
