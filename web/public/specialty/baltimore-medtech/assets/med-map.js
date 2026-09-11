import { MEDICAL_EVENTS_SOURCE_URL, eventCoordinates, isMedicalEvent, parseEventDate } from './medical-events.js'

const ARCGIS_QUERY_DEFAULTS = {
  f: 'geojson',
  outFields: '*',
  outSR: '4326',
  returnGeometry: 'true',
}

const SIZE_MODES = new Set(['volume', 'uniform'])
const MOBILE_INSPECTOR_MEDIA = '(max-width: 760px), (hover: none) and (pointer: coarse)'
const COMPRESSED_STATE_QUERY_PARAM = 's'
const COMPACT_STATE_QUERY_PARAM = 'compact'

const REGIONS = {
  'baltimore-city': {
    label: 'Baltimore City',
    center: [-76.6122, 39.2904],
    zoom: 11,
    bbox: [-76.735, 39.19, -76.52, 39.38],
    state: 'MD',
    marylandCountyWhere: "County IN ('BALTIMORE CITY','BALTIMORE COUNTY')",
    hifldWhere: "STATE = 'MD' AND (COUNTY = 'BALTIMORE CITY' OR COUNTY = 'BALTIMORE')",
    enviroscreenWhere: "COUNTYFP20 IN ('510','005')",
    baltimoreOnly: true,
  },
  maryland: {
    label: 'Maryland',
    center: [-76.6413, 39.0458],
    zoom: 7,
    bbox: [-79.55, 37.82, -74.95, 39.85],
    state: 'MD',
    marylandCountyWhere: '1=1',
    hifldWhere: "STATE = 'MD'",
    enviroscreenWhere: '1=1',
  },
  state: {
    label: 'Selected U.S. state',
    center: [-98.5795, 39.8283],
    zoom: 3.7,
    bbox: [-125, 24, -66.5, 49.5],
    nationalOnly: true,
  },
  us: {
    label: 'United States',
    center: [-98.5795, 39.8283],
    zoom: 3.4,
    bbox: [-178, 18, -64, 72],
    nationalOnly: true,
    hifldWhere: '1=1',
  },
  worldwide: {
    label: 'Worldwide view',
    center: [-30, 20],
    zoom: 1.5,
    bbox: [-180, -85, 180, 85],
    nationalOnly: true,
    hifldWhere: '1=1',
  },
}

const US_STATES = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'],
  ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'], ['DC', 'District of Columbia'],
  ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'], ['ID', 'Idaho'], ['IL', 'Illinois'],
  ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'],
  ['ME', 'Maine'], ['MD', 'Maryland'], ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'],
  ['MS', 'Mississippi'], ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'],
  ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'], ['NY', 'New York'],
  ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'],
  ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'],
  ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'],
  ['VA', 'Virginia'], ['WA', 'Washington'], ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
]

const STATE_VIEW = {
  AL: [-86.8, 32.8, 6.5], AK: [-150, 64, 3], AZ: [-111.7, 34.2, 6], AR: [-92.4, 35.1, 6.5],
  CA: [-119.4, 37.2, 5.2], CO: [-105.5, 39, 6], CT: [-72.7, 41.6, 8], DE: [-75.5, 39, 8],
  DC: [-77.04, 38.9, 10], FL: [-82.4, 28.2, 5.7], GA: [-83.4, 32.7, 6.3], HI: [-157.5, 20.7, 6],
  ID: [-114.4, 44.2, 5.7], IL: [-89.4, 40, 6], IN: [-86.1, 40, 6.5], IA: [-93.5, 42, 6.5],
  KS: [-98.2, 38.5, 6.3], KY: [-85.3, 37.7, 6.5], LA: [-91.9, 30.9, 6.4], ME: [-69.1, 45.2, 6],
  MD: [-76.7, 39, 7.2], MA: [-71.8, 42.1, 7.3], MI: [-85.6, 44.4, 5.6], MN: [-94.6, 46.1, 5.5],
  MS: [-89.7, 32.7, 6.5], MO: [-92.6, 38.5, 6.2], MT: [-110, 46.9, 5.3], NE: [-99.8, 41.5, 6.2],
  NV: [-116.6, 39.2, 5.5], NH: [-71.6, 43.7, 7], NJ: [-74.5, 40.1, 7.3], NM: [-106.1, 34.4, 6],
  NY: [-75, 42.9, 6], NC: [-79.3, 35.5, 6.3], ND: [-100.5, 47.5, 6], OH: [-82.8, 40.3, 6.4],
  OK: [-97.5, 35.5, 6.3], OR: [-120.6, 44, 5.7], PA: [-77.8, 41, 6.4], RI: [-71.5, 41.7, 8.4],
  SC: [-80.9, 33.8, 6.7], SD: [-100, 44.4, 6], TN: [-86.4, 35.8, 6.5], TX: [-99.3, 31, 5.2],
  UT: [-111.7, 39.3, 5.8], VT: [-72.7, 44, 7], VA: [-78.5, 37.6, 6.4], WA: [-120.7, 47.4, 5.8],
  WV: [-80.6, 38.6, 6.8], WI: [-89.8, 44.6, 6], WY: [-107.6, 43, 6],
}

