import { NetworkConfig, WalletContext, JsonRpcRequest, JsonRpcResponse, JsonRpcHandler } from '@0xsequence/network'
import { TypedData } from '@0xsequence/utils'

// export class SequenceError extends Error {}

export interface WalletSession {
  // Wallet context
  walletContext?: WalletContext

  // Account address of the wallet
  accountAddress?: string

  // Networks in use for the session. The default/dapp network will show
  // up as the first one in the list as the "main chain"
  networks?: NetworkConfig[]

  // Caching provider responses for things such as account and chainId
  providerCache?: {[key: string]: any}
}

export interface ProviderTransport extends JsonRpcHandler, ProviderMessageTransport, ProviderMessageRequestHandler {
  register(): void
  unregister(): void
  openWallet(path?: string, state?: OpenWalletIntent, defaultNetworkId?: string | number): void
  closeWallet(): void
  isConnected(): boolean
  on(event: ProviderMessageEvent, fn: (...args: any[]) => void): void
  once(event: ProviderMessageEvent, fn: (...args: any[]) => void): void
  waitUntilConnected(): Promise<boolean>
  waitUntilLoggedIn(): Promise<WalletSession>
}

export interface WalletTransport extends JsonRpcHandler, ProviderMessageTransport, ProviderMessageRequestHandler {
  register(): void
  unregister(): void
  notifyConnect(connectInfo: { chainId?: string, sessionId?: string }): void
  notifyAccountsChanged(accounts: string[]): void
  notifyChainChanged(connectInfo: any): void
  notifyNetworks(networks: NetworkConfig[]): void
}

export interface ProviderMessage<T> {
  idx: number       // message id sequence number
  type: string      // message type
  data: T           // the ethereum json-rpc payload
  chainId?: number  // chain id which the message is intended
}

export type ProviderMessageRequest = ProviderMessage<JsonRpcRequest>

export type ProviderMessageResponse = ProviderMessage<JsonRpcResponse>

// ProviderMessageCallback is used to respond to ProviderMessage requests. The error
// argument is for exceptions during the execution, and response is the response payload
// which may contain the result or an error payload from the wallet.
export type ProviderMessageResponseCallback = (error: any, response?: ProviderMessageResponse) => void

// TODO: where do we use this..?
export interface ProviderRpcError extends Error {
  code: number
  data?: {[key: string]: any}
}

export interface ProviderMessageRequestHandler {
  // sendMessageRequest sends a ProviderMessageRequest over the wire to the wallet.
  // This method is similar to `sendMessage`, but it expects a response to this message.
  sendMessageRequest(message: ProviderMessageRequest): Promise<ProviderMessageResponse>
}

export interface ProviderMessageTransport {
  // handleMessage will handle a message received from the remote wallet
  handleMessage(message: ProviderMessage<any>): void

  // sendMessage will send the provider message over the wire
  sendMessage(message: ProviderMessage<any>): void
}

export type WalletMessageEvent = 'chainChanged' | 'accountsChanged' | 'login' | 'logout' | 'networks' | 'walletContext' | '_debug'

export type ProviderMessageEvent = 'message' | 'connect' | 'disconnect' | '_debug' | WalletMessageEvent

export enum ProviderMessageType {
  MESSAGE = 'message',
  CONNECT = 'connect',
  DISCONNECT = 'disconnect',
  CHAIN_CHANGED = 'chainChanged',
  ACCOUNTS_CHANGED = 'accountsChanged',
  NETWORKS = 'networks',
  WALLET_CONTEXT = 'walletContext',

  DEBUG = '_debug'
}

export enum ConnectionState {
  DISCONNECTED = 0,
  CONNECTING = 1,
  CONNECTED = 2
}

export type NetworkEventPayload = NetworkConfig

export interface MessageToSign {
  message?: string
  typedData?: TypedData
  chainId?: number
}

export type OpenWalletIntent = { type: 'login' } | { type: 'jsonRpcRequest'; method: string }
