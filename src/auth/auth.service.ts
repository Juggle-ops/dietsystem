import { Injectable } from '@nestjs/common';

@Injectable()
export class AuthService {
  private readonly demoUser = process.env.DEMO_USER || 'demo';
  private readonly demoPass = process.env.DEMO_PASS || 'demo123';

  validate(username: string, password: string): boolean {
    return username === this.demoUser && password === this.demoPass;
  }
}
