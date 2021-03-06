import {
  decodeUint8Array,
  encodeToUint8Array,
  discoverAccounts,
  getWalletAuthForAccount,
  FIELDS_TO_REMOVE_FROM_TXN,
  ALL_ALGORAND_NETWORKS,
  ALGOSIGNER_DEFAULT_PERMISSION,
} from './helper';
import {
  AlgoNetworkType,
  SignatureProviderArgs,
  WalletAuth,
  NetworkConfig,
  AlgorandRawTransactionStruct,
  DiscoverResponse,
  WalletProvider,
  SignatureProvider,
  PushTransactionArgs,
  DiscoveryOptions,
  AlgoSignerWalletProviderOptions,
  TxnObject,
} from './types';
// NOTE: @msgpack/msgpack/dist is required due to packaging error in msgpack that causes build errors (for mjs files) in other projects 
// See: https://github.com/msgpack/msgpack-javascript/issues/169
import * as msgpack from '@msgpack/msgpack/dist';
import { Buffer } from 'buffer';

let _network: AlgoNetworkType = AlgoNetworkType.MainNet;
let _providedNetwork: AlgoNetworkType | undefined;
let _loggedInAccount: WalletAuth;

export function makeSignatureProvider(): SignatureProvider {
  return {
    /** Returns the list of public keys of all the accounts in current network. */
    async getAvailableKeys(): Promise<string[]> {
      if (_loggedInAccount) return [_loggedInAccount.publicKey];
      return (await discoverAccounts(_providedNetwork)).keys.map(
        account => account.key // AlgoSigner has only one key per account
      );
    },

    /** Signs a transaction using the private keys in AlgoSigner wallet. */
    async sign({
      serializedTransaction
    }: SignatureProviderArgs): Promise<PushTransactionArgs> {
      const txn = decodeUint8Array<TxnObject>(serializedTransaction);

      // Remove fields not needed for chain transaction (AlgoSigner throws if any are present)
      FIELDS_TO_REMOVE_FROM_TXN.map(field => delete txn[field]);

      const res = await AlgoSigner.sign(txn);

      // This is how algosigner decodes base64 string

      const t = atob(res.blob)
        .split('')
        .map(c => c.charCodeAt(0));

      let arr = new Uint8Array(t);

      const signedTransaction: AlgorandRawTransactionStruct = msgpack.decode(
        arr
      ) as AlgorandRawTransactionStruct;

      const respone: PushTransactionArgs = {
        signatures: [Buffer.from(signedTransaction.sig).toString('hex')],
        serializedTransaction: encodeToUint8Array({
          txn: signedTransaction.txn
        })
      };

      return respone;
    }
  };
}

export function algosignerWalletProvider(
  args: AlgoSignerWalletProviderOptions
) {
  // if network is provided in the constructor, docover should return accounts of this specific network.
  // otherwise discover returns accounts for all networks;
  const {
    id = 'algosigner',
    name = 'Algorand AlgoSigner Web Wallet',
    shortName = 'AlgoSigner',
    description = 'Use AlgoSigner Web Wallet to sign your Algorand transactions',
    errorTimeout,
    network
  } = args || {};

  _providedNetwork = network;
  if (network) _network = network;

  return function makeWalletProvider(network: NetworkConfig): WalletProvider {
    /** Verifies that the AlgoSigner plugin exists and password has been entered.  */
    function connect(appName: string): Promise<boolean> {
      return new Promise(async (resolve, reject) => {
        AlgoSigner.connect().then(val => {
          if (val) {
            resolve(true);
          } else {
            reject('AlgoSigner: Connect Error');
          }
        });

        setTimeout(() => {
          reject(`Cannot connect to "${shortName}" wallet provider`);
        }, errorTimeout || 2500);
      });
    }

    /** AlgoSigner doesn't store connection state hence no action required. */
    function disconnect(): Promise<boolean> {
      return Promise.resolve(true);
    }

    /** Returns all accounts in a wallet. If network is provided in the constructor then it only returns accounts for that network.  */
    async function discover(
      discoveryOptions: DiscoveryOptions
    ): Promise<DiscoverResponse> {
      // _discoveryOptions: Remove underscroe from _discoveryOptions when it is actually used.
      // it added for now to get away with un-used variable warning.
      return await discoverAccounts(_providedNetwork);
    }

    // Authentication

    function login(
      accountName?: string,
      authorization: string = ALGOSIGNER_DEFAULT_PERMISSION
    ): Promise<WalletAuth> {
      return new Promise<WalletAuth>(async (resolve, reject) => {
        if (!accountName) {
          throw new Error(
            'AlgoSigner does not support a way for the user to select an account to login. Provide an accountName when calling login().'
          );
        }

        let networks: AlgoNetworkType[];
        if (_network) networks = [_network];
        else
          networks = ALL_ALGORAND_NETWORKS

        for (let net of networks) {
          let accounts = await AlgoSigner.accounts({ ledger: net });

          let matchingAccout = accounts.find(
            account => account.address === accountName
          );

          if (matchingAccout) {
            const loggedInAccount = getWalletAuthForAccount(matchingAccout);
            _loggedInAccount = loggedInAccount;
            return resolve({
              permission: authorization,
              accountName: loggedInAccount.accountName,
              publicKey: loggedInAccount.publicKey
            });
          }
        }

        throw new Error(
          `Cannot find account with provided address '${accountName}'.`
        );
      });
    }

    /** AlgoSigner doesn't store login state hence no action required. */
    function logout(accountName?: string): Promise<boolean> {
      return Promise.resolve(true);
    }

    /** Algosigner doesnt expose an API to sign arbitrary string. */
    function signArbitrary(data: string, userMessage: string): Promise<string> {
      return new Promise((resolve, reject) => {
        reject('not implemented');
      });
    }

    const walletProvider: WalletProvider = {
      id,
      meta: {
        name,
        shortName,
        description
      },
      signatureProvider: makeSignatureProvider(),
      connect,
      discover,
      disconnect,
      login,
      logout,
      signArbitrary
    };

    return walletProvider;
  };
}

export default algosignerWalletProvider;