const LAYERS = [
  {
    id: 'medical-events',
    label: 'Upcoming medical events',
    summary: 'Geocoded events from the Baltimore medical events calendar',
    kind: 'point',
    color: '#e11d48',
    defaultVisible: true,
    coverage: 'maryland',
    loadGeojson: fetchMedicalEventsGeojson,
    sourceUrl: 'https://codecollective.us/calendar.html?city=baltimore&lm=individual_tags&lt=health.science',
    sourceName: 'Code Collective Baltimore medical events calendar',
    title: (p) => p.name,
    details: (p) => [
      ['Starts', formatEventDateTime(p.startDate)],
      ['Venue', p.locationName],
      ['Address', p.locationAddress],
      ['Organizer', p.organizer],
      ['Tags', p.tags],
      ['Description', p.description],
      ['Event', p.eventUrl],
    ],
  },
  {
    id: 'us-hospitals',
    label: 'All hospitals',
    summary: 'HIFLD U.S. hospitals, status, beds, trauma, helipad',
    kind: 'point',
    color: '#cf4f3f',
    defaultVisible: true,
    coverage: 'national',
    service: 'https://services2.arcgis.com/RQcpPaCpMAXzUI5g/arcgis/rest/services/US_Hospitals/FeatureServer/0',
    sourceUrl: 'https://www.arcgis.com/home/item.html?id=283286c21e8447dbb3a58b1b6952a748',
    sourceName: 'HIFLD / ArcGIS Online US_Hospitals',
    fields: ['NAME', 'TYPE', 'STATUS', 'BEDS', 'TRAUMA', 'OWNER', 'ADDRESS', 'CITY', 'STATE', 'COUNTY', 'WEBSITE', 'SOURCE'],
    volumeFields: ['BEDS'],
    volumeLabel: 'Beds',
    title: (p) => p.NAME,
    details: (p) => [
      ['Type', p.TYPE],
      ['Status', p.STATUS],
      ['Beds', p.BEDS > 0 ? p.BEDS : null],
      ['Trauma', p.TRAUMA],
      ['Owner', p.OWNER],
      ['Address', [p.ADDRESS, p.CITY, p.STATE].filter(Boolean).join(', ')],
    ],
  },
  {
    id: 'md-hospitals',
    label: 'Maryland licensed hospitals',
    summary: 'MD iMAP acute, general, special, psychiatric, and related hospitals',
    kind: 'point',
    color: '#0f6f8f',
    defaultVisible: true,
    coverage: 'maryland',
    service: 'https://mdgeodata.md.gov/imap/rest/services/Health/MD_Hospitals/FeatureServer/0',
    sourceUrl: 'https://mdgeodata.md.gov/imap/rest/services/Health/MD_Hospitals/FeatureServer/0',
    sourceName: 'MD iMAP, DHMH OHCQ',
    fields: ['Facility_Name', 'Type', 'License_Capacity', 'Facility_Address', 'Facility_City', 'County', 'Facility_Phone', 'License_Info'],
    volumeFields: ['License_Capacity'],
    volumeLabel: 'Licensed capacity',
    title: (p) => p.Facility_Name,
    details: (p) => [
      ['Type', p.Type],
      ['Licensed capacity', p.License_Capacity],
      ['County', p.County],
      ['Address', [p.Facility_Address, p.Facility_City].filter(Boolean).join(', ')],
      ['Phone', p.Facility_Phone],
      ['License', p.License_Info],
    ],
  },
  {
    id: 'long-term-care',
    label: 'Care facilities',
    summary: 'Assisted living, dialysis, hospice, long-term and rehab care',
    kind: 'point',
    color: '#18a79d',
    defaultVisible: true,
    coverage: 'maryland',
    services: [1, 3, 5, 6, 9].map((id) => ({
      url: `https://mdgeodata.md.gov/imap/rest/services/Health/MD_LongTermCareAssistedLiving/FeatureServer/${id}`,
      label: ['Assisted Living', 'Dialysis', 'Hospice', 'Long Term Care', 'Rehabilitation Hospitals'][[1, 3, 5, 6, 9].indexOf(id)],
    })),
    sourceUrl: 'https://mdgeodata.md.gov/imap/rest/services/Health/MD_LongTermCareAssistedLiving/FeatureServer',
    sourceName: 'MD iMAP, Maryland Department of Health',
    fields: ['Facility_Name', 'License_Capacity', 'Facility_Address', 'Facility_City', 'County', 'Facility_Phone'],
    volumeFields: ['License_Capacity'],
    volumeLabel: 'Licensed capacity',
    title: (p) => p.Facility_Name || p.Name || p.NAME,
    details: (p) => [
      ['Facility type', p.__subLayer || p.Type],
      ['Licensed capacity', p.License_Capacity],
      ['County', p.County],
      ['Address', [p.Facility_Address, p.Facility_City].filter(Boolean).join(', ')],
      ['Phone', p.Facility_Phone],
    ],
  },
  {
    id: 'health-grants',
    label: 'Community health grants',
    summary: 'CHRC primary care, health IT, dental, safety-net, behavioral health grantees',
    kind: 'point',
    color: '#d99a2b',
    defaultVisible: false,
    coverage: 'maryland',
    services: [0, 2, 3, 4, 6, 7].map((id) => ({
      url: `https://mdgeodata.md.gov/imap/rest/services/Health/MD_CommunityHealthResourceCommission/FeatureServer/${id}`,
      label: ['Behavioral Health', 'Dental Health', 'Emergency Department Diversion', 'Health Information Technology', 'Primary Care', 'Safety Net Capacity Building'][[0, 2, 3, 4, 6, 7].indexOf(id)],
    })),
    sourceUrl: 'https://mdgeodata.md.gov/imap/rest/services/Health/MD_CommunityHealthResourceCommission/FeatureServer',
    sourceName: 'Maryland Community Health Resource Commission',
    fields: ['Grantee_Name', 'Focus_Area', 'Description', 'Jurisdiction', 'Address', 'Website', 'Total_Grant_Award'],
    volumeFields: ['Total_Grant_Award'],
    volumeLabel: 'Grant award',
    title: (p) => p.Grantee_Name,
    details: (p) => [
      ['Focus area', p.Focus_Area || p.__subLayer],
      ['Jurisdiction', p.Jurisdiction],
      ['Award', money(p.Total_Grant_Award)],
      ['Address', p.Address],
      ['Description', p.Description],
    ],
  },
  {
    id: 'treatment-facilities',
    label: 'Treatment and recovery facilities',
    summary: 'Baltimore addiction treatment centers and sober living facilities',
    kind: 'point',
    color: '#8b5cf6',
    defaultVisible: false,
    coverage: 'baltimore',
    services: [
      { url: 'https://geodata.baltimorecity.gov/egis/rest/services/ResidentialTreatmentFacilities/ResidentialTreatmentFacilities/FeatureServer/4', label: 'Addiction Treatment Center' },
      { url: 'https://geodata.baltimorecity.gov/egis/rest/services/ResidentialTreatmentFacilities/ResidentialTreatmentFacilities/FeatureServer/5', label: 'Sober Living Facilities' },
    ],
    sourceUrl: 'https://geodata.baltimorecity.gov/egis/rest/services/ResidentialTreatmentFacilities/ResidentialTreatmentFacilities/FeatureServer',
    sourceName: 'Baltimore City EGIS',
    fields: ['USER_name1', 'USER_type_', 'USER_stree', 'USER_city', 'USER_phone', 'USER_websi'],
    title: (p) => p.USER_name1 || p.PlaceName || p.Match_addr,
    details: (p) => [
      ['Type', p.__subLayer || p.USER_type_],
      ['Address', [p.USER_stree, p.USER_city].filter(Boolean).join(', ') || p.Match_addr],
      ['Phone', p.USER_phone],
      ['Website', p.USER_websi],
    ],
  },
  {
    id: 'dhcd-healthy-homes',
    label: 'DHCD healthy homes referrals',
    summary: 'Baltimore Healthy Homes/HHP referral status points',
    kind: 'point',
    color: '#00a7e1',
    defaultVisible: true,
    coverage: 'baltimore',
    service: 'https://geodata.baltimorecity.gov/egis/rest/services/Housing/BLP_PM_HHP/MapServer/0',
    sourceUrl: 'https://geodata.baltimorecity.gov/egis/rest/services/Housing/BLP_PM_HHP/MapServer/0',
    sourceName: 'Baltimore City DHCD / EGIS',
    fields: ['address', 'status', 'blocklot'],
    title: (p) => p.address || p.blocklot,
    details: (p) => [['Status', p.status], ['Block/lot', p.blocklot], ['Address', p.address]],
  },
  {
    id: 'dhcd-lead',
    label: 'DHCD lead grant properties',
    summary: 'Lead hazard reduction grant property polygons and housing-health attributes',
    kind: 'polygon',
    color: '#f97316',
    defaultVisible: false,
    coverage: 'baltimore',
    service: 'https://geodata.baltimorecity.gov/egis/rest/services/Housing/LeadGrantDataCollection/FeatureServer/0',
    sourceUrl: 'https://geodata.baltimorecity.gov/egis/rest/services/Housing/LeadGrantDataCollection/FeatureServer/0',
    sourceName: 'Baltimore City DHCD / EGIS',
    fields: ['FULLADDR', 'NEIGHBOR', 'Received_Services', 'What_Kind_Services', 'Paint_Deteriorated', 'HVAC_Plumbing_NeedRepair', 'Remediation_Complete'],
    title: (p) => p.FULLADDR,
    details: (p) => [
      ['Neighborhood', p.NEIGHBOR],
      ['Received services', p.Received_Services],
      ['Services', p.What_Kind_Services],
      ['Paint deteriorated', p.Paint_Deteriorated],
      ['HVAC/plumbing repair', p.HVAC_Plumbing_NeedRepair],
      ['Remediation complete', p.Remediation_Complete],
    ],
  },
  {
    id: 'dhcd-work-orders',
    label: 'DHCD CHIP work orders',
    summary: 'Baltimore housing work orders tied to healthy-housing context',
    kind: 'point',
    color: '#64748b',
    defaultVisible: false,
    coverage: 'baltimore',
    service: 'https://geodata.baltimorecity.gov/egis/rest/services/Housing/CHIP_WO_ALL/FeatureServer/0',
    sourceUrl: 'https://geodata.baltimorecity.gov/egis/rest/services/Housing/CHIP_WO_ALL/FeatureServer/0',
    sourceName: 'Baltimore City DHCD / EGIS',
    fields: ['Status', 'WorkOrderType', 'CleanType', 'Priority', 'Neighborhood', 'HouseNum', 'Direction', 'StreetName', 'StreetAttr', 'DateCreate', 'DateFinish'],
    limit: 700,
    title: (p) => [p.HouseNum, p.Direction, p.StreetName, p.StreetAttr].filter(Boolean).join(' ') || p.WorkOrderType,
    details: (p) => [
      ['Status', p.Status],
      ['Work order', p.WorkOrderType],
      ['Clean type', p.CleanType],
      ['Priority', p.Priority],
      ['Neighborhood', p.Neighborhood],
      ['Created', formatDate(p.DateCreate)],
      ['Finished', formatDate(p.DateFinish)],
    ],
  },
  {
    id: 'enviro-asthma',
    label: 'Asthma and respiratory burden',
    summary: 'MDEnviroScreen asthma, respiratory hazard, lead-paint, PM2.5, ozone, diesel PM',
    kind: 'polygon',
    color: '#7c2d12',
    defaultVisible: true,
    coverage: 'maryland',
    service: 'https://mdgeodata.md.gov/imap/rest/services/Environment/MD_EnviroScreen/FeatureServer/0',
    sourceUrl: 'https://mdgeodata.md.gov/imap/rest/services/Environment/MD_EnviroScreen/FeatureServer/0',
    sourceName: 'MD iMAP / MDE MDEnviroScreen',
    fields: ['GEOID20', 'COUNTYFP20', 'P_EJ', 'P_Asthma', 'P_RESP', 'P_PRE1960PCT', 'P_PM25', 'P_OZONE', 'P_DSLPM', 'S_ASTHMA', 'S_RESP', 'S_LDPNT'],
    title: (p) => `Census tract ${p.GEOID20 || 'unknown'}`,
    details: (p) => [
      ['EJ percentile', pct(p.P_EJ)],
      ['Asthma percentile', pct(p.P_Asthma)],
      ['Respiratory hazard percentile', pct(p.P_RESP)],
      ['Lead paint percentile', pct(p.P_PRE1960PCT)],
      ['PM2.5 percentile', pct(p.P_PM25)],
      ['Ozone percentile', pct(p.P_OZONE)],
      ['Diesel PM percentile', pct(p.P_DSLPM)],
    ],
    valueField: 'P_Asthma',
  },
  {
    id: 'climate-vulnerability',
    label: 'Climate vulnerability',
    summary: 'Climate exposure, tree canopy, flood/storm surge, heat, and community impact',
    kind: 'polygon',
    color: '#0891b2',
    defaultVisible: false,
    coverage: 'maryland',
    service: 'https://mdgeodata.md.gov/imap/rest/services/Environment/MD_Climate_Vulnerability_Score/FeatureServer/0',
    sourceUrl: 'https://mdgeodata.md.gov/imap/rest/services/Environment/MD_Climate_Vulnerability_Score/FeatureServer/0',
    sourceName: 'Maryland Department of the Environment',
    fields: ['GEOID20', 'COUNTYFP20', 'CVS_PCTL', 'CVS_RANK', 'CLIM_PCTL', 'COMM_PCTL', 'TCC', 'UHI', 'FLOOD_SS', 'P_EJ'],
    title: (p) => `Climate tract ${p.GEOID20 || 'unknown'}`,
    details: (p) => [
      ['Climate vulnerability score', pct(p.CVS_PCTL)],
      ['Rank', p.CVS_RANK],
      ['Climate exposure percentile', pct(p.CLIM_PCTL)],
      ['Community impact percentile', pct(p.COMM_PCTL)],
      ['Tree canopy cover', pct(p.TCC)],
      ['Urban heat island', p.UHI],
      ['Flood/storm surge', p.FLOOD_SS],
    ],
    valueField: 'CVS_PCTL',
  },
  {
    id: 'vital-mortality',
    label: 'All-cause mortality',
    summary: 'Maryland vital statistics all-cause mortality rate by county',
    kind: 'polygon',
    color: '#be123c',
    defaultVisible: false,
    coverage: 'maryland',
    service: 'https://mdgeodata.md.gov/imap/rest/services/Health/MD_VitalStatistics/FeatureServer/0',
    sourceUrl: 'https://mdgeodata.md.gov/imap/rest/services/Health/MD_VitalStatistics/FeatureServer/0',
    sourceName: 'MD iMAP / Maryland Vital Statistics',
    fields: ['COUNTY', 'AllCauseMort'],
    title: (p) => p.COUNTY,
    details: (p) => [['All-cause mortality rate', p.AllCauseMort]],
    valueField: 'AllCauseMort',
  },
]

