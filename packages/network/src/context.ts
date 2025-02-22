// WalletContext is the module addresses deployed on a network, aka the context / environment
// of the Sequence Smart Wallet system on Ethereum.
export interface WalletContext {
  factory: string
  mainModule: string
  mainModuleUpgradable: string
  guestModule?: string
  sequenceUtils?: string

  nonStrict?: boolean
}

// sequenceContext are the deployed addresses of modules available on public networks.
export const sequenceContext: WalletContext = {
  factory: '0xf9D09D634Fb818b05149329C1dcCFAeA53639d96',
  mainModule: '0xd01F11855bCcb95f88D7A48492F66410d4637313',
  mainModuleUpgradable: '0x7EFE6cE415956c5f80C6530cC6cc81b4808F6118',
  guestModule: '0x02390F3E6E5FD1C6786CB78FD3027C117a9955A7',
  sequenceUtils: '0xC8aEEa34948F313ed8661E1C7E5b4c5a2885988B'
}
