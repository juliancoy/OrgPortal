import test from 'node:test'
import assert from 'node:assert/strict'
import brand from '../../shared/lifetechBrand.json'
import { contrastRatio } from '../../shared/brandContrast'
import { parseBrandPalette, resolveBrandPalette } from '../../shared/brandPalette'

test('WCAG contrast handles sRGB luminance and exact thresholds', () => {
 assert.equal(contrastRatio('#000000','#FFFFFF'),21)
 assert.equal(contrastRatio('#FFFFFF','#FFFFFF'),1)
 assert.equal(contrastRatio('#155E59','#F4F5F0'),contrastRatio('#F4F5F0','#155E59'))
 assert.throws(()=>contrastRatio('teal','#FFFFFF'))
})
test('every approved LifeTech text and control pairing meets its WCAG AA threshold', () => {
 const colors=Object.fromEntries(brand.colors.map(color=>[color.id,color.value]))
 for(const pair of brand.pairings)assert.ok(contrastRatio(colors[pair.foreground],colors[pair.background])>=pair.minimum,pair.label)
 // Gold is an accent, not normal text on the light canvas.
 assert.ok(contrastRatio(colors.gold,colors.offWhite)<4.5)
 assert.ok(contrastRatio(colors.goldInk,colors.offWhite)>=4.5)
})
test('LifeTech guide exposes twelve valid colors while preserving explicitly stored palettes', () => {
 const palette=resolveBrandPalette({slug:'lifetech'})
 assert.equal(palette.length,12)
 assert.ok(parseBrandPalette(palette))
 assert.deepEqual(palette.slice(0,3).map(color=>color.label),['HealthTech Teal','MedTech OffWhite','BioTech Gold'])
 const stored=[{label:'Custom accent',value:'#123456'}]
 assert.deepEqual(resolveBrandPalette({slug:'lifetech',feature_config:{brandPalette:stored}}),stored)
})
