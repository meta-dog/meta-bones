import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import puppeteer from 'puppeteer';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import {
  BROWSER_USER_AGENT,
  DEVICE_REFERRAL_BASE_URL,
  INVALID_LINK_TEXT,
  MAX_PENDING_ATTEMPTS,
} from './device.const';
import { Region, RegionDocument } from '@schemas/region.schema';
import {
  RegionBlacklistItem,
  RegionBlacklistItemDocument,
} from '@schemas/region-blacklist-item.schema';
import {
  RegionPendingItem,
  RegionPendingItemDocument,
} from '@schemas/region-pending-item.schema';

@Injectable()
export class RegionService {
  constructor(
    @InjectModel(Region.name)
    private deviceReferralModel: Model<RegionDocument>,
    @InjectModel(RegionBlacklistItem.name)
    private deviceReferralBlacklistItemModel: Model<RegionBlacklistItemDocument>,
    @InjectModel(RegionPendingItem.name)
    private deviceReferralPendingItemModel: Model<RegionPendingItemDocument>,
    private configService: ConfigService,
  ) {
    this.isQueueRunning = false;
  }

  isQueueRunning: boolean;

  async findAll() {
    return await this.deviceReferralModel.find();
  }

  async getReferralFromRegion(
    region: Region['region'],
  ): Promise<Region['advocates'][number]> {
    const regionReferrals = await this.deviceReferralModel.findOne({ region });
    if (regionReferrals === null) throw new NotFoundException();
    const regionAdvocates = regionReferrals.advocates;
    const numRegionReferrals = regionAdvocates.length;
    if (numRegionReferrals === 0) throw new NotFoundException();
    const winnerIndex = Math.floor(Math.random() * numRegionReferrals);
    return regionAdvocates[winnerIndex];
  }

  private async isDuplicatedAdvocate(advocate_id: string) {
    const deviceReferrals = await this.deviceReferralModel
      .find()
      .populate('advocates');

    const advocates = new Set<string>(
      deviceReferrals.reduce(
        (prev, { advocates }) => [...prev, ...advocates],
        [] as string[],
      ),
    );
    return advocates.has(advocate_id);
  }

  async addRegionReferralToQueue(
    advocate_id: RegionPendingItem['advocate_id'],
    region: RegionPendingItem['region'],
  ) {
    const existingRegionPending =
      await this.deviceReferralPendingItemModel.findOne({
        advocate_id,
        region,
      });
    if (existingRegionPending !== null) {
      Logger.error(
        `⏳ Device Referral: Error adding device referral for ${advocate_id}/${region}: pending`,
      );
      throw new ConflictException();
    }
    const existingRegionBlacklist =
      await this.deviceReferralBlacklistItemModel.findOne({
        advocate_id,
        region,
      });
    if (existingRegionBlacklist !== null) {
      Logger.error(
        `💀 Device Referral: Error adding device referral for ${advocate_id}/${region}: blacklisted`,
      );
      throw new UnprocessableEntityException();
    }

    if (await this.isDuplicatedAdvocate(advocate_id)) {
      Logger.error(
        `🤼 Device Referral: Error adding device referral for ${advocate_id}/${region}: conflict`,
      );
      throw new ConflictException();
    }
    await this.deviceReferralPendingItemModel.findOneAndUpdate(
      { advocate_id, region },
      { advocate_id, region },
      { upsert: true, setDefaultsOnInsert: true },
    );
  }

  private async increaseAttemptsOrBlacklist(
    advocate_id: string,
    region: string,
    url: string,
  ) {
    const pendingItem = await this.deviceReferralPendingItemModel.findOne({
      region,
      advocate_id,
    });
    if (pendingItem === null) {
      await this.deviceReferralPendingItemModel.findOneAndUpdate(
        { region, advocate_id },
        { region, advocate_id },
        { upsert: true, setDefaultsOnInsert: true },
      );
      return;
    }
    if (pendingItem.attempts < MAX_PENDING_ATTEMPTS) {
      Logger.error(
        `📃 Device Referral: Did not find a match within url ${url} for unknown reasons. Setting ${region}/${advocate_id} attempts to ${
          pendingItem.attempts + 1
        }`,
      );
      await this.deviceReferralPendingItemModel.findOneAndUpdate(
        { region, advocate_id },
        { $inc: { attempts: 1 } },
        { upsert: true, setDefaultsOnInsert: true },
      );
      return;
    }

    Logger.error(
      `🚮 Device Referral: Did not find a match within url ${url} for unknown reasons. Adding ${region}/${advocate_id} to blacklist due to too many attempts`,
    );
    await this.deviceReferralBlacklistItemModel.findOneAndUpdate(
      { region, advocate_id },
      { region, advocate_id },
      { upsert: true },
    );
  }

  browser: puppeteer.Browser | null = null;

