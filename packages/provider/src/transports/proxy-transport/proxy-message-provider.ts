import { BaseProviderTransport } from '../base-provider-transport'

import {
  ProviderMessage, ConnectionState, OpenWalletIntent
} from '../../types'

import { ProxyMessageChannelPort } from './proxy-message-channel'

export class ProxyMessageProvider extends BaseProviderTransport {

  private port: ProxyMessageChannelPort
  
  constructor(port: ProxyMessageChannelPort) {
    super()
    this.connection = ConnectionState.DISCONNECTED
    this.port = port
    if (!port) {
      throw new Error('port argument cannot be empty')
    }
  }

  register = () => {
    this.port.handleMessage = (message: ProviderMessage<any>): void => {
      this.handleMessage(message)
    }

    this.on('connect', (...args: any[]) => {
      this.port.events.emit('connect', args)
    })
    this.on('disconnect', (...args: any[]) => {
      this.port.events.emit('disconnect', args)
    })

    this._registered = true
  }

  unregister = () => {
    this._registered = false
    this.closeWallet()
    this.events.removeAllListeners()
    // @ts-ignore
    this.port.handleMessage = undefined
  }

  openWallet = (path?: string, state?: OpenWalletIntent, defaultNetworkId?: string | number): void => {
    this.connect(defaultNetworkId)
  }

  closeWallet() {
    this.disconnect()
  }

  sendMessage(message: ProviderMessage<any>) {
    if (!message.idx || message.idx <= 0) {
      throw new Error('message idx is empty')
    }
    this.port.sendMessage(message)
  }
}
