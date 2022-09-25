import {
  Controller,
  Get,
  Logger,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiExcludeEndpoint,
  ApiOkResponse,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AppInterface, ReferralInterface } from './app.types';
import { AppService } from './app.service';
import { GetAppResponse } from './responses/get-apps.response';
import { GetReferralResponse } from './responses/get-referral.response';

@Controller()
@ApiTags('app')
export class AppController {
  constructor(private appService: AppService) {}

  @Get('apps')
  @ApiOkResponse({ type: GetAppResponse, isArray: true })
  async getAllApps(): Promise<AppInterface[]> {
    const results = await this.appService.findAll();
    return results.map(({ app_id, name }) => ({ app_id, name }));
  }

  @Get('app/:app_id/referral')
  @ApiParam({ name: 'app_id', example: '2376737905701576' })
  @ApiOkResponse({ type: GetReferralResponse })
  async index(@Param('app_id') app_id: string): Promise<ReferralInterface> {
    const { advocate_id } = await this.appService.getReferralForAppByAppId(
      app_id,
    );
    return { advocate_id };
  }

  @Post('app/:app_id/queue/:advocate_id')
  @ApiParam({ name: 'app_id', example: '2376737905701576' })
  @ApiParam({ name: 'advocate_id', example: 'example.user' })
  async addReferralToQueue(
    @Param('app_id') app_id: string,
    @Param('advocate_id') advocate_id: string,
  ): Promise<void> {
    try {
      Logger.log(
        `Attempting to add referral ${app_id}/${advocate_id} to queue`,
      );
      await this.appService.createReferralOrBlacklistCall(advocate_id, app_id);
    } catch (reason) {
      Logger.warn(
        `Referral ${app_id}/${advocate_id} failed so adding to queue`,
      );
      await this.appService.addReferralToQueue(advocate_id, app_id);
    }
  }

  @Get('app/queue/move')
  @ApiExcludeEndpoint(process?.env?.LOCAL !== 'true')
  async moveQueue(): Promise<void> {
    if (process?.env?.LOCAL !== 'true') {
      Logger.error('Attempt to use local endpoint moveQueue');
      throw new NotFoundException();
    }
    await this.appService.moveQueue();
  }
}
