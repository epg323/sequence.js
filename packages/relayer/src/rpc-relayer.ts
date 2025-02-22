import { TransactionResponse, Provider, BlockTag } from '@ethersproject/providers'
import { ethers } from 'ethers'
import fetchPonyfill from 'fetch-ponyfill'
import { Transaction, TransactionEncoded, readSequenceNonce, appendNonce, MetaTransactionsType, sequenceTxAbiEncode, SignedTransactions } from '@0xsequence/transactions'
import { BaseRelayer } from './base-relayer'
import { ChaindService } from '@0xsequence/chaind'
import { Relayer } from '.'
import { WalletContext } from '@0xsequence/network'
import { WalletConfig, addressOf } from '@0xsequence/config'

export class RpcRelayer extends BaseRelayer implements Relayer {
  private readonly chaindService: ChaindService
  public waitForReceipt: boolean

  constructor(
    url: string,
    bundleDeploy: boolean = true,
    provider?: Provider,
    waitForReceipt: boolean = true
  ) {
    super(bundleDeploy, provider)
    this.chaindService = new ChaindService(url, fetchPonyfill().fetch)
    this.waitForReceipt = waitForReceipt
  }

  async waitReceipt(
    metaTxHash: string,
    wait: number = 500
  ) {
    let result = await this.chaindService.getMetaTxnReceipt({ metaTxID: metaTxHash })

    while ((!result.receipt.txnReceipt || result.receipt.txnReceipt === 'null') && result.receipt.status === 'UNKNOWN') {
      await new Promise(r => setTimeout(r, wait))
      result = await this.chaindService.getMetaTxnReceipt({ metaTxID: metaTxHash })
    }

    // "FAILED" is reserved for when the tx is invalid and never dispatched by remote relayer
    if (result.receipt.status == 'FAILED') {
      throw new Error(result.receipt.revertReason)
    }

    return result
  }

  async gasRefundOptions(
    config: WalletConfig,
    context: WalletContext,
    ...transactions: Transaction[]
  ): Promise<TransactionEncoded[][]> {
    // chaind only supports refunds on a single token
    // TODO: Add compatiblity for different refund options
    const tokenFee = await this.chaindService.tokenFee()

    // No gas refund required
    if (!tokenFee.isFee || tokenFee.fee === ethers.constants.AddressZero) {
      return [[]]
    }

    const addr = addressOf(config, context)
    const prevNonce = readSequenceNonce(...transactions)

    // Set temporal nonce to simulate meta-txn
    if (prevNonce === undefined) {
      transactions = appendNonce(transactions, await this.getNonce(config, context))
    }

    const encoded = ethers.utils.defaultAbiCoder.encode([MetaTransactionsType], [sequenceTxAbiEncode(transactions)])
    const res = await this.chaindService.estimateMetaTxnGasReceipt({
      feeToken: tokenFee.fee,
      call: {
        contract: addr,
        payload: encoded,
        numSigners: config.signers.length
      }
    })

    let decoded = ethers.utils.defaultAbiCoder.decode([MetaTransactionsType], `0x${res.res.payload}`)[0]
    if (prevNonce !== undefined) {
      decoded = appendNonce(decoded, prevNonce)
    }

    if (res.res.feeAppended) {
      return [[decoded[decoded.length - 1]]]
    } else {
      return [[]]
    }
  }

  async estimateGasLimits(
    config: WalletConfig,
    context: WalletContext,
    ...transactions: Transaction[]
  ): Promise<Transaction[]> {
    if (transactions.length == 0) {
      return []
    }

    // chaind requires tokenFee, even for only estimating gasLimits
    const tokenFee = this.chaindService.tokenFee()

    const addr = addressOf(config, context)
    const prevNonce = readSequenceNonce(...transactions)

    // Set temporal nonce to simulate meta-txn
    if (prevNonce === undefined) {
      transactions = appendNonce(transactions, await this.getNonce(config, context))
    }

    const encoded = ethers.utils.defaultAbiCoder.encode([MetaTransactionsType], [sequenceTxAbiEncode(transactions)])
    const res = await this.chaindService.estimateMetaTxnGasReceipt({
      feeToken: (await tokenFee).fee,
      call: {
        contract: addr,
        payload: encoded,
        numSigners: config.signers.length
      }
    })

    const decoded = ethers.utils.defaultAbiCoder.decode([MetaTransactionsType], `0x${res.res.payload}`)[0]
    const modTxns = transactions.map((t, i) => ({
      ...t,
      gasLimit: decoded[i].gasLimit
    }))

    // Remove placeholder nonce if previously defined
    return prevNonce === undefined ? modTxns : appendNonce(modTxns, prevNonce)
  }

  async getNonce(
    config: WalletConfig,
    context: WalletContext,
    space?: number,
    blockTag?: BlockTag
  ): Promise<number> {
    const addr = addressOf(config, context)
    const resp = await this.chaindService.getMetaTxnNonce({ walletContractAddress: addr })
    return ethers.BigNumber.from(resp.nonce).toNumber()
  }

  async relay(signedTxs: SignedTransactions): Promise<PendingTransactionResponse> {
    if (!this.provider) {
      throw new Error('provider is not set')
    }

    const prep = await this.prepareTransactions(signedTxs.config, signedTxs.context, signedTxs.signature, ...signedTxs.transactions)
    const result = this.chaindService.sendMetaTxn({
      call: {
        contract: prep.to,
        input: prep.data
      }
    })

    const waitReceipt = async () => {
      const hash = (await result).txnHash
      const receipt = (await this.waitReceipt(hash)).receipt
      const txReceipt = JSON.parse(receipt.txnReceipt) as RelayerTxReceipt

      return {
        blockHash: txReceipt.blockHash,
        blockNumber: ethers.BigNumber.from(txReceipt.blockNumber).toNumber(),
        confirmations: 1,
        from: addressOf(signedTxs.config, signedTxs.context),
        hash: txReceipt.transactionHash,
        raw: receipt.txnReceipt,
        wait: async (confirmations?: number) => this.provider!.waitForTransaction(txReceipt.transactionHash, confirmations)
      } as TransactionResponse
    }

    if (this.waitForReceipt) {
      return waitReceipt()
    }

    return {
      from: addressOf(signedTxs.config, signedTxs.context),
      raw: (await result).toString(),
      hash: (await result).txnHash,
      waitForReceipt: waitReceipt,
      wait: async (confirmations?: number) => {
        const receipt = await waitReceipt()
        return receipt.wait(confirmations)
      }
    } as PendingTransactionResponse
  }
}

export type PendingTransactionResponse = TransactionResponse & {
  waitForReceipt?: () => Promise<TransactionResponse>
}

type RelayerTxReceipt = {
  blockHash: string
  blockNumber: string
  contractAddress: string
  cumulativeGasUsed: string
  gasUsed: string
  logs: {
    address: string
    blockHash: string
    blockNumber: string
    data: string
    logIndex: string
    removed: boolean
    topics: string[]
    transactionHash: string
    transactionIndex: string
  }[],
  logsBloom: string
  root: string
  status: string
  transactionHash: string
  transactionIndex: string
}