let queryStateCompressionEnabled = false
let compressedPersistSequence = 0

function supportsCompressedQueryState() {
  return typeof CompressionStream === 'function' && typeof DecompressionStream === 'function'
}

function bytesToBase64Url(bytes) {
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function base64UrlToBytes(value) {
  const normalized = String(value || '').replaceAll('-', '+').replaceAll('_', '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0))
}

async function compressUiStateForQuery(uiState) {
  if (!supportsCompressedQueryState()) throw new Error('Compressed query state is not supported')
  const stream = new Blob([JSON.stringify(uiState)]).stream().pipeThrough(new CompressionStream('gzip'))
  return bytesToBase64Url(new Uint8Array(await new Response(stream).arrayBuffer()))
}

async function decompressUiStateFromQuery(value) {
  if (!supportsCompressedQueryState()) throw new Error('Compressed query state is not supported')
  const stream = new Blob([base64UrlToBytes(value)]).stream().pipeThrough(new DecompressionStream('gzip'))
  return JSON.parse(await new Response(stream).text())
}

function defaultUiState() {
  return {
    version: 1,
    region: 'baltimore-city',
    state: 'MD',
    size: 'volume',
    layers: LAYERS.filter((layer) => layer.defaultVisible).map((layer) => layer.id),
    order: defaultLayerOrder(),
    center: null,
    zoom: null,
    orientation: { bearing: 0, pitch: 0 },
  }
}

function normalizeLayerOrder(order) {
  const validIds = new Set(LAYERS.map((layer) => layer.id))
  const requested = Array.isArray(order) ? order : []
  const unique = requested.filter((id, index) => validIds.has(id) && requested.indexOf(id) === index)
  return [...unique, ...defaultLayerOrder().filter((id) => !unique.includes(id))]
}

function normalizeUiState(candidate) {
  const defaults = defaultUiState()
  const validLayerIds = new Set(LAYERS.map((layer) => layer.id))
  const region = Object.hasOwn(REGIONS, candidate?.region) ? candidate.region : defaults.region
  const stateCode = US_STATES.some(([code]) => code === candidate?.state) ? candidate.state : defaults.state
  const size = SIZE_MODES.has(candidate?.size) ? candidate.size : defaults.size
  const layers = Array.isArray(candidate?.layers)
    ? candidate.layers.filter((id, index, values) => validLayerIds.has(id) && values.indexOf(id) === index)
    : defaults.layers
  const center = Array.isArray(candidate?.center) && candidate.center.length === 2
    && candidate.center.every((value) => Number.isFinite(Number(value)))
    ? candidate.center.map(Number)
    : null
  const hasZoom = candidate?.zoom !== null && candidate?.zoom !== undefined && candidate?.zoom !== ''
  const zoom = hasZoom && Number.isFinite(Number(candidate.zoom)) ? Math.max(0, Math.min(22, Number(candidate.zoom))) : null
  const bearing = Number.isFinite(Number(candidate?.orientation?.bearing)) ? Number(candidate.orientation.bearing) : 0
  const pitch = Number.isFinite(Number(candidate?.orientation?.pitch)) ? Math.max(0, Math.min(85, Number(candidate.orientation.pitch))) : 0
  return {
    version: 1,
    region,
    state: stateCode,
    size,
    layers,
    order: normalizeLayerOrder(candidate?.order),
    center,
    zoom,
    orientation: { bearing, pitch },
  }
}

function applyExpandedQueryState(uiState, parameters) {
  const expanded = { ...uiState, orientation: { ...uiState.orientation } }
  if (parameters.has('region')) expanded.region = parameters.get('region')
  if (parameters.has('state')) expanded.state = parameters.get('state')
  if (parameters.has('size')) expanded.size = parameters.get('size')
  if (parameters.has('layers')) expanded.layers = parameters.get('layers').split(',').filter(Boolean)
  if (parameters.has('order')) expanded.order = parameters.get('order').split(',').filter(Boolean)
  if (parameters.has('c')) expanded.center = parameters.get('c').split(',').map(Number)
  if (parameters.has('z')) expanded.zoom = Number(parameters.get('z'))
  if (parameters.has('o')) {
    const [bearing, pitch] = parameters.get('o').split(',').map(Number)
    expanded.orientation = { bearing, pitch }
  }
  return normalizeUiState(expanded)
}

async function readUiStateFromUrl() {
  const parameters = new URLSearchParams(window.location.search)
  queryStateCompressionEnabled = parameters.has(COMPRESSED_STATE_QUERY_PARAM)
    || parameters.get(COMPACT_STATE_QUERY_PARAM) === '1'
  let uiState = defaultUiState()
  if (parameters.has(COMPRESSED_STATE_QUERY_PARAM)) {
    try {
      uiState = normalizeUiState(await decompressUiStateFromQuery(parameters.get(COMPRESSED_STATE_QUERY_PARAM)))
    } catch (error) {
      console.warn('Ignoring invalid compressed map state.', error)
    }
  }
  return applyExpandedQueryState(uiState, parameters)
}

function normalizedMapView() {
  const center = map.getCenter()
  const wrapDegrees = (value) => {
    const wrapped = ((value % 360) + 360) % 360
    return wrapped > 180 ? wrapped - 360 : wrapped
  }
  return {
    center: [Number(center.lng.toFixed(5)), Number(center.lat.toFixed(5))],
    zoom: Number(map.getZoom().toFixed(2)),
    orientation: {
      bearing: Number(wrapDegrees(map.getBearing()).toFixed(1)),
      pitch: Number(map.getPitch().toFixed(1)),
    },
  }
}

function currentUiState() {
  return {
    version: 1,
    region: state.regionKey,
    state: state.stateCode,
    size: state.sizeMode,
    layers: LAYERS.map((layer) => layer.id).filter((id) => state.visible.has(id)),
    order: normalizeLayerOrder(state.layerOrder),
    ...normalizedMapView(),
  }
}

function writeExpandedUiStateToUrl(url, uiState) {
  url.searchParams.set('region', uiState.region)
  url.searchParams.set('state', uiState.state)
  url.searchParams.set('size', uiState.size)
  url.searchParams.set('layers', uiState.layers.join(','))
  url.searchParams.set('order', uiState.order.join(','))
  url.searchParams.set('c', uiState.center.join(','))
  url.searchParams.set('z', String(uiState.zoom))
  url.searchParams.set('o', `${uiState.orientation.bearing},${uiState.orientation.pitch}`)
}

async function buildShareUrl(options = {}) {
  const { preferCompressed = true } = options
  const url = new URL(window.location.href)
  const uiState = currentUiState()
  url.search = ''
  if (preferCompressed && supportsCompressedQueryState()) {
    url.searchParams.set(COMPRESSED_STATE_QUERY_PARAM, await compressUiStateForQuery(uiState))
  } else {
    writeExpandedUiStateToUrl(url, uiState)
  }
  return url.toString()
}

async function writeCompressedUiStateToUrl(uiState, sequence) {
  try {
    const compressed = await compressUiStateForQuery(uiState)
    if (sequence !== compressedPersistSequence) return
    const url = new URL(window.location.href)
    url.search = ''
    url.searchParams.set(COMPRESSED_STATE_QUERY_PARAM, compressed)
    history.replaceState(null, '', `${url.pathname}?${url.searchParams}${url.hash}`)
  } catch {
    writeExpandedUiStateToLocation(uiState)
  }
}

function writeExpandedUiStateToLocation(uiState) {
  const url = new URL(window.location.href)
  url.search = ''
  writeExpandedUiStateToUrl(url, uiState)
  history.replaceState(null, '', `${url.pathname}?${url.searchParams}${url.hash}`)
}

function persistUiState() {
  const uiState = currentUiState()
  if (queryStateCompressionEnabled && supportsCompressedQueryState()) {
    compressedPersistSequence += 1
    writeCompressedUiStateToUrl(uiState, compressedPersistSequence)
  } else {
    writeExpandedUiStateToLocation(uiState)
  }
  syncCompressedQueryToggle()
}

function syncCompressedQueryToggle() {
  if (!compactQueryToggle) return
  const supported = supportsCompressedQueryState()
  compactQueryToggle.checked = queryStateCompressionEnabled && supported
  compactQueryToggle.disabled = !supported
  compactQueryToggle.title = supported
    ? 'Store changes in a compressed s query parameter'
    : 'Compressed URLs are not supported by this browser'
}

function setShareSheetOpen(open) {
  shareTrigger?.setAttribute('aria-expanded', open ? 'true' : 'false')
  if (shareSheet) shareSheet.hidden = !open
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // Continue to the selection fallback when clipboard permission is unavailable.
    }
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  textarea.remove()
}

async function copyShareUrl(preferCompressed) {
  try {
    const url = await buildShareUrl({ preferCompressed })
    await copyTextToClipboard(url)
    shareStatus.textContent = `${preferCompressed ? 'Compact' : 'Readable'} map URL copied.`
    setShareSheetOpen(false)
  } catch {
    shareStatus.textContent = 'Unable to copy the map URL.'
  }
}

const initialUiState = await readUiStateFromUrl()
const state = {
  regionKey: initialUiState.region,
  stateCode: initialUiState.state,
  sizeMode: initialUiState.size,
  layerOrder: initialUiState.order,
  visible: new Set(initialUiState.layers),
  loaded: new Map(),
  loadToken: 0,
}

const mapEl = document.getElementById('medical-map')
const controlsEl = document.getElementById('layer-controls')
const inspectorEl = document.getElementById('map-inspector')
const inspectorContentEl = document.getElementById('map-inspector-content')
const inspectorCloseButton = document.getElementById('close-map-inspector')
const statusEl = document.getElementById('map-status')
const regionSelect = document.getElementById('region-select')
const stateField = document.getElementById('state-field')
const stateSelect = document.getElementById('state-select')
const sizeModeSelect = document.getElementById('size-mode-select')
const compactQueryToggle = document.getElementById('compress-query-state')
const shareTrigger = document.getElementById('open-map-share')
const shareSheet = document.getElementById('map-share-sheet')
const shareStatus = document.getElementById('map-share-status')
const mobileInspectorQuery = window.matchMedia(MOBILE_INSPECTOR_MEDIA)
let inspectorHoverKey = null
let inspectorPinnedKey = null
let inspectorPinnedLayerId = null

for (const [value, label] of US_STATES) {
  const option = document.createElement('option')
  option.value = value
  option.textContent = label
  if (value === state.stateCode) option.selected = true
  stateSelect.appendChild(option)
}

regionSelect.value = state.regionKey
stateSelect.value = state.stateCode
stateField.hidden = state.regionKey !== 'state'
sizeModeSelect.value = state.sizeMode
syncCompressedQueryToggle()
setShareSheetOpen(false)

const selectedStateView = STATE_VIEW[state.stateCode] || STATE_VIEW.MD
const initialRegionCenter = state.regionKey === 'state'
  ? [selectedStateView[0], selectedStateView[1]]
  : REGIONS[state.regionKey].center
const initialRegionZoom = state.regionKey === 'state' ? selectedStateView[2] : REGIONS[state.regionKey].zoom

const map = new maplibregl.Map({
  container: mapEl,
  style: 'https://tiles.openfreemap.org/styles/liberty',
  center: initialUiState.center || initialRegionCenter,
  zoom: initialUiState.zoom ?? initialRegionZoom,
  bearing: initialUiState.orientation.bearing,
  pitch: initialUiState.orientation.pitch,
  attributionControl: true,
})

map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')
map.on('moveend', persistUiState)

map.on('load', () => {
  renderControls()
  loadVisibleLayers()
  map.on('mousemove', (event) => {
    if (mobileInspectorMode()) return
    handleMapHover(event.point)
  })
  map.on('click', (event) => {
    pinHoverTarget(topMapHoverTarget(event.point))
  })
  map.getCanvas().addEventListener('mouseleave', () => {
    if (mobileInspectorMode()) return
    clearInspectorHover()
  })
})

window.__bmoreMedTechMap = map
window.__bmoreMedTechQueryState = {
  supportsCompression: supportsCompressedQueryState(),
  current: () => currentUiState(),
  buildShareUrl,
  decodeCompressed: decompressUiStateFromQuery,
}
window.__bmoreMedTechFirstFeaturePoint = (layerId) => firstFeaturePoint(layerId)
window.__showBmoreMedTechHoverTarget = (point) => {
  if (!point) return { arbitration: null, inspector: inspectorState() }
  const target = topMapHoverTarget(new maplibregl.Point(point.x, point.y))
  showHoverTarget(target)
  return { arbitration: window.__bmoreMedTechHoverArbitration, inspector: inspectorState() }
}
window.__pinBmoreMedTechHoverTarget = (point) => {
  if (!point) return { arbitration: null, inspector: inspectorState() }
  const target = topMapHoverTarget(new maplibregl.Point(point.x, point.y))
  pinHoverTarget(target)
  return { arbitration: window.__bmoreMedTechHoverArbitration, inspector: inspectorState() }
}

map.on('error', (event) => {
  console.error(event.error || event)
  setStatus('Map style or layer loading reported an error. Try reloading the page.')
})

regionSelect.addEventListener('change', () => {
  state.regionKey = regionSelect.value
  stateField.hidden = state.regionKey !== 'state'
  closePinnedInspector()
  moveToCurrentRegion()
  loadVisibleLayers()
})

stateSelect.addEventListener('change', () => {
  state.stateCode = stateSelect.value
  closePinnedInspector()
  if (state.regionKey === 'state') moveToCurrentRegion()
  else persistUiState()
  loadVisibleLayers()
})

sizeModeSelect.addEventListener('change', () => {
  state.sizeMode = SIZE_MODES.has(sizeModeSelect.value) ? sizeModeSelect.value : 'volume'
  refreshLoadedLayerSizing()
  persistUiState()
})

inspectorCloseButton.addEventListener('click', closePinnedInspector)
compactQueryToggle.addEventListener('change', () => {
  queryStateCompressionEnabled = compactQueryToggle.checked
  persistUiState()
})
shareTrigger.addEventListener('click', () => {
  setShareSheetOpen(shareTrigger.getAttribute('aria-expanded') !== 'true')
})
document.getElementById('close-map-share').addEventListener('click', () => setShareSheetOpen(false))
document.getElementById('copy-compressed-url').addEventListener('click', () => copyShareUrl(true))
document.getElementById('copy-readable-url').addEventListener('click', () => copyShareUrl(false))
document.addEventListener('click', (event) => {
  if (shareSheet.hidden || shareTrigger.contains(event.target) || shareSheet.contains(event.target)) return
  setShareSheetOpen(false)
})
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') setShareSheetOpen(false)
})

