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
import { Advocate, AdvocateDocument } from '@schemas/advocate.schema';
import axios from 'axios';
import { decode } from 'html-entities';
import {
  BlacklistItem,
  BlacklistItemDocument,
} from '@schemas/blacklistitem.schema';
import { PendingItem, PendingItemDocument } from '@schemas/pendingitem.schema';
import { MAX_PENDING_ATTEMPTS } from './app.const';

@Injectable()
export class AppService {
  constructor(
    @InjectModel(Advocate.name)
    private advocateModel: Model<AdvocateDocument>,
    @InjectModel(App.name) private appModel: Model<AppDocument>,
    @InjectModel(BlacklistItem.name)
    private blacklistItemModel: Model<BlacklistItemDocument>,
    @InjectModel(PendingItem.name)
    private pendingItemModel: Model<PendingItemDocument>,
  ) {}
  async findAll(): Promise<App[]> {
    return await this.appModel.find().exec();
  }

  async getReferralForAppByAppId(app_id: App['app_id']): Promise<Advocate> {
    const app = await this.appModel
      .findOne({ app_id: app_id })
      .populate('advocates');
    if (app === null) throw new NotFoundException();
    const { advocates: advocatesWhoOwnTheApp } = app;

    const numAdvocatesWhoOwnTheApp = advocatesWhoOwnTheApp.length;
    if (numAdvocatesWhoOwnTheApp === 0) throw new NotFoundException();
    const winnerIndex = Math.floor(Math.random() * numAdvocatesWhoOwnTheApp);
    const id_ = advocatesWhoOwnTheApp[winnerIndex];
    const advocate = await this.advocateModel.findById(id_);
    if (advocate === null) throw new NotFoundException();
    return advocate;
  }

