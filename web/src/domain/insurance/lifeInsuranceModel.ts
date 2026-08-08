export const LIFE_INSURANCE_SOURCE = {
  name: 'UN World Population Prospects 2024',
  year: 2026,
  url: 'https://population.un.org/wpp/',
} as const

export const MIN_MEMBER_AGE = 18
export const MAX_MEMBER_AGE = 100
export const MINIMUM_BENEFIT_FACTOR = 0.5

// World, both sexes, medium projection for 2026. Each value is that single
// age's percentage of the global population. Age 100 includes everyone 100+.
const GLOBAL_POPULATION_PERCENT_BY_AGE = [
  1.561, 1.55, 1.543, 1.539, 1.544, 1.554, 1.581, 1.611, 1.636, 1.66,
  1.661, 1.659, 1.662, 1.666, 1.657, 1.635, 1.624, 1.612, 1.59, 1.567,
  1.546, 1.529, 1.514, 1.5, 1.49, 1.487, 1.472, 1.452, 1.444, 1.44,
  1.438, 1.435, 1.431, 1.431, 1.439, 1.47, 1.484, 1.459, 1.445, 1.428,
  1.393, 1.358, 1.324, 1.31, 1.288, 1.25, 1.217, 1.177, 1.145, 1.13,
  1.121, 1.118, 1.119, 1.113, 1.104, 1.097, 1.078, 1.053, 1.011, 0.974,
  0.965, 0.952, 0.945, 0.905, 0.805, 0.741, 0.721, 0.71, 0.709, 0.684,
  0.651, 0.625, 0.586, 0.554, 0.517, 0.478, 0.442, 0.4, 0.364, 0.329,
  0.283, 0.247, 0.224, 0.203, 0.184, 0.165, 0.145, 0.125, 0.108, 0.091,
  0.075, 0.061, 0.048, 0.037, 0.029, 0.021, 0.016, 0.011, 0.007, 0.005,
  0.008,
] as const

export type LifeInsuranceEstimate = {
  age: number
  standardBenefit: number
  disbursement: number
  benefitFactor: number
  adultPopulationAtOrAboveAge: number
}

export type PopulationAgeBand = {
  startAge: number
  endAge: number
  label: string
  populationPercent: number
}

function assertMemberAge(age: number) {
  if (!Number.isInteger(age) || age < MIN_MEMBER_AGE || age > MAX_MEMBER_AGE) {
    throw new Error(`Member age must be a whole number from ${MIN_MEMBER_AGE} to ${MAX_MEMBER_AGE}.`)
  }
}

function sumPopulation(startAge: number, endAge = MAX_MEMBER_AGE) {
  return GLOBAL_POPULATION_PERCENT_BY_AGE
    .slice(startAge, endAge + 1)
    .reduce((total, percent) => total + percent, 0)
}

export function adultPopulationAtOrAboveAge(age: number) {
  assertMemberAge(age)
  return sumPopulation(age) / sumPopulation(MIN_MEMBER_AGE)
}

export function benefitFactorForAge(age: number) {
  const adultPopulationShare = adultPopulationAtOrAboveAge(age)
  return MINIMUM_BENEFIT_FACTOR + (1 - MINIMUM_BENEFIT_FACTOR) * Math.sqrt(adultPopulationShare)
}

export function estimateLifeInsuranceDisbursement(age: number, standardBenefit: number): LifeInsuranceEstimate {
  assertMemberAge(age)
  if (!Number.isFinite(standardBenefit) || standardBenefit <= 0) {
    throw new Error('Standard benefit must be greater than zero.')
  }

  const adultShare = adultPopulationAtOrAboveAge(age)
  const benefitFactor = benefitFactorForAge(age)
  return {
    age,
    standardBenefit,
    disbursement: standardBenefit * benefitFactor,
    benefitFactor,
    adultPopulationAtOrAboveAge: adultShare,
  }
}

export function globalPopulationAgeBands(): PopulationAgeBand[] {
  const bands: PopulationAgeBand[] = []
  for (let startAge = 0; startAge < 100; startAge += 5) {
    const endAge = startAge + 4
    bands.push({
      startAge,
      endAge,
      label: `${startAge}\u2013${endAge}`,
      populationPercent: sumPopulation(startAge, endAge),
    })
  }
  bands.push({
    startAge: 100,
    endAge: 100,
    label: '100+',
    populationPercent: GLOBAL_POPULATION_PERCENT_BY_AGE[100],
  })
  return bands
}
