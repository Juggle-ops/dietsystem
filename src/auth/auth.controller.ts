import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  login(@Body() body: { username: string; password: string }) {
    const ok = this.auth.validate(body.username, body.password);
    if (!ok) {
      return { success: false };
    }
    // 简化：返回一个伪 token（会话用，不做签名）
    const token = Buffer.from(`${body.username}:${Date.now()}`).toString(
      'base64',
    );
    return { success: true, token };
  }
}
