/** Synthetic public test wallets only. Never use these deterministic keys for funds. */
import { mkdir, writeFile } from 'node:fs/promises'
import { exportWallet, signTransfer, walletFromSeed, lockWallet } from '../src/features/pqcoin/wallet'
const [chain,directory]=process.argv.slice(2)
if(!chain || !directory)throw new Error('usage: pqcoin-fixture.ts CHAIN_ID OUTPUT_DIRECTORY')
const alice=walletFromSeed(new Uint8Array(32).fill(1)),bob=walletFromSeed(new Uint8Array(32).fill(2))
const password='synthetic-test-backup-password'
await mkdir(directory,{recursive:true,mode:0o700})
const signed=signTransfer(alice,chain,bob.address,'25','1','0')
await writeFile(directory+'/transfer.bin',Buffer.from(signed.signedTransfer,'hex'),{mode:0o600})
await writeFile(directory+'/overspend.bin',Buffer.from(signTransfer(alice,chain,bob.address,'100000','0','0').signedTransfer,'hex'),{mode:0o600})
await writeFile(directory+'/alice-backup.json',await exportWallet(alice,password),{mode:0o600})
await writeFile(directory+'/bob-backup.json',await exportWallet(bob,password),{mode:0o600})
await writeFile(directory+'/fixture.json',JSON.stringify({alice:alice.address,bob:bob.address,password,transaction:signed.id}),{mode:0o600})
lockWallet(alice);lockWallet(bob)
