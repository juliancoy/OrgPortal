export const strategyDashboardMarkup = `
  <header class="strategy-dashboard-heading">
    <div>
      <p class="eyebrow">MedTech decision board</p>
      <h2 id="strategy-dashboard-title">Measure labor, need, capital, and leverage.</h2>
    </div>
    <div class="strategy-dashboard-intro">
      <p>
        These signals help Baltimore MedTech choose where convening, applications, labor development, and implementation
        work can create the most value. They are decision inputs—not a ranking of human need.
      </p>
      <span id="strategy-as-of" class="strategy-as-of"></span>
    </div>
  </header>

  <div id="strategy-signal-strip" class="strategy-signal-strip" aria-label="Headline strategic signals"></div>
  <div id="strategy-field-cards" class="strategy-field-cards" aria-label="Field metrics"></div>

  <div class="strategy-comparability" role="note">
    <span aria-hidden="true">!</span>
    <div>
      <strong>Read across dimensions, not as one league table.</strong>
      <p id="strategy-comparability-note"></p>
    </div>
  </div>

  <div class="strategy-chart-grid">
    <article class="strategy-chart-card">
      <header><div><p class="strategy-chart-kicker">Labor capacity</p><h3>Physician workforce proxy</h3></div><span class="strategy-chart-unit">people</span></header>
      <p class="strategy-chart-deck">A 2021 active-physician snapshot for neurology, oncology, and radiology; genomics uses a 2022 board-certified specialist proxy because the categories are not published on one common basis.</p>
      <div id="strategy-workforce-chart" class="strategy-chart" aria-live="polite"></div>
      <div id="strategy-workforce-table" class="strategy-table-wrap"></div>
    </article>

    <article class="strategy-chart-card">
      <header><div><p class="strategy-chart-kicker">Entry pipeline</p><h3>New physician entrants</h3></div><span class="strategy-chart-unit">per year</span></header>
      <p class="strategy-chart-deck">HRSA-modeled entrants for three specialties; genomics shows observed 2025 ABMGG diplomates. Treat the contrast as a capacity signal, not a perfectly harmonized rate.</p>
      <div id="strategy-pipeline-chart" class="strategy-chart" aria-live="polite"></div>
      <div id="strategy-pipeline-table" class="strategy-table-wrap"></div>
    </article>

    <article class="strategy-chart-card strategy-chart-card-wide">
      <header><div><p class="strategy-chart-kicker">Research capital</p><h3>Lead NIH institute appropriations</h3></div><span class="strategy-chart-unit">FY2022–FY2024 · USD</span></header>
      <p class="strategy-chart-deck">NINDS, NCI, NIBIB, and NHGRI are comparable federal budget proxies, but they do not represent all money flowing into their associated fields and should not be added as mutually exclusive categories.</p>
      <div id="strategy-funding-chart" class="strategy-chart strategy-chart-line" aria-live="polite"></div>
      <div id="strategy-funding-legend" class="strategy-chart-legend"></div>
      <div id="strategy-funding-table" class="strategy-table-wrap"></div>
    </article>

    <article class="strategy-chart-card">
      <header><div><p class="strategy-chart-kicker">Population or demand</p><h3>Field-specific need proxies</h3></div><span class="strategy-chart-unit">millions of people</span></header>
      <p class="strategy-chart-deck">Prevalence, marker-condition burden, and annual utilization are intentionally labeled separately. Radiology is service demand, not disease prevalence.</p>
      <div id="strategy-need-chart" class="strategy-chart" aria-live="polite"></div>
      <div id="strategy-need-table" class="strategy-table-wrap"></div>
    </article>

    <article class="strategy-chart-card strategy-radar-card">
      <header><div><p class="strategy-chart-kicker">Spider / radar view</p><h3>Directional opportunity profile</h3></div><span class="strategy-chart-unit">0–100 signals</span></header>
      <p class="strategy-chart-deck">Compare problem scale, labor scarcity, funding, pipeline, and software/data leverage. Select a field to isolate it.</p>
      <div id="strategy-radar-chart" class="strategy-chart strategy-chart-radar" aria-live="polite"></div>
      <div id="strategy-radar-legend" class="strategy-radar-legend" role="group" aria-label="Focus radar field"></div>
      <p id="strategy-radar-note" class="strategy-method-note"></p>
    </article>

    <article class="strategy-chart-card strategy-local-card">
      <header><div><p class="strategy-chart-kicker">Baltimore platform</p><h3>NIH-funded anchor institutions</h3></div><span class="strategy-chart-unit">FY2024 · USD</span></header>
      <div class="strategy-local-total"><strong id="strategy-local-total"></strong><span id="strategy-local-awards"></span></div>
      <p class="strategy-chart-deck">A two-institution subtotal that demonstrates implementation and partnership capacity—not a ranking and not the whole regional ecosystem.</p>
      <div id="strategy-local-chart" class="strategy-chart" aria-live="polite"></div>
      <div id="strategy-local-table" class="strategy-table-wrap"></div>
    </article>
  </div>

  <section class="strategy-guidance" aria-labelledby="strategy-guidance-title">
    <header><p class="eyebrow">Decision guidance</p><h3 id="strategy-guidance-title">What Baltimore MedTech should do with these signals.</h3></header>
    <div id="strategy-guidance-grid" class="strategy-guidance-grid"></div>
  </section>

  <details class="strategy-methodology">
    <summary>Methodology, definitions, and source register</summary>
    <div class="strategy-methodology-grid">
      <div>
        <h3>How to read the dashboard</h3>
        <p id="strategy-methodology-comparability"></p>
        <p id="strategy-methodology-radar"></p>
        <p id="strategy-methodology-review"></p>
      </div>
      <div><h3>Source register</h3><div id="strategy-source-register" class="strategy-source-register"></div></div>
    </div>
  </details>

  <div id="strategy-status" class="status">Loading strategy signals…</div>
`