function renderControls() {
  const currentStatuses = new Map(
    [...controlsEl.querySelectorAll('[id^="status-"]')]
      .map((el) => [el.id.replace(/^status-/, ''), el.textContent || 'Waiting']),
  )
  const orderedLayers = [...state.layerOrder]
    .reverse()
    .map((id) => LAYERS.find((layer) => layer.id === id))
    .filter(Boolean)
  controlsEl.innerHTML = orderedLayers.map((layer, index) => `
    <div class="map-layer-row" data-layer-row="${escapeHtml(layer.id)}">
      <div class="map-layer-main">
        <label>
          <input id="show-${escapeHtml(layer.id)}" type="checkbox" ${state.visible.has(layer.id) ? 'checked' : ''}>
          <span class="map-layer-swatch" style="--layer-color: ${escapeHtml(layer.color)}"></span>
          <span><strong>${escapeHtml(layer.label)}</strong><small>${escapeHtml(layer.summary)}</small></span>
        </label>
        <div class="map-layer-actions" aria-label="${escapeHtml(layer.label)} layer stack controls">
          <button type="button" data-layer-action="up" data-layer-id="${escapeHtml(layer.id)}" aria-label="Move ${escapeHtml(layer.label)} up" ${index === 0 ? 'disabled' : ''}>^</button>
          <button type="button" data-layer-action="down" data-layer-id="${escapeHtml(layer.id)}" aria-label="Move ${escapeHtml(layer.label)} down" ${index === orderedLayers.length - 1 ? 'disabled' : ''}>v</button>
        </div>
      </div>
      <p id="status-${escapeHtml(layer.id)}">${escapeHtml(currentStatuses.get(layer.id) || 'Waiting')}</p>
    </div>
  `).join('')

  for (const layer of LAYERS) {
    document.getElementById(`show-${layer.id}`).addEventListener('change', (event) => {
      if (event.target.checked) state.visible.add(layer.id)
      else {
        state.visible.delete(layer.id)
        if (inspectorPinnedLayerId === layer.id) closePinnedInspector()
      }
      setLayerVisibility(layer)
      loadVisibleLayers()
      persistUiState()
    })
  }

  controlsEl.querySelectorAll('[data-layer-action]').forEach((button) => {
    button.addEventListener('click', () => {
      moveLayerInStack(button.dataset.layerId, button.dataset.layerAction)
    })
  })
  controlsEl.querySelectorAll('.map-layer-row').forEach((row) => {
    const layer = LAYERS.find((candidate) => candidate.id === row.dataset.layerRow)
    if (!layer) return
    row.addEventListener('pointerenter', () => renderLayerPreview(layer))
    row.addEventListener('focusin', () => renderLayerPreview(layer))
  })
  applyMapLayerOrder()
}

