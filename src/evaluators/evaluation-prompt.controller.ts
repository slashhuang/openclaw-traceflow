import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Put,
} from '@nestjs/common';
import { EvaluationPromptConfigService } from './evaluation-prompt-config.service';

@Controller('api/evaluation-prompt')
export class EvaluationPromptController {
  constructor(
    private readonly evaluationPromptConfig: EvaluationPromptConfigService,
  ) {}

  @Get()
  async get() {
    const effective = await this.evaluationPromptConfig.getEffective();
    return {
      success: true,
      data: {
        template: effective.template,
        promptVersion: effective.promptVersion,
        source: effective.source,
      },
    };
  }

  @Put()
  async put(@Body() body: { template?: string }) {
    const template = body?.template;
    if (typeof template !== 'string') {
      throw new BadRequestException('缺少 template 字段');
    }
    const effective = await this.evaluationPromptConfig.saveOverride(template);
    return {
      success: true,
      data: {
        template: effective.template,
        promptVersion: effective.promptVersion,
        source: effective.source,
      },
    };
  }

  @Delete()
  async remove() {
    const effective = await this.evaluationPromptConfig.clearOverride();
    return {
      success: true,
      data: {
        template: effective.template,
        promptVersion: effective.promptVersion,
        source: effective.source,
      },
    };
  }
}
