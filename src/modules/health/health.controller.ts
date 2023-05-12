import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
  HttpHealthIndicator,
} from '@nestjs/terminus';

@Controller('health')
@ApiTags('health')
export class HealthController {
  @Inject() private health: HealthCheckService;
  @Inject() private http: HttpHealthIndicator;

  @Get()
  @HealthCheck()
  async check(): Promise<HealthCheckResult> {
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    return this.health.check([
      () => this.http.pingCheck('network', 'https://www.google.com/'),
    ]);
  }
}
