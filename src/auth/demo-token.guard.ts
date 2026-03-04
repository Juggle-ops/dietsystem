import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DemoTokenGuard implements CanActivate {
  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<Request & { headers: Record<string, string | undefined> }>();
    const configuredToken =
      this.configService.get<string>('app.demoAuthToken')?.trim() ?? '';
    if (!configuredToken) {
      return true;
    }
    const headerToken =
      request.headers['x-demo-auth'] ?? request.headers['authorization'];
    if (typeof headerToken !== 'string') {
      throw new UnauthorizedException('Missing demo auth token');
    }
    const normalized = headerToken.startsWith('Bearer ')
      ? headerToken.slice(7)
      : headerToken;
    if (normalized !== configuredToken) {
      throw new UnauthorizedException('Invalid demo auth token');
    }
    return true;
  }
}
