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

import { MINUTES_CRON } from './device.const';
import { RegionService } from './region.service';
import { RegionInterface, RegionReferralInterface } from './region.types';
import { RegionConstraint } from './region.utils';
import { GetRegionReferralResponse } from './responses/get-device-referral.response';
import { GetRegionResponse } from './responses/get-regions.response';

@Controller()
@ApiTags('region')
export class RegionController {
  constructor(
    private deviceService: RegionService,
    private schedulerRegistry: SchedulerRegistry,
  ) {
    if (process.env?.LOCAL === 'true') {
      const { name } = this.moveRegionQueue;
      Logger.log(
        `🤖🚿 Device Referral: Getting job ${name} ready to run every ${MINUTES_CRON}m`,
      );
      const job = new CronJob({
        cronTime: `0 */${MINUTES_CRON} * * * *`,
        onTick: () => {
          Logger.log(
            `🤖⚒️ Device Referral: Starting job ${name}; running every ${MINUTES_CRON}m!`,
          );
          this.moveRegionQueue();
        },
        onComplete: () =>
          Logger.log(
            `🤖🏆 Device Referral: Finished job ${name}; running every ${MINUTES_CRON}m!`,
          ),
        runOnInit: true,
      });
      this.schedulerRegistry.addCronJob(name, job);
      job.start();
    }
  }

  @Get('regions')
  @ApiOkResponse({ type: GetRegionResponse, isArray: true })
  async getAllApps(): Promise<RegionInterface[]> {
    const results = await this.deviceService.findAll();
    return results.map(({ region }) => ({ region }));
  }
  @Get('region/:region/referral')
  @ApiParam({ name: 'region', example: 'ES' })
  @ApiOkResponse({ type: GetRegionReferralResponse })
  async getReferral(
    @Param('region') region: string,
  ): Promise<RegionReferralInterface> {
    const regionValidator = new RegionConstraint();
    if (!regionValidator.validate(region)) {
      Logger.error(
        `👺 Device Referral: Malformed region ${region} on ${this.getReferral.name}`,
      );
      throw new BadRequestException();
    }
    const advocate_id = await this.deviceService.getReferralFromRegion(region);
    return { advocate_id };
  }

  @Post('region/:region/queue/:advocate_id')
  @ApiParam({ name: 'region', example: 'ES' })
  @ApiParam({ name: 'advocate_id', example: 'example-user' })
  async addRegionReferralToQueue(
    @Param('region') region: string,
    @Param('advocate_id') advocate_id: string,
  ): Promise<void> {
    const regionValidator = new RegionConstraint();
    if (!regionValidator.validate(region)) {
      Logger.error(
        `👺 Malformed region ${region} on ${this.addRegionReferralToQueue.name}`,
      );
      throw new BadRequestException();
    }
    const advocateIdValidator = new AdvocateIdConstraint();
    if (!advocateIdValidator.validate(advocate_id)) {
      Logger.error(
        `👺 Malformed advocate_id ${advocate_id} on ${this.addRegionReferralToQueue.name}`,
      );
      throw new BadRequestException();
    }
    Logger.log(`Adding referral ${region}/${advocate_id} to queue`);
    await this.deviceService.addRegionReferralToQueue(advocate_id, region);
  }

  @Get('app/queue/move')
  @ApiExcludeEndpoint(process?.env?.LOCAL !== 'true')
  async moveRegionQueue(): Promise<void> {
    if (process?.env?.LOCAL !== 'true') {
      const job = this.schedulerRegistry.getCronJob(this.moveRegionQueue.name);
      if (job !== null && job.running) {
        Logger.error(
          `🤖 Device Referral: Stopping Job as we are not locals here 👽`,
        );
        job.stop();
      }
      Logger.error(
        '👿 Device Referral: Attempt to use local endpoint moveQueue',
      );
      throw new NotFoundException();
    }
    await this.deviceService.moveRegionQueue();
  }
}