  private async getNameFrom(advocate_id: string, app_id: string) {
    const url = `/${advocate_id}/${app_id}`;
    Logger.log(`Fetching url ${url}`);
    try {
      const request = await axios.get(url, {
        baseURL: 'https://www.oculus.com/appreferrals',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/105.0.0.0 Safari/537.36',
          'Accept-Language': 'en-GB,en;q=0.9',
          accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
          'sec-ch-ua-platform': 'Windows',
          'sec-ch-ua':
            'Google Chrome";v="105", "Not)A;Brand";v="8", "Chromium";v="105"',
          'sec-ch-ua-mobile': '?0',
          'sec-fetch-dest': 'Document',
          'sec-fetch-mode': 'navigate',
          'sec-fetch-site': 'none',
          'sec-fetch-user': '?1',
          'upgrade-insecure-requests': '1',
          dnt: '1',
        },
      });
      const { data } = request;
      const regex = /(?<=Get\ 25%\ off\ )(.*?)(?= \| Meta Quest)/g;
      const match = (data as string).match(regex);
      if (match === null || match.length === 0) {
        const isInvalidLink = (data as string).includes(
          'error_type=invalid_link',
        );
        if (isInvalidLink) {
          Logger.error(
            `Did not find a match within url ${url}. Adding ${app_id}/${advocate_id} to blacklist due to invalid link`,
          );
          this.blacklistItemModel.findOneAndUpdate(
            { app_id, advocate_id },
            { app_id, advocate_id },
            {
              upsert: true,
              returnDocument: 'after',
              new: true,
              setDefaultsOnInsert: true,
            },
          );
        } else {
          const pendingItem = await this.pendingItemModel.findOne({
            app_id,
            advocate_id,
          });
          if (pendingItem === null) {
            await this.pendingItemModel.findOneAndUpdate(
              { app_id, advocate_id },
              { app_id, advocate_id },
              {
                upsert: true,
                returnDocument: 'after',
                new: true,
                setDefaultsOnInsert: true,
              },
            );
          }
          if (
            pendingItem !== null &&
            pendingItem.attempts < MAX_PENDING_ATTEMPTS
          ) {
            Logger.error(
              `Did not find a match within url ${url} for unknown reasons. Increasing ${app_id}/${advocate_id} attempts`,
            );
            await this.pendingItemModel.findOneAndUpdate(
              { app_id, advocate_id },
              { $inc: { attempts: 1 } },
              {
                upsert: true,
                returnDocument: 'after',
                new: true,
                setDefaultsOnInsert: true,
              },
            );
          } else {
            Logger.error(
              `Did not find a match within url ${url} for unknown reasons.Adding ${app_id}/${advocate_id} to blacklist due to too many attempts`,
            );
            await this.blacklistItemModel.findOneAndUpdate(
              { app_id, advocate_id },
              { app_id, advocate_id },
              {
                upsert: true,
                returnDocument: 'after',
                new: true,
                setDefaultsOnInsert: true,
              },
            );
          }
        }
        throw new NotFoundException();
      }
      const [name] = match;
      const decodedName = decode(name);
      Logger.log(`Found App with name: ${decodedName}`);
      return decode(decodedName);
    } catch (exception) {
      const pendingItem = await this.pendingItemModel.findOne({
        app_id,
        advocate_id,
      });
      if (pendingItem === null) {
        Logger.warn(
          `Exception ${exception} accesing url ${url}. Adding ${app_id}/${advocate_id} pending item`,
        );
        await this.pendingItemModel.findOneAndUpdate(
          { app_id, advocate_id },
          { app_id, advocate_id },
          {
            upsert: true,
            returnDocument: 'after',
            new: true,
            setDefaultsOnInsert: true,
          },
        );
      } else if (pendingItem.attempts < MAX_PENDING_ATTEMPTS) {
        Logger.warn(
          `Exception ${exception} accesing url ${url}. Increasing ${app_id}/${advocate_id} pending item attempts`,
        );
        this.pendingItemModel.updateOne(
          { app_id, advocate_id },
          { $inc: { attempts: 1 } },
          {
            upsert: true,
            returnDocument: 'after',
            new: true,
            setDefaultsOnInsert: true,
          },
        );
      } else {
        Logger.error(
          `Exception "${exception}" accesing url ${url}. Adding ${app_id}/${advocate_id} to blacklist as it has exceeded the max: ${MAX_PENDING_ATTEMPTS}`,
        );
        this.blacklistItemModel.findOneAndUpdate(
          { app_id, advocate_id },
          { app_id, advocate_id },
          {
            upsert: true,
            returnDocument: 'after',
            new: true,
            setDefaultsOnInsert: true,
          },
        );
      }
      throw exception;
    }
  }

  private async getApp(
    advocate_id: Advocate['advocate_id'],
    app_id: App['app_id'],
  ) {
    Logger.log(`Searching for App ${app_id}`);
    const app = await this.appModel.findOne({ app_id: app_id });
    Logger.log(`Searching name for App ${app_id} to ensure referral validity`);
    try {
      const name = await this.getNameFrom(advocate_id, app_id);
      if (app !== null) return app;
      const newApp = new App();
      newApp.app_id = app_id;
      newApp.name = name;
      newApp.advocates = [];
      Logger.log(`Upserting new App ${app_id}/${name}`);
      return await this.appModel.findOneAndUpdate(
        { app_id, name },
        { app_id, name },
        {
          upsert: true,
          returnDocument: 'after',
          new: true,
          setDefaultsOnInsert: true,
        },
      );
    } catch (exception) {
      return null;
    }
  }

  async createReferralOrBlacklistCall(
    advocate_id: Advocate['advocate_id'],
    app_id: App['app_id'],
  ): Promise<void> {
    try {
      await this.createReferralOrBlacklist(advocate_id, app_id);
    } catch (e) {
      throw e;
    }
  }

  private async createReferralOrBlacklist(
    advocate_id: Advocate['advocate_id'],
    app_id: App['app_id'],
  ): Promise<void> {
    try {
      const app = await this.getApp(advocate_id, app_id);
      if (app === null) {
        Logger.error(
          `App ${app_id}/${advocate_id} could not be found or created`,
        );
        throw new NotFoundException();
      }
      const advocate = await this.advocateModel
        .findOne({ advocate_id: advocate_id })
        .populate('apps');
      if (advocate === null) {
        const newAdvocate = new Advocate();
        newAdvocate.advocate_id = advocate_id;
        newAdvocate.apps = [app._id];
        Logger.log(`Creating Advocate ${advocate_id} as it was not found`);
        const createdAdvocate = await this.advocateModel.findOneAndUpdate(
          { advocate_id },
          { $addToSet: { apps: app._id } },
          {
            upsert: true,
            returnDocument: 'after',
            new: true,
            setDefaultsOnInsert: true,
          },
        );
        if (createdAdvocate === null) {
          throw new NotFoundException();
        }
        await this.appModel.updateMany(
          { _id: app._id },
          { $addToSet: { advocates: createdAdvocate._id } },
        );
        return;
      }
      const anyAdvocate = await this.appModel.find({
        $and: [{ _id: app._id }, { advocates: advocate._id }],
      });
      if (anyAdvocate.length > 0) {
        Logger.error(`Attempted dupe referral for ${advocate_id}:${app_id}`);
        throw new ConflictException();
      }
      await this.advocateModel.updateMany(
        { _id: advocate._id },
        { $addToSet: { apps: app._id } },
      );
      await this.appModel.updateMany(
        { _id: app._id },
        { $addToSet: { advocates: advocate._id } },
      );
      Logger.log(`Successfully added ${app_id}/${advocate_id}`);
      Logger.log(`Removing pending item ${app_id}/${advocate_id}`);
      await this.pendingItemModel.remove({ app_id, advocate_id });
      Logger.log(`Removing blacklist item ${app_id}/${advocate_id}`);
      await this.blacklistItemModel.remove({ app_id, advocate_id });
    } catch (reason) {
      throw reason;
    }
  }

  async moveQueue() {
    const pendingItems = await this.pendingItemModel.find();
    const numPendingItems = pendingItems.length;

    Logger.log(`Starting the queue movement, pending: ${numPendingItems}`);
    let index = 0;
    while (index < numPendingItems) {
      const nextWaitMs = 300 * (1 + Math.random());
      try {
        const currentItem = pendingItems[index];
        await this.createReferralOrBlacklist(
          currentItem.advocate_id,
          currentItem.app_id,
        );
        Logger.log(`Waiting for next: ${index + 1}/${numPendingItems + 1}`);
        setTimeout(() => {
          index += 1;
        }, nextWaitMs);
      } catch (exception) {
        Logger.error(
          `Addition failed; waiting for next: ${index + 1}/${
            numPendingItems + 1
          }`,
        );
        setTimeout(() => {
          index += 1;
        }, nextWaitMs);
      }
    }
  }

  async addReferralToQueue(
    advocate_id: Advocate['advocate_id'],
    app_id: App['app_id'],
  ): Promise<void> {
    const blacklistItem = await this.blacklistItemModel.findOne({
      app_id,
      advocate_id,
    });
    if (blacklistItem !== null) {
      Logger.warn(
        `Discarding new pending item ${app_id}/${advocate_id} due to being in the blacklist`,
      );
      throw new UnprocessableEntityException();
    }
    const pendingItem = await this.pendingItemModel.findOne({
      app_id,
      advocate_id,
    });
    if (pendingItem !== null) {
      Logger.warn(
        `Discarding new pending item ${app_id}/${advocate_id} due to being in the queue`,
      );
      return;
    }
    const advocateAppLink = await this.appModel
      .findOne({ app_id })
      .populate('advocates');
    if (
      advocateAppLink !== null &&
      advocateAppLink.advocates.some((adv) => adv.advocate_id === advocate_id)
    ) {
      Logger.warn(
        `Discarding new pending item ${app_id}/${advocate_id} due to already existing`,
      );
      throw new ConflictException();
    }
    const newPendingItem = new PendingItem();
    newPendingItem.advocate_id = advocate_id;
    newPendingItem.app_id = app_id;
    newPendingItem.attempts = 0;
    Logger.log(`Adding new pending item ${app_id}/${advocate_id}`);
    await this.pendingItemModel.findOneAndUpdate(
      { advocate_id, app_id },
      { advocate_id, app_id },
      {
        upsert: true,
        returnDocument: 'after',
        new: true,
        setDefaultsOnInsert: true,
      },
    );
  }
}
