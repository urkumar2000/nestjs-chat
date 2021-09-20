import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import _ = require('lodash');
import { Server, Socket } from 'socket.io';
import * as uuid from 'uuid';

interface ChatUser {
  id?: string;
  username: string;
  fullname: string;
  profilePic: string;
  employeeCode: string;
  clientId?: string;
}

export interface ChatMessage {
  id?: string;
  fromEmployeeCode: string;
  fromName: string;
  fromProfilePic: string;
  toEmployeeCode?: string;
  message: string;
  dateTime?: number;
  read?: boolean;
  // employeeCode: string;
}

export interface GetMessage {
  fromEmployeeCode: string;
  toEmployeeCode: string;
}

@WebSocketGateway()
export class ChatGateway
  implements OnGatewayConnection, OnGatewayInit, OnGatewayDisconnect
{
  logger = new Logger();

  users: ChatUser[] = [];
  messages: ChatMessage[] = [];

  @WebSocketServer()
  server: Server;

  afterInit(server: any) {
    this.logger.log('Initialised');
  }

  @SubscribeMessage('login')
  handleLogin(socket: Socket, payload: ChatUser) {
    this.logger.log('Client Connected');

    this.users.push({
      id: socket.id,
      username: payload.username,
      fullname: payload.fullname,
      profilePic: payload.profilePic,
      employeeCode: payload.employeeCode,
      clientId: socket.id,
    });

    const uniqUsers = _.uniqBy(this.users, 'employeeCode');

    this.server.emit('user-list', uniqUsers);

    this.logger.log('User Added to the list');
  }

  @SubscribeMessage('server-message')
  handleServerMessage(client: Socket, payload: ChatMessage) {
    this.logger.log('Message Received');
    this.logger.log(payload);

    this.messages.push({
      id: uuid.v4(),
      fromEmployeeCode: payload.fromEmployeeCode,
      fromName: payload.fromName,
      fromProfilePic: payload.fromProfilePic,
      message: payload.message,
      dateTime: Date.now(),
      toEmployeeCode: payload.toEmployeeCode,
    });

    // Multiple client with same employee code could connect to the chat
    const to = this.getRecipients(payload.toEmployeeCode);
    const from = this.getRecipients(payload.fromEmployeeCode);

    // Get all the messages from to and from and emit to both

    const messages = this.getMessagesFromParticularUser(
      payload.fromEmployeeCode,
      payload.toEmployeeCode,
    );

    this.emitToAllRecipients(to, 'client-message', messages);
    this.emitToAllRecipients(from, 'client-message', messages);
  }

  @SubscribeMessage('server-get-messages')
  handleGetMessageFromParticularUser(client: Socket, payload: GetMessage) {
    const messages = this.getMessagesFromParticularUser(
      payload.fromEmployeeCode,
      payload.toEmployeeCode,
    );

    const from = this.getRecipients(payload.fromEmployeeCode);

    this.emitToAllRecipients(from, 'client-get-messages', messages);
  }

  handleConnection(client: any, ...args: any[]) {
    console.log('New Connection', client, args);
  }

  handleDisconnect(client: any) {
    const user = this.users.find((f) => f.id === client.id);
    if (user) {
      const index = this.users.indexOf(user);
      this.logger.log('');
      this.users.splice(index, 1);
    }
    this.logger.log('User Disconnected');
    this.server.emit('user-list', this.users);
  }

  getMessagesFromParticularUser(
    fromEmployeeCode: string,
    toEmployeeCode: string,
  ) {
    const messages = this.messages.filter(
      (f) =>
        (f.fromEmployeeCode === fromEmployeeCode &&
          f.toEmployeeCode === toEmployeeCode) ||
        (f.fromEmployeeCode == toEmployeeCode &&
          f.toEmployeeCode === fromEmployeeCode),
    );

    return messages;
  }

  getRecipients(employeeCode: string) {
    // Multiple client with same employee code could connect to the chat
    return this.users.filter((f) => f.employeeCode === employeeCode);
  }

  emitToAllRecipients(
    recipients: ChatUser[] = [],
    eventName: string,
    toEmit: any,
  ) {
    recipients.forEach((item: ChatUser) => {
      this.server.to(item.clientId).emit(eventName, toEmit);
    });
  }
}