  private async repeatKeyPress(
    times: number,
    page: puppeteer.Page,
    key: puppeteer.KeyInput,
    delay = 20,
  ) {
    for (let i = 1; i <= times; i++) {
      await page.keyboard.press(key, { delay });
    }
  }

  private async handleLoginFromReferralPage(page: puppeteer.Page) {
    const username = this.configService.get<string>('login.username');
    const password = this.configService.get<string>('login.password');
    if (username === undefined || password === undefined) {
      throw new Error('Username and Password must both be defined in env');
    }

    Logger.log('🍪 Device Referral: Closing first cookie alert');
    await this.repeatKeyPress(18, page, 'Tab');
    await page.keyboard.press('Enter', { delay: 20 });
    Logger.log('⏳ Device Referral: Wait for navigation');
    await page.waitForNavigation({ waitUntil: 'networkidle0' });

    Logger.log('🖱️  Device Referral: Clicking Log In');
    await this.repeatKeyPress(3, page, 'Tab');
    await page.keyboard.press('Enter', { delay: 20 });
    Logger.log('⏳ Device Referral: Wait for navigation');
    await page.waitForNavigation({ waitUntil: 'networkidle0' });
    await page.waitForSelector('div[role=button]', {});

    Logger.log('🍪 Device Referral: Dismissing second cookie alert');
    await this.repeatKeyPress(2, page, 'Tab');
    await page.keyboard.press('Enter', { delay: 20 });

    Logger.log('⏳ Wait for navigation');
    await page.waitForNavigation({ waitUntil: 'networkidle0' });

    const loginContent = await page.content();
    if (loginContent.includes('aria-label="Log in with email address"')) {
      Logger.log('⏳ Wait for the form to be stable');
      await this.timeout(2 * 1000);

      Logger.log('📨 Go to log in via email');
      await this.repeatKeyPress(4, page, 'Tab');
      await page.keyboard.press('Enter', { delay: 50 });

      Logger.log('👤 Entering username');
      await page.keyboard.type(username, { delay: 85 });
      Logger.log('🧭 Navigate to password');
      await page.keyboard.press('Tab', { delay: 100 });
      await page.keyboard.press('Tab', { delay: 100 });

      Logger.log('🔑 Entering password');
      await page.keyboard.type(password, { delay: 125 });
      Logger.log('🙏 Submit login info');
      await page.keyboard.press('Enter');
    } else {
      Logger.log('📨 Direct login - tab to email');
      await page.keyboard.press('Tab', { delay: 100 });

      Logger.log('👤 Entering username');
      await page.keyboard.type(username, { delay: 100 });

      Logger.log('🧭 Navigate to password');
      await page.keyboard.press('Tab', { delay: 100 });
      await page.keyboard.press('Enter', { delay: 50 });

      Logger.log('⏳ Wait for the form to be stable');
      await this.timeout(2 * 1000);
      await this.repeatKeyPress(4, page, 'Tab');

      Logger.log('🔑 Entering password');
      await page.keyboard.type(password, { delay: 125 });

      Logger.log('🙏 Submit login info');
      await this.repeatKeyPress(2, page, 'Tab');
      await page.keyboard.press('Enter');
    }

    Logger.log('⏳ Wait for navigation');
    await page.waitForNavigation({ waitUntil: 'networkidle0' });
  }

  private async getNeedsLogin(page: puppeteer.Page) {
    return await page.$$eval(
      'button[type=submit]',
      (buttons: HTMLButtonElement[]) =>
        buttons.some((button) => button.innerText === 'LOG IN TO CONTINUE'),
    );
  }

  private async initializeBrowser() {
    Logger.log('🚀 Device Referral: Initialising browser');
    this.browser = await puppeteer.launch({
      args: [
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
      ],
      waitForInitialPage: true,
      headless: false,
    });
  }

  private async getToDeviceInfoPage(url: string, baseUrl: string) {
    try {
      if (this.browser === null) {
        await this.initializeBrowser();
      }

      if (this.browser === null) {
        throw new Error('🚨 Device Referral: Unable to initialise browser');
      }

      const [page] = await this.browser.pages();
      page.setDefaultNavigationTimeout(90000);
      page.setDefaultTimeout(90000);
      await page.setCacheEnabled(false);
      await page.setUserAgent(BROWSER_USER_AGENT);
      Logger.log('⏳ Device Referral: Wait for navigation');
      await page.goto(baseUrl + url, { waitUntil: 'networkidle0' });

      Logger.log('Get Page URL');
      const currentUrl = page.url();
      Logger.log('Check if INVALID');
      const isInvalidPage = !currentUrl.includes(url);
      if (isInvalidPage) {
        return INVALID_LINK_TEXT;
      }

      Logger.log('Check if Needs Login');
      const needsLogin = await this.getNeedsLogin(page);
      if (needsLogin) {
        Logger.log('👋 Device Referral: Needs login; attempting to log in');
        await this.handleLoginFromReferralPage(page);
        await page.content();
      }
      return page.url();
    } catch (error) {
      throw new Error(error);
    }
  }

