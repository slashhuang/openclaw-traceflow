import { Test, TestingModule } from '@nestjs/testing';
import { AuditController } from './audit.controller';
import { OpenClawService } from '../openclaw/openclaw.service';
import { SessionsService } from '../sessions/sessions.service';
import { MetricsService } from '../metrics/metrics.service';
import * as fs from 'fs/promises';

// Mock dependencies
jest.mock('fs/promises');
const mockedFs = jest.mocked(fs);

describe('AuditController', () => {
  let controller: AuditController;
  let openClawService: jest.Mocked<OpenClawService>;
  let sessionsService: jest.Mocked<SessionsService>;
  let metricsService: jest.Mocked<MetricsService>;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AuditController],
      providers: [
        {
          provide: OpenClawService,
          useValue: {
            getResolvedPaths: jest
              .fn()
              .mockResolvedValue({ workspaceDir: '/tmp' }),
          },
        },
        {
          provide: SessionsService,
          useValue: {
            getAllSessions: jest.fn().mockResolvedValue({ items: [], total: 0 }),
          },
        },
        {
          provide: MetricsService,
          useValue: {
            getTokenSummary: jest.fn().mockResolvedValue({
              totalInput: 0,
              totalOutput: 0,
              totalTokens: 0,
              activeInput: 0,
              activeOutput: 0,
              activeTokens: 0,
              archivedInput: 0,
              archivedOutput: 0,
              archivedTokens: 0,
              nearLimitCount: 0,
              limitReachedCount: 0,
              sessionCount: 0,
            }),
          },
        },
      ],
    }).compile();

    controller = moduleRef.get<AuditController>(AuditController);
    openClawService = moduleRef.get(OpenClawService);
    sessionsService = moduleRef.get(SessionsService);
    metricsService = moduleRef.get(MetricsService);
  });

  describe('getCodeDeliveryDetails', () => {
    it('should return code_delivery events with pagination', async () => {
      // Mock audit dir and events file
      mockedFs.access.mockResolvedValue(undefined);
      mockedFs.readdir.mockResolvedValue(['2026-04.jsonl']);
      mockedFs.readFile.mockResolvedValue(
        JSON.stringify([
          {
            type: 'code_delivery',
            timestamp: '2026-04-01T10:00:00Z',
            mr: {
              iid: 95,
              title: 'feat(audit): ...',
              project: 'acme/platform',
            },
            senderId: 'xiaogang.h',
            tokenUsage: { input: 75000, output: 7000 },
            sessionId: 'main/xxx',
          },
          {
            type: 'code_delivery',
            timestamp: '2026-04-01T10:01:00Z',
            mr: { iid: 94, title: 'fix(audit): ...', project: 'acme/platform' },
            senderId: 'xiaogang.h',
            tokenUsage: { input: 65000, output: 5000 },
            sessionId: 'main/yyy',
          },
        ]),
      );

      const result = await controller.getCodeDeliveryDetails({
        limit: 1,
        offset: 0,
      });

      expect(result.success).toBe(true);
      expect(result.events?.length).toBe(1);
      expect(result.events?.[0].mr?.iid).toBe(95);
      expect(result.total).toBe(2);
    });
  });

  describe('getQaDetails', () => {
    it('should return qa events with tag filter', async () => {
      mockedFs.access.mockResolvedValue(undefined);
      mockedFs.readdir.mockResolvedValue(['2026-04.jsonl']);
      mockedFs.readFile.mockResolvedValue(
        JSON.stringify([
          {
            type: 'qa',
            timestamp: '2026-04-01T10:00:00Z',
            senderId: 'xiaogang.h',
            tags: ['code/mr-create'],
            questionSummary: '帮我创建个 PR...',
            tokenUsage: { input: 80000, output: 2000 },
            sessionId: 'main/xxx',
          },
        ]),
      );

      const result = await controller.getQaDetails({
        tag: 'code/mr-create',
      });

      expect(result.success).toBe(true);
      expect(result.events?.length).toBe(1);
      expect(result.events?.[0].tags).toEqual(['code/mr-create']);
    });
  });

  describe('getAutomationDetails', () => {
    it('should return automation events with type filter', async () => {
      mockedFs.access.mockResolvedValue(undefined);
      mockedFs.readdir.mockResolvedValue(['2026-04.jsonl']);
      mockedFs.readFile.mockResolvedValue(
        JSON.stringify([
          {
            type: 'automation',
            timestamp: '2026-04-01T09:30:00Z',
            automationType: 'daily-ai-news',
            tokenUsage: { input: 120000, output: 10000 },
            sessionId: 'main/zzz',
          },
        ]),
      );

      const result = await controller.getAutomationDetails({
        type: 'daily-ai-news',
      });

      expect(result.success).toBe(true);
      expect(result.events?.length).toBe(1);
      expect(result.events?.[0].automationType).toBe('daily-ai-news');
    });
  });
});