async function loadVisibleLayers() {
  if (!map.getStyle?.()?.layers?.length) return
  state.loadToken += 1
  const loadToken = state.loadToken
  const tasks = []
  for (const layer of LAYERS) {
    if (!state.visible.has(layer.id)) {
      setLayerVisibility(layer)
      layerStatus(layer, 'Off')
      continue
    }
    if (!layerAppliesToRegion(layer)) {
      clearLayer(layer)
      layerStatus(layer, `Not available for ${currentRegionLabel()}`)
      continue
    }
    tasks.push(loadLayer(layer, loadToken))
  }

  setStatus(`Loading ${tasks.length} visible layer${tasks.length === 1 ? '' : 's'} for ${currentRegionLabel()}...`)
  await Promise.allSettled(tasks)
  if (loadToken !== state.loadToken) return
  setStatus(`Showing ${state.visible.size} selected layer${state.visible.size === 1 ? '' : 's'} in ${currentRegionLabel()}.`)
  window.__bmoreMedTechLayerState = layerDiagnostics()
  window.__bmoreMedTechLayerStack = [...state.layerOrder]
  window.__bmoreMedTechMapReady = true
}

async function loadLayer(layer, loadToken) {
  try {
    const geojson = await fetchLayerGeojson(layer)
    if (loadToken !== state.loadToken) return
    addOrUpdateLayer(layer, geojson)
    layerStatus(layer, `${geojson.features.length.toLocaleString()} feature${geojson.features.length === 1 ? '' : 's'}`)
  } catch (error) {
    if (loadToken !== state.loadToken) return
    console.error(error)
    layerStatus(layer, 'Unable to load')
  }
}