  private async validateRegionReferral(advocate_id: string, region: string) {
    const url = `/${advocate_id}`;
    Logger.log(`🐕 Fetching url ${url}`);
    try {
      const newUrl = await this.getToDeviceInfoPage(
        url,
        DEVICE_REFERRAL_BASE_URL,
      );
      const isInvalidLink = !newUrl.includes(url);
      if (isInvalidLink) {
        Logger.error(
          `😭 Did not find a match within url ${url}. Adding ${region}/${advocate_id} to blacklist due to invalid link`,
        );
        await this.deviceReferralBlacklistItemModel.findOneAndUpdate(
          { region, advocate_id },
          { region, advocate_id },
          { upsert: true },
        );
        await this.deviceReferralPendingItemModel.deleteOne({
          region,
          advocate_id,
        });
        return false;
      }

      Logger.log(`🔍 Found Device Referral for: ${advocate_id}/${region}`);
      return true;
    } catch (error) {
      Logger.error(
        `🚨 Error getting Device info. Increasing attempts/blist: ${error}`,
      );
      await this.increaseAttemptsOrBlacklist(advocate_id, region, url);
      return false;
    }
  }

  private async createRegionReferral(
    advocate_id: Region['advocates'][number],
    region: Region['region'],
  ): Promise<void> {
    if (await this.isDuplicatedAdvocate(advocate_id)) {
      Logger.log(
        `🚨 Device Referral: Adding to blacklist due to duplicate ${advocate_id}`,
      );
      await this.deviceReferralBlacklistItemModel.findOneAndUpdate(
        { region, advocate_id },
        { region, advocate_id },
        { upsert: true },
      );
      await this.deviceReferralPendingItemModel.findOneAndRemove({
        region,
        advocate_id,
      });
      throw new ConflictException();
    }

    const validRegion = await this.validateRegionReferral(advocate_id, region);
    if (validRegion === false) throw new NotFoundException();

    const deviceReferral = await this.deviceReferralModel.findOne({ region });
    if (deviceReferral === null) {
      Logger.log(
        `🧙‍ Device Referral: Creating region ${region} with Advocate ${advocate_id}`,
      );
      await this.deviceReferralModel.create({
        region,
        advocates: [advocate_id],
      });
    } else {
      Logger.log(
        `🫂  Device Referral: Updating region ${region}: adding Advocate ${advocate_id}`,
      );
      await this.deviceReferralModel.findOneAndUpdate(
        { region },
        { $addToSet: { advocates: advocate_id } },
      );
    }

    Logger.log(
      `🧹 Device Referral: Removing pending item ${region}/${advocate_id} if exists`,
    );
    await this.deviceReferralPendingItemModel.deleteOne({
      advocate_id,
      region,
    });
    Logger.log(
      `🧹 Device Referral: Removing blacklist item ${region}/${advocate_id} if exists`,
    );
    await this.deviceReferralBlacklistItemModel.deleteOne({
      advocate_id,
      region,
    });
  }

  private async moveRegionPendingItem({
    advocate_id,
    region,
  }: RegionPendingItem) {
    try {
      await this.createRegionReferral(advocate_id, region);
      Logger.log(
        `🎉 Device Referral: Successfully created the device referral ${region}/${advocate_id}`,
      );
    } catch (error) {
      Logger.error(
        `🚨 Device Referral: Error creating the device referral ${region}/${advocate_id}: ${error}`,
      );
    }
  }

  private async timeout(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async moveRegionItems(items: RegionPendingItem[], index: number) {
    if (index >= items.length) return;
    const currentItem = items[index];
    const nextWaitMs = 300 * (1 + Math.random());
    Logger.log(
      `🫡  Device Referral: Attempting to create ${index + 1}/${
        items.length
      } device referrals`,
    );
    await this.moveRegionPendingItem(currentItem);
    await this.timeout(nextWaitMs);
    await this.moveRegionItems(items, index + 1);
  }

  async moveRegionQueue() {
    if (this.isQueueRunning) {
      Logger.log(
        `🛂  Device Referral: Queue is already running, please wait for your turn`,
      );
      return;
    }

    this.isQueueRunning = true;
    const pendingItems = await this.deviceReferralPendingItemModel.find();
    const numPendingItems = pendingItems.length;

    Logger.log(
      `🖨️  Device Referral: Starting the queue movement, pending: ${numPendingItems}`,
    );
    await this.moveRegionItems(pendingItems, 0);
    await this.browser?.close();
    this.browser = null;
    Logger.log(
      '😪 Device Referral: All queue items handled, going back to sleep!',
    );
    this.isQueueRunning = false;
  }
}
