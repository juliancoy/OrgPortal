import { readFile, writeFile } from 'node:fs/promises'
import { normalizeWorkbook, parseCsv } from '../src/features/ecosystem/ecosystem.js'
const registry = JSON.parse(await readFile(new URL('../src/features/ecosystem/ecosystem-registry.json', import.meta.url)))
const tabs = [['Sheet1', 0], ['Dashboard', 1734285020], ['Financing & Money Flows', 189237549], ['Funding Network', 1314487709]]
// Fixed source and tab IDs: never accept arbitrary URLs, ranges, or credentials from a client.
const sourceId = '1c8E2t8-PgNsBwXoUTPFeMO5vDCCbMrpNp0V45IBoLqs'
const source = process.argv[2]
const workbook = source ? JSON.parse(await readFile(source)) : Object.fromEntries(await Promise.all(tabs.map(async ([name, gid]) => {
  const response = await fetch(`https://docs.google.com/spreadsheets/d/${sourceId}/export?format=csv&gid=${gid}`, { signal: AbortSignal.timeout(30000) })
  if (!response.ok) throw new Error(`Sheet read failed: ${name} (${response.status})`)
  const text = await response.text()
  if (text.trimStart().startsWith('<')) throw new Error(`Non-CSV response: ${name}`)
  return [name, parseCsv(text)]
})))
const expectedHeaders = { 'Sheet1': ['Point of Contact', 'Email', 'Website'], 'Dashboard': ['Organization', 'Proximity Score', 'Category'], 'Financing & Money Flows': ['Recipient / Vehicle', 'Funder / Source', 'Amount'], 'Funding Network': ['Source / Funder', 'Target / Recipient', 'Amount'] }
for (const [name, expected] of Object.entries(expectedHeaders)) {
  if (!workbook[name]?.some(row => expected.every((value, index) => row[index + (name === 'Sheet1' ? 1 : 0)] === value))) throw new Error(`Unexpected headers: ${name}`)
}
const data = normalizeWorkbook(workbook, registry, new Date().toISOString())
await writeFile(new URL('../public/ecosystem-data/ecosystem.json', import.meta.url), JSON.stringify(data, null, 2) + '\n')
console.log(`Sanitized ${data.organizations.length} organizations, ${data.relationships.length} relationships, ${data.financing.length} financing records`)
