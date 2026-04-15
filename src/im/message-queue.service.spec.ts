import { MessageQueue } from './message-queue.service';

describe('MessageQueue', () => {
  let queue: MessageQueue;

  beforeEach(() => {
    queue = new MessageQueue('test-session');
  });

  describe('enqueue', () => {
    it('should add a message with unique id and pending status', () => {
      const msg = queue.enqueue({ type: 'user', data: { text: 'hello' } });

      expect(msg.sessionId).toBe('test-session');
      expect(msg.status).toBe('pending');
      expect(msg.message.type).toBe('user');
    });

    it('should generate unique ids for multiple messages', () => {
      const m1 = queue.enqueue({ type: 'user' });
      const m2 = queue.enqueue({ type: 'assistant' });

      expect(m1.id).not.toBe(m2.id);
    });
  });

  describe('dequeue', () => {
    it('should return null for empty queue', () => {
      expect(queue.dequeue()).toBeNull();
    });

    it('should return oldest pending message and mark it as sending', () => {
      const m1 = queue.enqueue({ type: 'user' });
      const m2 = queue.enqueue({ type: 'assistant' });

      const dequeued = queue.dequeue();

      expect(dequeued?.id).toBe(m1.id);
      expect(dequeued?.status).toBe('sending');
      expect(m1.status).toBe('sending');
      expect(m2.status).toBe('pending');
    });

    it('should skip sending messages and return next pending', () => {
      const m1 = queue.enqueue({ type: 'user' });
      queue.enqueue({ type: 'assistant' });

      m1.status = 'sending';

      const dequeued = queue.dequeue();
      expect(dequeued?.message.type).toBe('assistant');
    });

    it('should prevent duplicate consumption (atomicity)', () => {
      queue.enqueue({ type: 'user' });

      const first = queue.dequeue();
      const second = queue.dequeue();

      expect(first).not.toBeNull();
      expect(second).toBeNull();
    });

    it('should return messages in FIFO order', () => {
      const msgs = [
        queue.enqueue({ type: 'user' }),
        queue.enqueue({ type: 'assistant' }),
        queue.enqueue({ type: 'skill:start' }),
      ];

      const results = [];
      while (true) {
        const msg = queue.dequeue();
        if (!msg) break;
        results.push(msg.id);
        queue.markDone(msg.id);
      }

      expect(results).toEqual([msgs[0].id, msgs[1].id, msgs[2].id]);
    });
  });

  describe('markDone', () => {
    it('should mark message as sent and remove from queue', () => {
      const msg = queue.enqueue({ type: 'user' });
      queue.dequeue(); // mark as sending

      queue.markDone(msg.id);

      expect(queue.size()).toBe(0);
    });

    it('should work regardless of current message status', () => {
      const msg = queue.enqueue({ type: 'user' });
      // not dequeued, still 'pending'
      queue.markDone(msg.id);

      expect(queue.size()).toBe(0);
    });

    it('should do nothing for unknown message id', () => {
      queue.enqueue({ type: 'user' });

      queue.markDone('nonexistent');

      expect(queue.size()).toBe(1);
    });
  });

  describe('size', () => {
    it('should return 0 for empty queue', () => {
      expect(queue.size()).toBe(0);
    });

    it('should return correct count after enqueue and markDone', () => {
      const m1 = queue.enqueue({ type: 'user' });
      queue.enqueue({ type: 'assistant' });
      queue.enqueue({ type: 'skill:start' });

      expect(queue.size()).toBe(3);

      queue.markDone(m1.id);

      expect(queue.size()).toBe(2);
    });
  });

  describe('isProcessing', () => {
    it('should return false by default', () => {
      expect(queue.isProcessing()).toBe(false);
    });
  });
});
