import { Module, Global, DynamicModule } from '@nestjs/common';
import { WinstonLoggerService, LoggerOptions } from './logger.service';

@Global()
@Module({
  providers: [WinstonLoggerService],
  exports: [WinstonLoggerService],
})
export class LoggerModule {
  static forRoot(options?: Partial<LoggerOptions>): DynamicModule {
    return {
      module: LoggerModule,
      providers: [
        {
          provide: WinstonLoggerService,
          useValue: new WinstonLoggerService(options),
        },
      ],
      exports: [WinstonLoggerService],
    };
  }
}
