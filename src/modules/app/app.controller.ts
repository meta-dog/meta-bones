import {
  BadRequestException,
  Controller,
  Get,
  Logger,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import {
  ApiExcludeEndpoint,
  ApiOkResponse,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CronJob } from 'cron';
import { AdvocateIdConstraint } from '../advocate/advocate.utils';

import { MINUTES_CRON } from './app.const';
import { AppService } from './app.service';
import { AppInterface, ReferralInterface } from './app.types';
import { AppIdConstraint } from './app.utils';
import { GetAppResponse } from './responses/get-apps.response';
import { GetReferralResponse } from './responses/get-referral.response';

@Controller()
@ApiTags('app')
export class AppController {
  constructor(
    private appService: AppService,
    private schedulerRegistry: SchedulerRegistry,
  ) {
    if (process.env?.LOCAL === 'true') {
      const { name } = this.moveQueue;
      Logger.log(
        `🤖🚿 Getting job ${name} ready to run at the ${MINUTES_CRON} minute`,
      );
      const job = new CronJob({
        cronTime: `0 ${MINUTES_CRON} * * * *`,
        onTick: () => {
          Logger.log(
            `🤖⚒️ Starting job ${name}; running at the ${MINUTES_CRON} minute!`,
          );
          this.moveQueue();
        },
        onComplete: () =>
          Logger.log(
            `🤖🏆 Finished job ${name}; running at the ${MINUTES_CRON} minute!`,
          ),
        runOnInit: false,
      });
      this.schedulerRegistry.addCronJob(name, job);
      job.start();
    }
  }

  @Get('apps')
  @ApiOkResponse({ type: GetAppResponse, isArray: true })
  async getAllApps(): Promise<AppInterface[]> {
    const results = await this.appService.findAll();
    return results.map(({ app_id, name, has_quest, has_rift }) => ({
      app_id,
      name,
      has_quest,
      has_rift,
    }));
  }

  @Get('app/:app_id/referral')
  @ApiParam({ name: 'app_id', example: '2376737905701576' })
  @ApiOkResponse({ type: GetReferralResponse })
  async getReferral(
    @Param('app_id') app_id: string,
  ): Promise<ReferralInterface> {
    const appIdValidator = new AppIdConstraint();
    if (!appIdValidator.validate(app_id)) {
      Logger.error(`👺 Malformed app_id ${app_id} on ${this.getReferral.name}`);
      throw new BadRequestException();
    }
    const advocate_id = await this.appService.getReferralForAppByAppId(app_id);
    return { advocate_id };
  }

  @Post('app/:app_id/queue/:advocate_id')
  @ApiParam({ name: 'app_id', example: '2376737905701576' })
  @ApiParam({ name: 'advocate_id', example: 'example-user' })
  async addReferralToQueue(
    @Param('app_id') app_id: string,
    @Param('advocate_id') advocate_id: string,
  ): Promise<void> {
    const appIdValidator = new AppIdConstraint();
    if (!appIdValidator.validate(app_id)) {
      Logger.error(
        `👺 Malformed app_id ${app_id} on ${this.addReferralToQueue.name}`,
      );
      throw new BadRequestException();
    }
    const advocateIdValidator = new AdvocateIdConstraint();
    if (!advocateIdValidator.validate(advocate_id)) {
      Logger.error(
        `👺 Malformed advocate_id ${advocate_id} on ${this.addReferralToQueue.name}`,
      );
      throw new BadRequestException();
    }
    Logger.log(`Adding referral ${app_id}/${advocate_id} to queue`);
    await this.appService.addReferralToQueue(advocate_id, app_id);
  }

  @Get('app/queue/move')
  @ApiExcludeEndpoint(process?.env?.LOCAL !== 'true')
  async moveQueue(): Promise<void> {
    if (process?.env?.LOCAL !== 'true') {
      const job = this.schedulerRegistry.getCronJob(this.moveQueue.name);
      if (job !== null && job.running) {
        Logger.error(`🤖 Stopping Job as we are not locals here 👽`);
        job.stop();
      }
      Logger.error('👿 Attempt to use local endpoint moveQueue');
      throw new NotFoundException();
    }
    await this.appService.moveQueue();
  }

  @Get('app/queue/platform-info')
  @ApiExcludeEndpoint(process?.env?.LOCAL !== 'true')
  async movePlatformInfoQueue(): Promise<void> {
    if (process?.env?.LOCAL !== 'true') {
      Logger.error('👿 Attempt to use local endpoint movePlatformInfoQueue');
      throw new NotFoundException();
    }
    await this.appService.movePlatformInfoQueue();
  }

  @Get('app/queue/restart-blacklist')
  @ApiExcludeEndpoint(process?.env?.LOCAL !== 'true')
  async restartBlacklistQueue(): Promise<void> {
    if (process?.env?.LOCAL !== 'true') {
      Logger.error('👿 Attempt to use local endpoint restartBlacklistQueue');
      throw new NotFoundException();
    }
    await this.appService.restartBlacklistQueue();
  }

  @Get('app/queue/review-apps')
  @ApiExcludeEndpoint(process?.env?.LOCAL !== 'true')
  async reviewApps(): Promise<void> {
    if (process?.env?.LOCAL !== 'true') {
      Logger.error('👿 Attempt to use local endpoint reviewApps');
      throw new NotFoundException();
    }
    await this.appService.reviewApps();
  }

  @Get('app/queue/review-old-referrals')
  @ApiExcludeEndpoint(process?.env?.LOCAL !== 'true')
  async reviewOldReferrals(): Promise<void> {
    if (process?.env?.LOCAL !== 'true') {
      Logger.error('👿 Attempt to use local endpoint reviewOldReferrals');
      throw new NotFoundException();
    }
    await this.appService.reviewOldReferrals();
  }
}
