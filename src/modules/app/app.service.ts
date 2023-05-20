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
import { decode } from 'html-entities';
import { Model } from 'mongoose';

import {
  BROWSER_USER_AGENT,
  INVALID_LINK_TEXT,
  MAX_PENDING_ATTEMPTS,
  PLATFORM_BASE_URL,
  REFERRAL_BASE_URL,
} from './app.const';
import { Platform } from './app.types';
import { App, AppDocument } from '@schemas/app.schema';
import {
  BlacklistItem,
  BlacklistItemDocument,
} from '@schemas/app-blacklist-item.schema';
import {
  PendingItem,
  PendingItemDocument,
} from '@schemas/app-pending-item.schema';

@Injectable()
export class AppService {
  constructor(
    @InjectModel(App.name) private appModel: Model<AppDocument>,
    @InjectModel(BlacklistItem.name)
    private blacklistItemModel: Model<BlacklistItemDocument>,
    @InjectModel(PendingItem.name)
    private pendingItemModel: Model<PendingItemDocument>,
    private configService: ConfigService,
  ) {
    this.isQueueRunning = false;
  }

  isQueueRunning: boolean;

  async findAll(): Promise<App[]> {
    return await this.appModel
      .find({ advocates: { $exists: true, $not: { $size: 0 } } })
      .exec();
  }

  async getReferralForAppByAppId(
    app_id: App['app_id'],
  ): Promise<App['advocates'][number]> {
    const app = await this.appModel
      .findOne({ app_id: app_id })
      .populate('advocates');
    if (app === null) throw new NotFoundException();
    const { advocates: advocatesWhoOwnTheApp } = app;

    const numAdvocatesWhoOwnTheApp = advocatesWhoOwnTheApp.length;
    if (numAdvocatesWhoOwnTheApp === 0) throw new NotFoundException();
    const winnerIndex = Math.floor(Math.random() * numAdvocatesWhoOwnTheApp);
    return advocatesWhoOwnTheApp[winnerIndex];
  }

  private async increaseAttemptsOrBlacklist(
    advocate_id: string,
    app_id: string,
    url: string,
  ) {
    const pendingItem = await this.pendingItemModel.findOne({
      app_id,
      advocate_id,
    });
    if (pendingItem === null) {
      await this.pendingItemModel.findOneAndUpdate(
        { app_id, advocate_id },
        { app_id, advocate_id },
        { upsert: true, setDefaultsOnInsert: true },
      );
      return;
    }
    if (pendingItem.attempts < MAX_PENDING_ATTEMPTS) {
      Logger.error(
        `📃 Did not find a match within url ${url} for unknown reasons. Setting ${app_id}/${advocate_id} attempts to ${
          pendingItem.attempts + 1
        }`,
      );
      await this.pendingItemModel.findOneAndUpdate(
        { app_id, advocate_id },
        { $inc: { attempts: 1 } },
        { upsert: true, setDefaultsOnInsert: true },
      );
      return;
    }

    Logger.error(
      `🚮 Did not find a match within url ${url} for unknown reasons.Adding ${app_id}/${advocate_id} to blacklist due to too many attempts`,
    );
    await this.blacklistItemModel.findOneAndUpdate(
      { app_id, advocate_id },
      { app_id, advocate_id },
      { upsert: true },
    );
  }

  private async getContentAndUrl(url: string, baseUrl: string) {
    if (this.browser === null) {
      await this.initializeBrowser();
    }

    if (this.browser === null) {
      throw new Error('🚨 Unable to initialise browser');
    }

    const [page] = await this.browser.pages();
    page.setDefaultNavigationTimeout(90000);
    page.setDefaultTimeout(90000);
    await page.setCacheEnabled(false);
    await page.setUserAgent(BROWSER_USER_AGENT);
    await page.goto(baseUrl + url, { waitUntil: 'networkidle0' });
    const nextUrl = page.url();
    const content = await page.content();
    return { content, nextUrl };
  }

