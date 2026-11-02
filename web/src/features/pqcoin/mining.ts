export const minerSource = 'https://github.com/juliancoy/QCash/tree/main/miners'
export const validRewardAddress = (address: string) => address.length === 64 && /^[0-9a-f]{64}$/.test(address) && address !== '0'.repeat(64)
export function conventionalMiningCommand(address: string): string {
  if (!validRewardAddress(address)) throw new Error('Enter a nonzero 64-character lowercase hexadecimal reward address.')
  return `./build/qcash node node-home 127.0.0.1:29600 --mine-to ${address} --mine-interval 5`
}
export const miningBuildCommands = `git clone https://github.com/juliancoy/QCash.git
cd QCash
./tools/bootstrap-openssl.sh
cmake --preset local
cmake --build --preset local --parallel 2
ctest --preset local
./build/qcash init node-home artifacts/devnet-genesis/genesis.bin`
