import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { DemoTokenGuard } from './demo-token.guard';

@Module({
  providers: [AuthService, DemoTokenGuard],
  controllers: [AuthController],
  exports: [DemoTokenGuard],
})
export class AuthModule {}