async function fetchLayerGeojson(layer) {
  if (layer.loadGeojson) return layer.loadGeojson()
  const services = layer.services || [{ url: layer.service, label: layer.label }]
  const collections = await Promise.all(services.map(async (service) => {
    const url = arcgisQueryUrl(service.url, layer, service.label)
    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) throw new Error(`${layer.label} returned ${response.status}`)
    const geojson = await response.json()
    if (!geojson || !Array.isArray(geojson.features)) {
      throw new Error(`${layer.label} did not return a GeoJSON feature collection`)
    }
    geojson.features.forEach((feature) => {
      feature.properties = { ...(feature.properties || {}), __layerId: layer.id, __subLayer: service.label }
    })
    return geojson
  }))

  return {
    type: 'FeatureCollection',
    features: collections.flatMap((collection) => collection.features).filter((feature) => feature.geometry),
  }
}

async function fetchMedicalEventsGeojson() {
  const response = await fetch(MEDICAL_EVENTS_SOURCE_URL, { cache: 'no-store' })
  if (!response.ok) throw new Error(`Medical events calendar returned ${response.status}`)
  const sourceEvents = await response.json()
  const now = new Date()
  const bbox = currentRegion().bbox
  const features = sourceEvents
    .filter(isMedicalEvent)
    .map((event) => ({ event, date: parseEventDate(event), coordinates: eventCoordinates(event) }))
    .filter(({ date, coordinates }) => date && date >= now && coordinates)
    .filter(({ coordinates }) => !bbox || coordinateInBbox(coordinates, bbox))
    .map(({ event, date, coordinates }, index) => ({
      type: 'Feature',
      id: event.id || `medical-event-${index}`,
      geometry: { type: 'Point', coordinates },
      properties: {
        __layerId: 'medical-events',
        eventId: String(event.id || `medical-event-${index}`),
        name: plainText(event.name),
        startDate: date.toISOString(),
        locationName: plainText(event.location?.name),
        locationAddress: plainText([
          event.location?.address,
          event.location?.city,
          event.location?.state,
        ].filter(Boolean).join(', ')),
        organizer: plainText(event.source_group || event.org_name || event.orgName),
        tags: Array.isArray(event.tags) ? event.tags.join(', ') : '',
        description: plainText(event.description).replace(/\s+/g, ' ').trim().slice(0, 280),
        eventUrl: safeHttpUrl(event.url),
      },
    }))

  return { type: 'FeatureCollection', features }
}

function coordinateInBbox([longitude, latitude], [west, south, east, north]) {
  return longitude >= west && longitude <= east && latitude >= south && latitude <= north
}

function plainText(value) {
  const template = document.createElement('template')
  template.innerHTML = String(value || '')
  return template.content.textContent || ''
}

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value || ''))
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : ''
  } catch {
    return ''
  }
}

function arcgisQueryUrl(serviceUrl, layer, subLayerLabel) {
  const url = new URL(`${serviceUrl.replace(/\/+$/, '')}/query`)
  const params = { ...ARCGIS_QUERY_DEFAULTS }
  params.outFields = layer.fields ? layer.fields.join(',') : '*'
  params.resultRecordCount = String(layer.limit || (layer.kind === 'polygon' ? 1800 : 2000))
  params.where = whereFor(layer, subLayerLabel)

  const region = currentRegion()
  if (region.bbox && !['us', 'worldwide'].includes(state.regionKey)) {
    params.geometry = JSON.stringify({
      xmin: region.bbox[0],
      ymin: region.bbox[1],
      xmax: region.bbox[2],
      ymax: region.bbox[3],
      spatialReference: { wkid: 4326 },
    })
    params.geometryType = 'esriGeometryEnvelope'
    params.inSR = '4326'
    params.spatialRel = 'esriSpatialRelIntersects'
  }

  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return url.toString()
}

function whereFor(layer) {
  const region = currentRegion()
  if (layer.id === 'us-hospitals') {
    if (state.regionKey === 'state') return `STATE = '${state.stateCode.replaceAll("'", "''")}'`
    return region.hifldWhere || '1=1'
  }
  if (layer.coverage === 'maryland' && region.enviroscreenWhere && ['enviro-asthma', 'climate-vulnerability'].includes(layer.id)) {
    return region.enviroscreenWhere
  }
  if (layer.coverage === 'maryland' && region.marylandCountyWhere && ['md-hospitals', 'long-term-care'].includes(layer.id)) {
    return region.marylandCountyWhere
  }
  return '1=1'
}

function layerAppliesToRegion(layer) {
  if (layer.coverage === 'national') return true
  if (layer.coverage === 'baltimore') return state.regionKey === 'baltimore-city'
  if (layer.coverage === 'maryland') return state.regionKey === 'baltimore-city' || state.regionKey === 'maryland'
  return true
}

function addOrUpdateLayer(layer, geojson) {
  const displayGeojson = decorateLayerGeojson(layer, geojson)
  const sourceId = `source-${layer.id}`
  if (map.getSource(sourceId)) map.getSource(sourceId).setData(displayGeojson)
  else map.addSource(sourceId, { type: 'geojson', data: displayGeojson })

  if (layer.kind === 'polygon') addPolygonLayer(layer, sourceId)
  else addPointLayer(layer, sourceId)
  setLayerVisibility(layer)
  state.loaded.set(layer.id, displayGeojson)
  applyMapLayerOrder()
}

function addPolygonLayer(layer, sourceId) {
  const fillId = `${layer.id}-fill`
  const lineId = `${layer.id}-line`
  if (!map.getLayer(fillId)) {
    map.addLayer({
      id: fillId,
      type: 'fill',
      source: sourceId,
      paint: {
        'fill-color': layer.valueField ? colorExpression(layer.valueField, layer.color) : layer.color,
        'fill-opacity': 0.42,
      },
    })
  }
  if (!map.getLayer(lineId)) {
    map.addLayer({
      id: lineId,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': layer.color,
        'line-width': 1,
        'line-opacity': 0.85,
      },
    })
    installClickHandler(lineId, layer)
  }
}

function addPointLayer(layer, sourceId) {
  const circleId = `${layer.id}-circle`
  if (!map.getLayer(circleId)) {
    map.addLayer({
      id: circleId,
      type: 'circle',
      source: sourceId,
      layout: {
        'circle-sort-key': ['coalesce', ['get', '_medicalSort'], 0],
      },
      paint: {
        'circle-radius': pointRadiusExpression(),
        'circle-color': layer.color,
        'circle-opacity': 0.82,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1.2,
      },
    })
    installClickHandler(circleId, layer)
  }
  map.setPaintProperty(circleId, 'circle-radius', pointRadiusExpression())
  map.setLayoutProperty(circleId, 'circle-sort-key', ['coalesce', ['get', '_medicalSort'], 0])
}

function installClickHandler(layerId, layer) {
  map.on('mouseenter', layerId, () => {
    map.getCanvas().style.cursor = 'pointer'
  })
  map.on('mouseleave', layerId, () => {
    if (!inspectorPinnedKey) map.getCanvas().style.cursor = ''
  })
}

function setLayerVisibility(layer) {
  const visibility = state.visible.has(layer.id) && layerAppliesToRegion(layer) ? 'visible' : 'none'
  for (const suffix of ['fill', 'line', 'circle']) {
    const id = `${layer.id}-${suffix}`
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visibility)
  }
}

function defaultLayerOrder() {
  const polygons = LAYERS.filter((layer) => layer.kind === 'polygon').map((layer) => layer.id)
  const points = LAYERS.filter((layer) => layer.kind === 'point').map((layer) => layer.id)
  return [...polygons, ...points.reverse()]
}

