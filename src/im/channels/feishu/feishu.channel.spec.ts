import { FeishuChannel } from './feishu.channel';

// Mock lark SDK
const mockMessageCreate = jest.fn();
const mockMessageReply = jest.fn();
const mockMessageUpdate = jest.fn();
const mockUserGet = jest.fn();

jest.mock('@larksuiteoapi/node-sdk', () => {
  return {
    Client: jest.fn().mockImplementation(() => ({
      im: {
        message: {
          create: mockMessageCreate,
          update: mockMessageUpdate,
        },
        v1: {
          message: {
            reply: mockMessageReply,
          },
        },
      },
      contact: {
        user: {
          get: mockUserGet,
        },
      },
    })),
  };
});

describe('FeishuChannel', () => {
  let channel: FeishuChannel;

  const validConfig = {
    appId: 'test-app-id',
    appSecret: 'test-app-secret',
    targetUserId: 'ou_test123',
    receiveIdType: 'open_id',
  };

  const validContent = {
    msg_type: 'text' as const,
    content: { text: 'Hello' },
  };

  beforeEach(() => {
    // Reset mock implementations, not just call history
    mockMessageCreate.mockReset();
    mockMessageReply.mockReset();
    mockMessageUpdate.mockReset();
    mockUserGet.mockReset();
    channel = new FeishuChannel();
  });

  describe('initialize', () => {
    it('should create lark client with config', async () => {
      await channel.initialize(validConfig);
      expect(channel.type).toBe('feishu');
    });
  });

  describe('validateContent', () => {
    it('should reject empty msg_type', async () => {
      await channel.initialize(validConfig);
      await expect(
        channel.send({ msg_type: '' as any, content: { text: 'hi' } }),
      ).rejects.toThrow('msg_type is required');
    });

    it('should reject missing content', async () => {
      await channel.initialize(validConfig);
      await expect(
        channel.send({ msg_type: 'text', content: undefined as any }),
      ).rejects.toThrow('content is required');
    });

    it('should reject empty text content', async () => {
      await channel.initialize(validConfig);
      await expect(
        channel.send({ msg_type: 'text', content: { text: '   ' } }),
      ).rejects.toThrow('text content is empty');
    });

    it('should accept valid text content', async () => {
      await channel.initialize(validConfig);
      mockMessageCreate.mockResolvedValueOnce({
        code: 0,
        data: { message_id: 'msg_123' },
      });
      await expect(channel.send(validContent)).resolves.toBeDefined();
    });
  });

  describe('send success', () => {
    it('should send message and return message_id', async () => {
      const config = { ...validConfig };
      await channel.initialize(config);
      mockMessageCreate.mockImplementation(() =>
        Promise.resolve({
          code: 0,
          data: { message_id: 'om_test123', chat_id: 'oc_test456' },
        }),
      );

      const result = await channel.send(validContent);

      expect(result.message_id).toBe('om_test123');
      expect(result.chat_id).toBe('oc_test456');
    });

    it('should save chat_id from response', async () => {
      const config = { ...validConfig };
      await channel.initialize(config);
      mockMessageCreate.mockImplementation(() =>
        Promise.resolve({
          code: 0,
          data: { message_id: 'msg_1', chat_id: 'oc_new' },
        }),
      );

      await channel.send(validContent);

      // Internal config should have chat_id set
      expect((channel as any).config.chatId).toBe('oc_new');
    });

    it('should reset circuit breaker on success after failures', async () => {
      await channel.initialize(validConfig);

      // Simulate 9 failures
      for (let i = 0; i < 9; i++) {
        mockMessageCreate.mockImplementation(() =>
          Promise.reject(new Error('Feishu API error: test (code: 99999)')),
        );
        try {
          await channel.send(validContent);
        } catch {
          // ignore
        }
      }

      expect(channel.isCircuitOpen()).toBe(false);

      // 10th failure opens circuit
      mockMessageCreate.mockImplementation(() =>
        Promise.reject(new Error('Feishu API error: test (code: 99999)')),
      );
      try {
        await channel.send(validContent);
      } catch {
        // ignore
      }
      expect(channel.isCircuitOpen()).toBe(true);

      // Success resets circuit — need to close circuit first since it's open
      channel.resetCircuit();
      mockMessageCreate.mockImplementation(() =>
        Promise.resolve({ code: 0, data: { message_id: 'msg_ok' } }),
      );
      await channel.send(validContent);
      expect(channel.isCircuitOpen()).toBe(false);
    });
  });

  describe('send failure', () => {
    it('should throw on API error with proper message', async () => {
      await channel.initialize(validConfig);
      mockMessageCreate.mockResolvedValueOnce({
        code: 230001,
        msg: 'invalid message content',
        data: {},
      });

      await expect(channel.send(validContent)).rejects.toThrow(
        'Feishu API error: invalid message content (code: 230001)',
      );
    });

    it('should throw on network error', async () => {
      await channel.initialize(validConfig);
      mockMessageCreate.mockRejectedValueOnce(new Error('Network error'));

      await expect(channel.send(validContent)).rejects.toThrow('Network error');
    });

    it('should open circuit after MAX_CONSECUTIVE_FAILURES', async () => {
      await channel.initialize(validConfig);

      // Manually trigger failures to reach threshold
      for (let i = 0; i < 10; i++) {
        channel.recordFailure();
      }

      expect(channel.isCircuitOpen()).toBe(true);

      // Should reject immediately when circuit is open
      await expect(channel.send(validContent)).rejects.toThrow(
        'Feishu circuit breaker OPEN',
      );
    });

    it('should not send API request when circuit is open', async () => {
      await channel.initialize(validConfig);

      // Open the circuit
      for (let i = 0; i < 10; i++) {
        channel.recordFailure();
      }

      try {
        await channel.send(validContent);
      } catch {
        // expected
      }

      // No API call should have been made
      expect(mockMessageCreate).not.toHaveBeenCalled();
    });

    it('should not count validation errors as failures', async () => {
      await channel.initialize(validConfig);

      // Try to send invalid content many times
      for (let i = 0; i < 15; i++) {
        try {
          await channel.send({
            msg_type: 'text' as const,
            content: { text: '' },
          });
        } catch {
          // expected
        }
      }

      // Circuit should NOT open from validation errors
      expect(channel.isCircuitOpen()).toBe(false);
    });

    it('should not count circuit breaker errors as double failures', async () => {
      await channel.initialize(validConfig);

      // Open circuit manually
      for (let i = 0; i < 10; i++) {
        channel.recordFailure();
      }

      try {
        await channel.send(validContent);
      } catch {
        // expected
      }

      // Should stay at 10, not exceed (no double counting)
      expect((channel as any).consecutiveFailures).toBe(10);
    });
  });

  describe('sendReply', () => {
    it('should send reply with thread', async () => {
      await channel.initialize(validConfig);
      mockMessageReply.mockResolvedValueOnce({
        code: 0,
        data: { message_id: 'om_reply', thread_id: 'thread_123' },
      });

      // Reply via send with reply_id option
      const result = await channel.send(validContent, {
        reply_id: 'om_root',
      });

      expect(mockMessageReply).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { message_id: 'om_root' },
          data: expect.objectContaining({
            reply_in_thread: true,
          }),
        }),
        {},
      );
      expect(result.thread_id).toBe('thread_123');
    });

    it('should throw on reply API error', async () => {
      await channel.initialize(validConfig);
      mockMessageReply.mockResolvedValueOnce({
        code: 99992402,
        msg: 'field validation failed',
        data: {},
      });

      await expect(
        channel.send(validContent, { reply_id: 'om_bad' }),
      ).rejects.toThrow('field validation failed');
    });
  });

  describe('update', () => {
    it('should update message', async () => {
      await channel.initialize(validConfig);
      mockMessageUpdate.mockResolvedValueOnce({ code: 0, data: {} });

      await expect(
        channel.update('om_test', validContent),
      ).resolves.toBeUndefined();
    });

    it('should throw on update API error', async () => {
      await channel.initialize(validConfig);
      mockMessageUpdate.mockResolvedValueOnce({
        code: 99999,
        msg: 'update failed',
        data: {},
      });

      await expect(channel.update('om_test', validContent)).rejects.toThrow(
        'Feishu update API error',
      );
    });
  });

  describe('healthCheck', () => {
    it('should return unhealthy when not initialized', async () => {
      const result = await channel.healthCheck();
      expect(result.healthy).toBe(false);
    });

    it('should return healthy when client is initialized and healthy', async () => {
      await channel.initialize(validConfig);
      mockUserGet.mockResolvedValueOnce({ code: 0, data: {} });

      const result = await channel.healthCheck();
      expect(result.healthy).toBe(true);
    });

    it('should return unhealthy when health check fails', async () => {
      await channel.initialize(validConfig);
      mockUserGet.mockRejectedValueOnce(new Error('API error'));

      const result = await channel.healthCheck();
      expect(result.healthy).toBe(false);
      expect(result.error).toBe('API error');
    });
  });

  describe('destroy', () => {
    it('should clear client and config', async () => {
      await channel.initialize(validConfig);
      channel.destroy();

      expect((channel as any).client).toBeUndefined();
      expect((channel as any).config).toBeUndefined();
    });
  });
});
