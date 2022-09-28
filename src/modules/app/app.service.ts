import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { App, AppDocument } from '@schemas/app.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import { decode } from 'html-entities';
import {
  BlacklistItem,
  BlacklistItemDocument,
} from '@schemas/blacklistitem.schema';
import { PendingItem, PendingItemDocument } from '@schemas/pendingitem.schema';
import {
  BROWSER_USER_AGENT,
  DEFAULT_CRAWLER,
  HEADERS,
  INVALID_LINK_TEXT,
  MAX_PENDING_ATTEMPTS,
  PLATFORM_BASE_URL,
  REFERRAL_BASE_URL,
} from './app.const';
import { Platform } from './app.types';
import puppeteer from 'puppeteer';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppService {
  constructor(
    @InjectModel(App.name) private appModel: Model<AppDocument>,
    @InjectModel(BlacklistItem.name)
    private blacklistItemModel: Model<BlacklistItemDocument>,
    @InjectModel(PendingItem.name)
    private pendingItemModel: Model<PendingItemDocument>,
    private configService: ConfigService,
  ) {}
  async findAll(): Promise<App[]> {
    return await this.appModel.find().exec();
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
        `📃 Did not find a match within url ${url} for unknown reasons. Increasing ${app_id}/${advocate_id} attempts by one from ${pendingItem.attempts}`,
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

  private async getContentFromPupetteer(url: string, baseUrl: string) {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setCacheEnabled(false);
    await page.setUserAgent(BROWSER_USER_AGENT);
    await page.goto(baseUrl + url, { waitUntil: 'networkidle0' });
    const content = await page.content();
    return content;
  }

  private async getContentFromAxios(url: string, baseUrl: string) {
    const request = await axios.get(url, {
      baseURL: baseUrl,
      headers: HEADERS,
    });
    const { data } = request;
    return data;
  }

  private async getContentFrom(url: string, baseUrl: string) {
    if (DEFAULT_CRAWLER === 'axios') {
      return this.getContentFromAxios(url, baseUrl);
    }
    return this.getContentFromPupetteer(url, baseUrl);
  }

  private async getAvailableIn(platform: Platform, app_id: string) {
    const url = `/${platform}/${app_id}`;
    Logger.log(
      `🐕 Fetching url ${url} to check platform ${platform} for app ${app_id}`,
    );
    try {
      const data = await this.getContentFrom(url, PLATFORM_BASE_URL);
      return (data as string).includes(`"${PLATFORM_BASE_URL}${url}"`);
    } catch (exception) {
      Logger.log(
        `🐕‍🦺 Unable to fetch url ${url} to check platform ${platform} for app ${app_id}`,
      );
      return false;
    }
  }

  browser: puppeteer.Browser | null = null;

  private async handleLoginFromReferralPage(page: puppeteer.Page) {
    const username = this.configService.get<string>('login.username');
    const password = this.configService.get<string>('login.password');
    if (username === undefined || password === undefined) {
      throw new Error('Username and Password must both be defined in env');
    }

    Logger.log('🍪 Closing first cookie alert');
    await page.keyboard.press('Tab', { delay: 20 });
    await page.keyboard.press('Tab', { delay: 20 });
    await page.keyboard.press('Tab', { delay: 20 });
    await page.keyboard.press('Tab', { delay: 20 });
    await page.keyboard.press('Tab', { delay: 20 });

    await page.keyboard.press('Tab', { delay: 20 });
    await page.keyboard.press('Tab', { delay: 20 });
    await page.keyboard.press('Tab', { delay: 20 });
    await page.keyboard.press('Tab', { delay: 20 });
    await page.keyboard.press('Tab', { delay: 20 });

    await page.keyboard.press('Tab', { delay: 20 });
    await page.keyboard.press('Tab', { delay: 20 });
    await page.keyboard.press('Tab', { delay: 20 });
    await page.keyboard.press('Tab', { delay: 20 });
    await page.keyboard.press('Tab', { delay: 20 });

    await page.keyboard.press('Tab', { delay: 20 });
    await page.keyboard.press('Tab', { delay: 20 });
    await page.keyboard.press('Tab', { delay: 20 });
    await page.keyboard.press('Tab', { delay: 20 });
    await page.keyboard.press('Enter', { delay: 20 });
    await page.waitForNavigation({ waitUntil: 'networkidle0' });

    Logger.log('🖱️ Clicking Log In');
    await page.keyboard.press('Tab', { delay: 20 });
    await page.keyboard.press('Tab', { delay: 20 });
    await page.keyboard.press('Tab', { delay: 20 });
    await page.keyboard.press('Enter', { delay: 20 });
    await page.waitForNavigation({ waitUntil: 'networkidle0' });

    Logger.log('🍪 Dismissing second cookie alert');
    await page.keyboard.press('Tab', { delay: 20 });
    await page.keyboard.press('Tab', { delay: 20 });
    await page.keyboard.press('Enter', { delay: 20 });

    Logger.log('🖱️ Clicking Log In');
    await page.keyboard.press('Tab', { delay: 20 });
    await page.keyboard.press('Tab', { delay: 20 });
    await page.keyboard.press('Tab', { delay: 20 });
    await page.keyboard.press('Tab', { delay: 20 });
    await page.keyboard.press('Enter', { delay: 20 });

    Logger.log('👤 Entering username');
    await page.keyboard.type(username, {
      delay: 50,
    });
    await page.keyboard.press('Tab', { delay: 20 });
    Logger.log('🔑 Entering password');
    await page.keyboard.type(password, { delay: 70 });
    Logger.log('🙏 Submit login info');
    await page.keyboard.press('Enter');
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
      await page.setCacheEnabled(false);
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

  private async getAppInfoFrom(advocate_id: string, app_id: string) {
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
      const has_quest = await this.getAvailableIn('quest', app_id);
      const has_rift = await this.getAvailableIn('rift', app_id);
      return { name: decode(decodedName), has_quest, has_rift };
    } catch (error) {
      Logger.error(
        `🚨 Error getting App info. Increasing attempts/blist: ${error}`,
      );
      await this.increaseAttemptsOrBlacklist(advocate_id, app_id, url);
      return false;
    }
  }

  private async createReferral(
    advocate_id: App['advocates'][number],
    app_id: App['app_id'],
  ): Promise<void> {
    const appInfo = await this.getAppInfoFrom(advocate_id, app_id);
    if (appInfo === false) throw new NotFoundException();
    const { name, has_quest, has_rift } = appInfo;

    const app = await this.appModel.findOne({ app_id });
    if (app === null) {
      Logger.log(`🧙‍♂️ Creating App ${app_id} with Advocate ${advocate_id}`);
      await this.appModel.create({
        app_id,
        name,
        has_quest,
        has_rift,
        advocates: [advocate_id],
      });
    } else {
      Logger.log(`🫂 Updating App ${app_id}: adding Advocate ${advocate_id}`);
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

  private async movePendingItem({ advocate_id, app_id }: PendingItem) {
    try {
      await this.createReferral(advocate_id, app_id);
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

  async moveItems(items: PendingItem[], index: number) {
    if (index >= items.length) return;
    const currentItem = items[index];
    const nextWaitMs = 300 * (1 + Math.random());
    Logger.log(`🫡 Attempting to create ${index + 1}/${items.length}`);
    await this.movePendingItem(currentItem);
    await this.timeout(nextWaitMs);
    await this.moveItems(items, index + 1);
  }

  async moveQueue() {
    const pendingItems = await this.pendingItemModel.find();
    const numPendingItems = pendingItems.length;

    Logger.log(
      `🖨️  Starting the referral queue movement, pending: ${numPendingItems}`,
    );
    await this.moveItems(pendingItems, 0);
    await this.browser?.close();
    this.browser = null;
    Logger.log('😪 All referral queue items handled, going back to sleep!');
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
    Logger.log(`Adding new pending item ${app_id}/${advocate_id}`);
    await this.pendingItemModel.findOneAndUpdate(
      { advocate_id, app_id },
      { advocate_id, app_id },
      { upsert: true, setDefaultsOnInsert: true },
    );
  }

  private async movePlatformItem({ app_id }: App) {
    try {
      const has_quest = await this.getAvailableIn('quest', app_id);
      const has_rift = await this.getAvailableIn('rift', app_id);
      Logger.log(
        `🕶️ Updating app ${app_id} with Quest: ${has_quest} & Rift: ${has_rift}`,
      );
      await this.appModel.findOneAndUpdate({ app_id }, { has_quest, has_rift });
    } catch (error) {
      Logger.error(`Error getting platform info for ${app_id}: ${error}`);
    }
  }

  private async movePlatformItems(items: App[], index: number) {
    if (index >= items.length) return;
    const currentItem = items[index];
    const nextWaitMs = 300 * (1 + Math.random());
    Logger.log(
      `👓 Attempting to check platform for element ${index + 1}/${
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
}
