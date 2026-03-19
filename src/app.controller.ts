import { Controller, Get, Res } from '@nestjs/common';
import { AppService } from './app.service';
import type { Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getIndex(@Res() res: Response) {
    const indexPath = path.join(process.cwd(), 'public', 'app', 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.send('OpenClaw Monitor UI - Running');
    }
  }

  // 处理 React Router 前端路由
  @Get('dashboard')
  @Get('sessions')
  @Get('sessions/*')
  @Get('logs')
  @Get('settings')
  getSpa(@Res() res: Response) {
    const indexPath = path.join(process.cwd(), 'public', 'app', 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.redirect('/');
    }
  }
}