function moveLayerInStack(layerId, action) {
  const index = state.layerOrder.indexOf(layerId)
  if (index < 0) return
  const delta = action === 'up' ? 1 : action === 'down' ? -1 : 0
  const nextIndex = Math.max(0, Math.min(state.layerOrder.length - 1, index + delta))
  if (nextIndex === index) return
  const nextOrder = [...state.layerOrder]
  nextOrder.splice(index, 1)
  nextOrder.splice(nextIndex, 0, layerId)
  state.layerOrder = nextOrder
  renderControls()
  setStatus(`Moved ${LAYERS.find((layer) => layer.id === layerId)?.label || 'layer'} ${action}.`)
  window.__bmoreMedTechLayerState = layerDiagnostics()
  window.__bmoreMedTechLayerStack = [...state.layerOrder]
  persistUiState()
}

function renderedLayerIds(layer) {
  return layer.kind === 'polygon'
    ? [`${layer.id}-fill`, `${layer.id}-line`]
    : [`${layer.id}-circle`]
}

function firstBaseSymbolLayerId() {
  return map.getStyle?.()?.layers?.find((layer) => layer.type === 'symbol' && !layer.id.startsWith('medical-'))?.id
}

function applyMapLayerOrder() {
  if (!map.getStyle?.()?.layers?.length) return
  const beforeId = firstBaseSymbolLayerId()
  for (const layerId of state.layerOrder) {
    const layer = LAYERS.find((candidate) => candidate.id === layerId)
    if (!layer) continue
    for (const renderedId of renderedLayerIds(layer)) {
      if (!map.getLayer(renderedId)) continue
      try {
        map.moveLayer(renderedId, beforeId)
      } catch {
        map.moveLayer(renderedId)
      }
    }
  }
}

function refreshLoadedLayerSizing() {
  for (const layer of LAYERS) {
    const geojson = state.loaded.get(layer.id)
    if (!geojson || !map.getSource(`source-${layer.id}`)) continue
    addOrUpdateLayer(layer, geojson)
  }
  setStatus(`Marker size set to ${state.sizeMode === 'volume' ? 'capacity / activity volume' : 'uniform'}.`)
  window.__bmoreMedTechLayerState = layerDiagnostics()
  window.__bmoreMedTechLayerStack = [...state.layerOrder]
}

function pointRadiusExpression() {
  return [
    '*',
    ['interpolate', ['linear'], ['zoom'], 3, 4, 9, 6.5, 13, 9.5],
    ['coalesce', ['get', '_medicalPointScale'], 1],
  ]
}

function decorateLayerGeojson(layer, geojson) {
  const features = Array.isArray(geojson.features) ? geojson.features : []
  if (layer.kind !== 'point') {
    return { ...geojson, features }
  }

  const values = features
    .map((feature) => volumeValue(layer, feature.properties || {}))
    .filter((value) => value !== null)
  const scaled = scaleValues(values)
  let valueIndex = 0
  const hasValues = values.length > 0

  return {
    ...geojson,
    features: features.map((feature) => {
      const props = feature.properties || {}
      const volume = volumeValue(layer, props)
      const scale = state.sizeMode === 'volume'
        ? volume === null
          ? hasValues ? 0.62 : 1
          : scaled[valueIndex++] || 1
        : 1
      return {
        ...feature,
        properties: {
          ...props,
          _medicalVolume: volume,
          _medicalPointScale: scale,
          _medicalSort: scale,
          _medicalVolumeLabel: volume === null ? null : volumeLabel(layer, volume),
        },
      }
    }),
  }
}

function scaleValues(values) {
  if (!values.length) return []
  const transformed = values.map((value) => Math.log1p(Math.max(0, value)))
  const minimum = Math.min(...transformed)
  const maximum = Math.max(...transformed)
  if (minimum === maximum) return values.map(() => 1.35)
  return transformed.map((value) => {
    const t = (value - minimum) / (maximum - minimum)
    return 0.72 + t * 1.63
  })
}

function volumeValue(layer, props) {
  for (const field of layer.volumeFields || []) {
    const value = numberValue(props[field])
    if (value !== null && value > 0) return value
  }
  return null
}

function volumeLabel(layer, value) {
  if (layer.volumeLabel === 'Grant award') return money(value)
  return `${Number(value).toLocaleString()} ${String(layer.volumeLabel || 'volume').toLowerCase()}`
}

function numberValue(value) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const cleaned = String(value).replace(/[$,]/g, '').trim()
  if (!cleaned) return null
  const number = Number(cleaned)
  return Number.isFinite(number) ? number : null
}

function clearLayer(layer) {
  const source = map.getSource(`source-${layer.id}`)
  if (source) source.setData({ type: 'FeatureCollection', features: [] })
  state.loaded.delete(layer.id)
}

function moveToCurrentRegion() {
  const region = currentRegion()
  if (state.regionKey === 'state') {
    const stateView = STATE_VIEW[state.stateCode] || STATE_VIEW.MD
    map.flyTo({ center: [stateView[0], stateView[1]], zoom: stateView[2], essential: true })
    return
  }
  map.flyTo({ center: region.center, zoom: region.zoom, essential: true })
}

function currentRegion() {
  return REGIONS[state.regionKey] || REGIONS['baltimore-city']
}

function currentRegionLabel() {
  if (state.regionKey === 'state') {
    return US_STATES.find(([code]) => code === state.stateCode)?.[1] || state.stateCode
  }
  return currentRegion().label
}

function layerStatus(layer, text) {
  const el = document.getElementById(`status-${layer.id}`)
  if (el) el.textContent = text
}

function setStatus(text) {
  statusEl.textContent = text
}

function mobileInspectorMode() {
  return mobileInspectorQuery.matches
}

function handleMapHover(point) {
  const target = topMapHoverTarget(point)
  showHoverTarget(target)
  if (!target) {
    map.getCanvas().style.cursor = ''
    clearInspectorHover()
  }
}

function showHoverTarget(target) {
  if (!target) return
  map.getCanvas().style.cursor = 'pointer'
  renderHoveredInspector(target.key, target.layerId, target.render)
}

function renderHoveredInspector(key, layerId, render) {
  if (inspectorPinnedKey) return
  if (inspectorHoverKey === key) return
  inspectorHoverKey = key
  render({ pinned: false })
  inspectorEl.dataset.inspectorState = 'hover'
  inspectorEl.classList.remove('is-pinned')
  inspectorCloseButton.hidden = true
  inspectorPinnedLayerId = null
  window.__bmoreMedTechInspectorState = inspectorState()
}

function pinHoverTarget(target) {
  if (!target) return
  inspectorPinnedKey = target.key
  inspectorPinnedLayerId = target.layerId
  inspectorHoverKey = target.key
  target.render({ pinned: true })
  inspectorEl.dataset.inspectorState = 'pinned'
  inspectorEl.classList.add('is-pinned')
  inspectorCloseButton.hidden = false
  window.__bmoreMedTechInspectorState = inspectorState()
}

function clearInspectorHover() {
  if (inspectorPinnedKey) return
  inspectorHoverKey = null
  renderIdleInspector()
}

function closePinnedInspector() {
  inspectorPinnedKey = null
  inspectorPinnedLayerId = null
  inspectorHoverKey = null
  renderIdleInspector()
}

function renderIdleInspector() {
  inspectorEl.dataset.inspectorState = 'idle'
  inspectorEl.classList.remove('is-pinned')
  inspectorCloseButton.hidden = true
  inspectorContentEl.innerHTML = `
    <strong>Selected feature</strong>
    <p>Click an upcoming medical event, hospital, health program, healthy-housing site, or risk tract.</p>
  `
  window.__bmoreMedTechInspectorState = inspectorState()
}

function renderLayerPreview(layer) {
  if (inspectorPinnedKey) return
  inspectorHoverKey = `layer:${layer.id}`
  inspectorEl.dataset.inspectorState = 'hover'
  inspectorEl.classList.remove('is-pinned')
  inspectorCloseButton.hidden = true
  const status = document.getElementById(`status-${layer.id}`)?.textContent || 'Waiting'
  const sourceRows = [
    ['Visibility', state.visible.has(layer.id) ? 'On' : 'Off'],
    ['Coverage', layer.coverage === 'national' ? 'U.S. and selected states' : currentRegionLabel()],
    ['Status', status],
    ['Sizing', layer.volumeLabel ? `${layer.volumeLabel} when marker sizing is volume` : 'Uniform'],
  ]
  inspectorContentEl.innerHTML = `
    <strong>${escapeHtml(layer.label)}</strong>
    <span>Layer preview</span>
    <p>${escapeHtml(layer.summary)}</p>
    ${renderFactList(sourceRows)}
    <a href="${escapeHtml(layer.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(layer.sourceName)}</a>
  `
  window.__bmoreMedTechInspectorState = inspectorState()
}

