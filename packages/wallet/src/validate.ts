import { ethers } from 'ethers'
import { WalletContext } from '@0xsequence/network'
import { Provider } from '@ethersproject/providers'
import { walletContracts } from '@0xsequence/abi'
import { isDecodedEOASigner, isDecodedFullSigner, decodeSignature, compareAddr, addressOf } from '@0xsequence/config'
import { recoverConfigFromDigest } from './config'

import { packMessageData } from './utils'

export async function isValidSignature(
  address: string,
  digest: Uint8Array,
  sig: string,
  provider?: Provider,
  walletContext?: WalletContext,
  chainId?: number
) {
  // Check if valid EOA signature
  if (
    isValidEIP712Signature(address, digest, sig) ||
    isValidEthSignSignature(address, digest, sig)
  ) return true

  const wallets = await Promise.all([
    isValidContractWalletSignature(address, digest, sig, provider),
    isValidSequenceDeployedWalletSignature(address, digest, sig, provider)
  ])

  // If validity of wallet signature can't be determined
  // it could be a signature of a non-deployed sequence wallet
  if (wallets[0] === undefined && wallets[1] === undefined) {
    return isValidSequenceUndeployedWalletSignature(address, digest, sig, walletContext, provider, chainId)
  }

  return wallets[0] || wallets[1]
}

export function isValidEIP712Signature(
  address: string,
  digest: Uint8Array,
  sig: string
): boolean {
  try {
    return compareAddr(
      ethers.utils.recoverAddress(
        digest,
        ethers.utils.splitSignature(sig)
      ),
      address
    ) === 0
  } catch {
    return false
  }
}

export function isValidEthSignSignature(
  address: string,
  digest: Uint8Array,
  sig: string
): boolean {
  try {
    const subDigest = ethers.utils.keccak256(
      ethers.utils.solidityPack(
        ['string', 'bytes32'],
        ['\x19Ethereum Signed Message:\n32', digest]
      )
    )
    return compareAddr(
      ethers.utils.recoverAddress(
        subDigest,
        ethers.utils.splitSignature(sig)
      ),
      address
    ) === 0
  } catch {
    return false
  }
}

// Check if valid Smart Contract Wallet signature, via ERC1271
export async function isValidContractWalletSignature(
  address: string,
  digest: Uint8Array,
  sig: string,
  provider?: Provider
) {
  if (!provider) return undefined
  try {
    if ((await provider.getCode(address)) === '0x') {
      // Signature validity can't be determined
      return undefined
    }

    const wallet = new ethers.Contract(address, walletContracts.erc1271.abi, provider)
    const response = await wallet.isValidSignature(digest, sig)
    return walletContracts.erc1271.returns.isValidSignatureBytes32 === response
  } catch {
    return false
  }
}

export async function isValidSequenceDeployedWalletSignature(
  address: string,
  digest: Uint8Array,
  sig: string,
  provider?: Provider
) {
  if (!provider) return undefined // Signature validity can't be determined
  try {
    return isValidContractWalletSignature(address, digest, sig, provider)
  } catch {
    return false
  }
}

export async function isValidSequenceUndeployedWalletSignature(
  address: string,
  digest: Uint8Array,
  sig: string,
  walletContext?: WalletContext,
  provider?: Provider,
  chainId?: number
) {
  if (!provider && !chainId) return undefined // Signature validity can't be determined
  if (!walletContext) return undefined // Signature validity can't be determined

  try {
    const cid = chainId ? chainId : (await provider!.getNetwork()).chainId
    const signature = decodeSignature(sig)
    const subDigest = ethers.utils.arrayify(ethers.utils.keccak256(packMessageData(address, cid, digest)))
    const config = await recoverConfigFromDigest(subDigest, signature, provider, walletContext, chainId, true)
    const weight = signature.signers.reduce((v, s) => isDecodedEOASigner(s) || isDecodedFullSigner(s) ? v + s.weight : v, 0)
    return compareAddr(addressOf(config, walletContext), address) === 0 && weight >= signature.threshold
  } catch {
    return false
  }
}
