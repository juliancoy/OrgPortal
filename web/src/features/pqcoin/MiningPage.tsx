import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { pqcoinFetch, type Network } from './api'
import { conventionalMiningCommand, minerSource, miningBuildCommands, validRewardAddress } from './mining'

const codeStyle = { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } as const
export function MiningPage() {
  const [network, setNetwork] = useState<Network | null>(null)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(true)
  const [refresh, setRefresh] = useState(0)
  const [address, setAddress] = useState('')
  const [copied, setCopied] = useState('')
  useEffect(() => {
    let active = true
    setChecking(true); setError(''); setNetwork(null)
    void pqcoinFetch<Network>('/network').then(value => {
      if (value.currency !== 'QCash' || !value.experimental || !/^[0-9a-f]{64}$/.test(value.chainId)) throw new Error('Unsupported mining network.')
      if (active) setNetwork(value)
    }).catch(() => { if (active) setError('The portal testnet is unavailable. Local mining instructions and source remain available.') })
      .finally(() => { if (active) setChecking(false) })
    return () => { active = false }
  }, [refresh])
  const valid = validRewardAddress(address)
  const command = valid ? conventionalMiningCommand(address) : ''
  async function copy() {
    if (!valid) return
    try { await navigator.clipboard.writeText(command); setCopied('Mining command copied. Run it locally when you are ready.') }
    catch { setCopied('Clipboard unavailable. Select and copy the displayed command.') }
  }
  return <main className="portal-section" style={{ maxWidth: 960, marginInline: 'auto' }}>
    <p><Link to="/finance">Finance</Link> / QCash</p>
    <h1>QCash Mining</h1>
    <p>Run your own validating node and mine to your public wallet address. Mining requires no OrgPortal account.</p>
    <p><strong>Experimental testnet.</strong> Test coins have no stated monetary value. Accepted blocks can be reorganized and rewards must mature.</p>
    <section className="portal-card" aria-labelledby="mining-network-heading">
      <h2 id="mining-network-heading">Network and connectivity</h2>
      <div aria-live="polite">
        {checking ? <p>Checking portal testnet…</p> : error ? <p role="status">{error}</p> : network && <>
          <p>{network.name} · Last checked height {network.height}</p>
          <p style={{ overflowWrap: 'anywhere' }}>Chain ID: <code>{network.chainId}</code></p>
        </>}
      </div>
      <p><strong>Public miner connection unavailable.</strong> The hosted testnet currently publishes a wallet HTTPS adapter, not a native mining peer. Use your own local node or an explicitly operated private peer. These instructions do not attach your machine to the hosted chain.</p>
      <button type="button" disabled={checking} onClick={() => setRefresh(value => value + 1)}>Refresh network</button>
    </section>
    <section className="portal-card" style={{ marginTop: 16 }} aria-labelledby="conventional-miner-heading">
      <h2 id="conventional-miner-heading">Conventional machines</h2>
      <p>The runnable reference implementation uses a Linux CPU. Source and a bounded solo-mining controller are available for review and local execution.</p>
      <p><a href={minerSource} target="_blank" rel="noreferrer">Miner source and setup guide</a> · <a href="https://github.com/juliancoy/QCash" target="_blank" rel="noreferrer">QCash repository</a></p>
      <h3>1. Build and initialize your local node</h3>
      <pre style={codeStyle}><code>{miningBuildCommands}</code></pre>
      <p>Initialization refuses an existing node directory. Verify the reported chain ID against the network you intend to join.</p>
      <h3>2. Choose where rewards go</h3>
      <div className="portal-form"><label>Public QCash reward address<input value={address} maxLength={64} autoComplete="off" spellCheck={false} aria-describedby="mining-address-help" aria-invalid={address.length > 0 && !valid} onChange={event => { setAddress(event.target.value.trim()); setCopied('') }} /></label></div>
      <p id="mining-address-help">Use the 64-character lowercase hexadecimal address from <Link to="/receive?currency=QCash">Receive QCash</Link>. Keep wallet seeds and private keys on your machine; never paste them here.</p>
      {address && !valid && <p role="alert">Enter a nonzero 64-character lowercase hexadecimal reward address.</p>}
      <h3>3. Start explicitly on your machine</h3>
      {command ? <pre style={codeStyle}><code>{command}</code></pre> : <p>Enter your public reward address to generate a mining command.</p>}
      <button type="button" disabled={!valid} onClick={() => { void copy() }}>Copy mining command</button>
      <p aria-live="polite">{copied}</p>
      <p>This command starts a local node and CPU miner. Ctrl-C stops it. For explicit time and hash-attempt budgets, use <code>miners/cpu_worker.py</code> with a separately running node as described in the guide. Mining does not start in this browser.</p>
    </section>
    <section className="portal-card" style={{ marginTop: 16 }} aria-labelledby="quantum-miner-heading">
      <h2 id="quantum-miner-heading">Quantum machines and custom accelerators</h2>
      <p><strong>Local QPU simulator available.</strong> Run small Grover circuits on your CPU with Qiskit Aer, then verify measured candidate nonces with the native miner. The simulator builds its oracle from classically precomputed SHA3 results and counts that work explicitly. It does not demonstrate a quantum mining speedup.</p>
      <h3>Set up the optional simulator</h3>
      <pre style={codeStyle}><code>{`python3 -m venv .deps/quantum-venv
.deps/quantum-venv/bin/python -m pip install -r miners/requirements-simulator.txt
.deps/quantum-venv/bin/python miners/quantum_simulator.py --help`}</code></pre>
      <p>Use Python 3.12 and the pinned dependencies in a local QCash checkout. The guide includes the opt-in <code>--backend qpu-simulator</code> controller, offline work-file commands and reproducible tests. Simulation is capped at 12 search qubits, with shot, iteration and time budgets. It does not start in this browser.</p>
      <p><a href={`${minerSource}#local-qpu-simulation`} target="_blank" rel="noreferrer">Run the local simulator</a></p>
      <p>The source includes <code>work</code>, <code>inspect-work</code>, <code>solve</code>, <code>complete-work</code> and <code>submit</code> commands. A custom backend can replace the nonce search while keeping reward selection, serialization and proof verification consistent.</p>
      <p>The separate reversible SHA3 reference computes the full hash and target comparison, and tests clean inverse execution on classical basis states. That large reference circuit is not run as a full quantum statevector. Physical QPU mining still requires a provider integration and hardware validation; no quantum-hardware mining run is claimed.</p>
      <p><a href={`${minerSource}#attach-another-conventional-or-quantum-implementation`} target="_blank" rel="noreferrer">Read the backend contract</a> · <a href="https://quantum.cloud.ibm.com/docs/en/tutorials/grovers-algorithm" target="_blank" rel="noreferrer">IBM Quantum: Grover’s algorithm</a></p>
    </section>
    <p><Link to="/send?currency=QCash">Send QCash</Link> · <Link to="/receive?currency=QCash">Receive QCash</Link></p>
  </main>
}
