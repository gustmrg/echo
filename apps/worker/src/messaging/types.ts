import type { Channel, ChannelModel } from "amqplib";

export type RabbitMqConnection = {
  connection: ChannelModel;
  channel: Channel;
};
