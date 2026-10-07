/** Public monetary records only. Account balances and contextual disclosures
 * are excluded. A named agency contribution is deployed by that agency, but
 * is allocated out of the investor-group amount when included in a round. */
export async function organizationFunding(db: D1Database, organizationId: string) {
  const result = await db.prepare(`WITH monetary AS (
    SELECT m.*, e.included_in_event_id, r.id AS recipient_key
    FROM master_transaction_records m
    LEFT JOIN financing_events e ON m.record_type = 'company_financing' AND m.record_id = e.id
    LEFT JOIN financing_recipients r ON r.id = e.recipient_id
    WHERE (m.record_type = 'organization_support' AND m.transaction_type = 'transfer'
      AND m.status IN ('reported', 'delivered')
      AND (m.financial_fact_type IS NULL OR m.financial_fact_type IN ('reported_award','obligation','disbursement'))
      AND (m.financial_fact_type IS NULL OR EXISTS(SELECT 1 FROM current_funding_facts f
        WHERE f.support_record_id=m.record_id AND f.included_in_fact_id IS NULL)))
      OR (m.record_type = 'company_financing' AND m.transaction_type IN ('agency', 'equity', 'debt', 'grant')
        AND m.amount_label != 'up-to')
  ), directions AS (
    SELECT 'deployed' AS direction, to_organization_id AS organizationId,
      COALESCE(to_organization_id, recipient_key, to_label, 'unknown-recipient') AS counterpartKey,
      COALESCE(to_label, 'Undisclosed recipient') AS name, to_organization_slug AS slug,
      currency, status, amount, amount_label, financial_fact_type, financial_measurement, fiscal_year FROM monetary WHERE from_organization_id = ?
    UNION ALL
    SELECT 'received', from_organization_id,
      COALESCE(from_organization_id, from_label, 'unknown-funder'),
      COALESCE(from_label, 'Undisclosed funder'), from_organization_slug,
      currency, status,
      CASE WHEN record_type = 'company_financing' AND transaction_type = 'equity'
        THEN MAX(0, amount - COALESCE((SELECT SUM(contribution.amount) FROM financing_events contribution
          WHERE contribution.included_in_event_id = m.record_id AND contribution.amount_qualifier != 'up-to'), 0))
        ELSE amount END AS amount, amount_label, financial_fact_type, financial_measurement, fiscal_year FROM monetary m WHERE to_organization_id = ?
  ) SELECT direction, organizationId, counterpartKey, name, slug, currency, status,
      COALESCE(financial_fact_type, 'unclassified') AS financialFactType,
      financial_measurement AS measurement, fiscal_year AS fiscalYear,
      SUM(amount) AS amount, COUNT(*) AS recordCount,
      SUM(CASE WHEN amount IS NULL THEN 1 ELSE 0 END) AS undisclosedCount,
      SUM(CASE WHEN amount_label = 'over' THEN 1 ELSE 0 END) AS lowerBoundCount
    FROM directions GROUP BY direction, counterpartKey, currency, status, financial_fact_type, financial_measurement, fiscal_year
    ORDER BY direction, currency, status, amount DESC, name, counterpartKey`)
    .bind(organizationId, organizationId).all<{
      direction: string; organizationId: string | null; counterpartKey: string;
      name: string; slug: string | null; currency: string | null; status: string;
      amount: number | null; recordCount: number; undisclosedCount: number; lowerBoundCount: number; financialFactType: string; measurement: string | null; fiscalYear: number | null;
    }>();
  const counterparties = result.results || [];
  const totals = new Map<string, { direction: string; currency: string | null; status: string; amount: number | null; recordCount: number; undisclosedCount: number; lowerBoundCount: number; financialFactType: string; measurement: string | null; fiscalYear: number | null }>();
  for (const row of counterparties) {
    const key = JSON.stringify([row.direction, row.currency, row.status, row.financialFactType, row.measurement, row.fiscalYear]);
    const total = totals.get(key) || { direction: row.direction, currency: row.currency, status: row.status, financialFactType: row.financialFactType, measurement: row.measurement, fiscalYear: row.fiscalYear, amount: null, recordCount: 0, undisclosedCount: 0, lowerBoundCount: 0 };
    if (row.amount !== null) total.amount = (total.amount || 0) + row.amount;
    total.recordCount += row.recordCount; total.undisclosedCount += row.undisclosedCount; total.lowerBoundCount += row.lowerBoundCount;
    totals.set(key, total);
  }
  return { source: 'master_transaction_records', entries: [...totals.values()], counterparties };
}