  private async getAvailableIn(platform: Platform, app_id: string) {
    const url = `/${platform}/${app_id}`;
    Logger.log(
      `🐕 Fetching url ${url} to check platform ${platform} for app ${app_id}`,
    );
    try {
      const { content, nextUrl } = await this.getContentAndUrl(
        url,
        PLATFORM_BASE_URL,
      );
      const includesURL = nextUrl.includes(`${PLATFORM_BASE_URL}${url}`);
      Logger.log(`🔍 ${PLATFORM_BASE_URL}${url} url valid: ${includesURL}`);
      const invalidId = content.includes(
        '<title id="pageTitle">OK | Oculus</title>',
      );
      Logger.log(`🔍 ${PLATFORM_BASE_URL}${url} id valid: ${!invalidId}`);
      return includesURL && !invalidId;
    } catch (exception) {
      Logger.log(
        `🐕‍🦺 Unable to fetch url ${url} to check platform ${platform} for app ${app_id}`,
      );
      return false;
    }
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

    Logger.log('🍪 Closing first cookie alert');
    await this.repeatKeyPress(19, page, 'Tab');
    await page.keyboard.press('Enter', { delay: 20 });
    Logger.log('⏳ Wait for navigation');
    await page.waitForNavigation({ waitUntil: 'networkidle0' });

    Logger.log('🖱️  Clicking Log In');
    await this.repeatKeyPress(3, page, 'Tab');
    await page.keyboard.press('Enter', { delay: 20 });
    Logger.log('⏳ Wait for navigation');
    await page.waitForNavigation({ waitUntil: 'networkidle0' });
    await page.waitForSelector('div[role=button]', {});

    Logger.log('🍪 Dismissing second cookie alert');
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
        buttons.some((button) => button.innerText === 'LOG IN'),
    );
  }

  private async initializeBrowser() {
    Logger.log('🚀 Initialising browser');
    this.browser = await puppeteer.launch({
      args: [
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
      ],
      waitForInitialPage: true,
      timeout: 90000,
      headless: false,
    });
  }

  private async getToAppInfoPage(url: string, baseUrl: string) {
    try {
      if (this.browser === null) {
        await this.initializeBrowser();
      }

      if (this.browser === null) {
        throw new Error('🚨 Unable to initialise browser');
      }

      const [page] = await this.browser.pages();
      page.setDefaultNavigationTimeout(90000);
      page.setDefaultTimeout(90000);
      await page.setCacheEnabled(false);
      await page.setUserAgent(BROWSER_USER_AGENT);
      Logger.log('⏳ Wait for navigation');
      await page.goto(baseUrl + url, { waitUntil: 'networkidle0' });

      const currentUrl = page.url();
      let content = await page.content();
      const isInvalidPage =
        !currentUrl.includes(url) && content.match(/INVALID LINK/) !== null;
      if (isInvalidPage) {
        return INVALID_LINK_TEXT;
      }

      const needsLogin = await this.getNeedsLogin(page);
      if (needsLogin) {
        Logger.log('👋 Needs login; attempting to log in');
        await this.handleLoginFromReferralPage(page);
        content = await page.content();
      }

      return content;
    } catch (error) {
      throw new Error(error);
    }
  }

  private async getAppInfoFrom(
    advocate_id: string,
    app_id: string,
    skipPlatform = false,
  ) {
    const url = `/${advocate_id}/${app_id}`;
    Logger.log(`🐕 Fetching url ${url}`);
    try {
      const data = await this.getToAppInfoPage(url, REFERRAL_BASE_URL);
      const regex = /(?<=Get\ 25%\ off\ )(.*?)(?= \| Meta Quest)/g;
      const match = (data as string).match(regex);
      if (match === null || match.length === 0) {
        const isInvalidLink = (data as string).includes(INVALID_LINK_TEXT);
        if (isInvalidLink) {
          Logger.error(
            `😭 Did not find a match within url ${url}. Adding ${app_id}/${advocate_id} to blacklist due to invalid link`,
          );
          await this.blacklistItemModel.findOneAndUpdate(
            { app_id, advocate_id },
            { app_id, advocate_id },
            { upsert: true },
          );
          await this.pendingItemModel.deleteOne({ app_id, advocate_id });
          return false;
        }

        throw new Error('🤔 Unknown url error');
      }
      const [name] = match;
      const decodedName = decode(name);
      Logger.log(`🔍 Found App with name: ${decodedName}`);
      const app = await this.appModel.findOne({ app_id });
      if (app !== null) {
        const { has_quest, has_rift } = app;
        Logger.log(
          `🦘 Skipping platform check as the App ${decodedName} already existed`,
        );
        return { name: decode(decodedName), has_quest, has_rift };
      }
      let has_quest, has_rift;
      if (!skipPlatform) {
        has_quest = await this.getAvailableIn('quest', app_id);
        has_rift = await this.getAvailableIn('rift', app_id);
      }
      return { name: decode(decodedName), has_quest, has_rift };
    } catch (error) {
      Logger.error(
        `🚨 Error getting App info. Increasing attempts/blist: ${error}`,
      );
      await this.increaseAttemptsOrBlacklist(advocate_id, app_id, url);
      return false;
    }
  }

  private async removeAdvocateIdFromApp(
    advocate_id: App['advocates'][number],
    app_id: App['app_id'],
  ) {
    const app = await this.appModel.findOne({ app_id }).populate('advocates');
    if (app !== null) {
      const { advocates, name } = app;
      const newAdvocates = advocates.filter(
        (advocateId) => advocateId !== advocate_id,
      );
      if (advocates.length !== newAdvocates.length) {
        Logger.log(
          `🚮 Discarding old Advocate ${advocate_id} from App ${name} (${app_id}) as it is no longer valid`,
        );
        await this.appModel.findOneAndUpdate(
          { app_id },
          { advocates: newAdvocates },
        );
      }
    }
  }

  private async createReferral(
    advocate_id: App['advocates'][number],
    app_id: App['app_id'],
    skipPlatform = false,
  ): Promise<void> {
    const appInfo = await this.getAppInfoFrom(
      advocate_id,
      app_id,
      skipPlatform,
    );
    if (appInfo === false) {
      await this.removeAdvocateIdFromApp(advocate_id, app_id);
      throw new NotFoundException();
    }
    const { name, has_quest, has_rift } = appInfo;

    if (!skipPlatform && !has_quest && !has_rift) {
      Logger.log(
        `🚮 Discarding App ${app_id} with Advocate ${advocate_id} as it is not for Rift or Quest: Blacklisted`,
      );
      await this.blacklistItemModel.findOneAndUpdate(
        { app_id, advocate_id },
        { app_id, advocate_id },
        { upsert: true },
      );
      await this.pendingItemModel.deleteOne({ app_id, advocate_id });
      await this.removeAdvocateIdFromApp(advocate_id, app_id);
      throw new NotFoundException();
    }

    const app = await this.appModel.findOne({ app_id });
    if (app === null) {
      Logger.log(`🧙‍ Creating App ${app_id} with Advocate ${advocate_id}`);
      await this.appModel.create({
        app_id,
        name,
        has_quest,
        has_rift,
        advocates: [advocate_id],
      });
    } else {
      Logger.log(`🫂  Updating App ${app_id}: adding Advocate ${advocate_id}`);
      await this.appModel.findOneAndUpdate(
        { app_id },
        { $addToSet: { advocates: advocate_id } },
      );
    }

    Logger.log(`🧹 Removing pending item ${app_id}/${advocate_id} if exists`);
    await this.pendingItemModel.deleteOne({ app_id, advocate_id });
    Logger.log(`🧹 Removing blacklist item ${app_id}/${advocate_id} if exists`);
    await this.blacklistItemModel.deleteOne({ app_id, advocate_id });
  }

  private async movePendingItem(
    { advocate_id, app_id }: PendingItem,
    skipPlatform = false,
  ) {
    try {
      await this.createReferral(advocate_id, app_id, skipPlatform);
      Logger.log(
        `🎉 Successfully created the referral ${app_id}/${advocate_id}`,
      );
    } catch (error) {
      Logger.error(
        `🚨 Error creating the referral ${app_id}/${advocate_id}: ${error}`,
      );
    }
  }

  private async timeout(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async moveItems(items: PendingItem[], index: number, skipPlatform = false) {
    if (index >= items.length) return;
    const currentItem = items[index];
    const nextWaitMs = 300 * (1 + Math.random());
    Logger.log(`🫡  Attempting to create ${index + 1}/${items.length}`);
    await this.movePendingItem(currentItem, skipPlatform);
    await this.timeout(nextWaitMs);
    await this.moveItems(items, index + 1, skipPlatform);
  }

  async moveQueue() {
    if (this.isQueueRunning) {
      Logger.log(`🛂  Queue is already running, please wait for your turn`);
      return;
    }

    this.isQueueRunning = true;
    const pendingItems = await this.pendingItemModel.find();
    const numPendingItems = pendingItems.length;

    Logger.log(
      `🖨️  Starting the referral queue movement, pending: ${numPendingItems}`,
    );
    await this.moveItems(pendingItems, 0);
    await this.browser?.close();
    this.browser = null;
    Logger.log('😪 All referral queue items handled, going back to sleep!');
    this.isQueueRunning = false;
  }

  async addReferralToQueue(
    advocate_id: App['advocates'][number],
    app_id: App['app_id'],
  ): Promise<void> {
    const blacklistItem = await this.blacklistItemModel.findOne({
      app_id,
      advocate_id,
    });
    if (blacklistItem !== null) {
      Logger.warn(
        `🚮 Discarding new pending item ${app_id}/${advocate_id} due to being in the blacklist`,
      );
      throw new UnprocessableEntityException();
    }
    const pendingItem = await this.pendingItemModel.findOne({
      app_id,
      advocate_id,
    });
    if (pendingItem !== null) {
      Logger.warn(
        `🚮 Discarding new pending item ${app_id}/${advocate_id} due to already being pending`,
      );
      throw new ConflictException();
    }
    const advocateAppLink = await this.appModel
      .findOne({ app_id })
      .populate('advocates');
    if (
      advocateAppLink !== null &&
      advocateAppLink.advocates.some((adv_id) => adv_id === advocate_id)
    ) {
      Logger.warn(
        `🚮 Discarding new pending item ${app_id}/${advocate_id} due to already existing`,
      );
      throw new ConflictException();
    }
    Logger.log(`➕ Adding new pending item ${app_id}/${advocate_id}`);
    await this.pendingItemModel.findOneAndUpdate(
      { advocate_id, app_id },
      { advocate_id, app_id },
      { upsert: true, setDefaultsOnInsert: true },
    );
  }

  private async movePlatformItem({ app_id, name }: App) {
    try {
      const has_quest = await this.getAvailableIn('quest', app_id);
      const has_rift = await this.getAvailableIn('rift', app_id);
      Logger.log(
        `🕶️ Updating app ${name} (${app_id}) with Quest: ${has_quest} & Rift: ${has_rift}`,
      );
      await this.appModel.findOneAndUpdate({ app_id }, { has_quest, has_rift });
      if (!has_quest && !has_rift) {
        Logger.log(
          `🔥 Deleting ${name} (${app_id}) as it has neither platform`,
        );
        await this.appModel.deleteOne({ app_id });
      }
    } catch (error) {
      Logger.error(`🙈 Error getting platform info for ${app_id}: ${error}`);
    }
  }

  private async movePlatformItems(items: App[], index: number) {
    if (index >= items.length) return;
    const currentItem = items[index];
    const nextWaitMs = 300 * (1 + Math.random());
    Logger.log(
      `👓 Attempting to check platform for element  ${index + 1}/${
        items.length
      }`,
    );
    await this.movePlatformItem(currentItem);
    await this.timeout(nextWaitMs);
    await this.movePlatformItems(items, index + 1);
  }

  async movePlatformInfoQueue() {
    const itemsPendingPlatformCheck = await this.appModel.find({
      $or: [{ has_quest: undefined }, { has_rift: undefined }],
    });
    const numPendingItems = itemsPendingPlatformCheck.length;

    Logger.log(
      `🖨️  Starting the platform info queue movement, pending: ${numPendingItems}`,
    );
    await this.movePlatformItems(itemsPendingPlatformCheck, 0);
    Logger.log(
      `😪 All platform info queue items handled, going back to sleep!`,
    );
  }

  async restartBlacklistQueue() {
    const blacklistItems = await this.blacklistItemModel.find();
    const pendingItems: PendingItem[] = blacklistItems.map((blacklistItem) => ({
      app_id: blacklistItem.app_id,
      advocate_id: blacklistItem.advocate_id,
      attempts: 0,
    }));
    Logger.log('✝️ Resurrecting blacklisted apps to pending');
    await this.pendingItemModel.create(pendingItems, {});
    const blacklistIds = blacklistItems.map(({ _id }) => _id);
    Logger.log('💥 Destroying resurrected blacklisted apps');
    await this.blacklistItemModel.deleteMany({ _id: blacklistIds });
    Logger.log('🏁 Finished restarting blacklisted apps');
  }

  async reviewApps() {
    const apps = await this.appModel.find({
      $or: [
        { has_quest: true, has_rift: true },
        { has_quest: undefined, has_rift: undefined },
        { has_quest: false, has_rift: false },
      ],
    });
    Logger.log('👓 Reviewing suspicious apps');
    await this.movePlatformItems(apps, 0);
    await this.browser?.close();
    this.browser = null;
    Logger.log('🏁 Finished reviewing all apps');
  }

  async reviewOldReferrals() {
    const apps = await this.appModel.find().populate('advocates');
    const pendingItems: PendingItem[] = apps.flatMap(({ app_id, advocates }) =>
      advocates.map((advocate_id) => ({ app_id, advocate_id, attempts: 0 })),
    );
    Logger.log('👓 Reviewing old app referrals, skipping platform');
    await this.moveItems(pendingItems, 0, true);
    await this.browser?.close();
    this.browser = null;
    Logger.log('🏁 Finished reviewing old app referrals');
  }
}