function topMapHoverTarget(point) {
  if (!map.getStyle?.()?.layers?.length) return null
  const renderLayerToLayer = new Map()
  for (const layerId of [...state.layerOrder].reverse()) {
    const layer = LAYERS.find((candidate) => candidate.id === layerId)
    if (!layer || !state.visible.has(layer.id) || !layerAppliesToRegion(layer)) continue
    for (const renderedId of renderedLayerIds(layer)) {
      if (map.getLayer(renderedId)) renderLayerToLayer.set(renderedId, layer)
    }
  }
  const layerIds = [...renderLayerToLayer.keys()]
  const candidates = []
  for (const layerId of [...state.layerOrder].reverse()) {
    const layer = LAYERS.find((candidate) => candidate.id === layerId)
    if (!layer || !state.visible.has(layer.id) || !layerAppliesToRegion(layer)) continue
    const feature = topPointHoverFeature(point, layer)
    if (!feature) continue
    candidates.push({
      key: featureKey(layer, feature),
      layerId: layer.id,
      layer,
      feature,
      z: state.layerOrder.indexOf(layer.id) + 0.5,
      render: () => renderInspector(layer, feature.properties || {}),
    })
  }
  if (!layerIds.length && !candidates.length) return null

  map.queryRenderedFeatures(point, { layers: layerIds }).forEach((feature) => {
    const layer = renderLayerToLayer.get(feature.layer.id)
    const layerZ = state.layerOrder.indexOf(layer.id)
    candidates.push({
      key: featureKey(layer, feature),
      layerId: layer.id,
      layer,
      feature,
      z: layerZ,
      render: () => renderInspector(layer, feature.properties || {}),
    })
  })
  candidates.sort((left, right) => right.z - left.z)
  window.__bmoreMedTechHoverArbitration = {
    candidates: candidates.map(({ key, layerId, z }) => ({ key, layerId, z })),
    chosen: candidates.length ? { key: candidates[0].key, layerId: candidates[0].layerId, z: candidates[0].z } : null,
  }
  return candidates[0] || null
}

function topPointHoverFeature(point, layer) {
  if (layer.kind !== 'point') return null
  let best = null
  for (const feature of state.loaded.get(layer.id)?.features || []) {
    if (feature.geometry?.type !== 'Point') continue
    const coordinate = feature.geometry.coordinates
    const projected = map.project(coordinate)
    const distance = Math.hypot(projected.x - point.x, projected.y - point.y)
    const scale = Number(feature.properties?._medicalPointScale) || 1
    const radius = Math.max(12, 8 * scale)
    if (distance > radius) continue
    if (!best || scale > best.scale || (scale === best.scale && distance < best.distance)) {
      best = { feature, scale, distance, layerId: `${layer.id}-circle` }
    }
  }
  return best?.feature || null
}

function featureKey(layer, feature) {
  const props = feature.properties || {}
  const identity = feature.id
    ?? props.OBJECTID
    ?? props.ObjectID
    ?? props.FID
    ?? props.GEOID20
    ?? props.NAME
    ?? props.Facility_Name
    ?? props.Grantee_Name
    ?? props.address
    ?? layer.title(props)
    ?? 'feature'
  return `${layer.id}:${identity}`
}

function firstFeaturePoint(layerId) {
  const feature = state.loaded.get(layerId)?.features?.find((candidate) => candidate.geometry)
  const coordinate = representativeCoordinate(feature?.geometry)
  if (!coordinate) return null
  const projected = map.project(coordinate)
  return {
    x: projected.x,
    y: projected.y,
    lng: coordinate[0],
    lat: coordinate[1],
  }
}

function representativeCoordinate(geometry) {
  if (!geometry) return null
  if (geometry.type === 'Point') return geometry.coordinates
  const points = flattenCoordinates(geometry.coordinates)
    .filter((coordinate) => Array.isArray(coordinate) && coordinate.length >= 2)
  if (!points.length) return null
  const bounds = points.reduce((box, coordinate) => ({
    west: Math.min(box.west, coordinate[0]),
    south: Math.min(box.south, coordinate[1]),
    east: Math.max(box.east, coordinate[0]),
    north: Math.max(box.north, coordinate[1]),
  }), { west: 180, south: 90, east: -180, north: -90 })
  return [(bounds.west + bounds.east) / 2, (bounds.south + bounds.north) / 2]
}

function flattenCoordinates(value) {
  if (!Array.isArray(value)) return []
  if (typeof value[0] === 'number') return [value]
  return value.flatMap(flattenCoordinates)
}

function inspectorState() {
  return {
    mode: inspectorEl.dataset.inspectorState || 'idle',
    hoverKey: inspectorHoverKey,
    pinnedKey: inspectorPinnedKey,
    pinnedLayerId: inspectorPinnedLayerId,
    text: inspectorContentEl.textContent.replace(/\s+/g, ' ').trim(),
  }
}

function renderInspector(layer, props) {
  const volume = layer.kind === 'point' ? volumeValue(layer, props) : null
  const detailRows = volume === null ? layer.details(props) : [['Sizing volume', volumeLabel(layer, volume)], ...layer.details(props)]
  const rows = detailRows
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '' && String(value).trim() !== '-999')
    .slice(0, 10)

  inspectorContentEl.innerHTML = `
    <strong>${escapeHtml(layer.title(props) || layer.label)}</strong>
    <span>${escapeHtml(layer.label)}</span>
    ${renderFactList(rows)}
    <a href="${escapeHtml(layer.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(layer.sourceName)}</a>
  `
}

function renderFactList(rows) {
  return `<dl>${rows.map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${linkify(value)}</dd>`).join('')}</dl>`
}

function colorExpression(field, baseColor) {
  return [
    'case',
    ['>=', ['to-number', ['get', field]], 85], '#7f1d1d',
    ['>=', ['to-number', ['get', field]], 70], '#cf4f3f',
    ['>=', ['to-number', ['get', field]], 50], '#d99a2b',
    baseColor,
  ]
}

function layerDiagnostics() {
  return Object.fromEntries(LAYERS.map((layer) => {
    const geojson = state.loaded.get(layer.id)
    const features = geojson?.features || []
    const scales = features
      .map((feature) => Number(feature.properties?._medicalPointScale))
      .filter((value) => Number.isFinite(value))
    const volumes = features
      .map((feature) => Number(feature.properties?._medicalVolume))
      .filter((value) => Number.isFinite(value))
    return [layer.id, {
      visible: state.visible.has(layer.id),
      applies: layerAppliesToRegion(layer),
      count: geojson?.features?.length || 0,
      status: document.getElementById(`status-${layer.id}`)?.textContent || '',
      kind: layer.kind,
      sizeMode: state.sizeMode,
      volumeLabel: layer.volumeLabel || null,
      volumeCount: volumes.length,
      minScale: scales.length ? Math.min(...scales) : null,
      maxScale: scales.length ? Math.max(...scales) : null,
      stackRank: state.layerOrder.indexOf(layer.id),
    }]
  }))
}

function pct(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? `${Math.round(number * 10) / 10}` : value
}

function money(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) : value
}

function formatDate(value) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return null
  return new Date(number).toLocaleDateString()
}

function formatEventDateTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString(undefined, {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function linkify(value) {
  const text = String(value || '')
  if (/^https?:\/\//i.test(text)) {
    return `<a href="${escapeHtml(text)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a>`
  }
  return escapeHtml(text)
}
